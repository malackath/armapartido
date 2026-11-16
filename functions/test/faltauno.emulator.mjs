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

console.log('\n' + results.join('\n'));
process.exit(results.some((r) => r.startsWith('FALLA')) ? 1 : 0);
