/**
 * Pantalla de la persona de cantina (clubes grandes, pedido de Ber 16/11/2026).
 * En un club chico la cantina la atiende el encargado desde el Mostrador; en uno grande hay alguien
 * solo para eso. Ve únicamente lo suyo: venta suelta (cantina, alquiler y otros), cargar consumos a la
 * cuenta de un turno y la caja de la cantina de hoy. No ve reservas, clientes ni administración.
 */
import React, { useEffect, useMemo, useState } from 'react';
import type { Booking, Club, ClubMembership, Court, ProposedMatch, UserProfile } from '../../types/padel';
import { formatMinutes, formatUYU, getTodayISO } from '../../lib/padelUtils';
import { isCantinaPayment, paymentDay } from '../../lib/caja';
import { clientDebts, clientKey } from '../../lib/clientes';
import { ClubOpsContext, useClubOps } from '../caja/ops';
import { ClientesContext, useClientesData } from '../clientes/data';
import { VentaSuelta } from '../clientes/VentaSuelta';
import { TurnAccount } from '../caja/TurnAccount';
import { FullscreenButton } from '../ui/FullscreenButton';
import { participantsOf } from '../../lib/caja';
import { addConsumption } from '../../services/cajaService';
import type { Product } from '../../types/caja';
import { soldAt } from '../../lib/catalogo';

const nowMinute = () => {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
};

const METHOD_LABEL: Record<string, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  debito_club: 'Tarjeta',
  mercadopago: 'Mercado Pago',
};

