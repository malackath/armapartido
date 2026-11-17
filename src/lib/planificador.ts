// Planificador de partidos (etapa 3 del algoritmo, 17/11/2026).
// En vez de "el primero que aparece", mira todos los turnos con cancha libre del día y todas las
// combinaciones de 4 posibles, les pone un puntaje y elige las mejores. Reglas duras (nunca se
// negocian): cancha libre, nadie en dos lugares a la vez, misma modalidad, máximo 1 categoría
// de diferencia, la pareja fija va junta, bloqueados afuera.
// El puntaje premia al que lleva más días sin jugar y al pedido urgente, y castiga repetir las
// mismas caras. También arma los dos equipos más parejos.
// Es lógica pura: la usan el simulador y el servidor (functions/src/engine.ts).

import type { Booking, Club, ClubMembership, Court, CourtSide, MatchRequest, Modality, ProposedMatch, ProposedSlot } from '../types/padel';
import { addDaysISO, busyUidsAt, generateDaySlots, getDayOfWeekFromISO, getTodayISO, type MatchCandidateResult } from './padelUtils';

/** Lo que el planificador sabe de los partidos ya jugados (últimas 4 semanas). */
export interface PlayedMatch {
  date: string;
  uids: string[];
  /** Equipos, si se sabe: [[a, b], [c, d]]. */
  teams?: [string[], string[]];
}

/** Pesos del puntaje. Se ajustan con el simulador (scripts/simulador-partidos.ts). */
export const PESOS = {
  /** Por cada día sin jugar (hasta DIAS_TOPE). El que lleva más sin jugar va primero. */
  porDiaSinJugar: 3,
  diasTope: 28,
  /** Por cada partido que ya jugó en los últimos 7 días (reparte entre los que pueden lo mismo). */
  porPartidoEstaSemana: -25,
  /** Pedido urgente ("hoy quiero jugar"): siempre pesa más que la espera (más que 28 días + 1 partido en la semana). */
  pedidoUrgente: 150,
  /** Los 4 de la misma categoría. */
  mismaCategoria: 6,
  /** Por cada vez que dos de los 4 ya coincidieron en las últimas 4 semanas (sin contar la pareja fija). */
  porRepeticion: -12,
  /** Por cada falta sin aviso del jugador. */
  porFalta: -5,
  /** Al que tiene pocas opciones ese día se lo cuida (no gastarlo en un turno fácil). */
  escasez: 30,
  /** Por cada par de amigos en el partido (jugadores favoritos, etapa 5). */
  porAmigo: 10,
  /** Por cada propuesta que el jugador rechazó a esa hora (aprende que esa hora no le sirve). */
  porRechazoEnHora: -10,
};

/** Preferencias de cada jugador (etapa 5). "Prefiero no" es privado: nunca se muestra, solo evita juntarlos. */
export interface Affinity {
  friends?: Set<string>;
  avoid?: Set<string>;
  declineHours?: Record<string, number>;
}

/** ¿Alguno de los dos marcó "prefiero no jugar con" el otro? */
export function avoids(aff: Map<string, Affinity> | undefined, a: string, b: string): boolean {
  return !!(aff?.get(a)?.avoid?.has(b) || aff?.get(b)?.avoid?.has(a));
}

const HIST_DAYS = 28;
/** Cuántos pedidos por turno se combinan como máximo (los de más prioridad). Mantiene el cálculo chico. */
const MAX_UNITS_PER_SLOT = 18;

interface Unit {
  req: MatchRequest;
  uids: string[];
  cats: number[];
  modality: Modality;
  /** Puntaje propio (espera, urgencia, faltas), sin contar con quién juega. */
  base: number;
}

export interface PlanInput {
  club: Club;
  courts: Court[];
  bookings: Booking[];
  requests: MatchRequest[];
  memberships: ClubMembership[];
  pendingMatches?: ProposedMatch[];
  /** Partidos jugados en las últimas 4 semanas (de las reservas confirmadas). */
  history: PlayedMatch[];
  /** Día a planificar. Si falta: hoy y los 4 siguientes, en orden. */
  targetDate?: string;
  /** "Hoy" (para pruebas y el simulador). */
  todayISO?: string;
  /** Ahora en milisegundos (para el plazo de respuesta). */
  nowMs?: number;
  /** Amigos, "prefiero no" y horas que rechaza, por jugador. */
  affinity?: Map<string, Affinity>;
}

