/**
 * W6. Números del club (Admin): clientes, canchas y plata, cada uno comparado con el período
 * anterior y tocable para ver la lista que lo forma. Botón para bajar todo a planilla.
 * El total "lo que ganaste" del informe mensual no cambia: cuponeras, cantina y altas no suman ahí.
 */
import React, { useMemo, useState } from 'react';
import type { Booking, Club, ClubMembership, Court, ProposedMatch } from '../../types/padel';
import { RUBROS, type Rubro } from '../../types/clientes';
import {
  buildLedger,
  clientDebts,
  computeNumbers,
  dmy,
  periodOf,
  previousPeriod,
  sheetClientes,
  sheetCuponeras,
  sheetMovimientos,
  sheetResumenDiario,
  type ClubNumbers,
  type Named,
  type Period,
} from '../../lib/clientes';
import { addDaysISO, formatMinutes, formatUYU } from '../../lib/padelUtils';
import { downloadBytes, toXLSX, XLSX_MIME } from '../../lib/planilla';
import { logExport } from '../../services/clientesService';
import type { Staff } from '../../services/cajaService';
import { useOps } from '../caja/ops';
import { Chip, useClientes } from './data';

const DOW = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const DOW_INDEX = [1, 2, 3, 4, 5, 6, 0];

const Delta: React.FC<{ v: number; unit?: string; invert?: boolean }> = ({ v, unit = '', invert }) => {
  if (!v) return <span className="text-muted">= que antes</span>;
  const good = invert ? v < 0 : v > 0;
  return (
    <span className={good ? 'text-ok' : 'text-due'}>
      {v > 0 ? '▲' : '▼'} {Math.abs(v)}
      {unit}
    </span>
  );
};

type ListKey = 'altas' | 'vuelven' | 'ocupacion' | 'deuda' | 'cuponeras' | 'activos' | 'dejaron';

