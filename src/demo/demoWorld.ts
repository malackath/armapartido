/**
 * Mundo de demo de Armá Partido: un club ficticio de Montevideo con canchas, jugadores de 1ra a 8va,
 * reservas pasadas y futuras, partidos armados y abiertos, y torneos.
 * Lo usan el script `npm run demo:seed` y el botón "Reiniciar demo" de la app.
 * Las fechas se arman relativas al día en que se carga, así la demo siempre parece "de hoy".
 */
import type {
  AvailabilityWindow,
  Booking,
  Club,
  ClubMembership,
  ClubRole,
  Court,
  Gender,
  MatchRequest,
  Modality,
  NotificationItem,
  PaymentRecord,
  PlayerMatchResult,
  ProposedMatch,
  Tournament,
  TournamentMatch,
  TournamentPair,
  UserProfile,
} from '../types/padel';
import { addDaysISO, getDayOfWeekFromISO, getTodayISO } from '../lib/padelUtils';
import { addCantinaDemo } from './demoCantina';

export const DEMO_CLUB_ID = 'los_jacarandas';
export const DEMO_EMAIL_DOMAIN = 'demo.armapartido.com';

/** Cuentas con las que se puede entrar. Las contraseñas NO van en el repo. */
export const DEMO_ACCOUNTS = [
  { key: 'plataforma', email: `plataforma@${DEMO_EMAIL_DOMAIN}`, name: 'Equipo Armá Partido', label: 'Dueño de la plataforma', category: 4, gender: 'masculino' as Gender },
  { key: 'dueno', email: `dueno@${DEMO_EMAIL_DOMAIN}`, name: 'Sofía Rodríguez', label: 'Dueña del club', category: 3, gender: 'femenino' as Gender },
  { key: 'mostrador', email: `mostrador@${DEMO_EMAIL_DOMAIN}`, name: 'Diego Fernández', label: 'Encargado de mostrador', category: 6, gender: 'masculino' as Gender },
  { key: 'jugador', email: `jugador@${DEMO_EMAIL_DOMAIN}`, name: 'Martín Silva', label: 'Jugador (5ta)', category: 5, gender: 'masculino' as Gender },
  { key: 'jugadora', email: `jugadora@${DEMO_EMAIL_DOMAIN}`, name: 'Lucía Pérez', label: 'Jugadora (4ta)', category: 4, gender: 'femenino' as Gender },
] as const;

export type DemoAccountKey = (typeof DEMO_ACCOUNTS)[number]['key'];
export type DemoUids = Record<DemoAccountKey, string>;

/** Jugadores del club sin cuenta para entrar (solo datos), de 1ra a 8va. */
const EXTRA_PLAYERS: { id: string; name: string; category: number; gender: Gender }[] = [
  { id: 'demo-p01', name: 'Federico Acosta', category: 1, gender: 'masculino' },
  { id: 'demo-p02', name: 'Valentina Suárez', category: 2, gender: 'femenino' },
  { id: 'demo-p03', name: 'Joaquín Méndez', category: 2, gender: 'masculino' },
  { id: 'demo-p04', name: 'Camila Olivera', category: 3, gender: 'femenino' },
  { id: 'demo-p05', name: 'Nicolás Pereira', category: 3, gender: 'masculino' },
  { id: 'demo-p06', name: 'Agustina Silva', category: 4, gender: 'femenino' },
  { id: 'demo-p07', name: 'Santiago Gómez', category: 4, gender: 'masculino' },
  { id: 'demo-p08', name: 'Florencia Castro', category: 5, gender: 'femenino' },
  { id: 'demo-p09', name: 'Rodrigo Núñez', category: 5, gender: 'masculino' },
  { id: 'demo-p10', name: 'Mateo Cabrera', category: 5, gender: 'masculino' },
  { id: 'demo-p11', name: 'Carolina Ramos', category: 6, gender: 'femenino' },
  { id: 'demo-p12', name: 'Gonzalo Viera', category: 6, gender: 'masculino' },
  { id: 'demo-p13', name: 'Paula Martínez', category: 6, gender: 'femenino' },
  { id: 'demo-p14', name: 'Ignacio Benítez', category: 7, gender: 'masculino' },
  { id: 'demo-p15', name: 'Lorena Sosa', category: 7, gender: 'femenino' },
  { id: 'demo-p16', name: 'Pablo Rodríguez', category: 8, gender: 'masculino' },
  { id: 'demo-p17', name: 'Andrea Ferreira', category: 8, gender: 'femenino' },
];

