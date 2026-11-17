// Ficha de cliente al sumarse desde la app, de punta a punta contra los emuladores.
// Se corre después de cargar la demo (ver package.json).
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';
process.env.GCLOUD_PROJECT = 'demo-armapartido';
const admin = require('../node_modules/firebase-admin/lib/app/index.js');
const { getFirestore } = require('../node_modules/firebase-admin/lib/firestore/index.js');
const { getAuth } = require('../node_modules/firebase-admin/lib/auth/index.js');
if (!admin.getApps().length) admin.initializeApp({ projectId: 'demo-armapartido' });
const db = getFirestore();
const auth = getAuth();
const CLUB = 'los_jacarandas';
const club = db.doc(`clubs/${CLUB}`);
const H = require('../lib-test/harness.js');
const results = [];
async function step(name, fn) {
  try { await fn(); results.push(`OK   ${name}`); } catch (e) { results.push(`FALLA ${name}: ${e.message}`); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 15000) {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > ms) return v;
    await sleep(400);
  }
}
const fichasDe = async (uid) => (await club.collection('clients').where('uid', '==', uid).get()).docs.map((d) => d.data());
async function sumarse(email, verified, phone, role = 'player') {
  const u = await auth.createUser({ email, emailVerified: verified, password: 'prueba-local-123', displayName: email.split('@')[0] });
  await db.doc(`users/${u.uid}/private/info`).set({ uid: u.uid, email, ...(phone ? { phone } : {}), updatedAt: new Date() });
  await club.collection('memberships').doc(u.uid).set({ uid: u.uid, clubId: CLUB, displayName: `Prueba ${email.split('@')[0]}`, role, category: 5, gender: 'masculino', preferredModality: 'mixto', weeklyAvailability: [], noShowCount: 0, blocked: false, isDiscoverable: true, createdAt: new Date() });
  // Lo mismo que hace el disparador clientesAlSumarse (se llama directo: no depende de que el
  // emulador registre el disparador, y si también corre, la segunda vez no hace nada)
  const res = await H.linkOrCreateClient(CLUB, u.uid);
  console.log(`   ${email}: ${res.action}`);
  return u.uid;
}

const martin = (await auth.getUserByEmail('jugador@demo.armapartido.com')).uid;

await step('C1. Martín (de la demo) tiene una sola ficha aunque el servidor también corrió al cargarla', async () => {
  const res = await H.linkOrCreateClient(CLUB, martin);
  assert.equal(res.action, 'ya_tenia');
  const f = await fichasDe(martin);
  assert.equal(f.length, 1);
  assert.equal(f[0].id, `u_${martin}`);
  assert.equal(f[0].balance, 260);
});

await step('C2. Mail verificado igual al de una ficha sin app: se une sola y pasan sus cuponeras', async () => {
  const uid = await sumarse('clara.demo@ejemplo.uy', true, '');
  const clara = await waitFor(async () => { const d = (await club.collection('clients').doc('demo_cli_clara').get()).data(); return d.uid ? d : null; });
  assert.equal(clara.uid, uid);
  assert.equal(clara.linkedBy, 'mail');
  const packs = (await club.collection('clientPacks').where('clientId', '==', 'demo_cli_clara').get()).docs.map((d) => d.data());
  assert.ok(packs.length >= 1);
  assert.ok(packs.every((p) => p.uid === uid), 'la cuponera ahora es visible en su app');
  await sleep(800);
  assert.equal((await fichasDe(uid)).length, 1, 'no se creó una ficha de más');
});

await step('C3. Mail SIN verificar igual al de una ficha: no se une, se crea una ficha nueva', async () => {
  await club.collection('clients').doc('demo_cli_emilio').update({ email: 'emilio.demo@ejemplo.uy' });
  const uid = await sumarse('emilio.demo@ejemplo.uy', false, '');
  const f = await waitFor(async () => { const x = await fichasDe(uid); return x.length ? x : null; });
  assert.equal(f.length, 1);
  assert.equal(f[0].origin, 'app');
  assert.equal((await club.collection('clients').doc('demo_cli_emilio').get()).get('uid'), '');
});

