import { getMessaging, getToken, isSupported, onMessage, type MessagePayload } from 'firebase/messaging';
import { app, auth } from './firebase';
import type { NotificationEventType } from '../types/padel';

const FCM_SW_URL = '/firebase-messaging-sw.js';
const FCM_SW_SCOPE = '/firebase-cloud-messaging-push-scope';

export interface FcmRegistrationResult {
  permission: NotificationPermission;
  supported: boolean;
  token: string | null;
  tokenId: string | null;
  deviceLabel: string;
  platform: 'web' | 'android' | 'ios';
  vapidConfigured: boolean;
  errorReason?: string;
}

export function getFcmDeviceInfo(): {
  deviceLabel: string;
  platform: 'web' | 'android' | 'ios';
} {
  if (typeof navigator === 'undefined') {
    return { deviceLabel: 'Navegador Web', platform: 'web' };
  }
  const ua = navigator.userAgent;
  let browser = 'Navegador';
  if (ua.includes('Edg/')) browser = 'Edge';
  else if (ua.includes('Chrome/') && !ua.includes('Edg/')) browser = 'Chrome';
  else if (ua.includes('Firefox/')) browser = 'Firefox';
  else if (ua.includes('Safari/') && !ua.includes('Chrome/')) browser = 'Safari';

  let os = 'Desktop';
  let platform: 'web' | 'android' | 'ios' = 'web';
  if (/iphone|ipad|ipod/i.test(ua)) {
    os = 'iOS';
    platform = 'ios';
  } else if (/android/i.test(ua)) {
    os = 'Android';
    platform = 'android';
  } else if (/mac os/i.test(ua)) {
    os = 'macOS';
  } else if (/windows/i.test(ua)) {
    os = 'Windows';
  } else if (/linux/i.test(ua)) {
    os = 'Linux';
  }

  return {
    deviceLabel: `${browser} · ${os}`.slice(0, 100),
    platform,
  };
}

export function computeFcmTokenId(token: string): string {
  let hash = 5381;
  for (let i = 0; i < token.length; i++) {
    hash = ((hash << 5) + hash + token.charCodeAt(i)) >>> 0;
  }
  const suffix = token.slice(-10).replace(/[^a-zA-Z0-9_-]/g, '');
  return `fcm_${hash.toString(36)}_${suffix || 'web'}`.slice(0, 120);
}

export async function registerFcmServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }
  try {
    return await navigator.serviceWorker.register(FCM_SW_URL, {
      scope: FCM_SW_SCOPE,
    });
  } catch (err) {
    console.warn('[FCM] No se pudo registrar el service worker de mensajería:', err);
    return null;
  }
}

export async function obtainFcmDeviceToken(requestPermissionIfNeeded: boolean): Promise<FcmRegistrationResult> {
  const { deviceLabel, platform } = getFcmDeviceInfo();
  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY?.trim() || '';

  if (typeof window === 'undefined' || !('Notification' in window)) {
    return {
      permission: 'denied',
      supported: false,
      token: null,
      tokenId: null,
      deviceLabel,
      platform,
      vapidConfigured: Boolean(vapidKey),
      errorReason: 'notifications_not_supported',
    };
  }

  let permission: NotificationPermission = Notification.permission;
  if (permission === 'default' && requestPermissionIfNeeded) {
    permission = await Notification.requestPermission();
  }

  if (permission !== 'granted') {
    return {
      permission,
      supported: await isSupported().catch(() => false),
      token: null,
      tokenId: null,
      deviceLabel,
      platform,
      vapidConfigured: Boolean(vapidKey),
    };
  }

  const supported = await isSupported().catch(() => false);
  const swReg = await registerFcmServiceWorker();

  if (!supported || !swReg) {
    return {
      permission,
      supported,
      token: null,
      tokenId: null,
      deviceLabel,
      platform,
      vapidConfigured: Boolean(vapidKey),
      errorReason: !supported ? 'fcm_unsupported_browser' : 'sw_registration_failed',
    };
  }

  try {
    const messaging = getMessaging(app);
    const token = await getToken(messaging, {
      ...(vapidKey ? { vapidKey } : {}),
      serviceWorkerRegistration: swReg,
    });

    if (!token) {
      return {
        permission,
        supported: true,
        token: null,
        tokenId: null,
        deviceLabel,
        platform,
        vapidConfigured: Boolean(vapidKey),
        errorReason: 'empty_fcm_token',
      };
    }

    return {
      permission,
      supported: true,
      token,
      tokenId: computeFcmTokenId(token),
      deviceLabel,
      platform,
      vapidConfigured: Boolean(vapidKey),
    };
  } catch (err) {
    return {
      permission,
      supported: true,
      token: null,
      tokenId: null,
      deviceLabel,
      platform,
      vapidConfigured: Boolean(vapidKey),
      errorReason: err instanceof Error ? err.message : 'get_token_failed',
    };
  }
}

export async function subscribeForegroundFcmMessages(
  onReceive: (payload: { title: string; body: string; eventType?: string; clubId?: string; tab?: string }) => void
): Promise<() => void> {
  const supported = await isSupported().catch(() => false);
  if (!supported) return () => undefined;

  try {
    const messaging = getMessaging(app);
    return onMessage(messaging, (payload: MessagePayload) => {
      const title = payload.notification?.title || payload.data?.title || 'CuatroEnCancha';
      const body =
        payload.notification?.body ||
        payload.data?.body ||
        'Tenés una actualización en tu club.';
      onReceive({
        title,
        body,
        eventType: payload.data?.eventType,
        clubId: payload.data?.clubId,
        tab: payload.data?.tab,
      });
    });
  } catch {
    return () => undefined;
  }
}

export async function showServiceWorkerNotification(params: {
  title: string;
  body: string;
  eventType?: NotificationEventType | string;
  clubId?: string;
  tab?: string;
  tag?: string;
}): Promise<void> {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  const { title, body, eventType = '', clubId = '', tab = 'notifications', tag } = params;
  const targetUrl = `/?tab=${encodeURIComponent(tab)}${clubId ? `&clubId=${encodeURIComponent(clubId)}` : ''}`;

  try {
    const reg = await registerFcmServiceWorker();
    if (reg && 'showNotification' in reg) {
      await reg.showNotification(title, {
        body,
        icon: '/pwa-192x192.png',
        badge: '/pwa-192x192.png',
        tag: tag || `${eventType}_${clubId}`,
        data: { url: targetUrl, clubId, eventType, tab },
      });
      return;
    }
  } catch {
    // Fall back to Window Notification constructor below
  }

  try {
    new Notification(title, {
      body,
      icon: '/pwa-192x192.png',
    });
  } catch {
    // Ignore environments restricting direct Notification constructor
  }
}

export async function sendServerFcmPush(params: {
  recipientUids: string[];
  clubId: string;
  eventType: NotificationEventType;
  title: string;
  body: string;
  tab?: string;
}): Promise<{ ok: boolean; sent: number; configured: boolean }> {
  try {
    const user = auth.currentUser;
    if (!user) return { ok: false, sent: 0, configured: false };
    const idToken = await user.getIdToken();
    const res = await fetch('/api/fcm/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify(params),
    });
    if (!res.ok) return { ok: false, sent: 0, configured: false };
    return (await res.json()) as { ok: boolean; sent: number; configured: boolean };
  } catch {
    return { ok: false, sent: 0, configured: false };
  }
}
