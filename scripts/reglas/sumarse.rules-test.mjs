// "Solo mis jugadores" y pedidos para sumarse (17/11/2026).
// Correr: npx -y firebase-tools@15 emulators:exec --only firestore "node sumarse.rules-test.mjs ../../firestore.rules"
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { doc, getDoc, getDocs, collection, query, where, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
const env = await initializeTestEnvironment({ projectId: 'demo-sumarse', firestore: { host: '127.0.0.1', port: 8085, rules: readFileSync(process.argv[2] ?? 'firestore.rules', 'utf8') } });
const ts = new Date('2026-11-17T12:00:00Z');
const club = (id, extra = {}) => ({
  id, name: 'Club de prueba', slug: id.replace(/_/g, '-'), primaryColor: '#0a5761', accentColor: '#7ff7f7', address: 'Calle 123', city: 'Montevideo',
  lat: -34.9, lng: -56.1, ownerUid: 'dueno', slotDurationMinutes: 90, openHour: 8, closeHour: 24, basePrice: 1200, nightFromHour: 19, nightPrice: 1500,
  weekendPrice: 1500, cancellationHours: 6, maxNoShowsBeforeBlock: 3, mpEnabled: false, mpMode: 'full', mpDepositPercent: 50, subscriptionStatus: 'active',
  monthlyPricePerCourt: 0, courtCount: 4, active: true, createdAt: ts, updatedAt: ts, ...extra,
});
const member = (C, uid, extra = {}) => ({ uid, clubId: C, displayName: 'Jugador', role: 'player', category: 5, gender: 'masculino', preferredModality: 'mixto', weeklyAvailability: [], noShowCount: 0, blocked: false, isDiscoverable: true, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), categoryReview: 'pendiente', ...extra });
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, 'clubs/abierto'), club('abierto'));
  await setDoc(doc(db, 'clubs/cerrado'), club('cerrado', { joinPolicy: 'solo_clientes' }));
  for (const C of ['abierto', 'cerrado']) {
    await setDoc(doc(db, `clubs/${C}/memberships/admin`), member(C, 'admin', { role: 'admin', createdAt: ts, updatedAt: ts }));
    await setDoc(doc(db, `clubs/${C}/memberships/mostrador`), member(C, 'mostrador', { role: 'staff', createdAt: ts, updatedAt: ts }));
    await setDoc(doc(db, `clubs/${C}/memberships/romina`), member(C, 'romina', { role: 'cantina', createdAt: ts, updatedAt: ts }));
  }
  await setDoc(doc(db, 'clubs/cerrado/joinRequests/pide'), { uid: 'pide', clubId: 'cerrado', displayName: 'Pide', email: 'pide@x.uy', phone: '', category: 5, status: 'pendiente' });
});
const as = (uid) => env.authenticatedContext(uid, { email: `${uid}@x.uy`, email_verified: true }).firestore();
let n = 0, bad = 0;
const t = async (name, p) => { n++; try { await p; console.log('OK  ', name); } catch (e) { bad++; console.log('MAL ', name, e.message); } };
await t('1. Club abierto: el jugador se suma solo (como hoy)', assertSucceeds(setDoc(doc(as('ana'), 'clubs/abierto/memberships/ana'), member('abierto', 'ana'))));
await t('2. Club "Solo mis jugadores": el jugador NO se suma solo (pasa por el servidor)', assertFails(setDoc(doc(as('ana'), 'clubs/cerrado/memberships/ana'), member('cerrado', 'ana'))));
await t('3. El administrador cambia a "Solo mis jugadores"', assertSucceeds(updateDoc(doc(as('admin'), 'clubs/abierto'), { joinPolicy: 'solo_clientes', updatedAt: serverTimestamp() })));
await t('4. Valor inventado se rechaza', assertFails(updateDoc(doc(as('admin'), 'clubs/abierto'), { joinPolicy: 'cerrado_total', updatedAt: serverTimestamp() })));
await t('5. El encargado no cambia el interruptor', assertFails(updateDoc(doc(as('mostrador'), 'clubs/cerrado'), { joinPolicy: 'abierto', updatedAt: serverTimestamp() })));
await t('6. El jugador lee su propio pedido', assertSucceeds(getDoc(doc(as('pide'), 'clubs/cerrado/joinRequests/pide'))));
await t('7. Otro jugador no lee pedidos ajenos', assertFails(getDoc(doc(as('ana'), 'clubs/cerrado/joinRequests/pide'))));
await t('8. El encargado lista los pedidos', assertSucceeds(getDocs(query(collection(as('mostrador'), 'clubs/cerrado/joinRequests'), where('status', '==', 'pendiente')))));
await t('9. La cantina no los lista', assertFails(getDocs(collection(as('romina'), 'clubs/cerrado/joinRequests'))));
await t('10. Nadie escribe un pedido desde el celular (ni aprobarse a sí mismo)', assertFails(updateDoc(doc(as('pide'), 'clubs/cerrado/joinRequests/pide'), { status: 'aprobado' })));
await t('11. El encargado tampoco lo escribe directo (lo hace el servidor)', assertFails(updateDoc(doc(as('mostrador'), 'clubs/cerrado/joinRequests/pide'), { status: 'aprobado' })));
console.log(`\n${n - bad} de ${n} bien`);
await env.cleanup();
process.exit(bad ? 1 : 0);
