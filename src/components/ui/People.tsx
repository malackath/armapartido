import React from 'react';
import { formatCategory } from '../../lib/padelUtils';
import { BrandIcon, type BrandIconName } from '../BrandIcon';

// Escala de categorías: siempre el mismo color en toda la app y el número adentro,
// así se lee aunque alguien no distinga colores (aprobado por Ber, 15/11/2026).
export const CATEGORY_COLORS: Record<number, { bg: string; fg: string }> = {
  1: { bg: '#6d1a36', fg: '#ffffff' },
  2: { bg: '#c0362c', fg: '#ffffff' },
  3: { bg: '#e06a1b', fg: '#ffffff' },
  4: { bg: '#f2c230', fg: '#172123' },
  5: { bg: '#3f9142', fg: '#ffffff' },
  6: { bg: '#05b8c4', fg: '#172123' },
  7: { bg: '#2f62b8', fg: '#ffffff' },
};

export const CategoryBadge: React.FC<{ category: number; size?: number; showSuffix?: boolean; className?: string }> = ({
  category,
  size = 22,
  showSuffix = true,
  className = '',
}) => {
  const c = CATEGORY_COLORS[category] ?? { bg: '#55696c', fg: '#fff' };
  const label = formatCategory(category);
  const num = String(category);
  return (
    <span
      title={`${label} categoría`}
      aria-label={`${label} categoría`}
      className={`inline-flex shrink-0 items-center justify-center font-bold leading-none ${className}`}
      style={{
        background: c.bg,
        color: c.fg,
        height: size,
        minWidth: size,
        fontSize: Math.round(size * 0.5),
        borderRadius: Math.round(size * 0.32),
        padding: '0 4px',
        boxShadow: 'inset 0 0 0 1.5px rgba(0,0,0,.12)',
      }}
    >
      {num}
      {showSuffix && <small style={{ fontSize: '0.62em', fontWeight: 600, marginLeft: 1 }}>{label.slice(num.length)}</small>}
    </span>
  );
};

export function initialsOf(name?: string): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

// Avatar cuadrado: foto si hay, si no iniciales sobre un tono neutro (el color fuerte es de la categoría).
export const PlayerAvatar: React.FC<{
  name?: string;
  photoUrl?: string;
  size?: number;
  category?: number;
  className?: string;
  /** Corre las iniciales a la izquierda (se usa en la pareja, donde la otra foto tapa el borde derecho). */
  shiftLeft?: number;
}> = ({ name, photoUrl, size = 32, category, className = '', shiftLeft = 0 }) => (
  <span className={`relative inline-flex shrink-0 ${className}`} title={name}>
    <span
      className="grid place-items-center overflow-hidden border-2 border-white bg-avatar bg-cover bg-center font-bold text-brand"
      style={{
        width: size,
        height: size,
        // 12 px como el resto del sitio; los avatares chicos bajan en proporción para no quedar redondos.
        borderRadius: Math.min(12, Math.round(size * 0.28)),
        fontSize: Math.round(size * 0.36),
        backgroundImage: photoUrl ? `url(${photoUrl})` : undefined,
      }}
    >
      {photoUrl ? null : <span style={category ? { transform: 'translate(-8%,-8%)' } : shiftLeft ? { transform: `translateX(-${shiftLeft}px)` } : undefined}>{initialsOf(name)}</span>}
    </span>
    {category ? (
      <span className="absolute -right-2 -bottom-2 z-10 flex rounded-[7px] border-2 border-white">
        <CategoryBadge category={category} size={Math.max(16, Math.round(size * 0.4))} showSuffix={false} />
      </span>
    ) : null}
  </span>
);

// Pareja: las dos fotos de perfil una al lado de la otra, algo solapadas, en un recuadro
// más ancho que el avatar común (pedido de Ber, 15/11/2026). Sirve igual si la pareja
// se anotó junta o si la armó el club o la app.
export interface PairPerson {
  name?: string;
  photoUrl?: string;
}
export const PairAvatar: React.FC<{ a: PairPerson; b: PairPerson; size?: number; className?: string }> = ({ a, b, size = 48, className = '' }) => {
  const overlap = Math.round(size * 0.3);
  return (
    <span className={`inline-flex shrink-0 items-center ${className}`} style={{ width: size * 2 - overlap }} title={`${a.name ?? ''} y ${b.name ?? ''}`}>
      <PlayerAvatar name={a.name} photoUrl={a.photoUrl} size={size} shiftLeft={Math.round(overlap / 2)} />
      <span style={{ marginLeft: -overlap }} className="relative">
        <PlayerAvatar name={b.name} photoUrl={b.photoUrl} size={size} />
      </span>
    </span>
  );
};

export type StatusKind = 'ok' | 'due' | 'wait' | 'fu' | 'live' | 'free' | 'busy' | 'mine' | 'neutral';

const CHIP: Record<StatusKind, string> = {
  ok: 'bg-ok-bg text-ok',
  due: 'bg-due-bg text-due',
  wait: 'bg-wait-bg text-wait',
  fu: 'bg-action text-on-action',
  live: 'bg-live-fill text-brand', // En juego = petróleo como en el Mostrador (rojo es solo deuda)
  free: 'bg-mist text-brand',
  busy: 'bg-busy text-muted',
  mine: 'bg-brand text-white',
  neutral: 'bg-ink text-white',
};

export const StatusChip: React.FC<{ kind: StatusKind; icon?: BrandIconName; children: React.ReactNode; className?: string }> = ({
  kind,
  icon,
  children,
  className = '',
}) => (
  <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-[3px] text-xs font-semibold ${CHIP[kind]} ${className}`}>
    {icon && <BrandIcon name={icon} size={14} />}
    {children}
  </span>
);
