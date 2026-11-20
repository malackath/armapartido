/**
 * Pruebas puras de la pareja fija sin torneo (20/11/2026).
 *   npx tsx scripts/test-pareja-fija.ts
 */
import assert from 'node:assert/strict';
import { cellsSentence, cleanCells, pairModality, pairWindows, planPairSync, sharedCells, windowKey, type PairRequest } from '../src/lib/parejaFija';

let n = 0;
let bad = 0;
const t = (name: string, fn: () => void) => {
  n++;
  try {
    fn();
    console.log('OK  ', name);
  } catch (e) {
    bad++;
    console.log('MAL ', name, (e as Error).message);
  }
};

// Jueves 19/11/2026 a la tarde. La semana arranca el lunes 16.
const NOW = new Date('2026-11-19T15:00:00');
const MS = (s: string) => new Date(s).getTime();
// Martes noche (2-3), jueves noche (4-3) y sábado mañana (6-0).
const CELLS = ['2-3', '4-3', '6-0'];
const pair = { status: 'active' as const, searching: true, cells: CELLS, perWeek: 0 as const };
const W = pairWindows(CELLS);
const req = (id: string, wk: string, status: PairRequest['status'], when = '2026-11-18T10:00:00', closedReason?: 'pareja'): PairRequest => ({ id, windowKey: wk, status, updatedAtMs: MS(when), ...(closedReason ? { closedReason } : {}) });

t('PF1. Celdas: solo válidas, sin repetir y en orden', () => {
  assert.deepEqual(cleanCells(['4-3', '2-3', '2-3', '9-1', '2-9', 7, 'x']), ['2-3', '4-3']);
});

t('PF2. Horarios en común: solo lo que pueden los dos', () => {
  const a = [{ dayOfWeek: 2, startMinute: 19 * 60, endMinute: 24 * 60 }, { dayOfWeek: 1, startMinute: 15 * 60, endMinute: 19 * 60 }];
  const b = [{ dayOfWeek: 2, startMinute: 19 * 60, endMinute: 24 * 60 }, { dayOfWeek: 3, startMinute: 19 * 60, endMinute: 24 * 60 }];
  assert.deepEqual(sharedCells(a, b), ['2-3']);
});

t('PF3. Modalidad por defecto según los dos', () => {
  assert.equal(pairModality('masculino', 'masculino'), 'masculino');
  assert.equal(pairModality('femenino', 'femenino'), 'femenino');
  assert.equal(pairModality('masculino', 'femenino'), 'mixto');
});

t('PF4. Pareja nueva: crea un pedido por cada horario marcado', () => {
  const p = planPairSync({ pair, requests: [], matchDates: [], otherOpen: [], now: NOW });
  assert.equal(p.create.length, 3);
  assert.deepEqual(p.cancel, []);
});

t('PF5. No repite: si ya hay un pedido abierto para ese horario, no crea otro', () => {
  const p = planPairSync({ pair, requests: [req('r1', windowKey(W[0]), 'waiting'), req('r2', windowKey(W[1]), 'proposed')], matchDates: [], otherOpen: [], now: NOW });
  assert.deepEqual(p.create.map(windowKey), [windowKey(W[2])]);
});

t('PF6. Rechazaron o ya jugaron ese horario esta semana: no se vuelve a buscar hasta el lunes', () => {
  const p = planPairSync({ pair, requests: [req('r1', windowKey(W[0]), 'cancelled'), req('r2', windowKey(W[1]), 'confirmed')], matchDates: [], otherOpen: [], now: NOW });
  assert.deepEqual(p.create.map(windowKey), [windowKey(W[2])]);
});

t('PF7. Semana nueva: vuelve a buscar en el horario que se cerró la semana pasada', () => {
  const p = planPairSync({ pair, requests: [req('r1', windowKey(W[0]), 'confirmed', '2026-11-12T10:00:00')], matchDates: [], otherOpen: [], now: NOW });
  assert.equal(p.create.length, 3);
});

t('PF8. Lo cerró el servidor por cambio de horarios: no frena la búsqueda', () => {
  const p = planPairSync({ pair, requests: [req('r1', windowKey(W[0]), 'cancelled', '2026-11-18T10:00:00', 'pareja')], matchDates: [], otherOpen: [], now: NOW });
  assert.equal(p.create.length, 3);
});

t('PF9. Sacaron un horario: se cierra su pedido en espera', () => {
  const p = planPairSync({ pair: { ...pair, cells: ['2-3', '4-3'] }, requests: [req('r3', windowKey(W[2]), 'waiting')], matchDates: [], otherOpen: [], now: NOW });
  assert.deepEqual(p.cancel, ['r3']);
  assert.equal(p.create.length, 2);
});

t('PF10. Tope de 1 por semana: con un partido esta semana no busca más y cierra los en espera', () => {
  const p = planPairSync({ pair: { ...pair, perWeek: 1 }, requests: [req('r1', windowKey(W[0]), 'waiting')], matchDates: ['2026-11-21'], otherOpen: [], now: NOW });
  assert.equal(p.weekFull, true);
  assert.deepEqual(p.cancel, ['r1']);
  assert.deepEqual(p.create, []);
});

t('PF11. Tope de 2: con un partido todavía busca', () => {
  const p = planPairSync({ pair: { ...pair, perWeek: 2 }, requests: [], matchDates: ['2026-11-17'], otherOpen: [], now: NOW });
  assert.equal(p.weekFull, false);
  assert.equal(p.create.length, 3);
});

t('PF12. Un partido de la semana que viene no cuenta para el tope de esta', () => {
  const p = planPairSync({ pair: { ...pair, perWeek: 1 }, requests: [], matchDates: ['2026-11-24'], otherOpen: [], now: NOW });
  assert.equal(p.weekFull, false);
});

t('PF13. Si uno de los dos ya tiene otro pedido a esa hora, ese horario no se busca y se avisa', () => {
  const other = { requestType: 'weekly' as const, date: '', dayOfWeek: 2, startMinute: 20 * 60, endMinute: 22 * 60 };
  const p = planPairSync({ pair, requests: [], matchDates: [], otherOpen: [other], now: NOW });
  assert.deepEqual(p.clashes.map(windowKey), [windowKey(W[0])]);
  assert.equal(p.create.length, 2);
});

t('PF14. Apagada, pendiente o terminada: cierra los en espera y no crea nada', () => {
  for (const pp of [{ ...pair, searching: false }, { ...pair, status: 'pending' as const }, { ...pair, status: 'ended' as const }]) {
    const p = planPairSync({ pair: pp, requests: [req('r1', windowKey(W[0]), 'waiting'), req('r2', windowKey(W[1]), 'proposed')], matchDates: [], otherOpen: [], now: NOW });
    assert.deepEqual(p.cancel, ['r1']);
    assert.deepEqual(p.create, []);
  }
});

t('PF15. Frase de la tarjeta', () => {
  assert.equal(cellsSentence(CELLS), 'Martes y jueves de noche · sábados de mañana');
  assert.equal(cellsSentence(['0-0', '0-1']), 'Domingos de mañana y mediodía');
});

t('PF16. Franjas seguidas del mismo día van en un solo pedido', () => {
  const w = pairWindows(['2-2', '2-3']);
  assert.deepEqual(w, [{ dayOfWeek: 2, startMinute: 15 * 60, endMinute: 24 * 60 }]);
});

console.log(`\n${n - bad} de ${n} bien`);
process.exit(bad ? 1 : 0);
