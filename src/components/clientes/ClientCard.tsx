/** W1. Ficha del cliente: lo que debe, cuponeras, turnos, movimientos y sus datos. */
import React, { useMemo, useState } from 'react';
import { MessageCircle, X } from 'lucide-react';
import type { Booking, Club, ClubMembership, PaymentRecord, ProposedMatch } from '../../types/padel';
import type { Consumption } from '../../types/caja';
import { ORIGIN_LABEL, type ClubClient } from '../../types/clientes';
import {
  buildLedger,
  clientDebts,
  clientKey,
  dmy,
  dmyFull,
  formatPhone,
  isEmail,
  normalizePhone,
  pendingValue,
  VALIDITY_LABEL,
} from '../../lib/clientes';
import { addDaysISO, formatCategory, formatMinutes, formatUYU } from '../../lib/padelUtils';
import type { Staff } from '../../services/cajaService';
import {
  eraseClient,
  linkClientToUser,
  logExport,
  mergeClients,
  payWholeDebt,
  sellPack,
  updateClient,
  whatsappInviteUrl,
} from '../../services/clientesService';
import type { CounterPaymentMethod } from '../../services/firestoreService';
import { toCSV, downloadBytes, CSV_MIME } from '../../lib/planilla';
import { CategoryBadge, PlayerAvatar, StatusChip } from '../ui/People';
import { MethodPicker, btnPrimary, btnSecondary } from '../caja/ops';
import { Chip, ClientLine, Tabs, useClientes } from './data';
import { ClientPicker } from './ClientPicker';

type Tab = 'mov' | 'cup' | 'turnos' | 'datos';

