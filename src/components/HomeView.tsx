import React, { useMemo, useState } from 'react';
import type { Booking, Club, ClubMembership, ClubSponsor, Court, FillInvite, FillSearch, MatchRequest, ProposedMatch, Tournament, UserProfile } from '../types/padel';
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
import { CategoryBadge, PairAvatar, PlayerAvatar, StatusChip } from './ui/People';
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
  /** Socios del club: de acá salen las fotos de perfil de los demás jugadores. */
  memberships?: ClubMembership[];
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

const Avatars: React.FC<{ names: string[]; empty?: number; photoOf?: (name: string) => string | undefined }> = ({ names, empty = 0, photoOf }) => (
  <div className="flex items-center gap-0.5">
    {names.map((n, i) => (
      <PlayerAvatar key={`${n}-${i}`} name={n} photoUrl={photoOf?.(n)} size={30} />
    ))}
    {Array.from({ length: empty }).map((_, i) => (
      <span key={`e-${i}`} className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px] border-2 border-dashed border-brand/70 text-sm font-semibold text-brand">
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
  memberships = [],
  onToast,
  onNavigate,
  onJoinRequest,
}) => {
  const today = getTodayISO();
  const photoMap = useMemo(() => new Map(memberships.filter((m) => m.photoUrl).map((m) => [m.displayName, m.photoUrl as string])), [memberships]);
  const photoByName = (name?: string) => (name === userProfile.displayName ? userProfile.photoUrl || photoMap.get(name) : name ? photoMap.get(name) : undefined);
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

  // Próximos partidos y reservas del jugador (hasta 3, el más cercano primero)
  const upcoming = useMemo(() => {
    const isFuture = (date: string, end: number) => date > today || (date === today && end > nowMinutes());
    const matches = proposedMatches.filter(
      (m) => m.status !== 'cancelled' && m.playerUids.includes(userProfile.uid) && isFuture(m.date, m.endMinute)
    );
    const matchBookingIds = new Set(matches.map((m) => m.bookingId));
    const items = [
      ...matches.map((match) => {
        const linked = bookings.find((b) => b.id === match.bookingId);
        const mySlot = match.slots.find((s) => s.uid === userProfile.uid);
        return {
          key: `m-${match.id}`,
          kind: 'match' as const,
          match,
          date: match.date,
          start: match.startMinute,
          end: match.endMinute,
          courtName: match.courtName,
          court: courts.find((c) => c.id === match.courtId),
          confirmed: match.status === 'confirmed',
          players: match.slots.map((s) => ({ name: s.displayName, category: s.category })),
          payAtClub: linked?.paymentMethod !== 'mercadopago',
          paid: !!mySlot?.paid,
          price: match.pricePerPlayer,
          priceLabel: 'por jugador',
        };
      }),
      ...bookings
        .filter(
          (b) =>
            (b.status === 'confirmed' || b.status === 'held') &&
            !matchBookingIds.has(b.id) &&
            (b.createdByUid === userProfile.uid || b.playerUids.includes(userProfile.uid)) &&
            isFuture(b.date, b.endMinute)
        )
        .map((booking) => ({
          key: `b-${booking.id}`,
          kind: 'booking' as const,
          match: undefined,
          date: booking.date,
          start: booking.startMinute,
          end: booking.endMinute,
          courtName: booking.courtName,
          court: courts.find((c) => c.id === booking.courtId),
          confirmed: booking.status === 'confirmed',
          players: [{ name: userProfile.displayName, category: userProfile.category }],
          payAtClub: booking.paymentMethod === 'club',
          paid: booking.paymentStatus === 'paid',
          price: booking.totalPrice,
          priceLabel: 'la cancha',
        })),
    ];
    return items.sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start).slice(0, 3);
  }, [proposedMatches, bookings, courts, userProfile, today]);
  const next = upcoming[0] ?? null;

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
        .filter((t) => (t.status === 'registration_open' || t.status === 'in_progress' || t.status === 'draw_generated') && t.endDate >= today)
        .sort((a, b) => (a.status === 'in_progress' ? -1 : 0) - (b.status === 'in_progress' ? -1 : 0) || a.startDate.localeCompare(b.startDate))[0],
    [tournaments, today]
  );

  const courtDetail = (c?: Court) =>
    c ? ` · ${c.roof === 'techada' ? 'techada' : 'descubierta'}, ${c.surface === 'cristal' ? 'vidrio' : 'muro'}` : '';


  return (
    <div className="space-y-6">
      <FillInvitesSection club={club} invites={fillInvites} searches={fillSearches} matches={proposedMatches} onToast={onToast} />
      <section>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3.5">
            <PlayerAvatar name={userProfile.displayName} photoUrl={userProfile.photoUrl} size={56} category={userProfile.category} />
            <h1 className="font-display text-[28px] font-bold leading-tight tracking-tight text-ink">¡Hola, {firstName}!</h1>
          </div>
          <span className="mt-1 flex shrink-0 items-center gap-1.5 rounded-full bg-white px-2 py-1 text-[13px] font-semibold text-ink">
            <CategoryBadge category={userProfile.category} />
            categoría
          </span>
        </div>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
          <span className="h-2 w-2 rounded-full bg-[#1fae6c]" />
          Abierto hasta las {formatMinutes(club.closeHour * 60)} · {activeCourts.length} canchas
        </p>
      </section>

      {/* En escritorio, Inicio usa todo el ancho de la página en dos columnas. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
      <div className="grid min-w-0 grid-cols-1 gap-6">
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
            {upcoming.length > 1 ? 'Tus próximos partidos' : 'Tu próximo partido'}
            {upcoming.length > 1 && <span className="text-sm font-normal text-muted">· {upcoming.length} reservas</span>}
          </h2>
        </div>
        {next ? (
          <>
            <div className={`grid gap-3 ${upcoming.length === 3 ? 'sm:grid-cols-3' : upcoming.length === 2 ? 'sm:grid-cols-2' : ''}`}>
              {upcoming.map((it, i) => {
                const search = it.match ? searchForMatch(fillSearches, it.match.id) : undefined;
                const badge = fillBadge(search);
                // El más cercano en el verde de la marca, los siguientes cada vez más claros (pedido de Ber).
                const tone = ['bg-brand text-white', 'bg-[#3d7f87] text-white', 'bg-[#a9cfd3] text-ink'][i];
                return (
                  <button
                    key={it.key}
                    type="button"
                    onClick={() => onNavigate(it.kind === 'match' ? 'matchmaking' : 'bookings')}
                    className={`flex cursor-pointer flex-col gap-1 rounded-[20px] p-4 text-left hover:brightness-105 ${tone}`}
                  >
                    <span className="text-xs font-bold tracking-wider uppercase opacity-80">{dayLabel(it.date)}</span>
                    <span className="font-display text-[22px] font-bold tabular-nums leading-tight">
                      {formatMinutes(it.start)} a {formatMinutes(it.end)}
                    </span>
                    <span className="flex items-center gap-1 text-[13px] opacity-90">
                      <BrandIcon name="cancha" size={15} />
                      {it.courtName}
                      {courtDetail(it.court)}
                    </span>
                    <span className="mt-2.5 mb-1 flex flex-wrap items-center gap-1">
                      {it.players.map((p, k) => (
                        <PlayerAvatar key={k} name={p.name} photoUrl={photoByName(p.name)} size={34} category={p.category} className="mr-1" />
                      ))}
                      {it.kind === 'match' &&
                        Array.from({ length: Math.max(0, 4 - it.players.length) }).map((_, k) => (
                          <span key={`e${k}`} className="mr-1 h-[34px] w-[34px] rounded-[10px] border-2 border-dashed border-current opacity-70" />
                        ))}
                    </span>
                    <span className="mt-auto flex flex-wrap gap-1.5 pt-1">
                      {badge ? (
                        <StatusChip kind="fu" icon="falta-uno" className="bg-white! text-ink!">{badge.label}</StatusChip>
                      ) : !it.confirmed ? (
                        <StatusChip kind="wait" icon="horario" className="bg-white!">Por confirmar</StatusChip>
                      ) : it.paid ? (
                        <StatusChip kind="ok" icon="pago-en-club" className="bg-white!">Pagado</StatusChip>
                      ) : (
                        <StatusChip kind="free" icon={it.payAtClub ? 'pago-en-club' : 'pago-online'} className="bg-white!">
                          {formatUYU(it.price)} {it.priceLabel}
                        </StatusChip>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
            {next.match && (
              <div className="mt-3 empty:hidden">
                <MatchFillStatus club={club} match={next.match} search={searchForMatch(fillSearches, next.match.id)} userUid={userProfile.uid} onToast={onToast} />
                {next.match.status === 'confirmed' && searchForMatch(fillSearches, next.match.id)?.status !== 'unfilled' && (
                  <DropMatchButton club={club} match={next.match} onToast={onToast} />
                )}
              </div>
            )}
          </>
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
                      <span className="flex items-center gap-0.5">
                        {Array.from({ length: maxCat - minCat + 1 }, (_, k) => (
                          <CategoryBadge key={k} category={minCat + k} size={20} showSuffix={false} />
                        ))}
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
                      <Avatars names={names} empty={4 - names.length} photoOf={photoByName} />
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

      </div>
      {(tournament || club.sponsor || club.sponsors?.length) && (
        <aside className="grid min-w-0 gap-4 sm:grid-cols-2 lg:sticky lg:top-24 lg:grid-cols-1">
          {tournament && (() => {
            const photo = '/img/torneo-noche.webp';
            const nextMatch = tournament.matches
              .filter((m) => m.status === 'scheduled' && m.date >= today)
              .sort((a, b) => a.date.localeCompare(b.date) || a.startMinute - b.startMinute)[0];
            const pairOf = (id?: string) => tournament.pairs.find((p) => p.id === id);
            const p1 = pairOf(nextMatch?.pair1Id);
            const p2 = pairOf(nextMatch?.pair2Id);
            return (
              <section className="overflow-hidden rounded-[20px] bg-white">
                <div className="relative h-[150px] bg-ink bg-cover bg-[center_30%]" style={{ backgroundImage: `url('${photo}')` }}>
                  <span className="absolute top-3 left-3">
                    {tournament.status === 'in_progress' ? (
                      <StatusChip kind="live">● En juego</StatusChip>
                    ) : tournament.status === 'registration_open' ? (
                      <StatusChip kind="ok" icon="reservar">Inscripción abierta</StatusChip>
                    ) : (
                      <StatusChip kind="wait" icon="torneos">Cuadro sorteado</StatusChip>
                    )}
                  </span>
                </div>
                <div className="p-4">
                  <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-brand uppercase">
                    <BrandIcon name="torneos" size={14} /> Torneo del club
                  </p>
                  <h3 className="mt-1 font-display text-lg font-bold leading-tight text-ink">{tournament.name}</h3>
                  <p className="mt-0.5 text-[13px] text-muted">
                    {nextMatch
                      ? `${nextMatch.round} ${dayLabel(nextMatch.date).toLowerCase()} ${formatMinutes(nextMatch.startMinute)} · ${nextMatch.courtName}`
                      : `${rangeLabel(tournament.startDate, tournament.endDate)} · inscripción en pareja`}
                  </p>
                  {p1 && p2 && (
                    <div className="mt-3 flex items-center gap-2.5">
                      <PairAvatar a={{ name: p1.player1Name, photoUrl: photoByName(p1.player1Name) }} b={{ name: p1.player2Name, photoUrl: photoByName(p1.player2Name) }} size={36} />
                      <span className="text-sm font-bold text-muted">vs</span>
                      <PairAvatar a={{ name: p2.player1Name, photoUrl: photoByName(p2.player1Name) }} b={{ name: p2.player2Name, photoUrl: photoByName(p2.player2Name) }} size={36} />
                    </div>
                  )}
                  <div className="mt-2 flex items-center gap-1">
                    {tournament.categories.map((c) => (
                      <CategoryBadge key={c} category={c} />
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigate('tournaments')}
                    className="mt-3 flex h-10 w-full cursor-pointer items-center justify-center rounded-xl bg-brand text-sm font-semibold text-white hover:brightness-110"
                  >
                    {tournament.status === 'registration_open' ? 'Anotarme' : 'Ver cuadro'}
                  </button>
                </div>
              </section>
            );
          })()}
          <SponsorCard sponsors={club.sponsors?.length ? club.sponsors : club.sponsor ? [club.sponsor] : []} />
        </aside>
      )}
      </div>
    </div>
  );
};

// Auspiciantes del club: muestra uno y rota cada 8 segundos (pedido de Ber, 15/11/2026).
const SponsorCard: React.FC<{ sponsors: ClubSponsor[] }> = ({ sponsors }) => {
  const [i, setI] = React.useState(() => Math.floor(Math.random() * Math.max(1, sponsors.length)));
  React.useEffect(() => {
    if (sponsors.length < 2) return;
    const t = window.setInterval(() => setI((n) => (n + 1) % sponsors.length), 8000);
    return () => window.clearInterval(t);
  }, [sponsors.length]);
  if (!sponsors.length) return null;
  const s = sponsors[i % sponsors.length];
  return (
    <a
      href={s.url || undefined}
      target="_blank"
      rel="noreferrer"
      className="block overflow-hidden rounded-[20px] border-2 border-dashed border-[#9bb3b6] bg-white/60 p-4"
    >
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[11px] tracking-widest text-muted uppercase">Auspicia el club</p>
        {sponsors.length > 1 && (
          <span className="flex gap-1" aria-hidden>
            {sponsors.map((x, n) => (
              <span key={x.name} className={`h-1.5 w-1.5 rounded-full ${n === i % sponsors.length ? 'bg-brand' : 'bg-[#c5d6d8]'}`} />
            ))}
          </span>
        )}
      </div>
      {s.imageUrl ? (
        <img key={s.imageUrl} src={s.imageUrl} alt={s.name} className="mb-2 aspect-[16/9] w-full rounded-xl object-cover" loading="lazy" />
      ) : s.logoUrl ? (
        <img src={s.logoUrl} alt={s.name} className="mb-2 h-16 w-full rounded-xl object-contain" />
      ) : (
        <div className="mb-2 rounded-xl bg-ink px-4 py-4 text-center font-display font-extrabold tracking-[.12em] text-white uppercase">{s.name}</div>
      )}
      <p className="text-sm font-semibold text-ink">{s.name}</p>
      {s.tagline && <p className="text-xs text-muted">{s.tagline}</p>}
    </a>
  );
};
