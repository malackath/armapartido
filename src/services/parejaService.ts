// Pareja fija sin torneo (20/11/2026). Se lee de Firestore y se escribe solo por el servidor.
import { collection, onSnapshot, query, where, type Unsubscribe } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../lib/firebase';
import type { FixedPair, Modality } from '../types/padel';
import { UserFacingError } from './firestoreService';

export function subscribeMyPairs(clubId: string, uid: string, onData: (pairs: FixedPair[]) => void): Unsubscribe {
  const q = query(collection(db, 'clubs', clubId, 'fixedPairs'), where('uids', 'array-contains', uid));
  return onSnapshot(
    q,
    (snap) => onData(snap.docs.map((d) => d.data() as FixedPair).filter((p) => p.status !== 'ended')),
    () => onData([])
  );
}

const call = async <T,>(name: string, data: Record<string, unknown>): Promise<T> => {
  try {
    return (await httpsCallable<Record<string, unknown>, T>(functions, name)(data)).data;
  } catch (err) {
    const code = (err as { code?: string })?.code ?? '';
    if (code && code !== 'functions/internal' && code !== 'functions/unavailable') {
      throw new UserFacingError((err as Error).message.replace(/\s*\[\d+\]$/, ''));
    }
    throw new UserFacingError('No pudimos conectarnos. Probá de nuevo en un rato.');
  }
};

export const invitarPareja = (clubId: string, partnerUid: string) => call<{ pair: FixedPair }>('parejaInvitar', { clubId, partnerUid });
export const responderPareja = (clubId: string, pairId: string, accept: boolean) => call<{ pair: FixedPair }>('parejaResponder', { clubId, pairId, accept });
export const guardarPareja = (clubId: string, pairId: string, changes: { cells?: string[]; searching?: boolean; perWeek?: 0 | 1 | 2; modality?: Modality }) =>
  call<{ pair: FixedPair }>('parejaGuardar', { clubId, pairId, ...changes });
export const terminarPareja = (clubId: string, pairId: string) => call<{ ok: true }>('parejaTerminar', { clubId, pairId });