export const ClientCard: React.FC<{
  club: Club;
  client: ClubClient;
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
  onClose: () => void;
  onToast: (msg: string) => void;
  onOpen: (c: ClubClient) => void;
}> = ({ club, client, memberships, bookings, matches, payments, consumptions, staff, isOwner, today, nowMinute, closedToday, onClose, onToast, onOpen }) => {
  const { clients, packs, sales, packTypes } = useClientes();
  const [tab, setTab] = useState<Tab>('mov');
  const [busy, setBusy] = useState(false);
  const [paying, setPaying] = useState(false);
  const [method, setMethod] = useState<CounterPaymentMethod>('efectivo');
  const member = client.uid ? memberships.find((m) => m.uid === client.uid) : undefined;
  const key = clientKey(client);
  /** La ficha y las que se unieron a ella. */
  const ids = useMemo(() => new Set([client.id, ...clients.filter((c) => c.mergedInto === client.id).map((c) => c.id)]), [clients, client.id]);
  const keys = useMemo(() => new Set([...[...ids].map((i) => `c:${i}`), ...(client.uid ? [client.uid] : [])]), [ids, client.uid]);

  const debt = useMemo(
    () =>
      clientDebts({ clients, consumptions, bookings, matches, sales, today, nowMinute, nameOf: (u) => memberships.find((m) => m.uid === u)?.displayName ?? 'Jugador' }).find(
        (d) => d.key === key
      ),
    [clients, consumptions, bookings, matches, sales, today, nowMinute, memberships, key]
  );
  const myPacks = packs.filter((p) => ids.has(p.clientId)).sort((a, b) => b.soldOn.localeCompare(a.soldOn));
  const livePacks = myPacks.filter((p) => pendingValue(p, today) > 0);
  const usesLeft = livePacks.reduce((a, p) => a + p.usesLeft, 0);
  const nextExpiry = livePacks.map((p) => p.expiresOn).sort()[0];

  const matchByBooking = useMemo(() => new Map(matches.map((m) => [m.bookingId, m])), [matches]);
  const myBookings = useMemo(
    () =>
      bookings
        .filter((b) => (b.clientId && ids.has(b.clientId)) || (client.uid && (b.playerUids.includes(client.uid) || matchByBooking.get(b.id)?.slots.some((s) => s.uid === client.uid))))
        .sort((a, b) => b.date.localeCompare(a.date) || b.startMinute - a.startMinute),
    [bookings, ids, client.uid, matchByBooking]
  );
  const played90 = myBookings.filter((b) => b.status === 'confirmed' && b.date <= today && b.date >= addDaysISO(today, -90)).length;

  const ledger = useMemo(() => buildLedger(payments, sales, clients, bookings, matches).filter((r) => r.clientId && ids.has(r.clientId)), [payments, sales, clients, bookings, matches, ids]);
  const debtRows = useMemo(() => {
    if (!debt) return [];
    const rows: { id: string; day: string; label: string; amount: number }[] = [];
    consumptions
      .filter((c) => debt.consumptionIds.includes(c.id))
      .forEach((c) => {
        const k = c.participantUids.find((u) => keys.has(u)) ?? key;
        const share = c.shared ? Math.round(c.total / c.participantUids.length) : c.total;
        rows.push({ id: c.id, day: c.date, label: `${c.qty > 1 ? `${c.qty} ` : ''}${c.productName} · Cantina`, amount: c.paidUids.includes(k) ? 0 : share });
      });
    bookings.filter((b) => debt.bookingIds.includes(b.id)).forEach((b) => rows.push({ id: b.id, day: b.date, label: `${b.type === 'matched' ? 'Parte de cancha' : 'Cancha'} ${b.courtName.replace('Cancha ', 'C')}`, amount: b.type === 'matched' ? matchByBooking.get(b.id)?.pricePerPlayer ?? 0 : b.totalPrice - b.paidAmount }));
    sales.filter((s) => debt.saleIds.includes(s.id)).forEach((s) => rows.push({ id: s.id, day: s.day, label: `${s.concept} · ${s.rubro[0].toUpperCase()}${s.rubro.slice(1)}`, amount: s.amount }));
    return rows;
  }, [debt, consumptions, bookings, sales, keys, key, matchByBooking]);

  const run = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true);
    try {
      await fn();
      onToast(msg);
    } catch (e) {
      onToast(e instanceof Error && e.message.length < 120 ? e.message : 'No se pudo guardar. Probá de nuevo.');
    } finally {
      setBusy(false);
    }
  };

  const payAll = () =>
    run(async () => {
      if (!debt) return;
      await payWholeDebt({ club, debt: { ...debt, client }, clients, consumptions, bookings, matches, sales, method, staff, day: today, afterClose: closedToday });
      setPaying(false);
    }, `Cobrado: ${formatUYU(debt?.amount ?? 0)} de ${client.name.split(' ')[0]}.`);

  const appUrl = typeof window !== 'undefined' ? window.location.origin : 'https://armapartido.com';

  return (
    <div className="space-y-4" data-testid="ficha-cliente">
      <div className="flex items-start justify-between gap-3 rounded-xl border border-line bg-white p-4">
        <div className="flex min-w-0 items-center gap-3.5">
          <PlayerAvatar name={client.name} photoUrl={member?.photoUrl} size={60} />
          <div className="min-w-0">
            <p className="flex items-center gap-2">
              <span className="truncate font-display text-[19px] font-bold text-ink">{client.name}</span>
              {client.category ? <CategoryBadge category={client.category} size={22} showSuffix={false} /> : null}
            </p>
            <p className="truncate text-[13px] text-muted">{[client.phone ? formatPhone(client.phone) : client.noPhone ? 'sin celular' : '', client.email].filter(Boolean).join(' · ')}</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {client.uid ? <StatusChip kind="ok">Con app</StatusChip> : <StatusChip kind="wait">Sin app</StatusChip>}
              <StatusChip kind="free">Llegó por {ORIGIN_LABEL[client.origin]} · {dmy(client.createdOn)}</StatusChip>
              {client.balance > 0 && <StatusChip kind="ok">Saldo a favor {formatUYU(client.balance)}</StatusChip>}
              {client.reviewDuplicate && <StatusChip kind="due">Posible repetido</StatusChip>}
            </div>
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label="Cerrar ficha" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-mist cursor-pointer">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        <Stat value={String(played90)} label="turnos en 90 días" />
        <Stat value={debt ? formatUYU(debt.amount) : '$ 0'} label={debt ? `debe, desde ${dmy(debt.since)}` : 'no debe nada'} tone={debt ? 'due' : undefined} />
        <Stat value={String(usesLeft)} label={usesLeft ? `usos de cuponera, vence ${dmy(nextExpiry)}` : 'sin cuponera vigente'} />
      </div>

      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        items={[
          ['mov', 'Movimientos'],
          ['cup', `Cuponeras${livePacks.length ? ` (${livePacks.length})` : ''}`],
          ['turnos', 'Turnos'],
          ['datos', 'Datos'],
        ]}
      />

      {tab === 'mov' && (
        <div className="rounded-xl border border-line bg-white px-3.5 py-1">
          {debtRows.length + ledger.length === 0 && <p className="py-3 text-[13px] text-muted">Todavía no tiene movimientos.</p>}
          {debtRows.map((r) => (
            <MovRow key={`d${r.id}`} day={r.day} label={r.label} chip={<StatusChip kind="due">Debe {formatUYU(r.amount)}</StatusChip>} />
          ))}
          {ledger.slice(0, 40).map((r) => (
            <MovRow
              key={r.id}
              day={r.day}
              label={
                <>
                  {r.concept[0]?.toUpperCase()}
                  {r.concept.slice(1)}
                  <span className="text-muted"> · {r.method === 'Cuponera' ? 'pagó con cuponera' : `${r.method.toLowerCase()}${r.staffName ? ` · ${r.staffName.split(' ')[0]}` : ''}`}</span>
                </>
              }
              voided={r.voided}
              chip={
                r.kind === 'uso' ? (
                  <StatusChip kind="free">{r.method === 'Cuponera' ? (r.concept.match(/uso (\d+ de \d+)/)?.[1]?.replace(' de ', '/') ? `Uso ${r.concept.match(/uso (\d+ de \d+)/)![1].replace(' de ', '/')}` : 'Cuponera') : 'Saldo'}</StatusChip>
                ) : r.kind === 'cuenta' ? (
                  <StatusChip kind="wait">A cuenta {formatUYU(r.amount)}</StatusChip>
                ) : (
                  <StatusChip kind={r.amount < 0 ? 'due' : 'ok'}>{formatUYU(r.amount)}</StatusChip>
                )
              }
            />
          ))}
        </div>
      )}

      {tab === 'cup' && (
        <div className="space-y-3">
          {myPacks.length === 0 && <p className="text-[13px] text-muted">No tiene cuponeras.</p>}
          {myPacks.map((p) => {
            const live = pendingValue(p, today) > 0;
            return (
              <div key={p.id} className={`rounded-xl border p-3.5 ${live ? 'border-line bg-white' : 'border-transparent bg-busy/60'}`}>
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-sm font-semibold text-ink">{p.name}</p>
                  <StatusChip kind={live ? 'ok' : p.status === 'voided' ? 'due' : 'busy'}>{p.status === 'voided' ? 'Anulada' : live ? `Quedan ${p.usesLeft} de ${p.usesTotal}` : p.usesLeft === 0 ? 'Usada' : 'Venció sin usar'}</StatusChip>
                </div>
                <p className="text-[12.5px] text-muted">
                  Vendida {dmy(p.soldOn)} a {formatUYU(p.price)} · vence {dmyFull(p.expiresOn)} · {p.unit === 'turno' ? 'turnos completos' : 'partes de un jugador'}, {VALIDITY_LABEL[p.validity]}
                </p>
                {p.uses.length > 0 && <p className="mt-1 text-[12px] text-muted">Usos: {p.uses.map((u) => dmy(u.date)).join(', ')}</p>}
              </div>
            );
          })}
          <SellPackInline club={club} client={client} staff={staff} today={today} closedToday={closedToday} busy={busy} run={run} packTypes={packTypes.filter((t) => t.active)} />
        </div>
      )}

      {tab === 'turnos' && (
        <div className="rounded-xl border border-line bg-white px-3.5 py-1">
          {myBookings.length === 0 && <p className="py-3 text-[13px] text-muted">No tiene turnos.</p>}
          {myBookings.slice(0, 30).map((b) => (
            <MovRow
              key={b.id}
              day={b.date}
              label={
                <>
                  {b.courtName} · {formatMinutes(b.startMinute)}
                  <span className="text-muted"> · {b.type === 'matched' ? 'partido armado' : b.type === 'direct' ? 'por la app' : b.type === 'tournament' ? 'torneo' : 'mostrador o teléfono'}</span>
                </>
              }
              chip={
                b.status === 'cancelled' ? <StatusChip kind="busy">Cancelada</StatusChip> : b.status === 'no_show' ? <StatusChip kind="due">Ausencia</StatusChip> : b.date > today ? <StatusChip kind="free">Reservada</StatusChip> : <StatusChip kind="ok">Jugó</StatusChip>
              }
            />
          ))}
        </div>
      )}

      {tab === 'datos' && (
        <DatosTab
          club={club}
          client={client}
          clients={clients}
          memberships={memberships}
          staff={staff}
          today={today}
          isOwner={isOwner}
          busy={busy}
          run={run}
          blockers={[debt ? `debe ${formatUYU(debt.amount)}` : '', client.balance > 0 ? `tiene ${formatUYU(client.balance)} de saldo a favor` : '', usesLeft ? `le quedan ${usesLeft} usos de cuponera` : ''].filter(Boolean)}
          exportRows={() => [
            ['Dato', 'Valor'],
            ['Nombre', client.name],
            ['Celular', formatPhone(client.phone)],
            ['Mail', client.email],
            ['Categoría', client.category ? formatCategory(client.category) : ''],
            ['Con app', client.uid ? 'Sí' : 'No'],
            ['Cómo llegó', ORIGIN_LABEL[client.origin]],
            ['Alta', dmyFull(client.createdOn)],
            ['Acepta novedades', client.acceptsNews ? 'Sí' : 'No'],
            ['Nota del club', client.note],
            ['RUT', client.rut],
            [],
            ['Fecha', 'Movimiento', 'Medio', 'Monto'],
            ...ledger.map((r) => [dmyFull(r.day), r.concept, r.method, r.amount]),
          ]}
          packsPacks={myPacks}
          onOpen={onOpen}
          consumptions={consumptions}
          bookings={bookings}
        />
      )}

      {paying && debt ? (
        <div className="space-y-2 rounded-xl bg-mist p-3">
          <MethodPicker value={method} onChange={setMethod} />
          <button type="button" disabled={busy} onClick={payAll} className={btnPrimary}>
            Cobrar {formatUYU(debt.amount)}
          </button>
          <button type="button" onClick={() => setPaying(false)} className="w-full text-[13px] text-muted cursor-pointer">
            Cancelar
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2.5">
          <button type="button" disabled={!debt || busy} onClick={() => setPaying(true)} className="rounded-xl bg-action py-3 text-sm font-semibold text-on-action hover:brightness-95 disabled:opacity-40 cursor-pointer">
            {debt ? 'Cobrar lo que debe' : 'No debe nada'}
          </button>
          {client.uid ? (
            <span className="flex items-center justify-center rounded-xl border border-line bg-white py-3 text-sm font-semibold text-ok">Ya tiene la app</span>
          ) : (
            <a
              href={client.phone ? whatsappInviteUrl(club, client, appUrl) : undefined}
              target="_blank"
              rel="noreferrer"
              onClick={() => {
                if (!client.phone) onToast('No tiene celular: mostrale el QR del club en el mostrador.');
                else void updateClient(club, client.id, { invitedAtISO: new Date().toISOString() });
              }}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-line bg-white py-3 text-sm font-semibold text-brand hover:bg-mist cursor-pointer"
            >
              <MessageCircle className="h-4 w-4" /> Invitarlo a la app
            </a>
          )}
        </div>
      )}
      {!client.uid && (
        <p className="text-[12px] text-muted">
          {client.invitedAtISO ? `Invitado el ${dmy(client.invitedAtISO.slice(0, 10))}. ` : ''}Abre tu WhatsApp con el mensaje escrito; vos tocás enviar. El mail de invitación sale cuando estén conectados los mails del servidor.
        </p>
      )}
      <p className="text-[12px] text-muted">Una ficha por persona en cada club. Otro club no ve esta ficha aunque juegue allá con la misma cuenta.</p>
    </div>
  );
};

