// Resultados con confirmación del rival y categoría sugerida (etapa 6a) contra los emuladores.
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
const p2 = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
const inDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };
const results = [];
async function step(name, fn) {
  try { await fn(); results.push(`OK   ${name}`); } catch (e) { results.push(`FALLA ${name}: ${e.message}`); }
}

// Jugadores de 6ta que no están en torneos (así sus resultados son solo los de esta prueba).
const mems = (await club.collection('memberships').get()).docs.map((d) => d.data());
const inTrn = new Set((await club.collection('tournaments').get()).docs.flatMap((d) => (d.get('pairs') ?? []).flatMap((p) => [p.player1Uid, p.player2Uid])));
const pool = mems.filter((m) => m.role === 'player' && !inTrn.has(m.uid)).sort((a, b) => a.category - b.category || a.uid.localeCompare(b.uid));
const byCat = new Map();
for (const m of pool) byCat.set(m.category, [...(byCat.get(m.category) ?? []), m]);
const [cat, four] = [...byCat.entries()].find(([c, xs]) => c >= 2 && c <= 6 && xs.length >= 4);
const [A1, A2, B1, B2] = four.slice(0, 4).map((m) => m.uid);

let k = 0;
async function played(daysAgo, uids, teams = true) {
  const id = `bk_test_res_${k++}`;
  const date = inDays(-daysAgo);
  const startMinute = 8 * 60 + (k % 9) * 90;
  await club.collection('bookings').doc(id).set({
    id, clubId: CLUB, courtId: 'cancha_1', courtName: 'Cancha 1', date, startMinute, endMinute: startMinute + 90, type: 'matched', status: 'confirmed',
    createdByUid: 'x', playerUids: uids, guestName: '', totalPrice: 2400, paidAmount: 0, paymentMethod: 'split', paymentStatus: 'pending', holdExpiresAt: '',
    ...(teams ? { teamA: uids.slice(0, 2), teamB: uids.slice(2) } : {}),
  });
  return id;
}

await step('RE1. No se carga si el partido no terminó, si no jugaste o si no son 4', async () => {
  const future = await played(-1, [A1, A2, B1, B2]);
  await assert.rejects(H.reportResult({ clubId: CLUB, uid: A1, bookingId: future, winner: 'A', score: '' }), /todavía no terminó/);
  const past = await played(1, [A1, A2, B1, B2]);
  const other = pool.find((m) => ![A1, A2, B1, B2].includes(m.uid)).uid;
  await assert.rejects(H.reportResult({ clubId: CLUB, uid: other, bookingId: past, winner: 'A', score: '' }), /Solo los que jugaron/);
  const three = await played(1, [A1, A2, B1]);
  await assert.rejects(H.reportResult({ clubId: CLUB, uid: A1, bookingId: three, winner: 'A', score: '' }), /partidos de 4/);
  const old = await played(9, [A1, A2, B1, B2]);
  await assert.rejects(H.reportResult({ clubId: CLUB, uid: A1, bookingId: old, winner: 'A', score: '' }), /hasta 7 días/);
});

await step('RE2. Uno carga: queda esperando, avisa a la otra pareja y nadie más lo puede cargar', async () => {
  const b = await played(1, [A1, A2, B1, B2]);
  const r = await H.reportResult({ clubId: CLUB, uid: A1, bookingId: b, winner: 'A', score: '6-4 6-3' });
  assert.equal(r.status, 'pending');
  assert.deepEqual(r.teamA, [A1, A2]);
  const n = await club.collection('notifications').where('recipientUid', '==', B1).get();
  assert.ok(n.docs.some((d) => /Confirmá el resultado/.test(d.get('title'))), 'no avisó al rival');
  await assert.rejects(H.reportResult({ clubId: CLUB, uid: B2, bookingId: b, winner: 'B', score: '' }), /ya cargó/);
});

await step('RE3. Confirma solo alguien de la otra pareja', async () => {
  const b = await played(1, [A1, A2, B1, B2]);
  await H.reportResult({ clubId: CLUB, uid: A1, bookingId: b, winner: 'A', score: '' });
  await assert.rejects(H.confirmResult({ clubId: CLUB, uid: A2, bookingId: b, agree: true }), /otra pareja/);
  assert.equal(await H.confirmResult({ clubId: CLUB, uid: B1, bookingId: b, agree: true }), 'confirmed');
});

await step('RE4. "No fue así": no cuenta, avisa al que cargó y se puede volver a cargar', async () => {
  const b = await played(2, [A1, A2, B1, B2]);
  await H.reportResult({ clubId: CLUB, uid: A1, bookingId: b, winner: 'A', score: '' });
  assert.equal(await H.confirmResult({ clubId: CLUB, uid: B2, bookingId: b, agree: false }), 'disputed');
  const n = await club.collection('notifications').where('recipientUid', '==', A1).get();
  assert.ok(n.docs.some((d) => /no coincidió/.test(d.get('title'))));
  const again = await H.reportResult({ clubId: CLUB, uid: B2, bookingId: b, winner: 'B', score: '' });
  assert.equal(again.status, 'pending');
});

