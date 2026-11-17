import type { Booking, Club, ClubMembership, Court, MatchRequest, ProposedMatch, ProposedSlot } from '../../src/types/padel';
import {
  addDaysISO,
  busyUidsAt,
  calculateSlotPrice,
  formatDateFriendly,
  formatMinutes,
  getTodayISO,
  type MatchCandidateResult,
} from '../../src/lib/padelUtils';
import { bestMatch, historyFromBookings, type PlannedMatch } from '../../src/lib/planificador';
import { db, makeId, now } from './admin';
import { notify } from './notify';
import { replaceInPendingMatch } from './fill';

/** Otro proceso tomó a esos jugadores o esa cancha mientras armábamos: se reintenta con datos frescos. */
export class Conflict extends Error {}

export interface ClubContext {
  club: Club;
  courts: Court[];
  bookings: Booking[];
  requests: MatchRequest[];
  memberships: ClubMembership[];
  /** Partidos propuestos pendientes desde hoy (sus jugadores están ocupados a esa hora). */
  pendingMatches: ProposedMatch[];
}

/** Lee solo lo que el armado necesita: reservas desde hoy, pedidos en espera y las fichas de esos jugadores. */
export async function loadClubContext(clubId: string): Promise<ClubContext | null> {
  const clubRef = db.doc(`clubs/${clubId}`);
  const today = getTodayISO();
  const [clubSnap, courtsSnap, bookingsSnap, reqSnap, pendingSnap] = await Promise.all([
    clubRef.get(),
    clubRef.collection('courts').get(),
    // Desde 4 semanas atrás: lo ya jugado es la historia del planificador (quién lleva más sin jugar, con quién ya jugó).
    clubRef.collection('bookings').where('date', '>=', addDaysISO(today, -28)).get(),
    clubRef.collection('matchRequests').where('status', '==', 'waiting').get(),
    clubRef.collection('proposedMatches').where('status', '==', 'pending').get(),
  ]);
  if (!clubSnap.exists) return null;
  const requests = reqSnap.docs.map((d) => ({ ...(d.data() as MatchRequest), id: d.id }));
  const uids = new Set<string>();
  for (const r of requests) {
    uids.add(r.creatorUid);
    if (r.partnerUid) uids.add(r.partnerUid);
  }
  const memberships: ClubMembership[] = [];
  if (uids.size > 0) {
    const snaps = await db.getAll(...[...uids].map((u) => clubRef.collection('memberships').doc(u)));
    for (const s of snaps) if (s.exists) memberships.push(s.data() as ClubMembership);
  }
  return {
    club: { ...(clubSnap.data() as Club), id: clubId },
    courts: courtsSnap.docs.map((d) => ({ ...(d.data() as Court), id: d.id })),
    bookings: bookingsSnap.docs.map((d) => ({ ...(d.data() as Booking), id: d.id })),
    requests,
    memberships,
    pendingMatches: pendingSnap.docs
      .map((d) => ({ ...(d.data() as ProposedMatch), id: d.id }))
      .filter((m) => m.date >= today),
  };
}

/**
 * Busca un partido de 4 y, si lo encuentra, retiene la cancha y manda la propuesta.
 * Desde la etapa 3 (17/11) usa el planificador (src/lib/planificador.ts): elige el mejor grupo
 * (el que lleva más días sin jugar primero, sin repetir caras, sin perder partidos) y sugiere los equipos.
 */
export async function sweepClub(
  clubId: string,
  triggeredByUid: string,
  targetDate?: string
): Promise<ProposedMatch | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const ctx = await loadClubContext(clubId);
    if (!ctx) return null;
    const today = getTodayISO();
    const candidate = bestMatch({
      ...ctx,
      bookings: ctx.bookings.filter((b) => b.date >= today),
      history: historyFromBookings(ctx.bookings, today),
      targetDate,
    });
    if (!candidate) return null;
    try {
      const proposed = await commitCandidate(ctx.club, candidate, triggeredByUid);
      await notifyProposed(ctx.club, proposed);
      return proposed;
    } catch (err) {
      if (err instanceof Conflict) continue;
      throw err;
    }
  }
  return null;
}