const Stat: React.FC<{ value: string; label: string; tone?: 'due' }> = ({ value, label, tone }) => (
  <div className="rounded-xl border border-line bg-white px-3 py-2.5">
    <p className={`font-display text-[22px] font-bold tabular-nums ${tone === 'due' ? 'text-due' : 'text-brand'}`}>{value}</p>
    <p className="text-[12px] leading-tight text-muted">{label}</p>
  </div>
);

const MovRow: React.FC<{ day: string; label: React.ReactNode; chip: React.ReactNode; voided?: boolean }> = ({ day, label, chip, voided }) => (
  <div className="flex items-center justify-between gap-2 border-b border-[#eef5f5] py-2 text-[13px] last:border-0">
    <span className={`min-w-0 truncate ${voided ? 'text-muted line-through' : 'text-ink'}`}>
      <span className="tabular-nums">{dmy(day)}</span> · {label}
    </span>
    <span className="shrink-0">{chip}</span>
  </div>
);

const SellPackInline: React.FC<{
  club: Club;
  client: ClubClient;
  staff: Staff;
  today: string;
  closedToday: boolean;
  busy: boolean;
  run: (fn: () => Promise<unknown>, msg: string) => Promise<void>;
  packTypes: ReturnType<typeof useClientes>['packTypes'];
}> = ({ club, client, staff, today, closedToday, busy, run, packTypes }) => {
  const [pick, setPick] = useState<string | null>(null);
  const [method, setMethod] = useState<CounterPaymentMethod>('efectivo');
  if (packTypes.length === 0) return <p className="text-[12.5px] text-muted">El club todavía no armó cuponeras (Admin, Cuponeras).</p>;
  const pt = packTypes.find((t) => t.id === pick);
  return (
    <div className="rounded-xl bg-mist p-3">
      <p className="mb-2 text-xs font-semibold tracking-wider text-muted uppercase">Vender una cuponera</p>
      <div className="flex flex-wrap gap-1.5">
        {packTypes.map((t) => (
          <Chip key={t.id} on={pick === t.id} onClick={() => setPick(t.id)}>
            {t.name} · {formatUYU(t.price)}
          </Chip>
        ))}
      </div>
      {pt && (
        <div className="mt-2.5 space-y-2">
          <MethodPicker value={method} onChange={setMethod} />
          <button
            type="button"
            disabled={busy}
            onClick={() => run(async () => { await sellPack({ club, client, packType: pt, method, staff, day: today, afterClose: closedToday }); setPick(null); }, `Cuponera vendida: ${pt.name}.`)}
            className={btnPrimary}
          >
            Cobrar {formatUYU(pt.price)}
          </button>
        </div>
      )}
    </div>
  );
};