export interface DemoDoc {
  path: string; // ruta completa del documento, por ejemplo clubs/x/courts/y
  data: Record<string, unknown>;
}

/** Subcolecciones del club que el reinicio borra antes de volver a cargar. */
export const DEMO_CLUB_SUBCOLLECTIONS = [
  'courts',
  'memberships',
  'bookings',
  'matchRequests',
  'proposedMatches',
  'tournaments',
  'payments',
  'notifications',
  'matchResults',
  'waitlist',
  'products',
  'consumptions',
  'cashDays',
  'fixedBookings',
  'recoveries',
  'monthlyReports',
];

const SLOT = 90;
// Turnos de 90 min desde las 8:00: 8:00, 9:30, 11:00, 12:30, 14:00, 15:30, 17:00, 18:30, 20:00, 21:30
const T = (h: number, m = 0) => h * 60 + m;

export function buildDemoWorld(uids: DemoUids, today = getTodayISO()): DemoDoc[] {
  const docs: DemoDoc[] = [];
  const day = (n: number) => addDaysISO(today, n);
  const put = (path: string, data: object) => docs.push({ path, data: { ...data } as Record<string, unknown> });
  const C = DEMO_CLUB_ID;
  const base = `clubs/${C}`;

  const club: Club = {
    id: C,
    name: 'Los Jacarandás Pádel',
    slug: 'los-jacarandas',
    primaryColor: '#0a5761',
    accentColor: '#172123',
    address: 'Calle de los Jacarandás 1450, Malvín',
    neighborhood: 'Malvín',
    city: 'Montevideo',
    lat: -34.889,
    lng: -56.098,
    ownerUid: uids.dueno,
    slotDurationMinutes: SLOT,
    openHour: 8,
    closeHour: 23,
    basePrice: 1800,
    nightFromHour: 19,
    nightPrice: 2400,
    weekendPrice: 2200,
    cancellationHours: 6,
    maxNoShowsBeforeBlock: 3,
    mpEnabled: true,
    mpMode: 'full',
    mpDepositPercent: 30,
    subscriptionStatus: 'trial',
    trialEndsAt: day(30),
    monthlyPricePerCourt: 0,
    courtCount: 4,
    active: true,
  };
  put(base, club);

  const courts: Court[] = [
    { id: 'cancha_1', clubId: C, name: 'Cancha 1', roof: 'techada', surface: 'cristal', hasLights: true, active: true },
    { id: 'cancha_2', clubId: C, name: 'Cancha 2', roof: 'techada', surface: 'cristal', hasLights: true, active: true },
    { id: 'cancha_3', clubId: C, name: 'Cancha 3', roof: 'aire_libre', surface: 'cristal', hasLights: true, active: true },
    { id: 'cancha_4', clubId: C, name: 'Cancha 4', roof: 'aire_libre', surface: 'muro', hasLights: true, active: true },
  ];
  courts.forEach((c) => put(`${base}/courts/${c.id}`, c));
  const court = (id: string) => courts.find((c) => c.id === id)!;

  // Personas: cuentas de entrada + jugadores extra
  const roleOf: Record<DemoAccountKey, ClubRole> = {
    plataforma: 'player',
    dueno: 'admin',
    mostrador: 'staff',
    jugador: 'player',
    jugadora: 'player',
  };
  const avail = (days: number[], from: number, to: number): AvailabilityWindow[] =>
    days.map((d) => ({ dayOfWeek: d, startMinute: from, endMinute: to }));
  const people: { uid: string; name: string; category: number; gender: Gender; role: ClubRole; modality: Modality }[] = [
    ...DEMO_ACCOUNTS.map((a) => ({
      uid: uids[a.key],
      name: a.name,
      category: a.category,
      gender: a.gender,
      role: roleOf[a.key],
      modality: 'mixto' as Modality,
    })),
    ...EXTRA_PLAYERS.map((p) => ({ uid: p.id, name: p.name, category: p.category, gender: p.gender, role: 'player' as ClubRole, modality: 'mixto' as Modality })),
  ];
  const nameOf = (uid: string) => people.find((p) => p.uid === uid)?.name ?? 'Jugador';
  const catOf = (uid: string) => people.find((p) => p.uid === uid)?.category ?? 5;
  const genOf = (uid: string) => people.find((p) => p.uid === uid)?.gender ?? 'masculino';

  people.forEach((p, i) => {
    const weekly = i % 2 === 0 ? avail([2, 4], T(19), T(23)) : avail([1, 3, 6], T(18), T(22));
    const profile: UserProfile = {
      uid: p.uid,
      displayName: p.name,
      photoUrl: '',
      category: p.category,
      gender: p.gender,
      preferredModality: p.modality,
      weeklyAvailability: weekly,
      activeClubIds: [C],
    };
    put(`users/${p.uid}`, profile);
    const membership: ClubMembership = {
      uid: p.uid,
      clubId: C,
      displayName: p.name,
      role: p.role,
      category: p.category,
      gender: p.gender,
      preferredModality: p.modality,
      weeklyAvailability: weekly,
      noShowCount: p.uid === 'demo-p16' ? 1 : 0,
      blocked: false,
      isDiscoverable: true,
    };
    // Antigüedad en el club (para "jugadores nuevos" del informe): 4 entraron esta semana, el resto hace 2 meses.
    const joined = ['demo-p03', 'demo-p08', 'demo-p15', 'demo-p17'].includes(p.uid) ? day(-4 - (i % 3)) : day(-60 - i);
    put(`${base}/memberships/${p.uid}`, { ...membership, createdAt: new Date(`${joined}T12:00:00`) });
  });
  const acct = DEMO_ACCOUNTS.find((a) => a.key === 'jugador')!;
  put(`users/${uids.jugador}/private/info`, { uid: uids.jugador, email: acct.email, phone: '' });

  // ---------- Reservas ----------
  const price = (date: string, start: number) => {
    const dow = getDayOfWeekFromISO(date);
    if (dow === 0 || dow === 6) return start >= T(19) ? club.nightPrice : club.weekendPrice;
    return start >= T(19) ? club.nightPrice : club.basePrice;
  };
  let bk = 0;
  const bookings: Booking[] = [];
  const addBooking = (b: Partial<Booking> & { date: string; startMinute: number; courtId: string; createdByUid: string }) => {
    const total = price(b.date, b.startMinute);
    const booking: Booking = {
      id: `demo_bk_${String(++bk).padStart(3, '0')}`,
      clubId: C,
      courtName: court(b.courtId).name,
      endMinute: b.startMinute + SLOT,
      type: 'direct',
      status: 'confirmed',
      playerUids: [b.createdByUid],
      guestName: '',
      totalPrice: total,
      paidAmount: 0,
      paymentMethod: 'club',
      paymentStatus: 'pending',
      holdExpiresAt: '',
      ...b,
    } as Booking;
    bookings.push(booking);
    return booking;
  };

  // Pasadas (últimos 6 días), ya cobradas en el club
  const pastPlan: [number, number, string, string][] = [
    [-6, T(18, 30), 'cancha_1', 'demo-p05'],
    [-6, T(20), 'cancha_2', 'demo-p09'],
    [-5, T(20), 'cancha_1', uids.jugador],
    [-4, T(17), 'cancha_3', 'demo-p12'],
    [-3, T(21, 30), 'cancha_2', 'demo-p02'],
    [-2, T(18, 30), 'cancha_4', 'demo-p14'],
    [-1, T(20), 'cancha_1', uids.jugadora],
    [-1, T(21, 30), 'cancha_3', 'demo-p07'],
  ];
  pastPlan.forEach(([d, start, courtId, uid]) => {
    const b = addBooking({ date: day(d), startMinute: start, courtId, createdByUid: uid });
    b.paidAmount = b.totalPrice;
    b.paymentStatus = 'paid';
  });

  // Hoy y próximos días
  addBooking({ date: day(0), startMinute: T(18, 30), courtId: 'cancha_1', createdByUid: 'demo-p04' });
  addBooking({ date: day(0), startMinute: T(20), courtId: 'cancha_1', createdByUid: 'demo-p10' });
  addBooking({ date: day(0), startMinute: T(20), courtId: 'cancha_2', createdByUid: uids.mostrador, type: 'counter', guestName: 'Alejandro Duarte', playerUids: [] });
  addBooking({ date: day(0), startMinute: T(21, 30), courtId: 'cancha_3', createdByUid: 'demo-p13' });
  const martinBooking = addBooking({ date: day(1), startMinute: T(18, 30), courtId: 'cancha_2', createdByUid: uids.jugador });
  addBooking({ date: day(1), startMinute: T(20), courtId: 'cancha_1', createdByUid: 'demo-p06', paymentMethod: 'mercadopago', paidAmount: price(day(1), T(20)), paymentStatus: 'paid' });
  addBooking({ date: day(1), startMinute: T(21, 30), courtId: 'cancha_4', createdByUid: uids.mostrador, type: 'counter', guestName: 'Grupo de la oficina', playerUids: [] });
  addBooking({ date: day(2), startMinute: T(20), courtId: 'cancha_3', createdByUid: 'demo-p11', status: 'held', holdExpiresAt: new Date(Date.now() + 2 * 3600 * 1000).toISOString() });
  addBooking({ date: day(3), startMinute: T(9, 30), courtId: 'cancha_1', createdByUid: 'demo-p16' });
  addBooking({ date: day(4), startMinute: T(18, 30), courtId: 'cancha_2', createdByUid: uids.jugadora });

  // Partido armado confirmado (Martín + 3 de 4ta a 6ta) pasado mañana
  const matchDate = day(2);
  const matchBooking = addBooking({
    date: matchDate,
    startMinute: T(20),
    courtId: 'cancha_1',
    createdByUid: uids.jugador,
    type: 'matched',
    playerUids: [uids.jugador, 'demo-p09', 'demo-p08', 'demo-p12'],
  });
  const slot = (uid: string, status: 'pending' | 'accepted', paid = false) => ({
    uid,
    displayName: nameOf(uid),
    category: catOf(uid),
    gender: genOf(uid),
    status,
    paid,
    requestId: `demo_req_${uid}`,
  });
  const confirmed: ProposedMatch = {
    id: 'demo_pm_001',
    clubId: C,
    bookingId: matchBooking.id,
    courtId: 'cancha_1',
    courtName: 'Cancha 1',
    date: matchDate,
    startMinute: T(20),
    endMinute: T(21, 30),
    modality: 'mixto',
    minCategory: 4,
    maxCategory: 6,
    pricePerPlayer: matchBooking.totalPrice / 4,
    playerUids: matchBooking.playerUids,
    slots: matchBooking.playerUids.map((u) => slot(u, 'accepted', u === 'demo-p09')),
    expiresAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
    status: 'confirmed',
    createdByUid: uids.jugador,
  };
  put(`${base}/proposedMatches/${confirmed.id}`, confirmed);

  // Partido propuesto esperando que acepten (Lucía + 3), en 3 días
  const pendDate = day(3);
  const pendBooking = addBooking({
    date: pendDate,
    startMinute: T(20),
    courtId: 'cancha_2',
    createdByUid: uids.jugadora,
    type: 'matched',
    status: 'held',
    holdExpiresAt: new Date(Date.now() + 6 * 3600 * 1000).toISOString(),
    playerUids: [uids.jugadora, 'demo-p06', 'demo-p07', 'demo-p05'],
  });
  const pending: ProposedMatch = {
    id: 'demo_pm_002',
    clubId: C,
    bookingId: pendBooking.id,
    courtId: 'cancha_2',
    courtName: 'Cancha 2',
    date: pendDate,
    startMinute: T(20),
    endMinute: T(21, 30),
    modality: 'mixto',
    minCategory: 3,
    maxCategory: 4,
    pricePerPlayer: pendBooking.totalPrice / 4,
    playerUids: pendBooking.playerUids,
    slots: [slot(uids.jugadora, 'accepted'), slot('demo-p06', 'accepted'), slot('demo-p07', 'pending'), slot('demo-p05', 'pending')],
    expiresAt: new Date(Date.now() + 6 * 3600 * 1000).toISOString(),
    status: 'pending',
    createdByUid: uids.jugadora,
  };
  put(`${base}/proposedMatches/${pending.id}`, pending);

  bookings.forEach((b) => put(`${base}/bookings/${b.id}`, b));

  // ---------- Pedidos abiertos (buscan jugadores) ----------
  const req = (
    id: string,
    creator: string,
    partner: string | null,
    date: string,
    start: number,
    type: 'weekly' | 'priority'
  ): MatchRequest => ({
    id,
    clubId: C,
    clubIds: [C],
    creatorUid: creator,
    creatorName: nameOf(creator),
    partnerUid: partner ?? '',
    partnerName: partner ? nameOf(partner) : '',
    partnerAccepted: !!partner,
    category: catOf(creator),
    modality: 'mixto',
    requestType: type,
    date,
    dayOfWeek: getDayOfWeekFromISO(date),
    startMinute: start,
    endMinute: start + SLOT,
    isSameDay: date === today,
    status: 'waiting',
    unfilledAlertSent: false,
  });
  [
    req('demo_req_001', 'demo-p10', 'demo-p08', day(0), T(21, 30), 'priority'),
    req('demo_req_002', 'demo-p11', null, day(1), T(20), 'priority'),
    req('demo_req_003', 'demo-p09', 'demo-p12', day(2), T(18, 30), 'weekly'),
    req('demo_req_004', 'demo-p02', 'demo-p03', day(1), T(21, 30), 'priority'),
    req('demo_req_005', 'demo-p15', null, day(3), T(17), 'weekly'),
  ].forEach((r) => put(`${base}/matchRequests/${r.id}`, r));

  // ---------- Torneos ----------
  const pair = (id: string, a: string, b: string, cat: number): TournamentPair => ({
    id,
    player1Uid: a,
    player1Name: nameOf(a),
    player2Uid: b,
    player2Name: nameOf(b),
    category: cat,
    partnerAccepted: true,
    paid: true,
  });
  const pairs: TournamentPair[] = [
    pair('pr1', uids.jugador, 'demo-p09', 5),
    pair('pr2', 'demo-p08', 'demo-p10', 5),
    pair('pr3', 'demo-p11', 'demo-p12', 6),
    pair('pr4', 'demo-p06', 'demo-p07', 4),
    pair('pr5', uids.jugadora, 'demo-p05', 4),
    pair('pr6', 'demo-p13', 'demo-p14', 6),
    pair('pr7', uids.mostrador, 'demo-p15', 6),
    pair('pr8', 'demo-p04', 'demo-p16', 5),
  ];
  const label = (p: TournamentPair) => `${p.player1Name.split(' ')[0]} / ${p.player2Name.split(' ')[0]}`;
  const P = (id: string) => pairs.find((p) => p.id === id)!;
  let mi = 0;
  const tm = (round: string, a: string, b: string, date: string, start: number, courtId: string, score = '', winner = ''): TournamentMatch => ({
    id: `tm${++mi}`,
    round,
    pair1Id: a,
    pair1Label: a ? label(P(a)) : 'A definir',
    pair2Id: b,
    pair2Label: b ? label(P(b)) : 'A definir',
    courtId,
    courtName: court(courtId).name,
    date,
    startMinute: start,
    score,
    winnerPairId: winner,
    status: winner ? 'completed' : 'scheduled',
  });
  const copa: Tournament = {
    id: 'demo_torneo_primavera',
    clubId: C,
    name: 'Copa Primavera Jacarandás',
    startDate: day(-1),
    endDate: day(1),
    categories: [4, 5, 6],
    maxPairs: 8,
    entryFee: 1200,
    format: 'knockout',
    status: 'in_progress',
    pairs,
    matches: [
      tm('Cuartos', 'pr1', 'pr8', day(-1), T(18, 30), 'cancha_1', '6-4 6-3', 'pr1'),
      tm('Cuartos', 'pr2', 'pr7', day(-1), T(18, 30), 'cancha_2', '7-5 3-6 6-4', 'pr2'),
      tm('Cuartos', 'pr3', 'pr6', day(-1), T(20), 'cancha_1', '6-2 6-2', 'pr3'),
      tm('Cuartos', 'pr4', 'pr5', day(-1), T(20), 'cancha_2', '4-6 6-3 7-6', 'pr5'),
      tm('Semifinal', 'pr1', 'pr2', day(0), T(20), 'cancha_3'),
      tm('Semifinal', 'pr3', 'pr5', day(0), T(21, 30), 'cancha_3'),
      tm('Final', '', '', day(1), T(20), 'cancha_2'),
    ],
    createdByUid: uids.dueno,
  };
  put(`${base}/tournaments/${copa.id}`, copa);

  const verano: Tournament = {
    id: 'demo_torneo_verano',
    clubId: C,
    name: 'Torneo de Verano',
    startDate: day(12),
    endDate: day(13),
    categories: [3, 4, 5, 6],
    maxPairs: 16,
    entryFee: 1500,
    format: 'groups_knockout',
    status: 'registration_open',
    pairs: [pair('v1', 'demo-p04', 'demo-p05', 3), pair('v2', 'demo-p11', 'demo-p13', 6), pair('v3', 'demo-p06', 'demo-p07', 4)],
    matches: [],
    createdByUid: uids.dueno,
  };
  put(`${base}/tournaments/${verano.id}`, verano);

  // ---------- Pagos ----------
  let pi = 0;
  const pay = (uid: string, ref: string, amount: number, method: PaymentRecord['method'], kind: PaymentRecord['kind']): PaymentRecord => ({
    id: `demo_pay_${String(++pi).padStart(3, '0')}`,
    clubId: C,
    uid,
    clubOwnerUid: uids.dueno,
    payerName: nameOf(uid),
    referenceId: ref,
    amount,
    method,
    kind,
    status: 'completed',
  });
  const methods: PaymentRecord['method'][] = ['efectivo', 'transferencia', 'debito_club', 'efectivo'];
  bookings
    .filter((b) => b.paymentStatus === 'paid')
    .forEach((b, i) =>
      put(`${base}/payments/demo_pay_x${i}`, {
        ...pay(b.createdByUid, b.id, b.totalPrice, b.paymentMethod === 'mercadopago' ? 'mercadopago' : methods[i % 4], 'booking_full'),
        day: b.date < today ? b.date : day(-1),
        staffName: b.paymentMethod === 'mercadopago' ? '' : 'Diego Fernández',
      })
    );
  pairs.forEach((p) => put(`${base}/payments/demo_pay_t_${p.id}`, { ...pay(p.player1Uid, copa.id, copa.entryFee * 2, 'efectivo', 'tournament_fee'), day: day(-8) }));
  put(`${base}/payments/demo_pay_share`, { ...pay('demo-p09', confirmed.id, confirmed.pricePerPlayer, 'mercadopago', 'match_share'), day: day(-1) });

  // ---------- Avisos ----------
  const notif = (id: string, uid: string, eventType: NotificationItem['eventType'], title: string, body: string, read = false): NotificationItem => ({
    id,
    clubId: C,
    recipientUid: uid,
    eventType,
    title,
    body,
    pushSent: false,
    emailSent: false,
    read,
  });
  [
    notif('demo_n1', uids.jugador, 'match_confirmed', 'Partido confirmado', 'Los 4 aceptaron: jugás pasado mañana a las 20:00 en la Cancha 1.'),
    notif('demo_n2', uids.jugador, 'tournament_next_match', 'Tu próximo partido del torneo', 'Semifinal de la Copa Primavera hoy a las 20:00 en la Cancha 3.'),
    notif('demo_n3', uids.jugador, 'tournament_new', 'Nuevo torneo: Torneo de Verano', 'Inscripción en pareja abierta, de 3ra a 6ta.', true),
    notif('demo_n4', uids.jugadora, 'match_proposed', 'Te armamos un partido', 'Faltan 2 jugadores por aceptar para el partido del jueves a las 20:00.'),
    notif('demo_n5', uids.jugador, 'booking_confirmed', 'Reserva confirmada', 'Cancha 2 mañana a las 18:30. Se paga en el club.', true),
  ].forEach((n) => put(`${base}/notifications/${n.id}`, n));

  // ---------- Resultados de Martín ----------
  const results: [number, 'win' | 'loss', string][] = [
    [-5, 'win', '6-3 6-4'],
    [-12, 'loss', '4-6 6-7'],
    [-19, 'win', '7-5 6-2'],
    [-1, 'win', '6-4 6-3'],
  ];
  results.forEach(([d, outcome, score], i) => {
    const r: PlayerMatchResult = {
      id: `demo_res_${i + 1}`,
      uid: uids.jugador,
      clubId: C,
      clubName: club.name,
      date: day(d),
      outcome,
      score,
      modality: 'mixto',
    };
    put(`users/${uids.jugador}/matchResults/${r.id}`, r);
    put(`${base}/matchResults/${r.id}`, r);
  });

  // Martín reservó mañana: queda como su próxima reserva
  void martinBooking;

  // Caja, cantina, turnos fijos, seña retenida, turnos recuperados e informe del mes pasado
  addCantinaDemo(docs, { base, clubId: C, today, uids, nameOf, catOf, genOf, price, ownerUid: uids.dueno });
  return docs;
}
