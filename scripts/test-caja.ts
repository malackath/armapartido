/**
 * Pruebas de las cuentas de caja, cantina, seña e informe mensual (sin Firebase).
 * Uso: npx tsx scripts/test-caja.ts [carpeta-para-el-mail.html]
 */
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import type { Booking, Club, PaymentRecord, ProposedMatch } from '../src/types/padel';
import type { Consumption, Recovery } from '../src/types/caja';
import { accountOf, cashSummary, computeMonthlyReport, consumptionDue, debtsOf, depositFor, monthOf, participantsOf, splitEven } from '../src/lib/caja';
import { buildMonthlyReportEmail } from '../src/lib/informeMail';
import { buildDemoWorld, type DemoUids } from '../src/demo/demoWorld';

let n = 0;
const test = (name: string, fn: () => void) => {
  fn();
  n += 1;
  console.log(`  ok  ${name}`);
};

test('dividir: la suma da exacta y el resto se reparte de a $1', () => {
  assert.deepEqual(splitEven(450, 4), [113, 113, 112, 112]);
  assert.equal(splitEven(2650, 4).reduce((a, b) => a + b, 0), 2650);
  assert.deepEqual(splitEven(100, 1), [100]);
});

const club = {
  id: 'c',
  name: 'Club',
  openHour: 8,
  closeHour: 23,
  slotDurationMinutes: 90,
  subscriptionStatus: 'active',
  plan: 'estandar',
  courtCount: 2,
  deposit: { enabled: true, days: [1, 2, 3, 4, 5], fromHour: 19, toHour: 23, amount: 500, holdMinutes: 15 },
} as unknown as Club;

test('seña: solo en los días y horas de pico, y apagada no pide nada', () => {
  assert.equal(depositFor(club, '2026-11-17', 20 * 60), 500); // martes 20 h
  assert.equal(depositFor(club, '2026-11-17', 17 * 60), 0); // martes 17 h
  assert.equal(depositFor(club, '2026-11-15', 20 * 60), 0); // domingo
  assert.equal(depositFor({ ...club, deposit: { ...club.deposit!, enabled: false } }, '2026-11-17', 20 * 60), 0);
  assert.equal(depositFor({ ...club, deposit: undefined }, '2026-11-17', 20 * 60), 0);
});

const booking = (over: Partial<Booking>): Booking =>
  ({ id: 'b1', clubId: 'c', courtId: 'k1', courtName: 'Cancha 1', date: '2026-11-15', startMinute: 1200, endMinute: 1290, type: 'matched', status: 'confirmed', createdByUid: 'a', playerUids: ['a', 'b', 'c', 'd'], guestName: '', totalPrice: 2200, paidAmount: 0, paymentMethod: 'club', paymentStatus: 'pending', holdExpiresAt: '', ...over }) as Booking;
const match: ProposedMatch = {
  id: 'm1',
  bookingId: 'b1',
  pricePerPlayer: 550,
  slots: ['a', 'b', 'c', 'd'].map((u) => ({ uid: u, displayName: u.toUpperCase() + ' Pérez', category: 5, gender: 'masculino', status: 'accepted', paid: u === 'b', requestId: '' })),
} as unknown as ProposedMatch;
const cons = (over: Partial<Consumption>): Consumption =>
  ({ id: 'x', clubId: 'c', productId: 'p', productName: 'Agua', unitPrice: 90, qty: 1, total: 90, bookingId: 'b1', date: '2026-11-15', shared: false, forUid: 'a', forName: 'A', participantUids: ['a'], participantNames: ['A'], paidUids: [], status: 'pending', createdByUid: 's', ...over }) as Consumption;

test('cuenta del turno: cancha por jugador + consumos propios + parte de lo compartido', () => {
  const list = [cons({ id: 'agua', qty: 2, total: 180 }), cons({ id: 'pelotas', productName: 'Pelotas', total: 450, shared: true, forUid: '', participantUids: ['a', 'b', 'c', 'd'], participantNames: ['A', 'B', 'C', 'D'] })];
  const acc = accountOf(participantsOf(booking({}), match, (u) => u), list);
  const a = acc.find((x) => x.key === 'a')!;
  const b = acc.find((x) => x.key === 'b')!;
  assert.equal(a.totalDue, 550 + 180 + 113);
  assert.equal(b.canchaDue, 0); // ya pagó la cancha
  assert.equal(b.totalDue, 113); // pero debe su parte de las pelotas
  assert.equal(acc.reduce((s, x) => s + x.totalDue, 0), 550 * 3 + 180 + 450);
});

test('consumo compartido: el que ya pagó su parte no debe más', () => {
  const c = cons({ shared: true, total: 450, participantUids: ['a', 'b', 'c', 'd'], paidUids: ['a'] });
  assert.equal(consumptionDue(c, 'a'), 0);
  assert.equal(consumptionDue(c, 'd'), 112);
  assert.equal(consumptionDue({ ...c, status: 'voided' }, 'd'), 0);
});

