// "Falta uno" automático: búsqueda de reemplazo, tandas, carrera, sin cuarto y faltas.
import { HttpsError } from 'firebase-functions/v2/https';
import { FieldValue, type Transaction } from 'firebase-admin/firestore';
import type {
  Booking,
  Club,
  ClubMembership,
  FillChoice,
  FillInvite,
  FillSearch,
  FillSearchKind,
  Gender,
  MatchRequest,
  ProposedMatch,
  ProposedSlot,
  RecoveryRecord,
} from '../../src/types/padel';
import { addDaysISO, formatCategory, formatDateFriendly, formatMinutes } from '../../src/lib/padelUtils';
import { teamsForSlots } from '../../src/lib/planificador';
import { db, isFakePlayer, makeId, now } from './admin';
import { notify } from './notify';
import {
  CHOICE_DEADLINE_MINUTES,
  MIN_LEAD_MINUTES,
  WAVE_SIZE_PER_SEAT,
  counterFor,
  isQuietHour,
  minutesUntil,
  prefsOf,
  AUTO_HOLD_FROM_SEATS,
  AUTO_HOLD_UNTIL_BEFORE_MIN,
  categoryFits,
  genderFits,
  lastPlayedFrom,
  rankCandidates,
  searchTiming,
  slotStart,
  type CurrentPlayer,
  type InviteCounter,
} from './fillRules';

/** Quién figura como creador de las reservas que arma sola la revisión de turnos libres. */
export const AUTO_FILL_UID = 'system_autofill';

const clubRef = (clubId: string) => db.doc(`clubs/${clubId}`);
const searchRef = (clubId: string, id: string) => clubRef(clubId).collection('fillSearches').doc(id);
const inviteRef = (clubId: string, searchId: string, uid: string) => clubRef(clubId).collection('fillInvites').doc(`${searchId}_${uid}`);

function when(date: string, startMinute: number) {
  return `${formatDateFriendly(date, false)} ${formatMinutes(startMinute)}`;
}

async function clubName(clubId: string): Promise<string> {
  return ((await clubRef(clubId).get()).get('name') as string) || 'tu club';
}

/** Búsqueda viva (buscando o esperando que elijan) de un partido, si la hay. */
export async function activeSearchFor(clubId: string, matchId: string): Promise<FillSearch | null> {
  const s = await clubRef(clubId).collection('fillSearches').where('matchId', '==', matchId).get();
  const live = s.docs.map((d) => d.data() as FillSearch).filter((x) => x.status === 'searching' || (x.status === 'unfilled' && !x.choice));
  return live[0] ?? null;
}

/** ¿Hay otra reserva viva en la cancha y hora de la búsqueda? (para los turnos libres automáticos) */
export function courtBusy(bookings: Booking[], s: Pick<FillSearch, 'courtId' | 'bookingId' | 'date' | 'startMinute' | 'endMinute'>): boolean {
  return bookings.some(
    (b) =>
      b.courtId === s.courtId &&
      b.id !== s.bookingId &&
      b.date === s.date &&
      b.status !== 'cancelled' &&
      b.status !== 'no_show' &&
      b.startMinute < s.endMinute &&
      b.endMinute > s.startMinute
  );
}

export type AutoEndReason = 'taken' | 'unfilled' | 'stopped';

/**
 * Turno libre automático que no sigue: se ocupó la cancha, no llegaron a 4 o el mostrador lo apagó.
 * Como no hay reserva todavía, no se libera nada: se cancela el partido vacío y se avisa a los que se sumaron.
 */
export async function endAutoSearch(clubId: string, searchId: string, why: AutoEndReason): Promise<boolean> {
  const cRef = clubRef(clubId);
  const sRef = searchRef(clubId, searchId);
  const res = await db.runTransaction(async (tx) => {
    const ss = await tx.get(sRef);
    const s = ss.data() as FillSearch | undefined;
    if (!s || !s.auto || s.status !== 'searching') return null;
    const mRef = cRef.collection('proposedMatches').doc(s.matchId);
    const bRef = cRef.collection('bookings').doc(s.bookingId);
    const [mSnap, bSnap] = await tx.getAll(mRef, bRef);
    const m = mSnap.data() as ProposedMatch | undefined;
    tx.update(sRef, { status: why === 'unfilled' ? 'unfilled' : 'cancelled', choice: 'cancel', endReason: why, updatedAt: now() });
    if (m && m.status === 'pending') tx.update(mRef, { status: 'cancelled', updatedAt: now() });
    // Si la cancha estaba retenida (2 o más confirmados), se libera.
    if (bSnap.exists && bSnap.get('status') === 'held') tx.update(bRef, { status: 'cancelled', updatedAt: now() });
    return { s, uids: m?.playerUids ?? [] };
  });
  if (!res) return false;
  await expireOpenInvites(clubId, searchId);
  const recs = await cRef.collection('recoveries').where('searchId', '==', searchId).get();
  const voidReason = why === 'taken' ? 'se ocupó la cancha' : why === 'unfilled' ? 'no llegaron a 4' : 'apagado por el club';
  await Promise.all(recs.docs.map((d) => d.ref.update({ status: 'voided', voidReason })));
  const w = when(res.s.date, res.s.startMinute);
  const msg =
    why === 'taken'
      ? { title: `Se ocupó la cancha · ${w}`, body: `Reservaron ${res.s.courtName} antes de que llegáramos a 4. No te quedó nada reservado.` }
      : why === 'unfilled'
        ? { title: `No llegamos a 4 · ${w}`, body: `No llegamos a 4 para ${w}. No te quedó nada reservado.` }
        : { title: `Se suspendió el partido · ${w}`, body: `El club dejó de buscar jugadores para ${w}. No te quedó nada reservado.` };
  await notifyPlayers(clubId, res.uids, { ...msg, eventType: 'booking_cancelled' });
  return true;
}

function fillEnabled(club: Club): boolean {
  return club.fillEnabled !== false;
}

/**
 * Saca jugadores de un partido (dentro de una transacción ya abierta) y devuelve el partido actualizado.
 * Los pedidos de los que salen quedan cancelados.
 */
