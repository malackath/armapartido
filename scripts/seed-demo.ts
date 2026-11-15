/**
 * Carga (o reinicia) el mundo de demo en Firebase.
 *
 * Uso:
 *   DEMO_PASSWORD='...' FIREBASE_CONFIG_FILE=/ruta/firebase-demo-config.json npx tsx scripts/seed-demo.ts
 *   (contra emuladores: FIREBASE_EMULATORS=1 DEMO_PASSWORD='...' npx tsx scripts/seed-demo.ts)
 *
 * Crea las cuentas de DEMO_ACCOUNTS si no existen (todas con DEMO_PASSWORD), guarda sus uids en demo/meta
 * y vuelve a cargar el club. La contraseña nunca va en el repo: se pasa por variable de entorno.
 */
import { readFileSync } from 'node:fs';
import { initializeApp } from 'firebase/app';
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { DEMO_ACCOUNTS, type DemoUids } from '../src/demo/demoWorld';
import { resetDemoWorld } from '../src/demo/resetDemo';

const password = process.env.DEMO_PASSWORD;
if (!password || password.length < 8) {
  console.error('Falta DEMO_PASSWORD (mínimo 8 caracteres).');
  process.exit(1);
}
const emulators = process.env.FIREBASE_EMULATORS === '1';
const config = emulators
  ? { apiKey: 'demo-key', authDomain: 'localhost', projectId: 'demo-armapartido', appId: 'demo' }
  : JSON.parse(readFileSync(process.env.FIREBASE_CONFIG_FILE || 'firebase-demo-config.json', 'utf8'));

const app = initializeApp(config);
const auth = getAuth(app);
const db = getFirestore(app);
if (emulators) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
}

async function ensureAccount(email: string, name: string): Promise<string> {
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password!);
    await updateProfile(cred.user, { displayName: name });
    console.log(`  creada   ${email}`);
    return cred.user.uid;
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code !== 'auth/email-already-in-use') throw err;
    const cred = await signInWithEmailAndPassword(auth, email, password!);
    console.log(`  ya existía ${email}`);
    return cred.user.uid;
  }
}

async function main() {
  console.log(`Proyecto: ${config.projectId}${emulators ? ' (emuladores)' : ''}`);
  const uids = {} as DemoUids;
  for (const a of DEMO_ACCOUNTS) {
    uids[a.key] = await ensureAccount(a.email, a.name);
    await signOut(auth);
  }
  await signInWithEmailAndPassword(auth, DEMO_ACCOUNTS[0].email, password!);
  const res = await resetDemoWorld(db, uids, (m) => console.log('  ' + m));
  console.log(`Listo: ${res.written} documentos cargados, ${res.deleted} borrados.`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
