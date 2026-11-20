// "Mi pareja fija" en Perfil → Mi juego (20/11/2026, decisiones de Ber: en el perfil y la app busca sola;
// contra otra pareja o dos sueltos; varias parejas, cada una con sus días).
import React, { useEffect, useMemo, useState } from 'react';
import type { ClubMembership, FixedPair, Modality, UserFriend, UserProfile } from '../types/padel';
import { FRANJAS, GRID_DAYS, SIDE_LABEL, gridFromWindows, gridKey, hourLabel } from '../lib/registro';
import { cellsSentence, MAX_PAREJAS, sharedCells } from '../lib/parejaFija';
import { guardarPareja, invitarPareja, responderPareja, subscribeMyPairs, terminarPareja } from '../services/parejaService';
import { subscribeUserFriends } from '../services/firestoreService';
import { CategoryBadge, PairAvatar, PlayerAvatar } from './ui/People';

const card = 'rounded-xl border border-line bg-white p-4';
const btnDark = 'h-10 cursor-pointer rounded-xl bg-brand px-4 text-sm font-semibold text-white disabled:opacity-60';
const btnGhost = 'h-10 cursor-pointer rounded-xl border border-line bg-white px-4 text-sm font-semibold text-ink hover:bg-mist disabled:opacity-60';
const chip = (on: boolean) =>
  `h-9 cursor-pointer rounded-full border px-3.5 text-[13px] font-semibold ${on ? 'border-brand bg-brand text-white' : 'border-line bg-white text-ink hover:bg-mist'}`;

const PER_WEEK_LABEL: Record<0 | 1 | 2, string> = { 1: '1 por semana', 2: '2 por semana', 0: 'Uno por cada horario' };
const MODALITY_LABEL: Record<Modality, string> = { masculino: 'Masculinos', femenino: 'Femeninos', mixto: 'Mixtos' };

type View = { kind: 'list' } | { kind: 'invite' } | { kind: 'edit'; pairId: string };

