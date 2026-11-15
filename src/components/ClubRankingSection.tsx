import React, { useMemo, useState } from 'react';
import { Award, Medal, Plus, Search, Trophy, X } from 'lucide-react';
import type {
  Booking,
  Club,
  ClubMembership,
  Modality,
  PlayerMatchResult,
  ProposedMatch,
  Tournament,
  UserProfile,
} from '../types/padel';
import {
  computeClubPlayerRanking,
  formatCategory,
  getTodayISO,
  type PlayerLevelSummary,
} from '../lib/padelUtils';
import { logPlayerMatchResult } from '../services/firestoreService';

interface ClubRankingSectionProps {
  club: Club;
  memberships: ClubMembership[];
  bookings: Booking[];
  proposedMatches: ProposedMatch[];
  tournaments: Tournament[];
  playerMatchResults: PlayerMatchResult[];
  clubMatchResults: PlayerMatchResult[];
  playerLevelsMap?: Map<string, PlayerLevelSummary>;
  userProfile: UserProfile;
  onToast?: (msg: string) => void;
  compactHeader?: boolean;
}

export const ClubRankingSection: React.FC<ClubRankingSectionProps> = ({
  club,
  memberships,
  bookings,
  proposedMatches,
  tournaments,
  playerMatchResults,
  clubMatchResults,
  playerLevelsMap,
  userProfile,
  onToast,
  compactHeader = false,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<number | 'all'>('all');
  const [showQuickLog, setShowQuickLog] = useState(false);
  const [quickDate, setQuickDate] = useState(getTodayISO());
  const [quickOutcome, setQuickOutcome] = useState<'win' | 'loss'>('win');
  const [quickModality, setQuickModality] = useState<Modality>(userProfile.preferredModality);
  const [quickScore, setQuickScore] = useState('');
  const [saving, setSaving] = useState(false);

  const ranking = useMemo(
    () =>
      computeClubPlayerRanking({
        clubId: club.id,
        memberships,
        bookings,
        proposedMatches,
        tournaments,
        playerMatchResults,
        clubMatchResults,
        currentUser: {
          uid: userProfile.uid,
          displayName: userProfile.displayName,
          category: userProfile.category,
        },
      }),
    [
      club.id,
      memberships,
      bookings,
      proposedMatches,
      tournaments,
      playerMatchResults,
      clubMatchResults,
      userProfile.uid,
      userProfile.displayName,
      userProfile.category,
    ]
  );

  const availableCategories = useMemo(
    () => Array.from(new Set(ranking.map((r) => r.category))).sort((a, b) => a - b),
    [ranking]
  );

  const filteredRanking = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return ranking.filter((row) => {
      if (categoryFilter !== 'all' && row.category !== categoryFilter) return false;
      if (q && !row.displayName.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [ranking, searchTerm, categoryFilter]);

  const leader = ranking[0];
  const myEntry = ranking.find((r) => r.uid === userProfile.uid);
  const activeCount = ranking.filter((r) => r.points > 0).length;

  const handleQuickLogSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(quickDate)) {
      onToast?.('Ingresá una fecha válida.');
      return;
    }
    setSaving(true);
    try {
      await logPlayerMatchResult({
        uid: userProfile.uid,
        clubId: club.id,
        clubName: club.name,
        date: quickDate,
        outcome: quickOutcome,
        score: quickScore.trim() || (quickOutcome === 'win' ? '6-4 / 6-3' : '4-6 / 3-6'),
        modality: quickModality,
      });
      setQuickScore('');
      setShowQuickLog(false);
      onToast?.(`Resultado cargado y ranking de ${club.name} actualizado.`);
    } catch {
      onToast?.('No se pudo registrar el resultado.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
            <Trophy className="h-5 w-5" />
          </div>
          <div>
            {!compactHeader && (
              <p className="text-[11px] font-semibold text-emerald-700">
                Perfil del club · {club.neighborhood ? `${club.neighborhood}, ${club.city}` : club.city}
              </p>
            )}
            <h2 className="font-display text-lg font-bold text-slate-900">
              Tabla de clasificación · {club.name}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Cálculo automático según frecuencia de juego y resultados · +25 pts victoria · +5 pts derrota · +10 pts por turno/partido
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowQuickLog((prev) => !prev)}
          className="inline-flex min-h-[38px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer"
        >
          {showQuickLog ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          {showQuickLog ? 'Cerrar carga' : 'Registrar resultado'}
        </button>
      </div>

      {/* Inline Quick Match Result Form */}
      {showQuickLog && (
        <form
          onSubmit={handleQuickLogSubmit}
          className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3"
        >
          <p className="text-xs font-bold text-slate-900">
            Sumar partido al ranking de {club.name}
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="block text-[11px] font-semibold text-slate-700">Fecha</label>
              <input
                type="date"
                value={quickDate}
                onChange={(e) => setQuickDate(e.target.value)}
                required
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-900"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700">Modalidad</label>
              <select
                value={quickModality}
                onChange={(e) => setQuickModality(e.target.value as Modality)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900"
              >
                <option value="masculino">Masculino</option>
                <option value="femenino">Femenino</option>
                <option value="mixto">Mixto</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700">Resultado</label>
              <div className="mt-1 grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setQuickOutcome('win')}
                  className={`rounded-xl border px-2.5 py-2 text-xs font-semibold cursor-pointer transition ${
                    quickOutcome === 'win'
                      ? 'border-emerald-600 bg-emerald-600 text-white'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  Ganado
                </button>
                <button
                  type="button"
                  onClick={() => setQuickOutcome('loss')}
                  className={`rounded-xl border px-2.5 py-2 text-xs font-semibold cursor-pointer transition ${
                    quickOutcome === 'loss'
                      ? 'border-red-600 bg-red-600 text-white'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  Perdido
                </button>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700">Marcador</label>
              <input
                type="text"
                value={quickScore}
                onChange={(e) => setQuickScore(e.target.value)}
                maxLength={40}
                placeholder="Ej. 6-4 / 6-3"
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-900"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="min-h-[38px] rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 cursor-pointer"
            >
              {saving ? 'Actualizando...' : 'Guardar y recalcular ranking'}
            </button>
          </div>
        </form>
      )}

      {/* 3-KPI Summary Strip */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
            <Medal className="h-3.5 w-3.5 text-amber-600" />
            Líder del club
          </p>
          <p className="mt-1 truncate font-display text-base font-bold text-slate-900">
            {leader && leader.points > 0 ? leader.displayName : 'Sin líder aún'}
          </p>
          <p className="mt-0.5 font-mono text-[11px] tabular-nums text-slate-600">
            {leader && leader.points > 0
              ? `${leader.points} pts · ${leader.wins}G / ${leader.losses}P · ${leader.frequencyCount} turnos`
              : 'Registrá resultados o jugá turnos para liderar'}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
            <Award className="h-3.5 w-3.5 text-emerald-600" />
            Tu ubicación en {club.name}
          </p>
          <p className="mt-1 font-mono text-xl font-bold tabular-nums text-emerald-700">
            {myEntry ? `#${myEntry.rank}` : '—'}
          </p>
          <p className="mt-0.5 font-mono text-[11px] tabular-nums text-slate-600">
            {myEntry
              ? `${myEntry.points} pts · ${myEntry.matchesPlayed > 0 ? `${myEntry.winRate}% efect.` : 'Sin resultados'}`
              : 'Todavía no figurás en el club'}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
          <p className="text-[11px] font-semibold text-slate-500">Jugadores en tabla</p>
          <p className="mt-1 font-mono text-xl font-bold tabular-nums text-slate-900">
            {ranking.length}
          </p>
          <p className="mt-0.5 font-mono text-[11px] tabular-nums text-slate-600">
            {activeCount} con actividad puntuable
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar jugador..."
            className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-8 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor={`ranking-cat-${club.id}`} className="text-xs font-medium text-slate-500 whitespace-nowrap">
            Categoría
          </label>
          <select
            id={`ranking-cat-${club.id}`}
            value={categoryFilter}
            onChange={(e) =>
              setCategoryFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))
            }
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 focus:border-emerald-600 focus:outline-none"
          >
            <option value="all">Todas ({ranking.length})</option>
            {availableCategories.map((cat) => (
              <option key={cat} value={cat}>
                {formatCategory(cat)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Leaderboard Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
              <th className="px-4 py-3 font-semibold">Pos.</th>
              <th className="px-4 py-3 font-semibold">Jugador</th>
              <th className="px-4 py-3 font-semibold">Cat.</th>
              <th className="px-4 py-3 text-right font-semibold">Nivel</th>
              <th className="px-4 py-3 text-right font-semibold">Frecuencia</th>
              <th className="px-4 py-3 text-right font-semibold">PJ</th>
              <th className="px-4 py-3 text-right font-semibold">G / P</th>
              <th className="px-4 py-3 text-right font-semibold">Efectividad</th>
              <th className="px-4 py-3 text-right font-semibold">Puntaje</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredRanking.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                  No hay jugadores que coincidan con el filtro seleccionado.
                </td>
              </tr>
            ) : (
              filteredRanking.map((row) => {
                const isMe = row.uid === userProfile.uid;
                const rankAccent =
                  row.rank === 1 && row.points > 0
                    ? 'text-amber-700 font-bold'
                    : row.rank === 2 && row.points > 0
                      ? 'text-slate-700 font-bold'
                      : row.rank === 3 && row.points > 0
                        ? 'text-amber-800 font-bold'
                        : 'text-slate-500 font-medium';

                return (
                  <tr
                    key={row.uid}
                    className={isMe ? 'bg-emerald-50/50' : 'hover:bg-slate-50/70'}
                  >
                    <td className={`px-4 py-3 font-mono tabular-nums ${rankAccent}`}>
                      #{row.rank}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-900">{row.displayName}</span>
                        {isMe && (
                          <span className="text-[11px] font-semibold text-emerald-700">(Vos)</span>
                        )}
                        {row.blocked && (
                          <span className="text-[11px] font-medium text-red-600">· Suspendido</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-700">
                      {formatCategory(row.category)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold tabular-nums text-emerald-700">
                      Nv.{' '}
                      {playerLevelsMap?.get(row.uid)?.level ??
                        Math.min(10, Math.max(1, Math.round(10.5 - row.category)))}
                      /10
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-700">
                      <span>{row.frequencyCount}</span>
                      <span className="ml-1 text-[11px] text-slate-400">
                        ({row.weeklyFrequency}/sem)
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-700">
                      {row.matchesPlayed}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">
                      <span className="font-semibold text-emerald-700">{row.wins}</span>
                      <span className="mx-1 text-slate-400">/</span>
                      <span className="font-semibold text-red-600">{row.losses}</span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-700">
                      {row.matchesPlayed > 0 ? `${row.winRate}%` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold tabular-nums text-slate-900">
                      {row.points} pts
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
};