await step('RE5. A las 48 h sin confirmar vence y ya no se puede confirmar', async () => {
  const b = await played(2, [A1, A2, B1, B2]);
  await H.reportResult({ clubId: CLUB, uid: A1, bookingId: b, winner: 'A', score: '' });
  const later = new Date(Date.now() + 49 * 3600e3);
  assert.ok((await H.expireResults(CLUB, later)) >= 1);
  assert.equal((await club.collection('matchResults').doc(b).get()).get('status'), 'expired');
  await assert.rejects(H.confirmResult({ clubId: CLUB, uid: B1, bookingId: b, agree: true }), /ya no espera/);
});

await step('RE6. Sin equipos en la reserva, el que carga tiene que decir con quién jugó', async () => {
  const b = await played(3, [A1, B1, A2, B2], false);
  await assert.rejects(H.reportResult({ clubId: CLUB, uid: A1, bookingId: b, winner: 'A', score: '' }), /con quién jugaste/);
  const r = await H.reportResult({ clubId: CLUB, uid: A1, bookingId: b, winner: 'A', score: '', partnerUid: A2 });
  assert.deepEqual(r.teamA, [A1, A2]);
  assert.deepEqual(r.teamB.sort(), [B1, B2].sort());
});

let wins = 0;
await step(`RE7. Gana 10 de 10 contra su categoría (${cat}): el club recibe la sugerencia de subir; el jugador no la ve`, async () => {
  // Ya tiene 1 confirmado ganado (RE3). Suma hasta 10.
  for (let i = 0; i < 9; i++) {
    const b = await played(1 + (i % 6), [A1, A2, B1, B2]);
    await H.reportResult({ clubId: CLUB, uid: B1, bookingId: b, winner: 'A', score: '' });
    await H.confirmResult({ clubId: CLUB, uid: A1, bookingId: b, agree: true });
  }
  wins = (await H.confirmedResultsOf(CLUB, A1)).filter((r) => r.won).length;
  const s = (await club.collection('categorySuggestions').doc(A1).get()).data();
  assert.ok(s, `no hay sugerencia (ganados ${wins})`);
  assert.equal(s.status, 'pending'); assert.equal(s.from, cat); assert.equal(s.to, cat - 1);
  assert.match(s.reason, /Ganó 10 de sus últimos 10/);
  const lost = (await club.collection('categorySuggestions').doc(B1).get()).data();
  assert.ok(lost && lost.to === cat + 1, 'al que perdió 10 de 10 no le sugirió bajar');
});

await step('RE8. El club dice que no: no vuelve a sugerir hasta 5 partidos más', async () => {
  await H.decideSuggestion({ clubId: CLUB, byUid: 'staff', uid: B1, accept: false });
  for (let i = 0; i < 4; i++) {
    const b = await played(1 + i, [A1, A2, B1, B2]);
    await H.reportResult({ clubId: CLUB, uid: B1, bookingId: b, winner: 'A', score: '' });
    await H.confirmResult({ clubId: CLUB, uid: A2, bookingId: b, agree: true });
  }
  assert.equal((await club.collection('categorySuggestions').doc(B1).get()).get('status'), 'rejected', 'volvió a sugerir con 4');
  const b = await played(5, [A1, A2, B1, B2]);
  await H.reportResult({ clubId: CLUB, uid: B1, bookingId: b, winner: 'A', score: '' });
  await H.confirmResult({ clubId: CLUB, uid: A2, bookingId: b, agree: true });
  assert.equal((await club.collection('categorySuggestions').doc(B1).get()).get('status'), 'pending', 'con 5 más no volvió a sugerir');
});

await step('RE9. El club dice que sí: cambia la categoría en el club y le avisa al jugador', async () => {
  await H.decideSuggestion({ clubId: CLUB, byUid: 'staff', uid: A1, accept: true });
  const m = (await club.collection('memberships').doc(A1).get()).data();
  assert.equal(m.category, cat - 1);
  const n = await club.collection('notifications').where('recipientUid', '==', A1).get();
  assert.ok(n.docs.some((d) => d.get('eventType') === 'category_changed' && /Subiste/.test(d.get('title'))));
  // Después del cambio, los partidos viejos no cuentan: con uno más no vuelve a sugerir subir.
  const b = await played(1, [A1, A2, B1, B2]);
  await H.reportResult({ clubId: CLUB, uid: B1, bookingId: b, winner: 'A', score: '' });
  await H.confirmResult({ clubId: CLUB, uid: A2, bookingId: b, agree: true });
  assert.equal((await club.collection('categorySuggestions').doc(A1).get()).get('status'), 'accepted');
});

console.log(results.join('\n'));
process.exit(results.some((x) => x.startsWith('FALLA')) ? 1 : 0);