export const ParejaFija: React.FC<{
  clubId?: string;
  userProfile: UserProfile;
  memberships: ClubMembership[];
  onToast: (msg: string) => void;
}> = ({ clubId, userProfile, memberships, onToast }) => {
  const [pairs, setPairs] = useState<FixedPair[]>([]);
  const [view, setView] = useState<View>({ kind: 'list' });
  const [busy, setBusy] = useState('');

  useEffect(() => {
    if (!clubId) return;
    return subscribeMyPairs(clubId, userProfile.uid, setPairs);
  }, [clubId, userProfile.uid]);

  const byUid = useMemo(() => new Map(memberships.map((m) => [m.uid, m])), [memberships]);
  const me = userProfile.uid;
  const other = (p: FixedPair) => p.uids.find((u) => u !== me) ?? '';

  const run = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key);
    try {
      await fn();
      onToast(ok);
      return true;
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'No pudimos guardar. Probá de nuevo.');
      return false;
    } finally {
      setBusy('');
    }
  };

  if (!clubId) return null;

  if (view.kind === 'invite') {
    return (
      <InvitePanel
        me={userProfile}
        memberships={memberships}
        taken={new Set(pairs.map(other))}
        busy={busy}
        onBack={() => setView({ kind: 'list' })}
        onInvite={async (m) => {
          const done = await run(`inv-${m.uid}`, () => invitarPareja(clubId, m.uid), `Listo, le mandamos la invitación a ${m.displayName}.`);
          if (done) setView({ kind: 'list' });
        }}
      />
    );
  }

  const editing = view.kind === 'edit' ? pairs.find((p) => p.id === view.pairId) : undefined;
  if (editing) {
    const o = other(editing);
    return (
      <PairEditor
        pair={editing}
        me={userProfile}
        partner={byUid.get(o)}
        partnerName={editing.names[o] ?? 'tu pareja'}
        busy={busy}
        onBack={() => setView({ kind: 'list' })}
        onSave={async (changes) => {
          const done = await run('save', () => guardarPareja(clubId, editing.id, changes), 'Listo, guardamos los horarios de la pareja.');
          if (done) setView({ kind: 'list' });
        }}
        onEnd={async () => {
          const done = await run('end', () => terminarPareja(clubId, editing.id), 'Terminaste la pareja fija.');
          if (done) setView({ kind: 'list' });
        }}
      />
    );
  }

  const alive = pairs.filter((p) => p.status !== 'ended');
  return (
    <section className={`${card} lg:col-span-2`} data-testid="pareja-fija">
      <h3 className="font-display text-base font-bold text-ink">Mi pareja fija</h3>
      <p className="mt-1 text-sm text-muted">
        Anotate con alguien con quien siempre jugás. La app les busca rivales en los horarios que pueden los dos, sin torneo: otra pareja o dos jugadores sueltos.
      </p>

      {alive.map((p) => {
        const o = other(p);
        const om = byUid.get(o);
        const received = p.status === 'pending' && p.creatorUid !== me;
        const sent = p.status === 'pending' && p.creatorUid === me;
        return (
          <div key={p.id} className="mt-3 border-t border-line pt-3" data-testid={`pareja-${o}`}>
            <div className="flex items-center gap-3">
              <PairAvatar a={{ name: userProfile.displayName, photoUrl: userProfile.photoUrl }} b={{ name: p.names[o], photoUrl: om?.photoUrl }} size={40} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14.5px] font-semibold text-ink">
                  {received ? `${p.names[o]} te invita a ser su pareja fija` : `Vos y ${p.names[o]}`}{' '}
                  {om ? <CategoryBadge category={om.category} size={18} showSuffix={false} className="ml-1 align-[-3px]" /> : null}
                </p>
                <p className="text-[13px] text-muted">
                  {sent
                    ? `Esperando que ${p.names[o]} acepte`
                    : received
                      ? 'Si aceptás, la app les busca rivales todas las semanas.'
                      : !p.searching
                        ? 'Búsqueda apagada'
                        : p.cells.length
                          ? `${cellsSentence(p.cells)} · ${PER_WEEK_LABEL[p.perWeek].toLowerCase()}`
                          : 'Falta marcar cuándo pueden jugar'}
                </p>
              </div>
            </div>
            {p.status === 'active' && (p.clashes?.length ?? 0) > 0 && (
              <p className="mt-2 rounded-lg bg-wait-bg px-3 py-2 text-[12.5px] text-wait">
                {p.clashes!.length === 1 ? 'Un horario no se busca' : `${p.clashes!.length} horarios no se buscan`} porque uno de los dos ya tiene otro pedido a esa hora en Armar partido.
              </p>
            )}
            <div className="mt-2.5 flex flex-wrap gap-2">
              {received ? (
                <>
                  <button type="button" className={btnDark} disabled={!!busy} onClick={() => run('ok', () => responderPareja(clubId, p.id, true), `Listo, ya son pareja fija con ${p.names[o]}.`)}>
                    Aceptar
                  </button>
                  <button type="button" className={btnGhost} disabled={!!busy} onClick={() => run('no', () => responderPareja(clubId, p.id, false), 'Listo, no aceptaste la invitación.')}>
                    Ahora no
                  </button>
                </>
              ) : sent ? (
                <button type="button" className={btnGhost} disabled={!!busy} onClick={() => run('cancel', () => terminarPareja(clubId, p.id), 'Cancelaste la invitación.')}>
                  Cancelar invitación
                </button>
              ) : (
                <button type="button" className={btnGhost} onClick={() => setView({ kind: 'edit', pairId: p.id })} data-testid={`editar-pareja-${o}`}>
                  Horarios y búsqueda
                </button>
              )}
            </div>
          </div>
        );
      })}

      {alive.length < MAX_PAREJAS ? (
        <button type="button" onClick={() => setView({ kind: 'invite' })} className={`${btnGhost} mt-3 w-full border-brand text-brand`} data-testid="invitar-pareja">
          {alive.length ? '+ Invitar a otra pareja fija' : '+ Invitar a mi pareja fija'}
        </button>
      ) : (
        <p className="mt-3 text-[13px] text-muted">Podés tener hasta {MAX_PAREJAS} parejas fijas.</p>
      )}
    </section>
  );
};

