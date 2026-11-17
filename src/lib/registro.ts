/** Registro y perfil del jugador (16/11/2026): franjas de disponibilidad y textos. Lógica pura. */
import type { AvailabilityWindow, CourtSide, Hand, Modality, UserProfile } from '../types/padel';

/** Días en el orden de la grilla (lunes primero). dayOfWeek: 0 = domingo. */
export const GRID_DAYS: { dow: number; short: string; plural: string }[] = [
  { dow: 1, short: 'L', plural: 'lunes' },
  { dow: 2, short: 'M', plural: 'martes' },
  { dow: 3, short: 'M', plural: 'miércoles' },
  { dow: 4, short: 'J', plural: 'jueves' },
  { dow: 5, short: 'V', plural: 'viernes' },
  { dow: 6, short: 'S', plural: 'sábados' },
  { dow: 0, short: 'D', plural: 'domingos' },
];

/** Franjas de la grilla, en minutos desde la medianoche. */
export const FRANJAS: { id: string; label: string; from: number; to: number }[] = [
  { id: 'manana', label: 'Mañana', from: 8 * 60, to: 12 * 60 },
  { id: 'mediodia', label: 'Mediodía', from: 12 * 60, to: 15 * 60 },
  { id: 'tarde', label: 'Tarde', from: 15 * 60, to: 19 * 60 },
  { id: 'noche', label: 'Noche', from: 19 * 60, to: 24 * 60 },
];

/** Celda de la grilla: `${dow}-${franjaIndex}`. */
export type GridKey = string;
export const gridKey = (dow: number, franja: number): GridKey => `${dow}-${franja}`;

/** Hora para mostrar: 19 * 60 → "19", 19 * 60 + 30 → "19:30". */
export function hourLabel(minute: number): string {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  return m ? `${h}:${String(m).padStart(2, '0')}` : String(h);
}

/** Marca una celda si las ventanas cubren al menos el 60 % de esa franja. */
export function gridFromWindows(windows: AvailabilityWindow[]): Set<GridKey> {
  const on = new Set<GridKey>();
  for (const d of GRID_DAYS) {
    FRANJAS.forEach((f, i) => {
      const covered = windows
        .filter((w) => w.dayOfWeek === d.dow)
        .reduce((acc, w) => acc + Math.max(0, Math.min(w.endMinute, f.to) - Math.max(w.startMinute, f.from)), 0);
      if (covered >= (f.to - f.from) * 0.6) on.add(gridKey(d.dow, i));
    });
  }
  return on;
}

/** Junta las franjas seguidas de cada día en una sola ventana. */
export function windowsFromGrid(on: Set<GridKey>): AvailabilityWindow[] {
  const out: AvailabilityWindow[] = [];
  for (const d of GRID_DAYS) {
    let cur: AvailabilityWindow | null = null;
    FRANJAS.forEach((f, i) => {
      if (on.has(gridKey(d.dow, i))) {
        if (cur && cur.endMinute === f.from) cur.endMinute = f.to;
        else {
          cur = { dayOfWeek: d.dow, startMinute: f.from, endMinute: f.to };
          out.push(cur);
        }
      } else cur = null;
    });
  }
  return out.slice(0, 21);
}

function joinWords(words: string[]): string {
  if (words.length <= 1) return words[0] ?? '';
  return `${words.slice(0, -1).join(', ')} y ${words[words.length - 1]}`;
}

/** Agrupa los días que tienen el mismo horario: [{ days: 'Martes y jueves', hours: '19 a 24' }]. */
export function describeWindows(windows: AvailabilityWindow[]): { days: string; hours: string }[] {
  const byRange = new Map<string, number[]>();
  for (const w of windows) {
    const k = `${w.startMinute}-${w.endMinute}`;
    byRange.set(k, [...(byRange.get(k) ?? []), w.dayOfWeek]);
  }
  const order = (dow: number) => GRID_DAYS.findIndex((d) => d.dow === dow);
  return [...byRange.entries()]
    .map(([k, days]) => {
      const [from, to] = k.split('-').map(Number);
      const sorted = [...new Set(days)].sort((a, b) => order(a) - order(b));
      const txt = joinWords(sorted.map((d) => GRID_DAYS[order(d)].plural));
      return { first: order(sorted[0]), from, days: txt.charAt(0).toUpperCase() + txt.slice(1), hours: `${hourLabel(from)} a ${hourLabel(to)}` };
    })
    .sort((a, b) => a.first - b.first || a.from - b.from)
    .map(({ days, hours }) => ({ days, hours }));
}

