// Resultados con confirmación del rival, racha del jugador y sugerencias de categoría al club
// (etapa 6a; decisiones 4.1, 4.2 y 4.3 de Ber, OK a la vista previa 17/11/2026).
import { useEffect, useMemo, useState } from 'react';
import type { Booking, CategorySuggestion, Club, ClubMembership, MatchResult, Tournament, UserProfile } from '../types/padel';
import { formatCategory, formatDateFriendly, formatMinutes, getTodayISO } from '../lib/padelUtils';
import { REGLAS_CATEGORIA, playerStreak } from '../lib/resultados';
import {
  UserFacingError,
  confirmMatchResult,
  decideCategorySuggestion,
  reportMatchResult,
  subscribeCategorySuggestions,
  subscribeMyResults,
} from '../services/firestoreService';
import { CategoryBadge } from './ui/People';

const first = (n?: string) => (n || 'Alguien').split(' ')[0];
/** Marcador sin cortes de línea en medio de un set (guion que no se parte). */
const nb = (score: string) => score.replace(/-/g, '\u2011');
const btn = 'h-11 w-full cursor-pointer rounded-xl bg-brand px-4 text-[15px] font-semibold text-white disabled:opacity-60';
const ghost = 'h-11 w-full cursor-pointer rounded-xl border border-line bg-white px-4 text-[15px] font-semibold text-ink hover:bg-mist disabled:opacity-60';

function bookingEndMs(b: Pick<Booking, 'date' | 'endMinute'>): number {
  const d = new Date(`${b.date}T00:00:00`);
  d.setMinutes(b.endMinute);
  return d.getTime();
}

function errMsg(e: unknown) {
  return e instanceof UserFacingError ? e.message : 'No pudimos guardarlo. Probá de nuevo.';
}

export function useMyResults(clubId: string | undefined, uid: string): MatchResult[] {
  const [items, setItems] = useState<MatchResult[]>([]);
  useEffect(() => (clubId ? subscribeMyResults(clubId, uid, setItems) : undefined), [clubId, uid]);
  return items;
}

/** Partidos de 4 ya jugados (hasta 7 días) donde estuvo el jugador. */
function playedFours(bookings: Booking[], uid: string, nowMs: number): Booking[] {
  const limit = REGLAS_CATEGORIA.diasParaCargar * 864e5;
  return bookings.filter(
    (b) =>
      b.status === 'confirmed' &&
      new Set(b.playerUids ?? []).size === 4 &&
      b.playerUids.includes(uid) &&
      bookingEndMs(b) <= nowMs &&
      nowMs - bookingEndMs(b) <= limit
  );
}

// ---------- Inicio: cargar y confirmar ----------

export function ResultadosInicio({
  club,
  bookings,
  memberships,
  userProfile,
  onToast,
}: {
  club: Club;
  bookings: Booking[];
  memberships: ClubMembership[];
  userProfile: UserProfile;
  onToast: (m: string) => void;
}) {
  const uid = userProfile.uid;
  const mine = useMyResults(club.id, uid);
  const byId = new Map(mine.map((r) => [r.bookingId, r]));
  const nowMs = Date.now();
  const toLoad = playedFours(bookings, uid, nowMs)
    .filter((b) => {
      const r = byId.get(b.id);
      return !r || r.status === 'disputed';
    })
    .sort((a, b) => bookingEndMs(b) - bookingEndMs(a))
    .slice(0, 2);
  const toConfirm = mine.filter((r) => {
    if (r.status !== 'pending' || new Date(r.expiresAt).getTime() <= nowMs) return false;
    const reporterTeam = r.teamA.includes(r.reportedBy) ? r.teamA : r.teamB;
    return !reporterTeam.includes(uid);
  });
  if (!toLoad.length && !toConfirm.length) return null;
  const names = new Map(memberships.map((m) => [m.uid, m.displayName]));
  return (
    <div className="grid gap-3">
      {toConfirm.map((r) => (
        <ConfirmCard key={r.id} club={club} result={r} onToast={onToast} />
      ))}
      {toLoad.map((b) => (
        <LoadCard key={b.id} club={club} booking={b} uid={uid} names={names} onToast={onToast} />
      ))}
    </div>
  );
}

function when(date: string, startMinute: number, courtName: string) {
  return `${formatDateFriendly(date, false)} · ${formatMinutes(startMinute)} · ${courtName}`;
}

