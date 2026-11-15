import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BarChart3,
  LogOut,
  Mail,
  Plus,
  ShieldCheck,
  Trash2,
  Trophy,
  X,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type {
  Booking,
  Club,
  ClubMembership,
  Gender,
  Modality,
  PlayerMatchResult,
  ProposedMatch,
  Tournament,
  UserPrivateInfo,
  UserProfile,
} from '../types/padel';
import {
  addDaysISO,
  computeClubPlayerRanking,
  computePlayerLevel,
  formatCategory,
  getDayOfWeekFromISO,
  getTodayISO,
  type PlayerLevelSummary,
} from '../lib/padelUtils';
import {
  deletePlayerMatchResult,
  getUserPrivateInfo,
  logPlayerMatchResult,
  updateUserGlobalProfile,
} from '../services/firestoreService';
import { PWAInstallButton } from './PWAInstallButton';

interface ProfileViewProps {
  userProfile: UserProfile;
  clubs: Club[];
  activeClub: Club | null;
  membership?: ClubMembership;
  memberships: ClubMembership[];
  bookings: Booking[];
  proposedMatches: ProposedMatch[];
  tournaments: Tournament[];
  playerMatchResults: PlayerMatchResult[];
  clubMatchResults: PlayerMatchResult[];
  playerLevel?: PlayerLevelSummary;
  onProfileUpdated: (next: UserProfile) => void;
  onLogout: () => void;
  onToast: (msg: string) => void;
}

interface UnifiedMatchResult {
  id: string;
  source: 'tournament' | 'manual';
  date: string;
  clubName: string;
  title: string;
  modalityLabel: string;
  score: string;
  outcome: 'win' | 'loss';
}

const MODALITY_LABELS: Record<Modality, string> = {
  masculino: 'Masculino',
  femenino: 'Femenino',
  mixto: 'Mixto',
};

const WEEKDAY_ORDER: { dow: number; label: string }[] = [
  { dow: 1, label: 'Lun' },
  { dow: 2, label: 'Mar' },
  { dow: 3, label: 'Mié' },
  { dow: 4, label: 'Jue' },
  { dow: 5, label: 'Vie' },
  { dow: 6, label: 'Sáb' },
  { dow: 0, label: 'Dom' },
];

const SHORT_MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function formatShortDate(iso: string): string {
  const parts = iso.split('-');
  if (parts.length !== 3) return iso;
  const day = Number(parts[2]);
  const monthIdx = Number(parts[1]) - 1;
  return `${day} ${SHORT_MONTHS[monthIdx] ?? parts[1]}`;
}

function getMondayOfWeekISO(iso: string): string {
  const dow = getDayOfWeekFromISO(iso); // 0=Dom..6=Sáb
  const diffToMonday = dow === 0 ? -6 : 1 - dow;
  return addDaysISO(iso, diffToMonday);
}

