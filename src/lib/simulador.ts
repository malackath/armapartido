// Simulador del armado de partidos (etapa 2 del algoritmo, 17/11/2026).
// Arma un club ficticio, carga los pedidos de cada jugador semana a semana y corre una estrategia
// de armado. Mide cuántos partidos salen, quién queda afuera (y si son siempre los mismos),
// cuántas veces se repiten las mismas caras y si alguien quedó en dos partidos a la vez.
// No toca Firebase: es todo en memoria, para comparar "el armado de hoy" con el planificador nuevo.

import type { Booking, Club, ClubMembership, Court, MatchRequest, ProposedMatch } from '../types/padel';
import { planDay, type PlayedMatch } from './planificador';
import { addDaysISO, busyUidsAt, findMatchForClub, generateDaySlots, getDayOfWeekFromISO, type MatchCandidateResult } from './padelUtils';

// ---------- azar con semilla (para que cada corrida se pueda repetir) ----------
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle<T>(arr: T[], r: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- escenario ----------
export interface SimWindow {
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
}
export interface SimPlayer {
  uid: string;
  name: string;
  category: number;
  /** Cuándo puede jugar en la semana (carga un pedido semanal por cada franja). */
  windows: SimWindow[];
  /** Pareja fija: vienen juntos, el pedido lo carga el primero de los dos. */
  partnerUid?: string;
}
export interface Scenario {
  id: string;
  title: string;
  description: string;
  courts: number;
  openHour: number;
  closeHour: number;
  players: SimPlayer[];
}

/** Lo que una estrategia de armado recibe en cada vuelta y lo que tiene que devolver. */
export interface ArmadoInput {
  club: Club;
  courts: Court[];
  bookings: Booking[];
  requests: MatchRequest[];
  memberships: ClubMembership[];
  pendingMatches: ProposedMatch[];
  date: string;
  /** Historia del simulador hasta ahora (para estrategias que miran justicia y repetición). */
  history: SimMatch[];
}
export interface Strategy {
  id: string;
  name: string;
  armar(input: ArmadoInput): MatchCandidateResult | null;
}

/** El armado que corre hoy en el servidor (findMatchForClub), un día por vez. */
export const estrategiaActual: Strategy = {
  id: 'actual',
  name: 'Armado de hoy (el primero que encuentra)',
  armar: (i) =>
    findMatchForClub({
      club: i.club,
      courts: i.courts,
      bookings: i.bookings,
      requests: i.requests,
      memberships: i.memberships,
      pendingMatches: i.pendingMatches,
      targetDate: i.date,
    }),
};

/** El planificador nuevo (etapa 3): mejor puntaje con justicia por espera y anti-repetición. */
export const estrategiaPlanificador: Strategy = {
  id: 'planificador',
  name: 'Planificador nuevo (el mejor posible)',
  armar: (i) => {
    const history: PlayedMatch[] = i.history.map((m) => ({ date: m.date, uids: m.uids }));
    const plan = planDay({
      club: i.club, courts: i.courts, bookings: i.bookings, requests: i.requests, memberships: i.memberships,
      pendingMatches: i.pendingMatches, history, date: i.date, todayISO: i.date,
    });
    return plan[0] ?? null;
  },
};

export interface SimMatch {
  week: number;
  date: string;
  dayOfWeek: number;
  courtId: string;
  startMinute: number;
  endMinute: number;
  uids: string[];
}

// ---------- métricas ----------
export interface WeekStats {
  week: number;
  matches: number;
  /** Máximo de partidos posibles esa semana (jugadores disponibles por día / 4, con tope de canchas). */
  ceiling: number;
  availablePlayers: number;
  playersWhoPlayed: number;
}
export interface SimResult {
  scenarioId: string;
  strategyId: string;
  weeks: WeekStats[];
  matches: SimMatch[];
  /** Partidos por jugador en todo el período. */
  perPlayer: Map<string, number>;
  /** Jugadores que podían jugar (había 4 en su horario) y no jugaron ni una vez en todo el período. */
  neverPlayed: string[];
  /** Jugadores que nunca tuvieron 4 en su horario (ningún armado los podía juntar). */
  noOneToPlay: string[];
  /** Jugadores con disponibilidad (los que cuentan para las medidas de justicia). */
  withAvailability: string[];
  /** Semanas seguidas sin jugar (la peor racha de cada jugador). */
  worstDrought: Map<string, number>;
  /** De los que quedaron afuera un día, cuántos ya habían quedado afuera ese mismo día la semana anterior. */
  sameLeftOutRate: number;
  /** Parejas de jugadores que coincidieron en 3 o más partidos. */
  repeatedTrios: number;
  /** Promedio de caras distintas con las que jugó cada uno. */
  avgDistinctMates: number;
  /** Partido con 4 jugadores de distinta categoría por más de 1 (debería ser 0). */
  categorySpreadViolations: number;
  /** Jugadores en dos partidos que se pisan (debería ser 0). */
  doubleBooked: number;
  /** Canchas-turno libres en las franjas donde había gente disponible. */
  freeCourtSlotsWithDemand: number;
}

function makeClub(s: Scenario): { club: Club; courts: Court[] } {
  const club = {
    id: 'sim', name: 'Club simulado', slug: 'sim', primaryColor: '#000', accentColor: '#000', address: '', city: 'Montevideo',
    lat: 0, lng: 0, ownerUid: 'owner', slotDurationMinutes: 90, openHour: s.openHour, closeHour: s.closeHour,
    basePrice: 2000, nightFromHour: 18, nightPrice: 2400, weekendPrice: 2400, cancellationHours: 24, maxNoShowsBeforeBlock: 3,
    mpEnabled: false, mpMode: 'full', mpDepositPercent: 0, subscriptionStatus: 'active', monthlyPricePerCourt: 0, courtCount: s.courts, active: true,
  } as Club;
  const courts: Court[] = Array.from({ length: s.courts }, (_, i) => ({
    id: `c${i + 1}`, clubId: 'sim', name: `Cancha ${i + 1}`, roof: 'techada', surface: 'cristal', hasLights: true, active: true,
  } as Court));
  return { club, courts };
}

/**
 * Tope de partidos de un día: se agrupan los pedidos cuyas franjas se tocan (los de mañana por un lado,
 * los de noche por otro) y en cada grupo entran como mucho (jugadores / 4) partidos, sin pasar de las
 * canchas por los turnos que abarca el grupo. Es un techo aproximado (optimista): sirve de referencia.
 */
function dayCeiling(requests: MatchRequest[], slots: { startMinute: number; endMinute: number }[], courtCount: number): number {
  const rs = [...requests].sort((a, b) => a.startMinute - b.startMinute);
  let total = 0;
  let i = 0;
  while (i < rs.length) {
    let end = rs[i].endMinute;
    const start = rs[i].startMinute;
    const people = new Set<string>();
    while (i < rs.length && rs[i].startMinute < end) {
      end = Math.max(end, rs[i].endMinute);
      [rs[i].creatorUid, rs[i].partnerUid].filter(Boolean).forEach((u) => people.add(u));
      i++;
    }
    const slotCount = slots.filter((s) => s.startMinute >= start && s.endMinute <= end).length;
    total += Math.min(Math.floor(people.size / 4), slotCount * courtCount);
  }
  return total;
}

/** Primer lunes a partir de una fecha. */
function mondayFrom(iso: string): string {
  let d = iso;
  while (getDayOfWeekFromISO(d) !== 1) d = addDaysISO(d, 1);
  return d;
}

export function simulate(s: Scenario, strategy: Strategy, opts: { weeks: number; seed: number; startISO?: string }): SimResult {
  const r = rng(opts.seed);
  const { club, courts } = makeClub(s);
  const memberships: ClubMembership[] = s.players.map((p) => ({
    uid: p.uid, clubId: 'sim', displayName: p.name, role: 'player', category: p.category, gender: 'masculino',
    preferredModality: 'masculino', weeklyAvailability: p.windows, noShowCount: 0, blocked: false, isDiscoverable: true,
  } as ClubMembership));
  const byUid = new Map(s.players.map((p) => [p.uid, p]));
  const partnerOf = new Map<string, string>();
  for (const p of s.players) if (p.partnerUid) { partnerOf.set(p.uid, p.partnerUid); partnerOf.set(p.partnerUid, p.uid); }
  // De cada pareja fija, carga el pedido uno solo.
  const requesters = s.players.filter((p) => !p.partnerUid || p.uid < p.partnerUid);

  const firstMonday = mondayFrom(opts.startISO ?? '2026-11-23');
  const all: SimMatch[] = [];
  const weeks: WeekStats[] = [];
  const slots = generateDaySlots(club);
  let freeWithDemand = 0;
  const everPlayable = new Set<string>();
  let sameLeftOut = 0;
  let leftOutTotal = 0;
  let prevLeftOut = new Map<number, Set<string>>(); // día de la semana -> afuera la semana anterior

  for (let w = 0; w < opts.weeks; w++) {
    const bookings: Booking[] = [];
    const leftOutThisWeek = new Map<number, Set<string>>();
    let ceiling = 0;
    const available = new Set<string>();
    const played = new Set<string>();
    let weekMatches = 0;

    for (let d = 0; d < 7; d++) {
      const date = addDaysISO(firstMonday, w * 7 + d);
      const dow = getDayOfWeekFromISO(date);
      // Cada semana la gente vuelve a cargar sus pedidos; el orden en que llegan cambia.
      let n = 0;
      const requests: MatchRequest[] = shuffle(requesters, r).flatMap((p) =>
        p.windows
          .filter((win) => win.dayOfWeek === dow)
          .map((win) => {
            const partner = p.partnerUid ? byUid.get(p.partnerUid) : undefined;
            return {
              id: `req_${w}_${d}_${n++}_${p.uid}`, clubId: 'sim', clubIds: ['sim'], creatorUid: p.uid, creatorName: p.name,
              partnerUid: partner?.uid ?? '', partnerName: partner?.name ?? '', partnerAccepted: true, category: p.category,
              modality: 'masculino', requestType: 'weekly', date: '', dayOfWeek: dow, startMinute: win.startMinute, endMinute: win.endMinute,
              isSameDay: false, status: 'waiting', unfilledAlertSent: false,
            } as MatchRequest;
          })
      );
      const dayAvail = new Set(requests.flatMap((q) => [q.creatorUid, q.partnerUid].filter(Boolean)));
      dayAvail.forEach((u) => available.add(u));
      ceiling += dayCeiling(requests, slots, courts.length);

      const dayMatches: SimMatch[] = [];
      for (let guard = 0; guard < 200; guard++) {
        const c = strategy.armar({ club, courts, bookings, requests, memberships, pendingMatches: [], date, history: all });
        if (!c) break;
        const id = `bk_${w}_${d}_${guard}`;
        bookings.push({
          id, clubId: 'sim', courtId: c.court.id, courtName: c.court.name, date, startMinute: c.startMinute, endMinute: c.endMinute,
          type: 'matched', status: 'confirmed', createdByUid: 'sim', playerUids: c.slots.map((x) => x.uid), guestName: '',
          totalPrice: 0, paidAmount: 0, paymentMethod: 'split', paymentStatus: 'pending', holdExpiresAt: '',
        } as Booking);
        for (const q of requests) if (c.usedRequestIds.includes(q.id)) q.status = 'confirmed';
        const m: SimMatch = { week: w, date, dayOfWeek: dow, courtId: c.court.id, startMinute: c.startMinute, endMinute: c.endMinute, uids: c.slots.map((x) => x.uid) };
        dayMatches.push(m);
        all.push(m);
      }
      weekMatches += dayMatches.length;
      const playedToday = new Set(dayMatches.flatMap((m) => m.uids));
      playedToday.forEach((u) => played.add(u));

      // Afuera hoy = disponible hoy y sin partido hoy.
      // "Sin remedio": en ningún turno de su franja había 4 jugadores que pudieran (nadie lo podía armar).
      const playable = new Set<string>();
      for (const slot of slots) {
        const here = new Set(
          requests.filter((q) => q.startMinute <= slot.startMinute && q.endMinute >= slot.endMinute).flatMap((q) => [q.creatorUid, q.partnerUid].filter(Boolean))
        );
        // Cuenta como "podía jugar" si en ese turno había 4 (con él) dentro de 1 categoría de diferencia.
        const list = [...here];
        for (const u of list) {
          const c = byUid.get(u)!.category;
          const ok = [c - 1, c].some((lo) => list.filter((x) => { const k = byUid.get(x)!.category; return k >= lo && k <= lo + 1; }).length >= 4);
          if (ok) playable.add(u);
        }
      }
      playable.forEach((u) => everPlayable.add(u));
      const out = new Set([...dayAvail].filter((u) => !playedToday.has(u) && playable.has(u)));
      leftOutThisWeek.set(dow, out);
      const prev = prevLeftOut.get(dow);
      if (prev && out.size) {
        leftOutTotal += out.size;
        sameLeftOut += [...out].filter((u) => prev.has(u)).length;
      }

      // Canchas libres en un horario donde al menos 4 podían (pero el armado no los juntó).
      for (const slot of slots) {
        const busyNow = busyUidsAt(bookings, [], date, slot.startMinute, slot.endMinute);
        const canPlay = [...new Set(
          requests.filter((q) => q.status === 'waiting' && q.startMinute <= slot.startMinute && q.endMinute >= slot.endMinute)
            .flatMap((q) => [q.creatorUid, q.partnerUid].filter(Boolean))
            .filter((u) => !busyNow.has(u))
        )];
        const freeCourts = courts.filter((ct) => !bookings.some((b) => b.date === date && b.courtId === ct.id && b.startMinute < slot.endMinute && b.endMinute > slot.startMinute)).length;
        // Hacen falta 4 dentro de 1 categoría de diferencia (la regla del armado).
        const cats = canPlay.map((u) => byUid.get(u)!.category);
        const fourCompatible = cats.some((c) => cats.filter((x) => x >= c && x <= c + 1).length >= 4);
        if (fourCompatible && freeCourts > 0) freeWithDemand += 1;
      }
    }
    prevLeftOut = leftOutThisWeek;
    weeks.push({ week: w + 1, matches: weekMatches, ceiling, availablePlayers: available.size, playersWhoPlayed: played.size });
  }

  // ---- métricas del período ----
  const perPlayer = new Map<string, number>(s.players.map((p) => [p.uid, 0]));
  for (const m of all) for (const u of m.uids) perPlayer.set(u, (perPlayer.get(u) ?? 0) + 1);
  const withAvail = s.players.filter((p) => p.windows.length > 0 || (p.partnerUid && byUid.get(p.partnerUid)!.windows.length > 0));
  const neverPlayed = withAvail.filter((p) => !perPlayer.get(p.uid) && everPlayable.has(p.uid)).map((p) => p.uid);
  const noOneToPlay = withAvail.filter((p) => !everPlayable.has(p.uid)).map((p) => p.uid);

  const worstDrought = new Map<string, number>();
  for (const p of withAvail.filter((x) => everPlayable.has(x.uid))) {
    let run = 0, worst = 0;
    for (let w = 0; w < opts.weeks; w++) {
      if (all.some((m) => m.week === w && m.uids.includes(p.uid))) run = 0;
      else worst = Math.max(worst, ++run);
    }
    worstDrought.set(p.uid, worst);
  }

  const pairCount = new Map<string, number>();
  const mates = new Map<string, Set<string>>();
  for (const m of all) {
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
      const [a, b] = [m.uids[i], m.uids[j]].sort();
      const fixed = partnerOf.get(a) === b; // la pareja fija juega junta a propósito
      if (!fixed) pairCount.set(`${a}|${b}`, (pairCount.get(`${a}|${b}`) ?? 0) + 1);
      if (!mates.has(a)) mates.set(a, new Set());
      if (!mates.has(b)) mates.set(b, new Set());
      mates.get(a)!.add(b); mates.get(b)!.add(a);
    }
  }
  const repeatedTrios = [...pairCount.values()].filter((v) => v >= 3).length;
  const playedPlayers = [...mates.keys()];
  const avgDistinctMates = playedPlayers.length ? playedPlayers.reduce((a, u) => a + mates.get(u)!.size, 0) / playedPlayers.length : 0;

  const catOf = new Map(s.players.map((p) => [p.uid, p.category]));
  const categorySpreadViolations = all.filter((m) => {
    const cats = m.uids.map((u) => catOf.get(u)!);
    return Math.max(...cats) - Math.min(...cats) > 1;
  }).length;

  let doubleBooked = 0;
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    const a = all[i], b = all[j];
    if (a.date !== b.date || !(a.startMinute < b.endMinute && a.endMinute > b.startMinute)) continue;
    doubleBooked += a.uids.filter((u) => b.uids.includes(u)).length;
  }

  return {
    scenarioId: s.id, strategyId: strategy.id, weeks, matches: all, perPlayer, neverPlayed, noOneToPlay,
    withAvailability: withAvail.filter((p) => everPlayable.has(p.uid)).map((p) => p.uid), worstDrought,
    sameLeftOutRate: leftOutTotal ? sameLeftOut / leftOutTotal : 0,
    repeatedTrios, avgDistinctMates, categorySpreadViolations, doubleBooked, freeCourtSlotsWithDemand: freeWithDemand,
  };
}