function removeFromMatch(
  tx: Transaction,
  clubId: string,
  m: ProposedMatch,
  leaving: string[],
  booking: Booking | null
): ProposedMatch {
  const slots = m.slots.filter((s) => !leaving.includes(s.uid));
  const playerUids = slots.map((s) => s.uid);
  const cats = slots.map((s) => s.category);
  const next: ProposedMatch = {
    ...m,
    slots,
    playerUids,
    minCategory: cats.length ? Math.min(...cats) : m.minCategory,
    maxCategory: cats.length ? Math.max(...cats) : m.maxCategory,
  };
  const ref = clubRef(clubId);
  tx.update(ref.collection('proposedMatches').doc(m.id), {
    slots,
    playerUids,
    minCategory: next.minCategory,
    maxCategory: next.maxCategory,
    // Se fue alguien: los equipos sugeridos ya no valen (se vuelven a armar cuando son 4 otra vez).
    teamA: FieldValue.delete(),
    teamB: FieldValue.delete(),
    updatedAt: now(),
  });
  if (booking) tx.update(ref.collection('bookings').doc(m.bookingId), { playerUids, teamA: FieldValue.delete(), teamB: FieldValue.delete(), updatedAt: now() });
  const leavingReqs = new Set(m.slots.filter((s) => leaving.includes(s.uid) && s.requestId).map((s) => s.requestId));
  for (const id of leavingReqs) tx.update(ref.collection('matchRequests').doc(id), { status: 'cancelled', updatedAt: now() });
  return next;
}

/** Crea la búsqueda (o suma lugares a la que ya existe). Devuelve su id. */
async function openOrGrowSearch(p: {
  club: Club;
  match: ProposedMatch;
  kind: FillSearchKind;
  seats: number;
  leaving: { uid: string; gender: Gender }[];
  lateDropUid: string;
  nowDate: Date;
}): Promise<string> {
  const { club, match, kind, seats, leaving, lateDropUid, nowDate } = p;
  const existing = await activeSearchFor(club.id, match.id);
  if (existing && existing.status === 'searching') {
    await searchRef(club.id, existing.id).update({
      seatsNeeded: existing.seatsNeeded + seats,
      excludedUids: [...new Set([...existing.excludedUids, ...leaving.map((l) => l.uid)])],
      lateDropUid: existing.lateDropUid || lateDropUid,
      nextWaveAt: nowDate.toISOString(),
      updatedAt: now(),
    });
    return existing.id;
  }
  const { closesAt } = searchTiming(match.date, match.startMinute, nowDate);
  const id = makeId('fs');
  const tooLate = minutesUntil(match.date, match.startMinute, nowDate) < MIN_LEAD_MINUTES;
  const s: FillSearch = {
    id,
    clubId: club.id,
    kind,
    matchId: match.id,
    bookingId: match.bookingId,
    courtId: match.courtId,
    courtName: match.courtName,
    date: match.date,
    startMinute: match.startMinute,
    endMinute: match.endMinute,
    modality: match.modality,
    genderNeeded: match.modality === 'mixto' ? leaving[0]?.gender ?? '' : '',
    seatsNeeded: seats,
    seatsFilled: 0,
    filledUids: [],
    excludedUids: leaving.map((l) => l.uid),
    invitedUids: [],
    lateDropUid,
    wave: 0,
    nextWaveAt: nowDate.toISOString(),
    closesAt: closesAt.toISOString(),
    status: 'searching',
    choice: '',
    extended: false,
    pricePerPlayer: match.pricePerPlayer,
    openedAt: nowDate.toISOString(),
  };
  await searchRef(club.id, id).set({ ...s, createdAt: now(), updatedAt: now() });
  if (tooLate) await closeUnfilled(club.id, id, nowDate);
  return id;
}

// -----------------------------------------------------------------------------
// Bajas y rechazos
// -----------------------------------------------------------------------------

/** "No puedo ir": el jugador sale de un partido armado y se busca reemplazo. */
export async function dropFromMatch(p: { clubId: string; matchId: string; uid: string; nowDate?: Date }) {
  const nowDate = p.nowDate ?? new Date();
  const cRef = clubRef(p.clubId);
  const club = { ...((await cRef.get()).data() as Club), id: p.clubId };
  const matchDoc = cRef.collection('proposedMatches').doc(p.matchId);
  // Turno libre que todavía junta gente: el que se baja libera su lugar y la búsqueda sigue (sin falta).
  const live = await activeSearchFor(p.clubId, p.matchId);
  const freeSlot = live && live.kind === 'free_slot' && live.status === 'searching' ? live : null;

  const result = await db.runTransaction(async (tx) => {
    const ms = await tx.get(matchDoc);
    if (!ms.exists) throw new HttpsError('not-found', 'Ese partido ya no existe.');
    const m = ms.data() as ProposedMatch;
    if (m.status === 'cancelled') throw new HttpsError('failed-precondition', 'Ese partido ya está cancelado.');
    const slot = m.slots.find((s) => s.uid === p.uid);
    if (!slot) throw new HttpsError('failed-precondition', 'No estás en ese partido.');
    const bs = await tx.get(cRef.collection('bookings').doc(m.bookingId));
    const booking = bs.exists ? (bs.data() as Booking) : null;
    const next = removeFromMatch(tx, p.clubId, m, [p.uid], booking);
    if (freeSlot) {
      // Turno libre automático con la cancha retenida: si quedan menos de 2, se suelta.
      if (freeSlot.auto && booking?.status === 'held' && next.slots.length < AUTO_HOLD_FROM_SEATS) {
        tx.update(bs.ref, { status: 'cancelled', updatedAt: now() });
      }
      const sRef = searchRef(p.clubId, freeSlot.id);
      tx.update(sRef, {
        seatsFilled: FieldValue.increment(-1),
        filledUids: FieldValue.arrayRemove(p.uid),
        excludedUids: FieldValue.arrayUnion(p.uid),
        nextWaveAt: nowDate.toISOString(),
        updatedAt: now(),
      });
    } else if (next.slots.length === 0) {
      tx.update(matchDoc, { status: 'cancelled', updatedAt: now() });
      if (booking) tx.update(bs.ref, { status: 'cancelled', updatedAt: now() });
    }
    return { m, next, slot };
  });

  const { m, next, slot } = result;
  const name = await clubName(p.clubId);
  if (freeSlot) {
    const rec = cRef.collection('recoveries').doc(`rec_${freeSlot.id}_${p.uid}`);
    if ((await rec.get()).exists) await rec.update({ status: 'voided', voidReason: 'el que entró se bajó' });
    await notifyPlayers(p.clubId, next.slots.map((s) => s.uid), {
      title: `${slot.displayName.split(' ')[0]} no puede · ${when(m.date, m.startMinute)}`,
      body: `Seguimos buscando para completar los 4 en ${name}.`,
    });
    await runWave(p.clubId, freeSlot.id, nowDate);
    return { status: 'searching' as const, searchId: freeSlot.id, late: false };
  }
  if (next.slots.length === 0) return { status: 'cancelled' as const };

  const hoursLeft = minutesUntil(m.date, m.startMinute, nowDate) / 60;
  const late = hoursLeft < (club.cancellationHours ?? 0);
  const member = (await cRef.collection('memberships').doc(p.uid).get()).data() as ClubMembership | undefined;
  const gender = member?.gender ?? slot.gender;

  if (!fillEnabled(club)) {
    if (late) await addNoShow(p.clubId, p.uid);
    await notifyPlayers(p.clubId, next.slots.map((s) => s.uid), {
      title: `${slot.displayName} no puede · ${when(m.date, m.startMinute)}`,
      body: `Quedan ${next.slots.length}. El club tiene apagado el "falta uno" automático.`,
    });
    return { status: 'no_search' as const };
  }

  const searchId = await openOrGrowSearch({
    club,
    match: next,
    kind: 'player_dropped',
    seats: 1,
    leaving: [{ uid: p.uid, gender }],
    lateDropUid: late ? p.uid : '',
    nowDate,
  });
  await notifyPlayers(p.clubId, next.slots.map((s) => s.uid), {
    title: `${slot.displayName.split(' ')[0]} no puede ${formatDateFriendly(m.date, false).toLowerCase()}`,
    body: `Ya estamos buscando el cuarto para ${when(m.date, m.startMinute)} hs en ${name}. No tenés que hacer nada.`,
  });
  await runWave(p.clubId, searchId, nowDate);
  return { status: 'searching' as const, searchId, late };
}

