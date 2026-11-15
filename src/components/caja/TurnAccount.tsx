/** Cuenta del turno en el Mostrador: cancha + cantina, dividir entre los que juegan, cobrar o dejar pendiente. */
import React, { useMemo, useState } from 'react';
import { Check, X } from 'lucide-react';
import type { Booking, Club, ProposedMatch } from '../../types/padel';
import type { Product } from '../../types/caja';
import { formatUYU } from '../../lib/padelUtils';
import { accountOf, participantsOf } from '../../lib/caja';
import { addConsumption, chargeAccounts, voidConsumption, type Staff } from '../../services/cajaService';
import type { CounterPaymentMethod } from '../../services/firestoreService';
import { MethodPicker, btnPrimary, btnSecondary, initials, useOps } from './ops';

const methodLabel = (m: CounterPaymentMethod) => (m === 'efectivo' ? 'efectivo' : m === 'transferencia' ? 'transferencia' : 'tarjeta');

export const TurnAccount: React.FC<{
  club: Club;
  booking: Booking;
  match?: ProposedMatch;
  nameOf: (uid: string) => string;
  staff: Staff;
  today: string;
  busy: boolean;
  setBusy: (b: boolean) => void;
  onToast: (msg: string) => void;
  onClose: () => void;
}> = ({ club, booking, match, nameOf, staff, today, busy, setBusy, onToast, onClose }) => {
  const { products, consumptions, cashDays } = useOps();
  const participants = useMemo(() => participantsOf(booking, match, nameOf), [booking, match, nameOf]);
  const turnCons = useMemo(() => consumptions.filter((c) => c.bookingId === booking.id && c.status !== 'voided'), [consumptions, booking.id]);
  const accounts = useMemo(() => accountOf(participants, turnCons), [participants, turnCons]);
  const [picked, setPicked] = useState<string[]>(() => accounts.filter((a) => a.totalDue > 0).map((a) => a.key));
  const [method, setMethod] = useState<CounterPaymentMethod>('efectivo');
  const [choosing, setChoosing] = useState<Product | null>(null);
  const [showAll, setShowAll] = useState(false);

  const active = products.filter((p) => p.active);
  const quick = showAll ? active : active.slice(0, 6);
  const multi = participants.length > 1;
  const pickedDue = accounts.filter((a) => picked.includes(a.key)).reduce((s, a) => s + a.totalDue, 0);
  const totalDue = accounts.reduce((s, a) => s + a.totalDue, 0);
  const deposit = booking.paymentStatus === 'deposit_paid' && booking.type !== 'matched' ? booking.paidAmount : 0;
  const closedToday = cashDays.find((d) => d.id === today)?.status === 'closed';

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

  const add = (product: Product, shared: boolean, who?: { key: string; name: string }) => {
    setChoosing(null);
    const list = shared ? participants.map((p) => ({ key: p.key, name: p.name })) : [who ?? { key: participants[0].key, name: participants[0].name }];
    void run(
      () => addConsumption({ club, product, qty: 1, date: booking.date, bookingId: booking.id, shared, participants: list, staff }),
      `${product.name} sumado${shared ? ' entre todos' : ` a ${list[0].name.split(' ')[0]}`}.`
    );
    setPicked((prev) => Array.from(new Set([...prev, ...list.map((l) => l.key)])));
  };

  const onProduct = (p: Product) => {
    if (!multi) add(p, false);
    else setChoosing(p);
  };

  const charge = () =>
    run(async () => {
      await chargeAccounts({ club, booking, match, accounts, keys: picked, consumptions: turnCons, method, staff, day: today, afterClose: closedToday });
      setPicked([]);
    }, `Cobro registrado: ${formatUYU(pickedDue)} en ${methodLabel(method)}.`);

  return (
    <div className="mt-4 space-y-4">
      {/* La cuenta */}
      <div className="rounded-xl border border-line">
        <div className="flex justify-between px-3.5 py-2.5 text-sm">
          <span className="text-muted">Cancha</span>
          <span className="tabular-nums text-ink">{formatUYU(booking.totalPrice)}</span>
        </div>
        {turnCons.map((c) => (
          <div key={c.id} className="flex items-center justify-between gap-2 border-t border-[#eef5f5] px-3.5 py-2 text-sm">
            <span className="min-w-0 truncate text-ink">
              {c.qty > 1 ? `${c.qty} ` : ''}
              {c.productName} <span className="text-muted">· {c.shared ? 'todos' : c.forName.split(' ')[0]}</span>
              {c.status === 'paid' && <span className="ml-1 text-xs font-semibold text-green-700">pago</span>}
            </span>
            <span className="flex shrink-0 items-center gap-1.5 tabular-nums">
              {formatUYU(c.total)}
              {c.status === 'pending' && c.paidUids.length === 0 && (
                <button
                  type="button"
                  aria-label={`Quitar ${c.productName}`}
                  disabled={busy}
                  onClick={() => run(() => voidConsumption(club, c, products), `${c.productName} quitado. Volvió al stock.`)}
                  className="grid h-6 w-6 place-items-center rounded-md text-muted hover:bg-mist cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </span>
          </div>
        ))}
        {deposit > 0 && (
          <div className="flex justify-between border-t border-[#eef5f5] px-3.5 py-2 text-sm">
            <span className="text-muted">Seña pagada por Mercado Pago</span>
            <span className="tabular-nums text-ink">− {formatUYU(deposit)}</span>
          </div>
        )}
        <div className="flex justify-between border-t border-line bg-mist/60 px-3.5 py-2.5 text-sm font-bold text-ink">
          <span>Falta cobrar</span>
          <span className="tabular-nums">{formatUYU(totalDue)}</span>
        </div>
      </div>

      {/* Agregar de la cantina */}
      <div>
        <p className="mb-2 text-xs font-semibold tracking-wider text-muted uppercase">Agregar de la cantina</p>
        {active.length === 0 ? (
          <p className="text-[13px] text-muted">El club todavía no cargó productos. Se cargan en Admin, Cantina.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {quick.map((p) => (
              <button
                key={p.id}
                type="button"
                disabled={busy}
                onClick={() => onProduct(p)}
                className={`rounded-full border px-3 py-1.5 text-[13px] font-semibold cursor-pointer disabled:opacity-50 ${
                  choosing?.id === p.id ? 'border-emerald-600 bg-emerald-50 text-brand' : 'border-line bg-white text-ink hover:bg-mist'
                }`}
              >
                {p.name} <span className="font-normal text-muted">{formatUYU(p.price)}</span>
                {p.stock !== null && p.stock <= 0 && <span className="ml-1 text-[11px] font-bold text-red-700">sin stock</span>}
              </button>
            ))}
            {active.length > 6 && (
              <button type="button" onClick={() => setShowAll((v) => !v)} className="rounded-full border border-dashed border-line px-3 py-1.5 text-[13px] font-semibold text-muted cursor-pointer">
                {showAll ? 'Menos' : `+ ${active.length - 6} más`}
              </button>
            )}
          </div>
        )}
        {choosing && (
          <div className="mt-2 rounded-xl bg-mist p-3">
            <p className="text-[13px] font-semibold text-ink">¿{choosing.name} para quién?</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <button type="button" onClick={() => add(choosing, true)} className="rounded-full bg-brand px-3 py-1.5 text-[13px] font-semibold text-white cursor-pointer">
                Para todos (se divide)
              </button>
              {participants.map((p) => (
                <button key={p.key} type="button" onClick={() => add(choosing, false, { key: p.key, name: p.name })} className="rounded-full border border-line bg-white px-3 py-1.5 text-[13px] font-semibold text-ink cursor-pointer">
                  {p.name.split(' ')[0]}
                </button>
              ))}
              <button type="button" onClick={() => setChoosing(null)} className="px-2 text-[13px] text-muted cursor-pointer">
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Quién paga qué */}
      {multi && (
        <div>
          <p className="mb-2 text-xs font-semibold tracking-wider text-muted uppercase">Dividir entre los {participants.length}</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2">
            {accounts.map((a) => {
              const done = a.totalDue === 0;
              const on = picked.includes(a.key) && !done;
              return (
                <button
                  key={a.key}
                  type="button"
                  disabled={done}
                  onClick={() => setPicked((prev) => (prev.includes(a.key) ? prev.filter((k) => k !== a.key) : [...prev, a.key]))}
                  className={`rounded-xl border p-2.5 text-left cursor-pointer disabled:cursor-default ${
                    done ? 'border-green-200 bg-green-50' : on ? 'border-2 border-emerald-600 bg-emerald-50' : 'border-line bg-white'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white text-[11px] font-bold text-brand">{initials(a.name)}</span>
                    <span className="min-w-0 truncate text-[13px] font-semibold text-ink">{a.name.split(' ')[0]}</span>
                  </span>
                  <span className="mt-1.5 block font-display text-[17px] font-bold tabular-nums text-ink">{done ? 'Pagó' : formatUYU(a.totalDue)}</span>
                  {!done && a.consumptionDue > 0 && (
                    <span className="block text-[11px] text-muted">cancha {formatUYU(a.canchaDue)} + cantina {formatUYU(a.consumptionDue)}</span>
                  )}
                  {done && <Check className="mt-0.5 h-4 w-4 text-green-700" />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {totalDue > 0 ? (
        <>
          <div>
            <p className="mb-2 text-xs font-semibold tracking-wider text-muted uppercase">Forma de cobro</p>
            <MethodPicker value={method} onChange={setMethod} />
          </div>
          {closedToday && <p className="rounded-xl bg-amber-50 px-3 py-2 text-[12.5px] text-amber-800">La caja de hoy ya está cerrada: este cobro queda marcado como cobrado después del cierre.</p>}
          <button type="button" disabled={busy || pickedDue <= 0} onClick={charge} className={btnPrimary}>
            <Check className="h-4 w-4" /> Cobrar {formatUYU(pickedDue)}
            {multi ? ` (${picked.filter((k) => accounts.find((a) => a.key === k && a.totalDue > 0)).length})` : ''}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              onToast('Queda pendiente en su cuenta. Aparece en "Deben" de la caja.');
              onClose();
            }}
            className={btnSecondary}
          >
            Dejar pendiente en su cuenta
          </button>
        </>
      ) : (
        <p className="rounded-xl bg-green-50 px-3 py-2.5 text-sm font-semibold text-green-800">
          Turno pago{booking.paymentMethod === 'mercadopago' ? ' por Mercado Pago' : ''}.
        </p>
      )}
    </div>
  );
};
