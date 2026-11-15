import React, { useEffect, useMemo, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, CircleX, Plus, Trash2, X } from 'lucide-react';
import type {
  Booking,
  Club,
  ClubMembership,
  Court,
  FillSearch,
  PaymentRecord,
  ProposedMatch,
  Tournament,
  UserProfile,
} from '../types/padel';
import {
  addDaysISO,
  calculateSlotPrice,
  formatCategory,
  formatMinutes,
  formatUYU,
  generateDaySlots,
  getDayOfWeekFromISO,
  getTodayISO,
} from '../lib/padelUtils';
import {
  cancelBooking,
  createCounterBooking,
  markBookingNoShow,
  markBookingPaidAtCounter,
  markMatchSharesPaidAtCounter,
  recordTournamentMatchResult,
  stopFillSearch,
  type CounterPaymentMethod,
} from '../services/firestoreService';
import { BrandIcon } from './BrandIcon';
import { BADGE_CLASSES, searchForMatch } from './FaltaUno';

interface StaffCounterViewProps {
  club: Club;
  courts: Court[];
  bookings: Booking[];
  memberships: ClubMembership[];
  proposedMatches: ProposedMatch[];
  fillSearches?: FillSearch[];
  tournaments: Tournament[];
  payments: PaymentRecord[];
  userProfile: UserProfile;
  onToast: (msg: string) => void;
}

type Filter = 'all' | 'due' | 'free';
type Slot = { startMinute: number; endMinute: number };

const DAY_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const DAY_LONG = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export const PAY_METHODS: { id: CounterPaymentMethod; label: string }[] = [
  { id: 'efectivo', label: 'Efectivo' },
  { id: 'transferencia', label: 'Transferencia' },
  { id: 'debito_club', label: 'Tarjeta' },
];

export const payMethodLabel = (m: string) =>
  m === 'mercadopago' ? 'Mercado Pago' : PAY_METHODS.find((p) => p.id === m)?.label ?? m;

const courtDescription = (c: Court) =>
  [c.roof === 'techada' ? 'Techada' : 'Aire libre', c.surface === 'cristal' ? 'cristal' : 'muro', c.hasLights ? 'luz' : '']
    .filter(Boolean)
    .join(' · ');

const nowMinute = () => {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
};

const toDate = (v: unknown): Date | null => {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'object' && v !== null && 'toDate' in v && typeof (v as { toDate: unknown }).toDate === 'function') {
    return (v as { toDate: () => Date }).toDate();
  }
  return null;
};

/** Quita el sufijo viejo "(Mostrador)" de reservas cargadas con el prototipo. */
const cleanGuest = (name: string) => name.replace(/\s*\(Mostrador\)\s*$/, '');

const surname = (full: string) => {
  const parts = full.trim().split(/\s+/);
  return parts.length > 1 ? parts[parts.length - 1] : parts[0];
};

interface CellInfo {
  kind: 'app' | 'counter' | 'phone' | 'matched' | 'tournament' | 'held' | 'no_show';
  tag: string;
  title: string;
  subtitle: string;
  payLabel: string;
  payTone: 'paid' | 'due' | 'none' | 'danger';
  due: number;
  match?: ProposedMatch;
  fill?: { label: string; detail: string; tone: 'amber' | 'green' | 'red'; search: FillSearch };
}

/** Estado de "Falta uno" para el mostrador (vista 7 de la vista previa). */
function fillInfo(search: FillSearch | undefined, match: ProposedMatch): CellInfo['fill'] {
  if (!search) return undefined;
  const missing = Math.max(0, search.seatsNeeded - search.seatsFilled);
  if (search.status === 'searching') {
    return {
      label: missing === 1 ? 'Falta uno · buscando' : `Faltan ${missing} · buscando`,
      detail: `Se bajó ${search.seatsNeeded === 1 ? 'un jugador' : `${search.seatsNeeded} jugadores`}. ${search.invitedUids.length ? `Avisamos a ${search.invitedUids.length} de la categoría` : 'Estamos avisando a jugadores de la categoría'}; el primero que confirma entra. No tenés que llamar a nadie.`,
      tone: 'amber',
      search,
    };
  }
  if (search.status === 'filled') {
    return { label: 'Lo llenó Armá Partido', detail: 'Se bajó un jugador y el reemplazo entró solo.', tone: 'green', search };
  }
  if (search.status === 'unfilled' && search.choice !== 'cancel') {
    return {
      label: `Sin cuarto · juegan ${match.slots.length}`,
      detail: search.choice === 'play_as_three' ? `No apareció reemplazo. Eligieron jugar igual entre ${match.slots.length}.` : 'No apareció reemplazo. Los jugadores están eligiendo si juegan igual o cancelan.',
      tone: 'red',
      search,
    };
  }
  return undefined;
}

