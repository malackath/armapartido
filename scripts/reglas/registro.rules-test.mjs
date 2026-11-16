// Registro del jugador y revisión de categoría por el club (16/11/2026).
// Correr: npx -y firebase-tools@15 emulators:exec --only firestore "node registro.rules-test.mjs ../../firestore.rules"
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { doc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
const env = await initializeTestEnvironment({ projectId: 'demo-registro', firestore: { host: '127.0.0.1', port: 8085, rules: readFileSync(process.argv[2] ?? 'firestore.rules', 'utf8') } });
const C = 'club1';
const ts = new Date('2026-11-16T12:00:00Z');
const member = (uid, extra = {}) => ({ uid, clubId: C, displayName: 'Jugador', role: 'player', category: 5, gender: 'masculino', preferredModality: 'mixto', weeklyAvailability: [], noShowCount: 0, blocked: false, isDiscoverable: true, createdAt: ts, updatedAt: ts, ...extra });
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, `clubs/${C}`), { id: C, ownerUid: 'dueno' });
  await setDoc(doc(db, `clubs/${C}/memberships/mostrador`), member('mostrador', { role: 'staff' }));
  await setDoc(doc(db, `clubs/${C}/memberships/romina`), member('romina', { role: 'cantina' }));
  await setDoc(doc(db, `clubs/${C}/memberships/sofia`), member('sofia', { category: 4, categoryReview: 'pendiente', courtSide: 'reves' }));
});
const as = (uid, verified = true) => env.authenticatedContext(uid, { email: `${uid}@x.uy`, email_verified: verified }).firestore();
const nuevo = as('nuevo', false), nuevoOk = as('nuevo', true), staff = as('mostrador'), cantina = as('romina'), sofia = as('sofia'), otro = as('otro');
const perfil = (uid, extra = {}) => ({ uid, displayName: 'Sofía Pereira', category: 4, gender: 'femenino', preferredModality: 'mixto', weeklyAvailability: [{ dayOfWeek: 2, startMinute: 1140, endMinute: 1440 }], activeClubIds: [C], alertPrefs: { weeklyInvites: 3, maxCategoryGap: 1 }, courtSide: 'reves', hand: 'derecha', signupDone: true, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), ...extra });
let n = 0, bad = 0;
const t = async (name, p) => { n++; try { await p; console.log('OK  ', name); } catch (e) { bad++; console.log('MAL ', name, e.message); } };
await t('1. Cuenta nueva sin mail confirmado guarda su perfil', assertSucceeds(setDoc(doc(nuevo, 'users/nuevo'), perfil('nuevo'))));
await t('2. Y su celular aparte', assertSucceeds(setDoc(doc(nuevo, 'users/nuevo/private/info'), { uid: 'nuevo', email: 'nuevo@x.uy', phone: '+59899123456', updatedAt: serverTimestamp() })));
await t('3. Nadie guarda el perfil de otro', assertFails(setDoc(doc(otro, 'users/nuevo2'), perfil('nuevo2'))));
await t('4. No existe 8va', assertFails(setDoc(doc(as('x8'), 'users/x8'), perfil('x8', { category: 8 }))));
await t('5. Lado de la cancha inventado se rechaza', assertFails(setDoc(doc(as('x9'), 'users/x9'), perfil('x9', { courtSide: 'centro' }))));
await t('6. Sin mail confirmado no se suma al club', assertFails(setDoc(doc(nuevo, `clubs/${C}/memberships/nuevo`), member('nuevo', { categoryReview: 'pendiente', createdAt: serverTimestamp(), updatedAt: serverTimestamp() }))));
await t('7. Con el mail confirmado se suma, con la categoría pendiente', assertSucceeds(setDoc(doc(nuevoOk, `clubs/${C}/memberships/nuevo`), member('nuevo', { courtSide: 'drive', hand: 'izquierda', categoryReview: 'pendiente', createdAt: serverTimestamp(), updatedAt: serverTimestamp() }))));
await t('8. No puede sumarse con la categoría ya "revisada"', assertFails(setDoc(doc(as('x10'), `clubs/${C}/memberships/x10`), member('x10', { categoryReview: 'ok', createdAt: serverTimestamp(), updatedAt: serverTimestamp() }))));
await t('9. El jugador cambia su lado y su categoría (vuelve a pendiente)', assertSucceeds(updateDoc(doc(sofia, `clubs/${C}/memberships/sofia`), { courtSide: 'drive', category: 3, categoryReview: 'pendiente', updatedAt: serverTimestamp() })));
await t('10. El jugador no se marca la categoría como revisada', assertFails(updateDoc(doc(sofia, `clubs/${C}/memberships/sofia`), { categoryReview: 'ok', updatedAt: serverTimestamp() })));
await t('11. El mostrador corrige la categoría y la marca revisada', assertSucceeds(updateDoc(doc(staff, `clubs/${C}/memberships/sofia`), { category: 5, categoryReview: 'ok', updatedAt: serverTimestamp() })));
await t('12. El mostrador no cambia el rol', assertFails(updateDoc(doc(staff, `clubs/${C}/memberships/sofia`), { role: 'admin', updatedAt: serverTimestamp() })));
await t('13. La cantina no toca categorías', assertFails(updateDoc(doc(cantina, `clubs/${C}/memberships/sofia`), { category: 6, updatedAt: serverTimestamp() })));
await t('14. El jugador edita su perfil (lado y mano)', assertSucceeds(updateDoc(doc(nuevo, 'users/nuevo'), { courtSide: 'indistinto', hand: 'izquierda', updatedAt: serverTimestamp() })));
console.log(`\n${n - bad} de ${n} bien`);
await env.cleanup();
process.exit(bad ? 1 : 0);
