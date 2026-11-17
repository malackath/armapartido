// Suplente de guardia (etapa 4 del algoritmo, decisión 4.5 de Ber, 17/11/2026).
// Un jugador se ofrece para un día y una franja: "si se baja alguien, contá conmigo".
// Cuando a un partido le falta uno en ese horario, el suplente entra directo, antes de la tanda
// general de avisos, si cumple las mismas reglas (categoría, género, no ocupado, no se bajó de ese partido).
import { HttpsError } from 'firebase-functions/v2/https';
import type { Booking, Club, ClubMembership, FillInvite, FillSearch, ProposedMatch, Standby } from '../../src/types/padel';
import { busyUidsAt, formatDateFriendly, formatMinutes, getTodayISO } from '../../src/lib/padelUtils';
import { db, makeId, now } from './admin';
import { notify } from './notify';
import { categoryFits, genderFits, prefsOf } from './fillRules';
import { claimSeat } from './fill';

const standbys = (clubId: string) => db.collection(`clubs/${clubId}/standbys`);

export async function offerStandby(p: { clubId: string; uid: string; date: string; startMinute: number; endMinute: number }): Promise<Standby> {
  if (p.date < getTodayISO()) throw new HttpsError('invalid-argument', 'Ese día ya pasó.');
  if (p.endMinute - p.startMinute < 90) throw new HttpsError('invalid-argument', 'La franja tiene que cubrir al menos un turno (90 minutos).');
  const member = (await db.doc(`clubs/${p.clubId}/memberships/${p.uid}`).get()).data() as ClubMembership | undefined;
  if (!member) throw new HttpsError('permission-denied', 'No sos jugador de este club.');
  const mine = (await standbys(p.clubId).where('uid', '==', p.uid).get()).docs.map((d) => d.data() as Standby);
  const clash = mine.find((x) => x.status === 'active' && x.date === p.date && x.startMinute < p.endMinute && x.endMinute > p.startMinute);
  if (clash) {
    throw new HttpsError(
      'already-exists',
      `Ya estás de suplente ${formatDateFriendly(clash.date, false)} de ${formatMinutes(clash.startMinute)} a ${formatMinutes(clash.endMinute)}.`
    );
  }
  const sb: Standby = {
    id: makeId('sb'),
    clubId: p.clubId,
    uid: p.uid,
    displayName: member.displayName,
    category: member.category,
    date: p.date,
    startMinute: p.startMinute,
    endMinute: p.endMinute,
    status: 'active',
  };
  await standbys(p.clubId).doc(sb.id).set({ ...sb, createdAt: now(), updatedAt: now() });
  return sb;
}

export async function cancelStandby(p: { clubId: string; uid: string; id: string }) {
  const ref = standbys(p.clubId).doc(p.id);
  const s = (await ref.get()).data() as Standby | undefined;
  if (!s || s.uid !== p.uid) throw new HttpsError('not-found', 'No encontramos esa guardia.');
  if (s.status === 'active') await ref.update({ status: 'cancelled', updatedAt: now() });
}

/**
 * Antes de la primera tanda de una búsqueda de reemplazo: entran los suplentes de guardia que sirven,
 * en el orden en que se ofrecieron. Devuelve cuántos entraron.
 */