const InvitePanel: React.FC<{
  me: UserProfile;
  memberships: ClubMembership[];
  taken: Set<string>;
  busy: string;
  onBack: () => void;
  onInvite: (m: ClubMembership) => void;
}> = ({ me, memberships, taken, busy, onBack, onInvite }) => {
  const [text, setText] = useState('');
  const [friends, setFriends] = useState<UserFriend[]>([]);
  useEffect(() => subscribeUserFriends(me.uid, setFriends), [me.uid]);
  const friendSet = new Set(friends.map((f) => f.uid));
  const avoid = new Set(me.avoidUids ?? []);
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const list = memberships
    // Solo a una categoría o menos: con más diferencia la app nunca les arma partido (los 4 dentro de 1 categoría).
    .filter((m) => m.uid !== me.uid && m.role === 'player' && !m.blocked && !avoid.has(m.uid) && !taken.has(m.uid) && Math.abs(m.category - me.category) <= 1)
    .filter((m) => !text.trim() || norm(m.displayName).includes(norm(text.trim())))
    .map((m) => ({ m, shared: sharedCells(me.weeklyAvailability, m.weeklyAvailability).length }))
    .sort((a, b) => Math.abs(a.m.category - me.category) - Math.abs(b.m.category - me.category) || b.shared - a.shared || a.m.displayName.localeCompare(b.m.displayName, 'es-UY'));
  const groups = [
    { title: 'Tus amigos', items: list.filter((x) => friendSet.has(x.m.uid)) },
    { title: 'Otros jugadores del club', items: list.filter((x) => !friendSet.has(x.m.uid)).slice(0, 30) },
  ].filter((g) => g.items.length);

  return (
    <section className={`${card} lg:col-span-2`} data-testid="invitar-pareja-panel">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-display text-base font-bold text-ink">Invitar pareja fija</h3>
        <button type="button" onClick={onBack} className="cursor-pointer text-sm font-semibold text-brand hover:underline">
          Volver
        </button>
      </div>
      <p className="mt-1 text-sm text-muted">Le llega un aviso y tiene que aceptar. Aparecen los de tu categoría y los de una más arriba o más abajo, primero los que tienen más horarios en común con vos.</p>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Buscar por nombre…"
        className="mt-3 h-10 w-full rounded-xl border border-line bg-white px-3 text-sm text-ink"
        aria-label="Buscar jugador"
      />
      {groups.length === 0 && <p className="mt-3 text-sm text-muted">No encontramos jugadores con ese nombre.</p>}
      {groups.map((g) => (
        <div key={g.title} className="mt-4">
          <p className="text-xs font-semibold tracking-wider text-muted uppercase">{g.title}</p>
          {g.items.map(({ m, shared }) => (
            <div key={m.uid} className="flex items-center gap-3 border-b border-line py-2.5 last:border-0">
              <PlayerAvatar name={m.displayName} photoUrl={m.photoUrl} size={38} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14.5px] font-semibold text-ink">
                  {m.displayName} <CategoryBadge category={m.category} size={18} showSuffix={false} className="ml-1 align-[-3px]" />
                </p>
                <p className="text-[12.5px] text-muted">
                  {[m.courtSide ? SIDE_LABEL[m.courtSide] : '', shared ? `${shared} ${shared === 1 ? 'horario' : 'horarios'} en común` : 'sin horarios en común'].filter(Boolean).join(' · ')}
                </p>
              </div>
              <button type="button" className={`${btnDark} h-9 px-3`} disabled={!!busy} onClick={() => onInvite(m)} data-testid={`invitar-${m.uid}`}>
                Invitar
              </button>
            </div>
          ))}
        </div>
      ))}
      <p className="mt-3 text-[12.5px] text-muted">No aparecen los que pusiste en “Prefiero no jugar con”.</p>
    </section>
  );
};

