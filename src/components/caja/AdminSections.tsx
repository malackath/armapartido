/** Secciones del Admin: Cantina (productos y stock), Seña en pico, Turnos fijos, Cierres de caja e Informe mensual. */
import React, { useMemo, useState } from 'react';
import { Mail, X } from 'lucide-react';
import type { Booking, Club, ClubMembership, Court, ProposedMatch, UserProfile } from '../../types/padel';
import type { DepositRule, MonthlyReport, Product } from '../../types/caja';
import { addDaysISO, formatMinutes, formatUYU, generateDaySlots, getDayOfWeekFromISO, getTodayISO } from '../../lib/padelUtils';
import { computeMonthlyReport, monthLabel, monthOf, previousMonth } from '../../lib/caja';
import { buildMonthlyReportEmail, monthlyReportSubject } from '../../lib/informeMail';
import {
  adjustStock,
  createFixedBooking,
  DEFAULT_DEPOSIT,
  endFixedBooking,
  saveDepositRule,
  saveProduct,
  saveReportEmails,
} from '../../services/cajaService';
import { Card, Hint, Row, inputCls, labelCls, useOps } from './ops';
import { CatalogPicker } from './CatalogPicker';
import { CATALOG } from '../../lib/catalogo';
import { useClientes } from '../clientes/data';

type Run = (fn: () => Promise<unknown>, msg: string) => Promise<void>;
const useRun = (onToast: (m: string) => void) => {
  const [busy, setBusy] = useState(false);
  const run: Run = async (fn, msg) => {
    setBusy(true);
    try {
      await fn();
      onToast(msg);
    } catch {
      onToast('No se pudo guardar. Probá de nuevo.');
    } finally {
      setBusy(false);
    }
  };
  return { busy, run };
};