/**
 * En un partido propuesto (todavía sin confirmar) alguien rechaza o no contesta:
 * en vez de cancelar todo, salen solo ellos y se busca a los que faltan.
 * Devuelve false si no corresponde (club con falta uno apagado o quedan menos de 2).
 */
export async function replaceInPendingMatch(p: {
  clubId: string;
  matchId: string;
  leavingUids: string[];
  kind: 'declined' | 'no_answer';
  nowDate?: Date;
}): Promise<boolean> {
  const nowDate = p.nowDate ?? new Date();
  const cRef = clubRef(p.clubId);
  const club = { ...((await cRef.get()).data() as Club), id: p.clubId };
  if (!fillEnabled(club)) return false;
  const matchDoc = cRef.collection('proposedMatches').doc(p.matchId);
  const pre = (await matchDoc.get()).data() as ProposedMatch | undefined;
  if (!pre || pre.status !== 'pending') return false;

  // Si el que sale tiene pareja fija, sale la pareja entera.
  const reqIds = new Set(pre.slots.filter((s) => p.leavingUids.includes(s.uid)).map((s) => s.requestId).filter(Boolean));
  const leaving = pre.slots.filter((s) => p.leavingUids.includes(s.uid) || (s.requestId && reqIds.has(s.requestId)));
  const staying = pre.slots.filter((s) => !leaving.includes(s));
  if (staying.length < 2) return false;

  const { closesAt } = searchTiming(pre.date, pre.startMinute, nowDate);
  const leavingUids = leaving.map((s) => s.uid);
  const next = await db.runTransaction(async (tx) => {
    const ms = await tx.get(matchDoc);
    const m = ms.data() as ProposedMatch;
    if (m.status !== 'pending') return null;
    const bs = await tx.get(cRef.collection('bookings').doc(m.bookingId));
    const n = removeFromMatch(tx, p.clubId, m, leavingUids, bs.exists ? (bs.data() as Booking) : null);
    // La cancha sigue retenida mientras dure la búsqueda.
    tx.update(matchDoc, { expiresAt: closesAt.toISOString() });
    if (bs.exists) tx.update(bs.ref, { holdExpiresAt: closesAt.toISOString() });
    return n;
  });
  if (!next) return false;
  const searchId = await openOrGrowSearch({
    club,
    match: next,
    kind: p.kind,
    seats: leaving.length,
    leaving: leaving.map((s) => ({ uid: s.uid, gender: s.gender })),
    lateDropUid: '',
    nowDate,
  });
  const name = await clubName(p.clubId);
  await notifyPlayers(p.clubId, next.slots.map((s) => s.uid), {
    title: `Buscamos ${leaving.length === 1 ? 'el cuarto' : `${leaving.length} jugadores`} · ${when(next.date, next.startMinute)}`,
    body: `${leaving.length === 1 ? 'Uno no pudo' : 'No pudieron todos'}. La cancha sigue retenida en ${name} y ya estamos avisando a otros jugadores.`,
  });
  await runWave(p.clubId, searchId, nowDate);
  return true;
}

// -----------------------------------------------------------------------------
// Tandas de aviso
// -----------------------------------------------------------------------------

async function getAllChunked(refs: FirebaseFirestore.DocumentReference[]) {
  const out: FirebaseFirestore.DocumentSnapshot[] = [];
  for (let i = 0; i < refs.length; i += 100) out.push(...(await db.getAll(...refs.slice(i, i + 100))));
  return out;
}

