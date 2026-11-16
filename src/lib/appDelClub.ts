/**
 * "Tu app, con tu nombre" (parte 2.2, 16/11/2026). Cada club tiene su dirección propia
 * (<club>.armapartido.com) y, al instalarla, el ícono y el nombre son los del club.
 * El manifiesto y los íconos de cada club viven en public/clubes/<slug>/ (scripts/app-del-club.cjs).
 * index.html cambia el manifiesto antes de que cargue la app; acá está la misma regla para React.
 */

/** Subdominios que no son clubes. */
const RESERVED = new Set(['www', 'demo', 'app', 'admin', 'api', 'mail']);
export const CLUB_STORAGE_KEY = 'ap-club';

/** Clave del club en la dirección y en public/clubes/: el slug sin guiones ("los-jacarandas" → "losjacarandas"). */
export const clubAppKey = (club: { slug?: string; id: string }) => (club.slug || club.id).toLowerCase().replace(/[^a-z0-9]/g, '');

export function clubSlugFrom(hostname: string, search: string): string {
  const fromQuery = new URLSearchParams(search).get('club') || '';
  if (/^[a-z0-9-]{2,40}$/.test(fromQuery)) return fromQuery.replace(/-/g, '');
  const m = hostname.toLowerCase().match(/^([a-z0-9-]{2,40})\.armapartido\.com$/);
  if (m && !RESERVED.has(m[1])) return m[1].replace(/-/g, '');
  return '';
}

/** El club de esta dirección (o el último que se abrió con ?club=, para la app instalada). */
export function currentClubSlug(): string {
  if (typeof window === 'undefined') return '';
  const s = clubSlugFrom(window.location.hostname, window.location.search);
  try {
    if (s) localStorage.setItem(CLUB_STORAGE_KEY, s);
    return s || localStorage.getItem(CLUB_STORAGE_KEY) || '';
  } catch {
    return s;
  }
}

/**
 * Dirección para compartir. Con el dominio del club configurado en Cloudflare: https://<slug>.armapartido.com.
 * Mientras tanto (por ejemplo en la demo) se puede usar VITE_CLUB_APP_URL='https://demo.armapartido.com/?club={slug}'.
 */
export function clubAppUrl(slug: string): string {
  const pattern = (import.meta.env.VITE_CLUB_APP_URL as string | undefined) || 'https://{slug}.armapartido.com';
  return pattern.replace('{slug}', slug);
}

/** "losjacarandas.armapartido.com" sin https:// para mostrar en el cartel. */
export const prettyUrl = (url: string) => url.replace(/^https?:\/\//, '').replace(/\/$/, '');

/** Nombre corto para debajo del ícono: el que esté en el manifiesto, si no, el nombre sin "Pádel"/"Club". */
export function shortClubName(name: string): string {
  const s = name.replace(/\b(p[aá]del|club|los|las|el|la)\b/gi, ' ').replace(/\s+/g, ' ').trim();
  return (s || name).slice(0, 14);
}
