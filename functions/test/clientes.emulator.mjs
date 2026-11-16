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
  assert.equal(f[0].balance, 300);
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

console.log('\nClientes (ficha al sumarse desde la app):');
results.forEach((r) => console.log(r));
const bad = results.filter((r) => r.startsWith('FALLA')).length;
console.log(`${results.length - bad} de ${results.length} bien`);
process.exit(bad ? 1 : 0);
