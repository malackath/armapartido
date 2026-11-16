/** Caja del día en el Mostrador: abrir, retiros, movimientos, anular, deben, venta rápida y cierre. */
import React, { useMemo, useState } from 'react';
import { Minus, Plus, X } from 'lucide-react';
import type { Booking, Club, ClubMembership, PaymentRecord, ProposedMatch, Tournament } from '../../types/padel';
import { formatMinutes, formatUYU } from '../../lib/padelUtils';
import { cashSummary, toDateValue } from '../../lib/caja';
import { clientDebts, clientKey } from '../../lib/clientes';
import { payWholeDebt } from '../../services/clientesService';
import { useClientes } from '../clientes/data';
import { VentaSuelta } from '../clientes/VentaSuelta';
import { StatusChip } from '../ui/People';
import { addWithdrawal, closeCashDay, openCashDay, voidPayment, type Staff } from '../../services/cajaService';
import type { CounterPaymentMethod } from '../../services/firestoreService';
import { KIND_LABEL, MethodPicker, Row, btnPrimary, btnSecondary, inputCls, labelCls, useOps } from './ops';
import { soldAt } from '../../lib/catalogo';

type Tab = 'caja' | 'deben' | 'venta';

const methodName = (m: string) => (m === 'mercadopago' ? 'Mercado Pago' : m === 'efectivo' ? 'Efectivo' : m === 'transferencia' ? 'Transferencia' : 'Tarjeta');
const timeOf = (p: PaymentRecord) => {
  const d = toDateValue(p.createdAt);
  return d ? formatMinutes(d.getHours() * 60 + d.getMinutes()) : '';
};

