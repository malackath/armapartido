import React, { useState } from 'react';
import { DEFAULT_ALERT_PREFS, type AlertPrefs, type Club, type FillInvite, type FillSearch, type ProposedMatch, type UserProfile, type WeeklyInvites } from '../types/padel';
import { formatCategory, formatDateFriendly, formatMinutes, formatUYU, getTodayISO, MAX_CATEGORY } from '../lib/padelUtils';
import { chooseFillOutcome, claimFillSeat, declineFillInvite, dropFromMatch, updateAlertPrefs } from '../services/firestoreService';
import { categoryRangeLabel, categoryWindow, fillLinkUrl, mapsUrl, shareMessage, whatsappUrl } from '../lib/compartir';
import { BrandIcon } from './BrandIcon';

// Pantallas de "Falta uno" (vista previa aprobada: Paddle.URU/docs/falta-uno-pantallas.png).

function shortName(full: string): string {
  const [first, last] = full.split(' ');
  return last ? `${first} ${last[0]}.` : first;
}

function initials(name: string): string {
  return name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('');
}

function when(date: string, start: number, end: number): string {
  return `${formatDateFriendly(date, false)} · ${formatMinutes(start)} a ${formatMinutes(end)}`;
}

const PlayerRow: React.FC<{ name: string; category?: number; empty?: string; you?: boolean }> = ({ name, category, empty, you }) => (
  <div className="flex items-center gap-2.5 border-b border-mist py-2 last:border-0">
    <span
      className={`flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
        empty ? 'border-[1.5px] border-dashed border-[#9fc9ca] text-[#9fc9ca]' : 'bg-mist text-brand'
      }`}
    >
      {empty ?? initials(name)}
    </span>
    <span className={`flex-1 text-sm font-semibold ${empty ? 'text-muted' : 'text-ink'}`}>
      {empty ? name : `${shortName(name)}${you ? ' (vos)' : ''}`}
    </span>
    {category ? <span className="rounded-full bg-mist px-2 py-0.5 text-xs font-semibold text-brand">{formatCategory(category)}</span> : null}
  </div>
);

type ClaimOutcome = 'won' | 'late' | 'closed' | 'busy' | 'declined';

