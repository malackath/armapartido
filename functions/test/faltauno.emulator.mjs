// "Falta uno" de punta a punta contra los emuladores. Se corre después de armado.emulator.mjs (ver package.json).
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
if (!admin.getApps().length) admin.initializeApp({ projectId: 'demo-armapartido' });
const db = getFirestore();
const H = require('../lib-test/harness.js');

const CLUB = 'los_jacarandas';
const club = db.doc(`clubs/${CLUB}`);
const pw = process.env.DEMO_PASSWORD || 'prueba-local-123';
async function login(name, email) {
  const app = initializeApp({ apiKey: 'demo', projectId: 'demo-armapartido' }, 'fu-' + name);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const fns = getFunctions(app, 'southamerica-east1');
  connectFunctionsEmulator(fns, '127.0.0.1', 5001);
  const cred = await signInWithEmailAndPassword(auth, email, pw);
  return { uid: cred.user.uid, call: (fn, data) => httpsCallable(fns, fn)(data).then((r) => r.data) };
}
const p2 = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
const inDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };
const dow = (s) => new Date(`${s}T12:00:00`).getDay();
const results = [];
async function step(name, fn) {
  try { await fn(); results.push(`OK   ${name}`); } catch (e) { results.push(`FALLA ${name}: ${e.message}`); }
}

// ---------- reglas puras ----------
await step('R1. Categoría: club 1, partido de 5ta: entra 4ta y 6ta, no 7ma', async () => {
  const cur = [{ uid: 'a', category: 5, gap: 1 }, { uid: 'b', category: 5, gap: 1 }, { uid: 'c', category: 5, gap: 1 }];
  assert.equal(H.categoryFits(4, 1, 1, cur), true);
  assert.equal(H.categoryFits(6, 1, 1, cur), true);
  assert.equal(H.categoryFits(7, 2, 1, cur), false);
});
await step('R2. Categoría: club 2, pero un jugador pidió "solo mi categoría" → manda lo más estricto', async () => {
  const cur = [{ uid: 'a', category: 5, gap: 0 }, { uid: 'b', category: 5, gap: 2 }, { uid: 'c', category: 6, gap: 2 }];
  assert.equal(H.categoryFits(6, 2, 2, cur), false); // el de 5ta con gap 0 no acepta 6ta
  const cur2 = [{ uid: 'a', category: 5, gap: 2 }, { uid: 'b', category: 5, gap: 2 }, { uid: 'c', category: 6, gap: 2 }];
  assert.equal(H.categoryFits(7, 2, 2, cur2), true);
  assert.equal(H.categoryFits(7, 1, 2, cur2), false); // el candidato acepta 1 y hay de 5ta
});
await step('R3. Tope: No=0, 3 por semana con 1 por día, 6 con 2, Todas sin tope', async () => {
  assert.deepEqual(H.weeklyLimit({ weeklyInvites: 0, maxCategoryGap: 1 }), { week: 0, day: 0 });
  assert.deepEqual(H.weeklyLimit({ weeklyInvites: 3, maxCategoryGap: 1 }), { week: 3, day: 1 });
  assert.deepEqual(H.weeklyLimit({ weeklyInvites: 6, maxCategoryGap: 1 }), { week: 6, day: 2 });
  assert.equal(H.weeklyLimit({ weeklyInvites: -1, maxCategoryGap: 1 }).week, Infinity);
});
await step('R4. Silencio nocturno 23:00 a 08:00', async () => {
  assert.equal(H.isQuietHour(new Date(2026, 10, 15, 23, 5)), true);
  assert.equal(H.isQuietHour(new Date(2026, 10, 16, 7, 59)), true);
  assert.equal(H.isQuietHour(new Date(2026, 10, 16, 8, 0)), false);
});
await step('R5. Tiempos: >24 h tandas de 60 min y cierra 3 h antes; <3 h tandas de 10 y cierra 45 min antes', async () => {
  const now = new Date(2026, 10, 16, 10, 0);
  const a = H.searchTiming('2026-11-18', 20 * 60, now);
  assert.equal(a.waveGapMin, 60); assert.equal(a.closesAt.getHours(), 17);
  const b = H.searchTiming('2026-11-16', 12 * 60, now);
  assert.equal(b.waveGapMin, 10); assert.equal(b.closesAt.getHours() * 60 + b.closesAt.getMinutes(), 11 * 60 + 15);
});
await step('R6. Orden: pedido puntual primero, después categoría exacta, después menos avisos', async () => {
  const search = { date: '2026-11-18', startMinute: 1200, endMinute: 1290, modality: 'masculino', genderNeeded: '', excludedUids: [], invitedUids: [], filledUids: [] };
  const av = [{ dayOfWeek: 3, startMinute: 1080, endMinute: 1380 }];
  const mk = (uid, category) => ({ uid, displayName: uid, category, gender: 'masculino', role: 'player', blocked: false, noShowCount: 0, weeklyAvailability: av });
  const members = [mk('x6', 6), mk('x5', 5), mk('y5', 5), mk('req4', 4), mk('cap', 5), { ...mk('off', 5), weeklyAvailability: [] }];
  const now = new Date(2026, 10, 16, 10, 0);
  const prefsByUid = new Map([['cap', { weeklyInvites: 3, maxCategoryGap: 1 }]]);
  const counters = new Map([['y5', { week: H.weekKey(now), weekCount: 1, day: 'x', dayCount: 0 }], ['cap', { week: H.weekKey(now), weekCount: 3, day: 'x', dayCount: 0 }]]);
  const requests = [{ status: 'waiting', requestType: 'priority', date: '2026-11-18', startMinute: 1140, endMinute: 1320, creatorUid: 'req4', partnerUid: '' }];
  const r = H.rankCandidates({ search, clubGap: 1, current: [{ uid: 'a', category: 5, gap: 1 }, { uid: 'b', category: 5, gap: 1 }, { uid: 'c', category: 5, gap: 1 }], targetCategory: 5, members, prefsByUid, counters, bookings: [], requests, now, random: () => 0.5 });
  assert.deepEqual(r.map((c) => c.uid), ['req4', 'x5', 'y5', 'x6']);
});

// ---------- de punta a punta ----------
const jugador = await login('j', 'jugador@demo.armapartido.com');
const mostrador = await login('m', 'mostrador@demo.armapartido.com');
const plataforma = await login('p', 'plataforma@demo.armapartido.com');
const D = inDays(3);
const T = 20 * 60;
const av = [{ dayOfWeek: dow(D), startMinute: 18 * 60, endMinute: 23 * 60 }];

