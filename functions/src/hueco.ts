// "Llenar un turno libre con un toque" (16/11/2026, parte 2 de la propuesta de diferenciación).
// El mostrador toca un hueco de la grilla y el servidor avisa por tandas a los jugadores que dijeron que
// pueden a esa hora (mismo motor y mismos topes que el "Falta uno"). Cuando confirman los 4, la reserva queda
// confirmada y el informe lo cuenta como "turno libre que se llenó".
import { HttpsError } from 'firebase-functions/v2/https';
import type { Booking, Club, ClubMembership, FillSearch, MatchRequest, Modality, ProposedMatch } from '../../src/types/padel';
import { calculateSlotPrice } from '../../src/lib/padelUtils';
import { db, isFakePlayer, makeId, now } from './admin';
import { claimSeat, runWave } from './fill';
import { CHOICE_DEADLINE_MINUTES, MIN_LEAD_MINUTES, bestCategoryWindow, minutesUntil, prefsOf, rankCandidates, searchTiming, slotStart, type InviteCounter } from './fillRules';

const MODALITIES: Modality[] = ['masculino', 'femenino', 'mixto'];
export const DISCOUNTS = [0, 10, 20, 30] as const;

export interface FreeSlotOption {
  modality: Modality;
  /** Jugadores que pueden a esa hora, dentro de la mejor ventana de categorías. */
  count: number;
  minCategory: number;
  maxCategory: number;
}

export interface FreeSlotPreview {
  free: boolean;
  reason: '' | 'taken' | 'too_late' | 'quiet';
  price: number;
  options: FreeSlotOption[];
  suggested: Modality;
}

const clubRef = (clubId: string) => db.doc(`clubs/${clubId}`);

function overlaps(b: Booking, start: number, end: number) {
  return b.status !== 'cancelled' && b.status !== 'no_show' && b.startMinute < end && b.endMinute > start;
}

async function loadContext(clubId: string, date: string) {
  const cRef = clubRef(clubId);
  const [clubSnap, membersSnap, bookingsSnap, reqSnap] = await Promise.all([
    cRef.get(),
    cRef.collection('memberships').get(),
    cRef.collection('bookings').where('date', '==', date).get(),
    cRef.collection('matchRequests').where('status', '==', 'waiting').get(),
  ]);
  if (!clubSnap.exists) throw new HttpsError('not-found', 'Club inexistente.');
  const club = { ...(clubSnap.data() as Club), id: clubId };
  const members = membersSnap.docs.map((d) => d.data() as ClubMembership);
  const users = members.length ? await db.getAll(...members.map((m) => db.doc(`users/${m.uid}`))) : [];
  return {
    club,
    members,
    bookings: bookingsSnap.docs.map((d) => d.data() as Booking),
    requests: reqSnap.docs.map((d) => d.data() as MatchRequest),
    prefsByUid: new Map(users.map((u) => [u.id, prefsOf(u.get('alertPrefs'))])),
    counters: new Map(users.map((u) => [u.id, u.get('fillCounter') as InviteCounter | undefined])),
  };
}

/** Candidatos para un turno libre con una modalidad, sin ventana de categoría (para elegir la mejor). */
function candidatesFor(ctx: Awaited<ReturnType<typeof loadContext>>, p: { date: string; startMinute: number; endMinute: number; modality: Modality; nowDate: Date; window?: { min: number; max: number } }) {
  const search = {
    date: p.date,
    startMinute: p.startMinute,
    endMinute: p.endMinute,
    modality: p.modality,
    genderNeeded: '',
    excludedUids: [],
    invitedUids: [],
    filledUids: [],
    ...(p.window ? { minCategory: p.window.min, maxCategory: p.window.max } : {}),
  } as unknown as FillSearch;
  return rankCandidates({
    search,
    // La ventana ya limita la diferencia: acá no hay jugadores adentro todavía.
    clubGap: 7,
    current: [],
    targetCategory: p.window ? Math.round((p.window.min + p.window.max) / 2) : 5,
    members: ctx.members,
    prefsByUid: ctx.prefsByUid,
    counters: ctx.counters,
    bookings: ctx.bookings,
    requests: ctx.requests,
    now: p.nowDate,
  });
}

