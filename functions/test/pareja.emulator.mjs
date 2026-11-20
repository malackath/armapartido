// Pareja fija sin torneo (20/11/2026), de punta a punta contra los emuladores. Corre con `npm test`.
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
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const inDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };
const dow = (s) => new Date(`${s}T12:00:00`).getDay();

async function clean() {
  for (const sub of ['matchRequests', 'proposedMatches', 'fillSearches', 'fillInvites', 'fixedPairs']) {
    const snap = await club.collection(sub).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }
}
const pairReqs = async (pairId) => (await club.collection('matchRequests').where('fixedPairId', '==', pairId).get()).docs.map((d) => d.data());
const openOf = (rs) => rs.filter((r) => r.status === 'waiting' || r.status === 'proposed');
const notifsFor = async (uid, after) =>
  (await club.collection('notifications').where('recipientUid', '==', uid).get()).docs.map((d) => d.data()).filter((n) => n.eventType === 'pair_invite' && (n.createdAt?.toMillis?.() ?? 0) >= after);
const code = async (p) => { try { await p; return 'ok'; } catch (e) { return e.code; } };

const results = [];
async function step(name, fn) {
  try { await fn(); results.push(`OK   ${name}`); }
  catch (e) { results.push(`FALLA ${name}: ${e.message}`); }
}

const martin = await login('pf-j', 'jugador@demo.armapartido.com');
const lucia = await login('pf-l', 'jugadora@demo.armapartido.com');
const mostrador = await login('pf-m', 'mostrador@demo.armapartido.com');
const D = inDays(3);
const NOCHE = `${dow(D)}-3`;
const TARDE = `${dow(D)}-2`;
let pairId = '';

await step('PE1. Martín invita a Lucía: queda pendiente y a Lucía le llega el aviso', async () => {
  await clean();
  const t0 = Date.now() - 1000;
  const { pair } = await martin.call('parejaInvitar', { clubId: CLUB, partnerUid: lucia.uid });
  pairId = pair.id;
  assert.equal(pair.status, 'pending');
  assert.deepEqual(pair.uids, [martin.uid, lucia.uid]);
  assert.equal(pair.modality, 'mixto');
  assert.equal((await notifsFor(lucia.uid, t0)).length, 1);
  assert.equal((await pairReqs(pairId)).length, 0, 'pendiente no busca');
});

await step('PE2. No se puede invitar dos veces al mismo, ni a uno mismo', async () => {
  assert.equal(await code(martin.call('parejaInvitar', { clubId: CLUB, partnerUid: lucia.uid })), 'functions/already-exists');
  assert.equal(await code(martin.call('parejaInvitar', { clubId: CLUB, partnerUid: martin.uid })), 'functions/invalid-argument');
});

await step('PE3. Martín no puede aceptar su propia invitación', async () => {
  assert.equal(await code(martin.call('parejaResponder', { clubId: CLUB, pairId, accept: true })), 'functions/permission-denied');
});

await step('PE4. Lucía acepta y marcan martes/jueves de noche: un pedido semanal por horario, con la pareja aceptada', async () => {
  const t0 = Date.now() - 1000;
  const r = await lucia.call('parejaResponder', { clubId: CLUB, pairId, accept: true });
  assert.equal(r.pair.status, 'active');
  assert.equal((await notifsFor(martin.uid, t0)).length, 1, 'aviso a Martín');
  await martin.call('parejaGuardar', { clubId: CLUB, pairId, cells: ['2-3', '4-3', 'basura'], perWeek: 0, searching: true });
  const p = (await club.collection('fixedPairs').doc(pairId).get()).data();
  assert.deepEqual(p.cells, ['2-3', '4-3']);
  const rs = openOf(await pairReqs(pairId));
  assert.equal(rs.length, 2);
  for (const x of rs) {
    assert.equal(x.requestType, 'weekly');
    assert.equal(x.partnerUid, lucia.uid);
    assert.equal(x.partnerAccepted, true);
    assert.equal(x.startMinute, 19 * 60);
    assert.equal(x.endMinute, 24 * 60);
  }
});

await step('PE5. Guardar de nuevo no duplica pedidos', async () => {
  await lucia.call('parejaGuardar', { clubId: CLUB, pairId, cells: ['2-3', '4-3'] });
  assert.equal(openOf(await pairReqs(pairId)).length, 2);
});

await step('PE6. Sacan el jueves: se cierra ese pedido y queda el del martes', async () => {
  await lucia.call('parejaGuardar', { clubId: CLUB, pairId, cells: ['2-3'] });
  const rs = await pairReqs(pairId);
  assert.equal(openOf(rs).length, 1);
  assert.equal(openOf(rs)[0].dayOfWeek, 2);
  assert.ok(rs.some((r) => r.dayOfWeek === 4 && r.status === 'cancelled' && r.closedReason === 'pareja'));
});

await step('PE7. Otro jugador (el encargado) no puede tocar la pareja', async () => {
  assert.equal(await code(mostrador.call('parejaGuardar', { clubId: CLUB, pairId, cells: [] })), 'functions/permission-denied');
});

await step('PE8. Apagan la búsqueda: no queda ningún pedido en espera', async () => {
  await martin.call('parejaGuardar', { clubId: CLUB, pairId, searching: false });
  assert.equal(openOf(await pairReqs(pairId)).length, 0);
});

