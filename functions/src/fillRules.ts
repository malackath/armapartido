// Reglas puras de "Falta uno" (sin Firestore), para poder probarlas solas.
import type {
  AlertPrefs,
  AvailabilityWindow,
  Booking,
  ClubMembership,
  FillSearch,
  Gender,
  MatchRequest,
  Modality,
} from '../../src/types/padel';
import { DEFAULT_ALERT_PREFS } from '../../src/types/padel';
import { getDayOfWeekFromISO } from '../../src/lib/padelUtils';

export const QUIET_START_HOUR = 23;
export const QUIET_END_HOUR = 8;
export const MIN_LEAD_MINUTES = 45;
export const WAVE_SIZE_PER_SEAT = 6;
export const CHOICE_DEADLINE_MINUTES = 30;

/** Fecha y hora real del turno (en la zona horaria del proceso: Montevideo). */
export function slotStart(date: string, startMinute: number): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d, Math.floor(startMinute / 60), startMinute % 60, 0, 0);
}

export function minutesUntil(date: string, startMinute: number, now: Date): number {
  return (slotStart(date, startMinute).getTime() - now.getTime()) / 60000;
}

export function isQuietHour(now: Date): boolean {
  const h = now.getHours();
  return h >= QUIET_START_HOUR || h < QUIET_END_HOUR;
}

/** Espera entre tandas y hora límite según cuánto falta (tabla 5.5 de la especificación). */
export function searchTiming(date: string, startMinute: number, now: Date): { waveGapMin: number; closesAt: Date } {
  const start = slotStart(date, startMinute).getTime();
  const left = (start - now.getTime()) / 60000;
  if (left > 24 * 60) return { waveGapMin: 60, closesAt: new Date(start - 180 * 60000) };
  if (left > 180) return { waveGapMin: 20, closesAt: new Date(start - 90 * 60000) };
  return { waveGapMin: 10, closesAt: new Date(start - MIN_LEAD_MINUTES * 60000) };
}

/** Semana de lunes a domingo, identificada por la fecha de su lunes. */
export function weekKey(now: Date): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dow = (d.getDay() + 6) % 7; // lunes = 0
  d.setDate(d.getDate() - dow);
  return isoDate(d);
}

export function isoDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export interface InviteCounter {
  week: string;
  weekCount: number;
  day: string;
  dayCount: number;
}

export function weeklyLimit(prefs: AlertPrefs): { week: number; day: number } {
  switch (prefs.weeklyInvites) {
    case 0:
      return { week: 0, day: 0 };
    case 3:
      return { week: 3, day: 1 };
    case 6:
      return { week: 6, day: 2 };
    default:
      return { week: Infinity, day: Infinity };
  }
}

export function counterFor(c: InviteCounter | undefined, now: Date): InviteCounter {
  const week = weekKey(now);
  const day = isoDate(now);
  return {
    week,
    day,
    weekCount: c && c.week === week ? c.weekCount : 0,
    dayCount: c && c.day === day ? c.dayCount : 0,
  };
}

export function prefsOf(raw: unknown): AlertPrefs {
  const p = (raw ?? {}) as Partial<AlertPrefs>;
  const w = [0, 3, 6, -1].includes(p.weeklyInvites as number) ? (p.weeklyInvites as AlertPrefs['weeklyInvites']) : DEFAULT_ALERT_PREFS.weeklyInvites;
  const g = [0, 1, 2].includes(p.maxCategoryGap as number) ? (p.maxCategoryGap as AlertPrefs['maxCategoryGap']) : DEFAULT_ALERT_PREFS.maxCategoryGap;
  return { weeklyInvites: w, maxCategoryGap: g };
}

function covers(windows: AvailabilityWindow[] | undefined, dow: number, start: number, end: number): boolean {
  return (windows ?? []).some((w) => w.dayOfWeek === dow && w.startMinute <= start && w.endMinute >= end);
}

export function genderFits(modality: Modality, genderNeeded: Gender | '', g: Gender): boolean {
  if (modality === 'masculino') return g === 'masculino';
  if (modality === 'femenino') return g === 'femenino';
  return !genderNeeded || g === genderNeeded;
}

