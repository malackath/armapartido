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

// ---------- Etapa 1 del algoritmo (17/11): nadie en dos partidos a la misma hora ----------
async function req2(uid, name, category, date, startMinute, endMinute, tag) {
  const id = await fakeRequest(uid, name, category, date, startMinute, endMinute);
  if (!tag) return id;
  const snap = await club.collection('matchRequests').doc(id).get();
  const nid = `${id}_${tag}`;
  await club.collection('matchRequests').doc(nid).set({ ...snap.data(), id: nid });
  await snap.ref.delete();
  return nid;
}
// Además de clean(): las canchas retenidas por partidos de pruebas anteriores también se liberan.
async function cleanAll() {
  await clean();
  const held = await club.collection('bookings').where('status', '==', 'held').get();
  await Promise.all(held.docs.map((d) => d.ref.update({ status: 'cancelled' })));
}
const overlaps = (a, b) => a.date === b.date && a.startMinute < b.endMinute && a.endMinute > b.startMinute;
/**
 * La demo se arma alrededor de la hora en que se cargan los datos, así que sus reservas cambian según la hora.
 * Para que 10 y 14 no dependan de eso, se apartan (cancelan) las reservas de la demo que las tocan y después se restauran.
 */
async function setAside(filter) {
  const docs = (await club.collection('bookings').where('status', '==', 'confirmed').get()).docs.filter((d) => filter(d.data()));
  await Promise.all(docs.map((d) => d.ref.update({ status: 'cancelled' })));
  return () => Promise.all(docs.map((d) => d.ref.update({ status: 'confirmed' })));
}

await step('10. Jugador con dos pedidos que se pisan: no lo ponen en un segundo partido a la misma hora', async () => {
  await cleanAll();
  const D4 = inDays(3); const T = 9 * 60 + 30;
  const restore = await setAside((b) => overlaps(b, { date: D4, startMinute: T, endMinute: T + 90 }));
  try {
  for (const [u, n, c] of [['demo-p08', 'Florencia', 5], ['demo-p09', 'Rodrigo', 5], ['demo-p10', 'Mateo', 5], ['demo-p07', 'Santiago', 4]]) await req2(u, n, c, D4, T, T + 90);
  await jugador.call('armadoBuscar', { clubId: CLUB });
  const [first] = await pendingMatches();
  assert.ok(first && first.playerUids.includes('demo-p08'), 'no armó el primer partido');
  // Florencia tiene un segundo pedido a la misma hora; hay 3 compatibles más (otra cancha libre).
  await req2('demo-p08', 'Florencia', 5, D4, T, T + 90, 'b');
  for (const [u, n, c] of [['demo-p11', 'Carolina', 6], ['demo-p12', 'Gonzalo', 6], ['demo-p13', 'Paula', 6]]) await req2(u, n, c, D4, T, T + 90);
  await jugador.call('armadoBuscar', { clubId: CLUB });
  const pend = await pendingMatches();
  const twice = pend.filter((m) => m.playerUids.includes('demo-p08') && overlaps(m, first));
  assert.equal(twice.length, 1, `Florencia quedó en ${twice.length} partidos a la misma hora`);
  // Con un cuarto jugador libre, el segundo partido se arma sin ella.
  await req2('demo-p05', 'Nicolás', 5, D4, T, T + 90);
  await jugador.call('armadoBuscar', { clubId: CLUB });
  const second = (await pendingMatches()).find((m) => m.id !== first.id);
  assert.ok(second, 'no armó el segundo partido');
  assert.ok(!second.playerUids.includes('demo-p08'), 'metió a Florencia de nuevo');
  assert.notEqual(second.courtId, first.courtId);
  } finally { await restore(); }
});

