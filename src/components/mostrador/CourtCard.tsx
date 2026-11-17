import React, { useEffect, useState } from 'react';
import type { Court } from '../../types/padel';
import { formatMinutes } from '../../lib/padelUtils';
import { BrandIcon } from '../BrandIcon';
import { CategoryBadge, GotBadge, PlayerAvatar } from '../ui/People';

// Cancha dibujada vista desde arriba para el Mostrador (variante B aprobada por Ber, 16/11/2026):
// jugadores en su lugar, marca verde si pagó y roja si debe, cronómetro y cuánto falta.
// 16/11 (pedido de Ber): cancha con proporción fija 2:1 para que no se aplaste ni tape la hora, barra naranja (nunca marrón) al final.

export type CourtLiveState = 'live' | 'due' | 'soon' | 'fu' | 'free' | 'ended';

export interface CourtSeat {
  name?: string;
  photoUrl?: string;
  category?: number;
  /** paid = pagó, due = debe (ya empezó), tbd = a cobrar (no empezó), cup = cuponera, none = no aplica (torneo). */
  pay: 'paid' | 'due' | 'tbd' | 'cup' | 'none';
  payLabel?: string;
  /** Lugar libre en un partido que busca uno. */
  empty?: boolean;
  /** Lo consiguió la app para completar la cancha. */
  got?: boolean;
}

export interface CourtNext {
  startMinute: number;
  title: string;
  label: string;
  tone: 'ok' | 'due' | 'mist' | 'wait' | 'fu';
}

export interface CourtCardProps {
  /** Hora que se está mirando con el deslizador (minutos del día); sin esto, la hora real. */
  atMinute?: number;
  court: Court;
  state: CourtLiveState;
  title?: string;
  startMinute?: number;
  endMinute?: number;
  seats: CourtSeat[];
  next?: CourtNext | null;
  /** Para canchas libres: hasta qué hora (minuto del día) o null si el resto del día. */
  freeUntil?: number | null;
  selected?: boolean;
  onClick: () => void;
}

const STATE_LABEL: Record<CourtLiveState, string> = {
  live: 'En juego',
  due: 'A cobrar',
  soon: 'Por empezar',
  fu: 'Falta uno',
  free: 'Libre',
  ended: 'Terminó, debe',
};

const HEAD_BG: Record<CourtLiveState, string> = {
  live: 'bg-live-fill',
  due: 'bg-due-fill',
  ended: 'bg-due-fill',
  soon: 'bg-wait-fill',
  fu: 'bg-fu-fill',
  free: 'bg-mist',
};

const STATE_TEXT: Record<CourtLiveState, string> = {
  live: 'text-brand',
  due: 'text-due',
  ended: 'text-due',
  soon: 'text-wait',
  fu: 'text-[#006a72]',
  free: 'text-muted',
};

const TAG_TONE: Record<CourtNext['tone'], string> = {
  ok: 'bg-ok-bg text-ok',
  due: 'bg-due-bg text-due',
  mist: 'bg-mist text-brand',
  wait: 'bg-wait-bg text-wait',
  fu: 'bg-fu-fill text-[#00474d]',
};

const PAY_TEXT: Record<CourtSeat['pay'], string> = {
  paid: 'text-ok',
  due: 'text-due',
  tbd: 'text-muted',
  cup: 'text-[#2f62b8]',
  none: 'text-muted',
};

const nowSeconds = () => {
  const d = new Date();
  return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
};

/** Segundos del día, se actualiza cada segundo solo mientras haga falta. */
function useSecondClock(active: boolean) {
  const [s, setS] = useState(nowSeconds);
  useEffect(() => {
    if (!active) return;
    const t = window.setInterval(() => setS(nowSeconds()), 1000);
    return () => window.clearInterval(t);
  }, [active]);
  return s;
}

const POS: [number, number][] = [
  [27, 25],
  [27, 75],
  [73, 25],
  [73, 75],
];

// Color de la cancha según el material (Ber, 16/11/2026): azul = de vidrio, verde = de hormigón.
// El techo se ve solo en el ícono del encabezado. Estos colores no se mezclan con los de estado.
export const COURT_SURFACE = { cristal: '#2a6496', muro: '#3b7a5c' } as const;

