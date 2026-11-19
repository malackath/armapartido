/**
 * Apple Wallet: LISTA Y APAGADA (decisión de Ber 19/11/2026: se prende cuando se venda el primer plan premium
 * y pague la cuenta de desarrollador de Apple, US$99 por año).
 *
 * Qué hace cuando se prende (APPLE_WALLET=1 en functions/.env + secretos):
 * - Arma el archivo .pkpass (pass.json + imágenes + manifest.json + firma PKCS#7 con el certificado "Pass Type ID").
 * - Atiende el "web service" de Apple (registrar el iPhone, devolver el pase nuevo, darse de baja).
 * - Cuando cambia el saldo, avisa a cada iPhone registrado por APNs; el iPhone baja el pase y muestra
 *   "Te quedan 6" en la pantalla bloqueada (changeMessage).
 *
 * Secretos (Secret Manager): APPLE_PASS_CERT (certificado + clave privada en PEM), APPLE_WWDR (certificado
 * intermedio de Apple en PEM). Variables: APPLE_PASS_TYPE_ID, APPLE_TEAM_ID, APPLE_WALLET_URL (dirección
 * pública de la función walletApple).
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { connect } from 'node:http2';
import { crc32 } from 'node:zlib';
import forge from 'node-forge';
import type { Pase } from './pase';

export interface ConfigApple {
  passTypeId: string;
  teamId: string;
  /** Base del web service, ej. https://southamerica-east1-armapartido-demo.cloudfunctions.net/walletApple */
  webServiceUrl: string;
  certPem: string;
  keyPem: string;
  wwdrPem: string;
  /** Para derivar el token de cada pase sin guardarlo. */
  semilla: string;
}

export function configApple(env: NodeJS.ProcessEnv, certYClave?: string, wwdr?: string): ConfigApple | null {
  if (env.APPLE_WALLET !== '1' || !certYClave || !wwdr || !env.APPLE_PASS_TYPE_ID || !env.APPLE_TEAM_ID || !env.APPLE_WALLET_URL) return null;
  const cert = /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/.exec(certYClave)?.[0];
  const key = /-----BEGIN (RSA |EC )?PRIVATE KEY-----[\s\S]+?-----END (RSA |EC )?PRIVATE KEY-----/.exec(certYClave)?.[0];
  if (!cert || !key) return null;
  return { passTypeId: env.APPLE_PASS_TYPE_ID, teamId: env.APPLE_TEAM_ID, webServiceUrl: env.APPLE_WALLET_URL.replace(/\/$/, ''), certPem: cert, keyPem: key, wwdrPem: wwdr, semilla: certYClave };
}

/** Lo completa la función al arrancar (index.ts) si Apple está prendida. */
let activa: ConfigApple | null = null;
export const prenderApple = (c: ConfigApple | null) => (activa = c);
export const appleActiva = () => activa;
export const appleListaParaPase = () => !!activa;

/** Token del pase (Apple pide 16+ caracteres): HMAC del serial, no se guarda en la base. */
export function tokenPase(cfg: Pick<ConfigApple, 'semilla'>, serial: string): string {
  return createHmac('sha256', cfg.semilla).update(`apple:${serial}`).digest('hex').slice(0, 32);
}

export function tokenValido(cfg: Pick<ConfigApple, 'semilla'>, serial: string, dado: string): boolean {
  const ok = Buffer.from(tokenPase(cfg, serial));
  const d = Buffer.from(String(dado || ''));
  return ok.length === d.length && timingSafeEqual(ok, d);
}

/** Link de descarga del .pkpass (el iPhone lo abre y ofrece "Agregar"). */
export function linkApple(_appUrl: string, clubId: string, packId: string, _qr: string): string {
  const c = activa!;
  const serial = `${clubId}.${packId}`;
  return `${c.webServiceUrl}/descargar/${encodeURIComponent(serial)}?t=${tokenPase(c, serial)}`;
}

const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};

