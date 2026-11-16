/**
 * Ficha de cliente, cuponeras, libro de movimientos y números del club. Todo puro (sin Firebase),
 * para probarlo con `npx tsx scripts/test-clientes.ts` y reusarlo en el servidor.
 * Especificación: Paddle.URU/docs/especificacion-clientes-ventas-kpis.md
 */
import type { Booking, Club, ClubMembership, Court, PaymentRecord, ProposedMatch } from '../types/padel';
import type { CashDay, Consumption } from '../types/caja';
import { ORIGIN_LABEL, type ClientOrigin, type ClientPack, type ClubClient, type PackType, type PackValidity, type Rubro, type Sale } from '../types/clientes';
import { addDaysISO, generateDaySlots, getDayOfWeekFromISO } from './padelUtils';
import { debtsOf, paymentDay, participantsOf, type Debt } from './caja';
import type { Sheet } from './planilla';

// ---------- Celular y texto ----------

/**
 * Celular siempre igual: "+59899123456". Acepta "099 123 456", "99-123-456", "+598 99 123 456",
 * fijos "2600 1234". Devuelve '' si no parece un número.
 */
export function normalizePhone(raw: string): string {
  const trimmed = (raw || '').trim();
  let digits = trimmed.replace(/\D/g, '');
  if (!digits) return '';
  if (trimmed.startsWith('+') && !digits.startsWith('598')) return digits.length >= 8 ? `+${digits}` : '';
  if (digits.startsWith('00598')) digits = digits.slice(5);
  else if (digits.startsWith('598') && digits.length >= 11) digits = digits.slice(3);
  if (digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length !== 8) return '';
  if (!/^[249]/.test(digits)) return '';
  return `+598${digits}`;
}

/** "+59899123456" → "099 123 456"; fijo "+59826001234" → "2600 1234". */
export function formatPhone(phone: string): string {
  if (!phone) return '';
  if (!phone.startsWith('+598')) return phone;
  const n = phone.slice(4);
  if (n.startsWith('9')) return `0${n.slice(0, 2)} ${n.slice(2, 5)} ${n.slice(5)}`;
  return `${n.slice(0, 4)} ${n.slice(4)}`;
}

export const fold = (s: string) =>
  (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

export const normalizeEmail = (s: string) => (s || '').trim().toLowerCase();
export const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test((s || '').trim());

/** Clave de deuda y de cuenta del turno: la cuenta de la app si está unida, si no "c:<id>". */
export const clientKey = (c: Pick<ClubClient, 'id' | 'uid'>) => c.uid || `c:${c.id}`;

/** Resuelve claves viejas: "c:<id>" de una ficha que después se unió a la app pasa a ser su uid. */
export function keyResolver(clients: ClubClient[]) {
  const byId = new Map(clients.map((c) => [c.id, c]));
  return (key: string) => {
    if (!key.startsWith('c:')) return key;
    let c = byId.get(key.slice(2));
    // Ficha unida a otra: seguir hasta la que quedó
    for (let i = 0; c?.mergedInto && i < 5; i += 1) c = byId.get(c.mergedInto);
    return c ? clientKey(c) : key;
  };
}

export function clientByKey(clients: ClubClient[], key: string): ClubClient | undefined {
  if (key.startsWith('c:')) {
    const byId = new Map(clients.map((c) => [c.id, c]));
    let c = byId.get(key.slice(2));
    for (let i = 0; c?.mergedInto && i < 5; i += 1) c = byId.get(c.mergedInto);
    return c;
  }
  return clients.find((c) => c.uid === key && c.status === 'active') ?? clients.find((c) => c.uid === key);
}

// ---------- Buscar y repetidos ----------

export interface SearchHit {
  /** Ficha existente, o un jugador de la app de este club que todavía no tiene ficha. */
  client?: ClubClient;
  member?: ClubMembership;
  name: string;
  phone: string;
  email: string;
  category: number | null;
  hasApp: boolean;
  score: number;
}

/**
 * El buscador único del mostrador (W2): nombre, celular o mail. El nombre solo sugiere; el
 * celular y el mail encuentran exacto.
 */
export function searchClients(clients: ClubClient[], members: ClubMembership[], q: string, limit = 8): SearchHit[] {
  const text = fold(q);
  if (text.length < 2) return [];
  const qDigits = q.replace(/\D/g, '');
  const qPhone = normalizePhone(q);
  const hits: SearchHit[] = [];
  const withUid = new Set(clients.filter((c) => c.uid && c.status === 'active').map((c) => c.uid));
  for (const c of clients) {
    if (c.status !== 'active') continue;
    let score = 0;
    const name = fold(c.name);
    if (qPhone && c.phone === qPhone) score = 100;
    else if (qDigits.length >= 3 && c.phone.replace(/\D/g, '').includes(qDigits.replace(/^0/, ''))) score = 60;
    if (c.email && fold(c.email) === text) score = Math.max(score, 100);
    else if (c.email && text.includes('@') && fold(c.email).startsWith(text)) score = Math.max(score, 50);
    if (name.startsWith(text)) score = Math.max(score, 40);
    else if (name.split(' ').some((w) => w.startsWith(text))) score = Math.max(score, 30);
    else if (name.includes(text)) score = Math.max(score, 15);
    if (score > 0) hits.push({ client: c, name: c.name, phone: c.phone, email: c.email, category: c.category, hasApp: !!c.uid, score });
  }
  for (const m of members) {
    if (withUid.has(m.uid) || m.role !== 'player') continue;
    const name = fold(m.displayName);
    let score = 0;
    if (name.startsWith(text)) score = 35;
    else if (name.split(' ').some((w) => w.startsWith(text))) score = 25;
    else if (name.includes(text)) score = 12;
    if (score > 0) hits.push({ member: m, name: m.displayName, phone: '', email: '', category: m.category, hasApp: true, score });
  }
  return hits.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0, limit);
}

