/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth, logoutUser, testFirestoreConnection } from './lib/firebase';
import {
  obtainFcmDeviceToken,
  showServiceWorkerNotification,
  subscribeForegroundFcmMessages,
} from './lib/fcm';
import { computePlayerLevelsMap, type PlayerLevelSummary } from './lib/padelUtils';
import {
  ensureUserProfile,
  fetchDiscoverablePlayersAcrossClubs,
  saveUserFcmToken,
  seedPilotDataIfNeeded,
  subscribeClubData,
  subscribeClubs,
  subscribePlayerMatchResults,
  subscribeUserFcmTokens,
  subscribeUserFriends,
} from './services/firestoreService';
import type {
  Booking,
  Club,
  ClubMembership,
  Court,
  CourtWaitlistEntry,
  DiscoverablePlayer,
  MatchRequest,
  NotificationItem,
  PaymentRecord,
  PerspectiveRole,
  PlayerMatchResult,
  ProposedMatch,
  Tournament,
  UserFcmToken,
  UserFriend,
  UserProfile,
} from './types/padel';
import { AuthScreen } from './components/AuthScreen';
import { ClubAdminView } from './components/ClubAdminView';
import { FriendsView } from './components/FriendsView';
import { MatchmakingView, type MatchInvitePreset } from './components/MatchmakingView';
import { NotificationsPanel } from './components/NotificationsPanel';
import { OfflineIndicator } from './components/OfflineIndicator';
import { PlatformOwnerView } from './components/PlatformOwnerView';
import { PlayerBookingView } from './components/PlayerBookingView';
import { ProfileView } from './components/ProfileView';
import { StaffCounterView } from './components/StaffCounterView';
import { TopBar, type ActiveTab } from './components/TopBar';
import { TournamentsView } from './components/TournamentsView';

const VALID_TABS: ActiveTab[] = [
  'bookings',
  'matchmaking',
  'friends',
  'tournaments',
  'staff',
  'admin',
  'platform',
  'notifications',
  'profile',
];

function getInitialDeepLink(): { tab: ActiveTab; clubId: string } {
  if (typeof window === 'undefined') return { tab: 'bookings', clubId: '' };
  const params = new URLSearchParams(window.location.search);
  const rawTab = params.get('tab') as ActiveTab | null;
  const rawClub = params.get('clubId') || '';
  return {
    tab: rawTab && VALID_TABS.includes(rawTab) ? rawTab : 'bookings',
    clubId: rawClub,
  };
}