const CATS = [1, 2, 3, 4, 5, 6, 7, 8];

const DatosTab: React.FC<{
  club: Club;
  client: ClubClient;
  clients: ClubClient[];
  memberships: ClubMembership[];
  staff: Staff;
  today: string;
  isOwner: boolean;
  busy: boolean;
  run: (fn: () => Promise<unknown>, msg: string) => Promise<void>;
  blockers: string[];
  exportRows: () => (string | number)[][];
  packsPacks: ReturnType<typeof useClientes>['packs'];
  onOpen: (c: ClubClient) => void;
  consumptions: Consumption[];
  bookings: Booking[];
}> = ({ club, client, clients, memberships, staff, today, isOwner, busy, run, blockers, exportRows, onOpen, consumptions, bookings }) => {
  const [f, setF] = useState({
    name: client.name,
    phone: client.phone ? formatPhone(client.phone) : '',
    noPhone: client.noPhone,
    email: client.email,
    category: client.category ?? 0,
    rut: client.rut,
    businessName: client.businessName,
    note: client.note,
    acceptsNews: client.acceptsNews,
    noticeGiven: client.noticeGiven,
  });
  const { packs: allPacks } = useClientes();
  const [mode, setMode] = useState<null | 'merge' | 'link' | 'erase'>(null);
  const [other, setOther] = useState<ClubClient | null>(null);
  const linkable = memberships.filter((m) => m.role === 'player' && !clients.some((c) => c.uid === m.uid && c.status === 'active'));
  const [linkUid, setLinkUid] = useState('');
  const err = !f.name.trim() ? 'Falta el nombre.' : !f.noPhone && !normalizePhone(f.phone) ? 'El celular no parece válido.' : f.email && !isEmail(f.email) ? 'El mail no parece válido.' : '';
  const field = 'mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink';
  const lbl = 'block text-[12.5px] font-semibold text-ink';
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={lbl}>
          Nombre y apellido
          <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={field} />
        </label>
        <label className={lbl}>
          Celular
          <input value={f.phone} disabled={f.noPhone} onChange={(e) => setF({ ...f, phone: e.target.value })} inputMode="tel" className={`${field} tabular-nums disabled:bg-mist`} />
        </label>
        <label className={lbl}>
          Mail
          <input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} inputMode="email" className={field} />
        </label>
        <label className={lbl}>
          Categoría
          <select value={f.category} onChange={(e) => setF({ ...f, category: Number(e.target.value) })} className={field}>
            <option value={0}>Sin categoría</option>
            {CATS.map((c) => (
              <option key={c} value={c}>
                {formatCategory(c)}
              </option>
            ))}
          </select>
        </label>
        <label className={lbl}>
          RUT (si pide factura a empresa)
          <input value={f.rut} onChange={(e) => setF({ ...f, rut: e.target.value })} inputMode="numeric" className={field} />
        </label>
        <label className={lbl}>
          Razón social
          <input value={f.businessName} onChange={(e) => setF({ ...f, businessName: e.target.value })} className={field} />
        </label>
        <label className={`${lbl} sm:col-span-2`}>
          Nota del club (corta, operativa: "paga a fin de mes")
          <input value={f.note} maxLength={140} onChange={(e) => setF({ ...f, note: e.target.value })} className={field} />
        </label>
      </div>
      <div className="space-y-1.5 text-[13px]">
        <label className="flex items-center gap-2"><input type="checkbox" checked={f.noPhone} onChange={(e) => setF({ ...f, noPhone: e.target.checked })} className="h-4 w-4 accent-[#00696b]" /> No tiene celular</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={f.noticeGiven} onChange={(e) => setF({ ...f, noticeGiven: e.target.checked })} className="h-4 w-4 accent-[#00696b]" /> Le avisé que sus datos quedan en el club</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={f.acceptsNews} onChange={(e) => setF({ ...f, acceptsNews: e.target.checked })} className="h-4 w-4 accent-[#00696b]" /> Acepta novedades y promociones del club</label>
      </div>
      {err && <p className="text-[12.5px] font-semibold text-due">{err}</p>}
      <button
        type="button"
        disabled={busy || !!err}
        onClick={() => run(() => updateClient(club, client.id, { name: f.name, phone: f.phone, noPhone: f.noPhone, email: f.email, category: f.category || null, rut: f.rut, businessName: f.businessName, note: f.note, acceptsNews: f.acceptsNews, noticeGiven: f.noticeGiven, reviewDuplicate: false }), 'Ficha guardada.')}
        className={btnPrimary}
      >
        Guardar cambios
      </button>

      <div className="rounded-xl border border-line bg-white p-3.5">
        <p className="text-xs font-semibold tracking-wider text-muted uppercase">Unir</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Chip on={mode === 'merge'} onClick={() => { setMode(mode === 'merge' ? null : 'merge'); setOther(null); }}>Unir con otra ficha (repetida)</Chip>
          {!client.uid && <Chip on={mode === 'link'} onClick={() => setMode(mode === 'link' ? null : 'link')}>Unir con su cuenta de la app</Chip>}
        </div>
        {mode === 'merge' && (
          <div className="mt-3">
            {!other ? (
              <ClientPicker club={club} memberships={[]} staff={staff} today={today} origin="mostrador" onPick={(c) => (c.id === client.id ? undefined : setOther(c))} placeholder="Buscá la ficha repetida" />
            ) : (
              <div className="rounded-xl bg-mist p-3 text-[13px]">
                <p>
                  Queda <b>{client.name}</b> y <b>{other.name}</b> pasa a archivada con el aviso "unida a {client.name.split(' ')[0]}". Pasan sus cuponeras y su saldo; los movimientos viejos no se borran.
                </p>
                <div className="mt-2 flex gap-2">
                  <button type="button" disabled={busy} onClick={() => run(async () => { await mergeClients(club, client, other, allPacks); setMode(null); setOther(null); }, 'Fichas unidas.')} className="rounded-full bg-brand px-3.5 py-1.5 font-semibold text-white cursor-pointer">
                    Unir
                  </button>
                  <button type="button" onClick={() => onOpen(other)} className="rounded-full border border-line bg-white px-3.5 py-1.5 font-semibold cursor-pointer">Ver la otra</button>
                  <button type="button" onClick={() => setOther(null)} className="px-2 text-muted cursor-pointer">Cambiar</button>
                </div>
              </div>
            )}
          </div>
        )}
        {mode === 'link' && (
          <div className="mt-3 space-y-2 text-[13px]">
            <p className="text-muted">Unila solo si tenés a la persona enfrente y te muestra su app. Así nadie ve deudas ni historia de otro.</p>
            <select value={linkUid} onChange={(e) => setLinkUid(e.target.value)} className={field} aria-label="Cuenta de la app">
              <option value="">Elegí el jugador de la app</option>
              {linkable.map((m) => (
                <option key={m.uid} value={m.uid}>
                  {m.displayName} · {formatCategory(m.category)}
                </option>
              ))}
            </select>
            <button type="button" disabled={busy || !linkUid} onClick={() => run(async () => { await linkClientToUser(club, client, linkUid, 'mostrador', { consumptions, bookings, packs: allPacks }); setMode(null); }, 'Unida: ahora ve en su app lo que debe y sus cuponeras.')} className={btnSecondary}>
              La tengo enfrente: unir
            </button>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-line bg-white p-3.5">
        <p className="text-xs font-semibold tracking-wider text-muted uppercase">Datos de esta persona</p>
        <p className="mt-1 text-[12.5px] text-muted">Si la persona pide ver o borrar sus datos. El responsable de esta ficha es el club.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Chip
            onClick={() =>
              run(async () => {
                const rows = exportRows();
                downloadBytes(`datos-${client.name.replace(/\s+/g, '-').toLowerCase()}.csv`, toCSV(rows), CSV_MIME);
                await logExport(club, 'datos_persona', staff, rows.length);
              }, 'Bajados. Queda registrado quién los bajó.')
            }
          >
            Bajar sus datos
          </Chip>
          {isOwner && <Chip on={mode === 'erase'} onClick={() => setMode(mode === 'erase' ? null : 'erase')}>Borrar sus datos</Chip>}
        </div>
        {mode === 'erase' && (
          <div className="mt-3 rounded-xl bg-due-bg p-3 text-[13px] text-due">
            {blockers.length ? (
              <p>Antes de borrar, decidí qué pasa con lo pendiente: {blockers.join(', ')}.</p>
            ) : (
              <>
                <p>Se borran nombre, celular, mail y nota. Los cobros quedan como "Cliente borrado" porque el club tiene que conservar su contabilidad. No se puede deshacer.</p>
                <button type="button" disabled={busy} onClick={() => run(() => eraseClient(club, client), 'Datos borrados.')} className="mt-2 rounded-full bg-due px-3.5 py-1.5 font-semibold text-white cursor-pointer">
                  Sí, borrar sus datos
                </button>
              </>
            )}
          </div>
        )}
      </div>
      <ClientLineFooter client={client} />
    </div>
  );
};

const ClientLineFooter: React.FC<{ client: ClubClient }> = ({ client }) => (
  <p className="text-[12px] text-muted">
    Alta el {dmyFull(client.createdOn)} por {client.createdByName || 'el sistema'}
    {client.linkedBy ? ` · unida a la app por ${client.linkedBy === 'mail' ? 'mail verificado' : client.linkedBy === 'qr' ? 'QR' : 'el encargado'}` : ''}.
  </p>
);

export { ClientLine };
