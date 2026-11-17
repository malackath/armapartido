/** Piezas compartidas del registro y el perfil del jugador (16/11/2026). */
import React from 'react';
import { Check } from 'lucide-react';
import { CATEGORIES, formatCategory } from '../../lib/padelUtils';
import { FRANJAS, GRID_DAYS, gridKey, hourLabel, playStyleChips, type GridKey } from '../../lib/registro';
import type { UserProfile } from '../../types/padel';
import { CATEGORY_COLORS, CategoryBadge, initialsOf } from '../ui/People';

/** Escalera de categorías: 1ra arriba, 7ma abajo, con los colores de siempre. */
export const CategoryLadder: React.FC<{ value: number | null; onChange: (c: number) => void; compact?: boolean }> = ({ value, onChange, compact }) => (
  <div role="radiogroup" aria-label="Categoría" className={`grid ${compact ? 'gap-1.5' : 'gap-2'}`}>
    {CATEGORIES.map((c) => {
      const on = value === c;
      const col = CATEGORY_COLORS[c];
      return (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={on}
          onClick={() => onChange(c)}
          data-testid={`cat-${c}`}
          className={`grid cursor-pointer items-center gap-3 rounded-xl border-[1.5px] bg-white text-left transition-transform motion-reduce:transition-none ${
            compact ? 'grid-cols-[40px_1fr_auto] py-1 pr-3 pl-1' : 'grid-cols-[48px_1fr_auto] py-1.5 pr-3.5 pl-1.5'
          } ${on ? 'translate-x-1.5 border-ink shadow-[inset_0_0_0_1px_#172123]' : 'border-line hover:bg-mist'}`}
        >
          <span
            className={`grid place-items-center rounded-[9px] font-bold shadow-[inset_0_0_0_1.5px_rgba(0,0,0,.12)] ${compact ? 'h-8 text-[15px]' : 'h-10 text-lg'}`}
            style={{ background: col.bg, color: col.fg }}
          >
            {c}
          </span>
          <span className={`font-semibold text-ink ${compact ? 'text-[15px]' : 'text-base'}`}>{formatCategory(c)}</span>
          <span className={`grid h-6 w-6 place-items-center rounded-full bg-ink text-white ${on ? 'opacity-100' : 'opacity-0'}`}>
            <Check className="h-3.5 w-3.5" strokeWidth={3} />
          </span>
        </button>
      );
    })}
  </div>
);

/** Fila de categorías chica para el perfil: la del jugador resaltada. */
export const MiniLadder: React.FC<{ value: number }> = ({ value }) => (
  <div className="grid grid-cols-7 gap-1.5" aria-label={`${formatCategory(value)} categoría`}>
    {CATEGORIES.map((c) => (
      <span
        key={c}
        className={`grid h-8 place-items-center rounded-[7px] text-xs font-bold ${c === value ? 'outline-2 outline-offset-2 outline-ink' : 'opacity-25'}`}
        style={{ background: CATEGORY_COLORS[c].bg, color: CATEGORY_COLORS[c].fg }}
      >
        {c}
      </span>
    ))}
  </div>
);

/** Botones de una sola opción, en columnas parejas. */
export function OptionGroup<T extends string | number>({
  options,
  value,
  onChange,
  cols,
  label,
}: {
  options: { v: T; label: string; sub?: string }[];
  value: T | null | undefined;
  onChange: (v: T) => void;
  cols?: number;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols ?? options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => {
        const on = value === o.v;
        return (
          <button
            key={String(o.v)}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.v)}
            className={`flex min-h-[50px] cursor-pointer flex-col justify-center rounded-xl border-[1.5px] px-3 py-2 text-[15px] font-semibold ${
              (cols ?? options.length) === 1 ? 'items-start text-left' : 'items-center text-center'
            } ${on ? 'border-brand bg-mist shadow-[inset_0_0_0_1px_#0a5761]' : 'border-line bg-white hover:bg-mist'}`}
          >
            {o.label}
            {o.sub && <small className="text-[12.5px] font-normal text-muted">{o.sub}</small>}
          </button>
        );
      })}
    </div>
  );
}

