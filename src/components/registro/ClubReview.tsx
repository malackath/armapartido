/** Lo que ve el club de los jugadores que se suman por la app (16/11/2026). */
import React, { useState } from 'react';
import { formatCategory } from '../../lib/padelUtils';
import { describeWindows, playStyleChips, MODALITY_PLURAL, SIDE_LABEL, HAND_LABEL } from '../../lib/registro';
import { reviewMemberCategory } from '../../services/registroService';
import type { Club, ClubMembership, UserProfile } from '../../types/padel';
import { CategoryBadge, PlayerAvatar } from '../ui/People';
import { CategoryLadder } from './parts';

function joinedLabel(m: ClubMembership): string {
  const ts = m.createdAt as { toDate?: () => Date } | undefined;
  const d = ts?.toDate?.();
  if (!d) return 'Se sumó por la app';
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  const when = days <= 0 ? 'hoy' : days === 1 ? 'ayer' : `hace ${days} días`;
  return `Se sumó por la app ${when}`;
}

/** Corregir la categoría: escalera compacta y confirmar. */
export const CategoryFixer: React.FC<{
  club: Club;
  member: ClubMembership;
  byUid: string;
  onDone: (msg: string) => void;
  onCancel: () => void;
}> = ({ club, member, byUid, onDone, onCancel }) => {
  const [cat, setCat] = useState<number>(member.category);
  const [busy, setBusy] = useState(false);
  return (
    <div className="mt-3 rounded-xl border border-line bg-surface p-3" data-testid="corregir-categoria">
      <p className="mb-2 text-sm font-semibold text-ink">¿En qué categoría juega {member.displayName.split(' ')[0]} en el club?</p>
      <CategoryLadder value={cat} onChange={setCat} compact />
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          data-testid="corregir-guardar"
          onClick={async () => {
            setBusy(true);
            try {
              await reviewMemberCategory({ club, member, category: cat, byUid });
              onDone(
                cat === member.category
                  ? `${member.displayName}: queda en ${formatCategory(cat)}.`
                  : `${member.displayName} pasa a ${formatCategory(cat)}. Le avisamos.`
              );
            } catch {
              onDone('No se pudo guardar. Probá de nuevo.');
            } finally {
              setBusy(false);
            }
          }}
          className="cursor-pointer rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {cat === member.category ? 'Dejar en ' : 'Pasar a '}
          {formatCategory(cat)}
        </button>
        <button type="button" onClick={onCancel} className="cursor-pointer rounded-xl border border-line bg-white px-4 py-2 text-sm font-semibold text-muted">
          Cancelar
        </button>
      </div>
    </div>
  );
};

