// Pruebas del planificador de partidos (etapa 3). Uso: npx tsx scripts/test-planificador.ts
import assert from 'node:assert/strict';
import { bestMatch, bestTeams, planDay, teamsForSlots, type PlayedMatch } from '../src/lib/planificador';
import type { Booking, Club, ClubMembership, Court, MatchRequest } from '../src/types/padel';

const results: string[] = [];
function step(name: string, fn: () => void) {
  try { fn(); results.push(`OK   ${name}`); } catch (e) { results.push(`FALLA ${name}: ${(e as Error).message}`); }
}

const D = '2026-11-25'; // miércoles
const club = { id: 'c', openHour: 8, closeHour: 24, slotDurationMinutes: 90 } as Club;
const courts = (n: number): Court[] => Array.from({ length: n }, (_, i) => ({ id: `k${i + 1}`, name: `Cancha ${i + 1}`, active: true } as Court));
const mem = (uid: string, category = 6, extra: Partial<ClubMembership> = {}): ClubMembership => ({ uid, displayName: uid, category, gender: 'masculino', role: 'player', blocked: false, noShowCount: 0, ...extra } as ClubMembership);
let n = 0;
const req = (uid: string, category = 6, extra: Partial<MatchRequest> = {}): MatchRequest => ({
  id: `r${n++}_${uid}`, clubId: 'c', clubIds: ['c'], creatorUid: uid, creatorName: uid, partnerUid: '', partnerName: '', partnerAccepted: true,
  category, modality: 'masculino', requestType: 'weekly', date: '', dayOfWeek: 3, startMinute: 20 * 60, endMinute: 21 * 60 + 30,
  isSameDay: false, status: 'waiting', unfilledAlertSent: false, ...extra,
} as MatchRequest);
const played = (date: string, uids: string[]): PlayedMatch => ({ date, uids });
const base = (requests: MatchRequest[], memberships: ClubMembership[], history: PlayedMatch[] = [], bookings: Booking[] = [], c = 1) =>
  ({ club, courts: courts(c), bookings, requests, memberships, history, date: D, todayISO: '2026-11-20', nowMs: 0 });

step('P1. Cinco para cuatro lugares: queda afuera el que jugó ayer, no el que lleva 3 semanas sin jugar', () => {
  const uids = ['a', 'b', 'c', 'd', 'e'];
  const plan = planDay(base(uids.map((u) => req(u)), uids.map((u) => mem(u)), [played('2026-11-24', ['e', 'x1', 'x2', 'x3']), played('2026-11-04', ['a', 'x1', 'x2', 'x3'])]));
  assert.equal(plan.length, 1);
  assert.ok(!plan[0].slots.some((s) => s.uid === 'e'), 'eligió al que jugó ayer');
  assert.ok(plan[0].slots.some((s) => s.uid === 'a'), 'dejó afuera al que lleva 3 semanas');
});

step('P2. El pedido urgente ("hoy quiero jugar") pesa más que la espera', () => {
  const uids = ['a', 'b', 'c', 'd', 'e'];
  const requests = uids.map((u) => (u === 'e' ? req(u, 6, { requestType: 'priority', date: D }) : req(u)));
  const plan = planDay(base(requests, uids.map((u) => mem(u)), [played('2026-11-24', ['e', 'x1', 'x2', 'x3'])]));
  assert.ok(plan[0].slots.some((s) => s.uid === 'e'));
});

step('P3. No repite las mismas caras si hay alternativa', () => {
  // a, b, c, d jugaron juntos 2 veces; e, f, g pueden. Dos lugares para elegir: prefiere mezclar.
  const uids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const hist = [played('2026-11-18', ['a', 'b', 'c', 'd']), played('2026-11-11', ['a', 'b', 'c', 'd']), played('2026-11-18', ['e', 'f', 'g', 'h']), played('2026-11-11', ['e', 'f', 'g', 'h'])];
  const plan = planDay(base(uids.map((u) => req(u)), uids.map((u) => mem(u)), hist, [], 2));
  assert.equal(plan.length, 2);
  for (const m of plan) {
    const s = new Set(m.slots.map((x) => x.uid));
    assert.ok(!(['a', 'b', 'c', 'd'].every((u) => s.has(u)) || ['e', 'f', 'g', 'h'].every((u) => s.has(u))), 'repitió los mismos 4');
  }
});

step('P4. Reglas duras: 1 categoría de diferencia, bloqueado afuera, ocupado afuera, pareja fija junta', () => {
  const ms = [mem('a', 5), mem('b', 6), mem('c', 6), mem('d', 7), mem('e', 6, { blocked: true }), mem('f', 6), mem('g', 6), mem('p', 6), mem('q', 6)];
  const requests = [req('a', 5), req('b'), req('c'), req('d', 7), req('e'), req('f'), req('g'), req('p', 6, { partnerUid: 'q', partnerName: 'q' })];
  const busyBooking = { id: 'bk', clubId: 'c', courtId: 'otra', courtName: '', date: D, startMinute: 20 * 60, endMinute: 21 * 60 + 30, type: 'direct', status: 'confirmed', createdByUid: 'g', playerUids: ['g'] } as Booking;
  const plan = planDay(base(requests, ms, [], [busyBooking], 3));
  for (const m of plan) {
    const cats = m.slots.map((s) => s.category);
    assert.ok(Math.max(...cats) - Math.min(...cats) <= 1, `categorías ${cats}`);
    const u = m.slots.map((s) => s.uid);
    assert.ok(!u.includes('e'), 'entró el bloqueado');
    assert.ok(!u.includes('g'), 'entró el que ya juega a esa hora');
    assert.equal(u.includes('p'), u.includes('q'), 'separó la pareja fija');
    const [t1, t2] = m.teams;
    if (u.includes('p')) assert.ok((t1.includes('p') && t1.includes('q')) || (t2.includes('p') && t2.includes('q')), 'pareja fija en equipos distintos');
  }
  assert.ok(plan.length >= 1);
});

