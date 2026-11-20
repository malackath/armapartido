// Pareja fija sin torneo (20/11/2026). La pareja guarda sus horarios y el servidor le mantiene
// un pedido semanal por cada ventana; el motor de siempre (planificador) arma el partido contra
// otra pareja o dos sueltos. Lógica de qué pedidos tiene que haber: src/lib/parejaFija.ts.
import { HttpsError } from 'firebase-functions/v2/https';
import type { AvailabilityWindow, FixedPair, MatchRequest, ProposedMatch } from '../../src/types/padel';
import { cleanCells, MAX_PAREJAS, pairModality, planPairSync, sharedCells, windowKey, type PairRequest } from '../../src/lib/parejaFija';
import { getTodayISO } from '../../src/lib/padelUtils';
import { db, isFakePlayer, makeId, now } from './admin';
import { sweepClub } from './engine';
import { notify } from './notify';

const ms = (v: unknown): number => {
  const t = v as { toMillis?: () => number } | undefined;
  return typeof t?.toMillis === 'function' ? t.toMillis() : typeof v === 'number' ? v : 0;
};

async function clubName(clubId: string): Promise<string> {
  return ((await db.doc(`clubs/${clubId}`).get()).get('name') as string) || 'tu club';
}

async function loadPair(clubId: string, pairId: string, uid: string) {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(pairId)) throw new HttpsError('invalid-argument', 'Pareja inválida.');
  const ref = db.doc(`clubs/${clubId}/fixedPairs/${pairId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Esa pareja ya no existe.');
  const pair = snap.data() as FixedPair;
  if (!pair.uids.includes(uid)) throw new HttpsError('permission-denied', 'No sos parte de esta pareja.');
  return { ref, pair };
}

/** Invita a otro jugador del club a ser pareja fija. Si es un jugador de la demo sin cuenta, queda aceptada. */
export async function invitePair(clubId: string, uid: string, partnerUid: string): Promise<FixedPair> {
  if (!partnerUid || partnerUid === uid) throw new HttpsError('invalid-argument', 'Elegí a otro jugador.');
  const [meM, partnerM, meU, partnerU] = await Promise.all([
    db.doc(`clubs/${clubId}/memberships/${uid}`).get(),
    db.doc(`clubs/${clubId}/memberships/${partnerUid}`).get(),
    db.doc(`users/${uid}`).get(),
    isFakePlayer(partnerUid) ? Promise.resolve(null) : db.doc(`users/${partnerUid}`).get(),
  ]);
  if (!meM.exists) throw new HttpsError('permission-denied', 'No sos jugador de este club.');
  if (!partnerM.exists || partnerM.get('role') !== 'player') throw new HttpsError('not-found', 'Ese jugador no está en el club.');

  const myCat = Number(meU.get('category') ?? meM.get('category'));
  const partnerCat = Number(partnerM.get('category') ?? partnerU?.get('category'));
  if (Math.abs(myCat - partnerCat) > 1) {
    throw new HttpsError('failed-precondition', 'Para jugar juntos tienen que estar a una categoría o menos: si no, la app no encuentra partidos parejos para los dos.');
  }

  const col = db.collection(`clubs/${clubId}/fixedPairs`);
  const [mine, theirs] = await Promise.all([col.where('uids', 'array-contains', uid).get(), col.where('uids', 'array-contains', partnerUid).get()]);
  const alive = mine.docs.map((d) => d.data() as FixedPair).filter((p) => p.status !== 'ended');
  if (alive.some((p) => p.uids.includes(partnerUid))) throw new HttpsError('already-exists', 'Ya tenés una pareja fija con ese jugador.');
  if (alive.length >= MAX_PAREJAS) throw new HttpsError('failed-precondition', `Podés tener hasta ${MAX_PAREJAS} parejas fijas. Terminá alguna para sumar otra.`);
  if (theirs.docs.filter((d) => d.get('status') !== 'ended').length >= MAX_PAREJAS) {
    throw new HttpsError('failed-precondition', 'Ese jugador ya tiene muchas parejas fijas.');
  }

  const myName = (meU.get('displayName') as string) || (meM.get('displayName') as string) || 'Jugador';
  const partnerName = (partnerU?.get('displayName') as string) || (partnerM.get('displayName') as string) || 'Jugador';
  const myAvail = (meU.get('weeklyAvailability') ?? meM.get('weeklyAvailability') ?? []) as AvailabilityWindow[];
  const partnerAvail = (partnerU?.get('weeklyAvailability') ?? partnerM.get('weeklyAvailability') ?? []) as AvailabilityWindow[];
  // "Prefiero no" es privado: si el invitado no quiere jugar con quien invita, la invitación queda
  // creada pero no le llega (nadie se entera, como en el resto del armado).
  const avoided = ((partnerU?.get('avoidUids') as string[] | undefined) ?? []).includes(uid);
  const fake = isFakePlayer(partnerUid);

  const id = makeId('pair');
  const pair: FixedPair = {
    id,
    clubId,
    uids: [uid, partnerUid],
    names: { [uid]: myName, [partnerUid]: partnerName },
    creatorUid: uid,
    status: fake ? 'active' : 'pending',
    cells: sharedCells(myAvail, partnerAvail),
    modality: pairModality(String(meU.get('gender') ?? meM.get('gender')), String(partnerU?.get('gender') ?? partnerM.get('gender'))),
    searching: true,
    perWeek: 1,
  };
  await col.doc(id).set({ ...pair, createdAt: now(), updatedAt: now() });
  if (!fake && !avoided) {
    await notify({
      clubId,
      recipientUid: partnerUid,
      eventType: 'pair_invite',
      title: `Pareja fija · ${await clubName(clubId)}`,
      body: `${myName} te invitó a ser su pareja fija. Aceptá en tu perfil y la app les busca rivales todas las semanas.`,
      tab: 'profile',
    });
  }
  if (fake) await syncPair(clubId, id, uid);
  return pair;
}

/** El invitado acepta o rechaza. */
export async function answerPair(clubId: string, pairId: string, uid: string, accept: boolean): Promise<FixedPair> {
  const { ref, pair } = await loadPair(clubId, pairId, uid);
  if (pair.status !== 'pending') throw new HttpsError('failed-precondition', 'Esta invitación ya se contestó.');
  if (pair.creatorUid === uid) throw new HttpsError('permission-denied', 'La tiene que contestar tu pareja.');
  const next: Partial<FixedPair> = accept ? { status: 'active' } : { status: 'ended', endedReason: 'rechazada', searching: false };
  await ref.update({ ...next, updatedAt: now() });
  if (accept) {
    await notify({
      clubId,
      recipientUid: pair.creatorUid,
      eventType: 'pair_invite',
      title: `${pair.names[uid] ?? 'Tu pareja'} aceptó ser tu pareja fija`,
      body: 'Ya les estamos buscando rivales en los horarios que pueden los dos.',
      tab: 'profile',
    });
    await syncPair(clubId, pairId, uid);
  }
  return { ...pair, ...next };
}

/** Cualquiera de los dos cambia horarios, tope por semana o apaga la búsqueda. */
export async function savePair(
  clubId: string,
  pairId: string,
  uid: string,
  changes: { cells?: unknown; searching?: unknown; perWeek?: unknown; modality?: unknown }
): Promise<FixedPair> {
  const { ref, pair } = await loadPair(clubId, pairId, uid);
  if (pair.status === 'ended') throw new HttpsError('failed-precondition', 'Esta pareja ya terminó.');
  const next: Partial<FixedPair> = {};
  if (changes.cells !== undefined) next.cells = cleanCells(changes.cells);
  if (typeof changes.searching === 'boolean') next.searching = changes.searching;
  if (changes.perWeek === 0 || changes.perWeek === 1 || changes.perWeek === 2) next.perWeek = changes.perWeek;
  if (changes.modality === 'masculino' || changes.modality === 'femenino' || changes.modality === 'mixto') next.modality = changes.modality;
  await ref.update({ ...next, updatedAt: now() });
  const merged = { ...pair, ...next };
  if (merged.status === 'active') await syncPair(clubId, pairId, uid);
  return merged;
}

/** Terminar la pareja (cualquiera de los dos). Los partidos ya propuestos siguen su curso. */
export async function endPair(clubId: string, pairId: string, uid: string): Promise<void> {
  const { ref, pair } = await loadPair(clubId, pairId, uid);
  if (pair.status === 'ended') return;
  await ref.update({ status: 'ended', endedReason: 'terminada', searching: false, updatedAt: now() });
  await syncPair(clubId, pairId, uid);
  const other = pair.uids.find((u) => u !== uid)!;
  if (pair.status === 'active' && !isFakePlayer(other)) {
    await notify({
      clubId,
      recipientUid: other,
      eventType: 'pair_invite',
      title: 'Pareja fija terminada',
      body: `${pair.names[uid] ?? 'Tu pareja'} terminó la pareja fija. Los partidos ya armados siguen en pie.`,
      tab: 'profile',
    });
  }
}

/**
 * Deja los pedidos semanales de la pareja como tienen que estar (crea, cierra) y prueba armar.
 * Devuelve cuántos pedidos creó. La corren las callables y el reloj (cada 10 minutos).
 */
export async function syncPair(clubId: string, pairId: string, actorUid: string, opts: { sweep?: boolean } = {}): Promise<number> {
  const clubRef = db.doc(`clubs/${clubId}`);
  const pairRef = clubRef.collection('fixedPairs').doc(pairId);
  const snap = await pairRef.get();
  if (!snap.exists) return 0;
  const pair = snap.data() as FixedPair;
  const reqsCol = clubRef.collection('matchRequests');
  const today = getTodayISO();

  const [pairReqsSnap, ...otherSnaps] = await Promise.all([
    reqsCol.where('fixedPairId', '==', pairId).get(),
    ...pair.uids.filter((u) => !isFakePlayer(u)).flatMap((u) => [reqsCol.where('creatorUid', '==', u).get(), reqsCol.where('partnerUid', '==', u).get()]),
  ]);
  const pairReqs = pairReqsSnap.docs.map((d) => ({ ...(d.data() as MatchRequest), updatedAtMs: ms(d.get('updatedAt')) }));
  const otherOpen = otherSnaps
    .flatMap((q) => q.docs.map((d) => d.data() as MatchRequest))
    .filter((r) => r.fixedPairId !== pairId && (r.status === 'waiting' || r.status === 'proposed') && (r.requestType === 'weekly' || r.date >= today));

  // Partidos de esta pareja (para el tope por semana): propuestas vivas o confirmadas desde el lunes.
  const pmSnap = await clubRef.collection('proposedMatches').where('date', '>=', addDays(today, -7)).get();
  const pairReqIds = new Set(pairReqs.map((r) => r.id));
  const matchDates = pmSnap.docs
    .map((d) => d.data() as ProposedMatch)
    .filter((m) => (m.status === 'pending' || m.status === 'confirmed') && m.slots.some((s) => pairReqIds.has(s.requestId)))
    .map((m) => m.date);

  const plan = planPairSync({
    pair,
    requests: pairReqs.map((r): PairRequest => ({ id: r.id, status: r.status, windowKey: r.windowKey, closedReason: r.closedReason, updatedAtMs: r.updatedAtMs })),
    matchDates,
    otherOpen,
    now: new Date(),
  });

  const batch = db.batch();
  for (const id of plan.cancel) batch.update(reqsCol.doc(id), { status: 'cancelled', closedReason: 'pareja', updatedAt: now() });
  const [a, b] = pair.uids;
  const [ua, ma] = await Promise.all([db.doc(`users/${a}`).get(), db.doc(`clubs/${clubId}/memberships/${a}`).get()]);
  const category = Number(ua.get('category') ?? ma.get('category') ?? 5);
  for (const w of plan.create) {
    const id = makeId('mreq');
    const r: MatchRequest = {
      id,
      clubId,
      clubIds: [clubId],
      creatorUid: a,
      creatorName: pair.names[a] ?? 'Jugador',
      partnerUid: b,
      partnerName: pair.names[b] ?? 'Pareja',
      partnerAccepted: true,
      category,
      modality: pair.modality,
      requestType: 'weekly',
      date: '',
      dayOfWeek: w.dayOfWeek,
      startMinute: w.startMinute,
      endMinute: w.endMinute,
      isSameDay: false,
      status: 'waiting',
      unfilledAlertSent: false,
      fixedPairId: pairId,
      windowKey: windowKey(w),
    };
    batch.set(reqsCol.doc(id), { ...r, createdAt: now(), updatedAt: now() });
  }
  const clashes = plan.clashes.map(windowKey);
  if (JSON.stringify(clashes) !== JSON.stringify(pair.clashes ?? [])) batch.update(pairRef, { clashes });
  if (plan.cancel.length || plan.create.length || clashes.length !== (pair.clashes ?? []).length) await batch.commit();
  if (plan.create.length && opts.sweep !== false) await sweepClub(clubId, actorUid);
  return plan.create.length;
}

/** Para el reloj: todas las parejas activas que buscan en un club. */
export async function syncClubPairs(clubId: string): Promise<number> {
  const snap = await db.collection(`clubs/${clubId}/fixedPairs`).where('status', '==', 'active').get();
  let created = 0;
  for (const d of snap.docs) {
    try {
      created += await syncPair(clubId, d.id, 'system_pareja', { sweep: false });
    } catch {
      // Una pareja con datos raros no frena a las demás.
    }
  }
  if (created) await sweepClub(clubId, 'system_pareja');
  return created;
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