await step('11. Jugador que ya reservó cancha a esa hora: el armado no le propone otro partido encima', async () => {
  await cleanAll();
  const D5 = inDays(4); const T = 11 * 60;
  const id = 'bk_test_reserva_propia';
  await club.collection('bookings').doc(id).set({ id, clubId: CLUB, courtId: 'cancha_1', courtName: 'Cancha 1', date: D5, startMinute: T, endMinute: T + 90, type: 'direct', status: 'confirmed', createdByUid: 'demo-p09', playerUids: ['demo-p09'], guestName: '', totalPrice: 2400, paidAmount: 0, paymentMethod: 'club', paymentStatus: 'pending', holdExpiresAt: '' });
  for (const [u, n, c] of [['demo-p08', 'Florencia', 5], ['demo-p09', 'Rodrigo', 5], ['demo-p10', 'Mateo', 5], ['demo-p07', 'Santiago', 4]]) await req2(u, n, c, D5, T, T + 90);
  await jugador.call('armadoBuscar', { clubId: CLUB });
  const pend = await pendingMatches();
  assert.equal(pend.filter((m) => m.playerUids.includes('demo-p09')).length, 0, 'le armó un partido encima de su reserva');
  // Si cancela su reserva, ahí sí entra.
  await club.collection('bookings').doc(id).update({ status: 'cancelled' });
  await jugador.call('armadoBuscar', { clubId: CLUB });
  assert.equal((await pendingMatches()).filter((m) => m.playerUids.includes('demo-p09')).length, 1);
  await club.collection('bookings').doc(id).delete();
});

await step('12. Una reserva del mostrador NO ocupa al encargado que la cargó (solo a los jugadores)', async () => {
  await cleanAll();
  const D6 = inDays(3); const T = 14 * 60;
  const id = 'bk_test_mostrador_carga';
  await club.collection('bookings').doc(id).set({ id, clubId: CLUB, courtId: 'cancha_1', courtName: 'Cancha 1', date: D6, startMinute: T, endMinute: T + 90, type: 'counter', status: 'confirmed', createdByUid: 'demo-p09', playerUids: [], guestName: 'Cliente', totalPrice: 2400, paidAmount: 0, paymentMethod: 'club', paymentStatus: 'pending', holdExpiresAt: '' });
  for (const [u, n, c] of [['demo-p08', 'Florencia', 5], ['demo-p09', 'Rodrigo', 5], ['demo-p10', 'Mateo', 5], ['demo-p07', 'Santiago', 4]]) await req2(u, n, c, D6, T, T + 90);
  await jugador.call('armadoBuscar', { clubId: CLUB });
  assert.equal((await pendingMatches()).filter((m) => m.playerUids.includes('demo-p09')).length, 1);
  await club.collection('bookings').doc(id).delete();
});

await step('13. No se puede cargar un pedido que se pisa con otro propio (puntual o semanal); uno que no se pisa, sí', async () => {
  await cleanAll();
  const D7 = inDays(9);
  const base = { clubId: CLUB, modality: 'masculino', partnerUid: '', partnerName: '' };
  await jugador.call('armadoCrearPedido', { ...base, requestType: 'priority', date: D7, dayOfWeek: dow(D7), startMinute: T, endMinute: T + 180 });
  await assert.rejects(
    jugador.call('armadoCrearPedido', { ...base, requestType: 'priority', date: D7, dayOfWeek: dow(D7), startMinute: T + 60, endMinute: T + 150 }),
    (e) => e.code === 'functions/already-exists' && /se pisa/.test(e.message)
  );
  // Semanal el mismo día de la semana y horario: también se pisa.
  await assert.rejects(
    jugador.call('armadoCrearPedido', { ...base, requestType: 'weekly', date: '', dayOfWeek: dow(D7), startMinute: T, endMinute: T + 90 }),
    (e) => e.code === 'functions/already-exists'
  );
  // Mismo día, más temprano y sin pisarse: se carga.
  const ok = await jugador.call('armadoCrearPedido', { ...base, requestType: 'priority', date: D7, dayOfWeek: dow(D7), startMinute: T - 180, endMinute: T });
  assert.equal(ok.request.status, 'waiting');
  const mine = (await club.collection('matchRequests').where('creatorUid', '==', jugador.uid).get()).docs.filter((d) => d.get('status') === 'waiting');
  assert.equal(mine.length, 2);
  const msg = await jugador.call('armadoCrearPedido', { ...base, requestType: 'priority', date: D7, dayOfWeek: dow(D7), startMinute: T + 30, endMinute: T + 120 }).catch((e) => e.message);
  results.push(`     (13: mensaje que ve el jugador: "${msg}")`);
});