/** Manda la próxima tanda de invitaciones si corresponde. Devuelve cuántas mandó. */
export async function runWave(clubId: string, searchId: string, nowDate = new Date()): Promise<number> {
  const cRef = clubRef(clubId);
  const sDoc = await searchRef(clubId, searchId).get();
  if (!sDoc.exists) return 0;
  const s = sDoc.data() as FillSearch;
  if (s.status !== 'searching') return 0;
  if (s.nextWaveAt > nowDate.toISOString()) return 0;
  if (isQuietHour(nowDate)) return 0;

  const [clubSnap, matchSnap, membersSnap, bookingsSnap, reqSnap] = await Promise.all([
    cRef.get(),
    cRef.collection('proposedMatches').doc(s.matchId).get(),
    cRef.collection('memberships').get(),
    cRef.collection('bookings').where('date', '==', s.date).get(),
    cRef.collection('matchRequests').where('status', '==', 'waiting').get(),
  ]);
  // Lo jugado en las últimas 4 semanas: a igual categoría se avisa primero al que lleva más días sin jugar.
  const pastSnap = await cRef.collection('bookings').where('date', '>=', addDaysISO(s.date, -28)).where('date', '<', s.date).get();
  const lastPlayed = lastPlayedFrom(pastSnap.docs.map((d) => d.data() as Booking), s.date);
  const club = { ...(clubSnap.data() as Club), id: clubId };
  const match = matchSnap.data() as ProposedMatch | undefined;
  const booking = bookingsSnap.docs.find((d) => d.id === s.bookingId)?.data() as Booking | undefined;
  if (s.auto) {
    // Turno libre automático: no hay reserva hasta que se junten los 4. Si alguien reservó la cancha, se apaga.
    if (!match || match.status === 'cancelled') {
      await sDoc.ref.update({ status: 'cancelled', updatedAt: now() });
      return 0;
    }
    if (courtBusy(bookingsSnap.docs.map((d) => ({ ...(d.data() as Booking), id: d.id })), s)) {
      await endAutoSearch(clubId, searchId, 'taken');
      return 0;
    }
  } else if (!match || match.status === 'cancelled' || !booking || booking.status === 'cancelled') {
    await sDoc.ref.update({ status: 'cancelled', updatedAt: now() });
    return 0;
  }
  const members = membersSnap.docs.map((d) => d.data() as ClubMembership);
  const userSnaps = await getAllChunked(members.map((m) => db.doc(`users/${m.uid}`)));
  const prefsByUid = new Map(userSnaps.map((u) => [u.id, prefsOf(u.get('alertPrefs'))]));
  const counters = new Map(userSnaps.map((u) => [u.id, u.get('fillCounter') as InviteCounter | undefined]));
  const current: CurrentPlayer[] = match.slots.map((sl) => ({
    uid: sl.uid,
    category: sl.category,
    gap: prefsByUid.get(sl.uid)?.maxCategoryGap ?? 1,
  }));
  const target = current.length
    ? Math.round(current.reduce((a, c) => a + c.category, 0) / current.length)
    : Math.round(((s.minCategory ?? 5) + (s.maxCategory ?? s.minCategory ?? 5)) / 2);
  const ranked = rankCandidates({
    search: s,
    clubGap: club.fillMaxGap ?? 1,
    current,
    targetCategory: target,
    members,
    prefsByUid,
    counters,
    bookings: bookingsSnap.docs.map((d) => d.data() as Booking),
    requests: reqSnap.docs.map((d) => d.data() as MatchRequest),
    now: nowDate,
    lastPlayed,
  });
  const seatsLeft = s.seatsNeeded - s.seatsFilled;
  const wave = ranked.slice(0, Math.min(12, WAVE_SIZE_PER_SEAT * seatsLeft));
  const { waveGapMin } = searchTiming(s.date, s.startMinute, nowDate);
  const nextWaveAt = wave.length && ranked.length > wave.length ? new Date(nowDate.getTime() + waveGapMin * 60000).toISOString() : s.closesAt;

  await sDoc.ref.update({
    wave: s.wave + (wave.length ? 1 : 0),
    invitedUids: [...s.invitedUids, ...wave.map((c) => c.uid)],
    nextWaveAt,
    updatedAt: now(),
  });
  if (!wave.length) return 0;

  const name = club.name || 'tu club';
  const catLabel = match.minCategory === match.maxCategory ? formatCategory(match.minCategory) : `${formatCategory(match.minCategory)}–${formatCategory(match.maxCategory)}`;
  const sentAt = nowDate.toISOString();
  for (const c of wave) {
    const inv: FillInvite = {
      id: `${searchId}_${c.uid}`,
      clubId,
      searchId,
      uid: c.uid,
      wave: s.wave + 1,
      date: s.date,
      startMinute: s.startMinute,
      endMinute: s.endMinute,
      courtName: s.courtName,
      pricePerPlayer: s.pricePerPlayer,
      status: 'sent',
      countsForCap: !c.hasRequest,
      sentAt,
    };
    const batch = db.batch();
    batch.set(inviteRef(clubId, searchId, c.uid), { ...inv, createdAt: now(), updatedAt: now() });
    if (!c.hasRequest) {
      const uRef = db.doc(`users/${c.uid}`);
      const cur = counterFor(counters.get(c.uid), nowDate);
      batch.set(uRef, { fillCounter: { ...cur, weekCount: cur.weekCount + 1, dayCount: cur.dayCount + 1 } }, { merge: true });
    }
    await batch.commit();
    await notify({
      clubId,
      recipientUid: c.uid,
      eventType: 'fill_invite',
      title: s.kind === 'free_slot' && seatsLeft >= 3
        ? `Cancha libre · ${when(s.date, s.startMinute)}`
        : `Falta ${seatsLeft === 1 ? 'uno' : seatsLeft} · ${when(s.date, s.startMinute)}`,
      body: s.kind === 'free_slot'
        ? `Partido de ${catLabel} en ${name}, ${s.courtName}. Faltan ${seatsLeft}. ¿Te sumás? Tu parte: $${s.pricePerPlayer}${s.discountPct ? ` (${s.discountPct} % menos)` : ''}.`
        : `Partido de ${catLabel} en ${name}, ${s.courtName}. ¿Te sumás? Tu parte: $${s.pricePerPlayer}.`,
    });
  }
  return wave.length;
}

// -----------------------------------------------------------------------------
// "Me sumo": el primero que confirma gana
// -----------------------------------------------------------------------------

export type ClaimResult = 'won' | 'late' | 'closed' | 'busy';