async function reset() {
  for (const sub of ['matchRequests', 'proposedMatches', 'fillSearches', 'fillInvites', 'recoveries']) {
    const s = await club.collection(sub).get();
    await Promise.all(s.docs.map((d) => d.ref.delete()));
  }
  const bk = await club.collection('bookings').where('date', '==', D).get();
  await Promise.all(bk.docs.map((d) => d.ref.delete()));
  // Solo plataforma (4ta) y mostrador (6ta) pueden ese día; los demás no.
  const mem = await club.collection('memberships').get();
  for (const d of mem.docs) {
    const can = [plataforma.uid, mostrador.uid].includes(d.id);
    await d.ref.update({ weeklyAvailability: can ? av : [], blocked: false, noShowCount: 0 });
    await db.doc(`users/${d.id}`).set({ alertPrefs: { weeklyInvites: -1, maxCategoryGap: 1 }, fillCounter: null }, { merge: true });
  }
  await club.update({ fillEnabled: true, fillMaxGap: 1, cancellationHours: 6 });
}

async function confirmedMatch(players) {
  const id = 'pm_test_' + Math.random().toString(36).slice(2, 7);
  const bookingId = 'bk_' + id;
  const slots = players.map(([uid, name, category]) => ({ uid, displayName: name, category, gender: 'masculino', status: 'accepted', paid: false, requestId: '' }));
  await club.collection('bookings').doc(bookingId).set({ id: bookingId, clubId: CLUB, courtId: 'cancha_2', courtName: 'Cancha 2', date: D, startMinute: T, endMinute: T + 90, type: 'matched', status: 'confirmed', createdByUid: players[0][0], playerUids: slots.map((s) => s.uid), guestName: 'Partido armado', totalPrice: 2200, paidAmount: 0, paymentMethod: 'split', paymentStatus: 'pending', holdExpiresAt: '' });
  await club.collection('proposedMatches').doc(id).set({ id, clubId: CLUB, bookingId, courtId: 'cancha_2', courtName: 'Cancha 2', date: D, startMinute: T, endMinute: T + 90, modality: 'masculino', minCategory: 5, maxCategory: 5, pricePerPlayer: 550, playerUids: slots.map((s) => s.uid), slots, expiresAt: '', status: 'confirmed', createdByUid: players[0][0] });
  return { id, bookingId };
}
const searchOf = async (matchId) => (await club.collection('fillSearches').where('matchId', '==', matchId).get()).docs.map((d) => d.data())[0];
const quiet = (() => { const h = new Date().getHours(); return h >= 23 || h < 8; })();

await step('E1. "No puedo ir" con 3 días: sale, se abre la búsqueda y la tanda va solo a los que pueden', async () => {
  if (quiet) { results.push('     (E1-E3 salteados: es horario de silencio)'); return; }
  await reset();
  const { id } = await confirmedMatch([[jugador.uid, 'Martín Silva', 5], ['demo-p08', 'Florencia', 5], ['demo-p09', 'Rodrigo', 5], ['demo-p10', 'Mateo', 5]]);
  const r = await jugador.call('faltaUnoBajarme', { clubId: CLUB, matchId: id });
  assert.equal(r.status, 'searching'); assert.equal(r.late, false);
  const s = await searchOf(id);
  assert.equal(s.status, 'searching'); assert.equal(s.seatsNeeded, 1);
  assert.deepEqual([...s.invitedUids].sort(), [mostrador.uid, plataforma.uid].sort());
  const m = (await club.collection('proposedMatches').doc(id).get()).data();
  assert.equal(m.playerUids.length, 3); assert.ok(!m.playerUids.includes(jugador.uid));
  const inv = await db.collection(`clubs/${CLUB}/notifications`).where('eventType', '==', 'fill_invite').get();
  assert.ok(inv.size >= 2);
});

await step('E2. Carrera: dos tocan "Me sumo" a la vez, entra uno solo y el otro "llegó tarde"', async () => {
  if (quiet) return;
  const [m0] = (await club.collection('proposedMatches').get()).docs.map((d) => d.data());
  const s = await searchOf(m0.id);
  const [a, b] = await Promise.all([
    mostrador.call('faltaUnoMeSumo', { clubId: CLUB, searchId: s.id }),
    plataforma.call('faltaUnoMeSumo', { clubId: CLUB, searchId: s.id }),
  ]);
  const res = [a.result, b.result].sort();
  assert.deepEqual(res, ['late', 'won'], JSON.stringify(res));
  const m = (await club.collection('proposedMatches').doc(m0.id).get()).data();
  assert.equal(m.playerUids.length, 4);
  const bk = (await club.collection('bookings').doc(m0.bookingId).get()).data();
  assert.equal(bk.playerUids.length, 4);
  const s2 = await searchOf(m0.id);
  assert.equal(s2.status, 'filled');
  const rec = await club.collection('recoveries').get();
  assert.equal(rec.size, 1); assert.equal(rec.docs[0].get('kind'), 'player_replaced'); assert.equal(rec.docs[0].get('amountRecovered'), 550);
});

await step('E3. Rechazo en propuesta: no se cae el partido, se busca solo el que falta', async () => {
  if (quiet) return;
  await reset();
  for (const [u, n] of [['demo-p08', 'F'], ['demo-p09', 'R'], ['demo-p10', 'M']]) {
    const rid = `mreq_t_${u}`;
    await club.collection('matchRequests').doc(rid).set({ id: rid, clubId: CLUB, clubIds: [CLUB], creatorUid: u, creatorName: n, partnerUid: '', partnerName: '', partnerAccepted: true, category: 5, modality: 'masculino', requestType: 'priority', date: D, dayOfWeek: dow(D), startMinute: T, endMinute: T + 180, isSameDay: false, status: 'waiting', unfilledAlertSent: false });
  }
  const res = await jugador.call('armadoCrearPedido', { clubId: CLUB, modality: 'masculino', requestType: 'priority', date: D, dayOfWeek: dow(D), startMinute: T, endMinute: T + 180, partnerUid: '', partnerName: '' });
  const m = res.proposedMatch; assert.ok(m);
  await jugador.call('armadoResponder', { clubId: CLUB, matchId: m.id, slotUid: 'demo-p08', decision: 'accepted' });
  await jugador.call('armadoResponder', { clubId: CLUB, matchId: m.id, slotUid: jugador.uid, decision: 'accepted' });
  const r = await jugador.call('armadoResponder', { clubId: CLUB, matchId: m.id, slotUid: 'demo-p09', decision: 'declined' });
  assert.equal(r.result, 'replaced_or_cancelled');
  const after = (await club.collection('proposedMatches').doc(m.id).get()).data();
  assert.equal(after.status, 'pending'); assert.equal(after.slots.length, 3);
  const bk = (await club.collection('bookings').doc(m.bookingId).get()).data();
  assert.equal(bk.status, 'held');
  const s = await searchOf(m.id);
  assert.equal(s.kind, 'declined'); assert.equal(s.status, 'searching');
});

