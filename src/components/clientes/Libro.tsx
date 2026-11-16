/**
 * W5. El libro del club (Admin, Caja): cada cobro con su rubro, medio, quién cobró y casilla de
 * factura, más los usos de cuponera y saldo (que no son plata nueva) y lo anotado a cuenta.
 * Nada se borra: lo anulado queda tachado con su motivo.
 */
import React, { useMemo, useState } from 'react';
import type { Booking, Club, ProposedMatch } from '../../types/padel';
import { RUBROS, type InvoiceStatus } from '../../types/clientes';
import { buildLedger, dmy, periodOf, sheetMovimientos, sheetResumenDiario, type LedgerRow } from '../../lib/clientes';
import { formatUYU } from '../../lib/padelUtils';
import { downloadBytes, toCSV, toXLSX, CSV_MIME, XLSX_MIME } from '../../lib/planilla';
import { logExport, setInvoice } from '../../services/clientesService';
import type { Staff } from '../../services/cajaService';
import { StatusChip } from '../ui/People';
import { useOps } from '../caja/ops';
import { Chip, useClientes } from './data';

type When = 'hoy' | 'semana' | 'mes' | 'mes_anterior';
const sel = 'rounded-full border border-line bg-white px-3 py-1.5 text-[13px] font-semibold text-ink cursor-pointer';

const InvoiceChip: React.FC<{ r: LedgerRow }> = ({ r }) => {
  if (r.voided) return <StatusChip kind="due">Anulado</StatusChip>;
  if (r.invoice === 'emitida') return <StatusChip kind="ok">{r.invoiceNumber || 'Emitida'}</StatusChip>;
  if (r.invoice === 'pendiente') return <StatusChip kind="wait">Pendiente</StatusChip>;
  if (r.invoice === 'al_cobrar') return <span className="text-[12px] text-muted">al cobrar</span>;
  return <span className="text-[12px] text-muted">no corresp.</span>;
};

const hhmm = (ms: number) => (ms ? new Date(ms).toTimeString().slice(0, 5) : '');

