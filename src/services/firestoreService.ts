import type { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  addDaysISO,
  calculateSlotPrice,
  canCancelFree,
  formatCategory,
  formatDateFriendly,
  formatMinutes,
  generateTournamentDraw,
  getDayOfWeekFromISO,
  getTodayISO,
  sanitizeId, MAX_CATEGORY } from '../lib/padelUtils';
import { sendServerFcmPush, showServiceWorkerNotification } from '../lib/fcm';
import type {
  AvailabilityWindow,
  Booking,
  Club,
  ClubMembership,
  ClubRole,
  Court,
  CourtWaitlistEntry,
  DiscoverablePlayer,
  Gender,
  MatchRequest,
  Modality,
  NotificationEventType,
  FillChoice,
  FillInvite,
  FillSearch,
  AlertPrefs,
  RecoveryRecord,
  NotificationItem,
  PaymentRecord,
  PlayerMatchResult,
  ProposedMatch,
  RoofType,
  SurfaceType,
  Tournament,
  TournamentFormat,
  TournamentPair,
  UserFcmToken,
  UserFriend,
  UserPrivateInfo,
  UserProfile,
} from '../types/padel';

function makeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

// Notification Matrix Rules from Product Spec (Page 3):
// Reserva confirmada o cancelada -> Push: Sí, Mail: Sí
// Recordatorio 2 horas antes -> Push: Sí, Mail: No
// Partido propuesto -> Push: Sí, Mail: No
// Partido confirmado -> Push: Sí, Mail: Sí
// Torneo nuevo de su categoría -> Push: Sí, Mail: Sí
// Invitación a formar pareja -> Push: Sí, Mail: Sí
// Próximo partido del torneo -> Push: Sí, Mail: Sí
// Aviso partido del mismo día sin armar 1h antes -> Push: Sí, Mail: No
const NOTIFICATION_CHANNELS: Record<NotificationEventType, { push: boolean; email: boolean }> = {
  booking_confirmed: { push: true, email: true },
  booking_cancelled: { push: true, email: true },
  reminder_2h: { push: true, email: false },
  match_proposed: { push: true, email: false },
  match_confirmed: { push: true, email: true },
  match_unfilled_1h: { push: true, email: false },
  match_expired: { push: true, email: false },
  fill_invite: { push: true, email: false },
  fill_update: { push: true, email: false },
  tournament_new: { push: true, email: true },
  pair_invite: { push: true, email: true },
  tournament_next_match: { push: true, email: true },
  waitlist_slot_open: { push: true, email: false },
  category_changed: { push: true, email: false },
};

function getDefaultTabForEvent(eventType: NotificationEventType): string {
  switch (eventType) {
    case 'booking_confirmed':
    case 'booking_cancelled':
    case 'reminder_2h':
    case 'waitlist_slot_open':
      return 'bookings';
    case 'match_proposed':
    case 'match_confirmed':
    case 'match_unfilled_1h':
    case 'match_expired':
    case 'fill_invite':
    case 'fill_update':
    case 'pair_invite':
      return 'matchmaking';
    case 'tournament_new':
    case 'tournament_next_match':
      return 'tournaments';
    case 'category_changed':
      return 'profile';
    default:
      return 'notifications';
  }
}

