import { teamsForSlots } from '../lib/planificador';
import type { ProposedSlot } from '../types/padel';
/**
 * Mundo de demo de Armá Partido: un club ficticio de Montevideo con canchas, jugadores de 1ra a 7ma,
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
import { addDaysISO, generateDaySlots, getDayOfWeekFromISO, getTodayISO } from '../lib/padelUtils';
import { addHistory, planToday, seeded, type TodaySlot } from './demoHoy';
import type { CashDay } from '../types/caja';
import { addCantinaDemo } from './demoCantina';
import { makeGrouper } from './demoParejas';
import { addClientesDemo } from './demoClientes';
import { addInvitadosDemo } from './demoInvitados';

export const DEMO_CLUB_ID = 'los_jacarandas';
export const DEMO_EMAIL_DOMAIN = 'demo.armapartido.com';

/** Cuentas con las que se puede entrar. Las contraseñas NO van en el repo. */
export const DEMO_ACCOUNTS = [
  { key: 'plataforma', email: `plataforma@${DEMO_EMAIL_DOMAIN}`, name: 'Equipo Armá Partido', label: 'Dueño de la plataforma', category: 4, gender: 'masculino' as Gender },
  { key: 'dueno', email: `dueno@${DEMO_EMAIL_DOMAIN}`, name: 'Sofía Rodríguez', label: 'Dueña del club', category: 3, gender: 'femenino' as Gender },
  { key: 'mostrador', email: `mostrador@${DEMO_EMAIL_DOMAIN}`, name: 'Diego Fernández', label: 'Encargado de mostrador', category: 6, gender: 'masculino' as Gender },
  { key: 'cantina', email: `cantina@${DEMO_EMAIL_DOMAIN}`, name: 'Romina Ferreira', label: 'Encargada de cantina', category: 7, gender: 'femenino' as Gender },
  { key: 'jugador', email: `jugador@${DEMO_EMAIL_DOMAIN}`, name: 'Martín Silva', label: 'Jugador (5ta)', category: 5, gender: 'masculino' as Gender },
  { key: 'jugadora', email: `jugadora@${DEMO_EMAIL_DOMAIN}`, name: 'Lucía Pérez', label: 'Jugadora (4ta)', category: 4, gender: 'femenino' as Gender },
] as const;

export type DemoAccountKey = (typeof DEMO_ACCOUNTS)[number]['key'];
export type DemoUids = Record<DemoAccountKey, string>;

/** Jugadores del club sin cuenta para entrar (solo datos), de 1ra a 7ma. */
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
  { id: 'demo-p16', name: 'Pablo Rodríguez', category: 7, gender: 'masculino' },
  { id: 'demo-p17', name: 'Andrea Ferreira', category: 7, gender: 'femenino' },
  // Sumados el 17/11/2026 para que siempre haya 4 de categoría pareja (±1) en cada cancha. Sin foto: van con iniciales.
  { id: 'demo-p18', name: 'Martina Rivero', category: 1, gender: 'femenino' },
  { id: 'demo-p19', name: 'Sebastián Larrañaga', category: 1, gender: 'masculino' },
  { id: 'demo-p20', name: 'Lucas Bentancur', category: 1, gender: 'masculino' },
  { id: 'demo-p21', name: 'Emiliano Correa', category: 2, gender: 'masculino' },
  { id: 'demo-p22', name: 'Micaela Rocha', category: 2, gender: 'femenino' },
  { id: 'demo-p23', name: 'Bruno Da Silva', category: 3, gender: 'masculino' },
  { id: 'demo-p24', name: 'Jimena Ortiz', category: 3, gender: 'femenino' },
  { id: 'demo-p25', name: 'Tomás Arias', category: 4, gender: 'masculino' },
  { id: 'demo-p26', name: 'Leandro Sanguinetti', category: 5, gender: 'masculino' },
  { id: 'demo-p27', name: 'Victoria Pintos', category: 5, gender: 'femenino' },
  { id: 'demo-p28', name: 'Franco Morales', category: 5, gender: 'masculino' },
  { id: 'demo-p29', name: 'Natalia Burgos', category: 5, gender: 'femenino' },
  { id: 'demo-p30', name: 'Maximiliano Godoy', category: 6, gender: 'masculino' },
  { id: 'demo-p31', name: 'Cecilia Barreto', category: 6, gender: 'femenino' },
  { id: 'demo-p32', name: 'Hernán Silveira', category: 6, gender: 'masculino' },
  { id: 'demo-p33', name: 'Daniela Cardozo', category: 6, gender: 'femenino' },
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
  'gameResults',
  'categorySuggestions',
  'guestPasses',
  'waitlist',
  'products',
  'consumptions',
  'cashDays',
  'fixedBookings',
  'recoveries',
  'monthlyReports',
  'migrations',
  'fillSearches',
  'fillInvites',
  'autoFillRuns',
  'clients',
  'packTypes',
  'clientPacks',
  'sales',
  'exportLogs',
];

