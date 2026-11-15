import React, { useEffect, useMemo, useState } from 'react';
import PhotoHeader from './PhotoHeader';
import { BADGE_CLASSES, DropMatchButton, FillInvitesSection, MatchFillStatus, fillBadge, searchForMatch } from './FaltaUno';
import { dropFromMatch } from '../services/firestoreService';
import {
  AlertTriangle,
  CalendarClock,
  Check,
  Clock,
  CreditCard,
  Plus,
  RefreshCw,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import type {
  AvailabilityWindow,
  Booking,
  Club,
  ClubMembership,
  Court,
  FillInvite,
  FillSearch,
  Gender,
  MatchRequest,
  Modality,
  ProposedMatch,
  UserFriend,
  UserProfile,
} from '../types/padel';
import {
  addDaysISO,
  findAvailabilityOverlaps,
  formatCategory,
  formatMinutes,
  formatUYU,
  getDayName,
  getDayOfWeekFromISO,
  getLevelTierLabel,
  getTodayISO,
  type PlayerLevelSummary, formatDateFriendly} from '../lib/padelUtils';
import {
  acceptMatchPartnerInvite,
  createMatchRequestAndTryMatch,
  followUser,
  payMatchShare,
  respondToProposedMatch,
  runMatchmakingSweep,
  triggerUnfilledSameDayAlert,
  unfollowUser,
  updateUserGlobalProfile,
} from '../services/firestoreService';
import { MercadoPagoModal } from './MercadoPagoModal';

export interface MatchInvitePreset {
  partnerUid: string;
  dayOfWeek?: number;
  startHour?: number;
  endHour?: number;
  nonce: number;
}

interface MatchmakingViewProps {
  club: Club;
  clubs: Club[];
  courts: Court[];
  bookings: Booking[];
  requests: MatchRequest[];
  proposedMatches: ProposedMatch[];
  memberships: ClubMembership[];
  friends: UserFriend[];
  playerLevelsMap?: Map<string, PlayerLevelSummary>;
  invitePreset?: MatchInvitePreset | null;
  fillSearches?: FillSearch[];
  fillInvites?: FillInvite[];
  userProfile: UserProfile;
  onProfileUpdated: (next: UserProfile) => void;
  onToast: (msg: string) => void;
}

export const MatchmakingView: React.FC<MatchmakingViewProps> = ({
  club,
  clubs,
  courts,
  bookings,
  requests,
  proposedMatches,
  memberships,
  friends,
  playerLevelsMap,
  invitePreset,
  fillSearches = [],
  fillInvites = [],
  userProfile,
  onProfileUpdated,
  onToast,
}) => {
  const today = getTodayISO();
  const [reqType, setReqType] = useState<'priority' | 'weekly'>('priority');
  const [dateISO, setDateISO] = useState(today);
  const [dayOfWeek, setDayOfWeek] = useState<number>(getDayOfWeekFromISO(today));
  const [startHour, setStartHour] = useState(18);
  const [endHour, setEndHour] = useState(21);
  const [modality, setModality] = useState<Modality>(userProfile.preferredModality);
  const [partnerUid, setPartnerUid] = useState('');
  const [busy, setBusy] = useState(false);

  // Weekly availability editor state
  const [newWinDay, setNewWinDay] = useState(2);
  const [newWinStart, setNewWinStart] = useState(19);
  const [newWinEnd, setNewWinEnd] = useState(23);

  // Payment modal for confirmed match share
  const [payTarget, setPayTarget] = useState<ProposedMatch | null>(null);

  const numericLevelsMap = useMemo(() => {
    const map = new Map<string, number>();
    if (playerLevelsMap) {
      for (const [uid, summary] of playerLevelsMap.entries()) {
        map.set(uid, summary.level);
      }
    }
    return map;
  }, [playerLevelsMap]);

  const getPlayerLevel = (uid: string, fallbackCat: number) =>
    playerLevelsMap?.get(uid)?.level ?? Math.min(10, Math.max(1, Math.round(10.5 - fallbackCat)));

  const myLevelSummary = playerLevelsMap?.get(userProfile.uid);
  const myLevel = myLevelSummary?.level ?? getPlayerLevel(userProfile.uid, userProfile.category);
  const myExactRating = myLevelSummary?.exactRating ?? myLevel;

  const otherPlayers = useMemo(
    () => memberships.filter((m) => m.uid !== userProfile.uid && !m.blocked),
    [memberships, userProfile.uid]
  );

  const friendUidSet = useMemo(() => new Set(friends.map((f) => f.uid)), [friends]);
  const friendPlayers = useMemo(
    () => otherPlayers.filter((p) => friendUidSet.has(p.uid)),
    [otherPlayers, friendUidSet]
  );
  const nonFriendPlayers = useMemo(
    () => otherPlayers.filter((p) => !friendUidSet.has(p.uid)),
    [otherPlayers, friendUidSet]
  );

  const selectedPartner = useMemo(
    () => otherPlayers.find((p) => p.uid === partnerUid) || null,
    [otherPlayers, partnerUid]
  );

  const selectedPartnerOverlaps = useMemo(
    () =>
      selectedPartner
        ? findAvailabilityOverlaps(
            userProfile.weeklyAvailability,
            selectedPartner.weeklyAvailability,
            club.slotDurationMinutes
          )
        : [],
    [selectedPartner, userProfile.weeklyAvailability, club.slotDurationMinutes]
  );

  useEffect(() => {
    if (!invitePreset) return;
    if (invitePreset.partnerUid) setPartnerUid(invitePreset.partnerUid);
    if (typeof invitePreset.dayOfWeek === 'number') {
      setDayOfWeek(invitePreset.dayOfWeek);
      const matchingOffset = [0, 1, 2, 3, 4, 5, 6].find(
        (offset) => getDayOfWeekFromISO(addDaysISO(today, offset)) === invitePreset.dayOfWeek
      );
      if (typeof matchingOffset === 'number') {
        setDateISO(addDaysISO(today, matchingOffset));
      }
    }
    if (typeof invitePreset.startHour === 'number') {
      setStartHour(Math.max(8, Math.min(22, invitePreset.startHour)));
    }
    if (typeof invitePreset.endHour === 'number') {
      setEndHour(Math.max(9, Math.min(23, invitePreset.endHour)));
    }
  }, [invitePreset, today]);

  const activeProposed = useMemo(
    () =>
      proposedMatches
        .filter((m) => m.status !== 'cancelled')
        .sort((a, b) => a.date.localeCompare(b.date) || a.startMinute - b.startMinute),
    [proposedMatches]
  );

  const waitingRequests = useMemo(
    () => requests.filter((r) => r.status === 'waiting'),
    [requests]
  );

  const handleSaveGlobalSpecs = async (
    nextCategory: number,
    nextGender: Gender,
    nextModality: Modality,
    nextAvail: AvailabilityWindow[]
  ) => {
    setBusy(true);
    try {
      await updateUserGlobalProfile(
        userProfile.uid,
        {
          category: nextCategory,
          gender: nextGender,
          preferredModality: nextModality,
          weeklyAvailability: nextAvail,
        },
        clubs.map((c) => c.id)
      );
      onProfileUpdated({
        ...userProfile,
        category: nextCategory,
        gender: nextGender,
        preferredModality: nextModality,
        weeklyAvailability: nextAvail,
      });
      onToast('Perfil global de jugador actualizado para todos los clubes.');
    } finally {
      setBusy(false);
    }
  };

  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (endHour * 60 - startHour * 60 < club.slotDurationMinutes) {
      onToast(`La franja debe cubrir al menos ${club.slotDurationMinutes} minutos.`);
      return;
    }
    setBusy(true);
    try {
      const partner = otherPlayers.find((p) => p.uid === partnerUid);
      const result = await createMatchRequestAndTryMatch({
        club,
        courts,
        bookings,
        existingRequests: requests,
        memberships,
        creatorUid: userProfile.uid,
        creatorName: userProfile.displayName,
        category: userProfile.category,
        modality,
        requestType: reqType,
        date: dateISO,
        dayOfWeek: reqType === 'priority' ? getDayOfWeekFromISO(dateISO) : dayOfWeek,
        startMinute: startHour * 60,
        endMinute: endHour * 60,
        partnerUid: partner ? partner.uid : '',
        partnerName: partner ? partner.displayName : '',
        playerLevels: numericLevelsMap,
      });

      if (result.proposedMatch) {
        onToast(
          `¡Partido armado en ${result.proposedMatch.courtName} (${formatMinutes(result.proposedMatch.startMinute)} hs)! Se retuvo la cancha hasta que acepten los 4.`
        );
      } else {
        onToast('Pedido cargado. Te avisaremos en cuanto aparezcan jugadores compatibles.');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleRunSweep = async () => {
    setBusy(true);
    try {
      const match = await runMatchmakingSweep({
        club,
        courts,
        bookings,
        requests,
        memberships,
        triggeredByUid: userProfile.uid,
        playerLevels: numericLevelsMap,
      });
      if (match) {
        onToast(`¡Cuarto encontrado! Cancha ${match.courtName} retenida para ${formatDateFriendly(match.date).toLowerCase()}.`);
      } else {
        onToast('Todavía no hay 4 jugadores compatibles con franja y cancha libre.');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleRespond = async (
    match: ProposedMatch,
    targetUid: string,
    decision: 'accepted' | 'declined'
  ) => {
    setBusy(true);
    try {
      const res = await respondToProposedMatch({
        club,
        proposedMatch: match,
        targetSlotUid: targetUid,
        decision,
        currentUid: userProfile.uid,
        courts,
        bookings,
        requests,
        memberships,
        playerLevels: numericLevelsMap,
      });
      if (res === 'confirmed') {
        onToast('¡Los 4 jugadores aceptaron! La cancha quedó reservada y confirmada.');
      } else if (res === 'replaced_or_cancelled') {
        onToast('Jugador dado de baja. Se liberó la cancha y el motor buscó reemplazo.');
      } else {
        onToast('Confirmación registrada. Esperando al resto de los jugadores.');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleTriggerUnfilledWarning = async (req: MatchRequest) => {
    setBusy(true);
    try {
      await triggerUnfilledSameDayAlert({
        club,
        req,
        currentUid: userProfile.uid,
      });
      onToast('Aviso enviado: falta 1 hora para tu franja de hoy y aún no se armó partido.');
    } finally {
      setBusy(false);
    }
  };

  const handleAcceptPartnerInvite = async (req: MatchRequest) => {
    setBusy(true);
    try {
      const proposed = await acceptMatchPartnerInvite({
        club,
        req,
        courts,
        bookings,
        requests,
        memberships,
        currentUid: userProfile.uid,
        playerLevels: numericLevelsMap,
      });
      if (proposed) {
        onToast(`¡Invitación aceptada! Partido propuesto en ${proposed.courtName} (${formatMinutes(proposed.startMinute)} hs).`);
      } else {
        onToast('Invitación de pareja fija aceptada. Ya están habilitados para emparejar.');
      }
    } finally {
      setBusy(false);
    }
  };

  const isFake = (uid: string) => /^demo[-_]/.test(uid);
  const simulateDrop = async (match: ProposedMatch, uid: string) => {
    setBusy(true);
    try {
      const r = await dropFromMatch(club, match, uid);
      onToast(r.status === 'searching' ? 'Se bajó un jugador. Ya estamos buscando reemplazo.' : 'Se bajó un jugador.');
    } catch {
      onToast('No se pudo simular la baja.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-8">
      <FillInvitesSection club={club} invites={fillInvites} searches={fillSearches} matches={proposedMatches} onToast={onToast} />
      <PhotoHeader
        image="/img/armar-partido.webp"
        title="Armá tu partido"
        subtitle="Decinos cuándo podés jugar y te juntamos con tres jugadores de tu categoría. El partido se confirma cuando aceptan los cuatro."
      >
        <button
          type="button"
          disabled={busy}
          onClick={handleRunSweep}
          className="mt-2 inline-flex min-h-[44px] w-fit items-center gap-2 rounded-xl bg-[#0bfbff] px-4 py-2 text-sm font-semibold text-[#172123] hover:brightness-95 cursor-pointer disabled:opacity-60"
        >
          <RefreshCw className="h-4 w-4" />
          Buscar partido ahora
        </button>
      </PhotoHeader>

      {/* Top Row: Global Category + Modality + Weekly Schedule */}
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 lg:col-span-5">
          <h2 className="font-display text-lg font-bold text-slate-900">
            Tu ficha de jugador
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Es una sola en toda la plataforma y se aplica automáticamente en todos los clubes.
          </p>

          <div className="mt-4 flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs">
            <p className="text-[11px] font-medium text-slate-500">Tu categoría</p>
            <p className="font-semibold text-slate-900">
              {formatCategory(userProfile.category)}
              <span className="ml-2 font-normal text-slate-600">
                · cruces de {formatCategory(Math.max(1, userProfile.category - 1))} a{' '}
                {formatCategory(Math.min(8, userProfile.category + 1))}
              </span>
            </p>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700">Categoría</label>
              <select
                value={userProfile.category}
                onChange={(e) =>
                  handleSaveGlobalSpecs(
                    Number(e.target.value),
                    userProfile.gender,
                    userProfile.preferredModality,
                    userProfile.weeklyAvailability
                  )
                }
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900"
              >
                {[1, 2, 3, 4, 5, 6, 7, 8].map((c) => (
                  <option key={c} value={c}>
                    {formatCategory(c)} {c === 1 ? '(Más alta)' : c === 8 ? '(Inicial)' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700">Modalidad preferida</label>
              <select
                value={userProfile.preferredModality}
                onChange={(e) => {
                  const nextMod = e.target.value as Modality;
                  setModality(nextMod);
                  handleSaveGlobalSpecs(
                    userProfile.category,
                    userProfile.gender,
                    nextMod,
                    userProfile.weeklyAvailability
                  );
                }}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900"
              >
                <option value="masculino">Masculino</option>
                <option value="femenino">Femenino</option>
                <option value="mixto">Mixto</option>
              </select>
            </div>
          </div>

          {/* Weekly Availability List */}
          <div className="mt-6 border-t border-slate-100 pt-4">
            <p className="text-xs font-semibold text-slate-800">Disponibilidad semanal habitual</p>
            <div className="mt-2.5 space-y-2">
              {userProfile.weeklyAvailability.map((w, idx) => (
                <div
                  key={`${w.dayOfWeek}-${w.startMinute}-${idx}`}
                  className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs"
                >
                  <span className="font-medium text-slate-800">
                    {getDayName(w.dayOfWeek)} ·{' '}
                    <span className=" tabular-nums">
                      {formatMinutes(w.startMinute)}–{formatMinutes(w.endMinute)}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const next = userProfile.weeklyAvailability.filter((_, i) => i !== idx);
                      handleSaveGlobalSpecs(
                        userProfile.category,
                        userProfile.gender,
                        userProfile.preferredModality,
                        next
                      );
                    }}
                    className="text-slate-400 hover:text-red-600 cursor-pointer"
                    aria-label="Quitar horario"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <select
                value={newWinDay}
                onChange={(e) => setNewWinDay(Number(e.target.value))}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800"
              >
                {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                  <option key={d} value={d}>
                    {getDayName(d)}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={7}
                max={22}
                value={newWinStart}
                onChange={(e) => setNewWinStart(Number(e.target.value))}
                className="w-16 rounded-lg border border-slate-200 px-2 py-1.5 text-xs tabular-nums"
              />
              <span className="text-xs text-slate-400">a</span>
              <input
                type="number"
                min={8}
                max={23}
                value={newWinEnd}
                onChange={(e) => setNewWinEnd(Number(e.target.value))}
                className="w-16 rounded-lg border border-slate-200 px-2 py-1.5 text-xs tabular-nums"
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (newWinEnd <= newWinStart) return;
                  const next = [
                    ...userProfile.weeklyAvailability,
                    { dayOfWeek: newWinDay, startMinute: newWinStart * 60, endMinute: newWinEnd * 60 },
                  ];
                  handleSaveGlobalSpecs(
                    userProfile.category,
                    userProfile.gender,
                    userProfile.preferredModality,
                    next
                  );
                }}
                className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                Agregar
              </button>
            </div>
          </div>
        </div>

        {/* New Priority / Weekly Match Request Composer */}
        <form
          onSubmit={handleSubmitRequest}
          className="rounded-2xl border border-slate-200 bg-white p-6 lg:col-span-7"
        >
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <h2 className="font-display text-lg font-bold text-slate-900">
                Pedir partido en {club.name}
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Los pedidos puntuales tienen prioridad y buscan cancha libre automáticamente.
              </p>
            </div>

            <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setReqType('priority')}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                  reqType === 'priority' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                Pedido puntual
              </button>
              <button
                type="button"
                onClick={() => setReqType('weekly')}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                  reqType === 'weekly' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                Franja semanal
              </button>
            </div>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {reqType === 'priority' ? (
              <div>
                <label className="block text-xs font-semibold text-slate-700">Fecha</label>
                <select
                  value={dateISO}
                  onChange={(e) => setDateISO(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-900"
                >
                  {[0, 1, 2, 3, 4, 5, 6].map((offset) => {
                    const iso = addDaysISO(today, offset);
                    return (
                      <option key={iso} value={iso}>
                        {offset === 0 ? `Hoy (${iso})` : offset === 1 ? `Mañana (${iso})` : `${getDayName(getDayOfWeekFromISO(iso))} (${iso})`}
                      </option>
                    );
                  })}
                </select>
              </div>
            ) : (
              <div>
                <label className="block text-xs font-semibold text-slate-700">Día de la semana</label>
                <select
                  value={dayOfWeek}
                  onChange={(e) => setDayOfWeek(Number(e.target.value))}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-900"
                >
                  {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                    <option key={d} value={d}>
                      Todos los {getDayName(d)}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700">Modalidad del partido</label>
              <select
                value={modality}
                onChange={(e) => setModality(e.target.value as Modality)}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-900"
              >
                <option value="masculino">Masculino</option>
                <option value="femenino">Femenino</option>
                <option value="mixto">Mixto</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700">Disponible desde (hs)</label>
              <select
                value={startHour}
                onChange={(e) => setStartHour(Number(e.target.value))}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 tabular-nums"
              >
                {Array.from({ length: 15 }, (_, i) => i + 8).map((h) => (
                  <option key={h} value={h}>
                    {String(h).padStart(2, '0')}:00
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700">Disponible hasta (hs)</label>
              <select
                value={endHour}
                onChange={(e) => setEndHour(Number(e.target.value))}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 tabular-nums"
              >
                {Array.from({ length: 15 }, (_, i) => i + 9).map((h) => (
                  <option key={h} value={h}>
                    {String(h).padStart(2, '0')}:00
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-4 space-y-2.5">
            <label className="block text-xs font-semibold text-slate-700">
              <span className="inline-flex items-center gap-1.5">
                <UserPlus className="h-3.5 w-3.5 text-emerald-600" />
                Jugar en pareja fija (opcional — la app busca otra dupla o dos rivales)
              </span>
            </label>

            {friendPlayers.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-medium text-slate-500">Tus amigos:</span>
                {friendPlayers.map((fp) => {
                  const isSelected = partnerUid === fp.uid;
                  const fpLevel = getPlayerLevel(fp.uid, fp.category);
                  return (
                    <button
                      key={fp.uid}
                      type="button"
                      onClick={() => setPartnerUid(isSelected ? '' : fp.uid)}
                      className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-semibold transition cursor-pointer ${
                        isSelected
                          ? 'border-emerald-600 bg-emerald-600 text-white'
                          : 'border-slate-200 bg-slate-50 text-slate-800 hover:border-emerald-300 hover:bg-emerald-50'
                      }`}
                    >
                      <span>{fp.displayName}</span>
                      <span className="opacity-75">
                        · {formatCategory(fp.category)}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            <select
              value={partnerUid}
              onChange={(e) => setPartnerUid(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900"
            >
              <option value="">Voy individual (buscar 3 jugadores compatibles)</option>
              {friendPlayers.length > 0 && (
                <optgroup label="Amigos que seguís">
                  {friendPlayers.map((p) => (
                    <option key={p.uid} value={p.uid}>
                      ★ {p.displayName} · {formatCategory(p.category)}
                    </option>
                  ))}
                </optgroup>
              )}
              {nonFriendPlayers.length > 0 && (
                <optgroup label="Otros jugadores del club">
                  {nonFriendPlayers.map((p) => (
                    <option key={p.uid} value={p.uid}>
                      Con {p.displayName} · {formatCategory(p.category)}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>

            {selectedPartner && (() => {
              const levelDiff = Math.abs(selectedPartner.category - userProfile.category);
              return (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-2.5 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="flex items-center gap-1.5 font-semibold text-emerald-900">
                      <CalendarClock className="h-3.5 w-3.5 text-emerald-700" />
                      Disponibilidad de {selectedPartner.displayName}:
                    </p>
                    <span className=" text-[11px] font-semibold text-emerald-800">
                      {levelDiff === 0
                        ? 'Misma categoría'
                        : levelDiff === 1
                          ? '1 categoría de diferencia'
                          : `${levelDiff} categorías de diferencia`}
                    </span>
                  </div>
                  <p className="mt-1 text-emerald-800">
                    {selectedPartner.weeklyAvailability.length > 0
                      ? selectedPartner.weeklyAvailability
                          .map(
                            (w) =>
                              `${getDayName(w.dayOfWeek)} ${formatMinutes(w.startMinute)}–${formatMinutes(w.endMinute)}`
                          )
                          .join(' · ')
                      : 'Sin horarios semanales cargados'}
                  </p>
                  {selectedPartnerOverlaps.length > 0 && (
                    <p className="mt-1 text-[11px] font-semibold text-emerald-700">
                      Coinciden en:{' '}
                      {selectedPartnerOverlaps
                        .map(
                          (o) =>
                            `${getDayName(o.dayOfWeek)} ${formatMinutes(o.startMinute)}–${formatMinutes(o.endMinute)}`
                        )
                        .join(' · ')}
                    </p>
                  )}
                </div>
              );
            })()}
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 pt-4">
            <p className="text-xs text-slate-500">
              Si ya hay jugadores compatibles en lista de espera, se retiene cancha al instante (plazo: {reqType === 'priority' && dateISO === today ? '30 min' : '2 horas'}).
            </p>
            <button
              type="submit"
              disabled={busy}
              className="min-h-[44px] rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-60 whitespace-nowrap shrink-0 cursor-pointer"
            >
              {busy ? 'Buscando...' : 'Publicar y buscar partido'}
            </button>
          </div>
        </form>
      </div>

      {/* Proposed & Confirmed Matches */}
      <section className="space-y-4">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-xl font-bold text-slate-900">
            Partidos propuestos y confirmados
          </h2>
          <span className=" text-xs text-slate-500 tabular-nums">
            {activeProposed.length} en curso
          </span>
        </div>

        {activeProposed.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
            Aún no hay propuestas activas. Publicá un pedido puntual para hoy de 18:00 a 22:00 en modalidad Mixto (categorías 4ta–6ta) para probar el cruce inmediato con los jugadores en espera.
          </div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-2">
            {activeProposed.map((match) => {
              const acceptedCount = match.slots.filter((s) => s.status === 'accepted').length;
              const mySlot = match.slots.find((s) => s.uid === userProfile.uid);
              const relatedBooking = bookings.find((b) => b.id === match.bookingId);
              const expiresTime = new Date(match.expiresAt).toLocaleTimeString('es-UY', {
                hour: '2-digit',
                minute: '2-digit',
              });
              const slotLevels = match.slots.map((s) => getPlayerLevel(s.uid, s.category));
              const levelSpread = Math.max(...slotLevels) - Math.min(...slotLevels);
              const search = searchForMatch(fillSearches, match.id);
              const badge = fillBadge(search);

              return (
                <div key={match.id} className="rounded-2xl border border-slate-200 bg-white p-5">
                  <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-3">
                    <div>
                      <p className="text-xs font-medium text-slate-500">
                        {match.modality.toUpperCase()} · {formatCategory(match.minCategory)}–{formatCategory(match.maxCategory)}
                        <span className="mx-1.5" aria-hidden="true">·</span>
                        <span className=" tabular-nums text-slate-700">
                          {levelSpread === 0 ? 'Equilibrio: Exacto' : `Equilibrio: ±${levelSpread} nv.`}
                        </span>
                        <span className="mx-1.5" aria-hidden="true">·</span>
                        <span className={match.status === 'confirmed' ? 'font-semibold text-emerald-700' : 'font-semibold text-amber-700'}>
                          {match.status === 'confirmed'
                            ? `Confirmado (${match.slots.length}/4)`
                            : `Cancha retenida (${acceptedCount}/4)`}
                        </span>
                      </p>
                      <h3 className="mt-1 flex flex-wrap items-center gap-2 font-display text-lg font-bold text-slate-900">
                        {match.courtName}
                        {badge && (
                          <span className={`rounded-full px-2.5 py-0.5 font-sans text-xs font-semibold ${BADGE_CLASSES[badge.tone]}`}>{badge.label}</span>
                        )}
                      </h3>
                      <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-600 tabular-nums">
                        <Clock className="h-3.5 w-3.5" />
                        {formatDateFriendly(match.date)} · {formatMinutes(match.startMinute)}–{formatMinutes(match.endMinute)} hs
                      </p>
                    </div>
                    <div className="text-right">
                      <p className=" text-lg font-bold text-slate-900 tabular-nums">
                        {formatUYU(match.pricePerPlayer)}
                      </p>
                      <p className="text-[11px] text-slate-500">por jugador (1/4)</p>
                    </div>
                  </div>

                  {match.status === 'pending' && (
                    <p className="mt-3 text-xs text-amber-800">
                      Plazo límite de aceptación: <span className=" font-semibold tabular-nums">{expiresTime} hs</span>. Si alguien rechaza o no contesta, la cancha se libera y se busca reemplazo.
                    </p>
                  )}

                  {/* 4 Player Slots */}
                  <div className="mt-4 divide-y divide-slate-100">
                    {match.slots.map((slot) => (
                      <div key={slot.uid} className="flex items-center justify-between gap-3 py-2.5">
                        <div>
                          <p className="text-sm font-medium text-slate-900">
                            {slot.displayName}
                            {slot.uid === userProfile.uid && ' (Vos)'}
                          </p>
                          <p className="text-xs text-slate-500">
                            {formatCategory(slot.category)}{' '}
                            ·{' '}
                            {slot.status === 'accepted' ? (
                              <span className="font-semibold text-emerald-700">Aceptó</span>
                            ) : slot.status === 'declined' ? (
                              <span className="font-semibold text-red-700">Rechazó</span>
                            ) : (
                              <span className="text-amber-700">Pendiente</span>
                            )}
                            {match.status === 'confirmed' && (
                              <>
                                <span className="mx-1.5" aria-hidden="true">·</span>
                                <span>{slot.paid ? 'Parte pagada' : 'Pago pendiente'}</span>
                              </>
                            )}
                          </p>
                        </div>

                        {/* Allow current player OR demo simulation on demo_* slots */}
                        {match.status === 'pending' &&
                          slot.status === 'pending' &&
                          (slot.uid === userProfile.uid || isFake(slot.uid)) && (
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => handleRespond(match, slot.uid, 'accepted')}
                                className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 cursor-pointer"
                              >
                                <Check className="h-3.5 w-3.5" />
                                {slot.uid === userProfile.uid ? 'Aceptar' : 'Simular OK'}
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => handleRespond(match, slot.uid, 'declined')}
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-red-50 hover:text-red-700 cursor-pointer"
                              >
                                <X className="h-3.5 w-3.5" />
                                Rechazar
                              </button>
                            </div>
                          )}

                        {match.status === 'confirmed' &&
                          !slot.paid &&
                          slot.uid === userProfile.uid &&
                          club.mpEnabled && (
                            <button
                              type="button"
                              onClick={() => setPayTarget(match)}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-700 cursor-pointer"
                            >
                              <CreditCard className="h-3.5 w-3.5" />
                              Pagar mi 1/4
                            </button>
                          )}

                        {match.status === 'confirmed' && isFake(slot.uid) && !search?.status?.match(/searching|unfilled/) && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => simulateDrop(match, slot.uid)}
                            className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-amber-50 cursor-pointer"
                          >
                            Simular "no puedo ir"
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  {mySlot && <MatchFillStatus club={club} match={match} search={search} userUid={userProfile.uid} onToast={onToast} />}
                  {mySlot && match.status === 'confirmed' && search?.status !== 'unfilled' && (
                    <DropMatchButton club={club} match={match} onToast={onToast} />
                  )}

                  {match.status === 'confirmed' && mySlot?.paid && (
                    <p className="mt-3 text-xs font-semibold text-emerald-700">
                      Tu parte ({formatUYU(match.pricePerPlayer)}) ya está abonada. ¡Buen partido!
                    </p>
                  )}

                  {relatedBooking && match.status === 'confirmed' && (
                    <p className="mt-2 text-xs text-slate-400">
                      Reserva #{relatedBooking.id.slice(-6)} · Pago dividido entre 4 jugadores
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Waiting Pool */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-emerald-600" />
            <h2 className="font-display text-lg font-bold text-slate-900">
              Jugadores esperando cruce en {club.name}
            </h2>
          </div>
          <span className=" text-xs text-slate-500 tabular-nums">
            {waitingRequests.length} pedidos en espera
          </span>
        </div>

        {waitingRequests.length === 0 ? (
          <p className="py-5 text-sm text-slate-500">No hay pedidos pendientes en espera.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {waitingRequests.map((r) => {
              const creatorLevel = getPlayerLevel(r.creatorUid, r.category);
              const isLevelMatch = r.creatorUid !== userProfile.uid && Math.abs(creatorLevel - myLevel) <= 1;
              return (
                <div key={r.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      {r.creatorName}
                      {r.partnerName ? ` + ${r.partnerName} (Pareja fija)` : ''}
                      <span className="mx-1.5 text-slate-400" aria-hidden="true">·</span>
                      <span className="text-slate-600">{formatCategory(r.category)}</span>
                      <span className="mx-1.5 text-slate-400" aria-hidden="true">·</span>
                      <span className="capitalize text-slate-600">{r.modality}</span>
                      {isLevelMatch && (
                        <>
                          <span className="mx-1.5 text-slate-400" aria-hidden="true">·</span>
                          <span className="text-xs font-semibold text-emerald-700">Nivel compatible</span>
                        </>
                      )}
                    </p>
                  <p className="text-xs text-slate-500">
                    {r.requestType === 'priority' ? `Puntual ${formatDateFriendly(r.date)}` : `Semanal (${getDayName(r.dayOfWeek)})`}
                    <span className="mx-1.5" aria-hidden="true">·</span>
                    <span className=" tabular-nums">
                      {formatMinutes(r.startMinute)}–{formatMinutes(r.endMinute)} hs
                    </span>
                    {r.isSameDay && (
                      <>
                        <span className="mx-1.5" aria-hidden="true">·</span>
                        <span className="font-semibold text-amber-700">Prioridad mismo día</span>
                      </>
                    )}
                    {r.partnerUid && !r.partnerAccepted && (
                      <>
                        <span className="mx-1.5" aria-hidden="true">·</span>
                        <span className="font-semibold text-amber-700">
                          Esperando confirmación de pareja
                        </span>
                      </>
                    )}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {r.partnerUid === userProfile.uid && !r.partnerAccepted && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleAcceptPartnerInvite(r)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <Check className="h-3.5 w-3.5" />
                      Aceptar invitación
                    </button>
                  )}

                  {r.creatorUid !== userProfile.uid && (() => {
                    const isFriend = friendUidSet.has(r.creatorUid);
                    const creatorMember = memberships.find((m) => m.uid === r.creatorUid);
                    return (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={async () => {
                          if (isFriend) {
                            await unfollowUser(userProfile.uid, r.creatorUid);
                            onToast(`Dejaste de seguir a ${r.creatorName}.`);
                          } else {
                            await followUser({
                              ownerUid: userProfile.uid,
                              target: {
                                uid: r.creatorUid,
                                displayName: r.creatorName,
                                category: creatorMember?.category ?? r.category,
                                gender: creatorMember?.gender ?? 'masculino',
                                preferredModality: creatorMember?.preferredModality ?? r.modality,
                                primaryClubId: club.id,
                                primaryClubName: club.name,
                              },
                            });
                            onToast(`Ahora seguís a ${r.creatorName}.`);
                          }
                        }}
                        className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold cursor-pointer whitespace-nowrap ${
                          isFriend
                            ? 'border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-red-50 hover:border-red-200 hover:text-red-700'
                            : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {isFriend ? <Check className="h-3.5 w-3.5" /> : <UserPlus className="h-3.5 w-3.5" />}
                        {isFriend ? 'Siguiendo' : 'Seguir'}
                      </button>
                    );
                  })()}

                  {r.isSameDay && !r.unfilledAlertSent && r.creatorUid === userProfile.uid && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleTriggerUnfilledWarning(r)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100 cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Simular aviso 1h antes sin armar
                    </button>
                  )}
                </div>
              </div>
              );
            })}
          </div>
        )}
      </section>

      <MercadoPagoModal
        open={!!payTarget}
        title={payTarget ? `Tu 1/4 en ${payTarget.courtName}` : ''}
        subtitle={
          payTarget
            ? `${formatDateFriendly(payTarget.date)} · ${formatMinutes(payTarget.startMinute)} hs`
            : ''
        }
        amount={payTarget?.pricePerPlayer || 0}
        receiverName={club.name}
        onConfirm={async () => {
          if (!payTarget) return;
          const bk = bookings.find((b) => b.id === payTarget.bookingId);
          await payMatchShare({
            club,
            match: payTarget,
            booking: bk,
            payerUid: userProfile.uid,
            payerName: userProfile.displayName,
            method: 'mercadopago',
          });
          onToast('Tu parte del partido quedó abonada vía Mercado Pago.');
        }}
        onClose={() => setPayTarget(null)}
      />
    </div>
  );
};
