/** Sumarse a un club con "Solo mis jugadores" y pedidos para sumarse (17/11/2026). */
import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../lib/firebase';
import type { JoinPolicy, JoinRequest } from '../types/padel';

export type JoinStatus = 'adentro' | 'encontrado' | 'pendiente' | 'rechazado';
export interface JoinAnswer {
  status: JoinStatus;
  fixed?: string;
}

/** Lo resuelve el servidor: valida el mail contra Clientes y, si no está, deja el pedido. */
export async function askToJoin(clubId: string): Promise<JoinAnswer> {
  const r = await httpsCallable<{ clubId: string }, JoinAnswer>(functions, 'clubSumarme')({ clubId });
  return r.data;
}

export async function resolveJoinRequest(clubId: string, uid: string, action: 'aprobar' | 'unir' | 'rechazar'): Promise<string> {
  const r = await httpsCallable<Record<string, string>, { status: string }>(functions, 'clubPedidoResolver')({ clubId, uid, action });
  return r.data.status;
}

export async function setJoinPolicy(clubId: string, joinPolicy: JoinPolicy): Promise<void> {
  await updateDoc(doc(db, 'clubs', clubId), { joinPolicy, updatedAt: serverTimestamp() });
}

/** Pedidos pendientes del club (dueño, administrador y encargado). */
export function useJoinRequests(clubId: string | undefined, enabled: boolean): JoinRequest[] {
  const [list, setList] = useState<JoinRequest[]>([]);
  useEffect(() => {
    if (!clubId || !enabled) {
      setList([]);
      return;
    }
    return onSnapshot(
      query(collection(db, 'clubs', clubId, 'joinRequests'), where('status', '==', 'pendiente')),
      (s) => setList(s.docs.map((d) => d.data() as JoinRequest)),
      () => setList([])
    );
  }, [clubId, enabled]);
  return list;
}

/** El pedido propio del jugador en ese club (para mostrarle "Esperando que el club te confirme"). */
export function useMyJoinRequest(clubId: string | undefined, uid: string | undefined, enabled: boolean): JoinRequest | null {
  const [req, setReq] = useState<JoinRequest | null>(null);
  useEffect(() => {
    if (!clubId || !uid || !enabled) {
      setReq(null);
      return;
    }
    return onSnapshot(
      doc(db, 'clubs', clubId, 'joinRequests', uid),
      (s) => setReq(s.exists() ? (s.data() as JoinRequest) : null),
      () => setReq(null)
    );
  }, [clubId, uid, enabled]);
  return req;
}