await step('E4. Sin cuarto: al cerrar sale el que no contestó y los que quedan eligen; "cancelar" libera sin falta', async () => {
  if (quiet) return; // necesita el partido de E3, que de noche no corre
  const [m0] = (await club.collection('proposedMatches').where('status', '==', 'pending').get()).docs.map((d) => d.data());
  assert.ok(m0, 'no hay partido pendiente (E3 no corrió)');
  const s = await searchOf(m0.id);
  await club.collection('fillSearches').doc(s.id).update({ closesAt: new Date(Date.now() - 1000).toISOString() });
  await H.runClock();
  const s2 = await searchOf(m0.id);
  assert.equal(s2.status, 'unfilled');
  const m1 = (await club.collection('proposedMatches').doc(m0.id).get()).data();
  assert.ok(m1.slots.every((x) => x.status === 'accepted'), 'quedó alguien sin aceptar');
  assert.ok(m1.playerUids.includes('demo-p08') && m1.playerUids.includes(jugador.uid) && !m1.playerUids.includes('demo-p10'));
  const r = await jugador.call('faltaUnoElegir', { clubId: CLUB, searchId: s.id, choice: 'cancel' });
  assert.equal(r.choice, 'cancel');
  const bk = (await club.collection('bookings').doc(m0.bookingId).get()).data();
  assert.equal(bk.status, 'cancelled');
  const again = await jugador.call('faltaUnoElegir', { clubId: CLUB, searchId: s.id, choice: 'play_as_three' });
  assert.equal(again.result, 'already_decided');
  assert.equal((await club.collection('memberships').doc(jugador.uid).get()).get('noShowCount'), 0);
  const notif = await db.collection(`clubs/${CLUB}/notifications`).where('eventType', '==', 'fill_update').get();
  assert.ok(notif.docs.some((d) => /Seguimos siendo/.test(d.get('title'))));
});

await step('E5. Baja tardía sin reemplazo: al jugar igual, al que se bajó le cuenta una falta', async () => {
  await reset();
  await club.update({ cancellationHours: 200 }); // así, a 3 días, ya es "tarde"
  const { id } = await confirmedMatch([[jugador.uid, 'Martín Silva', 5], [mostrador.uid, 'Diego', 5], ['demo-p09', 'Rodrigo', 5], ['demo-p10', 'Mateo', 5]]);
  const r = await jugador.call('faltaUnoBajarme', { clubId: CLUB, matchId: id });
  assert.equal(r.late, true);
  const s = await searchOf(id);
  await club.collection('fillSearches').doc(s.id).update({ closesAt: new Date(Date.now() - 1000).toISOString(), status: 'searching' });
  await H.runClock();
  const c = await mostrador.call('faltaUnoElegir', { clubId: CLUB, searchId: s.id, choice: 'play_as_three' });
  assert.equal(c.choice, 'play_as_three');
  const mem = (await club.collection('memberships').doc(jugador.uid).get()).data();
  assert.equal(mem.noShowCount, 1);
  const bk = (await club.collection('bookings').where('date', '==', D).get()).docs[0].data();
  assert.equal(bk.status, 'confirmed');
  await club.update({ cancellationHours: 6 });
});

await step('E6. Al terminar el turno, el recuperado cuenta (y se anula si se canceló)', async () => {
  const ok = 'rec_t_ok', bad = 'rec_t_bad';
  const y = inDays(-1);
  await club.collection('bookings').doc('bk_rec_ok').set({ id: 'bk_rec_ok', date: y, startMinute: 600, endMinute: 690, status: 'confirmed', playerUids: ['demo-p07'], courtId: 'cancha_1' });
  await club.collection('bookings').doc('bk_rec_bad').set({ id: 'bk_rec_bad', date: y, startMinute: 700, endMinute: 790, status: 'cancelled', playerUids: ['demo-p07'], courtId: 'cancha_1' });
  const base = { clubId: CLUB, courtId: 'cancha_1', date: y, sport: 'padel', kind: 'player_replaced', freeSince: '', searchId: 'x', alertSentAt: '', filledByUid: 'demo-p07', filledAt: '', seatsFilled: 1, amountRecovered: 550, status: 'pending', voidReason: '' };
  await club.collection('recoveries').doc(ok).set({ ...base, id: ok, bookingId: 'bk_rec_ok', startMinute: 600, endMinute: 690 });
  await club.collection('recoveries').doc(bad).set({ ...base, id: bad, bookingId: 'bk_rec_bad', startMinute: 700, endMinute: 790 });
  await H.runClock();
  assert.equal((await club.collection('recoveries').doc(ok).get()).get('status'), 'counted');
  assert.equal((await club.collection('recoveries').doc(bad).get()).get('voidReason'), 'cancelado');
});