const PairEditor: React.FC<{
  pair: FixedPair;
  me: UserProfile;
  partner?: ClubMembership;
  partnerName: string;
  busy: string;
  onBack: () => void;
  onSave: (changes: { cells: string[]; searching: boolean; perWeek: 0 | 1 | 2; modality: Modality }) => void;
  onEnd: () => void;
}> = ({ pair, me, partner, partnerName, busy, onBack, onSave, onEnd }) => {
  const [cells, setCells] = useState(new Set(pair.cells));
  const [searching, setSearching] = useState(pair.searching);
  const [perWeek, setPerWeek] = useState<0 | 1 | 2>(pair.perWeek);
  const [modality, setModality] = useState<Modality>(pair.modality);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const mine = gridFromWindows(me.weeklyAvailability ?? []);
  const theirs = gridFromWindows(partner?.weeklyAvailability ?? []);
  const first = partnerName.split(' ')[0];

  return (
    <section className={`${card} lg:col-span-2`} data-testid="pareja-editor">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-display text-base font-bold text-ink">Vos y {partnerName}</h3>
        <button type="button" onClick={onBack} className="cursor-pointer text-sm font-semibold text-brand hover:underline">
          Volver
        </button>
      </div>
      <p className="mt-1 text-sm text-muted">
        ¿Cuándo pueden jugar juntos? Tocá para marcar o sacar. Te mostramos qué horarios tiene libres cada uno; {first} ve los mismos cambios.
      </p>

      <div className="mt-3 grid grid-cols-[64px_repeat(7,minmax(0,1fr))] gap-1 text-xs sm:grid-cols-[76px_repeat(7,minmax(0,1fr))]">
        <span />
        {GRID_DAYS.map((d) => (
          <span key={d.dow} className="pb-0.5 text-center font-semibold text-muted">
            {d.short}
          </span>
        ))}
        {FRANJAS.map((f, i) => (
          <React.Fragment key={f.id}>
            <span className="flex flex-col justify-center text-[12.5px] leading-tight font-semibold text-ink">
              {f.label}
              <small className="text-[11px] font-normal text-muted">
                {hourLabel(f.from)} a {hourLabel(f.to)}
              </small>
            </span>
            {GRID_DAYS.map((d) => {
              const k = gridKey(d.dow, i);
              const on = cells.has(k);
              const both = mine.has(k) && theirs.has(k);
              const one = !both && (mine.has(k) || theirs.has(k));
              const hint = both ? '' : mine.has(k) ? 'vos' : theirs.has(k) ? first.slice(0, 6) : '';
              return (
                <button
                  key={k}
                  type="button"
                  aria-pressed={on}
                  aria-label={`${d.plural} a la ${f.label.toLowerCase()}${both ? ', libres los dos' : hint ? `, libre: ${hint}` : ''}`}
                  data-testid={`pareja-franja-${k}`}
                  onClick={() => {
                    const next = new Set(cells);
                    if (on) next.delete(k);
                    else next.add(k);
                    setCells(next);
                  }}
                  className={`h-10 cursor-pointer truncate rounded-lg border-[1.5px] px-0.5 text-[10px] font-semibold ${
                    on
                      ? 'border-brand bg-brand text-white'
                      : both
                        ? 'border-ok-fill bg-ok-bg text-ok'
                        : one
                          ? 'border-dashed border-[#b6cbcc] bg-white text-muted'
                          : 'border-dashed border-[#d3e2e3] bg-white text-transparent hover:bg-mist'
                  }`}
                >
                  {hint}
                </button>
              );
            })}
          </React.Fragment>
        ))}
      </div>
      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted">
        <span><span className="mr-1 inline-block h-3 w-3 rounded bg-brand align-[-2px]" />Buscamos partido</span>
        <span><span className="mr-1 inline-block h-3 w-3 rounded border border-ok-fill bg-ok-bg align-[-2px]" />Libres los 2</span>
        <span><span className="mr-1 inline-block h-3 w-3 rounded border border-dashed border-[#b6cbcc] align-[-2px]" />Libre solo uno (dice quién)</span>
      </p>

      <p className="mt-4 text-xs font-semibold tracking-wider text-muted uppercase">Cuántos partidos por semana</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {([1, 2, 0] as const).map((n) => (
          <button key={n} type="button" className={chip(perWeek === n)} onClick={() => setPerWeek(n)}>
            {PER_WEEK_LABEL[n]}
          </button>
        ))}
      </div>

      <p className="mt-4 text-xs font-semibold tracking-wider text-muted uppercase">Partidos</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {(['masculino', 'femenino', 'mixto'] as const).map((m) => (
          <button key={m} type="button" className={chip(modality === m)} onClick={() => setModality(m)}>
            {MODALITY_LABEL[m]}
          </button>
        ))}
      </div>

      <label className="mt-4 flex cursor-pointer items-center justify-between gap-3 rounded-xl bg-mist px-3 py-2.5">
        <span>
          <b className="block text-sm font-semibold text-ink">Buscar rivales todas las semanas</b>
          <small className="text-[12.5px] text-muted">Contra otra pareja o dos jugadores sueltos de su categoría.</small>
        </span>
        <input type="checkbox" checked={searching} onChange={(e) => setSearching(e.target.checked)} className="h-5 w-5 accent-[var(--color-brand)]" data-testid="pareja-buscar" />
      </label>

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className={btnDark} disabled={!!busy} onClick={() => onSave({ cells: [...cells].sort(), searching, perWeek, modality })} data-testid="pareja-guardar">
          Guardar
        </button>
        {confirmEnd ? (
          <>
            <button type="button" className={`${btnGhost} border-due text-due`} disabled={!!busy} onClick={onEnd}>
              Sí, terminar la pareja
            </button>
            <button type="button" className={btnGhost} onClick={() => setConfirmEnd(false)}>
              No
            </button>
          </>
        ) : (
          <button type="button" className={btnGhost} onClick={() => setConfirmEnd(true)}>
            Terminar pareja
          </button>
        )}
      </div>
      <p className="mt-2 text-[12.5px] text-muted">Los partidos que ya están armados siguen en pie aunque cambies los horarios o terminen la pareja.</p>
    </section>
  );
};