export interface PlannedMatch extends MatchCandidateResult {
  score: number;
  /** Dos equipos sugeridos (uids). La pareja fija siempre junta. */
  teams: [string[], string[]];
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);
}

/** Índice de historia: último partido, partidos recientes y cuántas veces coincidió cada par. */
export function indexHistory(history: PlayedMatch[], dateISO: string) {
  const last = new Map<string, string>();
  const week = new Map<string, number>();
  const pairs = new Map<string, number>();
  const mates = new Map<string, number>();
  for (const m of history) {
    if (m.date >= dateISO) continue; // solo lo jugado antes de ese día
    const ago = daysBetween(m.date, dateISO);
    if (ago > HIST_DAYS) continue;
    for (const u of m.uids) {
      if (!last.has(u) || last.get(u)! < m.date) last.set(u, m.date);
      if (ago <= 7) week.set(u, (week.get(u) ?? 0) + 1);
    }
    for (let i = 0; i < m.uids.length; i++)
      for (let j = i + 1; j < m.uids.length; j++) {
        const k = pairKey(m.uids[i], m.uids[j]);
        pairs.set(k, (pairs.get(k) ?? 0) + 1);
      }
    for (const t of m.teams ?? []) if (t.length === 2) mates.set(pairKey(t[0], t[1]), (mates.get(pairKey(t[0], t[1])) ?? 0) + 1);
  }
  return { last, week, pairs, mates };
}
const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/**
 * Los dos equipos más parejos (de las 3 formas posibles de partir a 4):
 * 1) suma de categorías más pareja; 2) un drive y un revés en cada equipo; 3) no repetir compañeros.
 * La pareja fija va siempre junta.
 */
export function bestTeams(
  slots: { uid: string; category: number }[],
  opts: { fixedPairs?: [string, string][]; side?: Map<string, CourtSide | undefined>; mates?: Map<string, number> } = {}
): [string[], string[]] {
  const [a, b, c, d] = slots;
  const options: [typeof slots, typeof slots][] = [
    [[a, b], [c, d]],
    [[a, c], [b, d]],
    [[a, d], [b, c]],
  ];
  const fixed = opts.fixedPairs ?? [];
  const together = (t: typeof slots, x: string, y: string) => t.some((p) => p.uid === x) && t.some((p) => p.uid === y);
  let best = options[0];
  let bestKey: number[] | null = null;
  for (const o of options) {
    if (fixed.some(([x, y]) => !(together(o[0], x, y) || together(o[1], x, y)))) continue;
    const sum = (t: typeof slots) => t.reduce((s, p) => s + p.category, 0);
    const balance = Math.abs(sum(o[0]) - sum(o[1]));
    const sides = o.reduce((n, t) => {
      const s0 = opts.side?.get(t[0].uid), s1 = opts.side?.get(t[1].uid);
      return n + (s0 && s1 && s0 !== 'indistinto' && s1 !== 'indistinto' && s0 === s1 ? 1 : 0);
    }, 0);
    const rep = o.reduce((n, t) => n + (opts.mates?.get(pairKey(t[0].uid, t[1].uid)) ?? 0), 0);
    const key = [balance, sides, rep];
    if (!bestKey || lexLess(key, bestKey)) { best = o; bestKey = key; }
  }
  return [best[0].map((p) => p.uid), best[1].map((p) => p.uid)];
}
function lexLess(x: number[], y: number[]): boolean {
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] < y[i];
  return false;
}