// ---------- escenarios ----------
const LUNES = 1, MARTES = 2, MIERCOLES = 3, JUEVES = 4, VIERNES = 5;
const H = (h: number, m = 0) => h * 60 + m;

/** El ejemplo de Ber: 40 de 6ta; 12 pueden el lunes, 15 el martes, 20 el miércoles; casi todos de noche; algunas parejas fijas. */
export function escenarioEjemploBer(seed = 1): Scenario {
  const r = rng(seed * 7919);
  const players: SimPlayer[] = Array.from({ length: 40 }, (_, i) => ({ uid: `j${String(i + 1).padStart(2, '0')}`, name: `Jugador ${i + 1}`, category: 6, windows: [] }));
  const franja = (): [number, number] => {
    const x = r();
    if (x < 0.55) return [H(18, 30), H(23)]; // después del trabajo
    if (x < 0.85) return [H(20), H(23)]; // más tarde
    return [H(8), H(12, 30)]; // de mañana
  };
  for (const [dow, n] of [[LUNES, 12], [MARTES, 15], [MIERCOLES, 20]] as const) {
    for (const p of shuffle(players, r).slice(0, n)) {
      const [a, b] = franja();
      p.windows.push({ dayOfWeek: dow, startMinute: a, endMinute: b });
    }
  }
  // 3 parejas fijas: juegan juntas, el pedido lo carga uno (con la disponibilidad del que lo carga).
  for (let k = 0; k < 3; k++) {
    const a = players[k * 2], b = players[k * 2 + 1];
    a.partnerUid = b.uid; b.partnerUid = a.uid;
    if (a.windows.length === 0) a.windows = [...b.windows];
    b.windows = [];
  }
  return {
    id: 'ejemplo-ber',
    title: 'Tu ejemplo: 40 jugadores de 6ta',
    description: '40 jugadores de 6ta. 12 pueden el lunes, 15 el martes y 20 el miércoles. La mayoría de noche (18:30 a 23 o 20 a 23), algunos de mañana. 3 parejas fijas. Club de 4 canchas, de 8 a 24, turnos de 90 minutos.',
    courts: 4, openHour: 8, closeHour: 24, players,
  };
}

