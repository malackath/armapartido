// Suplente de guardia (etapa 4 del algoritmo, decisión 4.5 de Ber, 17/11/2026).
// "Si se baja alguien en ese horario, contá conmigo": el jugador entra directo, antes de que avisemos a los demás.
import { useEffect, useState } from 'react';
import type { Club, Standby } from '../types/padel';
import { addDaysISO, formatDateFriendly, formatMinutes, getDayName, getDayOfWeekFromISO, getTodayISO } from '../lib/padelUtils';
import { UserFacingError, cancelStandby, offerStandby, subscribeMyStandbys } from '../services/firestoreService';
import { BrandIcon } from './BrandIcon';

export function SuplenteGuardia({ club, uid, onToast }: { club: Club; uid: string; onToast: (m: string) => void }) {
  const today = getTodayISO();
  const [date, setDate] = useState(today);
  const [from, setFrom] = useState(19);
  const [to, setTo] = useState(23);
  const [busy, setBusy] = useState(false);
  const [mine, setMine] = useState<Standby[]>([]);

  useEffect(() => subscribeMyStandbys(club.id, uid, setMine), [club.id, uid]);
  const active = mine.filter((s) => s.status === 'active' && s.date >= today).sort((a, b) => (a.date + a.startMinute).localeCompare(b.date + b.startMinute));

  const offer = async () => {
    if ((to - from) * 60 < 90) {
      onToast('La franja tiene que cubrir al menos un turno (90 minutos).');
      return;
    }
    setBusy(true);
    try {
      await offerStandby({ clubId: club.id, date, startMinute: from * 60, endMinute: to * 60 });
      onToast(`Listo: estás de suplente ${formatDateFriendly(date, false)} de ${from}:00 a ${to}:00.`);
    } catch (err) {
      onToast(err instanceof UserFacingError ? err.message : 'No pudimos guardarlo. Probá de nuevo.');
    } finally {
      setBusy(false);
    }
  };

  const hours = Array.from({ length: 17 }, (_, i) => i + 8);
  const sel = 'mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 tabular-nums';

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6">
      <div className="flex items-start gap-3 border-b border-slate-100 pb-4">
        <BrandIcon name="falta-uno" size={22} className="mt-0.5 text-brand" />
        <div>
          <h2 className="font-display text-lg font-bold text-slate-900">Suplente de guardia</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Si a un partido de tu categoría se le baja alguien en ese horario, entrás vos directo, antes de que avisemos a los demás. Te mandamos un aviso.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div>
          <label className="block text-xs font-semibold text-slate-700">Día</label>
          <select value={date} onChange={(e) => setDate(e.target.value)} className={sel}>
            {[0, 1, 2, 3, 4, 5, 6].map((o) => {
              const iso = addDaysISO(today, o);
              return (
                <option key={iso} value={iso}>
                  {o === 0 ? 'Hoy' : o === 1 ? 'Mañana' : getDayName(getDayOfWeekFromISO(iso))} {formatDateFriendly(iso, false).replace(/^\S+\s/, '')}
                </option>
              );
            })}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700">Desde</label>
          <select value={from} onChange={(e) => setFrom(Number(e.target.value))} className={sel}>
            {hours.slice(0, -1).map((h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700">Hasta</label>
          <select value={to} onChange={(e) => setTo(Number(e.target.value))} className={sel}>
            {hours.slice(1).map((h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
          </select>
        </div>
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={offer}
        className="mt-4 min-h-[44px] w-full rounded-xl border border-brand px-5 py-2.5 text-sm font-semibold text-brand transition-colors hover:bg-brand/5 disabled:opacity-60 cursor-pointer sm:w-auto"
      >
        {busy ? 'Guardando…' : 'Contá conmigo de suplente'}
      </button>

      {active.length > 0 && (
        <div className="mt-5">
          <p className="text-xs font-semibold text-slate-700">Estás de guardia</p>
          <ul className="mt-2 divide-y divide-slate-100">
            {active.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 py-2.5">
                <span className="text-sm text-slate-900 tabular-nums">
                  {formatDateFriendly(s.date, false)} · {formatMinutes(s.startMinute)} a {formatMinutes(s.endMinute)}
                </span>
                <button
                  type="button"
                  onClick={() => cancelStandby({ clubId: club.id, id: s.id }).then(() => onToast('Listo, ya no estás de guardia en ese horario.'))}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Ya no puedo
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
