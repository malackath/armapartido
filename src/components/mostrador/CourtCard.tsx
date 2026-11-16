import React, { useEffect, useState } from 'react';
import type { Court } from '../../types/padel';
import { formatMinutes } from '../../lib/padelUtils';
import { BrandIcon } from '../BrandIcon';
import { CategoryBadge, PlayerAvatar } from '../ui/People';

// Cancha dibujada vista desde arriba para el Mostrador (variante B aprobada por Ber, 16/11/2026):
// jugadores en su lugar, punto verde si pagó y rojo si debe, cronómetro y cuánto falta.

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
}

export interface CourtNext {
  startMinute: number;
  title: string;
  label: string;
  tone: 'ok' | 'due' | 'mist' | 'wait' | 'fu';
}

export interface CourtCardProps {
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
  due: 'Por cobrar',
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
  [24, 28],
  [24, 72],
  [76, 28],
  [76, 72],
];

export const CourtDrawing: React.FC<{ court: Court; dim?: boolean; children?: React.ReactNode }> = ({ court, dim, children }) => {
  const roofed = court.roof === 'techada';
  const glass = court.surface === 'cristal';
  const surface = roofed ? '#16707a' : '#2c8460';
  const wall = glass ? '#b9f6fb' : '#4c5d60';
  return (
    <div className="relative min-h-[120px] flex-1">
      <svg viewBox="0 0 200 100" preserveAspectRatio="none" aria-hidden="true" className="absolute inset-0 h-full w-full">
        <rect x="0" y="0" width="200" height="100" rx="4" fill={surface} />
        <g stroke="#fff" strokeOpacity={0.8} strokeWidth={0.8} fill="none" vectorEffect="non-scaling-stroke">
          <line x1="30.5" y1="3" x2="30.5" y2="97" vectorEffect="non-scaling-stroke" />
          <line x1="169.5" y1="3" x2="169.5" y2="97" vectorEffect="non-scaling-stroke" />
          <line x1="30.5" y1="50" x2="169.5" y2="50" vectorEffect="non-scaling-stroke" />
        </g>
        <line x1="100" y1="1" x2="100" y2="99" stroke="#002020" strokeOpacity={0.35} strokeWidth={3.2} vectorEffect="non-scaling-stroke" />
        <line x1="100" y1="1" x2="100" y2="99" stroke="#fff" strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
        <g stroke={wall} strokeWidth={glass ? 3 : 4} fill="none" strokeLinecap="square">
          <path d="M20 1.5 H1.5 V98.5 H20" vectorEffect="non-scaling-stroke" />
          <path d="M180 1.5 H198.5 V98.5 H180" vectorEffect="non-scaling-stroke" />
        </g>
        <g stroke="#fff" strokeOpacity={0.45} strokeWidth={1} strokeDasharray="2 3">
          <line x1="22" y1="1.5" x2="178" y2="1.5" vectorEffect="non-scaling-stroke" />
          <line x1="22" y1="98.5" x2="178" y2="98.5" vectorEffect="non-scaling-stroke" />
        </g>
        {dim && <rect x="0" y="0" width="200" height="100" rx="4" fill="#002020" fillOpacity={0.35} />}
      </svg>
      {children}
    </div>
  );
};

export const CourtCard: React.FC<CourtCardProps> = ({ court, state, title, startMinute, endMinute, seats, next, freeUntil, selected, onClick }) => {
  const isLive = state === 'live' || state === 'due';
  const secs = useSecondClock(isLive || state === 'soon' || state === 'fu');
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

      <div className="mx-3 mt-2.5 flex min-h-0 flex-1">
        <CourtDrawing court={court} dim={state === 'free'}>
          {state === 'free' ? (
            <span className="absolute inset-0 grid place-items-center font-display text-base font-bold text-white">+ Cargar reserva</span>
          ) : (
            seats.slice(0, 4).map((s, i) => {
              const [x, y] = POS[i];
              return (
                <span key={i} className={`absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5 ${ghost ? 'opacity-60' : ''}`} style={{ left: `${x}%`, top: `${y}%` }}>
                  {s.empty ? (
                    <span className="grid h-11 w-11 place-items-center rounded-xl border-2 border-dashed border-fu-fill text-xl font-bold text-fu-fill">+</span>
                  ) : (
                    <span className="relative">
                      <PlayerAvatar name={s.name} photoUrl={s.photoUrl} size={44} />
                      {!ghost && (s.pay === 'paid' || s.pay === 'due' || s.pay === 'cup') && (
                        <span
                          className={`absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full border-2 border-white ${s.pay === 'due' ? 'bg-due' : s.pay === 'cup' ? 'bg-[#2f62b8]' : 'bg-[#3aa35f]'}`}
                        />
                      )}
                    </span>
                  )}
                  <span className="hidden max-w-[110px] truncate rounded-full bg-[#002020]/55 px-1.5 text-[11px] font-semibold text-white xl:block">
                    {s.empty ? 'Falta uno' : (s.name ?? 'Acompañante').split(' ')[0]}
                  </span>
                </span>
              );
            })
          )}
        </CourtDrawing>
      </div>

      <div className="flex items-end gap-2.5 px-3 pt-2.5">
        {isLive ? (
          <>
            <span className="font-display text-[2.1rem] leading-[.95] font-bold tracking-tight tabular-nums">
              {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}
            </span>
            <span className="text-[13px] leading-tight text-muted">
              jugando de {Math.round(total / 60)} min
              <br />
              <b className="text-ink">{left < 60 ? 'Terminando' : `faltan ${Math.ceil(left / 60)} min`}</b>
              {startMinute != null && endMinute != null && ` · ${formatMinutes(startMinute)} a ${formatMinutes(endMinute)}`}
            </span>
          </>
        ) : state === 'free' ? (
          <>
            <span className="font-display text-[2.1rem] leading-[.95] font-bold text-muted">Libre</span>
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
            <span className="font-display text-[2.1rem] leading-[.95] font-bold tabular-nums">
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
      <div className="mx-3 mt-1.5 h-1.5 overflow-hidden rounded-full bg-mist">
        <i className={`block h-full rounded-full ${left <= 600 ? 'bg-wait' : 'bg-emerald-600'}`} style={{ width: `${isLive ? pct : 0}%` }} />
      </div>

      {state !== 'free' && (
        <ul className="mt-2 grid gap-0.5 px-3">
          {seats.map((s, i) => (
            <li key={i} className="flex min-w-0 items-center gap-1.5 text-[14px]">
              {s.category ? <CategoryBadge category={s.category} size={18} showSuffix={false} /> : null}
              <span className="min-w-0 truncate">{s.empty ? 'Falta uno' : s.name ?? 'Acompañante'}</span>
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