await step('C4. Mismo celular que una ficha sin app: ficha nueva y las dos quedan como posible repetido', async () => {
  const uid = await sumarse('ana.nueva@ejemplo.uy', true, '099 111 222');
  const f = await waitFor(async () => { const x = await fichasDe(uid); return x.length ? x : null; });
  assert.equal(f[0].phone, '+59899111222');
  assert.equal(f[0].reviewDuplicate, true);
  assert.equal((await club.collection('clients').doc('demo_cli_ana').get()).get('reviewDuplicate'), true);
  assert.equal((await club.collection('clients').doc('demo_cli_ana').get()).get('uid'), '', 'por celular nunca se une sola');
});

await step('C5. Un encargado nuevo (no jugador) no genera ficha', async () => {
  const uid = await sumarse('encargado2@ejemplo.uy', true, '', 'staff');
  await sleep(3000);
  assert.equal((await fichasDe(uid)).length, 0);
});

// ---------- Importar la planilla desde Admin → Clientes (16/11) ----------
const { initializeApp: initClient } = await import('firebase/app');
const { getAuth: getClientAuth, connectAuthEmulator, signInWithEmailAndPassword } = await import('firebase/auth');
const { getFunctions, connectFunctionsEmulator, httpsCallable } = await import('firebase/functions');
async function login(name, email) {
  const app = initClient({ apiKey: 'demo', projectId: 'demo-armapartido' }, 'cli-' + name);
  const a = getClientAuth(app);
  connectAuthEmulator(a, 'http://127.0.0.1:9099', { disableWarnings: true });
  const fns = getFunctions(app, 'southamerica-east1');
  connectFunctionsEmulator(fns, '127.0.0.1', 5001);
  await signInWithEmailAndPassword(a, email, process.env.DEMO_PASSWORD || 'prueba-local-123');
  return { call: (fn, data) => httpsCallable(fns, fn)(data).then((r) => r.data) };
}
const dueno = await login('d', 'dueno@demo.armapartido.com');
const mostr = await login('m', 'mostrador@demo.armapartido.com');
const ana = (await club.collection('clients').doc('demo_cli_ana').get()).data();
const PERMISO = 'Tengo permiso de mis jugadores para pasar sus datos (Ley 18.331). Prueba.';
const filas = [
  { row: 2, name: 'Importada Uno', email: 'importada.uno@ejemplo.uy', phone: '+59891111111', category: 5, fixed: { dayOfWeek: 2, startMinute: 7 * 60, court: 'Cancha 1' } },
  { row: 3, name: 'Ana repetida', email: '', phone: ana.phone, category: 4, fixed: null },
  { row: 4, name: 'Sin Cancha', email: '', phone: '+59892222222', category: null, fixed: { dayOfWeek: 6, startMinute: 7 * 60, court: 'Cancha 9' } },
];
let imp = null;
await step('I1. Importar: el mostrador no puede y sin el permiso de los jugadores tampoco', async () => {
  await assert.rejects(mostr.call('clientesImportar', { clubId: CLUB, rows: filas, permission: PERMISO }));
  await assert.rejects(dueno.call('clientesImportar', { clubId: CLUB, rows: filas, permission: '' }));
});
await step('I2. El dueño importa: fichas nuevas, no duplica a la que ya estaba, turno fijo por 26 semanas y queda el permiso', async () => {
  const antes = (await club.collection('clients').get()).size;
  imp = await dueno.call('clientesImportar', { clubId: CLUB, rows: filas, permission: PERMISO, sourceFile: 'prueba.csv', fileRows: 3 });
  assert.equal(imp.created, 2); assert.equal(imp.already, 1); assert.equal(imp.fixed, 1);
  assert.deepEqual(imp.noCourt, ['Sin Cancha']);
  assert.equal((await club.collection('clients').get()).size, antes + 2);
  const uno = (await club.collection('clients').where('email', '==', 'importada.uno@ejemplo.uy').get()).docs[0].data();
  assert.equal(uno.origin, 'migracion'); assert.equal(uno.noticeGiven, false, 'todavía no se le avisó'); assert.equal(uno.uid, '');
  const fx = (await club.collection('fixedBookings').where('clientId', '==', uno.id).get()).docs.map((d) => d.data());
  assert.equal(fx.length, 1);
  assert.equal(fx[0].bookingIds.length + imp.weeksSkipped, 26);
  const bk = (await club.collection('bookings').doc(fx[0].bookingIds[0]).get()).data();
  assert.equal(bk.clientId, uno.id); assert.equal(bk.status, 'confirmed'); assert.ok(bk.totalPrice > 0);
  const anaDespues = (await club.collection('clients').doc('demo_cli_ana').get()).data();
  assert.equal(anaDespues.uid, ana.uid, 'no toca la cuenta');
  const mig = (await club.collection('migrations').doc(imp.migrationId).get()).data();
  assert.equal(mig.permission, PERMISO); assert.equal(mig.emailsSent, false); assert.equal(mig.via, 'admin');
});
await step('I3. Cuando el importado se registra con ese mail verificado, la ficha y su turno fijo pasan a ser suyos', async () => {
  const uid = await sumarse('importada.uno@ejemplo.uy', true, '');
  const uno = (await club.collection('clients').where('email', '==', 'importada.uno@ejemplo.uy').get()).docs[0].data();
  assert.equal(uno.uid, uid);
  const fx = (await club.collection('fixedBookings').where('clientId', '==', uno.id).get()).docs[0].data();
  assert.equal(fx.holderUid, uid);
  const bk = (await club.collection('bookings').doc(fx.bookingIds[0]).get()).data();
  assert.deepEqual(bk.playerUids, [uid]);
  assert.equal(uno.noticeGiven, true, 'al entrar a la app ya vio el aviso');
});
await step('I4. Volver a subir la misma planilla no duplica fichas ni turnos fijos', async () => {
  const antesF = (await club.collection('fixedBookings').get()).size;
  const antesC = (await club.collection('clients').get()).size;
  const r = await dueno.call('clientesImportar', { clubId: CLUB, rows: filas, permission: PERMISO, sourceFile: 'prueba.csv', fileRows: 3 });
  assert.equal(r.created, 0); assert.equal(r.fixed, 0); assert.equal(r.alreadyFixed, 1);
  assert.equal((await club.collection('fixedBookings').get()).size, antesF);
  assert.equal((await club.collection('clients').get()).size, antesC);
});

