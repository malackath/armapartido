/**
 * Marca del club (Configuración > Apariencia). Las fotos y el logo se achican en el navegador
 * y las sube el servidor a Storage (clubs/{clubId}/marca/); la marca también la guarda el servidor (functions/src/marca.ts).
 */
import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase';
import type { MarcaDatos, MarcaPendiente } from '../types/padel';

const call = async <T,>(name: string, data: Record<string, unknown>): Promise<T> => {
  try {
    return (await httpsCallable<Record<string, unknown>, T>(functions, name)(data)).data;
  } catch (err) {
    const msg = err instanceof Error ? err.message.replace(/^FirebaseError:\s*/, '') : 'No se pudo guardar.';
    throw new Error(msg);
  }
};

export const guardarMarca = (clubId: string, marca: MarcaDatos) =>
  call<{ estado: 'publicada' | 'en_revision'; motivo?: MarcaPendiente['motivo'] }>('marcaGuardar', { clubId, marca });
export const revisarMarca = (clubId: string, aprobar: boolean, nota = '') => call<{ ok: true }>('marcaRevisar', { clubId, aprobar, nota });
export const cambiarPaquete = (clubId: string, paquete: 'basico' | 'completo') => call<{ ok: true }>('marcaPaquete', { clubId, paquete });

async function aBlob(canvas: HTMLCanvasElement, quality: number): Promise<{ blob: Blob; type: string }> {
  const webp = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/webp', quality));
  if (webp && webp.type === 'image/webp') return { blob: webp, type: 'image/webp' };
  const png = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
  if (!png) throw new Error('Este navegador no pudo preparar la imagen.');
  return { blob: png, type: 'image/png' };
}

/** Logo: entra entero (sin recortar) en 512 × 512, con el fondo transparente que traiga. */
export async function prepararLogo(file: File): Promise<{ blob: Blob; type: string; canvas: HTMLCanvasElement }> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, 512 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  return { ...(await aBlob(c, 0.9)), canvas: c };
}

/** Foto de encabezado: recorte 16:9 al centro, 1600 × 900. */
export async function prepararFoto(file: File): Promise<{ blob: Blob; type: string }> {
  const bmp = await createImageBitmap(file);
  const W = 1600;
  const H = 900;
  const k = Math.max(W / bmp.width, H / bmp.height);
  const sw = W / k;
  const sh = H / k;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  c.getContext('2d')!.drawImage(bmp, (bmp.width - sw) / 2, (bmp.height - sh) / 2, sw, sh, 0, 0, W, H);
  bmp.close?.();
  return aBlob(c, 0.8);
}

/** Sube la imagen (por el servidor, que revisa el permiso) y devuelve su dirección. */
export async function subirImagenMarca(clubId: string, nombre: string, img: { blob: Blob; type: string }): Promise<string> {
  if (img.blob.size > 1024 * 1024) throw new Error('La imagen quedó muy pesada (más de 1 MB). Probá con otra.');
  const bytes = new Uint8Array(await img.blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const r = await call<{ url: string }>('marcaSubirImagen', { clubId, nombre, base64: btoa(bin) });
  return r.url;
}

/** Colores principales del logo (sin blancos ni transparentes), para sugerirlos. Corre en el navegador, sin costo. */
export function coloresDelLogo(canvas: HTMLCanvasElement, cuantos = 4): string[] {
  const ctx = canvas.getContext('2d');
  if (!ctx) return [];
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const cubos = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i < data.length; i += 16) {
    const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
    if (a < 200) continue;
    if (r > 235 && g > 235 && b > 235) continue;
    const k = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const c = cubos.get(k) || { n: 0, r: 0, g: 0, b: 0 };
    c.n++;
    c.r += r;
    c.g += g;
    c.b += b;
    cubos.set(k, c);
  }
  const hex = (v: number) => Math.round(v).toString(16).padStart(2, '0');
  const lista = [...cubos.values()].sort((a, b) => b.n - a.n).map((c) => `#${hex(c.r / c.n)}${hex(c.g / c.n)}${hex(c.b / c.n)}`);
  // Saca los casi iguales.
  const out: string[] = [];
  const dist = (a: string, b: string) => {
    const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const [x, y] = [p(a), p(b)];
    return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
  };
  for (const c of lista) {
    if (out.every((o) => dist(o, c) > 60)) out.push(c);
    if (out.length >= cuantos) break;
  }
  return out;
}
