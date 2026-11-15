/**
 * Cuentas de la caja, la cantina, la seña y el informe mensual. Todo puro (sin Firebase),
 * para poder probarlo con `npx tsx scripts/test-caja.ts` y reusarlo en el servidor.
 */
import type { Booking, Club, ClubMembership, Court, PaymentRecord, ProposedMatch } from '../types/padel';
import type { CashDay, Consumption, MonthlyReport, Recovery } from '../types/caja';
import { addDaysISO, generateDaySlots, getDayOfWeekFromISO } from './padelUtils';

// ---------- Fechas ----------

export const toDateValue = (v: unknown): Date | null => {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'string') {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof v === 'object' && v !== null && 'toDate' in v && typeof (v as { toDate: unknown }).toDate === 'function') {
    return (v as { toDate: () => Date }).toDate();
  }
  return null;
};

export const isoOf = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Día de caja de un cobro: el campo day si lo tiene, si no la fecha en que se creó. */
export const paymentDay = (p: PaymentRecord): string => {
  if (p.day) return p.day;
  const d = toDateValue(p.createdAt);
  return d ? isoOf(d) : '';
};

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DAYS_PLURAL = ['domingos', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados'];

export const monthLabel = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
};

export const monthOf = (iso: string) => iso.slice(0, 7);

export const lastDayOfMonth = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return isoOf(new Date(y, m, 0));
};

export const previousMonth = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

// ---------- Dividir ----------

/** Divide un total en n partes enteras; el redondeo va al último para que la suma dé exacta. */
export function splitEven(total: number, n: number): number[] {
  if (n <= 0) return [];
  // Pesos enteros: el resto se reparte de a $1 entre los primeros (450 / 4 = 113, 113, 112, 112)
  const base = Math.floor(total / n);
  const rest = total - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < rest ? 1 : 0));
}

// ---------- Seña en pico ----------

/** Monto de la seña que pide este turno (0 si no pide). */
export function depositFor(club: Club, date: string, startMinute: number): number {
  const r = club.deposit;
  if (!r || !r.enabled || r.amount <= 0) return 0;
  const dow = getDayOfWeekFromISO(date);
  if (!r.days.includes(dow)) return 0;
  if (startMinute < r.fromHour * 60 || startMinute >= r.toHour * 60) return 0;
  return r.amount;
}

// ---------- Cuenta del turno ----------

export interface Participant {
  key: string; // uid, o "g:<bookingId>" para un cliente sin cuenta
  name: string;
  canchaShare: number; // lo que le toca de cancha
  canchaPaid: boolean;
}

export interface ParticipantAccount extends Participant {
  canchaDue: number;
  items: { consumptionId: string; label: string; amount: number }[];
  consumptionDue: number;
  totalDue: number;
}

export const guestKey = (bookingId: string) => `g:${bookingId}`;

/** Quiénes juegan un turno y cuánto le toca a cada uno de cancha. */
export function participantsOf(booking: Booking, match: ProposedMatch | undefined, nameOf: (uid: string) => string): Participant[] {
  if (booking.type === 'matched' && match) {
    return match.slots.map((s) => ({ key: s.uid, name: s.displayName, canchaShare: match.pricePerPlayer, canchaPaid: s.paid }));
  }
  const uid = booking.playerUids[0] || '';
  const name = (booking.guestName || '').split(' · ')[0].replace(/\s*\(Mostrador\)\s*$/, '') || (uid ? nameOf(uid) : 'Cliente');
  const due = Math.max(0, booking.totalPrice - booking.paidAmount);
  return [{ key: uid || guestKey(booking.id), name, canchaShare: due, canchaPaid: due === 0 }];
}

/** Parte de un consumo que le toca a una persona (0 si no le toca). */
export function consumptionShare(c: Consumption, key: string): number {
  if (c.status === 'voided') return 0;
  if (!c.shared) return c.participantUids[0] === key ? c.total : 0;
  const idx = c.participantUids.indexOf(key);
  if (idx < 0) return 0;
  return splitEven(c.total, c.participantUids.length)[idx];
}