/** Fichas activas con ese celular (para frenar y preguntar "¿es la misma persona?"). */
export const clientsWithPhone = (clients: ClubClient[], phone: string) =>
  phone ? clients.filter((c) => c.status === 'active' && c.phone === phone) : [];

export const clientsWithEmail = (clients: ClubClient[], email: string) => {
  const e = normalizeEmail(email);
  return e ? clients.filter((c) => c.status === 'active' && normalizeEmail(c.email) === e) : [];
};

/** Posibles repetidos para que los revise el dueño: marcados al guardar, o mismo celular o mail. */
export function possibleDuplicates(clients: ClubClient[]): ClubClient[][] {
  const active = clients.filter((c) => c.status === 'active');
  const groups = new Map<string, ClubClient[]>();
  for (const c of active) {
    for (const k of [c.phone ? `p:${c.phone}` : '', c.email ? `e:${normalizeEmail(c.email)}` : ''].filter(Boolean)) {
      groups.set(k, [...(groups.get(k) ?? []), c]);
    }
  }
  const seen = new Set<string>();
  const out: ClubClient[][] = [];
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    const id = g.map((c) => c.id).sort().join('|');
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(g);
  }
  return out;
}

/** Cómo llega a la planilla del contador y a la ficha un cliente borrado. */
export const displayName = (c: ClubClient | undefined, fallback = 'Sin nombre') => (c ? (c.erased ? 'Cliente borrado' : c.name) : fallback);

// ---------- Rubros ----------

export function rubroOfPayment(p: PaymentRecord, byId?: Map<string, PaymentRecord>): Rubro {
  if (p.rubro) return p.rubro;
  if (p.kind === 'anulacion' && p.voidOfId && byId?.get(p.voidOfId)) return rubroOfPayment(byId.get(p.voidOfId)!, byId);
  switch (p.kind) {
    case 'cantina':
      return 'cantina';
    case 'tournament_fee':
      return 'torneos';
    case 'booking_full':
    case 'booking_deposit':
    case 'match_share':
    case 'refund':
      return 'cancha';
    default:
      return 'otros';
  }
}

/** Cobros que cuentan como plata del club (no la cuota de la plataforma ni los retiros). */
export const isMoneyIn = (p: PaymentRecord) => p.kind !== 'platform_subscription' && p.kind !== 'retiro';

// ---------- Cuponeras ----------

/** Valle: lunes a viernes antes de la hora pico del club. */
export function isValle(club: Club, date: string, startMinute: number) {
  const dow = getDayOfWeekFromISO(date);
  return dow >= 1 && dow <= 5 && startMinute < (club.nightFromHour ?? 19) * 60;
}

export const VALIDITY_LABEL: Record<PackValidity, string> = {
  todos: 'cualquier horario',
  valle: 'solo valle (lun a vie antes de la hora pico)',
  semana: 'solo lunes a viernes',
};

export function validityCovers(club: Club, v: PackValidity, date: string, startMinute: number) {
  if (v === 'todos') return true;
  const dow = getDayOfWeekFromISO(date);
  if (v === 'semana') return dow >= 1 && dow <= 5;
  return isValle(club, date, startMinute);
}

/**
 * ¿Esta cuponera paga esta parte o este turno? Decisión 3 (recomendada): si no cubre el horario,
 * no se puede usar (no se cobra diferencia).
 */
export function packUsableFor(params: { pack: ClientPack; club: Club; date: string; startMinute: number; unit: 'parte' | 'turno'; today: string }): { ok: boolean; reason: string } {
  const { pack, club, date, startMinute, unit, today } = params;
  if (pack.status !== 'active') return { ok: false, reason: 'Está anulada.' };
  if (pack.usesLeft <= 0) return { ok: false, reason: 'No le quedan usos.' };
  if (pack.expiresOn < today) return { ok: false, reason: `Venció el ${dmy(pack.expiresOn)}.` };
  if (pack.expiresOn < date) return { ok: false, reason: `Vence el ${dmy(pack.expiresOn)}, antes de este turno.` };
  if (pack.unit !== unit) return { ok: false, reason: pack.unit === 'turno' ? 'Es de turnos completos, no de partes.' : 'Es de partes de un jugador, no de turno completo.' };
  if (!validityCovers(club, pack.validity, date, startMinute)) return { ok: false, reason: `Vale ${VALIDITY_LABEL[pack.validity]}.` };
  return { ok: true, reason: '' };
}

