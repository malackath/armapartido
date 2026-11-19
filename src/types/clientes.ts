/**
 * Ficha de cliente del club, cuponeras, saldo a favor y el libro de ventas.
 * Especificación: Paddle.URU/docs/especificacion-clientes-ventas-kpis.md (15/11/2026).
 *
 * Datos personales (ley 18.331): la ficha es del CLUB (responsable); Armá Partido la guarda por
 * cuenta del club (encargado). Cada club ve solo sus fichas.
 */

/** Cómo llegó el cliente al club. */
export type ClientOrigin = 'app' | 'mostrador' | 'telefono' | 'migracion' | 'falta_uno' | 'torneo' | 'invitado';

export const ORIGIN_LABEL: Record<ClientOrigin, string> = {
  app: 'la app',
  mostrador: 'el mostrador',
  telefono: 'teléfono',
  migracion: 'migración',
  falta_uno: 'un aviso de Falta uno',
  torneo: 'un torneo',
  invitado: 'invitado a un partido',
};

/** Ficha de una persona en un club. */
export interface ClubClient {
  id: string;
  clubId: string;
  name: string;
  /** Celular normalizado: +598 9X XXX XXX guardado como "+59899123456". '' si noPhone. */
  phone: string;
  /** El encargado marcó a propósito que no tiene celular (la pareja, un menor). Decisión 1. */
  noPhone: boolean;
  email: string;
  category: number | null;
  /** Cuenta de la app unida a esta ficha ('' si no tiene la app o no se unió). */
  uid: string;
  linkedBy?: 'mail' | 'mostrador' | 'qr';
  linkedAtISO?: string;
  origin: ClientOrigin;
  createdByUid: string;
  createdByName: string;
  /** Día de alta (YYYY-MM-DD), para contar altas sin depender del reloj del servidor. */
  createdOn: string;
  /** Le avisaron que sus datos quedan en el club para reservas y cobros. */
  noticeGiven: boolean;
  /** Quiere recibir novedades y promociones del club (apagado por defecto). */
  acceptsNews: boolean;
  rut: string;
  businessName: string;
  /** Nota operativa corta. Nada de salud, documentos ni opiniones. */
  note: string;
  /** Saldo a favor en pesos. */
  balance: number;
  status: 'active' | 'archived';
  /** Si se unió con otra ficha: la que quedó. */
  mergedInto?: string;
  /** Posible repetido: el encargado guardó igual con un celular que ya existía. */
  reviewDuplicate?: boolean;
  /** Los datos personales se borraron a pedido (los movimientos quedan como "Cliente borrado"). */
  erased?: boolean;
  invitedAtISO?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

/** Rubros fijos de fábrica (decisión 5, recomendada: fijos en fase 1). */
export type Rubro = 'cancha' | 'cantina' | 'cuponeras' | 'saldo' | 'clases' | 'torneos' | 'alquiler' | 'otros';

export const RUBROS: { id: Rubro; label: string }[] = [
  { id: 'cancha', label: 'Cancha' },
  { id: 'cantina', label: 'Cantina' },
  { id: 'cuponeras', label: 'Cuponeras' },
  { id: 'saldo', label: 'Saldo' },
  { id: 'clases', label: 'Clases' },
  { id: 'torneos', label: 'Torneos' },
  { id: 'alquiler', label: 'Alquiler' },
  { id: 'otros', label: 'Otros' },
];
export const RUBRO_LABEL = Object.fromEntries(RUBROS.map((r) => [r.id, r.label])) as Record<Rubro, string>;

/** Qué es un uso de la cuponera. */
export type PackUnit = 'parte' | 'turno';
/** En qué horarios vale. valle = lunes a viernes antes de la hora pico; semana = lunes a viernes. */
export type PackValidity = 'todos' | 'valle' | 'semana';

/** Cuponera que arma el club (Admin, Cuponeras). No se borra: se desactiva. */
export interface PackType {
  id: string;
  clubId: string;
  name: string;
  price: number;
  uses: number;
  unit: PackUnit;
  validity: PackValidity;
  /** Cuántos días dura desde que se vende (decisión 4: lo pone el club, 90 por defecto). */
  days: number;
  active: boolean;
  order: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface PackUse {
  bookingId: string;
  date: string;
  /** Lo que valía esa parte o turno ese día (para la ocupación, no para la caja). */
  value: number;
  atISO: string;
  byName: string;
  saleId: string;
}

/** Cuponera vendida a un cliente. Es personal (decisión 4). */
export interface ClientPack {
  id: string;
  clubId: string;
  clientId: string;
  clientName: string;
  /** Cuenta de la app de la persona ('' si no tiene): deja que la vea en su app. */
  uid: string;
  packTypeId: string;
  name: string;
  unit: PackUnit;
  validity: PackValidity;
  usesTotal: number;
  usesLeft: number;
  price: number;
  soldOn: string;
  expiresOn: string;
  paymentId: string;
  saleId: string;
  status: 'active' | 'voided';
  uses: PackUse[];
  /** Código del QR de la cuponera (AP1.<club>.<24 letras>): lo lee el Mostrador y va en la billetera. */
  qr?: string;
  /** Pases guardados en las billeteras (lo escribe solo el servidor). */
  wallet?: { google?: { objectId?: string }; apple?: { actualizado?: number } };
  createdAt?: unknown;
  updatedAt?: unknown;
}

/** Cómo se pagó una venta. cuponera y saldo no son plata nueva; cuenta = queda debiendo. */
export type SaleMethod = 'efectivo' | 'transferencia' | 'debito_club' | 'mercadopago' | 'cuponera' | 'saldo' | 'cuenta';

/**
 * Venta: qué se vendió, a quién y de qué rubro. El cobro (la plata que entra, con su medio y su
 * factura) es un PaymentRecord aparte que la venta apunta con paymentId. Una venta sin cobro y
 * no paga es una deuda.
 */
export interface Sale {
  id: string;
  clubId: string;
  day: string;
  clientId: string; // '' = sin nombre
  clientName: string;
  rubro: Rubro;
  concept: string;
  qty: number;
  amount: number;
  /** En una carga de saldo con bonificación: el extra que regala el club (es descuento, no venta). */
  bonus?: number;
  method: SaleMethod;
  paymentId: string;
  paid: boolean;
  status: 'vigente' | 'anulada';
  voidReason?: string;
  bookingId: string;
  packId: string;
  staffUid: string;
  staffName: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

/** Registro de quién bajó una planilla con datos personales y cuándo (sección 8, regla 7). */
export interface ExportLog {
  id: string;
  clubId: string;
  kind: 'clientes' | 'movimientos' | 'libro' | 'datos_persona';
  byUid: string;
  byName: string;
  atISO: string;
  rows: number;
}

export type InvoiceStatus = 'pendiente' | 'emitida' | 'no_corresponde';