const SLOT = 90;
// Turnos de 90 min desde las 8:00: 8:00, 9:30, 11:00, 12:30, 14:00, 15:30, 17:00, 18:30, 20:00, 21:30
const T = (h: number, m = 0) => h * 60 + m;

/** Minuto actual en la hora de la compu que carga la demo (la misma que usa el Mostrador). */
const formatHM = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
const localMinute = () => new Date().getHours() * 60 + new Date().getMinutes();

export function buildDemoWorld(uids: DemoUids, today = getTodayISO(), nowMinute = localMinute()): DemoDoc[] {
  const docs: DemoDoc[] = [];
  const day = (n: number) => addDaysISO(today, n);
  const put = (path: string, data: object) => docs.push({ path, data: { ...data } as Record<string, unknown> });
  const C = DEMO_CLUB_ID;
  const base = `clubs/${C}`;

  const club: Club = {
    id: C,
    name: 'Los Jacarandás Pádel',
    sponsor: { name: 'Parrilla El Saque', tagline: 'Mostrá la app y la primera ronda después del partido va 2x1.', imageUrl: '/img/demo/auspiciantes/el-saque.webp' },
    // Auspiciantes ficticios de la demo (fotos hechas por Ber en Flow, 15/11/2026). Rotan en Inicio.
    sponsors: [
      { name: 'Parrilla El Saque', tagline: 'Mostrá la app y la primera ronda después del partido va 2x1.', imageUrl: '/img/demo/auspiciantes/el-saque.webp' },
      { name: 'Tienda Punto de Oro', tagline: 'Paletas y ropa de pádel. 10% para socios del club.', imageUrl: '/img/demo/auspiciantes/punto-de-oro.webp' },
      { name: 'Kinesiología La Volea', tagline: 'Primera consulta sin cargo para jugadores del club.', imageUrl: '/img/demo/auspiciantes/la-volea.webp' },
      { name: 'Heladería Bandeja', tagline: 'Licuado de frutas a mitad de precio después del partido.', imageUrl: '/img/demo/auspiciantes/bandeja.webp' },
    ],
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
    closeHour: 24,
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
    // Modo invitados (etapa 6b): recibe invitados con recargo de $50.
    guests: { enabled: true, surcharge: 50, shareMyPlayers: true },
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
    cantina: 'cantina',
    jugador: 'player',
    jugadora: 'player',
  };
  const avail = (days: number[], from: number, to: number): AvailabilityWindow[] =>
    days.map((d) => ({ dayOfWeek: d, startMinute: from, endMinute: to }));
  // Fotos de perfil ficticias (hechas por Ber en Flow, 15/11/2026), fijas en public/img/demo/perfiles.
  // Solo demo-p01 a demo-p17 tienen foto; los sumados el 17/11 van con iniciales.
  const PHOTO_KEYS = new Set(['jugador', 'jugadora', 'dueno', 'mostrador', ...EXTRA_PLAYERS.slice(0, 17).map((p) => p.id)]);
  const photoOf = (key: string) => (PHOTO_KEYS.has(key) ? `/img/demo/perfiles/${key}.webp` : '');
  const people: { uid: string; name: string; category: number; gender: Gender; role: ClubRole; modality: Modality; photo: string }[] = [
    // Una cuenta nueva (como cantina) puede no tener uid hasta que se corra el seed: se saltea.
    ...DEMO_ACCOUNTS.filter((a) => !!uids[a.key]).map((a) => ({
      photo: photoOf(a.key),
      uid: uids[a.key],
      name: a.name,
      category: a.category,
      gender: a.gender,
      role: roleOf[a.key],
      modality: 'mixto' as Modality,
    })),
    ...EXTRA_PLAYERS.map((p) => ({ photo: photoOf(p.id), uid: p.id, name: p.name, category: p.category, gender: p.gender, role: 'player' as ClubRole, modality: 'mixto' as Modality })),
  ];
  const nameOf = (uid: string) => people.find((p) => p.uid === uid)?.name ?? 'Jugador';
  const catOf = (uid: string) => people.find((p) => p.uid === uid)?.category ?? 5;
  const genOf = (uid: string) => people.find((p) => p.uid === uid)?.gender ?? 'masculino';

  people.forEach((p, i) => {
    // Noches (como antes) más una franja de día, para que "Llenar con la app" tenga a quién avisar a cualquier hora de la demo.
    const ALL = [0, 1, 2, 3, 4, 5, 6];
    const weekly = [
      ...(i % 2 === 0 ? avail([2, 4], T(19), T(23)) : avail([1, 3, 6], T(18), T(22))),
      ...avail(ALL, T(8), T(18)),
    ];
    const profile: UserProfile = {
      uid: p.uid,
      displayName: p.name,
      photoUrl: p.photo,
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
      ...(p.photo ? { photoUrl: p.photo } : {}),
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

  // Parejas (Ber, 17/11/2026): toda cancha con 4 jugadores de categoría pareja (±1) y nadie en dos canchas a la vez.
  // Los que se suman al azar son los jugadores sin cuenta; Martín, Lucía y el personal van solo donde se los pone a mano.
  const grouper = makeGrouper(EXTRA_PLAYERS.map((p) => ({ uid: p.id, category: p.category })), catOf, `parejas-${today}`);
  const four = (date: string, start: number, include: string[] = [], cats?: number[]) => grouper.group({ date, start, end: start + SLOT, include, cats });
  /** Reserva del mostrador a nombre de alguien sin cuenta: el titular va como '' y se suman 3 de su categoría. */
  const withHolder = (date: string, start: number, holderCat: number) => ['', ...four(date, start, [], [holderCat])];

  // Hoy: armado alrededor de la hora actual (demoHoy.ts), para que el Mostrador se vea vivo.
  const todayPlan = planToday({ n: nowMinute, open: club.openHour * 60, close: club.closeHour * 60, courtIds: courts.map((c) => c.id), today });
  const slotOf = (role: TodaySlot['role']) => todayPlan.find((s) => s.role === role);
  const matchSlot = slotOf('match')!;
  const anaSlot = slotOf('ana');
  // Partido armado en juego ahora (cuenta de cantina en demoCantina.ts): Martín (5ta) con 4ta y 5ta.
  const todayMatchUids = [uids.jugador, 'demo-p07', 'demo-p09', 'demo-p10'];
  grouper.reserve(todayMatchUids, today, matchSlot.start, matchSlot.start + SLOT);

  // Semifinales de la Copa Primavera hoy: a las 20:00 si se puede; si no, el primer turno en que la cancha
  // está libre y Martín no está jugando. Lo que dicen Inicio, Torneos y el Mostrador sale de acá.
  const critical = new Set<TodaySlot['role']>(['match', 'due4', 'paid4', 'fu', 'live4', 'endedDue', 'ana']);
  const overlaps = (a: number, b: number) => a < b + SLOT && b < a + SLOT;
  const closeM = club.closeHour * 60;
  const semiFits = (courtId: string, start: number) =>
    [start, start + SLOT].every((st) => !todayPlan.some((p) => p.courtId === courtId && critical.has(p.role) && overlaps(p.start, st))) &&
    [start, start + SLOT].every((st) => !overlaps(st, matchSlot.start));
  const semiStarts: number[] = [];
  for (let t = T(20); t + 2 * SLOT <= closeM; t += 30) semiStarts.push(t);
  for (let t = T(20) - 30; t >= club.openHour * 60; t -= 30) semiStarts.push(t);
  let semi = { courtId: 'cancha_3', start: T(20) };
  search: for (const st of semiStarts)
    for (const c of ['cancha_3', 'cancha_2', 'cancha_1', 'cancha_4'])
      if (semiFits(c, st)) {
        semi = { courtId: c, start: st };
        break search;
      }
  for (let i = todayPlan.length - 1; i >= 0; i--) {
    const p = todayPlan[i];
    if (p.courtId === semi.courtId && !critical.has(p.role) && (overlaps(p.start, semi.start) || overlaps(p.start, semi.start + SLOT))) todayPlan.splice(i, 1);
  }

  // Pasadas (últimos 6 días), ya cobradas en el club
  const pastPlan: [number, number, string, string][] = [
    [-6, T(18, 30), 'cancha_1', 'demo-p05'],
    [-6, T(20), 'cancha_2', 'demo-p09'],
    [-5, T(20), 'cancha_1', uids.jugador],
    [-4, T(17), 'cancha_3', 'demo-p12'],
    [-3, T(21, 30), 'cancha_2', 'demo-p02'],
    [-2, T(18, 30), 'cancha_4', 'demo-p14'],
    [-1, T(20), 'cancha_4', uids.jugadora],
    [-1, T(21, 30), 'cancha_3', 'demo-p07'],
  ];
  // Copa Primavera (categorías 5ta y 6ta): 8 parejas, todas entre 5ta y 6ta para que cualquier cruce sea parejo.
  const COPA: [string, string, string, number][] = [
    ['pr1', uids.jugador, 'demo-p09', 5],
    ['pr2', 'demo-p08', 'demo-p10', 5],
    ['pr3', 'demo-p11', 'demo-p12', 6],
    ['pr4', 'demo-p26', 'demo-p27', 5],
    ['pr5', 'demo-p28', 'demo-p29', 5],
    ['pr6', 'demo-p13', 'demo-p30', 6],
    ['pr7', uids.mostrador, 'demo-p31', 6],
    ['pr8', 'demo-p32', 'demo-p33', 6],
  ];
  const copaUids = (id: string) => COPA.filter(([pid]) => pid === id).flatMap(([, a, b]) => [a, b]);
  // [ronda, pareja 1, pareja 2, día, hora, cancha, resultado, ganadora]
  const COPA_MATCHES: [string, string, string, number, number, string, string, string][] = [
    ['Cuartos', 'pr1', 'pr8', -1, T(18, 30), 'cancha_1', '6-4 6-3', 'pr1'],
    ['Cuartos', 'pr2', 'pr7', -1, T(18, 30), 'cancha_2', '7-5 3-6 6-4', 'pr2'],
    ['Cuartos', 'pr3', 'pr6', -1, T(20), 'cancha_1', '6-2 6-2', 'pr3'],
    ['Cuartos', 'pr4', 'pr5', -1, T(20), 'cancha_2', '4-6 6-3 7-6', 'pr5'],
  ];
  // Semifinales de hoy: si ya se jugaron (demo cargada tarde), con resultado.
  const semiDone = (k: number) => semi.start + (k + 1) * SLOT <= nowMinute;
  COPA_MATCHES.push(
    ['Semifinal', 'pr1', 'pr2', 0, semi.start, semi.courtId, semiDone(0) ? '6-3 4-6 6-4' : '', semiDone(0) ? 'pr1' : ''],
    ['Semifinal', 'pr3', 'pr5', 0, semi.start + SLOT, semi.courtId, semiDone(1) ? '7-6 6-4' : '', semiDone(1) ? 'pr3' : '']
  );
  const finalPairs = semiDone(1) ? ['pr1', 'pr3'] : ['', ''];
  COPA_MATCHES.push(['Final', finalPairs[0], finalPairs[1], 1, T(20), 'cancha_2', '', '']);
  // Los partidos del torneo ocupan la cancha en el Mostrador (antes no figuraban y la cancha parecía de otra reserva).
  COPA_MATCHES.forEach(([round, a, b, d, start, courtId]) => {
    const players = [...copaUids(a), ...copaUids(b)];
    grouper.reserve(players, day(d), start, start + SLOT);
    addBooking({ date: day(d), startMinute: start, courtId, createdByUid: uids.dueno, type: 'tournament', playerUids: players, guestName: `Torneo: ${round}`, totalPrice: 0 });
  });

  // Partidos armados de los próximos días (curados a mano, todos dentro de ±1).
  const pm1Uids = [uids.jugador, 'demo-p09', 'demo-p08', 'demo-p12']; // 5ta, 5ta, 5ta, 6ta
  grouper.reserve(pm1Uids, day(2), T(20), T(21, 30));
  const pm2Uids = [uids.jugadora, 'demo-p06', 'demo-p07', 'demo-p05']; // 4ta, 4ta, 4ta, 3ra
  grouper.reserve(pm2Uids, day(3), T(20), T(21, 30));

  // Pasadas (últimos 6 días), ya cobradas en el club
  pastPlan.forEach(([d, start, courtId, uid]) => {
    const b = addBooking({ date: day(d), startMinute: start, courtId, createdByUid: uid, playerUids: four(day(d), start, [uid]) });
    b.paidAmount = b.totalPrice;
    b.paymentStatus = 'paid';
  });

  const rnd = seeded(`reservas-${today}`);
  for (const s of todayPlan) {
    if (s.role === 'match' || s.role === 'ana' || s.role === 'fu') continue; // los arman demoCantina, demoClientes y el bloque de abajo
    const at = { date: today, startMinute: s.start, courtId: s.courtId };
    const ps = four(today, s.start);
    const paid = (method: Booking['paymentMethod'] = 'club') => ({ paymentMethod: method, paidAmount: price(today, s.start), paymentStatus: 'paid' as const });
    if (s.role === 'due4' || s.role === 'endedDue') addBooking({ ...at, createdByUid: ps[0], playerUids: ps });
    else if (s.role === 'paid4') addBooking({ ...at, createdByUid: ps[0], playerUids: ps, ...paid('mercadopago') });
    else if (s.role === 'live4' || s.role === 'past') addBooking({ ...at, createdByUid: ps[0], playerUids: ps, ...paid(rnd() < 0.2 ? 'mercadopago' : 'club') });
    else if (s.role === 'future') addBooking({ ...at, createdByUid: ps[0], playerUids: ps, ...(rnd() < 0.3 ? paid('mercadopago') : {}) });
  }
  // Falta uno resuelto: a este partido se le bajó uno y la app consiguió el cuarto (Ber, 17/11: siempre 4 por cancha,
  // marcando al que se consiguió). El conseguido es el último de la lista y figura en filledUids de la búsqueda.
  const fuSlot = slotOf('fu');
  if (fuSlot) {
    const fuUids = four(today, fuSlot.start);
    const got = fuUids[3];
    const fuBooking = addBooking({ date: today, startMinute: fuSlot.start, courtId: fuSlot.courtId, createdByUid: fuUids[0], type: 'matched', playerUids: fuUids });
    const fuPrice = fuBooking.totalPrice / 4;
    const cats = fuUids.map(catOf);
    put(`${base}/proposedMatches/demo_pm_fu`, {
      id: 'demo_pm_fu',
      clubId: C,
      bookingId: fuBooking.id,
      courtId: fuSlot.courtId,
      courtName: court(fuSlot.courtId).name,
      date: today,
      startMinute: fuSlot.start,
      endMinute: fuSlot.start + SLOT,
      modality: 'mixto',
      minCategory: Math.min(...cats),
      maxCategory: Math.max(...cats),
      pricePerPlayer: fuPrice,
      playerUids: fuUids,
      slots: fuUids.map((u) => ({ uid: u, displayName: nameOf(u), category: catOf(u), gender: genOf(u), status: 'accepted', paid: false, requestId: u === got ? '' : `demo_req_fu_${u}` })),
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
      status: 'confirmed',
      createdByUid: fuUids[0],
    });
    const ago = (min: number) => new Date(Date.now() - min * 60 * 1000).toISOString();
    const lo = Math.min(...cats);
    const invited = EXTRA_PLAYERS.filter((p) => p.category >= lo && p.category <= lo + 1 && !fuUids.includes(p.id)).slice(0, 4).map((p) => p.id);
    put(`${base}/fillSearches/demo_fill_hoy`, {
      id: 'demo_fill_hoy',
      clubId: C,
      kind: 'player_dropped',
      matchId: 'demo_pm_fu',
      bookingId: fuBooking.id,
      courtId: fuSlot.courtId,
      courtName: court(fuSlot.courtId).name,
      date: today,
      startMinute: fuSlot.start,
      endMinute: fuSlot.start + SLOT,
      modality: 'mixto',
      genderNeeded: '',
      seatsNeeded: 1,
      seatsFilled: 1,
      filledUids: [got],
      excludedUids: [],
      invitedUids: [got, ...invited],
      lateDropUid: '',
      wave: 1,
      nextWaveAt: ago(10),
      closesAt: ago(10),
      status: 'filled',
      choice: '',
      extended: false,
      pricePerPlayer: fuPrice,
      openedAt: ago(40),
    });
  }

  // Próximos días: todas con 4 jugadores parejos
  const martinBooking = addBooking({ date: day(1), startMinute: T(18, 30), courtId: 'cancha_2', createdByUid: uids.jugador, playerUids: four(day(1), T(18, 30), [uids.jugador]) });
  addBooking({ date: day(1), startMinute: T(20), courtId: 'cancha_1', createdByUid: 'demo-p06', playerUids: four(day(1), T(20), ['demo-p06']), paymentMethod: 'mercadopago', paidAmount: price(day(1), T(20)), paymentStatus: 'paid' });
  addBooking({ date: day(1), startMinute: T(21, 30), courtId: 'cancha_4', createdByUid: uids.mostrador, type: 'counter', guestName: 'Grupo de la oficina', playerUids: withHolder(day(1), T(21, 30), 7) });
  addBooking({ date: day(2), startMinute: T(20), courtId: 'cancha_3', createdByUid: 'demo-p11', status: 'held', holdExpiresAt: new Date(Date.now() + 2 * 3600 * 1000).toISOString(), playerUids: four(day(2), T(20), ['demo-p11']) });
  addBooking({ date: day(3), startMinute: T(9, 30), courtId: 'cancha_1', createdByUid: 'demo-p16', playerUids: four(day(3), T(9, 30), ['demo-p16']) });
  addBooking({ date: day(4), startMinute: T(18, 30), courtId: 'cancha_2', createdByUid: uids.jugadora, playerUids: four(day(4), T(18, 30), [uids.jugadora]) });

  // Partido armado confirmado (Martín + 3 de 5ta y 6ta) pasado mañana. Gonzalo entró por Falta uno.
  const matchDate = day(2);
  const matchBooking = addBooking({
    date: matchDate,
    startMinute: T(20),
    courtId: 'cancha_1',
    createdByUid: uids.jugador,
    type: 'matched',
    playerUids: pm1Uids,
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
    minCategory: 5,
    maxCategory: 6,
    pricePerPlayer: matchBooking.totalPrice / 4,
    playerUids: matchBooking.playerUids,
    slots: matchBooking.playerUids.map((u) => ({ ...slot(u, 'accepted', u === 'demo-p09'), ...(u === 'demo-p12' ? { requestId: '' } : {}) })),
    expiresAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
    status: 'confirmed',
    createdByUid: uids.jugador,
  };
  put(`${base}/proposedMatches/${confirmed.id}`, confirmed);
  put(`${base}/fillSearches/demo_fill_pm001`, {
    id: 'demo_fill_pm001',
    clubId: C,
    kind: 'player_dropped',
    matchId: confirmed.id,
    bookingId: matchBooking.id,
    courtId: 'cancha_1',
    courtName: 'Cancha 1',
    date: matchDate,
    startMinute: T(20),
    endMinute: T(21, 30),
    modality: 'mixto',
    genderNeeded: '',
    seatsNeeded: 1,
    seatsFilled: 1,
    filledUids: ['demo-p12'],
    excludedUids: [],
    invitedUids: ['demo-p12', 'demo-p13', 'demo-p26', 'demo-p30'],
    lateDropUid: '',
    wave: 1,
    nextWaveAt: new Date(Date.now() - 20 * 3600 * 1000).toISOString(),
    closesAt: new Date(Date.now() - 20 * 3600 * 1000).toISOString(),
    status: 'filled',
    choice: '',
    extended: false,
    pricePerPlayer: confirmed.pricePerPlayer,
    openedAt: new Date(Date.now() - 21 * 3600 * 1000).toISOString(),
  });

  // Partido propuesto esperando que acepten (Lucía + 3 de 3ra y 4ta), en 3 días
  const pendDate = day(3);
  const pendBooking = addBooking({
    date: pendDate,
    startMinute: T(20),
    courtId: 'cancha_2',
    createdByUid: uids.jugadora,
    type: 'matched',
    status: 'held',
    holdExpiresAt: new Date(Date.now() + 6 * 3600 * 1000).toISOString(),
    playerUids: pm2Uids,
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
  // Resultados (etapa 6a): el partido de Martín de hace 5 días va con equipos, para cargar el resultado desde Inicio.
  {
    const toLoad = bookings.find((b) => b.date === day(-5) && b.startMinute === T(20) && b.playerUids.includes(uids.jugador));
    if (toLoad && toLoad.playerUids.length === 4) {
      const others = toLoad.playerUids.filter((u) => u !== uids.jugador);
      toLoad.teamA = [uids.jugador, others[0]];
      toLoad.teamB = others.slice(1);
    }
  }
  // Modo invitados (etapa 6b): segundo club ficticio, invitación de invitado para Martín y un partido con invitado.
  addInvitadosDemo({
    put, day, jacarandasId: C, jacarandasName: club.name, bookings, addBooking, courtName: (id) => court(id).name, four, nameOf, catOf, genOf,
    martin: { uid: uids.jugador, name: nameOf(uids.jugador), category: catOf(uids.jugador), gender: genOf(uids.jugador) },
  });
  const martinUser = docs.find((d) => d.path === `users/${uids.jugador}`);
  if (martinUser) martinUser.data.alertPrefs = { weeklyInvites: 3, maxCategoryGap: 1, otherClubs: true };
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
    req('demo_req_001', 'demo-p10', 'demo-p08', nowMinute < T(21) ? day(0) : day(1), T(21, 30), 'priority'),
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
  const pairs: TournamentPair[] = COPA.map(([id, a, b, cat]) => (id === 'pr3' ? { ...pair(id, a, b, cat), paid: false } : pair(id, a, b, cat)));
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
    categories: [5, 6],
    maxPairs: 8,
    entryFee: 1200,
    format: 'knockout',
    status: 'in_progress',
    pairs,
    matches: COPA_MATCHES.map(([round, a, b, d, start, courtId, score, winner]) => tm(round, a, b, day(d), start, courtId, score, winner)),
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
        day: b.date < today || (b.date === today && b.startMinute <= nowMinute && b.paymentMethod !== 'mercadopago') ? b.date : day(-1),
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
    semiDone(0)
      ? notif('demo_n2', uids.jugador, 'tournament_next_match', 'Tu próximo partido del torneo', `Ganaron la semifinal: la final de la Copa Primavera es mañana a las 20:00 en la Cancha 2.`)
      : notif('demo_n2', uids.jugador, 'tournament_next_match', 'Tu próximo partido del torneo', `Semifinal de la Copa Primavera hoy a las ${formatHM(semi.start)} en la ${court(semi.courtId).name}.`),
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
  addCantinaDemo(docs, { base, clubId: C, today, uids, nameOf, catOf, genOf, price, ownerUid: uids.dueno, todayMatch: { courtId: matchSlot.courtId, start: matchSlot.start, players: todayMatchUids }, nowMinute, four });
  // Clientes, cuponeras, saldo a favor, venta suelta y facturas
  addClientesDemo(docs, { base, clubId: C, today, uids, nameOf, catOf, price, anaToday: anaSlot ? { courtId: anaSlot.courtId, start: anaSlot.start } : undefined, withHolder });
  addHistory(docs, { base, clubId: C, today, courts, club, four, staffUid: uids.mostrador, ownerUid: uids.dueno, price });
  // Resultados (etapa 6a, OK de Ber 17/11): un partido para confirmar, la historia de Martín con resultados
  // confirmados y dos sugerencias de categoría para el club. Va después de la historia para no cambiar el resto de la demo.
  {
    const J = uids.jugador;
    const endMs = (b: Booking) => new Date(`${b.date}T00:00:00`).getTime() + b.endMinute * 60000;
    const names = (us: string[]) => Object.fromEntries(us.map((u) => [u, nameOf(u)]));
    const allBookings = () => docs.filter((d) => d.path.startsWith(`${base}/bookings/`)).map((d) => d.data as unknown as Booking);
    let rb = 0;
    const addBooking = (b: Partial<Booking> & { date: string; startMinute: number; courtId: string; createdByUid: string }) => {
      const booking = {
        id: `demo_bk_res_${String(++rb).padStart(2, '0')}`, clubId: C, courtName: court(b.courtId).name, endMinute: b.startMinute + SLOT, type: 'direct',
        status: 'confirmed', playerUids: [b.createdByUid], guestName: '', totalPrice: price(b.date, b.startMinute), paidAmount: 0, paymentMethod: 'club',
        paymentStatus: 'pending', holdExpiresAt: '', ...b,
      } as Booking;
      return booking;
    };
    const putBooking = (b: Booking) => put(`${base}/bookings/${b.id}`, b);
    const busyCourt = (date: string, start: number, courtId: string) => allBookings().some((b) => b.date === date && b.courtId === courtId && b.startMinute < start + SLOT && b.endMinute > start);
    // Jugadores fijos que no usan las pruebas del armado (así la demo de las pruebas no cambia).
    const ps = [J, 'demo-p30', 'demo-p31', 'demo-p33'];
    const slotC = [-2, -3, -4]
      .flatMap((d) => [T(20), T(18, 30), T(21, 30), T(17), T(12, 30)].map((st) => ({ date: day(d), st })))
      .map((x) => ({ ...x, court: ['cancha_1', 'cancha_2', 'cancha_3', 'cancha_4'].find((c) => !busyCourt(x.date, x.st, c)) }))
      .find((x) => x.court && ps.every((u) => grouper.isFree(u, x.date, x.st, x.st + SLOT)));
    if (slotC) {
      const cDate = slotC.date;
      {
        grouper.reserve(ps, cDate, slotC.st, slotC.st + SLOT);
        const b = addBooking({ date: cDate, startMinute: slotC.st, courtId: slotC.court!, createdByUid: ps[1], playerUids: ps, type: 'matched', paidAmount: price(cDate, slotC.st), paymentStatus: 'paid' });
        const others = ps.filter((u) => u !== J);
        b.teamA = [J, others[0]];
        b.teamB = others.slice(1);
        putBooking(b);
        put(`${base}/gameResults/${b.id}`, {
          id: b.id, clubId: C, bookingId: b.id, date: b.date, startMinute: b.startMinute, courtName: b.courtName, teamA: b.teamA, teamB: b.teamB,
          names: names(ps), playerUids: ps, winner: 'B', score: '6-4 3-6 7-5', reportedBy: b.teamB[0], status: 'pending',
          expiresAt: new Date(endMs(b) + 48 * 3600e3 < Date.now() + 3600e3 ? Date.now() + 30 * 3600e3 : endMs(b) + 48 * 3600e3).toISOString(),
        });
      }
    }
    // Historia: los partidos de 4 de Martín de antes de esta semana, con resultado confirmado.
    const SCORES = ['6-3 6-4', '4-6 6-2 6-4', '6-2 6-1', '7-6 6-4', '3-6 6-3 7-5', '6-4 6-4'];
    const histDays = [-8, -10, -14, -17, -21, -24, -29, -31];
    histDays
      .map((d, i) => {
        const date = day(d);
        const ps = i % 2 ? [J, 'demo-p31', 'demo-p32', 'demo-p33'] : [J, 'demo-p30', 'demo-p32', 'demo-p31'];
        const free = (st: number) => ['cancha_2', 'cancha_3', 'cancha_1', 'cancha_4'].some((c) => !busyCourt(date, st, c)) && ps.every((u) => grouper.isFree(u, date, st, st + SLOT));
        const start = [T(20), T(18, 30), T(21, 30), T(17), T(12, 30), T(11), T(9, 30), T(8)].find(free);
        if (start === undefined) return null;
        const court = ['cancha_2', 'cancha_3', 'cancha_1', 'cancha_4'].find((c) => !busyCourt(date, start, c));
        if (!court) return null;
        grouper.reserve(ps, date, start, start + SLOT);
        const hb = addBooking({ date, startMinute: start, courtId: court, createdByUid: J, playerUids: ps, paidAmount: price(date, start), paymentStatus: 'paid' });
        putBooking(hb);
        return hb;
      })
      .filter((b): b is Booking => !!b)
      .forEach((b, i) => {
        const others = b.playerUids.filter((u) => u !== J);
        const teamA = [J, others[0]];
        const teamB = others.slice(1);
        put(`${base}/gameResults/${b.id}`, {
          id: b.id, clubId: C, bookingId: b.id, date: b.date, startMinute: b.startMinute, courtName: b.courtName, teamA, teamB,
          names: names(b.playerUids), playerUids: b.playerUids, winner: i % 3 === 2 ? 'B' : 'A', score: SCORES[i % SCORES.length],
          reportedBy: J, status: 'confirmed', confirmedBy: teamB[0], expiresAt: new Date(endMs(b) + 48 * 3600e3).toISOString(),
        });
      });
    put(`${base}/categorySuggestions/demo-p13`, {
      id: 'demo-p13', clubId: C, uid: 'demo-p13', displayName: nameOf('demo-p13'), from: 6, to: 5, status: 'pending', resultsAtDecision: 0,
      reason: 'Ganó 8 de sus últimos 10 partidos, 4 contra parejas de 6ta.',
    });
    put(`${base}/categorySuggestions/demo-p32`, {
      id: 'demo-p32', clubId: C, uid: 'demo-p32', displayName: nameOf('demo-p32'), from: 6, to: 7, status: 'pending', resultsAtDecision: 0,
      reason: 'Perdió 8 de sus últimos 10 partidos, 6 contra parejas de 6ta o de abajo.',
    });
  }
  // La caja de hoy ya abierta desde la mañana (si el club ya abrió).
  if (nowMinute >= club.openHour * 60) {
    const cd: CashDay = { id: today, clubId: C, date: today, openingFloat: 2000, openedByUid: uids.mostrador, openedByName: 'Diego Fernández', status: 'open' };
    put(`${base}/cashDays/${today}`, cd);
    // Ventas de cantina de hoy (las hizo la encargada de cantina): una cada hora y media desde que abrió.
    const seller = uids.cantina ? { uid: uids.cantina, name: 'Romina Ferreira' } : { uid: uids.mostrador, name: 'Diego Fernández' };
    const SALES: [string, number, PaymentRecord['method']][] = [
      ['Agua 500 ml', 90, 'efectivo'],
      ['Bebida isotónica', 120, 'debito_club'],
      ['Cerveza lata ×2', 360, 'efectivo'],
      ['Tubo de pelotas', 450, 'debito_club'],
      ['Café ×2', 160, 'efectivo'],
      ['Agua 500 ml ×4', 360, 'mercadopago'],
      ['Grip', 250, 'efectivo'],
      ['Cerveza lata', 180, 'transferencia'],
      ['Bebida isotónica ×2', 240, 'efectivo'],
      ['Agua 500 ml', 90, 'efectivo'],
    ];
    const n = Math.min(SALES.length, Math.max(0, Math.floor((nowMinute - club.openHour * 60) / 90)));
    SALES.slice(0, n).forEach(([what, amount, method], i) => {
      const id = `demo_pay_cant_hoy_${i + 1}`;
      const rental = false;
      put(`${base}/payments/${id}`, {
        id, clubId: C, uid: seller.uid, clubOwnerUid: uids.dueno, payerName: `Venta rápida · ${what}`, referenceId: '', amount, method,
        kind: rental ? 'venta' : 'cantina', rubro: rental ? 'alquiler' : 'cantina', status: 'completed', day: today, staffName: seller.name,
      });
    });
  }
  // Equipos sugeridos (etapa 3, OK de Ber 17/11) en los partidos de 4 y en sus reservas.
  const teamsByBooking = new Map<string, { teamA: string[]; teamB: string[] }>();
  for (const d of docs) {
    if (!d.path.includes('/proposedMatches/')) continue;
    const slots = d.data.slots as ProposedSlot[] | undefined;
    const t = slots && !d.data.teamA ? teamsForSlots(slots) : null;
    if (t) { Object.assign(d.data, t); if (d.data.bookingId) teamsByBooking.set(String(d.data.bookingId), t); }
  }
  for (const d of docs) {
    const id = d.path.split('/bookings/')[1];
    if (id && teamsByBooking.has(id)) Object.assign(d.data, teamsByBooking.get(id));
  }
  return docs;
}
