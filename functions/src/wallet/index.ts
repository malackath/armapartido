/**
 * Callable y disparador de la cuponera en la billetera.
 * - `cuponeraPase`: le da al jugador (o al encargado) el código QR de la cuponera y los links de las billeteras prendidas.
 * - `cuponeraBilleteraAlCambiar`: cuando cambia el saldo, el vencimiento o el estado, pone al día los pases guardados y avisa.
 *
 * Cada billetera se prende con una variable en functions/.env (GOOGLE_WALLET=1, APPLE_WALLET=1) y sus claves en
 * Secret Manager. Apagadas, la app muestra "Muy pronto" y nada se rompe al publicar.
 */
import { logger } from 'firebase-functions';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import type { Club } from '../../../src/types/padel';
import { db } from '../admin';
import { armarPase, avisoCambio, nuevoCodigoQr, type PackParaPase } from './pase';
import { configGoogle, GoogleWallet, idObjeto, linkGuardar } from './google';
import { appleActiva, appleListaParaPase, configApple, linkApple, prenderApple } from './apple';
import { avisarIphones } from './appleServicio';
import { getTodayISO } from '../../../src/lib/padelUtils';

export const GOOGLE_ON = process.env.GOOGLE_WALLET === '1';
export const APPLE_ON = process.env.APPLE_WALLET === '1';
export const GOOGLE_WALLET_SA_KEY = defineSecret('GOOGLE_WALLET_SA_KEY');
export const GOOGLE_WALLET_ISSUER_ID = defineSecret('GOOGLE_WALLET_ISSUER_ID');
export const APPLE_PASS_CERT = defineSecret('APPLE_PASS_CERT');
export const APPLE_WWDR = defineSecret('APPLE_WWDR');
export const SECRETOS_BILLETERA = [...(GOOGLE_ON ? [GOOGLE_WALLET_SA_KEY, GOOGLE_WALLET_ISSUER_ID] : []), ...(APPLE_ON ? [APPLE_PASS_CERT, APPLE_WWDR] : [])];

/** Apple se arma con los secretos la primera vez que hace falta. */
export function asegurarApple() {
  if (APPLE_ON && !appleActiva()) prenderApple(configApple(process.env, APPLE_PASS_CERT.value(), APPLE_WWDR.value()));
}

/** Dominio público de la app (links del pase e imágenes genéricas). */
export const appUrl = () => (process.env.APP_URL || 'https://demo.armapartido.com').replace(/\/$/, '');

function google(): GoogleWallet | null {
  if (!GOOGLE_ON) return null;
  const cfg = configGoogle(GOOGLE_WALLET_SA_KEY.value(), GOOGLE_WALLET_ISSUER_ID.value(), [appUrl(), 'https://armapartido.com']);
  return cfg ? new GoogleWallet(cfg) : null;
}

const ID = /^[a-zA-Z0-9_-]{1,128}$/;

async function puedeVer(req: CallableRequest, club: Club, pack: PackParaPase): Promise<boolean> {
  const uid = req.auth?.uid;
  if (!uid) return false;
  if (pack.uid && pack.uid === uid) return true;
  if (club.ownerUid === uid) return true;
  const m = await db.doc(`clubs/${club.id}/memberships/${uid}`).get();
  return m.exists && ['admin', 'staff'].includes(String(m.data()?.role));
}

export interface RespuestaPase {
  qr: string;
  conMarca: boolean;
  google: { disponible: boolean; url?: string };
  apple: { disponible: boolean; url?: string };
}

