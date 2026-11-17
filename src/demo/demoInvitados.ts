/**
 * Modo invitados en la demo (etapa 6b, Ber 17/11/2026: "Sí, con 2do club en la demo").
 * Un segundo club ficticio, Club del Parque, con 5 jugadores de 5ta que aceptan avisos de otros clubes.
 *  - Club del Parque busca reemplazo mañana a las 20:00 y Martín tiene la invitación como invitado (la ve en Inicio).
 *  - Los Jacarandás recibe invitados con recargo de $50; Martín ya invitó a una amiga del Parque (pase de invitado)
 *    y tiene otro amigo del Parque sin invitar (botón "Invitar a ..." en Amigos).
 *  - En Los Jacarandás hay un partido con un invitado del Parque (chip "Invitado" en Armar partido y en el Mostrador).
 * Todo es ficticio y con ids fijos, así el reinicio lo pisa y borra lo que sobra.
 */
import type { Booking, Club, ClubMembership, Court, FillInvite, Gender, GuestInfo, GuestPass, ProposedMatch, UserProfile } from '../types/padel';

export const DEMO_CLUB_2_ID = 'club_del_parque';

export const PARQUE_PLAYERS: { id: string; name: string; category: number; gender: Gender }[] = [
  { id: 'demo-q01', name: 'Bruno Cabrera', category: 5, gender: 'masculino' },
  { id: 'demo-q02', name: 'Agustina Rocha', category: 5, gender: 'femenino' },
  { id: 'demo-q03', name: 'Matías Sosa', category: 5, gender: 'masculino' },
  { id: 'demo-q04', name: 'Lorena Díaz', category: 5, gender: 'femenino' },
  { id: 'demo-q05', name: 'Pablo Núñez', category: 5, gender: 'masculino' },
];

const SLOT = 90;
const T = (h: number, m = 0) => h * 60 + m;

interface Ctx {
  put: (path: string, data: object) => void;
  day: (n: number) => string;
  jacarandasId: string;
  jacarandasName: string;
  martin: { uid: string; name: string; category: number; gender: Gender };
  bookings: Booking[];
  addBooking: (b: Partial<Booking> & { date: string; startMinute: number; courtId: string; createdByUid: string }) => Booking;
  courtName: (id: string) => string;
  four: (date: string, start: number, include?: string[], cats?: number[]) => string[];
  nameOf: (uid: string) => string;
  catOf: (uid: string) => number;
  genOf: (uid: string) => Gender;
}

