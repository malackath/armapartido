/**
 * Pruebas puras (17/11/2026): arreglos de "Importar planilla" y validar al jugador contra Clientes.
 *   npx tsx scripts/test-sumarse.ts
 */
import assert from 'node:assert/strict';
import { cleanPlayers, parseCsv } from '../src/lib/migracion';
import { rowsFromReport } from '../src/lib/importarClientes';
import { findClientForJoin, joinPolicyOf } from '../src/lib/sumarse';
import type { ClubClient } from '../src/types/clientes';

let n = 0;
let bad = 0;
const t = (name: string, fn: () => void) => {
  n++;
  try {
    fn();
    console.log('OK  ', name);
  } catch (e) {
    bad++;
    console.log('MAL ', name, (e as Error).message);
  }
};
const read = (csv: string) => cleanPlayers(parseCsv(csv));

t('P1. "Nombre y apellido" y "Teléfono móvil" se reconocen', () => {
  const r = read('Nombre y apellido;Teléfono móvil;E-mail\nAna Paz;099123456;ana@x.com\n');
  assert.equal(r.ready.length, 1);
  assert.equal(r.ready[0].name, 'Ana Paz');
  assert.equal(rowsFromReport(r)[0].phone, '+59899123456');
});
t('P2. "Pereira, Matías" en una sola celda queda "Matías Pereira"', () => {
  assert.equal(read('Apellido y nombre,Celular\n"Pereira, Matías",099123456\n').noEmail[0].name, 'Matías Pereira');
});
t('P3. Celular ilegible con mail: se carga sin celular y se avisa', () => {
  const r = read('Nombre;Celular;Mail\nCarla;099 12 34 5;carla@x.com\n');
  assert.equal(r.ready.length, 1);
  assert.equal(rowsFromReport(r)[0].phone, '');
  assert.match(r.warnings[0].reason, /no se puede leer/);
});
t('P4. Celular ilegible sin mail: va a revisar a mano', () => {
  const r = read('Nombre;Celular\nCarla;099 12 34 5\n');
  assert.equal(r.ready.length + r.noEmail.length, 0);
  assert.match(r.discarded[0].reason, /no se puede leer/);
});
t('P5. Pareja con el mismo mail: se cargan las dos, la segunda sin mail y con su celular', () => {
  const r = read('Nombre;Celular;Mail\nAna Paz;099111111;pareja@x.com\nLuis Rey;099222222;pareja@x.com\n');
  const rows = rowsFromReport(r);
  assert.equal(rows.length, 2);
  assert.equal(rows[1].name, 'Luis Rey');
  assert.equal(rows[1].email, '');
  assert.equal(rows[1].phone, '+59899222222');
  assert.equal(r.duplicates.length, 0);
  assert.match(r.warnings[0].reason, /comparte el mail con Ana Paz/);
});
t('P6. Pareja con el mismo mail y sin otro contacto: a revisar a mano', () => {
  const r = read('Nombre;Mail\nAna Paz;pareja@x.com\nLuis Rey;pareja@x.com\n');
  assert.equal(rowsFromReport(r).length, 1);
  assert.match(r.discarded[0].reason, /comparte el mail/);
});
t('P7. El mismo jugador dos veces se sigue juntando', () => {
  const r = read('Nombre;Celular;Mail\nAna Paz;099111111;ana@x.com\nana paz;;ANA@x.com\n');
  assert.equal(rowsFromReport(r).length, 1);
  assert.equal(r.duplicates.length, 1);
});
t('P8. Lista de reservas (con fecha) se marca y las columnas que no usamos se informan', () => {
  const r = read('Fecha;Hora;Cancha;Cliente;Celular;Pagó\n12/11/2026;20:00;Cancha 1;Ana Paz;099123456;sí\n');
  assert.equal(r.looksLikeBookings, true);
  assert.deepEqual(r.unknownColumns, ['Fecha', 'Pagó']);
  assert.equal(read('Nombre;Celular\nAna;099123456\n').looksLikeBookings, false);
});

const ficha = (id: string, extra: Partial<ClubClient> = {}) =>
  ({ id, clubId: 'c', name: id, phone: '', noPhone: true, email: '', category: null, uid: '', origin: 'migracion', status: 'active', balance: 0, ...extra }) as ClubClient;
t('S1. Mail en una ficha sin app: es él', () => {
  const r = findClientForJoin([ficha('a', { email: 'a@x.uy' })], 'a@x.uy', '', 'u1');
  assert.equal(r.match?.id, 'a');
});
t('S2. Dos fichas con el mismo mail: no se elige ninguna (pedido)', () => {
  assert.equal(findClientForJoin([ficha('a', { email: 'a@x.uy' }), ficha('b', { email: 'a@x.uy' })], 'a@x.uy', '', 'u1').match, null);
});
t('S3. Ficha ya unida a otra cuenta, borrada o unida a otra ficha: no cuenta', () => {
  const list = [ficha('a', { email: 'a@x.uy', uid: 'otro' }), ficha('b', { email: 'a@x.uy', erased: true }), ficha('c', { email: 'a@x.uy', mergedInto: 'z' })];
  assert.equal(findClientForJoin(list, 'a@x.uy', '', 'u1').match, null);
});
t('S4. Por celular solo se sugiere, nunca se une', () => {
  const r = findClientForJoin([ficha('a', { phone: '+59899111111' })], 'otro@x.uy', '+59899111111', 'u1');
  assert.equal(r.match, null);
  assert.equal(r.similar?.id, 'a');
});
t('S5. Sin dato el club queda abierto', () => {
  assert.equal(joinPolicyOf({}), 'abierto');
  assert.equal(joinPolicyOf({ joinPolicy: 'solo_clientes' }), 'solo_clientes');
});

console.log(`\n${n - bad} de ${n} bien`);
process.exit(bad ? 1 : 0);