step('P5. Equipos parejos: 5ta+6ta contra 5ta+6ta, no 5ta+5ta contra 6ta+6ta; drive con revés', () => {
  const [t1, t2] = bestTeams([{ uid: 'a', category: 5 }, { uid: 'b', category: 5 }, { uid: 'c', category: 6 }, { uid: 'd', category: 6 }]);
  const cat = (u: string) => (u === 'a' || u === 'b' ? 5 : 6);
  assert.equal(t1.reduce((s, u) => s + cat(u), 0), t2.reduce((s, u) => s + cat(u), 0));
  const side = new Map([['a', 'drive'], ['b', 'drive'], ['c', 'reves'], ['d', 'reves']] as const);
  const [x1] = bestTeams([{ uid: 'a', category: 6 }, { uid: 'b', category: 6 }, { uid: 'c', category: 6 }, { uid: 'd', category: 6 }], { side: new Map(side) });
  assert.notEqual(side.get(x1[0] as 'a'), side.get(x1[1] as 'a'), 'puso dos drive juntos');
  const t = teamsForSlots([
    { uid: 'p', category: 5, requestId: 'r1' }, { uid: 'q', category: 5, requestId: 'r1' }, { uid: 'c', category: 6, requestId: 'r2' }, { uid: 'd', category: 6, requestId: 'r3' },
  ] as never);
  assert.ok(t && (t.teamA.join() === 'p,q' || t.teamB.join() === 'p,q'), 'teamsForSlots separó la pareja fija');
});

step('P6. No pierde partidos por ser justo: con 8 que pueden a las 20 y 4 que solo pueden a las 18:30, arma los 3', () => {
  // Los 4 de las 18:30 también pueden a las 20; si los "gasta" a las 20, a las 18:30 no queda nadie.
  const early = ['e1', 'e2', 'e3', 'e4'].map((u) => req(u, 6, { startMinute: 18 * 60 + 30, endMinute: 21 * 60 + 30 }));
  const late = ['l1', 'l2', 'l3', 'l4', 'l5', 'l6', 'l7', 'l8'].map((u) => req(u, 6, { startMinute: 20 * 60, endMinute: 23 * 60 }));
  // Los de las 18:30 llevan mucho sin jugar (puntaje alto): la tentación es ponerlos a las 20.
  const hist = ['l1', 'l2', 'l3', 'l4', 'l5', 'l6', 'l7', 'l8'].map((u) => played('2026-11-24', [u, 'x', 'y', 'z']));
  const all = [...early, ...late];
  const plan = planDay(base(all, all.map((r) => mem(r.creatorUid)), hist, [], 1));
  assert.equal(plan.length, 3, `armó ${plan.length}`);
});

step('P7. bestMatch busca hoy y los 4 días siguientes y devuelve el primero que encuentra', () => {
  const uids = ['a', 'b', 'c', 'd'];
  const requests = uids.map((u) => req(u, 6, { requestType: 'priority', date: '2026-11-22' }));
  const m = bestMatch({ club, courts: courts(1), bookings: [], requests, memberships: uids.map((u) => mem(u)), history: [], todayISO: '2026-11-20', nowMs: 0 });
  assert.equal(m?.date, '2026-11-22');
});

step('P8. Club grande: 200 jugadores, 6 canchas, un día entero en menos de 3 segundos', () => {
  const ms: ClubMembership[] = [];
  const rs: MatchRequest[] = [];
  for (let i = 0; i < 200; i++) {
    const u = `g${i}`;
    const cat = 3 + (i % 5);
    ms.push(mem(u, cat));
    const start = (i % 3 === 0 ? 9 * 60 + 30 : 18 * 60 + 30);
    rs.push(req(u, cat, { startMinute: start, endMinute: start + 4 * 60 }));
  }
  const t0 = Date.now();
  const plan = planDay(base(rs, ms, [], [], 6));
  const ms_ = Date.now() - t0;
  results.push(`     (P8: ${plan.length} partidos en ${ms_} ms)`);
  assert.ok(ms_ < 3000, `${ms_} ms`);
  const seen = new Map<string, number>();
  for (const m of plan) for (const s of m.slots) {
    const k = `${s.uid}@${m.startMinute}`;
    assert.ok(!seen.has(k), 'jugador repetido en el mismo horario');
    seen.set(k, 1);
  }
});

console.log(results.join('\n'));
process.exit(results.some((x) => x.startsWith('FALLA')) ? 1 : 0);