/** Lo que una persona todavía debe de un consumo. */
export function consumptionDue(c: Consumption, key: string): number {
  if (c.status !== 'pending') return 0;
  if (c.shared && c.paidUids.includes(key)) return 0;
  return consumptionShare(c, key);
}

export function accountOf(participants: Participant[], consumptions: Consumption[]): ParticipantAccount[] {
  return participants.map((p) => {
    const items = consumptions
      .filter((c) => c.status !== 'voided' && consumptionShare(c, p.key) > 0)
      .map((c) => ({
        consumptionId: c.id,
        label: `${c.qty > 1 ? `${c.qty} ` : ''}${c.productName}${c.shared ? ' (entre todos)' : ''}`,
        amount: consumptionDue(c, p.key),
      }));
    const consumptionDueTotal = items.reduce((a, i) => a + i.amount, 0);
    const canchaDue = p.canchaPaid ? 0 : p.canchaShare;
    return { ...p, canchaDue, items, consumptionDue: consumptionDueTotal, totalDue: canchaDue + consumptionDueTotal };
  });
}

// ---------- Caja del día ----------

export interface CashSummary {
  byMethod: Record<'efectivo' | 'transferencia' | 'debito_club' | 'mercadopago', number>;
  withdrawals: number;
  cantina: number;
  total: number;
  expectedCash: number;
  movements: PaymentRecord[];
}

export function cashSummary(payments: PaymentRecord[], date: string, openingFloat: number): CashSummary {
  const byId = new Map(payments.map((p) => [p.id, p]));
  const byMethod = { efectivo: 0, transferencia: 0, debito_club: 0, mercadopago: 0 };
  let withdrawals = 0;
  let cantina = 0;
  const movements = payments.filter((p) => p.kind !== 'platform_subscription' && paymentDay(p) === date);
  for (const p of movements) {
    if (p.kind === 'retiro') {
      withdrawals += p.amount;
      continue;
    }
    byMethod[p.method] = (byMethod[p.method] ?? 0) + p.amount;
    const kindForCantina = p.kind === 'anulacion' ? byId.get(p.voidOfId || '')?.kind : p.kind;
    if (kindForCantina === 'cantina') cantina += p.amount;
  }
  const total = byMethod.efectivo + byMethod.transferencia + byMethod.debito_club + byMethod.mercadopago;
  return { byMethod, withdrawals, cantina, total, expectedCash: openingFloat + byMethod.efectivo - withdrawals, movements };
}

// ---------- Deudas ----------

export interface Debt {
  key: string;
  name: string;
  amount: number;
  since: string;
  consumptionIds: string[];
  bookingIds: string[];
}

/**
 * Lo que la gente debe: consumos pendientes de días anteriores (o de turnos ya terminados) y
 * canchas de turnos pasados que no se cobraron. Agrupado por persona.
 */
export function debtsOf(params: {
  consumptions: Consumption[];
  bookings: Booking[];
  matches: ProposedMatch[];
  today: string;
  nowMinute: number;
  nameOf: (uid: string) => string;
}): Debt[] {
  const { consumptions, bookings, matches, today, nowMinute, nameOf } = params;
  const bookingById = new Map(bookings.map((b) => [b.id, b]));
  const over = (date: string, endMinute?: number) => date < today || (date === today && endMinute !== undefined && endMinute <= nowMinute);
  const map = new Map<string, Debt>();
  const add = (key: string, name: string, amount: number, date: string, cId?: string, bId?: string) => {
    if (amount <= 0) return;
    const d = map.get(key) ?? { key, name, amount: 0, since: date, consumptionIds: [], bookingIds: [] };
    d.amount += amount;
    if (date < d.since) d.since = date;
    if (cId && !d.consumptionIds.includes(cId)) d.consumptionIds.push(cId);
    if (bId && !d.bookingIds.includes(bId)) d.bookingIds.push(bId);
    map.set(key, d);
  };
  for (const c of consumptions) {
    if (c.status !== 'pending') continue;
    const b = c.bookingId ? bookingById.get(c.bookingId) : undefined;
    if (!over(c.date, b?.endMinute)) continue;
    c.participantUids.forEach((key, i) => add(key, c.participantNames[i] || nameOf(key), consumptionDue(c, key), c.date, c.id));
  }
  for (const b of bookings) {
    if (b.status !== 'confirmed' || b.type === 'tournament' || !over(b.date, b.endMinute)) continue;
    const match = matches.find((m) => m.bookingId === b.id);
    for (const p of participantsOf(b, match, nameOf)) {
      if (!p.canchaPaid) add(p.key, p.name, p.canchaShare, b.date, undefined, b.id);
    }
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount);
}