export async function claimSeat(p: { clubId: string; searchId: string; uid: string; nowDate?: Date }): Promise<ClaimResult> {
  const nowDate = p.nowDate ?? new Date();
  const cRef = clubRef(p.clubId);
  const sRef = searchRef(p.clubId, p.searchId);
  const iRef = inviteRef(p.clubId, p.searchId, p.uid);
  const memberSnap = await cRef.collection('memberships').doc(p.uid).get();
  const member = memberSnap.data() as ClubMembership | undefined;
  if (!member) throw new HttpsError('permission-denied', 'No sos jugador de este club.');

  const out = await db.runTransaction(async (tx) => {
    const [ss, is] = await tx.getAll(sRef, iRef);
    if (!ss.exists || !is.exists) return { r: 'closed' as const };
    const s = ss.data() as FillSearch;
    const inv = is.data() as FillInvite;
    if (inv.status === 'won') return { r: 'won' as const };
    // Si ya se llenó, su invitación pudo quedar vencida un instante antes: igual es "llegaste tarde".
    if (inv.status !== 'sent' && !(inv.status === 'expired' && s.status === 'filled')) return { r: 'closed' as const };
    if (s.status !== 'searching' || s.seatsFilled >= s.seatsNeeded) {
      tx.update(iRef, { status: 'late', updatedAt: now() });
      return { r: 'late' as const, refund: inv.countsForCap };
    }
    if (s.closesAt <= nowDate.toISOString()) return { r: 'closed' as const };
    const mRef = cRef.collection('proposedMatches').doc(s.matchId);
    const bRef = cRef.collection('bookings').doc(s.bookingId);
    const [ms] = await tx.getAll(mRef);
    const m = ms.data() as ProposedMatch;
    if (!m || m.status === 'cancelled') return { r: 'closed' as const };
    if (m.playerUids.includes(p.uid)) return { r: 'won' as const };
    let autoHeld = false; // turno libre automático con la cancha ya retenida (2 o más confirmados)
    if (s.auto) {
      const court = await tx.get(cRef.collection('bookings').where('date', '==', s.date).where('courtId', '==', s.courtId));
      const courtDocs = court.docs.map((d) => ({ ...(d.data() as Booking), id: d.id }));
      if (courtBusy(courtDocs, s)) return { r: 'taken' as const };
      autoHeld = courtDocs.some((b) => b.id === s.bookingId && b.status === 'held');
    }
    const mine = await tx.get(cRef.collection('bookings').where('date', '==', s.date).where('playerUids', 'array-contains', p.uid));
    const overlap = mine.docs.some((d) => {
      const b = d.data() as Booking;
      return d.id !== s.bookingId && b.status !== 'cancelled' && b.status !== 'no_show' && b.startMinute < s.endMinute && b.endMinute > s.startMinute;
    });
    if (overlap) return { r: 'busy' as const };
    // Los turnos libres automáticos todavía no tienen reserva: también se mira si ya está en otro partido pendiente a esa hora.
    const myPending = await tx.get(cRef.collection('proposedMatches').where('date', '==', s.date).where('playerUids', 'array-contains', p.uid));
    const pendingOverlap = myPending.docs.some((d) => {
      const pm = d.data() as ProposedMatch;
      return d.id !== s.matchId && pm.status === 'pending' && pm.startMinute < s.endMinute && pm.endMinute > s.startMinute;
    });
    if (pendingOverlap) return { r: 'busy' as const };

    const newSlot: ProposedSlot = {
      uid: p.uid,
      displayName: member.displayName,
      category: member.category,
      gender: member.gender,
      status: 'accepted',
      paid: false,
      requestId: '',
    };
    const slots = [...m.slots, newSlot];
    const playerUids = slots.map((x) => x.uid);
    const cats = slots.map((x) => x.category);
    const full = s.seatsFilled + 1 >= s.seatsNeeded;
    const confirmNow = m.status === 'pending' && full && slots.length >= 4 && slots.every((x) => x.status === 'accepted');
    const teams = teamsForSlots(slots) ?? {};
    tx.update(mRef, {
      slots,
      playerUids,
      minCategory: Math.min(...cats),
      maxCategory: Math.max(...cats),
      ...teams,
      ...(confirmNow ? { status: 'confirmed' } : {}),
      updatedAt: now(),
    });
    if (!s.auto) {
      tx.update(bRef, { playerUids, ...teams, ...(confirmNow ? { status: 'confirmed', holdExpiresAt: '' } : {}), updatedAt: now() });
    } else if (!confirmNow) {
      // Turno libre automático (decisión 4.4): con 2 confirmados se retiene la cancha, como mucho hasta 3 h antes.
      const holdUntil = new Date(slotStart(s.date, s.startMinute).getTime() - AUTO_HOLD_UNTIL_BEFORE_MIN * 60000);
      if (autoHeld) {
        tx.update(bRef, { playerUids, ...teams, updatedAt: now() });
      } else if (s.seatsFilled + 1 >= AUTO_HOLD_FROM_SEATS && nowDate < holdUntil) {
        tx.set(bRef, {
          id: s.bookingId, clubId: p.clubId, courtId: s.courtId, courtName: s.courtName, date: s.date,
          startMinute: s.startMinute, endMinute: s.endMinute, type: 'matched', status: 'held', createdByUid: AUTO_FILL_UID,
          playerUids, guestName: 'Armado por la app', totalPrice: s.pricePerPlayer * 4, paidAmount: 0, paymentMethod: 'split',
          paymentStatus: 'pending', holdExpiresAt: holdUntil.toISOString(), discountPct: s.discountPct ?? 0, createdAt: now(), updatedAt: now(),
        });
      }
    } else {
      // Recién ahora se confirma la cancha (la transacción ya comprobó que sigue libre).
      const booking: Booking & Record<string, unknown> = {
        id: s.bookingId,
        clubId: p.clubId,
        courtId: s.courtId,
        courtName: s.courtName,
        date: s.date,
        startMinute: s.startMinute,
        endMinute: s.endMinute,
        type: 'matched',
        status: 'confirmed',
        createdByUid: AUTO_FILL_UID,
        playerUids,
        ...teams,
        guestName: 'Armado por la app',
        totalPrice: s.pricePerPlayer * 4,
        paidAmount: 0,
        paymentMethod: 'split',
        paymentStatus: 'pending',
        holdExpiresAt: '',
        discountPct: s.discountPct ?? 0,
      } as Booking & Record<string, unknown>;
      tx.set(bRef, { ...booking, createdAt: now(), updatedAt: now() });
    }
    if (confirmNow) {
      for (const reqId of new Set(slots.map((x) => x.requestId).filter(Boolean))) {
        tx.update(cRef.collection('matchRequests').doc(reqId), { status: 'confirmed', updatedAt: now() });
      }
    }
    tx.update(sRef, {
      seatsFilled: s.seatsFilled + 1,
      filledUids: [...s.filledUids, p.uid],
      status: full ? 'filled' : 'searching',
      updatedAt: now(),
    });
    tx.update(iRef, { status: 'won', updatedAt: now() });
    const rec: RecoveryRecord = {
      id: `rec_${p.searchId}_${p.uid}`,
      clubId: p.clubId,
      bookingId: s.bookingId,
      courtId: s.courtId,
      date: s.date,
      startMinute: s.startMinute,
      endMinute: s.endMinute,
      sport: 'padel',
      kind: s.kind === 'player_dropped' ? 'player_replaced' : s.kind === 'free_slot' ? 'slot_filled' : 'match_completed',
      freeSince: s.openedAt,
      searchId: p.searchId,
      alertSentAt: inv.sentAt,
      filledByUid: p.uid,
      filledAt: nowDate.toISOString(),
      seatsFilled: 1,
      via: inv.via ?? 'aviso',
      amountRecovered: s.pricePerPlayer,
      status: 'pending',
      voidReason: '',
    };
    tx.set(cRef.collection('recoveries').doc(rec.id), { ...rec, createdAt: now() });
    return { r: 'won' as const, full, s, m: { ...m, slots, playerUids } };
  });

  if (out.r === 'late' && out.refund) await refundCounter(p.uid, nowDate);
  if (out.r === 'taken') {
    await endAutoSearch(p.clubId, p.searchId, 'taken');
    return 'closed';
  }
  if (out.r !== 'won' || !('s' in out) || !out.s) return out.r;

  const { s, m, full } = out;
  const name = await clubName(p.clubId);
  const first = member.displayName.split(' ')[0];
  await notify({
    clubId: p.clubId,
    recipientUid: p.uid,
    eventType: 'match_confirmed',
    title: `¡Adentro! · ${when(s.date, s.startMinute)}`,
    body: `Jugás ${when(s.date, s.startMinute)} hs en ${s.courtName}, ${name}. Tu parte: $${s.pricePerPlayer}.`,
  });
  const others = m.slots.map((x) => x.uid).filter((u) => u !== p.uid);
  await notifyPlayers(p.clubId, others, full
    ? { title: `Ya son ${m.slots.length} · ${when(s.date, s.startMinute)}`, body: `Entra ${first} (${formatCategory(member.category)}). ${s.courtName}, ${name}.`, eventType: 'match_confirmed' }
    : { title: `Entró ${first} · ${when(s.date, s.startMinute)}`, body: `Falta ${s.seatsNeeded - s.seatsFilled - 1} más. Seguimos buscando.` });
  if (full) await expireOpenInvites(p.clubId, p.searchId);
  return 'won';
}