async function commitCandidate(club: Club, c: MatchCandidateResult | PlannedMatch, triggeredByUid: string): Promise<ProposedMatch> {
  const clubRef = db.doc(`clubs/${club.id}`);
  const bookingId = makeId('bk');
  const matchId = makeId('pm');
  const totalPrice = calculateSlotPrice(club, c.date, c.startMinute);
  const proposed: ProposedMatch = {
    id: matchId,
    clubId: club.id,
    bookingId,
    courtId: c.court.id,
    courtName: c.court.name,
    date: c.date,
    startMinute: c.startMinute,
    endMinute: c.endMinute,
    modality: c.modality,
    minCategory: c.minCategory,
    maxCategory: c.maxCategory,
    pricePerPlayer: Math.round(totalPrice / 4),
    playerUids: c.slots.map((s) => s.uid),
    slots: c.slots,
    expiresAt: c.expiresAt,
    status: 'pending',
    createdByUid: triggeredByUid,
    // Equipos sugeridos (Firestore no guarda listas dentro de listas: van en dos campos).
    ...('teams' in c ? { teamA: c.teams[0], teamB: c.teams[1] } : {}),
  };

  await db.runTransaction(async (tx) => {
    // Árbitro: los pedidos tienen que seguir en espera y la cancha libre en el momento de escribir.
    const reqRefs = c.usedRequestIds.map((id) => clubRef.collection('matchRequests').doc(id));
    const reqSnaps = await tx.getAll(...reqRefs);
    if (reqSnaps.some((s) => !s.exists || s.get('status') !== 'waiting')) throw new Conflict('request taken');
    const sameCourt = await tx.get(
      clubRef.collection('bookings').where('courtId', '==', c.court.id).where('date', '==', c.date)
    );
    const busy = sameCourt.docs.some((d) => {
      const b = d.data() as Booking;
      return (b.status === 'confirmed' || b.status === 'held') && b.startMinute < c.endMinute && b.endMinute > c.startMinute;
    });
    if (busy) throw new Conflict('court taken');

    // Ninguno de los 4 puede tener otra reserva o partido propuesto que se pise (en cualquier cancha).
    const [sameDay, pendingSameDay] = await Promise.all([
      tx.get(clubRef.collection('bookings').where('date', '==', c.date)),
      tx.get(clubRef.collection('proposedMatches').where('date', '==', c.date)),
    ]);
    const taken = busyUidsAt(
      sameDay.docs.map((d) => ({ ...(d.data() as Booking), id: d.id })),
      pendingSameDay.docs.map((d) => ({ ...(d.data() as ProposedMatch), id: d.id })),
      c.date,
      c.startMinute,
      c.endMinute
    );
    if (proposed.playerUids.some((u) => taken.has(u))) throw new Conflict('player busy');

    tx.set(clubRef.collection('bookings').doc(bookingId), {
      id: bookingId,
      clubId: club.id,
      courtId: c.court.id,
      courtName: c.court.name,
      date: c.date,
      startMinute: c.startMinute,
      endMinute: c.endMinute,
      type: 'matched',
      status: 'held',
      createdByUid: triggeredByUid,
      playerUids: proposed.playerUids,
      guestName: `Partido armado (${c.modality})`,
      totalPrice,
      paidAmount: 0,
      paymentMethod: 'split',
      paymentStatus: 'pending',
      holdExpiresAt: c.expiresAt,
      ...(proposed.teamA ? { teamA: proposed.teamA, teamB: proposed.teamB } : {}),
      createdAt: now(),
      updatedAt: now(),
    });
    tx.set(clubRef.collection('proposedMatches').doc(matchId), { ...proposed, createdAt: now(), updatedAt: now() });
    for (const ref of reqRefs) tx.update(ref, { status: 'proposed', updatedAt: now() });
  });
  return proposed;
}

async function notifyProposed(club: Club, m: ProposedMatch) {
  await Promise.all(
    m.slots.map((s) =>
      notify({
        clubId: club.id,
        recipientUid: s.uid,
        eventType: 'match_proposed',
        title: `Partido propuesto · ${club.name}`,
        body: `${m.courtName} el ${formatDateFriendly(m.date, false)} ${formatMinutes(m.startMinute)} hs (${m.modality}). Confirmá antes de que venza el plazo.`,
      })
    )
  );
}

export type RespondResult = 'confirmed' | 'pending' | 'replaced_or_cancelled' | 'already_closed';

/** Un jugador acepta o rechaza su lugar en un partido propuesto. */
export async function respondToMatch(params: {
  clubId: string;
  matchId: string;
  slotUid: string;
  decision: 'accepted' | 'declined';
  actorUid: string;
}): Promise<RespondResult> {
  const { clubId, matchId, slotUid, decision, actorUid } = params;
  const clubRef = db.doc(`clubs/${clubId}`);
  const matchRef = clubRef.collection('proposedMatches').doc(matchId);

  if (decision === 'accepted') {
    // En una transacción: si dos aceptan a la vez, ninguno pisa al otro.
    const outcome = await db.runTransaction(async (tx) => {
      const snap = await tx.get(matchRef);
      if (!snap.exists) return { result: 'already_closed' as const };
      const m = snap.data() as ProposedMatch;
      if (m.status !== 'pending') return { result: m.status === 'confirmed' ? ('confirmed' as const) : ('already_closed' as const) };
      const slots: ProposedSlot[] = m.slots.map((s) => (s.uid === slotUid ? { ...s, status: 'accepted' } : s));
      const all = slots.every((s) => s.status === 'accepted');
      tx.update(matchRef, { slots, status: all ? 'confirmed' : 'pending', updatedAt: now() });
      if (all) {
        tx.update(clubRef.collection('bookings').doc(m.bookingId), { status: 'confirmed', holdExpiresAt: '', updatedAt: now() });
        for (const reqId of new Set(slots.map((s) => s.requestId))) {
          tx.update(clubRef.collection('matchRequests').doc(reqId), { status: 'confirmed', updatedAt: now() });
        }
      }
      return { result: all ? ('confirmed' as const) : ('pending' as const), match: { ...m, slots } };
    });
    if (outcome.result === 'confirmed' && outcome.match) {
      const m = outcome.match;
      const clubName = ((await clubRef.get()).get('name') as string) || 'tu club';
      await Promise.all(
        m.slots.map((s) =>
          notify({
            clubId,
            recipientUid: s.uid,
            eventType: 'match_confirmed',
            title: `Partido confirmado · ${clubName}`,
            body: `¡Listo! ${m.courtName} el ${formatDateFriendly(m.date, false)} a las ${formatMinutes(m.startMinute)} hs. Tu parte: $${m.pricePerPlayer}.`,
          })
        )
      );
    }
    return outcome.result;
  }

  // Rechazo con "falta uno": sale solo el que rechazó (y su pareja fija) y se busca reemplazo.
  if (await replaceInPendingMatch({ clubId, matchId, leavingUids: [slotUid], kind: 'declined' })) return 'replaced_or_cancelled';
  // Si el club lo tiene apagado (o quedarían menos de 2): como antes, se libera la cancha.
  const released = await releaseMatch(clubId, matchId, { declinedUid: slotUid, expired: false });
  if (!released) return 'already_closed';
  await afterRelease(clubId, released, actorUid);
  return 'replaced_or_cancelled';
}