export const Numeros: React.FC<{
  club: Club;
  courts: Court[];
  bookings: Booking[];
  matches: ProposedMatch[];
  memberships: ClubMembership[];
  staff: Staff;
  isOwner: boolean;
  today: string;
  onToast: (m: string) => void;
}> = ({ club, courts, bookings, matches, memberships, staff, isOwner, today, onToast }) => {
  const ops = useOps();
  const cl = useClientes();
  const [pid, setPid] = useState<Period['id']>('mes');
  const [range, setRange] = useState({ from: addDaysISO(today, -29), to: today });
  const [list, setList] = useState<ListKey | null>(null);
  const nameOf = (u: string) => memberships.find((m) => m.uid === u)?.displayName ?? 'Jugador';
  const input = { club, courts, clients: cl.clients, bookings, matches, payments: ops.allPayments, sales: cl.sales, packs: cl.packs, consumptions: ops.consumptions, cashDays: ops.cashDays, today, nowMinute: new Date().getHours() * 60 + new Date().getMinutes(), nameOf };
  const period = periodOf(pid, today, range);
  const n = useMemo(() => computeNumbers(input, period), [ops, cl, bookings, matches, pid, range.from, range.to]); // eslint-disable-line react-hooks/exhaustive-deps
  const prevP = previousPeriod(period);
  const p = useMemo(() => computeNumbers(input, { ...prevP, to: prevP.to }), [ops, cl, bookings, matches, pid, range.from, range.to]); // eslint-disable-line react-hooks/exhaustive-deps
  const curMonth = periodOf('mes', today).label;
  const prevMonth = periodOf('mes_anterior', today).label;

  const bajar = async () => {
    const ledger = buildLedger(ops.allPayments, cl.sales, cl.clients, bookings, matches);
    const sheets = [sheetMovimientos(ledger, period.from, period.to), sheetResumenDiario(ops.allPayments, period.from, period.to), sheetCuponeras(cl.packs, today)];
    if (isOwner) {
      const debts = clientDebts({ clients: cl.clients, consumptions: ops.consumptions, bookings, matches, sales: cl.sales, today, nowMinute: 0, nameOf });
      const last = (c: (typeof cl.clients)[number]) => bookings.filter((b) => b.status === 'confirmed' && b.date <= today && (b.clientId === c.id || (c.uid && b.playerUids.includes(c.uid)))).map((b) => b.date).sort().pop() ?? '';
      sheets.push(sheetClientes(cl.clients, debts, last));
    }
    downloadBytes(`numeros-${club.slug || club.id}-${period.from}-al-${period.to}.xlsx`, toXLSX(sheets), XLSX_MIME);
    await logExport(club, isOwner ? 'clientes' : 'movimientos', staff, sheets.reduce((a, s) => a + s.rows.length - 1, 0));
    onToast(isOwner ? 'Planilla bajada (movimientos, resumen por día, cuponeras y clientes). Queda registrado quién la bajó.' : 'Planilla bajada.');
  };

  const lists: Record<ListKey, { title: string; items: Named[] }> = {
    altas: { title: `Altas nuevas (${n.altas.total})`, items: n.altas.list },
    vuelven: { title: `Volvieron: de ${n.vuelven.base} que vinieron en el período anterior, ${n.vuelven.count} volvieron`, items: n.vuelven.list },
    ocupacion: { title: 'Cómo se reservó', items: Object.entries(n.canchas.byChannel).map(([k, v]) => ({ key: k, name: CHANNEL[k as keyof typeof CHANNEL], detail: `${v} turnos` })) },
    deuda: { title: `Deuda abierta (${n.deuda.people} personas)`, items: n.deuda.list },
    cuponeras: { title: `Cuponeras vendidas (${n.cuponeras.sold})`, items: n.cuponeras.list },
    activos: { title: `Clientes activos (${n.activos.total})`, items: n.activos.list },
    dejaron: { title: `Dejaron de venir (${n.dejaron.count}): vinieron hace 30 a 90 días y no en los últimos 30`, items: n.dejaron.list },
  };

  return (
    <div className="space-y-5" data-testid="numeros">
      <div className="flex flex-wrap items-center gap-1.5">
        <Chip on={pid === 'semana'} onClick={() => setPid('semana')}>Semana</Chip>
        <Chip on={pid === 'mes'} onClick={() => setPid('mes')}>{curMonth}</Chip>
        <Chip on={pid === 'mes_anterior'} onClick={() => setPid('mes_anterior')}>{prevMonth}</Chip>
        <Chip on={pid === 'rango'} onClick={() => setPid('rango')}>Rango</Chip>
        {pid === 'rango' && (
          <span className="flex items-center gap-1 text-[13px]">
            <input type="date" value={range.from} max={range.to} onChange={(e) => setRange({ ...range, from: e.target.value })} className="rounded-xl border border-line bg-white px-2 py-1" aria-label="Desde" />
            al
            <input type="date" value={range.to} min={range.from} onChange={(e) => setRange({ ...range, to: e.target.value })} className="rounded-xl border border-line bg-white px-2 py-1" aria-label="Hasta" />
          </span>
        )}
        <button type="button" onClick={bajar} className="ml-auto rounded-full border border-line bg-white px-3.5 py-1.5 text-[13px] font-semibold text-brand hover:bg-mist cursor-pointer">
          Bajar a planilla
        </button>
      </div>
      <p className="-mt-3 text-[12.5px] text-muted">
        Del {dmy(period.from)} al {dmy(n.upTo)}
        {n.upTo < period.to ? ' (hasta hoy)' : ''}. Comparado con el {dmy(prevP.from)} al {dmy(prevP.to)}.
      </p>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Kpi k="altas" on={list} set={setList} value={String(n.altas.total)} label="altas nuevas" sub={<><Delta v={n.altas.total - p.altas.total} /> · {n.altas.sinApp} sin app</>} />
        <Kpi k="vuelven" on={list} set={setList} value={`${n.vuelven.pct}%`} label="volvieron del período anterior" sub={<Delta v={n.vuelven.pct - p.vuelven.pct} unit=" pts" />} />
        <Kpi k="ocupacion" on={list} set={setList} value={`${n.canchas.occupancyPct}%`} label="ocupación" sub={<><Delta v={n.canchas.occupancyPct - p.canchas.occupancyPct} unit=" pts" /> · {n.canchas.played} turnos</>} />
        <Kpi k="deuda" on={list} set={setList} tone="due" value={formatUYU(n.deuda.total)} label={`deuda abierta · ${n.deuda.people} ${n.deuda.people === 1 ? 'persona' : 'personas'}`} sub={n.deuda.aging.gt30 ? <span className="text-due">{formatUYU(n.deuda.aging.gt30)} hace +30 días</span> : <span className="text-muted">nada de hace más de 30 días</span>} />
        <Kpi k="cuponeras" on={list} set={setList} value={String(n.cuponeras.sold)} label="cuponeras vendidas" sub={<span className="font-semibold text-ink">{formatUYU(n.cuponeras.pendingValue)} sin usar</span>} />
        <Kpi k="activos" on={list} set={setList} value={`${n.activos.conAppPct}%`} label={`de ${n.activos.total} clientes activos con app`} sub={<Delta v={n.activos.conAppPct - p.activos.conAppPct} unit=" pts" />} />
      </div>

      {list && (
        <section className="rounded-2xl border-2 border-brand/30 bg-white p-4" data-testid="lista-numero">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-display text-[15px] font-bold text-ink">{lists[list].title}</h3>
            <button type="button" onClick={() => setList(null)} className="text-[13px] font-semibold text-muted cursor-pointer">Cerrar</button>
          </div>
          {lists[list].items.length === 0 ? (
            <p className="mt-2 text-[13px] text-muted">Nadie en este período.</p>
          ) : (
            <ul className="mt-2 grid gap-x-6 sm:grid-cols-2">
              {lists[list].items.slice(0, 80).map((it) => (
                <li key={it.key} className="flex justify-between gap-2 border-b border-[#eef5f5] py-1.5 text-[13px]">
                  <span className="truncate text-ink">{it.name}</span>
                  <span className="shrink-0 text-muted">{it.detail}</span>
                </li>
              ))}
            </ul>
          )}
          {list === 'altas' && <p className="mt-2 text-[12px] text-muted">Por dónde llegaron: {Object.entries(n.altas.byOrigin).filter(([, v]) => v).map(([k, v]) => `${ORIGIN_SHORT[k]} ${v}`).join(' · ') || 'ninguna'}.</p>}
        </section>
      )}

      <div className="grid items-start gap-5 xl:grid-cols-2">
        <Box title="Ventas por rubro" note="Lo cobrado en el período. Usar una cuponera o saldo no suma: la plata entró cuando se vendió.">
          <Bars byRubro={n.plata.byRubro} />
        </Box>
        <Box title="Ocupación por franja" note="Turnos jugados sobre turnos posibles, por día de la semana y hora.">
          <Heat n={n} />
        </Box>
        <Box title="Plata">
          <Line l="Cobrado en el club y por Mercado Pago" v={formatUYU(n.plata.totalCobrado)} strong />
          <Line l="Efectivo" v={formatUYU(n.plata.byMethod.efectivo)} />
          <Line l="Transferencia" v={formatUYU(n.plata.byMethod.transferencia)} />
          <Line l="Tarjeta (POS del club)" v={formatUYU(n.plata.byMethod.debito_club)} />
          <Line l="Mercado Pago" v={formatUYU(n.plata.byMethod.mercadopago)} />
          <Line l="Pagado con saldo a favor (no es plata nueva)" v={formatUYU(n.plata.paidWithBalance)} />
          <Line l="Ticket por turno (cancha + cantina)" v={formatUYU(n.plata.ticketPorTurno)} />
          <Line l={`Diferencias de caja (${n.plata.cashDiffDays} cierres)`} v={formatUYU(n.plata.cashDiff)} tone={n.plata.cashDiff < 0 ? 'due' : undefined} />
          <Line l="Con factura emitida" v={formatUYU(n.plata.invoice.emitida)} />
          <Line l="Factura pendiente" v={formatUYU(n.plata.invoice.pendiente)} tone={n.plata.invoice.pendiente ? 'wait' : undefined} />
          <Line l="Saldo a favor que el club debe hoy" v={formatUYU(n.saldoAFavor)} />
        </Box>
        <Box title="Canchas y cuponeras">
          <Line l="Turnos jugados" v={String(n.canchas.played)} strong />
          <Line l="Cancelados" v={String(n.canchas.cancelled)} />
          <Line l="Ausencias" v={String(n.canchas.noShows)} />
          <Line l="Pagados con cuponera (partes o turnos)" v={String(n.canchas.withPack)} />
          {Object.entries(n.canchas.byChannel).map(([k, v]) => (
            <Line key={k} l={`Reservados ${CHANNEL_LINE[k as keyof typeof CHANNEL_LINE]}`} v={String(v)} />
          ))}
          <Line l="Usos de cuponera en el período" v={String(n.cuponeras.uses)} />
          <Line l={`Vencieron sin usar (${n.cuponeras.expiredUnused})`} v={formatUYU(n.cuponeras.expiredUnusedValue)} />
          <Line l="Cuponeras: ya cobrado y todavía sin usar" v={formatUYU(n.cuponeras.pendingValue)} strong />
        </Box>
      </div>

      <Box title={`Dejaron de venir (${n.dejaron.count})`} note="Vinieron hace 30 a 90 días y no en los últimos 30. Una lista para llamarlos.">
        {n.dejaron.list.length === 0 ? (
          <p className="text-[13px] text-muted">Nadie. Todos los que venían siguen viniendo.</p>
        ) : (
          <ul className="grid gap-x-6 sm:grid-cols-2">
            {n.dejaron.list.slice(0, 20).map((it) => (
              <li key={it.key} className="flex justify-between gap-2 border-b border-[#eef5f5] py-1.5 text-[13px]">
                <span className="truncate text-ink">{it.name}</span>
                <span className="shrink-0 text-muted">{it.detail}</span>
              </li>
            ))}
          </ul>
        )}
      </Box>
      <p className="text-[12.5px] text-muted">El total "lo que ganaste" del informe mensual no cambia: cuponeras, cantina y altas no suman ahí. Estos números van en "cómo anduvo el mes".</p>
    </div>
  );
};