export async function tryStandbys(clubId: string, searchId: string, nowDate = new Date()): Promise<number> {
  const cRef = db.doc(`clubs/${clubId}`);
  const s = (await cRef.collection('fillSearches').doc(searchId).get()).data() as FillSearch | undefined;
  if (!s || s.status !== 'searching' || s.kind === 'free_slot') return 0;
  const offered = (await standbys(clubId).where('date', '==', s.date).get()).docs
    .map((d) => d.data() as Standby)
    .filter((x) => x.status === 'active' && x.startMinute <= s.startMinute && x.endMinute >= s.endMinute)
    .sort((a, b) => a.id.localeCompare(b.id)); // el id empieza con la hora: primero el que se ofreció antes
  if (!offered.length) return 0;

  const [clubSnap, bookingsSnap, pendingSnap] = await Promise.all([
    cRef.get(),
    cRef.collection('bookings').where('date', '==', s.date).get(),
    cRef.collection('proposedMatches').where('date', '==', s.date).get(),
  ]);
  const club = clubSnap.data() as Club;
  const busy = busyUidsAt(
    bookingsSnap.docs.map((d) => ({ ...(d.data() as Booking), id: d.id })).filter((b) => b.id !== s.bookingId),
    pendingSnap.docs.map((d) => ({ ...(d.data() as ProposedMatch), id: d.id })).filter((m) => m.id !== s.matchId),
    s.date,
    s.startMinute,
    s.endMinute
  );
  let entered = 0;
  for (const sb of offered) {
    const fresh = (await cRef.collection('fillSearches').doc(searchId).get()).data() as FillSearch;
    if (fresh.status !== 'searching' || fresh.seatsFilled >= fresh.seatsNeeded) break;
    if (busy.has(sb.uid) || fresh.excludedUids.includes(sb.uid) || fresh.filledUids.includes(sb.uid)) continue;
    const m = (await cRef.collection('proposedMatches').doc(s.matchId).get()).data() as ProposedMatch | undefined;
    if (!m || m.playerUids.includes(sb.uid)) continue;
    const member = (await cRef.collection('memberships').doc(sb.uid).get()).data() as ClubMembership | undefined;
    if (!member || member.blocked) continue;
    if (!genderFits(s.modality, s.genderNeeded, member.gender)) continue;
    const prefs = prefsOf((await db.doc(`users/${sb.uid}`).get()).get('alertPrefs'));
    const current = m.slots.map((x) => ({ uid: x.uid, category: x.category, gap: 1 }));
    if (!categoryFits(member.category, prefs.maxCategoryGap, club.fillMaxGap ?? 1, current)) continue;

    // Entra por el mismo camino que "Me sumo" (misma transacción y controles), con una invitación de guardia.
    const inv: FillInvite = {
      id: `${searchId}_${sb.uid}`,
      clubId,
      searchId,
      uid: sb.uid,
      wave: 0,
      date: s.date,
      startMinute: s.startMinute,
      endMinute: s.endMinute,
      courtName: s.courtName,
      pricePerPlayer: s.pricePerPlayer,
      status: 'sent',
      countsForCap: false,
      sentAt: nowDate.toISOString(),
      via: 'guardia',
    };
    await cRef.collection('fillInvites').doc(inv.id).set({ ...inv, createdAt: now(), updatedAt: now() });
    const r = await claimSeat({ clubId, searchId, uid: sb.uid, nowDate });
    if (r !== 'won') {
      await cRef.collection('fillInvites').doc(inv.id).update({ status: 'expired', updatedAt: now() });
      continue;
    }
    entered++;
    await standbys(clubId).doc(sb.id).update({ status: 'used', matchId: s.matchId, updatedAt: now() });
    await notify({
      clubId,
      recipientUid: sb.uid,
      eventType: 'fill_invite',
      title: `Entraste de suplente · ${formatDateFriendly(s.date, false)} ${formatMinutes(s.startMinute)}`,
      body: `Se bajó alguien y entraste vos, como pediste. ${s.courtName}, tu parte: $${s.pricePerPlayer}. Si no podés, tocá "No puedo ir".`,
    });
  }
  return entered;
}

/** El reloj vence las guardias de días que ya pasaron. */
export async function expireStandbys(clubId: string, todayISO: string): Promise<number> {
  const old = (await standbys(clubId).where('date', '<', todayISO).get()).docs.filter((d) => d.get('status') === 'active');
  await Promise.all(old.map((d) => d.ref.update({ status: 'expired', updatedAt: now() })));
  return old.length;
}