/** Lo que el club ya cobró y todavía debe en canchas (proporcional a los usos que quedan). */
export const pendingValue = (p: ClientPack, today: string) =>
  p.status === 'active' && p.usesLeft > 0 && p.expiresOn >= today ? Math.round((p.price * p.usesLeft) / Math.max(1, p.usesTotal)) : 0;

export const expiredUnusedValue = (p: ClientPack) => (p.status === 'active' && p.usesLeft > 0 ? Math.round((p.price * p.usesLeft) / Math.max(1, p.usesTotal)) : 0);

export const packExpiresOn = (pt: PackType, soldOn: string) => addDaysISO(soldOn, Math.max(1, pt.days));

export const dmy = (iso: string) => (iso ? iso.split('-').reverse().slice(0, 2).join('/') : '');

// ---------- Deudas por ficha ----------

/**
 * Deudas con las fichas: las de siempre (consumos y canchas de turnos pasados) más las ventas
 * "a su cuenta" (clases, alquiler, otros), todas agrupadas por persona aunque haya bajado la app.
 */
export function clientDebts(params: {
  clients: ClubClient[];
  consumptions: Consumption[];
  bookings: Booking[];
  matches: ProposedMatch[];
  sales: Sale[];
  today: string;
  nowMinute: number;
  nameOf: (uid: string) => string;
}): (Debt & { saleIds: string[]; client?: ClubClient })[] {
  const { clients, sales, today, ...rest } = params;
  const resolve = keyResolver(clients);
  const base = debtsOf({ ...rest, today });
  const map = new Map<string, Debt & { saleIds: string[]; client?: ClubClient }>();
  const add = (key0: string, name: string, amount: number, since: string, extra: { c?: string[]; b?: string[]; s?: string[] }) => {
    if (amount <= 0) return;
    const key = resolve(key0);
    const client = clientByKey(clients, key);
    const d = map.get(key) ?? { key, name: client ? displayName(client) : name, amount: 0, since, consumptionIds: [], bookingIds: [], saleIds: [], client };
    d.amount += amount;
    if (since < d.since) d.since = since;
    (extra.c ?? []).forEach((x) => !d.consumptionIds.includes(x) && d.consumptionIds.push(x));
    (extra.b ?? []).forEach((x) => !d.bookingIds.includes(x) && d.bookingIds.push(x));
    (extra.s ?? []).forEach((x) => !d.saleIds.includes(x) && d.saleIds.push(x));
    map.set(key, d);
  };
  for (const d of base) add(d.key, d.name, d.amount, d.since, { c: d.consumptionIds, b: d.bookingIds });
  for (const s of sales) {
    if (s.status !== 'vigente' || s.paid || s.method !== 'cuenta' || !s.clientId) continue;
    add(`c:${s.clientId}`, s.clientName, s.amount, s.day, { s: [s.id] });
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount);
}

/** Participantes del turno con la ficha resuelta (para la cuponera y el saldo). */
export function participantsWithClients(booking: Booking, match: ProposedMatch | undefined, nameOf: (uid: string) => string, clients: ClubClient[]) {
  return participantsOf(booking, match, nameOf).map((p) => {
    const key = p.key.startsWith('g:') && booking.clientId ? `c:${booking.clientId}` : p.key;
    return { ...p, clientKey: key, client: clientByKey(clients, key) };
  });
}

// ---------- Libro de movimientos (W5) ----------

export interface LedgerRow {
  id: string;
  kind: 'cobro' | 'uso' | 'cuenta' | 'retiro' | 'anulacion';
  day: string;
  atMs: number;
  clientId: string;
  clientName: string;
  rubro: Rubro | 'retiro';
  concept: string;
  method: string;
  amount: number;
  invoice: 'pendiente' | 'emitida' | 'no_corresponde' | 'al_cobrar';
  invoiceNumber: string;
  voided: boolean;
  staffName: string;
  payment?: PaymentRecord;
  sale?: Sale;
}

const msOf = (v: unknown): number => {
  if (!v) return 0;
  if (typeof v === 'string') return new Date(v).getTime() || 0;
  if (typeof v === 'object' && v !== null && 'toMillis' in v && typeof (v as { toMillis: unknown }).toMillis === 'function') return (v as { toMillis: () => number }).toMillis();
  if (typeof v === 'object' && v !== null && 'seconds' in v) return Number((v as { seconds: number }).seconds) * 1000;
  if (v instanceof Date) return v.getTime();
  return 0;
};

export const METHOD_LABEL: Record<string, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  debito_club: 'Tarjeta',
  mercadopago: 'Mercado Pago',
  cuponera: 'Cuponera',
  saldo: 'Saldo a favor',
  cuenta: 'A su cuenta',
};