export async function declineInvite(p: { clubId: string; searchId: string; uid: string }) {
  const iRef = inviteRef(p.clubId, p.searchId, p.uid);
  const snap = await iRef.get();
  if (!snap.exists || snap.get('status') !== 'sent') return;
  await iRef.update({ status: 'declined', updatedAt: now() });
}

async function expireOpenInvites(clubId: string, searchId: string) {
  const snap = await clubRef(clubId).collection('fillInvites').where('searchId', '==', searchId).get();
  await Promise.all(snap.docs.filter((d) => d.get('status') === 'sent').map((d) => d.ref.update({ status: 'expired', updatedAt: now() })));
}

async function refundCounter(uid: string, nowDate: Date) {
  const ref = db.doc(`users/${uid}`);
  await db.runTransaction(async (tx) => {
    const u = await tx.get(ref);
    const c = counterFor(u.get('fillCounter') as InviteCounter | undefined, nowDate);
    tx.set(ref, { fillCounter: { ...c, weekCount: Math.max(0, c.weekCount - 1), dayCount: Math.max(0, c.dayCount - 1) } }, { merge: true });
  });
}

// -----------------------------------------------------------------------------
// Sin cuarto: los que quedan eligen
// -----------------------------------------------------------------------------

/** Se terminó el tiempo sin llenar: los que no habían aceptado salen y se pregunta a los que quedan. */
export async function closeUnfilled(clubId: string, searchId: string, nowDate = new Date()) {
  const cRef = clubRef(clubId);
  const sRef = searchRef(clubId, searchId);
  if ((await sRef.get()).get('auto')) {
    // Turno libre automático: si a la hora límite no son 4, se cancela (no se pregunta "jugamos igual").
    await endAutoSearch(clubId, searchId, 'unfilled');
    return;
  }
  const res = await db.runTransaction(async (tx) => {
    const ss = await tx.get(sRef);
    const s = ss.data() as FillSearch;
    if (!s || s.status !== 'searching') return null;
    const mRef = cRef.collection('proposedMatches').doc(s.matchId);
    const bRef = cRef.collection('bookings').doc(s.bookingId);
    const [ms, bs] = await tx.getAll(mRef, bRef);
    const m = ms.data() as ProposedMatch;
    tx.update(sRef, { status: 'unfilled', updatedAt: now() });
    if (!m || m.status === 'cancelled') return { s, m: null };
    const notAccepted = m.slots.filter((x) => x.status !== 'accepted').map((x) => x.uid);
    const next = notAccepted.length ? removeFromMatch(tx, clubId, m, notAccepted, bs.exists ? (bs.data() as Booking) : null) : m;
    // La cancha queda retenida hasta que elijan (o hasta 30 min antes).
    const deadline = new Date(slotStart(s.date, s.startMinute).getTime() - CHOICE_DEADLINE_MINUTES * 60000).toISOString();
    if (m.status === 'pending') {
      tx.update(mRef, { expiresAt: deadline });
      if (bs.exists) tx.update(bRef, { holdExpiresAt: deadline });
    }
    return { s, m: next };
  });
  if (!res || !res.m) return;
  await expireOpenInvites(clubId, searchId);
  const { s, m } = res;
  if (m.slots.length === 0) {
    await cancelMatch(clubId, m, s, 'Nadie quedó en el partido.');
    return;
  }
  await notifyPlayers(clubId, m.slots.map((x) => x.uid), {
    title: `Seguimos siendo ${m.slots.length} · ${when(s.date, s.startMinute)}`,
    body: `No apareció ${s.seatsNeeded - s.seatsFilled === 1 ? 'el cuarto' : 'nadie más'}. Entrá para elegir: jugamos igual, seguimos buscando o cancelamos.`,
    email: true,
  });
}

