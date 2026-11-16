import React, { useMemo, useState } from 'react';
import PhotoHeader from './PhotoHeader';
import {
  BellRing,
  CalendarCheck2,
  CalendarPlus,
  ChevronDown,
  Clock,
  CreditCard,
  Download,
  ExternalLink,
  MapPin,
  ShieldAlert,
  Trash2,
  X,
} from 'lucide-react';
import type {
  Booking,
  Club,
  ClubMembership,
  Court,
  CourtWaitlistEntry,
  PlayerMatchResult,
  ProposedMatch,
  Tournament,
  UserProfile,
} from '../types/padel';
import {
  buildGoogleCalendarUrl,
  buildICalContent,
  calculateSlotPrice,
  canCancelFree,
  downloadICalFile,
  formatMinutes,
  formatUYU,
  generateDaySlots,
  getDayOfWeekFromISO,
  getTodayISO,
  getUpcomingDays,
  type PlayerLevelSummary, formatDateFriendly} from '../lib/padelUtils';
import {
  cancelBooking,
  createDirectBooking,
  joinCourtWaitlist,
  leaveCourtWaitlist,
} from '../services/firestoreService';
import { ClubRankingSection } from './ClubRankingSection';
import { MercadoPagoModal } from './MercadoPagoModal';
import { depositFor } from '../lib/caja';
import { BrandIcon } from './BrandIcon';

interface PlayerBookingViewProps {
  club: Club;
  courts: Court[];
  bookings: Booking[];
  waitlistEntries: CourtWaitlistEntry[];
  proposedMatches: ProposedMatch[];
  tournaments: Tournament[];
  memberships: ClubMembership[];
  playerMatchResults: PlayerMatchResult[];
  clubMatchResults: PlayerMatchResult[];
  playerLevelsMap?: Map<string, PlayerLevelSummary>;
  userProfile: UserProfile;
  membership?: ClubMembership;
  onToast: (msg: string) => void;
}