const KIND_CONCEPT: Record<PaymentRecord['kind'], string> = {
  booking_full: 'turno',
  booking_deposit: 'seña',
  match_share: 'parte',
  tournament_fee: 'inscripción',
  refund: 'devolución',
  platform_subscription: 'cuota',
  cantina: 'consumo',
  venta: 'venta',
  retiro: 'retiro de caja',
  anulacion: 'anulación',
};

/**
 * Una fila por cobro (plata que entra o sale) y una por venta pagada sin plata nueva (cuponera,
 * saldo) o que quedó a cuenta. Los usos de cuponera y saldo nunca facturan: ya se facturó al
 * vender la cuponera o al cargar el saldo.
 */
export function buildLedger(payments: PaymentRecord[], sales: Sale[], clients: ClubClient[], bookings: Booking[] = [], matches: ProposedMatch[] = []): LedgerRow[] {
  const byId = new Map(payments.map((p) => [p.id, p]));
  // Cobros viejos de cancha sin ficha: se busca la ficha por la reserva
  const bookingClient = new Map(bookings.filter((b) => b.clientId).map((b) => [b.id, b.clientId!]));
  const matchBooking = new Map(matches.map((m) => [m.id, m.bookingId]));
  const clientOfPayment = (p: PaymentRecord) => p.clientId || bookingClient.get(p.referenceId) || bookingClient.get(matchBooking.get(p.referenceId) ?? '') || '';
  const clientById = new Map(clients.map((c) => [c.id, c]));
  const saleByPayment = new Map<string, Sale[]>();
  sales.forEach((s) => s.paymentId && saleByPayment.set(s.paymentId, [...(saleByPayment.get(s.paymentId) ?? []), s]));
  const rows: LedgerRow[] = [];
  for (const p of payments) {
    if (p.kind === 'platform_subscription') continue;
    const cid = clientOfPayment(p);
    const c = cid ? clientById.get(cid) : undefined;
    const linked = saleByPayment.get(p.id);
    const rubro = rubroOfPayment(p, byId);
    const concept = linked?.length ? linked.map((s) => s.concept).join(', ') : p.kind === 'anulacion' ? `anulación${p.note ? `: ${p.note}` : ''}` : p.kind === 'retiro' ? `retiro${p.note ? `: ${p.note}` : ''}` : KIND_CONCEPT[p.kind];
    rows.push({
      id: p.id,
      kind: p.kind === 'retiro' ? 'retiro' : p.kind === 'anulacion' ? 'anulacion' : 'cobro',
      day: paymentDay(p),
      atMs: msOf(p.createdAt),
      clientId: cid,
      clientName: c ? displayName(c) : p.kind === 'retiro' ? p.staffName || p.payerName : p.payerName,
      rubro: p.kind === 'retiro' ? 'retiro' : rubro,
      concept,
      method: p.kind === 'retiro' ? 'Efectivo' : METHOD_LABEL[p.method] ?? p.method,
      amount: p.kind === 'retiro' ? -p.amount : p.amount,
      invoice: p.kind === 'retiro' ? 'no_corresponde' : p.invoiceStatus ?? 'pendiente',
      invoiceNumber: p.invoiceNumber ?? '',
      voided: !!p.voided,
      staffName: p.staffName ?? '',
      payment: p,
    });
  }
  for (const s of sales) {
    if (s.paymentId) continue; // ya está como cobro
    if (s.method !== 'cuponera' && s.method !== 'saldo' && s.method !== 'cuenta') continue;
    const c = s.clientId ? clientById.get(s.clientId) : undefined;
    rows.push({
      id: s.id,
      kind: s.method === 'cuenta' ? 'cuenta' : 'uso',
      day: s.day,
      atMs: msOf(s.createdAt),
      clientId: s.clientId,
      clientName: c ? displayName(c) : s.clientName,
      rubro: s.rubro,
      concept: s.concept,
      method: METHOD_LABEL[s.method],
      amount: s.method === 'cuenta' ? s.amount : 0,
      invoice: s.method === 'cuenta' ? 'al_cobrar' : 'no_corresponde',
      invoiceNumber: '',
      voided: s.status === 'anulada',
      staffName: s.staffName,
      sale: s,
    });
  }
  return rows.sort((a, b) => (a.day === b.day ? b.atMs - a.atMs : b.day.localeCompare(a.day)));
}

// ---------- Períodos ----------

export interface Period {
  id: 'semana' | 'mes' | 'mes_anterior' | 'rango';
  from: string;
  to: string;
  label: string;
}

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);

export function periodOf(id: Period['id'], today: string, range?: { from: string; to: string }): Period {
  if (id === 'semana') {
    const dow = getDayOfWeekFromISO(today);
    const from = addDaysISO(today, -((dow + 6) % 7));
    return { id, from, to: addDaysISO(from, 6), label: 'Esta semana' };
  }
  if (id === 'rango' && range) return { id, from: range.from, to: range.to, label: `${dmy(range.from)} al ${dmy(range.to)}` };
  const [y, m] = today.split('-').map(Number);
  const first = id === 'mes_anterior' ? new Date(Date.UTC(y, m - 2, 1)) : new Date(Date.UTC(y, m - 1, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0));
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const label = MONTHS[first.getUTCMonth()];
  return { id, from: iso(first), to: iso(last), label: label[0].toUpperCase() + label.slice(1) };
}

