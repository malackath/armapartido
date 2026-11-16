/**
 * Pruebas de la lógica de fichas, cuponeras, libro y números (sin Firebase).
 * Uso: npx tsx scripts/test-clientes.ts [carpeta-de-salida]
 * Deja en la carpeta una planilla .xlsx y un .csv de ejemplo para abrir en Excel.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Booking, Club, PaymentRecord } from '../src/types/padel';
import type { ClientPack, ClubClient, Sale } from '../src/types/clientes';
import {
  buildLedger,
  clientDebts,
  clientKey,
  computeNumbers,
  formatPhone,
  keyResolver,
  normalizePhone,
  packUsableFor,
  pendingValue,
  periodOf,
  possibleDuplicates,
  previousPeriod,
  searchClients,
  sheetClientes,
  sheetCuponeras,
  sheetMovimientos,
  sheetResumenDiario,
} from '../src/lib/clientes';
import { cashSummary } from '../src/lib/caja';
import { crc32, toCSV, toXLSX } from '../src/lib/planilla';

const out = process.argv[2] || 'tmp-clientes';
mkdirSync(out, { recursive: true });
let pass = 0;
let fail = 0;
const ok = (name: string, cond: boolean, detail = '') => {
  if (cond) pass += 1;
  else fail += 1;
  console.log(`${cond ? 'OK  ' : 'FALLA'} ${name}${detail ? ` · ${detail}` : ''}`);
};

const today = '2026-11-16'; // lunes
const club = { id: 'c1', name: 'Club Prueba', ownerUid: 'own', nightFromHour: 19, openHour: 8, closeHour: 23, slotDurationMinutes: 90, courtCount: 2, basePrice: 1800, nightPrice: 2400, weekendPrice: 2200 } as unknown as Club;
const cli = (id: string, name: string, phone: string, extra: Partial<ClubClient> = {}): ClubClient => ({
  id, clubId: 'c1', name, phone: normalizePhone(phone), noPhone: !phone, email: '', category: 4, uid: '', origin: 'mostrador', createdByUid: 's', createdByName: 'Diego',
  createdOn: '2026-11-10', noticeGiven: true, acceptsNews: false, rut: '', businessName: '', note: '', balance: 0, status: 'active', ...extra,
});

// 1. Celular siempre igual
const forms = ['099 123 456', '99-123-456', '+598 99 123 456', '0059899123456', '99123456', '59899123456'];
const norm = forms.map(normalizePhone);
ok('1. El mismo celular escrito de 6 formas queda igual', norm.every((n) => n === '+59899123456'), norm.join(' '));
ok('1b. Se muestra como 099 123 456', formatPhone('+59899123456') === '099 123 456');
ok('1c. Un número corto no es celular', normalizePhone('12345') === '');

// 2. Buscador y repetidos
const juan = cli('a', 'Juan Pérez', '099123456');
const juana = cli('b', 'Juana Pérez', '099123870');
const juan2 = cli('c', 'Juan Perez', '99-123-456', { reviewDuplicate: true });
const clients = [juan, juana, juan2];
const byPhone = searchClients(clients, [], '099 123 456');
ok('2. Buscar por celular encuentra exacto primero', byPhone[0]?.client?.phone === '+59899123456' && byPhone[0].score === 100);
const byName = searchClients(clients, [{ uid: 'u9', displayName: 'Juan Rodríguez', role: 'player', category: 5 } as never], 'juan');
ok('2b. Buscar por nombre trae fichas y jugadores de la app sin ficha', byName.some((h) => h.member) && byName.filter((h) => h.client).length === 3);
ok('2c. Sin acento encuentra con acento', searchClients(clients, [], 'perez').length === 3);
const dups = possibleDuplicates(clients);
ok('2d. Mismo celular con dos fichas = posible repetido', dups.length === 1 && dups[0].length === 2);

// 3. Cuponera: horario, unidad y vencimiento (decisión 3: si no cubre, no se usa)
const pack: ClientPack = { id: 'p1', clubId: 'c1', clientId: 'a', clientName: 'Juan Pérez', uid: '', packTypeId: 't', name: '10 partes valle', unit: 'parte', validity: 'valle', usesTotal: 10, usesLeft: 7, price: 5500, soldOn: '2026-11-02', expiresOn: '2027-01-31', paymentId: 'pay1', saleId: 's1', status: 'active', uses: [] };
ok('3. Valle: lunes 17 h se puede', packUsableFor({ pack, club, date: today, startMinute: 17 * 60, unit: 'parte', today }).ok);
const peak = packUsableFor({ pack, club, date: today, startMinute: 20 * 60, unit: 'parte', today });
ok('3b. Valle: lunes 20 h NO se puede (no se cobra diferencia)', !peak.ok, peak.reason);
ok('3c. Sábado tampoco', !packUsableFor({ pack, club, date: '2026-11-21', startMinute: 10 * 60, unit: 'parte', today }).ok);
ok('3d. De partes no paga un turno completo', !packUsableFor({ pack, club, date: today, startMinute: 600, unit: 'turno', today }).ok);
ok('3e. Vencida no se usa', !packUsableFor({ pack: { ...pack, expiresOn: '2026-11-15' }, club, date: today, startMinute: 600, unit: 'parte', today }).ok);
ok('3f. Pendiente de uso = 7/10 de $5.500', pendingValue(pack, today) === 3850);

// 4. Ledger y caja: usar la cuponera no es plata nueva
const pays: PaymentRecord[] = [
  { id: 'pay1', clubId: 'c1', uid: 's', clubOwnerUid: 'own', payerName: 'Juan Pérez', referenceId: 'p1', amount: 5500, method: 'efectivo', kind: 'venta', rubro: 'cuponeras', status: 'completed', day: '2026-11-02', clientId: 'a' },
  { id: 'pay2', clubId: 'c1', uid: 's', clubOwnerUid: 'own', payerName: 'Ana', referenceId: 'bk1', amount: 595, method: 'mercadopago', kind: 'match_share', status: 'completed', day: today, invoiceStatus: 'emitida', invoiceNumber: '0012345' },
  { id: 'pay3', clubId: 'c1', uid: 's', clubOwnerUid: 'own', payerName: 'Sin nombre', referenceId: 'x', amount: 180, method: 'efectivo', kind: 'cantina', status: 'completed', day: today },
  { id: 'pay4', clubId: 'c1', uid: 's', clubOwnerUid: 'own', payerName: 'Luis', referenceId: 'x', amount: 300, method: 'efectivo', kind: 'venta', rubro: 'clases', status: 'completed', day: today },
];
const sales: Sale[] = [
  { id: 's1', clubId: 'c1', day: '2026-11-02', clientId: 'a', clientName: 'Juan Pérez', rubro: 'cuponeras', concept: '10 partes', qty: 1, amount: 5500, method: 'efectivo', paymentId: 'pay1', paid: true, status: 'vigente', bookingId: '', packId: 'p1', staffUid: 's', staffName: 'Lucía' },
  { id: 's2', clubId: 'c1', day: today, clientId: 'a', clientName: 'Juan Pérez', rubro: 'cancha', concept: 'Parte C2 (uso 4 de 10)', qty: 1, amount: 550, method: 'cuponera', paymentId: '', paid: true, status: 'vigente', bookingId: 'bk1', packId: 'p1', staffUid: 's', staffName: 'Lucía' },
  { id: 's3', clubId: 'c1', day: '2026-10-01', clientId: 'b', clientName: 'Juana Pérez', rubro: 'clases', concept: 'Clase con Pablo', qty: 1, amount: 900, method: 'cuenta', paymentId: '', paid: false, status: 'vigente', bookingId: '', packId: '', staffUid: 's', staffName: 'Lucía' },
];
const ledger = buildLedger(pays, sales, clients);
ok('4. Libro: 4 cobros + 1 uso de cuponera + 1 a cuenta', ledger.length === 6, ledger.map((r) => r.kind).join(','));
const use = ledger.find((r) => r.id === 's2')!;
ok('4b. El uso de cuponera no suma plata y no factura', use.amount === 0 && use.invoice === 'no_corresponde');
ok('4c. El cobro viejo de MP se lee como Cancha con su número de factura', ledger.find((r) => r.id === 'pay2')?.rubro === 'cancha' && ledger.find((r) => r.id === 'pay2')?.invoiceNumber === '0012345');
const cs = cashSummary(pays, today, 0);
ok('4d. Caja de hoy: la clase no cuenta como cantina', cs.cantina === 180 && cs.total === 1075, `cantina ${cs.cantina}, total ${cs.total}`);

// 5. Deudas por ficha, también después de bajar la app
const linked = { ...juana, uid: 'uJuana' };
const debts = clientDebts({ clients: [juan, linked], consumptions: [], bookings: [], matches: [], sales, today, nowMinute: 0, nameOf: () => 'x' });
ok('5. La clase a cuenta es deuda de Juana', debts.length === 1 && debts[0].amount === 900 && debts[0].name === 'Juana Pérez');
ok('5b. Al bajar la app, su deuda vieja pasa a su cuenta', debts[0].key === 'uJuana' && keyResolver([linked])('c:b') === 'uJuana');
const merged = [{ ...juan2, status: 'archived', mergedInto: 'a' } as ClubClient, juan];
ok('5c. Ficha unida a otra: la clave vieja apunta a la que quedó', keyResolver(merged)('c:c') === clientKey(juan));

// 6. Números: la cuponera se cuenta una vez (al venderla)
const bookings: Booking[] = [
  { id: 'bk1', clubId: 'c1', courtId: 'k1', courtName: 'Cancha 2', date: today, startMinute: 600, endMinute: 690, type: 'counter', status: 'confirmed', createdByUid: 's', playerUids: [], guestName: 'Juan Pérez · 099 123 456', totalPrice: 1800, paidAmount: 1800, paymentMethod: 'club', paymentStatus: 'paid', holdExpiresAt: '', clientId: 'a' },
  { id: 'bk0', clubId: 'c1', courtId: 'k1', courtName: 'Cancha 2', date: '2026-10-20', startMinute: 600, endMinute: 690, type: 'counter', status: 'confirmed', createdByUid: 's', playerUids: [], guestName: 'Juan', totalPrice: 1800, paidAmount: 1800, paymentMethod: 'club', paymentStatus: 'paid', holdExpiresAt: '', clientId: 'a' },
];
const input = { club, courts: [{ id: 'k1', active: true }, { id: 'k2', active: true }] as never, clients, bookings, matches: [], payments: pays, sales, packs: [{ ...pack, uses: [{ bookingId: 'bk1', date: today, value: 550, atISO: '', byName: 'L', saleId: 's2' }] }], consumptions: [], cashDays: [], today, nowMinute: 700, nameOf: () => 'x' };
const mes = periodOf('mes', today);
const n = computeNumbers(input, mes);
ok('6. Período: noviembre 1 al 30', mes.from === '2026-11-01' && mes.to === '2026-11-30' && previousPeriod(mes).from === '2026-10-01');
ok('6b. Ventas por rubro: cuponeras $5.500 una sola vez, cancha solo lo cobrado', n.plata.byRubro.cuponeras === 5500 && n.plata.byRubro.cancha === 595, JSON.stringify(n.plata.byRubro));
ok('6c. Altas del mes: 3 fichas, las 3 sin app', n.altas.total === 3 && n.altas.sinApp === 3);
ok('6d. De los 2 activos de octubre (Juan jugó, Juana compró), volvió 1', n.vuelven.base === 2 && n.vuelven.count === 1, n.vuelven.list.map((x) => x.name).join(','));
ok('6e. Pagadas con cuponera: 1; usos del mes: 1', n.canchas.withPack === 1 && n.cuponeras.uses === 1);
ok('6f. Deuda abierta: $900 de 1 persona, más de 30 días', n.deuda.total === 900 && n.deuda.people === 1 && n.deuda.aging.gt30 === 900);
ok('6g. Factura: $595 emitida, el resto pendiente', n.plata.invoice.emitida === 595 && n.plata.invoice.pendiente === 5980);

// 7. Planillas
const sheets = [sheetMovimientos(ledger, '2026-10-01', '2026-11-30'), sheetResumenDiario(pays, '2026-10-01', '2026-11-30'), sheetClientes(clients, debts, () => today), sheetCuponeras(input.packs, today)];
const xlsx = toXLSX(sheets);
writeFileSync(join(out, 'planilla-prueba.xlsx'), xlsx);
writeFileSync(join(out, 'movimientos-prueba.csv'), toCSV(sheets[0].rows));
ok('7. Planilla .xlsx armada (zip con 4 hojas)', xlsx[0] === 0x50 && xlsx[1] === 0x4b && sheets.every((s) => s.rows.length >= 2), `${xlsx.length} bytes`);
ok('7b. CRC32 correcto ("123456789" = cbf43926)', crc32(new TextEncoder().encode('123456789')).toString(16) === 'cbf43926');
ok('7c. CSV con BOM y punto y coma', toCSV([['a;b', 1]]).startsWith('﻿"a;b";1'));

console.log(`\n${pass} bien, ${fail} mal. Planillas en ${out}/`);
process.exit(fail ? 1 : 0);