export const CashPanel: React.FC<{
  club: Club;
  bookings: Booking[];
  matches: ProposedMatch[];
  nameOf: (uid: string) => string;
  staff: Staff;
  today: string;
  nowMinute: number;
  busy: boolean;
  setBusy: (b: boolean) => void;
  onToast: (msg: string) => void;
  onClose: () => void;
  initialTab?: Tab;
  memberships?: ClubMembership[];
  tournaments?: Tournament[];
}> = ({ club, bookings, matches, nameOf, staff, today, nowMinute, busy, setBusy, onToast, onClose, initialTab = 'caja', memberships = [], tournaments = [] }) => {
  const { cashDays, allPayments, consumptions, products } = useOps();
  const { clients, sales } = useClientes();
  const [tab, setTab] = useState<Tab>(initialTab);
  const day = cashDays.find((d) => d.id === today);
  const summary = useMemo(() => cashSummary(allPayments, today, day?.openingFloat ?? 0), [allPayments, today, day]);
  const debts = useMemo(() => clientDebts({ clients, consumptions, bookings, matches, sales, today, nowMinute, nameOf }), [clients, consumptions, bookings, matches, sales, today, nowMinute, nameOf]);
  const closed = day?.status === 'closed';

  const run = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true);
    try {
      await fn();
      onToast(msg);
    } catch {
      onToast('No se pudo guardar. Probá de nuevo.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-line bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-wide text-emerald-700 uppercase">Caja</p>
          <h2 className="mt-1 font-display text-lg font-bold text-ink">
            {!day ? 'La caja de hoy no está abierta' : closed ? 'Caja de hoy cerrada' : 'Caja de hoy abierta'}
          </h2>
          {day && (
            <p className="text-[13px] text-muted">
              Abrió {day.openedByName.split(' ')[0] || 'el encargado'}
              {closed && day.closedByName ? ` · cerró ${day.closedByName.split(' ')[0]}` : ''}
            </p>
          )}
        </div>
        <button type="button" onClick={onClose} aria-label="Cerrar" className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-mist cursor-pointer">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-4 flex rounded-xl bg-mist p-1">
        {(
          [
            ['caja', 'Caja de hoy'],
            ['deben', `Deben (${debts.length})`],
            ['venta', 'Venta suelta'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex-1 whitespace-nowrap rounded-lg px-2 py-1.5 text-[13px] font-semibold cursor-pointer ${tab === id ? 'bg-white text-ink shadow-xs' : 'text-muted hover:text-ink'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'caja' && (
        <CajaTab
          club={club}
          day={day}
          summary={summary}
          debtsToday={debts.filter((d) => d.since === today)}
          staff={staff}
          today={today}
          busy={busy}
          run={run}
          bookings={bookings}
          matches={matches}
        />
      )}
      {tab === 'deben' && <DebenTab club={club} debts={debts} consumptions={consumptions} bookings={bookings} matches={matches} staff={staff} today={today} closed={closed} busy={busy} run={run} />}
      {tab === 'venta' && (
        <VentaSuelta
          club={club}
          memberships={memberships}
          products={products.filter((p) => p.active && soldAt(p, 'mostrador'))}
          tournaments={tournaments}
          staff={staff}
          today={today}
          closed={closed}
          busy={busy}
          run={run}
          debtOf={(c) => debts.find((d) => d.key === clientKey(c))?.amount ?? 0}
        />
      )}
    </div>
  );
};

type Run = (fn: () => Promise<unknown>, msg: string) => Promise<void>;

const CajaTab: React.FC<{
  club: Club;
  day: ReturnType<typeof useOps>['cashDays'][number] | undefined;
  summary: ReturnType<typeof cashSummary>;
  debtsToday: ReturnType<typeof clientDebts>;
  staff: Staff;
  today: string;
  busy: boolean;
  run: Run;
  bookings: Booking[];
  matches: ProposedMatch[];
}> = ({ club, day, summary, debtsToday, staff, today, busy, run, bookings, matches }) => {
  const appPaidToday = bookings.filter((b) => b.date === today && b.status === 'confirmed' && b.paymentMethod === 'mercadopago').reduce((a, b) => a + (b.paidAmount ?? 0), 0);
  const [float, setFloat] = useState('2000');
  const [counted, setCounted] = useState('');
  const [note, setNote] = useState('');
  const [wAmount, setWAmount] = useState('');
  const [wNote, setWNote] = useState('');
  const [showW, setShowW] = useState(false);
  const [voiding, setVoiding] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const countedNum = Number(counted.replace(/\D/g, '')) || 0;
  const diff = counted === '' ? null : countedNum - summary.expectedCash;
  const closed = day?.status === 'closed';
  const owed = debtsToday.reduce((a, d) => a + d.amount, 0);
  const movements = [...summary.movements].sort((a, b) => (toDateValue(b.createdAt)?.getTime() ?? 0) - (toDateValue(a.createdAt)?.getTime() ?? 0));

  if (!day) {
    return (
      <div className="mt-4">
        <label className={labelCls}>
          ¿Con cuánto efectivo arrancás? (el fondo)
          <input inputMode="numeric" value={float} onChange={(e) => setFloat(e.target.value.replace(/\D/g, ''))} className={inputCls} />
        </label>
        <button type="button" disabled={busy} onClick={() => run(() => openCashDay(club, today, Number(float) || 0, staff), 'Caja abierta.')} className={`${btnPrimary} mt-3`}>
          Abrir la caja de hoy
        </button>
        <p className="mt-2 text-[12.5px] text-muted">Podés cobrar igual sin abrirla; al cerrar se toma un fondo de $ 0.</p>
        {summary.movements.length > 0 && <p className="mt-2 text-[12.5px] text-muted">Ya hay {summary.movements.length} {summary.movements.length === 1 ? "cobro" : "cobros"} de hoy por {formatUYU(summary.total)}.</p>}
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-4">
      <div className="rounded-xl border border-line px-3.5 py-1">
        <Row label="Fondo con el que abrió" value={formatUYU(day.openingFloat)} />
        <Row label="Efectivo cobrado" value={formatUYU(summary.byMethod.efectivo)} />
        {summary.withdrawals > 0 && <Row label="Retiros" value={`− ${formatUYU(summary.withdrawals)}`} />}
        <Row label="Tiene que haber en efectivo" value={formatUYU(summary.expectedCash)} strong />
        {closed ? (
          <>
            <Row label="Contaron" value={formatUYU(day.countedCash ?? 0)} />
            <Row label="Diferencia" value={formatUYU(day.difference ?? 0)} strong tone={(day.difference ?? 0) < 0 ? 'red' : (day.difference ?? 0) > 0 ? 'green' : undefined} />
          </>
        ) : (
          <div className="flex items-center justify-between gap-3 py-2 text-sm">
            <span className="text-muted">Contaste</span>
            <input
              inputMode="numeric"
              placeholder="$ contado"
              value={counted}
              onChange={(e) => setCounted(e.target.value.replace(/\D/g, ''))}
              className="w-32 rounded-lg border border-line px-2.5 py-1.5 text-right text-sm tabular-nums"
              aria-label="Efectivo contado"
            />
          </div>
        )}
        {!closed && diff !== null && <Row label="Diferencia" value={formatUYU(diff)} strong tone={diff < 0 ? 'red' : diff > 0 ? 'green' : undefined} />}
      </div>

      <div className="rounded-xl border border-line px-3.5 py-1">
        <Row label="Transferencias" value={formatUYU(summary.byMethod.transferencia)} />
        <Row label="Tarjeta (POS del club)" value={formatUYU(summary.byMethod.debito_club)} />
        <Row label="Mercado Pago" value={formatUYU(summary.byMethod.mercadopago)} />
        <Row label="Total del día" value={formatUYU(summary.total)} strong />
        <Row label="De eso, cantina" value={formatUYU(summary.cantina)} />
      </div>
      {appPaidToday > 0 && (
        <p className="rounded-xl bg-mist px-3 py-2 text-[12.5px] text-muted">
          Además, los turnos de hoy ya pagados en la app con Mercado Pago suman <b className="text-ink">{formatUYU(appPaidToday)}</b>. Esa plata entró el día que reservaron, por eso no está en la caja de hoy.
        </p>
      )}

      {owed > 0 && (
        <p className="rounded-xl border-l-4 border-[#f97316] bg-wait-bg px-3 py-2 text-[13px] text-wait">
          Quedó sin cobrar hoy: {formatUYU(owed)} ({debtsToday.length} {debtsToday.length === 1 ? 'persona' : 'personas'}). Está en "Deben".
        </p>
      )}

      {!closed && (
        <>
          {showW ? (
            <div className="rounded-xl bg-mist p-3">
              <div className="grid grid-cols-[110px_1fr] gap-2">
                <input inputMode="numeric" placeholder="$" value={wAmount} onChange={(e) => setWAmount(e.target.value.replace(/\D/g, ''))} className="rounded-lg border border-line px-2.5 py-2 text-sm tabular-nums" aria-label="Monto del retiro" />
                <input placeholder="Para qué (hielo, proveedor…)" value={wNote} onChange={(e) => setWNote(e.target.value)} className="rounded-lg border border-line px-2.5 py-2 text-sm" aria-label="Motivo del retiro" />
              </div>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  disabled={busy || !Number(wAmount) || !wNote.trim()}
                  onClick={() =>
                    run(async () => {
                      await addWithdrawal(club, Number(wAmount), wNote, staff, today);
                      setShowW(false);
                      setWAmount('');
                      setWNote('');
                    }, 'Retiro anotado.')
                  }
                  className="rounded-lg bg-brand px-3 py-2 text-[13px] font-semibold text-white disabled:opacity-50 cursor-pointer"
                >
                  Anotar retiro
                </button>
                <button type="button" onClick={() => setShowW(false)} className="px-2 text-[13px] text-muted cursor-pointer">
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setShowW(true)} className={btnSecondary}>
              Sacar plata de la caja (retiro)
            </button>
          )}

          <label className={labelCls}>
            Nota {diff ? '(obligatoria si hay diferencia)' : '(opcional)'}
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={diff ? 'Por qué falta o sobra' : ''} className={inputCls} />
          </label>
          <button
            type="button"
            disabled={busy || counted === '' || (!!diff && !note.trim())}
            onClick={() =>
              run(
                () =>
                  closeCashDay({
                    club,
                    cashDay: day,
                    expectedCash: summary.expectedCash,
                    countedCash: countedNum,
                    note,
                    totals: { ...summary.byMethod, total: summary.total, cantina: summary.cantina, retiros: summary.withdrawals, sinCobrar: owed },
                    staff,
                  }),
                'Caja cerrada.'
              )
            }
            className={btnPrimary}
          >
            Cerrar la caja de hoy
          </button>
        </>
      )}
      {closed && day.note && <p className="text-[13px] text-muted">Nota del cierre: {day.note}</p>}

      <div>
        <p className="mb-1 text-xs font-semibold tracking-wider text-muted uppercase">Movimientos de hoy</p>
        {movements.length === 0 && <p className="py-2 text-[13px] text-muted">Todavía no hay cobros hoy.</p>}
        <ul>
          {movements.map((p) => (
            <li key={p.id} className="border-b border-[#eef5f5] py-2 text-[13px] last:border-0">
              <div className="flex items-baseline justify-between gap-2">
                <span className={`min-w-0 truncate ${p.voided ? 'text-muted line-through' : 'text-ink'}`}>
                  <span className="tabular-nums text-muted">{timeOf(p)}</span> {p.payerName} · {KIND_LABEL[p.kind]}
                  {p.kind !== 'retiro' && <span className="text-muted"> · {methodName(p.method)}</span>}
                  {p.afterClose && <span className="ml-1 text-[11px] font-semibold text-wait">después del cierre</span>}
                </span>
                <span className={`shrink-0 font-semibold tabular-nums ${p.kind === 'retiro' || p.amount < 0 ? 'text-red-700' : 'text-ink'}`}>
                  {p.kind === 'retiro' ? `− ${formatUYU(p.amount)}` : formatUYU(p.amount)}
                </span>
              </div>
              {p.note && <p className="text-[12px] text-muted">{p.note}</p>}
              {!closed && !p.voided && p.kind !== 'anulacion' && p.kind !== 'retiro' && p.method !== 'mercadopago' &&
                (voiding === p.id ? (
                  <div className="mt-1.5 flex gap-2">
                    <input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motivo de la anulación" className="min-w-0 flex-1 rounded-lg border border-line px-2 py-1.5 text-[13px]" />
                    <button
                      type="button"
                      disabled={busy || !reason.trim()}
                      onClick={() =>
                        run(async () => {
                          await voidPayment({ club, payment: p, reason, staff, day: today, bookings, matches });
                          setVoiding(null);
                          setReason('');
                        }, 'Cobro anulado. Queda a la vista con el motivo.')
                      }
                      className="rounded-lg bg-red-700 px-2.5 text-[13px] font-semibold text-white disabled:opacity-50 cursor-pointer"
                    >
                      Anular
                    </button>
                    <button type="button" onClick={() => setVoiding(null)} className="text-[13px] text-muted cursor-pointer">
                      No
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setVoiding(p.id)} className="text-[12px] font-semibold text-muted hover:text-red-700 hover:underline cursor-pointer">
                    Anular
                  </button>
                ))}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

const DebenTab: React.FC<{
  club: Club;
  debts: ReturnType<typeof clientDebts>;
  consumptions: ReturnType<typeof useOps>['consumptions'];
  bookings: Booking[];
  matches: ProposedMatch[];
  staff: Staff;
  today: string;
  closed: boolean;
  busy: boolean;
  run: Run;
}> = ({ club, debts, consumptions, bookings, matches, staff, today, closed, busy, run }) => {
  const { clients, sales } = useClientes();
  const [method, setMethod] = useState<CounterPaymentMethod>('efectivo');
  const [open, setOpen] = useState<string | null>(null);
  const total = debts.reduce((a, d) => a + d.amount, 0);
  if (debts.length === 0) return <p className="mt-4 text-sm text-muted">Nadie debe nada.</p>;
  return (
    <div className="mt-4">
      <p className="text-[13px] text-muted">
        Total que deben: <b className="text-ink tabular-nums">{formatUYU(total)}</b>. Es lo que se fió (cantina) y canchas de turnos pasados sin cobrar.
      </p>
      <ul className="mt-2">
        {debts.map((d) => (
          <li key={d.key} className="border-b border-[#eef5f5] py-2.5 last:border-0">
            <button type="button" onClick={() => setOpen(open === d.key ? null : d.key)} className="flex w-full items-baseline justify-between gap-2 text-left cursor-pointer">
              <span className="min-w-0">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-semibold text-ink">{d.name}</span>
                  {d.client ? !d.client.uid && <StatusChip kind="wait" className="py-0! text-[10.5px]!">sin app</StatusChip> : d.key.startsWith('g:') && <StatusChip kind="busy" className="py-0! text-[10.5px]!">sin ficha</StatusChip>}
                </span>
                <span className="block text-[12px] text-muted">
                  desde {d.since === today ? 'hoy' : d.since.split('-').reverse().slice(0, 2).join('/')}
                  {d.bookingIds.length > 0 && ` · ${d.bookingIds.length} ${d.bookingIds.length === 1 ? 'cancha' : 'canchas'}`}
                  {d.consumptionIds.length > 0 && ` · ${d.consumptionIds.length} de cantina`}
                  {d.saleIds.length > 0 && ` · ${d.saleIds.length} a cuenta`}
                </span>
              </span>
              <span className="shrink-0 font-display text-[16px] font-bold tabular-nums text-wait">{formatUYU(d.amount)}</span>
            </button>
            {open === d.key && (
              <div className="mt-2 space-y-2">
                <MethodPicker value={method} onChange={setMethod} />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    run(
                      () => payWholeDebt({ club, debt: d, clients, consumptions, bookings, matches, sales, method, staff, day: today, afterClose: closed }),
                      `Cobrado: ${formatUYU(d.amount)} de ${d.name.split(' ')[0]}.`
                    )
                  }
                  className={btnPrimary}
                >
                  Cobrar {formatUYU(d.amount)}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};