/** Bloque "Se sumaron por la app": jugadores nuevos con la categoría que eligieron, para confirmar o corregir. */
export const NewMembersReview: React.FC<{
  club: Club;
  memberships: ClubMembership[];
  userProfile: UserProfile;
  onToast: (m: string) => void;
}> = ({ club, memberships, userProfile, onToast }) => {
  const [fixing, setFixing] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const pending = memberships.filter((m) => m.role === 'player' && m.categoryReview === 'pendiente');
  if (pending.length === 0) return null;
  return (
    <section className="mb-5 rounded-xl border border-line bg-white p-4 sm:p-5" data-testid="se-sumaron">
      <h3 className="font-display text-lg font-bold text-ink">
        Se {pending.length === 1 ? 'sumó' : 'sumaron'} por la app <span className="ml-1 rounded-full bg-action px-2 py-0.5 text-xs text-on-action">{pending.length}</span>
      </h3>
      <p className="mt-0.5 text-sm text-muted">Eligieron su categoría solos. Confirmala o corregila: si la cambiás, le avisamos.</p>
      <ul className="mt-4 grid gap-3">
        {pending.map((m) => {
          const chips = playStyleChips(m);
          const avail = describeWindows(m.weeklyAvailability ?? []);
          return (
            <li key={m.uid} className="rounded-xl border border-line p-3" data-testid={`nuevo-${m.uid}`}>
              <div className="flex flex-wrap items-start gap-3">
                <PlayerAvatar name={m.displayName} photoUrl={m.photoUrl} size={52} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-ink">{m.displayName}</p>
                  <p className="text-xs text-muted">{joinedLabel(m)}</p>
                  {chips.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {chips.map((c) => (
                        <span key={c} className="rounded-full bg-mist px-2 py-0.5 text-xs font-semibold text-[#26393c]">
                          {c}
                        </span>
                      ))}
                    </div>
                  )}
                  {avail.length > 0 && <p className="mt-1.5 text-xs text-muted">Puede: {avail.map((a) => `${a.days.toLowerCase()} de ${a.hours}`).join('; ')}</p>}
                </div>
                <span className="flex items-center gap-2 rounded-xl bg-mist px-2.5 py-1.5 text-sm font-semibold text-ink">
                  Eligió <CategoryBadge category={m.category} size={24} showSuffix={false} /> {formatCategory(m.category)}
                </span>
              </div>
              {fixing === m.uid ? (
                <CategoryFixer
                  club={club}
                  member={m}
                  byUid={userProfile.uid}
                  onCancel={() => setFixing(null)}
                  onDone={(msg) => {
                    setFixing(null);
                    onToast(msg);
                  }}
                />
              ) : (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy === m.uid}
                    data-testid={`ok-${m.uid}`}
                    onClick={async () => {
                      setBusy(m.uid);
                      try {
                        await reviewMemberCategory({ club, member: m, category: m.category, byUid: userProfile.uid });
                        onToast(`${m.displayName}: ${formatCategory(m.category)} confirmada.`);
                      } catch {
                        onToast('No se pudo guardar. Probá de nuevo.');
                      } finally {
                        setBusy(null);
                      }
                    }}
                    className="cursor-pointer rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    Está bien
                  </button>
                  <button
                    type="button"
                    data-testid={`corregir-${m.uid}`}
                    onClick={() => setFixing(m.uid)}
                    className="cursor-pointer rounded-xl border border-line bg-white px-4 py-2 text-sm font-semibold text-ink hover:bg-mist"
                  >
                    Corregir categoría
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
};

/** Pestaña "Juego" de la ficha del Mostrador: cómo juega el cliente que tiene la app. */
export const MemberGameTab: React.FC<{
  club: Club;
  member: ClubMembership;
  byUid: string;
  onToast: (m: string) => void;
}> = ({ club, member, byUid, onToast }) => {
  const [fixing, setFixing] = useState(false);
  const avail = describeWindows(member.weeklyAvailability ?? []);
  const row = (label: string, value: React.ReactNode) => (
    <div className="flex items-start justify-between gap-3 border-b border-[#eef5f5] py-2.5 last:border-0">
      <span className="text-sm text-muted">{label}</span>
      <span className="text-right text-sm font-semibold text-ink">{value}</span>
    </div>
  );
  return (
    <div data-testid="ficha-juego">
      {row(
        'Categoría',
        <span className="inline-flex items-center gap-2">
          <CategoryBadge category={member.category} size={24} showSuffix={false} />
          {formatCategory(member.category)}
          {member.categoryReview === 'pendiente' && <span className="rounded-full bg-[#fff1e8] px-2 py-0.5 text-xs text-wait">la eligió solo</span>}
          {!fixing && (
            <button type="button" onClick={() => setFixing(true)} className="cursor-pointer text-xs font-semibold text-brand underline" data-testid="ficha-corregir">
              {member.categoryReview === 'pendiente' ? 'Revisar' : 'Corregir'}
            </button>
          )}
        </span>
      )}
      {fixing && (
        <CategoryFixer
          club={club}
          member={member}
          byUid={byUid}
          onCancel={() => setFixing(false)}
          onDone={(msg) => {
            setFixing(false);
            onToast(msg);
          }}
        />
      )}
      {row('Juega', [member.courtSide ? SIDE_LABEL[member.courtSide] : 'Sin decir', member.hand ? HAND_LABEL[member.hand] : ''].filter(Boolean).join(' · '))}
      {row('Quiere partidos', MODALITY_PLURAL[member.preferredModality] ?? '—')}
      {row(
        'Puede jugar',
        avail.length ? (
          <span className="grid gap-0.5">
            {avail.map((a) => (
              <span key={a.days + a.hours}>
                {a.days} de {a.hours}
              </span>
            ))}
          </span>
        ) : (
          'Sin horarios'
        )
      )}
      {row(
        'Faltas',
        <span className={member.blocked ? 'text-red-700' : ''}>
          {member.noShowCount} de {club.maxNoShowsBeforeBlock}
          {member.blocked ? ' · bloqueado' : ''}
        </span>
      )}
    </div>
  );
};
