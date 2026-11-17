// Modo invitados (etapa 6b; decisiones 4.6 de Ber, OK a la vista previa 17/11/2026).
import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import type { Club, ClubGuestsConfig, FillInvite, GuestPass } from '../types/padel';
import { formatCategory, formatDateFriendly, formatMinutes } from '../lib/padelUtils';
import { db } from '../lib/firebase';
import { mapsUrl } from '../lib/compartir';
import {
  UserFacingError,
  authorizeGuestFriend,
  claimGuestSeat,
  declineGuestInvite,
  removeGuestFriend,
  saveClubGuests,
  subscribeMyGuestInvites,
  subscribeMyGuestPasses,
} from '../services/firestoreService';

const SURCHARGES = [0, 50, 100, 150];
const errMsg = (e: unknown) => (e instanceof UserFacingError ? e.message : 'No pudimos guardarlo. Probá de nuevo.');

function Switch({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative h-[26px] w-11 shrink-0 cursor-pointer rounded-full transition-colors disabled:opacity-60 ${on ? 'bg-brand' : 'bg-[#c9d6d7]'}`}
    >
      <span className={`absolute top-[3px] h-5 w-5 rounded-full bg-white transition-all ${on ? 'left-[21px]' : 'left-[3px]'}`} />
    </button>
  );
}

// ---------- Admin → Falta uno: tarjeta "Invitados" ----------

export function InvitadosAdmin({ club }: { club: Club }) {
  const [cfg, setCfg] = useState<ClubGuestsConfig>({ enabled: false, surcharge: 0, shareMyPlayers: true, ...(club.guests ?? {}) });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  useEffect(() => setCfg({ enabled: false, surcharge: 0, shareMyPlayers: true, ...(club.guests ?? {}) }), [club.guests]);
  const save = async (next: ClubGuestsConfig) => {
    setCfg(next);
    setSaving(true);
    setMsg('');
    try {
      await saveClubGuests(club.id, next);
      setMsg('Guardado.');
    } catch {
      setMsg('No se pudo guardar. Probá de nuevo.');
    } finally {
      setSaving(false);
    }
  };
  const row = 'flex items-center justify-between gap-3 border-t border-line py-3 first:border-0 first:pt-0';
  return (
    <section className="rounded-2xl border border-line bg-white p-5 sm:p-6" data-testid="invitados-admin">
      <h2 className="font-display text-[17px] font-bold text-ink">Invitados</h2>
      <p className="mt-0.5 mb-3 text-sm text-muted">Cuando a un partido le falta uno y no aparece nadie del club.</p>
      <div className={row}>
        <span>
          <b className="block text-[14.5px] font-semibold text-ink">Recibir invitados</b>
          <small className="mt-0.5 block text-[12.5px] text-muted">Si en la primera tanda nadie del club se suma, avisamos a jugadores de otros clubes y a los amigos que traen tus socios.</small>
        </span>
        <Switch on={cfg.enabled} disabled={saving} label="Recibir invitados" onChange={(v) => save({ ...cfg, enabled: v })} />
      </div>
      <div className={`${row} flex-wrap ${cfg.enabled ? '' : 'opacity-50'}`}>
        <span>
          <b className="block text-[14.5px] font-semibold text-ink">Recargo por invitado</b>
          <small className="mt-0.5 block text-[12.5px] text-muted">Se suma a su parte del turno.</small>
        </span>
        <span className="flex gap-1.5">
          {SURCHARGES.map((v) => (
            <button
              key={v}
              type="button"
              disabled={saving || !cfg.enabled}
              aria-pressed={cfg.surcharge === v}
              onClick={() => save({ ...cfg, surcharge: v })}
              className={`h-9 cursor-pointer rounded-[10px] border px-2.5 text-[13px] font-semibold tabular-nums disabled:cursor-default ${cfg.surcharge === v ? 'border-brand bg-brand text-white' : 'border-line bg-white text-ink'}`}
            >
              ${v}
            </button>
          ))}
        </span>
      </div>
      <div className={row}>
        <span>
          <b className="block text-[14.5px] font-semibold text-ink">Mis jugadores en otros clubes</b>
          <small className="mt-0.5 block text-[12.5px] text-muted">Si lo apagás, la app nunca ofrece a tus jugadores en otros clubes.</small>
        </span>
        <Switch on={cfg.shareMyPlayers !== false} disabled={saving} label="Mis jugadores en otros clubes" onChange={(v) => save({ ...cfg, shareMyPlayers: v })} />
      </div>
      {msg && <p className="mt-1 text-xs text-muted">{msg}</p>}
    </section>
  );
}

// ---------- Amigos: "Invitar a <club>" ----------

export function useMyGuestPasses(clubId: string, uid: string): GuestPass[] {
  const [items, setItems] = useState<GuestPass[]>([]);
  useEffect(() => subscribeMyGuestPasses(clubId, uid, setItems), [clubId, uid]);
  return items;
}

export function GuestPassButton({ club, friendUid, passes, onToast }: { club: Club; friendUid: string; passes: GuestPass[]; onToast: (m: string) => void }) {
  const [busy, setBusy] = useState(false);
  const has = passes.some((p) => p.uid === friendUid);
  const run = async () => {
    setBusy(true);
    try {
      if (has) {
        await removeGuestFriend(club.id, friendUid);
        onToast('Listo, ya no recibe avisos como invitado.');
      } else {
        await authorizeGuestFriend(club.id, friendUid);
        onToast(`Listo. Le avisamos que lo invitaste a ${club.name}.`);
      }
    } catch (e) {
      onToast(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      type="button"
      disabled={busy}
      onClick={run}
      data-testid="invitar-al-club"
      className={`inline-flex min-h-[36px] shrink-0 cursor-pointer items-center rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap disabled:opacity-50 ${
        has ? 'border border-line text-muted hover:bg-mist' : 'border border-brand text-brand hover:bg-brand/5'
      }`}
    >
      {has ? `Invitado en ${club.name} ✓` : `Invitar a ${club.name}`}
    </button>
  );
}

// ---------- Inicio del invitado: "Te invitan a jugar" ----------

const clubCache = new Map<string, Club>();
async function loadClub(id: string): Promise<Club | null> {
  if (clubCache.has(id)) return clubCache.get(id)!;
  try {
    const s = await getDoc(doc(db, 'clubs', id));
    if (!s.exists()) return null;
    const c = { ...(s.data() as Club), id };
    clubCache.set(id, c);
    return c;
  } catch {
    return null;
  }
}

export function InvitacionesOtrosClubes({ uid, onToast }: { uid: string; onToast: (m: string) => void }) {
  const [items, setItems] = useState<FillInvite[]>([]);
  const [clubs, setClubs] = useState<Record<string, Club>>({});
  useEffect(() => subscribeMyGuestInvites(uid, setItems), [uid]);
  useEffect(() => {
    const missing = [...new Set(items.map((i) => i.clubId))].filter((id) => !clubs[id]);
    if (!missing.length) return;
    Promise.all(missing.map(loadClub)).then((cs) =>
      setClubs((prev) => ({ ...prev, ...Object.fromEntries(cs.filter((c): c is Club => !!c).map((c) => [c.id, c])) }))
    );
  }, [items, clubs]);
  const today = new Date().toISOString().slice(0, 10);
  const live = items.filter((i) => i.date >= today).sort((a, b) => (a.date + a.startMinute).localeCompare(b.date + b.startMinute));
  if (!live.length) return null;
  return (
    <div className="grid gap-3">
      {live.map((i) => (
        <GuestInviteCard key={i.id} invite={i} club={clubs[i.clubId]} onToast={onToast} />
      ))}
    </div>
  );
}

function GuestInviteCard({ invite, club, onToast }: { invite: FillInvite; club?: Club; onToast: (m: string) => void }) {
  const [busy, setBusy] = useState(false);
  const g = invite.guest!;
  const name = club?.name ?? 'Otro club';
  const initials = name.split(/\s+/).filter((w) => /^[A-ZÁÉÍÓÚÑ]/.test(w)).slice(0, 2).map((w) => w[0]).join('') || 'AP';
  const act = async (join: boolean) => {
    setBusy(true);
    try {
      if (join) {
        const r = await claimGuestSeat(invite.clubId, invite.searchId);
        onToast(r === 'won' ? `¡Adentro! Jugás en ${name}.` : r === 'busy' ? 'Ya tenés otro partido a esa hora.' : 'Llegaste tarde: ya se completó.');
      } else {
        await declineGuestInvite(invite.clubId, invite.searchId);
        onToast('Listo, le avisamos a otro.');
      }
    } catch (e) {
      onToast(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="rounded-xl border border-line bg-white p-4" data-testid="invitacion-otro-club">
      <div className="mb-2.5 flex items-center gap-2.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] text-[13px] font-bold text-white" style={{ background: club?.primaryColor || '#0a5761' }}>
          {initials}
        </span>
        <span className="min-w-0">
          <b className="block truncate text-[15px] font-semibold text-ink">{name}</b>
          <small className="text-[13px] text-muted">Te invitan a jugar</small>
        </span>
      </div>
      <h3 className="font-display text-[17px] font-bold text-ink tabular-nums">
        {formatDateFriendly(invite.date, false)} · {formatMinutes(invite.startMinute)} · {invite.courtName}
      </h3>
      <p className="text-[13.5px] text-muted">
        {formatCategory(g.category)} · falta 1
        {club && (
          <>
            {' · '}
            <a href={mapsUrl(club)} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand hover:underline">
              Cómo llegar
            </a>
          </>
        )}
      </p>
      <p className="mt-2.5 text-[15px] text-ink">
        Tu parte: <b className="tabular-nums">${invite.pricePerPlayer}</b>
        {g.surcharge > 0 && <small className="text-[13px] text-muted"> (incluye ${g.surcharge} de invitado)</small>}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" disabled={busy} onClick={() => act(true)} className="h-11 cursor-pointer rounded-xl bg-action text-[15px] font-semibold text-on-action disabled:opacity-60">
          Me sumo
        </button>
        <button type="button" disabled={busy} onClick={() => act(false)} className="h-11 cursor-pointer rounded-xl border border-line bg-white text-[15px] font-semibold text-ink hover:bg-mist disabled:opacity-60">
          No puedo
        </button>
      </div>
      <p className="mt-2 text-[12.5px] text-muted">Pagás en el club, como siempre.</p>
    </section>
  );
}