/** Una línea: "Martes y jueves de 19 a 24; sábados de 8 a 12". */
export function availabilitySentence(windows: AvailabilityWindow[]): string {
  const parts = describeWindows(windows).map((p, i) => `${i ? p.days.toLowerCase() : p.days} de ${p.hours}`);
  return parts.join('; ');
}

export const SIDE_LABEL: Record<CourtSide, string> = { drive: 'Drive', reves: 'Revés', indistinto: 'Drive o revés' };
export const HAND_LABEL: Record<Hand, string> = { derecha: 'Derecha', izquierda: 'Izquierda' };
export const MODALITY_PLURAL: Record<Modality, string> = { masculino: 'Masculinos', femenino: 'Femeninos', mixto: 'Mixtos' };

/** Lo que se muestra en la ficha debajo del nombre: lado, mano y tipo de partido. */
export function playStyleChips(p: Pick<UserProfile, 'courtSide' | 'hand' | 'preferredModality'>): string[] {
  return [p.courtSide ? SIDE_LABEL[p.courtSide] : '', p.hand ? HAND_LABEL[p.hand] : '', MODALITY_PLURAL[p.preferredModality] ?? ''].filter(Boolean);
}

/** El registro está pendiente si no hay perfil o si quedó a medias. Los perfiles viejos (sin el campo) están completos. */
export function needsSignup(profile: Pick<UserProfile, 'signupDone'> | null): boolean {
  return !profile || profile.signupDone === false;
}

// -----------------------------------------------------------------------------
// "No sé mi categoría": 5 preguntas de un toque que sugieren una categoría (16/11/2026).
// Solo sugiere de 7ma a 5ta: quien jugó torneos con categoría ya la sabe. El club la confirma después.
// Puntaje mío, a ajustar con lo que digan los clubes en las entrevistas [hipótesis].
// -----------------------------------------------------------------------------

export interface CategoryQuestion {
  id: 'tiempo' | 'frecuencia' | 'torneos' | 'pared' | 'golpes';
  q: string;
  options: [string, string, string];
}

export const CATEGORY_QUESTIONS: CategoryQuestion[] = [
  { id: 'tiempo', q: '¿Hace cuánto jugás pádel?', options: ['Menos de 6 meses', '6 meses a 2 años', 'Más de 2 años'] },
  { id: 'frecuencia', q: '¿Cuántas veces por semana?', options: ['Menos de 1', '1 o 2', '3 o más'] },
  { id: 'torneos', q: '¿Jugaste torneos?', options: ['Nunca', 'De club', 'Con categoría'] },
  { id: 'pared', q: '¿Devolvés después de que pega en la pared?', options: ['Casi nunca', 'A veces', 'Casi siempre'] },
  { id: 'golpes', q: '¿Hacés bandeja o víbora?', options: ['No', 'Bandeja', 'Las dos'] },
];

export type CategoryAnswers = Partial<Record<CategoryQuestion['id'], 0 | 1 | 2>>;

/** null = faltan respuestas · 'torneo' = que use la de su último torneo · número = categoría sugerida (5 a 7). */
export function suggestCategory(a: CategoryAnswers): number | 'torneo' | null {
  if (CATEGORY_QUESTIONS.some((x) => a[x.id] === undefined)) return null;
  if (a.torneos === 2) return 'torneo';
  const score = CATEGORY_QUESTIONS.reduce((t, x) => t + (a[x.id] ?? 0), 0);
  if (score >= 6) return 5;
  if (score >= 3) return 6;
  return 7;
}
