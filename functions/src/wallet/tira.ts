/**
 * Tira de cupones para la billetera (19/11/2026, diseño aprobado por Ber: "que se vean los 10 cupones y tachados
 * los usados"). La billetera no deja dibujar a mano, así que el servidor arma un PNG con los cupones y lo rehace
 * en cada uso: Google lo muestra como imagen ancha (heroImage) y Apple como strip.png.
 * PNG hecho a mano (zlib + CRC), sin librerías de dibujo: talones con muescas, número, usados grises y tachados.
 */
import { deflateSync } from 'node:zlib';

type RGB = [number, number, number];
const hex = (h: string): RGB => {
  const n = parseInt(h.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** Números de 5×7 (1 = pixel prendido). */
const DIG: Record<string, string[]> = {
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
};

export interface ColoresTira {
  fondo: string;
  /** Borde y número de los cupones libres. */
  linea: string;
  /** El próximo a usar. */
  acento: string;
}

/** Filas y columnas: hasta 5 en una fila, hasta 10 en dos filas parejas, más de 10 en filas de 10. */
export function grilla(total: number): { cols: number; rows: number } {
  const cols = total <= 5 ? total : total <= 10 ? Math.ceil(total / 2) : 10;
  return { cols, rows: Math.ceil(total / cols) };
}

/** Qué hay en cada cupón (también lo usan las pruebas). */
export function estadosCupones(usados: number, total: number): ('usado' | 'sigue' | 'libre')[] {
  return Array.from({ length: total }, (_, i) => (i < usados ? 'usado' : i === usados ? 'sigue' : 'libre'));
}

export function tiraPng(usados: number, total: number, c: ColoresTira, ancho = 1032, alto = 336): Buffer {
  total = Math.max(1, Math.min(30, Math.round(total)));
  usados = Math.max(0, Math.min(total, Math.round(usados)));
  const fondo = hex(c.fondo);
  const linea = hex(c.linea);
  const acento = hex(c.acento);
  const gris: RGB = [154, 169, 171];
  const tachado: RGB = [255, 138, 101];
  const { cols, rows } = grilla(total);
  const estados = estadosCupones(usados, total);

  const margen = Math.round(alto * 0.09);
  const gap = Math.round(alto * 0.045);
  const cw = (ancho - 2 * margen - (cols - 1) * gap) / cols;
  const ch = Math.min((alto - 2 * margen - (rows - 1) * gap) / rows, cw * 0.62);
  const top0 = (alto - (rows * ch + (rows - 1) * gap)) / 2;
  const radio = ch * 0.16;
  const muesca = ch * 0.11;
  const grosor = Math.max(2, ch * 0.035);
  const escala = Math.max(2, Math.floor(ch / 14));

  // Pixeles con 3×3 submuestras para que los bordes no queden serruchados.
  const px = Buffer.alloc(ancho * alto * 3);
  const S = 3;
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const fx = x + (sx + 0.5) / S;
          const fy = y + (sy + 0.5) / S;
          const col = colorEn(fx, fy);
          r += col[0]; g += col[1]; b += col[2];
        }
      }
      const i = (y * ancho + x) * 3;
      px[i] = Math.round(r / (S * S));
      px[i + 1] = Math.round(g / (S * S));
      px[i + 2] = Math.round(b / (S * S));
    }
  }
  return png(ancho, alto, px);

  function mezcla(a: RGB, z: RGB, t: number): RGB {
    return [a[0] + (z[0] - a[0]) * t, a[1] + (z[1] - a[1]) * t, a[2] + (z[2] - a[2]) * t];
  }

  function colorEn(fx: number, fy: number): RGB {
    const row = Math.floor((fy - top0) / (ch + gap));
    const col = Math.floor((fx - margen) / (cw + gap));
    if (row < 0 || row >= rows || col < 0 || col >= cols) return fondo;
    const idx = row * cols + col;
    if (idx >= total) return fondo;
    const x0 = margen + col * (cw + gap);
    const y0 = top0 + row * (ch + gap);
    const lx = fx - x0;
    const ly = fy - y0;
    if (lx < 0 || lx > cw || ly < 0 || ly > ch) return fondo;
    // Esquinas redondeadas.
    const dRect = distRect(lx, ly, cw, ch, radio);
    if (dRect > 0) return fondo;
    // Muescas a los costados, a media altura.
    const dl = Math.hypot(lx, ly - ch / 2) - muesca;
    const dr = Math.hypot(lx - cw, ly - ch / 2) - muesca;
    if (dl < 0 || dr < 0) return fondo;
    const borde = -dRect < grosor || (dl < grosor) || (dr < grosor);
    const est = estados[idx];
    const tinta = est === 'usado' ? gris : est === 'sigue' ? acento : linea;
    const relleno: RGB = est === 'usado' ? mezcla(fondo, gris, 0.18) : est === 'sigue' ? mezcla(fondo, acento, 0.16) : fondo;
    // Tachado: diagonal de abajo a la izquierda hacia arriba a la derecha.
    if (est === 'usado') {
      const dDiag = Math.abs(ch * lx - cw * (ch - ly)) / Math.hypot(cw, ch);
      if (dDiag < grosor * 0.9) return tachado;
    }
    if (borde) {
      if (est === 'usado') {
        // Borde punteado en los usados.
        const t = Math.floor((lx + ly) / (grosor * 3));
        return t % 2 ? tinta : relleno;
      }
      return tinta;
    }
    // Número centrado.
    const txt = String(idx + 1);
    const gw = 5 * escala, gh = 7 * escala, sep = escala;
    const tw = txt.length * gw + (txt.length - 1) * sep;
    const tx = (cw - tw) / 2;
    const ty = (ch - gh) / 2;
    if (lx >= tx && lx < tx + tw && ly >= ty && ly < ty + gh) {
      const k = Math.floor((lx - tx) / (gw + sep));
      const gx = Math.floor((lx - tx - k * (gw + sep)) / escala);
      const gy = Math.floor((ly - ty) / escala);
      if (gx >= 0 && gx < 5 && DIG[txt[k]]?.[gy]?.[gx] === '1') return tinta;
    }
    return relleno;
  }
}

/** Distancia con signo a un rectángulo de esquinas redondeadas (negativa adentro). */
function distRect(x: number, y: number, w: number, h: number, r: number): number {
  const qx = Math.abs(x - w / 2) - (w / 2 - r);
  const qy = Math.abs(y - h / 2) - (h / 2 - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(b: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(tipo: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(tipo, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w: number, h: number, rgb: Buffer): Buffer {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

/** Nombre del archivo: lleva todo el estado, así cambia la URL en cada uso y la billetera baja la nueva. */
export function nombreTira(usados: number, total: number, c: ColoresTira): string {
  const h = (s: string) => s.replace('#', '').toLowerCase();
  return `${usados}-${total}-${h(c.fondo)}-${h(c.linea)}-${h(c.acento)}.png`;
}

export function leerNombreTira(nombre: string): { usados: number; total: number; colores: ColoresTira } | null {
  const m = /^(\d{1,2})-(\d{1,2})-([0-9a-f]{6})-([0-9a-f]{6})-([0-9a-f]{6})\.png$/.exec(nombre);
  if (!m) return null;
  const usados = +m[1], total = +m[2];
  if (total < 1 || total > 30 || usados > total) return null;
  return { usados, total, colores: { fondo: `#${m[3]}`, linea: `#${m[4]}`, acento: `#${m[5]}` } };
}
