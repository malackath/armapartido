import React, { useMemo, useState } from 'react';
import PhotoHeader from './PhotoHeader';
import { Check, CreditCard, Trophy, Users } from 'lucide-react';
import type { Club, ClubMembership, Tournament, UserProfile } from '../types/padel';
import { formatCategory, formatMinutes, formatUYU, formatDateFriendly} from '../lib/padelUtils';
import { acceptTournamentPair, registerPairInTournament } from '../services/firestoreService';
import { MercadoPagoModal } from './MercadoPagoModal';

interface TournamentsViewProps {
  club: Club;
  tournaments: Tournament[];
  memberships: ClubMembership[];
  userProfile: UserProfile;
  onToast: (msg: string) => void;
}

export const TournamentsView: React.FC<TournamentsViewProps> = ({
  club,
  tournaments,
  memberships,
  userProfile,
  onToast,
}) => {
  const [selectedTournament, setSelectedTournament] = useState<Tournament | null>(null);
  const [partnerUid, setPartnerUid] = useState('');
  const [mpOpen, setMpOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const partners = useMemo(
    () => memberships.filter((m) => m.uid !== userProfile.uid && !m.blocked),
    [memberships, userProfile.uid]
  );

  const handleRegister = async (paidWithMP: boolean) => {
    if (!selectedTournament) return;
    const partner = partners.find((p) => p.uid === partnerUid);
    if (!partner) {
      onToast('Elegí un compañero para inscribir la pareja.');
      return;
    }
    setBusy(true);
    try {
      await registerPairInTournament({
        club,
        tournament: selectedTournament,
        player1Uid: userProfile.uid,
        player1Name: userProfile.displayName,
        player2Uid: partner.uid,
        player2Name: partner.displayName,
        category: userProfile.category,
        paidWithMP,
      });
      onToast(`Pareja inscripta en ${selectedTournament.name}.`);
      setSelectedTournament(null);
      setPartnerUid('');
    } finally {
      setBusy(false);
    }
  };

  const handleAcceptInvite = async (tournament: Tournament, pairId: string) => {
    setBusy(true);
    try {
      await acceptTournamentPair({ club, tournament, pairId });
      onToast('¡Confirmaste tu participación en el torneo!');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-8">
      <PhotoHeader
        image="/img/torneo-noche.webp"
        title="Torneos"
        subtitle={`Anotate con tu pareja y seguí el cuadro en ${club.name}.`}
      />

      {tournaments.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
          <Trophy className="mx-auto h-8 w-8 text-slate-400" />
          <p className="mt-3 font-display text-base font-semibold text-slate-900">
            No hay torneos publicados en este club todavía
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Cuando el club abra la inscripción de un torneo, lo vas a ver acá.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {tournaments.map((trn) => {
            const eligible = trn.categories.includes(userProfile.category);
            const alreadyIn = trn.pairs.some(
              (p) => p.player1Uid === userProfile.uid || p.player2Uid === userProfile.uid
            );
            const pendingInviteForMe = trn.pairs.find(
              (p) => p.player2Uid === userProfile.uid && !p.partnerAccepted
            );
            const isFull = trn.pairs.length >= trn.maxPairs;

            return (
              <div key={trn.id} className="rounded-2xl border border-slate-200 bg-white p-6">
                <div className="flex flex-col gap-4 border-b border-slate-100 pb-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-medium text-slate-500">
                      {trn.format === 'groups_knockout' ? 'Grupos + Eliminación' : 'Eliminación directa'}
                      <span className="mx-1.5" aria-hidden="true">·</span>
                      Categorías {trn.categories.map(formatCategory).join(', ')}
                      <span className="mx-1.5" aria-hidden="true">·</span>
                      <span className=" tabular-nums">
                        del {formatDateFriendly(trn.startDate, false)} al {formatDateFriendly(trn.endDate, false)}
                      </span>
                    </p>
                    <h2 className="mt-1 font-display text-xl font-bold text-slate-900">{trn.name}</h2>
                    <p className="mt-1 text-xs text-slate-600">
                      Estado:{' '}
                      <strong className="text-slate-900">
                        {trn.status === 'registration_open'
                          ? 'Inscripción abierta'
                          : trn.status === 'draw_generated'
                            ? 'Cuadro sorteado'
                            : trn.status === 'in_progress'
                              ? 'En juego'
                              : 'Finalizado'}
                      </strong>
                      <span className="mx-1.5" aria-hidden="true">·</span>
                      Cupo:{' '}
                      <span className=" tabular-nums">
                        {trn.pairs.length}/{trn.maxPairs} parejas
                      </span>
                      <span className="mx-1.5" aria-hidden="true">·</span>
                      Inscripción:{' '}
                      <span className=" font-semibold text-slate-900 tabular-nums">
                        {formatUYU(trn.entryFee)}
                      </span>
                    </p>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    {pendingInviteForMe && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleAcceptInvite(trn, pendingInviteForMe.id)}
                        className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 cursor-pointer"
                      >
                        <Check className="h-4 w-4" />
                        Aceptar invitación de {pendingInviteForMe.player1Name}
                      </button>
                    )}

                    {trn.status === 'registration_open' && !alreadyIn && !isFull && (
                      <button
                        type="button"
                        onClick={() => setSelectedTournament(trn)}
                        disabled={!eligible}
                        className="min-h-[42px] rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-500 whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        {eligible
                          ? 'Inscribir pareja'
                          : `Solo cat. ${trn.categories.map(formatCategory).join('/')}`}
                      </button>
                    )}
                  </div>
                </div>

                {/* Pairs List */}
                <div className="mt-4">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                    <Users className="h-3.5 w-3.5 text-emerald-600" />
                    Parejas inscriptas ({trn.pairs.length})
                  </p>
                  {trn.pairs.length === 0 ? (
                    <p className="mt-2 text-xs text-slate-500">Todavía no hay parejas anotadas.</p>
                  ) : (
                    <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {trn.pairs.map((pair) => (
                        <div
                          key={pair.id}
                          className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs"
                        >
                          <div>
                            <p className="font-semibold text-slate-900">
                              {pair.player1Name} / {pair.player2Name}
                            </p>
                            <p className="text-[11px] text-slate-500">
                              {formatCategory(pair.category)} ·{' '}
                              {pair.partnerAccepted ? 'Confirmada' : 'Esperando compañero'} ·{' '}
                              {pair.paid ? 'Paga' : 'Paga en club'}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Draw / Matches */}
                {trn.matches.length > 0 && (
                  <div className="mt-6 border-t border-slate-100 pt-4">
                    <p className="text-xs font-semibold text-slate-700">
                      Cuadro y próximos partidos (canchas reservadas)
                    </p>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      {trn.matches.map((m) => (
                        <div
                          key={m.id}
                          className="rounded-xl border border-slate-200 bg-white p-3.5"
                        >
                          <div className="flex items-center justify-between text-[11px] text-slate-500">
                            <span className="font-semibold text-emerald-700">{m.round}</span>
                            <span className=" tabular-nums">
                              {m.courtName} · {formatDateFriendly(m.date)} {formatMinutes(m.startMinute)}
                            </span>
                          </div>
                          <div className="mt-2 space-y-1 text-sm">
                            <p
                              className={
                                m.winnerPairId === m.pair1Id
                                  ? 'font-bold text-emerald-700'
                                  : 'font-medium text-slate-900'
                              }
                            >
                              {m.pair1Label}
                            </p>
                            <p
                              className={
                                m.winnerPairId === m.pair2Id
                                  ? 'font-bold text-emerald-700'
                                  : 'font-medium text-slate-900'
                              }
                            >
                              {m.pair2Label}
                            </p>
                          </div>
                          {m.status === 'completed' && (
                            <p className="mt-2 text-xs font-semibold text-slate-700 tabular-nums">
                              Resultado: {m.score}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pair Registration Modal */}
      {selectedTournament && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="w-full max-w-md rounded-t-3xl border border-slate-200 bg-white p-6 shadow-2xl sm:rounded-2xl">
            <h3 className="font-display text-lg font-bold text-slate-900">
              Inscribir pareja en {selectedTournament.name}
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Tu compañero recibirá una notificación para aceptar su lugar. Inscripción:{' '}
              <span className=" font-semibold text-slate-900 tabular-nums">
                {formatUYU(selectedTournament.entryFee)}
              </span>
            </p>

            <div className="mt-4">
              <label className="block text-xs font-semibold text-slate-700">
                Elegí tu compañero/a
              </label>
              <select
                value={partnerUid}
                onChange={(e) => setPartnerUid(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900"
              >
                <option value="">Seleccionar jugador del club...</option>
                {partners.map((p) => (
                  <option key={p.uid} value={p.uid}>
                    {p.displayName} ({formatCategory(p.category)})
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-5 space-y-2.5">
              <button
                type="button"
                disabled={busy || !partnerUid}
                onClick={() => handleRegister(false)}
                className="w-full min-h-[46px] rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
              >
                Inscribir y pagar en el club
              </button>

              {club.mpEnabled && (
                <button
                  type="button"
                  disabled={busy || !partnerUid}
                  onClick={() => setMpOpen(true)}
                  className="inline-flex w-full min-h-[46px] items-center justify-center gap-2 rounded-xl border border-sky-200 bg-sky-50 py-2.5 text-sm font-semibold text-sky-800 hover:bg-sky-100 disabled:opacity-50 cursor-pointer"
                >
                  <CreditCard className="h-4 w-4" />
                  Inscribir y pagar con Mercado Pago
                </button>
              )}

              <button
                type="button"
                onClick={() => setSelectedTournament(null)}
                className="w-full py-2 text-xs font-semibold text-slate-500 hover:text-slate-800 cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      <MercadoPagoModal
        open={mpOpen && !!selectedTournament}
        title={selectedTournament ? `Inscripción ${selectedTournament.name}` : ''}
        subtitle="Pago directo a la cuenta del club"
        amount={selectedTournament?.entryFee || 0}
        receiverName={club.name}
        onConfirm={async () => {
          await handleRegister(true);
        }}
        onClose={() => setMpOpen(false)}
      />
    </div>
  );
};
