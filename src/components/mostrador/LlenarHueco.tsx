/**
 * Mostrador: "Llenar con la app" un turno libre (16/11/2026, parte 2 de la propuesta de diferenciación).
 * Wireframe aprobado: project files informes/diferenciacion-mejoras/wireframes-parte2-demo-5-minutos.png (1a y 1b).
 * El servidor (functions/src/hueco.ts) avisa por tandas a los que dijeron que pueden a esa hora.
 */
import React, { useEffect, useState } from 'react';
import type { Club, ClubMembership, Court, FillSearch, Modality, ProposedMatch } from '../../types/padel';
import { formatMinutes, formatUYU } from '../../lib/padelUtils';
import { categoryRangeLabel } from '../../lib/compartir';
import { DEMO_MODE } from '../../lib/firebase';
import { freeSlotPreview, openFreeSlot, simulateFreeSlotAnswers, type FreeSlotPreview } from '../../services/firestoreService';
import { PlayerAvatar } from '../ui/People';

const MOD_LABEL: Record<Modality, string> = { masculino: 'Masculino', femenino: 'Femenino', mixto: 'Mixto' };
const DISCOUNTS = [0, 10, 20, 30] as const;

const chip = (on: boolean) =>
  `h-9 cursor-pointer rounded-full border px-3 text-[13px] font-semibold tabular-nums ${on ? 'border-brand bg-brand text-white' : 'border-line bg-white text-ink'}`;

