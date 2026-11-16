/**
 * Elegir del catálogo base (idea de Ber, 16/11/2026): el club tilda lo que vende, pone el precio y
 * dice si va en la Cantina, en el Mostrador o en los dos. Lo que destilda queda oculto (no se borra).
 */
import React, { useMemo, useState } from 'react';
import type { Club } from '../../types/padel';
import type { Product } from '../../types/caja';
import { CATALOG, CATALOG_GROUPS, type ProductPlace } from '../../lib/catalogo';
import { saveProduct } from '../../services/cajaService';
import { ProductIcon } from '../mostrador/ProductIcon';

type Row = { on: boolean; price: string; where: ProductPlace };
const PLACES: [ProductPlace, string][] = [
  ['ambos', 'Los dos'],
  ['cantina', 'Cantina'],
  ['mostrador', 'Mostrador'],
];

export const CatalogPicker: React.FC<{ club: Club; products: Product[]; busy: boolean; run: (fn: () => Promise<unknown>, msg: string) => void; onDone: () => void }> = ({ club, products, busy, run, onDone }) => {
  const byCatalog = useMemo(() => new Map(products.filter((p) => p.catalogId).map((p) => [p.catalogId!, p])), [products]);
  const [rows, setRows] = useState<Record<string, Row>>(() =>
    Object.fromEntries(
      CATALOG.map((c) => {
        const p = byCatalog.get(c.id);
        return [c.id, { on: !!p?.active, price: p ? String(p.price) : '', where: p?.where ?? 'ambos' }];
      })
    )
  );
  const set = (id: string, patch: Partial<Row>) => setRows((r) => ({ ...r, [id]: { ...r[id], ...patch } }));
  const chosen = CATALOG.filter((c) => rows[c.id].on);
  const missingPrice = chosen.filter((c) => !(Number(rows[c.id].price) > 0));

  const save = () =>
    run(async () => {
      for (const c of CATALOG) {
        const r = rows[c.id];
        const p = byCatalog.get(c.id);
        const price = Number(r.price) || 0;
        if (r.on) {
          if (p && p.active && p.price === price && (p.where ?? 'ambos') === r.where) continue;
          await saveProduct(club, {
            ...(p ? { id: p.id, stock: p.stock, minStock: p.minStock, order: p.order } : { stock: c.tracksStock ? 0 : null, minStock: 0, order: CATALOG.indexOf(c) }),
            name: p?.name ?? c.name,
            price,
            active: true,
            icon: c.icon,
            catalogId: c.id,
            where: r.where,
          });
        } else if (p?.active) {
          await saveProduct(club, { ...p, active: false });
        }
      }
      onDone();
    }, `Listo: ${chosen.length} productos a la venta.`);

  return (
    <div>
      <p className="text-[13px] text-muted">Tildá lo que vendés y poné el precio. Cada producto ya trae su ícono (y su foto cuando esté). Si vendés algo que no está, agregalo después con "+ Agregar".</p>
      <div className="mt-4 grid gap-5 lg:grid-cols-2">
        {CATALOG_GROUPS.map((g) => (
          <section key={g}>
            <h3 className="mb-1.5 text-xs font-semibold tracking-wider text-muted uppercase">{g}</h3>
            <ul className="divide-y divide-[#eef5f5] rounded-xl border border-line bg-white">
              {CATALOG.filter((c) => c.group === g).map((c) => {
                const r = rows[c.id];
                return (
                  <li key={c.id} className={`flex flex-wrap items-center gap-2.5 px-3 py-2 ${r.on ? '' : 'opacity-70'}`}>
                    <label className="flex min-w-0 grow basis-[13rem] items-center gap-2.5 cursor-pointer">
                      <input type="checkbox" checked={r.on} onChange={(e) => set(c.id, { on: e.target.checked })} className="h-4.5 w-4.5 shrink-0 accent-[var(--color-emerald-600)]" aria-label={`Vendo ${c.name}`} />
                      <ProductIcon product={{ name: c.name, icon: c.icon, photoUrl: byCatalog.get(c.id)?.photoUrl }} size={34} className="shrink-0 bg-mist" />
                      <span className="min-w-0 text-sm font-semibold text-ink">{c.name}</span>
                    </label>
                    {r.on && (
                      <span className="ml-auto flex items-center gap-2.5">
                        <span className="flex rounded-lg bg-mist p-0.5 text-[11.5px] font-semibold">
                          {PLACES.map(([id, label]) => (
                            <button key={id} type="button" onClick={() => set(c.id, { where: id })} className={`rounded-md px-2 py-1 cursor-pointer ${r.where === id ? 'bg-white text-ink shadow-xs' : 'text-muted'}`}>
                              {label}
                            </button>
                          ))}
                        </span>
                        <span className="relative">
                          <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-muted">$</span>
                          <input
                            inputMode="numeric"
                            value={r.price}
                            onChange={(e) => set(c.id, { price: e.target.value.replace(/\D/g, '') })}
                            placeholder="precio"
                            aria-label={`Precio de ${c.name}`}
                            className={`w-24 rounded-lg border py-1.5 pr-2.5 pl-6 text-right text-sm tabular-nums ${Number(r.price) > 0 ? 'border-line' : 'border-[#f97316] bg-wait-bg'}`}
                          />
                        </span>
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" disabled={busy || missingPrice.length > 0} onClick={save} className="rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-white disabled:opacity-50 cursor-pointer">
          Guardar {chosen.length} {chosen.length === 1 ? 'producto' : 'productos'}
        </button>
        {missingPrice.length > 0 && <span className="text-[13px] text-wait">Falta el precio de {missingPrice.map((c) => c.name).join(', ')}.</span>}
      </div>
    </div>
  );
};
