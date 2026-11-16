/**
 * Parte del mundo de demo para clientes, cuponeras, saldo a favor, venta suelta y el libro con
 * factura. Todo es ficticio (nombres y celulares inventados) y relativo al día en que se carga.
 * Se agrega al final de buildDemoWorld, después de la cantina.
 */
import type { Booking, PaymentRecord } from '../types/padel';
import type { ClientPack, ClubClient, PackType, Sale } from '../types/clientes';
import { addDaysISO } from '../lib/padelUtils';
import type { DemoDoc, DemoUids } from './demoWorld';

const T = (h: number, m = 0) => h * 60 + m;

export function addClientesDemo(
  docs: DemoDoc[],
  ctx: { base: string; clubId: string; today: string; uids: DemoUids; nameOf: (uid: string) => string; catOf: (uid: string) => number; price: (date: string, start: number) => number; anaToday?: { courtId: string; start: number } }
) {
  const { base, clubId: C, today, uids, nameOf, catOf, price } = ctx;
  const day = (n: number) => addDaysISO(today, n);
  const put = (path: string, data: object) => docs.push({ path, data: { ...data } as Record<string, unknown> });
  const staff = { uid: uids.mostrador, name: 'Diego Fernández' };

  // ---------- Fichas ----------
  const ficha = (id: string, f: Partial<ClubClient> & Pick<ClubClient, 'name' | 'origin' | 'createdOn'>): ClubClient => ({
    id: `demo_cli_${id}`,
    clubId: C,
    phone: '',
    noPhone: false,
    email: '',
    category: null,
    uid: '',
    createdByUid: staff.uid,
    createdByName: staff.name,
    noticeGiven: true,
    acceptsNews: false,
    rut: '',
    businessName: '',
    note: '',
    balance: 0,
    status: 'active',
    ...f,
  });
  const app = (uid: string, phone: string, createdOn: string, extra: Partial<ClubClient> = {}) =>
    ficha('', { id: `u_${uid}`, name: nameOf(uid), phone, category: catOf(uid), uid, origin: 'app', linkedBy: 'mail', linkedAtISO: `${createdOn}T12:00:00.000Z`, createdByUid: uid, createdByName: nameOf(uid), createdOn, ...extra });

  const clients: ClubClient[] = [
    // Con la app
    app(uids.jugador, '+59899123456', day(-120), { balance: 260, acceptsNews: true }),
    app(uids.jugadora, '+59898234567', day(-95)),
    app('demo-p07', '+59894345678', day(-60)),
    app('demo-p09', '+59891456789', day(-18), { origin: 'falta_uno' }),
    app('demo-p12', '+59895567890', day(-9)),
    // Sin la app
    ficha('ana', { name: 'Ana Laura Techera', phone: '+59899111222', category: 6, origin: 'mostrador', createdOn: day(-40), note: 'Viene los martes con sus amigas.' }),
    ficha('jorge', { name: 'Jorge Brum', phone: '+59899333444', category: 7, origin: 'telefono', createdOn: day(-75), balance: 1200, rut: '211234560018', businessName: 'Brum Construcciones SRL' }),
    // Posible repetido: el encargado lo cargó de nuevo con el mismo celular
    ficha('jorge2', { name: 'Jorge Brum', phone: '+59899333444', category: 7, origin: 'mostrador', createdOn: day(-6), reviewDuplicate: true }),
    ficha('rosana', { name: 'Rosana Píriz', phone: '+59899555666', category: 5, origin: 'migracion', createdOn: day(-150), createdByName: 'Planilla de Wona' }),
    ficha('emilio', { name: 'Emilio Larrosa', phone: '+59897777888', category: 8, origin: 'telefono', createdOn: day(-3) }),
    ficha('tito', { name: 'Tito (papá de Emilio)', noPhone: true, origin: 'mostrador', createdOn: day(-3), note: 'No usa celular. Viene con Emilio.' }),
    ficha('clara', { name: 'Clara Bentancor', phone: '+59899999000', category: 4, origin: 'torneo', createdOn: day(-25), email: 'clara.demo@ejemplo.uy' }),
  ];
  clients.forEach((c) => put(`${base}/clients/${c.id}`, c));
  const cli = (id: string) => clients.find((c) => c.id === `demo_cli_${id}`)!;
  const martin = clients[0];

  // ---------- Reservas del mostrador con ficha ----------
  const counter = (id: string, n: number, start: number, court: number, client: ClubClient, paid: boolean): Booking => {
    const total = price(day(n), start);
    return {
      id: `demo_bk_cli_${id}`,
      clubId: C,
      courtId: `cancha_${court}`,
      courtName: `Cancha ${court}`,
      date: day(n),
      startMinute: start,
      endMinute: start + 90,
      type: 'counter',
      status: 'confirmed',
      createdByUid: staff.uid,
      playerUids: client.uid ? [client.uid] : [],
      guestName: client.origin === 'telefono' ? `${client.name} · ${client.phone.replace('+598', '0').replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3')}` : client.name,
      clientId: client.id,
      totalPrice: total,
      paidAmount: paid ? total : 0,
      paymentMethod: 'club',
      paymentStatus: paid ? 'paid' : 'pending',
      holdExpiresAt: '',
    } as Booking;
  };
  const bks: Booking[] = [
    counter('ana1', -14, T(11), 3, cli('ana'), true),
    counter('ana2', -7, T(11), 3, cli('ana'), true),
    counter('ana3', 0, ctx.anaToday?.start ?? T(11), Number((ctx.anaToday?.courtId ?? 'cancha_3').split('_')[1]), cli('ana'), false),
    counter('jorge1', -50, T(20), 1, cli('jorge'), true),
    counter('jorge2', -5, T(20), 1, cli('jorge'), true),
    counter('rosana1', -45, T(9, 30), 4, cli('rosana'), true),
    counter('rosana2', -38, T(9, 30), 4, cli('rosana'), true),
    counter('emilio1', 1, T(17), 2, cli('emilio'), false),
    counter('clara1', -2, T(12, 30), 4, cli('clara'), true),
  ];
  bks.forEach((b) => put(`${base}/bookings/${b.id}`, b));

  // ---------- Cobros y ventas ----------
  let pi = 0;
  let si = 0;
  const payment = (d: string, client: ClubClient, amount: number, method: PaymentRecord['method'], rubro: string, ref: string, invoice: Partial<PaymentRecord> = {}): PaymentRecord => {
    const p = {
      id: `demo_pay_cli_${String(++pi).padStart(2, '0')}`,
      clubId: C,
      uid: client.uid || staff.uid,
      clubOwnerUid: uids.dueno,
      payerName: client.name,
      referenceId: ref,
      amount,
      method,
      kind: (rubro === 'cancha' ? 'booking_full' : 'venta') as PaymentRecord['kind'],
      status: 'completed' as const,
      day: d,
      staffName: staff.name,
      clientId: client.id,
      rubro,
      invoiceStatus: 'pendiente',
      ...invoice,
    } as PaymentRecord;
    put(`${base}/payments/${p.id}`, p);
    return p;
  };
  const sale = (d: string, client: ClubClient | null, f: Pick<Sale, 'rubro' | 'concept' | 'amount' | 'method'> & Partial<Sale>): Sale => {
    const s: Sale = {
      id: `demo_sale_${String(++si).padStart(2, '0')}`,
      clubId: C,
      day: d,
      clientId: client?.id ?? '',
      clientName: client?.name ?? 'Sin nombre',
      qty: 1,
      paymentId: '',
      paid: f.method !== 'cuenta',
      status: 'vigente',
      bookingId: '',
      packId: '',
      staffUid: staff.uid,
      staffName: staff.name,
      ...f,
    };
    put(`${base}/sales/${s.id}`, s);
    return s;
  };

  // Cobros de las canchas del mostrador ya jugadas (algunos ya facturados)
  bks
    .filter((b) => b.paymentStatus === 'paid')
    .forEach((b, i) =>
      payment(b.date, clients.find((c) => c.id === b.clientId)!, b.totalPrice, i % 2 ? 'transferencia' : 'efectivo', 'cancha', b.id, b.date < day(-10) ? { invoiceStatus: 'emitida', invoiceNumber: `A-${String(1040 + i)}` } : {})
    );

  // ---------- Cuponeras ----------
  const packTypes: PackType[] = [
    { id: 'demo_cup_10partes', clubId: C, name: '10 partes de cancha', price: 4200, uses: 10, unit: 'parte', validity: 'todos', days: 90, active: true, order: 0 },
    { id: 'demo_cup_valle', clubId: C, name: 'Valle: 8 turnos', price: 11500, uses: 8, unit: 'turno', validity: 'valle', days: 60, active: true, order: 1 },
    { id: 'demo_cup_5turnos', clubId: C, name: '5 turnos completos', price: 8000, uses: 5, unit: 'turno', validity: 'todos', days: 90, active: true, order: 2 },
    { id: 'demo_cup_verano', clubId: C, name: 'Promo verano (vieja)', price: 3500, uses: 10, unit: 'parte', validity: 'semana', days: 45, active: false, order: 3 },
  ];
  packTypes.forEach((t) => put(`${base}/packTypes/${t.id}`, t));

  const sellPack = (id: string, client: ClubClient, t: PackType, soldDay: number, used: { bookingId: string; date: string; value: number }[], method: PaymentRecord['method'], invoice: Partial<PaymentRecord> = {}) => {
    const packId = `demo_pack_${id}`;
    const p = payment(day(soldDay), client, t.price, method, 'cuponeras', packId, invoice);
    const s = sale(day(soldDay), client, { rubro: 'cuponeras', concept: t.name, amount: t.price, method, paymentId: p.id, packId });
    const uses = used.map((u, i) => {
      const us = sale(u.date, client, { rubro: 'cancha', concept: `${t.unit === 'turno' ? 'Turno' : 'Parte'} (uso ${i + 1} de ${t.uses})`, amount: u.value, method: 'cuponera', bookingId: u.bookingId, packId });
      return { ...u, atISO: `${u.date}T15:00:00.000Z`, byName: staff.name, saleId: us.id };
    });
    const pack: ClientPack = {
      id: packId,
      clubId: C,
      clientId: client.id,
      clientName: client.name,
      uid: client.uid,
      packTypeId: t.id,
      name: t.name,
      unit: t.unit,
      validity: t.validity,
      usesTotal: t.uses,
      usesLeft: t.uses - uses.length,
      price: t.price,
      soldOn: day(soldDay),
      expiresOn: addDaysISO(day(soldDay), t.days),
      paymentId: p.id,
      saleId: s.id,
      status: 'active',
      uses,
    };
    put(`${base}/clientPacks/${pack.id}`, pack);
  };
  const part = (n: number, h: number) => Math.round(price(day(n), T(h)) / 4);
  // Ana compró la de 5 turnos completos hace 20 días y usó 2 (sus turnos de las 11, que reserva entera)
  sellPack('ana', cli('ana'), packTypes[2], -20, [
    { bookingId: 'demo_bk_cli_ana1', date: day(-14), value: price(day(-14), T(11)) },
    { bookingId: 'demo_bk_cli_ana2', date: day(-7), value: price(day(-7), T(11)) },
  ], 'efectivo', { invoiceStatus: 'emitida', invoiceNumber: 'A-1037' });
  // Martín (tiene la app) compró una y le quedan 6
  sellPack('martin', martin, packTypes[0], -30, [-26, -19, -12, -5].map((n) => ({ bookingId: '', date: day(n), value: part(n, 20) })), 'transferencia', { invoiceStatus: 'emitida', invoiceNumber: 'A-1031' });
  // Rosana compró la de valle hace 70 días: se le vence en pocos días y no volvió
  sellPack('rosana', cli('rosana'), packTypes[1], -55, [
    { bookingId: 'demo_bk_cli_rosana1', date: day(-45), value: price(day(-45), T(9, 30)) },
    { bookingId: 'demo_bk_cli_rosana2', date: day(-38), value: price(day(-38), T(9, 30)) },
  ], 'debito_club');
  // Clara la compró hoy (factura pendiente)
  sellPack('clara', cli('clara'), packTypes[0], 0, [], 'debito_club');

  // ---------- Saldo a favor ----------
  // Jorge cargó $ 1.000 y el club le regaló $ 200 (tiene $ 1.200)
  const pj = payment(day(-30), cli('jorge'), 1000, 'transferencia', 'saldo', 'demo_cli_jorge', { invoiceStatus: 'no_corresponde' });
  sale(day(-30), cli('jorge'), { rubro: 'saldo', concept: 'Carga de saldo (+ $ 200 de regalo)', amount: 1000, bonus: 200, method: 'transferencia', paymentId: pj.id });
  const pm = payment(day(-15), martin, 500, 'efectivo', 'saldo', martin.id);
  sale(day(-15), martin, { rubro: 'saldo', concept: 'Carga de saldo', amount: 500, method: 'efectivo', paymentId: pm.id });
  sale(day(-8), martin, { rubro: 'cantina', concept: '2 Bebida isotónica', qty: 2, amount: 240, method: 'saldo' });

  // ---------- Venta suelta ----------
  const pc = payment(day(-4), cli('ana'), 1200, 'efectivo', 'clases', 'demo_sale_clase');
  sale(day(-4), cli('ana'), { rubro: 'clases', concept: 'Clase con el profe Marcelo', amount: 1200, method: 'efectivo', paymentId: pc.id });
  const pt = payment(day(-2), cli('clara'), 1600, 'transferencia', 'torneos', 'demo_sale_torneo');
  sale(day(-2), cli('clara'), { rubro: 'torneos', concept: 'Inscripción Torneo de Verano', amount: 1600, method: 'transferencia', paymentId: pt.id });
  const pa = payment(day(-1), cli('jorge'), 300, 'efectivo', 'alquiler', 'demo_sale_paleta');
  sale(day(-1), cli('jorge'), { rubro: 'alquiler', concept: '2 Alquiler de paleta', qty: 2, amount: 300, method: 'efectivo', paymentId: pa.id });
  // Quedaron debiendo ("a su cuenta")
  sale(day(-3), cli('ana'), { rubro: 'cantina', concept: 'Tubo de pelotas', amount: 450, method: 'cuenta' });
  sale(day(-1), cli('emilio'), { rubro: 'otros', concept: 'Cordaje de la paleta', amount: 900, method: 'cuenta' });

  // Los cobros viejos de la demo (antes de la ficha) quedan facturados hasta hace 10 días
  docs
    .filter((d) => d.path.startsWith(`${base}/payments/`) && !d.path.includes('_cli_'))
    .forEach((d) => {
      const p = d.data as unknown as PaymentRecord;
      if (p.kind === 'retiro' || p.kind === 'anulacion' || p.kind === 'refund') return;
      const when = p.day ?? '';
      if (when && when < day(-10)) Object.assign(d.data, { invoiceStatus: 'emitida', invoiceNumber: `A-${900 + (pi++ % 99)}` });
    });
}
