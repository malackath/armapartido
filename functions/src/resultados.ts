// Resultados con confirmación del rival y categoría sugerida al club (etapa 6a; decisiones 4.1 y 4.2 de Ber, 17/11/2026).
// Uno de los 4 carga, uno de la otra pareja confirma en 48 h. Sin confirmar no cuenta.
// Con los confirmados (y los torneos del club) la app le sugiere al club subir o bajar a alguien; el club decide.
import { HttpsError } from 'firebase-functions/v2/https';
import type { Booking, CategorySuggestion, ClubMembership, MatchResult, Tournament } from '../../src/types/padel';
import { formatCategory, formatDateFriendly, formatMinutes } from '../../src/lib/padelUtils';
import { REGLAS_CATEGORIA, suggestCategory, type MyResult } from '../../src/lib/resultados';
import { db, now } from './admin';
import { notify } from './notify';

const results = (clubId: string) => db.collection(`clubs/${clubId}/matchResults`);
const suggestions = (clubId: string) => db.collection(`clubs/${clubId}/categorySuggestions`);

function bookingEnd(b: Pick<Booking, 'date' | 'endMinute'>): Date {
  const d = new Date(`${b.date}T00:00:00`);
  d.setMinutes(b.endMinute);
  return d;
}

const firstName = (n: string) => (n || 'Alguien').split(' ')[0];

export async function reportResult(p: {
  clubId: string;
  uid: string;
  bookingId: string;
  winner: 'A' | 'B';
  score: string;
  /** Solo si la reserva no trae equipos: con quién jugó el que carga. */
  partnerUid?: string;
  nowDate?: Date;
}): Promise<MatchResult> {
  const nowDate = p.nowDate ?? new Date();
  const cRef = db.doc(`clubs/${p.clubId}`);
  const b = (await cRef.collection('bookings').doc(p.bookingId).get()).data() as Booking | undefined;
  if (!b || b.status !== 'confirmed') throw new HttpsError('not-found', 'No encontramos ese partido.');
  const uids = [...new Set(b.playerUids ?? [])];
  if (uids.length !== 4) throw new HttpsError('failed-precondition', 'El resultado se carga en partidos de 4 con los 4 en la app.');
  if (!uids.includes(p.uid)) throw new HttpsError('permission-denied', 'Solo los que jugaron pueden cargar el resultado.');
  const end = bookingEnd(b);
  if (end > nowDate) throw new HttpsError('failed-precondition', 'El partido todavía no terminó.');
  if (nowDate.getTime() - end.getTime() > REGLAS_CATEGORIA.diasParaCargar * 864e5) {
    throw new HttpsError('failed-precondition', `Los resultados se cargan hasta ${REGLAS_CATEGORIA.diasParaCargar} días después del partido.`);
  }

  let teamA: string[];
  let teamB: string[];
  const fromBooking = b.teamA?.length === 2 && b.teamB?.length === 2 && [...b.teamA, ...b.teamB].every((u) => uids.includes(u));
  if (fromBooking) {
    teamA = b.teamA!;
    teamB = b.teamB!;
  } else {
    if (!p.partnerUid || p.partnerUid === p.uid || !uids.includes(p.partnerUid)) {
      throw new HttpsError('invalid-argument', 'Elegí con quién jugaste.');
    }
    teamA = [p.uid, p.partnerUid];
    teamB = uids.filter((u) => !teamA.includes(u));
  }

  const ref = results(p.clubId).doc(p.bookingId);
  const members = await Promise.all(uids.map((u) => cRef.collection('memberships').doc(u).get()));
  const names: Record<string, string> = {};
  members.forEach((m, i) => (names[uids[i]] = (m.get('displayName') as string) || 'Jugador'));

  const result: MatchResult = {
    id: p.bookingId,
    clubId: p.clubId,
    bookingId: p.bookingId,
    date: b.date,
    startMinute: b.startMinute,
    courtName: b.courtName,
    teamA,
    teamB,
    names,
    playerUids: uids,
    winner: p.winner,
    score: p.score.trim().slice(0, 40),
    reportedBy: p.uid,
    status: 'pending',
    expiresAt: new Date(nowDate.getTime() + REGLAS_CATEGORIA.horasParaConfirmar * 3600e3).toISOString(),
  };
  await db.runTransaction(async (tx) => {
    const cur = (await tx.get(ref)).data() as MatchResult | undefined;
    if (cur && (cur.status === 'pending' || cur.status === 'confirmed')) {
      throw new HttpsError('already-exists', `${firstName(cur.names?.[cur.reportedBy])} ya cargó el resultado de ese partido.`);
    }
    if (cur?.status === 'expired') throw new HttpsError('failed-precondition', 'Ese partido quedó sin resultado: pasaron 48 h sin confirmar.');
    tx.set(ref, { ...result, createdAt: now(), updatedAt: now() });
  });

  const mine = teamA.includes(p.uid) ? 'A' : 'B';
  const rivals = mine === 'A' ? teamB : teamA;
  const winners = (p.winner === 'A' ? teamA : teamB).map((u) => firstName(names[u])).join(' y ');
  await Promise.all(
    rivals.map((u) =>
      notify({
        clubId: p.clubId,
        recipientUid: u,
        eventType: 'match_confirmed',
        title: `Confirmá el resultado · ${formatDateFriendly(b.date, false)} ${formatMinutes(b.startMinute)}`,
        body: `${firstName(names[p.uid])} cargó: ganaron ${winners}${result.score ? `, ${result.score}` : ''}. ¿Es así? Tenés 48 h.`,
        tab: 'home',
      })
    )
  );
  return result;
}