const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const DAYS_LONG = ['domingos', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados'];
const num = (v: string) => Number(v.replace(/\D/g, '')) || 0;

// ======================= Cantina =======================

export const CantinaAdmin: React.FC<{ club: Club; onToast: (m: string) => void }> = ({ club, onToast }) => {
  const { products, consumptions } = useOps();
  const { busy, run } = useRun(onToast);
  const [editing, setEditing] = useState<Product | null>(null);
  const [draft, setDraft] = useState({ name: '', price: '', stock: '', min: '', tracks: true });
  const [restock, setRestock] = useState<Record<string, string> | null>(null);
  const [catalogOpen, setCatalogOpen] = useState(products.length === 0);
  const fromCatalog = products.filter((p) => p.active && p.catalogId).length;
  const low = products.filter((p) => p.active && p.stock !== null && p.stock <= p.minStock);

  const sold30 = useMemo(() => {
    const from = addDaysISO(getTodayISO(), -30);
    const m = new Map<string, number>();
    consumptions.filter((c) => c.status !== 'voided' && c.date >= from).forEach((c) => m.set(c.productId, (m.get(c.productId) ?? 0) + c.qty));
    return m;
  }, [consumptions]);

  const startNew = () => {
    setEditing({ id: '', clubId: club.id, name: '', price: 0, stock: 0, minStock: 0, active: true, order: Date.now() });
    setDraft({ name: '', price: '', stock: '', min: '', tracks: true });
  };
  const startEdit = (p: Product) => {
    setEditing(p);
    setDraft({ name: p.name, price: String(p.price), stock: p.stock === null ? '' : String(p.stock), min: String(p.minStock), tracks: p.stock !== null });
  };
  const save = () =>
    run(async () => {
      if (!editing) return;
      await saveProduct(club, {
        ...(editing.id ? { id: editing.id } : {}),
        name: draft.name,
        price: num(draft.price),
        stock: draft.tracks ? num(draft.stock) : null,
        minStock: draft.tracks ? num(draft.min) : 0,
        active: editing.active,
        order: editing.order,
      });
      setEditing(null);
    }, editing?.id ? 'Producto guardado.' : 'Producto agregado.');

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[1.4fr_1fr]">
      <div className="xl:col-span-2">
        <Card
          title="Catálogo de productos"
          action={
            <button type="button" onClick={() => setCatalogOpen((v) => !v)} className="rounded-xl border border-line px-3 py-2 text-[13px] font-semibold text-ink hover:bg-mist cursor-pointer">
              {catalogOpen ? 'Cerrar' : 'Elegir del catálogo'}
            </button>
          }
        >
          {catalogOpen ? (
            <CatalogPicker club={club} products={products} busy={busy} run={run} onDone={() => setCatalogOpen(false)} />
          ) : (
            <p className="text-[13px] text-muted">
              Vendés {fromCatalog} de los {CATALOG.length} productos típicos de un club. Tocá "Elegir del catálogo" para sumar o sacar y poner precios.
            </p>
          )}
        </Card>
      </div>
      <Card
        title="Productos"
        action={
          <div className="flex gap-2">
            <button type="button" onClick={() => setRestock(restock ? null : {})} className="rounded-xl border border-line px-3 py-2 text-[13px] font-semibold text-ink hover:bg-mist cursor-pointer">
              {restock ? 'Cancelar' : 'Entró mercadería'}
            </button>
            <button type="button" onClick={startNew} className="rounded-xl bg-brand px-3 py-2 text-[13px] font-semibold text-white cursor-pointer">
              + Agregar
            </button>
          </div>
        }
      >
        {low.length > 0 && (
          <p className="mb-3 rounded-xl border-l-4 border-[#f97316] bg-wait-bg px-3 py-2 text-[13px] text-wait">
            {low.length} {low.length === 1 ? 'producto por acabarse' : 'productos por acabarse'}: {low.map((p) => `${p.name} (${p.stock})`).join(', ')}
          </p>
        )}
        {products.length === 0 ? (
          <p className="text-sm text-muted">Todavía no hay productos. Agregá agua, bebidas, pelotas o alquiler de paleta.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs text-muted">
                  <th className="py-2 pr-3 font-semibold">Producto</th>
                  <th className="py-2 pr-3 text-right font-semibold">Precio</th>
                  <th className="py-2 pr-3 text-right font-semibold">Quedan</th>
                  <th className="py-2 pr-3 text-right font-semibold">Avisar en</th>
                  <th className="py-2 pr-3 text-right font-semibold">Vendidos 30 días</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {products.map((p) => {
                  const isLow = p.stock !== null && p.stock <= p.minStock;
                  return (
                    <tr key={p.id} className={`border-b border-[#eef5f5] last:border-0 ${p.active ? '' : 'opacity-50'}`}>
                      <td className="py-2.5 pr-3 font-semibold text-ink">
                        {p.name}
                        {!p.active && <span className="ml-1 text-xs font-normal text-muted">(oculto)</span>}
                      </td>
                      <td className="py-2.5 pr-3 text-right tabular-nums">{formatUYU(p.price)}</td>
                      <td className={`py-2.5 pr-3 text-right tabular-nums ${isLow ? 'font-bold text-red-700' : ''}`}>
                        {restock && p.stock !== null ? (
                          <input
                            inputMode="numeric"
                            placeholder="+0"
                            value={restock[p.id] ?? ''}
                            onChange={(e) => setRestock({ ...restock, [p.id]: e.target.value.replace(/[^\d-]/g, '') })}
                            className="w-16 rounded-lg border border-line px-2 py-1 text-right"
                            aria-label={`Sumar stock de ${p.name}`}
                          />
                        ) : p.stock === null ? (
                          <span className="text-muted">no se cuenta</span>
                        ) : (
                          p.stock
                        )}
                      </td>
                      <td className="py-2.5 pr-3 text-right tabular-nums text-muted">{p.stock === null ? '—' : p.minStock}</td>
                      <td className="py-2.5 pr-3 text-right tabular-nums text-muted">{sold30.get(p.id) ?? 0}</td>
                      <td className="py-2.5 text-right whitespace-nowrap">
                        <button type="button" onClick={() => startEdit(p)} className="text-[13px] font-semibold text-emerald-700 hover:underline cursor-pointer">
                          Editar
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => run(() => saveProduct(club, { ...p, active: !p.active }), p.active ? `${p.name} oculto del Mostrador.` : `${p.name} visible otra vez.`)}
                          className="ml-3 text-[13px] text-muted hover:underline cursor-pointer"
                        >
                          {p.active ? 'Ocultar' : 'Mostrar'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {restock && (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              run(async () => {
                await adjustStock(club, Object.entries(restock).map(([productId, v]) => ({ productId, qty: Number(v) || 0 })));
                setRestock(null);
              }, 'Stock actualizado.')
            }
            className="mt-3 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white cursor-pointer"
          >
            Sumar al stock
          </button>
        )}
        <Hint>Sin mesas, sin cocina, sin recetas. Un producto es nombre, precio y, si querés, cuántos hay. Lo que se vende en el Mostrador descuenta solo. Para corregir (se rompió, se venció) poné un número negativo en "Entró mercadería".</Hint>
      </Card>

      {editing && (
        <Card title={editing.id ? `Editar ${editing.name}` : 'Producto nuevo'} action={<button type="button" aria-label="Cerrar" onClick={() => setEditing(null)} className="text-muted cursor-pointer"><X className="h-4 w-4" /></button>}>
          <div className="grid grid-cols-2 gap-3">
            <label className={`${labelCls} col-span-2`}>
              Nombre
              <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Agua 500 ml" className={inputCls} />
            </label>
            <label className={labelCls}>
              Precio
              <input inputMode="numeric" value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} placeholder="$" className={inputCls} />
            </label>
            <label className="col-span-2 flex items-center gap-2 text-[13px] font-semibold text-ink">
              <input type="checkbox" checked={draft.tracks} onChange={(e) => setDraft({ ...draft, tracks: e.target.checked })} />
              Llevar la cuenta de cuántos quedan
            </label>
            {draft.tracks && (
              <>
                <label className={labelCls}>
                  Cuántos hay
                  <input inputMode="numeric" value={draft.stock} onChange={(e) => setDraft({ ...draft, stock: e.target.value })} className={inputCls} />
                </label>
                <label className={labelCls}>
                  Avisar cuando queden
                  <input inputMode="numeric" value={draft.min} onChange={(e) => setDraft({ ...draft, min: e.target.value })} className={inputCls} />
                </label>
              </>
            )}
          </div>
          <button type="button" disabled={busy || !draft.name.trim() || num(draft.price) <= 0} onClick={save} className="mt-4 w-full rounded-xl bg-brand py-3 text-sm font-semibold text-white disabled:opacity-50 cursor-pointer">
            Guardar
          </button>
        </Card>
      )}
    </div>
  );
};

// ======================= Seña en pico =======================

export const DepositCard: React.FC<{ club: Club; onToast: (m: string) => void }> = ({ club, onToast }) => {
  const { busy, run } = useRun(onToast);
  const [rule, setRule] = useState<DepositRule>(club.deposit ?? DEFAULT_DEPOSIT);
  const saved = JSON.stringify(club.deposit ?? DEFAULT_DEPOSIT) === JSON.stringify(rule);
  const hours = Array.from({ length: club.closeHour - club.openHour + 1 }, (_, i) => club.openHour + i);
  return (
    <Card
      title="Seña en horario pico"
      action={
        <button
          type="button"
          role="switch"
          aria-checked={rule.enabled}
          aria-label="Pedir seña para reservar"
          onClick={() => setRule({ ...rule, enabled: !rule.enabled })}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors cursor-pointer ${rule.enabled ? 'bg-emerald-600' : 'bg-slate-300'}`}
        >
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${rule.enabled ? 'left-[22px]' : 'left-0.5'}`} />
        </button>
      }
    >
      <p className="text-[13px] text-muted">
        {rule.enabled
          ? 'En estos horarios, para reservar desde la app hay que pagar una seña por Mercado Pago. Se descuenta de lo que paga ese jugador.'
          : 'Apagada: la reserva sigue siendo gratis y se paga en el club. Prendela si tenés plantones en las horas pico.'}
      </p>
      <div className={`mt-4 space-y-3 ${rule.enabled ? '' : 'pointer-events-none opacity-50'}`}>
        <div>
          <p className={labelCls}>Qué días</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {DAYS.map((d, i) => {
              const on = rule.days.includes(i);
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setRule({ ...rule, days: on ? rule.days.filter((x) => x !== i) : [...rule.days, i].sort() })}
                  className={`rounded-full border px-3 py-1 text-[13px] font-semibold cursor-pointer ${on ? 'border-brand bg-brand text-white' : 'border-line bg-white text-ink'}`}
                >
                  {d}
                </button>
              );
            })}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className={labelCls}>
            Desde
            <select value={rule.fromHour} onChange={(e) => setRule({ ...rule, fromHour: Number(e.target.value) })} className={inputCls}>
              {hours.map((h) => (
                <option key={h} value={h}>{h}:00</option>
              ))}
            </select>
          </label>
          <label className={labelCls}>
            Hasta
            <select value={rule.toHour} onChange={(e) => setRule({ ...rule, toHour: Number(e.target.value) })} className={inputCls}>
              {hours.map((h) => (
                <option key={h} value={h}>{h}:00</option>
              ))}
            </select>
          </label>
          <label className={labelCls}>
            Cuánto
            <input inputMode="numeric" value={rule.amount} onChange={(e) => setRule({ ...rule, amount: num(e.target.value) })} className={inputCls} />
          </label>
          <label className={labelCls}>
            Plazo para pagarla
            <select value={rule.holdMinutes} onChange={(e) => setRule({ ...rule, holdMinutes: Number(e.target.value) })} className={inputCls}>
              {[10, 15, 20, 30].map((m) => (
                <option key={m} value={m}>{m} minutos</option>
              ))}
            </select>
          </label>
        </div>
        <div className="rounded-xl border border-line px-3.5 py-1 text-[13px]">
          <Row label="Si cancela con tiempo" value={`se le devuelve (${club.cancellationHours} h antes o más)`} />
          <Row label="Si cancela tarde o no viene" value="queda para el club" />
          <Row label="Si el club cancela (lluvia, luz)" value="se le devuelve" />
        </div>
      </div>
      <button
        type="button"
        disabled={busy || saved}
        onClick={() => run(() => saveDepositRule(club, rule), rule.enabled ? 'Seña en pico guardada.' : 'Seña apagada.')}
        className="mt-4 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40 cursor-pointer"
      >
        {saved ? 'Sin cambios' : 'Guardar seña'}
      </button>
      <Hint>Se paga con Mercado Pago. Mientras no esté conectada la cuenta de Mercado Pago del club, el cobro es de prueba. Por teléfono, el encargado la cobra a mano si quiere.</Hint>
    </Card>
  );
};

// ======================= Turnos fijos =======================

export const FixedAdmin: React.FC<{ club: Club; courts: Court[]; bookings: Booking[]; userProfile: UserProfile; onToast: (m: string) => void }> = ({ club, courts, bookings, userProfile, onToast }) => {
  const { fixed } = useOps();
  const { busy, run } = useRun(onToast);
  const today = getTodayISO();
  const slots = generateDaySlots(club);
  const active = courts.filter((c) => c.active);
  const [form, setForm] = useState({ name: '', phone: '', courtId: active[0]?.id ?? '', dow: 2, start: slots.find((s) => s.startMinute >= 20 * 60)?.startMinute ?? slots[0]?.startMinute ?? 0, weeks: 12 });
  const [result, setResult] = useState<{ created: number; skipped: string[] } | null>(null);
  const firstDate = useMemo(() => {
    let d = today;
    for (let i = 0; i < 7 && getDayOfWeekFromISO(d) !== form.dow; i += 1) d = addDaysISO(d, 1);
    return d;
  }, [today, form.dow]);
  const untilDate = addDaysISO(firstDate, (form.weeks - 1) * 7);
  const list = [...fixed].sort((a, b) => Number(b.active) - Number(a.active) || a.dayOfWeek - b.dayOfWeek || a.startMinute - b.startMinute);

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[1.3fr_1fr]">
      <Card title="Turnos fijos del club">
        {list.length === 0 ? (
          <p className="text-sm text-muted">Todavía no hay turnos fijos. Son las reservas que se repiten todas las semanas (el martes a las 20 de siempre).</p>
        ) : (
          <ul>
            {list.map((f) => {
              const upcoming = bookings.filter((b) => f.bookingIds.includes(b.id) && b.date >= today && b.status === 'confirmed').length;
              return (
                <li key={f.id} className={`flex items-center justify-between gap-3 border-b border-[#eef5f5] py-3 last:border-0 ${f.active ? '' : 'opacity-50'}`}>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-ink">{f.holderName}{f.phone ? ` · ${f.phone}` : ''}</span>
                    <span className="block text-[12.5px] text-muted">
                      Los {DAYS_LONG[f.dayOfWeek]} a las {formatMinutes(f.startMinute)} · {f.courtName} · {f.active ? `hasta el ${f.untilDate.split('-').reverse().slice(0, 2).join('/')} · quedan ${upcoming}` : 'terminado'}
                    </span>
                  </span>
                  {f.active && (
                    <button type="button" disabled={busy} onClick={() => run(() => endFixedBooking(club, f, bookings, today), `Turno fijo de ${f.holderName} terminado. Se liberaron sus próximas reservas.`)} className="shrink-0 text-[13px] font-semibold text-red-700 hover:underline cursor-pointer">
                      Terminar
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <Hint>Cada semana es una reserva común: se cobra turno por turno en el Mostrador. Los abonos y el cobro por mes llegan más adelante.</Hint>
      </Card>

      <Card title="Nuevo turno fijo">
        <div className="grid grid-cols-2 gap-3">
          <label className={`${labelCls} col-span-2`}>
            A nombre de
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nombre y apellido" className={inputCls} />
          </label>
          <label className={`${labelCls} col-span-2`}>
            Celular (opcional)
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="099 123 456" className={inputCls} />
          </label>
          <label className={labelCls}>
            Día
            <select value={form.dow} onChange={(e) => setForm({ ...form, dow: Number(e.target.value) })} className={inputCls}>
              {DAYS_LONG.map((d, i) => (
                <option key={d} value={i}>{d[0].toUpperCase() + d.slice(1)}</option>
              ))}
            </select>
          </label>
          <label className={labelCls}>
            Hora
            <select value={form.start} onChange={(e) => setForm({ ...form, start: Number(e.target.value) })} className={inputCls}>
              {slots.map((s) => (
                <option key={s.startMinute} value={s.startMinute}>{formatMinutes(s.startMinute)}</option>
              ))}
            </select>
          </label>
          <label className={labelCls}>
            Cancha
            <select value={form.courtId} onChange={(e) => setForm({ ...form, courtId: e.target.value })} className={inputCls}>
              {active.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
          <label className={labelCls}>
            Durante
            <select value={form.weeks} onChange={(e) => setForm({ ...form, weeks: Number(e.target.value) })} className={inputCls}>
              {[4, 8, 12, 16, 26].map((w) => (
                <option key={w} value={w}>{w} semanas</option>
              ))}
            </select>
          </label>
        </div>
        <p className="mt-3 text-[13px] text-muted">
          Del {firstDate.split('-').reverse().slice(0, 2).join('/')} al {untilDate.split('-').reverse().slice(0, 2).join('/')}. Si alguna semana la cancha ya está ocupada, se saltea y te avisamos.
        </p>
        <button
          type="button"
          disabled={busy || !form.name.trim() || !form.courtId}
          onClick={() =>
            run(async () => {
              const court = courts.find((c) => c.id === form.courtId)!;
              const r = await createFixedBooking({ club, court, fromDate: firstDate, untilDate, startMinute: form.start, holderName: form.name, phone: form.phone, staff: { uid: userProfile.uid, name: userProfile.displayName }, existing: bookings });
              setResult({ created: r.created.length, skipped: r.skipped });
              setForm({ ...form, name: '', phone: '' });
            }, 'Turno fijo creado.')
          }
          className="mt-4 w-full rounded-xl bg-brand py-3 text-sm font-semibold text-white disabled:opacity-50 cursor-pointer"
        >
          Crear turno fijo
        </button>
        {result && (
          <p className="mt-3 rounded-xl bg-mist px-3 py-2 text-[13px] text-ink">
            Se reservaron {result.created} semanas.
            {result.skipped.length > 0 && ` No se pudieron: ${result.skipped.map((d) => d.split('-').reverse().slice(0, 2).join('/')).join(', ')} (la cancha ya estaba ocupada).`}
          </p>
        )}
      </Card>
    </div>
  );
};

// ======================= Cierres de caja (Admin) =======================

export const CashDaysCard: React.FC = () => {
  const { cashDays } = useOps();
  const list = [...cashDays].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 14);
  return (
    <Card title="Cierres de caja">
      {list.length === 0 ? (
        <p className="text-sm text-muted">Todavía no se abrió ninguna caja. Se abre y se cierra desde el Mostrador.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-muted">
                <th className="py-2 pr-3 font-semibold">Día</th>
                <th className="py-2 pr-3 font-semibold">Quién cerró</th>
                <th className="py-2 pr-3 text-right font-semibold">Total</th>
                <th className="py-2 pr-3 text-right font-semibold">Cantina</th>
                <th className="py-2 pr-3 text-right font-semibold">Diferencia</th>
                <th className="py-2 font-semibold">Nota</th>
              </tr>
            </thead>
            <tbody>
              {list.map((d) => (
                <tr key={d.id} className="border-b border-[#eef5f5] last:border-0">
                  <td className="py-2.5 pr-3 tabular-nums">{d.date.split('-').reverse().slice(0, 2).join('/')}</td>
                  <td className="py-2.5 pr-3">{d.status === 'closed' ? d.closedByName : <span className="font-semibold text-wait">Abierta</span>}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">{d.totals ? formatUYU(d.totals.total ?? 0) : '—'}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">{d.totals ? formatUYU(d.totals.cantina ?? 0) : '—'}</td>
                  <td className={`py-2.5 pr-3 text-right font-semibold tabular-nums ${(d.difference ?? 0) < 0 ? 'text-red-700' : (d.difference ?? 0) > 0 ? 'text-green-700' : ''}`}>
                    {d.status === 'closed' ? formatUYU(d.difference ?? 0) : '—'}
                  </td>
                  <td className="py-2.5 text-muted">{d.note || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
};

// ======================= Informe mensual =======================

const KIND_TEXT = { slot_filled: 'Turno libre que se llenó', player_replaced: 'Lugar cubierto', match_completed: 'Partido completado' } as const;

export const MonthlyReportAdmin: React.FC<{
  club: Club;
  courts: Court[];
  bookings: Booking[];
  matches: ProposedMatch[];
  memberships: ClubMembership[];
  userProfile: UserProfile;
  onToast: (m: string) => void;
}> = ({ club, courts, bookings, matches, memberships, userProfile, onToast }) => {
  const ops = useOps();
  const { busy, run } = useRun(onToast);
  const today = getTodayISO();
  const current = monthOf(today);
  const months = useMemo(() => {
    const set = new Set<string>([current, previousMonth(current), ...ops.reports.map((r) => r.month)]);
    return [...set].sort().reverse();
  }, [current, ops.reports]);
  const [month, setMonth] = useState(current);
  const [showMail, setShowMail] = useState(false);
  const [emails, setEmails] = useState((club.reportEmails ?? []).join(', '));

  const { clients } = useClientes();
  const report: MonthlyReport = useMemo(() => {
    const saved = ops.reports.find((r) => r.month === month);
    if (saved && month !== current) return saved;
    return computeMonthlyReport({ club, month, today, courts, bookings, matches, payments: ops.allPayments, consumptions: ops.consumptions, recoveries: ops.recoveries, memberships, clients });
  }, [ops, month, current, club, today, courts, bookings, matches, memberships, clients]);
  const isSnapshot = !!ops.reports.find((r) => r.month === month) && month !== current;
  const recs = ops.recoveries.filter((r) => report.recoveryIds.includes(r.id)).sort((a, b) => a.date.localeCompare(b.date) || a.startMinute - b.startMinute);
  const kept = bookings.filter((b) => b.date >= report.fromDate && b.date <= report.toDate && b.status === 'no_show' && b.paymentStatus === 'deposit_paid' && b.paidAmount > 0);
  const html = useMemo(() => buildMonthlyReportEmail(report, { ownerFirstName: userProfile.displayName.split(' ')[0], detailUrl: `${window.location.origin}/?tab=admin`, logoUrl: `${window.location.origin}/brand/logo-horizontal-color.png` }), [report, userProfile.displayName]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {months.map((m) => (
          <button key={m} type="button" onClick={() => setMonth(m)} className={`rounded-full border px-3.5 py-1.5 text-[13px] font-semibold first-letter:uppercase cursor-pointer ${m === month ? 'border-brand bg-brand text-white' : 'border-line bg-white text-ink'}`}>
            {monthLabel(m)}
            {m === current ? ' (en curso)' : ''}
          </button>
        ))}
        <button type="button" onClick={() => setShowMail(true)} className="ml-auto inline-flex items-center gap-2 rounded-xl border border-line bg-white px-4 py-2 text-sm font-semibold text-ink hover:bg-mist cursor-pointer">
          <Mail className="h-4 w-4" /> Ver el mail
        </button>
      </div>

      <section className="rounded-2xl bg-brand p-6 text-white">
        <p className="text-sm text-emerald-100">
          {report.partial ? `En lo que va de ${monthLabel(month).split(' ')[0]} (hasta ayer)` : `En ${monthLabel(month)}`}, Armá Partido le trajo al club:
        </p>
        <p className="mt-1 font-display text-4xl font-bold tabular-nums">{formatUYU(report.totalEarned)}</p>
        <p className="text-sm">en turnos y lugares que se llenaron por nuestros avisos{report.depositsKept.count ? ' y señas retenidas' : ''}</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl bg-white/10 px-4 py-3">
            <p className="text-[11px] tracking-wider text-emerald-100 uppercase">{report.isTrial ? 'El valor de tu plan' : 'Tu cuota'} ({report.planLabel})</p>
            <p className="font-display text-xl font-bold tabular-nums">{formatUYU(report.feeUYU)}</p>
          </div>
          <div className="rounded-xl bg-[#05e2f2] px-4 py-3 text-ink">
            <p className="text-[11px] tracking-wider uppercase">Te devolvió</p>
            <p className="font-display text-xl font-bold">{String(report.multiple).replace('.', ',')} veces la cuota</p>
          </div>
        </div>
        {isSnapshot && <p className="mt-3 text-[12px] text-emerald-100">Foto guardada el día 1. Es lo que salió en el mail.</p>}
      </section>

      <div className="grid items-start gap-5 xl:grid-cols-2">
        <Card title="Lo que suma al total">
          {report.slotsFilled.count > 0 && <Row label={report.slotsFilled.count === 1 ? '1 turno libre que se llenó' : `${report.slotsFilled.count} turnos libres que se llenaron`} value={formatUYU(report.slotsFilled.amount)} />}
          <Row label={report.playersReplaced.count === 1 ? '1 lugar cubierto cuando alguien se bajó' : `${report.playersReplaced.count} lugares cubiertos cuando alguien se bajó`} value={formatUYU(report.playersReplaced.amount)} />
          <Row label={`${report.matchesCompleted.count === 1 ? '1 partido completado' : `${report.matchesCompleted.count} partidos completados`} (${report.matchesCompleted.seats === 1 ? '1 lugar' : `${report.matchesCompleted.seats} lugares`})`} value={formatUYU(report.matchesCompleted.amount)} />
          <Row label={report.depositsKept.count === 1 ? '1 seña que quedó para el club' : `${report.depositsKept.count} señas que quedaron para el club`} value={formatUYU(report.depositsKept.amount)} />
          <Row label="Total" value={formatUYU(report.totalEarned)} strong />
          <Hint>Solo cuenta un turno si nuestro aviso salió antes de que se ocupara, el jugador entró desde ese aviso y el partido se jugó. La cantina y los plantones que "se habrían evitado" no suman: no se puede probar que los trajimos nosotros.</Hint>
        </Card>
        <Card title="Cómo anduvo el mes">
          <Row label="Turnos jugados" value={report.playedBookings} />
          <Row label="Canchas ocupadas" value={`${report.occupancyPct} %`} />
          <Row label="Ausencias sin aviso" value={report.noShows} />
          <Row label="Cobrado en cantina" value={formatUYU(report.cantinaCollected)} />
          <Row label="Clientes nuevos" value={report.newPlayers} />
          {report.newFromApp !== undefined && <Row label="Llegaron por Armá Partido" value={report.newFromApp} />}
          <Row label="Quedó sin cobrar" value={formatUYU(report.uncollected)} />
          {report.appBookings !== undefined && <Row label="Reservas hechas por la app (no suman)" value={report.appBookings} />}
          {report.matchesBuilt !== undefined && <Row label="Partidos que armó la app sola" value={report.matchesBuilt} />}
          {!!report.viaLink && <Row label="Lugares llenados por el link compartido" value={report.viaLink} />}
          {report.tip && <Hint><b>Para el mes que viene:</b> {report.tip}</Hint>}
        </Card>
      </div>

      <Card title="Detalle turno por turno">
        {recs.length === 0 && kept.length === 0 ? (
          <p className="text-sm text-muted">Este mes todavía no hay turnos recuperados por avisos.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs text-muted">
                  <th className="py-2 pr-3 font-semibold">Día</th>
                  <th className="py-2 pr-3 font-semibold">Turno</th>
                  <th className="py-2 pr-3 font-semibold">Qué pasó</th>
                  <th className="py-2 pr-3 font-semibold">Aviso → ocupado</th>
                  <th className="py-2 text-right font-semibold">Pesos</th>
                </tr>
              </thead>
              <tbody>
                {recs.map((r) => {
                  const court = courts.find((c) => c.id === r.courtId)?.name ?? r.courtId;
                  const t = (iso: string) => {
                    const d = new Date(iso);
                    return Number.isNaN(d.getTime()) ? '' : formatMinutes(d.getHours() * 60 + d.getMinutes());
                  };
                  return (
                    <tr key={r.id} className="border-b border-[#eef5f5] last:border-0">
                      <td className="py-2.5 pr-3 tabular-nums">{r.date.split('-').reverse().slice(0, 2).join('/')}</td>
                      <td className="py-2.5 pr-3">{formatMinutes(r.startMinute)} · {court}</td>
                      <td className="py-2.5 pr-3">{KIND_TEXT[r.kind]}{r.kind !== 'slot_filled' ? ` (${r.seatsFilled} ${r.seatsFilled === 1 ? 'lugar' : 'lugares'})` : ''}</td>
                      <td className="py-2.5 pr-3 tabular-nums text-muted">{t(r.alertSentAt)} → {t(r.filledAt)}</td>
                      <td className="py-2.5 text-right font-semibold tabular-nums">{formatUYU(r.amountRecovered)}</td>
                    </tr>
                  );
                })}
                {kept.map((b) => (
                  <tr key={b.id} className="border-b border-[#eef5f5] last:border-0">
                    <td className="py-2.5 pr-3 tabular-nums">{b.date.split('-').reverse().slice(0, 2).join('/')}</td>
                    <td className="py-2.5 pr-3">{formatMinutes(b.startMinute)} · {b.courtName}</td>
                    <td className="py-2.5 pr-3">Seña retenida (no vino)</td>
                    <td className="py-2.5 pr-3 text-muted">—</td>
                    <td className="py-2.5 text-right font-semibold tabular-nums">{formatUYU(b.paidAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Quién recibe el mail">
        <p className="text-[13px] text-muted">El dueño del club lo recibe el día 1 de cada mes a las 9. Podés sumar más mails, separados por coma.</p>
        <div className="mt-3 flex gap-2">
          <input value={emails} onChange={(e) => setEmails(e.target.value)} placeholder="socio@club.com, contador@club.com" className={`${inputCls} mt-0`} aria-label="Otros mails que reciben el informe" />
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              run(
                () => saveReportEmails(club, emails.split(',').map((e) => e.trim()).filter((e) => /.+@.+\..+/.test(e)).slice(0, 5)),
                'Destinatarios guardados.'
              )
            }
            className="shrink-0 rounded-xl bg-brand px-4 text-sm font-semibold text-white cursor-pointer"
          >
            Guardar
          </button>
        </div>
        <Hint>El envío automático se prende cuando el servidor del club esté andando (falta pasar al Firebase propio). Mientras tanto, "Ver el mail" muestra exactamente lo que va a llegar.</Hint>
      </Card>

      {showMail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-3" onClick={() => setShowMail(false)}>
          <div className="flex h-[90vh] w-full max-w-[680px] flex-col overflow-hidden rounded-2xl bg-white" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold tracking-wider text-muted uppercase">Asunto</p>
                <p className="truncate text-sm font-semibold text-ink">{monthlyReportSubject(report)}</p>
              </div>
              <button type="button" aria-label="Cerrar" onClick={() => setShowMail(false)} className="text-muted cursor-pointer">
                <X className="h-5 w-5" />
              </button>
            </div>
            <iframe title="Vista del mail mensual" srcDoc={html} className="min-h-0 flex-1 border-0" />
          </div>
        </div>
      )}
    </div>
  );
};
