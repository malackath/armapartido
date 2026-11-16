/**
 * Importar la planilla de jugadores en Admin → Clientes (parte 2.3, 16/11/2026).
 * Wireframe aprobado: project files informes/diferenciacion-mejoras/wireframes-parte2-demo-5-minutos.png (3).
 * Puro: lo usan la pantalla (para mostrar los números antes de cargar) y el servidor (que vuelve a calcular todo).
 *
 * Cada jugador de la planilla queda como ficha de cliente (origen "migracion"), con o sin mail.
 * Si ya hay una ficha con ese mail o celular, no se duplica: se completa lo que le falta.
 * Cuando el jugador se registra en la app con ese mail verificado, la ficha (y su turno fijo) se le une sola.
 */
import type { ClubClient } from '../types/clientes';
import { normalizeEmail, normalizePhone as phoneE164 } from './clientes';
import type { CleanPlayer, MigrationReport } from './migracion';

export interface ImportRow {
  row: number;
  name: string;
  email: string;
  /** "+59899123456" o '' */
  phone: string;
  category: number | null;
  fixed: CleanPlayer['fixed'];
}

export interface ImportPlan {
  create: ImportRow[];
  /** Ya tenían ficha en el club: se completa mail, celular o categoría si faltaban. */
  update: { row: ImportRow; clientId: string; patch: { email?: string; phone?: string; noPhone?: boolean; category?: number } }[];
  counts: {
    found: number;
    withPhone: number;
    withCategory: number;
    merged: number;
    fixed: number;
    review: number;
    already: number;
  };
}

/** Del informe de la planilla a filas listas para cargar (con y sin mail). */
export function rowsFromReport(report: MigrationReport): ImportRow[] {
  return [...report.ready, ...report.noEmail]
    .sort((a, b) => a.row - b.row)
    .map((p) => ({
      row: p.row,
      name: p.name.trim().replace(/\s+/g, ' ').slice(0, 80),
      email: normalizeEmail(p.email).slice(0, 120),
      phone: phoneE164(p.phone),
      category: p.category,
      fixed: p.fixed,
    }));
}

export function planImport(rows: ImportRow[], existing: ClubClient[], extra: { merged: number; discarded: number }): ImportPlan {
  const active = existing.filter((c) => c.status === 'active' && !c.erased);
  const byEmail = new Map<string, ClubClient>();
  const byPhone = new Map<string, ClubClient>();
  for (const c of active) {
    if (c.email) byEmail.set(c.email, c);
    if (c.phone) byPhone.set(c.phone, c);
  }
  const plan: ImportPlan = {
    create: [],
    update: [],
    counts: {
      found: rows.length,
      withPhone: rows.filter((r) => r.phone).length,
      withCategory: rows.filter((r) => r.category !== null).length,
      merged: extra.merged,
      fixed: rows.filter((r) => r.fixed).length,
      review: extra.discarded,
      already: 0,
    },
  };
  for (const r of rows) {
    const twin = (r.email && byEmail.get(r.email)) || (r.phone && byPhone.get(r.phone)) || undefined;
    if (!twin) {
      plan.create.push(r);
      continue;
    }
    const patch: ImportPlan['update'][number]['patch'] = {};
    if (!twin.email && r.email && !byEmail.has(r.email)) patch.email = r.email;
    if (!twin.phone && r.phone && !byPhone.has(r.phone)) {
      patch.phone = r.phone;
      patch.noPhone = false;
    }
    if (twin.category === null && r.category !== null) patch.category = r.category;
    plan.update.push({ row: r, clientId: twin.id, patch });
    plan.counts.already += 1;
  }
  return plan;
}

/** Turno fijo en texto: "martes 19:30 · Cancha 1". */
const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
export function fixedLabel(f: NonNullable<CleanPlayer['fixed']>): string {
  const hm = `${String(Math.floor(f.startMinute / 60)).padStart(2, '0')}:${String(f.startMinute % 60).padStart(2, '0')}`;
  const court = f.court ? (/^\d+$/.test(f.court.trim()) ? `Cancha ${f.court.trim()}` : f.court) : '';
  return `${DAYS[f.dayOfWeek]} ${hm}${court ? ` · ${court}` : ''}`;
}

/** Cancha de la planilla ("1", "Cancha 1", "cancha uno" no) → cancha del club. */
export function matchCourt<T extends { id: string; name: string; active: boolean }>(courts: T[], raw: string): T | undefined {
  const name = (raw || '').trim().toLowerCase();
  if (!name) return undefined;
  const num = name.replace(/\D/g, '');
  return courts.find((c) => c.active && (c.name.toLowerCase() === name || (num !== '' && c.name.replace(/\D/g, '') === num)));
}