/** Uno de los que quedan elige qué hacer. Vale la primera respuesta. */
export async function chooseUnfilled(p: { clubId: string; searchId: string; uid: string; choice: FillChoice; nowDate?: Date }) {
  const nowDate = p.nowDate ?? new Date();
  const cRef = clubRef(p.clubId);
  const sRef = searchRef(p.clubId, p.searchId);
  const s = (await sRef.get()).data() as FillSearch | undefined;
  if (!s || s.status !== 'unfilled' || s.choice) return { result: 'already_decided' as const, choice: s?.choice || '' };
  const m = (await cRef.collection('proposedMatches').doc(s.matchId).get()).data() as ProposedMatch | undefined;
  if (!m || !m.playerUids.includes(p.uid)) throw new HttpsError('permission-denied', 'No estás en ese partido.');

  let choice = p.choice;
  if (choice === 'keep_searching') {
    const left = minutesUntil(s.date, s.startMinute, nowDate);
    if (s.extended || left <= MIN_LEAD_MINUTES + 10) choice = 'play_as_three';
  }
  const ok = await db.runTransaction(async (tx) => {
    const cur = (await tx.get(sRef)).data() as FillSearch;
    if (cur.status !== 'unfilled' || cur.choice) return false;
    if (choice === 'keep_searching') {
      const closesAt = new Date(slotStart(s.date, s.startMinute).getTime() - MIN_LEAD_MINUTES * 60000).toISOString();
      tx.update(sRef, { status: 'searching', extended: true, closesAt, nextWaveAt: nowDate.toISOString(), updatedAt: now() });
      if (m.status === 'pending') {
        tx.update(cRef.collection('proposedMatches').doc(m.id), { expiresAt: closesAt });
        tx.update(cRef.collection('bookings').doc(m.bookingId), { holdExpiresAt: closesAt });
      }
    } else {
      tx.update(sRef, { choice, updatedAt: now() });
    }
    return true;
  });
  if (!ok) return { result: 'already_decided' as const, choice: '' };

  const chooser = m.slots.find((x) => x.uid === p.uid)?.displayName.split(' ')[0] ?? 'Alguien';
  const others = m.playerUids.filter((u) => u !== p.uid);
  if (choice === 'keep_searching') {
    await notifyPlayers(p.clubId, others, { title: `Seguimos buscando · ${when(s.date, s.startMinute)}`, body: `${chooser} eligió seguir buscando hasta 45 minutos antes.` });
    await runWave(p.clubId, p.searchId, nowDate);
  } else if (choice === 'play_as_three') {
    await finalizeKeep(p.clubId, s, m);
    await notifyPlayers(p.clubId, others, { title: `Juegan ${m.slots.length} · ${when(s.date, s.startMinute)}`, body: `${chooser} eligió jugar igual. La cancha sigue reservada.` });
  } else {
    await cancelMatch(p.clubId, m, s, `${chooser} eligió cancelar. No les queda falta.`);
  }
  return { result: 'ok' as const, choice };
}

/** El partido sigue con los que hay: se confirma la reserva y se aplica la falta al que se bajó tarde. */
async function finalizeKeep(clubId: string, s: FillSearch, m: ProposedMatch) {
  const cRef = clubRef(clubId);
  const batch = db.batch();
  if (m.status === 'pending') {
    batch.update(cRef.collection('proposedMatches').doc(m.id), { status: 'confirmed', updatedAt: now() });
    batch.update(cRef.collection('bookings').doc(m.bookingId), { status: 'confirmed', holdExpiresAt: '', updatedAt: now() });
  }
  await batch.commit();
  if (s.lateDropUid) await addNoShow(clubId, s.lateDropUid);
}

async function cancelMatch(clubId: string, m: ProposedMatch, s: FillSearch, reason: string) {
  const cRef = clubRef(clubId);
  const batch = db.batch();
  batch.update(cRef.collection('proposedMatches').doc(m.id), { status: 'cancelled', updatedAt: now() });
  batch.update(cRef.collection('bookings').doc(m.bookingId), { status: 'cancelled', updatedAt: now() });
  batch.update(searchRef(clubId, s.id), { choice: 'cancel', updatedAt: now() });
  await batch.commit();
  if (s.lateDropUid) await addNoShow(clubId, s.lateDropUid);
  await notifyPlayers(clubId, m.playerUids, { title: `Partido cancelado · ${when(s.date, s.startMinute)}`, body: `Se liberó la cancha. ${reason}`, eventType: 'booking_cancelled' });
}

/** Si nadie eligió y faltan 30 minutos, el partido sigue en pie (D7). */
export async function autoFinalize(clubId: string, searchId: string) {
  const sRef = searchRef(clubId, searchId);
  const s = (await sRef.get()).data() as FillSearch;
  const ok = await db.runTransaction(async (tx) => {
    const cur = (await tx.get(sRef)).data() as FillSearch;
    if (cur.status !== 'unfilled' || cur.choice) return false;
    tx.update(sRef, { choice: 'play_as_three', updatedAt: now() });
    return true;
  });
  if (!ok) return;
  const m = (await clubRef(clubId).collection('proposedMatches').doc(s.matchId).get()).data() as ProposedMatch | undefined;
  if (m && m.status !== 'cancelled') await finalizeKeep(clubId, s, m);
}

/** El mostrador apaga la búsqueda (por ejemplo, si llueve). */
export async function stopSearch(clubId: string, searchId: string) {
  if (await endAutoSearch(clubId, searchId, 'stopped')) return;
  await searchRef(clubId, searchId).update({ status: 'cancelled', updatedAt: now() });
  await expireOpenInvites(clubId, searchId);
}

// -----------------------------------------------------------------------------
// Utilidades
// -----------------------------------------------------------------------------

async function addNoShow(clubId: string, uid: string) {
  if (isFakePlayer(uid) && !uid.startsWith('demo-')) return;
  const cRef = clubRef(clubId);
  const club = (await cRef.get()).data() as Club;
  const ref = cRef.collection('memberships').doc(uid);
  await db.runTransaction(async (tx) => {
    const ms = await tx.get(ref);
    if (!ms.exists) return;
    const n = ((ms.get('noShowCount') as number) ?? 0) + 1;
    tx.update(ref, { noShowCount: n, blocked: n >= (club.maxNoShowsBeforeBlock ?? 99), updatedAt: now() });
  });
}

async function notifyPlayers(
  clubId: string,
  uids: string[],
  msg: { title: string; body: string; eventType?: 'fill_update' | 'match_confirmed' | 'booking_cancelled'; email?: boolean }
) {
  await Promise.all(
    uids.map((u) => notify({ clubId, recipientUid: u, eventType: msg.eventType ?? 'fill_update', title: msg.title, body: msg.body }))
  );
}

/** Al terminar el turno, el registro de recuperado cuenta o se anula (para el informe mensual). */
export async function settleRecoveries(clubId: string, nowDate = new Date()) {
  const cRef = clubRef(clubId);
  const snap = await cRef.collection('recoveries').where('status', '==', 'pending').get();
  let n = 0;
  for (const d of snap.docs) {
    const r = d.data() as RecoveryRecord;
    if (slotStart(r.date, r.endMinute).getTime() > nowDate.getTime()) continue;
    const b = (await cRef.collection('bookings').doc(r.bookingId).get()).data() as Booking | undefined;
    const voidReason = !b ? 'reserva borrada' : b.status === 'cancelled' ? 'cancelado' : b.status === 'no_show' ? 'ausente' : !b.playerUids?.includes(r.filledByUid) ? 'el que entró se bajó' : '';
    await d.ref.update({ status: voidReason ? 'voided' : 'counted', voidReason });
    n++;
  }
  return n;
}