/**
 * Cancela un partido pendiente y libera su cancha.
 * - declinedUid: el que rechazó (su pedido se cancela).
 * - expired: venció el plazo; los que no contestaron quedan con el pedido vencido.
 */
export async function releaseMatch(
  clubId: string,
  matchId: string,
  opts: { declinedUid?: string; expired: boolean }
): Promise<ProposedMatch | null> {
  const clubRef = db.doc(`clubs/${clubId}`);
  const matchRef = clubRef.collection('proposedMatches').doc(matchId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(matchRef);
    if (!snap.exists) return null;
    const m = snap.data() as ProposedMatch;
    if (m.status !== 'pending') return null;
    const reqIds = [...new Set(m.slots.map((s) => s.requestId))];
    const reqSnaps = reqIds.length ? await tx.getAll(...reqIds.map((id) => clubRef.collection('matchRequests').doc(id))) : [];

    const slots = m.slots.map((s) => (opts.declinedUid && s.uid === opts.declinedUid ? { ...s, status: 'declined' as const } : s));
    tx.update(matchRef, { status: 'cancelled', slots, updatedAt: now() });
    tx.update(clubRef.collection('bookings').doc(m.bookingId), { status: 'cancelled', updatedAt: now() });

    for (const rs of reqSnaps) {
      if (!rs.exists) continue;
      const r = rs.data() as MatchRequest;
      const mine = slots.filter((s) => s.requestId === rs.id);
      let next: MatchRequest['status'];
      if (opts.declinedUid && (r.creatorUid === opts.declinedUid || r.partnerUid === opts.declinedUid)) next = 'cancelled';
      else if (opts.expired && mine.some((s) => s.status !== 'accepted')) next = 'expired';
      else next = 'waiting';
      tx.update(rs.ref, { status: next, updatedAt: now() });
    }
    return { ...m, slots };
  });
}

/** Después de liberar: se busca reemplazo y, si la cancha no se volvió a ocupar, se avisa a la lista de espera. */
export async function afterRelease(clubId: string, m: ProposedMatch, actorUid: string) {
  const replacement = await sweepClub(clubId, actorUid, m.date);
  const reoccupied =
    replacement &&
    replacement.courtId === m.courtId &&
    replacement.date === m.date &&
    replacement.startMinute < m.endMinute &&
    replacement.endMinute > m.startMinute;
  if (!reoccupied) await notifyWaitlist(clubId, m);
}

export async function notifyWaitlist(
  clubId: string,
  slot: { courtId: string; courtName: string; date: string; startMinute: number; endMinute: number }
): Promise<number> {
  const clubRef = db.doc(`clubs/${clubId}`);
  const [clubSnap, wl] = await Promise.all([
    clubRef.get(),
    clubRef.collection('waitlist').where('courtId', '==', slot.courtId).where('date', '==', slot.date).get(),
  ]);
  const clubName = (clubSnap.get('name') as string) || 'tu club';
  const matching = wl.docs.filter((d) => {
    const w = d.data();
    return w.status === 'waiting' && w.startMinute < slot.endMinute && w.endMinute > slot.startMinute;
  });
  for (const d of matching) {
    await d.ref.update({ status: 'notified', updatedAt: now() });
    await notify({
      clubId,
      recipientUid: d.get('uid'),
      eventType: 'waitlist_slot_open',
      title: `¡Cancha liberada! · ${clubName}`,
      body: `${slot.courtName} quedó disponible el ${formatDateFriendly(slot.date, false)} a las ${formatMinutes(slot.startMinute)} hs. Reservá antes de que se ocupe.`,
      tab: 'bookings',
    });
  }
  return matching.length;
}