export const ProfileView: React.FC<ProfileViewProps> = ({
  userProfile,
  clubs,
  activeClub,
  membership,
  memberships,
  bookings,
  proposedMatches,
  tournaments,
  playerMatchResults,
  clubMatchResults,
  playerLevel,
  onProfileUpdated,
  onLogout,
  onToast,
}) => {
  const [privateInfo, setPrivateInfo] = useState<UserPrivateInfo | null>(null);
  const [displayName, setDisplayName] = useState(userProfile.displayName);
  const [category, setCategory] = useState(userProfile.category);
  const [gender, setGender] = useState<Gender>(userProfile.gender);
  const [modality, setModality] = useState<Modality>(userProfile.preferredModality);
  const [busy, setBusy] = useState(false);

  // Performance analytics state
  const [frequencyView, setFrequencyView] = useState<'weekly' | 'weekday'>('weekly');
  const [showLogForm, setShowLogForm] = useState(false);
  const [resultClubId, setResultClubId] = useState(activeClub?.id || clubs[0]?.id || 'pocitos_padel');
  const [resultDate, setResultDate] = useState(getTodayISO());
  const [resultOutcome, setResultOutcome] = useState<'win' | 'loss'>('win');
  const [resultScore, setResultScore] = useState('');
  const [resultModality, setResultModality] = useState<Modality>(userProfile.preferredModality);
  const [savingResult, setSavingResult] = useState(false);
  const [deletingResultId, setDeletingResultId] = useState<string | null>(null);

  useEffect(() => {
    getUserPrivateInfo(userProfile.uid).then(setPrivateInfo);
  }, [userProfile.uid]);

  useEffect(() => {
    if (activeClub?.id) {
      setResultClubId((prev) => (clubs.some((c) => c.id === prev) ? prev : activeClub.id));
    }
  }, [activeClub?.id, clubs]);

  const activeClubRankingEntry = useMemo(() => {
    if (!activeClub) return null;
    const list = computeClubPlayerRanking({
      clubId: activeClub.id,
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
    });
    return list.find((r) => r.uid === userProfile.uid) ?? null;
  }, [
    activeClub,
    memberships,
    bookings,
    proposedMatches,
    tournaments,
    playerMatchResults,
    clubMatchResults,
    userProfile.uid,
    userProfile.displayName,
    userProfile.category,
  ]);

  // 1. Aggregate Wins / Losses from completed tournament matches + manual Firestore results
  const unifiedResults = useMemo<UnifiedMatchResult[]>(() => {
    const items: UnifiedMatchResult[] = [];
    const clubMap = new Map(clubs.map((c) => [c.id, c.name]));

    for (const trn of tournaments) {
      const myPairIds = new Set(
        trn.pairs
          .filter((p) => p.player1Uid === userProfile.uid || p.player2Uid === userProfile.uid)
          .map((p) => p.id)
      );
      if (myPairIds.size === 0) continue;

      for (const m of trn.matches) {
        if (m.status !== 'completed') continue;
        const inMatch = myPairIds.has(m.pair1Id) || myPairIds.has(m.pair2Id);
        if (!inMatch) continue;
        const won = myPairIds.has(m.winnerPairId);
        const opponent = myPairIds.has(m.pair1Id) ? m.pair2Label : m.pair1Label;
        items.push({
          id: `trn_${trn.id}_${m.id}`,
          source: 'tournament',
          date: m.date,
          clubName: clubMap.get(trn.clubId) || activeClub?.name || 'Torneo del club',
          title: `${trn.name} · ${m.round} vs ${opponent}`,
          modalityLabel: 'Torneo',
          score: m.score || 'Finalizado',
          outcome: won ? 'win' : 'loss',
        });
      }
    }

    for (const r of playerMatchResults) {
      items.push({
        id: r.id,
        source: 'manual',
        date: r.date,
        clubName: r.clubName,
        title: `Partido en ${r.clubName}`,
        modalityLabel: MODALITY_LABELS[r.modality],
        score: r.score || 'Sin marcador',
        outcome: r.outcome,
      });
    }

    return items.sort((a, b) => b.date.localeCompare(a.date));
  }, [tournaments, playerMatchResults, clubs, activeClub?.name, userProfile.uid]);

  const winLossStats = useMemo(() => {
    let wins = 0;
    let losses = 0;
    for (const item of unifiedResults) {
      if (item.outcome === 'win') wins += 1;
      else losses += 1;
    }
    const total = wins + losses;
    const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;
    return {
      wins,
      losses,
      total,
      winRate,
      pieData: [
        { name: 'Ganados', value: wins, color: '#059669' },
        { name: 'Perdidos', value: losses, color: '#DC2626' },
      ],
    };
  }, [unifiedResults]);

  // 2. Aggregate Play Frequency across bookings, confirmed matched games, tournament matches, and manual results
  const frequencyAnalytics = useMemo(() => {
    const activityDates: string[] = [];
    const seenBookingIds = new Set<string>();

    for (const b of bookings) {
      if (b.status === 'cancelled' || b.status === 'no_show') continue;
      const isMyBooking =
        b.playerUids.includes(userProfile.uid) ||
        (b.type !== 'counter' && b.createdByUid === userProfile.uid);
      if (!isMyBooking) continue;
      seenBookingIds.add(b.id);
      if (b.date) activityDates.push(b.date);
    }

    for (const pm of proposedMatches) {
      if (pm.status !== 'confirmed') continue;
      if (!pm.playerUids.includes(userProfile.uid)) continue;
      if (seenBookingIds.has(pm.bookingId)) continue;
      seenBookingIds.add(pm.bookingId);
      if (pm.date) activityDates.push(pm.date);
    }

    for (const trn of tournaments) {
      const myPairIds = new Set(
        trn.pairs
          .filter((p) => p.player1Uid === userProfile.uid || p.player2Uid === userProfile.uid)
          .map((p) => p.id)
      );
      if (myPairIds.size === 0) continue;
      for (const m of trn.matches) {
        if (myPairIds.has(m.pair1Id) || myPairIds.has(m.pair2Id)) {
          if (m.date) activityDates.push(m.date);
        }
      }
    }

    for (const r of playerMatchResults) {
      if (r.date) activityDates.push(r.date);
    }

    // Last 6 weeks (Monday to Sunday)
    const todayISO = getTodayISO();
    const currentWeekMonday = getMondayOfWeekISO(todayISO);
    const weeklyBuckets = Array.from({ length: 6 }, (_, idx) => {
      const offsetWeeks = idx - 5; // -5 .. 0
      const startISO = addDaysISO(currentWeekMonday, offsetWeeks * 7);
      const endISO = addDaysISO(startISO, 6);
      return {
        label: idx === 5 ? 'Esta sem.' : formatShortDate(startISO),
        rangeLabel: `${formatShortDate(startISO)} – ${formatShortDate(endISO)}`,
        startISO,
        endISO,
        partidos: 0,
      };
    });

    const weekdayCounts = new Map<number, number>(WEEKDAY_ORDER.map((w) => [w.dow, 0]));

    for (const dateISO of activityDates) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) continue;
      const dow = getDayOfWeekFromISO(dateISO);
      weekdayCounts.set(dow, (weekdayCounts.get(dow) ?? 0) + 1);

      for (const bucket of weeklyBuckets) {
        if (dateISO >= bucket.startISO && dateISO <= bucket.endISO) {
          bucket.partidos += 1;
          break;
        }
      }
    }

    const weekdaySeries = WEEKDAY_ORDER.map((w) => ({
      label: w.label,
      partidos: weekdayCounts.get(w.dow) ?? 0,
    }));

    const totalLast6Weeks = weeklyBuckets.reduce((acc, w) => acc + w.partidos, 0);
    const weeklyAverage = (totalLast6Weeks / 6).toFixed(1);

    return {
      totalSessions: activityDates.length,
      weeklyAverage,
      weeklySeries: weeklyBuckets,
      weekdaySeries,
    };
  }, [bookings, proposedMatches, tournaments, playerMatchResults, userProfile.uid]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await updateUserGlobalProfile(
        userProfile.uid,
        {
          displayName: displayName.trim() || userProfile.displayName,
          category,
          gender,
          preferredModality: modality,
        },
        clubs.map((c) => c.id)
      );
      onProfileUpdated({
        ...userProfile,
        displayName: displayName.trim() || userProfile.displayName,
        category,
        gender,
        preferredModality: modality,
      });
      onToast('Cuenta única actualizada en toda la plataforma.');
    } finally {
      setBusy(false);
    }
  };

  const handleLogResult = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resultDate || !/^\d{4}-\d{2}-\d{2}$/.test(resultDate)) {
      onToast('Ingresá una fecha válida (AAAA-MM-DD).');
      return;
    }
    const selectedClub = clubs.find((c) => c.id === resultClubId) || activeClub;
    setSavingResult(true);
    try {
      await logPlayerMatchResult({
        uid: userProfile.uid,
        clubId: selectedClub?.id || 'pocitos_padel',
        clubName: selectedClub?.name || 'Club Armá Partido',
        date: resultDate,
        outcome: resultOutcome,
        score: resultScore.trim() || (resultOutcome === 'win' ? '6-4 / 6-3' : '4-6 / 3-6'),
        modality: resultModality,
      });
      setResultScore('');
      setShowLogForm(false);
      onToast('Resultado registrado en tu historial.');
    } catch {
      onToast('No se pudo guardar el resultado. Revisá tu conexión.');
    } finally {
      setSavingResult(false);
    }
  };

  const handleDeleteResult = async (resultId: string) => {
    setDeletingResultId(resultId);
    try {
      await deletePlayerMatchResult(userProfile.uid, resultId);
      onToast('Resultado eliminado de tu historial.');
    } catch {
      onToast('No se pudo eliminar el resultado.');
    } finally {
      setDeletingResultId(null);
    }
  };

  const resolvedLevel = useMemo(
    () =>
      playerLevel ??
      computePlayerLevel({
        uid: userProfile.uid,
        category: userProfile.category,
        tournaments,
        playerMatchResults,
        clubMatchResults,
      }),
    [playerLevel, userProfile.uid, userProfile.category, tournaments, playerMatchResults, clubMatchResults]
  );

  const frequencyChartData =
    frequencyView === 'weekly' ? frequencyAnalytics.weeklySeries : frequencyAnalytics.weekdaySeries;

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-medium text-emerald-700">
          Cuenta única global · Válida en todos los clubes de la red
        </p>
        <h1 className="mt-1 font-display text-2xl font-bold text-slate-900 sm:text-3xl">
          Tu perfil de jugador
        </h1>
      </div>

      {/* Player Performance Analytics Section (Recharts) */}
      <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-display text-lg font-bold text-slate-900">Rendimiento del jugador</h2>
              <p className="text-xs text-slate-500">
                Efectividad en partidos y frecuencia de juego según tus reservas, torneos y resultados
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowLogForm((prev) => !prev)}
            className="inline-flex min-h-[40px] shrink-0 items-center gap-2 whitespace-nowrap rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer"
          >
            {showLogForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {showLogForm ? 'Cerrar formulario' : 'Registrar resultado'}
          </button>
        </div>

        {/* Inline Log Match Result Form */}
        {showLogForm && (
          <form
            onSubmit={handleLogResult}
            className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-4"
          >
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-slate-900">Cargar resultado de partido</p>
              <p className="text-[11px] text-slate-500">Se guarda en tu historial personal</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700">Club</label>
                <select
                  value={resultClubId}
                  onChange={(e) => setResultClubId(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-900"
                >
                  {clubs.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700">Fecha</label>
                <input
                  type="date"
                  value={resultDate}
                  onChange={(e) => setResultDate(e.target.value)}
                  required
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-900"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700">Modalidad</label>
                <select
                  value={resultModality}
                  onChange={(e) => setResultModality(e.target.value as Modality)}
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
                    onClick={() => setResultOutcome('win')}
                    className={`rounded-xl border px-2.5 py-2 text-xs font-semibold cursor-pointer transition ${
                      resultOutcome === 'win'
                        ? 'border-emerald-600 bg-emerald-600 text-white'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    Ganado
                  </button>
                  <button
                    type="button"
                    onClick={() => setResultOutcome('loss')}
                    className={`rounded-xl border px-2.5 py-2 text-xs font-semibold cursor-pointer transition ${
                      resultOutcome === 'loss'
                        ? 'border-red-600 bg-red-600 text-white'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    Perdido
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700">Marcador (sets)</label>
                <input
                  type="text"
                  value={resultScore}
                  onChange={(e) => setResultScore(e.target.value)}
                  maxLength={40}
                  placeholder="Ej. 6-4 / 7-5"
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-900"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={savingResult}
                className="min-h-[40px] rounded-xl bg-emerald-600 px-5 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 cursor-pointer"
              >
                {savingResult ? 'Guardando...' : 'Guardar resultado'}
              </button>
            </div>
          </form>
        )}

        {/* Categoría del jugador (1ra a 8va) */}
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-semibold text-slate-900">Categoría</p>
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800">
              {formatCategory(userProfile.category)}
            </span>
          </div>
          <div className="grid grid-cols-8 gap-1.5" aria-label={`Categoría ${formatCategory(userProfile.category)}`}>
            {Array.from({ length: 8 }, (_, idx) => {
              const cat = idx + 1;
              const active = cat === userProfile.category;
              return (
                <div
                  key={cat}
                  className={`rounded-lg py-2 text-center text-xs font-semibold ${
                    active ? 'bg-emerald-700 text-white' : 'bg-white text-slate-400 border border-slate-200'
                  }`}
                >
                  {formatCategory(cat)}
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-slate-600">
            Te proponemos partidos con jugadores de {formatCategory(Math.max(1, userProfile.category - 1))} a{' '}
            {formatCategory(Math.min(8, userProfile.category + 1))}.
          </p>
          {resolvedLevel.recentForm.length > 0 && (
            <p className="text-[11px] text-slate-600">
              Racha reciente:{' '}
              <span className="font-mono font-bold tracking-wider">
                {resolvedLevel.recentForm.map((f, idx) => (
                  <span key={idx} className={f === 'W' ? 'text-emerald-700' : 'text-red-600'}>
                    {f === 'W' ? 'G' : 'P'}
                    {idx < resolvedLevel.recentForm.length - 1 ? ' ' : ''}
                  </span>
                ))}
              </span>
            </p>
          )}
        </div>

        {/* 4-KPI Summary Strip */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <p className="text-[11px] font-semibold text-slate-500">Partidos con resultado</p>
            <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-slate-900">
              {winLossStats.total}
            </p>
            <p className="mt-0.5 font-mono text-[11px] tabular-nums text-slate-600">
              {winLossStats.wins} ganados · {winLossStats.losses} perdidos
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <p className="text-[11px] font-semibold text-slate-500">Efectividad</p>
            <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-emerald-700">
              {winLossStats.total > 0 ? `${winLossStats.winRate}%` : '—'}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-600">
              {winLossStats.total > 0 ? 'Sobre partidos cerrados' : 'Sin resultados cargados'}
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <p className="text-[11px] font-semibold text-slate-500">Turnos y partidos</p>
            <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-slate-900">
              {frequencyAnalytics.totalSessions}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-600">Reservas, torneos y cargas</p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <p className="text-[11px] font-semibold text-slate-500">Frecuencia semanal</p>
            <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-slate-900">
              {frequencyAnalytics.weeklyAverage}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-600">Promedio últimas 6 semanas</p>
          </div>
        </div>

        {/* Recharts Grid */}
        <div className="grid gap-6 lg:grid-cols-12">
          {/* Chart 1: Wins vs Losses Donut */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-display text-sm font-bold text-slate-900">
                  Partidos ganados y perdidos
                </h3>
                <p className="text-[11px] text-slate-500">Torneos finalizados y partidos registrados</p>
              </div>
              <Trophy className="h-4 w-4 text-emerald-600" />
            </div>

            {winLossStats.total === 0 ? (
              <div className="mt-4 flex h-[240px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-6 text-center">
                <p className="text-xs font-semibold text-slate-700">Todavía no tenés resultados cargados</p>
                <p className="mt-1 text-[11px] text-slate-500">
                  Registrá un partido o completá cruces de torneo para ver tu gráfico de efectividad.
                </p>
                {!showLogForm && (
                  <button
                    type="button"
                    onClick={() => setShowLogForm(true)}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Cargar primer resultado
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className="relative mt-2 h-[220px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={winLossStats.pieData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={58}
                        outerRadius={84}
                        paddingAngle={winLossStats.wins > 0 && winLossStats.losses > 0 ? 3 : 0}
                        stroke="none"
                      >
                        {winLossStats.pieData.map((entry) => (
                          <Cell key={entry.name} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value, name) => [`${value} partidos`, String(name)]}
                        contentStyle={{
                          borderRadius: '12px',
                          border: '1px solid #E2E8F0',
                          fontSize: '12px',
                          boxShadow: '0 4px 12px rgba(15, 23, 42, 0.08)',
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <span className="font-mono text-2xl font-bold tabular-nums text-slate-900">
                      {winLossStats.winRate}%
                    </span>
                    <span className="text-[11px] font-medium text-slate-500">Efectividad</span>
                  </div>
                </div>

                <div className="mt-2 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3">
                  <div className="flex items-center justify-between rounded-lg bg-emerald-50/70 px-3 py-2 text-xs">
                    <span className="flex items-center gap-2 font-medium text-slate-700">
                      <span className="h-2.5 w-2.5 rounded-sm bg-emerald-600" />
                      Ganados
                    </span>
                    <span className="font-mono font-bold tabular-nums text-emerald-700">
                      {winLossStats.wins}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg bg-red-50/70 px-3 py-2 text-xs">
                    <span className="flex items-center gap-2 font-medium text-slate-700">
                      <span className="h-2.5 w-2.5 rounded-sm bg-red-600" />
                      Perdidos
                    </span>
                    <span className="font-mono font-bold tabular-nums text-red-700">
                      {winLossStats.losses}
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Chart 2: Play Frequency BarChart */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="flex items-center gap-2 font-display text-sm font-bold text-slate-900">
                  <Activity className="h-4 w-4 text-emerald-600" />
                  Frecuencia de juego
                </h3>
                <p className="text-[11px] text-slate-500">
                  {frequencyView === 'weekly'
                    ? 'Cantidad de partidos y reservas por semana (últimas 6 semanas)'
                    : 'Distribución acumulada según el día de la semana'}
                </p>
              </div>

              <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
                <button
                  type="button"
                  onClick={() => setFrequencyView('weekly')}
                  className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-[11px] font-semibold cursor-pointer transition ${
                    frequencyView === 'weekly'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Últimas 6 sem.
                </button>
                <button
                  type="button"
                  onClick={() => setFrequencyView('weekday')}
                  className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-[11px] font-semibold cursor-pointer transition ${
                    frequencyView === 'weekday'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Por día
                </button>
              </div>
            </div>

            <div className="mt-4 h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={frequencyChartData} margin={{ top: 10, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: '#64748B', fontSize: 11 }}
                    axisLine={{ stroke: '#E2E8F0' }}
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fill: '#64748B', fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: '#F1F5F9' }}
                    formatter={(value) => [`${value} partidos/turnos`, 'Actividad']}
                    labelFormatter={(label, payload) => {
                      const item = payload?.[0]?.payload as { rangeLabel?: string } | undefined;
                      return item?.rangeLabel ? `${label} (${item.rangeLabel})` : String(label);
                    }}
                    contentStyle={{
                      borderRadius: '12px',
                      border: '1px solid #E2E8F0',
                      fontSize: '12px',
                      boxShadow: '0 4px 12px rgba(15, 23, 42, 0.08)',
                    }}
                  />
                  <Bar
                    dataKey="partidos"
                    fill="#059669"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={42}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Recent Results History */}
        {unifiedResults.length > 0 && (
          <div className="space-y-2 border-t border-slate-100 pt-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-900">
                Historial reciente de resultados ({unifiedResults.length})
              </h3>
            </div>
            <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
              {unifiedResults.slice(0, 6).map((item) => (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-xs"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-slate-900">{item.title}</p>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      <span className="font-mono tabular-nums">{item.date}</span>
                      <span className="mx-1.5" aria-hidden="true">·</span>
                      {item.modalityLabel}
                      <span className="mx-1.5" aria-hidden="true">·</span>
                      <span className="font-mono font-medium text-slate-700">{item.score}</span>
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <span
                      className={`font-semibold ${
                        item.outcome === 'win' ? 'text-emerald-700' : 'text-red-600'
                      }`}
                    >
                      {item.outcome === 'win' ? 'Ganado' : 'Perdido'}
                    </span>

                    {item.source === 'manual' && (
                      <button
                        type="button"
                        onClick={() => handleDeleteResult(item.id)}
                        disabled={deletingResultId === item.id}
                        title="Eliminar resultado"
                        aria-label="Eliminar resultado"
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-red-600 disabled:opacity-50 cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-12">
        <form onSubmit={handleSave} className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4 lg:col-span-7">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h2 className="font-display text-lg font-bold text-slate-900">Datos unificados</h2>
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                <Mail className="h-3.5 w-3.5" />
                {privateInfo?.email || 'Cuenta Google verificada'}
              </p>
            </div>
            <PWAInstallButton />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700">Nombre visible</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700">Categoría global</label>
              <select
                value={category}
                onChange={(e) => setCategory(Number(e.target.value))}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold"
              >
                {[1, 2, 3, 4, 5, 6, 7, 8].map((c) => (
                  <option key={c} value={c}>
                    {formatCategory(c)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700">Género</label>
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value as Gender)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                <option value="masculino">Masculino</option>
                <option value="femenino">Femenino</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700">Partidos preferidos</label>
              <select
                value={modality}
                onChange={(e) => setModality(e.target.value as Modality)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                <option value="masculino">Masculino</option>
                <option value="femenino">Femenino</option>
                <option value="mixto">Mixto</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <button
              type="submit"
              disabled={busy}
              className="min-h-[44px] rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 cursor-pointer"
            >
              {busy ? 'Guardando...' : 'Guardar perfil global'}
            </button>

            <button
              type="button"
              onClick={onLogout}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              <LogOut className="h-4 w-4" />
              Cerrar sesión
            </button>
          </div>
        </form>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4 lg:col-span-5">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-4">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            <h2 className="font-display text-lg font-bold text-slate-900">Tu estado en clubes</h2>
          </div>

          {activeClub && (
            <div className="rounded-xl bg-slate-50 p-4 text-xs">
              <p className="font-semibold text-slate-900">{activeClub.name}</p>
              <p className="mt-1 text-slate-600">
                Rol actual: <strong className="capitalize">{membership?.role || 'player'}</strong>
                <span className="mx-1.5" aria-hidden="true">·</span>
                Ausencias registradas: <span className="font-mono">{membership?.noShowCount ?? 0}</span>/{activeClub.maxNoShowsBeforeBlock}
              </p>
              {activeClubRankingEntry && (
                <p className="mt-1.5 text-slate-600">
                  Ranking en el club:{' '}
                  <strong className="font-mono tabular-nums text-emerald-700">
                    #{activeClubRankingEntry.rank}
                  </strong>
                  <span className="mx-1.5" aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums font-semibold text-slate-900">
                    {activeClubRankingEntry.points} pts
                  </span>
                </p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-700">Clubes compatibles con tu cuenta ({clubs.length})</p>
            {clubs.map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2 text-xs">
                <span className="font-medium text-slate-900">{c.name}</span>
                <span className="text-slate-500">{c.neighborhood || c.city}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
