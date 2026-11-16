/**
 * Ficha de cliente, cuponeras, saldo a favor, venta suelta y casilla de factura: lecturas y
 * escrituras en Firestore. Colecciones nuevas dentro de cada club: clients, packTypes, clientPacks,
 * sales y exportLogs. Especificación: Paddle.URU/docs/especificacion-clientes-ventas-kpis.md
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
import type { Booking, Club, ClubMembership, PaymentRecord, ProposedMatch } from '../types/padel';
import type { Consumption, Product } from '../types/caja';
import type { ClientOrigin, ClientPack, ClubClient, ExportLog, InvoiceStatus, PackType, Rubro, Sale, SaleMethod } from '../types/clientes';
import { consumptionDue } from '../lib/caja';
import { formatPhone, keyResolver, normalizeEmail, normalizePhone, packExpiresOn } from '../lib/clientes';
import type { CounterPaymentMethod } from './firestoreService';
import { payDebt, type Staff } from './cajaService';

const makeId = (prefix: string) => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const col = (clubId: string, name: string) => collection(db, 'clubs', clubId, name);
const ref = (clubId: string, name: string, id: string) => doc(db, 'clubs', clubId, name, id);
type Batch = ReturnType<typeof writeBatch>;

// ---------- Lecturas ----------

export interface ClientesCallbacks {
  onClients?: (v: ClubClient[]) => void;
  onPackTypes?: (v: PackType[]) => void;
  onPacks?: (v: ClientPack[]) => void;
  onSales?: (v: Sale[]) => void;
}

/** Para el Mostrador y el Admin (encargados y dueño). */
export function subscribeClientes(clubId: string, cb: ClientesCallbacks): Unsubscribe[] {
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
  watch<ClubClient>('clients', cb.onClients);
  watch<PackType>('packTypes', cb.onPackTypes);
  watch<ClientPack>('clientPacks', cb.onPacks);
  watch<Sale>('sales', cb.onSales);
  return subs;
}

// ---------- Fichas ----------

export interface NewClientInput {
  name: string;
  phone: string;
  noPhone: boolean;
  email: string;
  category?: number | null;
  origin: ClientOrigin;
  noticeGiven: boolean;
  acceptsNews: boolean;
  uid?: string;
  reviewDuplicate?: boolean;
}

export function buildClient(club: Club, input: NewClientInput, staff: Staff, today: string): ClubClient {
  return {
    // La ficha de un jugador de la app tiene id fijo: así el servidor y el mostrador no crean dos
    id: input.uid && input.origin === 'app' ? `u_${input.uid}` : makeId('cli'),
    clubId: club.id,
    name: input.name.trim().replace(/\s+/g, ' ').slice(0, 80),
    phone: input.noPhone ? '' : normalizePhone(input.phone),
    noPhone: input.noPhone,
    email: normalizeEmail(input.email).slice(0, 120),
    category: input.category ?? null,
    uid: input.uid ?? '',
    ...(input.uid ? { linkedBy: 'mostrador' as const, linkedAtISO: new Date().toISOString() } : {}),
    origin: input.origin,
    createdByUid: staff.uid,
    createdByName: staff.name.slice(0, 60),
    createdOn: today,
    noticeGiven: input.noticeGiven,
    acceptsNews: input.acceptsNews,
    rut: '',
    businessName: '',
    note: '',
    balance: 0,
    status: 'active',
    ...(input.reviewDuplicate ? { reviewDuplicate: true } : {}),
  };
}

/** Alta rápida (W2). Si el encargado dijo "No, es otra" con un celular repetido, marca las dos. */
export async function createClient(club: Club, input: NewClientInput, staff: Staff, today: string, alsoFlag: string[] = []): Promise<ClubClient> {
  const c = buildClient(club, input, staff, today);
  const batch = writeBatch(db);
  batch.set(ref(club.id, 'clients', c.id), { ...c, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  alsoFlag.forEach((id) => batch.update(ref(club.id, 'clients', id), { reviewDuplicate: true, updatedAt: serverTimestamp() }));
  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `clubs/${club.id}/clients/${c.id}`);
  }
  return c;
}

