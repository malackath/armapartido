// Prueba de punta a punta contra los emuladores (auth, firestore, functions).
// Uso (desde la raíz del repo):
//   npx firebase-tools emulators:exec --project demo-armapartido --only auth,firestore,functions \
//     "FIREBASE_EMULATORS=1 DEMO_PASSWORD=prueba-local-123 npx tsx scripts/seed-demo.ts && node functions/test/armado.emulator.mjs"
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
process.env.GCLOUD_PROJECT = 'demo-armapartido';
process.env.TZ = 'America/Montevideo';

const { initializeApp } = await import('firebase/app');
const { getAuth, connectAuthEmulator, signInWithEmailAndPassword } = await import('firebase/auth');
const { getFunctions, connectFunctionsEmulator, httpsCallable } = await import('firebase/functions');
const admin = require('../node_modules/firebase-admin/lib/app/index.js');
const { getFirestore } = require('../node_modules/firebase-admin/lib/firestore/index.js');
admin.initializeApp({ projectId: 'demo-armapartido' });
const db = getFirestore();
const harness = require('../lib-test/harness.js');

const CLUB = 'los_jacarandas';
const club = db.doc(`clubs/${CLUB}`);
const pw = process.env.DEMO_PASSWORD || 'prueba-local-123';

async function login(name, email) {
  const app = initializeApp({ apiKey: 'demo', projectId: 'demo-armapartido' }, name);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const fns = getFunctions(app, 'southamerica-east1');
  connectFunctionsEmulator(fns, '127.0.0.1', 5001);
  const cred = await signInWithEmailAndPassword(auth, email, pw);
  const call = (fn, data) => httpsCallable(fns, fn)(data).then((r) => r.data);
  return { uid: cred.user.uid, call };
}

function iso(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
const inDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };
const dow = (s) => new Date(`${s}T12:00:00`).getDay();

// Deja el club sin pedidos ni propuestas para que el escenario sea predecible.
async function clean() {
  for (const sub of ['matchRequests', 'proposedMatches', 'fillSearches', 'fillInvites']) {
    const snap = await club.collection(sub).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }
}

async function fakeRequest(uid, name, category, date, startMinute, endMinute) {
  const id = `mreq_test_${uid}_${date}_${startMinute}`;
  await club.collection('matchRequests').doc(id).set({
    id, clubId: CLUB, clubIds: [CLUB], creatorUid: uid, creatorName: name, partnerUid: '', partnerName: '', partnerAccepted: true,
    category, modality: 'masculino', requestType: 'priority', date, dayOfWeek: dow(date), startMinute, endMinute,
    isSameDay: date === iso(new Date()), status: 'waiting', unfilledAlertSent: false,
  });
  return id;
}

async function pendingMatches() {
  const s = await club.collection('proposedMatches').where('status', '==', 'pending').get();
  return s.docs.map((d) => d.data());
}

const results = [];
async function step(name, fn) {
  try { await fn(); results.push(`OK   ${name}`); }
  catch (e) { results.push(`FALLA ${name}: ${e.message}`); }
}

const jugador = await login('j', 'jugador@demo.armapartido.com');
const mostrador = await login('m', 'mostrador@demo.armapartido.com');
const D = inDays(3);
const T = 20 * 60; // 20:00 a 23:00

await step('1. Pedido del jugador + 3 compatibles: el servidor arma el partido y retiene la cancha', async () => {
  await clean();
  await fakeRequest('demo-p08', 'Florencia Castro', 5, D, T, T + 180);
  await fakeRequest('demo-p09', 'Rodrigo Núñez', 5, D, T, T + 180);
  await fakeRequest('demo-p10', 'Mateo Cabrera', 5, D, T, T + 180);
  const res = await jugador.call('armadoCrearPedido', {
    clubId: CLUB, modality: 'masculino', requestType: 'priority', date: D, dayOfWeek: dow(D), startMinute: T, endMinute: T + 180, partnerUid: '', partnerName: '',
  });
  assert.ok(res.proposedMatch, 'no armó partido');
  assert.equal(res.proposedMatch.slots.length, 4);
  const bk = (await club.collection('bookings').doc(res.proposedMatch.bookingId).get()).data();
  assert.equal(bk.status, 'held');
  const notifs = await club.collection('notifications').where('eventType', '==', 'match_proposed').get();
  assert.ok(notifs.size >= 4, `avisos de propuesta: ${notifs.size}`);
});

