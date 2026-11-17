/**
 * Marca del club (Configuración > Apariencia, 17/11/2026).
 *
 * El celular nunca escribe la marca que ven los jugadores: la manda acá y el servidor decide
 * (decisión 7, revisión a mano):
 * - Primera marca del club, logo o fotos nuevas, o colores con aviso de contraste → queda "en revisión"
 *   (clubs/{id}.marcaPendiente) hasta que la plataforma la aprueba.
 * - Solo colores, letras, esquinas o slogan que se leen bien, en un club con marca ya aprobada → se publica sola.
 * La app del jugador la usa solo si el club tiene Imagen completa (clubs/{id}.paquete == 'completo').
 */
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { randomUUID } from 'node:crypto';
import type { Club, MarcaDatos, MarcaEsquinas, MarcaPendiente, MarcaPublicada } from '../../src/types/padel';
import { cambiaronImagenes, coloresBloquean, coloresConAviso, esHex, FOTOS_MARCA, FUENTES, SLOGAN_MAX } from '../../src/lib/marcaColores';
import { db } from './admin';

const ESQ: MarcaEsquinas[] = ['rectas', 'medias', 'redondas'];
const FUENTES_OK = new Set<string>(FUENTES);

/** Cuentas de la plataforma: admins/{uid} o el mail del dueño. En la demo, también la cuenta "Equipo". */
export async function esPlataforma(req: CallableRequest): Promise<boolean> {
  const uid = req.auth?.uid;
  if (!uid) return false;
  const email = String(req.auth?.token?.email || '').toLowerCase();
  const demo = process.env.GCLOUD_PROJECT === 'armapartido-demo' || process.env.FUNCTIONS_EMULATOR === 'true';
  const verificado = req.auth?.token?.email_verified === true || demo;
  const mails = ['bernardo@awalabs.com', ...(demo ? ['plataforma@demo.armapartido.com'] : [])];
  if (verificado && mails.includes(email)) return true;
  return (await db.doc(`admins/${uid}`).get()).exists;
}

async function leerClub(clubId: unknown): Promise<Club> {
  if (typeof clubId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(clubId)) throw new HttpsError('invalid-argument', 'Club inválido.');
  const snap = await db.doc(`clubs/${clubId}`).get();
  if (!snap.exists) throw new HttpsError('not-found', 'No encontramos el club.');
  return snap.data() as Club;
}

async function requireAdminDelClub(req: CallableRequest, club: Club) {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Tenés que entrar con tu cuenta.');
  if (club.ownerUid === uid || (await esPlataforma(req))) return;
  const m = await db.doc(`clubs/${club.id}/memberships/${uid}`).get();
  if (m.exists && m.data()?.role === 'admin') return;
  throw new HttpsError('permission-denied', 'Solo el dueño o un administrador del club cambia la apariencia.');
}

/** Solo imágenes del propio club en Storage (o las fotos fijas de la app). */
function urlImagen(v: unknown, clubId: string): string | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  if (typeof v !== 'string' || v.length > 1200) throw new HttpsError('invalid-argument', 'Imagen inválida.');
  if (/^\/(img|clubes)\/[a-zA-Z0-9/_.-]+$/.test(v)) return v;
  const carpeta = `clubs%2F${clubId}%2Fmarca%2F`;
  const ok =
    (v.startsWith('https://firebasestorage.googleapis.com/') || v.startsWith('http://127.0.0.1:9199/') || v.startsWith('http://localhost:9199/')) &&
    v.includes(`/o/${carpeta}`);
  if (!ok) throw new HttpsError('invalid-argument', 'La imagen tiene que estar subida desde el panel del club.');
  return v;
}

/** Limpia lo que manda el celular: solo los campos conocidos y con valores válidos. */
export function limpiarMarca(raw: unknown, clubId: string): MarcaDatos {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
  const c = (r.colores || {}) as Record<string, unknown>;
  if (!esHex(c.principal) || !esHex(c.acento) || !esHex(c.fondo)) throw new HttpsError('invalid-argument', 'Faltan colores o no están bien escritos.');
  const out: MarcaDatos = {
    colores: { principal: c.principal.toLowerCase(), acento: c.acento.toLowerCase(), fondo: c.fondo.toLowerCase() },
  };
  if (esHex(c.secundario)) out.colores.secundario = c.secundario.toLowerCase();
  const f = (r.fuentes || {}) as Record<string, unknown>;
  const titulos = typeof f.titulos === 'string' && FUENTES_OK.has(f.titulos) ? f.titulos : undefined;
  const texto = typeof f.texto === 'string' && FUENTES_OK.has(f.texto) ? f.texto : undefined;
  if (titulos || texto) out.fuentes = { ...(titulos ? { titulos } : {}), ...(texto ? { texto } : {}) };
  if (ESQ.includes(r.esquinas)) out.esquinas = r.esquinas;
  if (typeof r.slogan === 'string' && r.slogan.trim()) out.slogan = r.slogan.trim().replace(/\s+/g, ' ').slice(0, SLOGAN_MAX);
  const logo = urlImagen(r.logo, clubId);
  if (logo) out.logo = logo;
  const fotos: NonNullable<MarcaDatos['fotos']> = {};
  for (const { id } of FOTOS_MARCA) {
    const u = urlImagen(r.fotos?.[id], clubId);
    if (u) fotos[id] = u;
  }
  if (Object.keys(fotos).length) out.fotos = fotos;
  return out;
}

const hoyISO = () => new Date().toISOString();

