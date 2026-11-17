/**
 * Marca completa del club (17/11/2026): logo, colores y nombre del club aplicados a la app.
 * Sirve para los clubes con "imagen completa" y para mostrarle a un prospecto su app con su marca
 * en <club>.armapartido.com. Cada club con marca tiene public/clubes/<slug>/marca.json
 * (lo arma scripts/nuevo-prospecto.cjs). Sin ese archivo la app queda con la marca Armá Partido.
 *
 * Reglas (manual del sitio): cambian el logo, el nombre y los colores de marca (header, botones,
 * acento). NUNCA cambian los colores de estado (pagado, debe, sin confirmar, falta uno) ni los de categoría.
 * Control de contraste: el color de texto/encabezado se oscurece hasta leerse sobre blanco (4,5:1)
 * y el texto sobre el acento se elige entre blanco, negro o el color principal, el que más contraste.
 */
import { currentClubSlug } from './appDelClub';

export type MarcaClub = {
  slug: string;
  nombre: string;
  nombreCorto?: string;
  /** Ruta del logo (fondo transparente), p. ej. /clubes/padelclub/logo.png */
  logo?: string;
  colores: {
    /** Color de marca: header, botones, textos de marca. Se oscurece solo si no se lee sobre blanco. */
    principal: string;
    /** Acento: botones de alta intención, íconos destacados. */
    acento?: string;
    /** Segundo color del club (opcional): fondo de página muy suave. */
    secundario?: string;
    /** Fondo de página (si no viene, se arma con el secundario o el principal casi blanco). */
    fondo?: string;
  };
  /** Tipografías del club (Google Fonts). Si no vienen, queda Outfit. */
  fuentes?: { titulos?: string; texto?: string };
  direccion?: string;
  /** Textos de los datos de ejemplo a reemplazar (p. ej. "Jacarandás" → "Padel Club"). */
  reemplazos?: Record<string, string>;
  /** Club de la base que toma esta marca. Si no viene, el primero (en la demo hay uno solo). */
  clubBase?: string;
  /** true = es una vista para un prospecto (datos de ejemplo). */
  prospecto?: boolean;
};

let marca: MarcaClub | null = null;
export const marcaClub = () => marca;

// ---------- colores ----------
type RGB = [number, number, number];
const hexToRgb = (hex: string): RGB => {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const rgbToHex = (c: RGB) => '#' + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
const mix = (a: string, b: string, t: number) => {
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

export function variablesDeMarca(m: MarcaClub): Record<string, string> {
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
    '--color-on-action': mejorTextoSobre(acento, [brand, '#ffffff', '#111111']),
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
  return v;
}

function cargarFuentes(m: MarcaClub) {
  const familias = [m.fuentes?.titulos, m.fuentes?.texto].filter((f): f is string => !!f && /^[A-Za-z0-9 ]{2,40}$/.test(f) && f !== 'Outfit');
  if (familias.length) {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = `https://fonts.googleapis.com/css2?${familias.map((f) => `family=${f.replace(/ /g, '+')}:wght@400;500;600;700`).join('&')}&display=swap`;
    document.head.appendChild(l);
  }
  const root = document.documentElement;
  if (m.fuentes?.titulos) root.style.setProperty('--font-display', `"${m.fuentes.titulos}", system-ui, sans-serif`);
  if (m.fuentes?.texto) {
    root.style.setProperty('--font-sans', `"${m.fuentes.texto}", system-ui, sans-serif`);
    document.body.style.fontFamily = `"${m.fuentes.texto}", system-ui, sans-serif`;
  }
}

function aplicarEnLaPagina(m: MarcaClub) {
  const root = document.documentElement;
  const vars = variablesDeMarca(m);
  Object.entries(vars).forEach(([k, val]) => root.style.setProperty(k, val));
  cargarFuentes(m);
  document.body.style.backgroundColor = vars['--color-page'];
  document.title = m.nombre;
  const setMeta = (name: string, content: string) => {
    let el = document.querySelector(`meta[name="${name}"]`);
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute('name', name);
      document.head.appendChild(el);
    }
    el.setAttribute('content', content);
  };
  setMeta('theme-color', vars['--color-brand']);
  setMeta('apple-mobile-web-app-title', m.nombreCorto || m.nombre);
  if (m.logo) {
    document.querySelectorAll('link[rel="icon"]').forEach((l) => l.remove());
    const l = document.createElement('link');
    l.rel = 'icon';
    l.type = 'image/png';
    l.href = `/clubes/${m.slug}/icon-192.png`;
    document.head.appendChild(l);
  }
}

/** Busca la marca del club de esta dirección y la aplica. Se llama una vez antes de mostrar la app. */
export async function cargarMarcaClub(): Promise<MarcaClub | null> {
  const slug = currentClubSlug();
  if (!slug) return null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2500);
    const r = await fetch(`/clubes/${slug}/marca.json`, { signal: ctrl.signal, cache: 'no-cache' });
    clearTimeout(t);
    if (!r.ok || !(r.headers.get('content-type') || '').includes('json')) return null;
    const m = (await r.json()) as MarcaClub;
    if (!m?.nombre || !m?.colores?.principal) return null;
    marca = { ...m, slug };
    aplicarEnLaPagina(marca);
    return marca;
  } catch {
    return null;
  }
}

/** Reemplaza los textos de los datos de ejemplo (nombre del club de la demo) por los del club con marca. */
export function conTextosDeMarca(text: string): string {
  if (!marca?.reemplazos || !text) return text;
  let out = text;
  for (const [de, a] of Object.entries(marca.reemplazos)) out = out.split(de).join(a);
  return out;
}

/** El club de la base con el nombre, la dirección y el color de la marca. */
export function clubConMarca<T extends { id: string; name: string; address?: string }>(clubs: T[]): T[] {
  if (!marca) return clubs;
  const baseId = marca.clubBase || clubs[0]?.id;
  return clubs.map((c) =>
    c.id === baseId
      ? { ...c, name: marca!.nombre, address: marca!.direccion ?? conTextosDeMarca(c.address || '') }
      : c
  );
}