const CHANNEL = { app: 'Por la app', telefono: 'Por teléfono', mostrador: 'En el mostrador', armado: 'Partido armado', fijo: 'Turno fijo', torneo: 'Torneo' };
const CHANNEL_LINE = { app: 'por la app', telefono: 'por teléfono', mostrador: 'en el mostrador', armado: 'con partido armado', fijo: 'como turno fijo', torneo: 'para torneo' };
const ORIGIN_SHORT: Record<string, string> = { app: 'app', mostrador: 'mostrador', telefono: 'teléfono', migracion: 'migración', falta_uno: 'Falta uno', torneo: 'torneo' };

const Kpi: React.FC<{ k: ListKey; on: ListKey | null; set: (k: ListKey | null) => void; value: string; label: string; sub: React.ReactNode; tone?: 'due' }> = ({ k, on, set, value, label, sub, tone }) => (
  <button
    type="button"
    onClick={() => set(on === k ? null : k)}
    className={`rounded-2xl border bg-white px-4 py-3.5 text-left hover:shadow-sm cursor-pointer ${on === k ? 'border-2 border-brand' : 'border-line'}`}
    aria-pressed={on === k}
  >
    <p className={`font-display text-[28px] leading-tight font-bold tabular-nums ${tone === 'due' ? 'text-due' : 'text-brand'}`}>{value}</p>
    <p className="text-[13px] text-muted">{label}</p>
    <p className="mt-0.5 text-[12.5px] font-semibold">{sub}</p>
  </button>
);

