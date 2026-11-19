/**
 * Google Wallet: pase "genérico" (GenericObject) para la cuponera.
 *
 * Cómo funciona (docs de Google Wallet, verificado 19/11/2026):
 * - Una clase por club (`<emisor>.ap_<club>`) y un objeto por cuponera (`<emisor>.ap_<club>_<cuponera>`).
 * - El servidor crea o pone al día el objeto por la API y devuelve el link "Agregar a Google Wallet"
 *   (https://pay.google.com/gp/v/save/<JWT firmado con la cuenta de servicio>).
 * - Cuando el Mostrador descuenta, se cambia el objeto (PATCH) y se agrega un mensaje TEXT_AND_NOTIFY
 *   (aviso en el celular). Google permite 3 avisos por pase cada 24 h; pasado eso, el mensaje va sin aviso.
 *
 * Claves (Secret Manager, nunca en el código): GOOGLE_WALLET_SA_KEY (JSON de la cuenta de servicio)
 * y GOOGLE_WALLET_ISSUER_ID (número del emisor). Sin ellas, la billetera de Google queda "Muy pronto".
 */
import { createSign } from 'node:crypto';
import type { Pase } from './pase';

export interface CuentaServicio {
  client_email: string;
  private_key: string;
}

export interface ConfigGoogle {
  issuerId: string;
  cuenta: CuentaServicio;
  /** Dominios desde los que se abre el botón (para el JWT). */
  origenes: string[];
}

type Fetch = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{ ok: boolean; status: number; json(): Promise<any>; text(): Promise<string> }>;

const API = 'https://walletobjects.googleapis.com/walletobjects/v1';
const SCOPE = 'https://www.googleapis.com/auth/wallet_object.issuer';
const LANG = 'es-419';

const b64url = (v: Buffer | string) => Buffer.from(v).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

export function firmarJwt(payload: Record<string, unknown>, privateKey: string): string {
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  const s = createSign('RSA-SHA256');
  s.update(`${head}.${body}`);
  return `${head}.${body}.${b64url(s.sign(privateKey))}`;
}

/** Ids válidos para Google: solo letras, números, punto, guion y guion bajo. */
const limpio = (v: string) => v.replace(/[^a-zA-Z0-9._-]/g, '_');
export const idClase = (issuerId: string, clubId: string) => `${issuerId}.${limpio(`ap_${clubId}`)}`;
export const idObjeto = (issuerId: string, clubId: string, packId: string) => `${issuerId}.${limpio(`ap_${clubId}_${packId}`)}`;

const txt = (value: string) => ({ defaultValue: { language: LANG, value } });

export function claseGoogle(issuerId: string, pase: Pase) {
  return {
    id: idClase(issuerId, pase.clubId),
    // Orden de los datos en la tarjeta: fila 1 Quedan | Vence, fila 2 Titular | Sirve.
    classTemplateInfo: {
      cardTemplateOverride: {
        cardRowTemplateInfos: [
          { twoItems: { startItem: campo('quedan'), endItem: campo('vence') } },
          { twoItems: { startItem: campo('titular'), endItem: campo('sirve') } },
        ],
      },
    },
  };
}

function campo(id: string) {
  return { firstValue: { fields: [{ fieldPath: `object.textModulesData['${id}']` }] } };
}

const ESTADO: Record<Pase['estado'], string> = { activa: 'ACTIVE', agotada: 'COMPLETED', vencida: 'EXPIRED', anulada: 'INACTIVE' };

export function objetoGoogle(issuerId: string, pase: Pase, packId: string) {
  const o: Record<string, unknown> = {
    id: idObjeto(issuerId, pase.clubId, packId),
    classId: idClase(issuerId, pase.clubId),
    state: ESTADO[pase.estado],
    cardTitle: txt(pase.clubNombre),
    header: txt(pase.cuponera),
    subheader: txt(pase.estado === 'activa' ? 'Cuponera' : pase.estado === 'agotada' ? 'Sin usos' : pase.estado === 'vencida' ? 'Vencida' : 'Anulada'),
    hexBackgroundColor: pase.colores.fondo,
    logo: { sourceUri: { uri: pase.logo }, contentDescription: txt(`Logo de ${pase.clubNombre}`) },
    textModulesData: [
      { id: 'quedan', header: 'Quedan', body: `${pase.quedan} de ${pase.total}` },
      { id: 'vence', header: 'Vence', body: pase.vence || '-' },
      { id: 'titular', header: 'Titular', body: pase.titular },
      { id: 'sirve', header: 'Sirve', body: pase.sirve },
    ],
    linksModuleData: { uris: [{ uri: pase.linkApp, description: 'Ver en la app', id: 'app' }] },
  };
  if (pase.qr) o.barcode = { type: 'QR_CODE', value: pase.qr, alternateText: 'Mostralo en el mostrador' };
  if (pase.portada) o.heroImage = { sourceUri: { uri: pase.portada }, contentDescription: txt(pase.clubNombre) };
  if (pase.venceISO) o.validTimeInterval = { end: { date: `${pase.venceISO}T23:59:59-03:00` } };
  return o;
}