// ---------- link para compartir (16/11) ----------
const anon = (() => {
  const app = initializeApp({ apiKey: 'demo', projectId: 'demo-armapartido' }, 'fu-anon');
  const fns = getFunctions(app, 'southamerica-east1');
  connectFunctionsEmulator(fns, '127.0.0.1', 5001);
  return (fn, data) => httpsCallable(fns, fn)(data).then((r) => r.data);
})();
let linkSearch = null;
await step('E7. Link público: se abre sin cuenta y no trae nombres de los jugadores', async () => {
  await reset();
  // Plataforma no puede ese día según su disponibilidad: no le llega aviso, entra solo por el link.
  await club.collection('memberships').doc(plataforma.uid).update({ weeklyAvailability: [] });
  const { id } = await confirmedMatch([[jugador.uid, 'Martín Silva', 5], ['demo-p08', 'Florencia', 5], ['demo-p09', 'Rodrigo', 5], ['demo-p10', 'Mateo', 5]]);
  await jugador.call('faltaUnoBajarme', { clubId: CLUB, matchId: id });
  linkSearch = await searchOf(id);
  const info = await anon('faltaUnoLink', { clubId: CLUB, searchId: linkSearch.id });
  assert.equal(info.status, 'open'); assert.equal(info.seatsLeft, 1);
  assert.equal(info.minCategory, 4); assert.equal(info.maxCategory, 6); assert.equal(info.pricePerPlayer, 550);
  const txt = JSON.stringify(info);
  for (const n of ['Florencia', 'Rodrigo', 'Mateo', 'demo-p0', jugador.uid]) assert.ok(!txt.includes(n), `filtra ${n}`);
  await assert.rejects(anon('faltaUnoLink', { clubId: CLUB, searchId: 'no_existe' }));
});
await step('E8. Por el link: categoría que no entra, el que se bajó y sin cuenta no pasan', async () => {
  await club.collection('memberships').doc(mostrador.uid).update({ category: 7 });
  try {
    assert.equal((await mostrador.call('faltaUnoSumarmePorLink', { clubId: CLUB, searchId: linkSearch.id })).result, 'category');
  } finally {
    await club.collection('memberships').doc(mostrador.uid).update({ category: 6 });
  }
  assert.equal((await jugador.call('faltaUnoSumarmePorLink', { clubId: CLUB, searchId: linkSearch.id })).result, 'left');
  await assert.rejects(anon('faltaUnoSumarmePorLink', { clubId: CLUB, searchId: linkSearch.id }));
});
await step('E9. Por el link entra el primero que confirma, sin gastar su tope de avisos, y el recuperado dice "link"', async () => {
  const r = await plataforma.call('faltaUnoSumarmePorLink', { clubId: CLUB, searchId: linkSearch.id });
  assert.equal(r.result, 'won');
  const s = await searchOf(linkSearch.matchId);
  assert.equal(s.status, 'filled');
  const inv = (await club.collection('fillInvites').doc(`${linkSearch.id}_${plataforma.uid}`).get()).data();
  assert.equal(inv.status, 'won'); assert.equal(inv.countsForCap, false);
  const rec = (await club.collection('recoveries').where('searchId', '==', linkSearch.id).get()).docs.map((d) => d.data());
  assert.equal(rec.length, 1); assert.equal(rec[0].via, 'link');
  assert.equal((await anon('faltaUnoLink', { clubId: CLUB, searchId: linkSearch.id })).status, 'filled');
  assert.equal((await mostrador.call('faltaUnoSumarmePorLink', { clubId: CLUB, searchId: linkSearch.id })).result, 'late');
});

// ---------- llenar un turno libre con un toque (16/11) ----------
let hueco = null;
await step('H1. Vista previa del hueco: está libre, cuenta por modalidad y sugiere una', async () => {
  await reset();
  const mem = await club.collection('memberships').get();
  for (const d of mem.docs) await d.ref.update({ weeklyAvailability: av });
  const pv = await mostrador.call('huecoVistaPrevia', { clubId: CLUB, courtId: 'cancha_1', date: D, startMinute: T });
  assert.equal(pv.free, true); assert.equal(pv.options.length, 3);
  assert.ok(pv.options.every((o) => o.maxCategory - o.minCategory <= 1), JSON.stringify(pv.options));
  assert.ok(pv.options.find((o) => o.modality === 'mixto').count >= pv.options.find((o) => o.modality === 'masculino').count);
  await assert.rejects(jugador.call('huecoVistaPrevia', { clubId: CLUB, courtId: 'cancha_1', date: D, startMinute: T }));
});
await step('H2. "Llenar con la app": retiene la cancha, abre el partido vacío y avisa solo a los de la ventana de categorías', async () => {
  hueco = await mostrador.call('huecoLlenar', { clubId: CLUB, courtId: 'cancha_1', date: D, startMinute: T, modality: 'mixto', discountPct: 20 });
  // De noche (23 a 8) la tanda espera a las 8: no sale ningún aviso todavía.
  assert.ok(quiet ? hueco.invited === 0 : hueco.invited > 0, `avisó a ${hueco.invited}`);
  const s = (await club.collection('fillSearches').doc(hueco.searchId).get()).data();
  assert.equal(s.kind, 'free_slot'); assert.equal(s.seatsNeeded, 4); assert.equal(s.discountPct, 20);
  const bk = (await club.collection('bookings').doc(s.bookingId).get()).data();
  assert.equal(bk.status, 'held'); assert.equal(bk.type, 'matched');
  const mem = new Map((await club.collection('memberships').get()).docs.map((d) => [d.id, d.data()]));
  for (const u of s.invitedUids) { const c = mem.get(u).category; assert.ok(c >= s.minCategory && c <= s.maxCategory, `${u} es ${c}`); }
  await assert.rejects(mostrador.call('huecoLlenar', { clubId: CLUB, courtId: 'cancha_1', date: D, startMinute: T, modality: 'mixto', discountPct: 0 }));
});
await step('H3. Contestan 4: el partido y la reserva quedan confirmados y el informe lo cuenta como turno libre que se llenó', async () => {
  const s0 = (await club.collection('fillSearches').doc(hueco.searchId).get()).data();
  const fakes = s0.invitedUids.filter((u) => u.startsWith('demo-'));
  if (fakes.length < 4) { results.push(`     (H3 con ${fakes.length} jugadores de la demo invitados: simulo los que hay)`); }
  const r = await mostrador.call('huecoSimular', { clubId: CLUB, searchId: hueco.searchId, n: 4 });
  assert.equal(r.won, Math.min(4, fakes.length));
  if (fakes.length < 4) return;
  const s = (await club.collection('fillSearches').doc(hueco.searchId).get()).data();
  assert.equal(s.status, 'filled');
  const m = (await club.collection('proposedMatches').doc(hueco.matchId).get()).data();
  assert.equal(m.status, 'confirmed'); assert.equal(m.slots.length, 4);
  const bk = (await club.collection('bookings').doc(s.bookingId).get()).data();
  assert.equal(bk.status, 'confirmed'); assert.equal(bk.playerUids.length, 4);
  const rec = (await club.collection('recoveries').where('searchId', '==', hueco.searchId).get()).docs.map((d) => d.data());
  assert.equal(rec.length, 4); assert.ok(rec.every((x) => x.kind === 'slot_filled'));
  assert.equal(rec.reduce((a, x) => a + x.amountRecovered, 0), s.pricePerPlayer * 4);
});


