/**
 * Arma el día de hoy de la demo alrededor de la hora actual, para que el Mostrador se vea vivo a
 * cualquier hora de apertura: 3 canchas en juego con distinto avance (un partido armado, uno que
 * debe y uno pago), la cuarta por empezar con "Falta uno" (o también en juego si ya es tarde), un
 * turno que terminó y debe, y el resto del día ocupado como un club real. Todo ficticio.
 *
 * También arma el historial de canchas desde el primer día del mes anterior hasta ayer, para que
 * "Números" (ocupación, plata, mapa de calor) dé valores creíbles y parecidos al informe del mes.
 */
import { addDaysISO, generateDaySlots, getDayOfWeekFromISO } from '../lib/padelUtils';

export type TodayRole = 'match' | 'due4' | 'paid4' | 'fu' | 'live4' | 'endedDue' | 'ana' | 'past' | 'future';

export interface TodaySlot {
  courtId: string;
  start: number;
  role: TodayRole;
}

const SLOT = 90;
const STEP = 30;

/** Minuto del día en hora de Uruguay (la demo es de un club de Montevideo). */
export function montevideoNow(now = new Date()): { date: string; minute: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Montevideo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, minute: Number(get('hour')) * 60 + Number(get('minute')) };
}

/** Generador pseudoaleatorio con semilla (el mismo día da la misma demo). */
export function seeded(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

/** Qué tan llena suele estar una cancha a esa hora (día de semana o fin de semana). */
export function busyChance(start: number, weekend: boolean): number {
  const h = start / 60;
  if (weekend) return h < 10 ? 0.55 : h < 13 ? 0.7 : h < 17 ? 0.6 : h < 22 ? 0.85 : 0.5;
  return h < 10 ? 0.4 : h < 12.5 ? 0.35 : h < 17 ? 0.45 : h < 18.5 ? 0.8 : h < 22.5 ? 0.97 : 0.6;
}

/**
 * Turnos de hoy por cancha. `n` es el minuto actual; `open`/`close` el horario del club.
 * Antes de abrir se arma el día como si fueran las 9:15 (todo queda por venir).
 */
export function planToday(params: { n: number; open: number; close: number; courtIds: string[]; today: string }): TodaySlot[] {
  const { open, close, courtIds, today } = params;
  const rand = seeded(`hoy-${today}`);
  const weekend = [0, 6].includes(getDayOfWeekFromISO(today));
  const fits = (s: number) => s >= open && s + SLOT <= close;
  const n = params.n < open + 30 || params.n >= close ? open + 75 : params.n;

  // Comienzos posibles de un turno en juego: múltiplos de 30 en (n − 90, n].
  const live: number[] = [];
  for (let s = Math.floor(n / STEP) * STEP; s > n - SLOT; s -= STEP) if (fits(s)) live.push(s);
  if (!live.length) live.push(Math.max(open, Math.min(close - SLOT, Math.floor(n / STEP) * STEP)));
  const oldest = live[live.length - 1];
  const newest = live[0];
  const middle = live[Math.floor(live.length / 2)];
  let soon = 0;
  for (let s = Math.floor(n / STEP) * STEP + STEP; s <= n + 30; s += STEP) if (fits(s)) { soon = s; break; }

  const [c1, c2, c3, c4] = courtIds;
  const anchors: TodaySlot[] = [
    { courtId: c1, start: oldest, role: 'match' },
    { courtId: c2, start: middle, role: 'due4' },
    { courtId: c3, start: newest, role: 'paid4' },
  ];
  if (c4) anchors.push(soon ? { courtId: c4, start: soon, role: 'fu' } : { courtId: c4, start: live[Math.min(1, live.length - 1)], role: 'live4' });

  const out: TodaySlot[] = [...anchors];
  let anaPlaced = false;
  for (const a of anchors) {
    // Hacia atrás: turnos que ya se jugaron.
    for (let t = a.start - SLOT; t >= open; t -= SLOT) {
      const first = t === a.start - SLOT;
      if (a.role === 'fu' && first) continue; // la cancha del "falta uno" está libre ahora
      if (a.role === 'due4' && first) {
        out.push({ courtId: a.courtId, start: t, role: 'endedDue' });
        continue;
      }
      if (!anaPlaced && a.role === 'paid4' && t + SLOT <= n) {
        out.push({ courtId: a.courtId, start: t, role: 'ana' });
        anaPlaced = true;
        continue;
      }
      if (rand() < busyChance(t, weekend)) out.push({ courtId: a.courtId, start: t, role: 'past' });
    }
    // Hacia adelante: lo que viene.
    for (let t = a.start + SLOT; t + SLOT <= close; t += SLOT) {
      if (!anaPlaced && a.role === 'paid4') {
        out.push({ courtId: a.courtId, start: t, role: 'ana' });
        anaPlaced = true;
        continue;
      }
      if (rand() < busyChance(t, weekend)) out.push({ courtId: a.courtId, start: t, role: 'future' });
    }
  }
  return out.sort((a, b) => a.start - b.start || a.courtId.localeCompare(b.courtId));
}

/**
 * Historial de canchas: desde el primer día del mes anterior hasta ayer, en los turnos de la grilla
 * del club que no estén ocupados por otra reserva de la demo.
 */
export function planHistory(params: {
  today: string;
  courtIds: string[];
  slotStarts: number[];
  taken: (date: string, courtId: string, start: number) => boolean;
}): { date: string; courtId: string; start: number }[] {
  const { today, courtIds, slotStarts, taken } = params;
  const rand = seeded(`historial-${today}`);
  const [y, m] = today.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 10);
  const out: { date: string; courtId: string; start: number }[] = [];
  for (let d = first; d < today; d = addDaysISO(d, 1)) {
    const weekend = [0, 6].includes(getDayOfWeekFromISO(d));
    for (const courtId of courtIds)
      for (const start of slotStarts) {
        if (taken(d, courtId, start)) continue;
        if (rand() < Math.min(0.98, busyChance(start, weekend) * 1.1)) out.push({ date: d, courtId, start });
      }
  }
  return out;
}

