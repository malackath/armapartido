import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

if (getApps().length === 0) initializeApp();

export const db = getFirestore();
export const messaging = () => getMessaging();
export const now = () => FieldValue.serverTimestamp();

export function makeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

/** Jugadores ficticios de la demo (sin cuenta): no reciben push. */
export function isFakePlayer(uid: string): boolean {
  return !uid || uid.startsWith('demo_') || uid.startsWith('demo-');
}