export async function confirmResult(p: { clubId: string; uid: string; bookingId: string; agree: boolean; nowDate?: Date }): Promise<MatchResult['status']> {
  const nowDate = p.nowDate ?? new Date();
  const ref = results(p.clubId).doc(p.bookingId);
  const r = await db.runTransaction(async (tx) => {
    const cur = (await tx.get(ref)).data() as MatchResult | undefined;
    if (!cur) throw new HttpsError('not-found', 'No encontramos ese resultado.');
    if (cur.status !== 'pending') throw new HttpsError('failed-precondition', 'Ese resultado ya no espera confirmación.');
    if (new Date(cur.expiresAt) <= nowDate) throw new HttpsError('failed-precondition', 'Pasaron las 48 h para confirmar.');
    const reporterTeam = cur.teamA.includes(cur.reportedBy) ? cur.teamA : cur.teamB;
    const rivalTeam = reporterTeam === cur.teamA ? cur.teamB : cur.teamA;
    if (!rivalTeam.includes(p.uid)) throw new HttpsError('permission-denied', 'Lo confirma alguien de la otra pareja.');
    const status: MatchResult['status'] = p.agree ? 'confirmed' : 'disputed';
    tx.update(ref, { status, confirmedBy: p.uid, updatedAt: now() });
    return { ...cur, status };
  });

  if (r.status === 'disputed') {
    await notify({
      clubId: p.clubId,
      recipientUid: r.reportedBy,
      eventType: 'match_confirmed',
      title: 'El resultado no coincidió',
      body: `${firstName(r.names[p.uid])} dice que no fue así. No cuenta; pueden volver a cargarlo entre ustedes.`,
      tab: 'home',
    });
    return r.status;
  }
  // Confirmado: mirar si a alguno de los 4 hay que sugerirle otra categoría.
  for (const u of r.playerUids) await evaluateCategory(p.clubId, u).catch(() => undefined);
  return r.status;
}

/** El reloj vence los resultados sin confirmar. */
export async function expireResults(clubId: string, nowDate = new Date()): Promise<number> {
  const snap = await results(clubId).where('status', '==', 'pending').get();
  const old = snap.docs.filter((d) => new Date(d.get('expiresAt') as string) <= nowDate);
  await Promise.all(old.map((d) => d.ref.update({ status: 'expired', updatedAt: now() })));
  return old.length;
}