/** El período anterior del mismo largo (mes contra mes anterior). */
export function previousPeriod(p: Period): Period {
  if (p.id === 'mes' || p.id === 'mes_anterior') {
    const prev = periodOf('mes_anterior', p.from);
    return { ...prev, id: 'rango' };
  }
  const len = daysBetween(p.from, p.to) + 1;
  return { id: 'rango', from: addDaysISO(p.from, -len), to: addDaysISO(p.from, -1), label: 'período anterior' };
}

// ---------- Números del club (W6) ----------

export interface NumbersInput {
  club: Club;
  courts: Court[];
  clients: ClubClient[];
  bookings: Booking[];
  matches: ProposedMatch[];
  payments: PaymentRecord[];
  sales: Sale[];
  packs: ClientPack[];
  consumptions: Consumption[];
  cashDays: CashDay[];
  today: string;
  nowMinute: number;
  nameOf: (uid: string) => string;
}

export interface Named {
  key: string;
  name: string;
  detail?: string;
}

export interface ClubNumbers {
  period: Period;
  /** Último día que cuenta (hoy si el período sigue abierto). */
  upTo: string;
  altas: { total: number; sinApp: number; byOrigin: Record<ClientOrigin, number>; list: Named[] };
  activos: { total: number; conApp: number; conAppPct: number; list: Named[] };
  vuelven: { base: number; count: number; pct: number; list: Named[] };
  primeraVuelta: { base: number; count: number; pct: number; list: Named[] };
  dejaron: { count: number; list: Named[] };
  canchas: {
    capacity: number;
    played: number;
    occupancyPct: number;
    cancelled: number;
    noShows: number;
    byChannel: Record<'app' | 'telefono' | 'mostrador' | 'armado' | 'fijo' | 'torneo', number>;
    withPack: number;
    heat: { dow: number; startMinute: number; pct: number }[];
    slots: number[];
  };
  plata: {
    byRubro: Record<Rubro, number>;
    byMethod: Record<'efectivo' | 'transferencia' | 'debito_club' | 'mercadopago', number>;
    totalCobrado: number;
    paidWithBalance: number;
    ticketPorTurno: number;
    cashDiff: number;
    cashDiffDays: number;
    invoice: { emitida: number; pendiente: number; noCorresponde: number };
  };
  deuda: { total: number; people: number; aging: { lt7: number; d7to30: number; gt30: number }; list: Named[] };
  cuponeras: { sold: number; soldAmount: number; uses: number; expiredUnused: number; expiredUnusedValue: number; pendingValue: number; list: Named[] };
  saldoAFavor: number;
}

const emptyOrigins = (): Record<ClientOrigin, number> => ({ app: 0, mostrador: 0, telefono: 0, migracion: 0, falta_uno: 0, torneo: 0 });
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

/** Claves de los que jugaron cada turno (cuenta de la app o ficha) para contar clientes activos. */
function playedKeys(b: Booking, m: ProposedMatch | undefined, resolve: (k: string) => string): string[] {
  if (b.type === 'matched' && m) return m.slots.map((s) => resolve(s.uid));
  const keys = b.playerUids.filter(Boolean).map(resolve);
  if (b.clientId) keys.push(resolve(`c:${b.clientId}`));
  return [...new Set(keys)];
}

function activeKeysIn(input: NumbersInput, from: string, to: string, resolve: (k: string) => string): Set<string> {
  const { bookings, matches, payments, sales, consumptions, clients } = input;
  const set = new Set<string>();
  const inP = (d: string) => d >= from && d <= to;
  const matchByBooking = new Map(matches.map((m) => [m.bookingId, m]));
  for (const b of bookings) {
    if (b.status !== 'confirmed' || b.type === 'tournament' || !inP(b.date)) continue;
    playedKeys(b, matchByBooking.get(b.id), resolve).forEach((k) => set.add(k));
  }
  const byId = new Map(clients.map((c) => [c.id, c]));
  for (const p of payments) if (p.clientId && isMoneyIn(p) && inP(paymentDay(p)) && byId.get(p.clientId)) set.add(resolve(`c:${p.clientId}`));
  for (const s of sales) if (s.clientId && s.status === 'vigente' && inP(s.day)) set.add(resolve(`c:${s.clientId}`));
  for (const c of consumptions) if (c.status !== 'voided' && inP(c.date)) c.participantUids.filter((k) => !k.startsWith('g:')).forEach((k) => set.add(resolve(k)));
  return set;
}

