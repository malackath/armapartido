// Pruebas de la categoría sugerida y la racha (etapa 6a). Uso: npx tsx scripts/test-resultados.ts
import assert from 'node:assert/strict';
import { playerStreak, suggestCategory, type MyResult } from '../src/lib/resultados';

const results: string[] = [];
function step(name: string, fn: () => void) {
  try { fn(); results.push(`OK   ${name}`); } catch (e) { results.push(`FALLA ${name}: ${(e as Error).message}`); }
}
const r = (n: number, won: boolean, rivalCats = [6, 6]): MyResult => ({ date: `2026-11-${String(n).padStart(2, '0')}`, won, rivalCats });

step('C1. Con menos de 10 partidos no sugiere nada', () => {
  assert.equal(suggestCategory(6, Array.from({ length: 9 }, (_, i) => r(i + 1, true))), null);
});
step('C2. 7 de 10 ganados, 3 contra su categoría: sugiere subir', () => {
  const xs = [...Array.from({ length: 4 }, (_, i) => r(i + 1, true, [7, 7])), ...Array.from({ length: 3 }, (_, i) => r(i + 5, true, [6, 6])), ...Array.from({ length: 3 }, (_, i) => r(i + 8, false))];
  const s = suggestCategory(6, xs);
  assert.equal(s?.to, 5);
  assert.match(s!.reason, /Ganó 7 de sus últimos 10 partidos, 3 contra parejas de 6ta/);
});
step('C3. 7 de 10 pero casi todos contra parejas de abajo: no sugiere', () => {
  const xs = [...Array.from({ length: 5 }, (_, i) => r(i + 1, true, [7, 7])), ...Array.from({ length: 2 }, (_, i) => r(i + 6, true)), ...Array.from({ length: 3 }, (_, i) => r(i + 8, false))];
  assert.equal(suggestCategory(6, xs), null);
});
step('C4. Pierde 8 de 10: sugiere bajar; 7 de 10 no', () => {
  const xs = (lost: number) => Array.from({ length: 10 }, (_, i) => r(i + 1, i >= lost));
  assert.equal(suggestCategory(6, xs(8))?.to, 7);
  assert.equal(suggestCategory(6, xs(7)), null);
});
step('C5. Mira solo los 10 más nuevos; 1ra no sube y 7ma no baja', () => {
  const old = Array.from({ length: 10 }, (_, i) => r(i + 1, false));
  const fresh = Array.from({ length: 10 }, (_, i) => r(i + 11, i % 2 === 0));
  assert.equal(suggestCategory(6, [...old, ...fresh]), null);
  assert.equal(suggestCategory(1, Array.from({ length: 10 }, (_, i) => r(i + 1, true, [1, 1]))), null);
  assert.equal(suggestCategory(7, Array.from({ length: 10 }, (_, i) => r(i + 1, false))), null);
});
step('C6. Racha: semanas seguidas, este mes y jugados (la semana actual sin jugar no corta)', () => {
  // Hoy martes 17/11/2026. Jugó las semanas del 10, 3 y 27/10; no la del 20/10.
  const s = playerStreak(['2026-11-12', '2026-11-04', '2026-11-05', '2026-10-28', '2026-10-15', '2026-12-01'], '2026-11-17');
  assert.deepEqual(s, { played: 5, thisMonth: 3, weeksInARow: 3 });
  assert.equal(playerStreak(['2026-11-16'], '2026-11-17').weeksInARow, 1);
});
console.log(results.join('\n'));
process.exit(results.some((x) => x.startsWith('FALLA')) ? 1 : 0);