/** Los resultados confirmados de un jugador en el club (app + torneos), vistos desde él. */
export async function confirmedResultsOf(clubId: string, uid: string): Promise<MyResult[]> {
  const cRef = db.doc(`clubs/${clubId}`);
  const [mine, trn, mems] = await Promise.all([
    results(clubId).where('playerUids', 'array-contains', uid).get(),
    cRef.collection('tournaments').get(),
    cRef.collection('memberships').get(),
  ]);
  const cat = new Map(mems.docs.map((d) => [d.id, (d.data() as ClubMembership).category]));
  const out: MyResult[] = [];
  for (const d of mine.docs) {
    const r = d.data() as MatchResult;
    if (r.status !== 'confirmed') continue;
    const myTeam = r.teamA.includes(uid) ? 'A' : 'B';
    const rivals = myTeam === 'A' ? r.teamB : r.teamA;
    out.push({ date: r.date, won: r.winner === myTeam, rivalCats: rivals.map((u) => cat.get(u) ?? 7) });
  }
  for (const d of trn.docs) {
    const t = d.data() as Tournament;
    const myPair = (t.pairs ?? []).find((x) => x.player1Uid === uid || x.player2Uid === uid);
    if (!myPair) continue;
    for (const m of t.matches ?? []) {
      if (m.status !== 'completed' || (m.pair1Id !== myPair.id && m.pair2Id !== myPair.id)) continue;
      const rival = (t.pairs ?? []).find((x) => x.id === (m.pair1Id === myPair.id ? m.pair2Id : m.pair1Id));
      if (!rival) continue;
      out.push({ date: m.date, won: m.winnerPairId === myPair.id, rivalCats: [rival.player1Uid, rival.player2Uid].map((u) => cat.get(u) ?? 7) });
    }
  }
  return out;
}

/** Revisa a un jugador y, si corresponde, deja (o actualiza) la sugerencia para el club. */
export async function evaluateCategory(clubId: string, uid: string): Promise<CategorySuggestion | null> {
  const member = (await db.doc(`clubs/${clubId}/memberships/${uid}`).get()).data() as ClubMembership | undefined;
  if (!member || member.role !== 'player') return null;
  const all = await confirmedResultsOf(clubId, uid);
  const ref = suggestions(clubId).doc(uid);
  const prev = (await ref.get()).data() as CategorySuggestion | undefined;
  let pool = all;
  if (prev && prev.status !== 'pending') {
    const since = prev.resultsAtDecision ?? 0;
    if (prev.status === 'rejected' && all.length < since + REGLAS_CATEGORIA.esperaTrasNo) return null;
    // Después de un cambio aceptado, solo cuentan los partidos jugados en la categoría nueva.
    if (prev.status === 'accepted') pool = [...all].sort((a, b) => b.date.localeCompare(a.date)).slice(0, Math.max(0, all.length - since));
  }
  const s = suggestCategory(member.category, pool);
  if (!s) {
    if (prev?.status === 'pending') await ref.delete(); // ya no aplica
    return null;
  }
  const next: CategorySuggestion = {
    id: uid,
    clubId,
    uid,
    displayName: member.displayName,
    from: member.category,
    to: s.to,
    reason: s.reason,
    status: 'pending',
    resultsAtDecision: prev?.resultsAtDecision,
  };
  await ref.set({ ...next, resultsAtDecision: prev?.resultsAtDecision ?? 0, createdAt: now(), updatedAt: now() });
  return next;
}

/** El club dice Sí o No a una sugerencia. */
export async function decideSuggestion(p: { clubId: string; byUid: string; uid: string; accept: boolean }): Promise<void> {
  const ref = suggestions(p.clubId).doc(p.uid);
  const s = (await ref.get()).data() as CategorySuggestion | undefined;
  if (!s || s.status !== 'pending') throw new HttpsError('not-found', 'Esa sugerencia ya no está.');
  const count = (await confirmedResultsOf(p.clubId, p.uid)).length;
  await ref.update({ status: p.accept ? 'accepted' : 'rejected', resultsAtDecision: count, decidedBy: p.byUid, updatedAt: now() });
  if (!p.accept) return;
  const club = (await db.doc(`clubs/${p.clubId}`).get()).get('name') as string;
  await db.doc(`clubs/${p.clubId}/memberships/${p.uid}`).update({ category: s.to, categoryReview: 'ok', updatedAt: now() });
  await notify({
    clubId: p.clubId,
    recipientUid: p.uid,
    eventType: 'category_changed',
    title: `${s.to < s.from ? 'Subiste' : 'Pasaste'} a ${formatCategory(s.to)}`,
    body: `${club || 'Tu club'} te cambió de categoría. Desde ahora la app te arma partidos de ${formatCategory(s.to)}.`,
  });
}
