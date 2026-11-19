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
  | 'category_changed'
  | 'join_request'
  | 'join_resolved';

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
  /** "Prefiero no jugar con" (etapa 5): PRIVADO. Solo lo ve el jugador; el servidor lo usa para no juntarlos. */
  avoidUids?: string[];
  /** Lo escribe el servidor: cuántas propuestas rechazó por hora de inicio ("20" -> 3). Baja la prioridad a esa hora. */
  declineHours?: Record<string, number>;
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

/** Esquinas de la app del club (decisión 8: solo con Imagen completa). */
export type MarcaEsquinas = 'rectas' | 'medias' | 'redondas';

/** Marca del club que se edita en Configuración > Apariencia (17/11/2026). */
export interface MarcaDatos {
  colores: { principal: string; acento: string; fondo: string; secundario?: string };
  fuentes?: { titulos?: string; texto?: string };
  esquinas?: MarcaEsquinas;
  slogan?: string;
  /** URL del logo (fondo transparente) en Storage: clubs/{clubId}/marca/. */
  logo?: string;
  /** Fotos de la app: portada de Inicio y encabezados de Reservar, Armar partido y Torneos. */
  fotos?: { portada?: string; reservar?: string; armar?: string; torneos?: string };
}

/** La marca que ve el jugador. La escribe solo el servidor (marcaGuardar / marcaRevisar). */
export interface MarcaPublicada extends MarcaDatos {
  version: number;
  publicadaEl: string;
}