export interface CurrentPlayer {
  uid: string;
  category: number;
  gap: number; // lo que acepta ese jugador
}

/** ¿Este jugador de categoría `cat` (que acepta `ownGap`) entra en el partido? (sección 5.1) */
export function categoryFits(cat: number, ownGap: number, clubGap: number, current: CurrentPlayer[]): boolean {
  const all = [...current.map((p) => p.category), cat];
  const spread = Math.max(...all) - Math.min(...all);
  if (spread > clubGap) return false;
  if (current.some((p) => Math.abs(p.category - cat) > ownGap)) return false;
  if (current.some((p) => Math.abs(p.category - cat) > p.gap)) return false;
  return true;
}

export interface Candidate {
  uid: string;
  displayName: string;
  category: number;
  gender: Gender;
  hasRequest: boolean; // pedido puntual que cubre el turno: no cuenta para el tope
  catDistance: number;
  weekCount: number;
  noShows: number;
  tiebreak: number;
}

/** Arma la lista ordenada de candidatos (secciones 5.3 a 5.5). */
export function rankCandidates(p: {
  search: FillSearch;
  clubGap: number;
  current: CurrentPlayer[];
  targetCategory: number;
  members: ClubMembership[];
  prefsByUid: Map<string, AlertPrefs>;
  counters: Map<string, InviteCounter | undefined>;
  bookings: Booking[];
  requests: MatchRequest[];
  now: Date;
  random?: () => number;
}): Candidate[] {
  const { search, clubGap, current, members, bookings, requests, now } = p;
  const rnd = p.random ?? Math.random;
  const dow = getDayOfWeekFromISO(search.date);
  const exclude = new Set([...search.excludedUids, ...search.invitedUids, ...search.filledUids, ...current.map((c) => c.uid)]);
  const busy = new Set<string>();
  for (const b of bookings) {
    if (b.date !== search.date || b.status === 'cancelled' || b.status === 'no_show') continue;
    if (!(b.startMinute < search.endMinute && b.endMinute > search.startMinute)) continue;
    for (const u of b.playerUids ?? []) busy.add(u);
    if (b.createdByUid) busy.add(b.createdByUid);
  }
  const withRequest = new Set(
    requests
      .filter(
        (r) =>
          r.status === 'waiting' &&
          r.requestType === 'priority' &&
          r.date === search.date &&
          r.startMinute <= search.startMinute &&
          r.endMinute >= search.endMinute
      )
      .flatMap((r) => [r.creatorUid, r.partnerUid].filter(Boolean))
  );

  const out: Candidate[] = [];
  for (const m of members) {
    if (m.role !== 'player' && m.role !== 'admin' && m.role !== 'staff') continue;
    if (exclude.has(m.uid) || busy.has(m.uid) || m.blocked) continue;
    if (!genderFits(search.modality, search.genderNeeded, m.gender)) continue;
    const prefs = p.prefsByUid.get(m.uid) ?? prefsOf(undefined);
    if (!categoryFits(m.category, prefs.maxCategoryGap, clubGap, current)) continue;
    const hasRequest = withRequest.has(m.uid);
    if (!hasRequest && !covers(m.weeklyAvailability, dow, search.startMinute, search.endMinute)) continue;
    const c = counterFor(p.counters.get(m.uid), now);
    if (!hasRequest) {
      const lim = weeklyLimit(prefs);
      if (c.weekCount >= lim.week || c.dayCount >= lim.day) continue;
    }
    out.push({
      uid: m.uid,
      displayName: m.displayName,
      category: m.category,
      gender: m.gender,
      hasRequest,
      catDistance: Math.abs(m.category - p.targetCategory),
      weekCount: c.weekCount,
      noShows: m.noShowCount ?? 0,
      tiebreak: rnd(),
    });
  }
  out.sort(
    (a, b) =>
      Number(b.hasRequest) - Number(a.hasRequest) ||
      a.catDistance - b.catDistance ||
      a.weekCount - b.weekCount ||
      Math.min(a.noShows, 1) - Math.min(b.noShows, 1) ||
      a.tiebreak - b.tiebreak
  );
  return out;
}