function LoadCard({ club, booking, uid, names, onToast }: { club: Club; booking: Booking; uid: string; names: Map<string, string>; onToast: (m: string) => void }) {
  const hasTeams = booking.teamA?.length === 2 && booking.teamB?.length === 2;
  const [partner, setPartner] = useState('');
  const [winner, setWinner] = useState<'A' | 'B' | ''>('');
  const [score, setScore] = useState('');
  const [busy, setBusy] = useState(false);
  const others = booking.playerUids.filter((u) => u !== uid);
  const teams: [string[], string[]] | null = hasTeams
    ? [booking.teamA!, booking.teamB!]
    : partner
      ? [[uid, partner], others.filter((u) => u !== partner)]
      : null;
  const label = (t: string[]) => t.map((u) => names.get(u) ?? 'Jugador');

  const send = async () => {
    if (!winner) return;
    setBusy(true);
    try {
      await reportMatchResult({ clubId: club.id, bookingId: booking.id, winner, score: score.trim(), partnerUid: hasTeams ? undefined : partner });
      onToast('Listo. Ahora lo confirma alguien de la otra pareja.');
    } catch (e) {
      onToast(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-xl border border-line bg-white p-4" data-testid="cargar-resultado">
      <h3 className="font-display text-[17px] font-bold text-ink">¿Cómo salió el partido?</h3>
      <p className="text-[13.5px] text-muted tabular-nums">{when(booking.date, booking.startMinute, booking.courtName)}</p>
      {!hasTeams && (
        <>
          <p className="mt-3 mb-1.5 text-[13px] font-semibold text-ink">¿Con quién jugaste?</p>
          <div className="grid grid-cols-3 gap-2">
            {others.map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => {
                  setPartner(u);
                  setWinner('');
                }}
                className={`min-h-11 cursor-pointer rounded-xl border-2 px-2 py-1.5 text-[13.5px] font-semibold ${partner === u ? 'border-brand bg-emerald-50 text-ink' : 'border-line bg-surface text-ink'}`}
              >
                {first(names.get(u))}
              </button>
            ))}
          </div>
        </>
      )}
      {teams && (
        <>
          <p className="mt-3 mb-1.5 text-[13px] font-semibold text-ink">¿Quién ganó? Tocá la pareja</p>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            {(['A', 'B'] as const).map((t, i) => (
              <button
                key={t}
                type="button"
                onClick={() => setWinner(t)}
                style={{ gridColumn: i === 0 ? 1 : 3, gridRow: 1 }}
                className={`cursor-pointer rounded-xl border-2 p-2.5 text-center text-sm font-semibold leading-snug text-ink ${winner === t ? 'border-brand bg-emerald-50' : 'border-line bg-surface'}`}
              >
                {label(teams[i]).map((n) => (
                  <span key={n} className="block truncate">
                    {n}
                  </span>
                ))}
              </button>
            ))}
            <span className="text-xs text-muted" style={{ gridColumn: 2, gridRow: 1 }}>
              contra
            </span>
          </div>
          <label className="mt-3 grid gap-1.5 text-[13px] font-semibold text-ink">
            Marcador (opcional)
            <input value={score} onChange={(e) => setScore(e.target.value)} maxLength={40} placeholder="6-4 6-3" className="h-11 rounded-xl border border-line bg-white px-3 text-[15px] font-normal tabular-nums" />
          </label>
          <button type="button" disabled={!winner || busy} onClick={send} className={`${btn} mt-3`}>
            {busy ? 'Guardando…' : 'Cargar resultado'}
          </button>
        </>
      )}
      <p className="mt-2 text-[12.5px] text-muted">Cuenta cuando lo confirme uno de la otra pareja (tienen 48 h).</p>
    </section>
  );
}