test('reserva sin partido armado: la seña ya pagada se descuenta de la cancha', () => {
  const p = participantsOf(booking({ type: 'direct', playerUids: ['a'], paidAmount: 500, paymentStatus: 'deposit_paid' }), undefined, () => 'Ana');
  assert.equal(p.length, 1);
  assert.equal(p[0].canchaShare, 1700);
});

test('caja: efectivo esperado = fondo + efectivo − retiros, y la anulación resta', () => {
  const pay = (id: string, amount: number, method: PaymentRecord['method'], kind: PaymentRecord['kind'], extra: Partial<PaymentRecord> = {}) =>
    ({ id, clubId: 'c', uid: 's', clubOwnerUid: 'o', payerName: 'x', referenceId: 'r', amount, method, kind, status: 'completed', day: '2026-11-15', ...extra }) as PaymentRecord;
  const s = cashSummary(
    [
      pay('1', 2200, 'efectivo', 'booking_full'),
      pay('2', 450, 'efectivo', 'cantina'),
      pay('3', 900, 'transferencia', 'cantina'),
      pay('4', 400, 'efectivo', 'retiro'),
      pay('5', -450, 'efectivo', 'anulacion', { voidOfId: '2' }),
      pay('6', 1000, 'efectivo', 'booking_full', { day: '2026-11-14' }),
    ],
    '2026-11-15',
    2000
  );
  assert.equal(s.byMethod.efectivo, 2200);
  assert.equal(s.withdrawals, 400);
  assert.equal(s.expectedCash, 2000 + 2200 - 400);
  assert.equal(s.cantina, 900);
  assert.equal(s.total, 3100);
});

test('deben: fiado de días anteriores y canchas pasadas sin cobrar, agrupado por persona', () => {
  const d = debtsOf({
    consumptions: [cons({ id: 'c1', date: '2026-11-13', bookingId: '', forName: 'A' }), cons({ id: 'c2', date: '2026-11-15', bookingId: 'b1' })],
    bookings: [booking({ id: 'b0', date: '2026-11-13', type: 'direct', playerUids: ['a'] })],
    matches: [],
    today: '2026-11-15',
    nowMinute: 600,
    nameOf: () => 'A',
  });
  assert.equal(d.length, 1);
  assert.equal(d[0].amount, 90 + 2200); // el de hoy (turno no terminado) no entra
});

const uids: DemoUids = { plataforma: 'u0', dueno: 'u1', mostrador: 'u2', jugador: 'u3', jugadora: 'u4' };
const today = '2026-11-15';
const world = buildDemoWorld(uids, today);
const of = <T,>(name: string) => world.filter((d) => d.path.startsWith(`clubs/los_jacarandas/${name}/`)).map((d) => d.data as unknown as T);
const demoClub = world.find((d) => d.path === 'clubs/los_jacarandas')!.data as unknown as Club;
const recoveries = of<Recovery>('recoveries');
const bookings = of<Booking>('bookings');
const report = computeMonthlyReport({
  club: demoClub,
  month: monthOf(today),
  today,
  courts: of('courts'),
  bookings,
  matches: of('proposedMatches'),
  payments: of('payments'),
  consumptions: of('consumptions'),
  recoveries,
  memberships: of('memberships'),
});

test('informe: el total es solo lo demostrable (recuperados contados + señas retenidas)', () => {
  const counted = recoveries.filter((r) => r.status === 'counted').reduce((a, r) => a + r.amountRecovered, 0);
  const kept = bookings.filter((b) => b.status === 'no_show' && b.paymentStatus === 'deposit_paid').reduce((a, b) => a + b.paidAmount, 0);
  assert.equal(report.totalEarned, counted + kept);
  assert.ok(!report.recoveryIds.includes('demo_rec_7'), 'el anulado no cuenta');
  assert.ok(report.cantinaCollected > 0);
  assert.equal(report.newPlayers, 4);
  assert.equal(report.partial, true);
  assert.equal(report.toDate, '2026-11-14');
});

console.log(`\n${n} pruebas pasaron.`);
console.log(`Informe de prueba: total ${report.totalEarned}, cuota ${report.feeUYU}, ${report.multiple} veces, ocupación ${report.occupancyPct} %, cantina ${report.cantinaCollected}`);
console.log(`Consejo: ${report.tip}`);
const out = process.argv[2];
if (out) {
  writeFileSync(`${out}/informe-mail-generado.html`, buildMonthlyReportEmail(report, { ownerFirstName: 'Sofía', detailUrl: 'https://demo.armapartido.com/?tab=admin', logoUrl: 'https://demo.armapartido.com/brand/logo-horizontal-color.png' }));
  console.log(`Mail escrito en ${out}/informe-mail-generado.html`);
}
