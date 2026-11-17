// Modo invitados (etapa 6b) contra los emuladores: otro club ficticio y amigos que trae un socio.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
process.env.GCLOUD_PROJECT = 'demo-armapartido';
process.env.TZ = 'America/Montevideo';

const admin = require('../node_modules/firebase-admin/lib/app/index.js');
const { getFirestore } = require('../node_modules/firebase-admin/lib/firestore/index.js');
if (!admin.getApps().length) admin.initializeApp({ projectId: 'demo-armapartido' });
const db = getFirestore();
const H = require('../lib-test/harness.js');

const CLUB = 'los_jacarandas';
const club = db.doc(`clubs/${CLUB}`);
const B = 'club_test_b';
const p2 = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
const inDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };
const results = [];
async function step(name, fn) {
  try { await fn(); results.push(`OK   ${name}`); } catch (e) { results.push(`FALLA ${name}: ${e.message}`); }
}
// Fuera del horario de silencio: hoy a las 15:00.
const at15 = () => { const d = new Date(); d.setHours(15, 0, 0, 0); return d; };
const allWeek = Array.from({ length: 7 }, (_, i) => ({ dayOfWeek: i, startMinute: 8 * 60, endMinute: 24 * 60 }));

async function guestUser(uid, { category = 6, gender = 'masculino', otherClubs = true, home = B, review = 'ok' } = {}) {
  await db.doc(`users/${uid}`).set({ uid, displayName: `Invitado ${uid}`, category, gender, weeklyAvailability: allWeek, alertPrefs: { weeklyInvites: -1, maxCategoryGap: 1, otherClubs } });
  if (home) await db.doc(`clubs/${home}/memberships/${uid}`).set({ uid, clubId: home, displayName: `Invitado ${uid}`, role: 'player', category, gender, preferredModality: 'mixto', weeklyAvailability: allWeek, noShowCount: 0, blocked: false, isDiscoverable: true, categoryReview: review });
}

let n = 0;
/** Partido de 6ta con 4, se baja uno (hombre): arranca la búsqueda. Devuelve la búsqueda. */
async function searchFor6ta(date, start) {
  const id = `pm_test_inv_${n++}`;
  const uids = ['demo-p11', 'demo-p12', 'demo-p13', 'demo-p30'];
  const mem = new Map((await club.collection('memberships').get()).docs.map((d) => [d.id, d.data()]));
  const slots = uids.map((u) => ({ uid: u, displayName: mem.get(u).displayName, category: mem.get(u).category, gender: mem.get(u).gender, status: 'accepted', paid: false, requestId: '' }));
  const bookingId = `bk_${id}`;
  await club.collection('bookings').doc(bookingId).set({ id: bookingId, clubId: CLUB, courtId: 'cancha_4', courtName: 'Cancha 4', date, startMinute: start, endMinute: start + 90, type: 'matched', status: 'confirmed', createdByUid: 'x', playerUids: uids, guestName: '', totalPrice: 2400, paidAmount: 0, paymentMethod: 'split', paymentStatus: 'pending', holdExpiresAt: '' });
  await club.collection('proposedMatches').doc(id).set({ id, clubId: CLUB, bookingId, courtId: 'cancha_4', courtName: 'Cancha 4', date, startMinute: start, endMinute: start + 90, modality: 'mixto', minCategory: 6, maxCategory: 6, pricePerPlayer: 600, playerUids: uids, slots, expiresAt: '', status: 'confirmed', createdByUid: 'x' });
  const r = await H.dropFromMatch({ clubId: CLUB, matchId: id, uid: 'demo-p30', nowDate: at15() });
  return r.searchId;
}
/** Corre la tanda siguiente (fuerza que ya sea la hora). */
async function nextWave(searchId) {
  await club.collection('fillSearches').doc(searchId).update({ nextWaveAt: '2000-01-01T00:00:00.000Z' });
  await H.runWave(CLUB, searchId, at15());
  return (await club.collection('fillSearches').doc(searchId).get()).data();
}
const inv = async (searchId, uid) => (await club.collection('fillInvites').doc(`${searchId}_${uid}`).get()).data();

await db.doc(`clubs/${B}`).set({ id: B, name: 'Club de Prueba B', guests: { enabled: false, surcharge: 0, shareMyPlayers: true } });
await guestUser('guest-b1');
await guestUser('guest-b2', { otherClubs: false });
await guestUser('guest-b3', { category: 5 });
await guestUser('guest-b4', { review: 'pendiente' });
const D = inDays(3);

await step('IN1. Club en modo interno (sin invitados): nunca avisa a jugadores de otros clubes', async () => {
  await club.update({ guests: { enabled: false, surcharge: 50 } });
  const sid = await searchFor6ta(D, 9 * 60 + 30);
  await nextWave(sid); await nextWave(sid);
  assert.equal(await inv(sid, 'guest-b1'), undefined);
});