/** Vista 2 y 3: la invitación "¿Te sumás?" y lo que se ve después de tocar. */
export const FillInviteCard: React.FC<{
  club: Club;
  invite: FillInvite;
  search?: FillSearch;
  match?: ProposedMatch;
  onToast: (msg: string) => void;
}> = ({ club, invite, search, match, onToast }) => {
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<ClaimOutcome | null>(null);
  const seatsLeft = search ? Math.max(0, search.seatsNeeded - search.seatsFilled) : 1;

  const claim = async () => {
    setBusy(true);
    try {
      setOutcome(await claimFillSeat(club, invite.searchId));
    } catch {
      onToast('No pudimos confirmar. Probá de nuevo en un momento.');
    } finally {
      setBusy(false);
    }
  };
  const decline = async () => {
    setBusy(true);
    try {
      await declineFillInvite(club, invite.searchId);
      setOutcome('declined');
    } finally {
      setBusy(false);
    }
  };

  if (outcome === 'won') {
    return (
      <div className="flex gap-2.5 rounded-2xl bg-[#e3f5ea] p-3.5 text-[#1e6b3a]">
        <span aria-hidden>✓</span>
        <div>
          <strong className="block text-[15px]">¡Adentro!</strong>
          Jugás {formatDateFriendly(invite.date, false).toLowerCase()} {formatMinutes(invite.startMinute)} en {invite.courtName}. Les avisamos a los demás.
        </div>
      </div>
    );
  }
  if (outcome === 'late' || outcome === 'closed') {
    return (
      <div className="flex gap-2.5 rounded-2xl bg-wait-bg p-3.5 text-wait">
        <span aria-hidden>◷</span>
        <div>
          <strong className="block text-[15px]">{outcome === 'late' ? 'Llegaste justo tarde' : 'Esta búsqueda ya cerró'}</strong>
          {outcome === 'late' ? 'Ya están completos. No te descontamos este aviso: te avisamos en el próximo.' : 'Te tenemos en cuenta para la próxima.'}
        </div>
      </div>
    );
  }
  if (outcome === 'busy') {
    return (
      <div className="rounded-2xl bg-wait-bg p-3.5 text-wait">
        <strong className="block text-[15px]">Tenés otro partido a esa hora</strong>
        No te pudimos sumar a este.
      </div>
    );
  }
  if (outcome === 'declined') return null;

  return (
    <div>
      <span className="inline-block rounded-full bg-wait-bg px-2.5 py-0.5 text-xs font-semibold text-wait">
        Falta {seatsLeft === 1 ? 'uno' : seatsLeft}
      </span>
      <h3 className="mt-2 text-[22px] font-semibold text-ink">¿Te sumás al partido?</h3>
      <div className="mt-3 rounded-xl border border-line bg-white p-4">
        <p className="text-sm font-semibold text-emerald-600">{when(invite.date, invite.startMinute, invite.endMinute)}</p>
        <p className="mt-1 text-[19px] font-semibold text-ink">{invite.courtName}</p>
        <div className="mt-2">
          {(match?.slots ?? []).map((s) => (
            <PlayerRow key={s.uid} name={s.displayName} category={s.category} />
          ))}
          {Array.from({ length: seatsLeft }).map((_, i) => (
            <PlayerRow key={`e${i}`} name="Tu lugar" empty="+" />
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2.5 rounded-xl bg-mist px-3 py-2.5">
          <div>
            <strong className="block text-sm font-semibold text-ink">Tu parte: {formatUYU(invite.pricePerPlayer)}</strong>
            <span className="text-[13px] text-muted">Se paga en el club</span>
          </div>
        </div>
        <a href={mapsUrl(club)} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex h-10 items-center gap-1.5 text-sm font-semibold text-brand">
          <BrandIcon name="ubicacion" size={16} />
          Cómo llegar a {club.name}
        </a>
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={claim}
        className="mt-4 flex h-12 w-full cursor-pointer items-center justify-center rounded-2xl bg-action text-base font-bold text-on-action disabled:opacity-60"
      >
        {busy ? 'Confirmando…' : 'Me sumo'}
      </button>
      <button type="button" disabled={busy} onClick={decline} className="mt-2 w-full cursor-pointer py-2 text-sm font-semibold text-muted">
        No puedo
      </button>
      <p className="mt-1 flex items-center justify-center gap-2 text-[12.5px] text-muted">
        <span className="h-2 w-2 rounded-full bg-[#e2a400]" />
        Avisamos a varios jugadores. El primero que confirma entra.
      </p>
    </div>
  );
};

/** Lista de invitaciones abiertas del jugador (va arriba en Inicio y en Armar partido). */
export const FillInvitesSection: React.FC<{
  club: Club;
  invites: FillInvite[];
  searches: FillSearch[];
  matches: ProposedMatch[];
  onToast: (msg: string) => void;
}> = ({ club, invites, searches, matches, onToast }) => {
  const today = getTodayISO();
  const open = invites.filter((i) => {
    if (i.status !== 'sent' || i.date < today) return false;
    const s = searches.find((x) => x.id === i.searchId);
    return !s || s.status === 'searching';
  });
  if (open.length === 0) return null;
  return (
    <section className="space-y-6">
      {open.map((inv) => {
        const s = searches.find((x) => x.id === inv.searchId);
        return (
          <FillInviteCard
            key={inv.id}
            club={club}
            invite={inv}
            search={s}
            match={s ? matches.find((m) => m.id === s.matchId) : undefined}
            onToast={onToast}
          />
        );
      })}
    </section>
  );
};

/** Vista 4: "No puedo ir", con la hoja que explica la falta. */
export const DropMatchButton: React.FC<{
  club: Club;
  match: ProposedMatch;
  onToast: (msg: string) => void;
  className?: string;
}> = ({ club, match, onToast, className }) => {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [y, mo, d] = match.date.split('-').map(Number);
  const start = new Date(y, mo - 1, d, Math.floor(match.startMinute / 60), match.startMinute % 60);
  const hoursLeft = (start.getTime() - Date.now()) / 3600000;
  const late = hoursLeft < (club.cancellationHours ?? 0);
  const fillOn = club.fillEnabled !== false;

  const confirm = async () => {
    setBusy(true);
    try {
      const r = await dropFromMatch(club, match);
      setOpen(false);
      onToast(
        r.status === 'searching'
          ? 'Listo, saliste del partido. Ya estamos buscando reemplazo.'
          : r.status === 'cancelled'
            ? 'Saliste del partido y se liberó la cancha.'
            : 'Saliste del partido. Avisamos a los demás.'
      );
    } catch {
      onToast('No pudimos sacarte del partido. Probá de nuevo.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={className ?? 'mt-2 w-full cursor-pointer py-2 text-sm font-semibold text-muted'}
      >
        No puedo ir
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#17212566]" onClick={() => !busy && setOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md rounded-t-3xl bg-white px-5 pb-6 pt-2.5 shadow-[0_-10px_30px_#0a576133]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3.5 h-1 w-10 rounded-full bg-[#cfe0e0]" />
            <h3 className="text-xl font-semibold text-ink">¿No podés ir {formatDateFriendly(match.date, false).toLowerCase()}?</h3>
            <p className="mt-2 text-sm text-muted">
              {fillOn
                ? 'Salís del partido y buscamos a alguien de tu categoría para que los demás jueguen igual.'
                : 'Salís del partido y les avisamos a los demás.'}
            </p>
            <div className="mt-3 rounded-xl border border-[#cfe9ea] bg-[#eef9f9] px-3 py-2.5 text-[12.5px] text-[#2c4f52]">
              {fillOn && <strong className="block">Si encontramos reemplazo, no te queda falta.</strong>}
              {late
                ? `Si no aparece nadie, cuenta como falta porque faltan menos de ${club.cancellationHours} horas.`
                : 'Todavía estás a tiempo: no te cuenta como falta.'}
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={confirm}
              className="mt-4 flex h-12 w-full cursor-pointer items-center justify-center rounded-2xl bg-brand text-base font-semibold text-white disabled:opacity-60"
            >
              {busy ? 'Un momento…' : 'Sí, no puedo ir'}
            </button>
            <button type="button" disabled={busy} onClick={() => setOpen(false)} className="mt-2 w-full cursor-pointer py-2 text-sm font-semibold text-muted">
              Me quedo en el partido
            </button>
          </div>
        </div>
      )}
    </>
  );
};

/** Vistas 5 y 9: el partido mientras se busca, y la elección si no apareció nadie. */
export const MatchFillStatus: React.FC<{
  club: Club;
  match: ProposedMatch;
  search?: FillSearch;
  userUid: string;
  onToast: (msg: string) => void;
}> = ({ club, match, search, userUid, onToast }) => {
  const [busy, setBusy] = useState(false);
  if (!search) return null;
  const missing = Math.max(0, search.seatsNeeded - search.seatsFilled);

  if (search.status === 'searching') {
    return (
      <div className="mt-2">
        {Array.from({ length: missing }).map((_, i) => (
          <PlayerRow key={i} name={missing === 1 ? 'Buscando reemplazo' : 'Buscando jugador'} empty="…" />
        ))}
        <div className="mt-2 rounded-xl border border-[#cfe9ea] bg-[#eef9f9] px-3 py-2.5 text-[12.5px] text-[#2c4f52]">
          No tenés que hacer nada. Te avisamos cuando estén completos.
        </div>
        {match.playerUids.includes(userUid) && <ShareFillLink club={club} match={match} search={search} onToast={onToast} />}
      </div>
    );
  }

  if (search.status === 'unfilled' && !search.choice && match.playerUids.includes(userUid)) {
    const choose = async (choice: 'keep_searching' | 'play_as_three' | 'cancel') => {
      setBusy(true);
      try {
        const r = await chooseFillOutcome(club, search.id, choice);
        onToast(
          r.result === 'already_decided'
            ? 'Otro jugador ya eligió.'
            : r.choice === 'keep_searching'
              ? 'Seguimos buscando hasta 45 minutos antes.'
              : r.choice === 'cancel'
                ? 'Partido cancelado. No les queda falta.'
                : 'Listo, juegan igual.'
        );
      } finally {
        setBusy(false);
      }
    };
    const n = match.playerUids.length;
    return (
      <div className="mt-3">
        <span className="inline-block rounded-full bg-[#fdecea] px-2.5 py-0.5 text-xs font-semibold text-[#b3261e]">Falta {missing === 1 ? '1' : missing}</span>
        <h3 className="mt-2 text-lg font-semibold text-ink">Seguimos siendo {n}</h3>
        <p className="mt-1 text-sm text-muted">No apareció {missing === 1 ? 'el cuarto' : 'nadie más'}. ¿Qué hacemos?</p>
        {!search.extended && (
          <button
            type="button"
            disabled={busy}
            onClick={() => choose('keep_searching')}
            className="mt-3 flex h-11 w-full cursor-pointer items-center justify-center rounded-2xl bg-action text-[15px] font-bold text-on-action disabled:opacity-60"
          >
            Seguir buscando
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => choose('play_as_three')}
          className="mt-2 flex h-11 w-full cursor-pointer items-center justify-center rounded-2xl bg-mist text-[15px] font-semibold text-brand disabled:opacity-60"
        >
          Jugamos igual entre {n}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => choose('cancel')}
          className="mt-2 flex h-11 w-full cursor-pointer items-center justify-center rounded-2xl border border-line bg-white text-[15px] font-semibold text-brand disabled:opacity-60"
        >
          Cancelar sin falta
        </button>
        <p className="mt-2 text-center text-xs text-muted">Si nadie elige, el partido sigue en pie.</p>
      </div>
    );
  }
  return null;
};

/** Mientras se busca reemplazo: compartir el link en el grupo de WhatsApp (sin integrar WhatsApp). */
export const ShareFillLink: React.FC<{ club: Club; match: ProposedMatch; search: FillSearch; onToast: (msg: string) => void }> = ({ club, match, search, onToast }) => {
  const missing = Math.max(0, search.seatsNeeded - search.seatsFilled);
  const win = categoryWindow(match.slots.map((s) => s.category), club.fillMaxGap ?? 1);
  const url = fillLinkUrl(club.id, search.id);
  const text = shareMessage({ missing, date: search.date, startMinute: search.startMinute, clubName: club.name, min: win.min, max: win.max, url });
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      onToast('Link copiado. Pegalo en tu grupo.');
    } catch {
      onToast(url);
    }
  };
  return (
    <div className="mt-3 rounded-xl border-2 border-brand/25 bg-white p-3.5" data-testid="compartir-falta-uno">
      <p className="text-[15px] font-semibold text-ink">¿Conocés a alguien de {categoryRangeLabel(win.min, win.max)}?</p>
      <p className="mt-0.5 text-[13px] leading-snug text-muted">Mandale el link. El primero que confirma entra, sea de tu grupo o de los avisos.</p>
      <a
        href={whatsappUrl(text)}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-action text-[15px] font-bold text-on-action"
      >
        <BrandIcon name="compartir" size={18} />
        Compartir por WhatsApp
      </a>
      <button type="button" onClick={copy} className="mt-2 flex h-11 w-full cursor-pointer items-center justify-center rounded-2xl border border-line bg-white text-[15px] font-semibold text-brand">
        Copiar link
      </button>
    </div>
  );
};

/** Etiqueta corta para el estado de la búsqueda. */
export function fillBadge(search?: FillSearch): { label: string; tone: 'amber' | 'green' | 'red' } | null {
  if (!search) return null;
  const missing = Math.max(0, search.seatsNeeded - search.seatsFilled);
  if (search.status === 'searching') return { label: missing === 1 ? 'Buscando el cuarto' : `Buscando ${missing}`, tone: 'amber' };
  if (search.status === 'unfilled' && !search.choice) return { label: 'Sin cuarto: elegí', tone: 'red' };
  return null;
}

export const BADGE_CLASSES = {
  amber: 'bg-wait-bg text-wait',
  green: 'bg-[#e3f5ea] text-[#1e6b3a]',
  red: 'bg-[#fdecea] text-[#b3261e]',
} as const;

/** La búsqueda viva (o la última) de un partido. */
export function searchForMatch(searches: FillSearch[], matchId: string): FillSearch | undefined {
  const mine = searches.filter((s) => s.matchId === matchId);
  return (
    mine.find((s) => s.status === 'searching') ??
    mine.find((s) => s.status === 'unfilled' && !s.choice) ??
    mine.sort((a, b) => (b.openedAt ?? '').localeCompare(a.openedAt ?? ''))[0]
  );
}

/** Vista 6: Perfil → Avisos de "Falta uno". */
export const AlertPrefsSection: React.FC<{
  userProfile: UserProfile;
  onProfileUpdated: (next: UserProfile) => void;
  onToast: (msg: string) => void;
}> = ({ userProfile, onProfileUpdated, onToast }) => {
  const prefs: AlertPrefs = { ...DEFAULT_ALERT_PREFS, ...(userProfile.alertPrefs ?? {}) };
  const [saving, setSaving] = useState(false);
  const cat = userProfile.category;
  const range = (gap: number) => {
    const lo = Math.max(1, cat - gap);
    const hi = Math.min(MAX_CATEGORY, cat + gap);
    const list = Array.from({ length: hi - lo + 1 }, (_, i) => formatCategory(lo + i));
    return list.length <= 3 ? list.join(', ').replace(/, ([^,]*)$/, ' y $1') : `${list[0]} a ${list[list.length - 1]}`;
  };

  const save = async (next: AlertPrefs) => {
    setSaving(true);
    try {
      await updateAlertPrefs(userProfile.uid, next);
      onProfileUpdated({ ...userProfile, alertPrefs: next });
      onToast(next.weeklyInvites === 0 ? 'Listo, no te mandamos invitaciones de "Falta uno".' : 'Listo, guardamos tus avisos.');
    } catch {
      onToast('No pudimos guardar. Probá de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  const weekly: { v: WeeklyInvites; label: string }[] = [
    { v: 0, label: 'No' },
    { v: 3, label: '3' },
    { v: 6, label: '6' },
    { v: -1, label: 'Todas' },
  ];
  const gaps: { v: 0 | 1 | 2; label: string; detail: string }[] = [
    { v: 0, label: `Solo mi categoría (${formatCategory(cat)})`, detail: '' },
    { v: 1, label: 'Hasta una de diferencia', detail: range(1) },
    { v: 2, label: 'Hasta dos de diferencia', detail: range(2) },
  ];

  return (
    <section className="rounded-2xl border border-line bg-white p-5 sm:p-6">
      <h2 className="font-display text-lg font-bold text-ink">Avisos de "Falta uno"</h2>
      <p className="mt-1 text-sm text-muted">Cuando a un partido de tu club le falta uno, avisamos a jugadores de su nivel. El primero que confirma entra.</p>

      <p className="mt-4 mb-2 text-xs font-semibold tracking-wider text-muted uppercase">Invitaciones por semana</p>
      <div className="grid grid-cols-4 gap-2">
        {weekly.map((o) => (
          <button
            key={o.v}
            type="button"
            disabled={saving}
            aria-pressed={prefs.weeklyInvites === o.v}
            onClick={() => prefs.weeklyInvites !== o.v && save({ ...prefs, weeklyInvites: o.v })}
            className={`flex h-14 cursor-pointer flex-col items-center justify-center rounded-xl border text-[15px] font-semibold disabled:opacity-60 ${
              prefs.weeklyInvites === o.v ? 'border-brand bg-brand text-white' : 'border-line bg-white text-ink hover:bg-mist'
            }`}
          >
            {o.label}
            {o.v === 3 && <small className={`text-[10.5px] font-medium ${prefs.weeklyInvites === 3 ? 'text-white/80' : 'text-muted'}`}>sugerido</small>}
          </button>
        ))}
      </div>
      <div className="mt-3 rounded-xl border border-[#cfe9ea] bg-[#eef9f9] px-3 py-2.5 text-[12.5px] text-[#2c4f52]">
        Te sugerimos 3 por semana: alcanza para enterarte de los partidos de tu nivel a tu hora, sin que el celular te suene de más. Lo podés cambiar cuando quieras.
      </div>

      <p className={`mt-5 mb-2 text-xs font-semibold tracking-wider text-muted uppercase ${prefs.weeklyInvites === 0 ? 'opacity-50' : ''}`}>¿Con quién jugás?</p>
      <div className={`space-y-2 ${prefs.weeklyInvites === 0 ? 'pointer-events-none opacity-50' : ''}`}>
        {gaps.map((g) => (
          <button
            key={g.v}
            type="button"
            disabled={saving}
            aria-pressed={prefs.maxCategoryGap === g.v}
            onClick={() => prefs.maxCategoryGap !== g.v && save({ ...prefs, maxCategoryGap: g.v })}
            className={`flex w-full cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left disabled:opacity-60 ${
              prefs.maxCategoryGap === g.v ? 'border-brand bg-mist' : 'border-line bg-white hover:bg-mist'
            }`}
          >
            <span className={`h-4 w-4 shrink-0 rounded-full border-2 ${prefs.maxCategoryGap === g.v ? 'border-brand bg-brand shadow-[inset_0_0_0_3px_white]' : 'border-[#9fc9ca]'}`} />
            <span className="text-sm font-semibold text-ink">
              {g.label}
              {g.detail && <small className="block text-xs font-medium text-muted">{g.detail}</small>}
            </span>
          </button>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted">De 23:00 a 08:00 no te mandamos invitaciones. Los avisos llegan como notificación del celular; activalos en Avisos.</p>
    </section>
  );
};
