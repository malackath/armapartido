export type Gender = 'masculino' | 'femenino';
export type Modality = 'masculino' | 'femenino' | 'mixto';
export type ClubRole = 'admin' | 'staff' | 'player';
export type PerspectiveRole = 'player' | 'staff' | 'admin' | 'platform_owner';

export type RoofType = 'techada' | 'aire_libre';
export type SurfaceType = 'cristal' | 'muro';

export type BookingType = 'direct' | 'counter' | 'matched' | 'tournament';
export type BookingStatus = 'held' | 'confirmed' | 'cancelled' | 'no_show';
export type PaymentMethod = 'club' | 'mercadopago' | 'split';
export type PaymentStatus = 'pending' | 'deposit_paid' | 'paid' | 'refunded';

export type TournamentFormat = 'knockout' | 'groups_knockout';
export type TournamentStatus = 'registration_open' | 'draw_generated' | 'in_progress' | 'completed';

export type NotificationEventType =
  | 'booking_confirmed'
  | 'booking_cancelled'
  | 'reminder_2h'
  | 'match_proposed'
  | 'match_confirmed'
  | 'match_unfilled_1h'
  | 'match_expired'
  | 'tournament_new'
  | 'pair_invite'
  | 'tournament_next_match'
  | 'waitlist_slot_open';

export interface AvailabilityWindow {
  dayOfWeek: number; // 0 = Domingo ... 6 = Sábado
  startMinute: number;
  endMinute: number;
}

export interface UserProfile {
  uid: string;
  displayName: string;
  photoUrl?: string;
  category: number; // 1 (1ra) to 8 (8va)
  gender: Gender;
  preferredModality: Modality;
  weeklyAvailability: AvailabilityWindow[];
  activeClubIds: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface UserPrivateInfo {
  uid: string;
  email: string;
  phone?: string;
  updatedAt?: unknown;
}

export interface Club {
  id: string;
  name: string;
  slug: string;
  primaryColor: string;
  accentColor: string;
  address: string;
  neighborhood?: string;
  city: string;
  lat: number;
  lng: number;
  ownerUid: string;
  slotDurationMinutes: number;
  openHour: number;
  closeHour: number;
  basePrice: number;
  nightFromHour: number;
  nightPrice: number;
  weekendPrice: number;
  cancellationHours: number;
  maxNoShowsBeforeBlock: number;
  mpEnabled: boolean;
  mpMode: 'full' | 'deposit';
  mpDepositPercent: number;
  subscriptionStatus: 'trial' | 'active' | 'past_due';
  trialEndsAt?: string;
  monthlyPricePerCourt: number;
  courtCount: number;
  active: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Court {
  id: string;
  clubId: string;
  name: string;
  roof: RoofType;
  surface: SurfaceType;
  hasLights: boolean;
  active: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ClubMembership {
  uid: string;
  clubId: string;
  displayName: string;
  role: ClubRole;
  category: number;
  gender: Gender;
  preferredModality: Modality;
  weeklyAvailability: AvailabilityWindow[];
  noShowCount: number;
  blocked: boolean;
  isDiscoverable: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Booking {
  id: string;
  clubId: string;
  courtId: string;
  courtName: string;
  date: string; // YYYY-MM-DD
  startMinute: number;
  endMinute: number;
  type: BookingType;
  status: BookingStatus;
  createdByUid: string;
  playerUids: string[];
  guestName: string;
  totalPrice: number;
  paidAmount: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  holdExpiresAt: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface MatchRequest {
  id: string;
  clubId: string;
  clubIds: string[];
  creatorUid: string;
  creatorName: string;
  partnerUid: string;
  partnerName: string;
  partnerAccepted: boolean;
  category: number;
  modality: Modality;
  requestType: 'weekly' | 'priority';
  date: string;
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
  isSameDay: boolean;
  status: 'waiting' | 'proposed' | 'confirmed' | 'expired' | 'cancelled';
  unfilledAlertSent: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ProposedSlot {
  uid: string;
  displayName: string;
  category: number;
  gender: Gender;
  status: 'pending' | 'accepted' | 'declined';
  paid: boolean;
  requestId: string;
}

export interface ProposedMatch {
  id: string;
  clubId: string;
  bookingId: string;
  courtId: string;
  courtName: string;
  date: string;
  startMinute: number;
  endMinute: number;
  modality: Modality;
  minCategory: number;
  maxCategory: number;
  pricePerPlayer: number;
  playerUids: string[];
  slots: ProposedSlot[];
  expiresAt: string;
  status: 'pending' | 'confirmed' | 'cancelled';
  createdByUid: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface TournamentPair {
  id: string;
  player1Uid: string;
  player1Name: string;
  player2Uid: string;
  player2Name: string;
  category: number;
  partnerAccepted: boolean;
  paid: boolean;
  group?: string;
}

export interface TournamentMatch {
  id: string;
  round: string; // 'Grupo A' | 'Cuartos' | 'Semifinal' | 'Final'
  pair1Id: string;
  pair1Label: string;
  pair2Id: string;
  pair2Label: string;
  courtId: string;
  courtName: string;
  date: string;
  startMinute: number;
  score: string;
  winnerPairId: string;
  status: 'scheduled' | 'completed';
}

export interface Tournament {
  id: string;
  clubId: string;
  name: string;
  startDate: string;
  endDate: string;
  categories: number[];
  maxPairs: number;
  entryFee: number;
  format: TournamentFormat;
  status: TournamentStatus;
  pairs: TournamentPair[];
  matches: TournamentMatch[];
  createdByUid: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface PaymentRecord {
  id: string;
  clubId: string;
  uid: string;
  clubOwnerUid: string;
  payerName: string;
  referenceId: string;
  amount: number;
  method: 'mercadopago' | 'efectivo' | 'transferencia' | 'debito_club';
  kind:
    | 'booking_full'
    | 'booking_deposit'
    | 'match_share'
    | 'tournament_fee'
    | 'refund'
    | 'platform_subscription';
  status: 'completed' | 'refunded';
  createdAt?: unknown;
}

export interface NotificationItem {
  id: string;
  clubId: string;
  recipientUid: string;
  eventType: NotificationEventType;
  title: string;
  body: string;
  pushSent: boolean;
  emailSent: boolean;
  read: boolean;
  createdAt?: unknown;
}

export interface PlayerMatchResult {
  id: string;
  uid: string;
  clubId: string;
  clubName: string;
  date: string; // YYYY-MM-DD
  outcome: 'win' | 'loss';
  score: string;
  modality: Modality;
  createdAt?: unknown;
}

export interface UserFriend {
  uid: string;
  ownerUid: string;
  displayName: string;
  category: number;
  gender: Gender;
  preferredModality: Modality;
  primaryClubId: string;
  primaryClubName: string;
  createdAt?: unknown;
}

export interface DiscoverablePlayer {
  uid: string;
  displayName: string;
  category: number;
  gender: Gender;
  preferredModality: Modality;
  weeklyAvailability: AvailabilityWindow[];
  clubs: { id: string; name: string }[];
  blockedInActiveClub: boolean;
}

export interface UserFcmToken {
  id: string;
  uid: string;
  token: string;
  deviceLabel: string;
  platform: 'web' | 'android' | 'ios';
  enabled: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface CourtWaitlistEntry {
  id: string;
  clubId: string;
  courtId: string;
  courtName: string;
  date: string; // YYYY-MM-DD
  startMinute: number;
  endMinute: number;
  uid: string;
  displayName: string;
  status: 'waiting' | 'notified' | 'cancelled';
  createdAt?: unknown;
  updatedAt?: unknown;
}