/** Todas las formas de juntar unidades (sueltos y parejas fijas) que sumen 4 jugadores. */
function combos(units: Unit[], cb: (g: Unit[]) => boolean | void) {
  const pick: Unit[] = [];
  let stop = false;
  const rec = (start: number, players: number, minC: number, maxC: number) => {
    if (players === 4) { if (cb(pick) === true) stop = true; return; }
    for (let i = start; i < units.length && !stop; i++) {
      const u = units[i];
      if (players + u.uids.length > 4) continue;
      const lo = Math.min(minC, ...u.cats), hi = Math.max(maxC, ...u.cats);
      if (hi - lo > 1) continue;
      if (pick.some((p) => p.uids.some((x) => u.uids.includes(x)))) continue;
      pick.push(u);
      rec(i + 1, players + u.uids.length, lo, hi);
      pick.pop();
    }
  };
  rec(0, 0, 99, -99);
}

/**
 * Cuántos partidos más se podrían armar ese día si se toma el grupo g en el turno o
 * (cuenta rápida: el primero que encuentra en cada turno, como el armado viejo).
 */
function quickCount(open: { slot: { startMinute: number }; freeCourts: number; units: Unit[] }[], o: { slot: { startMinute: number } }, g: Unit[]): number {
  const used = new Set(g.map((u) => u.req.id));
  const usedPlayers = new Set(g.flatMap((u) => u.uids));
  let n = 0;
  for (const s of open) {
    let courts = s.freeCourts - (s.slot.startMinute === o.slot.startMinute ? 1 : 0);
    const takenHere = new Set<string>(s.slot.startMinute === o.slot.startMinute ? usedPlayers : []);
    while (courts > 0) {
      const avail = s.units.filter((u) => !used.has(u.req.id) && u.uids.every((x) => !takenHere.has(x)));
      let found: Unit[] | null = null;
      const byMod = new Map<Modality, Unit[]>();
      for (const u of avail) byMod.set(u.modality, [...(byMod.get(u.modality) ?? []), u]);
      for (const list of byMod.values()) {
        combos(list, (x) => { found = [...x]; return true; });
        if (found) break;
      }
      if (!found) break;
      for (const u of found as Unit[]) { used.add(u.req.id); u.uids.forEach((x) => takenHere.add(x)); }
      courts--;
      n++;
    }
  }
  return n;
}

/**
 * Planifica un día: devuelve los partidos elegidos, el mejor primero.
 * Elige de a uno el grupo de mayor puntaje entre todos los turnos libres, lo da por armado
 * (cancha ocupada, jugadores ocupados) y vuelve a mirar.
 */
