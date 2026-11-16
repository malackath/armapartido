import { logger } from 'firebase-functions';
import type { NotificationEventType } from '../../src/types/padel';
import { db, isFakePlayer, makeId, messaging, now } from './admin';

// Misma matriz de canales que la app (reglas del producto, página 3).
const CHANNELS: Record<NotificationEventType, { push: boolean; email: boolean }> = {
  booking_confirmed: { push: true, email: true },
  booking_cancelled: { push: true, email: true },
  reminder_2h: { push: true, email: false },
  match_proposed: { push: true, email: false },
  match_confirmed: { push: true, email: true },
  match_unfilled_1h: { push: true, email: false },
  match_expired: { push: true, email: false },
  fill_invite: { push: true, email: false },
  fill_update: { push: true, email: false },
  tournament_new: { push: true, email: true },
  pair_invite: { push: true, email: true },
  tournament_next_match: { push: true, email: true },
  waitlist_slot_open: { push: true, email: false },
  category_changed: { push: true, email: false },
};

const TAB_FOR_EVENT: Partial<Record<NotificationEventType, string>> = {
  booking_confirmed: 'bookings',
  booking_cancelled: 'bookings',
  reminder_2h: 'bookings',
  waitlist_slot_open: 'bookings',
  match_proposed: 'matchmaking',
  match_confirmed: 'matchmaking',
  match_unfilled_1h: 'matchmaking',
  match_expired: 'matchmaking',
  fill_invite: 'matchmaking',
  fill_update: 'matchmaking',
  pair_invite: 'matchmaking',
  tournament_new: 'tournaments',
  tournament_next_match: 'tournaments',
  category_changed: 'profile',
};

export interface NotifyParams {
  clubId: string;
  recipientUid: string;
  eventType: NotificationEventType;
  title: string;
  body: string;
  tab?: string;
}

/**
 * Guarda el aviso en la bandeja del jugador y le manda el push a sus dispositivos.
 * El mail todavía no sale (queda marcado como antes, `emailSent`): se suma con Resend en otro paso.
 * Nunca tira error: un aviso que falla no puede romper el armado.
 */
export async function notify(p: NotifyParams): Promise<void> {
  const id = makeId('notif');
  const channels = CHANNELS[p.eventType];
  const title = p.title.slice(0, 120);
  const body = p.body.slice(0, 320);
  const tab = p.tab || TAB_FOR_EVENT[p.eventType] || 'notifications';
  try {
    await db.doc(`clubs/${p.clubId}/notifications/${id}`).set({
      id,
      clubId: p.clubId,
      recipientUid: p.recipientUid,
      eventType: p.eventType,
      title,
      body,
      pushSent: channels.push,
      emailSent: channels.email,
      read: false,
      createdAt: now(),
    });
    if (channels.push && !isFakePlayer(p.recipientUid)) {
      await sendPush(p.recipientUid, { title, body, eventType: p.eventType, clubId: p.clubId, tab, tag: id });
    }
  } catch (err) {
    logger.error('notify failed', { recipient: p.recipientUid, eventType: p.eventType, err: String(err) });
  }
}

async function sendPush(
  uid: string,
  m: { title: string; body: string; eventType: string; clubId: string; tab: string; tag: string }
) {
  const snap = await db.collection(`users/${uid}/fcmTokens`).where('enabled', '==', true).get();
  const tokens = snap.docs
    .map((d) => ({ ref: d.ref, token: d.get('token') as unknown }))
    .filter((t): t is { ref: FirebaseFirestore.DocumentReference; token: string } => typeof t.token === 'string' && t.token.length >= 10);
  if (tokens.length === 0) return;

  const link = `/?tab=${encodeURIComponent(m.tab)}&clubId=${encodeURIComponent(m.clubId)}`;
  const res = await messaging().sendEachForMulticast({
    tokens: tokens.map((t) => t.token),
    data: { title: m.title, body: m.body, eventType: m.eventType, clubId: m.clubId, tab: m.tab, url: link },
    webpush: {
      notification: { title: m.title, body: m.body, icon: '/pwa-192x192.png', badge: '/pwa-192x192.png', tag: m.tag },
      fcmOptions: { link },
    },
  });
  // Borra los dispositivos que ya no existen, igual que hacía server.ts.
  await Promise.all(
    res.responses.map((r, i) => {
      const code = r.error?.code;
      if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') {
        return tokens[i].ref.delete().catch(() => undefined);
      }
      return undefined;
    })
  );
}
