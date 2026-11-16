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

async function listPaths(db: Firestore, path: string[]) {
  const snap = await getDocs(collection(db, path[0], ...path.slice(1)));
  return snap.docs.map((d) => d.ref.path);
}

/**
 * Vuelve a cargar el club de demo. Primero escribe el mundo nuevo encima (los ids son fijos) y
 * después borra lo que sobra, así quien está mirando nunca ve el club vacío.
 */
export async function resetDemoWorld(db: Firestore, uids: DemoUids, onProgress?: (msg: string) => void) {
  const existing: string[] = [];
  for (const sub of DEMO_CLUB_SUBCOLLECTIONS) existing.push(...(await listPaths(db, ['clubs', DEMO_CLUB_ID, sub])));
  for (const uid of Object.values(uids)) existing.push(...(await listPaths(db, ['users', uid, 'matchResults'])));

  const docs = buildDemoWorld(uids);
  for (let i = 0; i < docs.length; i += 400) {
    const batch = writeBatch(db);
    docs.slice(i, i + 400).forEach((d) => {
      const parts = d.path.split('/');
      batch.set(doc(db, parts[0], ...parts.slice(1)), { createdAt: serverTimestamp(), ...d.data, updatedAt: serverTimestamp() });
    });
    await batch.commit();
  }
  onProgress?.(`Cargados ${docs.length} documentos`);

  const keep = new Set(docs.map((d) => d.path));
  const stale = existing.filter((p) => !keep.has(p));
  for (let i = 0; i < stale.length; i += 400) {
    const batch = writeBatch(db);
    stale.slice(i, i + 400).forEach((p) => {
      const parts = p.split('/');
      batch.delete(doc(db, parts[0], ...parts.slice(1)));
    });
    await batch.commit();
  }
  onProgress?.(`Borrados ${stale.length} documentos viejos`);
  await writeBatchMeta(db, uids);
  return { deleted: stale.length, written: docs.length };
}

/** Horas que la demo se considera "en hora": después, al entrar, se vuelve a armar el día. */
const FRESH_HOURS = 2;

/**
 * Al entrar a la demo: si los datos se armaron hace más de 2 horas (o en otro día), se rearma el
 * club alrededor de la hora actual, para que el Mostrador siempre muestre canchas en juego.
 * Un candado de 3 minutos evita que dos visitas lo hagan a la vez.
 */
export async function refreshDemoIfStale(db: Firestore): Promise<boolean> {
  const snap = await getDoc(doc(db, ...DEMO_META_PATH));
  if (!snap.exists()) return false;
  const meta = snap.data() as { uids?: DemoUids; resetAt?: { toDate?: () => Date }; refreshingAt?: { toDate?: () => Date } };
  if (!meta.uids) return false;
  const now = Date.now();
  const last = meta.resetAt?.toDate?.();
  const sameDay = last && last.toDateString() === new Date(now).toDateString();
  if (last && sameDay && now - last.getTime() < FRESH_HOURS * 3600 * 1000) return false;
  const lock = meta.refreshingAt?.toDate?.();
  if (lock && now - lock.getTime() < 3 * 60 * 1000) return false;
  const batch = writeBatch(db);
  batch.set(doc(db, ...DEMO_META_PATH), { refreshingAt: serverTimestamp() }, { merge: true });
  await batch.commit();
  await resetDemoWorld(db, meta.uids);
  return true;
}

async function writeBatchMeta(db: Firestore, uids: DemoUids) {
  const batch = writeBatch(db);
  batch.set(doc(db, ...DEMO_META_PATH), { uids, clubId: DEMO_CLUB_ID, resetAt: serverTimestamp() });
  await batch.commit();
}
