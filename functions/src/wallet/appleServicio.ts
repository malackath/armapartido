/**
 * Web service de Apple Wallet (protocolo de PassKit). Solo se exporta con APPLE_WALLET=1.
 * Registros de iPhones en la colección `walletApple` (solo servidor).
 */
import { logger } from 'firebase-functions';
import type { Request } from 'firebase-functions/v2/https';
import type { Response } from 'express';
import type { Club } from '../../../src/types/padel';
import { getTodayISO } from '../../../src/lib/padelUtils';
import { db } from '../admin';
import { armarPase, type PackParaPase } from './pase';
import { appleActiva, armarPkpass, avisarIphone, tokenValido, type ConfigApple } from './apple';

const SERIAL = /^([a-zA-Z0-9_-]{1,128})\.([a-zA-Z0-9_-]{1,128})$/;
const regId = (dev: string, serial: string) => `${dev}_${serial}`.replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 400);

async function bajar(url?: string): Promise<Buffer | undefined> {
  if (!url) return undefined;
  try {
    const r = await fetch(url);
    if (!r.ok) return undefined;
    return Buffer.from(await r.arrayBuffer());
  } catch {
    return undefined;
  }
}

async function pkpassDe(cfg: ConfigApple, serial: string, appUrl: string) {
  const m = SERIAL.exec(serial);
  if (!m) return null;
  const [, clubId, packId] = m;
  const [cs, ps] = await Promise.all([db.doc(`clubs/${clubId}`).get(), db.doc(`clubs/${clubId}/clientPacks/${packId}`).get()]);
  if (!cs.exists || !ps.exists) return null;
  const pack = ps.data() as PackParaPase & { wallet?: { apple?: { actualizado?: number } } };
  const pase = armarPase(cs.data() as Club, pack, getTodayISO(), appUrl);
  const img: Record<string, Buffer> = {};
  const icono = await bajar(`${appUrl}/wallet/icono.png`);
  if (icono) img['icon.png'] = icono;
  const logo = await bajar(pase.logo);
  if (logo) img['logo.png'] = logo;
  const strip = await bajar(pase.portada);
  if (strip) img['strip.png'] = strip;
  return { buf: armarPkpass(cfg, pase, img), actualizado: pack.wallet?.apple?.actualizado || 0 };
}

export function servicioApple(appUrl: string) {
  return async (req: Request, res: Response) => {
    const cfg = appleActiva();
    if (!cfg) return void res.status(503).send('Apple Wallet todavía no está prendida.');
    const p = req.path.split('/').filter(Boolean).map(decodeURIComponent);
    const auth = String(req.get('Authorization') || '').replace(/^ApplePass\s+/i, '');
    try {
      // Descarga desde la app: /descargar/<serial>?t=<token>
      if (req.method === 'GET' && p[0] === 'descargar' && p[1]) {
        if (!tokenValido(cfg, p[1], String(req.query.t || ''))) return void res.status(401).end();
        const r = await pkpassDe(cfg, p[1], appUrl);
        if (!r) return void res.status(404).end();
        res.set('Content-Type', 'application/vnd.apple.pkpass').set('Content-Disposition', 'attachment; filename="cuponera.pkpass"');
        return void res.status(200).send(r.buf);
      }
      if (p[0] !== 'v1') return void res.status(404).end();
      if (req.method === 'POST' && p[1] === 'log') {
        logger.info('Apple Wallet log', { logs: req.body?.logs });
        return void res.status(200).end();
      }
      // /v1/devices/<dev>/registrations/<passType>[/<serial>]
      if (p[1] === 'devices' && p[3] === 'registrations' && p[4] === cfg.passTypeId) {
        const dev = p[2];
        const serial = p[5];
        if (serial) {
          if (!tokenValido(cfg, serial, auth)) return void res.status(401).end();
          const ref = db.doc(`walletApple/${regId(dev, serial)}`);
          if (req.method === 'POST') {
            const ya = (await ref.get()).exists;
            await ref.set({ dev, serial, pushToken: String(req.body?.pushToken || ''), creado: Date.now() }, { merge: true });
            return void res.status(ya ? 200 : 201).end();
          }
          if (req.method === 'DELETE') {
            await ref.delete();
            return void res.status(200).end();
          }
        } else if (req.method === 'GET') {
          const desde = Number(req.query.passesUpdatedSince || 0);
          const regs = await db.collection('walletApple').where('dev', '==', dev).get();
          const cambiados: string[] = [];
          let ultimo = desde;
          for (const r of regs.docs) {
            const m = SERIAL.exec(String(r.data().serial));
            if (!m) continue;
            const pk = await db.doc(`clubs/${m[1]}/clientPacks/${m[2]}`).get();
            const t = Number(pk.data()?.wallet?.apple?.actualizado || 0);
            if (t > desde) cambiados.push(r.data().serial);
            ultimo = Math.max(ultimo, t);
          }
          if (!cambiados.length) return void res.status(204).end();
          return void res.status(200).json({ serialNumbers: cambiados, lastUpdated: String(ultimo) });
        }
      }
      // /v1/passes/<passType>/<serial>
      if (req.method === 'GET' && p[1] === 'passes' && p[2] === cfg.passTypeId && p[3]) {
        if (!tokenValido(cfg, p[3], auth)) return void res.status(401).end();
        const r = await pkpassDe(cfg, p[3], appUrl);
        if (!r) return void res.status(404).end();
        res.set('Content-Type', 'application/vnd.apple.pkpass').set('Last-Modified', new Date(r.actualizado || Date.now()).toUTCString());
        return void res.status(200).send(r.buf);
      }
      return void res.status(404).end();
    } catch (e) {
      logger.error('Apple Wallet', { e: String(e) });
      return void res.status(500).end();
    }
  };
}

/** Marca el pase como cambiado y avisa a cada iPhone que lo tiene guardado. */
export async function avisarIphones(clubId: string, packId: string) {
  const cfg = appleActiva();
  if (!cfg) return;
  const serial = `${clubId}.${packId}`;
  await db.doc(`clubs/${clubId}/clientPacks/${packId}`).set({ wallet: { apple: { actualizado: Date.now() } } }, { merge: true });
  const regs = await db.collection('walletApple').where('serial', '==', serial).get();
  await Promise.all(
    regs.docs.map(async (r) => {
      const tok = String(r.data().pushToken || '');
      if (!tok) return;
      try {
        const st = await avisarIphone(cfg, tok);
        if (st === 410) await r.ref.delete(); // el iPhone ya no tiene el pase
      } catch (e) {
        logger.warn('APNs', { e: String(e) });
      }
    })
  );
}