// ---------- Etapa 3 (17/11): planificador ----------
await step('14. Cinco para cuatro lugares: el servidor deja afuera al que jugó más recién y guarda los dos equipos', async () => {
  await cleanAll();
  const D8 = inDays(2); const T = 8 * 60;
  const five = [['demo-p26', 'Leandro'], ['demo-p27', 'Victoria'], ['demo-p28', 'Franco'], ['demo-p29', 'Natalia'], ['demo-p08', 'Florencia']];
  const restore = await setAside((b) => b.date < iso(new Date()) && five.some(([u]) => (b.playerUids ?? []).includes(u)));
  try {
  const yid = 'bk_test_jugo_ayer';
  await club.collection('bookings').doc(yid).set({ id: yid, clubId: CLUB, courtId: 'cancha_4', courtName: 'Cancha 4', date: inDays(-1), startMinute: 600, endMinute: 690, type: 'matched', status: 'confirmed', createdByUid: 'x', playerUids: ['demo-p26', 'demo-p01', 'demo-p02', 'demo-p03'], guestName: '', totalPrice: 0, paidAmount: 0, paymentMethod: 'split', paymentStatus: 'pending', holdExpiresAt: '' });
  for (const [u, n] of five) await req2(u, n, 5, D8, T, T + 90);
  // Último partido de cada uno según las reservas (las de la demo más la de ayer).
  const today = iso(new Date());
  const past = (await club.collection('bookings').where('date', '>=', inDays(-28)).get()).docs.map((d) => d.data())
    .filter((b) => b.status === 'confirmed' && b.date < today && (b.playerUids ?? []).filter(Boolean).length >= 2);
  const last = Object.fromEntries(five.map(([u]) => [u, past.filter((b) => b.playerUids.includes(u)).map((b) => b.date).sort().pop() ?? '']));
  const week = Object.fromEntries(five.map(([u]) => [u, past.filter((b) => b.playerUids.includes(u) && b.date >= inDays(-7)).length]));
  await jugador.call('armadoBuscar', { clubId: CLUB });
  const [m] = (await pendingMatches()).filter((x) => x.date === D8);
  assert.ok(m, 'no armó');
  const out = five.map(([u]) => u).find((u) => !m.playerUids.includes(u));
  results.push(`     (14: último partido ${JSON.stringify(last)}; partidos en 7 días ${JSON.stringify(week)}; quedó afuera ${out}; equipos ${m.teamA?.join('+')} contra ${m.teamB?.join('+')})`);
  // El que queda afuera es el que jugó más recién; si empatan, el que más jugó en la semana.
  for (const u of m.playerUids) assert.ok(last[out] > last[u] || (last[out] === last[u] && week[out] >= week[u]), `quedó afuera ${out} y entró ${u}`);
  assert.equal(out, 'demo-p26', 'tenía que quedar afuera Leandro (jugó ayer un partido de más)');
  assert.equal(m.teamA?.length, 2); assert.equal(m.teamB?.length, 2);
  assert.deepEqual([...m.teamA, ...m.teamB].sort(), [...m.playerUids].sort());
  const bk = (await club.collection('bookings').doc(m.bookingId).get()).data();
  assert.deepEqual(bk.teamA, m.teamA);
  await club.collection('bookings').doc(yid).delete();
  } finally { await restore(); }
});

