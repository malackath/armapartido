/**
 * Caja del día, cantina, turnos fijos, seña e informe mensual: lecturas y escrituras en Firestore.
 * Colecciones nuevas dentro de cada club: products, consumptions, cashDays, fixedBookings,
 * recoveries (solo servidor) y monthlyReports (solo servidor).
 */
import {
  arrayUnion,
  collection,
  doc,
  increment,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import type { Booking, Club, Court, PaymentRecord, ProposedMatch } from '../types/padel';
import type { CashDay, Consumption, DepositRule, FixedBooking, MonthlyReport, Product, Recovery } from '../types/caja';
import { addDaysISO, calculateSlotPrice, getDayOfWeekFromISO } from '../lib/padelUtils';
import { consumptionDue, splitEven, type ParticipantAccount } from '../lib/caja';
import { markBookingPaidAtCounter, markMatchSharesPaidAtCounter, type CounterPaymentMethod } from './firestoreService';

const makeId = (prefix: string) => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const col = (clubId: string, name: string) => collection(db, 'clubs', clubId, name);
const ref = (clubId: string, name: string, id: string) => doc(db, 'clubs', clubId, name, id);

export interface Staff {
  uid: string;
  name: string;
}

// ---------- Lecturas ----------

export interface OpsCallbacks {
  onProducts?: (v: Product[]) => void;
  onConsumptions?: (v: Consumption[]) => void;
  onCashDays?: (v: CashDay[]) => void;
  onFixed?: (v: FixedBooking[]) => void;
  onRecoveries?: (v: Recovery[]) => void;
  onReports?: (v: MonthlyReport[]) => void;
  onAllPayments?: (v: PaymentRecord[]) => void;
}

/** Para el Mostrador y el Admin (encargados y dueño). */
export function subscribeClubOps(clubId: string, cb: OpsCallbacks): Unsubscribe[] {
  const subs: Unsubscribe[] = [];
  const watch = <T,>(name: string, fn?: (v: T[]) => void) => {
    if (!fn) return;
    subs.push(
      onSnapshot(
        query(col(clubId, name), where('clubId', '==', clubId)),
        (snap) => fn(snap.docs.map((d) => d.data() as T)),
        (err) => handleFirestoreError(err, OperationType.LIST, `clubs/${clubId}/${name}`)
      )
    );
  };
  watch<Product>('products', cb.onProducts);
  watch<Consumption>('consumptions', cb.onConsumptions);
  watch<CashDay>('cashDays', cb.onCashDays);
  watch<FixedBooking>('fixedBookings', cb.onFixed);
  watch<Recovery>('recoveries', cb.onRecoveries);
  watch<MonthlyReport>('monthlyReports', cb.onReports);
  watch<PaymentRecord>('payments', cb.onAllPayments);
  return subs;
}

/** Para la app del jugador: solo los consumos donde participa. */
export function subscribeMyConsumptions(clubId: string, uid: string, fn: (v: Consumption[]) => void): Unsubscribe {
  return onSnapshot(
    query(col(clubId, 'consumptions'), where('participantUids', 'array-contains', uid)),
    (snap) => fn(snap.docs.map((d) => d.data() as Consumption)),
    (err) => handleFirestoreError(err, OperationType.LIST, `clubs/${clubId}/consumptions`)
  );
}

// ---------- Productos y stock ----------

export async function saveProduct(club: Club, p: Partial<Product> & { name: string; price: number }) {
  const id = p.id || makeId('prod');
  const data: Product = {
    id,
    clubId: club.id,
    name: p.name.trim().slice(0, 60),
    price: Math.max(0, Math.round(p.price)),
    stock: p.stock === undefined ? null : p.stock,
    minStock: Math.max(0, Math.round(p.minStock ?? 0)),
    active: p.active ?? true,
    order: p.order ?? Date.now(),
  };
  try {
    await setDoc(ref(club.id, 'products', id), { ...data, updatedAt: serverTimestamp(), ...(p.id ? {} : { createdAt: serverTimestamp() }) }, { merge: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `clubs/${club.id}/products/${id}`);
  }
}

/** Suma (o resta, con motivo) stock a varios productos de una vez. */
export async function adjustStock(club: Club, changes: { productId: string; qty: number }[]) {
  const batch = writeBatch(db);
  changes.filter((c) => c.qty !== 0).forEach((c) => batch.update(ref(club.id, 'products', c.productId), { stock: increment(c.qty), updatedAt: serverTimestamp() }));
  await batch.commit();
}

// ---------- Consumos ----------

export async function addConsumption(params: {
  club: Club;
  product: Product;
  qty: number;
  date: string;
  bookingId: string;
  shared: boolean;
  participants: { key: string; name: string }[]; // si no es compartido, uno solo
  staff: Staff;
  paid?: boolean;
}): Promise<Consumption> {
  const { club, product, qty, date, bookingId, shared, participants, staff, paid } = params;
  const id = makeId('cons');
  const c: Consumption = {
    id,
    clubId: club.id,
    productId: product.id,
    productName: product.name,
    unitPrice: product.price,
    qty,
    total: product.price * qty,
    bookingId,
    date,
    shared,
    forUid: !shared && participants[0] && !participants[0].key.startsWith('g:') ? participants[0].key : '',
    forName: shared ? 'Todos' : participants[0]?.name ?? 'Venta rápida',
    participantUids: participants.map((p) => p.key),
    participantNames: participants.map((p) => p.name),
    paidUids: [],
    status: paid ? 'paid' : 'pending',
    createdByUid: staff.uid,
  };
  const batch = writeBatch(db);
  batch.set(ref(club.id, 'consumptions', id), { ...c, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  if (product.stock !== null) batch.update(ref(club.id, 'products', product.id), { stock: increment(-qty), updatedAt: serverTimestamp() });
  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `clubs/${club.id}/consumptions/${id}`);
  }
  return c;
}

/** Anula un consumo cargado por error y devuelve el stock. */
export async function voidConsumption(club: Club, c: Consumption, products: Product[]) {
  const batch = writeBatch(db);
  batch.update(ref(club.id, 'consumptions', c.id), { status: 'voided', updatedAt: serverTimestamp() });
  const p = products.find((x) => x.id === c.productId);
  if (p && p.stock !== null) batch.update(ref(club.id, 'products', p.id), { stock: increment(c.qty), updatedAt: serverTimestamp() });
  await batch.commit();
}

// ---------- Cobros ----------

const newPayment = (
  club: Club,
  staff: Staff,
  day: string,
  fields: Pick<PaymentRecord, 'payerName' | 'referenceId' | 'amount' | 'method' | 'kind'> & Partial<PaymentRecord>
) => {
  const id = makeId('pay');
  return {
    id,
    clubId: club.id,
    uid: staff.uid,
    clubOwnerUid: club.ownerUid,
    status: 'completed' as const,
    day,
    staffName: staff.name.slice(0, 60),
    ...fields,
    payerName: (fields.payerName || 'Cliente').slice(0, 80),
    createdAt: serverTimestamp(),
  };
};

/** Marca pagas las partes de consumo de una persona (y deja el consumo pago cuando pagaron todos). */
function markConsumptionsPaidFor(
  batch: ReturnType<typeof writeBatch>,
  club: Club,
  list: Consumption[],
  key: string,
  localPaid: Map<string, string[]> = new Map()
) {
  let total = 0;
  for (const c0 of list) {
    const c = { ...c0, paidUids: localPaid.get(c0.id) ?? c0.paidUids };
    const due = consumptionDue(c, key);
    if (due <= 0) continue;
    total += due;
    if (!c.shared) {
      batch.update(ref(club.id, 'consumptions', c.id), { status: 'paid', updatedAt: serverTimestamp() });
    } else {
      const paidAfter = [...c.paidUids, key];
      localPaid.set(c.id, paidAfter);
      const allPaid = c.participantUids.every((u) => paidAfter.includes(u));
      batch.update(ref(club.id, 'consumptions', c.id), {
        paidUids: arrayUnion(key),
        ...(allPaid ? { status: 'paid' } : {}),
        updatedAt: serverTimestamp(),
      });
    }
  }
  return total;
}

/**
 * Cobra la cuenta del turno a las personas elegidas: su parte de cancha (con las funciones de
 * siempre) y su parte de la cantina (un cobro "cantina" por persona).
 */
export async function chargeAccounts(params: {
  club: Club;
  booking: Booking;
  match?: ProposedMatch;
  accounts: ParticipantAccount[];
  keys: string[];
  consumptions: Consumption[];
  method: CounterPaymentMethod;
  staff: Staff;
  day: string;
  afterClose: boolean;
}) {
  const { club, booking, match, accounts, keys, consumptions, method, staff, day, afterClose } = params;
  const chosen = accounts.filter((a) => keys.includes(a.key));
  // Cancha
  if (booking.type === 'matched' && match) {
    const payers = chosen.filter((a) => a.canchaDue > 0).map((a) => a.key);
    if (payers.length) await markMatchSharesPaidAtCounter({ club, match, booking, payerUids: payers, staffUid: staff.uid, method });
  } else if (chosen.some((a) => a.canchaDue > 0)) {
    await markBookingPaidAtCounter({ club, booking, staffUid: staff.uid, method });
  }
  // Cantina
  const batch = writeBatch(db);
  const localPaid = new Map<string, string[]>();
  let any = false;
  for (const a of chosen) {
    const amount = markConsumptionsPaidFor(batch, club, consumptions, a.key, localPaid);
    if (amount > 0) {
      const p = newPayment(club, staff, day, { payerName: a.name, referenceId: booking.id, amount, method, kind: 'cantina', ...(afterClose ? { afterClose: true } : {}) });
      batch.set(ref(club.id, 'payments', p.id), p);
      any = true;
    }
  }
  if (any) await batch.commit();
}

/** Venta rápida en el mostrador, sin turno: se cobra en el momento. */
export async function quickSale(params: {
  club: Club;
  items: { product: Product; qty: number }[];
  buyerName: string;
  method: CounterPaymentMethod;
  staff: Staff;
  day: string;
  afterClose: boolean;
}) {
  const { club, items, buyerName, method, staff, day, afterClose } = params;
  const batch = writeBatch(db);
  let total = 0;
  const saleId = makeId('venta');
  for (const { product, qty } of items) {
    if (qty <= 0) continue;
    const id = makeId('cons');
    total += product.price * qty;
    const c: Consumption = {
      id,
      clubId: club.id,
      productId: product.id,
      productName: product.name,
      unitPrice: product.price,
      qty,
      total: product.price * qty,
      bookingId: '',
      date: day,
      shared: false,
      forUid: '',
      forName: buyerName || 'Venta rápida',
      participantUids: [`g:${saleId}`],
      participantNames: [buyerName || 'Venta rápida'],
      paidUids: [],
      status: 'paid',
      createdByUid: staff.uid,
    };
    batch.set(ref(club.id, 'consumptions', id), { ...c, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    if (product.stock !== null) batch.update(ref(club.id, 'products', product.id), { stock: increment(-qty), updatedAt: serverTimestamp() });
  }
  if (total <= 0) return 0;
  const p = newPayment(club, staff, day, { payerName: buyerName || 'Venta rápida', referenceId: saleId, amount: total, method, kind: 'cantina', ...(afterClose ? { afterClose: true } : {}) });
  batch.set(ref(club.id, 'payments', p.id), p);
  await batch.commit();
  return total;
}

/** Cobra todo lo que debe una persona (consumos pendientes y canchas de turnos pasados). */
export async function payDebt(params: {
  club: Club;
  debtKey: string;
  debtName: string;
  consumptions: Consumption[];
  bookings: Booking[];
  matches: ProposedMatch[];
  method: CounterPaymentMethod;
  staff: Staff;
  day: string;
  afterClose: boolean;
}) {
  const { club, debtKey, debtName, consumptions, bookings, matches, method, staff, day, afterClose } = params;
  for (const b of bookings) {
    const match = matches.find((m) => m.bookingId === b.id);
    if (b.type === 'matched' && match) {
      await markMatchSharesPaidAtCounter({ club, match, booking: b, payerUids: [debtKey], staffUid: staff.uid, method });
    } else {
      await markBookingPaidAtCounter({ club, booking: b, staffUid: staff.uid, method });
    }
  }
  const batch = writeBatch(db);
  const amount = markConsumptionsPaidFor(batch, club, consumptions, debtKey);
  if (amount > 0) {
    const p = newPayment(club, staff, day, { payerName: debtName, referenceId: 'deuda', amount, method, kind: 'cantina', note: 'Pago de lo que debía', ...(afterClose ? { afterClose: true } : {}) });
    batch.set(ref(club.id, 'payments', p.id), p);
    await batch.commit();
  }
}

// ---------- Caja del día ----------

export async function openCashDay(club: Club, date: string, openingFloat: number, staff: Staff) {
  const data: CashDay = {
    id: date,
    clubId: club.id,
    date,
    openingFloat: Math.max(0, Math.round(openingFloat)),
    openedByUid: staff.uid,
    openedByName: staff.name,
    status: 'open',
  };
  await setDoc(ref(club.id, 'cashDays', date), { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
}

export async function closeCashDay(params: {
  club: Club;
  cashDay: CashDay;
  expectedCash: number;
  countedCash: number;
  note: string;
  totals: Record<string, number>;
  staff: Staff;
}) {
  const { club, cashDay, expectedCash, countedCash, note, totals, staff } = params;
  await setDoc(
    ref(club.id, 'cashDays', cashDay.date),
    {
      ...cashDay,
      status: 'closed',
      closedByUid: staff.uid,
      closedByName: staff.name,
      closedAtISO: new Date().toISOString(),
      expectedCash,
      countedCash,
      difference: countedCash - expectedCash,
      note: note.trim().slice(0, 300),
      totals,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function addWithdrawal(club: Club, amount: number, note: string, staff: Staff, day: string) {
  const p = newPayment(club, staff, day, { payerName: staff.name, referenceId: 'retiro', amount: Math.round(amount), method: 'efectivo', kind: 'retiro', note: note.trim().slice(0, 120) });
  await setDoc(ref(club.id, 'payments', p.id), p);
}

/**
 * Anula un cobro: no se borra, se agrega un movimiento negativo con el motivo y el original queda
 * marcado. Si era una cancha, el turno vuelve a quedar por cobrar.
 */
export async function voidPayment(params: { club: Club; payment: PaymentRecord; reason: string; staff: Staff; day: string; bookings: Booking[]; matches: ProposedMatch[] }) {
  const { club, payment, reason, staff, day, bookings, matches } = params;
  const batch = writeBatch(db);
  const p = newPayment(club, staff, day, {
    payerName: payment.payerName,
    referenceId: payment.referenceId,
    amount: -payment.amount,
    method: payment.method,
    kind: 'anulacion',
    note: reason.trim().slice(0, 120),
    voidOfId: payment.id,
  });
  batch.set(ref(club.id, 'payments', p.id), p);
  batch.update(ref(club.id, 'payments', payment.id), { voided: true });
  if (payment.kind === 'booking_full') {
    const b = bookings.find((x) => x.id === payment.referenceId);
    if (b) {
      const paid = Math.max(0, b.paidAmount - payment.amount);
      batch.update(ref(club.id, 'bookings', b.id), { paidAmount: paid, paymentStatus: paid > 0 ? 'deposit_paid' : 'pending', updatedAt: serverTimestamp() });
    }
  }
  if (payment.kind === 'match_share') {
    const m = matches.find((x) => x.id === payment.referenceId);
    const slot = m?.slots.find((s) => s.paid && s.displayName.slice(0, 80) === payment.payerName);
    if (m && slot) {
      const slots = m.slots.map((s) => (s.uid === slot.uid ? { ...s, paid: false } : s));
      batch.update(ref(club.id, 'proposedMatches', m.id), { slots, updatedAt: serverTimestamp() });
      const b = bookings.find((x) => x.id === m.bookingId);
      if (b) {
        const paidCount = slots.filter((s) => s.paid).length;
        batch.update(ref(club.id, 'bookings', b.id), { paidAmount: paidCount * m.pricePerPlayer, paymentStatus: paidCount ? 'deposit_paid' : 'pending', updatedAt: serverTimestamp() });
      }
    }
  }
  await batch.commit();
}

// ---------- Turnos fijos ----------

/**
 * Crea un turno fijo y genera las reservas de cada semana hasta untilDate (máximo 26 semanas).
 * Las semanas en que la cancha ya está ocupada se saltean y se devuelven para avisar.
 */
export async function createFixedBooking(params: {
  club: Club;
  court: Court;
  fromDate: string;
  untilDate: string;
  startMinute: number;
  holderName: string;
  phone: string;
  holderUid?: string;
  staff: Staff;
  existing: Booking[];
}): Promise<{ created: string[]; skipped: string[] }> {
  const { club, court, fromDate, untilDate, startMinute, holderName, phone, holderUid, staff, existing } = params;
  const dur = club.slotDurationMinutes || 90;
  const endMinute = startMinute + dur;
  const fixedId = makeId('fijo');
  const created: string[] = [];
  const skipped: string[] = [];
  const batch = writeBatch(db);
  const name = phone.trim() ? `${holderName.trim().slice(0, 55)} · ${phone.trim().slice(0, 20)}` : holderName.trim().slice(0, 78);
  let date = fromDate;
  for (let i = 0; i < 26 && date <= untilDate; i += 1, date = addDaysISO(date, 7)) {
    const taken = existing.some(
      (b) => b.courtId === court.id && b.date === date && b.status !== 'cancelled' && b.startMinute < endMinute && b.endMinute > startMinute
    );
    if (taken) {
      skipped.push(date);
      continue;
    }
    const id = makeId('bk');
    batch.set(ref(club.id, 'bookings', id), {
      id,
      clubId: club.id,
      courtId: court.id,
      courtName: court.name,
      date,
      startMinute,
      endMinute,
      type: 'counter',
      status: 'confirmed',
      createdByUid: staff.uid,
      playerUids: holderUid ? [holderUid] : [],
      guestName: name,
      totalPrice: calculateSlotPrice(club, date, startMinute),
      paidAmount: 0,
      paymentMethod: 'club',
      paymentStatus: 'pending',
      holdExpiresAt: '',
      fixedId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    created.push(id);
  }
  const fixed: FixedBooking = {
    id: fixedId,
    clubId: club.id,
    courtId: court.id,
    courtName: court.name,
    dayOfWeek: getDayOfWeekFromISO(fromDate),
    startMinute,
    endMinute,
    holderName: holderName.trim().slice(0, 60),
    holderUid: holderUid || '',
    phone: phone.trim().slice(0, 20),
    fromDate,
    untilDate,
    active: true,
    bookingIds: created,
    createdByUid: staff.uid,
  };
  batch.set(ref(club.id, 'fixedBookings', fixedId), { ...fixed, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  await batch.commit();
  return { created, skipped };
}

/** Termina un turno fijo: cancela sus reservas desde hoy en adelante. */
export async function endFixedBooking(club: Club, fixed: FixedBooking, bookings: Booking[], today: string) {
  const batch = writeBatch(db);
  bookings
    .filter((b) => fixed.bookingIds.includes(b.id) && b.date >= today && b.status === 'confirmed')
    .forEach((b) => batch.update(ref(club.id, 'bookings', b.id), { status: 'cancelled', updatedAt: serverTimestamp() }));
  batch.update(ref(club.id, 'fixedBookings', fixed.id), { active: false, untilDate: addDaysISO(today, -1), updatedAt: serverTimestamp() });
  await batch.commit();
}

// ---------- Ajustes del club ----------

export async function saveDepositRule(club: Club, rule: DepositRule) {
  await updateDoc(doc(db, 'clubs', club.id), { deposit: rule, updatedAt: serverTimestamp() });
}

export async function saveReportEmails(club: Club, emails: string[]) {
  await updateDoc(doc(db, 'clubs', club.id), { reportEmails: emails, updatedAt: serverTimestamp() });
}

export const DEFAULT_DEPOSIT: DepositRule = { enabled: false, days: [1, 2, 3, 4, 5], fromHour: 19, toHour: 23, amount: 500, holdMinutes: 15 };

export { splitEven };
