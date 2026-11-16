/** Admin, Cuponeras: el club arma sus cuponeras. No se borran: se desactivan. */
import React, { useState } from 'react';
import type { Club } from '../../types/padel';
import type { PackType, PackUnit, PackValidity } from '../../types/clientes';
import { VALIDITY_LABEL, pendingValue } from '../../lib/clientes';
import { formatUYU } from '../../lib/padelUtils';
import { savePackType } from '../../services/clientesService';
import { StatusChip } from '../ui/People';
import { Chip, useClientes } from './data';

const EMPTY = { name: '', price: '', uses: '10', unit: 'parte' as PackUnit, validity: 'todos' as PackValidity, days: '90' };
const field = 'mt-1 w-full rounded-xl border border-line bg-white px-3 py-2.5 text-sm text-ink tabular-nums';
const lbl = 'block text-[12.5px] font-semibold text-ink';

export const CuponerasAdmin: React.FC<{ club: Club; today: string; onToast: (m: string) => void }> = ({ club, today, onToast }) => {
  const { packTypes, packs } = useClientes();
  const [f, setF] = useState(EMPTY);
  const [editing, setEditing] = useState<PackType | null>(null);
  const [busy, setBusy] = useState(false);
  const sold = (id: string) => packs.filter((p) => p.packTypeId === id && p.status === 'active');
  const valid = f.name.trim() && Number(f.price) > 0 && Number(f.uses) > 0 && Number(f.days) > 0;

  const save = async () => {
    setBusy(true);
    try {
      await savePackType(club, { ...(editing ?? {}), name: f.name, price: Number(f.price), uses: Number(f.uses), unit: f.unit, validity: f.validity, days: Number(f.days) });
      onToast(editing ? 'Cuponera guardada. Las ya vendidas siguen con sus condiciones.' : 'Cuponera creada. Ya se puede vender en el Mostrador.');
      setF(EMPTY);
      setEditing(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[1fr_380px]">
      <section className="rounded-2xl border border-line bg-white p-5 sm:p-6">
        <h2 className="mb-3 font-display text-[17px] font-bold text-ink">Cuponeras del club</h2>
        {packTypes.length === 0 && <p className="text-[13px] text-muted">Todavía no hay cuponeras. Creá la primera a la derecha.</p>}
        <ul className="divide-y divide-[#eef5f5]">
          {packTypes.map((t) => {
            const s = sold(t.id);
            const pend = s.reduce((a, p) => a + pendingValue(p, today), 0);
            return (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-ink">{t.name}</span>
                    {!t.active && <StatusChip kind="busy">No se vende</StatusChip>}
                  </span>
                  <span className="block text-[12.5px] text-muted">
                    {formatUYU(t.price)} · {t.uses} {t.unit === 'turno' ? 'turnos completos' : 'partes de un jugador'} · vale {VALIDITY_LABEL[t.validity]} · dura {t.days} días
                  </span>
                  <span className="block text-[12px] text-muted">
                    Vendidas: {s.length} · sin usar: {formatUYU(pend)}
                  </span>
                </span>
                <span className="flex gap-1.5">
                  <Chip onClick={() => { setEditing(t); setF({ name: t.name, price: String(t.price), uses: String(t.uses), unit: t.unit, validity: t.validity, days: String(t.days) }); }}>Editar</Chip>
                  <Chip onClick={async () => { await savePackType(club, { ...t, active: !t.active }); onToast(t.active ? 'Ya no se vende. Las vendidas siguen andando.' : 'Se vende de nuevo.'); }}>
                    {t.active ? 'Dejar de vender' : 'Volver a vender'}
                  </Chip>
                </span>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 rounded-xl bg-[#ecfcfc] px-3.5 py-2.5 text-[12.5px] text-muted">
          Venderla es plata que entra (rubro Cuponeras, con su factura). Usarla no es plata nueva: queda como "cancha pagada con cuponera" y no entra a la caja. Es personal; lo vencido sin usar queda para el club.
        </p>
      </section>

      <section className="rounded-2xl border border-line bg-white p-5 sm:p-6" data-testid="form-cuponera">
        <h2 className="mb-3 font-display text-[17px] font-bold text-ink">{editing ? `Editar "${editing.name}"` : 'Nueva cuponera'}</h2>
        <div className="space-y-3">
          <label className={lbl}>
            Nombre
            <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="10 partes de cancha" className={field} />
          </label>
          <div className="grid grid-cols-3 gap-2">
            <label className={lbl}>
              Precio
              <input inputMode="numeric" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value.replace(/\D/g, '') })} placeholder="5500" className={field} />
            </label>
            <label className={lbl}>
              Usos
              <input inputMode="numeric" value={f.uses} onChange={(e) => setF({ ...f, uses: e.target.value.replace(/\D/g, '') })} className={field} />
            </label>
            <label className={lbl}>
              Días
              <input inputMode="numeric" value={f.days} onChange={(e) => setF({ ...f, days: e.target.value.replace(/\D/g, '') })} className={field} />
            </label>
          </div>
          <div>
            <p className={lbl}>Un uso es</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              <Chip on={f.unit === 'parte'} onClick={() => setF({ ...f, unit: 'parte' })}>La parte de un jugador</Chip>
              <Chip on={f.unit === 'turno'} onClick={() => setF({ ...f, unit: 'turno' })}>Un turno completo</Chip>
            </div>
          </div>
          <div>
            <p className={lbl}>Vale en</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              <Chip on={f.validity === 'todos'} onClick={() => setF({ ...f, validity: 'todos' })}>Todos los horarios</Chip>
              <Chip on={f.validity === 'valle'} onClick={() => setF({ ...f, validity: 'valle' })}>Solo valle</Chip>
              <Chip on={f.validity === 'semana'} onClick={() => setF({ ...f, validity: 'semana' })}>Lunes a viernes</Chip>
            </div>
            <p className="mt-1 text-[12px] text-muted">Valle: lunes a viernes antes de las {club.nightFromHour}:00. Si el turno no entra, la cuponera no se puede usar y se paga normal.</p>
          </div>
          {Number(f.price) > 0 && Number(f.uses) > 0 && (
            <p className="text-[12.5px] text-muted">Sale {formatUYU(Math.round(Number(f.price) / Number(f.uses)))} cada uso.</p>
          )}
          <div className="flex gap-2">
            {editing && (
              <button type="button" onClick={() => { setEditing(null); setF(EMPTY); }} className="flex-1 rounded-xl border border-line py-3 text-sm font-semibold cursor-pointer">
                Cancelar
              </button>
            )}
            <button type="button" disabled={busy || !valid} onClick={save} className="flex-1 rounded-xl bg-brand py-3 text-sm font-semibold text-white disabled:opacity-50 cursor-pointer">
              {editing ? 'Guardar' : 'Crear cuponera'}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};