export default function App() {
  const initialDeepLink = useMemo(() => getInitialDeepLink(), []);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);

  const [clubs, setClubs] = useState<Club[]>([]);
  const [activeClubId, setActiveClubId] = useState<string>(initialDeepLink.clubId);
  const [perspectiveRole, setPerspectiveRole] = useState<PerspectiveRole>('player');
  const [activeTab, setActiveTab] = useState<ActiveTab>(initialDeepLink.tab);

  // Active club real-time collections
  const [courts, setCourts] = useState<Court[]>([]);
  const [memberships, setMemberships] = useState<ClubMembership[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [matchRequests, setMatchRequests] = useState<MatchRequest[]>([]);
  const [proposedMatches, setProposedMatches] = useState<ProposedMatch[]>([]);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [waitlistEntries, setWaitlistEntries] = useState<CourtWaitlistEntry[]>([]);
  const [playerMatchResults, setPlayerMatchResults] = useState<PlayerMatchResult[]>([]);
  const [clubMatchResults, setClubMatchResults] = useState<PlayerMatchResult[]>([]);
  const [friends, setFriends] = useState<UserFriend[]>([]);
  const [fcmTokens, setFcmTokens] = useState<UserFcmToken[]>([]);
  const [currentFcmTokenId, setCurrentFcmTokenId] = useState<string | null>(null);
  const [discoverablePlayers, setDiscoverablePlayers] = useState<DiscoverablePlayer[]>([]);
  const [invitePreset, setInvitePreset] = useState<MatchInvitePreset | null>(null);

  const seenNotifClubRef = useRef<string>('');
  const seenNotifIdsRef = useRef<Set<string>>(new Set());
  const notifInitializedRef = useRef<boolean>(false);

  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => {
      setToast((prev) => (prev === msg ? null : prev));
    }, 4200);
  };

  useEffect(() => {
    testFirestoreConnection();
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      setAuthUser(fbUser);
      if (!fbUser) {
        setUserProfile(null);
        setAuthReady(true);
        return;
      }
      try {
        const profile = await ensureUserProfile(fbUser);
        await seedPilotDataIfNeeded(fbUser, profile);
        setUserProfile(profile);
      } catch (err) {
        setBootError(err instanceof Error ? err.message : 'Error al inicializar tu cuenta.');
      } finally {
        setAuthReady(true);
      }
    });
    return () => unsub();
  }, []);

  // Subscribe to active clubs once authenticated
  useEffect(() => {
    if (!authUser || !userProfile) return;
    const unsub = subscribeClubs((nextClubs) => {
      setClubs(nextClubs);
      setActiveClubId((prev) => {
        if (prev && nextClubs.some((c) => c.id === prev)) return prev;
        return nextClubs[0]?.id || '';
      });
    });
    return () => unsub();
  }, [authUser, userProfile]);

  // Subscribe to personal match results for player performance analytics
  useEffect(() => {
    if (!authUser || !userProfile) {
      setPlayerMatchResults([]);
      return;
    }
    const unsub = subscribePlayerMatchResults(authUser.uid, setPlayerMatchResults);
    return () => unsub();
  }, [authUser, userProfile]);

  // Subscribe to followed friends list
  useEffect(() => {
    if (!authUser || !userProfile) {
      setFriends([]);
      return;
    }
    const unsub = subscribeUserFriends(authUser.uid, setFriends);
    return () => unsub();
  }, [authUser, userProfile]);

  // Subscribe to user's FCM device tokens & register foreground FCM listener
  useEffect(() => {
    if (!authUser || !userProfile) {
      setFcmTokens([]);
      setCurrentFcmTokenId(null);
      return;
    }

    const unsubTokens = subscribeUserFcmTokens(authUser.uid, setFcmTokens);

    let unsubFcm: () => void = () => undefined;
    let cancelled = false;

    subscribeForegroundFcmMessages(({ title, body, eventType, clubId, tab }) => {
      if (cancelled) return;
      showToast(`${title}: ${body}`);
      void showServiceWorkerNotification({ title, body, eventType, clubId, tab });
    }).then((unsub) => {
      if (cancelled) unsub();
      else unsubFcm = unsub;
    });

    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      obtainFcmDeviceToken(false).then((res) => {
        if (cancelled || !res.token || !res.tokenId) return;
        setCurrentFcmTokenId(res.tokenId);
        void saveUserFcmToken({
          uid: authUser.uid,
          token: res.token,
          tokenId: res.tokenId,
          deviceLabel: res.deviceLabel,
          platform: res.platform,
        });
      });
    }

    return () => {
      cancelled = true;
      unsubTokens();
      unsubFcm();
    };
  }, [authUser, userProfile]);

  const activeClub = useMemo(
    () => clubs.find((c) => c.id === activeClubId) || clubs[0] || null,
    [clubs, activeClubId]
  );

  // Load discoverable players across all active clubs for Amigos search & availability
  useEffect(() => {
    if (!authUser || !userProfile || clubs.length === 0) {
      setDiscoverablePlayers([]);
      return;
    }
    let cancelled = false;
    fetchDiscoverablePlayersAcrossClubs(clubs, authUser.uid, activeClub?.id).then((list) => {
      if (!cancelled) setDiscoverablePlayers(list);
    });
    return () => {
      cancelled = true;
    };
  }, [authUser, userProfile, clubs, activeClub?.id, memberships]);

  // Apply dynamic white-label CSS theme tokens for the active club
  useEffect(() => {
    if (activeClub) {
      document.documentElement.style.setProperty('--club-primary', activeClub.primaryColor);
      document.documentElement.style.setProperty('--club-accent', activeClub.accentColor);
    }
  }, [activeClub]);

  const isPlatformOwner = useMemo(() => {
    if (!authUser) return false;
    return (
      authUser.email === 'bernardo@awalabs.com' ||
      clubs.some((c) => c.ownerUid === authUser.uid)
    );
  }, [authUser, clubs]);

  // Subscribe to all operational collections of the active club
  useEffect(() => {
    if (!authUser || !activeClub) return;
    if (seenNotifClubRef.current !== activeClub.id) {
      seenNotifClubRef.current = activeClub.id;
      seenNotifIdsRef.current = new Set();
      notifInitializedRef.current = false;
    }

    const unsubs = subscribeClubData(
      activeClub.id,
      authUser.uid,
      activeClub.ownerUid,
      isPlatformOwner,
      {
        onCourts: setCourts,
        onMemberships: setMemberships,
        onBookings: setBookings,
        onMatchRequests: setMatchRequests,
        onProposedMatches: setProposedMatches,
        onTournaments: setTournaments,
        onPayments: setPayments,
        onNotifications: (list) => {
          if (!notifInitializedRef.current) {
            list.forEach((n) => seenNotifIdsRef.current.add(n.id));
            notifInitializedRef.current = true;
          } else {
            for (const item of list) {
              if (seenNotifIdsRef.current.has(item.id)) continue;
              seenNotifIdsRef.current.add(item.id);
              if (!item.read && item.recipientUid === authUser.uid && item.pushSent) {
                showToast(`${item.title} · ${item.body}`);
                void showServiceWorkerNotification({
                  title: item.title,
                  body: item.body,
                  eventType: item.eventType,
                  clubId: item.clubId,
                  tag: item.id,
                });
              }
            }
          }
          setNotifications(
            [...list].sort((a, b) => (a.read === b.read ? 0 : a.read ? 1 : -1))
          );
        },
        onMatchResults: setClubMatchResults,
        onWaitlist: setWaitlistEntries,
      }
    );
    return () => {
      unsubs.forEach((u) => u());
    };
  }, [authUser, activeClub, isPlatformOwner]);

  const currentMembership = useMemo(
    () => memberships.find((m) => m.uid === authUser?.uid),
    [memberships, authUser]
  );

  const canAccessAdmin = useMemo(
    () =>
      isPlatformOwner ||
      activeClub?.ownerUid === authUser?.uid ||
      currentMembership?.role === 'admin',
    [isPlatformOwner, activeClub, authUser, currentMembership]
  );

  const canAccessStaff = useMemo(
    () => canAccessAdmin || currentMembership?.role === 'staff',
    [canAccessAdmin, currentMembership]
  );

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read && n.recipientUid === authUser?.uid).length,
    [notifications, authUser]
  );

  const playerLevelsMap = useMemo<Map<string, PlayerLevelSummary>>(() => {
    const allKnownPlayers = [
      ...(userProfile ? [{ uid: userProfile.uid, category: userProfile.category }] : []),
      ...memberships.map((m) => ({ uid: m.uid, category: m.category })),
      ...discoverablePlayers.map((p) => ({ uid: p.uid, category: p.category })),
    ];
    return computePlayerLevelsMap({
      players: allKnownPlayers,
      tournaments,
      playerMatchResults,
      clubMatchResults,
    });
  }, [userProfile, memberships, discoverablePlayers, tournaments, playerMatchResults, clubMatchResults]);

  if (!authReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
        <div className="space-y-3 text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
          <p className="text-sm font-medium text-slate-600">Cargando CuatroEnCancha...</p>
        </div>
      </div>
    );
  }

  if (!authUser || !userProfile) {
    return (
      <>
        <AuthScreen onError={showToast} />
        <OfflineIndicator />
        {toast && (
          <div className="fixed bottom-6 right-6 z-50 rounded-xl bg-slate-900 px-4 py-3 text-xs font-semibold text-white shadow-xl">
            {toast}
          </div>
        )}
      </>
    );
  }

  if (bootError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md rounded-2xl border border-red-200 bg-white p-6 text-center">
          <h2 className="font-display text-lg font-bold text-slate-900">Error de conexión</h2>
          <p className="mt-2 text-xs text-slate-600 break-words">{bootError}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white cursor-pointer"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-20 md:pb-12">
      <TopBar
        clubs={clubs}
        activeClub={activeClub}
        onSelectClub={(id) => setActiveClubId(id)}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        perspectiveRole={perspectiveRole}
        onChangePerspective={setPerspectiveRole}
        canAccessStaff={canAccessStaff}
        canAccessAdmin={canAccessAdmin}
        canAccessPlatform={isPlatformOwner}
        unreadNotifications={unreadCount}
        userProfile={userProfile}
        onLogout={logoutUser}
      />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        {!activeClub ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
            <p className="text-sm text-slate-600">Preparando los clubes piloto en Montevideo...</p>
          </div>
        ) : (
          <>
            {activeTab === 'bookings' && (
              <PlayerBookingView
                club={activeClub}
                courts={courts}
                bookings={bookings}
                waitlistEntries={waitlistEntries}
                proposedMatches={proposedMatches}
                tournaments={tournaments}
                memberships={memberships}
                playerMatchResults={playerMatchResults}
                clubMatchResults={clubMatchResults}
                playerLevelsMap={playerLevelsMap}
                userProfile={userProfile}
                membership={currentMembership}
                onToast={showToast}
              />
            )}

            {activeTab === 'matchmaking' && (
              <MatchmakingView
                club={activeClub}
                clubs={clubs}
                courts={courts}
                bookings={bookings}
                requests={matchRequests}
                proposedMatches={proposedMatches}
                memberships={memberships}
                friends={friends}
                playerLevelsMap={playerLevelsMap}
                invitePreset={invitePreset}
                userProfile={userProfile}
                onProfileUpdated={setUserProfile}
                onToast={showToast}
              />
            )}

            {activeTab === 'friends' && (
              <FriendsView
                activeClub={activeClub}
                clubs={clubs}
                memberships={memberships}
                requests={matchRequests}
                friends={friends}
                discoverablePlayers={discoverablePlayers}
                playerLevelsMap={playerLevelsMap}
                userProfile={userProfile}
                onInviteToMatch={(partnerUid, options) => {
                  if (options?.clubId && options.clubId !== activeClub.id) {
                    setActiveClubId(options.clubId);
                  }
                  setInvitePreset({
                    partnerUid,
                    dayOfWeek: options?.dayOfWeek,
                    startHour: options?.startHour,
                    endHour: options?.endHour,
                    nonce: Date.now(),
                  });
                  setActiveTab('matchmaking');
                }}
                onToast={showToast}
              />
            )}

            {activeTab === 'tournaments' && (
              <TournamentsView
                club={activeClub}
                tournaments={tournaments}
                memberships={memberships}
                userProfile={userProfile}
                onToast={showToast}
              />
            )}

            {activeTab === 'staff' && canAccessStaff && (
              <StaffCounterView
                club={activeClub}
                courts={courts}
                bookings={bookings}
                memberships={memberships}
                tournaments={tournaments}
                userProfile={userProfile}
                onToast={showToast}
              />
            )}

            {activeTab === 'admin' && canAccessAdmin && (
              <ClubAdminView
                club={activeClub}
                courts={courts}
                memberships={memberships}
                bookings={bookings}
                proposedMatches={proposedMatches}
                tournaments={tournaments}
                payments={payments}
                playerMatchResults={playerMatchResults}
                clubMatchResults={clubMatchResults}
                playerLevelsMap={playerLevelsMap}
                userProfile={userProfile}
                onToast={showToast}
              />
            )}

            {activeTab === 'platform' && isPlatformOwner && (
              <PlatformOwnerView
                clubs={clubs}
                activeClubId={activeClub.id}
                activeClubBookingsCount={bookings.length}
                activeClubMatchesCount={proposedMatches.length}
                activeClubTournamentsCount={tournaments.length}
                userProfile={userProfile}
                onSelectClub={(id) => setActiveClubId(id)}
                onToast={showToast}
              />
            )}

            {activeTab === 'notifications' && (
              <NotificationsPanel
                club={activeClub}
                notifications={notifications}
                fcmTokens={fcmTokens}
                currentFcmTokenId={currentFcmTokenId}
                onCurrentFcmTokenIdChange={setCurrentFcmTokenId}
                userProfile={userProfile}
                onToast={showToast}
              />
            )}

            {activeTab === 'profile' && (
              <ProfileView
                userProfile={userProfile}
                clubs={clubs}
                activeClub={activeClub}
                membership={currentMembership}
                memberships={memberships}
                bookings={bookings}
                proposedMatches={proposedMatches}
                tournaments={tournaments}
                playerMatchResults={playerMatchResults}
                clubMatchResults={clubMatchResults}
                playerLevel={playerLevelsMap.get(userProfile.uid)}
                onProfileUpdated={setUserProfile}
                onLogout={logoutUser}
                onToast={showToast}
              />
            )}
          </>
        )}
      </main>

      <OfflineIndicator />

      {toast && (
        <div
          role="status"
          className="fixed bottom-20 right-4 z-50 max-w-sm rounded-xl bg-slate-900 px-4 py-3 text-xs font-semibold text-white shadow-xl md:bottom-6 md:right-6"
        >
          {toast}
        </div>
      )}
    </div>
  );
}