/** `billetera` = 'google' | 'apple' pide además el link de esa billetera (crea el pase). Sin billetera: solo el QR. */
export async function cuponeraPase(req: CallableRequest): Promise<RespuestaPase> {
  if (!req.auth?.uid) throw new HttpsError('unauthenticated', 'Tenés que entrar con tu cuenta.');
  const clubId = String(req.data?.clubId || '');
  const packId = String(req.data?.packId || '');
  const billetera = req.data?.billetera;
  if (!ID.test(clubId) || !ID.test(packId)) throw new HttpsError('invalid-argument', 'Cuponera inválida.');
  const [cs, ps] = await Promise.all([db.doc(`clubs/${clubId}`).get(), db.doc(`clubs/${clubId}/clientPacks/${packId}`).get()]);
  if (!cs.exists || !ps.exists) throw new HttpsError('not-found', 'No encontramos la cuponera.');
  const club = cs.data() as Club;
  let pack = ps.data() as PackParaPase;
  if (!(await puedeVer(req, club, pack))) throw new HttpsError('permission-denied', 'Esta cuponera no es tuya.');

  if (!pack.qr) {
    const qr = nuevoCodigoQr(clubId);
    // Transacción: si dos pedidos llegan juntos, queda un solo código.
    pack = await db.runTransaction(async (t) => {
      const s = await t.get(ps.ref);
      const p = s.data() as PackParaPase;
      if (p.qr) return p;
      t.update(ps.ref, { qr });
      return { ...p, qr };
    });
  }

  asegurarApple();
  const pase = armarPase(club, pack, getTodayISO(), appUrl());
  const g = google();
  const res: RespuestaPase = {
    qr: pack.qr!,
    conMarca: pase.conMarca,
    google: { disponible: !!g },
    apple: { disponible: APPLE_ON && appleListaParaPase() },
  };
  if (billetera === 'google') {
    if (!g) throw new HttpsError('failed-precondition', 'La Billetera de Google llega muy pronto.');
    const objectId = await g.ponerAlDia(pase, pack.id);
    await ps.ref.set({ wallet: { google: { objectId, desde: new Date().toISOString() } } }, { merge: true });
    res.google.url = linkGuardar(g.cfg, objectId);
  }
  if (billetera === 'apple') {
    if (!res.apple.disponible) throw new HttpsError('failed-precondition', 'Apple Wallet llega muy pronto.');
    res.apple.url = linkApple(appUrl(), clubId, pack.id, pack.qr!);
  }
  return res;
}

type ConWallet = PackParaPase & { wallet?: { google?: { objectId?: string; avisos?: { dia: string; n: number } } } };

/** Disparador: el saldo cambió → poner al día los pases guardados. */
export async function alCambiarCuponera(clubId: string, antes: ConWallet, despues: ConWallet, deps: { g?: GoogleWallet | null; apple?: (clubId: string, packId: string) => Promise<void> } = {}) {
  const cambio = antes.usesLeft !== despues.usesLeft || antes.status !== despues.status || antes.expiresOn !== despues.expiresOn || antes.clientName !== despues.clientName;
  if (!cambio) return { hecho: 'nada' as const };
  const club = (await db.doc(`clubs/${clubId}`).get()).data() as Club | undefined;
  if (!club) return { hecho: 'nada' as const };
  const hoy = getTodayISO();
  const pase = armarPase(club, despues, hoy, appUrl());
  const texto = avisoCambio(antes, despues);
  const out: { google?: string; apple?: string } = {};

  const g = deps.g === undefined ? google() : deps.g;
  const objectId = despues.wallet?.google?.objectId;
  if (g && objectId) {
    try {
      await g.ponerAlDia(pase, despues.id);
      if (texto) {
        const prev = despues.wallet?.google?.avisos;
        const n = prev && prev.dia === hoy ? prev.n : 0;
        // Tope de Google: 3 avisos por pase cada 24 h. Nos quedamos en 3 por día de Montevideo.
        const r = await g.mensaje(objectId, texto, n < 3);
        if (r === 'avisado') await db.doc(`clubs/${clubId}/clientPacks/${despues.id}`).set({ wallet: { google: { avisos: { dia: hoy, n: n + 1 } } } }, { merge: true });
        out.google = r;
      } else out.google = 'al_dia';
    } catch (e) {
      logger.error('Google Wallet: no se pudo poner al día', { clubId, packId: despues.id, e: String(e) });
      out.google = 'error';
    }
  }
  asegurarApple();
  const apple = deps.apple ?? (appleActiva() ? avisarIphones : undefined);
  if (apple) {
    try {
      await apple(clubId, despues.id);
      out.apple = 'avisado';
    } catch (e) {
      logger.error('Apple Wallet: no se pudo avisar', { clubId, packId: despues.id, e: String(e) });
      out.apple = 'error';
    }
  }
  return { hecho: 'al_dia' as const, ...out };
}

export { idObjeto };
