/**
 * Pareja fija sin torneo (20/11/2026, decisiones de Ber: se anota en el perfil y la app busca sola;
 * juega contra otra pareja o dos sueltos; un jugador puede tener varias, cada una con sus días).
 *
 * La pareja guarda los días y franjas en que pueden jugar juntos. El servidor mantiene, por cada
 * ventana, un pedido semanal "de pareja" (partnerUid aceptado) y el motor de siempre arma el partido.
 * Acá va solo la lógica pura, para probarla sin Firestore.
 */
import type { AvailabilityWindow, FixedPair, MatchRequest } from '../types/padel';
import { FRANJAS, GRID_DAYS, gridFromWindows, gridKey, windowsFromGrid, type GridKey } from './registro';
import { requestsOverlap } from './padelUtils';

/** Cuántas parejas fijas vivas (pendientes o activas) puede tener un jugador en un club. */
export const MAX_PAREJAS = 4;
/** Partidos por semana que busca la app para la pareja: 1, 2 o 0 = uno por cada horario marcado. */
export const PER_WEEK_OPTIONS = [1, 2, 0] as const;

const VALID_CELLS = new Set(GRID_DAYS.flatMap((d) => FRANJAS.map((_, i) => gridKey(d.dow, i))));

/** Deja solo celdas válidas de la grilla, sin repetir y en orden. */
export function cleanCells(cells: unknown): GridKey[] {
  if (!Array.isArray(cells)) return [];
  return [...new Set(cells.filter((c): c is string => typeof c === 'string' && VALID_CELLS.has(c)))].sort();
}

/** Celdas que tienen libres los dos (la propuesta inicial de la pareja). */
export function sharedCells(a: AvailabilityWindow[] = [], b: AvailabilityWindow[] = []): GridKey[] {
  const ga = gridFromWindows(a);
  const gb = gridFromWindows(b);
  return [...ga].filter((k) => gb.has(k)).sort();
}

/** Para pintar la grilla de la pareja: los dos, solo uno o ninguno. */
export function cellOwner(k: GridKey, a: AvailabilityWindow[] = [], b: AvailabilityWindow[] = []): 'both' | 'a' | 'b' | 'none' {
  const inA = gridFromWindows(a).has(k);
  const inB = gridFromWindows(b).has(k);
  return inA && inB ? 'both' : inA ? 'a' : inB ? 'b' : 'none';
}

export const windowKey = (w: AvailabilityWindow) => `${w.dayOfWeek}-${w.startMinute}-${w.endMinute}`;

/** Ventanas de la pareja (franjas seguidas del mismo día juntas). */
export function pairWindows(cells: GridKey[]): AvailabilityWindow[] {
  return windowsFromGrid(new Set(cells));
}

/** Modalidad por defecto: dos hombres → masculino, dos mujeres → femenino, si no → mixto. */
export function pairModality(g1: string, g2: string): FixedPair['modality'] {
  if (g1 === g2 && g1 === 'masculino') return 'masculino';
  if (g1 === g2 && g1 === 'femenino') return 'femenino';
  return 'mixto';
}

