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
import { useSyncExternalStore } from 'react';
import { currentClubSlug } from './appDelClub';
import { contraste, legibleSobreBlanco, variablesDeMarca } from './marcaColores';
import type { Club, MarcaDatos, MarcaEsquinas, MarcaPublicada } from '../types/padel';

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
  slogan?: string;
  esquinas?: MarcaEsquinas;
  fotos?: MarcaDatos['fotos'];
  /** 'archivo' = marca.json del prospecto; 'club' = la que el club guardó en Configuración > Apariencia. */
  origen?: 'archivo' | 'club';
};

let marca: MarcaClub | null = null;
/** true = la marca vino de public/clubes/<slug>/marca.json (prospecto): manda sobre la del club. */
let marcaFija = false;
export const marcaClub = () => marca;

// Aviso a React cuando cambia la marca (al elegir otro club o cuando el club guarda cambios).
const oyentes = new Set<() => void>();
const avisar = () => oyentes.forEach((f) => f());
export const suscribirMarca = (f: () => void) => {
  oyentes.add(f);
  return () => oyentes.delete(f);
};
/** La marca aplicada ahora, para componentes de React (se actualiza sola). */
export const useMarca = () => useSyncExternalStore(suscribirMarca, marcaClub, marcaClub);

export { contraste, legibleSobreBlanco, variablesDeMarca };

const fuentesCargadas = new Set<string>();
/** Carga letras de Google Fonts (una sola vez cada una). */
export function cargarFuentesGoogle(familias: (string | undefined)[]) {
  const nuevas = familias.filter((f): f is string => !!f && /^[A-Za-z0-9 ]{2,40}$/.test(f) && f !== 'Outfit' && !fuentesCargadas.has(f));
  if (!nuevas.length || typeof document === 'undefined') return;
  nuevas.forEach((f) => fuentesCargadas.add(f));
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = `https://fonts.googleapis.com/css2?${nuevas.map((f) => `family=${f.replace(/ /g, '+')}:wght@400;500;600;700`).join('&')}&display=swap`;
  document.head.appendChild(l);
}

function cargarFuentes(m: MarcaClub) {
  cargarFuentesGoogle([m.fuentes?.titulos, m.fuentes?.texto]);
  const root = document.documentElement;
  if (m.fuentes?.titulos) root.style.setProperty('--font-display', `"${m.fuentes.titulos}", system-ui, sans-serif`);
  if (m.fuentes?.texto) {
    root.style.setProperty('--font-sans', `"${m.fuentes.texto}", system-ui, sans-serif`);
    document.body.style.fontFamily = `"${m.fuentes.texto}", system-ui, sans-serif`;
  }
}

/** Variables que puso la marca, para sacarlas al volver a Armá Partido. */
let puestas: string[] = [];
function quitarDeLaPagina() {
  const root = document.documentElement;
  puestas.forEach((k) => root.style.removeProperty(k));
  puestas = [];
  root.style.removeProperty('--font-display');
  root.style.removeProperty('--font-sans');
  document.body.style.fontFamily = '';
  document.body.style.backgroundColor = '';
}

function aplicarEnLaPagina(m: MarcaClub) {
  const root = document.documentElement;
  const vars = variablesDeMarca(m);
  quitarDeLaPagina();
  Object.entries(vars).forEach(([k, val]) => root.style.setProperty(k, val));
  puestas = Object.keys(vars);
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
  if (m.logo && m.origen !== 'club') {
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
    marca = { ...m, slug, origen: 'archivo' };
    marcaFija = true;
    aplicarEnLaPagina(marca);
    avisar();
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

// ---------- marca guardada por el club (Configuración > Apariencia) ----------

/**
 * La regla del look (recomendación técnica del alta): la app usa la marca del club solo si el club
 * tiene Imagen completa y la marca está aprobada (publicada). Si no, Armá Partido con el nombre del club.
 */
export function marcaVigente(club: Pick<Club, 'paquete' | 'marca'> | null | undefined): MarcaPublicada | null {
  if (!club || club.paquete !== 'completo' || !club.marca?.colores?.principal) return null;
  return club.marca;
}

let firmaAplicada = '';
/** Se llama cada vez que cambia el club elegido o sus datos. Aplica su marca o vuelve a la de Armá Partido. */
export function aplicarMarcaDelClub(club: Club | null) {
  if (marcaFija || typeof document === 'undefined') return;
  const m = marcaVigente(club);
  const firma = m && club ? `${club.id}:${m.version}:${club.name}` : '';
  if (firma === firmaAplicada) return;
  firmaAplicada = firma;
  if (!m || !club) {
    if (marca) {
      quitarDeLaPagina();
      marca = null;
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', '#0a5761');
      avisar();
    }
    return;
  }
  marca = {
    slug: club.slug || club.id,
    nombre: club.name,
    logo: m.logo,
    colores: { principal: m.colores.principal, acento: m.colores.acento, fondo: m.colores.fondo, secundario: m.colores.secundario },
    fuentes: m.fuentes,
    esquinas: m.esquinas,
    slogan: m.slogan,
    fotos: m.fotos,
    clubBase: club.id,
    origen: 'club',
  };
  aplicarEnLaPagina(marca);
  avisar();
}

/** Foto de encabezado de la marca para una pantalla, o la de Armá Partido. */
export function fotoDeMarca(m: MarcaClub | null, cual: 'portada' | 'reservar' | 'armar' | 'torneos', porDefecto: string): string {
  return m?.fotos?.[cual] || porDefecto;
}