export const CantinaView: React.FC<{
  club: Club;
  courts: Court[];
  bookings: Booking[];
  memberships: ClubMembership[];
  proposedMatches: ProposedMatch[];
  userProfile: UserProfile;
  onToast: (msg: string) => void;
}> = ({ club, courts, bookings, memberships, proposedMatches, userProfile, onToast }) => {
  const ops = useClubOps(club.id, true);
  const clientes = useClientesData(club.id, true);
  const [minute, setMinute] = useState(nowMinute);
  const [busy, setBusy] = useState(false);
  const [openTurn, setOpenTurn] = useState<string | null>(null);
  const today = getTodayISO();

  useEffect(() => {
    const t = window.setInterval(() => setMinute(nowMinute()), 30000);
    return () => window.clearInterval(t);
  }, []);

  const staff = { uid: userProfile.uid, name: userProfile.displayName };
  const nameOf = (uid: string) => memberships.find((m) => m.uid === uid)?.displayName ?? 'Jugador';
  const courtName = (id: string) => courts.find((c) => c.id === id)?.name ?? 'Cancha';
  const day = ops.cashDays.find((d) => d.id === today);
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

  // Turnos donde se puede cargar algo: en juego, por empezar (30 min) o recién terminados (1 h).
  const turns = useMemo(
    () =>
      bookings
        .filter((b) => b.date === today && b.status === 'confirmed' && b.type !== 'tournament')
        .filter((b) => b.startMinute - 30 <= minute && b.endMinute + 60 > minute)
        .sort((a, b) => a.startMinute - b.startMinute || a.courtId.localeCompare(b.courtId)),
    [bookings, today, minute]
  );
  const consOf = (id: string) => ops.consumptions.filter((c) => c.bookingId === id && c.status !== 'voided');

  // Solo deudas de cantina (sin canchas): la cantina no cobra turnos.
  const debts = useMemo(
    () => clientDebts({ clients: clientes.clients, consumptions: ops.consumptions, bookings: [], matches: [], sales: clientes.sales, today, nowMinute: minute, nameOf }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clientes.clients, clientes.sales, ops.consumptions, today, minute, memberships]
  );

  // Caja de la cantina de hoy
  const cash = useMemo(() => {
    const byId = new Map(ops.allPayments.map((p) => [p.id, p]));
    const list = ops.allPayments
      .filter((p) => paymentDay(p) === today && p.kind !== 'retiro' && isCantinaPayment(p, byId))
      .sort((a, b) => String(b.id).localeCompare(String(a.id)));
    const byMethod: Record<string, number> = {};
    for (const p of list) byMethod[p.method] = (byMethod[p.method] ?? 0) + p.amount;
    return { list, byMethod, total: Object.values(byMethod).reduce((a, b) => a + b, 0) };
  }, [ops.allPayments, today]);

  const turn = openTurn ? bookings.find((b) => b.id === openTurn) : null;

  // Con una cancha abierta, tocar un producto lo carga a la cuenta del turno, dividido entre todos.
  const loadToTurn = (p: Product) => {
    if (!turn) return;
    const parts = participantsOf(turn, proposedMatches.find((m) => m.bookingId === turn.id), nameOf).map((x) => ({ key: x.key, name: x.name }));
    void run(
      () => addConsumption({ club, product: p, qty: 1, date: turn.date, bookingId: turn.id, shared: parts.length > 1, participants: parts.length ? parts : [{ key: `g:${turn.id}`, name: 'Cliente' }], staff }),
      `${p.name} cargado ${parts.length > 1 ? 'entre todos ' : ''}en ${courtName(turn.courtId)}.`
    );
  };

  return (
    <ClubOpsContext.Provider value={ops}>
      <ClientesContext.Provider value={clientes}>
        <div className="space-y-5">
          <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold tracking-wide text-emerald-700 uppercase">Cantina</p>
            <h1 className="mt-1 flex items-baseline gap-3 font-display text-2xl font-bold text-ink sm:text-3xl">
              Cantina de hoy
              <span className="font-display text-3xl font-bold text-brand tabular-nums">{formatMinutes(minute)}</span>
            </h1>
            <p className="mt-1 text-sm text-muted">Vendé, cargá lo que consumen en la cancha y mirá lo cobrado. Las canchas y las reservas las maneja el mostrador.</p>
          </div>
          <FullscreenButton />
          </div>

          {!day && ops.ready && (
            <p className="rounded-xl border-l-4 border-[#f97316] bg-wait-bg px-4 py-2.5 text-[13px] text-wait">
              <b>La caja de hoy todavía no está abierta.</b> La abre el mostrador; igual podés vender y queda anotado.
            </p>
          )}

          <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
            <section className="rounded-xl bg-white p-5">
              <h2 className="mb-3 font-display text-lg font-bold text-ink">Venta</h2>
              <VentaSuelta
                club={club}
                memberships={memberships}
                products={ops.products.filter((p) => p.active && soldAt(p, 'cantina'))}
                tournaments={[]}
                staff={staff}
                today={today}
                closed={!!closed}
                busy={busy}
                run={run}
                debtOf={(c) => debts.find((d) => d.key === clientKey(c))?.amount ?? 0}
                tabs={['cantina', 'alquiler', 'otros']}
                tiles
                target={turn ? { label: courtName(turn.courtId), onPick: loadToTurn, onClear: () => setOpenTurn(null) } : null}
              />
            </section>

            <div className="space-y-5">
              <section className="rounded-xl bg-white p-5">
                {turn ? (
                  <>
                  <div className="flex items-start justify-between gap-3 rounded-xl bg-live-fill px-3.5 py-3">
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold tracking-wider text-brand uppercase">Cargando a</p>
                      <p className="font-display text-xl leading-tight font-bold text-ink">{courtName(turn.courtId)}</p>
                      <p className="mt-0.5 truncate text-[13px] text-muted tabular-nums">
                        {formatMinutes(turn.startMinute)} a {formatMinutes(turn.endMinute)} · {turn.guestName || nameOf(turn.createdByUid)}
                        {(turn.playerUids ?? []).length > 1 ? ` y ${(turn.playerUids ?? []).length - 1} más` : ''}
                      </p>
                    </div>
                    <button type="button" onClick={() => setOpenTurn(null)} className="shrink-0 rounded-lg bg-white px-3 py-1.5 text-[13px] font-semibold text-ink hover:bg-mist cursor-pointer">
                      Otra cancha
                    </button>
                  </div>
                  <TurnAccount
                    club={club}
                    booking={turn}
                    match={proposedMatches.find((m) => m.bookingId === turn.id)}
                    nameOf={nameOf}
                    staff={staff}
                    today={today}
                    busy={busy}
                    setBusy={setBusy}
                    onToast={onToast}
                    onClose={() => setOpenTurn(null)}
                    itemsOnly
                    placeLabel={courtName(turn.courtId)}
                    hideQuickAdd
                  />
                  </>
                ) : (
                  <>
                    <h2 className="font-display text-lg font-bold text-ink">Cargar a una cancha</h2>
                    <p className="mt-0.5 text-[13px] text-muted">Lo que piden en la cancha va a la cuenta del turno y se cobra en el mostrador.</p>
                    {turns.length === 0 ? (
                      <p className="mt-3 rounded-xl bg-mist px-3 py-2.5 text-[13px] text-muted">No hay canchas en juego ahora.</p>
                    ) : (
                      <ul className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-2">
                        {turns.map((b) => {
                          const live = b.startMinute <= minute && b.endMinute > minute;
                          const ended = b.endMinute <= minute;
                          const cons = consOf(b.id);
                          const total = cons.reduce((a, c) => a + c.total, 0);
                          const players = (b.playerUids ?? []).slice(0, 4);
                          return (
                            <li key={b.id}>
                              <button
                                type="button"
                                onClick={() => setOpenTurn(b.id)}
                                className="flex w-full items-center gap-3 rounded-xl border border-line px-3 py-2.5 text-left hover:bg-mist cursor-pointer"
                              >
                                <span className="min-w-0 flex-1">
                                  <span className="flex items-center justify-between gap-2">
                                    <b className="truncate font-display text-[15px] text-ink">{courtName(b.courtId)}</b>
                                    <span
                                      className={`shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${live ? 'bg-live-fill text-brand' : ended ? 'bg-mist text-muted' : 'bg-wait-bg text-wait'}`}
                                    >
                                      {live ? 'En juego' : ended ? 'Terminó' : 'Por empezar'}
                                    </span>
                                  </span>
                                  <span className="mt-0.5 block truncate text-[12.5px] text-muted tabular-nums">
                                    {formatMinutes(b.startMinute)} a {formatMinutes(b.endMinute)} · {b.guestName || nameOf(b.createdByUid)}
                                    {players.length > 1 ? ` y ${players.length - 1} más` : ''}
                                  </span>
                                </span>
                                <span className="w-20 text-right text-[12.5px] font-semibold tabular-nums text-ink">{total ? formatUYU(total) : <span className="font-normal text-muted">+ cargar</span>}</span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </>
                )}
              </section>

              <section className="rounded-xl bg-white p-5">
                <h2 className="font-display text-lg font-bold text-ink">Caja de la cantina</h2>
                <p className="font-display text-3xl font-bold text-ok tabular-nums">{formatUYU(cash.total)}</p>
                <p className="mt-1 text-[12.5px] text-muted">
                  {Object.keys(METHOD_LABEL)
                    .filter((m) => cash.byMethod[m])
                    .map((m) => `${METHOD_LABEL[m]} ${formatUYU(cash.byMethod[m])}`)
                    .join(' · ') || 'Todavía no se cobró nada hoy.'}
                </p>
                {cash.list.length > 0 && (
                  <ul className="mt-3 divide-y divide-line text-[13px]">
                    {cash.list.slice(0, 8).map((p) => (
                      <li key={p.id} className="flex items-center justify-between gap-3 py-2">
                        <span className="min-w-0 truncate text-ink">{p.payerName || 'Venta'}</span>
                        <span className="shrink-0 text-muted">{METHOD_LABEL[p.method] ?? p.method}</span>
                        <span className={`w-20 shrink-0 text-right font-semibold tabular-nums ${p.amount < 0 ? 'text-due' : 'text-ink'}`}>{formatUYU(p.amount)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-3 text-[12px] text-muted">El cierre de caja lo hace el mostrador con todo junto.</p>
              </section>
            </div>
          </div>
        </div>
      </ClientesContext.Provider>
    </ClubOpsContext.Provider>
  );
};