// -----------------------------------------------------------------------------
// Link para compartir un "Falta uno" (16/11/2026, propuesta de mejoras de diferenciación)
// -----------------------------------------------------------------------------

/** Lo que ve cualquiera que abre el link, sin cuenta: nada de nombres ni fotos de los jugadores. */
export interface PublicFillLink {
  status: 'open' | 'filled' | 'closed';
  clubName: string;
  clubAddress: string;
  clubCity: string;
  mapsQuery: string;
  date: string;
  startMinute: number;
  endMinute: number;
  courtName: string;
  modality: string;
  seatsLeft: number;
  minCategory: number;
  maxCategory: number;
  pricePerPlayer: number;
}

/** Categorías que entran en el partido: cualquiera que respete la diferencia máxima del club con los que ya están. */
function categoryWindow(cats: number[], clubGap: number): { min: number; max: number } {
  if (!cats.length) return { min: 1, max: 7 };
  return { min: Math.max(1, Math.max(...cats) - clubGap), max: Math.min(7, Math.min(...cats) + clubGap) };
}

export async function publicFillLink(clubId: string, searchId: string, nowDate = new Date()): Promise<PublicFillLink | null> {
  const cRef = clubRef(clubId);
  const [clubSnap, sSnap] = await Promise.all([cRef.get(), searchRef(clubId, searchId).get()]);
  if (!clubSnap.exists || !sSnap.exists) return null;
  const club = clubSnap.data() as Club;
  const s = sSnap.data() as FillSearch;
  const mSnap = await cRef.collection('proposedMatches').doc(s.matchId).get();
  const m = mSnap.data() as ProposedMatch | undefined;
  const win = categoryWindow((m?.slots ?? []).map((x) => x.category), club.fillMaxGap ?? 1);
  const open = s.status === 'searching' && s.seatsFilled < s.seatsNeeded && s.closesAt > nowDate.toISOString() && m?.status !== 'cancelled';
  const address = [club.address, club.city].filter(Boolean).join(', ');
  return {
    status: open ? 'open' : s.status === 'filled' ? 'filled' : 'closed',
    clubName: club.name,
    clubAddress: club.address ?? '',
    clubCity: club.city ?? '',
    mapsQuery: club.lat && club.lng ? `${club.lat},${club.lng}` : `${club.name}, ${address}`,
    date: s.date,
    startMinute: s.startMinute,
    endMinute: s.endMinute,
    courtName: s.courtName,
    modality: s.modality,
    seatsLeft: Math.max(0, s.seatsNeeded - s.seatsFilled),
    minCategory: win.min,
    maxCategory: win.max,
    pricePerPlayer: s.pricePerPlayer,
  };
}

export type LinkClaimResult = ClaimResult | 'category' | 'gender' | 'blocked' | 'already_in' | 'left';

/**
 * "Quiero jugar" desde el link: mismas reglas de categoría, género y bloqueo que los avisos, pero sin
 * mirar la disponibilidad semanal ni el tope de avisos (la persona lo pidió). Entra el primero que confirma.
 */
export async function claimFromLink(p: { clubId: string; searchId: string; uid: string; nowDate?: Date }): Promise<LinkClaimResult> {
  const nowDate = p.nowDate ?? new Date();
  const cRef = clubRef(p.clubId);
  const [sSnap, memberSnap, clubSnap, userSnap] = await Promise.all([
    searchRef(p.clubId, p.searchId).get(),
    cRef.collection('memberships').doc(p.uid).get(),
    cRef.get(),
    db.doc(`users/${p.uid}`).get(),
  ]);
  if (!sSnap.exists) return 'closed';
  const member = memberSnap.data() as ClubMembership | undefined;
  if (!member) throw new HttpsError('permission-denied', 'No sos jugador de este club.');
  if (member.blocked) return 'blocked';
  const s = sSnap.data() as FillSearch;
  if (s.status !== 'searching' || s.seatsFilled >= s.seatsNeeded) return s.status === 'filled' ? 'late' : 'closed';
  if (s.closesAt <= nowDate.toISOString()) return 'closed';
  const m = (await cRef.collection('proposedMatches').doc(s.matchId).get()).data() as ProposedMatch | undefined;
  if (!m || m.status === 'cancelled') return 'closed';
  if (m.playerUids.includes(p.uid)) return 'already_in';
  // El que se bajó de este partido no vuelve a entrar por el link.
  if (s.excludedUids.includes(p.uid)) return 'left';
  if (!genderFits(s.modality, s.genderNeeded, member.gender)) return 'gender';
  const club = clubSnap.data() as Club;
  const users = await getAllChunked(m.slots.map((x) => db.doc(`users/${x.uid}`)));
  const gapOf = new Map(users.map((u) => [u.id, prefsOf(u.get('alertPrefs')).maxCategoryGap]));
  const current: CurrentPlayer[] = m.slots.map((x) => ({ uid: x.uid, category: x.category, gap: gapOf.get(x.uid) ?? 1 }));
  const own = prefsOf(userSnap.get('alertPrefs')).maxCategoryGap;
  // Si el jugador eligió "solo mi categoría" igual puede sumarse por link a ±1: lo pidió él.
  if (!categoryFits(member.category, Math.max(own, 1), club.fillMaxGap ?? 1, current)) return 'category';

  // Invitación propia del link (no cuenta para el tope) para usar la misma carrera que los avisos.
  const iRef = inviteRef(p.clubId, p.searchId, p.uid);
  await db.runTransaction(async (tx) => {
    const is = await tx.get(iRef);
    if (is.exists && (is.data() as FillInvite).status === 'sent') return;
    if (is.exists && (is.data() as FillInvite).status === 'won') return;
    const inv: FillInvite = {
      id: `${p.searchId}_${p.uid}`,
      clubId: p.clubId,
      searchId: p.searchId,
      uid: p.uid,
      wave: 0,
      date: s.date,
      startMinute: s.startMinute,
      endMinute: s.endMinute,
      courtName: s.courtName,
      pricePerPlayer: s.pricePerPlayer,
      status: 'sent',
      countsForCap: false,
      sentAt: nowDate.toISOString(),
      via: 'link',
    };
    tx.set(iRef, { ...inv, createdAt: now() });
  });
  return claimSeat({ clubId: p.clubId, searchId: p.searchId, uid: p.uid, nowDate });
}
