import React, { useState } from 'react';
import { formatMinutes } from '../../lib/padelUtils';
import { PlayerAvatar } from '../ui/People';

// Agenda del día en lista para el Mostrador (variante B): primero los que jugaron y deben,
// después lo que está en juego, lo que viene y, plegado, lo que ya pasó pagado.

export type AgendaTone = 'paid' | 'due' | 'tbd' | 'unconf' | 'fu' | 'tour' | 'busy';

export interface AgendaItem {
  id: string;
  startMinute: number;
  endMinute: number;
  courtName: string;
  title: string;
  statusLabel: string;
  tone: AgendaTone;
  phase: 'past' | 'live' | 'next';
  people: { name?: string; photoUrl?: string }[];
}

const BG: Record<AgendaTone, string> = {
  paid: 'bg-ok-fill',
  due: 'bg-due-fill',
  tbd: 'bg-mist',
  unconf: 'bg-wait-fill',
  fu: 'bg-fu-fill',
  tour: 'bg-busy',
  busy: 'bg-busy',
};

export interface DayTab {
  iso: string;
  label: string;
  sub: string;
}

export const DayTabs: React.FC<{ days: DayTab[]; value: string; onChange: (iso: string) => void }> = ({ days, value, onChange }) => (
  <div className="flex gap-1.5 overflow-x-auto px-3.5 pt-3 pb-1.5">
    {days.map((d) => {
      const on = d.iso === value;
      return (
        <button
          key={d.iso}
          type="button"
          onClick={() => onChange(d.iso)}
          className={`shrink-0 rounded-xl px-3 py-1.5 text-left leading-tight cursor-pointer ${on ? 'bg-brand text-white' : 'bg-mist text-ink hover:brightness-95'}`}
        >
          <b className="block text-[15px]">{d.label}</b>
          <small className={`text-xs ${on ? 'text-white/75' : 'text-muted'}`}>{d.sub}</small>
        </button>
      );
    })}
  </div>
);

const Row: React.FC<{ it: AgendaItem; selected: boolean; onClick: () => void }> = ({ it, selected, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`mb-1 grid w-full grid-cols-[62px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left hover:brightness-[.97] cursor-pointer ${BG[it.tone]} ${
      it.phase === 'past' && it.tone !== 'due' ? 'opacity-60' : ''
    } ${it.phase === 'live' || selected ? 'outline-2 -outline-offset-2 outline-brand outline' : ''}`}
  >
    <span className="font-display text-base leading-tight font-bold tabular-nums">
      {formatMinutes(it.startMinute)}
      <small className="block text-xs font-normal text-muted">a {formatMinutes(it.endMinute)}</small>
    </span>
    <span className="min-w-0">
      <span className="block truncate font-semibold">{it.title}</span>
      <span className="block truncate text-[13px] text-muted">
        {it.courtName} · {it.statusLabel}
      </span>
    </span>
    <span className="flex">
      {it.people.slice(0, 4).map((p, i) => (
        <span key={i} style={{ marginLeft: i ? -9 : 0 }}>
          <PlayerAvatar name={p.name} photoUrl={p.photoUrl} size={28} />
        </span>
      ))}
    </span>
  </button>
);

export const AgendaList: React.FC<{ items: AgendaItem[]; isToday: boolean; selectedId?: string | null; onPick: (id: string) => void }> = ({
  items,
  isToday,
  selectedId,
  onPick,
}) => {
  const [showPast, setShowPast] = useState(false);
  const sorted = [...items].sort((a, b) => a.startMinute - b.startMinute || a.courtName.localeCompare(b.courtName));
  const row = (it: AgendaItem) => <Row key={it.id} it={it} selected={selectedId === it.id} onClick={() => onPick(it.id)} />;
  const h3 = 'mt-3 mb-1.5 text-[13px] font-semibold text-muted';

  if (!isToday) {
    return (
      <div className="min-h-0 flex-1 overflow-auto px-3.5 pb-3.5">
        {sorted.length ? sorted.map(row) : <p className="mt-4 text-sm text-muted">No hay reservas ese día.</p>}
      </div>
    );
  }
  const pastDue = sorted.filter((i) => i.phase === 'past' && i.tone === 'due');
  const pastOk = sorted.filter((i) => i.phase === 'past' && i.tone !== 'due');
  const live = sorted.filter((i) => i.phase === 'live');
  const next = sorted.filter((i) => i.phase === 'next');
  return (
    <div className="min-h-0 flex-1 overflow-auto px-3.5 pb-3.5">
      {pastDue.length > 0 && (
        <>
          <h3 className={h3}>Jugaron y deben</h3>
          {pastDue.map(row)}
        </>
      )}
      <h3 className={h3}>Ahora</h3>
      {live.length ? live.map(row) : <p className="text-[13px] text-muted">Ninguna cancha en juego.</p>}
      <h3 className={h3}>Próximas</h3>
      {next.length ? next.map(row) : <p className="text-[13px] text-muted">No hay más reservas hoy.</p>}
      <h3 className={h3}>Pasadas</h3>
      {showPast ? (
        pastOk.map(row)
      ) : (
        <button type="button" onClick={() => setShowPast(true)} className="px-2.5 py-1.5 font-semibold text-brand cursor-pointer">
          Ver las {pastOk.length} pasadas
        </button>
      )}
    </div>
  );
};