await step('2. Tres aceptan a la vez (Simular OK) y el jugador acepta: queda confirmado sin pisarse', async () => {
  const [m] = await pendingMatches();
  const others = m.slots.filter((s) => s.uid !== jugador.uid);
  await Promise.all(others.map((s) => jugador.call('armadoResponder', { clubId: CLUB, matchId: m.id, slotUid: s.uid, decision: 'accepted' })));
  const mid = (await club.collection('proposedMatches').doc(m.id).get()).data();
  assert.equal(mid.slots.filter((s) => s.status === 'accepted').length, 3, 'se perdió una aceptación');
  const r = await jugador.call('armadoResponder', { clubId: CLUB, matchId: m.id, slotUid: jugador.uid, decision: 'accepted' });
  assert.equal(r.result, 'confirmed');
  const bk = (await club.collection('bookings').doc(m.bookingId).get()).data();
  assert.equal(bk.status, 'confirmed');
});

await step('3. Carrera: 10 búsquedas al mismo tiempo con 4 compatibles arman un solo partido', async () => {
  await clean();
  const D2 = inDays(4);
  for (const [u, n] of [['demo-p08', 'F'], ['demo-p09', 'R'], ['demo-p10', 'M'], ['demo-p07', 'S']]) await fakeRequest(u, n, 5, D2, T, T + 180);
  await Promise.all(Array.from({ length: 10 }, () => jugador.call('armadoBuscar', { clubId: CLUB }).catch(() => null)));
  const pend = await pendingMatches();
  assert.equal(pend.length, 1, `partidos armados: ${pend.length}`);
});

await step('4. Un jugador rechaza (falta uno encendido): el partido sigue, sale solo él y se busca reemplazo', async () => {
  const [m] = await pendingMatches();
  const decliner = m.slots[0];
  const r = await jugador.call('armadoResponder', { clubId: CLUB, matchId: m.id, slotUid: decliner.uid, decision: 'declined' });
  assert.equal(r.result, 'replaced_or_cancelled');
  const after = (await club.collection('proposedMatches').doc(m.id).get()).data();
  assert.equal(after.status, 'pending');
  assert.equal(after.slots.length, 3);
  const bk = (await club.collection('bookings').doc(m.bookingId).get()).data();
  assert.equal(bk.status, 'held');
  const reqs = await club.collection('matchRequests').get();
  const byUid = Object.fromEntries(reqs.docs.map((d) => [d.get('creatorUid'), d.get('status')]));
  assert.equal(byUid[decliner.uid], 'cancelled');
  const fs = await club.collection('fillSearches').where('matchId', '==', m.id).get();
  assert.equal(fs.size, 1);
});

await step('4b. Con "falta uno" apagado por el club: como antes, se libera la cancha y los otros vuelven a la espera', async () => {
  await clean();
  await club.update({ fillEnabled: false });
  const D2 = inDays(2);
  for (const [u, n] of [['demo-p08', 'F'], ['demo-p09', 'R'], ['demo-p10', 'M'], ['demo-p07', 'S']]) await fakeRequest(u, n, 5, D2, T, T + 180);
  await jugador.call('armadoBuscar', { clubId: CLUB });
  assert.equal((await pendingMatches()).length, 1, 'no armó partido');
  const [m] = await pendingMatches();
  const decliner = m.slots[0];
  await jugador.call('armadoResponder', { clubId: CLUB, matchId: m.id, slotUid: decliner.uid, decision: 'declined' });
  const bk = (await club.collection('bookings').doc(m.bookingId).get()).data();
  assert.equal(bk.status, 'cancelled');
  const reqs = await club.collection('matchRequests').get();
  const st = reqs.docs.map((d) => d.get('status'));
  assert.equal(st.filter((x) => x === 'waiting').length, 3);
  await club.update({ fillEnabled: true });
});