function ConfirmCard({ club, result, onToast }: { club: Club; result: MatchResult; onToast: (m: string) => void }) {
  const [busy, setBusy] = useState(false);
  const win = result.winner === 'A' ? result.teamA : result.teamB;
  const answer = async (agree: boolean) => {
    setBusy(true);
    try {
      await confirmMatchResult({ clubId: club.id, bookingId: result.bookingId, agree });
      onToast(agree ? 'Gracias, quedó confirmado.' : 'Listo, no cuenta. Le avisamos para que lo vuelvan a cargar.');
    } catch (e) {
      onToast(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="rounded-xl border border-line bg-white p-4" data-testid="confirmar-resultado">
      <h3 className="font-display text-[17px] font-bold text-ink">{first(result.names[result.reportedBy])} cargó el resultado</h3>
      <p className="text-[13.5px] text-muted tabular-nums">{when(result.date, result.startMinute, result.courtName)}</p>
      <p className="mt-2.5 text-[15px] text-ink">
        Ganaron <b>{win.map((u) => first(result.names[u])).join(' y ')}</b>
        {result.score ? `, ${nb(result.score)}` : ''}.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" disabled={busy} onClick={() => answer(true)} className={btn}>
          Sí, es así
        </button>
        <button type="button" disabled={busy} onClick={() => answer(false)} className={ghost}>
          No fue así
        </button>
      </div>
      <p className="mt-2 text-[12.5px] text-muted">Si nadie confirma en 48 h, el partido queda sin resultado y no cuenta.</p>
    </section>
  );
}

// ---------- Perfil: Mis partidos ----------

interface Row {
  id: string;
  date: string;
  title: string;
  detail: string;
  state: 'win' | 'loss' | 'pending' | 'none';
}

export function MisPartidos({
  club,
  userProfile,
  bookings,
  tournaments,
}: {
  club: Club | null;
  userProfile: UserProfile;
  bookings: Booking[];
  tournaments: Tournament[];
}) {
  const uid = userProfile.uid;
  const results = useMyResults(club?.id, uid);
  const [all, setAll] = useState(false);
  const today = getTodayISO();

  const { rows, dates } = useMemo(() => {
    const rows: Row[] = [];
    const dates: string[] = [];
    const nowMs = Date.now();
    const byBooking = new Map(results.map((r) => [r.bookingId, r]));
    for (const b of bookings) {
      if (b.status !== 'confirmed' || !(b.playerUids ?? []).includes(uid) || b.playerUids.length < 2 || bookingEndMs(b) > nowMs) continue;
      dates.push(b.date);
      const r = byBooking.get(b.id);
      if (r) {
        const myTeam = r.teamA.includes(uid) ? r.teamA : r.teamB;
        const rivals = myTeam === r.teamA ? r.teamB : r.teamA;
        const partner = myTeam.find((u) => u !== uid);
        const state: Row['state'] =
          r.status === 'confirmed' ? ((r.winner === 'A') === (myTeam === r.teamA) ? 'win' : 'loss') : r.status === 'pending' ? 'pending' : 'none';
        rows.push({
          id: b.id,
          date: b.date,
          title: partner ? `con ${r.names[partner]}` : 'Partido',
          detail: `contra ${rivals.map((u) => first(r.names[u])).join(' y ')}${r.score ? ` · ${nb(r.score)}` : ''}`,
          state,
        });
      } else if (b.playerUids.length === 4) {
        rows.push({ id: b.id, date: b.date, title: `Partido en ${b.courtName}`, detail: formatMinutes(b.startMinute), state: 'none' });
      }
    }
    for (const t of tournaments) {
      const pair = t.pairs.find((p) => p.player1Uid === uid || p.player2Uid === uid);
      if (!pair) continue;
      const partner = pair.player1Uid === uid ? pair.player2Name : pair.player1Name;
      for (const m of t.matches) {
        if (m.status !== 'completed' || (m.pair1Id !== pair.id && m.pair2Id !== pair.id)) continue;
        dates.push(m.date);
        rows.push({
          id: `trn_${t.id}_${m.id}`,
          date: m.date,
          title: `${t.name}, ${m.round.toLowerCase()}`,
          detail: `con ${first(partner)}${m.score ? ` · ${nb(m.score)}` : ''}`,
          state: m.winnerPairId === pair.id ? 'win' : 'loss',
        });
      }
    }
    rows.sort((a, b) => b.date.localeCompare(a.date));
    return { rows, dates };
  }, [results, bookings, tournaments, uid]);

  const s = playerStreak(dates, today);
  const shown = all ? rows : rows.slice(0, 5);
  const STATE: Record<Row['state'], { text: string; cls: string }> = {
    win: { text: 'Ganado', cls: 'text-ok' },
    loss: { text: 'Perdido', cls: 'text-due' },
    pending: { text: 'Falta que confirmen', cls: 'text-wait text-[13px]' },
    none: { text: 'Sin resultado', cls: 'text-muted text-[13px] font-medium' },
  };

  return (
    <div data-testid="mis-partidos">
      <h3 className="font-display text-base font-bold text-ink">Mis partidos</h3>
      <div className="mt-3 grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)] lg:items-start">
        <div className="grid grid-cols-3 gap-2">
          <Stat n={s.played} label={s.played === 1 ? 'jugado' : 'jugados'} />
          <Stat n={s.thisMonth} label="este mes" />
          <Stat n={s.weeksInARow} label={s.weeksInARow === 1 ? 'semana seguida' : 'semanas seguidas'} />
        </div>
        <div className="min-w-0">
          {rows.length === 0 ? (
            <p className="text-sm text-muted">Todavía no hay partidos. Cuando termines uno de 4, cargás el resultado desde Inicio.</p>
          ) : (
            shown.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 border-t border-line py-2.5 first:border-0 first:pt-0">
                <span className="min-w-0">
                  <b className="block truncate text-[14.5px] font-semibold text-ink">{r.title}</b>
                  <small className="text-[12.5px] text-muted">
                    {formatDateFriendly(r.date, false)} · {r.detail}
                  </small>
                </span>
                <span className={`max-w-[92px] shrink-0 text-right text-sm leading-tight font-semibold ${STATE[r.state].cls}`}>{STATE[r.state].text}</span>
              </div>
            ))
          )}
          {rows.length > 5 && (
            <button type="button" className="mt-1 cursor-pointer text-sm font-semibold text-brand hover:underline" onClick={() => setAll((v) => !v)}>
              {all ? 'Ver menos' : `Ver los ${rows.length}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div className="rounded-[10px] bg-surface p-2.5">
      <b className="block font-display text-2xl leading-none font-bold text-ink tabular-nums">{n}</b>
      <small className="text-xs text-muted">{label}</small>
    </div>
  );
}

// ---------- Admin: sugerencias de categoría ----------

export function useCategorySuggestions(clubId: string | undefined, enabled: boolean): CategorySuggestion[] {
  const [items, setItems] = useState<CategorySuggestion[]>([]);
  useEffect(() => (clubId && enabled ? subscribeCategorySuggestions(clubId, setItems) : undefined), [clubId, enabled]);
  return items.filter((s) => s.status === 'pending');
}

export function SugerenciasCategoria({ club, items, onToast }: { club: Club; items: CategorySuggestion[]; onToast: (m: string) => void }) {
  const [busy, setBusy] = useState('');
  if (!items.length) return null;
  const decide = async (s: CategorySuggestion, accept: boolean) => {
    setBusy(s.uid);
    try {
      await decideCategorySuggestion({ clubId: club.id, uid: s.uid, accept });
      onToast(accept ? `Listo, ${first(s.displayName)} pasa a ${formatCategory(s.to)}. Le avisamos.` : `Listo, ${first(s.displayName)} sigue en ${formatCategory(s.from)}.`);
    } catch (e) {
      onToast(errMsg(e));
    } finally {
      setBusy('');
    }
  };
  return (
    <section className="mb-4 rounded-2xl border border-line bg-white p-5" data-testid="sugerencias-categoria">
      <h2 className="font-display text-lg font-bold text-ink">Sugerencias de categoría</h2>
      <p className="mt-0.5 text-sm text-muted">Salen de los resultados confirmados. Vos decidís.</p>
      <div className="mt-2 divide-y divide-line">
        {items.map((s) => (
          <div key={s.uid} className="py-3.5">
            <p className="flex flex-wrap items-center gap-1.5 text-[15px] text-ink">
              <b className="font-semibold">{s.displayName}</b>
              <span className="text-muted">· {s.to < s.from ? 'subir' : 'bajar'} de</span>
              <CategoryBadge category={s.from} />
              <span className="text-muted">a</span>
              <CategoryBadge category={s.to} />
            </p>
            <p className="mt-1 text-[13.5px] text-muted">{s.reason}</p>
            <div className="mt-2.5 grid max-w-md grid-cols-2 gap-2">
              <button type="button" disabled={busy === s.uid} onClick={() => decide(s, true)} className={btn}>
                {s.to < s.from ? 'Subir' : 'Bajar'} a {formatCategory(s.to)}
              </button>
              <button type="button" disabled={busy === s.uid} onClick={() => decide(s, false)} className={ghost}>
                Dejar en {formatCategory(s.from)}
              </button>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-1 text-[12.5px] text-muted">Si decís que no, no se vuelve a sugerir hasta {REGLAS_CATEGORIA.esperaTrasNo} partidos más. El jugador no ve la sugerencia, solo el cambio.</p>
    </section>
  );
}