await step('PE9. La app arma el partido: Martín y Rodrigo (pareja fija) contra dos sueltos, juntos en el mismo equipo', async () => {
  await clean();
  const { pair } = await martin.call('parejaInvitar', { clubId: CLUB, partnerUid: 'demo-p09' });
  assert.equal(pair.status, 'active', 'con un jugador de la demo queda aceptada sola');
  for (const [u, n, c] of [['demo-p10', 'Mateo Cabrera', 5], ['demo-p12', 'Gonzalo Viera', 6]]) {
    const id = `mreq_test_${u}`;
    await club.collection('matchRequests').doc(id).set({
      id, clubId: CLUB, clubIds: [CLUB], creatorUid: u, creatorName: n, partnerUid: '', partnerName: '', partnerAccepted: true,
      category: c, modality: 'masculino', requestType: 'priority', date: D, dayOfWeek: dow(D), startMinute: 20 * 60, endMinute: 23 * 60,
      isSameDay: false, status: 'waiting', unfilledAlertSent: false,
    });
  }
  await martin.call('parejaGuardar', { clubId: CLUB, pairId: pair.id, cells: [NOCHE], perWeek: 1, modality: 'masculino' });
  const pend = (await club.collection('proposedMatches').where('status', '==', 'pending').get()).docs.map((d) => d.data());
  assert.equal(pend.length, 1, `partidos armados: ${pend.length}`);
  const m = pend[0];
  assert.equal(m.date, D);
  const uids = m.slots.map((s) => s.uid).sort();
  assert.deepEqual(uids, [martin.uid, 'demo-p09', 'demo-p10', 'demo-p12'].sort());
  const team = [m.teamA, m.teamB].find((t) => t?.includes(martin.uid));
  assert.ok(team?.includes('demo-p09'), `equipos: ${JSON.stringify([m.teamA, m.teamB])}`);
  pairId = pair.id;
});

await step('PE10. El reloj no crea otro pedido para ese horario mientras está propuesto', async () => {
  const n = await harness.syncClubPairs(CLUB);
  assert.equal(n, 0);
  assert.equal(openOf(await pairReqs(pairId)).length, 1);
});

await step('PE11. Semana nueva: si el pedido se cerró hace una semana, el reloj vuelve a buscar solo', async () => {
  await club.collection('proposedMatches').get().then((s) => Promise.all(s.docs.map((d) => d.ref.delete())));
  const rs = await pairReqs(pairId);
  const lastWeek = new Date(); lastWeek.setDate(lastWeek.getDate() - 8);
  for (const r of rs) await club.collection('matchRequests').doc(r.id).update({ status: 'confirmed', updatedAt: lastWeek });
  const n = await harness.syncClubPairs(CLUB);
  assert.equal(n, 1);
  assert.equal(openOf(await pairReqs(pairId)).length, 1);
});

await step('PE12. Un horario que se pisa con otro pedido de Martín no se busca y queda avisado en la pareja', async () => {
  const t = await martin.call('armadoCrearPedido', { clubId: CLUB, modality: 'masculino', requestType: 'weekly', date: '', dayOfWeek: dow(D), startMinute: 15 * 60, endMinute: 18 * 60, partnerUid: '', partnerName: '' });
  assert.ok(t.request);
  await martin.call('parejaGuardar', { clubId: CLUB, pairId, cells: [NOCHE, TARDE] });
  const p = (await club.collection('fixedPairs').doc(pairId).get()).data();
  assert.equal(p.clashes?.length, 1, JSON.stringify(p.clashes));
});

await step('PE13. Terminan la pareja: se cierran los pedidos en espera', async () => {
  await martin.call('parejaTerminar', { clubId: CLUB, pairId });
  const p = (await club.collection('fixedPairs').doc(pairId).get()).data();
  assert.equal(p.status, 'ended');
  assert.equal(openOf(await pairReqs(pairId)).filter((r) => r.status === 'waiting').length, 0);
});

await step('PE14. "Prefiero no" es privado: si Lucía no quiere jugar con Martín, la invitación se crea pero no le llega', async () => {
  await clean();
  const userRef = db.doc(`users/${lucia.uid}`);
  const before = (await userRef.get()).get('avoidUids') ?? [];
  await userRef.update({ avoidUids: [martin.uid] });
  try {
    const t0 = Date.now() - 1000;
    const { pair } = await martin.call('parejaInvitar', { clubId: CLUB, partnerUid: lucia.uid });
    assert.equal(pair.status, 'pending');
    assert.equal((await notifsFor(lucia.uid, t0)).length, 0);
  } finally {
    await userRef.update({ avoidUids: before });
  }
});

await step('PE15. Tope de parejas: hasta 4 por jugador', async () => {
  await clean();
  for (const u of ['demo-p09', 'demo-p10', 'demo-p12', 'demo-p11']) await martin.call('parejaInvitar', { clubId: CLUB, partnerUid: u });
  assert.equal(await code(martin.call('parejaInvitar', { clubId: CLUB, partnerUid: 'demo-p13' })), 'functions/failed-precondition');
  await clean();
});

await step('PE16. Con más de una categoría de diferencia no se puede (la app nunca les armaría partido)', async () => {
  await clean();
  assert.equal(await code(martin.call('parejaInvitar', { clubId: CLUB, partnerUid: 'demo-p01' })), 'functions/failed-precondition');
  assert.equal(await code(martin.call('parejaInvitar', { clubId: CLUB, partnerUid: 'demo-p14' })), 'functions/failed-precondition');
  assert.equal((await club.collection('fixedPairs').get()).size, 0);
});

console.log('\n' + results.join('\n'));
process.exit(results.some((r) => r.startsWith('FALLA')) ? 1 : 0);