// ---------- Informe mensual ----------

/** Precio de los planes (decidido por Ber el 15/11/2026). */
export const PLAN_PRICES_USD: Record<'entrada' | 'estandar', number> = { entrada: 39, estandar: 59 };
/** Tipo de cambio para mostrar la cuota en pesos. Hipótesis: $40 por dólar; en producción, el de la factura. */
export const USD_TO_UYU = 40;

export function computeMonthlyReport(params: {
  club: Club;
  month: string; // YYYY-MM
  today: string;
  courts: Court[];
  bookings: Booking[];
  matches: ProposedMatch[];
  payments: PaymentRecord[];
  consumptions: Consumption[];
  recoveries: Recovery[];
  memberships: ClubMembership[];
}): MonthlyReport {
  const { club, month, today, courts, bookings, matches, payments, consumptions, recoveries, memberships } = params;
  const fromDate = `${month}-01`;
  const lastDay = lastDayOfMonth(month);
  const partial = today <= lastDay;
  const toDate = partial ? addDaysISO(today, -1) : lastDay;
  const inMonth = (d: string) => d >= fromDate && d <= toDate;

  const counted = recoveries.filter((r) => r.status === 'counted' && inMonth(r.date));
  const sumOf = (kind: Recovery['kind']) => {
    const list = counted.filter((r) => r.kind === kind);
    // El servidor escribe un registro por lugar: un partido completado cuenta una vez por turno
    const count = kind === 'match_completed' ? new Set(list.map((r) => r.bookingId)).size : list.length;
    return { count, amount: list.reduce((a, r) => a + r.amountRecovered, 0), seats: list.reduce((a, r) => a + (r.seatsFilled || 0), 0) };
  };
  const slots = sumOf('slot_filled');
  const replaced = sumOf('player_replaced');
  const completed = sumOf('match_completed');

  const monthBookings = bookings.filter((b) => inMonth(b.date));
  const kept = monthBookings.filter((b) => b.status === 'no_show' && b.paymentStatus === 'deposit_paid' && b.paidAmount > 0);
  const depositsKept = { count: kept.length, amount: kept.reduce((a, b) => a + b.paidAmount, 0) };

  const totalEarned = slots.amount + replaced.amount + completed.amount + depositsKept.amount;
  const plan = club.plan ?? 'estandar';
  const feeUYU = PLAN_PRICES_USD[plan] * USD_TO_UYU;
  const isTrial = club.subscriptionStatus === 'trial';

  const played = monthBookings.filter((b) => b.status === 'confirmed');
  const activeCourts = courts.filter((c) => c.active).length || club.courtCount || 1;
  const daySlots = generateDaySlots(club);
  let days = 0;
  for (let d = fromDate; d <= toDate; d = addDaysISO(d, 1)) days += 1;
  const capacity = days * daySlots.length * activeCourts;
  const occupancyPct = capacity ? Math.round((played.length / capacity) * 100) : 0;

  const byId = new Map(payments.map((p) => [p.id, p]));
  let cantinaCollected = 0;
  for (const p of payments) {
    if (!inMonth(paymentDay(p))) continue;
    const kind = p.kind === 'anulacion' ? byId.get(p.voidOfId || '')?.kind : p.kind;
    if (kind === 'cantina') cantinaCollected += p.amount;
  }

  const newPlayers = memberships.filter((m) => {
    const d = toDateValue(m.createdAt);
    return d ? inMonth(isoOf(d)) : false;
  }).length;

  const nameOf = (uid: string) => memberships.find((m) => m.uid === uid)?.displayName ?? 'Jugador';
  const uncollected = debtsOf({
    consumptions: consumptions.filter((c) => inMonth(c.date)),
    bookings: played,
    matches,
    today,
    nowMinute: 0,
    nameOf,
  }).reduce((a, d) => a + d.amount, 0);

  return {
    id: month,
    clubId: club.id,
    clubName: club.name,
    month,
    partial,
    fromDate,
    toDate,
    slotsFilled: { count: slots.count, amount: slots.amount },
    playersReplaced: { count: replaced.count, amount: replaced.amount },
    matchesCompleted: { count: completed.count, seats: completed.seats, amount: completed.amount },
    depositsKept,
    totalEarned,
    planLabel: plan === 'entrada' ? 'Entrada' : 'Estándar',
    feeUYU,
    isTrial,
    multiple: feeUYU ? Math.round((totalEarned / feeUYU) * 10) / 10 : 0,
    playedBookings: played.length,
    occupancyPct,
    noShows: monthBookings.filter((b) => b.status === 'no_show').length,
    cantinaCollected,
    newPlayers,
    uncollected,
    tip: emptiestSlotTip({ club, fromDate, toDate, played, activeCourts, memberships }),
    recoveryIds: counted.map((r) => r.id),
  };
}