let SID;
await step('IN2. Club que recibe invitados: primero el club; en la tanda siguiente avisa al de otro club con el recargo', async () => {
  await club.update({ guests: { enabled: true, surcharge: 50 } });
  SID = await searchFor6ta(D, 11 * 60);
  const s1 = await nextWave(SID);
  assert.ok(s1.wave >= 1);
  const s2 = s1.guestsInvited ? s1 : await nextWave(SID);
  assert.equal(s2.guestsInvited, true, 'no avisó a invitados');
  const i = await inv(SID, 'guest-b1');
  assert.ok(i, 'no invitó a guest-b1');
  assert.equal(i.guest.kind, 'otro_club'); assert.equal(i.guest.homeClubId, B);
  assert.equal(i.pricePerPlayer, 650, `precio ${i.pricePerPlayer}`);
  const nt = await club.collection('notifications').where('recipientUid', '==', 'guest-b1').get();
  assert.ok(nt.docs.some((d) => /Te invitan a jugar en/.test(d.get('title'))));
});

await step('IN3. No se invita al que no aceptó, al de otra categoría ni al que su club no confirmó', async () => {
  for (const u of ['guest-b2', 'guest-b3', 'guest-b4']) assert.equal(await inv(SID, u), undefined, `invitó a ${u}`);
});

await step('IN4. El invitado se suma: entra al partido marcado como invitado y queda su ficha en Clientes', async () => {
  const r = await H.claimSeat({ clubId: CLUB, searchId: SID, uid: 'guest-b1', nowDate: at15() });
  assert.equal(r, 'won');
  const s = (await club.collection('fillSearches').doc(SID).get()).data();
  const m = (await club.collection('proposedMatches').doc(s.matchId).get()).data();
  const slot = m.slots.find((x) => x.uid === 'guest-b1');
  assert.ok(slot?.guest, 'no quedó como invitado'); assert.equal(slot.surcharge, 50);
  const c = (await club.collection('clients').where('uid', '==', 'guest-b1').get()).docs[0]?.data();
  assert.equal(c?.origin, 'invitado');
});

await step('IN5. Si su club pidió no ofrecer a sus jugadores, no se lo invita', async () => {
  await db.doc(`clubs/${B}`).update({ guests: { enabled: false, surcharge: 0, shareMyPlayers: false } });
  await guestUser('guest-b5');
  const sid = await searchFor6ta(inDays(4), 9 * 60 + 30);
  await nextWave(sid); await nextWave(sid);
  assert.equal(await inv(sid, 'guest-b5'), undefined);
  await db.doc(`clubs/${B}`).update({ guests: { enabled: false, surcharge: 0, shareMyPlayers: true } });
});

await step('IN6. Ocupado en su club a esa hora: no se lo invita', async () => {
  await guestUser('guest-b6');
  const date = inDays(4); const start = 12 * 60 + 30;
  await db.doc(`clubs/${B}/bookings/bk_b6`).set({ id: 'bk_b6', clubId: B, courtId: 'c1', courtName: 'C1', date, startMinute: start, endMinute: start + 90, type: 'direct', status: 'confirmed', createdByUid: 'guest-b6', playerUids: ['guest-b6'] });
  const sid = await searchFor6ta(date, start);
  await nextWave(sid); await nextWave(sid);
  assert.equal(await inv(sid, 'guest-b6'), undefined);
});

await step('IN7. Un socio invita a un amigo: solo si es su amigo; después le llegan avisos como invitado "amigo"', async () => {
  await guestUser('friend-x', { home: '', otherClubs: false });
  await assert.rejects(H.authorizeGuest({ clubId: CLUB, byUid: 'demo-p12', friendUid: 'friend-x' }), /tus amigos/);
  await db.doc('users/demo-p12/friends/friend-x').set({ uid: 'friend-x', ownerUid: 'demo-p12', displayName: 'Invitado friend-x', category: 6, gender: 'masculino' });
  const pass = await H.authorizeGuest({ clubId: CLUB, byUid: 'demo-p12', friendUid: 'friend-x' });
  assert.equal(pass.invitedBy, 'demo-p12');
  const sid = await searchFor6ta(inDays(6), 9 * 60 + 30); // inDays(5) tiene suplentes de guardia de las pruebas G
  await nextWave(sid); await nextWave(sid);
  const i = await inv(sid, 'friend-x');
  const st = (await club.collection('fillSearches').doc(sid).get()).data();
  assert.ok(i, `no invitó al amigo (búsqueda ${st.status}, tanda ${st.wave}, invitados ${st.guestsInvited}, ${st.invitedUids.join(',')})`); assert.equal(i.guest.kind, 'amigo');
});

console.log(results.join('\n'));
process.exit(results.some((x) => x.startsWith('FALLA')) ? 1 : 0);