// ---------- Sumarse a un club con "Solo mis jugadores" (17/11) ----------
async function jugadorNuevo(key, email, { verified = true, phone = '' } = {}) {
  const u = await auth.createUser({ email, emailVerified: verified, password: process.env.DEMO_PASSWORD || 'prueba-local-123', displayName: key });
  await db.doc(`users/${u.uid}`).set({ uid: u.uid, displayName: `Nuevo ${key}`, category: 6, gender: 'femenino', preferredModality: 'mixto', weeklyAvailability: [], activeClubIds: [CLUB], signupDone: true, createdAt: new Date(), updatedAt: new Date() });
  await db.doc(`users/${u.uid}/private/info`).set({ uid: u.uid, email, phone, updatedAt: new Date() });
  return { uid: u.uid, ...(await login(key, email)) };
}
const avisosA = async (uid, type) => (await club.collection('notifications').where('recipientUid', '==', uid).where('eventType', '==', type).get()).size;
const duenoUid = (await auth.getUserByEmail('dueno@demo.armapartido.com')).uid;
const filasSocios = [
  { row: 2, name: 'Socia Directa', email: 'socia.directa@ejemplo.uy', phone: '+59893333333', category: 3, fixed: { dayOfWeek: 4, startMinute: 7 * 60, court: 'Cancha 2' } },
  { row: 3, name: 'Socio Otro Mail', email: 'viejo.mail@ejemplo.uy', phone: '+59894444444', category: 5, fixed: null },
];
await step('S1. Club abierto (como hoy): el servidor lo suma directo', async () => {
  const p = await jugadorNuevo('abierto', 'abierto@ejemplo.uy');
  const r = await p.call('clubSumarme', { clubId: CLUB });
  assert.equal(r.status, 'adentro');
  assert.ok((await club.collection('memberships').doc(p.uid).get()).exists);
});
await step('S2. "Solo mis jugadores": con el mail sin confirmar no puede sumarse', async () => {
  await dueno.call('clientesImportar', { clubId: CLUB, rows: filasSocios, permission: PERMISO, sourceFile: 'socios.csv', fileRows: 2 });
  await club.update({ joinPolicy: 'solo_clientes' });
  const p = await jugadorNuevo('sinconfirmar', 'sin.confirmar@ejemplo.uy', { verified: false });
  await assert.rejects(p.call('clubSumarme', { clubId: CLUB }));
  assert.equal((await club.collection('memberships').doc(p.uid).get()).exists, false);
});
await step('S3. Su mail está en Clientes: entra directo, la ficha y el turno fijo pasan a ser suyos y queda con la categoría del club', async () => {
  const p = await jugadorNuevo('socia', 'socia.directa@ejemplo.uy');
  const r = await p.call('clubSumarme', { clubId: CLUB });
  assert.equal(r.status, 'encontrado');
  assert.match(r.fixed ?? '', /jueves 07:00 · Cancha 2/);
  const m = (await club.collection('memberships').doc(p.uid).get()).data();
  assert.equal(m.role, 'player'); assert.equal(m.category, 3); assert.equal(m.categoryReview, 'ok');
  const f = await fichasDe(p.uid);
  assert.equal(f.length, 1); assert.equal(f[0].name, 'Socia Directa');
  const fx = (await club.collection('fixedBookings').where('clientId', '==', f[0].id).get()).docs[0].data();
  assert.equal(fx.holderUid, p.uid);
});
let pedido = null;
await step('S4. No está en Clientes pero el celular coincide: queda un pedido con la ficha parecida y se avisa al dueño (una sola vez)', async () => {
  const antes = await avisosA(duenoUid, 'join_request');
  pedido = await jugadorNuevo('otromail', 'nuevo.mail@ejemplo.uy', { phone: '+59894444444' });
  assert.equal((await pedido.call('clubSumarme', { clubId: CLUB })).status, 'pendiente');
  assert.equal((await pedido.call('clubSumarme', { clubId: CLUB })).status, 'pendiente');
  const req = (await club.collection('joinRequests').doc(pedido.uid).get()).data();
  assert.equal(req.status, 'pendiente'); assert.equal(req.similarClientName, 'Socio Otro Mail');
  assert.equal((await club.collection('memberships').doc(pedido.uid).get()).exists, false);
  assert.equal(await avisosA(duenoUid, 'join_request'), antes + 1);
});
await step('S5. Un jugador no puede aprobar; el encargado lo une a su ficha y al jugador le llega el aviso', async () => {
  await assert.rejects(pedido.call('clubPedidoResolver', { clubId: CLUB, uid: pedido.uid, action: 'aprobar' }));
  assert.equal((await mostr.call('clubPedidoResolver', { clubId: CLUB, uid: pedido.uid, action: 'unir' })).status, 'aprobado');
  assert.ok((await club.collection('memberships').doc(pedido.uid).get()).exists);
  const f = await fichasDe(pedido.uid);
  assert.equal(f.length, 1); assert.equal(f[0].name, 'Socio Otro Mail'); assert.equal(f[0].linkedBy, 'mostrador');
  assert.equal((await club.collection('joinRequests').doc(pedido.uid).get()).data().status, 'aprobado');
  assert.equal(await avisosA(pedido.uid, 'join_resolved'), 1);
});
await step('S6. Desconocido: el dueño lo rechaza y no vuelve a pedir; otro desconocido aprobado queda con ficha nueva', async () => {
  const x = await jugadorNuevo('desconocido', 'desconocido@ejemplo.uy');
  assert.equal((await x.call('clubSumarme', { clubId: CLUB })).status, 'pendiente');
  assert.equal((await dueno.call('clubPedidoResolver', { clubId: CLUB, uid: x.uid, action: 'rechazar' })).status, 'rechazado');
  assert.equal((await x.call('clubSumarme', { clubId: CLUB })).status, 'rechazado');
  assert.equal((await club.collection('memberships').doc(x.uid).get()).exists, false);
  const y = await jugadorNuevo('aprobado', 'aprobado@ejemplo.uy');
  assert.equal((await y.call('clubSumarme', { clubId: CLUB })).status, 'pendiente');
  assert.equal((await dueno.call('clubPedidoResolver', { clubId: CLUB, uid: y.uid, action: 'aprobar' })).status, 'aprobado');
  const f = await fichasDe(y.uid);
  assert.equal(f.length, 1); assert.equal(f[0].origin, 'app');
});
await club.update({ joinPolicy: 'abierto' });

console.log('\nClientes (ficha al sumarse desde la app):');
results.forEach((r) => console.log(r));
const bad = results.filter((r) => r.startsWith('FALLA')).length;
console.log(`${results.length - bad} de ${results.length} bien`);
process.exit(bad ? 1 : 0);
