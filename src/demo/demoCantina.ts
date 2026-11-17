/**
 * Parte del mundo de demo para caja, cantina, turnos fijos, seña retenida, turnos recuperados
 * por "Falta uno" e informe del mes pasado. Se agrega al final de buildDemoWorld.
 * Todo es ficticio y relativo al día en que se carga.
 */
import type { Booking, Gender, PaymentRecord, ProposedMatch } from '../types/padel';
import { CATALOG, type ProductPlace } from '../lib/catalogo';
import type { CashDay, Consumption, FixedBooking, MonthlyReport, Product, Recovery } from '../types/caja';
import { addDaysISO, getDayOfWeekFromISO } from '../lib/padelUtils';
import { monthOf, previousMonth, lastDayOfMonth, PLAN_PRICES_USD, USD_TO_UYU } from '../lib/caja';
import type { DemoDoc, DemoUids } from './demoWorld';

const T = (h: number, m = 0) => h * 60 + m;

export function addCantinaDemo(
  docs: DemoDoc[],
  ctx: {
    base: string;
    clubId: string;
    today: string;
    uids: DemoUids;
    nameOf: (uid: string) => string;
    catOf: (uid: string) => number;
    genOf: (uid: string) => Gender;
    price: (date: string, start: number) => number;
    ownerUid: string;
    /** Cancha y hora del partido armado en juego hoy (demoHoy.ts). */
    todayMatch?: { courtId: string; start: number; players?: string[] };
    nowMinute?: number;
    /** Arma 4 jugadores de categoría pareja libres a esa hora (demoParejas.ts). */
    four: (date: string, start: number, include?: string[], cats?: number[]) => string[];
  }
) {
  const { base, clubId: C, today, uids, nameOf, catOf, genOf, price, ownerUid, four } = ctx;
  const tm = ctx.todayMatch ?? { courtId: 'cancha_2', start: T(18, 30) };
  const tmCourt = `Cancha ${tm.courtId.split('_')[1]}`;
  const day = (n: number) => addDaysISO(today, n);
  const put = (path: string, data: object) => docs.push({ path, data: { ...data } as Record<string, unknown> });
  const bookingDocs = () => docs.filter((d) => d.path.startsWith(`${base}/bookings/`)).map((d) => d.data as unknown as Booking);
  const staffName = 'Diego Fernández';

  // ---------- Productos ----------
  // Productos activados del catálogo base (src/lib/catalogo.ts) con precios de ejemplo.
  // [id, nombre, precio, stock, mínimo, id del catálogo, dónde se vende]
  const rows: [string, string, number, number | null, number, string, ProductPlace][] = [
    ['agua', 'Agua 500 ml', 90, 38, 10, 'agua', 'ambos'],
    ['agua_gas', 'Agua con gas', 100, 20, 6, 'agua_gas', 'ambos'],
    ['gatorade', 'Bebida isotónica', 120, 0, 6, 'isotonica', 'ambos'],
    ['refresco', 'Refresco lata', 140, 24, 8, 'refresco', 'ambos'],
    ['cerveza', 'Cerveza lata', 180, 4, 12, 'cerveza', 'ambos'],
    ['energizante', 'Energizante', 160, 10, 4, 'energizante', 'cantina'],
    ['cafe', 'Café', 80, null, 0, 'cafe', 'ambos'],
    ['cafe_leche', 'Café con leche', 110, null, 0, 'cafe_leche', 'cantina'],
    ['alfajor', 'Alfajor', 70, 30, 10, 'alfajor', 'ambos'],
    ['barrita', 'Barrita de cereal', 90, 18, 6, 'barrita', 'ambos'],
    ['tostado', 'Tostado', 220, null, 0, 'tostado', 'cantina'],
    ['pelotas', 'Tubo de pelotas', 450, 15, 5, 'pelotas', 'ambos'],
    ['grip', 'Grip', 250, 9, 3, 'grip', 'ambos'],
    ['paleta', 'Alquiler de paleta', 150, null, 0, 'alq_paleta', 'ambos'],
  ];
  const products: Product[] = rows.map(([id, name, price, stock, minStock, catalogId, where], i) => ({
    id: `demo_prod_${id}`,
    clubId: C,
    name,
    price,
    stock,
    minStock,
    active: true,
    order: i,
    catalogId,
    icon: CATALOG.find((c) => c.id === catalogId)?.icon,
    where,
  }));
  products.forEach((p) => put(`${base}/products/${p.id}`, p));
  const prod = (id: string) => products.find((p) => p.id === `demo_prod_${id}`)!;

  let ci = 0;
  const cons = (p: Product, qty: number, date: string, bookingId: string, who: { key: string; name: string }[], shared: boolean, status: Consumption['status'], paidUids: string[] = []): Consumption => {
    const c: Consumption = {
      id: `demo_cons_${String(++ci).padStart(3, '0')}`,
      clubId: C,
      productId: p.id,
      productName: p.name,
      unitPrice: p.price,
      qty,
      total: p.price * qty,
      bookingId,
      date,
      shared,
      forUid: shared || who[0].key.startsWith('g:') ? '' : who[0].key,
      forName: shared ? 'Todos' : who[0].name,
      participantUids: who.map((w) => w.key),
      participantNames: who.map((w) => w.name),
      paidUids,
      status,
      createdByUid: uids.mostrador,
    };
    put(`${base}/consumptions/${c.id}`, c);
    return c;
  };
  const person = (uid: string) => ({ key: uid, name: nameOf(uid) });

  let pi = 0;
  const payment = (d: string, payerName: string, ref: string, amount: number, method: PaymentRecord['method'], kind: PaymentRecord['kind'], extra: Partial<PaymentRecord> = {}) => {
    const p: PaymentRecord = {
      id: `demo_pay_c${String(++pi).padStart(3, '0')}`,
      clubId: C,
      uid: uids.mostrador,
      clubOwnerUid: ownerUid,
      payerName,
      referenceId: ref,
      amount,
      method,
      kind,
      status: 'completed',
      day: d,
      staffName,
      ...extra,
    };
    put(`${base}/payments/${p.id}`, p);
    return p;
  };

  // ---------- Partido armado de hoy con cuenta de cantina (Martín + 3) ----------
  const matchPlayers = tm.players ?? [uids.jugador, 'demo-p07', 'demo-p09', 'demo-p10'];
  const matchPrice = price(day(0), tm.start);
  const todayBooking: Booking = {
    id: 'demo_bk_c01',
    clubId: C,
    courtId: tm.courtId,
    courtName: tmCourt,
    date: day(0),
    startMinute: tm.start,
    endMinute: tm.start + 90,
    type: 'matched',
    status: 'confirmed',
    createdByUid: uids.jugador,
    playerUids: matchPlayers,
    guestName: '',
    totalPrice: matchPrice,
    paidAmount: matchPrice / 4,
    paymentMethod: 'club',
    paymentStatus: 'deposit_paid',
    holdExpiresAt: '',
  };
  put(`${base}/bookings/${todayBooking.id}`, todayBooking);
  const todayMatch: ProposedMatch = {
    id: 'demo_pm_c01',
    clubId: C,
    bookingId: todayBooking.id,
    courtId: tm.courtId,
    courtName: tmCourt,
    date: day(0),
    startMinute: tm.start,
    endMinute: tm.start + 90,
    modality: 'mixto',
    minCategory: Math.min(...matchPlayers.map(catOf)),
    maxCategory: Math.max(...matchPlayers.map(catOf)),
    pricePerPlayer: matchPrice / 4,
    playerUids: matchPlayers,
    slots: matchPlayers.map((u) => ({ uid: u, displayName: nameOf(u), category: catOf(u), gender: genOf(u), status: 'accepted' as const, paid: u === 'demo-p07', requestId: `demo_req_c_${u}` })),
    expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
    status: 'confirmed',
    createdByUid: uids.jugador,
  };
  put(`${base}/proposedMatches/${todayMatch.id}`, todayMatch);
  payment(day(0), nameOf('demo-p07'), todayMatch.id, matchPrice / 4, 'efectivo', 'match_share');
  cons(prod('agua'), 2, day(0), todayBooking.id, [person(uids.jugador)], false, 'pending');
  cons(prod('pelotas'), 1, day(0), todayBooking.id, matchPlayers.map(person), true, 'pending');

  // ---------- Fiado de días anteriores (aparece en "Deben") ----------
  const past = bookingDocs().filter((b) => b.date < today && b.status === 'confirmed' && !b.id.startsWith('demo_bk_h'));
  const byPlayer = (uid: string) => past.find((b) => b.createdByUid === uid);
  const b14 = byPlayer('demo-p14');
  if (b14) cons(prod('cerveza'), 2, b14.date, b14.id, [person('demo-p14')], false, 'pending');
  const bLu = byPlayer(uids.jugadora);
  if (bLu) cons(prod('gatorade'), 1, bLu.date, bLu.id, [person(uids.jugadora)], false, 'pending');

  // ---------- Cantina cobrada en días anteriores ----------
  const methods: PaymentRecord['method'][] = ['efectivo', 'transferencia', 'efectivo', 'debito_club'];
  past.forEach((b, i) => {
    const who = b.createdByUid;
    const items: [string, number][] = i % 3 === 0 ? [['agua', 2], ['pelotas', 1]] : i % 3 === 1 ? [['cerveza', 4]] : [['agua', 1], ['gatorade', 2], ['paleta', 1]];
    let total = 0;
    items.forEach(([pid, q]) => {
      cons(prod(pid), q, b.date, b.id, [person(who)], false, 'paid');
      total += prod(pid).price * q;
    });
    payment(b.date, nameOf(who), b.id, total, methods[i % 4], 'cantina');
  });

  // ---------- Seña retenida: reserva en pico que no vino ----------
  const nsDate = day(-3);
  const nsBooking: Booking = {
    id: 'demo_bk_c02',
    clubId: C,
    courtId: 'cancha_3',
    courtName: 'Cancha 3',
    date: nsDate,
    startMinute: T(20),
    endMinute: T(21, 30),
    type: 'direct',
    status: 'no_show',
    createdByUid: 'demo-p16',
    playerUids: four(nsDate, T(20), ['demo-p16']),
    guestName: nameOf('demo-p16'),
    totalPrice: price(nsDate, T(20)),
    paidAmount: 500,
    paymentMethod: 'mercadopago',
    paymentStatus: 'deposit_paid',
    holdExpiresAt: '',
  };
  put(`${base}/bookings/${nsBooking.id}`, nsBooking);
  payment(addDaysISO(nsDate, -1), nameOf('demo-p16'), nsBooking.id, 500, 'mercadopago', 'booking_deposit', { uid: 'demo-p16', staffName: '' });

  // ---------- Retiro y una anulación en días anteriores ----------
  payment(day(-2), staffName, 'retiro', 400, 'efectivo', 'retiro', { note: 'Hielo y bolsas' });
  const wrong = payment(day(-1), 'Venta rápida', 'venta', 180, 'efectivo', 'cantina', { voided: true });
  payment(day(-1), 'Venta rápida', 'venta', -180, 'efectivo', 'anulacion', { voidOfId: wrong.id, note: 'Se cargó dos veces' });

  // ---------- Cierres de caja de los últimos 6 días ----------
  const allPayments = () => docs.filter((d) => d.path.startsWith(`${base}/payments/`)).map((d) => d.data as unknown as PaymentRecord);
  for (let n = -6; n <= -1; n += 1) {
    const d = day(n);
    const list = allPayments().filter((p) => p.day === d && p.kind !== 'platform_subscription');
    const byId = new Map(list.map((p) => [p.id, p]));
    const sum = (f: (p: PaymentRecord) => boolean) => list.filter(f).reduce((a, p) => a + p.amount, 0);
    const efectivo = sum((p) => p.method === 'efectivo' && p.kind !== 'retiro');
    const retiros = sum((p) => p.kind === 'retiro');
    const cantina = sum((p) => p.kind === 'cantina' || (p.kind === 'anulacion' && byId.get(p.voidOfId || '')?.kind === 'cantina'));
    const totals = {
      efectivo,
      transferencia: sum((p) => p.method === 'transferencia'),
      debito_club: sum((p) => p.method === 'debito_club'),
      mercadopago: sum((p) => p.method === 'mercadopago'),
      retiros,
      cantina,
      total: 0,
      sinCobrar: 0,
    };
    totals.total = totals.efectivo + totals.transferencia + totals.debito_club + totals.mercadopago;
    const opening = 2000;
    const expected = opening + efectivo - retiros;
    const diff = n === -2 ? -200 : 0;
    const cd: CashDay = {
      id: d,
      clubId: C,
      date: d,
      openingFloat: opening,
      openedByUid: uids.mostrador,
      openedByName: staffName,
      status: 'closed',
      closedByUid: uids.mostrador,
      closedByName: staffName,
      closedAtISO: `${d}T23:10:00`,
      expectedCash: expected,
      countedCash: expected + diff,
      difference: diff,
      note: diff ? 'Faltan $ 200, se revisa mañana con Sofía' : '',
      totals,
    };
    put(`${base}/cashDays/${d}`, cd);
  }

  // ---------- Turno fijo: los martes a las 17 en la Cancha 4 ----------
  let first = day(1);
  while (getDayOfWeekFromISO(first) !== 2) first = addDaysISO(first, 1);
  const fixedIds: string[] = [];
  for (let w = 0; w < 8; w += 1) {
    const d = addDaysISO(first, w * 7);
    const id = `demo_bk_f${w + 1}`;
    fixedIds.push(id);
    put(`${base}/bookings/${id}`, {
      id,
      clubId: C,
      courtId: 'cancha_4',
      courtName: 'Cancha 4',
      date: d,
      startMinute: T(17),
      endMinute: T(18, 30),
      type: 'counter',
      status: 'confirmed',
      createdByUid: uids.mostrador,
      // El titular no tiene cuenta (''); juega con 3 socios de 6ta y 7ma.
      playerUids: ['', ...four(d, T(17), [], [6])],
      guestName: 'Grupo de los martes · 099 456 789',
      totalPrice: price(d, T(17)),
      paidAmount: 0,
      paymentMethod: 'club',
      paymentStatus: 'pending',
      holdExpiresAt: '',
      fixedId: 'demo_fijo_1',
    });
  }
  const fixed: FixedBooking = {
    id: 'demo_fijo_1',
    clubId: C,
    courtId: 'cancha_4',
    courtName: 'Cancha 4',
    dayOfWeek: 2,
    startMinute: T(17),
    endMinute: T(18, 30),
    holderName: 'Grupo de los martes',
    holderUid: '',
    phone: '099 456 789',
    fromDate: first,
    untilDate: addDaysISO(first, 7 * 7),
    active: true,
    bookingIds: fixedIds,
    createdByUid: uids.mostrador,
  };
  put(`${base}/fixedBookings/${fixed.id}`, fixed);

  // ---------- Turnos recuperados por "Falta uno" (los escribe el servidor) ----------
  const recPlan: [number, Recovery['kind'], number, Recovery['status']][] = [
    // Solo lo que hoy hace el servidor (lugares cubiertos y partidos completados). "Llenar turnos libres"
    // todavía no existe, así que la demo no muestra turnos libres llenos (16/11/2026).
    [0, 'match_completed', 2, 'counted'],
    [2, 'player_replaced', 1, 'counted'],
    [3, 'player_replaced', 1, 'counted'],
    [4, 'match_completed', 2, 'counted'],
    [6, 'player_replaced', 1, 'counted'],
    [7, 'match_completed', 1, 'counted'],
    [8, 'player_replaced', 1, 'counted'],
    [9, 'match_completed', 2, 'counted'],
    [5, 'player_replaced', 1, 'voided'],
  ];
  recPlan.forEach(([idx, kind, seats, status], i) => {
    const b = past[idx];
    if (!b) return;
    const alertAt = new Date(`${b.date}T${String(Math.floor(b.startMinute / 60) - 3).padStart(2, '0')}:${String(b.startMinute % 60).padStart(2, '0')}:00`);
    const filledAt = new Date(alertAt.getTime() + (12 + i * 7) * 60 * 1000);
    const amount = kind === 'slot_filled' ? b.totalPrice : Math.round((b.totalPrice / 4) * seats);
    const r: Recovery = {
      id: `demo_rec_${i + 1}`,
      clubId: C,
      bookingId: b.id,
      courtId: b.courtId,
      date: b.date,
      startMinute: b.startMinute,
      endMinute: b.endMinute,
      sport: 'padel',
      kind,
      freeSince: addDaysISO(b.date, -2),
      alertId: `demo_alert_${i + 1}`,
      searchId: `demo_search_${i + 1}`,
      alertSentAt: alertAt.toISOString(),
      filledByUid: b.playerUids[3] || b.createdByUid,
      filledAt: filledAt.toISOString(),
      seatsFilled: kind === 'slot_filled' ? 4 : seats,
      amountRecovered: amount,
      status,
      ...(status === 'voided' ? { voidReason: 'El jugador canceló después' } : {}),
    };
    put(`${base}/recoveries/${r.id}`, r);
  });

  // ---------- Foto del informe del mes pasado (la guarda el servidor el día 1) ----------
  const prev = previousMonth(monthOf(today));
  const fee = PLAN_PRICES_USD.estandar * USD_TO_UYU;
  const report: MonthlyReport = {
    id: prev,
    clubId: C,
    clubName: 'Los Jacarandás Pádel',
    month: prev,
    partial: false,
    fromDate: `${prev}-01`,
    toDate: lastDayOfMonth(prev),
    slotsFilled: { count: 6, amount: 12400 },
    playersReplaced: { count: 5, amount: 2750 },
    matchesCompleted: { count: 0, seats: 0, amount: 0 },
    depositsKept: { count: 2, amount: 1900 },
    totalEarned: 17050,
    planLabel: 'Estándar',
    feeUYU: fee,
    isTrial: true,
    multiple: Math.round((17050 / fee) * 10) / 10,
    playedBookings: 412,
    occupancyPct: 68,
    noShows: 3,
    cantinaCollected: 48300,
    newPlayers: 31,
    uncollected: 0,
    tip: 'Los martes a las 14:00 tuviste 70 % de canchas libres. Hay 23 jugadores que dijeron que pueden a esa hora: un aviso de promo les puede llegar directo.',
    recoveryIds: [],
    generatedAtISO: `${addDaysISO(lastDayOfMonth(prev), 1)}T09:00:00`,
    sentTo: ['dueno@demo.armapartido.com'],
  };
  put(`${base}/monthlyReports/${report.id}`, report);
}