await step('15. Si uno rechaza, los equipos sugeridos se borran (ya no valen); vuelven cuando entra el reemplazo', async () => {
  const D8 = inDays(2);
  const [m] = (await pendingMatches()).filter((x) => x.date === D8);
  await jugador.call('armadoResponder', { clubId: CLUB, matchId: m.id, slotUid: m.slots[0].uid, decision: 'declined' });
  const after = (await club.collection('proposedMatches').doc(m.id).get()).data();
  assert.equal(after.slots.length, 3);
  assert.equal(after.teamA, undefined);
  const fs = (await club.collection('fillSearches').where('matchId', '==', m.id).get()).docs[0];
  assert.ok(fs, 'no abrió la búsqueda de reemplazo');
  const r = await mostrador.call('huecoSimular', { clubId: CLUB, searchId: fs.id, n: 1 }).catch((e) => ({ err: e.message }));
  const again = (await club.collection('proposedMatches').doc(m.id).get()).data();
  if (again.slots.length === 4) {
    assert.equal(again.teamA?.length, 2, 'no volvió a armar los equipos');
  } else {
    results.push(`     (15: no había reemplazo simulable: ${JSON.stringify(r)})`);
  }
});

// ---------- Etapa 5 (17/11): preferencias ----------
await step('16. "Prefiero no jugar con" (privado): el armado no los junta; con un quinto, arma sin juntarlos', async () => {
  await cleanAll();
  const D9 = inDays(4); const T = 9 * 60 + 30;
  await db.doc('users/demo-p26').set({ avoidUids: ['demo-p27'] }, { merge: true });
  for (const [u, n] of [['demo-p26', 'Leandro'], ['demo-p27', 'Victoria'], ['demo-p28', 'Franco'], ['demo-p29', 'Natalia']]) await req2(u, n, 5, D9, T, T + 90);
  await jugador.call('armadoBuscar', { clubId: CLUB });
  assert.equal((await pendingMatches()).filter((m) => m.date === D9).length, 0, 'armó con los que no quieren jugar juntos');
  await req2('demo-p08', 'Florencia', 5, D9, T, T + 90);
  await jugador.call('armadoBuscar', { clubId: CLUB });
  const [m] = (await pendingMatches()).filter((x) => x.date === D9);
  assert.ok(m, 'no armó con el quinto');
  assert.ok(!(m.playerUids.includes('demo-p26') && m.playerUids.includes('demo-p27')));
  await db.doc('users/demo-p26').update({ avoidUids: [] });
});

await step('17. Aprende: al rechazar una propuesta queda anotada la hora (baja su prioridad a esa hora)', async () => {
  const [m] = (await pendingMatches()).filter((x) => x.date === inDays(4));
  const before = (await db.doc(`users/${jugador.uid}`).get()).get('declineHours') ?? {};
  // El jugador real rechaza una propuesta donde está él.
  await cleanAll();
  const D10 = inDays(3); const T = 12 * 60 + 30;
  for (const [u, n] of [['demo-p08', 'F'], ['demo-p09', 'R'], ['demo-p10', 'M']]) await req2(u, n, 5, D10, T, T + 90);
  const res = await jugador.call('armadoCrearPedido', { clubId: CLUB, modality: 'masculino', requestType: 'priority', date: D10, dayOfWeek: dow(D10), startMinute: T, endMinute: T + 90, partnerUid: '', partnerName: '' });
  assert.ok(res.proposedMatch, 'no armó');
  await jugador.call('armadoResponder', { clubId: CLUB, matchId: res.proposedMatch.id, slotUid: jugador.uid, decision: 'declined' });
  const after = (await db.doc(`users/${jugador.uid}`).get()).get('declineHours') ?? {};
  assert.equal((after['12'] ?? 0) - (before['12'] ?? 0), 1, JSON.stringify(after));
  void m;
});

console.log('\n' + results.join('\n'));
process.exit(results.some((r) => r.startsWith('FALLA')) ? 1 : 0);
