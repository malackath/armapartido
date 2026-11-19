/**
 * Cuponera en la billetera del celular (19/11/2026). Lo que es igual para Google Wallet y Apple Wallet:
 * qué datos van en el pase, cómo se ve según el plan del club y el código del QR.
 *
 * Decisión de Ber (19/11): Google Wallet primero; Apple queda lista y apagada hasta que pague la cuenta.
 * - Genérico (colores y logo de Armá Partido, nombre del club en texto): todos los clubes.
 * - Con la marca del club: solo con Imagen completa (club.paquete == 'completo') y marca aprobada (club.marca).
 * En el pase NO van celular, mail ni montos. El QR lleva un código al azar; el saldo real está en Firestore.
 */
import { randomBytes } from 'node:crypto';
import type { Club } from '../../../src/types/padel';
import { nombreTira, type ColoresTira } from './tira';

/** Lo mínimo de la cuponera del cliente que usa el pase (clubs/{id}/clientPacks/{id}). */
export interface PackParaPase {
  id: string;
  clubId: string;
  clientName: string;
  uid: string;
  name: string;
  unit: 'parte' | 'turno';
  validity: 'todos' | 'valle' | 'semana';
  usesTotal: number;
  usesLeft: number;
  expiresOn: string;
  status: 'active' | 'voided';
  qr?: string;
}

export type EstadoPase = 'activa' | 'agotada' | 'vencida' | 'anulada';

export interface Pase {
  serial: string;
  clubId: string;
  clubNombre: string;
  cuponera: string;
  titular: string;
  quedan: number;
  total: number;
  unidad: string;
  sirve: string;
  vence: string;
  venceISO: string;
  estado: EstadoPase;
  qr: string;
  conMarca: boolean;
  colores: { fondo: string; texto: string; acento: string; etiqueta: string };
  logo: string;
  portada?: string;
  /** Cupones usados y colores de la tira (imagen con los cupones tachados). */
  usados: number;
  coloresTira: ColoresTira;
  /** URL pública del PNG con la tira de cupones (hasta 30 cupones). */
  tira?: string;
  linkApp: string;
}

/** Colores de Armá Partido (manual de marca). */
export const GENERICO = { fondo: '#0a5761', texto: '#ffffff', acento: '#05e2f2', etiqueta: '#b9f6fb' };

const HEX = /^#[0-9a-fA-F]{6}$/;

/** "Lucía Fernández" → "Lucía F.": en el pase va el nombre corto. */
export function nombreCorto(nombre: string): string {
  const p = String(nombre || '').trim().split(/\s+/).filter(Boolean);
  if (!p.length) return 'Titular';
  if (p.length === 1) return p[0].slice(0, 20);
  return `${p[0].slice(0, 16)} ${p[p.length - 1][0].toUpperCase()}.`;
}

/** Código del QR: AP1.<club>.<24 letras al azar>. El Mostrador lo busca en clientPacks.qr. */
export function nuevoCodigoQr(clubId: string): string {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const b = randomBytes(24);
  let s = '';
  for (let i = 0; i < 24; i++) s += abc[b[i] % abc.length];
  return `AP1.${clubId}.${s}`;
}

export function leerCodigoQr(v: string): { clubId: string; codigo: string } | null {
  const m = /^AP1\.([a-zA-Z0-9_-]{1,128})\.([A-Z2-9]{24})$/.exec(String(v || '').trim());
  return m ? { clubId: m[1], codigo: v.trim() } : null;
}

export function estadoDe(pack: PackParaPase, hoy: string): EstadoPase {
  if (pack.status === 'voided') return 'anulada';
  if (pack.usesLeft <= 0) return 'agotada';
  if (pack.expiresOn && pack.expiresOn < hoy) return 'vencida';
  return 'activa';
}

const dmy = (iso: string) => (iso ? iso.split('-').reverse().join('/') : '');