export const PlayerBookingView: React.FC<PlayerBookingViewProps> = ({
  club,
  courts,
  bookings,
  waitlistEntries,
  proposedMatches,
  tournaments,
  memberships,
  playerMatchResults,
  clubMatchResults,
  playerLevelsMap,
  userProfile,
  membership,
  onToast,
}) => {
  const days = useMemo(() => getUpcomingDays(7), []);
  const [selectedDate, setSelectedDate] = useState(getTodayISO());
  const [selectedSlot, setSelectedSlot] = useState<{
    court: Court;
    startMinute: number;
    endMinute: number;
    price: number;
  } | null>(null);
  const [waitlistTarget, setWaitlistTarget] = useState<{
    court: Court;
    startMinute: number;
    endMinute: number;
    isHeld: boolean;
  } | null>(null);
  const [mpOpen, setMpOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [openCalendarId, setOpenCalendarId] = useState<string | null>(null);

  const activeCourts = useMemo(() => courts.filter((c) => c.active), [courts]);
  const slots = useMemo(() => generateDaySlots(club), [club]);
  const isBlocked = membership?.blocked === true;

  const bookingsOnDate = useMemo(
    () =>
      bookings.filter(
        (b) => b.date === selectedDate && (b.status === 'confirmed' || b.status === 'held')
      ),
    [bookings, selectedDate]
  );

  const myBookings = useMemo(
    () =>
      bookings
        .filter(
          (b) =>
            ((b.type !== 'counter' && b.createdByUid === userProfile.uid) || b.playerUids.includes(userProfile.uid)) &&
            b.status !== 'cancelled'
        )
        .sort((a, b) => a.date.localeCompare(b.date) || a.startMinute - b.startMinute),
    [bookings, userProfile.uid]
  );

  const confirmedBookings = useMemo(
    () => myBookings.filter((b) => b.status === 'confirmed'),
    [myBookings]
  );

  const activeWaitlistOnDate = useMemo(
    () =>
      waitlistEntries.filter(
        (w) => w.date === selectedDate && (w.status === 'waiting' || w.status === 'notified')
      ),
    [waitlistEntries, selectedDate]
  );

  const myWaitlistEntries = useMemo(
    () =>
      waitlistEntries
        .filter((w) => w.uid === userProfile.uid && (w.status === 'waiting' || w.status === 'notified'))
        .sort((a, b) => a.date.localeCompare(b.date) || a.startMinute - b.startMinute),
    [waitlistEntries, userProfile.uid]
  );

  const handleJoinWaitlist = async () => {
    if (!waitlistTarget) return;
    setBusy(true);
    try {
      await joinCourtWaitlist({
        club,
        court: waitlistTarget.court,
        date: selectedDate,
        startMinute: waitlistTarget.startMinute,
        endMinute: waitlistTarget.endMinute,
        uid: userProfile.uid,
        displayName: userProfile.displayName,
      });
      onToast(
        `Te anotaste en lista de espera para ${waitlistTarget.court.name} (${formatMinutes(waitlistTarget.startMinute)} hs). Te avisaremos por push si se libera.`
      );
      setWaitlistTarget(null);
    } finally {
      setBusy(false);
    }
  };

  const handleLeaveWaitlist = async (waitlistId: string) => {
    setBusy(true);
    try {
      await leaveCourtWaitlist(club.id, waitlistId);
      onToast('Saliste de la lista de espera.');
      setWaitlistTarget(null);
    } finally {
      setBusy(false);
    }
  };

  const handleBookFromNotifiedWaitlist = (entry: CourtWaitlistEntry) => {
    const court = courts.find((c) => c.id === entry.courtId && c.active);
    if (!court) {
      onToast('La cancha ya no se encuentra disponible.');
      return;
    }
    const stillOccupied = bookings.some(
      (b) =>
        b.date === entry.date &&
        b.courtId === entry.courtId &&
        (b.status === 'confirmed' || b.status === 'held') &&
        b.startMinute < entry.endMinute &&
        b.endMinute > entry.startMinute
    );
    setSelectedDate(entry.date);
    if (stillOccupied) {
      onToast('Otro jugador ya reservó este horario antes. Podés volver a anotarte en la lista.');
      return;
    }
    setSelectedSlot({
      court,
      startMinute: entry.startMinute,
      endMinute: entry.endMinute,
      price: calculateSlotPrice(club, entry.date, entry.startMinute),
    });
  };

  const handleExportSingleICal = (bk: Booking) => {
    const content = buildICalContent(club, [bk]);
    downloadICalFile(`reserva-${club.slug}-${bk.date}.ics`, content);
    setOpenCalendarId(null);
    onToast('Archivo iCal (.ics) descargado.');
  };

  const handleExportAllICal = () => {
    if (confirmedBookings.length === 0) return;
    const content = buildICalContent(club, confirmedBookings);
    downloadICalFile(`reservas-${club.slug}.ics`, content);
    onToast(`Se exportaron ${confirmedBookings.length} reservas confirmadas a iCal (.ics).`);
  };

  const slotDeposit = selectedSlot ? depositFor(club, selectedDate, selectedSlot.startMinute) : 0;

  const handleConfirmBooking = async (paymentChoice: 'club' | 'mercadopago') => {
    if (!selectedSlot) return;
    setBusy(true);
    try {
      await createDirectBooking({
        club,
        court: selectedSlot.court,
        date: selectedDate,
        startMinute: selectedSlot.startMinute,
        endMinute: selectedSlot.endMinute,
        userUid: userProfile.uid,
        userName: userProfile.displayName,
        paymentChoice,
        peakDeposit: depositFor(club, selectedDate, selectedSlot.startMinute),
      });
      onToast(`Reserva confirmada en ${selectedSlot.court.name} (${formatMinutes(selectedSlot.startMinute)} hs).`);
      setSelectedSlot(null);
    } finally {
      setBusy(false);
    }
  };

  const handleCancelBooking = async (booking: Booking) => {
    setBusy(true);
    try {
      const { refunded, notifiedWaitlistCount } = await cancelBooking({
        club,
        booking,
        currentUid: userProfile.uid,
      });
      const waitlistMsg =
        notifiedWaitlistCount > 0
          ? ` Se avisó por push a ${notifiedWaitlistCount} ${notifiedWaitlistCount === 1 ? 'jugador' : 'jugadores'} en lista de espera.`
          : '';
      onToast(
        refunded > 0
          ? `Reserva cancelada. Se devolvieron ${formatUYU(refunded)} vía Mercado Pago.${waitlistMsg}`
          : `Reserva cancelada.${waitlistMsg}`
      );
    } finally {
      setBusy(false);
    }
  };

  const dow = getDayOfWeekFromISO(selectedDate);
  const isWeekend = dow === 0 || dow === 6;

  return (
    <div className="space-y-8">
      <PhotoHeader
        image="/img/cancha-techada.webp"
        title="Reservá tu cancha"
        subtitle={
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" />
            {club.name} · cancelás gratis hasta {club.cancellationHours} h antes
          </span>
        }
      >
        <div className="mt-1 flex flex-wrap gap-2 text-xs tabular-nums">
          <span className="rounded-full bg-white/15 px-3 py-1 text-white">Día {formatUYU(club.basePrice)}</span>
          <span className="rounded-full bg-white/15 px-3 py-1 text-white">Noche desde las {club.nightFromHour} {formatUYU(club.nightPrice)}</span>
          <span className="rounded-full bg-white/15 px-3 py-1 text-white">Fin de semana {formatUYU(club.weekendPrice)}</span>
        </div>
      </PhotoHeader>

      {isBlocked && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
          <div>
            <p className="font-semibold">Cuenta suspendida temporalmente en este club</p>
            <p className="mt-0.5 text-xs text-red-700">
              Registraste {membership?.noShowCount} ausencias sin aviso (máximo permitido: {club.maxNoShowsBeforeBlock}). Contactá al mostrador del club para rehabilitarte.
            </p>
          </div>
        </div>
      )}

      {/* Horizontal Date Scroller */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {days.map((d) => {
          const active = d.iso === selectedDate;
          return (
            <button
              key={d.iso}
              type="button"
              onClick={() => setSelectedDate(d.iso)}
              className={`flex min-h-[56px] min-w-[72px] flex-col items-center justify-center rounded-xl border px-3 py-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                active
                  ? 'border-emerald-600 bg-emerald-600 text-white'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <span className="text-[11px] font-medium opacity-80">{d.dayShort}</span>
              <span className=" text-base font-semibold tabular-nums">{d.dayNum}</span>
            </button>
          );
        })}
      </div>

      {/* Courts & Time Slots Grid */}
      {activeCourts.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
          <p className="font-display text-base font-semibold text-slate-900">
            Este club todavía no tiene canchas activas
          </p>
          <p className="mt-1 text-sm text-slate-500">
            El administrador del club puede dar de alta las canchas desde la vista Admin Club.
          </p>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {activeCourts.map((court) => (
            <div key={court.id} className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex items-baseline justify-between gap-4 border-b border-slate-100 pb-3">
                <div>
                  <h2 className="flex items-center gap-2 font-display text-lg font-bold text-slate-900">
                    <BrandIcon name="cancha" size={20} className="text-brand" />
                    {court.name}
                  </h2>
                  <p className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                    <span className="flex items-center gap-1"><BrandIcon name={court.roof === 'techada' ? 'techada' : 'descubierta'} size={14} />{court.roof === 'techada' ? 'Techada' : 'Al aire libre'}</span>
                    <span className="flex items-center gap-1"><BrandIcon name={court.surface === 'cristal' ? 'cristal' : 'muro'} size={14} />{court.surface === 'cristal' ? 'Cristal' : 'Muro'}</span>
                    <span className="flex items-center gap-1"><BrandIcon name="luz" size={14} />{court.hasLights ? 'Con luz' : 'Sin luz'}</span>
                  </p>
                </div>
                {isWeekend && (
                  <span className="text-xs font-medium text-slate-500">Tarifa fin de semana</span>
                )}
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
                {slots.map((slot) => {
                  const occupied = bookingsOnDate.find(
                    (b) =>
                      b.courtId === court.id &&
                      b.startMinute < slot.endMinute &&
                      b.endMinute > slot.startMinute
                  );
                  const price = calculateSlotPrice(club, selectedDate, slot.startMinute);
                  const isHeld = occupied?.status === 'held';
                  const isOwnBooking =
                    !!occupied &&
                    ((occupied.type !== 'counter' && occupied.createdByUid === userProfile.uid) ||
                      occupied.playerUids.includes(userProfile.uid));
                  const slotWaitlist = activeWaitlistOnDate.filter(
                    (w) =>
                      w.courtId === court.id &&
                      w.startMinute === slot.startMinute &&
                      w.status === 'waiting'
                  );
                  const myWaitEntry = slotWaitlist.find((w) => w.uid === userProfile.uid);
                  const isDisabled = isBlocked || isOwnBooking;

                  return (
                    <button
                      key={slot.startMinute}
                      type="button"
                      disabled={isDisabled}
                      onClick={() => {
                        if (occupied) {
                          setWaitlistTarget({
                            court,
                            startMinute: slot.startMinute,
                            endMinute: slot.endMinute,
                            isHeld,
                          });
                        } else {
                          setSelectedSlot({
                            court,
                            startMinute: slot.startMinute,
                            endMinute: slot.endMinute,
                            price,
                          });
                        }
                      }}
                      title={
                        occupied && !isOwnBooking
                          ? 'Clic para anotarte en la lista de espera automática'
                          : undefined
                      }
                      className={`flex min-h-[64px] flex-col items-center justify-center rounded-xl px-2 py-2 text-center transition-colors ${
                        isOwnBooking
                          ? 'bg-brand text-white cursor-default'
                          : occupied
                            ? myWaitEntry
                              ? 'bg-fu-fill text-ink hover:brightness-95 cursor-pointer'
                              : isHeld
                                ? 'bg-wait-fill text-wait hover:brightness-95 cursor-pointer'
                                : 'bg-busy text-muted hover:brightness-95 cursor-pointer'
                            : isBlocked
                              ? 'border border-slate-100 bg-slate-50 text-slate-400 cursor-not-allowed'
                              : 'border-[1.5px] border-[#9fd6da] bg-white text-brand hover:border-brand hover:bg-mist cursor-pointer'
                      }`}
                    >
                      <span className={`text-[15px] font-bold tabular-nums ${occupied && !isOwnBooking && !isHeld && !myWaitEntry ? 'line-through' : ''}`}>
                        {formatMinutes(slot.startMinute)}
                      </span>
                      <span className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold tabular-nums">
                        {isOwnBooking ? (
                          <>
                            <BrandIcon name="perfil" size={13} /> Tu turno
                          </>
                        ) : occupied ? (
                          myWaitEntry ? (
                            'En espera'
                          ) : slotWaitlist.length > 0 ? (
                            `Espera (${slotWaitlist.length})`
                          ) : isHeld ? (
                            'Retenida'
                          ) : (
                            'Ocupada'
                          )
                        ) : (
                          <span className="font-normal text-muted">{formatUYU(price)}</span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* My Bookings */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h2 className="font-display text-lg font-bold text-slate-900">Mis reservas en {club.name}</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Confirmadas al instante. Cancelación sin costo hasta {club.cancellationHours} horas antes.
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {confirmedBookings.length > 0 && (
              <button
                type="button"
                onClick={handleExportAllICal}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Download className="h-3.5 w-3.5 text-emerald-600" />
                Exportar confirmadas (.ics)
              </button>
            )}
            <span className=" text-sm font-semibold text-slate-700 tabular-nums whitespace-nowrap">
              {myBookings.length} activas
            </span>
          </div>
        </div>

        {myBookings.length === 0 ? (
          <p className="py-6 text-sm text-slate-500">
            Todavía no tenés turnos reservados en este club. Elegí un horario arriba para confirmar al instante.
          </p>
        ) : (
          <div className="divide-y divide-slate-100">
            {myBookings.map((bk) => {
              const freeCancel = canCancelFree(club, bk.date, bk.startMinute);
              const isMenuOpen = openCalendarId === bk.id;
              return (
                <div key={bk.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                      <CalendarCheck2 className="h-4 w-4 text-emerald-600 shrink-0" />
                      <span>{bk.courtName}</span>
                      <span className="text-slate-400" aria-hidden="true">·</span>
                      <span className="tabular-nums">{formatDateFriendly(bk.date)}</span>
                      <span className="text-slate-400" aria-hidden="true">·</span>
                      <span className=" tabular-nums">
                        {formatMinutes(bk.startMinute)}–{formatMinutes(bk.endMinute)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      Estado: <strong className={bk.status === 'held' ? 'text-amber-700' : 'text-emerald-700'}>
                        {bk.status === 'held' ? 'Cancha retenida (partido pendiente)' : bk.status === 'no_show' ? 'Ausencia registrada' : 'Confirmada'}
                      </strong>
                      <span className="mx-1.5" aria-hidden="true">·</span>
                      Total: <span className=" tabular-nums">{formatUYU(bk.totalPrice)}</span>
                      <span className="mx-1.5" aria-hidden="true">·</span>
                      {bk.paymentStatus === 'paid'
                        ? 'Pagada'
                        : bk.paymentStatus === 'deposit_paid'
                          ? `Seña abonada (${formatUYU(bk.paidAmount)})`
                          : 'Pagar en el club'}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {bk.status === 'confirmed' && (
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setOpenCalendarId(isMenuOpen ? null : bk.id)}
                          aria-expanded={isMenuOpen}
                          aria-haspopup="menu"
                          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <CalendarPlus className="h-3.5 w-3.5" />
                          <span>Agregar al calendario</span>
                          <ChevronDown className="h-3.5 w-3.5" />
                        </button>

                        {isMenuOpen && (
                          <>
                            <div
                              className="fixed inset-0 z-10"
                              onClick={() => setOpenCalendarId(null)}
                              aria-hidden="true"
                            />
                            <div
                              role="menu"
                              className="absolute right-0 z-20 mt-1.5 w-52 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg"
                            >
                              <a
                                role="menuitem"
                                href={buildGoogleCalendarUrl(club, bk)}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={() => setOpenCalendarId(null)}
                                className="flex min-h-[40px] items-center justify-between rounded-lg px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900"
                              >
                                <span>Google Calendar</span>
                                <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
                              </a>
                              <button
                                role="menuitem"
                                type="button"
                                onClick={() => handleExportSingleICal(bk)}
                                className="flex min-h-[40px] w-full items-center justify-between rounded-lg px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900 cursor-pointer"
                              >
                                <span>iCal / Apple (.ics)</span>
                                <Download className="h-3.5 w-3.5 text-slate-400" />
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    {(bk.status === 'confirmed' || bk.status === 'held') && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleCancelBooking(bk)}
                        className="inline-flex min-h-[40px] items-center justify-center rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-red-50 hover:border-red-200 hover:text-red-700 whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        {freeCancel ? 'Cancelar sin cargo' : 'Cancelar fuera de plazo'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Active Automatic Court Waitlist */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h2 className="font-display text-lg font-bold text-slate-900">
              Lista de espera automática
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Tocá cualquier horario ocupado arriba para anotarte. Si la reserva se cancela, recibirás una notificación push al instante.
            </p>
          </div>
          <span className=" text-sm font-semibold text-slate-700 tabular-nums whitespace-nowrap">
            {myWaitlistEntries.length} horarios
          </span>
        </div>

        {myWaitlistEntries.length === 0 ? (
          <p className="py-5 text-sm text-slate-500">
            No estás anotado en ninguna lista de espera en {club.name}. Si el horario que buscás figura como Ocupada o Retenida, seleccionalo para recibir aviso automático al liberarse.
          </p>
        ) : (
          <div className="divide-y divide-slate-100">
            {myWaitlistEntries.map((entry) => {
              const isOpenNow = entry.status === 'notified';
              return (
                <div
                  key={entry.id}
                  className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                      <BellRing className={`h-4 w-4 shrink-0 ${isOpenNow ? 'text-emerald-600' : 'text-sky-600'}`} />
                      <span>{entry.courtName}</span>
                      <span className="text-slate-400" aria-hidden="true">·</span>
                      <span className="tabular-nums">{formatDateFriendly(entry.date)}</span>
                      <span className="text-slate-400" aria-hidden="true">·</span>
                      <span className=" tabular-nums">
                        {formatMinutes(entry.startMinute)}–{formatMinutes(entry.endMinute)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      Estado:{' '}
                      <strong className={isOpenNow ? 'text-emerald-700' : 'text-sky-700'}>
                        {isOpenNow
                          ? '¡Cancha liberada! Notificación push enviada'
                          : 'Esperando cancelación del turno'}
                      </strong>
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {isOpenNow && (
                      <button
                        type="button"
                        disabled={busy || isBlocked}
                        onClick={() => handleBookFromNotifiedWaitlist(entry)}
                        className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700 whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <CalendarCheck2 className="h-3.5 w-3.5" />
                        Reservar ahora
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleLeaveWaitlist(entry.id)}
                      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:border-red-200 hover:bg-red-50 hover:text-red-700 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Salir de lista
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Club Profile & Automated Player Ranking */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-6 py-4">
          <div>
            <p className="text-xs font-semibold text-emerald-700">Perfil del club</p>
            <h2 className="font-display text-lg font-bold text-slate-900">{club.name}</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {club.address}, {club.city}
              <span className="mx-1.5" aria-hidden="true">·</span>
              Horario <span className=" tabular-nums">{String(club.openHour).padStart(2, '0')}:00–{String(club.closeHour).padStart(2, '0')}:00</span> hs
              <span className="mx-1.5" aria-hidden="true">·</span>
              <span className=" tabular-nums">{activeCourts.length}</span> canchas activas
            </p>
          </div>
          <div className="text-xs text-slate-600 tabular-nums">
            Cancelación sin cargo: <strong className=" text-slate-900">{club.cancellationHours}h antes</strong>
          </div>
        </div>

        <ClubRankingSection
          club={club}
          memberships={memberships}
          bookings={bookings}
          proposedMatches={proposedMatches}
          tournaments={tournaments}
          playerMatchResults={playerMatchResults}
          clubMatchResults={clubMatchResults}
          playerLevelsMap={playerLevelsMap}
          userProfile={userProfile}
          onToast={onToast}
          compactHeader
        />
      </div>

      {/* Instant Booking Confirmation Sheet */}
      {selectedSlot && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="w-full max-w-md rounded-t-3xl border border-slate-200 bg-white p-6 shadow-2xl sm:rounded-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <p className="text-xs font-medium text-emerald-700">{club.name}</p>
                <h3 className="mt-1 font-display text-xl font-bold text-slate-900">
                  {selectedSlot.court.name}
                </h3>
                <p className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                  <Clock className="h-3.5 w-3.5" />
                  <span className=" tabular-nums">
                    {formatDateFriendly(selectedDate)} · {formatMinutes(selectedSlot.startMinute)}–{formatMinutes(selectedSlot.endMinute)} hs
                  </span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSlot(null)}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 cursor-pointer"
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 rounded-xl bg-slate-50 p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600">Valor del turno ({club.slotDurationMinutes} min)</span>
                <span className=" text-lg font-bold text-slate-900 tabular-nums">
                  {formatUYU(selectedSlot.price)}
                </span>
              </div>
              {slotDeposit > 0 ? (
                <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  Este horario pide una <b>seña de {formatUYU(slotDeposit)}</b> por Mercado Pago. Se descuenta de tu parte. Tenés {club.deposit?.holdMinutes ?? 15} minutos para pagarla. Si cancelás con {club.cancellationHours} h de anticipación se te devuelve; si no venís, queda para el club.
                </p>
              ) : (
                <p className="mt-2 text-xs text-slate-500">
                  La reserva queda confirmada al instante sin pagar nada por adelantado, o podés abonar por Mercado Pago si lo preferís.
                </p>
              )}
            </div>

            <div className="mt-5 space-y-2.5">
              {slotDeposit === 0 && (
              <button
                type="button"
                disabled={busy}
                onClick={() => handleConfirmBooking('club')}
                className="w-full min-h-[48px] rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-60 cursor-pointer"
              >
                {busy ? 'Confirmando...' : 'Confirmar y pagar en el club'}
              </button>
              )}

              {(club.mpEnabled || slotDeposit > 0) && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setMpOpen(true)}
                  className="inline-flex w-full min-h-[48px] items-center justify-center gap-2 rounded-xl border border-sky-200 bg-sky-50 py-3 text-sm font-semibold text-sky-800 transition-colors hover:bg-sky-100 cursor-pointer"
                >
                  <CreditCard className="h-4 w-4" />
                  {slotDeposit > 0
                    ? `Pagar la seña con Mercado Pago (${formatUYU(slotDeposit)})`
                    : club.mpMode === 'deposit'
                    ? `Pagar seña (${club.mpDepositPercent}%): ${formatUYU(Math.round((selectedSlot.price * club.mpDepositPercent) / 100))}`
                    : `Pagar turno completo con Mercado Pago (${formatUYU(selectedSlot.price)})`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Automatic Court Waitlist Modal */}
      {waitlistTarget && (() => {
        const slotWaiting = activeWaitlistOnDate.filter(
          (w) =>
            w.courtId === waitlistTarget.court.id &&
            w.startMinute === waitlistTarget.startMinute &&
            w.status === 'waiting'
        );
        const existingMine = slotWaiting.find((w) => w.uid === userProfile.uid);

        return (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-4">
            <div className="w-full max-w-md rounded-t-3xl border border-slate-200 bg-white p-6 shadow-2xl sm:rounded-2xl">
              <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
                <div>
                  <p className="text-xs font-medium text-sky-700">
                    Lista de espera automática · {club.name}
                  </p>
                  <h3 className="mt-1 font-display text-xl font-bold text-slate-900">
                    {waitlistTarget.court.name}
                  </h3>
                  <p className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                    <Clock className="h-3.5 w-3.5" />
                    <span className=" tabular-nums">
                      {formatDateFriendly(selectedDate)} · {formatMinutes(waitlistTarget.startMinute)}–{formatMinutes(waitlistTarget.endMinute)} hs
                    </span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setWaitlistTarget(null)}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 cursor-pointer"
                  aria-label="Cerrar"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-4 rounded-xl bg-slate-50 p-4 text-xs text-slate-600">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">Estado actual</span>
                  <span className="font-semibold text-slate-900">
                    {waitlistTarget.isHeld ? 'Retenida (partido en armado)' : 'Ocupada'}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between text-sm">
                  <span className="text-slate-600">Jugadores en espera</span>
                  <span className=" font-bold text-slate-900 tabular-nums">
                    {slotWaiting.length}
                  </span>
                </div>
                <p className="mt-3 text-xs text-slate-500">
                  Si la reserva actual se cancela o vence la retención, recibirás una notificación push al instante para poder reservar este turno.
                </p>
              </div>

              <div className="mt-5 space-y-2.5">
                {existingMine ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleLeaveWaitlist(existingMine.id)}
                    className="inline-flex w-full min-h-[48px] items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 py-3 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 disabled:opacity-60 cursor-pointer"
                  >
                    <Trash2 className="h-4 w-4" />
                    {busy ? 'Actualizando...' : 'Salir de la lista de espera'}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleJoinWaitlist}
                    className="inline-flex w-full min-h-[48px] items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-60 cursor-pointer"
                  >
                    <BellRing className="h-4 w-4" />
                    {busy ? 'Anotando...' : 'Anotarme en lista de espera'}
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      <MercadoPagoModal
        open={mpOpen && !!selectedSlot}
        title={selectedSlot ? `Reserva ${selectedSlot.court.name}` : ''}
        subtitle={
          selectedSlot
            ? `${formatDateFriendly(selectedDate)} · ${formatMinutes(selectedSlot.startMinute)} hs`
            : ''
        }
        amount={
          selectedSlot
            ? slotDeposit > 0
              ? slotDeposit
              : club.mpMode === 'deposit'
              ? Math.round((selectedSlot.price * club.mpDepositPercent) / 100)
              : selectedSlot.price
            : 0
        }
        receiverName={club.name}
        onConfirm={async () => {
          await handleConfirmBooking('mercadopago');
        }}
        onClose={() => setMpOpen(false)}
      />
    </div>
  );
};