export function planDay(input: PlanInput & { date: string }): PlannedMatch[] {
  const { club, courts, memberships, date } = input;
  const activeCourts = courts.filter((c) => c.active);
  if (activeCourts.length === 0) return [];
  const dow = getDayOfWeekFromISO(date);
  const today = input.todayISO ?? getTodayISO();
  const nowMs = input.nowMs ?? Date.now();
  const memberMap = new Map(memberships.map((m) => [m.uid, m]));
  const hist = indexHistory(input.history, date);
  const aff = input.affinity;
  const bookings = [...input.bookings];

  const reqs = input.requests.filter(
    (r) =>
      r.status === 'waiting' &&
      (!r.partnerUid || r.partnerAccepted) &&
      !memberMap.get(r.creatorUid)?.blocked &&
      !(r.partnerUid && memberMap.get(r.partnerUid)?.blocked) &&
      (r.requestType === 'priority' ? r.date === date : r.dayOfWeek === dow)
  );
  if (reqs.length === 0) return [];

  const playerBase = (uid: string) => {
    const lastDate = hist.last.get(uid);
    const days = lastDate ? Math.min(PESOS.diasTope, daysBetween(lastDate, date)) : PESOS.diasTope;
    return PESOS.porDiaSinJugar * days + PESOS.porPartidoEstaSemana * (hist.week.get(uid) ?? 0) + PESOS.porFalta * (memberMap.get(uid)?.noShowCount ?? 0);
  };
  const units: Unit[] = reqs.map((r) => {
    const uids = [r.creatorUid, ...(r.partnerUid ? [r.partnerUid] : [])];
    const cats = [r.category, ...(r.partnerUid ? [memberMap.get(r.partnerUid)?.category ?? r.category] : [])];
    const base = uids.reduce((s, u) => s + playerBase(u), 0) + (r.requestType === 'priority' ? PESOS.pedidoUrgente : 0);
    return { req: r, uids, cats, modality: r.modality, base };
  });

  const daySlots = generateDaySlots(club);
  const usedUids = new Set<string>();
  const usedReqs = new Set<string>();
  const out: PlannedMatch[] = [];

  for (let guard = 0; guard < 100; guard++) {
    // Para cada unidad: en cuántos turnos libres podría jugar hoy (escasez).
    type SlotInfo = { slot: { startMinute: number; endMinute: number }; court: Court; freeCourts: number; units: Unit[] };
    const open: SlotInfo[] = [];
    for (const slot of daySlots) {
      const free = activeCourts.filter((c) => !bookings.some((b) => b.date === date && b.courtId === c.id && (b.status === 'confirmed' || b.status === 'held') && b.startMinute < slot.endMinute && b.endMinute > slot.startMinute));
      if (free.length === 0) continue;
      const busy = busyUidsAt(bookings, input.pendingMatches, date, slot.startMinute, slot.endMinute);
      const here = units.filter(
        (u) => !usedReqs.has(u.req.id) && u.uids.every((x) => !busy.has(x) && !usedUids.has(x)) && u.req.startMinute <= slot.startMinute && u.req.endMinute >= slot.endMinute
      );
      if (here.reduce((n, u) => n + u.uids.length, 0) >= 4) open.push({ slot, court: free[0], freeCourts: free.length, units: here });
    }
    if (open.length === 0) break;
    const options = new Map<string, number>();
    for (const o of open) for (const u of o.units) options.set(u.req.id, (options.get(u.req.id) ?? 0) + 1);

    // Los mejores candidatos por puntaje...
    type Cand = { o: SlotInfo; g: Unit[]; score: number; after: number };
    const top: Cand[] = [];
    const LOOKAHEAD = 12;
    for (const o of open) {
      const byMod = new Map<Modality, Unit[]>();
      for (const u of o.units) byMod.set(u.modality, [...(byMod.get(u.modality) ?? []), u]);
      for (const list of byMod.values()) {
        const pool = [...list]
          .sort((x, y) => y.base / y.uids.length - x.base / x.uids.length || (options.get(x.req.id)! - options.get(y.req.id)!))
          .slice(0, MAX_UNITS_PER_SLOT);
        combos(pool, (g) => {
          const uids = g.flatMap((u) => u.uids);
          const cats = g.flatMap((u) => u.cats);
          // Regla dura: nunca juntar a quien marcó "prefiero no jugar con" el otro.
          for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) if (avoids(aff, uids[i], uids[j])) return;
          let score = g.reduce((acc, u) => acc + u.base + PESOS.escasez / options.get(u.req.id)!, 0);
          const hourKey = String(Math.floor(o.slot.startMinute / 60));
          for (const u of uids) score += PESOS.porRechazoEnHora * Math.max(0, aff?.get(u)?.declineHours?.[hourKey] ?? 0);
          if (Math.max(...cats) === Math.min(...cats)) score += PESOS.mismaCategoria;
          for (let i = 0; i < 4; i++)
            for (let j = i + 1; j < 4; j++) {
              const sameUnit = g.some((u) => u.uids.includes(uids[i]) && u.uids.includes(uids[j]));
              if (!sameUnit) score += PESOS.porRepeticion * (hist.pairs.get(pairKey(uids[i], uids[j])) ?? 0);
              if (aff?.get(uids[i])?.friends?.has(uids[j]) || aff?.get(uids[j])?.friends?.has(uids[i])) score += PESOS.porAmigo;
            }
          if (top.length < LOOKAHEAD || score > top[top.length - 1].score + 1e-9) {
            top.push({ o, g: [...g], score, after: 0 });
            top.sort((a, b) => b.score - a.score);
            if (top.length > LOOKAHEAD) top.pop();
          }
        });
      }
    }
    if (top.length === 0) break;
    // ...y de esos, el que deja armar más partidos después (no perder partidos por ser justos).
    for (const c of top) c.after = quickCount(open, c.o, c.g);
    const maxAfter = Math.max(...top.map((c) => c.after));
    const best: Cand = top.find((c) => c.after === maxAfter)!;
    const { o, g, score } = best;

    const slots: ProposedSlot[] = g.flatMap((u) =>
      u.uids.map((uid, k) => {
        const m = memberMap.get(uid);
        return {
          uid,
          displayName: k === 0 ? u.req.creatorName : u.req.partnerName || m?.displayName || 'Pareja',
          category: u.cats[k],
          gender: m?.gender ?? 'masculino',
          status: 'pending' as const,
          paid: false,
          requestId: u.req.id,
        };
      })
    );
    const teams = bestTeams(
      slots.map((s) => ({ uid: s.uid, category: s.category })),
      {
        fixedPairs: g.filter((u) => u.uids.length === 2).map((u) => [u.uids[0], u.uids[1]] as [string, string]),
        side: new Map(slots.map((s) => [s.uid, memberMap.get(s.uid)?.courtSide])),
        mates: hist.mates,
      }
    );
    const allCats = slots.map((s) => s.category);
    const deadlineMs = date === today ? 30 * 60 * 1000 : 2 * 60 * 60 * 1000;
    out.push({
      court: o.court,
      date,
      startMinute: o.slot.startMinute,
      endMinute: o.slot.endMinute,
      modality: g[0].modality,
      minCategory: Math.min(...allCats),
      maxCategory: Math.max(...allCats),
      slots,
      usedRequestIds: g.map((u) => u.req.id),
      expiresAt: new Date(nowMs + deadlineMs).toISOString(),
      score,
      teams,
    });
    for (const u of g) { usedReqs.add(u.req.id); u.uids.forEach((x) => usedUids.add(x)); }
    bookings.push({
      id: `plan_${guard}`, clubId: club.id, courtId: o.court.id, courtName: o.court.name, date, startMinute: o.slot.startMinute, endMinute: o.slot.endMinute,
      type: 'matched', status: 'held', createdByUid: 'plan', playerUids: slots.map((s) => s.uid), guestName: '', totalPrice: 0, paidAmount: 0,
      paymentMethod: 'split', paymentStatus: 'pending', holdExpiresAt: '',
    } as Booking);
  }
  return out;
}

