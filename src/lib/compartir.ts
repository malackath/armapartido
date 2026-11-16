/**
 * Link para compartir un "Falta uno" y "Cómo llegar" (16/11/2026).
 * Propuesta: project files informes/diferenciacion-mejoras/propuesta-mejoras-diferenciacion.md
 */
import type { Club } from '../types/padel';
import { MAX_CATEGORY, formatCategory, formatDateFriendly, formatMinutes } from './padelUtils';

/** Google Maps abre en la app del celular si la tiene (también en iPhone); sin API ni costo. */
export function mapsUrl(club: Pick<Club, 'name' | 'address' | 'city' | 'lat' | 'lng'>): string {
  const q = club.lat && club.lng ? `${club.lat},${club.lng}` : [club.name, club.address, club.city].filter(Boolean).join(', ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

export function mapsUrlFromQuery(q: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

/** /f/<club>/<búsqueda> */
export function fillLinkUrl(clubId: string, searchId: string, origin = typeof window !== 'undefined' ? window.location.origin : 'https://armapartido.com'): string {
  return `${origin}/f/${encodeURIComponent(clubId)}/${encodeURIComponent(searchId)}`;
}

const ID = /^[a-zA-Z0-9_-]{1,128}$/;

export function parseFillLink(pathname: string): { clubId: string; searchId: string } | null {
  const m = /^\/f\/([^/]+)\/([^/]+)\/?$/.exec(pathname);
  if (!m) return null;
  const clubId = decodeURIComponent(m[1]);
  const searchId = decodeURIComponent(m[2]);
  return ID.test(clubId) && ID.test(searchId) ? { clubId, searchId } : null;
}

/** Categorías que entran: las que respetan la diferencia máxima del club con los que ya están. */
export function categoryWindow(cats: number[], clubGap: number): { min: number; max: number } {
  if (!cats.length) return { min: 1, max: MAX_CATEGORY };
  return { min: Math.max(1, Math.max(...cats) - clubGap), max: Math.min(MAX_CATEGORY, Math.min(...cats) + clubGap) };
}

export function categoryRangeLabel(min: number, max: number): string {
  if (min === max) return formatCategory(min);
  if (max - min === 1) return `${formatCategory(min)} o ${formatCategory(max)}`;
  return `${formatCategory(min)} a ${formatCategory(max)}`;
}

export function shareMessage(p: { missing: number; date: string; startMinute: number; clubName: string; min: number; max: number; url: string }): string {
  const falta = p.missing === 1 ? 'Nos falta uno' : `Nos faltan ${p.missing}`;
  const rel = formatDateFriendly(p.date).toLowerCase();
  const day = rel === 'hoy' || rel === 'mañana' ? rel : `el ${rel}`;
  return `${falta} para jugar ${day} a las ${formatMinutes(p.startMinute)} en ${p.clubName} (${categoryRangeLabel(p.min, p.max)}). Sumate acá: ${p.url}`;
}

export function whatsappUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
