/**
 * Borra los datos del club de demo y los vuelve a cargar con `buildDemoWorld`.
 * Funciona en el navegador (botón "Reiniciar demo") y en Node (script de carga).
 * Las cuentas de entrada no se tocan: sus uids se leen de demo/meta.
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';
import { buildDemoWorld, DEMO_CLUB_ID, DEMO_CLUB_SUBCOLLECTIONS, type DemoUids } from './demoWorld';

export const DEMO_META_PATH = ['demo', 'meta'] as const;

export async function readDemoUids(db: Firestore): Promise<DemoUids | null> {
  const snap = await getDoc(doc(db, ...DEMO_META_PATH));
  if (!snap.exists()) return null;
  return (snap.data().uids as DemoUids) ?? null;
}

async function deleteCollection(db: Firestore, path: string[]) {
  const snap = await getDocs(collection(db, path[0], ...path.slice(1)));
  for (let i = 0; i < snap.docs.length; i += 400) {
    const batch = writeBatch(db);
    snap.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  return snap.size;
}

export async function resetDemoWorld(db: Firestore, uids: DemoUids, onProgress?: (msg: string) => void) {
  let deleted = 0;
  for (const sub of DEMO_CLUB_SUBCOLLECTIONS) {
    deleted += await deleteCollection(db, ['clubs', DEMO_CLUB_ID, sub]);
  }
  for (const uid of Object.values(uids)) {
    deleted += await deleteCollection(db, ['users', uid, 'matchResults']);
  }
  onProgress?.(`Borrados ${deleted} documentos viejos`);

  const docs = buildDemoWorld(uids);
  for (let i = 0; i < docs.length; i += 400) {
    const batch = writeBatch(db);
    docs.slice(i, i + 400).forEach((d) => {
      const parts = d.path.split('/');
      batch.set(doc(db, parts[0], ...parts.slice(1)), { ...d.data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    });
    await batch.commit();
  }
  await writeBatchMeta(db, uids);
  onProgress?.(`Cargados ${docs.length} documentos`);
  return { deleted, written: docs.length };
}

async function writeBatchMeta(db: Firestore, uids: DemoUids) {
  const batch = writeBatch(db);
  batch.set(doc(db, ...DEMO_META_PATH), { uids, clubId: DEMO_CLUB_ID, resetAt: serverTimestamp() });
  await batch.commit();
}