/** Solo imágenes PNG públicas: Apple exige PNG y en Google es lo seguro. Sin PNG, el pase va sin esa imagen. */
function pngPublica(url?: string): string | undefined {
  if (!url) return undefined;
  if (!/^https:\/\//.test(url)) return undefined;
  const sinQuery = decodeURIComponent(url.split('?')[0]);
  return /\.png$/i.test(sinQuery) ? url : undefined;
}

/** Texto blanco o negro según el fondo, para que se lea. */
function textoSobre(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? '#172123' : '#ffffff';
}

/** Arma el pase con los datos de la cuponera y la marca del club. appUrl = https://demo.armapartido.com o el dominio del club. */
/** tiraBase = dirección de la función walletCupones; sin ella el pase va sin la tira (como antes). */
export function armarPase(club: Club, pack: PackParaPase, hoy: string, appUrl: string, tiraBase?: string): Pase {
  const marca = club.paquete === 'completo' && club.marca ? club.marca : null;
  let colores = GENERICO;
  let logo = `${appUrl}/wallet/logo-armapartido.png`;
  let portada: string | undefined = `${appUrl}/wallet/portada-armapartido.png`;
  if (marca) {
    const fondo = HEX.test(marca.colores?.principal) ? marca.colores.principal : GENERICO.fondo;
    const acento = HEX.test(marca.colores?.acento) ? marca.colores.acento : GENERICO.acento;
    const texto = textoSobre(fondo);
    colores = { fondo, texto, acento, etiqueta: texto === '#ffffff' ? '#e6eef2' : '#3a4a4a' };
    logo = pngPublica(marca.logo) ?? logo;
    portada = pngPublica(marca.fotos?.portada);
  }
  const unidad = pack.unit === 'turno' ? 'turnos' : 'partes de cancha';
  const usados = Math.max(0, Math.min(pack.usesTotal, pack.usesTotal - Math.max(0, pack.usesLeft)));
  const coloresTira: ColoresTira = { fondo: colores.fondo, linea: marca ? colores.texto : colores.etiqueta, acento: colores.acento };
  const tira = tiraBase && pack.usesTotal >= 1 && pack.usesTotal <= 30 ? `${tiraBase.replace(/\/$/, '')}/${nombreTira(usados, pack.usesTotal, coloresTira)}` : undefined;
  const sirve = pack.validity === 'valle' ? 'Horario valle' : pack.validity === 'semana' ? 'Lunes a viernes' : 'Todo horario';
  return {
    serial: `${pack.clubId}.${pack.id}`,
    clubId: club.id,
    clubNombre: club.name,
    cuponera: pack.name,
    titular: nombreCorto(pack.clientName),
    quedan: Math.max(0, pack.usesLeft),
    total: pack.usesTotal,
    unidad,
    sirve,
    vence: dmy(pack.expiresOn),
    venceISO: pack.expiresOn,
    estado: estadoDe(pack, hoy),
    qr: pack.qr || '',
    conMarca: !!marca,
    colores,
    logo,
    portada,
    usados,
    coloresTira,
    tira,
    linkApp: `${appUrl}/?tab=profile&clubId=${encodeURIComponent(club.id)}&cuponera=${encodeURIComponent(pack.id)}`,
  };
}

/** Aviso al jugador cuando cambia el saldo. null = no avisar. */
export function avisoCambio(antes: Pick<PackParaPase, 'usesLeft' | 'status'>, despues: PackParaPase): string | null {
  const u = despues.unit === 'turno' ? ['turno', 'turnos'] : ['parte', 'partes'];
  if (despues.status === 'voided' && antes.status !== 'voided') return 'Tu cuponera fue anulada en el club.';
  const usados = antes.usesLeft - despues.usesLeft;
  if (usados > 0) {
    const q = despues.usesLeft;
    if (q <= 0) return `Usaste ${usados === 1 ? `1 ${u[0]}` : `${usados} ${u[1]}`}. Tu cuponera quedó sin usos.`;
    return `Usaste ${usados === 1 ? `1 ${u[0]}` : `${usados} ${u[1]}`}. Te quedan ${q} de ${despues.usesTotal}.`;
  }
  if (usados < 0) return `Te devolvieron ${-usados === 1 ? `1 ${u[0]}` : `${-usados} ${u[1]}`}. Te quedan ${despues.usesLeft} de ${despues.usesTotal}.`;
  return null;
}
