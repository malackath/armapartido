/** "Mi cuenta en el club" en la app del jugador: lo que debe de sus turnos y de la cantina, y lo ya pagado. Solo para ver. */
import React, { useEffect, useMemo, useState } from 'react';
import type { Booking, Club, ProposedMatch, UserProfile } from '../../types/padel';
import type { Consumption } from '../../types/caja';
import { formatDateFriendly, formatMinutes, formatUYU, getTodayISO } from '../../lib/padelUtils';
import { accountOf, participantsOf } from '../../lib/caja';
import { subscribeMyConsumptions } from '../../services/cajaService';
import { BrandIcon } from '../BrandIcon';

export const MyAccount: React.FC<{ club: Club; userProfile: UserProfile; bookings: Booking[]; proposedMatches: ProposedMatch[] }> = ({ club, userProfile, bookings, proposedMatches }) => {
  const [mine, setMine] = useState<Consumption[]>([]);
  useEffect(() => subscribeMyConsumptions(club.id, userProfile.uid, setMine), [club.id, userProfile.uid]);
  const today = getTodayISO();
  const uid = userProfile.uid;

  const turns = useMemo(() => {
    const ids = new Set(mine.map((c) => c.bookingId).filter(Boolean));
    const played = bookings.filter((b) => {
      if (b.status !== 'confirmed' || b.type === 'tournament' || b.date > today) return false;
      if (ids.has(b.id)) return true;
      if (b.type === 'matched') return proposedMatches.some((m) => m.bookingId === b.id && m.slots.some((s) => s.uid === uid));
      return b.playerUids[0] === uid;
    });
    return played
      .map((b) => {
        const match = proposedMatches.find((m) => m.bookingId === b.id);
        const acc = accountOf(participantsOf(b, match, () => userProfile.displayName), mine.filter((c) => c.bookingId === b.id)).find((a) => a.key === uid);
        return acc ? { b, acc } : null;
      })
      .filter((x): x is NonNullable<typeof x> => !!x)
      .sort((a, z) => z.b.date.localeCompare(a.b.date) || z.b.startMinute - a.b.startMinute);
  }, [bookings, proposedMatches, mine, today, uid, userProfile.displayName]);

  const due = turns.filter((t) => t.acc.totalDue > 0);
  const paid = turns.filter((t) => t.acc.totalDue === 0).slice(0, 4);
  const total = due.reduce((a, t) => a + t.acc.totalDue, 0);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <BrandIcon name="pago-en-club" className="h-6 w-6 text-emerald-700" />
          <div>
            <h2 className="font-display text-lg font-bold text-slate-900">Mi cuenta en {club.name}</h2>
            <p className="text-xs text-slate-500">Tus turnos y lo que consumiste en la cantina.</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[11px] font-semibold tracking-wider text-slate-500 uppercase">{total > 0 ? 'Debés' : 'Estás al día'}</p>
          <p className={`font-display text-2xl font-bold tabular-nums ${total > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>{formatUYU(total)}</p>
        </div>
      </div>

      {due.length === 0 && paid.length === 0 && <p className="mt-4 text-sm text-slate-500">Todavía no tenés consumos ni turnos para pagar.</p>}

      {due.map(({ b, acc }) => (
        <div key={b.id} className="mt-4 rounded-xl border border-slate-200">
          <p className="border-b border-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-900">
            {formatDateFriendly(b.date)} · {formatMinutes(b.startMinute)} · {b.courtName}
          </p>
          {acc.canchaDue > 0 && (
            <div className="flex justify-between px-4 py-2 text-sm">
              <span className="text-slate-600">{b.type === 'matched' ? 'Mi parte de la cancha' : 'La cancha'}</span>
              <span className="tabular-nums">{formatUYU(acc.canchaDue)}</span>
            </div>
          )}
          {acc.items.filter((i) => i.amount > 0).map((i) => (
            <div key={i.consumptionId} className="flex justify-between px-4 py-2 text-sm">
              <span className="text-slate-600">{i.label.replace(' (entre todos)', '')}{i.label.includes('entre todos') ? ' (mi parte)' : ''}</span>
              <span className="tabular-nums">{formatUYU(i.amount)}</span>
            </div>
          ))}
          <div className="flex justify-between border-t border-slate-100 bg-slate-50 px-4 py-2 text-sm font-bold">
            <span>Debo</span>
            <span className="tabular-nums">{formatUYU(acc.totalDue)}</span>
          </div>
        </div>
      ))}

      {total > 0 && (
        <p className="mt-4 rounded-xl bg-[#ecfcfc] px-4 py-3 text-sm text-slate-700">
          Se paga en el mostrador del club. Pronto vas a poder pagarlo desde acá con Mercado Pago.
        </p>
      )}

      {paid.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold tracking-wider text-slate-500 uppercase">Pagado</p>
          {paid.map(({ b }) => (
            <div key={b.id} className="flex justify-between border-b border-slate-100 py-2 text-sm last:border-0">
              <span className="text-slate-700">{formatDateFriendly(b.date)} · {formatMinutes(b.startMinute)} · {b.courtName}</span>
              <span className="font-semibold text-emerald-700">Pagado ✓</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};
