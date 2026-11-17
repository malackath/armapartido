// Corre el simulador del armado de partidos y deja un informe.
// Uso: npx tsx scripts/simulador-partidos.ts [carpeta-salida] [corridas=30] [semanas=4]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { escenarioClubMediano, escenarioEjemploBer, estrategiaActual, estrategiaPlanificador, simulate, type Scenario, type SimResult, type Strategy } from '../src/lib/simulador';

const out = process.argv[2] || 'sim-salida';
const runs = Number(process.argv[3] || 30);
const weeks = Number(process.argv[4] || 4);
mkdirSync(out, { recursive: true });

const strategies: Strategy[] = [estrategiaActual, estrategiaPlanificador];
const scenarios: ((seed: number) => Scenario)[] = [escenarioEjemploBer, escenarioClubMediano];

interface Agg {
  scenario: Scenario;
  strategy: Strategy;
  matchesPerWeek: number;
  ceilingPerWeek: number;
  pctPlayedWeek: number;
  neverPlayed: number;
  noOneToPlay: number;
  players: number;
  fairnessGap: number;
  worstDrought: number;
  droughtTwoPlus: number;
  sameLeftOut: number;
  repeated: number;
  distinctMates: number;
  freeWithDemand: number;
  doubleBooked: number;
  spread: number;
  example?: SimResult;
}
const mkScenarioCache = new Map<SimResult, Map<string, string>>();
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);

const aggs: Agg[] = [];
for (const mk of scenarios) {
  for (const st of strategies) {
    const res: SimResult[] = [];
    let scen: Scenario | null = null;
    for (let k = 1; k <= runs; k++) {
      const s = mk(k);
      scen ??= s;
      const r = simulate(s, st, { weeks, seed: k });
      // Clave de "mismos días": los días de la semana en que puede (o su pareja fija, si el pedido lo carga ella).
      const byUid = new Map(s.players.map((p) => [p.uid, p]));
      const key = new Map(s.players.map((p) => {
        const w = p.windows.length ? p.windows : (p.partnerUid ? byUid.get(p.partnerUid)!.windows : []);
        return [p.uid, w.map((x) => x.dayOfWeek).sort().join(',')];
      }));
      mkScenarioCache.set(r, key);
      res.push(r);
    }
    aggs.push({
      scenario: scen!,
      strategy: st,
      matchesPerWeek: avg(res.map((r) => avg(r.weeks.map((w) => w.matches)))),
      ceilingPerWeek: avg(res.map((r) => avg(r.weeks.map((w) => w.ceiling)))),
      pctPlayedWeek: avg(res.map((r) => avg(r.weeks.map((w) => w.playersWhoPlayed / (w.availablePlayers || 1))))),
      neverPlayed: avg(res.map((r) => r.neverPlayed.length)),
      noOneToPlay: avg(res.map((r) => r.noOneToPlay.length)),
      fairnessGap: avg(res.map((r) => {
        // Entre jugadores que pueden los mismos días: diferencia entre el que más jugó y el que menos.
        const groups = new Map<string, number[]>();
        const sc = mkScenarioCache.get(r)!;
        for (const u of r.withAvailability) {
          const key = sc.get(u) ?? '';
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key)!.push(r.perPlayer.get(u) ?? 0);
        }
        const gaps = [...groups.values()].filter((g) => g.length >= 2).map((g) => Math.max(...g) - Math.min(...g));
        return avg(gaps);
      })),
      players: avg(res.map((r) => r.weeks[0].availablePlayers)),
      worstDrought: Math.max(...res.map((r) => Math.max(0, ...r.worstDrought.values()))),
      droughtTwoPlus: avg(res.map((r) => [...r.worstDrought.values()].filter((v) => v >= 2).length)),
      sameLeftOut: avg(res.map((r) => r.sameLeftOutRate)),
      repeated: avg(res.map((r) => r.repeatedTrios)),
      distinctMates: avg(res.map((r) => r.avgDistinctMates)),
      freeWithDemand: avg(res.map((r) => r.freeCourtSlotsWithDemand / weeks)),
      doubleBooked: res.reduce((a, r) => a + r.doubleBooked, 0),
      spread: res.reduce((a, r) => a + r.categorySpreadViolations, 0),
      example: res[0],
    });
  }
}