export async function previewFreeSlot(p: { clubId: string; courtId: string; date: string; startMinute: number; nowDate?: Date }): Promise<FreeSlotPreview> {
  const nowDate = p.nowDate ?? new Date();
  const ctx = await loadContext(p.clubId, p.date);
  const dur = ctx.club.slotDurationMinutes || 90;
  const end = p.startMinute + dur;
  const price = calculateSlotPrice(ctx.club, p.date, p.startMinute);
  const taken = ctx.bookings.some((b) => b.courtId === p.courtId && overlaps(b, p.startMinute, end));
  const tooLate = minutesUntil(p.date, p.startMinute, nowDate) < MIN_LEAD_MINUTES + 15;
  const gap = ctx.club.fillMaxGap ?? 1;
  const options: FreeSlotOption[] = MODALITIES.map((modality) => {
    const cands = candidatesFor(ctx, { date: p.date, startMinute: p.startMinute, endMinute: end, modality, nowDate });
    const w = bestCategoryWindow(cands.map((c) => c.category), gap);
    return { modality, count: w.count, minCategory: w.min, maxCategory: w.max };
  });
  const gendered = options.filter((o) => o.modality !== 'mixto').sort((a, b) => b.count - a.count)[0];
  const suggested: Modality = gendered.count >= 4 ? gendered.modality : 'mixto';
  return { free: !taken && !tooLate, reason: taken ? 'taken' : tooLate ? 'too_late' : '', price, options, suggested };
}