export function computeNumbers(input: NumbersInput, period: Period): ClubNumbers {
  const { club, courts, clients, bookings, matches, payments, sales, packs, cashDays, today, nameOf } = input;
  const upTo = period.to < today ? period.to : addDaysISO(today, 0);
  const inP = (d: string) => d >= period.from && d <= upTo;
  const resolve = keyResolver(clients);
  const nameOfKey = (k: string) => {
    const c = clientByKey(clients, k);
    return c ? displayName(c) : k.startsWith('c:') || k.startsWith('g:') ? 'Cliente' : nameOf(k);
  };
  const named = (keys: Iterable<string>, detail?: (k: string) => string): Named[] =>
    [...keys].map((k) => ({ key: k, name: nameOfKey(k), detail: detail?.(k) })).sort((a, b) => a.name.localeCompare(b.name));
  const activeClients = clients.filter((c) => c.status === 'active' || c.mergedInto === undefined);

  // Clientes
  const altasList = activeClients.filter((c) => !c.mergedInto && inP(c.createdOn));
  const byOrigin = emptyOrigins();
  altasList.forEach((c) => (byOrigin[c.origin] += 1));
  const activeNow = activeKeysIn(input, period.from, upTo, resolve);
  const prev = previousPeriod(period);
  const activePrev = activeKeysIn(input, prev.from, prev.to, resolve);
  const back = [...activePrev].filter((k) => activeNow.has(k));
  const prevAltas = activeClients.filter((c) => !c.mergedInto && c.createdOn >= prev.from && c.createdOn <= prev.to);
  const firstBack = prevAltas.filter((c) => activeNow.has(clientKey(c)));
  const hasApp = (k: string) => !k.startsWith('c:') && !k.startsWith('g:');
  // Dejaron de venir: activos hace 30 a 90 días que no vinieron en los últimos 30 (siempre desde hoy)
  const recent = activeKeysIn(input, addDaysISO(today, -29), today, resolve);
  const older = activeKeysIn(input, addDaysISO(today, -89), addDaysISO(today, -30), resolve);
  const gone = [...older].filter((k) => !recent.has(k));
  const lastSeen = (k: string) => {
    let last = '';
    const matchByBooking = new Map(matches.map((m) => [m.bookingId, m]));
    for (const b of bookings) if (b.status === 'confirmed' && b.date <= today && b.date > last && playedKeys(b, matchByBooking.get(b.id), resolve).includes(k)) last = b.date;
    return last ? `último turno ${dmy(last)}` : '';
  };

  // Canchas
  const activeCourts = courts.filter((c) => c.active).length || club.courtCount || 1;
  const daySlots = generateDaySlots(club);
  const capacityBy = new Map<string, number>();
  const usedBy = new Map<string, number>();
  let days = 0;
  for (let d = period.from; d <= upTo; d = addDaysISO(d, 1)) {
    days += 1;
    const dow = getDayOfWeekFromISO(d);
    daySlots.forEach((s) => capacityBy.set(`${dow}-${s.startMinute}`, (capacityBy.get(`${dow}-${s.startMinute}`) ?? 0) + activeCourts));
  }
  const pb = bookings.filter((b) => inP(b.date));
  const played = pb.filter((b) => b.status === 'confirmed');
  played.forEach((b) => {
    const k = `${getDayOfWeekFromISO(b.date)}-${b.startMinute}`;
    usedBy.set(k, (usedBy.get(k) ?? 0) + 1);
  });
  const byChannel = { app: 0, telefono: 0, mostrador: 0, armado: 0, fijo: 0, torneo: 0 };
  const clientById = new Map(clients.map((c) => [c.id, c]));
  for (const b of played) {
    const fixed = (b as Booking & { fixedId?: string }).fixedId;
    if (fixed) byChannel.fijo += 1;
    else if (b.type === 'tournament') byChannel.torneo += 1;
    else if (b.type === 'matched') byChannel.armado += 1;
    else if (b.type === 'direct') byChannel.app += 1;
    else if ((b.clientId && clientById.get(b.clientId)?.origin === 'telefono') || b.guestName.includes(' · ')) byChannel.telefono += 1;
    else byChannel.mostrador += 1;
  }
  const capacity = days * daySlots.length * activeCourts;
  const heat = [...capacityBy.entries()].map(([k, cap]) => {
    const [dow, start] = k.split('-').map(Number);
    return { dow, startMinute: start, pct: pct(usedBy.get(k) ?? 0, cap) };
  });
  const periodSales = sales.filter((s) => s.status === 'vigente' && inP(s.day));
  const withPack = periodSales.filter((s) => s.method === 'cuponera').length;

  // Plata (cobros: lo que entró, por rubro y por medio)
  const byRubro: Record<Rubro, number> = { cancha: 0, cantina: 0, cuponeras: 0, saldo: 0, clases: 0, torneos: 0, alquiler: 0, otros: 0 };
  const byMethod = { efectivo: 0, transferencia: 0, debito_club: 0, mercadopago: 0 };
  const byId = new Map(payments.map((p) => [p.id, p]));
  const invoice = { emitida: 0, pendiente: 0, noCorresponde: 0 };
  for (const p of payments) {
    if (!isMoneyIn(p) || !inP(paymentDay(p))) continue;
    byRubro[rubroOfPayment(p, byId)] += p.amount;
    byMethod[p.method] = (byMethod[p.method] ?? 0) + p.amount;
    if (p.amount > 0 && !p.voided) {
      const st = p.invoiceStatus ?? 'pendiente';
      if (st === 'emitida') invoice.emitida += p.amount;
      else if (st === 'no_corresponde') invoice.noCorresponde += p.amount;
      else invoice.pendiente += p.amount;
    }
  }
  const totalCobrado = Object.values(byMethod).reduce((a, b) => a + b, 0);
  const paidWithBalance = periodSales.filter((s) => s.method === 'saldo').reduce((a, s) => a + s.amount, 0);
  const playedNoTournament = played.filter((b) => b.type !== 'tournament').length;
  const ticketPorTurno = playedNoTournament ? Math.round((byRubro.cancha + byRubro.cantina) / playedNoTournament) : 0;
  const closedDays = cashDays.filter((d) => d.status === 'closed' && inP(d.date));
  const cashDiff = closedDays.reduce((a, d) => a + (d.difference ?? 0), 0);

  // Deuda (siempre a hoy)
  const debts = clientDebts({ clients, consumptions: input.consumptions, bookings, matches, sales, today, nowMinute: input.nowMinute, nameOf });
  const aging = { lt7: 0, d7to30: 0, gt30: 0 };
  debts.forEach((d) => {
    const age = daysBetween(d.since, today);
    if (age < 7) aging.lt7 += d.amount;
    else if (age <= 30) aging.d7to30 += d.amount;
    else aging.gt30 += d.amount;
  });

  // Cuponeras
  const sold = packs.filter((p) => p.status === 'active' && inP(p.soldOn));
  const uses = packs.reduce((a, p) => a + p.uses.filter((u) => inP(u.date)).length, 0);
  const expired = packs.filter((p) => p.status === 'active' && p.usesLeft > 0 && p.expiresOn < today && inP(p.expiresOn));

  const count = (list: Named[]) => list.length;
  const altasNamed = altasList.map((c) => ({ key: c.id, name: displayName(c), detail: `${c.uid ? 'con app' : 'sin app'} · ${c.origin === 'app' ? 'por la app' : `por ${c.origin === 'falta_uno' ? 'Falta uno' : c.origin}`} · ${dmy(c.createdOn)}` }));
  const activosList = named(activeNow, (k) => (hasApp(k) ? 'con app' : 'sin app'));

  return {
    period,
    upTo,
    altas: { total: altasList.length, sinApp: altasList.filter((c) => !c.uid).length, byOrigin, list: altasNamed },
    activos: { total: count(activosList), conApp: [...activeNow].filter(hasApp).length, conAppPct: pct([...activeNow].filter(hasApp).length, activeNow.size), list: activosList },
    vuelven: { base: activePrev.size, count: back.length, pct: pct(back.length, activePrev.size), list: named(back) },
    primeraVuelta: { base: prevAltas.length, count: firstBack.length, pct: pct(firstBack.length, prevAltas.length), list: firstBack.map((c) => ({ key: c.id, name: displayName(c) })) },
    dejaron: { count: gone.length, list: named(gone, lastSeen) },
    canchas: {
      capacity,
      played: played.length,
      occupancyPct: pct(played.length, capacity),
      cancelled: pb.filter((b) => b.status === 'cancelled').length,
      noShows: pb.filter((b) => b.status === 'no_show').length,
      byChannel,
      withPack,
      heat,
      slots: daySlots.map((s) => s.startMinute),
    },
    plata: { byRubro, byMethod, totalCobrado, paidWithBalance, ticketPorTurno, cashDiff, cashDiffDays: closedDays.length, invoice },
    deuda: { total: debts.reduce((a, d) => a + d.amount, 0), people: debts.length, aging, list: debts.map((d) => ({ key: d.key, name: d.name, detail: `debe $ ${d.amount.toLocaleString('es-UY')} desde ${dmy(d.since)}` })) },
    cuponeras: {
      sold: sold.length,
      soldAmount: sold.reduce((a, p) => a + p.price, 0),
      uses,
      expiredUnused: expired.length,
      expiredUnusedValue: expired.reduce((a, p) => a + expiredUnusedValue(p), 0),
      pendingValue: packs.reduce((a, p) => a + pendingValue(p, today), 0),
      list: sold.map((p) => ({ key: p.id, name: p.clientName, detail: `${p.name} · quedan ${p.usesLeft} de ${p.usesTotal} · vence ${dmy(p.expiresOn)}` })),
    },
    saldoAFavor: clients.filter((c) => c.status === 'active').reduce((a, c) => a + (c.balance || 0), 0),
  };
}

