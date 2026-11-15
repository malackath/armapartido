import React, { useMemo, useState } from 'react';
import type { Booking, Club, Court, FillInvite, FillSearch, MatchRequest, ProposedMatch, Tournament, UserProfile } from '../types/padel';
import {
  addDaysISO,
  formatCategory,
  formatMinutes,
  formatUYU,
  generateDaySlots,
  getTodayISO,
  getUpcomingDays,
  calculateSlotPrice,
} from '../lib/padelUtils';
import { BrandIcon } from './BrandIcon';
import { BADGE_CLASSES, DropMatchButton, FillInvitesSection, MatchFillStatus, fillBadge, searchForMatch } from './FaltaUno';
import type { ActiveTab } from './TopBar';

export interface HomeJoinPreset {
  dayOfWeek: number;
  startHour: number;
  endHour: number;
}

interface HomeViewProps {
  club: Club;
  courts: Court[];
  bookings: Booking[];
  proposedMatches: ProposedMatch[];
  matchRequests: MatchRequest[];
  tournaments: Tournament[];
  fillSearches?: FillSearch[];
  fillInvites?: FillInvite[];
  userProfile: UserProfile;
  onToast: (msg: string) => void;
  onNavigate: (tab: ActiveTab) => void;
  onJoinRequest: (preset: HomeJoinPreset) => void;
}

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DAYS_LONG = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

function dayLabel(iso: string): string {
  const today = getTodayISO();
  if (iso === today) return 'Hoy';
  if (iso === addDaysISO(today, 1)) return 'Mañana';
  const [y, m, d] = iso.split('-').map(Number);
  return `${DAYS_LONG[new Date(y, m - 1, d).getDay()]} ${d}`;
}

function rangeLabel(iso1: string, iso2: string): string {
  const [, m1, d1] = iso1.split('-').map(Number);
  const [, m2, d2] = iso2.split('-').map(Number);
  if (iso1 === iso2) return `${d1} de ${MONTHS[m1 - 1]}`;
  if (m1 === m2) return `${d1} y ${d2} de ${MONTHS[m1 - 1]}`;
  return `${d1} de ${MONTHS[m1 - 1]} al ${d2} de ${MONTHS[m2 - 1]}`;
}

function nowMinutes(): number {
  const n = new Date();
  return n.getHours() * 60 + n.getMinutes();
}

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

const Avatars: React.FC<{ names: string[]; empty?: number }> = ({ names, empty = 0 }) => (
  <div className="flex">
    {names.map((n, i) => (
      <span
        key={`${n}-${i}`}
        className={`-ml-2 first:ml-0 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white text-[10px] font-semibold text-white ${
          i % 3 === 2 ? 'bg-emerald-300' : 'bg-brand'
        }`}
      >
        {initials(n)}
      </span>
    ))}
    {Array.from({ length: empty }).map((_, i) => (
      <span
        key={`e-${i}`}
        className="-ml-2 flex h-7 w-7 items-center justify-center rounded-full border-2 border-dashed border-emerald-600 bg-white text-sm font-semibold text-emerald-600"
      >
        +
      </span>
    ))}
  </div>
);

