// "Prefiero no jugar con" (etapa 5 del algoritmo, decisión 4.7 de Ber, 17/11/2026).
// Es privado: queda en el perfil del jugador y solo lo lee él. El servidor lo usa para no juntarlos
// en un partido; nadie se entera, ni el otro jugador ni el club.
import { useState } from 'react';
import type { ClubMembership, UserProfile } from '../types/padel';
import { updateAvoidUids } from '../services/firestoreService';
import { CategoryBadge } from './ui/People';

export function PrefieroNo({
  userProfile,
  memberships,
  onProfileUpdated,
  onToast,
  onOpenFriends,
}: {
  userProfile: UserProfile;
  memberships: ClubMembership[];
  onProfileUpdated: (next: UserProfile) => void;
  onToast: (msg: string) => void;
  onOpenFriends?: () => void;
}) {
  const avoid = userProfile.avoidUids ?? [];
  const [pick, setPick] = useState('');
  const [saving, setSaving] = useState(false);
  const byUid = new Map(memberships.map((m) => [m.uid, m]));
  const options = memberships
    .filter((m) => m.uid !== userProfile.uid && m.role === 'player' && !avoid.includes(m.uid))
    .sort((a, b) => a.displayName.localeCompare(b.displayName, 'es-UY'));

  const save = async (next: string[], msg: string) => {
    setSaving(true);
    try {
      await updateAvoidUids(userProfile.uid, next);
      onProfileUpdated({ ...userProfile, avoidUids: next });
      onToast(msg);
    } catch {
      onToast('No pudimos guardar. Probá de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-2xl border border-line bg-white p-5 sm:p-6">
      <h2 className="font-display text-lg font-bold text-ink">Con quién jugás</h2>
      <p className="mt-1 text-sm text-muted">
        Para jugar más seguido con alguien, sumalo a{' '}
        {onOpenFriends ? (
          <button type="button" onClick={onOpenFriends} className="font-semibold text-brand underline-offset-2 hover:underline cursor-pointer">
            tus amigos
          </button>
        ) : (
          'tus amigos'
        )}
        : cuando la app arma partidos, los junta si puede.
      </p>

      <p className="mt-5 text-xs font-semibold tracking-wider text-muted uppercase">Prefiero no jugar con</p>
      <p className="mt-1 text-xs text-muted">Es privado: nadie se entera, ni esa persona ni el club. Solo hacemos que no les toque el mismo partido.</p>

      {avoid.length > 0 && (
        <ul className="mt-3 divide-y divide-line">
          {avoid.map((u) => {
            const m = byUid.get(u);
            return (
              <li key={u} className="flex items-center justify-between gap-3 py-2.5">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-sm font-medium text-ink">{m?.displayName ?? 'Jugador de otro club'}</span>
                  {m && <CategoryBadge category={m.category} />}
                </span>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => save(avoid.filter((x) => x !== u), 'Listo, lo sacamos de la lista.')}
                  className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-muted hover:bg-slate-50 cursor-pointer"
                >
                  Quitar
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-3 flex gap-2">
        <select
          value={pick}
          onChange={(e) => setPick(e.target.value)}
          className="min-w-0 flex-1 rounded-xl border border-line bg-white px-3 py-2.5 text-sm text-ink"
        >
          <option value="">Elegí un jugador del club</option>
          {options.map((m) => (
            <option key={m.uid} value={m.uid}>
              {m.displayName}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={!pick || saving || avoid.length >= 20}
          onClick={() => save([...avoid, pick], 'Listo. Nadie se entera.').then(() => setPick(''))}
          className="rounded-xl border border-brand px-4 py-2.5 text-sm font-semibold text-brand hover:bg-brand/5 disabled:opacity-50 cursor-pointer"
        >
          Agregar
        </button>
      </div>
    </section>
  );
}