/** Variación contra el período anterior, en puntos o en unidades. */
export const delta = (now: number, before: number) => now - before;

// ---------- Planillas (sección 7.2) ----------


const INVOICE_LABEL: Record<LedgerRow['invoice'], string> = { pendiente: 'Pendiente', emitida: 'Emitida', no_corresponde: 'No corresponde', al_cobrar: 'Al cobrar' };

/** 1. Movimientos del período, una fila por cobro o venta: para el contador. */
export function sheetMovimientos(rows: LedgerRow[], from: string, to: string): Sheet {
  const list = rows.filter((r) => r.day >= from && r.day <= to).sort((a, b) => (a.day === b.day ? a.atMs - b.atMs : a.day.localeCompare(b.day)));
  const hhmm = (ms: number) => (ms ? new Date(ms).toTimeString().slice(0, 5) : '');
  return {
    name: 'Movimientos',
    rows: [
      ['Fecha', 'Hora', 'Cliente', 'Rubro', 'Qué', 'Medio', 'Monto', 'Factura', 'N.º de comprobante', 'Cobró', 'Estado'],
      ...list.map((r) => [
        dmyFull(r.day),
        hhmm(r.atMs),
        r.clientName,
        r.rubro === 'retiro' ? 'Retiro de caja' : RUBRO_NAMES[r.rubro],
        r.concept,
        r.method,
        r.amount,
        INVOICE_LABEL[r.invoice],
        r.invoiceNumber,
        r.staffName,
        r.voided ? 'Anulado' : 'Vigente',
      ]),
    ],
  };
}