const f1 = (x: number) => x.toFixed(1).replace('.', ',');
const pct = (x: number) => `${Math.round(x * 100)} %`;
let md = `# Simulador del armado de partidos\n\n`;
md += `Corrido el ${new Date().toLocaleString('es-UY', { timeZone: 'America/Montevideo' })}. ${runs} corridas por escenario (cada una con otro sorteo de quién puede qué día y en qué orden cargan los pedidos), ${weeks} semanas seguidas cada una. Promedios salvo que diga otra cosa.\n\n`;
md += `Cada semana los jugadores vuelven a cargar su pedido semanal; se supone que todos aceptan la propuesta.\n\n`;
for (const a of aggs) {
  md += `## ${a.scenario.title} · ${a.strategy.name}\n\n${a.scenario.description}\n\n`;
  md += `| Medida | Valor |\n|---|---|\n`;
  md += `| Partidos por semana | ${f1(a.matchesPerWeek)} (tope aproximado ${f1(a.ceilingPerWeek)}) |\n`;
  md += `| Jugadores disponibles que juegan al menos una vez por semana | ${pct(a.pctPlayedWeek)} |\n`;
  md += `| Jugadores que podían jugar y en ${weeks} semanas no jugaron nunca | ${f1(a.neverPlayed)} de ${f1(a.players)} |\n`;
  md += `| Jugadores sin remedio (nunca hubo 4 en su horario) | ${f1(a.noOneToPlay)} |\n`;
  md += `| Diferencia de partidos entre jugadores que pueden los mismos días (el que más menos el que menos, en ${weeks} semanas) | ${f1(a.fairnessGap)} |\n`;
  md += `| Jugadores con 2 o más semanas seguidas sin jugar | ${f1(a.droughtTwoPlus)} |\n`;
  md += `| Peor racha sin jugar (en todas las corridas) | ${a.worstDrought} semanas |\n`;
  md += `| De los que quedan afuera un día pudiendo jugar, ya habían quedado afuera ese día la semana anterior | ${pct(a.sameLeftOut)} |\n`;
  md += `| Pares de jugadores que coincidieron 3 o más veces (sin contar parejas fijas) | ${f1(a.repeated)} |\n`;
  md += `| Caras distintas con las que jugó cada uno | ${f1(a.distinctMates)} |\n`;
  md += `| Turnos con cancha libre y 4 o más que podían, sin partido (por semana) | ${f1(a.freeWithDemand)} |\n`;
  md += `| Jugadores en dos partidos a la misma hora (total) | ${a.doubleBooked} |\n`;
  md += `| Partidos con más de 1 categoría de diferencia (total) | ${a.spread} |\n\n`;
  if (a.example) {
    const counts = a.example.withAvailability.map((u) => a.example!.perPlayer.get(u) ?? 0);
    const hist = new Map<number, number>();
    for (const c of counts) hist.set(c, (hist.get(c) ?? 0) + 1);
    md += `Ejemplo (corrida 1): partidos por jugador en ${weeks} semanas → ${[...hist.entries()].sort((x, y) => x[0] - y[0]).map(([k, v]) => `${v} ${v === 1 ? 'jugó' : 'jugaron'} ${k}`).join(', ')}.\n\n`;
  }
}
writeFileSync(join(out, 'simulador-resultado.md'), md);
writeFileSync(join(out, 'simulador-resultado.json'), JSON.stringify(aggs.map(({ example, scenario, strategy, ...x }) => ({ scenario: scenario.id, strategy: strategy.id, ...x })), null, 2));
console.log(md);
