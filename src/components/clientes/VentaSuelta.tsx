/**
 * W4. Venta suelta sin turno: cantina, cuponeras y saldo, clases, torneos, alquiler y otros.
 * "Sin nombre" sirve para el agua del que pasa; para fiar o vender una cuponera hace falta la ficha.
 */
import React, { useMemo, useState } from 'react';
import { Minus, Plus, X } from 'lucide-react';
import type { Club, ClubMembership, Tournament } from '../../types/padel';
import type { Product } from '../../types/caja';
import type { ClubClient, PackType, Rubro } from '../../types/clientes';
import { formatUYU } from '../../lib/padelUtils';
import { VALIDITY_LABEL } from '../../lib/clientes';
import { loadBalance, sellPack, ventaSuelta, type SaleItem } from '../../services/clientesService';
import type { Staff } from '../../services/cajaService';
import type { CounterPaymentMethod } from '../../services/firestoreService';
import { btnPrimary } from '../caja/ops';
import { Chip, ClientLine, useClientes } from './data';
import { ClientPicker } from './ClientPicker';
import { ProductIcon } from '../mostrador/ProductIcon';

export type VentaTab = Tab;
type Tab = 'cantina' | 'cuponeras' | 'clases' | 'torneos' | 'alquiler' | 'otros';
type Method = CounterPaymentMethod | 'saldo' | 'cuenta';

const TABS: [Tab, string][] = [
  ['cantina', 'Cantina'],
  ['cuponeras', 'Cuponeras y saldo'],
  ['clases', 'Clases'],
  ['torneos', 'Torneos'],
  ['alquiler', 'Alquiler'],
  ['otros', 'Otros'],
];

const isRental = (p: Product) => /^alquiler/i.test(p.name);
const digits = (s: string) => Number(s.replace(/\D/g, '')) || 0;

interface CartLine extends SaleItem {
  key: string;
}