export const CourtDrawing: React.FC<{ court: Court; dim?: boolean; children?: React.ReactNode }> = ({ court, dim, children }) => {
  const glass = court.surface === 'cristal';
  const surface = glass ? COURT_SURFACE.cristal : COURT_SURFACE.muro;
  const wall = glass ? '#cdeefc' : '#8a979a';
  return (
    <div className="relative aspect-[2/1] w-full">
      <svg viewBox="0 0 200 100" preserveAspectRatio="none" aria-hidden="true" className="absolute inset-0 h-full w-full">
        <rect x="0" y="0" width="200" height="100" rx="4" fill={surface} />
        <g stroke="#fff" strokeOpacity={0.55} strokeWidth={0.8} fill="none">
          <line x1="30.5" y1="3" x2="30.5" y2="97" vectorEffect="non-scaling-stroke" />
          <line x1="169.5" y1="3" x2="169.5" y2="97" vectorEffect="non-scaling-stroke" />
          <line x1="30.5" y1="50" x2="169.5" y2="50" vectorEffect="non-scaling-stroke" />
        </g>
        <line x1="100" y1="1" x2="100" y2="99" stroke="#fff" strokeOpacity={0.9} strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
        <g stroke={wall} strokeWidth={glass ? 3 : 4} fill="none" strokeLinecap="square">
          <path d="M20 1.5 H1.5 V98.5 H20" vectorEffect="non-scaling-stroke" />
          <path d="M180 1.5 H198.5 V98.5 H180" vectorEffect="non-scaling-stroke" />
        </g>
        {dim && <rect x="0" y="0" width="200" height="100" rx="4" fill="#002020" fillOpacity={0.35} />}
      </svg>
      {children}
    </div>
  );
};