/** Lunes de la semana de una fecha (aaaa-mm-dd), en hora local. */
export function mondayOf(d: Date): string {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  const p = (n: number) => String(n).padStart(2, '0');
  return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`;
}

export type PairRequest = Pick<MatchRequest, 'id' | 'status' | 'windowKey' | 'closedReason'> & { updatedAtMs: number };

export interface PairSyncInput {
  pair: Pick<FixedPair, 'status' | 'searching' | 'cells' | 'perWeek'>;
  /** Pedidos de esta pareja (fixedPairId = pair.id), de cualquier estado. */
  requests: PairRequest[];
  /** Fechas (aaaa-mm-dd) de los partidos de esta pareja, armados o propuestos, que no se cancelaron. */
  matchDates: string[];
  /** Pedidos abiertos de cualquiera de los dos que NO son de esta pareja (para no pisarlos). */
  otherOpen: Pick<MatchRequest, 'requestType' | 'date' | 'dayOfWeek' | 'startMinute' | 'endMinute'>[];
  now: Date;
}

export interface PairSyncPlan {
  create: AvailabilityWindow[];
  /** Pedidos en espera que hay que cerrar (closedReason 'pareja'). */
  cancel: string[];
  /** Ventanas que no se buscan porque uno de los dos ya tiene otro pedido a esa hora. */
  clashes: AvailabilityWindow[];
  /** true si esta semana ya llegaron al tope de partidos. */
  weekFull: boolean;
}

const OPEN: MatchRequest['status'][] = ['waiting', 'proposed'];

/**
 * Qué pedidos semanales tiene que tener la pareja ahora.
 * - Pareja apagada, terminada o pendiente: se cierran los pedidos en espera (los propuestos siguen su curso).
 * - Semana llena (perWeek partidos esta semana): se cierran los en espera y no se crean nuevos hasta el lunes.
 * - Por cada ventana marcada: si no hay un pedido abierto y esta semana no se cerró ya uno (armado, rechazado
 *   o vencido), se crea uno nuevo. Así la app vuelve a buscar cada semana sin que la pareja pida nada.
 */
export function planPairSync(input: PairSyncInput): PairSyncPlan {
  const { pair, requests, matchDates, otherOpen, now } = input;
  const waiting = requests.filter((r) => r.status === 'waiting');
  if (pair.status !== 'active' || !pair.searching) return { create: [], cancel: waiting.map((r) => r.id), clashes: [], weekFull: false };

  const thisWeek = mondayOf(now);
  const playedThisWeek = matchDates.filter((d) => mondayOf(new Date(`${d}T12:00:00`)) === thisWeek).length;
  const weekFull = pair.perWeek > 0 && playedThisWeek >= pair.perWeek;

  const windows = pairWindows(pair.cells);
  const keys = new Set(windows.map(windowKey));
  const cancel = waiting.filter((r) => weekFull || !r.windowKey || !keys.has(r.windowKey)).map((r) => r.id);
  if (weekFull) return { create: [], cancel, clashes: [], weekFull };

  const create: AvailabilityWindow[] = [];
  const clashes: AvailabilityWindow[] = [];
  for (const w of windows) {
    const k = windowKey(w);
    const mine = requests.filter((r) => r.windowKey === k);
    if (mine.some((r) => OPEN.includes(r.status))) continue;
    const closedThisWeek = mine.some((r) => r.closedReason !== 'pareja' && mondayOf(new Date(r.updatedAtMs)) === thisWeek);
    if (closedThisWeek) continue;
    const asWeekly = { requestType: 'weekly' as const, date: '', dayOfWeek: w.dayOfWeek, startMinute: w.startMinute, endMinute: w.endMinute };
    if (otherOpen.some((o) => requestsOverlap(asWeekly, o))) {
      clashes.push(w);
      continue;
    }
    create.push(w);
  }
  return { create, cancel, clashes, weekFull };
}

/** "Martes y jueves de noche · sábados de mañana" para la tarjeta de la pareja (agrupa días con las mismas franjas). */
export function cellsSentence(cells: GridKey[]): string {
  const set = new Set(cells);
  const join = (w: string[]) => (w.length <= 1 ? w[0] ?? '' : `${w.slice(0, -1).join(', ')} y ${w[w.length - 1]}`);
  const groups = new Map<string, string[]>();
  for (const d of GRID_DAYS) {
    const fr = FRANJAS.map((f, i) => (set.has(gridKey(d.dow, i)) ? f.label.toLowerCase() : '')).filter(Boolean);
    if (!fr.length) continue;
    const k = join(fr);
    groups.set(k, [...(groups.get(k) ?? []), d.plural]);
  }
  const txt = [...groups.entries()].map(([fr, days]) => `${join(days)} de ${fr}`).join(' · ');
  return txt ? txt.charAt(0).toUpperCase() + txt.slice(1) : '';
}