/** Marca que espera revisión a mano (decisión 7: primera vez, logo o fotos nuevas, o colores con aviso). */
export interface MarcaPendiente extends MarcaDatos {
  enviadaEl: string;
  enviadaPor: string;
  motivo: 'primera' | 'imagenes' | 'colores';
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
  /** "Falta uno" automático (por defecto encendido) y diferencia de categoría permitida (0 = misma categoría, 1 o 2; sin dato = 1). */
  fillEnabled?: boolean;
  fillMaxGap?: 0 | 1 | 2;
  /** Modo invitados (etapa 6b). Sin esto, el club está en modo interno. */
  guests?: ClubGuestsConfig;
  /** "Llenar turnos libres" automático (D12): apagado si falta. Cada club elige las franjas. */
  autoFill?: AutoFillConfig;
  /**
   * Quién puede sumarse al club desde la app (17/11/2026). Sin dato = 'abierto' (cualquiera).
   * 'solo_clientes': si su mail está en Clientes entra directo; si no, queda un pedido que aprueba el club.
   */
  joinPolicy?: JoinPolicy;
  /** Auspiciante que el club muestra en Inicio. Si no hay, el espacio no se muestra. */
  sponsor?: ClubSponsor;
  /** Varios auspiciantes: Inicio muestra uno y rota. Si falta, se usa `sponsor`. */
  sponsors?: ClubSponsor[];
  courtCount: number;
  /** Paquete de instalación: 'completo' = Imagen completa (US$490). Lo cambia solo la plataforma. Sin dato = básico. */
  paquete?: 'basico' | 'completo';
  /** Marca publicada, en revisión, rechazo y la del alta (para Restablecer). Las escribe solo el servidor. */
  marca?: MarcaPublicada | null;
  marcaPendiente?: MarcaPendiente | null;
  marcaRechazo?: { nota: string; el: string } | null;
  marcaAlta?: MarcaDatos | null;
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

/** Franja en la que el club quiere que la app llene canchas vacías: días (0 = domingo) y horas. */
export interface AutoFillBand {
  days: number[];
  fromMinute: number;
  toMinute: number;
}

export interface AutoFillConfig {
  enabled: boolean;
  bands: AutoFillBand[];
}

export interface AutoFillOpened {
  date: string;
  startMinute: number;
  courtName: string;
  modality: Modality;
  minCategory: number;
  maxCategory: number;
  candidates: number;
  invited: number;
  searchId: string;
}

export interface AutoFillSkipped {
  date: string;
  startMinute: number;
  reason: 'few_players' | 'already_tried' | 'too_late' | 'no_free_court' | 'limit';
  candidates?: number;
}

/** Registro de cada revisión (clubs/{club}/autoFillRuns). */
export interface AutoFillReport {
  ranAt: string;
  trigger: 'scheduled' | 'manual';
  enabled: boolean;
  checkedSlots: number;
  opened: AutoFillOpened[];
  skipped: AutoFillSkipped[];
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

export type JoinPolicy = 'abierto' | 'solo_clientes';

/**
 * Pedido para sumarse a un club con 'solo_clientes' (clubs/{club}/joinRequests/{uid}).
 * Solo lo escribe el servidor; lo leen el jugador y el club (dueño, administrador y encargado).
 */
export interface JoinRequest {
  uid: string;
  clubId: string;
  displayName: string;
  photoUrl?: string;
  email: string;
  phone: string;
  category: number;
  status: 'pendiente' | 'aprobado' | 'rechazado';
  /** Ficha sin app con el mismo celular: el club la puede unir con un toque. */
  similarClientId?: string;
  similarClientName?: string;
  resolvedByUid?: string;
  resolvedByName?: string;
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
  /** Equipos sugeridos (partidos armados por la app). */
  teamA?: string[];
  teamB?: string[];
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
  /** Invitado (etapa 6b): no es socio de este club. Paga su parte más el recargo. */
  guest?: boolean;
  surcharge?: number;
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
  /** Equipos sugeridos por el planificador (uids). Es una sugerencia: en la cancha pueden cambiar. */
  teamA?: string[];
  teamB?: string[];
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

/**
 * Resultado de un partido de 4 (etapa 6a, decisión 4.2 de Ber, 17/11/2026).
 * Uno de los 4 lo carga y uno de la otra pareja lo confirma en 48 h. Sin confirmar no cuenta.
 * Id = id de la reserva. Lo escribe solo el servidor.
 */
export interface MatchResult {
  id: string;
  clubId: string;
  bookingId: string;
  date: string;
  startMinute: number;
  courtName: string;
  teamA: string[];
  teamB: string[];
  /** Nombres de los 4 para mostrar sin leer otras fichas. */
  names: Record<string, string>;
  playerUids: string[];
  winner: 'A' | 'B';
  score: string;
  reportedBy: string;
  status: 'pending' | 'confirmed' | 'disputed' | 'expired';
  expiresAt: string;
  confirmedBy?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

/** Sugerencia de cambio de categoría para el club (decisión 4.1: la app sugiere, el club confirma). Id = uid. */
export interface CategorySuggestion {
  id: string;
  clubId: string;
  uid: string;
  displayName: string;
  from: number;
  to: number;
  reason: string;
  status: 'pending' | 'accepted' | 'rejected';
  /** Resultados confirmados que tenía el jugador cuando el club decidió (para no volver a sugerir enseguida). */
  resultsAtDecision?: number;
  decidedBy?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
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
  /** Modo invitados (etapa 6b): acepta avisos de "falta uno" de otros clubes. Apagado por defecto. */
  otherClubs?: boolean;
}

export const DEFAULT_ALERT_PREFS: AlertPrefs = { weeklyInvites: 3, maxCategoryGap: 1 };

/** free_slot: turno libre que el mostrador manda a llenar con un toque (16/11). */
export type FillSearchKind = 'player_dropped' | 'declined' | 'no_answer' | 'free_slot';
export type FillSearchStatus = 'searching' | 'filled' | 'unfilled' | 'cancelled';
export type FillChoice = 'keep_searching' | 'play_as_three' | 'cancel';

export interface FillSearch {
  id: string;
  /** Modo invitados (etapa 6b): ya se avisó a los invitados (una sola vez por búsqueda). */
  guestsInvited?: boolean;
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
  /**
   * Turno libre abierto solo por la revisión de las 9:00 y las 14:00 ("Llenar turnos libres").
   * No retiene la cancha: la reserva recién se crea cuando se juntan los 4. Si alguien la reserva antes,
   * la búsqueda se apaga.
   */
  auto?: boolean;
  /** Por qué terminó un turno libre automático sin llenarse. */
  endReason?: 'taken' | 'unfilled' | 'stopped';
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
  via?: 'aviso' | 'link' | 'guardia';
  /** Invitado (etapa 6b): no es socio; sus datos para el partido van acá. */
  guest?: GuestInfo;
  createdAt?: unknown;
  updatedAt?: unknown;
}

/** Modo invitados (etapa 6b; decisiones 4.6 de Ber, 17/11/2026). */
export interface ClubGuestsConfig {
  /** Recibir invitados cuando falta uno y nadie del club se sumó en la primera tanda. */
  enabled: boolean;
  /** Recargo en pesos que paga el invitado, sobre su parte. */
  surcharge: number;
  /** false: la app nunca ofrece a los jugadores de este club en otros clubes (4.6c). */
  shareMyPlayers?: boolean;
}

export interface GuestInfo {
  displayName: string;
  category: number;
  gender: Gender;
  /** Club de origen (vacío si es amigo de un socio sin club). */
  homeClubId: string;
  kind: 'otro_club' | 'amigo';
  surcharge: number;
}

/** Amigo que un socio autorizó a jugar como invitado en el club (clubs/{club}/guestPasses/{uid}). */
export interface GuestPass {
  uid: string;
  clubId: string;
  displayName: string;
  category: number;
  gender: Gender;
  invitedBy: string;
  invitedByName: string;
  createdAt?: unknown;
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
  via?: 'aviso' | 'link' | 'guardia';
  amountRecovered: number;
  status: 'pending' | 'counted' | 'voided';
  voidReason: string;
  createdAt?: unknown;
}

/** Suplente de guardia (etapa 4, decisión 4.5): "si se baja alguien en ese horario, contá conmigo". */
export interface Standby {
  id: string;
  clubId: string;
  uid: string;
  displayName: string;
  category: number;
  date: string; // YYYY-MM-DD
  startMinute: number;
  endMinute: number;
  /** active = esperando; used = entró a un partido; cancelled = lo sacó él; expired = pasó el horario. */
  status: 'active' | 'used' | 'cancelled' | 'expired';
  /** Partido al que entró, si entró. */
  matchId?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}