/** Consejo honesto: el horario de semana más vacío y cuántos jugadores dijeron que pueden a esa hora. */
function emptiestSlotTip(params: {
  club: Club;
  fromDate: string;
  toDate: string;
  played: Booking[];
  activeCourts: number;
  memberships: ClubMembership[];
}): string {
  const { club, fromDate, toDate, played, activeCourts, memberships } = params;
  const daySlots = generateDaySlots(club);
  const capacity = new Map<string, number>();
  const used = new Map<string, number>();
  for (let d = fromDate; d <= toDate; d = addDaysISO(d, 1)) {
    const dow = getDayOfWeekFromISO(d);
    if (dow === 0 || dow === 6) continue;
    for (const s of daySlots) {
      const k = `${dow}-${s.startMinute}`;
      capacity.set(k, (capacity.get(k) ?? 0) + activeCourts);
    }
  }
  for (const b of played) {
    const k = `${getDayOfWeekFromISO(b.date)}-${b.startMinute}`;
    if (capacity.has(k)) used.set(k, (used.get(k) ?? 0) + 1);
  }
  // Elegimos el horario de semana con más canchas libres y más jugadores que dijeron que pueden a esa hora.
  const dur = club.slotDurationMinutes || 90;
  const canAt = (dow: number, start: number) =>
    memberships.filter((m) => (m.weeklyAvailability || []).some((w) => w.dayOfWeek === dow && w.startMinute <= start && w.endMinute >= start + dur)).length;
  let best: { k: string; free: number; can: number; score: number } | null = null;
  for (const [k, cap] of capacity) {
    const free = 1 - (used.get(k) ?? 0) / cap;
    const [d, st] = k.split('-').map(Number);
    const can = canAt(d, st);
    const score = free * (can + 1);
    if (!best || score > best.score) best = { k, free, can, score };
  }
  if (!best) return '';
  const [dow, start] = best.k.split('-').map(Number);
  const can = best.can;
  const hh = `${Math.floor(start / 60)}:${String(start % 60).padStart(2, '0')}`;
  const freePct = Math.round(best.free * 100);
  return can > 0
    ? `Los ${DAYS_PLURAL[dow]} a las ${hh} tuviste ${freePct} % de canchas libres. Hay ${can} ${can === 1 ? 'jugador que dijo' : 'jugadores que dijeron'} que pueden a esa hora: un aviso de promo les puede llegar directo.`
    : `Los ${DAYS_PLURAL[dow]} a las ${hh} tuviste ${freePct} % de canchas libres. Es el horario para probar una promo.`;
}

export const emptyCashDay = (clubId: string, date: string): CashDay => ({
  id: date,
  clubId,
  date,
  openingFloat: 0,
  openedByUid: '',
  openedByName: '',
  status: 'open',
});
