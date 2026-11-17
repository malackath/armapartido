/**
 * Tipos de caja del día, cantina, turnos fijos, seña en pico e informe mensual.
 * Especificación: Paddle.URU/docs/especificacion-informe-caja-cantina-migracion.md
 */

/** Producto de la cantina. stock = null cuando no lleva stock (por ejemplo, alquiler de paleta). */
export interface Product {
  id: string;
  clubId: string;
  name: string;
  price: number;
  stock: number | null;
  minStock: number;
  active: boolean;
  order: number;
  /** Ícono elegido por el club (si no, se deduce del nombre). */
  icon?: string;
  /** Foto del producto o de la marca (acuerdos con auspiciantes), más adelante. */
  photoUrl?: string;
  /** Producto del catálogo base (src/lib/catalogo.ts), si salió de ahí. */
  catalogId?: string;
  /** Dónde se vende: en los dos (por defecto), solo en la Cantina o solo en el Mostrador. */
  where?: 'ambos' | 'cantina' | 'mostrador';
  createdAt?: unknown;
  updatedAt?: unknown;
}

/**
 * Consumo de la cantina. Si va a un turno, bookingId y date son los del turno.
 * shared = "para todos": se divide entre participantUids. Si no, es de forUid / forName.
 * Lo pendiente es lo que el jugador debe (el "fiado").
 */
export interface Consumption {
  id: string;
  clubId: string;
  productId: string;
  productName: string;
  unitPrice: number;
  qty: number;
  total: number;
  bookingId: string; // '' = venta rápida o consumo suelto
  date: string; // YYYY-MM-DD
  shared: boolean;
  forUid: string; // '' si es "para todos" o un cliente sin cuenta
  forName: string;
  participantUids: string[]; // quiénes lo ven en su app y entre quiénes se divide
  participantNames: string[];
  paidUids: string[]; // en los compartidos, quién ya pagó su parte
  status: 'pending' | 'paid' | 'voided';
  createdByUid: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

/** Caja del día: una por club por día. El id es la fecha YYYY-MM-DD. */
export interface CashDay {
  id: string;
  clubId: string;
  date: string;
  openingFloat: number;
  openedByUid: string;
  openedByName: string;
  status: 'open' | 'closed';
  closedByUid?: string;
  closedByName?: string;
  closedAtISO?: string;
  expectedCash?: number;
  countedCash?: number;
  difference?: number;
  note?: string;
  totals?: Record<string, number>;
  createdAt?: unknown;
  updatedAt?: unknown;
}

/** Turno fijo semanal mínimo: genera reservas sueltas cada semana hasta untilDate. */
export interface FixedBooking {
  id: string;
  clubId: string;
  courtId: string;
  courtName: string;
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
  holderName: string;
  holderUid: string;
  /** Ficha del cliente (turno fijo cargado de una planilla, sin app todavía). */
  clientId?: string;
  phone: string;
  fromDate: string;
  untilDate: string;
  active: boolean;
  bookingIds: string[];
  createdByUid: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

/** Regla de seña en horario pico. Apagada por defecto. */
export interface DepositRule {
  enabled: boolean;
  days: number[]; // 0 = domingo ... 6 = sábado
  fromHour: number;
  toHour: number;
  amount: number;
  holdMinutes: number;
}

/**
 * Turno recuperado por un aviso de "Falta uno". Lo escribe SOLO el servidor.
 * Forma acordada con el hilo que especifica Falta uno (docs/falta-uno-automatico.md).
 */
export interface Recovery {
  id: string;
  clubId: string;
  bookingId: string;
  courtId: string;
  date: string;
  startMinute: number;
  endMinute: number;
  sport?: string;
  kind: 'slot_filled' | 'player_replaced' | 'match_completed';
  freeSince: string;
  alertId?: string;
  searchId?: string;
  alertSentAt: string;
  filledByUid: string;
  filledAt: string;
  seatsFilled: number;
  /** Entró por aviso de la app o por el link compartido (16/11). */
  via?: 'aviso' | 'link';
  amountRecovered: number;
  status: 'pending' | 'counted' | 'voided';
  voidReason?: string;
  createdAt?: unknown;
}

/** Números de un mes. Se calcula en vivo para el mes en curso y se guarda como foto el día 1. */
export interface MonthlyReport {
  id: string; // YYYY-MM
  clubId: string;
  clubName: string;
  month: string; // YYYY-MM
  partial: boolean;
  fromDate: string;
  toDate: string;
  // Lo que suma al total "ganado"
  slotsFilled: { count: number; amount: number };
  playersReplaced: { count: number; amount: number };
  matchesCompleted: { count: number; seats: number; amount: number };
  depositsKept: { count: number; amount: number };
  totalEarned: number;
  // La cuota
  planLabel: string;
  feeUYU: number;
  isTrial: boolean;
  multiple: number;
  // Cómo anduvo el mes (no suma al total)
  playedBookings: number;
  occupancyPct: number;
  noShows: number;
  cantinaCollected: number;
  newPlayers: number;
  /** De los nuevos, cuántos llegaron por Armá Partido (la app o Falta uno). Falta en informes viejos. */
  newFromApp?: number;
  uncollected: number;
  /** Contexto, no suma (16/11): reservas jugadas que se hicieron desde la app y partidos que armó la app sola. */
  appBookings?: number;
  matchesBuilt?: number;
  /** De lo que suma, cuántos lugares se llenaron por el link compartido de "Falta uno". */
  viaLink?: number;
  // Consejo para el mes que viene
  tip: string;
  recoveryIds: string[];
  generatedAtISO?: string;
  sentTo?: string[];
}