// ---------- llenar turnos libres automático (17/11, D12) ----------
await step('A1. Reglas: franja por día y hora; la revisión toca a las 9 y a las 14 (con 2 h de margen)', async () => {
  const bands = [{ days: [1, 2, 3, 4], fromMinute: 14 * 60, toMinute: 18 * 60 }];
  assert.equal(H.slotInBands(bands, '2026-11-17', 15 * 60), true); // martes 15:00
  assert.equal(H.slotInBands(bands, '2026-11-17', 18 * 60), false); // 18:00 ya no
  assert.equal(H.slotInBands(bands, '2026-11-21', 15 * 60), false); // sábado
  assert.equal(H.dueRunHour(new Date(2026, 10, 17, 8, 59)), null);
  assert.equal(H.dueRunHour(new Date(2026, 10, 17, 9, 0)), 9);
  assert.equal(H.dueRunHour(new Date(2026, 10, 17, 12, 0)), null);
  assert.equal(H.dueRunHour(new Date(2026, 10, 17, 15, 30)), 14);
});

const sofia = await login('s', 'dueno@demo.armapartido.com');
const DA = D; // turnos de pasado mañana a la noche
const nine = new Date(`${inDays(2)}T09:00:00`); // la revisión corre el día anterior a las 9
const autoSearches = async () => (await club.collection('fillSearches').where('date', '==', DA).get()).docs.map((d) => d.data()).filter((x) => x.auto);
const avNight = [{ dayOfWeek: dow(DA), startMinute: 18 * 60, endMinute: 24 * 60 }];
async function resetAuto() {
  await reset();
  const mem = await club.collection('memberships').get();
  for (const d of mem.docs) await d.ref.update({ weeklyAvailability: avNight });
  const runs = await club.collection('autoFillRuns').get();
  await Promise.all(runs.docs.map((d) => d.ref.delete()));
}
let autoRep = null;
await step('A2. Apagado (como viene de entrada): la revisión no abre nada y solo el administrador puede pedirla', async () => {
  await resetAuto();
  await club.update({ autoFill: { enabled: false, bands: [{ days: [dow(DA)], fromMinute: 18 * 60, toMinute: 23 * 60 }] } });
  const r = await H.runAutoFill(CLUB, nine);
  assert.equal(r.enabled, false); assert.equal(r.opened.length, 0);
  await assert.rejects(jugador.call('turnosLibresRevisar', { clubId: CLUB }));
  await assert.rejects(mostrador.call('turnosLibresRevisar', { clubId: CLUB }));
  const viaAdmin = await sofia.call('turnosLibresRevisar', { clubId: CLUB });
  assert.equal(viaAdmin.opened.length, 0);
});
await step('A3. Encendido para la noche: abre un turno libre por horario, sin reservar la cancha, y avisa a la ventana de categorías', async () => {
  await club.update({ autoFill: { enabled: true, bands: [{ days: [dow(DA)], fromMinute: 18 * 60, toMinute: 23 * 60 }] } });
  autoRep = await H.runAutoFill(CLUB, nine);
  results.push(`     (A3: ${autoRep.checkedSlots} horarios revisados, ${autoRep.opened.length} abiertos: ${autoRep.opened.map((o) => `${o.startMinute / 60}h ${o.courtName} ${o.modality} ${o.minCategory}-${o.maxCategory} (${o.candidates} candidatos, ${o.invited} avisados)`).join('; ')})`);
  assert.ok(autoRep.opened.length >= 3, JSON.stringify(autoRep));
  const ss = await autoSearches();
  assert.equal(ss.length, autoRep.opened.length);
  assert.equal(new Set(ss.map((x) => x.startMinute)).size, ss.length, 'dos búsquedas al mismo horario');
  const mem = new Map((await club.collection('memberships').get()).docs.map((d) => [d.id, d.data()]));
  for (const s of ss) {
    assert.equal(s.kind, 'free_slot'); assert.equal(s.seatsNeeded, 4); assert.equal(s.status, 'searching');
    assert.equal((await club.collection('bookings').doc(s.bookingId).get()).exists, false, 'retuvo la cancha');
    const m = (await club.collection('proposedMatches').doc(s.matchId).get()).data();
    assert.equal(m.status, 'pending'); assert.equal(m.slots.length, 0);
    const start = new Date(`${DA}T${p2(Math.floor(s.startMinute / 60))}:${p2(s.startMinute % 60)}:00`).getTime();
    assert.equal(new Date(s.closesAt).getTime(), start - 120 * 60000, 'cierra 2 h antes');
    assert.ok(s.invitedUids.length > 0 && s.invitedUids.length <= 12);
    for (const u of s.invitedUids) { const c = mem.get(u).category; assert.ok(c >= s.minCategory && c <= s.maxCategory, `${u} es ${c}`); }
  }
});
await step('A4. La revisión siguiente no vuelve a avisar por los mismos horarios', async () => {
  const r = await H.runAutoFill(CLUB, new Date(`${inDays(2)}T14:00:00`));
  assert.equal(r.opened.length, 0);
  assert.ok(r.skipped.every((x) => x.reason === 'already_tried'), JSON.stringify(r.skipped));
});
await step('A5. El mostrador reserva esa cancha: la búsqueda se apaga sola y no queda nada reservado por la app', async () => {
  const s = (await autoSearches()).sort((a, b) => a.startMinute - b.startMinute)[0];
  await mostrador.call('huecoSimular', { clubId: CLUB, searchId: s.id, n: 1 }); // uno ya se sumó
  const id = 'bk_test_mostrador_' + Date.now();
  await club.collection('bookings').doc(id).set({ id, clubId: CLUB, courtId: s.courtId, courtName: s.courtName, date: DA, startMinute: s.startMinute, endMinute: s.endMinute, type: 'counter', status: 'confirmed', createdByUid: mostrador.uid, playerUids: [], guestName: 'Cliente de mostrador', totalPrice: 2200, paidAmount: 0, paymentMethod: 'cash', paymentStatus: 'pending', holdExpiresAt: '' });
  await H.runClock(new Date());
  const after = (await club.collection('fillSearches').doc(s.id).get()).data();
  assert.equal(after.status, 'cancelled'); assert.equal(after.endReason, 'taken');
  assert.equal((await club.collection('proposedMatches').doc(s.matchId).get()).get('status'), 'cancelled');
  assert.equal((await club.collection('bookings').doc(s.bookingId).get()).exists, false);
  const rec = (await club.collection('recoveries').where('searchId', '==', s.id).get()).docs.map((d) => d.data());
  assert.ok(rec.every((x) => x.status === 'voided'), JSON.stringify(rec));
  const inv = (await club.collection('fillInvites').where('searchId', '==', s.id).get()).docs.map((d) => d.get('status'));
  assert.ok(!inv.includes('sent'), 'quedaron invitaciones abiertas');
});
await step('A6. Se suman 4: recién ahí se reserva la cancha, confirmada, y el informe lo cuenta como turno libre lleno', async () => {
  const s = (await autoSearches()).filter((x) => x.status === 'searching').sort((a, b) => a.startMinute - b.startMinute)[0];
  const r = await mostrador.call('huecoSimular', { clubId: CLUB, searchId: s.id, n: 4 });
  assert.equal(r.won, 4, `se sumaron ${r.won}`);
  const after = (await club.collection('fillSearches').doc(s.id).get()).data();
  assert.equal(after.status, 'filled');
  const bk = (await club.collection('bookings').doc(s.bookingId).get()).data();
  assert.equal(bk.status, 'confirmed'); assert.equal(bk.playerUids.length, 4); assert.equal(bk.createdByUid, 'system_autofill'); assert.equal(bk.totalPrice, s.pricePerPlayer * 4);
  assert.equal((await club.collection('proposedMatches').doc(s.matchId).get()).get('status'), 'confirmed');
  const rec = (await club.collection('recoveries').where('searchId', '==', s.id).get()).docs.map((d) => d.data());
  assert.equal(rec.length, 4); assert.ok(rec.every((x) => x.kind === 'slot_filled' && x.status === 'pending'));
});
await step('A7. Uno se sumó y se baja: libera su lugar y la búsqueda sigue (sin falta)', async () => {
  const s = (await autoSearches()).filter((x) => x.status === 'searching').sort((a, b) => a.startMinute - b.startMinute)[0];
  await mostrador.call('huecoSimular', { clubId: CLUB, searchId: s.id, n: 2 });
  const mid = (await club.collection('fillSearches').doc(s.id).get()).data();
  assert.equal(mid.seatsFilled, 2);
  const leaver = mid.filledUids[0];
  await db.doc(`clubs/${CLUB}/memberships/${leaver}`).get();
  // El jugador ficticio "se baja" por el mismo camino que el botón "No puedo ir".
  await H.dropFromMatch({ clubId: CLUB, matchId: s.matchId, uid: leaver });
  const after = (await club.collection('fillSearches').doc(s.id).get()).data();
  assert.equal(after.status, 'searching'); assert.equal(after.seatsFilled, 1); assert.equal(after.seatsNeeded, 4);
  assert.ok(after.excludedUids.includes(leaver)); assert.ok(!after.filledUids.includes(leaver));
  const m = (await club.collection('proposedMatches').doc(s.matchId).get()).data();
  assert.equal(m.status, 'pending'); assert.equal(m.slots.length, 1);
  assert.equal((await db.doc(`clubs/${CLUB}/memberships/${leaver}`).get()).get('noShowCount') ?? 0, 0);
});
await step('A8. A la hora límite (2 h antes) no son 4: se cancela, no queda reserva y no se pregunta "jugamos igual"', async () => {
  const s = (await autoSearches()).filter((x) => x.status === 'searching').sort((a, b) => a.startMinute - b.startMinute)[0];
  await H.runClock(new Date(new Date(s.closesAt).getTime() + 60000));
  const after = (await club.collection('fillSearches').doc(s.id).get()).data();
  assert.equal(after.status, 'unfilled'); assert.equal(after.choice, 'cancel'); assert.equal(after.endReason, 'unfilled');
  assert.equal((await club.collection('proposedMatches').doc(s.matchId).get()).get('status'), 'cancelled');
  const left = await club.collection('bookings').doc(s.bookingId).get();
  assert.ok(!left.exists || left.get('status') === 'cancelled', 'quedó una reserva viva');
});
await step('A9. El reloj corre la revisión de las 9 una sola vez por día', async () => {
  await resetAuto();
  await club.update({ autoFill: { enabled: true, bands: [{ days: [dow(DA)], fromMinute: 18 * 60, toMinute: 23 * 60 }] } });
  const a = await H.runClock(new Date(`${inDays(2)}T09:01:00`));
  const b = await H.runClock(new Date(`${inDays(2)}T09:02:00`));
  assert.ok(a.autoFillOpened >= 3, JSON.stringify(a)); assert.equal(b.autoFillOpened, 0);
  const run = (await club.collection('autoFillRuns').doc(`${inDays(2)}_09`).get()).data();
  assert.equal(run.trigger, 'scheduled'); assert.equal(run.opened.length, a.autoFillOpened);
  await club.update({ autoFill: { enabled: false, bands: [] } });
});
await step('A10. Nadie en dos lugares a la vez: quien ya está en otro partido pendiente a esa hora no puede sumarse a un turno libre automático', async () => {
  const s = (await autoSearches()).filter((x) => x.status === 'searching').sort((a, b) => a.startMinute - b.startMinute)[0];
  const u = s.invitedUids.find((x) => x.startsWith('demo-'));
  assert.ok(u, 'no hay jugador de la demo invitado');
  // Otro partido pendiente (sin reserva todavía, como los turnos libres automáticos) que se pisa 30 minutos.
  const otherId = 'pm_test_ocupado';
  await club.collection('proposedMatches').doc(otherId).set({ id: otherId, clubId: CLUB, bookingId: '', courtId: 'cancha_9', courtName: 'Otra', date: DA, startMinute: s.startMinute + 30, endMinute: s.endMinute + 30, modality: s.modality, minCategory: 1, maxCategory: 7, pricePerPlayer: 0, playerUids: [u], slots: [], expiresAt: s.closesAt, status: 'pending', createdByUid: 'system_autofill' });
  assert.equal(await H.claimSeat({ clubId: CLUB, searchId: s.id, uid: u }), 'busy');
  // Si ese otro partido se cancela, ya puede sumarse.
  await club.collection('proposedMatches').doc(otherId).update({ status: 'cancelled' });
  assert.equal(await H.claimSeat({ clubId: CLUB, searchId: s.id, uid: u }), 'won');
  await club.collection('proposedMatches').doc(otherId).delete();
});

