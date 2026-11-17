// Pruebas del simulador del armado (etapa 2). Uso: npx tsx scripts/test-simulador.ts
import assert from 'node:assert/strict';
import { escenarioClubMediano, escenarioEjemploBer, estrategiaActual, simulate, type Strategy } from '../src/lib/simulador';
import { findMatchForClub } from '../src/lib/padelUtils';

const results: string[] = [];
function step(name: string, fn: () => void) {
  try { fn(); results.push(`OK   ${name}`); } catch (e) { results.push(`FALLA ${name}: ${(e as Error).message}`); }
}

step('S1. Escenario de Ber: 40 de 6ta, 12 lunes, 15 martes, 20 miércoles, 3 parejas fijas', () => {
  const s = escenarioEjemploBer(1);
  assert.equal(s.players.length, 40);
  assert.ok(s.players.every((p) => p.category === 6));
  const porDia = (d: number) => s.players.filter((p) => p.windows.some((w) => w.dayOfWeek === d) || (p.partnerUid && s.players.find((x) => x.uid === p.partnerUid)!.windows.some((w) => w.dayOfWeek === d))).length;
  // Las parejas fijas pueden sumar un poco: el compañero va con la disponibilidad del que carga el pedido.
  assert.ok(porDia(1) >= 12 && porDia(1) <= 15, `lunes ${porDia(1)}`);
  assert.ok(porDia(2) >= 15 && porDia(2) <= 18, `martes ${porDia(2)}`);
  assert.ok(porDia(3) >= 20 && porDia(3) <= 23, `miércoles ${porDia(3)}`);
  assert.equal(s.players.filter((p) => p.partnerUid).length, 6);
});

step('S2. Misma semilla, mismo resultado (se puede repetir)', () => {
  const a = simulate(escenarioEjemploBer(3), estrategiaActual, { weeks: 4, seed: 3 });
  const b = simulate(escenarioEjemploBer(3), estrategiaActual, { weeks: 4, seed: 3 });
  assert.deepEqual(a.matches, b.matches);
});

step('S3. El armado de hoy no pone a nadie en dos partidos a la vez ni mezcla categorías de más', () => {
  for (let k = 1; k <= 20; k++) {
    for (const s of [escenarioEjemploBer(k), escenarioClubMediano(k)]) {
      const r = simulate(s, estrategiaActual, { weeks: 4, seed: k });
      assert.equal(r.doubleBooked, 0, `${s.id} corrida ${k}`);
      assert.equal(r.categorySpreadViolations, 0, `${s.id} corrida ${k}`);
      for (const w of r.weeks) assert.ok(w.matches <= w.ceiling, `semana ${w.week}: ${w.matches} > tope ${w.ceiling}`);
    }
  }
});

step('S4. El simulador detecta a un jugador en dos partidos a la vez (estrategia rota a propósito)', () => {
  // Rompe la regla a propósito: el armado ve las canchas ocupadas pero no quién juega (como antes de la etapa 1)
  // y los pedidos usados vuelven a estar en espera.
  const rota: Strategy = {
    id: 'rota', name: 'rota',
    armar: (i) => findMatchForClub({ club: i.club, courts: i.courts, bookings: i.bookings.map((b) => ({ ...b, playerUids: [] })), requests: i.requests.map((q) => ({ ...q, status: 'waiting' as const })), memberships: i.memberships, targetDate: i.date }),
  };
  const r = simulate(escenarioEjemploBer(1), rota, { weeks: 1, seed: 1 });
  assert.ok(r.doubleBooked > 0, 'no detectó el doble partido');
});

step('S5. Cada partido tiene 4 jugadores distintos y las parejas fijas juegan juntas', () => {
  const s = escenarioEjemploBer(2);
  const r = simulate(s, estrategiaActual, { weeks: 4, seed: 2 });
  for (const m of r.matches) {
    assert.equal(new Set(m.uids).size, 4);
    for (const p of s.players) if (p.partnerUid && m.uids.includes(p.uid)) assert.ok(m.uids.includes(p.partnerUid), 'pareja fija separada');
  }
});

console.log(results.join('\n'));
process.exit(results.some((x) => x.startsWith('FALLA')) ? 1 : 0);
