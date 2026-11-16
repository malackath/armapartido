/** Clientes del club (Admin y Mostrador): lista, búsqueda, posibles repetidos, alta y ficha. */
import React, { useMemo, useState } from 'react';
import type { Booking, Club, ClubMembership, PaymentRecord, ProposedMatch } from '../../types/padel';
import type { Consumption } from '../../types/caja';
import type { ClubClient } from '../../types/clientes';
import { clientDebts, clientKey, fold, formatPhone, pendingValue, possibleDuplicates, sheetClientes } from '../../lib/clientes';
import { formatUYU } from '../../lib/padelUtils';
import { downloadBytes, toXLSX, XLSX_MIME } from '../../lib/planilla';
import { logExport } from '../../services/clientesService';
import type { Staff } from '../../services/cajaService';
import { StatusChip } from '../ui/People';
import { Chip, ClientLine, useClientes } from './data';
import { ClientPicker } from './ClientPicker';
import { ClientCard } from './ClientCard';

type Filter = 'todos' | 'deben' | 'sinapp' | 'cuponera' | 'repetidos';

export const ClientsPanel: React.FC<{
  club: Club;
  memberships: ClubMembership[];
  bookings: Booking[];
  matches: ProposedMatch[];
  payments: PaymentRecord[];
  consumptions: Consumption[];
  staff: Staff;
  isOwner: boolean;
  today: string;
  nowMinute: number;
  closedToday: boolean;
  onToast: (msg: string) => void;
  initialClientId?: string;
}> = ({ club, memberships, bookings, matches, payments, consumptions, staff, isOwner, today, nowMinute, closedToday, onToast, initialClientId }) => {
  const { clients, packs, sales, ready } = useClientes();
  const [openId, setOpenId] = useState<string | null>(initialClientId ?? null);
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState<Filter>('todos');
  const [q, setQ] = useState('');
  const active = useMemo(() => clients.filter((c) => c.status === 'active'), [clients]);
  const nameOf = (u: string) => memberships.find((m) => m.uid === u)?.displayName ?? 'Jugador';
  const debts = useMemo(() => clientDebts({ clients, consumptions, bookings, matches, sales, today, nowMinute, nameOf }), [clients, consumptions, bookings, matches, sales, today, nowMinute]); // eslint-disable-line react-hooks/exhaustive-deps
  const debtBy = useMemo(() => new Map(debts.map((d) => [d.key, d])), [debts]);
  const dupGroups = useMemo(() => possibleDuplicates(clients), [clients]);
  const dupIds = new Set([...dupGroups.flat().map((c) => c.id), ...active.filter((c) => c.reviewDuplicate).map((c) => c.id)]);
  const packBy = useMemo(() => {
    const m = new Map<string, number>();
    packs.forEach((p) => pendingValue(p, today) > 0 && m.set(p.clientId, (m.get(p.clientId) ?? 0) + p.usesLeft));
    return m;
  }, [packs, today]);

  const open = clients.find((c) => c.id === openId);
  if (open) {
    const target = open.mergedInto ? clients.find((c) => c.id === open.mergedInto) ?? open : open;
    return (
      <ClientCard
        key={target.id}
        club={club}
        client={target}
        memberships={memberships}
        bookings={bookings}
        matches={matches}
        payments={payments}
        consumptions={consumptions}
        staff={staff}
        isOwner={isOwner}
        today={today}
        nowMinute={nowMinute}
        closedToday={closedToday}
        onClose={() => setOpenId(null)}
        onToast={onToast}
        onOpen={(c) => setOpenId(c.id)}
      />
    );
  }

  const text = fold(q);
  const digits = q.replace(/\D/g, '');
  const list = active
    .filter((c) => {
      if (filter === 'deben') return debtBy.has(clientKey(c));
      if (filter === 'sinapp') return !c.uid;
      if (filter === 'cuponera') return packBy.has(c.id);
      if (filter === 'repetidos') return dupIds.has(c.id);
      return true;
    })
    .filter((c) => !text || fold(c.name).includes(text) || (digits.length >= 3 && c.phone.includes(digits.replace(/^0/, ''))) || fold(c.email).includes(text))
    .sort((a, b) => (filter === 'deben' ? (debtBy.get(clientKey(b))?.amount ?? 0) - (debtBy.get(clientKey(a))?.amount ?? 0) : a.name.localeCompare(b.name)));
  const withApp = active.filter((c) => c.uid).length;

  const bajar = async () => {
    const lastVisit = (c: ClubClient) =>
      bookings
        .filter((b) => b.status === 'confirmed' && b.date <= today && (b.clientId === c.id || (c.uid && b.playerUids.includes(c.uid))))
        .map((b) => b.date)
        .sort()
        .pop() ?? '';
    const sheet = sheetClientes(clients, debts, lastVisit);
    downloadBytes(`clientes-${club.slug || club.id}-${today}.xlsx`, toXLSX([sheet]), XLSX_MIME);
    await logExport(club, 'clientes', staff, sheet.rows.length - 1);
    onToast('Planilla bajada. Queda registrado quién la bajó y cuándo.');
  };

  return (
    <div className="space-y-3" data-testid="clientes-lista">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <p className="text-[13px] text-muted">
          <b className="text-ink">{active.length}</b> clientes · {withApp} con app · {active.length - withApp} sin app
        </p>
        <div className="flex gap-2">
          {isOwner && (
            <button type="button" onClick={bajar} className="rounded-full border border-line bg-white px-3.5 py-1.5 text-[13px] font-semibold text-brand hover:bg-mist cursor-pointer">
              Bajar a planilla
            </button>
          )}
          <button type="button" onClick={() => setAdding((v) => !v)} className="rounded-full bg-brand px-3.5 py-1.5 text-[13px] font-semibold text-white cursor-pointer">
            + Nuevo cliente
          </button>
        </div>
      </div>
      {adding && (
        <div className="rounded-xl bg-mist p-3">
          <ClientPicker
            club={club}
            memberships={memberships}
            staff={staff}
            today={today}
            origin="mostrador"
            autoFocus
            debtOf={(c) => debtBy.get(clientKey(c))?.amount ?? 0}
            onPick={(c) => {
              setAdding(false);
              setOpenId(c.id);
            }}
          />
        </div>
      )}
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre, celular o mail" aria-label="Filtrar clientes" className="w-full rounded-xl border border-line bg-white px-3 py-2.5 text-sm" />
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {(
          [
            ['todos', 'Todos'],
            ['deben', `Deben (${debts.filter((d) => d.client).length})`],
            ['sinapp', 'Sin app'],
            ['cuponera', `Con cuponera (${packBy.size})`],
            ['repetidos', `Posibles repetidos (${dupIds.size})`],
          ] as [Filter, string][]
        ).map(([id, label]) => (
          <Chip key={id} on={filter === id} onClick={() => setFilter(id)}>
            {label}
          </Chip>
        ))}
      </div>
      {!ready && <p className="text-[13px] text-muted">Cargando…</p>}
      {ready && list.length === 0 && <p className="rounded-xl bg-white px-3.5 py-4 text-[13px] text-muted">No hay clientes con ese filtro.</p>}
      <ul className="divide-y divide-[#eef5f5] rounded-xl border border-line bg-white">
        {list.slice(0, 120).map((c) => {
          const d = debtBy.get(clientKey(c));
          const member = c.uid ? memberships.find((m) => m.uid === c.uid) : undefined;
          return (
            <li key={c.id}>
              <button type="button" onClick={() => setOpenId(c.id)} className="flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left hover:bg-mist/50 cursor-pointer">
                <ClientLine name={c.name} phone={c.phone} category={c.category} hasApp={!!c.uid} photoUrl={member?.photoUrl} />
                <span className="flex shrink-0 flex-col items-end gap-1">
                  {d && <StatusChip kind="due">Debe {formatUYU(d.amount)}</StatusChip>}
                  {packBy.has(c.id) && <StatusChip kind="free">Cuponera: {packBy.get(c.id)}</StatusChip>}
                  {c.balance > 0 && <StatusChip kind="ok">Saldo {formatUYU(c.balance)}</StatusChip>}
                  {dupIds.has(c.id) && <StatusChip kind="wait">¿Repetido?</StatusChip>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {filter === 'repetidos' && dupGroups.length > 0 && (
        <p className="text-[12.5px] text-muted">
          Mismo celular o mail en {dupGroups.length} {dupGroups.length === 1 ? 'grupo' : 'grupos'}:{' '}
          {dupGroups.map((g) => g.map((c) => `${c.name} (${formatPhone(c.phone) || c.email})`).join(' y ')).join('; ')}. Abrí una y usá "Unir con otra ficha".
        </p>
      )}
    </div>
  );
};