/** Un jugador de la app que todavía no tiene ficha en este club: se crea unida a su cuenta. */
export async function createClientForMember(club: Club, m: ClubMembership, staff: Staff, today: string): Promise<ClubClient> {
  return createClient(club, { name: m.displayName, phone: '', noPhone: true, email: '', category: m.category, origin: 'app', noticeGiven: true, acceptsNews: false, uid: m.uid }, staff, today);
}

export type ClientPatch = Partial<Pick<ClubClient, 'name' | 'phone' | 'noPhone' | 'email' | 'category' | 'noticeGiven' | 'acceptsNews' | 'rut' | 'businessName' | 'note' | 'reviewDuplicate' | 'invitedAtISO'>>;

export async function updateClient(club: Club, id: string, patch: ClientPatch) {
  const clean: Record<string, unknown> = { ...patch, updatedAt: serverTimestamp() };
  if (patch.name !== undefined) clean.name = patch.name.trim().replace(/\s+/g, ' ').slice(0, 80);
  if (patch.phone !== undefined) clean.phone = patch.noPhone ? '' : normalizePhone(patch.phone);
  if (patch.email !== undefined) clean.email = normalizeEmail(patch.email).slice(0, 120);
  if (patch.note !== undefined) clean.note = patch.note.trim().slice(0, 140);
  if (patch.rut !== undefined) clean.rut = patch.rut.replace(/[^\d]/g, '').slice(0, 12);
  if (patch.businessName !== undefined) clean.businessName = patch.businessName.trim().slice(0, 80);
  await updateDoc(ref(club.id, 'clients', id), clean);
}

/**
 * Une la ficha con la cuenta de la app (confirmado por el encargado mirando a la persona, o por mail
 * verificado en el servidor). Lo pendiente de antes pasa a su cuenta para que lo vea en "Mi cuenta":
 * los consumos con la clave de la ficha y las reservas a su nombre.
 */
export async function linkClientToUser(club: Club, client: ClubClient, uid: string, by: 'mostrador' | 'qr' | 'mail', ctx: { consumptions?: Consumption[]; bookings?: Booking[]; packs?: ClientPack[] } = {}) {
  const batch = writeBatch(db);
  batch.update(ref(club.id, 'clients', client.id), { uid, linkedBy: by, linkedAtISO: new Date().toISOString(), updatedAt: serverTimestamp() });
  const old = `c:${client.id}`;
  (ctx.consumptions ?? [])
    .filter((c) => c.status === 'pending' && c.participantUids.includes(old))
    .forEach((c) =>
      batch.update(ref(club.id, 'consumptions', c.id), {
        participantUids: c.participantUids.map((u) => (u === old ? uid : u)),
        paidUids: c.paidUids.map((u) => (u === old ? uid : u)),
        ...(c.forUid === '' && !c.shared ? { forUid: uid } : {}),
        updatedAt: serverTimestamp(),
      })
    );
  (ctx.packs ?? []).filter((p) => p.clientId === client.id).forEach((p) => batch.update(ref(club.id, 'clientPacks', p.id), { uid, updatedAt: serverTimestamp() }));
  (ctx.bookings ?? [])
    .filter((b) => b.clientId === client.id && b.type === 'counter' && b.playerUids.length === 0 && (b.status === 'confirmed' || b.status === 'held'))
    .forEach((b) => batch.update(ref(club.id, 'bookings', b.id), { playerUids: [uid], updatedAt: serverTimestamp() }));
  await batch.commit();
}