export const VentaSuelta: React.FC<{
  club: Club;
  memberships: ClubMembership[];
  products: Product[];
  tournaments: Tournament[];
  staff: Staff;
  today: string;
  closed: boolean;
  busy: boolean;
  run: (fn: () => Promise<unknown>, msg: string) => Promise<void>;
  debtOf?: (c: ClubClient) => number;
  /** Pestañas que se muestran (la cantina ve solo cantina, alquiler y otros). */
  tabs?: Tab[];
  /** Cantina: productos como botones grandes con foto y precio; arranca en "Sin nombre". */
  tiles?: boolean;
  /** Si hay una cancha elegida, tocar un producto lo carga a esa cancha en vez de sumarlo a la venta. */
  target?: { label: string; onPick: (p: Product) => void; onClear: () => void } | null;
}> = ({ club, memberships, products, tournaments, staff, today, closed, busy, run, debtOf, tabs, tiles, target }) => {
  const { packTypes, clients } = useClientes();
  const [clientId, setClientId] = useState<string | null>(null);
  const [anon, setAnon] = useState(!!tiles);
  const [tab, setTab] = useState<Tab>('cantina');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [pack, setPack] = useState<PackType | null>(null);
  const [load, setLoad] = useState<{ amount: string; credit: string } | null>(null);
  const [free, setFree] = useState({ concept: '', price: '' });
  const [method, setMethod] = useState<Method>('efectivo');
  const client = clients.find((c) => c.id === clientId) ?? null;

  const qtyOf = (k: string) => cart.find((l) => l.key === k)?.qty ?? 0;
  const bump = (p: Product, rubro: Rubro, d: number) =>
    setCart((prev) => {
      const k = `p:${p.id}:${rubro}`;
      const cur = prev.find((l) => l.key === k);
      if (!cur) return d > 0 ? [...prev, { key: k, rubro, concept: p.name, qty: 1, unitPrice: p.price, product: p }] : prev;
      const qty = Math.max(0, cur.qty + d);
      return qty ? prev.map((l) => (l.key === k ? { ...l, qty } : l)) : prev.filter((l) => l.key !== k);
    });
  const addFree = (rubro: Rubro) => {
    const price = digits(free.price);
    if (!free.concept.trim() || price <= 0) return;
    setCart((prev) => [...prev, { key: `f:${Date.now()}`, rubro, concept: free.concept.trim(), qty: 1, unitPrice: price }]);
    setFree({ concept: '', price: '' });
  };

  const cartTotal = cart.reduce((a, l) => a + l.qty * l.unitPrice, 0);
  const packTotal = pack ? pack.price : 0;
  const loadAmount = load ? digits(load.amount) : 0;
  const loadCredit = load ? digits(load.credit) || loadAmount : 0;
  const total = cartTotal + packTotal + loadAmount;
  const balance = client?.balance ?? 0;

  const methods = useMemo(() => {
    const list: [Method, string, boolean][] = [
      ['efectivo', 'Efectivo', true],
      ['transferencia', 'Transferencia', true],
      ['debito_club', 'Tarjeta', true],
      ['mercadopago', 'Mercado Pago', true],
    ];
    if (client) {
      list.push(['saldo', `Saldo a favor (${formatUYU(balance)})`, !loadAmount && balance >= total && total > 0]);
      list.push(['cuenta', 'A su cuenta', !pack && !loadAmount]);
    }
    return list;
  }, [client, balance, total, pack, loadAmount]);
  const methodOk = methods.find((m) => m[0] === method)?.[2] ?? false;

  const reset = () => {
    setCart([]);
    setPack(null);
    setLoad(null);
    setMethod('efectivo');
  };

  const cobrar = () =>
    run(async () => {
      if (pack && client) await sellPack({ club, client, packType: pack, method: method as CounterPaymentMethod | 'saldo', staff, day: today, afterClose: closed });
      if (loadAmount && client) await loadBalance({ club, client, amount: loadAmount, credit: loadCredit, method: method as CounterPaymentMethod, staff, day: today, afterClose: closed });
      if (cart.length) await ventaSuelta({ club, client, items: cart, method, staff, day: today, afterClose: closed });
      reset();
    }, method === 'cuenta' ? `Queda a la cuenta de ${client?.name.split(' ')[0]}: ${formatUYU(total)}.` : `Venta cobrada: ${formatUYU(total)}.`);

  const cantina = products.filter((p) => !isRental(p));
  const rentals = products.filter(isRental);

  return (
    <div className="mt-4 space-y-3" data-testid="venta-suelta">
      {/* Cliente */}
      {client ? (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-line bg-white px-3 py-2.5">
          <ClientLine name={client.name} phone={client.phone} category={client.category} hasApp={!!client.uid} extra={client.balance > 0 ? ` · saldo ${formatUYU(client.balance)}` : null} />
          <button type="button" onClick={() => { setClientId(null); setAnon(false); setPack(null); setLoad(null); setMethod('efectivo'); }} className="shrink-0 rounded-full border border-line px-3 py-1.5 text-[12.5px] font-semibold text-ink cursor-pointer">
            Cambiar · Sin nombre
          </button>
        </div>
      ) : anon ? (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-line bg-white px-3 py-2.5 text-sm">
          <span className="font-semibold text-ink">Sin nombre <span className="font-normal text-muted">· se cobra en el momento</span></span>
          <button type="button" onClick={() => setAnon(false)} className="shrink-0 rounded-full border border-line px-3 py-1.5 text-[12.5px] font-semibold cursor-pointer">
            Elegir cliente
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <ClientPicker club={club} memberships={memberships} staff={staff} today={today} origin="mostrador" debtOf={debtOf} onPick={(c) => setClientId(c.id)} />
          <button type="button" onClick={() => setAnon(true)} className="w-full rounded-xl bg-mist px-3.5 py-2.5 text-left text-sm font-semibold text-ink cursor-pointer">
            Sin nombre (el agua del que pasa)
          </button>
        </div>
      )}

      {(client || anon) && (
        <>
          <div className="flex flex-wrap gap-1.5">
            {TABS.filter(([id]) => !tabs || tabs.includes(id)).map(([id, label]) => (
              <Chip key={id} on={tab === id} onClick={() => setTab(id)} disabled={!client && id === 'cuponeras'}>
                {label}
              </Chip>
            ))}
          </div>

          {tiles && target && (tab === 'cantina' || tab === 'alquiler') && (
            <div className="flex items-center justify-between gap-3 rounded-xl bg-live-fill px-3.5 py-2.5 text-[13.5px] text-ink">
              <span>
                Tocá un producto para cargarlo a <b>{target.label}</b>
              </span>
              <button type="button" onClick={target.onClear} className="shrink-0 rounded-lg bg-white px-3 py-1.5 text-[13px] font-semibold cursor-pointer hover:bg-mist">
                Volver a vender
              </button>
            </div>
          )}
          {tiles && (tab === 'cantina' || tab === 'alquiler') && (
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4">
              {(tab === 'cantina' ? cantina : rentals).length === 0 && <p className="col-span-full rounded-xl bg-mist px-3 py-3 text-[13px] text-muted">{tab === 'cantina' ? 'El club todavía no cargó productos (Admin, Cantina).' : 'No hay productos de alquiler. Se cargan en Admin, Cantina, con un nombre que empiece con "Alquiler".'}</p>}
              {(tab === 'cantina' ? cantina : rentals).map((p) => {
                const rubro: Rubro = tab === 'cantina' ? 'cantina' : 'alquiler';
                const q = qtyOf(`p:${p.id}:${rubro}`);
                const out = p.stock !== null && p.stock <= 0;
                return (
                  <div key={p.id} className="relative">
                    <button
                      type="button"
                      disabled={out || busy}
                      aria-label={`${target ? `Cargar a ${target.label}` : 'Sumar'} ${p.name}`}
                      onClick={() => (target ? target.onPick(p) : bump(p, rubro, 1))}
                      className={`flex w-full flex-col overflow-hidden rounded-xl border bg-white text-left transition-shadow cursor-pointer disabled:cursor-not-allowed disabled:opacity-45 ${
                        q > 0 && !target ? 'border-2 border-emerald-600' : 'border-line hover:shadow-[0_0_0_2px_var(--color-line)]'
                      }`}
                    >
                      <span className="grid aspect-[16/10] w-full place-items-center bg-mist">
                        {p.photoUrl ? (
                          <img src={p.photoUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <ProductIcon product={p} size={52} className="bg-white" />
                        )}
                      </span>
                      <span className="flex items-end justify-between gap-2 px-3 pt-2 pb-2.5">
                        <span className="min-w-0">
                          <span className="block truncate text-[14px] leading-tight font-semibold text-ink">{p.name}</span>
                          {p.stock !== null && (
                            <span className={`text-[11.5px] ${out || p.stock <= p.minStock ? 'font-bold text-due' : 'text-muted'}`}>{out ? 'sin stock' : `quedan ${p.stock}`}</span>
                          )}
                        </span>
                        <span className="shrink-0 font-display text-lg font-bold text-brand tabular-nums">{formatUYU(p.price)}</span>
                      </span>
                    </button>
                    {q > 0 && !target && (
                      <>
                        <span className="pointer-events-none absolute top-2 right-2 grid h-8 min-w-8 place-items-center rounded-full bg-action px-2 text-sm font-bold text-on-action shadow">{q}</span>
                        <button
                          type="button"
                          aria-label={`Menos ${p.name}`}
                          onClick={() => bump(p, rubro, -1)}
                          className="absolute top-2 left-2 grid h-8 w-8 place-items-center rounded-full bg-white text-ink shadow cursor-pointer hover:bg-mist"
                        >
                          <Minus className="h-4 w-4" />
                        </button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {!tiles && (tab === 'cantina' || tab === 'alquiler') && (
            <ul className="rounded-xl border border-line bg-white px-3">
              {(tab === 'cantina' ? cantina : rentals).length === 0 && <li className="py-3 text-[13px] text-muted">{tab === 'cantina' ? 'El club todavía no cargó productos (Admin, Cantina).' : 'No hay productos de alquiler. Se cargan en Admin, Cantina, con un nombre que empiece con "Alquiler". También podés cargarlo en "Otros".'}</li>}
              {(tab === 'cantina' ? cantina : rentals).map((p) => {
                const rubro: Rubro = tab === 'cantina' ? 'cantina' : 'alquiler';
                const k = `p:${p.id}:${rubro}`;
                return (
                  <li key={p.id} className="flex items-center gap-2.5 border-b border-[#eef5f5] py-1.5 last:border-0">
                    <ProductIcon product={p} size={32} className="bg-mist" />
                    <span className="min-w-0 flex-1 truncate text-sm text-ink">
                      {p.name} <span className="text-muted tabular-nums">{formatUYU(p.price)}</span>
                      {p.stock !== null && <span className={`ml-1 text-[11px] ${p.stock <= p.minStock ? 'font-bold text-due' : 'text-muted'}`}>quedan {p.stock}</span>}
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <button type="button" aria-label={`Menos ${p.name}`} onClick={() => bump(p, rubro, -1)} className="grid h-8 w-8 place-items-center rounded-lg border border-line cursor-pointer">
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="w-5 text-center text-sm font-semibold tabular-nums">{qtyOf(k)}</span>
                      <button type="button" aria-label={`Más ${p.name}`} onClick={() => bump(p, rubro, 1)} className="grid h-8 w-8 place-items-center rounded-lg border border-line cursor-pointer">
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          {tab === 'cuponeras' && client && (
            <div className="space-y-2">
              <ul className="rounded-xl border border-line bg-white px-3.5">
                {packTypes.filter((t) => t.active).length === 0 && <li className="py-3 text-[13px] text-muted">El club todavía no armó cuponeras (Admin, Cuponeras).</li>}
                {packTypes
                  .filter((t) => t.active)
                  .map((t) => (
                    <li key={t.id} className="flex items-center justify-between gap-2 border-b border-[#eef5f5] py-2.5 last:border-0">
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-ink">{t.name}</span>
                        <span className="block text-[12px] text-muted">
                          {t.days} días · {t.unit === 'turno' ? 'turnos completos' : 'partes de un jugador'} · {VALIDITY_LABEL[t.validity]}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => { setPack(pack?.id === t.id ? null : t); if (method === 'cuenta') setMethod('efectivo'); }}
                        className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-bold tabular-nums cursor-pointer ${pack?.id === t.id ? 'bg-brand text-white' : 'border border-line bg-white text-ink'}`}
                      >
                        {formatUYU(t.price)}
                      </button>
                    </li>
                  ))}
                <li className="flex items-center justify-between gap-2 py-2.5">
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-ink">Cargar saldo</span>
                    <span className="block text-[12px] text-muted">{load ? `${formatUYU(loadAmount)} y le quedan ${formatUYU(loadCredit)}` : 'Paga cancha, cantina o cuponera después'}</span>
                  </span>
                  <button type="button" onClick={() => setLoad(load ? null : { amount: '5000', credit: '' })} className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-bold cursor-pointer ${load ? 'bg-brand text-white' : 'border border-line bg-white text-ink'}`}>
                    {load ? formatUYU(loadAmount) : 'Cargar'}
                  </button>
                </li>
              </ul>
              {load && (
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-[12px] font-semibold text-ink">
                    Paga
                    <input inputMode="numeric" value={load.amount} onChange={(e) => setLoad({ ...load, amount: e.target.value.replace(/\D/g, '') })} className="mt-1 w-full rounded-xl border border-line px-3 py-2 text-sm tabular-nums" />
                  </label>
                  <label className="text-[12px] font-semibold text-ink">
                    Le quedan (si el club regala extra)
                    <input inputMode="numeric" placeholder={load.amount} value={load.credit} onChange={(e) => setLoad({ ...load, credit: e.target.value.replace(/\D/g, '') })} className="mt-1 w-full rounded-xl border border-line px-3 py-2 text-sm tabular-nums" />
                  </label>
                </div>
              )}
            </div>
          )}

          {(tab === 'clases' || tab === 'torneos' || tab === 'otros') && (
            <div className="space-y-2 rounded-xl border border-line bg-white p-3">
              {tab === 'torneos' && tournaments.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {tournaments.slice(0, 4).map((t) => (
                    <Chip key={t.id} onClick={() => setFree({ concept: `Inscripción ${t.name}`, price: String(t.entryFee || '') })}>
                      {t.name}
                    </Chip>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-[1fr_110px] gap-2">
                <input
                  value={free.concept}
                  onChange={(e) => setFree({ ...free, concept: e.target.value })}
                  placeholder={tab === 'clases' ? 'Clase con… (nombre del profe)' : tab === 'torneos' ? 'Inscripción a…' : 'Qué es'}
                  aria-label="Concepto"
                  className="rounded-xl border border-line px-3 py-2 text-sm"
                />
                <input inputMode="numeric" value={free.price} onChange={(e) => setFree({ ...free, price: e.target.value.replace(/\D/g, '') })} placeholder="$" aria-label="Precio" className="rounded-xl border border-line px-3 py-2 text-right text-sm tabular-nums" />
              </div>
              <button type="button" onClick={() => addFree(tab)} disabled={!free.concept.trim() || !digits(free.price)} className="w-full rounded-xl bg-mist py-2 text-[13px] font-semibold text-brand disabled:opacity-50 cursor-pointer">
                Agregar
              </button>
              {tab === 'clases' && <p className="text-[11.5px] text-muted">Las clases con agenda y profes llegan en fase 2. Por ahora se venden sueltas.</p>}
            </div>
          )}

          {/* Lo que lleva */}
          {(cart.length > 0 || pack || load) && (
            <div className="rounded-xl border border-line bg-white px-3.5 py-1">
              {cart.map((l) => (
                <div key={l.key} className="flex items-center justify-between gap-2 border-b border-[#eef5f5] py-2 text-sm">
                  <span className="min-w-0 truncate">
                    {l.qty > 1 ? `${l.qty} ` : ''}
                    {l.concept} <span className="text-muted">· {TABS.find((t) => t[0] === l.rubro)?.[1] ?? l.rubro}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5 tabular-nums">
                    {formatUYU(l.qty * l.unitPrice)}
                    <button type="button" aria-label={`Quitar ${l.concept}`} onClick={() => setCart((p) => p.filter((x) => x.key !== l.key))} className="grid h-6 w-6 place-items-center rounded-md text-muted hover:bg-mist cursor-pointer">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </span>
                </div>
              ))}
              {pack && <Line label={`Cuponera: ${pack.name}`} amount={pack.price} onRemove={() => setPack(null)} />}
              {load && <Line label="Carga de saldo" amount={loadAmount} onRemove={() => setLoad(null)} />}
              <div className="flex justify-between py-2.5 text-[15px] font-bold text-ink">
                <span>Total</span>
                <span className="tabular-nums">{formatUYU(total)}</span>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-1.5">
            {methods.map(([id, label, ok]) => (
              <Chip key={id} on={method === id} disabled={!ok} onClick={() => setMethod(id)}>
                {label}
              </Chip>
            ))}
          </div>
          {closed && <p className="rounded-xl bg-wait-bg px-3 py-2 text-[12.5px] text-wait">La caja de hoy ya está cerrada: queda como cobrado después del cierre.</p>}
          <button type="button" disabled={busy || total <= 0 || !methodOk} onClick={cobrar} className={`${btnPrimary} bg-action! text-on-action! hover:brightness-95`}>
            {method === 'cuenta' ? `Anotar ${formatUYU(total)} a su cuenta` : `Cobrar ${formatUYU(total)}`}
          </button>
          <p className="text-[12px] text-muted">"Sin nombre" sirve para el agua del que pasa. Para fiar o vender una cuponera hace falta la ficha.</p>
        </>
      )}
    </div>
  );
};

const Line: React.FC<{ label: string; amount: number; onRemove: () => void }> = ({ label, amount, onRemove }) => (
  <div className="flex items-center justify-between gap-2 border-b border-[#eef5f5] py-2 text-sm">
    <span className="min-w-0 truncate">{label}</span>
    <span className="flex shrink-0 items-center gap-1.5 tabular-nums">
      {formatUYU(amount)}
      <button type="button" aria-label={`Quitar ${label}`} onClick={onRemove} className="grid h-6 w-6 place-items-center rounded-md text-muted hover:bg-mist cursor-pointer">
        <X className="h-3.5 w-3.5" />
      </button>
    </span>
  </div>
);