export const Libro: React.FC<{ club: Club; bookings: Booking[]; matches: ProposedMatch[]; staff: Staff; today: string; onToast: (m: string) => void }> = ({ club, bookings, matches, staff, today, onToast }) => {
  const { allPayments } = useOps();
  const { sales, clients } = useClientes();
  const [when, setWhen] = useState<When>('hoy');
  const [rubro, setRubro] = useState('todos');
  const [medio, setMedio] = useState('todos');
  const [fact, setFact] = useState<'todas' | InvoiceStatus>('todas');
  const [picked, setPicked] = useState<string[]>([]);
  const [number, setNumber] = useState('');
  const [busy, setBusy] = useState(false);
  const ledger = useMemo(() => buildLedger(allPayments, sales, clients, bookings, matches), [allPayments, sales, clients, bookings, matches]);
  const range = when === 'hoy' ? { from: today, to: today } : periodOf(when, today);
  const rows = ledger.filter(
    (r) =>
      r.day >= range.from &&
      r.day <= range.to &&
      (rubro === 'todos' || r.rubro === rubro) &&
      (medio === 'todos' || r.method === medio) &&
      (fact === 'todas' || (r.invoice === fact && !r.voided))
  );
  const methods = [...new Set(ledger.map((r) => r.method))].sort();
  const money = rows.filter((r) => r.kind === 'cobro' || r.kind === 'anulacion' || r.kind === 'retiro').reduce((a, r) => a + r.amount, 0);
  const selectable = (r: LedgerRow) => !!r.payment && !r.voided && r.kind === 'cobro' && r.amount > 0;

  const mark = async (status: InvoiceStatus) => {
    setBusy(true);
    try {
      await setInvoice(club, picked, status, number);
      onToast(status === 'emitida' ? `${picked.length} ${picked.length === 1 ? 'cobro marcado' : 'cobros marcados'} como facturados.` : 'Listo.');
      setPicked([]);
      setNumber('');
    } finally {
      setBusy(false);
    }
  };

  const bajar = async (csv: boolean) => {
    const mov = sheetMovimientos(rows, range.from, range.to);
    const name = `movimientos-${club.slug || club.id}-${range.from}${range.to !== range.from ? `-al-${range.to}` : ''}`;
    if (csv) downloadBytes(`${name}.csv`, toCSV(mov.rows), CSV_MIME);
    else downloadBytes(`${name}.xlsx`, toXLSX([mov, sheetResumenDiario(allPayments, range.from, range.to)]), XLSX_MIME);
    await logExport(club, 'libro', staff, mov.rows.length - 1);
  };

  return (
    <section className="rounded-2xl border border-line bg-white p-5 sm:p-6" data-testid="libro">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-[17px] font-bold text-ink">El libro del club</h2>
        <p className="text-[13px] text-muted">
          {rows.length} movimientos · entró <b className="text-ink tabular-nums">{formatUYU(money)}</b>
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {(
          [
            ['hoy', 'Hoy'],
            ['semana', 'Semana'],
            ['mes', 'Este mes'],
            ['mes_anterior', 'Mes anterior'],
          ] as [When, string][]
        ).map(([id, l]) => (
          <Chip key={id} on={when === id} onClick={() => setWhen(id)}>
            {l}
          </Chip>
        ))}
        <select value={rubro} onChange={(e) => setRubro(e.target.value)} className={sel} aria-label="Rubro">
          <option value="todos">Rubro: todos</option>
          {RUBROS.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
          <option value="retiro">Retiros</option>
        </select>
        <select value={medio} onChange={(e) => setMedio(e.target.value)} className={sel} aria-label="Medio">
          <option value="todos">Medio: todos</option>
          {methods.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <select value={fact} onChange={(e) => setFact(e.target.value as typeof fact)} className={sel} aria-label="Factura">
          <option value="todas">Factura: todas</option>
          <option value="pendiente">Factura: pendiente</option>
          <option value="emitida">Factura: emitida</option>
          <option value="no_corresponde">No corresponde</option>
        </select>
      </div>

      {rows.length === 0 ? (
        <p className="mt-4 text-[13px] text-muted">No hay movimientos con esos filtros.</p>
      ) : (
        <>
          <div className="mt-3 hidden overflow-x-auto md:block">
            <table className="w-full min-w-[720px] text-left text-[13px]">
              <thead>
                <tr className="border-b border-line text-[12px] text-muted">
                  <th className="w-8 py-2" />
                  <th className="py-2 pr-2 font-semibold">{when === 'hoy' ? 'Hora' : 'Día'}</th>
                  <th className="py-2 pr-2 font-semibold">Cliente</th>
                  <th className="py-2 pr-2 font-semibold">Qué</th>
                  <th className="py-2 pr-2 font-semibold">Medio</th>
                  <th className="py-2 pr-2 text-right font-semibold">Monto</th>
                  <th className="py-2 pl-3 font-semibold">Factura</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 300).map((r) => (
                  <tr key={r.id} className="border-b border-[#eef5f5] last:border-0">
                    <td className="py-2">
                      {selectable(r) && (
                        <input
                          type="checkbox"
                          aria-label={`Elegir cobro de ${r.clientName}`}
                          checked={picked.includes(r.id)}
                          onChange={() => setPicked((p) => (p.includes(r.id) ? p.filter((x) => x !== r.id) : [...p, r.id]))}
                          className="h-4 w-4 accent-[#00696b]"
                        />
                      )}
                    </td>
                    <td className="py-2 pr-2 tabular-nums text-muted">{when === 'hoy' ? hhmm(r.atMs) : dmy(r.day)}</td>
                    <td className="max-w-[160px] truncate py-2 pr-2 text-ink">{r.clientName}</td>
                    <td className={`max-w-[240px] truncate py-2 pr-2 ${r.voided ? 'text-muted line-through' : 'text-ink'}`}>
                      {r.rubro === 'retiro' ? 'Retiro' : RUBROS.find((x) => x.id === r.rubro)?.label} · {r.concept}
                    </td>
                    <td className="py-2 pr-2 text-muted">{r.method}</td>
                    <td className={`py-2 pr-2 text-right tabular-nums ${r.voided ? 'text-muted line-through' : r.amount < 0 ? 'text-due' : 'text-ink'}`}>{r.kind === 'uso' ? '—' : formatUYU(r.amount)}</td>
                    <td className="py-2 pl-3">
                      <InvoiceChip r={r} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="mt-3 divide-y divide-[#eef5f5] md:hidden">
            {rows.slice(0, 120).map((r) => (
              <li key={r.id} className="flex items-start gap-2.5 py-2.5 text-[13px]">
                {selectable(r) ? (
                  <input type="checkbox" aria-label={`Elegir cobro de ${r.clientName}`} checked={picked.includes(r.id)} onChange={() => setPicked((p) => (p.includes(r.id) ? p.filter((x) => x !== r.id) : [...p, r.id]))} className="mt-1 h-4 w-4 accent-[#00696b]" />
                ) : (
                  <span className="w-4" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="flex justify-between gap-2">
                    <span className="truncate font-semibold text-ink">{r.clientName}</span>
                    <span className={`shrink-0 tabular-nums font-semibold ${r.voided ? 'text-muted line-through' : r.amount < 0 ? 'text-due' : 'text-ink'}`}>{r.kind === 'uso' ? '—' : formatUYU(r.amount)}</span>
                  </span>
                  <span className="flex items-center justify-between gap-2">
                    <span className={`truncate text-muted ${r.voided ? 'line-through' : ''}`}>
                      {when === 'hoy' ? hhmm(r.atMs) : dmy(r.day)} · {r.rubro === 'retiro' ? 'Retiro' : RUBROS.find((x) => x.id === r.rubro)?.label} · {r.concept} · {r.method}
                    </span>
                    <InvoiceChip r={r} />
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {picked.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-mist p-3">
          <span className="text-[13px] font-semibold text-ink">{picked.length} elegidos</span>
          <input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="N.º de comprobante (opcional)" aria-label="Número de comprobante" className="min-w-0 flex-1 rounded-xl border border-line bg-white px-3 py-1.5 text-[13px]" />
          <button type="button" disabled={busy} onClick={() => mark('emitida')} className="rounded-full bg-brand px-3.5 py-1.5 text-[13px] font-semibold text-white cursor-pointer">
            Marcar facturadas
          </button>
          <button type="button" disabled={busy} onClick={() => mark('no_corresponde')} className="rounded-full border border-line bg-white px-3.5 py-1.5 text-[13px] font-semibold cursor-pointer">
            No corresponde
          </button>
          <button type="button" disabled={busy} onClick={() => mark('pendiente')} className="px-2 text-[13px] text-muted cursor-pointer">
            Volver a pendiente
          </button>
        </div>
      )}
      <div className="mt-3 grid grid-cols-2 gap-2.5">
        <button
          type="button"
          onClick={() => setPicked(rows.filter((r) => selectable(r) && r.invoice === 'pendiente').map((r) => r.id))}
          className="rounded-xl border border-line bg-white py-2.5 text-sm font-semibold text-brand hover:bg-mist cursor-pointer"
        >
          Elegir pendientes
        </button>
        <button type="button" onClick={() => bajar(false)} className="rounded-xl border border-line bg-white py-2.5 text-sm font-semibold text-brand hover:bg-mist cursor-pointer">
          Bajar a planilla
        </button>
      </div>
      <p className="mt-2 text-[12px] text-muted">
        Venta (qué y a quién) y cobro (cómo y quién cobró) quedan separados. Usar cuponera o saldo no es plata nueva y no se factura: ya se facturó al venderla. Nada se borra: se anula con motivo. Fase 2: el número de factura llega solo.{' '}
        <button type="button" onClick={() => bajar(true)} className="font-semibold text-brand underline cursor-pointer">
          Bajar en CSV
        </button>
      </p>
    </section>
  );
};