/** Link "Agregar a Google Wallet". El objeto ya existe (lo crea `ponerAlDia`), así el link queda corto. */
export function linkGuardar(cfg: ConfigGoogle, objectId: string, ahoraSeg = Math.floor(Date.now() / 1000)): string {
  const jwt = firmarJwt(
    { iss: cfg.cuenta.client_email, aud: 'google', typ: 'savetowallet', iat: ahoraSeg, origins: cfg.origenes, payload: { genericObjects: [{ id: objectId }] } },
    cfg.cuenta.private_key
  );
  return `https://pay.google.com/gp/v/save/${jwt}`;
}

/** Cliente de la API con token de la cuenta de servicio. `f` se cambia en las pruebas. */
export class GoogleWallet {
  private token: { v: string; vence: number } | null = null;
  constructor(readonly cfg: ConfigGoogle, private f: Fetch = fetch as unknown as Fetch) {}

  private async auth(): Promise<string> {
    const ahora = Math.floor(Date.now() / 1000);
    if (this.token && this.token.vence > ahora + 60) return this.token.v;
    const assertion = firmarJwt({ iss: this.cfg.cuenta.client_email, scope: SCOPE, aud: 'https://oauth2.googleapis.com/token', iat: ahora, exp: ahora + 3600 }, this.cfg.cuenta.private_key);
    const r = await this.f('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${assertion}`,
    });
    if (!r.ok) throw new Error(`Google Wallet: no se pudo entrar (${r.status})`);
    const j = await r.json();
    this.token = { v: j.access_token, vence: ahora + (Number(j.expires_in) || 3600) };
    return this.token.v;
  }

  private async pedir(method: string, ruta: string, body?: unknown) {
    const r = await this.f(`${API}${ruta}`, {
      method,
      headers: { Authorization: `Bearer ${await this.auth()}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return r;
  }

  /** Crea o pone al día la clase del club y el objeto de la cuponera. */
  async ponerAlDia(pase: Pase, packId: string): Promise<string> {
    const cls = claseGoogle(this.cfg.issuerId, pase);
    let r = await this.pedir('PUT', `/genericClass/${encodeURIComponent(cls.id)}`, cls);
    if (r.status === 404) r = await this.pedir('POST', '/genericClass', cls);
    if (!r.ok) throw new Error(`Google Wallet clase: ${r.status} ${await r.text()}`);
    const obj = objetoGoogle(this.cfg.issuerId, pase, packId);
    const id = String(obj.id);
    // PATCH y no PUT: así no se borran los mensajes que ya tiene el pase.
    r = await this.pedir('PATCH', `/genericObject/${encodeURIComponent(id)}`, obj);
    if (r.status === 404) r = await this.pedir('POST', '/genericObject', obj);
    if (!r.ok) throw new Error(`Google Wallet objeto: ${r.status} ${await r.text()}`);
    return id;
  }

  /** Mensaje en el pase. avisar = notificación en el celular (máx. 3 cada 24 h por pase). */
  async mensaje(objectId: string, texto: string, avisar: boolean, ahora = new Date()): Promise<'avisado' | 'sin_aviso'> {
    const msg = (tipo: string) => ({
      message: { id: `m_${ahora.getTime()}`, header: 'Cuponera', body: texto, messageType: tipo, displayInterval: { start: { date: ahora.toISOString() } } },
    });
    if (avisar) {
      const r = await this.pedir('POST', `/genericObject/${encodeURIComponent(objectId)}/addMessage`, msg('TEXT_AND_NOTIFY'));
      if (r.ok) return 'avisado';
      const t = await r.text();
      if (!/QuotaExceeded/i.test(t) && r.status !== 429) throw new Error(`Google Wallet mensaje: ${r.status} ${t}`);
    }
    const r2 = await this.pedir('POST', `/genericObject/${encodeURIComponent(objectId)}/addMessage`, msg('TEXT'));
    if (!r2.ok) throw new Error(`Google Wallet mensaje: ${r2.status} ${await r2.text()}`);
    return 'sin_aviso';
  }
}

/** Lee la configuración de los secretos. null = Google Wallet todavía no está prendida. */
export function configGoogle(saKey: string | undefined, issuerId: string | undefined, origenes: string[]): ConfigGoogle | null {
  if (!saKey || !issuerId || !/^\d{5,25}$/.test(issuerId.trim())) return null;
  try {
    const c = JSON.parse(saKey);
    if (!c.client_email || !c.private_key) return null;
    return { issuerId: issuerId.trim(), cuenta: { client_email: c.client_email, private_key: c.private_key }, origenes };
  } catch {
    return null;
  }
}