// ---------- Etapa 4 (17/11): retener la cancha con 2 de 4 y avisar primero al que lleva más sin jugar ----------
const freshAuto = async () => (await autoSearches()).filter((x) => x.status === 'searching' && x.seatsFilled === 0).sort((a, b) => a.startMinute - b.startMinute);
await step('A11. Turno libre automático: con 1 no se reserva; con 2 confirmados se retiene la cancha hasta 3 h antes; con 4 queda confirmada', async () => {
  const s = (await freshAuto())[0];
  assert.ok(s, 'no hay turno libre automático abierto');
  const fakes = s.invitedUids.filter((u) => u.startsWith('demo-'));
  assert.ok(fakes.length >= 4, `invitados de la demo: ${fakes.length}`);
  assert.equal(await H.claimSeat({ clubId: CLUB, searchId: s.id, uid: fakes[0] }), 'won');
  assert.equal((await club.collection('bookings').doc(s.bookingId).get()).exists, false, 'reservó con 1');
  assert.equal(await H.claimSeat({ clubId: CLUB, searchId: s.id, uid: fakes[1] }), 'won');
  const held = (await club.collection('bookings').doc(s.bookingId).get()).data();
  assert.equal(held?.status, 'held', 'no retuvo con 2');
  assert.deepEqual([...held.playerUids].sort(), [fakes[0], fakes[1]].sort());
  const start = new Date(`${DA}T${p2(Math.floor(s.startMinute / 60))}:${p2(s.startMinute % 60)}:00`).getTime();
  assert.equal(new Date(held.holdExpiresAt).getTime(), start - 180 * 60000, 'retiene hasta 3 h antes');
  assert.equal(await H.claimSeat({ clubId: CLUB, searchId: s.id, uid: fakes[2] }), 'won');
  assert.equal((await club.collection('bookings').doc(s.bookingId).get()).get('playerUids').length, 3);
  assert.equal(await H.claimSeat({ clubId: CLUB, searchId: s.id, uid: fakes[3] }), 'won');
  const bk = (await club.collection('bookings').doc(s.bookingId).get()).data();
  assert.equal(bk.status, 'confirmed'); assert.equal(bk.playerUids.length, 4); assert.equal(bk.teamA?.length, 2);
});
await step('A12. Si de 2 se baja uno, la cancha se suelta (y la búsqueda sigue)', async () => {
  const s = (await freshAuto())[0];
  const fakes = s.invitedUids.filter((u) => u.startsWith('demo-'));
  await H.claimSeat({ clubId: CLUB, searchId: s.id, uid: fakes[0] });
  await H.claimSeat({ clubId: CLUB, searchId: s.id, uid: fakes[1] });
  assert.equal((await club.collection('bookings').doc(s.bookingId).get()).get('status'), 'held');
  await H.dropFromMatch({ clubId: CLUB, matchId: s.matchId, uid: fakes[1] });
  assert.equal((await club.collection('bookings').doc(s.bookingId).get()).get('status'), 'cancelled');
  assert.equal((await club.collection('fillSearches').doc(s.id).get()).get('status'), 'searching');
});
await step('A13. A las 3 h antes sin llegar a 4, el reloj suelta la cancha pero la búsqueda sigue hasta 2 h antes', async () => {
  const s = (await autoSearches()).filter((x) => x.status === 'searching').sort((a, b) => a.startMinute - b.startMinute)[0];
  const fakes = s.invitedUids.filter((u) => u.startsWith('demo-') && !s.filledUids.includes(u) && !s.excludedUids.includes(u));
  // Que haya 2 confirmados (puede tener 1 de la prueba anterior).
  for (const u of fakes) { if ((await club.collection('fillSearches').doc(s.id).get()).get('seatsFilled') >= 2) break; await H.claimSeat({ clubId: CLUB, searchId: s.id, uid: u }); }
  const held = (await club.collection('bookings').doc(s.bookingId).get()).data();
  assert.equal(held?.status, 'held');
  await H.runClock(new Date(new Date(held.holdExpiresAt).getTime() + 60000));
  assert.equal((await club.collection('bookings').doc(s.bookingId).get()).get('status'), 'cancelled', 'no soltó la cancha');
  assert.equal((await club.collection('fillSearches').doc(s.id).get()).get('status'), 'searching', 'cortó la búsqueda');
});
await step('A14. A igual categoría, el aviso va primero al que lleva más días sin jugar', async () => {
  const mk = (uid) => ({ uid, displayName: uid, role: 'player', category: 5, gender: 'masculino', blocked: false, noShowCount: 0, weeklyAvailability: [{ dayOfWeek: 3, startMinute: 0, endMinute: 1440 }] });
  const search = { date: '2026-11-25', startMinute: 1200, endMinute: 1290, excludedUids: [], invitedUids: [], filledUids: [], modality: 'masculino', genderNeeded: [] };
  const ranked = H.rankCandidates({
    search, clubGap: 1, current: [], targetCategory: 5, members: [mk('ayer'), mk('nunca'), mk('hace10')], prefsByUid: new Map(), counters: new Map(),
    bookings: [], requests: [], now: new Date('2026-11-20T12:00:00'), random: () => 0.5,
    lastPlayed: new Map([['ayer', '2026-11-24'], ['hace10', '2026-11-15']]),
  });
  assert.deepEqual(ranked.map((c) => c.uid), ['nunca', 'hace10', 'ayer']);
});