export function passJson(cfg: Pick<ConfigApple, 'passTypeId' | 'teamId' | 'webServiceUrl' | 'semilla'>, pase: Pase) {
  const p: Record<string, unknown> = {
    formatVersion: 1,
    passTypeIdentifier: cfg.passTypeId,
    teamIdentifier: cfg.teamId,
    serialNumber: pase.serial,
    organizationName: pase.conMarca ? pase.clubNombre : 'Armá Partido',
    description: `${pase.cuponera} de ${pase.clubNombre}`,
    logoText: pase.clubNombre,
    foregroundColor: rgb(pase.colores.texto),
    labelColor: rgb(pase.colores.etiqueta),
    backgroundColor: rgb(pase.colores.fondo),
    webServiceURL: cfg.webServiceUrl,
    authenticationToken: tokenPase(cfg, pase.serial),
    storeCard: {
      headerFields: [{ key: 'vence', label: 'VENCE', value: pase.vence.slice(0, 5) || '-' }],
      primaryFields: [{ key: 'quedan', label: pase.unidad.toUpperCase(), value: `${pase.quedan} de ${pase.total}`, changeMessage: 'Te quedan %@' }],
      secondaryFields: [
        { key: 'titular', label: 'TITULAR', value: pase.titular },
        { key: 'sirve', label: 'SIRVE', value: pase.sirve },
      ],
      backFields: [
        { key: 'cuponera', label: 'Cuponera', value: pase.cuponera },
        { key: 'venceCompleto', label: 'Vence', value: pase.vence || '-' },
        { key: 'ayuda', label: 'Cómo se usa', value: 'Mostrá el código en el mostrador del club. El saldo se actualiza solo.' },
        { key: 'app', label: 'En la app', value: pase.linkApp, attributedValue: `<a href="${pase.linkApp}">Ver mi cuponera</a>` },
      ],
    },
  };
  if (pase.qr) p.barcodes = [{ format: 'PKBarcodeFormatQR', message: pase.qr, messageEncoding: 'iso-8859-1', altText: 'Mostralo en el mostrador' }];
  if (pase.venceISO) p.expirationDate = `${pase.venceISO}T23:59:59-03:00`;
  if (pase.estado === 'anulada' || pase.estado === 'agotada') p.voided = true;
  return p;
}

// ---------- .pkpass = zip sin compresión ----------

export function zip(archivos: Record<string, Buffer>): Buffer {
  const partes: Buffer[] = [];
  const central: Buffer[] = [];
  let off = 0;
  for (const [nombre, data] of Object.entries(archivos)) {
    const n = Buffer.from(nombre, 'utf8');
    const c = crc32(data) >>> 0;
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(0, 8);
    lh.writeUInt32LE(0, 10); lh.writeUInt32LE(c, 14); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(n.length, 26); lh.writeUInt16LE(0, 28);
    partes.push(lh, n, data);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(0, 10);
    ch.writeUInt32LE(0, 12); ch.writeUInt32LE(c, 16); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(n.length, 28); ch.writeUInt32LE(off, 42);
    central.push(ch, n);
    off += 30 + n.length + data.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  const cant = Object.keys(archivos).length;
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(cant, 8); end.writeUInt16LE(cant, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...partes, cd, end]);
}

/** Firma PKCS#7 separada del manifest (lo que pide Apple). */
export function firmar(manifest: Buffer, cfg: Pick<ConfigApple, 'certPem' | 'keyPem' | 'wwdrPem'>): Buffer {
  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(manifest.toString('binary'));
  const cert = forge.pki.certificateFromPem(cfg.certPem);
  p7.addCertificate(cert);
  p7.addCertificate(forge.pki.certificateFromPem(cfg.wwdrPem));
  p7.addSigner({
    key: forge.pki.privateKeyFromPem(cfg.keyPem),
    certificate: cert,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date() as unknown as string },
    ],
  });
  p7.sign({ detached: true });
  return Buffer.from(forge.asn1.toDer(p7.toAsn1()).getBytes(), 'binary');
}

/** Arma el .pkpass. `imagenes` = icon.png (obligatorio), logo.png, strip.png (opcionales, con sus @2x). */
export function armarPkpass(cfg: ConfigApple, pase: Pase, imagenes: Record<string, Buffer>): Buffer {
  if (!imagenes['icon.png']) throw new Error('Apple Wallet: falta icon.png');
  const archivos: Record<string, Buffer> = { 'pass.json': Buffer.from(JSON.stringify(passJson(cfg, pase))), ...imagenes };
  const manifest: Record<string, string> = {};
  for (const [n, d] of Object.entries(archivos)) manifest[n] = createHash('sha1').update(d).digest('hex');
  const m = Buffer.from(JSON.stringify(manifest));
  return zip({ ...archivos, 'manifest.json': m, signature: firmar(m, cfg) });
}

/** Aviso a un iPhone por APNs (cuerpo vacío: el iPhone pregunta qué cambió). */
export function avisarIphone(cfg: ConfigApple, pushToken: string, host = 'api.push.apple.com'): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = connect(`https://${host}`, { cert: cfg.certPem, key: cfg.keyPem });
    s.on('error', reject);
    const r = s.request({ ':method': 'POST', ':path': `/3/device/${pushToken}`, 'apns-topic': cfg.passTypeId, 'apns-push-type': 'background', 'apns-priority': '5' });
    r.on('response', (h) => {
      resolve(Number(h[':status']));
      s.close();
    });
    r.on('error', reject);
    r.end('{}');
  });
}