export const HomeView: React.FC<HomeViewProps> = ({
  club,
  courts,
  bookings,
  proposedMatches,
  matchRequests,
  tournaments,
  fillSearches = [],
  fillInvites = [],
  userProfile,
  onToast,
  onNavigate,
  onJoinRequest,
}) => {
  const today = getTodayISO();
  const days = useMemo(() => getUpcomingDays(7), []);
  const [selectedDay, setSelectedDay] = useState(days[0].iso);
  const activeCourts = courts.filter((c) => c.active);
  const firstName = userProfile.displayName.split(' ')[0] || 'jugador';

  // Turnos libres por franja (tarde / noche) para el día elegido
  const franjas = useMemo(() => {
    const slots = generateDaySlots(club);
    const dayBookings = bookings.filter((b) => b.date === selectedDay && b.status !== 'cancelled');
    const isToday = selectedDay === today;
    const freeCount = (from: number, to: number) =>
      slots
        .filter((s) => s.startMinute >= from && s.startMinute < to && (!isToday || s.startMinute > nowMinutes()))
        .reduce((acc, s) => {
          const taken = dayBookings.filter((b) => b.startMinute < s.endMinute && b.endMinute > s.startMinute).length;
          return acc + Math.max(0, activeCourts.length - taken);
        }, 0);
    const night = club.nightFromHour * 60;
    const afternoon = Math.max(club.openHour * 60, 14 * 60);
    return [
      { label: 'Tarde', from: afternoon, to: night, free: freeCount(afternoon, night) },
      { label: 'Noche', from: night, to: club.closeHour * 60, free: freeCount(night, club.closeHour * 60) },
    ];
  }, [club, bookings, selectedDay, activeCourts.length, today]);

  // Próximo partido o reserva del jugador
  const next = useMemo(() => {
    const isFuture = (date: string, end: number) => date > today || (date === today && end > nowMinutes());
    const match = proposedMatches
      .filter((m) => m.status !== 'cancelled' && m.playerUids.includes(userProfile.uid) && isFuture(m.date, m.endMinute))
      .sort((a, b) => a.date.localeCompare(b.date) || a.startMinute - b.startMinute)[0];
    const booking = bookings
      .filter(
        (b) =>
          (b.status === 'confirmed' || b.status === 'held') &&
          (b.createdByUid === userProfile.uid || b.playerUids.includes(userProfile.uid)) &&
          isFuture(b.date, b.endMinute)
      )
      .sort((a, b) => a.date.localeCompare(b.date) || a.startMinute - b.startMinute)[0];
    if (match && (!booking || `${match.date}${match.startMinute}` <= `${booking.date}${booking.startMinute}`)) {
      const linked = bookings.find((b) => b.id === match.bookingId);
      return {
        kind: 'match' as const,
        match,
        date: match.date,
        start: match.startMinute,
        end: match.endMinute,
        courtName: match.courtName,
        court: courts.find((c) => c.id === match.courtId),
        confirmed: match.status === 'confirmed',
        names: match.slots.map((s) => s.displayName),
        payAtClub: linked?.paymentMethod !== 'mercadopago',
        price: match.pricePerPlayer,
        priceLabel: 'por jugador',
      };
    }
    if (booking) {
      return {
        kind: 'booking' as const,
        match: undefined,
        date: booking.date,
        start: booking.startMinute,
        end: booking.endMinute,
        courtName: booking.courtName,
        court: courts.find((c) => c.id === booking.courtId),
        confirmed: booking.status === 'confirmed',
        names: [userProfile.displayName],
        payAtClub: booking.paymentMethod === 'club',
        price: booking.totalPrice,
        priceLabel: 'la cancha',
      };
    }
    return null;
  }, [proposedMatches, bookings, courts, userProfile, today]);

  // Jugadores buscando partido con categoría compatible (±1)
  const open = useMemo(
    () =>
      matchRequests
        .filter(
          (r) =>
            r.status === 'waiting' &&
            r.creatorUid !== userProfile.uid &&
            r.partnerUid !== userProfile.uid &&
            Math.abs(r.category - userProfile.category) <= 1 &&
            (!r.date || r.date >= today)
        )
        .sort((a, b) => (a.date || '9').localeCompare(b.date || '9') || a.startMinute - b.startMinute)
        .slice(0, 3),
    [matchRequests, userProfile, today]
  );

  const tournament = useMemo(
    () =>
      tournaments
        .filter((t) => t.status === 'registration_open' && t.endDate >= today)
        .sort((a, b) => a.startDate.localeCompare(b.startDate))[0],
    [tournaments, today]
  );

  const courtDetail = (c?: Court) =>
    c ? ` · ${c.roof === 'techada' ? 'techada' : 'descubierta'}, ${c.surface === 'cristal' ? 'vidrio' : 'muro'}` : '';

  const nextSearch = next?.match ? searchForMatch(fillSearches, next.match.id) : undefined;
  const nextBadge = fillBadge(nextSearch);

  return (
    <div className="space-y-6">
      <FillInvitesSection club={club} invites={fillInvites} searches={fillSearches} matches={proposedMatches} onToast={onToast} />
      <section>
        <div className="flex items-start justify-between gap-3">
          <h1 className="font-display text-[28px] font-bold leading-tight tracking-tight text-ink">¡Hola, {firstName}!</h1>
          <span className="mt-1 shrink-0 rounded-full bg-mist px-3 py-1.5 text-[13px] font-semibold text-brand">
            {formatCategory(userProfile.category)} categoría
          </span>
        </div>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
          <span className="h-2 w-2 rounded-full bg-[#1fae6c]" />
          Abierto hasta las {formatMinutes(club.closeHour * 60)} · {activeCourts.length} canchas
        </p>
      </section>

      {/* En escritorio, Inicio usa todo el ancho de la página en dos columnas. */}
      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
      <section className="rounded-[18px] border border-line bg-white p-4">
        <h2 className="flex items-center gap-2 text-[17px] font-semibold text-ink">
          <BrandIcon name="reservar" className="text-brand" />
          Reservá una cancha
        </h2>
        <div className="-mx-4 mt-3.5 mb-3 flex gap-2 overflow-x-auto px-4 pb-1">
          {days.map((d) => (
            <button
              key={d.iso}
              type="button"
              onClick={() => setSelectedDay(d.iso)}
              className={`shrink-0 cursor-pointer rounded-xl px-3.5 py-2 text-sm font-medium ${
                selectedDay === d.iso ? 'bg-brand text-white' : 'bg-mist text-ink'
              }`}
            >
              {d.dayShort} {Number(d.dayNum)}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          {franjas.map((f) => (
            <div key={f.label} className="rounded-2xl border border-line bg-surface p-3">
              <p className="text-[13px] font-medium text-muted">{f.label}</p>
              <p className="my-0.5 text-[17px] font-semibold text-ink">
                {formatMinutes(f.from)} a {formatMinutes(f.to)}
              </p>
              <p className={`text-xs font-medium ${f.free > 0 ? 'text-emerald-600' : 'text-muted'}`}>
                {f.free > 0 ? `${f.free} turno${f.free === 1 ? '' : 's'} libre${f.free === 1 ? '' : 's'}` : 'Sin turnos libres'}
              </p>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => onNavigate('bookings')}
          className="mt-3.5 flex h-[50px] w-full cursor-pointer items-center justify-center rounded-2xl bg-action text-base font-semibold text-on-action hover:brightness-95"
        >
          Ver horarios libres
        </button>
      </section>

      <section>
        <div className="mb-2.5 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-[17px] font-semibold text-ink">
            <BrandIcon name="horario" className="text-brand" />
            Tu próximo partido
          </h2>
          {next && <span className="text-sm font-semibold text-emerald-600">{dayLabel(next.date)}</span>}
        </div>
        {next ? (
          <div className="rounded-[18px] border border-line bg-white p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-emerald-600">
                {dayLabel(next.date)} · {formatMinutes(next.start)} a {formatMinutes(next.end)}
              </span>
              {nextBadge ? (
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${BADGE_CLASSES[nextBadge.tone]}`}>{nextBadge.label}</span>
              ) : (
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                    next.confirmed ? 'bg-[#dcf5e8] text-[#137a4b]' : 'bg-[#fff3d6] text-[#8a5a00]'
                  }`}
                >
                  {next.confirmed ? 'Confirmado' : 'Por confirmar'}
                </span>
              )}
            </div>
            <p className="mt-1 text-[19px] font-semibold text-ink">
              {next.courtName}
              {courtDetail(next.court)}
            </p>
            <p className="text-sm text-muted">{club.name}</p>
            <div className="my-3 flex items-center gap-2.5 rounded-xl bg-surface px-3 py-2.5">
              <BrandIcon name={next.payAtClub ? 'pago-en-club' : 'pago-online'} className="shrink-0 text-ink" />
              <div className="flex-1 text-[13px] text-muted">
                <strong className="block text-sm font-semibold text-ink">
                  {next.payAtClub ? 'Se paga en el club' : 'Pagado con Mercado Pago'}
                </strong>
                {formatUYU(next.price)} {next.priceLabel}
              </div>
              <Avatars names={next.names} empty={next.kind === 'match' ? Math.max(0, 4 - next.names.length) : 0} />
            </div>
            <button
              type="button"
              onClick={() => onNavigate(next.kind === 'match' ? 'matchmaking' : 'bookings')}
              className="flex h-10 w-full cursor-pointer items-center justify-center rounded-2xl bg-mist text-sm font-semibold text-brand"
            >
              Ver detalle
            </button>
            {next.match && (
              <MatchFillStatus club={club} match={next.match} search={nextSearch} userUid={userProfile.uid} onToast={onToast} />
            )}
            {next.match?.status === 'confirmed' && nextSearch?.status !== 'unfilled' && (
              <DropMatchButton club={club} match={next.match} onToast={onToast} />
            )}
          </div>
        ) : (
          <div className="rounded-[18px] border border-dashed border-line bg-white p-4 text-center">
            <p className="text-sm text-muted">Todavía no tenés partidos. Reservá una cancha o pedile a la app que te arme uno.</p>
            <button
              type="button"
              onClick={() => onNavigate('matchmaking')}
              className="mt-3 inline-flex h-10 cursor-pointer items-center justify-center rounded-2xl bg-action px-4 text-sm font-semibold text-on-action"
            >
              Armar partido
            </button>
          </div>
        )}
      </section>

      <section>
        <div className="mb-2.5 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-[17px] font-semibold text-ink">
            <BrandIcon name="falta-uno" className="text-brand" />
            Buscan jugadores
          </h2>
          <button type="button" onClick={() => onNavigate('matchmaking')} className="cursor-pointer text-sm font-semibold text-emerald-600">
            Ver todos
          </button>
        </div>
        {open.length > 0 ? (
          <div className="space-y-2.5">
            {open.map((r) => {
              const names = [r.creatorName, ...(r.partnerName ? [r.partnerName] : [])];
              const minCat = Math.max(1, r.category - 1);
              const maxCat = Math.min(8, r.category + 1);
              const dayOfWeek = r.dayOfWeek;
              const when = r.date ? dayLabel(r.date) : `Los ${DAYS_LONG[dayOfWeek].toLowerCase()}`;
              const price = r.date ? calculateSlotPrice(club, r.date, r.startMinute) / 4 : club.basePrice / 4;
              return (
                <div key={r.id} className="grid gap-2.5 rounded-2xl border border-line bg-white p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="rounded-md bg-mist px-2 py-0.5 text-xs font-semibold text-brand">
                        {formatCategory(minCat)} a {formatCategory(maxCat)}
                      </span>
                      <b className="text-[15px] font-semibold text-ink">
                        {when} {formatMinutes(r.startMinute)}
                      </b>
                    </div>
                    <span className="text-sm font-semibold text-ink">{formatUYU(price)} c/u</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm text-muted">
                      {r.requestType === 'priority' ? 'Pedido del día' : 'Horario fijo'}
                      <br />
                      {club.slotDurationMinutes} minutos
                    </p>
                    <div className="flex items-center gap-3">
                      <Avatars names={names} empty={4 - names.length} />
                      <button
                        type="button"
                        onClick={() =>
                          onJoinRequest({
                            dayOfWeek,
                            startHour: Math.floor(r.startMinute / 60),
                            endHour: Math.ceil(r.endMinute / 60),
                          })
                        }
                        className="h-10 cursor-pointer rounded-2xl bg-action px-4 text-sm font-semibold text-on-action hover:brightness-95"
                      >
                        Sumarme
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-line bg-white p-4 text-sm text-muted">
            Ahora nadie de tu categoría está buscando. Cargá tus horarios y te avisamos cuando se arme un partido.
          </div>
        )}
      </section>

      {tournament && (
        <section
          className="relative flex h-[180px] items-end overflow-hidden rounded-[18px] bg-ink bg-cover bg-center p-4 text-white"
          style={{ backgroundImage: "url('/img/torneo-noche.webp')" }}
        >
          <div className="absolute inset-0 bg-gradient-to-b from-ink/10 to-ink/90" />
          <div className="relative w-full">
            <p className="text-[13px] opacity-85">Torneo · {rangeLabel(tournament.startDate, tournament.endDate)}</p>
            <h3 className="mt-0.5 mb-2.5 text-[22px] font-bold leading-tight">{tournament.name}</h3>
            <div className="flex items-center justify-between gap-3">
              <p className="text-[13px] opacity-85">
                Inscripción en pareja
                {tournament.categories.length > 0 &&
                  ` · ${formatCategory(Math.min(...tournament.categories))} a ${formatCategory(Math.max(...tournament.categories))}`}
              </p>
              <button
                type="button"
                onClick={() => onNavigate('tournaments')}
                className="shrink-0 cursor-pointer rounded-xl bg-white/20 px-3.5 py-2 text-sm font-semibold backdrop-blur"
              >
                Anotarme
              </button>
            </div>
          </div>
        </section>
      )}
      </div>
    </div>
  );
};