/** Grilla de días por franjas que se marca con el dedo. */
export const AvailabilityGrid: React.FC<{ value: Set<GridKey>; onChange: (next: Set<GridKey>) => void }> = ({ value, onChange }) => (
  <div className="grid grid-cols-[64px_repeat(7,minmax(0,1fr))] gap-1 text-xs sm:grid-cols-[76px_repeat(7,minmax(0,1fr))]">
    <span />
    {GRID_DAYS.map((d) => (
      <span key={d.dow} className="pb-0.5 text-center font-semibold text-muted">
        {d.short}
      </span>
    ))}
    {FRANJAS.map((f, i) => (
      <React.Fragment key={f.id}>
        <span className="flex flex-col justify-center text-[12.5px] leading-tight font-semibold text-ink">
          {f.label}
          <small className="text-[11px] font-normal text-muted">
            {hourLabel(f.from)} a {hourLabel(f.to)}
          </small>
        </span>
        {GRID_DAYS.map((d) => {
          const k = gridKey(d.dow, i);
          const on = value.has(k);
          return (
            <button
              key={k}
              type="button"
              aria-pressed={on}
              aria-label={`${d.plural} a la ${f.label.toLowerCase()}`}
              data-testid={`franja-${k}`}
              onClick={() => {
                const next = new Set(value);
                if (on) next.delete(k);
                else next.add(k);
                onChange(next);
              }}
              className={`h-10 cursor-pointer rounded-lg border-[1.5px] ${on ? 'border-brand bg-brand' : 'border-dashed border-[#b6cbcc] hover:bg-mist'}`}
            />
          );
        })}
      </React.Fragment>
    ))}
  </div>
);

/** Ficha del jugador: franja del color de su categoría, foto cuadrada, nombre y cómo juega. */
export const PlayerFicha: React.FC<{
  profile: Pick<UserProfile, 'displayName' | 'photoUrl' | 'category' | 'courtSide' | 'hand' | 'preferredModality'>;
  clubName?: string;
  layout?: 'row' | 'column';
  action?: React.ReactNode;
}> = ({ profile, clubName, layout = 'row', action }) => {
  const chips = playStyleChips(profile);
  const photo = (size: string) =>
    profile.photoUrl ? (
      <img src={profile.photoUrl} alt="" className={`${size} bg-avatar object-cover`} />
    ) : (
      <span className={`${size} grid place-items-center bg-avatar font-display text-3xl font-bold text-brand`}>{initialsOf(profile.displayName)}</span>
    );
  return (
    <div className="relative overflow-hidden rounded-xl border border-line bg-white" data-testid="ficha-jugador">
      <div className="h-1.5" style={{ background: CATEGORY_COLORS[profile.category]?.bg }} />
      {layout === 'column' ? (
        <>
          {photo('block aspect-square w-full')}
          <div className="px-4 pt-3.5">
            <p className="font-display text-[22px] leading-tight font-bold text-ink">{profile.displayName}</p>
            {clubName && <p className="mt-0.5 text-[13px] text-muted">{clubName}</p>}
            <p className="mt-2.5 flex items-center gap-2 text-sm font-semibold text-ink">
              <CategoryBadge category={profile.category} size={28} showSuffix={false} />
              {formatCategory(profile.category)} categoría
            </p>
          </div>
        </>
      ) : (
        <div className="grid grid-cols-[96px_minmax(0,1fr)] items-start gap-3.5 p-3.5">
          {photo('h-24 w-24 rounded-xl')}
          <div className="min-w-0 pr-14">
            <p className="font-display text-[22px] leading-tight font-bold break-words text-ink">{profile.displayName}</p>
            {clubName && <p className="mt-0.5 text-[13px] text-muted">{clubName}</p>}
            <p className="mt-2.5 flex items-center gap-2 text-sm font-semibold text-ink">
              <CategoryBadge category={profile.category} size={28} showSuffix={false} />
              {formatCategory(profile.category)} categoría
            </p>
          </div>
        </div>
      )}
      {chips.length > 0 && (
        <div className={`flex flex-wrap gap-1.5 ${layout === 'column' ? 'px-4 pt-3 pb-4' : 'px-3.5 pb-3.5'}`}>
          {chips.map((c) => (
            <span key={c} className="rounded-full bg-mist px-2.5 py-1 text-[13px] font-semibold text-[#26393c]">
              {c}
            </span>
          ))}
        </div>
      )}
      {action && <div className={layout === 'column' ? 'px-4 pb-4' : 'absolute top-4 right-3'}>{action}</div>}
    </div>
  );
};