/** El mostrador manda a llenar el hueco: retiene la cancha, abre el partido vacío y la búsqueda de 4. */
export async function openFreeSlot(p: {
  clubId: string;
  courtId: string;
  date: string;
  startMinute: number;
  modality: Modality;
  discountPct: number;
  staffUid: string;
  nowDate?: Date;
}): Promise<{ searchId: string; matchId: string; invited: number; window: { min: number; max: number } }> {
  const nowDate = p.nowDate ?? new Date();
  if (!MODALITIES.includes(p.modality)) throw new HttpsError('invalid-argument', 'Modalidad inválida.');
  if (!(DISCOUNTS as readonly number[]).includes(p.discountPct)) throw new HttpsError('invalid-argument', 'Descuento inválido.');
  if (minutesUntil(p.date, p.startMinute, nowDate) < MIN_LEAD_MINUTES + 15) throw new HttpsError('failed-precondition', 'Falta muy poco para ese turno: no da el tiempo para avisar.');
  const ctx = await loadContext(p.clubId, p.date);
  const courtSnap = await clubRef(p.clubId).collection('courts').doc(p.courtId).get();
  if (!courtSnap.exists) throw new HttpsError('not-found', 'Cancha inexistente.');
  const courtName = (courtSnap.get('name') as string) || 'Cancha';
  const dur = ctx.club.slotDurationMinutes || 90;
  const end = p.startMinute + dur;
  const gap = ctx.club.fillMaxGap ?? 1;
  const cands = candidatesFor(ctx, { date: p.date, startMinute: p.startMinute, endMinute: end, modality: p.modality, nowDate });
  const window = bestCategoryWindow(cands.map((c) => c.category), gap);
  const full = calculateSlotPrice(ctx.club, p.date, p.startMinute);
  const total = Math.round((full * (100 - p.discountPct)) / 100);
  const pricePerPlayer = Math.round(total / 4);
  const { closesAt } = searchTiming(p.date, p.startMinute, nowDate);
  const holdUntil = new Date(slotStart(p.date, p.startMinute).getTime() - CHOICE_DEADLINE_MINUTES * 60000).toISOString();

  const cRef = clubRef(p.clubId);
  const matchId = makeId('pm');
  const bookingId = makeId('bk');
  const searchId = makeId('fs');
  await db.runTransaction(async (tx) => {
    const same = await tx.get(cRef.collection('bookings').where('date', '==', p.date).where('courtId', '==', p.courtId));
    if (same.docs.some((d) => overlaps(d.data() as Booking, p.startMinute, end))) throw new HttpsError('already-exists', 'Ese turno ya se ocupó.');
    const booking: Partial<Booking> & Record<string, unknown> = {
      id: bookingId,
      clubId: p.clubId,
      courtId: p.courtId,
      courtName,
      date: p.date,
      startMinute: p.startMinute,
      endMinute: end,
      type: 'matched',
      status: 'held',
      createdByUid: p.staffUid,
      playerUids: [],
      guestName: 'Llenando con la app',
      totalPrice: total,
      paidAmount: 0,
      paymentMethod: 'split',
      paymentStatus: 'pending',
      holdExpiresAt: holdUntil,
      discountPct: p.discountPct,
    };
    const match: ProposedMatch = {
      id: matchId,
      clubId: p.clubId,
      bookingId,
      courtId: p.courtId,
      courtName,
      date: p.date,
      startMinute: p.startMinute,
      endMinute: end,
      modality: p.modality,
      minCategory: window.min,
      maxCategory: window.max,
      pricePerPlayer,
      playerUids: [],
      slots: [],
      expiresAt: holdUntil,
      status: 'pending',
      createdByUid: p.staffUid,
    };
    const search: FillSearch = {
      id: searchId,
      clubId: p.clubId,
      kind: 'free_slot',
      matchId,
      bookingId,
      courtId: p.courtId,
      courtName,
      date: p.date,
      startMinute: p.startMinute,
      endMinute: end,
      modality: p.modality,
      genderNeeded: '',
      seatsNeeded: 4,
      seatsFilled: 0,
      filledUids: [],
      excludedUids: [],
      invitedUids: [],
      lateDropUid: '',
      wave: 0,
      nextWaveAt: nowDate.toISOString(),
      closesAt: closesAt.toISOString(),
      status: 'searching',
      choice: '',
      extended: false,
      pricePerPlayer,
      openedAt: nowDate.toISOString(),
      minCategory: window.min,
      maxCategory: window.max,
      discountPct: p.discountPct,
    };
    tx.set(cRef.collection('bookings').doc(bookingId), { ...booking, createdAt: now(), updatedAt: now() });
    tx.set(cRef.collection('proposedMatches').doc(matchId), { ...match, createdAt: now(), updatedAt: now() });
    tx.set(cRef.collection('fillSearches').doc(searchId), { ...search, createdAt: now(), updatedAt: now() });
  });
  const invited = await runWave(p.clubId, searchId, nowDate);
  return { searchId, matchId, invited, window: { min: window.min, max: window.max } };
}

/** Demo de venta: los jugadores ficticios invitados "contestan" (hasta `n`). Solo jugadores de la demo. */
export async function simulateAnswers(p: { clubId: string; searchId: string; n: number }): Promise<number> {
  const ref = clubRef(p.clubId).collection('fillSearches').doc(p.searchId);
  let won = 0;
  const tried = new Set<string>();
  // Si en la tanda hay menos jugadores ficticios que lugares, adelanta la tanda siguiente (solo demo).
  for (let round = 0; round < 5 && won < p.n; round++) {
    const s = (await ref.get()).data() as FillSearch | undefined;
    if (!s || s.status !== 'searching') break;
    for (const uid of s.invitedUids.filter((u) => isFakePlayer(u) && !tried.has(u))) {
      if (won >= p.n) break;
      tried.add(uid);
      if ((await claimSeat({ clubId: p.clubId, searchId: p.searchId, uid })) === 'won') won++;
    }
    if (won >= p.n) break;
    await ref.update({ nextWaveAt: new Date().toISOString() });
    if (!(await runWave(p.clubId, p.searchId))) break;
  }
  return won;
}
