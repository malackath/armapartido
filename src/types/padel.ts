import type { DepositRule } from './caja';

export type Gender = 'masculino' | 'femenino';
/** Lado de la cancha en el que juega (registro 16/11/2026). */
export type CourtSide = 'drive' | 'reves' | 'indistinto';
export type Hand = 'derecha' | 'izquierda';
export type Modality = 'masculino' | 'femenino' | 'mixto';
export type ClubRole = 'admin' | 'staff' | 'cantina' | 'player';
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
  | 'fill_invite'
  | 'fill_update'
  | 'tournament_new'
  | 'pair_invite'
  | 'tournament_next_match'
  | 'waitlist_slot_open'
  | 'category_changed';

export interface AvailabilityWindow {
  dayOfWeek: number; // 0 = Domingo ... 6 = Sábado
  startMinute: number;
  endMinute: number;
}

export interface UserProfile {
  uid: string;
  displayName: string;
  photoUrl?: string;
  category: number; // 1 (1ra) a 7 (7ma)
  gender: Gender;
  preferredModality: Modality;
  weeklyAvailability: AvailabilityWindow[];
  activeClubIds: string[];
  alertPrefs?: AlertPrefs;
  courtSide?: CourtSide;
  hand?: Hand;
  /** false mientras el jugador no terminó el registro. Los perfiles viejos no lo tienen: cuentan como terminados. */
  signupDone?: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface UserPrivateInfo {
  uid: string;
  email: string;
  phone?: string;
  updatedAt?: unknown;
}

export interface ClubSponsor {
  name: string;
  tagline?: string;
  logoUrl?: string;
  /** Foto horizontal del auspiciante (16:9). */
  imageUrl?: string;
  url?: string;
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
  /** "Falta uno" automático (por defecto encendido) y diferencia de categoría permitida (1 o 2). */
  fillEnabled?: boolean;
  fillMaxGap?: 1 | 2;
  /** Auspiciante que el club muestra en Inicio. Si no hay, el espacio no se muestra. */
  sponsor?: ClubSponsor;
  /** Varios auspiciantes: Inicio muestra uno y rota. Si falta, se usa `sponsor`. */
  sponsors?: ClubSponsor[];
  courtCount: number;
  /** Plan contratado (para el informe mensual). Sin dato = Estándar. */
  plan?: 'entrada' | 'estandar';
  /** Seña en horario pico. Sin dato = apagada. */
  deposit?: DepositRule;
  /** Mails que reciben el informe mensual además del dueño. */
  reportEmails?: string[];
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
  /** Copia de la foto de perfil del jugador (users/{uid}.photoUrl) para mostrarla en listas. */
  photoUrl?: string;
  role: ClubRole;
  category: number;
  gender: Gender;
  preferredModality: Modality;
  weeklyAvailability: AvailabilityWindow[];
  noShowCount: number;
  blocked: boolean;
  isDiscoverable: boolean;
  courtSide?: CourtSide;
  hand?: Hand;
  /** 'pendiente' cuando se sumó por la app y el club todavía no miró la categoría que eligió. */
  categoryReview?: 'pendiente' | 'ok';
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
  /** Ficha del cliente (reservas por teléfono o mostrador). */
  clientId?: string;
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
    | 'platform_subscription'
    | 'cantina'
    | 'venta'
    | 'retiro'
    | 'anulacion';
  status: 'completed' | 'refunded';
  /** Día de caja al que corresponde (YYYY-MM-DD). Los cobros viejos no lo tienen y se toma createdAt. */
  day?: string;
  /** Quién cobró (encargado), para la caja. */
  staffName?: string;
  /** Motivo de un retiro o una anulación. */
  note?: string;
  /** Este cobro fue anulado (no se borra). */
  voided?: boolean;
  /** En una anulación: el id del cobro anulado. */
  voidOfId?: string;
  /** Cobro hecho con la caja de ese día ya cerrada. */
  afterClose?: boolean;
  /** Ficha del cliente que pagó (si la hay). */
  clientId?: string;
  /** Rubro de lo cobrado. Los cobros viejos no lo tienen y se deduce de kind (ver rubroOfPayment). */
  rubro?: 'cancha' | 'cantina' | 'cuponeras' | 'saldo' | 'clases' | 'torneos' | 'alquiler' | 'otros';
  /** Casilla de factura (fase 1 manual). Sin el campo = pendiente. */
  invoiceStatus?: 'pendiente' | 'emitida' | 'no_corresponde';
  invoiceNumber?: string;
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

// -----------------------------------------------------------------------------
// "Falta uno" automático (especificación: Paddle.URU/docs/falta-uno-automatico.md)
// -----------------------------------------------------------------------------

/** Invitaciones de "falta uno" por semana que acepta el jugador. -1 = todas. */
export type WeeklyInvites = 0 | 3 | 6 | -1;

export interface AlertPrefs {
  weeklyInvites: WeeklyInvites;
  /** Diferencia de categoría que acepta: 0 = solo la suya, 1 o 2. */
  maxCategoryGap: 0 | 1 | 2;
}

export const DEFAULT_ALERT_PREFS: AlertPrefs = { weeklyInvites: 3, maxCategoryGap: 1 };

/** free_slot: turno libre que el mostrador manda a llenar con un toque (16/11). */
export type FillSearchKind = 'player_dropped' | 'declined' | 'no_answer' | 'free_slot';
export type FillSearchStatus = 'searching' | 'filled' | 'unfilled' | 'cancelled';
export type FillChoice = 'keep_searching' | 'play_as_three' | 'cancel';

export interface FillSearch {
  id: string;
  clubId: string;
  kind: FillSearchKind;
  matchId: string;
  bookingId: string;
  courtId: string;
  courtName: string;
  date: string;
  startMinute: number;
  endMinute: number;
  modality: Modality;
  /** Género buscado cuando el partido es mixto (el del que se fue). */
  genderNeeded: Gender | '';
  seatsNeeded: number;
  seatsFilled: number;
  filledUids: string[];
  excludedUids: string[];
  invitedUids: string[];
  /** Jugador que se bajó tarde: si no hay reemplazo, le cuenta una falta. */
  lateDropUid: string;
  wave: number;
  nextWaveAt: string;
  closesAt: string;
  status: FillSearchStatus;
  choice: FillChoice | '';
  extended: boolean;
  pricePerPlayer: number;
  openedAt: string;
  /** Turno libre: categorías que se invitan (sin jugadores todavía no hay de dónde sacarlas). */
  minCategory?: number;
  maxCategory?: number;
  /** Turno libre: descuento que puso el mostrador (0, 10, 20 o 30). */
  discountPct?: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface FillInvite {
  id: string; // `${searchId}_${uid}`
  clubId: string;
  searchId: string;
  uid: string;
  wave: number;
  date: string;
  startMinute: number;
  endMinute: number;
  courtName: string;
  pricePerPlayer: number;
  status: 'sent' | 'won' | 'late' | 'declined' | 'expired';
  countsForCap: boolean;
  sentAt: string;
  /** Cómo llegó: aviso de la app (por defecto) o el link compartido por un jugador. */
  via?: 'aviso' | 'link';
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface RecoveryRecord {
  id: string;
  clubId: string;
  bookingId: string;
  courtId: string;
  date: string;
  startMinute: number;
  endMinute: number;
  sport: 'padel';
  kind: 'slot_filled' | 'player_replaced' | 'match_completed';
  freeSince: string;
  searchId: string;
  alertSentAt: string;
  filledByUid: string;
  filledAt: string;
  seatsFilled: number;
  /** Entró por aviso de la app o por el link compartido. */
  via?: 'aviso' | 'link';
  amountRecovered: number;
  status: 'pending' | 'counted' | 'voided';
  voidReason: string;
  createdAt?: unknown;
}