/** Para la app del jugador: su ficha en este club (saldo a favor) y sus cuponeras. */
export function subscribeMyClientData(clubId: string, uid: string, fn: (v: { clients: ClubClient[]; packs: ClientPack[] }) => void): Unsubscribe {
  let packUnsub: Unsubscribe | null = null;
  const unsub = onSnapshot(
    query(col(clubId, 'clients'), where('uid', '==', uid)),
    (snap) => {
      const clients = snap.docs.map((d) => d.data() as ClubClient);
      packUnsub?.();
      packUnsub = null;
      if (!clients.length) return fn({ clients, packs: [] });
      packUnsub = onSnapshot(
        query(col(clubId, 'clientPacks'), where('uid', '==', uid)),
        (ps) => fn({ clients, packs: ps.docs.map((d) => d.data() as ClientPack) }),
        () => fn({ clients, packs: [] })
      );
    },
    () => fn({ clients: [], packs: [] })
  );
  return () => {
    unsub();
    packUnsub?.();
  };
}

/**
 * Unir dos fichas de la misma persona: la otra queda archivada con "unida a…". No se borra nada:
 * los movimientos viejos siguen apuntando a la ficha archivada y se leen como de la que queda.
 * Pasan las cuponeras y el saldo.
 */
export async function mergeClients(club: Club, keep: ClubClient, drop: ClubClient, packs: ClientPack[]) {
  const batch = writeBatch(db);
  const fill: Record<string, unknown> = {};
  if (!keep.phone && drop.phone) fill.phone = drop.phone;
  if (!keep.email && drop.email) fill.email = drop.email;
  if (!keep.uid && drop.uid) Object.assign(fill, { uid: drop.uid, linkedBy: drop.linkedBy ?? 'mostrador', linkedAtISO: drop.linkedAtISO ?? new Date().toISOString() });
  if (!keep.category && drop.category) fill.category = drop.category;
  if (!keep.rut && drop.rut) Object.assign(fill, { rut: drop.rut, businessName: drop.businessName });
  // Se queda con el alta más vieja (para no contar dos altas)
  if (drop.createdOn < keep.createdOn) Object.assign(fill, { createdOn: drop.createdOn, origin: drop.origin });
  batch.update(ref(club.id, 'clients', keep.id), { ...fill, balance: increment(drop.balance || 0), noticeGiven: keep.noticeGiven || drop.noticeGiven, reviewDuplicate: false, updatedAt: serverTimestamp() });
  batch.update(ref(club.id, 'clients', drop.id), { status: 'archived', mergedInto: keep.id, balance: 0, reviewDuplicate: false, uid: '', updatedAt: serverTimestamp() });
  packs.filter((p) => p.clientId === drop.id).forEach((p) => batch.update(ref(club.id, 'clientPacks', p.id), { clientId: keep.id, clientName: keep.name, uid: keep.uid || drop.uid, updatedAt: serverTimestamp() }));
  await batch.commit();
}

/**
 * Pedido de la persona de borrar sus datos (sección 8, regla 4): se borran nombre, celular, mail y
 * nota; los movimientos quedan con "Cliente borrado" porque el club tiene que conservar su
 * contabilidad.
 */
export async function eraseClient(club: Club, client: ClubClient) {
  await updateDoc(ref(club.id, 'clients', client.id), {
    name: 'Cliente borrado',
    phone: '',
    noPhone: true,
    email: '',
    note: '',
    rut: '',
    businessName: '',
    acceptsNews: false,
    uid: '',
    erased: true,
    status: 'archived',
    updatedAt: serverTimestamp(),
  });
}

export async function logExport(club: Club, kind: ExportLog['kind'], staff: Staff, rows: number) {
  const id = makeId('exp');
  const log: ExportLog = { id, clubId: club.id, kind, byUid: staff.uid, byName: staff.name.slice(0, 60), atISO: new Date().toISOString(), rows };
  await setDoc(ref(club.id, 'exportLogs', id), { ...log, createdAt: serverTimestamp() });
}

/** Mensaje para invitarlo a la app desde el WhatsApp del celular del encargado (decisión 2). */
export function whatsappInviteUrl(club: Club, client: ClubClient, appUrl: string) {
  const first = client.name.split(' ')[0];
  const text = `Hola ${first}! Te escribimos de ${club.name}. Ahora reservamos con Armá Partido: ves los turnos libres, armás partido con gente de tu categoría y te avisamos si falta uno. Entrá acá con este mismo celular o mail: ${appUrl}`;
  const to = client.phone.replace(/\D/g, '');
  return `https://wa.me/${to}?text=${encodeURIComponent(text)}`;
}