/** El club guarda su marca. Responde si se publicó o quedó en revisión. */
export async function guardarMarca(req: CallableRequest): Promise<{ estado: 'publicada' | 'en_revision'; motivo?: MarcaPendiente['motivo'] }> {
  const club = await leerClub(req.data?.clubId);
  await requireAdminDelClub(req, club);
  const datos = limpiarMarca(req.data?.marca, club.id);
  if (coloresBloquean(datos.colores)) throw new HttpsError('failed-precondition', 'Con esos colores la app no se lee bien. Revisá el fondo.');

  const motivo: MarcaPendiente['motivo'] | null = !club.marca
    ? 'primera'
    : cambiaronImagenes(club.marca, datos)
      ? 'imagenes'
      : coloresConAviso(datos.colores)
        ? 'colores'
        : null;

  const ref = db.doc(`clubs/${club.id}`);
  if (!motivo) {
    const publicada: MarcaPublicada = { ...datos, version: (club.marca?.version || 0) + 1, publicadaEl: hoyISO() };
    await ref.update({ marca: publicada, marcaPendiente: null, marcaRechazo: null, updatedAt: FieldValue.serverTimestamp() });
    return { estado: 'publicada' };
  }
  const pendiente: MarcaPendiente = { ...datos, enviadaEl: hoyISO(), enviadaPor: req.auth!.uid, motivo };
  const upd: Record<string, unknown> = { marcaPendiente: pendiente, marcaRechazo: null, updatedAt: FieldValue.serverTimestamp() };
  // La primera marca guardada queda como "la del alta" para el botón Restablecer.
  if (!club.marcaAlta) upd.marcaAlta = datos;
  await ref.update(upd);
  return { estado: 'en_revision', motivo };
}

/** La plataforma aprueba o rechaza la marca en revisión. */
export async function revisarMarca(req: CallableRequest): Promise<{ ok: true }> {
  if (!(await esPlataforma(req))) throw new HttpsError('permission-denied', 'Solo el equipo de Armá Partido revisa marcas.');
  const club = await leerClub(req.data?.clubId);
  const p = club.marcaPendiente;
  if (!p) throw new HttpsError('failed-precondition', 'Este club no tiene una marca para revisar.');
  const ref = db.doc(`clubs/${club.id}`);
  if (req.data?.aprobar === true) {
    const { enviadaEl: _e, enviadaPor: _p, motivo: _m, ...datos } = p;
    const publicada: MarcaPublicada = { ...datos, version: (club.marca?.version || 0) + 1, publicadaEl: hoyISO() };
    await ref.update({ marca: publicada, marcaPendiente: null, marcaRechazo: null, updatedAt: FieldValue.serverTimestamp() });
  } else {
    const nota = typeof req.data?.nota === 'string' ? req.data.nota.trim().slice(0, 300) : '';
    if (!nota) throw new HttpsError('invalid-argument', 'Escribí qué tiene que cambiar el club.');
    await ref.update({ marcaPendiente: null, marcaRechazo: { nota, el: hoyISO() }, updatedAt: FieldValue.serverTimestamp() });
  }
  return { ok: true };
}

/** La plataforma marca qué paquete pagó el club (Imagen completa o básico). */
export async function cambiarPaquete(req: CallableRequest): Promise<{ ok: true }> {
  if (!(await esPlataforma(req))) throw new HttpsError('permission-denied', 'Solo el equipo de Armá Partido cambia el paquete.');
  const club = await leerClub(req.data?.clubId);
  const paquete = req.data?.paquete;
  if (paquete !== 'basico' && paquete !== 'completo') throw new HttpsError('invalid-argument', 'Paquete inválido.');
  await db.doc(`clubs/${club.id}`).update({ paquete, updatedAt: FieldValue.serverTimestamp() });
  return { ok: true };
}

const NOMBRES_IMG = new Set(['logo', 'portada', 'reservar', 'armar', 'torneos']);

/**
 * Sube el logo o una foto de la marca (ya achicados en el navegador). El servidor revisa permiso,
 * tipo real del archivo (PNG o WebP) y tamaño, y devuelve la dirección pública con su token.
 */
export async function subirImagen(req: CallableRequest): Promise<{ url: string }> {
  const club = await leerClub(req.data?.clubId);
  await requireAdminDelClub(req, club);
  const nombre = String(req.data?.nombre || '');
  if (!NOMBRES_IMG.has(nombre)) throw new HttpsError('invalid-argument', 'Imagen inválida.');
  const b64 = typeof req.data?.base64 === 'string' ? req.data.base64 : '';
  const buf = Buffer.from(b64, 'base64');
  if (!buf.length || buf.length > 1024 * 1024) throw new HttpsError('invalid-argument', 'La imagen tiene que pesar menos de 1 MB.');
  const png = buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const webp = buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP';
  if (!png && !webp) throw new HttpsError('invalid-argument', 'La imagen tiene que ser PNG o WebP.');
  const ext = png ? 'png' : 'webp';
  const ruta = `clubs/${club.id}/marca/${nombre}-${Date.now()}.${ext}`;
  const bucket = getStorage().bucket();
  const token = randomUUID();
  await bucket.file(ruta).save(buf, {
    contentType: png ? 'image/png' : 'image/webp',
    metadata: { cacheControl: 'public,max-age=31536000', metadata: { firebaseStorageDownloadTokens: token, subidaPor: req.auth!.uid } },
    resumable: false,
  });
  const host = process.env.FIREBASE_STORAGE_EMULATOR_HOST ? `http://${process.env.FIREBASE_STORAGE_EMULATOR_HOST}` : 'https://firebasestorage.googleapis.com';
  return { url: `${host}/v0/b/${bucket.name}/o/${encodeURIComponent(ruta)}?alt=media&token=${token}` };
}