const Box: React.FC<{ title: string; note?: string; children: React.ReactNode }> = ({ title, note, children }) => (
  <section className="rounded-2xl border border-line bg-white p-5">
    <h3 className="mb-3 text-xs font-semibold tracking-wider text-muted uppercase">{title}</h3>
    {children}
    {note && <p className="mt-3 text-[12px] text-muted">{note}</p>}
  </section>
);

const Line: React.FC<{ l: string; v: string; strong?: boolean; tone?: 'due' | 'wait' }> = ({ l, v, strong, tone }) => (
  <div className={`flex items-baseline justify-between gap-3 border-b border-[#eef5f5] py-1.5 text-[13.5px] last:border-0 ${strong ? 'font-bold text-ink' : ''}`}>
    <span className={strong ? '' : 'text-muted'}>{l}</span>
    <span className={`tabular-nums ${tone === 'due' ? 'text-due' : tone === 'wait' ? 'text-wait' : 'text-ink'}`}>{v}</span>
  </div>
);

const Bars: React.FC<{ byRubro: Record<Rubro, number> }> = ({ byRubro }) => {
  const items = RUBROS.map((r) => ({ ...r, v: byRubro[r.id] })).filter((r) => r.v !== 0).sort((a, b) => b.v - a.v);
  const max = Math.max(1, ...items.map((i) => i.v));
  if (!items.length) return <p className="text-[13px] text-muted">Sin ventas en el período.</p>;
  return (
    <div className="space-y-2">
      {items.map((i) => (
        <div key={i.id} className="grid grid-cols-[88px_1fr_90px] items-center gap-3 text-[13.5px]">
          <span className="text-ink">{i.id === 'saldo' ? 'Carga saldo' : i.label}</span>
          <span className="h-3 rounded-full bg-mist">
            <span className="block h-3 rounded-full bg-brand" style={{ width: `${Math.max(3, (i.v / max) * 100)}%` }} />
          </span>
          <span className="text-right font-semibold tabular-nums text-ink">{formatUYU(i.v)}</span>
        </div>
      ))}
    </div>
  );
};