// ---------- Cuponeras (Admin) ----------

export async function savePackType(club: Club, p: Partial<PackType> & { name: string; price: number; uses: number }) {
  const id = p.id || makeId('cup');
  const data: PackType = {
    id,
    clubId: club.id,
    name: p.name.trim().slice(0, 60),
    price: Math.max(0, Math.round(p.price)),
    uses: Math.max(1, Math.min(100, Math.round(p.uses))),
    unit: p.unit ?? 'parte',
    validity: p.validity ?? 'todos',
    days: Math.max(1, Math.min(730, Math.round(p.days ?? 90))),
    active: p.active ?? true,
    order: p.order ?? Date.now(),
  };
  await setDoc(ref(club.id, 'packTypes', id), { ...data, updatedAt: serverTimestamp(), ...(p.id ? {} : { createdAt: serverTimestamp() }) }, { merge: true });
}

// ---------- Cobros y ventas ----------

type PaymentFields = Pick<PaymentRecord, 'payerName' | 'referenceId' | 'amount' | 'method' | 'kind'> & Partial<PaymentRecord>;

function newPayment(club: Club, staff: Staff, day: string, fields: PaymentFields) {
  const id = makeId('pay');
  return {
    id,
    clubId: club.id,
    uid: staff.uid,
    clubOwnerUid: club.ownerUid,
    status: 'completed' as const,
    day,
    staffName: staff.name.slice(0, 60),
    invoiceStatus: 'pendiente' as InvoiceStatus,
    ...fields,
    payerName: (fields.payerName || 'Cliente').slice(0, 80),
    createdAt: serverTimestamp(),
  };
}

function newSale(club: Club, staff: Staff, day: string, f: Omit<Sale, 'id' | 'clubId' | 'day' | 'staffUid' | 'staffName' | 'status' | 'createdAt' | 'updatedAt'>): Sale {
  return { id: makeId('venta'), clubId: club.id, day, staffUid: staff.uid, staffName: staff.name.slice(0, 60), status: 'vigente', ...f, concept: f.concept.slice(0, 80), clientName: f.clientName.slice(0, 80) };
}

const setSale = (batch: Batch, club: Club, s: Sale) => batch.set(ref(club.id, 'sales', s.id), { ...s, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });

const isMoney = (m: SaleMethod): m is CounterPaymentMethod => m === 'efectivo' || m === 'transferencia' || m === 'debito_club';