export function addInvitadosDemo(ctx: Ctx) {
  const { put, day, martin } = ctx;
  const P = DEMO_CLUB_2_ID;
  const base = `clubs/${P}`;
  const parque: Club = {
    id: P,
    name: 'Club del Parque',
    slug: 'club-del-parque',
    primaryColor: '#1d4ed8',
    accentColor: '#172123',
    address: 'Av. Rivera 3900, Parque Batlle',
    neighborhood: 'Parque Batlle',
    city: 'Montevideo',
    lat: -34.897,
    lng: -56.151,
    ownerUid: 'demo-parque-dueno',
    slotDurationMinutes: SLOT,
    openHour: 8,
    closeHour: 24,
    basePrice: 1600,
    nightFromHour: 19,
    nightPrice: 2200,
    weekendPrice: 2000,
    cancellationHours: 6,
    maxNoShowsBeforeBlock: 3,
    mpEnabled: false,
    subscriptionStatus: 'trial',
    trialEndsAt: day(30),
    monthlyPricePerCourt: 0,
    courtCount: 3,
    active: true,
    guests: { enabled: true, surcharge: 50, shareMyPlayers: true },
  } as Club;
  put(base, parque);
  const courts: Court[] = [1, 2, 3].map((n) => ({ id: `cancha_${n}`, clubId: P, name: `Cancha ${n}`, roof: n === 3 ? 'aire_libre' : 'techada', surface: 'cristal', hasLights: true, active: true }) as Court);
  courts.forEach((c) => put(`${base}/courts/${c.id}`, c));

  const weekly = [0, 1, 2, 3, 4, 5, 6].map((d) => ({ dayOfWeek: d, startMinute: T(8), endMinute: T(23) }));
  for (const p of PARQUE_PLAYERS) {
    const profile: UserProfile & { alertPrefs: object } = {
      uid: p.id,
      displayName: p.name,
      photoUrl: '',
      category: p.category,
      gender: p.gender,
      preferredModality: 'mixto',
      weeklyAvailability: weekly,
      activeClubIds: [P],
      alertPrefs: { weeklyInvites: 3, maxCategoryGap: 1, otherClubs: true },
    };
    put(`users/${p.id}`, profile);
    const m: ClubMembership = {
      uid: p.id, clubId: P, displayName: p.name, role: 'player', category: p.category, gender: p.gender,
      preferredModality: 'mixto', weeklyAvailability: weekly, noShowCount: 0, blocked: false, isDiscoverable: true,
    };
    put(`${base}/memberships/${p.id}`, m);
  }

  // 1) Club del Parque: mañana 20:00 se bajó uno; nadie del Parque pudo y la invitación le llegó a Martín como invitado.
  const date = day(1);
  const start = T(20);
  const ppl = PARQUE_PLAYERS.slice(0, 3);
  const share = parque.nightPrice / 4;
  const bookingId = 'demo_bk_parque_01';
  put(`${base}/bookings/${bookingId}`, {
    id: bookingId, clubId: P, courtId: 'cancha_2', courtName: 'Cancha 2', date, startMinute: start, endMinute: start + SLOT,
    type: 'matched', status: 'confirmed', createdByUid: ppl[0].id, playerUids: ppl.map((p) => p.id), guestName: '',
    totalPrice: parque.nightPrice, paidAmount: 0, paymentMethod: 'club', paymentStatus: 'pending', holdExpiresAt: '',
  });
  const match: ProposedMatch = {
    id: 'demo_pm_parque_01', clubId: P, bookingId, courtId: 'cancha_2', courtName: 'Cancha 2', date, startMinute: start, endMinute: start + SLOT,
    modality: 'mixto', minCategory: 5, maxCategory: 5, pricePerPlayer: share, playerUids: ppl.map((p) => p.id),
    slots: ppl.map((p) => ({ uid: p.id, displayName: p.name, category: p.category, gender: p.gender, status: 'accepted', paid: false, requestId: '' })),
    expiresAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString(), status: 'confirmed', createdByUid: ppl[0].id,
  };
  put(`${base}/proposedMatches/${match.id}`, match);
  const ago = (min: number) => new Date(Date.now() - min * 60000).toISOString();
  const closes = new Date(`${date}T${String(Math.floor((start - 120) / 60)).padStart(2, '0')}:00:00-03:00`).toISOString();
  const searchId = 'demo_fill_parque_01';
  put(`${base}/fillSearches/${searchId}`, {
    id: searchId, clubId: P, kind: 'player_dropped', matchId: match.id, bookingId, courtId: 'cancha_2', courtName: 'Cancha 2',
    date, startMinute: start, endMinute: start + SLOT, modality: 'mixto', genderNeeded: '', seatsNeeded: 1, seatsFilled: 0,
    filledUids: [], excludedUids: [], invitedUids: ['demo-q04', 'demo-q05', martin.uid], lateDropUid: '', wave: 2,
    nextWaveAt: new Date(Date.now() + 20 * 60000).toISOString(), closesAt: closes, status: 'searching', choice: '', extended: false,
    pricePerPlayer: share, openedAt: ago(45), guestsInvited: true,
  });
  const guest: GuestInfo = { displayName: martin.name, category: martin.category, gender: martin.gender, homeClubId: ctx.jacarandasId, kind: 'otro_club', surcharge: 50 };
  const invite: FillInvite = {
    id: `${searchId}_${martin.uid}`, clubId: P, searchId, uid: martin.uid, wave: 2, date, startMinute: start, endMinute: start + SLOT,
    courtName: 'Cancha 2', pricePerPlayer: share + 50, status: 'sent', countsForCap: true, sentAt: ago(15), via: 'aviso', guest,
  };
  put(`${base}/fillInvites/${invite.id}`, invite);

  // 2) Amigos de Martín en el Parque: Lorena ya invitada a Los Jacarandás, Bruno sin invitar.
  for (const p of [PARQUE_PLAYERS[0], PARQUE_PLAYERS[3]]) {
    put(`users/${martin.uid}/friends/${p.id}`, {
      uid: p.id, ownerUid: martin.uid, displayName: p.name, category: p.category, gender: p.gender,
      preferredModality: 'mixto', primaryClubId: P, primaryClubName: parque.name,
    });
  }
  const lorena = PARQUE_PLAYERS[3];
  const pass: GuestPass = {
    uid: lorena.id, clubId: ctx.jacarandasId, displayName: lorena.name, category: lorena.category, gender: lorena.gender,
    invitedBy: martin.uid, invitedByName: martin.name,
  };
  put(`clubs/${ctx.jacarandasId}/guestPasses/${lorena.id}`, pass);

  // 3) Los Jacarandás: dentro de 6 días a las 21:30, Martín juega con Pablo (del Parque) como invitado.
  const gDate = day(6);
  const gStart = T(21, 30);
  const taken = new Set(ctx.bookings.filter((b) => b.date === gDate && b.startMinute < gStart + SLOT && b.endMinute > gStart && b.status !== 'cancelled').map((b) => b.courtId));
  const courtId = ['cancha_3', 'cancha_4', 'cancha_2', 'cancha_1'].find((c) => !taken.has(c));
  if (!courtId) return;
  const pablo = PARQUE_PLAYERS[4];
  // `cats` reserva un lugar de esa categoría (el del invitado): devuelve los 3 del club.
  const locals = ctx.four(gDate, gStart, [martin.uid], [pablo.category]).filter(Boolean).slice(0, 3);
  if (locals.length < 3) return;
  const playerUids = [...locals, pablo.id];
  const gb = ctx.addBooking({ date: gDate, startMinute: gStart, courtId, createdByUid: locals[0], type: 'matched', playerUids });
  const gShare = gb.totalPrice / 4;
  const gm: ProposedMatch = {
    id: 'demo_pm_invitado', clubId: ctx.jacarandasId, bookingId: gb.id, courtId, courtName: ctx.courtName(courtId), date: gDate,
    startMinute: gStart, endMinute: gStart + SLOT, modality: 'mixto', minCategory: 5, maxCategory: 5, pricePerPlayer: gShare, playerUids,
    slots: [
      ...locals.map((u) => ({ uid: u, displayName: ctx.nameOf(u), category: ctx.catOf(u), gender: ctx.genOf(u), status: 'accepted' as const, paid: false, requestId: '' })),
      { uid: pablo.id, displayName: pablo.name, category: pablo.category, gender: pablo.gender, status: 'accepted', paid: false, requestId: '', guest: true, surcharge: 50 },
    ],
    expiresAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString(), status: 'confirmed', createdByUid: locals[0],
  };
  put(`clubs/${ctx.jacarandasId}/proposedMatches/${gm.id}`, gm);
}