export const CourtCard: React.FC<CourtCardProps> = ({ court, state, title, startMinute, endMinute, seats, next, freeUntil, selected, onClick, atMinute }) => {
  const isLive = state === 'live' || state === 'due';
  const clock = useSecondClock(atMinute == null && (isLive || state === 'soon' || state === 'fu'));
  // Con el deslizador de la agenda, la tarjeta muestra la cancha a esa hora (reloj quieto).
  const secs = atMinute != null ? atMinute * 60 : clock;
  const elapsed = isLive && startMinute != null ? Math.max(0, secs - startMinute * 60) : 0;
  const total = startMinute != null && endMinute != null ? (endMinute - startMinute) * 60 : 5400;
  const left = Math.max(0, total - elapsed);
  const pct = Math.min(100, (elapsed / total) * 100);
  const ghost = state === 'soon' || state === 'fu' || state === 'ended';

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${court.name}, ${STATE_LABEL[state]}`}
      className={`flex min-h-0 flex-col overflow-hidden rounded-xl bg-white text-left transition-shadow hover:shadow-[0_0_0_2px_var(--color-line)] cursor-pointer ${
        selected ? 'shadow-[0_0_0_3px_var(--color-emerald-600)]' : ''
      }`}
    >
      <div className={`flex items-center gap-2 whitespace-nowrap px-3 py-2 ${HEAD_BG[state]}`}>
        <b className="font-display text-lg font-bold">{court.name}</b>
        <span className="flex items-center gap-1 text-muted">
          <BrandIcon name={court.roof === 'techada' ? 'techada' : 'descubierta'} size={16} />
          <BrandIcon name={court.surface === 'cristal' ? 'cristal' : 'muro'} size={16} />
        </span>
        <span className={`ml-auto inline-flex items-center gap-1.5 rounded-full bg-white/75 px-2.5 py-0.5 text-xs font-bold ${STATE_TEXT[state]}`}>
          <span className={`h-2 w-2 rounded-full bg-current ${state === 'live' ? 'motion-safe:animate-pulse' : ''}`} />
          {STATE_LABEL[state]}
        </span>
      </div>

      <div className="mx-3 mt-3 shrink-0">
        <CourtDrawing court={court} dim={state === 'free'}>
          {state === 'free' ? (
            <span className="absolute inset-0 grid place-items-center font-display text-base font-bold text-white">+ Cargar reserva</span>
          ) : (
            seats.slice(0, 4).map((s, i) => {
              const [x, y] = POS[i];
              return (
                <span key={i} className={`absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 ${ghost ? 'opacity-60' : ''} ${x > 50 ? 'flex-row-reverse' : ''}`} style={{ left: `${x}%`, top: `${y}%` }}>
                  {s.empty ? (
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border-2 border-dashed border-fu-fill text-lg font-bold text-fu-fill">+</span>
                  ) : (
                    <span className="relative shrink-0">
                      <PlayerAvatar name={s.name} photoUrl={s.photoUrl} size={36} got={s.got} />
                      {!ghost && (s.pay === 'paid' || s.pay === 'due' || s.pay === 'cup') && (
                        <span
                          title={s.pay === 'due' ? 'Debe' : s.pay === 'cup' ? 'Cuponera' : 'Pagó'}
                          className={`absolute -bottom-1 -right-1 grid h-4 w-4 place-items-center rounded-full text-[10px] leading-none font-black text-white ring-2 ring-white ${s.pay === 'due' ? 'bg-due' : s.pay === 'cup' ? 'bg-[#2f62b8]' : 'bg-[#16a34a]'}`}
                        >
                          {s.pay === 'due' ? '$' : s.pay === 'cup' ? 'C' : '✓'}
                        </span>
                      )}
                    </span>
                  )}
                  <span className="hidden max-w-[84px] truncate rounded-full bg-[#002020]/60 px-1.5 py-px text-[11px] font-semibold text-white 2xl:block">
                    {s.empty ? 'Falta uno' : (s.name ?? 'Acompañante').split(' ')[0]}
                  </span>
                </span>
              );
            })
          )}
        </CourtDrawing>
      </div>

      <div className="flex items-center gap-3 px-3 pt-3">
        {isLive ? (
          <>
            <span className="font-display text-[1.9rem] leading-none font-bold tracking-tight tabular-nums">
              {elapsed >= 3600
                ? `${Math.floor(elapsed / 3600)}:${String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`
                : `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`}
            </span>
            <span className="min-w-0 text-[13px] leading-snug text-muted">
              <b className="block text-ink">{left < 60 ? 'Terminando' : `faltan ${Math.ceil(left / 60)} min`}</b>
              {startMinute != null && endMinute != null ? `${formatMinutes(startMinute)} a ${formatMinutes(endMinute)}` : `de ${Math.round(total / 60)} min`}
            </span>
          </>
        ) : state === 'free' ? (
          <>
            <span className="font-display text-[1.9rem] leading-none font-bold text-muted">Libre</span>
            <span className="text-[13px] leading-tight text-muted">
              {freeUntil != null ? (
                <>
                  hasta las <b className="text-ink">{formatMinutes(freeUntil)}</b>
                </>
              ) : (
                <b className="text-ink">el resto del día</b>
              )}
              <br />
              Tocá para reservar
            </span>
          </>
        ) : (
          <>
            <span className="font-display text-[1.9rem] leading-none font-bold tabular-nums">
              {formatMinutes(state === 'ended' ? endMinute ?? 0 : startMinute ?? 0)}
            </span>
            <span className="text-[13px] leading-tight text-muted">
              {state === 'ended'
                ? `Terminó a las ${formatMinutes(endMinute ?? 0)}`
                : `Empieza en ${Math.max(1, Math.ceil(((startMinute ?? 0) * 60 - secs) / 60))} min`}
              <br />
              <b className="text-ink">{title}</b>
            </span>
          </>
        )}
      </div>
      <div className="mx-3 mt-2 h-2 overflow-hidden rounded-full bg-mist">
        <i className={`block h-full rounded-full ${left <= 600 ? 'bg-[#f97316]' : 'bg-emerald-600'}`} style={{ width: `${isLive ? pct : 0}%` }} />
      </div>

      {state !== 'free' && (
        <ul className="mt-3 grid gap-1 px-3">
          {seats.map((s, i) => (
            <li key={i} className="flex min-w-0 items-center gap-1.5 text-[14px]">
              {s.category ? <CategoryBadge category={s.category} size={18} showSuffix={false} /> : null}
              <span className="min-w-0 truncate">{s.empty ? 'Falta uno' : s.name ?? 'Acompañante'}</span>
              {s.got && (
                <span title="Lo consiguió la app para completar la cancha" className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-action px-1.5 py-px text-[10.5px] font-bold text-on-action">
                  <GotBadge size={14} className="border-0! bg-transparent!" />
                  Conseguido
                </span>
              )}
              <span className={`ml-auto whitespace-nowrap text-xs font-semibold ${s.empty ? 'text-[#006a72]' : PAY_TEXT[s.pay]}`}>
                {s.empty ? 'Buscando' : s.payLabel}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-auto flex items-center gap-1.5 overflow-hidden whitespace-nowrap border-t border-line px-3 pt-2 pb-2.5 text-[13px] text-muted [margin-top:max(8px,auto)]">
        {next ? (
          <>
            Sigue <b className="text-ink tabular-nums">{formatMinutes(next.startMinute)}</b>
            <span className="truncate">{next.title}</span>
            <span className={`ml-auto rounded-full px-2 py-0.5 text-xs font-semibold ${TAG_TONE[next.tone]}`}>{next.label}</span>
          </>
        ) : (
          'Sin más reservas hoy'
        )}
      </div>
    </button>
  );
};