// Línea de tiempo del día (variante A, compu): una fila por cancha, bloques por turno y la línea de "ahora".

export const DayTimeline: React.FC<{
  courts: { id: string; name: string; roofed: boolean }[];
  items: (AgendaItem & { courtId: string; short: string })[];
  openMinute: number;
  closeMinute: number;
  nowMinute: number | null;
  selectedId?: string | null;
  onPick: (id: string) => void;
}> = ({ courts, items, openMinute, closeMinute, nowMinute, selectedId, onPick }) => {
  const span = Math.max(60, closeMinute - openMinute);
  const pct = (m: number) => ((m - openMinute) / span) * 100;
  const hours: number[] = [];
  for (let h = Math.ceil(openMinute / 120) * 120; h <= closeMinute; h += 120) hours.push(h);
  const showNow = nowMinute != null && nowMinute >= openMinute && nowMinute <= closeMinute;
  return (
    <div className="flex min-h-0 flex-1 flex-col px-3.5 pt-1 pb-2">
      <div className="relative ml-[100px] h-5 text-xs text-muted">
        {hours.map((h) => (
          <span key={h} className="absolute -translate-x-1/2 tabular-nums" style={{ left: `${pct(h)}%` }}>
            {formatMinutes(h % 1440)}
          </span>
        ))}
        {showNow && (
          <span className="absolute z-10 -translate-x-1/2 rounded-full bg-due px-1.5 font-bold text-white tabular-nums" style={{ left: `${pct(nowMinute!)}%` }}>
            {formatMinutes(nowMinute!)}
          </span>
        )}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-1.5">
        {courts.map((c) => (
          <div key={c.id} className="flex min-h-[44px] flex-1" style={{ maxHeight: 96 }}>
            <div className="flex w-[100px] shrink-0 items-center gap-1.5 whitespace-nowrap pr-2 text-[15px] font-bold">{c.name}</div>
            <div className="relative flex-1 rounded-lg">
              {hours.map((h) => (
                <div key={h} className="pointer-events-none absolute top-0 bottom-0 w-px bg-line" style={{ left: `${pct(h)}%` }} />
              ))}
              {items
                .filter((it) => it.courtId === c.id)
                .map((it) => (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => onPick(it.id)}
                    title={`${formatMinutes(it.startMinute)} ${it.title} · ${it.statusLabel}`}
                    className={`absolute top-[3px] bottom-[3px] flex flex-col justify-between overflow-hidden rounded-lg px-1.5 py-1 text-left text-xs leading-tight cursor-pointer hover:brightness-[.97] ${BG[it.tone]} ${
                      it.phase === 'past' && it.tone !== 'due' ? 'opacity-55' : ''
                    } ${it.phase === 'live' || selectedId === it.id ? 'outline-[2.5px] -outline-offset-1 outline-brand outline' : ''}`}
                    style={{ left: `calc(${pct(it.startMinute)}% + 2px)`, width: `calc(${((it.endMinute - it.startMinute) / span) * 100}% - 4px)` }}
                  >
                    <span className="truncate font-semibold">{it.short}</span>
                    <span className="flex">
                      {it.people.slice(0, 4).map((p, i) => (
                        <span key={i} style={{ marginLeft: i ? -5 : 0 }}>
                          <PlayerAvatar name={p.name} photoUrl={p.photoUrl} size={20} />
                        </span>
                      ))}
                    </span>
                  </button>
                ))}
              {showNow && <div className="pointer-events-none absolute -top-1 -bottom-1 z-[3] w-0.5 bg-due" style={{ left: `${pct(nowMinute!)}%` }} />}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3.5 gap-y-1 text-xs text-muted">
        {(
          [
            ['bg-ok-fill', 'Pagado'],
            ['bg-mist', 'A cobrar'],
            ['bg-due-fill', 'Jugó y debe'],
            ['bg-wait-fill', 'Armando partido'],
            ['bg-fu-fill', 'Falta uno'],
            ['bg-busy', 'Torneo o ausencia'],
          ] as const
        ).map(([c, l]) => (
          <span key={l} className="inline-flex items-center gap-1.5">
            <i className={`inline-block h-3 w-3 rounded-[3px] ${c}`} />
            {l}
          </span>
        ))}
      </div>
    </div>
  );
};
