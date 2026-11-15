import React, { useMemo, useState } from 'react';
import { Banknote, PhoneCall, Trophy, UserX, X } from 'lucide-react';
import type { Booking, Club, ClubMembership, Court, Tournament, UserProfile } from '../types/padel';
import {
  calculateSlotPrice,
  formatMinutes,
  formatUYU,
  generateDaySlots,
  getTodayISO,
  getUpcomingDays,
} from '../lib/padelUtils';
import {
  createCounterBooking,
  markBookingNoShow,
  markBookingPaidAtCounter,
  recordTournamentMatchResult,
} from '../services/firestoreService';

interface StaffCounterViewProps {
  club: Club;
  courts: Court[];
  bookings: Booking[];
  memberships: ClubMembership[];
  tournaments: Tournament[];
  userProfile: UserProfile;
  onToast: (msg: string) => void;
}

export const StaffCounterView: React.FC<StaffCounterViewProps> = ({
  club,
  courts,
  bookings,
  memberships,
  tournaments,
  userProfile,
  onToast,
}) => {
  const days = useMemo(() => getUpcomingDays(7), []);
  const [selectedDate, setSelectedDate] = useState(getTodayISO());
  const [walkInTarget, setWalkInTarget] = useState<{
    court: Court;
    startMinute: number;
    endMinute: number;
  } | null>(null);
  const [guestName, setGuestName] = useState('');
  const [paidNow, setPaidNow] = useState(true);
  const [method, setMethod] = useState<'efectivo' | 'transferencia'>('efectivo');
  const [busy, setBusy] = useState(false);

  // Tournament scoring state
  const [scoreInputs, setScoreInputs] = useState<Record<string, { score: string; winner: string }>>({});

  const activeCourts = useMemo(() => courts.filter((c) => c.active), [courts]);
  const slots = useMemo(() => generateDaySlots(club), [club]);

  const bookingsOnDate = useMemo(
    () =>
      bookings.filter(
        (b) => b.date === selectedDate && b.status !== 'cancelled'
      ),
    [bookings, selectedDate]
  );

  const activeTournaments = useMemo(
    () => tournaments.filter((t) => t.status === 'draw_generated' || t.status === 'in_progress'),
    [tournaments]
  );

  const handleCreateWalkIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!walkInTarget || !guestName.trim()) return;
    setBusy(true);
    try {
      await createCounterBooking({
        club,
        court: walkInTarget.court,
        date: selectedDate,
        startMinute: walkInTarget.startMinute,
        endMinute: walkInTarget.endMinute,
        staffUid: userProfile.uid,
        guestName: guestName.trim(),
        paidNow,
        method,
      });
      onToast(`Reserva de mostrador cargada para ${guestName.trim()}.`);
      setWalkInTarget(null);
      setGuestName('');
    } finally {
      setBusy(false);
    }
  };

  const handleMarkPaid = async (bk: Booking, payMethod: 'efectivo' | 'transferencia') => {
    setBusy(true);
    try {
      await markBookingPaidAtCounter({
        club,
        booking: bk,
        staffUid: userProfile.uid,
        method: payMethod,
      });
      onToast(`Pago registrado (${payMethod}) para ${bk.courtName}.`);
    } finally {
      setBusy(false);
    }
  };

  const handleMarkNoShow = async (bk: Booking) => {
    setBusy(true);
    try {
      await markBookingNoShow({
        club,
        booking: bk,
        memberships,
      });
      onToast('Ausencia marcada. Se actualizó el historial de faltas del jugador.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium text-emerald-700">
            Mostrador · Encargado de turno
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold text-slate-900 sm:text-3xl">
            Grilla del día y caja rápida
          </h1>
        </div>
        <div className="flex gap-2 overflow-x-auto">
          {days.map((d) => (
            <button
              key={d.iso}
              type="button"
              onClick={() => setSelectedDate(d.iso)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer ${
                d.iso === selectedDate
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {d.dayShort} {d.dayNum}
            </button>
          ))}
        </div>
      </div>

      {/* High-Density Court Grid Table */}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-[780px] border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
              <th className="px-4 py-3 font-semibold">Horario</th>
              {activeCourts.map((ct) => (
                <th key={ct.id} className="px-4 py-3 font-semibold">
                  {ct.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {slots.map((slot) => (
              <tr key={slot.startMinute} className="hover:bg-slate-50/50">
                <td className="px-4 py-3 font-mono font-semibold text-slate-800 tabular-nums whitespace-nowrap">
                  {formatMinutes(slot.startMinute)}–{formatMinutes(slot.endMinute)}
                </td>
                {activeCourts.map((ct) => {
                  const bk = bookingsOnDate.find(
                    (b) =>
                      b.courtId === ct.id &&
                      b.startMinute < slot.endMinute &&
                      b.endMinute > slot.startMinute
                  );
                  if (!bk) {
                    return (
                      <td key={ct.id} className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() =>
                            setWalkInTarget({
                              court: ct,
                              startMinute: slot.startMinute,
                              endMinute: slot.endMinute,
                            })
                          }
                          className="inline-flex w-full min-h-[40px] items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-200 px-2 py-1.5 text-slate-500 hover:border-emerald-600 hover:bg-emerald-50 hover:text-emerald-800 cursor-pointer"
                        >
                          <PhoneCall className="h-3.5 w-3.5" />
                          <span>Cargar tel/mostrador</span>
                        </button>
                      </td>
                    );
                  }

                  return (
                    <td key={ct.id} className="px-3 py-2">
                      <div
                        className={`rounded-xl border p-2.5 ${
                          bk.status === 'no_show'
                            ? 'border-red-200 bg-red-50'
                            : bk.status === 'held'
                              ? 'border-amber-200 bg-amber-50'
                              : 'border-slate-200 bg-slate-50'
                        }`}
                      >
                        <p className="font-semibold text-slate-900 truncate max-w-[180px]">
                          {bk.guestName || 'Jugador App'}
                        </p>
                        <p className="mt-0.5 text-[11px] text-slate-600">
                          <span className="font-mono tabular-nums">{formatUYU(bk.totalPrice)}</span>
                          <span className="mx-1" aria-hidden="true">·</span>
                          <span
                            className={
                              bk.paymentStatus === 'paid'
                                ? 'font-semibold text-emerald-700'
                                : 'font-semibold text-amber-700'
                            }
                          >
                            {bk.paymentStatus === 'paid'
                              ? 'Pagado'
                              : bk.paymentStatus === 'deposit_paid'
                                ? `Seña (${formatUYU(bk.paidAmount)})`
                                : 'Impago'}
                          </span>
                        </p>

                        {bk.status === 'confirmed' && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {bk.paymentStatus !== 'paid' && (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => handleMarkPaid(bk, 'efectivo')}
                                className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700 cursor-pointer"
                              >
                                <Banknote className="h-3 w-3" />
                                Cobrar
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => handleMarkNoShow(bk)}
                              className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-white px-2 py-1 text-[11px] font-medium text-red-700 hover:bg-red-50 cursor-pointer"
                            >
                              <UserX className="h-3 w-3" />
                              Ausencia
                            </button>
                          </div>
                        )}
                        {bk.status === 'no_show' && (
                          <p className="mt-1 text-[11px] font-semibold text-red-700">Ausencia marcada</p>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Tournament Result Loader */}
      {activeTournaments.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-4">
            <Trophy className="h-4 w-4 text-emerald-600" />
            <h2 className="font-display text-lg font-bold text-slate-900">
              Cargar resultados de torneos en juego
            </h2>
          </div>

          <div className="mt-4 space-y-6">
            {activeTournaments.map((trn) => (
              <div key={trn.id} className="space-y-3">
                <h3 className="text-sm font-bold text-slate-900">{trn.name}</h3>
                <div className="grid gap-3 md:grid-cols-2">
                  {trn.matches
                    .filter((m) => m.status === 'scheduled' && !m.pair1Id.startsWith('tbd'))
                    .map((m) => {
                      const draft = scoreInputs[m.id] || { score: '6-3 / 6-4', winner: m.pair1Id };
                      return (
                        <div key={m.id} className="rounded-xl border border-slate-200 p-4 text-xs">
                          <p className="font-semibold text-emerald-700">
                            {m.round} · {m.courtName} ({m.date} {formatMinutes(m.startMinute)})
                          </p>
                          <p className="mt-1 font-medium text-slate-900">
                            {m.pair1Label} vs {m.pair2Label}
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <input
                              type="text"
                              value={draft.score}
                              onChange={(e) =>
                                setScoreInputs((prev) => ({
                                  ...prev,
                                  [m.id]: { ...draft, score: e.target.value },
                                }))
                              }
                              placeholder="6-4 / 7-5"
                              className="w-28 rounded-lg border border-slate-200 px-2.5 py-1.5 font-mono text-xs"
                            />
                            <select
                              value={draft.winner}
                              onChange={(e) =>
                                setScoreInputs((prev) => ({
                                  ...prev,
                                  [m.id]: { ...draft, winner: e.target.value },
                                }))
                              }
                              className="flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs"
                            >
                              <option value={m.pair1Id}>Gana: {m.pair1Label}</option>
                              <option value={m.pair2Id}>Gana: {m.pair2Label}</option>
                            </select>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={async () => {
                                setBusy(true);
                                try {
                                  await recordTournamentMatchResult({
                                    club,
                                    tournament: trn,
                                    matchId: m.id,
                                    score: draft.score,
                                    winnerPairId: draft.winner,
                                    staffUid: userProfile.uid,
                                  });
                                  onToast('Resultado cargado y cuadro actualizado.');
                                } finally {
                                  setBusy(false);
                                }
                              }}
                              className="rounded-lg bg-slate-900 px-3 py-1.5 font-semibold text-white hover:bg-slate-800 cursor-pointer"
                            >
                              Guardar
                            </button>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Walk-in / Phone Booking Modal */}
      {walkInTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <form
            onSubmit={handleCreateWalkIn}
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-display text-lg font-bold text-slate-900">
                  Nueva reserva de mostrador / teléfono
                </h3>
                <p className="mt-0.5 font-mono text-xs text-slate-500 tabular-nums">
                  {walkInTarget.court.name} · {selectedDate} {formatMinutes(walkInTarget.startMinute)} hs ·{' '}
                  {formatUYU(calculateSlotPrice(club, selectedDate, walkInTarget.startMinute))}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setWalkInTarget(null)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Nombre del cliente (no requiere app)
                </label>
                <input
                  type="text"
                  required
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  placeholder="Ej. Martín López"
                  className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                />
              </div>

              <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3">
                <span className="text-xs font-semibold text-slate-700">¿Cobra ahora en mostrador?</span>
                <input
                  type="checkbox"
                  checked={paidNow}
                  onChange={(e) => setPaidNow(e.target.checked)}
                  className="h-4 w-4 accent-emerald-600"
                />
              </div>

              {paidNow && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Medio de cobro</label>
                  <select
                    value={method}
                    onChange={(e) => setMethod(e.target.value as 'efectivo' | 'transferencia')}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  >
                    <option value="efectivo">Efectivo en club</option>
                    <option value="transferencia">Transferencia</option>
                  </select>
                </div>
              )}
            </div>

            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setWalkInTarget(null)}
                className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-700 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={busy}
                className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 cursor-pointer"
              >
                {busy ? 'Guardando...' : 'Confirmar turno'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