const RUBRO_NAMES: Record<Rubro, string> = { cancha: 'Cancha', cantina: 'Cantina', cuponeras: 'Cuponeras', saldo: 'Carga de saldo', clases: 'Clases', torneos: 'Torneos', alquiler: 'Alquiler', otros: 'Otros' };
export const dmyFull = (iso: string) => (iso ? iso.split('-').reverse().join('/') : '');

/** 2. Resumen por día: cobros por rubro y por medio. El que usa el contador para la DGI en fase 1. */
export function sheetResumenDiario(payments: PaymentRecord[], from: string, to: string): Sheet {
  const byId = new Map(payments.map((p) => [p.id, p]));
  const rubros = Object.keys(RUBRO_NAMES) as Rubro[];
  const methods = ['efectivo', 'transferencia', 'debito_club', 'mercadopago'] as const;
  const days = new Map<string, { r: Record<string, number>; m: Record<string, number>; total: number; facturado: number }>();
  for (const p of payments) {
    if (!isMoneyIn(p)) continue;
    const d = paymentDay(p);
    if (d < from || d > to) continue;
    const row = days.get(d) ?? { r: {}, m: {}, total: 0, facturado: 0 };
    const rb = rubroOfPayment(p, byId);
    row.r[rb] = (row.r[rb] ?? 0) + p.amount;
    row.m[p.method] = (row.m[p.method] ?? 0) + p.amount;
    row.total += p.amount;
    if (p.invoiceStatus === 'emitida') row.facturado += p.amount;
    days.set(d, row);
  }
  const sorted = [...days.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  return {
    name: 'Resumen por día',
    rows: [
      ['Fecha', ...rubros.map((r) => RUBRO_NAMES[r]), 'Efectivo', 'Transferencia', 'Tarjeta', 'Mercado Pago', 'Total cobrado', 'Con factura emitida'],
      ...sorted.map(([d, v]) => [dmyFull(d), ...rubros.map((r) => v.r[r] ?? 0), ...methods.map((m) => v.m[m] ?? 0), v.total, v.facturado]),
    ],
  };
}

/** 3. Clientes: solo el dueño, y queda registrado quién la bajó (datos personales). */
export function sheetClientes(clients: ClubClient[], debts: { key: string; amount: number }[], lastVisit: (c: ClubClient) => string): Sheet {
  const debtBy = new Map(debts.map((d) => [d.key, d.amount]));
  return {
    name: 'Clientes',
    rows: [
      ['Nombre', 'Celular', 'Mail', 'Categoría', 'Con app', 'Cómo llegó', 'Alta', 'Última visita', 'Debe', 'Saldo a favor', 'Acepta novedades', 'RUT', 'Razón social'],
      ...clients
        .filter((c) => c.status === 'active' && !c.erased)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((c) => [
          c.name,
          formatPhone(c.phone),
          c.email,
          c.category ? `${c.category}ª` : '',
          c.uid ? 'Sí' : 'No',
          ORIGIN_LABEL[c.origin],
          dmyFull(c.createdOn),
          dmyFull(lastVisit(c)),
          debtBy.get(clientKey(c)) ?? 0,
          c.balance || 0,
          c.acceptsNews ? 'Sí' : 'No',
          c.rut,
          c.businessName,
        ]),
    ],
  };
}

/** 4. Cuponeras: vendidas, usos y vencimientos. */
export function sheetCuponeras(packs: ClientPack[], today: string): Sheet {
  return {
    name: 'Cuponeras',
    rows: [
      ['Cliente', 'Cuponera', 'Vendida', 'Precio', 'Usos', 'Usados', 'Quedan', 'Vence', 'Estado', 'Pendiente de uso ($)'],
      ...[...packs]
        .sort((a, b) => b.soldOn.localeCompare(a.soldOn))
        .map((p) => [
          p.clientName,
          p.name,
          dmyFull(p.soldOn),
          p.price,
          p.usesTotal,
          p.usesTotal - p.usesLeft,
          p.usesLeft,
          dmyFull(p.expiresOn),
          p.status === 'voided' ? 'Anulada' : p.usesLeft === 0 ? 'Usada' : p.expiresOn < today ? 'Venció sin usar' : 'Vigente',
          pendingValue(p, today),
        ]),
    ],
  };
}
