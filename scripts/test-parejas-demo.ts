/**
 * Control del mundo de demo (Ber, 17/11/2026): toda reserva con 4 jugadores, todos a ±1 categoría,
 * nadie en dos canchas a la vez, ninguna cancha con dos reservas a la misma hora.
 * Corre la demo armada a distintas horas del día: npx tsx scripts/test-parejas-demo.ts
 */
import { buildDemoWorld, type DemoUids } from '../src/demo/demoWorld';

const uids: DemoUids = { plataforma: 'u-plat', dueno: 'u-dueno', mostrador: 'u-most', cantina: 'u-cant', jugador: 'u-martin', jugadora: 'u-lucia' };
let fails = 0;
const fail = (m: string) => {
  fails++;
  if (fails < 40) console.log('  ✗', m);
};
const today = new Date().toISOString().slice(0, 10);
for (const minute of [0, 8 * 60 + 10, 9 * 60 + 15, 11 * 60, 13 * 60 + 40, 17 * 60 + 5, 19 * 60 + 50, 20 * 60 + 20, 21 * 60 + 45, 23 * 60 + 10, 23 * 60 + 55]) {
  const before = fails;
  const docs = buildDemoWorld(uids, today, minute);
  const cat = new Map<string, number>();
  docs.filter((d) => d.path.includes('/memberships/')).forEach((d) => cat.set(d.data.uid as string, d.data.category as number));
  const clients = new Map<string, number | null>();
  docs.filter((d) => d.path.includes('/clients/')).forEach((d) => clients.set(d.data.id as string, d.data.category as number | null));
  const bookings = docs.filter((d) => d.path.includes('/bookings/')).map((d) => d.data as any);
  const live = bookings.filter((b) => b.status !== 'cancelled');
  for (const b of live) {
    const tbd = b.type === 'tournament' && b.playerUids.length === 0; // final con parejas a definir
    if (!tbd && b.playerUids.length !== 4) fail(`${b.id} ${b.date} ${b.courtName} ${b.startMinute}: ${b.playerUids.length} jugadores`);
    const cats = b.playerUids.map((u: string) => (u ? cat.get(u) : clients.get(b.clientId) ?? undefined));
    const known = cats.filter((c: number | undefined) => c != null) as number[];
    if (b.playerUids.some((u: string) => u && !cat.has(u))) fail(`${b.id}: jugador sin ficha`);
    if (known.length && Math.max(...known) - Math.min(...known) > 1) fail(`${b.id} ${b.date} ${b.courtName}: categorías ${cats.join(',')}`);
    if (new Set(b.playerUids.filter(Boolean)).size !== b.playerUids.filter(Boolean).length) fail(`${b.id}: jugador repetido`);
  }
  const byDate = new Map<string, any[]>();
  live.filter((b) => b.status !== 'no_show').forEach((b) => byDate.set(b.date, [...(byDate.get(b.date) ?? []), b]));
  for (const [, list] of byDate)
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const c = list[j];
        if (!(a.startMinute < c.endMinute && c.startMinute < a.endMinute)) continue;
        if (a.courtId === c.courtId) fail(`misma cancha: ${a.id} y ${c.id} (${a.date} ${a.courtName} ${a.startMinute}/${c.startMinute})`);
        const both = a.playerUids.filter((u: string) => u && c.playerUids.includes(u));
        if (both.length) fail(`${both.join(',')} en dos canchas: ${a.id} y ${c.id} ${a.date} ${a.startMinute}`);
      }
  const pms = docs.filter((d) => d.path.includes('/proposedMatches/')).map((d) => d.data as any);
  for (const m of pms) {
    if (m.slots.length !== 4) fail(`partido ${m.id}: ${m.slots.length} lugares`);
    const cs = m.slots.map((s: any) => s.category);
    if (Math.max(...cs) - Math.min(...cs) > 1) fail(`partido ${m.id}: ${cs}`);
  }
  const t = docs.find((d) => d.path.endsWith('/tournaments/demo_torneo_primavera'))!.data as any;
  for (const m of t.matches) {
    const pl = [m.pair1Id, m.pair2Id].filter(Boolean).flatMap((id: string) => {
      const p = t.pairs.find((x: any) => x.id === id);
      return [p.player1Uid, p.player2Uid];
    });
    const cs = pl.map((u: string) => cat.get(u)!);
    if (cs.length && Math.max(...cs) - Math.min(...cs) > 1) fail(`torneo ${m.round} ${m.pair1Label} vs ${m.pair2Label}: ${cs}`);
    const bk = live.find((b) => b.type === 'tournament' && b.date === m.date && b.startMinute === m.startMinute && b.courtId === m.courtId);
    if (!bk) fail(`torneo ${m.round} sin reserva en la cancha`);
  }
  const semi = t.matches.find((m: any) => m.round === 'Semifinal');
  const n2 = docs.find((d) => d.path.endsWith('/notifications/demo_n2'))!.data.body;
  console.log(`${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')} · ${live.length} reservas · semifinal ${semi.courtName} ${semi.startMinute / 60}h · aviso: "${n2}" · ${fails === before ? 'OK' : `${fails - before} fallas`}`);
}
console.log(fails ? `\n${fails} fallas` : '\nTodo OK');
process.exit(fails ? 1 : 0);