/** Club mediano real: 80 jugadores de 4ta a 7ma, de lunes a viernes, con más demanda que canchas de noche. */
export function escenarioClubMediano(seed = 1): Scenario {
  const r = rng(seed * 104729);
  const cats = [4, 5, 5, 6, 6, 6, 7, 7];
  const players: SimPlayer[] = Array.from({ length: 80 }, (_, i) => ({ uid: `m${String(i + 1).padStart(2, '0')}`, name: `Jugador ${i + 1}`, category: cats[Math.floor(r() * cats.length)], windows: [] }));
  for (const p of players) {
    const dias = shuffle([LUNES, MARTES, MIERCOLES, JUEVES, VIERNES], r).slice(0, 1 + Math.floor(r() * 3));
    for (const dow of dias) {
      const x = r();
      const [a, b] = x < 0.6 ? [H(18, 30), H(23)] : x < 0.85 ? [H(20), H(23)] : [H(9, 30), H(14)];
      p.windows.push({ dayOfWeek: dow, startMinute: a, endMinute: b });
    }
  }
  for (let k = 0; k < 5; k++) {
    const a = players[k * 2], b = players[k * 2 + 1];
    b.category = a.category;
    a.partnerUid = b.uid; b.partnerUid = a.uid;
    b.windows = [];
  }
  return {
    id: 'club-mediano',
    title: 'Club mediano: 80 jugadores de 4ta a 7ma',
    description: '80 jugadores de 4ta a 7ma (más 6ta y 7ma). Cada uno puede 1 a 3 días de lunes a viernes, casi todos de noche. 5 parejas fijas. 3 canchas: de noche hay más gente que canchas.',
    courts: 3, openHour: 8, closeHour: 24, players,
  };
}
