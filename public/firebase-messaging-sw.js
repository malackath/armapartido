/* eslint-disable no-undef */
// Service Worker dedicated to Firebase Cloud Messaging (Web Push) for Armá Partido.
// Runs under its own scope (/firebase-cloud-messaging-push-scope) alongside the PWA Workbox SW.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload = {};
  try {
    payload = event.data.json();
  } catch {
    payload = {
      notification: {
        title: 'Armá Partido',
        body: event.data.text(),
      },
    };
  }

  const notificationData = payload.notification || {};
  const data = payload.data || {};
  const title = notificationData.title || data.title || 'Armá Partido';
  const body =
    notificationData.body ||
    data.body ||
    'Tenés una nueva actualización de partido o invitación.';
  const icon = notificationData.icon || '/pwa-192x192.png';
  const badge = notificationData.badge || '/pwa-192x192.png';
  const tag = data.tag || data.eventType || 'armapartido-push';

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      badge,
      tag,
      data: {
        url: data.url || (data.tab ? `/?tab=${encodeURIComponent(data.tab)}${data.clubId ? `&clubId=${encodeURIComponent(data.clubId)}` : ''}` : '/'),
        clubId: data.clubId || '',
        eventType: data.eventType || '',
        tab: data.tab || 'notifications',
      },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          if ('navigate' in client && typeof client.navigate === 'function') {
            return client.navigate(targetUrl).catch(() => client);
          }
          return client;
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    })
  );
});