// ---------- Etapa 4 (17/11): suplente de guardia ----------
async function guardMatch(id, date, startMinute, uids) {
  const mem = new Map((await club.collection('memberships').get()).docs.map((d) => [d.id, d.data()]));
  const slots = uids.map((u) => ({ uid: u, displayName: mem.get(u).displayName, category: mem.get(u).category, gender: mem.get(u).gender, status: 'accepted', paid: false, requestId: '' }));
  const cats = slots.map((x) => x.category);
  const bookingId = `bk_${id}`;
  await club.collection('bookings').doc(bookingId).set({ id: bookingId, clubId: CLUB, courtId: 'cancha_3', courtName: 'Cancha 3', date, startMinute, endMinute: startMinute + 90, type: 'matched', status: 'confirmed', createdByUid: 'x', playerUids: uids, guestName: '', totalPrice: 2400, paidAmount: 0, paymentMethod: 'split', paymentStatus: 'pending', holdExpiresAt: '' });
  await club.collection('proposedMatches').doc(id).set({ id, clubId: CLUB, bookingId, courtId: 'cancha_3', courtName: 'Cancha 3', date, startMinute, endMinute: startMinute + 90, modality: 'mixto', minCategory: Math.min(...cats), maxCategory: Math.max(...cats), pricePerPlayer: 600, playerUids: uids, slots, expiresAt: '', status: 'confirmed', createdByUid: 'x' });
  return { id, bookingId };
}
const DG = inDays(5); const TG = 14 * 60;
await step('G1. Suplente de guardia: no se puede ofrecer dos veces en franjas que se pisan', async () => {
  await H.offerStandby({ clubId: CLUB, uid: 'demo-p28', date: DG, startMinute: 12 * 60, endMinute: 17 * 60 });
  await assert.rejects(H.offerStandby({ clubId: CLUB, uid: 'demo-p28', date: DG, startMinute: 16 * 60, endMinute: 19 * 60 }), /Ya estás de suplente/);
});
await step('G2. Se baja uno: entra directo el suplente de guardia (antes de la tanda) y se le avisa', async () => {
  const m = await guardMatch('pm_test_guardia', DG, TG, ['demo-p08', 'demo-p09', 'demo-p10', 'demo-p26']);
  const r = await H.dropFromMatch({ clubId: CLUB, matchId: m.id, uid: 'demo-p26' });
  const after = (await club.collection('proposedMatches').doc(m.id).get()).data();
  assert.ok(after.playerUids.includes('demo-p28'), `no entró el suplente: ${after.playerUids}`);
  assert.equal(after.slots.length, 4);
  const sb = (await club.collection('standbys').where('uid', '==', 'demo-p28').get()).docs[0].data();
  assert.equal(sb.status, 'used'); assert.equal(sb.matchId, m.id);
  const inv = (await club.collection('fillInvites').doc(`${r.searchId}_demo-p28`).get()).data();
  assert.equal(inv.via, 'guardia'); assert.equal(inv.status, 'won');
  const s = (await club.collection('fillSearches').doc(r.searchId).get()).data();
  assert.equal(s.status, 'filled');
  assert.equal(s.invitedUids.length, 0, 'mandó tanda igual');
  const n = await club.collection('notifications').where('recipientUid', '==', 'demo-p28').get();
  assert.ok(n.docs.some((d) => /Entraste de suplente/.test(d.get('title'))));
});
await step('G3. El suplente que ya juega a esa hora o no es de la categoría no entra (se sigue con la tanda)', async () => {
  // Se baja Natalia (5ta): hace falta una mujer. Victoria (5ta) está de guardia pero ocupada a esa hora; Lorena (7ma) libre pero muy lejos de 5ta.
  await H.offerStandby({ clubId: CLUB, uid: 'demo-p27', date: DG, startMinute: 17 * 60, endMinute: 21 * 60 });
  await H.offerStandby({ clubId: CLUB, uid: 'demo-p15', date: DG, startMinute: 17 * 60, endMinute: 21 * 60 });
  await club.collection('bookings').doc('bk_test_ocupado_p28').set({ id: 'bk_test_ocupado_p28', clubId: CLUB, courtId: 'cancha_1', courtName: 'Cancha 1', date: DG, startMinute: 18 * 60, endMinute: 19 * 60 + 30, type: 'direct', status: 'confirmed', createdByUid: 'demo-p27', playerUids: ['demo-p27'], guestName: '', totalPrice: 2400, paidAmount: 0, paymentMethod: 'club', paymentStatus: 'pending', holdExpiresAt: '' });
  const m = await guardMatch('pm_test_guardia2', DG, 18 * 60 + 30, ['demo-p08', 'demo-p09', 'demo-p10', 'demo-p29']);
  const r = await H.dropFromMatch({ clubId: CLUB, matchId: m.id, uid: 'demo-p29' });
  const after = (await club.collection('proposedMatches').doc(m.id).get()).data();
  assert.ok(!after.playerUids.includes('demo-p27'), 'entró el que ya jugaba a esa hora');
  assert.ok(!after.playerUids.includes('demo-p15'), 'entró uno de 7ma a un partido de 5ta');
  const st = Object.fromEntries((await club.collection('standbys').where('date', '==', DG).get()).docs.map((d) => [d.get('uid'), d.get('status')]));
  assert.equal(st['demo-p27'], 'active'); assert.equal(st['demo-p15'], 'active');
  assert.equal((await club.collection('fillSearches').doc(r.searchId).get()).get('status'), 'searching');
});
await step('G4. El reloj vence las guardias de días que ya pasaron', async () => {
  await club.collection('standbys').doc('sb_test_viejo').set({ id: 'sb_test_viejo', clubId: CLUB, uid: 'demo-p30', displayName: 'x', category: 6, date: inDays(-1), startMinute: 600, endMinute: 900, status: 'active' });
  await H.runClock(new Date());
  assert.equal((await club.collection('standbys').doc('sb_test_viejo').get()).get('status'), 'expired');
});

await step('G5. Un suplente de guardia que alguno del partido marcó "prefiero no" no entra (y no se le dice por qué)', async () => {
  await H.offerStandby({ clubId: CLUB, uid: 'demo-p26', date: DG, startMinute: 8 * 60, endMinute: 12 * 60 });
  await db.doc('users/demo-p09').set({ avoidUids: ['demo-p26'] }, { merge: true });
  const m = await guardMatch('pm_test_guardia3', DG, 9 * 60 + 30, ['demo-p08', 'demo-p09', 'demo-p10', 'demo-p28']);
  const r = await H.dropFromMatch({ clubId: CLUB, matchId: m.id, uid: 'demo-p28' });
  const after = (await club.collection('proposedMatches').doc(m.id).get()).data();
  assert.ok(!after.playerUids.includes('demo-p26'), 'entró igual');
  const s = (await club.collection('fillSearches').doc(r.searchId).get()).data();
  assert.ok(!s.invitedUids.includes('demo-p26'), 'lo invitó en la tanda');
  await db.doc('users/demo-p09').update({ avoidUids: [] });
});

console.log('\n' + results.join('\n'));
process.exit(results.some((r) => r.startsWith('FALLA')) ? 1 : 0);