interface HistoryCtx {
  base: string;
  clubId: string;
  today: string;
  courts: { id: string; name: string }[];
  club: Parameters<typeof generateDaySlots>[0];
  /** Arma 4 jugadores de categoría pareja libres a esa hora (demoParejas.ts). */
  four: (date: string, start: number) => string[];
  staffUid: string;
  ownerUid: string;
  price: (date: string, start: number) => number;
}

/**
 * Agrega el historial de canchas (planHistory) como reservas cobradas, con un cobro por día y medio
 * de pago, y suma esos cobros a los cierres de caja que ya armó la cantina.
 */
export function addHistory(docs: { path: string; data: Record<string, unknown> }[], ctx: HistoryCtx) {
  const { base, clubId, today, courts, club, four, staffUid, ownerUid, price } = ctx;
  const bookingDocs = docs.filter((d) => d.path.startsWith(`${base}/bookings/`)).map((d) => d.data as { date: string; courtId: string; startMinute: number; endMinute: number });
  const taken = (date: string, courtId: string, start: number) =>
    bookingDocs.some((b) => b.date === date && b.courtId === courtId && b.startMinute < start + 90 && b.endMinute > start);
  const plan = planHistory({ today, courtIds: courts.map((c) => c.id), slotStarts: generateDaySlots(club).map((s) => s.startMinute), taken });
  const rand = seeded(`historial-pagos-${today}`);
  const methods = ['efectivo', 'efectivo', 'transferencia', 'debito_club', 'mercadopago'] as const;
  const byDay = new Map<string, Record<string, number>>();
  plan.forEach((p, i) => {
    const r = rand();
    const status = r < 0.025 ? 'cancelled' : r < 0.035 ? 'no_show' : 'confirmed';
    // Siempre 4 jugadores, de categoría pareja (±1), sin repetir a nadie en dos canchas a la misma hora.
    const playerUids = four(p.date, p.start);
    const creator = playerUids[0];
    const total = price(p.date, p.start);
    const method = methods[Math.floor(rand() * methods.length)];
    // Historial creíble para el informe: la mitad se reserva en el mostrador, un 8 % lo armó la app sola.
    const rt = rand();
    const type = rt < 0.5 ? 'counter' : rt < 0.92 ? 'direct' : 'matched';
    const id = `demo_bk_h${String(i + 1).padStart(4, '0')}`;
    docs.push({
      path: `${base}/bookings/${id}`,
      data: {
        id,
        clubId,
        courtId: p.courtId,
        courtName: courts.find((c) => c.id === p.courtId)!.name,
        date: p.date,
        startMinute: p.start,
        endMinute: p.start + 90,
        type,
        status,
        createdByUid: creator,
        playerUids,
        guestName: '',
        totalPrice: total,
        paidAmount: status === 'confirmed' ? total : 0,
        paymentMethod: method === 'mercadopago' ? 'mercadopago' : 'club',
        paymentStatus: status === 'confirmed' ? 'paid' : 'pending',
        holdExpiresAt: '',
      },
    });
    if (status !== 'confirmed') return;
    const day = byDay.get(p.date) ?? {};
    day[method] = (day[method] ?? 0) + total;
    byDay.set(p.date, day);
  });
  for (const [date, totals] of byDay) {
    for (const [method, amount] of Object.entries(totals)) {
      const id = `demo_pay_h_${date}_${method}`;
      docs.push({
        path: `${base}/payments/${id}`,
        data: {
          id,
          clubId,
          uid: staffUid,
          clubOwnerUid: ownerUid,
          payerName: method === 'mercadopago' ? 'Reservas pagas en la app' : 'Turnos del día',
          referenceId: '',
          amount,
          method,
          kind: 'booking_full',
          rubro: 'cancha',
          status: 'completed',
          day: date,
          staffName: method === 'mercadopago' ? '' : 'Diego Fernández',
        },
      });
    }
    // Cantina del día (agua, cerveza, pelotas…): unos $ 250 por turno jugado, en efectivo y tarjeta.
    const turns = Math.round(Object.values(totals).reduce((a, b) => a + b, 0) / 2000);
    const cantina = Math.round((turns * (180 + rand() * 140)) / 10) * 10;
    if (cantina > 0) {
      for (const [method, share] of [['efectivo', 0.7], ['debito_club', 0.3]] as const) {
        const amount = Math.round((cantina * share) / 10) * 10;
        const id = `demo_pay_hc_${date}_${method}`;
        docs.push({ path: `${base}/payments/${id}`, data: { id, clubId, uid: staffUid, clubOwnerUid: ownerUid, payerName: 'Cantina del día', referenceId: '', amount, method, kind: 'cantina', rubro: 'cantina', status: 'completed', day: date, staffName: 'Diego Fernández' } });
        totals[method] = (totals[method] ?? 0) + amount;
        totals.cantina = (totals.cantina ?? 0) + amount;
      }
    }
    // Los días con cierre de caja suman estos cobros.
    const cd = docs.find((d) => d.path === `${base}/cashDays/${date}`);
    if (cd) {
      const t = { ...(cd.data.totals as Record<string, number>) };
      for (const [method, amount] of Object.entries(totals)) t[method] = (t[method] ?? 0) + amount; // incluye la clave cantina
      t.total = (t.efectivo ?? 0) + (t.transferencia ?? 0) + (t.debito_club ?? 0) + (t.mercadopago ?? 0);
      const cash = totals.efectivo ?? 0;
      cd.data = { ...cd.data, totals: t, expectedCash: Number(cd.data.expectedCash ?? 0) + cash, countedCash: Number(cd.data.countedCash ?? 0) + cash };
    }
  }
}