const heatColor = (pct: number) => (pct >= 85 ? '#0a4a52' : pct >= 65 ? '#0f6b70' : pct >= 45 ? '#2e8f91' : pct >= 25 ? '#7fc4c5' : pct > 0 ? '#c4e6e6' : '#eef7f7');

const Heat: React.FC<{ n: ClubNumbers }> = ({ n }) => {
  const at = (dow: number, s: number) => n.canchas.heat.find((h) => h.dow === dow && h.startMinute === s);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[300px] border-separate border-spacing-1 text-[11px]">
        <thead>
          <tr>
            <th />
            {DOW.map((d, i) => (
              <th key={i} className="font-semibold text-muted">
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {n.canchas.slots.map((s) => (
            <tr key={s}>
              <td className="pr-1 text-right tabular-nums text-muted">{formatMinutes(s)}</td>
              {DOW_INDEX.map((dow) => {
                const h = at(dow, s);
                return <td key={dow} title={h ? `${h.pct}%` : 'sin datos'} className="h-5 rounded-[5px]" style={{ background: h ? heatColor(h.pct) : '#f5f9f9' }} />;
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted">
        Vacío <span className="inline-block h-2.5 w-16 rounded-full" style={{ background: 'linear-gradient(90deg,#eef7f7,#7fc4c5,#0a4a52)' }} /> lleno
      </p>
    </div>
  );
};