export const StaffCounterView: React.FC<StaffCounterViewProps> = ({
  club,
  courts,
  bookings,
  memberships,
  proposedMatches,
  fillSearches = [],
  tournaments,
  payments,
  userProfile,
  onToast,
}) => {
  const today = getTodayISO();
  const [selectedDate, setSelectedDate] = useState(today);
  const [filter, setFilter] = useState<Filter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newTarget, setNewTarget] = useState<{ courtId: string; startMinute: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [minuteNow, setMinuteNow] = useState(nowMinute());

  useEffect(() => {
    const t = window.setInterval(() => setMinuteNow(nowMinute()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDaysISO(selectedDate, i - (selectedDate === today ? 0 : 3))), [selectedDate, today]);

  const activeCourts = useMemo(() => courts.filter((c) => c.active), [courts]);
  const slots = useMemo(() => generateDaySlots(club), [club]);
  const memberByUid = useMemo(() => new Map(memberships.map((m) => [m.uid, m])), [memberships]);

  const dayBookings = useMemo(
    () => bookings.filter((b) => b.date === selectedDate && b.status !== 'cancelled'),
    [bookings, selectedDate]
  );

  const findBooking = (courtId: string, slot: Slot) =>
    dayBookings.find((b) => b.courtId === courtId && b.startMinute < slot.endMinute && b.endMinute > slot.startMinute);

  const describe = (b: Booking): CellInfo => {
    const due = Math.max(0, b.totalPrice - b.paidAmount);
    const payState = (): Pick<CellInfo, 'payLabel' | 'payTone'> => {
      if (b.paymentStatus === 'paid') {
        return { payLabel: b.paymentMethod === 'mercadopago' ? 'Mercado Pago' : 'Pagado', payTone: 'paid' };
      }
      if (b.paymentStatus === 'deposit_paid') return { payLabel: 'Resta cobrar', payTone: 'due' };
      return { payLabel: 'Por cobrar', payTone: 'due' };
    };

    if (b.status === 'no_show') {
      const who = cleanGuest(b.guestName) || memberByUid.get(b.playerUids[0] || b.createdByUid)?.displayName || 'Jugador';
      const member = memberByUid.get(b.playerUids[0] || b.createdByUid);
      return {
        kind: 'no_show',
        tag: 'Ausencia',
        title: who,
        subtitle: member ? `No vino · ${member.noShowCount} ${member.noShowCount === 1 ? 'falta' : 'faltas'}` : 'No vino',
        payLabel: 'Sin cobrar',
        payTone: 'danger',
        due: 0,
      };
    }

    if (b.type === 'tournament') {
      const trn = tournaments.find((t) =>
        t.matches.some((m) => m.courtId === b.courtId && m.date === b.date && m.startMinute === b.startMinute)
      );
      const m = trn?.matches.find((x) => x.courtId === b.courtId && x.date === b.date && x.startMinute === b.startMinute);
      return {
        kind: 'tournament',
        tag: 'Torneo',
        title: trn?.name ?? 'Torneo',
        subtitle: m ? `${m.round} · ${m.pair1Label} vs ${m.pair2Label}` : b.guestName.replace(/^Torneo:\s*/, ''),
        payLabel: m?.status === 'completed' ? `Terminado · ${m.score}` : '',
        payTone: 'none',
        due: 0,
      };
    }

    const match = proposedMatches.find((pm) => pm.bookingId === b.id);
    if (b.status === 'held') {
      const accepted = match ? match.slots.filter((s) => s.status === 'accepted').length : 0;
      const expires = b.holdExpiresAt ? new Date(b.holdExpiresAt) : null;
      return {
        kind: 'held',
        tag: 'Retenida · armando partido',
        title: match ? `${formatCategory(match.minCategory)} · ${accepted} de ${match.slots.length} aceptaron` : 'Armando partido',
        subtitle: expires && !Number.isNaN(expires.getTime())
          ? `Se libera a las ${formatMinutes(expires.getHours() * 60 + expires.getMinutes())} si no se completa`
          : 'Se libera si no se completa a tiempo',
        payLabel: '',
        payTone: 'none',
        due: 0,
        match,
      };
    }

    if (b.type === 'matched' && match) {
      const paid = match.slots.filter((s) => s.paid).length;
      const accepted = match.slots.filter((s) => s.status === 'accepted').length;
      return {
        kind: 'matched',
        tag: `Partido armado · ${formatCategory(match.minCategory)}`,
        title: match.slots.map((s) => surname(s.displayName)).join(', '),
        subtitle: `${accepted} de ${match.slots.length} confirmados`,
        payLabel: `${paid} de ${match.slots.length} pagaron`,
        payTone: paid >= match.slots.length ? 'paid' : 'due',
        due: Math.max(0, (match.slots.length - paid) * match.pricePerPlayer),
        match,
        fill: fillInfo(searchForMatch(fillSearches, match.id), match),
      };
    }

    if (b.type === 'counter') {
      const raw = cleanGuest(b.guestName);
      const [name, phone] = raw.split(' · ');
      const staff = memberByUid.get(b.createdByUid)?.displayName;
      return {
        kind: phone ? 'phone' : 'counter',
        tag: phone ? 'Teléfono' : 'Mostrador',
        title: name || 'Cliente',
        subtitle: [staff ? `Cargada por ${staff.split(' ')[0]}` : 'Cargada en el mostrador', phone].filter(Boolean).join(' · '),
        ...payState(),
        due,
      };
    }

    const member = memberByUid.get(b.playerUids[0] || b.createdByUid);
    const depositNote = b.paymentStatus === 'deposit_paid' ? ` · seña ${formatUYU(b.paidAmount)}` : '';
    return {
      kind: 'app',
      tag: 'Reserva app',
      title: cleanGuest(b.guestName) || member?.displayName || 'Jugador',
      subtitle: `${member ? formatCategory(member.category) : 'Jugador de la app'}${depositNote}`,
      ...payState(),
      due,
    };
  };

  // ----- Números de arriba -----
  const stats = useMemo(() => {
    const total = slots.length * activeCourts.length;
    const used = dayBookings.length;
    let dueTotal = 0;
    let dueCount = 0;
    let mpPaid = 0;
    for (const b of dayBookings) {
      if (b.status !== 'confirmed' || b.type === 'tournament') continue;
      const info = describe(b);
      if (info.due > 0) {
        dueTotal += info.due;
        dueCount += 1;
      }
      if (b.paymentMethod === 'mercadopago') mpPaid += b.paidAmount;
    }
    const currentSlot = slots.find((s) => minuteNow >= s.startMinute && minuteNow < s.endMinute);
    const playingNow =
      selectedDate === today && currentSlot
        ? activeCourts.filter((c) => findBooking(c.id, currentSlot)).length
        : 0;
    const nextSlot = slots.find((s) => s.startMinute > minuteNow);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return { total, used, dueTotal, dueCount, mpPaid, currentSlot, playingNow, nextSlot };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayBookings, slots, activeCourts, minuteNow, selectedDate, today, proposedMatches, fillSearches, memberships, tournaments]);

  const cashToday = useMemo(() => {
    const byMethod: Record<string, number> = { efectivo: 0, transferencia: 0, debito_club: 0 };
    for (const p of payments) {
      if (p.kind === 'platform_subscription' || p.method === 'mercadopago') continue;
      const d = toDate(p.createdAt);
      if (!d) continue;
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (iso !== today) continue;
      byMethod[p.method] = (byMethod[p.method] ?? 0) + p.amount;
    }
    return { total: byMethod.efectivo + byMethod.transferencia + byMethod.debito_club, byMethod };
  }, [payments, today]);

  const freeCount = useMemo(
    () => slots.reduce((acc, s) => acc + activeCourts.filter((c) => !findBooking(c.id, s)).length, 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [slots, activeCourts, dayBookings]
  );

  const selected = dayBookings.find((b) => b.id === selectedId) || null;
  const activeTournaments = tournaments.filter((t) => t.status === 'draw_generated' || t.status === 'in_progress');

  const [y, m, d] = selectedDate.split('-').map(Number);
  const dateLabel = `${selectedDate === today ? 'Hoy, ' : ''}${DAY_LONG[getDayOfWeekFromISO(selectedDate)].toLowerCase()} ${d} de ${MONTHS[m - 1]}`;
  void y;

  const visibleForFilter = (b: Booking | undefined) => {
    if (filter === 'all') return true;
    if (filter === 'free') return !b;
    if (!b) return false;
    return b.status === 'confirmed' && describe(b).due > 0;
  };

  const isCurrentRow = (s: Slot) => selectedDate === today && minuteNow >= s.startMinute && minuteNow < s.endMinute;

  return (
    <div className="space-y-5">
      {/* Encabezado */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold tracking-wide text-emerald-700 uppercase">Mostrador</p>
          <h1 className="mt-1 font-display text-2xl font-bold text-ink sm:text-3xl">Canchas de {selectedDate === today ? 'hoy' : 'la fecha'}</h1>
          <p className="mt-1 text-sm text-muted first-letter:uppercase">
            {dateLabel} · turnos de {club.slotDurationMinutes || 90} minutos · abierto de {club.openHour}:00 a {formatMinutes(club.closeHour * 60)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setNewTarget({ courtId: activeCourts[0]?.id ?? '', startMinute: (stats.nextSlot ?? slots[0])?.startMinute ?? 0 })}
          className="hidden items-center justify-center gap-2 rounded-xl bg-action px-5 py-3 text-sm font-semibold text-on-action shadow-sm hover:brightness-95 cursor-pointer sm:inline-flex"
        >
          <Plus className="h-4 w-4" /> Nueva reserva (teléfono o mostrador)
        </button>
      </div>

      {/* Números del día */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <Kpi title={selectedDate === today ? 'Ocupación de hoy' : 'Ocupación'}>
          <p className="font-display text-2xl font-bold tabular-nums sm:text-3xl">
            {stats.total ? Math.round((stats.used / stats.total) * 100) : 0}%
            <span className="ml-2 text-xs font-normal text-muted sm:text-sm">{stats.used} de {stats.total} turnos</span>
          </p>
          <div className="mt-2.5 h-1.5 rounded-full bg-mist">
            <div className="h-full rounded-full bg-emerald-600" style={{ width: `${stats.total ? (stats.used / stats.total) * 100 : 0}%` }} />
          </div>
        </Kpi>
        <Kpi title="En cancha ahora" className="hidden lg:block">
          {selectedDate === today && stats.currentSlot ? (
            <>
              <p className="font-display text-3xl font-bold tabular-nums">
                {stats.playingNow} / {activeCourts.length}
                <span className="ml-2 text-sm font-normal text-muted">
                  {formatMinutes(stats.currentSlot.startMinute)} a {formatMinutes(stats.currentSlot.endMinute)}
                </span>
              </p>
              {stats.nextSlot && <p className="mt-1.5 text-xs text-muted">Próximo turno a las {formatMinutes(stats.nextSlot.startMinute)}</p>}
            </>
          ) : (
            <p className="mt-1 text-sm text-muted">{selectedDate === today ? 'El club está cerrado ahora.' : 'Solo se ve en el día de hoy.'}</p>
          )}
        </Kpi>
        <Kpi title="Cobrado hoy en el club" className="hidden lg:block">
          <p className="font-display text-3xl font-bold tabular-nums">{formatUYU(cashToday.total)}</p>
          <p className="mt-1.5 text-xs text-muted">
            Efectivo {formatUYU(cashToday.byMethod.efectivo)} · Transf. {formatUYU(cashToday.byMethod.transferencia)} · Tarjeta {formatUYU(cashToday.byMethod.debito_club)}
          </p>
        </Kpi>
        <Kpi title="Por cobrar">
          <p className="font-display text-2xl font-bold tabular-nums text-amber-700 sm:text-3xl">
            {formatUYU(stats.dueTotal)}
            <span className="ml-2 text-xs font-normal text-muted sm:text-sm">{stats.dueCount} {stats.dueCount === 1 ? 'turno' : 'turnos'}</span>
          </p>
          {stats.mpPaid > 0 && <p className="mt-1.5 hidden text-xs text-muted sm:block">+ {formatUYU(stats.mpPaid)} ya pagado por Mercado Pago</p>}
        </Kpi>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-3">
          {/* Días y filtro */}
          <div className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex items-center gap-1.5 overflow-x-auto">
              <button type="button" aria-label="Día anterior" onClick={() => setSelectedDate(addDaysISO(selectedDate, -1))} className="hidden h-11 w-9 shrink-0 items-center justify-center rounded-xl border border-line bg-white text-muted hover:bg-mist cursor-pointer sm:flex">
                <ChevronLeft className="h-4 w-4" />
              </button>
              {days.map((iso) => {
                const on = iso === selectedDate;
                const dd = Number(iso.split('-')[2]);
                return (
                  <button
                    key={iso}
                    type="button"
                    onClick={() => setSelectedDate(iso)}
                    className={`shrink-0 rounded-xl border px-3 py-1.5 text-center text-[13px] leading-tight font-semibold cursor-pointer ${
                      on ? 'border-brand bg-brand text-white' : 'border-line bg-white text-ink hover:bg-mist'
                    }`}
                  >
                    {iso === today ? 'Hoy' : DAY_SHORT[getDayOfWeekFromISO(iso)]}
                    <span className={`block text-[11px] font-normal ${on ? 'text-emerald-100' : 'text-muted'}`}>
                      {iso === today ? `${DAY_SHORT[getDayOfWeekFromISO(iso)].toLowerCase()} ${dd}` : dd}
                    </span>
                  </button>
                );
              })}
              <button type="button" aria-label="Día siguiente" onClick={() => setSelectedDate(addDaysISO(selectedDate, 1))} className="hidden h-11 w-9 shrink-0 items-center justify-center rounded-xl border border-line bg-white text-muted hover:bg-mist cursor-pointer sm:flex">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <div className="flex rounded-xl bg-mist p-1">
              {(
                [
                  ['all', 'Todas'],
                  ['due', `Por cobrar (${stats.dueCount})`],
                  ['free', `Libres (${freeCount})`],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFilter(id)}
                  className={`flex-1 whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px] font-semibold cursor-pointer ${
                    filter === id ? 'bg-white text-ink shadow-xs' : 'text-muted hover:text-ink'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {activeCourts.length === 0 ? (
            <div className="rounded-2xl border border-line bg-white p-8 text-center text-sm text-muted">
              El club todavía no tiene canchas habilitadas. Se cargan en Admin del club.
            </div>
          ) : (
            <>
              {/* Grilla (tablet y compu) */}
              <div className="hidden overflow-x-auto rounded-2xl border border-line bg-white p-1 md:block">
                <table className="w-full min-w-[720px] table-fixed border-separate border-spacing-2 text-left">
                  <thead>
                    <tr>
                      <th className="w-[92px]" />
                      {activeCourts.map((ct) => (
                        <th key={ct.id} className="px-1.5 pt-2 align-bottom">
                          <span className="block text-[13px] font-semibold text-ink">{ct.name}</span>
                          <span className="block text-[11.5px] font-normal text-muted">{courtDescription(ct)}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {slots.map((slot) => {
                      const current = isCurrentRow(slot);
                      return (
                        <tr key={slot.startMinute}>
                          <td className={`rounded-xl px-1.5 py-2.5 align-top ${current ? 'bg-[#e6fbfc]' : ''}`}>
                            <span className={`block font-display text-[15px] font-bold tabular-nums ${current ? 'text-emerald-700' : 'text-ink'}`}>
                              {formatMinutes(slot.startMinute)}
                            </span>
                            <span className="block text-xs text-muted tabular-nums">a {formatMinutes(slot.endMinute)}</span>
                            {current && (
                              <span className="mt-2 inline-block rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white">EN JUEGO</span>
                            )}
                          </td>
                          {activeCourts.map((ct) => {
                            const b = findBooking(ct.id, slot);
                            const dim = !visibleForFilter(b);
                            if (!b) {
                              return (
                                <td key={ct.id} className={`h-[100px] p-0 align-top ${current ? 'bg-[#e6fbfc]' : ''} ${dim ? 'opacity-30' : ''}`}>
                                  <button
                                    type="button"
                                    onClick={() => setNewTarget({ courtId: ct.id, startMinute: slot.startMinute })}
                                    className="flex h-full w-full flex-col items-center justify-center rounded-xl border border-dashed border-line text-[13px] font-semibold text-emerald-700 hover:border-emerald-600 hover:bg-emerald-50 cursor-pointer"
                                  >
                                    + Cargar reserva
                                    <span className="text-xs font-normal text-muted tabular-nums">{formatUYU(calculateSlotPrice(club, selectedDate, slot.startMinute))}</span>
                                  </button>
                                </td>
                              );
                            }
                            const info = describe(b);
                            return (
                              <td key={ct.id} className={`h-[100px] p-0 align-top ${dim ? 'opacity-30' : ''}`}>
                                <BookingCell info={info} booking={b} selected={selectedId === b.id} onClick={() => setSelectedId(b.id)} />
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Lista por turno (celular) */}
              <div className="space-y-4 md:hidden">
                {slots.map((slot) => {
                  const items = activeCourts
                    .map((ct) => ({ ct, b: findBooking(ct.id, slot) }))
                    .filter(({ b }) => visibleForFilter(b));
                  if (items.length === 0) return null;
                  const current = isCurrentRow(slot);
                  const free = items.filter((i) => !i.b).length;
                  return (
                    <section key={slot.startMinute}>
                      <h3 className="mb-2 flex items-center gap-2 font-display text-[15px] font-bold tabular-nums">
                        {formatMinutes(slot.startMinute)} a {formatMinutes(slot.endMinute)}
                        {current && <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white">EN JUEGO</span>}
                        {!current && free > 0 && <span className="text-xs font-normal text-muted">· {free} {free === 1 ? 'libre' : 'libres'}</span>}
                      </h3>
                      <div className="space-y-2">
                        {items.map(({ ct, b }) =>
                          b ? (
                            <MobileRow key={ct.id} court={ct} info={describe(b)} booking={b} onClick={() => setSelectedId(b.id)} />
                          ) : (
                            <button
                              key={ct.id}
                              type="button"
                              onClick={() => setNewTarget({ courtId: ct.id, startMinute: slot.startMinute })}
                              className="flex w-full items-center justify-between rounded-2xl border border-dashed border-line px-3.5 py-3 text-left cursor-pointer"
                            >
                              <span>
                                <span className="block text-[11px] font-bold tracking-wide text-muted uppercase">{ct.name} · Libre</span>
                                <span className="mt-0.5 block text-sm font-semibold text-emerald-700">+ Cargar reserva</span>
                              </span>
                              <span className="text-sm font-bold text-muted tabular-nums">{formatUYU(calculateSlotPrice(club, selectedDate, slot.startMinute))}</span>
                            </button>
                          )
                        )}
                      </div>
                    </section>
                  );
                })}
              </div>

              <div className="hidden flex-wrap gap-4 px-1 text-xs text-muted md:flex">
                <Legend className="bg-white" label="Reservada" />
                <Legend className="bg-amber-50" label="Retenida mientras se arma un partido" />
                <Legend className="bg-indigo-50" label="Torneo" />
                <Legend className="bg-red-50" label="Ausencia" />
                <Legend className="border-dashed" label="Libre" />
              </div>
            </>
          )}
        </div>

        {/* Panel derecho */}
        <div className="space-y-4">
          <div className="hidden lg:block">
            {selected ? (
              <ChargePanel
                key={selected.id}
                club={club}
                booking={selected}
                info={describe(selected)}
                memberByUid={memberByUid}
                memberships={memberships}
                userProfile={userProfile}
                busy={busy}
                setBusy={setBusy}
                onToast={onToast}
                onClose={() => setSelectedId(null)}
              />
            ) : (
              <div className="rounded-2xl border border-line bg-white p-5 text-sm text-muted">
                <p className="text-xs font-semibold tracking-wide text-emerald-700 uppercase">Cobrar turno</p>
                <p className="mt-2">Tocá una reserva de la grilla para cobrarla, marcar una ausencia o cancelarla.</p>
              </div>
            )}
          </div>
          {activeTournaments.length > 0 && (
            <TournamentResults club={club} tournaments={activeTournaments} userProfile={userProfile} busy={busy} setBusy={setBusy} onToast={onToast} />
          )}
        </div>
      </div>

      {/* Botón flotante (celular) */}
      <button
        type="button"
        onClick={() => setNewTarget({ courtId: activeCourts[0]?.id ?? '', startMinute: (stats.nextSlot ?? slots[0])?.startMinute ?? 0 })}
        className="fixed right-4 bottom-24 z-30 inline-flex items-center gap-2 rounded-2xl bg-action px-5 py-3.5 text-sm font-semibold text-on-action shadow-lg shadow-emerald-900/20 cursor-pointer sm:hidden"
      >
        <Plus className="h-4 w-4" /> Nueva reserva
      </button>

      {/* Panel de cobro como hoja inferior (celular y tablet) */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 backdrop-blur-[2px] lg:hidden" onClick={() => setSelectedId(null)}>
          <div className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-t-3xl" onClick={(e) => e.stopPropagation()}>
            <ChargePanel
              key={selected.id}
              club={club}
              booking={selected}
              info={describe(selected)}
              memberByUid={memberByUid}
              memberships={memberships}
              userProfile={userProfile}
              busy={busy}
              setBusy={setBusy}
              onToast={onToast}
              onClose={() => setSelectedId(null)}
              sheet
            />
          </div>
        </div>
      )}

      {newTarget && (
        <NewBookingModal
          club={club}
          courts={activeCourts}
          slots={slots}
          date={selectedDate}
          dateLabel={dateLabel}
          initial={newTarget}
          isTaken={(courtId, startMinute) => !!findBooking(courtId, { startMinute, endMinute: startMinute + (club.slotDurationMinutes || 90) })}
          userProfile={userProfile}
          busy={busy}
          setBusy={setBusy}
          onToast={onToast}
          onClose={() => setNewTarget(null)}
        />
      )}
    </div>
  );
};

// ---------- Piezas ----------

const Kpi: React.FC<{ title: string; className?: string; children: React.ReactNode }> = ({ title, className = '', children }) => (
  <div className={`rounded-2xl border border-line bg-white px-4 py-3.5 sm:px-5 sm:py-4 ${className}`}>
    <p className="text-[11px] font-semibold tracking-wider text-muted uppercase sm:text-xs">{title}</p>
    <div className="mt-1.5">{children}</div>
  </div>
);

const Legend: React.FC<{ className: string; label: string }> = ({ className, label }) => (
  <span className="inline-flex items-center gap-1.5">
    <i className={`inline-block h-3 w-3 rounded border border-line ${className}`} />
    {label}
  </span>
);

const toneClass = (tone: CellInfo['payTone']) =>
  tone === 'paid' ? 'text-green-700' : tone === 'due' ? 'text-amber-700' : tone === 'danger' ? 'text-red-700' : 'text-indigo-700';

const cellBg = (kind: CellInfo['kind']) =>
  kind === 'held'
    ? 'bg-amber-50 border-amber-200'
    : kind === 'tournament'
      ? 'bg-indigo-50 border-indigo-200'
      : kind === 'no_show'
        ? 'bg-red-50 border-red-200'
        : 'bg-white border-line';

const tagClass = (kind: CellInfo['kind']) =>
  kind === 'held' ? 'text-amber-700' : kind === 'tournament' ? 'text-indigo-700' : kind === 'no_show' ? 'text-red-700' : 'text-muted';

const BookingCell: React.FC<{ info: CellInfo; booking: Booking; selected: boolean; onClick: () => void }> = ({ info, booking, selected, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`relative flex h-full w-full flex-col rounded-xl border px-2.5 py-2 text-left hover:shadow-sm cursor-pointer ${cellBg(info.kind)} ${
      selected ? 'outline-[3px] -outline-offset-1 outline-emerald-600 outline' : ''
    }`}
  >
    <span className={`text-[10.5px] font-bold tracking-wide uppercase ${tagClass(info.kind)}`}>{info.tag}</span>
    {info.fill && <span className={`mt-0.5 self-start rounded-full px-2 py-px text-[10.5px] font-semibold ${BADGE_CLASSES[info.fill.tone]}`}>{info.fill.label}</span>}
    <span className="mt-0.5 truncate text-[13.5px] font-semibold text-ink">{info.title}</span>
    <span className="truncate text-xs text-muted">{info.subtitle}</span>
    <span className="mt-auto flex items-center justify-between gap-2 pt-1 text-xs">
      <span className={`truncate font-semibold ${toneClass(info.payTone)}`}>{info.payLabel}</span>
      {info.kind !== 'tournament' && <span className="shrink-0 tabular-nums text-ink">{formatUYU(info.due > 0 && booking.paymentStatus === 'deposit_paid' && info.kind !== 'matched' ? info.due : booking.totalPrice)}</span>}
    </span>
  </button>
);

const MobileRow: React.FC<{ court: Court; info: CellInfo; booking: Booking; onClick: () => void }> = ({ court, info, booking, onClick }) => (
  <button type="button" onClick={onClick} className={`flex w-full items-center justify-between gap-3 rounded-2xl border px-3.5 py-3 text-left cursor-pointer ${cellBg(info.kind)}`}>
    <span className="min-w-0">
      <span className={`block text-[11px] font-bold tracking-wide uppercase ${tagClass(info.kind)}`}>
        {court.name} · {info.kind === 'matched' ? 'Partido armado' : info.kind === 'held' ? 'Retenida' : info.tag}
      </span>
      {info.fill && <span className={`mt-0.5 inline-block rounded-full px-2 py-px text-[11px] font-semibold ${BADGE_CLASSES[info.fill.tone]}`}>{info.fill.label}</span>}
      <span className="mt-0.5 block truncate text-sm font-semibold text-ink">{info.title}</span>
      <span className="block truncate text-xs text-muted">{info.subtitle}</span>
    </span>
    {info.kind !== 'tournament' && info.kind !== 'held' && (
      <span className="shrink-0 text-right text-xs">
        <span className="block text-sm font-bold tabular-nums text-ink">{formatUYU(booking.totalPrice)}</span>
        <span className={`font-semibold ${toneClass(info.payTone)}`}>{info.payLabel}</span>
      </span>
    )}
  </button>
);

const MethodPicker: React.FC<{ value: CounterPaymentMethod; onChange: (m: CounterPaymentMethod) => void }> = ({ value, onChange }) => (
  <div className="grid grid-cols-3 gap-2">
    {PAY_METHODS.map((p) => (
      <button
        key={p.id}
        type="button"
        onClick={() => onChange(p.id)}
        className={`rounded-xl border py-2.5 text-[13px] font-semibold cursor-pointer ${
          value === p.id ? 'border-2 border-emerald-600 bg-emerald-50 text-brand' : 'border-line bg-white text-ink hover:bg-mist'
        }`}
      >
        {p.label}
      </button>
    ))}
  </div>
);

interface ChargePanelProps {
  club: Club;
  booking: Booking;
  info: CellInfo;
  memberByUid: Map<string, ClubMembership>;
  memberships: ClubMembership[];
  userProfile: UserProfile;
  busy: boolean;
  setBusy: (b: boolean) => void;
  onToast: (msg: string) => void;
  onClose: () => void;
  sheet?: boolean;
}

const ChargePanel: React.FC<ChargePanelProps> = ({ club, booking, info, memberships, userProfile, busy, setBusy, onToast, onClose, sheet }) => {
  const match = info.match;
  const unpaidUids = match ? match.slots.filter((s) => !s.paid).map((s) => s.uid) : [];
  const [picked, setPicked] = useState<string[]>(unpaidUids);
  const [method, setMethod] = useState<CounterPaymentMethod>('efectivo');
  const [confirmCancel, setConfirmCancel] = useState(false);

  const isMatched = info.kind === 'matched' && match;
  const chargeAmount = isMatched ? picked.length * match.pricePerPlayer : info.due;
  const canCharge = booking.status === 'confirmed' && info.kind !== 'tournament' && chargeAmount > 0;

  const run = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true);
    try {
      await fn();
      onToast(msg);
    } finally {
      setBusy(false);
    }
  };

  const handleCharge = () =>
    run(async () => {
      if (isMatched) {
        await markMatchSharesPaidAtCounter({ club, match, booking, payerUids: picked, staffUid: userProfile.uid, method });
        setPicked([]);
      } else {
        await markBookingPaidAtCounter({ club, booking, staffUid: userProfile.uid, method });
      }
    }, `Cobro registrado: ${formatUYU(chargeAmount)} en ${payMethodLabel(method).toLowerCase()}.`);

  return (
    <div className={`border border-line bg-white p-5 ${sheet ? 'rounded-t-3xl pb-8' : 'rounded-2xl'}`}>
      <div className="flex items-start justify-between gap-3 border-b border-line pb-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-wide text-emerald-700 uppercase">
            {info.kind === 'tournament' ? 'Partido de torneo' : info.kind === 'held' ? 'Cancha retenida' : 'Cobrar turno'}
          </p>
          <h2 className="mt-1 font-display text-lg leading-snug font-bold text-ink">{booking.courtName}</h2>
          <p className="font-display text-[15px] font-semibold tabular-nums text-ink">
            {formatMinutes(booking.startMinute)} a {formatMinutes(booking.endMinute)}
          </p>
          <p className="mt-0.5 text-[13px] text-muted">
            {info.tag} · {formatUYU(booking.totalPrice)} la cancha
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canCharge && (
            <span className="whitespace-nowrap rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800">
              {isMatched ? `Faltan ${match.slots.filter((s) => !s.paid).length}` : 'Por cobrar'}
            </span>
          )}
          <button type="button" onClick={onClose} aria-label="Cerrar" className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-mist cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {info.fill && (
        <div className={`mt-4 rounded-xl px-3.5 py-3 text-[13px] ${BADGE_CLASSES[info.fill.tone]}`}>
          <p className="font-semibold">{info.fill.label}</p>
          <p className="mt-0.5">{info.fill.detail}</p>
          {info.fill.search.status === 'searching' && (
            <button
              type="button"
              disabled={busy}
              onClick={() => run(() => stopFillSearch(club, info.fill!.search.id), 'Listo, dejamos de buscar para este partido.')}
              className="mt-2.5 rounded-lg border border-current/30 bg-white px-3 py-1.5 text-xs font-semibold cursor-pointer disabled:opacity-60"
            >
              Dejar de buscar
            </button>
          )}
        </div>
      )}

      {info.kind === 'tournament' || info.kind === 'held' ? (
        <div className="mt-4 space-y-1 text-sm">
          <p className="font-semibold text-ink">{info.title}</p>
          <p className="text-muted">{info.subtitle}</p>
          {info.kind === 'tournament' && <p className="pt-2 text-xs text-muted">La inscripción del torneo se cobra aparte; este turno no se cobra.</p>}
          {info.kind === 'held' && match && (
            <ul className="mt-3 space-y-1.5">
              {match.slots.map((s) => (
                <li key={s.uid} className="flex justify-between text-[13px]">
                  <span>{s.displayName} · {formatCategory(s.category)}</span>
                  <span className={s.status === 'accepted' ? 'font-semibold text-green-700' : s.status === 'declined' ? 'text-red-700' : 'text-muted'}>
                    {s.status === 'accepted' ? 'Aceptó' : s.status === 'declined' ? 'Rechazó' : 'Esperando'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <>
          {isMatched ? (
            <>
              <p className="mt-4 mb-1 text-xs font-semibold tracking-wider text-muted uppercase">
                Cada uno paga su parte · {formatUYU(match.pricePerPlayer)}
              </p>
              <ul>
                {match.slots.map((s) => {
                  const on = s.paid || picked.includes(s.uid);
                  return (
                    <li key={s.uid} className="flex items-center gap-3 border-b border-[#eef5f5] py-2.5 last:border-0">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-mist text-xs font-bold text-brand">
                        {s.displayName.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-ink">{s.displayName}</span>
                        <span className="block text-xs text-muted">{formatCategory(s.category)}{s.paid ? ' · ya pagó' : ''}</span>
                      </span>
                      <button
                        type="button"
                        disabled={s.paid}
                        aria-label={s.paid ? 'Pagó' : `Cobrar a ${s.displayName}`}
                        onClick={() => setPicked((prev) => (prev.includes(s.uid) ? prev.filter((u) => u !== s.uid) : [...prev, s.uid]))}
                        className={`grid h-6 w-6 place-items-center rounded-md border-2 ${
                          s.paid ? 'border-emerald-600 bg-emerald-600 text-white' : on ? 'border-emerald-600 bg-white text-emerald-700 cursor-pointer' : 'border-line bg-white cursor-pointer'
                        }`}
                      >
                        {on && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <div className="mt-4 flex items-center gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-mist text-xs font-bold text-brand">
                {info.title.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-ink">{info.title}</span>
                <span className="block text-xs text-muted">{info.subtitle}</span>
              </span>
            </div>
          )}

          {canCharge ? (
            <>
              <p className="mt-5 mb-2 text-xs font-semibold tracking-wider text-muted uppercase">Forma de cobro</p>
              <MethodPicker value={method} onChange={setMethod} />
              <div className="mt-5 mb-3 flex items-baseline justify-between">
                <span className="text-sm text-muted">A cobrar ahora{isMatched ? ` (${picked.length})` : ''}</span>
                <span className="font-display text-2xl font-bold tabular-nums">{formatUYU(chargeAmount)}</span>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={handleCharge}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-3.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60 cursor-pointer"
              >
                <Check className="h-4 w-4" /> Registrar cobro
              </button>
            </>
          ) : (
            booking.status === 'confirmed' && (
              <p className="mt-4 rounded-xl bg-green-50 px-3 py-2.5 text-sm font-semibold text-green-800">
                Turno pago{booking.paymentMethod === 'mercadopago' ? ' por Mercado Pago' : ''}.
              </p>
            )
          )}

          {booking.status === 'confirmed' && (
            <div className="mt-4 flex flex-wrap justify-center gap-x-6 gap-y-2 text-[13px] font-semibold">
              <button
                type="button"
                disabled={busy}
                onClick={() => run(() => markBookingNoShow({ club, booking, memberships }), 'Ausencia marcada. Se sumó una falta al jugador.')}
                className="inline-flex items-center gap-1.5 text-red-700 hover:underline cursor-pointer"
              >
                <CircleX className="h-4 w-4" /> Marcar ausencia
              </button>
              {confirmCancel ? (
                <span className="inline-flex items-center gap-2 text-muted">
                  ¿Cancelar la reserva?
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        await cancelBooking({ club, booking, currentUid: userProfile.uid });
                        onClose();
                      }, 'Reserva cancelada. Se avisó al jugador.')
                    }
                    className="text-red-700 hover:underline cursor-pointer"
                  >
                    Sí, cancelar
                  </button>
                  <button type="button" onClick={() => setConfirmCancel(false)} className="hover:underline cursor-pointer">
                    No
                  </button>
                </span>
              ) : (
                <button type="button" onClick={() => setConfirmCancel(true)} className="inline-flex items-center gap-1.5 text-muted hover:underline cursor-pointer">
                  <Trash2 className="h-4 w-4" /> Cancelar reserva
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

const TournamentResults: React.FC<{
  club: Club;
  tournaments: Tournament[];
  userProfile: UserProfile;
  busy: boolean;
  setBusy: (b: boolean) => void;
  onToast: (msg: string) => void;
}> = ({ club, tournaments, userProfile, busy, setBusy, onToast }) => {
  const [drafts, setDrafts] = useState<Record<string, { score: string; winner: string }>>({});
  const pending = tournaments.flatMap((t) =>
    t.matches.filter((m) => m.status === 'scheduled' && !m.pair1Id.startsWith('tbd') && !m.pair2Id.startsWith('tbd')).map((m) => ({ t, m }))
  );
  return (
    <div className="rounded-2xl border border-line bg-white p-5">
      <div className="flex items-center gap-2">
        <BrandIcon name="resultado" className="h-5 w-5 text-emerald-700" />
        <h2 className="font-display text-[15px] font-bold text-ink">Resultados del torneo</h2>
      </div>
      {pending.length === 0 ? (
        <p className="mt-2 text-sm text-muted">No hay partidos de torneo esperando resultado.</p>
      ) : (
        <div className="mt-2 divide-y divide-[#eef5f5]">
          {pending.slice(0, 4).map(({ t, m }) => {
            const draft = drafts[m.id] || { score: '', winner: m.pair1Id };
            return (
              <div key={m.id} className="py-3">
                <p className="text-xs text-muted">
                  {t.name} · {m.round} · {m.courtName} · {formatMinutes(m.startMinute)}
                </p>
                <p className="mt-0.5 text-sm font-semibold text-ink">
                  {m.pair1Label} <span className="font-normal text-muted">vs</span> {m.pair2Label}
                </p>
                <div className="mt-2 flex gap-2">
                  <input
                    type="text"
                    value={draft.score}
                    onChange={(e) => setDrafts((p) => ({ ...p, [m.id]: { ...draft, score: e.target.value } }))}
                    placeholder="6-4 / 7-5"
                    className="w-24 rounded-lg border border-line px-2.5 py-2 text-[13px] tabular-nums"
                  />
                  <select
                    value={draft.winner}
                    onChange={(e) => setDrafts((p) => ({ ...p, [m.id]: { ...draft, winner: e.target.value } }))}
                    className="min-w-0 flex-1 rounded-lg border border-line bg-white px-2 py-2 text-[13px]"
                  >
                    <option value={m.pair1Id}>Gana: {m.pair1Label}</option>
                    <option value={m.pair2Id}>Gana: {m.pair2Label}</option>
                  </select>
                  <button
                    type="button"
                    disabled={busy || !draft.score.trim()}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        await recordTournamentMatchResult({ club, tournament: t, matchId: m.id, score: draft.score.trim(), winnerPairId: draft.winner, staffUid: userProfile.uid });
                        onToast('Resultado cargado. El cuadro se actualizó.');
                      } finally {
                        setBusy(false);
                      }
                    }}
                    className="rounded-lg bg-mist px-3 text-[13px] font-semibold text-brand hover:bg-emerald-100 disabled:opacity-50 cursor-pointer"
                  >
                    Guardar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const NewBookingModal: React.FC<{
  club: Club;
  courts: Court[];
  slots: Slot[];
  date: string;
  dateLabel: string;
  initial: { courtId: string; startMinute: number };
  isTaken: (courtId: string, startMinute: number) => boolean;
  userProfile: UserProfile;
  busy: boolean;
  setBusy: (b: boolean) => void;
  onToast: (msg: string) => void;
  onClose: () => void;
}> = ({ club, courts, slots, date, dateLabel, initial, isTaken, userProfile, busy, setBusy, onToast, onClose }) => {
  const [courtId, setCourtId] = useState(initial.courtId);
  const [startMinute, setStartMinute] = useState(initial.startMinute);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [paidNow, setPaidNow] = useState(false);
  const [method, setMethod] = useState<CounterPaymentMethod>('efectivo');

  const court = courts.find((c) => c.id === courtId);
  const slot = slots.find((s) => s.startMinute === startMinute);
  const taken = court && slot ? isTaken(court.id, slot.startMinute) : true;
  const price = calculateSlotPrice(club, date, startMinute);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!court || !slot || taken || !name.trim()) return;
    setBusy(true);
    try {
      await createCounterBooking({
        club,
        court,
        date,
        startMinute: slot.startMinute,
        endMinute: slot.endMinute,
        staffUid: userProfile.uid,
        guestName: name.trim(),
        phone: phone.trim(),
        paidNow,
        method,
      });
      onToast(`Reserva cargada: ${court.name}, ${formatMinutes(slot.startMinute)}, a nombre de ${name.trim()}.`);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-t-3xl border border-line bg-white p-6 shadow-2xl sm:rounded-2xl">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold tracking-wide text-emerald-700 uppercase">Nueva reserva</p>
            <h3 className="mt-1 font-display text-lg font-bold text-ink">Por teléfono o en el mostrador</h3>
            <p className="mt-0.5 text-[13px] text-muted first-letter:uppercase">{dateLabel}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-mist cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="block text-xs font-semibold text-ink">
            Cancha
            <select value={courtId} onChange={(e) => setCourtId(e.target.value)} className="mt-1.5 w-full rounded-xl border border-line bg-white px-3 py-2.5 text-sm font-normal">
              {courts.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-semibold text-ink">
            Turno
            <select value={startMinute} onChange={(e) => setStartMinute(Number(e.target.value))} className="mt-1.5 w-full rounded-xl border border-line bg-white px-3 py-2.5 text-sm font-normal tabular-nums">
              {slots.map((s) => (
                <option key={s.startMinute} value={s.startMinute} disabled={isTaken(courtId, s.startMinute)}>
                  {formatMinutes(s.startMinute)} a {formatMinutes(s.endMinute)}{isTaken(courtId, s.startMinute) ? ' (ocupado)' : ''}
                </option>
              ))}
            </select>
          </label>
        </div>
        {taken && <p className="mt-2 text-xs font-semibold text-red-700">Ese turno ya está ocupado en esa cancha.</p>}

        <label className="mt-4 block text-xs font-semibold text-ink">
          Nombre (no necesita tener la app)
          <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Joaquín Pérez" className="mt-1.5 w-full rounded-xl border border-line px-3 py-2.5 text-sm font-normal" />
        </label>
        <label className="mt-3 block text-xs font-semibold text-ink">
          Teléfono <span className="font-normal text-muted">(opcional)</span>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="099 123 456" className="mt-1.5 w-full rounded-xl border border-line px-3 py-2.5 text-sm font-normal" />
        </label>

        <div className="mt-4 flex items-center justify-between rounded-xl bg-mist px-3.5 py-3">
          <span className="text-sm">
            <span className="font-semibold text-ink">¿Paga ahora?</span>
            <span className="ml-2 tabular-nums text-muted">{formatUYU(price)}</span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={paidNow}
            onClick={() => setPaidNow(!paidNow)}
            className={`relative h-6 w-11 rounded-full transition-colors cursor-pointer ${paidNow ? 'bg-emerald-600' : 'bg-slate-300'}`}
          >
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${paidNow ? 'left-[22px]' : 'left-0.5'}`} />
          </button>
        </div>
        {paidNow && (
          <div className="mt-3">
            <MethodPicker value={method} onChange={setMethod} />
          </div>
        )}

        <div className="mt-5 flex gap-3">
          <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-line py-3 text-sm font-semibold text-ink hover:bg-mist cursor-pointer">
            Volver
          </button>
          <button type="submit" disabled={busy || taken || !name.trim()} className="flex-1 rounded-xl bg-brand py-3 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50 cursor-pointer">
            {busy ? 'Guardando…' : 'Confirmar reserva'}
          </button>
        </div>
      </form>
    </div>
  );
};