export const LlenarHueco: React.FC<{
  club: Club;
  court: Court;
  date: string;
  startMinute: number;
  endMinute: number;
  fillSearches: FillSearch[];
  proposedMatches: ProposedMatch[];
  memberships?: ClubMembership[];
  onToast: (msg: string) => void;
  onClose: () => void;
}> = ({ club, court, date, startMinute, endMinute, fillSearches, proposedMatches, memberships = [], onToast, onClose }) => {
  const [preview, setPreview] = useState<FreeSlotPreview | null>(null);
  const [error, setError] = useState('');
  const [modality, setModality] = useState<Modality>('mixto');
  const [discount, setDiscount] = useState<(typeof DISCOUNTS)[number]>(0);
  const [busy, setBusy] = useState(false);
  const [started, setStarted] = useState<{ searchId: string; matchId: string } | null>(null);

  useEffect(() => {
    let alive = true;
    setPreview(null);
    setError('');
    setStarted(null);
    freeSlotPreview({ clubId: club.id, courtId: court.id, date, startMinute })
      .then((p) => {
        if (!alive) return;
        setPreview(p);
        setModality(p.suggested);
      })
      .catch(() => alive && setError('No pudimos ver quién puede a esa hora. Probá de nuevo.'));
    return () => {
      alive = false;
    };
  }, [club.id, court.id, date, startMinute]);

  const opt = preview?.options.find((o) => o.modality === modality);
  const full = preview?.price ?? 0;
  const perPlayer = Math.round((full * (100 - discount)) / 100 / 4);

  const launch = async () => {
    setBusy(true);
    try {
      const r = await openFreeSlot({ clubId: club.id, courtId: court.id, date, startMinute, modality, discountPct: discount });
      setStarted({ searchId: r.searchId, matchId: r.matchId });
      onToast(r.invited ? `Avisamos a ${r.invited} jugadores. Te mostramos acá quién se suma.` : 'Listo. Es horario de silencio: los avisos salen a las 8.');
    } catch (e) {
      onToast((e as Error).message?.includes('ocupó') ? 'Ese turno ya se ocupó.' : 'No se pudo largar la búsqueda. Probá de nuevo.');
    } finally {
      setBusy(false);
    }
  };

  if (started) {
    const s = fillSearches.find((x) => x.id === started.searchId);
    const m = proposedMatches.find((x) => x.id === started.matchId);
    const filled = s?.seatsFilled ?? 0;
    return (
      <div data-testid="hueco-llenando">
        <div className="rounded-xl border border-line p-4">
          <p className="font-semibold text-ink">
            {court.name} · {formatMinutes(startMinute)} · {s?.status === 'filled' ? 'completo' : 'llenando'}
          </p>
          <div className="mt-3 flex items-center gap-2">
            {(m?.slots ?? []).map((sl) => (
              <PlayerAvatar key={sl.uid} name={sl.displayName} photoUrl={memberships.find((x) => x.uid === sl.uid)?.photoUrl} size={40} category={sl.category} />
            ))}
            {Array.from({ length: Math.max(0, 4 - (m?.slots.length ?? 0)) }).map((_, i) => (
              <span key={i} className="grid h-10 w-10 place-items-center rounded-[10px] border-2 border-dashed border-line text-muted">?</span>
            ))}
          </div>
          <dl className="mt-3 divide-y divide-line text-sm">
            <Row k="Avisados" v={`${s?.invitedUids.length ?? 0}${s?.wave ? ` · ${s.wave} ${s.wave === 1 ? 'tanda' : 'tandas'}` : ''}`} />
            <Row k="Confirmaron" v={`${filled} de 4`} strong />
            <Row k="Deja de buscar" v={s ? closesLabel(s.closesAt) : '…'} />
          </dl>
        </div>
        {s?.status === 'filled' && (
          <p className="mt-3 rounded-xl bg-ok-bg px-3.5 py-2.5 text-sm font-semibold text-ok">¡Turno lleno! Queda confirmado y suma al informe del mes.</p>
        )}
        {DEMO_MODE && s?.status === 'searching' && (
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await simulateFreeSlotAnswers({ clubId: club.id, searchId: started.searchId, n: 4 - filled });
              } finally {
                setBusy(false);
              }
            }}
            className="mt-3 h-11 w-full cursor-pointer rounded-xl border border-dashed border-brand text-sm font-semibold text-brand disabled:opacity-50"
          >
            {busy ? 'Contestando…' : 'Demo: que contesten los jugadores'}
          </button>
        )}
        <button type="button" onClick={onClose} className="mt-3 h-11 w-full cursor-pointer rounded-xl bg-brand text-sm font-semibold text-white">
          Listo
        </button>
        <p className="mt-2 text-center text-xs text-muted">Podés cerrar: la app sigue buscando sola y lo ves en la grilla.</p>
      </div>
    );
  }

  if (error) return <p className="rounded-xl bg-mist p-4 text-sm text-ink">{error}</p>;
  if (!preview) return <p className="py-8 text-center text-sm text-muted">Mirando quién puede a esa hora…</p>;
  if (!preview.free)
    return (
      <p className="rounded-xl bg-mist p-4 text-sm text-ink">
        {preview.reason === 'too_late' ? 'Falta muy poco para este turno: no da el tiempo para avisar. Cargalo a mano.' : 'Ese turno ya está ocupado.'}
      </p>
    );

  return (
    <div data-testid="hueco-vista-previa">
      <div className="rounded-xl border border-line p-4">
        <p className="font-semibold text-ink">
          {court.name} · {formatMinutes(startMinute)} a {formatMinutes(endMinute)}
        </p>
        <dl className="mt-2 divide-y divide-line text-sm">
          <Row k="Pueden a esta hora" v={`${opt?.count ?? 0} ${opt?.count === 1 ? 'jugador' : 'jugadores'}`} strong />
          <Row k="De qué categorías" v={opt && opt.count ? categoryRangeLabel(opt.minCategory, opt.maxCategory) : '—'} />
          <Row k="Cada uno paga" v={`${formatUYU(perPlayer)}${discount ? ` (en vez de ${formatUYU(Math.round(full / 4))})` : ''}`} />
        </dl>
      </div>
      <p className="mt-4 mb-1.5 text-xs font-semibold text-ink">Partido</p>
      <div className="flex flex-wrap gap-1.5">
        {preview.options.map((o) => (
          <button key={o.modality} type="button" aria-pressed={modality === o.modality} onClick={() => setModality(o.modality)} className={chip(modality === o.modality)}>
            {MOD_LABEL[o.modality]} · {o.count}
          </button>
        ))}
      </div>
      <p className="mt-4 mb-1.5 text-xs font-semibold text-ink">Precio (opcional, para llenar más rápido)</p>
      <div className="flex flex-wrap gap-1.5">
        {DISCOUNTS.map((d) => (
          <button key={d} type="button" aria-pressed={discount === d} onClick={() => setDiscount(d)} className={chip(discount === d)}>
            {d ? `−${d} %` : 'Precio normal'}
          </button>
        ))}
      </div>
      {opt && opt.count < 4 && (
        <p className="mt-3 rounded-xl bg-wait-bg px-3.5 py-2.5 text-[13px] text-wait">
          Hay pocos jugadores que puedan a esta hora. Igual podés probar: si no se juntan 4, la cancha se libera sola.
        </p>
      )}
      <button
        type="button"
        disabled={busy || !opt || opt.count === 0}
        onClick={launch}
        className="mt-4 h-12 w-full cursor-pointer rounded-xl bg-action text-[15px] font-bold text-on-action disabled:opacity-50"
      >
        {busy ? 'Avisando…' : 'Llenar con la app'}
      </button>
      <p className="mt-2 text-center text-xs text-muted">Avisamos por tandas solo a los que dijeron que pueden a esa hora, con su tope de avisos.</p>
    </div>
  );
};

/** "08:00", "mañana 06:30" o "el 18/11 06:30". */
function closesLabel(iso: string) {
  const d = new Date(iso);
  const hm = formatMinutes(d.getHours() * 60 + d.getMinutes());
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(d) - day(new Date())) / 86400000);
  if (diff <= 0) return hm;
  if (diff === 1) return `mañana ${hm}`;
  return `el ${d.getDate()}/${d.getMonth() + 1} ${hm}`;
}

const Row: React.FC<{ k: string; v: string; strong?: boolean }> = ({ k, v, strong }) => (
  <div className="flex justify-between gap-3 py-2">
    <dt className="text-muted">{k}</dt>
    <dd className={`text-right tabular-nums ${strong ? 'font-bold text-ink' : 'font-semibold text-ink'}`}>{v}</dd>
  </div>
);
