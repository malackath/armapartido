import { initializeApp } from 'firebase/app';
import {
  connectAuthEmulator,
  getAuth,
  GoogleAuthProvider,
  signInWithCredential,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import { connectFirestoreEmulator, doc, getDocFromServer, getFirestore } from 'firebase/firestore';
import appletConfig from '../../firebase-applet-config.json';

// Modo demo local: `npm run dev:demo` levanta los emuladores de Firebase y usa datos de prueba.
export const USE_EMULATORS = import.meta.env.VITE_USE_EMULATORS === '1';

// Demo publicada (demo.armapartido.com): entra con mail y contraseña y oculta Google.
export const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === '1';

// Si el build trae la configuración del Firebase propio (variables VITE_FIREBASE_*), se usa esa.
// Si no, queda el proyecto que creó AI Studio. La configuración web de Firebase es pública por diseño.
const env = import.meta.env;
const envConfig = env.VITE_FIREBASE_PROJECT_ID
  ? {
      apiKey: env.VITE_FIREBASE_API_KEY,
      authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: env.VITE_FIREBASE_APP_ID,
    }
  : null;
const firebaseConfig = envConfig ?? appletConfig;

export const app = initializeApp(
  USE_EMULATORS ? { ...firebaseConfig, projectId: 'demo-armapartido' } : firebaseConfig
);
export const db =
  USE_EMULATORS || envConfig ? getFirestore(app) : getFirestore(app, appletConfig.firestoreDatabaseId);
export const auth = getAuth(app);
if (USE_EMULATORS) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
}
export const googleProvider = new GoogleAuthProvider();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testFirestoreConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
      return false;
    }
    return true;
  }
}

export async function signInWithGoogle() {
  if (USE_EMULATORS) {
    // El emulador de Auth acepta un token de Google sin firmar.
    // ?demo=jugador entra como un jugador común (sin roles) para probar lo que ve un jugador.
    const asPlayer = new URLSearchParams(window.location.search).get('demo') === 'jugador';
    const fakeToken = JSON.stringify(
      asPlayer
        ? { sub: 'demo-lucia', email: 'lucia.demo@example.com', name: 'Lucía Pérez', email_verified: true }
        : { sub: 'demo-martin', email: 'martin.demo@example.com', name: 'Martín Silva', email_verified: true }
    );
    return signInWithCredential(auth, GoogleAuthProvider.credential(fakeToken));
  }
  googleProvider.setCustomParameters({ prompt: 'select_account' });
  return signInWithPopup(auth, googleProvider);
}

export async function signInWithEmail(email: string, password: string) {
  return signInWithEmailAndPassword(auth, email.trim(), password);
}

export async function logoutUser() {
  return signOut(auth);
}
