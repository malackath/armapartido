// Pareja fija sin torneo (20/11/2026): solo la leen los dos; nadie la escribe desde el celular.
// Correr: npx -y firebase-tools@15 emulators:exec --only firestore "node pareja.rules-test.mjs ../../firestore.rules"
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { doc, getDoc, getDocs, collection, query, where, setDoc, updateDoc } from 'firebase/firestore';
const env = await initializeTestEnvironment({ projectId: 'demo-pareja', firestore: { host: '127.0.0.1', port: 8085, rules: readFileSync(process.argv[2] ?? 'firestore.rules', 'utf8') } });
const pair = { id: 'p1', clubId: 'c1', uids: ['ana', 'beto'], names: { ana: 'Ana', beto: 'Beto' }, creatorUid: 'ana', status: 'active', cells: ['2-3'], modality: 'mixto', searching: true, perWeek: 1 };
await env.withSecurityRulesDisabled(async (ctx) => { await setDoc(doc(ctx.firestore(), 'clubs/c1/fixedPairs/p1'), pair); });
const as = (uid) => env.authenticatedContext(uid, { email: `${uid}@x.uy`, email_verified: true }).firestore();
let n = 0, bad = 0;
const t = async (name, p) => { n++; try { await p; console.log('OK  ', name); } catch (e) { bad++; console.log('MAL ', name, e.message); } };
await t('R1. Ana lee su pareja', assertSucceeds(getDoc(doc(as('ana'), 'clubs/c1/fixedPairs/p1'))));
await t('R2. Beto lista sus parejas', assertSucceeds(getDocs(query(collection(as('beto'), 'clubs/c1/fixedPairs'), where('uids', 'array-contains', 'beto')))));
await t('R3. Otro jugador no la lee', assertFails(getDoc(doc(as('caro'), 'clubs/c1/fixedPairs/p1'))));
await t('R4. Otro jugador no lista parejas ajenas', assertFails(getDocs(collection(as('caro'), 'clubs/c1/fixedPairs'))));
await t('R5. Ni Ana cambia la pareja desde el celular (lo hace el servidor)', assertFails(updateDoc(doc(as('ana'), 'clubs/c1/fixedPairs/p1'), { status: 'ended' })));
await t('R6. Nadie crea una pareja desde el celular', assertFails(setDoc(doc(as('caro'), 'clubs/c1/fixedPairs/p2'), { ...pair, id: 'p2', uids: ['caro', 'ana'] })));
await t('R7. Sin cuenta no se lee', assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'clubs/c1/fixedPairs/p1'))));
console.log(`\n${n - bad} de ${n} bien`);
await env.cleanup();
process.exit(bad ? 1 : 0);