/** Vender una cuponera en el mostrador (W4). Necesita ficha. */
export async function sellPack(params: { club: Club; client: ClubClient; packType: PackType; method: CounterPaymentMethod | 'saldo'; staff: Staff; day: string; afterClose: boolean }) {
  const { club, client, packType, method, staff, day, afterClose } = params;
  const batch = writeBatch(db);
  const packId = makeId('cupc');
  let paymentId = '';
  if (method !== 'saldo') {
    const p = newPayment(club, staff, day, { payerName: client.name, referenceId: packId, amount: packType.price, method, kind: 'venta', rubro: 'cuponeras', clientId: client.id, ...(afterClose ? { afterClose: true } : {}) });
    paymentId = p.id;
    batch.set(ref(club.id, 'payments', p.id), p);
  } else {
    batch.update(ref(club.id, 'clients', client.id), { balance: increment(-packType.price), updatedAt: serverTimestamp() });
  }
  const sale = newSale(club, staff, day, { clientId: client.id, clientName: client.name, rubro: 'cuponeras', concept: packType.name, qty: 1, amount: packType.price, method, paymentId, paid: true, bookingId: '', packId });
  setSale(batch, club, sale);
  const pack: ClientPack = {
    id: packId,
    clubId: club.id,
    clientId: client.id,
    clientName: client.name.slice(0, 80),
    uid: client.uid,
    packTypeId: packType.id,
    name: packType.name,
    unit: packType.unit,
    validity: packType.validity,
    usesTotal: packType.uses,
    usesLeft: packType.uses,
    price: packType.price,
    soldOn: day,
    expiresOn: packExpiresOn(packType, day),
    paymentId,
    saleId: sale.id,
    status: 'active',
    uses: [],
  };
  batch.set(ref(club.id, 'clientPacks', packId), { ...pack, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  await batch.commit();
  return pack;
}

/** Cargar saldo a favor: cobro del rubro Saldo. El extra que regala el club es descuento, no venta. */
export async function loadBalance(params: { club: Club; client: ClubClient; amount: number; credit: number; method: CounterPaymentMethod; staff: Staff; day: string; afterClose: boolean }) {
  const { club, client, amount, credit, method, staff, day, afterClose } = params;
  const batch = writeBatch(db);
  const p = newPayment(club, staff, day, { payerName: client.name, referenceId: client.id, amount, method, kind: 'venta', rubro: 'saldo', clientId: client.id, ...(afterClose ? { afterClose: true } : {}) });
  batch.set(ref(club.id, 'payments', p.id), p);
  const bonus = Math.max(0, credit - amount);
  setSale(batch, club, newSale(club, staff, day, { clientId: client.id, clientName: client.name, rubro: 'saldo', concept: bonus ? `Carga de saldo (+ $ ${bonus.toLocaleString('es-UY')} de regalo)` : 'Carga de saldo', qty: 1, amount, ...(bonus ? { bonus } : {}), method, paymentId: p.id, paid: true, bookingId: '', packId: '' }));
  batch.update(ref(club.id, 'clients', client.id), { balance: increment(credit), updatedAt: serverTimestamp() });
  await batch.commit();
}

export interface SaleItem {
  rubro: Rubro;
  concept: string;
  qty: number;
  unitPrice: number;
  product?: Product;
}

/**
 * Venta suelta sin turno (W4). Cantina sigue siendo un consumo (con su stock); el resto es una
 * venta. Paga con plata (un cobro por rubro, con su casilla de factura), con saldo, o queda "a su
 * cuenta" (deuda; solo con ficha).
 */
export async function ventaSuelta(params: { club: Club; client: ClubClient | null; items: SaleItem[]; method: CounterPaymentMethod | 'saldo' | 'cuenta'; staff: Staff; day: string; afterClose: boolean }) {
  const { club, client, items, method, staff, day, afterClose } = params;
  if (!client && method !== 'efectivo' && method !== 'transferencia' && method !== 'debito_club') throw new Error('Sin nombre solo se cobra en el momento.');
  const batch = writeBatch(db);
  const who = client ? client.name : 'Sin nombre';
  const saleRef = makeId('vs');
  const key = client ? client.uid || `c:${client.id}` : `g:${saleRef}`;
  const byRubro = new Map<Rubro, { amount: number; concepts: string[]; sales: Sale[] }>();
  let total = 0;
  for (const it of items) {
    if (it.qty <= 0) continue;
    const amount = Math.round(it.unitPrice * it.qty);
    total += amount;
    const group = byRubro.get(it.rubro) ?? { amount: 0, concepts: [], sales: [] };
    group.amount += amount;
    group.concepts.push(`${it.qty > 1 ? `${it.qty} ` : ''}${it.concept}`);
    if (it.product && it.rubro === 'cantina') {
      const id = makeId('cons');
      const c: Consumption = {
        id,
        clubId: club.id,
        productId: it.product.id,
        productName: it.product.name,
        unitPrice: it.product.price,
        qty: it.qty,
        total: amount,
        bookingId: '',
        date: day,
        shared: false,
        forUid: client?.uid ?? '',
        forName: who,
        participantUids: [key],
        participantNames: [who],
        paidUids: [],
        status: method === 'cuenta' ? 'pending' : 'paid',
        createdByUid: staff.uid,
      };
      batch.set(ref(club.id, 'consumptions', id), { ...c, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      if (it.product.stock !== null) batch.update(ref(club.id, 'products', it.product.id), { stock: increment(-it.qty), updatedAt: serverTimestamp() });
      if (method === 'saldo') group.sales.push(newSale(club, staff, day, { clientId: client!.id, clientName: who, rubro: 'cantina', concept: `${it.qty > 1 ? `${it.qty} ` : ''}${it.product.name}`, qty: it.qty, amount, method: 'saldo', paymentId: '', paid: true, bookingId: '', packId: '' }));
    } else {
      if (it.product?.stock !== null && it.product?.stock !== undefined) batch.update(ref(club.id, 'products', it.product.id), { stock: increment(-it.qty), updatedAt: serverTimestamp() });
      group.sales.push(
        newSale(club, staff, day, {
          clientId: client?.id ?? '',
          clientName: who,
          rubro: it.rubro,
          concept: `${it.qty > 1 ? `${it.qty} ` : ''}${it.concept}`,
          qty: it.qty,
          amount,
          method,
          paymentId: '',
          paid: method !== 'cuenta',
          bookingId: '',
          packId: '',
        })
      );
    }
    byRubro.set(it.rubro, group);
  }
  if (total <= 0) return 0;
  for (const [rubro, g] of byRubro) {
    if (isMoney(method)) {
      const p = newPayment(club, staff, day, { payerName: who, referenceId: saleRef, amount: g.amount, method, kind: rubro === 'cantina' ? 'cantina' : 'venta', rubro, ...(client ? { clientId: client.id } : {}), ...(afterClose ? { afterClose: true } : {}) });
      batch.set(ref(club.id, 'payments', p.id), p);
      g.sales.forEach((s) => setSale(batch, club, { ...s, paymentId: p.id }));
    } else {
      g.sales.forEach((s) => setSale(batch, club, s));
    }
  }
  if (method === 'saldo' && client) batch.update(ref(club.id, 'clients', client.id), { balance: increment(-total), updatedAt: serverTimestamp() });
  await batch.commit();
  return total;
}

// ---------- En la cuenta del turno ----------

/** Marca paga la cancha de una persona sin crear cobro (pagó con cuponera o saldo). */
function markCanchaPaidNoMoney(batch: Batch, club: Club, booking: Booking, match: ProposedMatch | undefined, key: string) {
  if (booking.type === 'matched' && match) {
    const slots = match.slots.map((s) => (s.uid === key ? { ...s, paid: true } : s));
    batch.update(ref(club.id, 'proposedMatches', match.id), { slots, updatedAt: serverTimestamp() });
    const paidCount = slots.filter((s) => s.paid).length;
    batch.update(ref(club.id, 'bookings', booking.id), {
      paidAmount: Math.min(booking.totalPrice, paidCount * match.pricePerPlayer),
      paymentStatus: paidCount >= slots.length ? 'paid' : 'deposit_paid',
      updatedAt: serverTimestamp(),
    });
  } else {
    batch.update(ref(club.id, 'bookings', booking.id), { paidAmount: booking.totalPrice, paymentStatus: 'paid', updatedAt: serverTimestamp() });
  }
}

/**
 * Pagar la parte (o el turno) con cuponera (W3). Queda un uso: qué cuponera, qué turno y cuánto
 * valía. No es un cobro nuevo y no entra a la caja.
 */
export async function redeemPack(params: { club: Club; pack: ClientPack; client: ClubClient; booking: Booking; match?: ProposedMatch; participantKey: string; value: number; staff: Staff; day: string }) {
  const { club, pack, client, booking, match, participantKey, value, staff, day } = params;
  const batch = writeBatch(db);
  const sale = newSale(club, staff, day, {
    clientId: client.id,
    clientName: client.name,
    rubro: 'cancha',
    concept: `${pack.unit === 'turno' ? 'Turno' : 'Parte'} ${booking.courtName} (uso ${pack.usesTotal - pack.usesLeft + 1} de ${pack.usesTotal})`,
    qty: 1,
    amount: value,
    method: 'cuponera',
    paymentId: '',
    paid: true,
    bookingId: booking.id,
    packId: pack.id,
  });
  setSale(batch, club, sale);
  batch.update(ref(club.id, 'clientPacks', pack.id), {
    usesLeft: increment(-1),
    uses: arrayUnion({ bookingId: booking.id, date: booking.date, value, atISO: new Date().toISOString(), byName: staff.name.slice(0, 60), saleId: sale.id }),
    updatedAt: serverTimestamp(),
  });
  markCanchaPaidNoMoney(batch, club, booking, match, participantKey);
  await batch.commit();
}

/** Pagar lo que debe una persona en el turno con su saldo a favor (cancha y cantina). */
export async function payTurnWithBalance(params: { club: Club; client: ClubClient; booking: Booking; match?: ProposedMatch; participantKey: string; canchaDue: number; consumptions: Consumption[]; staff: Staff; day: string }) {
  const { club, client, booking, match, participantKey, canchaDue, consumptions, staff, day } = params;
  const batch = writeBatch(db);
  let total = 0;
  if (canchaDue > 0) {
    markCanchaPaidNoMoney(batch, club, booking, match, participantKey);
    setSale(batch, club, newSale(club, staff, day, { clientId: client.id, clientName: client.name, rubro: 'cancha', concept: `${booking.type === 'matched' ? 'Parte' : 'Turno'} ${booking.courtName}`, qty: 1, amount: canchaDue, method: 'saldo', paymentId: '', paid: true, bookingId: booking.id, packId: '' }));
    total += canchaDue;
  }
  let cantina = 0;
  for (const c of consumptions) {
    const due = consumptionDue(c, participantKey);
    if (due <= 0) continue;
    cantina += due;
    if (!c.shared) batch.update(ref(club.id, 'consumptions', c.id), { status: 'paid', updatedAt: serverTimestamp() });
    else {
      const paidAfter = [...c.paidUids, participantKey];
      batch.update(ref(club.id, 'consumptions', c.id), { paidUids: arrayUnion(participantKey), ...(c.participantUids.every((u) => paidAfter.includes(u)) ? { status: 'paid' } : {}), updatedAt: serverTimestamp() });
    }
  }
  if (cantina > 0) {
    setSale(batch, club, newSale(club, staff, day, { clientId: client.id, clientName: client.name, rubro: 'cantina', concept: 'Cantina del turno', qty: 1, amount: cantina, method: 'saldo', paymentId: '', paid: true, bookingId: booking.id, packId: '' }));
    total += cantina;
  }
  if (total > 0) {
    batch.update(ref(club.id, 'clients', client.id), { balance: increment(-total), updatedAt: serverTimestamp() });
    await batch.commit();
  }
  return total;
}

/** Cobrar las ventas "a su cuenta" (clases, alquiler, otros) de una ficha: un cobro por rubro. */
export async function payAccountSales(params: { club: Club; client: ClubClient; sales: Sale[]; method: CounterPaymentMethod; staff: Staff; day: string; afterClose: boolean }) {
  const { club, client, sales, method, staff, day, afterClose } = params;
  const open = sales.filter((s) => s.status === 'vigente' && !s.paid && s.method === 'cuenta');
  if (!open.length) return 0;
  const batch = writeBatch(db);
  const byRubro = new Map<Rubro, Sale[]>();
  open.forEach((s) => byRubro.set(s.rubro, [...(byRubro.get(s.rubro) ?? []), s]));
  let total = 0;
  for (const [rubro, list] of byRubro) {
    const amount = list.reduce((a, s) => a + s.amount, 0);
    total += amount;
    const p = newPayment(club, staff, day, { payerName: client.name, referenceId: 'deuda', amount, method, kind: rubro === 'cantina' ? 'cantina' : 'venta', rubro, clientId: client.id, note: 'Pago de lo que debía', ...(afterClose ? { afterClose: true } : {}) });
    batch.set(ref(club.id, 'payments', p.id), p);
    list.forEach((s) => batch.update(ref(club.id, 'sales', s.id), { paid: true, paymentId: p.id, updatedAt: serverTimestamp() }));
  }
  await batch.commit();
  return total;
}

/** Anular una venta a cuenta (cargada por error). Nunca se borra. */
export async function voidAccountSale(club: Club, sale: Sale, reason: string) {
  await updateDoc(ref(club.id, 'sales', sale.id), { status: 'anulada', voidReason: reason.trim().slice(0, 120), updatedAt: serverTimestamp() });
}

/** Anular una cuponera vendida por error: solo si no tiene usos. El cobro se anula aparte (voidPayment). */
export async function voidPack(club: Club, pack: ClientPack, sales: Sale[]) {
  if (pack.uses.length > 0) throw new Error('Tiene usos');
  const batch = writeBatch(db);
  batch.update(ref(club.id, 'clientPacks', pack.id), { status: 'voided', usesLeft: 0, updatedAt: serverTimestamp() });
  sales.filter((s) => s.packId === pack.id && s.rubro === 'cuponeras').forEach((s) => batch.update(ref(club.id, 'sales', s.id), { status: 'anulada', voidReason: 'Cuponera anulada', updatedAt: serverTimestamp() }));
  if (!pack.paymentId) batch.update(ref(club.id, 'clients', pack.clientId), { balance: increment(pack.price), updatedAt: serverTimestamp() });
  await batch.commit();
}

// ---------- Casilla de factura (fase 1, manual) ----------

export async function setInvoice(club: Club, paymentIds: string[], status: InvoiceStatus, number = '') {
  for (let i = 0; i < paymentIds.length; i += 400) {
    const batch = writeBatch(db);
    paymentIds.slice(i, i + 400).forEach((id) => batch.update(ref(club.id, 'payments', id), { invoiceStatus: status, invoiceNumber: status === 'emitida' ? number.trim().slice(0, 30) : '' }));
    await batch.commit();
  }
}

export { formatPhone };

/**
 * Cobrar todo lo que debe una persona (Deben y ficha): consumos, canchas pasadas y ventas a cuenta.
 * Las deudas viejas pueden estar con otra clave (antes de bajar la app o de unir fichas): se paga
 * cada grupo con la suya.
 */
export async function payWholeDebt(params: {
  club: Club;
  debt: { key: string; name: string; consumptionIds: string[]; bookingIds: string[]; saleIds: string[]; client?: ClubClient };
  clients: ClubClient[];
  consumptions: Consumption[];
  bookings: Booking[];
  matches: ProposedMatch[];
  sales: Sale[];
  method: CounterPaymentMethod;
  staff: Staff;
  day: string;
  afterClose: boolean;
}) {
  const { club, debt, clients, consumptions, bookings, matches, sales, method, staff, day, afterClose } = params;
  const resolve = keyResolver(clients);
  const groups = new Map<string, { c: Consumption[]; b: Booking[] }>();
  const group = (k: string) => groups.get(k) ?? groups.set(k, { c: [], b: [] }).get(k)!;
  consumptions
    .filter((c) => debt.consumptionIds.includes(c.id))
    .forEach((c) => group(c.participantUids.find((u) => resolve(u) === debt.key) ?? debt.key).c.push(c));
  bookings.filter((b) => debt.bookingIds.includes(b.id)).forEach((b) => group(debt.key).b.push(b));
  for (const [k, g] of groups) {
    await payDebt({ club, debtKey: k, debtName: debt.name, consumptions: g.c, bookings: g.b, matches, method, staff, day, afterClose, ...(debt.client ? { clientId: debt.client.id } : {}) });
  }
  if (debt.client && debt.saleIds.length) {
    await payAccountSales({ club, client: debt.client, sales: sales.filter((s) => debt.saleIds.includes(s.id)), method, staff, day, afterClose });
  }
}
