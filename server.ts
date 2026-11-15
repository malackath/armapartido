import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applicationDefault, cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);

interface FirebaseConfigJson {
  projectId: string;
  firestoreDatabaseId?: string;
}

function loadFirebaseConfig(): FirebaseConfigJson {
  const raw = fs.readFileSync(path.resolve(__dirname, 'firebase-applet-config.json'), 'utf8');
  return JSON.parse(raw) as FirebaseConfigJson;
}

const fbConfig = loadFirebaseConfig();

let adminApp: App | null = null;
let hasServerCredentials = false;

function initFirebaseAdmin() {
  if (getApps().length > 0) {
    adminApp = getApps()[0] ?? null;
    return;
  }

  const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (serviceAccountRaw) {
    try {
      const parsed = JSON.parse(serviceAccountRaw);
      adminApp = initializeApp({
        credential: cert(parsed),
        projectId: fbConfig.projectId,
      });
      hasServerCredentials = true;
      return;
    } catch (err) {
      console.warn('[FCM] Invalid FIREBASE_SERVICE_ACCOUNT_JSON:', err instanceof Error ? err.message : err);
    }
  }

  try {
    adminApp = initializeApp({
      credential: applicationDefault(),
      projectId: fbConfig.projectId,
    });
    hasServerCredentials = Boolean(
      process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.K_SERVICE
    );
  } catch {
    adminApp = initializeApp({ projectId: fbConfig.projectId });
    hasServerCredentials = false;
  }
}

initFirebaseAdmin();

interface SendFcmRequestBody {
  recipientUids?: string[];
  clubId?: string;
  eventType?: string;
  title?: string;
  body?: string;
  tab?: string;
}

const EVENT_TAB_MAP: Record<string, string> = {
  match_confirmed: 'matchmaking',
  match_proposed: 'matchmaking',
  match_unfilled_1h: 'matchmaking',
  match_expired: 'matchmaking',
  pair_invite: 'matchmaking',
  booking_confirmed: 'bookings',
  booking_cancelled: 'bookings',
  reminder_2h: 'bookings',
  waitlist_slot_open: 'bookings',
  tournament_new: 'tournaments',
  tournament_next_match: 'tournaments',
};

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '64kb' }));

  // Serve firebase-messaging-sw.js cleanly with Service-Worker-Allowed header
  app.get('/firebase-messaging-sw.js', (_req, res, next) => {
    res.setHeader('Service-Worker-Allowed', '/');
    res.setHeader('Cache-Control', 'no-cache');
    next();
  });

  app.post('/api/fcm/send', async (req, res) => {
    try {
      const authHeader = req.headers.authorization || '';
      const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
      if (!idToken) {
        res.status(401).json({ ok: false, error: 'Missing Authorization Bearer token' });
        return;
      }

      if (!adminApp) {
        res.json({ ok: true, sent: 0, configured: false, reason: 'admin_not_initialized' });
        return;
      }

      // Verify caller Firebase Auth token
      try {
        await getAuth(adminApp).verifyIdToken(idToken);
      } catch {
        res.status(401).json({ ok: false, error: 'Invalid Firebase ID token' });
        return;
      }

      const payload = (req.body || {}) as SendFcmRequestBody;
      const recipientUids = Array.isArray(payload.recipientUids)
        ? payload.recipientUids.filter((u) => typeof u === 'string' && /^[a-zA-Z0-9_\-]+$/.test(u)).slice(0, 20)
        : [];
      const title = String(payload.title || 'Armá Partido').slice(0, 120);
      const body = String(payload.body || 'Tenés un nuevo aviso en tu club.').slice(0, 320);
      const clubId = String(payload.clubId || '').slice(0, 128);
      const eventType = String(payload.eventType || 'match_confirmed').slice(0, 64);
      const tab = String(payload.tab || EVENT_TAB_MAP[eventType] || 'notifications').slice(0, 40);

      if (recipientUids.length === 0) {
        res.json({ ok: true, sent: 0, configured: hasServerCredentials });
        return;
      }

      if (!hasServerCredentials) {
        res.json({
          ok: true,
          sent: 0,
          configured: false,
          reason: 'missing_service_account_credentials',
        });
        return;
      }

      const adminDb = fbConfig.firestoreDatabaseId
        ? getFirestore(adminApp, fbConfig.firestoreDatabaseId)
        : getFirestore(adminApp);

      const tokenEntries: { uid: string; docId: string; token: string }[] = [];
      for (const uid of recipientUids) {
        const snap = await adminDb
          .collection('users')
          .doc(uid)
          .collection('fcmTokens')
          .where('enabled', '==', true)
          .get();
        for (const docSnap of snap.docs) {
          const data = docSnap.data();
          if (typeof data.token === 'string' && data.token.length >= 10) {
            tokenEntries.push({ uid, docId: docSnap.id, token: data.token });
          }
        }
      }

      if (tokenEntries.length === 0) {
        res.json({ ok: true, sent: 0, configured: true, reason: 'no_registered_tokens' });
        return;
      }

      const messaging = getMessaging(adminApp);
      const targetLink = `/?tab=${encodeURIComponent(tab)}${clubId ? `&clubId=${encodeURIComponent(clubId)}` : ''}`;

      const batchResponse = await messaging.sendEachForMulticast({
        tokens: tokenEntries.map((t) => t.token),
        notification: {
          title,
          body,
        },
        data: {
          title,
          body,
          eventType,
          clubId,
          tab,
          url: targetLink,
        },
        webpush: {
          notification: {
            title,
            body,
            icon: '/pwa-192x192.png',
            badge: '/pwa-192x192.png',
            tag: `${eventType}_${clubId || 'global'}`,
          },
          fcmOptions: {
            link: targetLink,
          },
        },
      });

      // Prune unregistered/expired tokens cleanly
      const cleanupPromises: Promise<unknown>[] = [];
      batchResponse.responses.forEach((resp, idx) => {
        if (!resp.success && resp.error) {
          const code = resp.error.code;
          if (
            code === 'messaging/registration-token-not-registered' ||
            code === 'messaging/invalid-registration-token'
          ) {
            const entry = tokenEntries[idx];
            if (entry) {
              cleanupPromises.push(
                adminDb
                  .collection('users')
                  .doc(entry.uid)
                  .collection('fcmTokens')
                  .doc(entry.docId)
                  .delete()
                  .catch(() => undefined)
              );
            }
          }
        }
      });
      await Promise.all(cleanupPromises);

      res.json({
        ok: true,
        configured: true,
        sent: batchResponse.successCount,
        failed: batchResponse.failureCount,
      });
    } catch (err) {
      console.error('[FCM] Dispatch error:', err);
      res.status(200).json({
        ok: false,
        sent: 0,
        configured: hasServerCredentials,
        reason: err instanceof Error ? err.message : 'fcm_dispatch_failed',
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Armá Partido server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
