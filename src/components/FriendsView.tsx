import React, { useMemo, useState } from 'react';
import {
  CalendarClock,
  Check,
  Search,
  Sparkles,
  UserCheck,
  UserMinus,
  UserPlus,
  Users,
} from 'lucide-react';
import type {
  AvailabilityWindow,
  Club,
  ClubMembership,
  DiscoverablePlayer,
  MatchRequest,
  UserFriend,
  UserProfile,
} from '../types/padel';
import {
  findAvailabilityOverlaps,
  formatCategory,
  formatMinutes,
  getDayName,
  type PlayerLevelSummary, CATEGORIES } from '../lib/padelUtils';
import { followUser, unfollowUser } from '../services/firestoreService';
import { GuestPassButton, useMyGuestPasses } from './Invitados';

interface FriendsViewProps {
  activeClub: Club;
  clubs: Club[];
  memberships: ClubMembership[];
  requests: MatchRequest[];
  friends: UserFriend[];
  discoverablePlayers: DiscoverablePlayer[];
  playerLevelsMap?: Map<string, PlayerLevelSummary>;
  userProfile: UserProfile;
  onInviteToMatch: (
    partnerUid: string,
    options?: {
      clubId?: string;
      dayOfWeek?: number;
      startHour?: number;
      endHour?: number;
    }
  ) => void;
  onToast: (msg: string) => void;
}