export async function dispatchNotification(params: {
  clubId: string;
  recipientUid: string;
  eventType: NotificationEventType;
  title: string;
  body: string;
  currentUserUid?: string;
  tab?: string;
}) {
  const { clubId, recipientUid, eventType, title, body, currentUserUid, tab } = params;
  const id = makeId('notif');
  const channels = NOTIFICATION_CHANNELS[eventType];
  const path = `clubs/${clubId}/notifications/${id}`;
  const cleanTitle = title.slice(0, 120);
  const cleanBody = body.slice(0, 320);
  const targetTab = tab || getDefaultTabForEvent(eventType);

  try {
    await setDoc(doc(db, 'clubs', clubId, 'notifications', id), {
      id,
      clubId,
      recipientUid,
      eventType,
      title: cleanTitle,
      body: cleanBody,
      pushSent: channels.push,
      emailSent: channels.email,
      read: false,
      createdAt: serverTimestamp(),
    });

    if (channels.push) {
      if (recipientUid === currentUserUid) {
        void showServiceWorkerNotification({
          title: cleanTitle,
          body: cleanBody,
          eventType,
          clubId,
          tab: targetTab,
          tag: id,
        });
      } else if (!recipientUid.startsWith('demo_')) {
        void sendServerFcmPush({
          recipientUids: [recipientUid],
          clubId,
          eventType,
          title: cleanTitle,
          body: cleanBody,
          tab: targetTab,
        });
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function ensureUserProfile(firebaseUser: User): Promise<UserProfile> {
  const userPath = `users/${firebaseUser.uid}`;
  try {
    const snap = await getDoc(doc(db, 'users', firebaseUser.uid));
    if (snap.exists()) {
      return snap.data() as UserProfile;
    }

    const defaultProfile: UserProfile = {
      uid: firebaseUser.uid,
      displayName: (firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Jugador').slice(0, 80),
      photoUrl: firebaseUser.photoURL || '',
      category: 5,
      gender: 'masculino',
      preferredModality: 'mixto',
      weeklyAvailability: [
        { dayOfWeek: 2, startMinute: 19 * 60, endMinute: 23 * 60 },
        { dayOfWeek: 4, startMinute: 19 * 60, endMinute: 23 * 60 },
      ],
      activeClubIds: ['pocitos_padel', 'carrasco_indoor'],
    };

    await setDoc(doc(db, 'users', firebaseUser.uid), {
      ...defaultProfile,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await setDoc(doc(db, 'users', firebaseUser.uid, 'private', 'info'), {
      uid: firebaseUser.uid,
      email: firebaseUser.email || 'jugador@armapartido.com',
      phone: '',
      updatedAt: serverTimestamp(),
    });

    return defaultProfile;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, userPath);
  }
}

export async function updateUserGlobalProfile(
  uid: string,
  updates: Partial<Pick<UserProfile, 'displayName' | 'category' | 'gender' | 'preferredModality' | 'weeklyAvailability' | 'activeClubIds'>>,
  clubIdsToSync: string[] = []
) {
  const path = `users/${uid}`;
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) return;
    const current = snap.data() as UserProfile;
    const nextData: UserProfile = {
      ...current,
      ...updates,
    };
    await updateDoc(doc(db, 'users', uid), {
      displayName: nextData.displayName.slice(0, 80),
      category: nextData.category,
      gender: nextData.gender,
      preferredModality: nextData.preferredModality,
      weeklyAvailability: nextData.weeklyAvailability.slice(0, 21),
      activeClubIds: nextData.activeClubIds.slice(0, 20),
      updatedAt: serverTimestamp(),
    });

    // Keep club memberships synchronized with global player profile
    for (const clubId of clubIdsToSync) {
      const memRef = doc(db, 'clubs', clubId, 'memberships', uid);
      const memSnap = await getDoc(memRef);
      if (memSnap.exists()) {
        await updateDoc(memRef, {
          displayName: nextData.displayName.slice(0, 80),
          category: nextData.category,
          gender: nextData.gender,
          preferredModality: nextData.preferredModality,
          weeklyAvailability: nextData.weeklyAvailability.slice(0, 21),
          updatedAt: serverTimestamp(),
        });
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function getUserPrivateInfo(uid: string): Promise<UserPrivateInfo | null> {
  const path = `users/${uid}/private/info`;
  try {
    const snap = await getDoc(doc(db, 'users', uid, 'private', 'info'));
    return snap.exists() ? (snap.data() as UserPrivateInfo) : null;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}

export async function seedPilotDataIfNeeded(user: User, userProfile: UserProfile): Promise<void> {
  const clubsPath = 'clubs';
  try {
    const clubsSnap = await getDocs(query(collection(db, 'clubs'), where('active', '==', true)));
    const today = getTodayISO();
    const tomorrow = addDaysISO(today, 1);

    if (clubsSnap.empty) {
      const batch = writeBatch(db);
      const trialEnd = addDaysISO(today, 24);

      const club1: Club = {
        id: 'pocitos_padel',
        name: 'Pocitos Pádel Club',
        slug: 'pocitos-padel',
        primaryColor: '#00696b',
        accentColor: '#0F172A',
        address: 'Av. Brasil 2740, Pocitos',
        neighborhood: 'Pocitos',
        city: 'Montevideo',
        lat: -34.9102,
        lng: -56.1489,
        ownerUid: user.uid,
        slotDurationMinutes: 90,
        openHour: 8,
        closeHour: 23,
        basePrice: 1800,
        nightFromHour: 19,
        nightPrice: 2400,
        weekendPrice: 2200,
        cancellationHours: 4,
        maxNoShowsBeforeBlock: 3,
        mpEnabled: true,
        mpMode: 'deposit',
        mpDepositPercent: 30,
        subscriptionStatus: 'trial',
        trialEndsAt: trialEnd,
        monthlyPricePerCourt: 1900,
        courtCount: 4,
        active: true,
      };

      const club2: Club = {
        id: 'carrasco_indoor',
        name: 'Carrasco Indoor Pádel',
        slug: 'carrasco-indoor',
        primaryColor: '#0284C7',
        accentColor: '#0F172A',
        address: 'Cno. Carrasco 6120, Carrasco',
        neighborhood: 'Carrasco',
        city: 'Montevideo',
        lat: -34.8854,
        lng: -56.0607,
        ownerUid: user.uid,
        slotDurationMinutes: 90,
        openHour: 9,
        closeHour: 23,
        basePrice: 2100,
        nightFromHour: 19,
        nightPrice: 2700,
        weekendPrice: 2500,
        cancellationHours: 6,
        maxNoShowsBeforeBlock: 3,
        mpEnabled: true,
        mpMode: 'full',
        mpDepositPercent: 100,
        subscriptionStatus: 'active',
        trialEndsAt: '',
        monthlyPricePerCourt: 1900,
        courtCount: 3,
        active: true,
      };

      batch.set(doc(db, 'clubs', club1.id), { ...club1, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      batch.set(doc(db, 'clubs', club2.id), { ...club2, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });

      const courts1: Omit<Court, 'createdAt' | 'updatedAt'>[] = [
        { id: 'cancha_1', clubId: club1.id, name: 'Cancha 1 · Central', roof: 'techada', surface: 'cristal', hasLights: true, active: true },
        { id: 'cancha_2', clubId: club1.id, name: 'Cancha 2 · Panorámica', roof: 'techada', surface: 'cristal', hasLights: true, active: true },
        { id: 'cancha_3', clubId: club1.id, name: 'Cancha 3 · Muro Norte', roof: 'techada', surface: 'muro', hasLights: true, active: true },
        { id: 'cancha_4', clubId: club1.id, name: 'Cancha 4 · Jardín', roof: 'aire_libre', surface: 'cristal', hasLights: false, active: true },
      ];
      for (const ct of courts1) {
        batch.set(doc(db, 'clubs', club1.id, 'courts', ct.id), { ...ct, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      }

      const courts2: Omit<Court, 'createdAt' | 'updatedAt'>[] = [
        { id: 'cancha_a', clubId: club2.id, name: 'Cancha A · Pro', roof: 'techada', surface: 'cristal', hasLights: true, active: true },
        { id: 'cancha_b', clubId: club2.id, name: 'Cancha B · Cristal', roof: 'techada', surface: 'cristal', hasLights: true, active: true },
        { id: 'cancha_c', clubId: club2.id, name: 'Cancha C · Entreno', roof: 'techada', surface: 'muro', hasLights: true, active: true },
      ];
      for (const ct of courts2) {
        batch.set(doc(db, 'clubs', club2.id, 'courts', ct.id), { ...ct, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      }

      // Demo players in Pocitos Pádel Club across categories 4ta–6ta so matchmaking works immediately
      const demoPlayers: { uid: string; name: string; cat: number; gender: Gender; modality: Modality; role: ClubRole }[] = [
        { uid: 'demo_mateo_r', name: 'Mateo Rodríguez', cat: 5, gender: 'masculino', modality: 'mixto', role: 'player' },
        { uid: 'demo_lucia_f', name: 'Lucía Fernández', cat: 5, gender: 'femenino', modality: 'mixto', role: 'player' },
        { uid: 'demo_tomas_s', name: 'Tomás Silva', cat: 4, gender: 'masculino', modality: 'mixto', role: 'player' },
        { uid: 'demo_valentina_m', name: 'Valentina Méndez', cat: 6, gender: 'femenino', modality: 'femenino', role: 'player' },
        { uid: 'demo_federico_g', name: 'Federico Gómez', cat: 5, gender: 'masculino', modality: 'masculino', role: 'staff' },
      ];

      for (const dp of demoPlayers) {
        const dowToday = getDayOfWeekFromISO(today);
        const mem: ClubMembership = {
          uid: dp.uid,
          clubId: club1.id,
          displayName: dp.name,
          role: dp.role,
          category: dp.cat,
          gender: dp.gender,
          preferredModality: dp.modality,
          weeklyAvailability: [
            { dayOfWeek: dowToday, startMinute: 18 * 60, endMinute: 22 * 60 },
            { dayOfWeek: (dowToday + 1) % 7, startMinute: 19 * 60, endMinute: 22 * 60 },
          ],
          noShowCount: 0,
          blocked: false,
          isDiscoverable: true,
        };
        batch.set(doc(db, 'clubs', club1.id, 'memberships', dp.uid), {
          ...mem,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      // Seed waiting match requests for today so if the user submits a matching request, a 4-player match is formed!
      const dowToday = getDayOfWeekFromISO(today);
      const demoReqs: MatchRequest[] = [
        {
          id: 'req_demo_1',
          clubId: club1.id,
          clubIds: [club1.id],
          creatorUid: 'demo_mateo_r',
          creatorName: 'Mateo Rodríguez',
          partnerUid: '',
          partnerName: '',
          partnerAccepted: true,
          category: 5,
          modality: 'mixto',
          requestType: 'priority',
          date: today,
          dayOfWeek: dowToday,
          startMinute: 18 * 60,
          endMinute: 22 * 60,
          isSameDay: true,
          status: 'waiting',
          unfilledAlertSent: false,
        },
        {
          id: 'req_demo_2',
          clubId: club1.id,
          clubIds: [club1.id],
          creatorUid: 'demo_lucia_f',
          creatorName: 'Lucía Fernández',
          partnerUid: '',
          partnerName: '',
          partnerAccepted: true,
          category: 5,
          modality: 'mixto',
          requestType: 'priority',
          date: today,
          dayOfWeek: dowToday,
          startMinute: 18 * 60,
          endMinute: 22 * 60,
          isSameDay: true,
          status: 'waiting',
          unfilledAlertSent: false,
        },
        {
          id: 'req_demo_3',
          clubId: club1.id,
          clubIds: [club1.id],
          creatorUid: 'demo_tomas_s',
          creatorName: 'Tomás Silva',
          partnerUid: '',
          partnerName: '',
          partnerAccepted: true,
          category: 4,
          modality: 'mixto',
          requestType: 'priority',
          date: today,
          dayOfWeek: dowToday,
          startMinute: 18 * 60,
          endMinute: 22 * 60,
          isSameDay: true,
          status: 'waiting',
          unfilledAlertSent: false,
        },
      ];
      for (const req of demoReqs) {
        batch.set(doc(db, 'clubs', club1.id, 'matchRequests', req.id), {
          ...req,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      // Seed 2 realistic bookings on today's grid
      const sampleBooking: Booking = {
        id: 'bk_demo_1',
        clubId: club1.id,
        courtId: 'cancha_1',
        courtName: 'Cancha 1 · Central',
        date: today,
        startMinute: 17 * 60 + 30,
        endMinute: 19 * 60,
        type: 'counter',
        status: 'confirmed',
        createdByUid: user.uid,
        playerUids: [],
        guestName: 'Martín Suárez (Mostrador)',
        totalPrice: 1800,
        paidAmount: 1800,
        paymentMethod: 'club',
        paymentStatus: 'paid',
        holdExpiresAt: '',
      };
      batch.set(doc(db, 'clubs', club1.id, 'bookings', sampleBooking.id), {
        ...sampleBooking,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Seed 1 open tournament
      const demoTournament: Tournament = {
        id: 'trn_rambla_2026',
        clubId: club1.id,
        name: 'Copa Rambla Pocitos',
        startDate: addDaysISO(today, 3),
        endDate: addDaysISO(today, 5),
        categories: [4, 5, 6],
        maxPairs: 8,
        entryFee: 1400,
        format: 'groups_knockout',
        status: 'registration_open',
        pairs: [
          {
            id: 'pair_demo_1',
            player1Uid: 'demo_mateo_r',
            player1Name: 'Mateo Rodríguez',
            player2Uid: 'demo_tomas_s',
            player2Name: 'Tomás Silva',
            category: 5,
            partnerAccepted: true,
            paid: true,
          },
          {
            id: 'pair_demo_2',
            player1Uid: 'demo_lucia_f',
            player1Name: 'Lucía Fernández',
            player2Uid: 'demo_valentina_m',
            player2Name: 'Valentina Méndez',
            category: 5,
            partnerAccepted: true,
            paid: true,
          },
        ],
        matches: [],
        createdByUid: user.uid,
      };
      batch.set(doc(db, 'clubs', club1.id, 'tournaments', demoTournament.id), {
        ...demoTournament,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Sample payment for "la caja"
      const samplePay: PaymentRecord = {
        id: 'pay_demo_1',
        clubId: club1.id,
        uid: user.uid,
        clubOwnerUid: user.uid,
        payerName: 'Martín Suárez (Mostrador)',
        referenceId: sampleBooking.id,
        amount: 1800,
        method: 'efectivo',
        kind: 'booking_full',
        status: 'completed',
      };
      batch.set(doc(db, 'clubs', club1.id, 'payments', samplePay.id), {
        ...samplePay,
        createdAt: serverTimestamp(),
      });

      // Ensure tomorrow's booking in club 2
      const sampleBooking2: Booking = {
        id: 'bk_demo_c2',
        clubId: club2.id,
        courtId: 'cancha_a',
        courtName: 'Cancha A · Pro',
        date: tomorrow,
        startMinute: 19 * 60 + 30,
        endMinute: 21 * 60,
        type: 'direct',
        status: 'confirmed',
        createdByUid: user.uid,
        playerUids: [user.uid],
        guestName: userProfile.displayName,
        totalPrice: 2700,
        paidAmount: 2700,
        paymentMethod: 'mercadopago',
        paymentStatus: 'paid',
        holdExpiresAt: '',
      };
      batch.set(doc(db, 'clubs', club2.id, 'bookings', sampleBooking2.id), {
        ...sampleBooking2,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await batch.commit();
    }

    // Ensure current user has memberships in all active clubs (admin if club owner, else player)
    const freshClubsSnap = await getDocs(query(collection(db, 'clubs'), where('active', '==', true)));
    for (const cDoc of freshClubsSnap.docs) {
      const clubData = cDoc.data() as Club;
      const memRef = doc(db, 'clubs', clubData.id, 'memberships', user.uid);
      const memSnap = await getDoc(memRef);
      if (!memSnap.exists()) {
        const isOwner = clubData.ownerUid === user.uid;
        await setDoc(memRef, {
          uid: user.uid,
          clubId: clubData.id,
          displayName: userProfile.displayName.slice(0, 80),
          role: isOwner ? 'admin' : 'player',
          category: userProfile.category,
          gender: userProfile.gender,
          preferredModality: userProfile.preferredModality,
          weeklyAvailability: userProfile.weeklyAvailability.slice(0, 21),
          noShowCount: 0,
          blocked: false,
          isDiscoverable: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, clubsPath);
  }
}

export function subscribeClubs(
  onData: (clubs: Club[]) => void
): Unsubscribe {
  const q = query(collection(db, 'clubs'), where('active', '==', true));
  return onSnapshot(
    q,
    (snap) => {
      onData(snap.docs.map((d) => d.data() as Club));
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'clubs')
  );
}

export function subscribeClubData(
  clubId: string,
  currentUid: string,
  clubOwnerUid: string,
  isPlatformOwner: boolean,
  callbacks: {
    onCourts: (courts: Court[]) => void;
    onMemberships: (memberships: ClubMembership[]) => void;
    onBookings: (bookings: Booking[]) => void;
    onMatchRequests: (reqs: MatchRequest[]) => void;
    onProposedMatches: (matches: ProposedMatch[]) => void;
    onTournaments: (tournaments: Tournament[]) => void;
    onPayments: (payments: PaymentRecord[]) => void;
    onNotifications: (notifications: NotificationItem[]) => void;
    onMatchResults?: (results: PlayerMatchResult[]) => void;
    onWaitlist?: (waitlist: CourtWaitlistEntry[]) => void;
    onFillSearches?: (searches: FillSearch[]) => void;
    onMyFillInvites?: (invites: FillInvite[]) => void;
  }
): Unsubscribe[] {
  const unsubs: Unsubscribe[] = [];

  unsubs.push(
    onSnapshot(
      query(collection(db, 'clubs', clubId, 'courts'), where('clubId', '==', clubId)),
      (snap) => callbacks.onCourts(snap.docs.map((d) => d.data() as Court)),
      (err) => handleFirestoreError(err, OperationType.LIST, `clubs/${clubId}/courts`)
    )
  );

  unsubs.push(
    onSnapshot(
      query(
        collection(db, 'clubs', clubId, 'memberships'),
        where('clubId', '==', clubId),
        where('isDiscoverable', '==', true)
      ),
      (snap) => callbacks.onMemberships(snap.docs.map((d) => d.data() as ClubMembership)),
      (err) => handleFirestoreError(err, OperationType.LIST, `clubs/${clubId}/memberships`)
    )
  );

  unsubs.push(
    onSnapshot(
      query(collection(db, 'clubs', clubId, 'bookings'), where('clubId', '==', clubId)),
      (snap) => callbacks.onBookings(snap.docs.map((d) => d.data() as Booking)),
      (err) => handleFirestoreError(err, OperationType.LIST, `clubs/${clubId}/bookings`)
    )
  );

  unsubs.push(
    onSnapshot(
      query(collection(db, 'clubs', clubId, 'matchRequests'), where('clubId', '==', clubId)),
      (snap) => callbacks.onMatchRequests(snap.docs.map((d) => d.data() as MatchRequest)),
      (err) => handleFirestoreError(err, OperationType.LIST, `clubs/${clubId}/matchRequests`)
    )
  );

  unsubs.push(
    onSnapshot(
      query(collection(db, 'clubs', clubId, 'proposedMatches'), where('clubId', '==', clubId)),
      (snap) => callbacks.onProposedMatches(snap.docs.map((d) => d.data() as ProposedMatch)),
      (err) => handleFirestoreError(err, OperationType.LIST, `clubs/${clubId}/proposedMatches`)
    )
  );

  unsubs.push(
    onSnapshot(
      query(collection(db, 'clubs', clubId, 'tournaments'), where('clubId', '==', clubId)),
      (snap) => callbacks.onTournaments(snap.docs.map((d) => d.data() as Tournament)),
      (err) => handleFirestoreError(err, OperationType.LIST, `clubs/${clubId}/tournaments`)
    )
  );

  const paymentsQuery = isPlatformOwner
    ? query(collection(db, 'clubs', clubId, 'payments'), where('clubId', '==', clubId))
    : currentUid === clubOwnerUid
      ? query(
          collection(db, 'clubs', clubId, 'payments'),
          where('clubId', '==', clubId),
          where('clubOwnerUid', '==', clubOwnerUid)
        )
      : query(
          collection(db, 'clubs', clubId, 'payments'),
          where('clubId', '==', clubId),
          where('uid', '==', currentUid)
        );

  unsubs.push(
    onSnapshot(
      paymentsQuery,
      (snap) => callbacks.onPayments(snap.docs.map((d) => d.data() as PaymentRecord)),
      (err) => handleFirestoreError(err, OperationType.LIST, `clubs/${clubId}/payments`)
    )
  );

  const notifQuery = isPlatformOwner
    ? query(collection(db, 'clubs', clubId, 'notifications'), where('clubId', '==', clubId))
    : query(
        collection(db, 'clubs', clubId, 'notifications'),
        where('clubId', '==', clubId),
        where('recipientUid', '==', currentUid)
      );

  unsubs.push(
    onSnapshot(
      notifQuery,
      (snap) => callbacks.onNotifications(snap.docs.map((d) => d.data() as NotificationItem)),
      (err) => handleFirestoreError(err, OperationType.LIST, `clubs/${clubId}/notifications`)
    )
  );

  if (callbacks.onMatchResults) {
    const onClubResults = callbacks.onMatchResults;
    unsubs.push(
      onSnapshot(
        query(collection(db, 'clubs', clubId, 'matchResults'), where('clubId', '==', clubId)),
        (snap) => onClubResults(snap.docs.map((d) => d.data() as PlayerMatchResult)),
        (err) => handleFirestoreError(err, OperationType.LIST, `clubs/${clubId}/matchResults`)
      )
    );
  }

  if (callbacks.onFillSearches) {
    const cb = callbacks.onFillSearches;
    unsubs.push(
      onSnapshot(
        query(collection(db, 'clubs', clubId, 'fillSearches'), where('clubId', '==', clubId)),
        (snap) => cb(snap.docs.map((d) => d.data() as FillSearch)),
        (err) => handleFirestoreError(err, OperationType.LIST, `clubs/${clubId}/fillSearches`)
      )
    );
  }

  if (callbacks.onMyFillInvites) {
    const cb = callbacks.onMyFillInvites;
    unsubs.push(
      onSnapshot(
        query(collection(db, 'clubs', clubId, 'fillInvites'), where('uid', '==', currentUid)),
        (snap) => cb(snap.docs.map((d) => d.data() as FillInvite)),
        (err) => handleFirestoreError(err, OperationType.LIST, `clubs/${clubId}/fillInvites`)
      )
    );
  }

  if (callbacks.onWaitlist) {
    const onWaitlist = callbacks.onWaitlist;
    unsubs.push(
      onSnapshot(
        query(collection(db, 'clubs', clubId, 'waitlist'), where('clubId', '==', clubId)),
        (snap) => onWaitlist(snap.docs.map((d) => d.data() as CourtWaitlistEntry)),
        (err) => handleFirestoreError(err, OperationType.LIST, `clubs/${clubId}/waitlist`)
      )
    );
  }

  return unsubs;
}

export async function createDirectBooking(params: {
  club: Club;
  court: Court;
  date: string;
  startMinute: number;
  endMinute: number;
  userUid: string;
  userName: string;
  paymentChoice: 'club' | 'mercadopago';
  /** Seña en horario pico (regla del club). Si viene, se cobra solo esto por Mercado Pago. */
  peakDeposit?: number;
}): Promise<Booking> {
  const { club, court, date, startMinute, endMinute, userUid, userName, paymentChoice, peakDeposit = 0 } = params;
  const bookingId = makeId('bk');
  const totalPrice = calculateSlotPrice(club, date, startMinute);
  const isDeposit = paymentChoice === 'mercadopago' && (peakDeposit > 0 || club.mpMode === 'deposit');
  const mpAmount =
    paymentChoice === 'mercadopago'
      ? peakDeposit > 0
        ? Math.min(peakDeposit, totalPrice)
        : club.mpMode === 'deposit'
        ? Math.round((totalPrice * club.mpDepositPercent) / 100)
        : totalPrice
      : 0;

  const booking: Booking = {
    id: bookingId,
    clubId: club.id,
    courtId: court.id,
    courtName: court.name,
    date,
    startMinute,
    endMinute,
    type: 'direct',
    status: 'confirmed',
    createdByUid: userUid,
    playerUids: [userUid],
    guestName: userName.slice(0, 80),
    totalPrice,
    paidAmount: mpAmount,
    paymentMethod: paymentChoice,
    paymentStatus: paymentChoice === 'mercadopago' ? (isDeposit ? 'deposit_paid' : 'paid') : 'pending',
    holdExpiresAt: '',
  };

  const path = `clubs/${club.id}/bookings/${bookingId}`;
  try {
    await setDoc(doc(db, 'clubs', club.id, 'bookings', bookingId), {
      ...booking,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    if (mpAmount > 0) {
      const payId = makeId('pay');
      await setDoc(doc(db, 'clubs', club.id, 'payments', payId), {
        id: payId,
        clubId: club.id,
        uid: userUid,
        clubOwnerUid: club.ownerUid,
        payerName: userName.slice(0, 80),
        referenceId: bookingId,
        amount: mpAmount,
        method: 'mercadopago',
        kind: isDeposit ? 'booking_deposit' : 'booking_full',
        status: 'completed',
        createdAt: serverTimestamp(),
      });
    }

    await dispatchNotification({
      clubId: club.id,
      recipientUid: userUid,
      eventType: 'booking_confirmed',
      title: `Reserva confirmada · ${club.name}`,
      body: `${court.name} el ${formatDateFriendly(date, false)} a las ${formatMinutes(startMinute)} hs.`,
      currentUserUid: userUid,
    });

    // Clean up any waitlist entry held by this user for the booked slot
    const wlId = buildWaitlistDocId(court.id, date, startMinute, userUid);
    const wlRef = doc(db, 'clubs', club.id, 'waitlist', wlId);
    const wlSnap = await getDoc(wlRef);
    if (wlSnap.exists()) {
      await deleteDoc(wlRef);
    }

    return booking;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

/** Medios de cobro en el mostrador: efectivo, transferencia, tarjeta (POS del club) o Mercado Pago marcado a mano (QR o link del club, sin integración). */
export type CounterPaymentMethod = 'efectivo' | 'transferencia' | 'debito_club' | 'mercadopago';

export async function cancelBooking(params: {
  club: Club;
  booking: Booking;
  currentUid: string;
}): Promise<{ refunded: number; notifiedWaitlistCount: number }> {
  const { club, booking, currentUid } = params;
  const path = `clubs/${club.id}/bookings/${booking.id}`;
  const freeRefund = canCancelFree(club, booking.date, booking.startMinute);
  const refundAmount = freeRefund && booking.paidAmount > 0 ? booking.paidAmount : 0;

  try {
    await updateDoc(doc(db, 'clubs', club.id, 'bookings', booking.id), {
      status: 'cancelled',
      paymentStatus: refundAmount > 0 ? 'refunded' : booking.paymentStatus,
      updatedAt: serverTimestamp(),
    });

    if (refundAmount > 0) {
      const payId = makeId('pay');
      await setDoc(doc(db, 'clubs', club.id, 'payments', payId), {
        id: payId,
        clubId: club.id,
        uid: booking.createdByUid,
        clubOwnerUid: club.ownerUid,
        payerName: booking.guestName || 'Jugador',
        referenceId: booking.id,
        amount: -refundAmount,
        method: 'mercadopago',
        kind: 'refund',
        status: 'completed',
        createdAt: serverTimestamp(),
      });
    }

    await dispatchNotification({
      clubId: club.id,
      recipientUid: booking.createdByUid,
      eventType: 'booking_cancelled',
      title: `Reserva cancelada · ${club.name}`,
      body:
        refundAmount > 0
          ? `Se canceló ${booking.courtName} (${booking.date} ${formatMinutes(booking.startMinute)}) con devolución automática.`
          : `Se canceló ${booking.courtName} (${booking.date} ${formatMinutes(booking.startMinute)}).`,
      currentUserUid: currentUid,
    });

    const notifiedWaitlistCount = await notifyWaitlistForFreedSlot({
      club,
      courtId: booking.courtId,
      courtName: booking.courtName,
      date: booking.date,
      startMinute: booking.startMinute,
      endMinute: booking.endMinute,
      triggeredByUid: currentUid,
    });

    return { refunded: refundAmount, notifiedWaitlistCount };
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function createCounterBooking(params: {
  club: Club;
  court: Court;
  date: string;
  startMinute: number;
  endMinute: number;
  staffUid: string;
  guestName: string;
  phone?: string;
  paidNow: boolean;
  method: CounterPaymentMethod | 'mercadopago';
  /** Ficha del cliente (alta rápida o buscador del mostrador). */
  clientId?: string;
}) {
  const { club, court, date, startMinute, endMinute, staffUid, guestName, phone, paidNow, method, clientId } = params;
  // El teléfono (si lo hay) se guarda junto al nombre: "Nombre · 099 123 456".
  const cleanPhone = (phone || '').trim().slice(0, 20);
  const storedName = cleanPhone
    ? `${guestName.trim().slice(0, 55)} · ${cleanPhone}`
    : guestName.trim().slice(0, 78);
  const bookingId = makeId('bk');
  const totalPrice = calculateSlotPrice(club, date, startMinute);
  const path = `clubs/${club.id}/bookings/${bookingId}`;

  try {
    await setDoc(doc(db, 'clubs', club.id, 'bookings', bookingId), {
      id: bookingId,
      clubId: club.id,
      courtId: court.id,
      courtName: court.name,
      date,
      startMinute,
      endMinute,
      type: 'counter',
      status: 'confirmed',
      createdByUid: staffUid,
      playerUids: [],
      guestName: storedName,
      totalPrice,
      paidAmount: paidNow ? totalPrice : 0,
      paymentMethod: method === 'mercadopago' ? 'mercadopago' : 'club',
      paymentStatus: paidNow ? 'paid' : 'pending',
      holdExpiresAt: '',
      ...(clientId ? { clientId } : {}),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    if (paidNow) {
      const payId = makeId('pay');
      await setDoc(doc(db, 'clubs', club.id, 'payments', payId), {
        id: payId,
        clubId: club.id,
        uid: staffUid,
        clubOwnerUid: club.ownerUid,
        payerName: guestName.trim().slice(0, 80),
        referenceId: bookingId,
        amount: totalPrice,
        method,
        kind: 'booking_full',
        rubro: 'cancha',
        ...(clientId ? { clientId } : {}),
        status: 'completed',
        createdAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function markBookingPaidAtCounter(params: {
  club: Club;
  booking: Booking;
  staffUid: string;
  method: CounterPaymentMethod;
}) {
  const { club, booking, staffUid, method } = params;
  const remaining = Math.max(0, booking.totalPrice - booking.paidAmount);
  const path = `clubs/${club.id}/bookings/${booking.id}`;
  try {
    await updateDoc(doc(db, 'clubs', club.id, 'bookings', booking.id), {
      paidAmount: booking.totalPrice,
      paymentStatus: 'paid',
      updatedAt: serverTimestamp(),
    });
    if (remaining > 0) {
      const payId = makeId('pay');
      await setDoc(doc(db, 'clubs', club.id, 'payments', payId), {
        id: payId,
        clubId: club.id,
        uid: staffUid,
        clubOwnerUid: club.ownerUid,
        payerName: booking.guestName.split(' · ')[0] || 'Mostrador',
        referenceId: booking.id,
        amount: remaining,
        method,
        kind: 'booking_full',
        status: 'completed',
        createdAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function markBookingNoShow(params: {
  club: Club;
  booking: Booking;
  memberships: ClubMembership[];
}) {
  const { club, booking, memberships } = params;
  const path = `clubs/${club.id}/bookings/${booking.id}`;
  try {
    await updateDoc(doc(db, 'clubs', club.id, 'bookings', booking.id), {
      status: 'no_show',
      updatedAt: serverTimestamp(),
    });

    const targetUid = booking.playerUids[0] || booking.createdByUid;
    const member = memberships.find((m) => m.uid === targetUid);
    if (member) {
      const nextCount = member.noShowCount + 1;
      const shouldBlock = nextCount >= club.maxNoShowsBeforeBlock;
      await updateDoc(doc(db, 'clubs', club.id, 'memberships', member.uid), {
        noShowCount: nextCount,
        blocked: shouldBlock,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

// -----------------------------------------------------------------------------
// Armado de partidos: corre en el servidor (Cloud Functions, functions/src).
// Estas funciones mantienen la firma que usaba la pantalla; los datos de club que
// reciben ya no hacen falta porque el servidor lee lo suyo de Firestore.
// -----------------------------------------------------------------------------
const callArmado = async <T,>(name: string, data: Record<string, unknown>, path: string): Promise<T> => {
  try {
    const res = await httpsCallable<Record<string, unknown>, T>(functions, name)(data);
    return res.data;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
};

export async function createMatchRequestAndTryMatch(params: {
  club: Club;
  courts?: Court[];
  bookings?: Booking[];
  existingRequests?: MatchRequest[];
  memberships?: ClubMembership[];
  creatorUid: string;
  creatorName: string;
  category: number;
  modality: Modality;
  requestType: 'weekly' | 'priority';
  date: string;
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
  partnerUid: string;
  partnerName: string;
  playerLevels?: Map<string, number>;
}): Promise<{ request: MatchRequest; proposedMatch: ProposedMatch | null }> {
  const { club, modality, requestType, date, dayOfWeek, startMinute, endMinute, partnerUid, partnerName } = params;
  return callArmado('armadoCrearPedido', {
    clubId: club.id, modality, requestType, date, dayOfWeek, startMinute, endMinute, partnerUid, partnerName,
  }, `clubs/${club.id}/matchRequests`);
}

export async function runMatchmakingSweep(params: {
  club: Club;
  triggeredByUid: string;
  [rest: string]: unknown;
}): Promise<ProposedMatch | null> {
  const res = await callArmado<{ proposedMatch: ProposedMatch | null }>(
    'armadoBuscar', { clubId: params.club.id }, `clubs/${params.club.id}/proposedMatches`
  );
  return res.proposedMatch;
}

export async function respondToProposedMatch(params: {
  club: Club;
  proposedMatch: ProposedMatch;
  targetSlotUid: string;
  decision: 'accepted' | 'declined';
  currentUid: string;
  [rest: string]: unknown;
}): Promise<'confirmed' | 'pending' | 'replaced_or_cancelled'> {
  const { club, proposedMatch, targetSlotUid, decision } = params;
  const res = await callArmado<{ result: 'confirmed' | 'pending' | 'replaced_or_cancelled' | 'already_closed' }>(
    'armadoResponder',
    { clubId: club.id, matchId: proposedMatch.id, slotUid: targetSlotUid, decision },
    `clubs/${club.id}/proposedMatches/${proposedMatch.id}`
  );
  return res.result === 'already_closed' ? 'replaced_or_cancelled' : res.result;
}

export async function payMatchShare(params: {
  club: Club;
  match: ProposedMatch;
  booking?: Booking;
  payerUid: string;
  payerName: string;
  method: 'mercadopago' | CounterPaymentMethod;
}) {
  const { club, match, booking, payerUid, payerName, method } = params;
  const path = `clubs/${club.id}/proposedMatches/${match.id}`;
  try {
    const nextSlots = match.slots.map((s) => (s.uid === payerUid ? { ...s, paid: true } : s));
    await updateDoc(doc(db, 'clubs', club.id, 'proposedMatches', match.id), {
      slots: nextSlots,
      updatedAt: serverTimestamp(),
    });

    const paidCount = nextSlots.filter((s) => s.paid).length;
    if (booking) {
      await updateDoc(doc(db, 'clubs', club.id, 'bookings', booking.id), {
        paidAmount: paidCount * match.pricePerPlayer,
        paymentStatus: paidCount === 4 ? 'paid' : 'deposit_paid',
        updatedAt: serverTimestamp(),
      });
    }

    const payId = makeId('pay');
    await setDoc(doc(db, 'clubs', club.id, 'payments', payId), {
      id: payId,
      clubId: club.id,
      uid: payerUid,
      clubOwnerUid: club.ownerUid,
      payerName: payerName.slice(0, 80),
      referenceId: match.id,
      amount: match.pricePerPlayer,
      method,
      kind: 'match_share',
      status: 'completed',
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

/** Mostrador: marca como pagas las partes de varios jugadores de un partido armado, en una sola escritura. */
export async function markMatchSharesPaidAtCounter(params: {
  club: Club;
  match: ProposedMatch;
  booking?: Booking;
  payerUids: string[];
  staffUid: string;
  method: CounterPaymentMethod;
}) {
  const { club, match, booking, payerUids, staffUid, method } = params;
  const path = `clubs/${club.id}/proposedMatches/${match.id}`;
  const toPay = match.slots.filter((s) => payerUids.includes(s.uid) && !s.paid);
  if (toPay.length === 0) return;
  try {
    const nextSlots = match.slots.map((s) => (payerUids.includes(s.uid) ? { ...s, paid: true } : s));
    await updateDoc(doc(db, 'clubs', club.id, 'proposedMatches', match.id), {
      slots: nextSlots,
      updatedAt: serverTimestamp(),
    });
    const paidCount = nextSlots.filter((s) => s.paid).length;
    if (booking) {
      await updateDoc(doc(db, 'clubs', club.id, 'bookings', booking.id), {
        paidAmount: Math.min(booking.totalPrice, paidCount * match.pricePerPlayer),
        paymentStatus: paidCount >= nextSlots.length ? 'paid' : 'deposit_paid',
        updatedAt: serverTimestamp(),
      });
    }
    for (const slot of toPay) {
      const payId = makeId('pay');
      await setDoc(doc(db, 'clubs', club.id, 'payments', payId), {
        id: payId,
        clubId: club.id,
        uid: staffUid,
        clubOwnerUid: club.ownerUid,
        payerName: slot.displayName.slice(0, 80) || 'Jugador',
        referenceId: match.id,
        amount: match.pricePerPlayer,
        method,
        kind: 'match_share',
        status: 'completed',
        createdAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function triggerUnfilledSameDayAlert(params: {
  club: Club;
  req: MatchRequest;
  currentUid: string;
}) {
  const { club, req, currentUid } = params;
  const path = `clubs/${club.id}/matchRequests/${req.id}`;
  try {
    await updateDoc(doc(db, 'clubs', club.id, 'matchRequests', req.id), {
      unfilledAlertSent: true,
      updatedAt: serverTimestamp(),
    });
    await dispatchNotification({
      clubId: club.id,
      recipientUid: req.creatorUid,
      eventType: 'match_unfilled_1h',
      title: `Sin partido armado todavía · ${club.name}`,
      body: `Falta 1 hora para tu franja de hoy (${formatMinutes(req.startMinute)}–${formatMinutes(req.endMinute)}) y aún no se completaron 4 jugadores.`,
      currentUserUid: currentUid,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function acceptMatchPartnerInvite(params: {
  club: Club;
  req: MatchRequest;
  currentUid: string;
  [rest: string]: unknown;
}): Promise<ProposedMatch | null> {
  const { club, req } = params;
  const res = await callArmado<{ proposedMatch: ProposedMatch | null }>(
    'armadoAceptarPareja', { clubId: club.id, requestId: req.id }, `clubs/${club.id}/matchRequests/${req.id}`
  );
  return res.proposedMatch;
}

// -----------------------------------------------------------------------------
// Tournaments
// -----------------------------------------------------------------------------
export async function createTournament(params: {
  club: Club;
  memberships: ClubMembership[];
  creatorUid: string;
  name: string;
  startDate: string;
  endDate: string;
  categories: number[];
  maxPairs: number;
  entryFee: number;
  format: TournamentFormat;
}) {
  const { club, memberships, creatorUid, name, startDate, endDate, categories, maxPairs, entryFee, format } = params;
  const id = makeId('trn');
  const path = `clubs/${club.id}/tournaments/${id}`;
  try {
    await setDoc(doc(db, 'clubs', club.id, 'tournaments', id), {
      id,
      clubId: club.id,
      name: name.trim().slice(0, 100),
      startDate,
      endDate,
      categories,
      maxPairs,
      entryFee,
      format,
      status: 'registration_open',
      pairs: [],
      matches: [],
      createdByUid: creatorUid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const eligible = memberships.filter((m) => categories.includes(m.category));
    for (const m of eligible) {
      await dispatchNotification({
        clubId: club.id,
        recipientUid: m.uid,
        eventType: 'tournament_new',
        title: `Nuevo torneo en ${club.name}`,
        body: `${name} (${categories.map(formatCategory).join(', ')}). Inscripción abierta.`,
        currentUserUid: creatorUid,
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function registerPairInTournament(params: {
  club: Club;
  tournament: Tournament;
  player1Uid: string;
  player1Name: string;
  player2Uid: string;
  player2Name: string;
  category: number;
  paidWithMP: boolean;
}) {
  const { club, tournament, player1Uid, player1Name, player2Uid, player2Name, category, paidWithMP } = params;
  const isDemoPartner = player2Uid.startsWith('demo_');
  const newPair: TournamentPair = {
    id: makeId('pair'),
    player1Uid,
    player1Name: player1Name.slice(0, 80),
    player2Uid,
    player2Name: player2Name.slice(0, 80),
    category,
    partnerAccepted: isDemoPartner,
    paid: paidWithMP,
  };
  const path = `clubs/${club.id}/tournaments/${tournament.id}`;
  try {
    await updateDoc(doc(db, 'clubs', club.id, 'tournaments', tournament.id), {
      pairs: [...tournament.pairs, newPair],
      updatedAt: serverTimestamp(),
    });

    if (paidWithMP && tournament.entryFee > 0) {
      const payId = makeId('pay');
      await setDoc(doc(db, 'clubs', club.id, 'payments', payId), {
        id: payId,
        clubId: club.id,
        uid: player1Uid,
        clubOwnerUid: club.ownerUid,
        payerName: `${player1Name} / ${player2Name}`.slice(0, 80),
        referenceId: tournament.id,
        amount: tournament.entryFee,
        method: 'mercadopago',
        kind: 'tournament_fee',
        status: 'completed',
        createdAt: serverTimestamp(),
      });
    }

    if (!isDemoPartner) {
      await dispatchNotification({
        clubId: club.id,
        recipientUid: player2Uid,
        eventType: 'pair_invite',
        title: `Invitación a torneo · ${tournament.name}`,
        body: `${player1Name} te anotó como pareja en ${club.name}. Ingresá para aceptar.`,
        currentUserUid: player1Uid,
        tab: 'tournaments',
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function acceptTournamentPair(params: {
  club: Club;
  tournament: Tournament;
  pairId: string;
}) {
  const { club, tournament, pairId } = params;
  const path = `clubs/${club.id}/tournaments/${tournament.id}`;
  try {
    const targetPair = tournament.pairs.find((p) => p.id === pairId);
    const pairs = tournament.pairs.map((p) => (p.id === pairId ? { ...p, partnerAccepted: true } : p));
    await updateDoc(doc(db, 'clubs', club.id, 'tournaments', tournament.id), {
      pairs,
      updatedAt: serverTimestamp(),
    });

    if (targetPair && targetPair.player1Uid && !targetPair.player1Uid.startsWith('demo_')) {
      await dispatchNotification({
        clubId: club.id,
        recipientUid: targetPair.player1Uid,
        eventType: 'pair_invite',
        title: `Pareja de torneo confirmada · ${tournament.name}`,
        body: `${targetPair.player2Name} aceptó jugar el torneo con vos en ${club.name}.`,
        currentUserUid: targetPair.player2Uid,
        tab: 'tournaments',
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function closeRegistrationAndDraw(params: {
  club: Club;
  tournament: Tournament;
  courts: Court[];
  adminUid: string;
}) {
  const { club, tournament, courts, adminUid } = params;
  const matches = generateTournamentDraw({
    pairs: tournament.pairs,
    format: tournament.format,
    courts,
    startDate: tournament.startDate,
    club,
  });
  const path = `clubs/${club.id}/tournaments/${tournament.id}`;
  try {
    await updateDoc(doc(db, 'clubs', club.id, 'tournaments', tournament.id), {
      status: 'draw_generated',
      matches,
      updatedAt: serverTimestamp(),
    });

    // Block courts in bookings for scheduled matches
    for (const m of matches) {
      const bookingId = makeId('bk');
      await setDoc(doc(db, 'clubs', club.id, 'bookings', bookingId), {
        id: bookingId,
        clubId: club.id,
        courtId: m.courtId,
        courtName: m.courtName,
        date: m.date,
        startMinute: m.startMinute,
        endMinute: m.startMinute + (club.slotDurationMinutes || 90),
        type: 'tournament',
        status: 'confirmed',
        createdByUid: adminUid,
        playerUids: [],
        guestName: `Torneo: ${m.pair1Label} vs ${m.pair2Label}`.slice(0, 80),
        totalPrice: 0,
        paidAmount: 0,
        paymentMethod: 'club',
        paymentStatus: 'paid',
        holdExpiresAt: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    // Notify registered pairs of their upcoming match
    for (const m of matches) {
      const p1 = tournament.pairs.find((p) => p.id === m.pair1Id);
      const p2 = tournament.pairs.find((p) => p.id === m.pair2Id);
      const recipients = [p1?.player1Uid, p1?.player2Uid, p2?.player1Uid, p2?.player2Uid].filter(Boolean) as string[];
      for (const rUid of recipients) {
        await dispatchNotification({
          clubId: club.id,
          recipientUid: rUid,
          eventType: 'tournament_next_match',
          title: `Próximo partido · ${tournament.name}`,
          body: `${m.round} en ${m.courtName} el ${formatDateFriendly(m.date, false)} a las ${formatMinutes(m.startMinute)} hs.`,
          currentUserUid: adminUid,
        });
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function recordTournamentMatchResult(params: {
  club: Club;
  tournament: Tournament;
  matchId: string;
  score: string;
  winnerPairId: string;
  staffUid: string;
}) {
  const { club, tournament, matchId, score, winnerPairId, staffUid } = params;
  const path = `clubs/${club.id}/tournaments/${tournament.id}`;
  try {
    const updatedMatches = tournament.matches.map((m) =>
      m.id === matchId ? { ...m, score: score.trim(), winnerPairId, status: 'completed' as const } : m
    );
    const allCompleted = updatedMatches.every((m) => m.status === 'completed');

    // If Group A / B finished and there's a Final placeholder, populate winners
    const finalMatch = updatedMatches.find((m) => m.round === 'Final' && m.pair1Id.startsWith('tbd'));
    if (finalMatch) {
      const groupAMatches = updatedMatches.filter((m) => m.round === 'Grupo A');
      const groupBMatches = updatedMatches.filter((m) => m.round === 'Grupo B');
      const groupADone = groupAMatches.length > 0 && groupAMatches.every((m) => m.status === 'completed');
      const groupBDone = groupBMatches.length > 0 && groupBMatches.every((m) => m.status === 'completed');

      const topWinner = (ms: typeof updatedMatches) => {
        const counts = new Map<string, number>();
        for (const x of ms) if (x.winnerPairId) counts.set(x.winnerPairId, (counts.get(x.winnerPairId) || 0) + 1);
        return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      };

      if (groupADone && groupBDone) {
        const winA = topWinner(groupAMatches);
        const winB = topWinner(groupBMatches);
        const pairA = tournament.pairs.find((p) => p.id === winA);
        const pairB = tournament.pairs.find((p) => p.id === winB);
        if (pairA && pairB) {
          finalMatch.pair1Id = pairA.id;
          finalMatch.pair1Label = `${pairA.player1Name} / ${pairA.player2Name}`;
          finalMatch.pair2Id = pairB.id;
          finalMatch.pair2Label = `${pairB.player1Name} / ${pairB.player2Name}`;
          for (const rUid of [pairA.player1Uid, pairA.player2Uid, pairB.player1Uid, pairB.player2Uid]) {
            await dispatchNotification({
              clubId: club.id,
              recipientUid: rUid,
              eventType: 'tournament_next_match',
              title: `Final confirmada · ${tournament.name}`,
              body: `Tu pareja clasificó a la Final: ${finalMatch.date} a las ${formatMinutes(finalMatch.startMinute)} hs en ${finalMatch.courtName}.`,
              currentUserUid: staffUid,
            });
          }
        }
      }
    }

    await updateDoc(doc(db, 'clubs', club.id, 'tournaments', tournament.id), {
      matches: updatedMatches,
      status: allCompleted ? 'completed' : 'in_progress',
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

// -----------------------------------------------------------------------------
// Club Admin & Platform Owner Operations
// -----------------------------------------------------------------------------
export async function updateClubSettings(
  clubId: string,
  updates: Partial<
    Pick<
      Club,
      | 'name'
      | 'primaryColor'
      | 'accentColor'
      | 'address'
      | 'slotDurationMinutes'
      | 'openHour'
      | 'closeHour'
      | 'basePrice'
      | 'nightFromHour'
      | 'nightPrice'
      | 'weekendPrice'
      | 'cancellationHours'
      | 'maxNoShowsBeforeBlock'
      | 'mpEnabled'
      | 'mpMode'
      | 'mpDepositPercent'
      | 'courtCount'
      | 'fillEnabled'
      | 'fillMaxGap'
    >
  >
) {
  const path = `clubs/${clubId}`;
  try {
    await updateDoc(doc(db, 'clubs', clubId), {
      ...updates,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function addClubCourt(params: {
  club: Club;
  currentCourtsCount: number;
  name: string;
  roof: RoofType;
  surface: SurfaceType;
  hasLights: boolean;
}) {
  const { club, currentCourtsCount, name, roof, surface, hasLights } = params;
  const courtId = makeId('ct');
  const path = `clubs/${club.id}/courts/${courtId}`;
  try {
    await setDoc(doc(db, 'clubs', club.id, 'courts', courtId), {
      id: courtId,
      clubId: club.id,
      name: name.trim().slice(0, 60),
      roof,
      surface,
      hasLights,
      active: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await updateDoc(doc(db, 'clubs', club.id), {
      courtCount: currentCourtsCount + 1,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function updateClubCourt(
  clubId: string,
  courtId: string,
  updates: Partial<Pick<Court, 'name' | 'roof' | 'surface' | 'hasLights' | 'active'>>
) {
  const path = `clubs/${clubId}/courts/${courtId}`;
  try {
    await updateDoc(doc(db, 'clubs', clubId, 'courts', courtId), {
      ...updates,
      ...(updates.name !== undefined ? { name: updates.name.trim().slice(0, 60) } : {}),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function removeClubCourt(club: Club, courtId: string, currentCourtsCount: number) {
  const path = `clubs/${club.id}/courts/${courtId}`;
  try {
    await deleteDoc(doc(db, 'clubs', club.id, 'courts', courtId));
    await updateDoc(doc(db, 'clubs', club.id), {
      courtCount: Math.max(0, currentCourtsCount - 1),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function updateMembershipByAdmin(
  clubId: string,
  memberUid: string,
  updates: Partial<Pick<ClubMembership, 'role' | 'category' | 'blocked' | 'noShowCount' | 'categoryReview'>>
) {
  const path = `clubs/${clubId}/memberships/${memberUid}`;
  try {
    await updateDoc(doc(db, 'clubs', clubId, 'memberships', memberUid), {
      ...updates,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function onboardNewClub(params: {
  ownerUid: string;
  ownerName: string;
  name: string;
  address: string;
  neighborhood: string;
  city: string;
  lat: number;
  lng: number;
  primaryColor: string;
  courtCount: number;
  monthlyPricePerCourt: number;
}): Promise<Club> {
  const slug = sanitizeId(params.name);
  const clubId = `${slug.slice(0, 24)}_${Math.random().toString(36).slice(2, 6)}`;
  const today = getTodayISO();
  const trialEndsAt = addDaysISO(today, 30);

  const newClub: Club = {
    id: clubId,
    name: params.name.trim().slice(0, 80),
    slug,
    primaryColor: params.primaryColor,
    accentColor: '#0F172A',
    address: params.address.trim().slice(0, 160),
    neighborhood: params.neighborhood.trim().slice(0, 80),
    city: params.city.trim().slice(0, 80),
    lat: params.lat,
    lng: params.lng,
    ownerUid: params.ownerUid,
    slotDurationMinutes: 90,
    openHour: 8,
    closeHour: 23,
    basePrice: 1800,
    nightFromHour: 19,
    nightPrice: 2400,
    weekendPrice: 2200,
    cancellationHours: 4,
    maxNoShowsBeforeBlock: 3,
    mpEnabled: true,
    mpMode: 'deposit',
    mpDepositPercent: 30,
    subscriptionStatus: 'trial',
    trialEndsAt,
    monthlyPricePerCourt: params.monthlyPricePerCourt,
    courtCount: params.courtCount,
    active: true,
  };

  const path = `clubs/${clubId}`;
  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'clubs', clubId), {
      ...newClub,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    for (let i = 1; i <= Math.max(1, params.courtCount); i++) {
      const ctId = `cancha_${i}`;
      batch.set(doc(db, 'clubs', clubId, 'courts', ctId), {
        id: ctId,
        clubId,
        name: `Cancha ${i}`,
        roof: 'techada',
        surface: 'cristal',
        hasLights: true,
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    batch.set(doc(db, 'clubs', clubId, 'memberships', params.ownerUid), {
      uid: params.ownerUid,
      clubId,
      displayName: params.ownerName.slice(0, 80),
      role: 'admin',
      category: 5,
      gender: 'masculino',
      preferredModality: 'mixto',
      weeklyAvailability: [],
      noShowCount: 0,
      blocked: false,
      isDiscoverable: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await batch.commit();
    return newClub;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function processClubSubscriptionCharge(club: Club, payerUid: string) {
  const path = `clubs/${club.id}`;
  const amount = club.courtCount * club.monthlyPricePerCourt;
  try {
    await updateDoc(doc(db, 'clubs', club.id), {
      subscriptionStatus: 'active',
      updatedAt: serverTimestamp(),
    });
    const payId = makeId('sub');
    await setDoc(doc(db, 'clubs', club.id, 'payments', payId), {
      id: payId,
      clubId: club.id,
      uid: payerUid,
      clubOwnerUid: club.ownerUid,
      payerName: `${club.name} (Débito mensual ${club.courtCount} canchas)`,
      referenceId: club.id,
      amount,
      method: 'debito_club',
      kind: 'platform_subscription',
      status: 'completed',
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function markNotificationRead(clubId: string, notificationId: string) {
  const path = `clubs/${clubId}/notifications/${notificationId}`;
  try {
    await updateDoc(doc(db, 'clubs', clubId, 'notifications', notificationId), {
      read: true,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export function subscribePlayerMatchResults(
  uid: string,
  onData: (items: PlayerMatchResult[]) => void
): Unsubscribe {
  const path = `users/${uid}/matchResults`;
  const q = query(collection(db, 'users', uid, 'matchResults'), where('uid', '==', uid));
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => d.data() as PlayerMatchResult);
      items.sort((a, b) => b.date.localeCompare(a.date));
      onData(items);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, path)
  );
}

export async function logPlayerMatchResult(params: {
  uid: string;
  clubId: string;
  clubName: string;
  date: string;
  outcome: 'win' | 'loss';
  score: string;
  modality: Modality;
}): Promise<PlayerMatchResult> {
  const resultId = makeId('res');
  const path = `users/${params.uid}/matchResults/${resultId}`;
  const item: PlayerMatchResult = {
    id: resultId,
    uid: params.uid,
    clubId: params.clubId,
    clubName: params.clubName.trim().slice(0, 80) || 'Club Armá Partido',
    date: params.date,
    outcome: params.outcome,
    score: params.score.trim().slice(0, 40),
    modality: params.modality,
  };
  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'users', params.uid, 'matchResults', resultId), {
      ...item,
      createdAt: serverTimestamp(),
    });
    batch.set(doc(db, 'clubs', params.clubId, 'matchResults', resultId), {
      ...item,
      createdAt: serverTimestamp(),
    });
    await batch.commit();
    return item;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deletePlayerMatchResult(uid: string, resultId: string): Promise<void> {
  const path = `users/${uid}/matchResults/${resultId}`;
  try {
    const userDocRef = doc(db, 'users', uid, 'matchResults', resultId);
    const snap = await getDoc(userDocRef);
    const clubId = snap.exists() ? (snap.data() as PlayerMatchResult).clubId : '';

    await deleteDoc(userDocRef);

    if (clubId) {
      const clubDocRef = doc(db, 'clubs', clubId, 'matchResults', resultId);
      const clubSnap = await getDoc(clubDocRef);
      if (clubSnap.exists()) {
        await deleteDoc(clubDocRef);
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export function subscribeUserFriends(
  uid: string,
  onData: (items: UserFriend[]) => void
): Unsubscribe {
  const path = `users/${uid}/friends`;
  const q = query(collection(db, 'users', uid, 'friends'), where('ownerUid', '==', uid));
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => d.data() as UserFriend);
      items.sort((a, b) => a.displayName.localeCompare(b.displayName, 'es-UY'));
      onData(items);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, path)
  );
}

export async function followUser(params: {
  ownerUid: string;
  target: {
    uid: string;
    displayName: string;
    category: number;
    gender: Gender;
    preferredModality: Modality;
    primaryClubId: string;
    primaryClubName: string;
  };
}): Promise<UserFriend> {
  const { ownerUid, target } = params;
  const path = `users/${ownerUid}/friends/${target.uid}`;
  const friendDoc: UserFriend = {
    uid: target.uid,
    ownerUid,
    displayName: target.displayName.trim().slice(0, 80) || 'Jugador',
    category: Math.min(MAX_CATEGORY, Math.max(1, Math.round(target.category || 5))),
    gender: target.gender,
    preferredModality: target.preferredModality,
    primaryClubId: target.primaryClubId.slice(0, 128),
    primaryClubName: target.primaryClubName.trim().slice(0, 80),
  };
  try {
    await setDoc(doc(db, 'users', ownerUid, 'friends', target.uid), {
      ...friendDoc,
      createdAt: serverTimestamp(),
    });
    return friendDoc;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function unfollowUser(ownerUid: string, friendUid: string): Promise<void> {
  const path = `users/${ownerUid}/friends/${friendUid}`;
  try {
    await deleteDoc(doc(db, 'users', ownerUid, 'friends', friendUid));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function fetchDiscoverablePlayersAcrossClubs(
  clubs: Club[],
  currentUid: string,
  activeClubId?: string
): Promise<DiscoverablePlayer[]> {
  const map = new Map<string, DiscoverablePlayer>();
  for (const club of clubs) {
    const path = `clubs/${club.id}/memberships`;
    try {
      const snap = await getDocs(
        query(
          collection(db, 'clubs', club.id, 'memberships'),
          where('clubId', '==', club.id),
          where('isDiscoverable', '==', true)
        )
      );
      for (const docSnap of snap.docs) {
        const m = docSnap.data() as ClubMembership;
        if (m.uid === currentUid) continue;
        const existing = map.get(m.uid);
        if (!existing) {
          map.set(m.uid, {
            uid: m.uid,
            displayName: m.displayName,
            category: m.category,
            gender: m.gender,
            preferredModality: m.preferredModality,
            weeklyAvailability: m.weeklyAvailability || [],
            clubs: [{ id: club.id, name: club.name }],
            blockedInActiveClub: club.id === activeClubId ? m.blocked : false,
          });
        } else {
          if (!existing.clubs.some((c) => c.id === club.id)) {
            existing.clubs.push({ id: club.id, name: club.name });
          }
          if (club.id === activeClubId) {
            existing.blockedInActiveClub = m.blocked;
            existing.category = m.category;
            existing.preferredModality = m.preferredModality;
            if (m.weeklyAvailability?.length) {
              existing.weeklyAvailability = m.weeklyAvailability;
            }
          } else if (existing.weeklyAvailability.length === 0 && m.weeklyAvailability?.length) {
            existing.weeklyAvailability = m.weeklyAvailability;
          }
        }
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, path);
    }
  }

  return Array.from(map.values()).sort((a, b) =>
    a.displayName.localeCompare(b.displayName, 'es-UY')
  );
}

export function subscribeUserFcmTokens(
  uid: string,
  onData: (items: UserFcmToken[]) => void
): Unsubscribe {
  const path = `users/${uid}/fcmTokens`;
  const q = query(collection(db, 'users', uid, 'fcmTokens'), where('uid', '==', uid));
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => d.data() as UserFcmToken);
      onData(items);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, path)
  );
}

export async function saveUserFcmToken(params: {
  uid: string;
  token: string;
  tokenId: string;
  deviceLabel: string;
  platform: 'web' | 'android' | 'ios';
}): Promise<UserFcmToken> {
  const { uid, token, tokenId, deviceLabel, platform } = params;
  const path = `users/${uid}/fcmTokens/${tokenId}`;
  const tokenRef = doc(db, 'users', uid, 'fcmTokens', tokenId);
  const cleanLabel = deviceLabel.trim().slice(0, 100) || 'Navegador Web';
  const cleanToken = token.trim().slice(0, 512);

  try {
    const existingSnap = await getDoc(tokenRef);
    if (existingSnap.exists()) {
      await updateDoc(tokenRef, {
        token: cleanToken,
        deviceLabel: cleanLabel,
        platform,
        enabled: true,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(tokenRef, {
        id: tokenId,
        uid,
        token: cleanToken,
        deviceLabel: cleanLabel,
        platform,
        enabled: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    return {
      id: tokenId,
      uid,
      token: cleanToken,
      deviceLabel: cleanLabel,
      platform,
      enabled: true,
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteUserFcmToken(uid: string, tokenId: string): Promise<void> {
  const path = `users/${uid}/fcmTokens/${tokenId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'fcmTokens', tokenId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

function buildWaitlistDocId(
  courtId: string,
  date: string,
  startMinute: number,
  uid: string
): string {
  const safeCourt = courtId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 28) || 'court';
  const safeDate = date.replace(/[^0-9]/g, '').slice(0, 8);
  const safeUid = uid.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48) || 'user';
  return `wl_${safeDate}_${startMinute}_${safeCourt}_${safeUid}`.slice(0, 128);
}

export async function joinCourtWaitlist(params: {
  club: Club;
  court: Court;
  date: string;
  startMinute: number;
  endMinute: number;
  uid: string;
  displayName: string;
}): Promise<CourtWaitlistEntry> {
  const { club, court, date, startMinute, endMinute, uid, displayName } = params;
  const waitlistId = buildWaitlistDocId(court.id, date, startMinute, uid);
  const path = `clubs/${club.id}/waitlist/${waitlistId}`;
  const docRef = doc(db, 'clubs', club.id, 'waitlist', waitlistId);
  const cleanName = displayName.trim().slice(0, 80) || 'Jugador';

  const entry: CourtWaitlistEntry = {
    id: waitlistId,
    clubId: club.id,
    courtId: court.id,
    courtName: court.name.slice(0, 60),
    date,
    startMinute,
    endMinute,
    uid,
    displayName: cleanName,
    status: 'waiting',
  };

  try {
    const existingSnap = await getDoc(docRef);
    if (existingSnap.exists()) {
      await updateDoc(docRef, {
        status: 'waiting',
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(docRef, {
        ...entry,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    return entry;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function leaveCourtWaitlist(clubId: string, waitlistId: string): Promise<void> {
  const path = `clubs/${clubId}/waitlist/${waitlistId}`;
  try {
    await deleteDoc(doc(db, 'clubs', clubId, 'waitlist', waitlistId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function notifyWaitlistForFreedSlot(params: {
  club: Club;
  courtId: string;
  courtName: string;
  date: string;
  startMinute: number;
  endMinute: number;
  triggeredByUid: string;
}): Promise<number> {
  const { club, courtId, courtName, date, startMinute, endMinute, triggeredByUid } = params;
  const path = `clubs/${club.id}/waitlist`;
  try {
    const snap = await getDocs(
      query(collection(db, 'clubs', club.id, 'waitlist'), where('clubId', '==', club.id))
    );
    const matching = snap.docs
      .map((d) => d.data() as CourtWaitlistEntry)
      .filter(
        (w) =>
          w.status === 'waiting' &&
          w.courtId === courtId &&
          w.date === date &&
          w.startMinute < endMinute &&
          w.endMinute > startMinute
      );

    let notifiedCount = 0;
    for (const entry of matching) {
      await updateDoc(doc(db, 'clubs', club.id, 'waitlist', entry.id), {
        status: 'notified',
        updatedAt: serverTimestamp(),
      });

      await dispatchNotification({
        clubId: club.id,
        recipientUid: entry.uid,
        eventType: 'waitlist_slot_open',
        title: `¡Cancha liberada! · ${club.name}`,
        body: `${courtName} quedó disponible el ${formatDateFriendly(date, false)} a las ${formatMinutes(startMinute)} hs. Reservá antes de que se ocupe.`,
        currentUserUid: triggeredByUid,
        tab: 'bookings',
      });
      notifiedCount++;
    }

    return notifiedCount;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}


// -----------------------------------------------------------------------------
// "Falta uno" automático (el trabajo lo hace el servidor: functions/src/fill.ts)
// -----------------------------------------------------------------------------

export async function dropFromMatch(club: Club, match: ProposedMatch, uid?: string) {
  return callArmado<{ status: 'searching' | 'cancelled' | 'no_search'; late?: boolean }>(
    'faltaUnoBajarme', { clubId: club.id, matchId: match.id, uid: uid ?? '' }, `clubs/${club.id}/proposedMatches/${match.id}`
  );
}

export async function claimFillSeat(club: Club, searchId: string) {
  const res = await callArmado<{ result: 'won' | 'late' | 'closed' | 'busy' }>(
    'faltaUnoMeSumo', { clubId: club.id, searchId }, `clubs/${club.id}/fillSearches/${searchId}`
  );
  return res.result;
}

/** Lo que muestra la página pública del link (sin cuenta). */
export interface PublicFillLink {
  status: 'open' | 'filled' | 'closed';
  clubName: string;
  clubAddress: string;
  clubCity: string;
  mapsQuery: string;
  date: string;
  startMinute: number;
  endMinute: number;
  courtName: string;
  modality: string;
  seatsLeft: number;
  minCategory: number;
  maxCategory: number;
  pricePerPlayer: number;
}

export async function getPublicFillLink(clubId: string, searchId: string): Promise<PublicFillLink | null> {
  try {
    const res = await httpsCallable<Record<string, unknown>, PublicFillLink>(functions, 'faltaUnoLink')({ clubId, searchId });
    return res.data;
  } catch (err) {
    if ((err as { code?: string }).code === 'functions/not-found' || (err as { code?: string }).code === 'functions/invalid-argument') return null;
    throw err;
  }
}

export type LinkClaimResult = 'won' | 'late' | 'closed' | 'busy' | 'category' | 'gender' | 'blocked' | 'already_in' | 'left' | 'not_member';

export async function claimFillSeatByLink(clubId: string, searchId: string): Promise<LinkClaimResult> {
  try {
    const res = await httpsCallable<Record<string, unknown>, { result: LinkClaimResult }>(functions, 'faltaUnoSumarmePorLink')({ clubId, searchId });
    return res.data.result;
  } catch (err) {
    if ((err as { code?: string }).code === 'functions/permission-denied') return 'not_member';
    throw err;
  }
}

export async function declineFillInvite(club: Club, searchId: string) {
  await callArmado('faltaUnoNoPuedo', { clubId: club.id, searchId }, `clubs/${club.id}/fillSearches/${searchId}`);
}

export async function chooseFillOutcome(club: Club, searchId: string, choice: FillChoice) {
  return callArmado<{ result: 'ok' | 'already_decided'; choice: FillChoice | '' }>(
    'faltaUnoElegir', { clubId: club.id, searchId, choice }, `clubs/${club.id}/fillSearches/${searchId}`
  );
}

export async function stopFillSearch(club: Club, searchId: string) {
  await callArmado('faltaUnoDejarDeBuscar', { clubId: club.id, searchId }, `clubs/${club.id}/fillSearches/${searchId}`);
}

export async function updateAlertPrefs(uid: string, prefs: AlertPrefs) {
  const path = `users/${uid}`;
  try {
    await setDoc(doc(db, 'users', uid), { alertPrefs: prefs, updatedAt: serverTimestamp() }, { merge: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export function subscribeRecoveries(clubId: string, onData: (r: RecoveryRecord[]) => void): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'clubs', clubId, 'recoveries'), where('clubId', '==', clubId)),
    (snap) => onData(snap.docs.map((d) => d.data() as RecoveryRecord)),
    (err) => handleFirestoreError(err, OperationType.LIST, `clubs/${clubId}/recoveries`)
  );
}
