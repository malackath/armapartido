/**
 * Marca del club: colores, letras y esquinas (17/11/2026). Lógica pura, sin navegador:
 * la usan la app (marcaClub.ts), el panel Configuración > Apariencia y el servidor (functions/src/marca.ts).
 *
 * Reglas (decisiones 8 y 9 del wireframe de alta, recomendadas por defecto):
 * - El club cambia principal, acento y fondo, letras (lista de Google Fonts), esquinas, logo, slogan y fotos.
 * - Quedan fijos: libre, ocupado, a cobrar, en juego, categorías 1ra a 7ma, errores y el color del texto
 *   (lo elige la app según el contraste).
 */
import type { MarcaDatos, MarcaEsquinas } from '../types/padel';

type RGB = [number, number, number];
export const esHex = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
const hexToRgb = (hex: string): RGB => {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
export const rgbToHex = (c: RGB) => '#' + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
export const mix = (a: string, b: string, t: number) => {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return rgbToHex([0, 1, 2].map((i) => x[i] + (y[i] - x[i]) * t) as RGB);
};
const lum = (hex: string) => {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const contraste = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
/** Oscurece el color hasta que se lea sobre blanco (texto normal, 4,5:1). */
export const legibleSobreBlanco = (hex: string) => {
  let c = hex;
  for (let i = 0; i < 20 && contraste(c, '#ffffff') < 4.5; i++) c = mix(c, '#000000', 0.08);
  return c;
};
const mejorTextoSobre = (fondo: string, candidatos: string[]) =>
  candidatos.reduce((best, c) => (contraste(c, fondo) > contraste(best, fondo) ? c : best), candidatos[0]);

/** Tono (0-360) y saturación (0-1) para reconocer rojos. */
function hueSat(hex: string): [number, number] {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return [0, 0];
  let h = 0;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  const l = (max + min) / 2;
  return [h, d / (1 - Math.abs(2 * l - 1))];
}
const esRojo = (hex: string) => {
  const [h, s] = hueSat(hex);
  return s > 0.5 && (h < 12 || h > 345);
};

// ---------- opciones del panel ----------

/** Letras que puede elegir el club (Google Fonts, gratis). Outfit es la de Armá Partido. */
export const FUENTES = [
  'Outfit',
  'Space Grotesk',
  'Inter',
  'Montserrat',
  'Poppins',
  'DM Sans',
  'Barlow',
  'Rubik',
  'Archivo',
  'Oswald',
  'Bebas Neue',
  'Raleway',
] as const;
/** Solo para títulos (no se leen bien en texto largo). */
export const FUENTES_SOLO_TITULOS = new Set(['Oswald', 'Bebas Neue']);

export const ESQUINAS: { id: MarcaEsquinas; label: string; px: number }[] = [
  { id: 'rectas', label: 'Rectas', px: 4 },
  { id: 'medias', label: 'Armá Partido (12 px)', px: 12 },
  { id: 'redondas', label: 'Redondas', px: 20 },
];
export const esquinasPx = (e?: MarcaEsquinas) => ESQUINAS.find((x) => x.id === e)?.px ?? 12;

export const SLOGAN_MAX = 48;
export const FOTOS_MARCA: { id: 'portada' | 'reservar' | 'armar' | 'torneos'; label: string; detalle: string }[] = [
  { id: 'portada', label: 'Portada', detalle: 'Arriba de Inicio, con el logo y el slogan' },
  { id: 'reservar', label: 'Reservar', detalle: 'Encabezado de Reservar' },
  { id: 'armar', label: 'Armar partido', detalle: 'Encabezado de Armar partido' },
  { id: 'torneos', label: 'Torneos', detalle: 'Encabezado de Torneos' },
];

/** La marca de Armá Partido, para "Restablecer" cuando el club no tiene una del alta. */
export const MARCA_ARMA_PARTIDO: MarcaDatos = {
  colores: { principal: '#0a5761', acento: '#0bfbff', fondo: '#e8f5f5' },
  fuentes: { titulos: 'Outfit', texto: 'Outfit' },
  esquinas: 'medias',
};

// ---------- control de contraste ----------

export type AvisoColor = { nivel: 'ok' | 'aviso' | 'bloquea'; texto: string };

/**
 * Revisa los colores como en el wireframe. "bloquea" no deja guardar; "aviso" deja guardar pero
 * la marca pasa a revisión a mano en vez de publicarse sola.
 */
export function revisarColores(c: MarcaDatos['colores']): AvisoColor[] {
  const out: AvisoColor[] = [];
  if (!esHex(c.principal) || !esHex(c.acento) || !esHex(c.fondo)) return [{ nivel: 'bloquea', texto: 'Falta algún color o no está bien escrito (#RRGGBB).' }];
  // El fondo tiene que ser claro: el texto de la app es oscuro (lo elige la app, no el club).
  if (contraste('#172123', c.fondo) < 7) out.push({ nivel: 'bloquea', texto: 'Ese fondo es muy oscuro: el texto de la app no se leería. Elegí un fondo claro.' });
  if (contraste(c.principal, '#ffffff') < 3)
    out.push({ nivel: 'aviso', texto: 'El color principal es muy claro: sobre blanco casi no se ve. La app lo oscurece en botones y textos chicos, o elegí otro.' });
  if (esRojo(c.principal) || esRojo(c.acento)) out.push({ nivel: 'aviso', texto: 'Ojo: el rojo se confunde con los avisos de error. Se puede, pero no lo recomendamos.' });
  if (contraste(c.acento, c.fondo) < 1.25 && contraste(c.acento, legibleSobreBlanco(c.principal)) < 1.5)
    out.push({ nivel: 'aviso', texto: 'El acento casi no se distingue del fondo ni del principal: las pestañas activas se van a ver poco.' });
  if (!out.length) out.push({ nivel: 'ok', texto: 'Se lee bien. Listo para guardar.' });
  return out;
}
export const coloresBloquean = (c: MarcaDatos['colores']) => revisarColores(c).some((a) => a.nivel === 'bloquea');
export const coloresConAviso = (c: MarcaDatos['colores']) => revisarColores(c).some((a) => a.nivel !== 'ok');

// ---------- variables CSS ----------

export type MarcaParaVariables = { colores: { principal: string; acento?: string; secundario?: string; fondo?: string }; esquinas?: MarcaEsquinas };

/** Variables CSS de la marca (colores de marca y esquinas). Nunca toca colores de estado ni de categoría. */
export function variablesDeMarca(m: MarcaParaVariables): Record<string, string> {
  const brand = legibleSobreBlanco(m.colores.principal);
  const acento = m.colores.acento || brand;
  const fondo = m.colores.fondo || mix('#ffffff', m.colores.secundario || brand, 0.07);
  const segundo = m.colores.secundario || mix(brand, '#ffffff', 0.3);
  const v: Record<string, string> = {
    '--color-brand': brand,
    // 2º tono (texto blanco encima) y 3º (texto oscuro encima), con el segundo color del club si lo hay.
    '--color-brand-2': legibleSobreBlanco(segundo),
    '--color-brand-3': mix('#ffffff', segundo, 0.35),
    '--club-primary': brand,
    '--club-accent': acento,
    '--color-action': acento,
    // Sobre el acento va el color de marca si se lee bien (7:1); si no, el que más contraste.
    '--color-on-action': contraste(brand, acento) >= 7 ? brand : mejorTextoSobre(acento, [brand, '#ffffff', '#111111']),
    '--color-page': fondo,
    '--color-surface': mix('#ffffff', fondo, 0.5),
    '--color-mist': mix('#ffffff', brand, 0.08),
    '--color-line': mix('#ffffff', brand, 0.16),
    // La escala "emerald" del prototipo es la escala de marca (botones, fondos suaves).
    '--color-emerald-50': mix('#ffffff', brand, 0.06),
    '--color-emerald-100': mix('#ffffff', brand, 0.14),
    '--color-emerald-200': mix('#ffffff', brand, 0.3),
    '--color-emerald-300': mix('#ffffff', brand, 0.48),
    '--color-emerald-400': mix('#ffffff', brand, 0.68),
    '--color-emerald-500': mix('#ffffff', brand, 0.86),
    '--color-emerald-600': brand,
    '--color-emerald-700': mix(brand, '#000000', 0.12),
    '--color-emerald-800': mix(brand, '#000000', 0.24),
    '--color-emerald-900': mix(brand, '#000000', 0.55),
  };
  if (m.esquinas) {
    const px = `${esquinasPx(m.esquinas)}px`;
    for (const k of ['md', 'lg', 'xl', '2xl', '3xl']) v[`--radius-${k}`] = px;
  }
  return v;
}

/** Fondos claros sugeridos a partir del color principal. */
export function fondosSugeridos(principal: string, acento?: string): { label: string; hex: string }[] {
  const p = esHex(principal) ? principal : '#0a5761';
  const out = [
    { label: 'Casi blanco', hex: '#f6f8fa' },
    { label: 'Tono del principal', hex: mix('#ffffff', p, 0.08) },
    { label: 'Más tono del principal', hex: mix('#ffffff', p, 0.16) },
  ];
  if (esHex(acento)) out.push({ label: 'Tono del acento', hex: mix('#ffffff', acento, 0.18) });
  return out;
}

/** ¿Cambió algo que necesita revisión a mano (logo o fotos)? */
export function cambiaronImagenes(a: MarcaDatos | undefined | null, b: MarcaDatos): boolean {
  if (!a) return true;
  if ((a.logo || '') !== (b.logo || '')) return true;
  const fa = a.fotos || {};
  const fb = b.fotos || {};
  return FOTOS_MARCA.some((f) => (fa[f.id] || '') !== (fb[f.id] || ''));
}