export const FriendsView: React.FC<FriendsViewProps> = ({
  activeClub,
  clubs,
  memberships,
  requests,
  friends,
  discoverablePlayers,
  playerLevelsMap,
  userProfile,
  onInviteToMatch,
  onToast,
}) => {
  const guestPasses = useMyGuestPasses(activeClub.id, userProfile.uid);
  const getLevel = (uid: string, fallbackCat: number) =>
    playerLevelsMap?.get(uid)?.level ?? Math.min(10, Math.max(1, Math.round(10.5 - fallbackCat)));
  const myLevel = getLevel(userProfile.uid, userProfile.category);
  const [friendSearch, setFriendSearch] = useState('');
  const [directorySearch, setDirectorySearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<number | 'all'>('all');
  const [clubScope, setClubScope] = useState<'active' | 'all'>('all');
  const [busyUid, setBusyUid] = useState<string | null>(null);

  const friendUidSet = useMemo(() => new Set(friends.map((f) => f.uid)), [friends]);
  const activeMemberMap = useMemo(
    () => new Map(memberships.map((m) => [m.uid, m])),
    [memberships]
  );
  const discoverableMap = useMemo(
    () => new Map(discoverablePlayers.map((p) => [p.uid, p])),
    [discoverablePlayers]
  );

  // Enrich followed friends with live membership availability, active match requests, and overlaps
  const enrichedFriends = useMemo(() => {
    return friends.map((f) => {
      const liveMember = activeMemberMap.get(f.uid);
      const directoryEntry = discoverableMap.get(f.uid);
      const availability: AvailabilityWindow[] =
        liveMember?.weeklyAvailability ||
        directoryEntry?.weeklyAvailability ||
        [];
      const overlaps = findAvailabilityOverlaps(
        userProfile.weeklyAvailability,
        availability,
        activeClub.slotDurationMinutes
      );
      const waitingRequest = requests.find(
        (r) =>
          r.status === 'waiting' &&
          (r.creatorUid === f.uid || r.partnerUid === f.uid)
      );
      const inActiveClub = Boolean(liveMember);
      const blockedInActive = liveMember?.blocked === true;

      return {
        friend: f,
        displayName: liveMember?.displayName || directoryEntry?.displayName || f.displayName,
        category: liveMember?.category ?? directoryEntry?.category ?? f.category,
        gender: liveMember?.gender ?? directoryEntry?.gender ?? f.gender,
        preferredModality:
          liveMember?.preferredModality ??
          directoryEntry?.preferredModality ??
          f.preferredModality,
        clubs: directoryEntry?.clubs || (f.primaryClubId ? [{ id: f.primaryClubId, name: f.primaryClubName }] : []),
        availability,
        overlaps,
        waitingRequest,
        inActiveClub,
        blockedInActive,
      };
    });
  }, [
    friends,
    activeMemberMap,
    discoverableMap,
    userProfile.weeklyAvailability,
    activeClub.slotDurationMinutes,
    requests,
  ]);

  const filteredFriends = useMemo(() => {
    const q = friendSearch.trim().toLowerCase();
    return enrichedFriends.filter((item) => {
      if (!q) return true;
      return item.displayName.toLowerCase().includes(q);
    });
  }, [enrichedFriends, friendSearch]);

  const friendsWithOverlapCount = useMemo(
    () => enrichedFriends.filter((item) => item.overlaps.length > 0).length,
    [enrichedFriends]
  );

  const friendsWaitingCount = useMemo(
    () => enrichedFriends.filter((item) => Boolean(item.waitingRequest)).length,
    [enrichedFriends]
  );

  const filteredDirectory = useMemo(() => {
    const q = directorySearch.trim().toLowerCase();
    return discoverablePlayers
      .filter((p) => {
        if (clubScope === 'active' && !p.clubs.some((c) => c.id === activeClub.id)) {
          return false;
        }
        if (categoryFilter !== 'all' && p.category !== categoryFilter) {
          return false;
        }
        if (q && !p.displayName.toLowerCase().includes(q)) {
          return false;
        }
        return true;
      })
      .map((p) => {
        const overlaps = findAvailabilityOverlaps(
          userProfile.weeklyAvailability,
          p.weeklyAvailability,
          activeClub.slotDurationMinutes
        );
        const categoryDiff = Math.abs(p.category - userProfile.category);
        return { player: p, overlaps, categoryDiff };
      })
      .sort((a, b) => {
        if (b.overlaps.length !== a.overlaps.length) {
          return b.overlaps.length - a.overlaps.length;
        }
        if (a.categoryDiff !== b.categoryDiff) {
          return a.categoryDiff - b.categoryDiff;
        }
        return a.player.displayName.localeCompare(b.player.displayName, 'es-UY');
      });
  }, [
    discoverablePlayers,
    directorySearch,
    categoryFilter,
    clubScope,
    activeClub.id,
    activeClub.slotDurationMinutes,
    userProfile.weeklyAvailability,
    userProfile.category,
  ]);

  const handleFollow = async (player: DiscoverablePlayer) => {
    setBusyUid(player.uid);
    try {
      const preferredClub =
        player.clubs.find((c) => c.id === activeClub.id) ||
        player.clubs[0] || { id: activeClub.id, name: activeClub.name };
      await followUser({
        ownerUid: userProfile.uid,
        target: {
          uid: player.uid,
          displayName: player.displayName,
          category: player.category,
          gender: player.gender,
          preferredModality: player.preferredModality,
          primaryClubId: preferredClub.id,
          primaryClubName: preferredClub.name,
        },
      });
      onToast(`Ahora seguís a ${player.displayName}.`);
    } catch {
      onToast('No se pudo seguir al jugador. Intentá de nuevo.');
    } finally {
      setBusyUid(null);
    }
  };

  const handleUnfollow = async (friendUid: string, name: string) => {
    setBusyUid(friendUid);
    try {
      await unfollowUser(userProfile.uid, friendUid);
      onToast(`Dejaste de seguir a ${name}.`);
    } catch {
      onToast('No se pudo actualizar tu lista de amigos.');
    } finally {
      setBusyUid(null);
    }
  };

  const handleInviteFriend = (item: (typeof enrichedFriends)[number]) => {
    const firstOverlap = item.overlaps[0];
    const targetClubId = item.inActiveClub
      ? activeClub.id
      : item.clubs[0]?.id || item.friend.primaryClubId;

    if (item.waitingRequest) {
      onInviteToMatch(item.friend.uid, {
        clubId: activeClub.id,
        dayOfWeek: item.waitingRequest.dayOfWeek,
        startHour: Math.floor(item.waitingRequest.startMinute / 60),
        endHour: Math.ceil(item.waitingRequest.endMinute / 60),
      });
      return;
    }

    if (firstOverlap) {
      onInviteToMatch(item.friend.uid, {
        clubId: targetClubId,
        dayOfWeek: firstOverlap.dayOfWeek,
        startHour: Math.floor(firstOverlap.startMinute / 60),
        endHour: Math.ceil(firstOverlap.endMinute / 60),
      });
      return;
    }

    const fallbackSlot = item.availability[0];
    onInviteToMatch(item.friend.uid, {
      clubId: targetClubId,
      dayOfWeek: fallbackSlot?.dayOfWeek,
      startHour: fallbackSlot ? Math.floor(fallbackSlot.startMinute / 60) : undefined,
      endHour: fallbackSlot ? Math.ceil(fallbackSlot.endMinute / 60) : undefined,
    });
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <p className="text-xs font-medium text-emerald-700">
          Compañeros frecuentes · Horarios en común · Invitación directa a pareja fija
        </p>
        <h1 className="mt-1 font-display text-2xl font-bold text-slate-900 sm:text-3xl">
          Amigos y red de jugadores
        </h1>
      </div>

      {/* 3-KPI Summary Strip */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-medium text-slate-500">Amigos que seguís</p>
          <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-slate-900">
            {friends.length}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            Disponibles para invitar en 1 clic
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-medium text-slate-500">Con disponibilidad compatible</p>
          <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-emerald-700">
            {friendsWithOverlapCount}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            Coinciden con tu agenda semanal
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-medium text-slate-500">Buscando partido en {activeClub.name}</p>
          <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-slate-900">
            {friendsWaitingCount}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            Pedidos activos en lista de espera
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left: Followed Friends & Live Availability */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6 space-y-5 lg:col-span-7">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div className="flex items-center gap-2.5">
              <UserCheck className="h-5 w-5 text-emerald-600" />
              <div>
                <h2 className="font-display text-lg font-bold text-slate-900">
                  Tus amigos ({friends.length})
                </h2>
                <p className="text-xs text-slate-500">
                  Consultá sus horarios habituales e invitalos directo a armar partido
                </p>
              </div>
            </div>

            {friends.length > 0 && (
              <div className="relative w-full sm:w-56">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={friendSearch}
                  onChange={(e) => setFriendSearch(e.target.value)}
                  placeholder="Filtrar amigos..."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-8 pr-3 text-xs text-slate-900 focus:border-emerald-600 focus:bg-white focus:outline-none"
                />
              </div>
            )}
          </div>

          {friends.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-8 text-center">
              <Users className="mx-auto h-8 w-8 text-slate-400" />
              <p className="mt-3 font-display text-sm font-bold text-slate-900">
                Todavía no seguís a ningún jugador
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Buscá compañeros habituales en el directorio de la derecha para ver su disponibilidad semanal e invitarlos rápido en pareja fija.
              </p>
            </div>
          ) : filteredFriends.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-500">
              No encontramos amigos que coincidan con "{friendSearch}".
            </p>
          ) : (
            <div className="space-y-4">
              {filteredFriends.map((item) => {
                const { friend } = item;
                const isBusy = busyUid === friend.uid;
                const targetClubName =
                  clubs.find((c) => c.id === (item.clubs[0]?.id || friend.primaryClubId))?.name ||
                  friend.primaryClubName;

                return (
                  <div
                    key={friend.uid}
                    className="rounded-xl border border-slate-200 p-4 space-y-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-display text-base font-bold text-slate-900">
                            {item.displayName}
                          </h3>
                          <span className="text-xs font-semibold text-slate-600">
                            {formatCategory(item.category)}
                          </span>
                          <span className="text-slate-300" aria-hidden="true">·</span>
                          <span className="text-xs capitalize text-slate-500">
                            {item.preferredModality}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {item.inActiveClub
                            ? `Activo en ${activeClub.name}`
                            : item.clubs.length > 0
                              ? `Juega en ${item.clubs.map((c) => c.name).join(', ')}`
                              : targetClubName}
                          {item.blockedInActive && (
                            <span className="ml-2 font-semibold text-red-600">· Suspendido en este club</span>
                          )}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {!item.blockedInActive && (
                          <button
                            type="button"
                            onClick={() => handleInviteFriend(item)}
                            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            <UserPlus className="h-3.5 w-3.5" />
                            {item.inActiveClub
                              ? 'Invitar a partido'
                              : `Invitar en ${targetClubName}`}
                          </button>
                        )}
                        {!item.inActiveClub && (
                          <GuestPassButton club={activeClub} friendUid={friend.uid} passes={guestPasses} onToast={onToast} />
                        )}
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleUnfollow(friend.uid, item.displayName)}
                          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-red-50 hover:border-red-200 hover:text-red-700 disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <UserMinus className="h-3.5 w-3.5" />
                          Dejar de seguir
                        </button>
                      </div>
                    </div>

                    {/* Active Waitlist Callout */}
                    {item.waitingRequest && (
                      <div className="flex items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50/80 px-3 py-2 text-xs">
                        <span className="font-medium text-emerald-900">
                          Buscando partido ahora:{' '}
                          <strong className="font-mono tabular-nums">
                            {item.waitingRequest.requestType === 'priority'
                              ? item.waitingRequest.date
                              : getDayName(item.waitingRequest.dayOfWeek)}{' '}
                            {formatMinutes(item.waitingRequest.startMinute)}–
                            {formatMinutes(item.waitingRequest.endMinute)} hs
                          </strong>{' '}
                          ({item.waitingRequest.modality})
                        </span>
                      </div>
                    )}

                    {/* Friend's Weekly Availability & Overlaps */}
                    <div className="border-t border-slate-100 pt-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                        <span className="flex items-center gap-1.5 font-semibold text-slate-700">
                          <CalendarClock className="h-3.5 w-3.5 text-slate-400" />
                          Disponibilidad semanal habitual
                        </span>
                        {item.overlaps.length > 0 && (
                          <span className="flex items-center gap-1 font-semibold text-emerald-700">
                            <Sparkles className="h-3 w-3" />
                            {item.overlaps.length}{' '}
                            {item.overlaps.length === 1 ? 'horario en común' : 'horarios en común'}
                          </span>
                        )}
                      </div>

                      {item.availability.length === 0 ? (
                        <p className="mt-1.5 text-xs text-slate-400">
                          Este jugador aún no cargó horarios habituales.
                        </p>
                      ) : (
                        <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                          {item.availability.slice(0, 6).map((win, idx) => {
                            const hasOverlap = item.overlaps.some(
                              (ov) =>
                                ov.dayOfWeek === win.dayOfWeek &&
                                ov.startMinute < win.endMinute &&
                                ov.endMinute > win.startMinute
                            );
                            return (
                              <div
                                key={`${win.dayOfWeek}-${win.startMinute}-${idx}`}
                                className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs ${
                                  hasOverlap
                                    ? 'bg-emerald-50 text-emerald-900 font-medium'
                                    : 'bg-slate-50 text-slate-700'
                                }`}
                              >
                                <span>{getDayName(win.dayOfWeek)}</span>
                                <span className="font-mono tabular-nums">
                                  {formatMinutes(win.startMinute)}–{formatMinutes(win.endMinute)}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Right: Discover & Follow Players */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4 lg:col-span-5">
          <div className="border-b border-slate-100 pb-4">
            <h2 className="font-display text-lg font-bold text-slate-900">
              Buscar jugadores para seguir
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Explorá perfiles visibles de {activeClub.name} y de toda la red de clubes
            </p>
          </div>

          <div className="space-y-2.5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={directorySearch}
                onChange={(e) => setDirectorySearch(e.target.value)}
                placeholder="Buscar jugador por nombre..."
                className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-8 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <select
                value={clubScope}
                onChange={(e) => setClubScope(e.target.value as 'active' | 'all')}
                className="rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs font-medium text-slate-800"
              >
                <option value="all">Toda la red ({clubs.length} clubes)</option>
                <option value="active">Solo {activeClub.name}</option>
              </select>

              <select
                value={categoryFilter}
                onChange={(e) =>
                  setCategoryFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))
                }
                className="rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs font-medium text-slate-800"
              >
                <option value="all">Todas las categorías</option>
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {formatCategory(cat)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="divide-y divide-slate-100">
            {filteredDirectory.length === 0 ? (
              <p className="py-8 text-center text-xs text-slate-500">
                No se encontraron jugadores visibles con esos filtros.
              </p>
            ) : (
              filteredDirectory.map(({ player, overlaps, categoryDiff }) => {
                const isFollowing = friendUidSet.has(player.uid);
                const isBusy = busyUid === player.uid;

                return (
                  <div key={player.uid} className="flex items-start justify-between gap-3 py-3.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="truncate text-sm font-semibold text-slate-900">
                          {player.displayName}
                        </span>
                        <span className="text-xs font-medium text-slate-600">
                          · {formatCategory(player.category)}
                        </span>
                        {(categoryDiff <= 1 || Math.abs(getLevel(player.uid, player.category) - myLevel) <= 1) && (
                          <span className="text-[11px] font-medium text-emerald-700">
                            · Nivel compatible
                          </span>
                        )}
                      </div>

                      <p className="mt-0.5 truncate text-[11px] text-slate-500">
                        <span className="capitalize">{player.preferredModality}</span>
                        <span className="mx-1" aria-hidden="true">·</span>
                        {player.clubs.map((c) => c.name).join(', ')}
                      </p>

                      {player.weeklyAvailability.length > 0 && (
                        <p className="mt-1 text-[11px] text-slate-600">
                          {overlaps.length > 0 ? (
                            <span className="font-semibold text-emerald-700">
                              Coincide:{' '}
                              {overlaps
                                .slice(0, 2)
                                .map(
                                  (o) =>
                                    `${getDayName(o.dayOfWeek).slice(0, 3)} ${formatMinutes(o.startMinute)}–${formatMinutes(o.endMinute)}`
                                )
                                .join(', ')}
                            </span>
                          ) : (
                            <span>
                              Juega:{' '}
                              {player.weeklyAvailability
                                .slice(0, 2)
                                .map(
                                  (w) =>
                                    `${getDayName(w.dayOfWeek).slice(0, 3)} ${formatMinutes(w.startMinute)}–${formatMinutes(w.endMinute)}`
                                )
                                .join(', ')}
                            </span>
                          )}
                        </p>
                      )}
                    </div>

                    {isFollowing ? (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleUnfollow(player.uid, player.displayName)}
                        className="inline-flex min-h-[34px] shrink-0 items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800 hover:bg-red-50 hover:border-red-200 hover:text-red-700 whitespace-nowrap cursor-pointer"
                      >
                        <Check className="h-3.5 w-3.5" />
                        Siguiendo
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleFollow(player)}
                        className="inline-flex min-h-[34px] shrink-0 items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 whitespace-nowrap cursor-pointer"
                      >
                        <UserPlus className="h-3.5 w-3.5" />
                        Seguir
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>
    </div>
  );
};