/** El mejor partido para armar ahora (lo que usa el servidor en cada barrida): el primer día con algo, el mejor del día. */
export function bestMatch(input: PlanInput): PlannedMatch | null {
  const today = input.todayISO ?? getTodayISO();
  const dates = input.targetDate ? [input.targetDate] : Array.from({ length: 5 }, (_, i) => addDaysISO(today, i));
  for (const date of dates) {
    const plan = planDay({ ...input, date });
    if (plan.length) return plan[0];
  }
  return null;
}

/** Historia desde las reservas confirmadas con jugadores (partidos armados, reservas propias y turnos llenados). */
export function historyFromBookings(bookings: Booking[], beforeISO: string): PlayedMatch[] {
  return bookings
    .filter((b) => b.status === 'confirmed' && b.date < beforeISO && (b.playerUids ?? []).filter(Boolean).length >= 2)
    .map((b) => ({ date: b.date, uids: b.playerUids.filter(Boolean), teams: b.teamA?.length === 2 && b.teamB?.length === 2 ? [b.teamA, b.teamB] : undefined }));
}

/** Equipos para un partido ya armado (por ejemplo cuando entra un reemplazo): la pareja fija comparte pedido. */
export function teamsForSlots(slots: ProposedSlot[]): { teamA: string[]; teamB: string[] } | null {
  if (slots.length !== 4) return null;
  const byReq = new Map<string, string[]>();
  for (const s of slots) if (s.requestId) byReq.set(s.requestId, [...(byReq.get(s.requestId) ?? []), s.uid]);
  const fixedPairs = [...byReq.values()].filter((v) => v.length === 2).map((v) => [v[0], v[1]] as [string, string]);
  const [a, b] = bestTeams(slots.map((s) => ({ uid: s.uid, category: s.category })), { fixedPairs });
  return { teamA: a, teamB: b };
}