await step('5. Un jugador no puede responder por otro con cuenta (sí el mostrador)', async () => {
  await clean();
  const D3 = inDays(5);
  for (const [u, n] of [['demo-p08', 'F'], ['demo-p09', 'R'], ['demo-p10', 'M']]) await fakeRequest(u, n, 5, D3, T, T + 180);
  await jugador.call('armadoCrearPedido', { clubId: CLUB, modality: 'masculino', requestType: 'priority', date: D3, dayOfWeek: dow(D3), startMinute: T, endMinute: T + 180, partnerUid: '', partnerName: '' });
  const [m] = await pendingMatches();
  // La jugadora (otra cuenta real) no puede aceptar el lugar del jugador.
  const jugadora = await login('ja', 'jugadora@demo.armapartido.com');
  await assert.rejects(jugadora.call('armadoResponder', { clubId: CLUB, matchId: m.id, slotUid: jugador.uid, decision: 'accepted' }));
  const r = await mostrador.call('armadoResponder', { clubId: CLUB, matchId: m.id, slotUid: jugador.uid, decision: 'accepted' });
  assert.equal(r.result, 'pending');
});

await step('6. Reloj: propuesta vencida se libera, el que no contestó queda afuera y avisa a los 4', async () => {
  const [m] = await pendingMatches();
  await club.collection('proposedMatches').doc(m.id).update({ expiresAt: new Date(Date.now() - 60000).toISOString() });
  const rep = await harness.runClock();
  assert.ok(rep.expiredMatches >= 1, JSON.stringify(rep));
  const after = (await club.collection('proposedMatches').doc(m.id).get()).data();
  assert.equal(after.status, 'cancelled');
  const bk = (await club.collection('bookings').doc(m.bookingId).get()).data();
  assert.equal(bk.status, 'cancelled');
  const mine = (await club.collection('matchRequests').where('creatorUid', '==', jugador.uid).get()).docs.map((d) => d.get('status'));
  assert.ok(mine.includes('waiting') || mine.includes('proposed'), `pedido del que aceptó: ${mine}`);
  const exp = await club.collection('notifications').where('eventType', '==', 'match_expired').get();
  assert.ok(exp.size >= 4, `avisos de vencido: ${exp.size}`);
});

await step('7. Reloj: cancha retenida sin propuesta y vencida se libera', async () => {
  const id = 'bk_test_huerfana';
  await club.collection('bookings').doc(id).set({ id, clubId: CLUB, courtId: 'cancha_1', courtName: 'Cancha 1', date: inDays(2), startMinute: 600, endMinute: 690, type: 'matched', status: 'held', holdExpiresAt: new Date(Date.now() - 60000).toISOString() });
  await harness.runClock();
  assert.equal((await club.collection('bookings').doc(id).get()).get('status'), 'cancelled');
});

await step('8. Reloj: aviso automático 1 hora antes para pedido del mismo día sin armar', async () => {
  await clean();
  const now = new Date();
  const start = now.getHours() * 60 + now.getMinutes() + 30;
  if (start + 90 > 24 * 60) { results.push('     (8 salteado: muy tarde en el día para probar)'); return; }
  const id = await fakeRequest(jugador.uid, 'Martín Silva', 5, iso(now), start, start + 90);
  await harness.runClock();
  assert.equal((await club.collection('matchRequests').doc(id).get()).get('unfilledAlertSent'), true);
});

await step('9. Reloj: pedido puntual de un día que ya pasó queda vencido', async () => {
  const id = await fakeRequest('demo-p12', 'Gonzalo', 6, inDays(-1), 600, 780);
  await harness.runClock();
  assert.equal((await club.collection('matchRequests').doc(id).get()).get('status'), 'expired');
});

console.log('\n' + results.join('\n'));
process.exit(results.some((r) => r.startsWith('FALLA')) ? 1 : 0);
