/**
 * W2. Buscar o dar de alta un cliente: el único lugar donde nace una ficha a mano. Se usa al cargar
 * una reserva por teléfono, al vender suelto, al vender una cuponera y desde Clientes.
 */
import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type { Club, ClubMembership } from '../../types/padel';
import type { ClientOrigin, ClubClient } from '../../types/clientes';
import { clientsWithEmail, clientsWithPhone, isEmail, normalizePhone, searchClients, formatPhone } from '../../lib/clientes';
import { formatUYU } from '../../lib/padelUtils';
import { createClient, createClientForMember } from '../../services/clientesService';
import type { Staff } from '../../services/cajaService';
import { ClientLine, useClientes } from './data';

const inputCls = 'w-full rounded-xl border border-line bg-white px-3 py-2.5 text-sm text-ink';

export const ClientPicker: React.FC<{
  club: Club;
  memberships: ClubMembership[];
  staff: Staff;
  today: string;
  origin: ClientOrigin;
  onPick: (c: ClubClient) => void;
  debtOf?: (c: ClubClient) => number;
  autoFocus?: boolean;
  placeholder?: string;
}> = ({ club, memberships, staff, today, origin, onPick, debtOf, autoFocus, placeholder }) => {
  const { clients } = useClientes();
  const [q, setQ] = useState('');
  const [form, setForm] = useState<null | { name: string; phone: string; email: string; noPhone: boolean; notice: boolean; news: boolean }>(null);
  const [dupe, setDupe] = useState<ClubClient[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const hits = useMemo(() => searchClients(clients, memberships, q), [clients, memberships, q]);

  const startNew = () => {
    const digits = q.replace(/\D/g, '');
    const looksPhone = digits.length >= 6 && digits.length >= q.replace(/\s/g, '').length - 2;
    setForm({ name: looksPhone || isEmail(q) ? '' : q.trim(), phone: looksPhone ? q.trim() : '', email: isEmail(q) ? q.trim() : '', noPhone: false, notice: false, news: false });
    setDupe(null);
    setErr('');
  };

  const pickMember = async (m: ClubMembership) => {
    setBusy(true);
    try {
      onPick(await createClientForMember(club, m, staff, today));
    } finally {
      setBusy(false);
    }
  };

  const save = async (force: boolean) => {
    if (!form) return;
    const phone = normalizePhone(form.phone);
    if (!form.name.trim()) return setErr('Falta el nombre.');
    if (!form.noPhone && !phone) return setErr('El celular no parece un número uruguayo (ej. 099 123 456). Si no tiene, marcá "No tiene celular".');
    if (form.email && !isEmail(form.email)) return setErr('El mail no parece válido.');
    if (!form.notice) return setErr('Avisale que sus datos quedan en el club y marcá la tilde.');
    const same = [...clientsWithPhone(clients, form.noPhone ? '' : phone), ...clientsWithEmail(clients, form.email)].filter((c, i, a) => a.findIndex((x) => x.id === c.id) === i);
    if (same.length && !force) {
      setDupe(same);
      return;
    }
    setBusy(true);
    try {
      const c = await createClient(
        club,
        { name: form.name, phone: form.phone, noPhone: form.noPhone, email: form.email, origin, noticeGiven: form.notice, acceptsNews: form.news, reviewDuplicate: same.length > 0 },
        staff,
        today,
        same.map((s) => s.id)
      );
      onPick(c);
    } finally {
      setBusy(false);
    }
  };

  if (form) {
    return (
      <div className="rounded-xl border border-line bg-white p-3.5" data-testid="nuevo-cliente">
        <p className="mb-2.5 text-xs font-semibold tracking-wider text-muted uppercase">Nuevo cliente</p>
        <div className="space-y-2.5">
          <input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nombre y apellido" aria-label="Nombre y apellido" className={inputCls} />
          {!form.noPhone && <input value={form.phone} onChange={(e) => { setForm({ ...form, phone: e.target.value }); setDupe(null); }} inputMode="tel" placeholder="Celular (099 123 456)" aria-label="Celular" className={`${inputCls} tabular-nums`} />}
          <input value={form.email} onChange={(e) => { setForm({ ...form, email: e.target.value }); setDupe(null); }} inputMode="email" placeholder="Mail (opcional)" aria-label="Mail" className={inputCls} />
        </div>
        {dupe && (
          <div className="mt-3 rounded-xl bg-due-bg p-3">
            <p className="text-[13px] font-semibold text-due">
              {dupe.length === 1
                ? `Ese ${dupe[0].phone && dupe[0].phone === normalizePhone(form.phone) ? 'celular' : 'mail'} es de ${dupe[0].name}. ¿Es la misma persona?`
                : `Ese celular o mail ya está en ${dupe.length} fichas. ¿Es alguna de estas personas?`}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {dupe.map((d) => (
                <button key={d.id} type="button" onClick={() => onPick(d)} className="rounded-full bg-brand px-3.5 py-1.5 text-[13px] font-semibold text-white cursor-pointer">
                  Sí, usar {dupe.length === 1 ? 'su ficha' : d.name.split(' ')[0]}
                </button>
              ))}
              <button type="button" disabled={busy} onClick={() => save(true)} className="rounded-full border border-due/30 bg-white px-3.5 py-1.5 text-[13px] font-semibold text-due cursor-pointer">
                No, es otra
              </button>
            </div>
            <p className="mt-1.5 text-[11.5px] text-due/80">Si es otra, se guarda igual y las dos quedan marcadas para revisar.</p>
          </div>
        )}
        <div className="mt-3 space-y-1.5 text-[13px] text-ink">
          <label className="flex items-start gap-2">
            <input type="checkbox" checked={form.notice} onChange={(e) => setForm({ ...form, notice: e.target.checked })} className="mt-0.5 h-4 w-4 accent-[#00696b]" />
            <span>Le avisé que sus datos quedan en el club para reservas y cobros</span>
          </label>
          <label className="flex items-start gap-2">
            <input type="checkbox" checked={form.news} onChange={(e) => setForm({ ...form, news: e.target.checked })} className="mt-0.5 h-4 w-4 accent-[#00696b]" />
            <span>Quiere recibir novedades del club</span>
          </label>
          <label className="flex items-start gap-2 text-muted">
            <input type="checkbox" checked={form.noPhone} onChange={(e) => setForm({ ...form, noPhone: e.target.checked, phone: '' })} className="mt-0.5 h-4 w-4 accent-[#00696b]" />
            <span>No tiene celular (la pareja que reserva con uno solo, un menor)</span>
          </label>
        </div>
        {err && <p className="mt-2 text-[12.5px] font-semibold text-due">{err}</p>}
        <div className="mt-3 flex gap-2">
          <button type="button" onClick={() => setForm(null)} className="flex-1 rounded-xl border border-line py-2.5 text-sm font-semibold text-ink hover:bg-mist cursor-pointer">
            Volver
          </button>
          <button type="button" disabled={busy || !!dupe} onClick={() => save(false)} className="flex-1 rounded-xl bg-brand py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50 cursor-pointer">
            Guardar ficha
          </button>
        </div>
        <p className="mt-2 text-[11.5px] text-muted">Obligatorio: nombre y celular. El celular se guarda siempre igual ({formatPhone(normalizePhone(form.phone) || '+59899123456')}) y es la clave para no repetir.</p>
      </div>
    );
  }

  return (
    <div>
      <label className="relative block">
        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          autoFocus={autoFocus}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder ?? 'Nombre, celular o mail'}
          aria-label="Buscar cliente"
          className={`${inputCls} pl-9`}
        />
      </label>
      {hits.length > 0 && (
        <ul className="mt-2 divide-y divide-[#eef5f5] rounded-xl border border-line bg-white">
          {hits.map((h) => {
            const debt = h.client && debtOf ? debtOf(h.client) : 0;
            return (
              <li key={h.client?.id ?? h.member?.uid} className="flex items-center justify-between gap-2 px-3 py-2">
                <ClientLine
                  name={h.name}
                  phone={h.phone}
                  category={h.category}
                  hasApp={h.hasApp}
                  photoUrl={h.member?.photoUrl}
                  extra={debt > 0 ? <span className="font-semibold text-due"> · debe {formatUYU(debt)}</span> : h.member ? ' · todavía sin ficha' : null}
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => (h.client ? onPick(h.client) : h.member && pickMember(h.member))}
                  className="shrink-0 rounded-full border border-line bg-white px-3 py-1.5 text-[13px] font-semibold text-ink hover:bg-mist cursor-pointer"
                >
                  Elegir
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {q.trim().length >= 2 && hits.length === 0 && <p className="mt-2 px-1 text-[13px] text-muted">No hay nadie con eso.</p>}
      <button type="button" onClick={startNew} className="mt-2 w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-left text-sm font-semibold text-emerald-700 hover:bg-mist cursor-pointer">
        + Nuevo cliente
      </button>
    </div>
  );
};
