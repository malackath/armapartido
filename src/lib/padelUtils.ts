import type {
  AvailabilityWindow,
  Booking,
  Club,
  ClubMembership,
  Court,
  MatchRequest,
  Modality,
  PlayerMatchResult,
  ProposedMatch,
  ProposedSlot,
  Tournament,
  TournamentFormat,
  TournamentMatch,
  TournamentPair,
} from '../types/padel';

const CATEGORY_LABELS: Record<number, string> = {
  1: '1ra',
  2: '2da',
  3: '3ra',
  4: '4ta',
  5: '5ta',
  6: '6ta',
  7: '7ma',
};

/** Las categorías van de 1ra a 7ma (Ber, 16/11/2026: no existe 8va). */
export const MAX_CATEGORY = 7;
export const CATEGORIES = [1, 2, 3, 4, 5, 6, 7];

const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const DAY_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

export function formatCategory(cat: number): string {
  return CATEGORY_LABELS[cat] ?? `${cat}ta`;
}

export function formatMinutes(totalMinutes: number): string {
  const hrs = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

export function formatUYU(amount: number): string {
  return new Intl.NumberFormat('es-UY', {
    style: 'currency',
    currency: 'UYU',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function getTodayISO(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDaysISO(baseISO: string, days: number): string {
  const [y, m, d] = baseISO.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

export function getDayOfWeekFromISO(dateISO: string): number {
  const [y, m, d] = dateISO.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
}

const MONTH_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic'];

/** "Hoy", "Mañana" o "Sáb 14 nov" a partir de YYYY-MM-DD. */
export function formatDateFriendly(dateISO: string, relative = true): string {
  if (!dateISO || !/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) return dateISO || '';
  if (!relative) {
    const [, mm, dd] = dateISO.split('-').map(Number);
    return `${DAY_SHORT[getDayOfWeekFromISO(dateISO)]} ${dd} ${MONTH_SHORT[mm - 1]}`;
  }
  const today = getTodayISO();
  if (dateISO === today) return 'Hoy';
  if (dateISO === addDaysISO(today, 1)) return 'Mañana';
  if (dateISO === addDaysISO(today, -1)) return 'Ayer';
  const [, m, d] = dateISO.split('-').map(Number);
  return `${DAY_SHORT[getDayOfWeekFromISO(dateISO)]} ${d} ${MONTH_SHORT[m - 1]}`;
}

export function getDayName(dayOfWeek: number): string {
  return DAY_NAMES[dayOfWeek] ?? 'Día';
}

export function getUpcomingDays(count = 7): { iso: string; dayShort: string; dayNum: string; dayOfWeek: number }[] {
  const today = getTodayISO();
  return Array.from({ length: count }, (_, idx) => {
    const iso = addDaysISO(today, idx);
    const dow = getDayOfWeekFromISO(iso);
    const dayNum = iso.split('-')[2];
    return {
      iso,
      dayShort: idx === 0 ? 'Hoy' : DAY_SHORT[dow],
      dayNum,
      dayOfWeek: dow,
    };
  });
}

export function generateDaySlots(club: Club): { startMinute: number; endMinute: number }[] {
  const slots: { startMinute: number; endMinute: number }[] = [];
  const startMin = club.openHour * 60;
  const endMin = club.closeHour * 60;
  const duration = club.slotDurationMinutes || 90;
  for (let m = startMin; m + duration <= endMin; m += duration) {
    slots.push({ startMinute: m, endMinute: m + duration });
  }
  return slots;
}

export function calculateSlotPrice(club: Club, dateISO: string, startMinute: number): number {
  const dow = getDayOfWeekFromISO(dateISO);
  const isWeekend = dow === 0 || dow === 6;
  const isNight = startMinute >= club.nightFromHour * 60;
  if (isWeekend) return Math.max(club.weekendPrice, isNight ? club.nightPrice : club.weekendPrice);
  if (isNight) return club.nightPrice;
  return club.basePrice;
}

export function canCancelFree(club: Club, dateISO: string, startMinute: number): boolean {
  const [y, m, d] = dateISO.split('-').map(Number);
  const slotDate = new Date(y, m - 1, d, Math.floor(startMinute / 60), startMinute % 60, 0);
  const diffHours = (slotDate.getTime() - Date.now()) / (1000 * 60 * 60);
  return diffHours >= club.cancellationHours;
}

export function sanitizeId(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'item';
}

export interface MatchCandidateResult {
  court: Court;
  date: string;
  startMinute: number;
  endMinute: number;
  modality: Modality;
  minCategory: number;
  maxCategory: number;
  slots: ProposedSlot[];
  usedRequestIds: string[];
  expiresAt: string;
}

/**
 * Core Matchmaking Engine:
 * - Prioritizes same-day & priority requests over weekly availability.
 * - Matches modality (masculino, femenino, mixto).
 * - Tolerates max 1 category difference across all 4 players.
 * - Supports fixed pairs (partnerUid + partnerAccepted) and solo players.
 * - Picks a free court & full slot duration where all 4 players overlap.
 */
export function findMatchForClub(params: {
  club: Club;
  courts: Court[];
  bookings: Booking[];
  requests: MatchRequest[];
  memberships: ClubMembership[];
  targetDate?: string;
  playerLevels?: Map<string, number>;
}): MatchCandidateResult | null {
  const { club, courts, bookings, requests, memberships, targetDate, playerLevels } = params;
  const activeCourts = courts.filter((c) => c.active);
  if (activeCourts.length === 0) return null;

  const today = getTodayISO();
  const candidateDates = targetDate
    ? [targetDate]
    : Array.from({ length: 5 }, (_, i) => addDaysISO(today, i));

  const memberMap = new Map<string, ClubMembership>();
  for (const m of memberships) {
    memberMap.set(m.uid, m);
  }

  // Only waiting requests whose fixed partner (if any) accepted
  const activeRequests = requests
    .filter(
      (r) =>
        r.status === 'waiting' &&
        (!r.partnerUid || r.partnerAccepted) &&
        !memberMap.get(r.creatorUid)?.blocked
    )
    .sort((a, b) => {
      if (a.requestType !== b.requestType) return a.requestType === 'priority' ? -1 : 1;
      if (a.isSameDay !== b.isSameDay) return a.isSameDay ? -1 : 1;
      return 0;
    });

  const daySlots = generateDaySlots(club);

  for (const dateISO of candidateDates) {
    const dow = getDayOfWeekFromISO(dateISO);
    const activeBookingsOnDate = bookings.filter(
      (b) => b.date === dateISO && (b.status === 'confirmed' || b.status === 'held')
    );

    // Filter requests valid for this date
    const reqsForDate = activeRequests.filter((r) => {
      if (r.requestType === 'priority') return r.date === dateISO;
      return r.dayOfWeek === dow;
    });

    if (reqsForDate.length === 0) continue;

    for (const slot of daySlots) {
      // Find a free court for this slot
      const freeCourt = activeCourts.find((court) => {
        return !activeBookingsOnDate.some(
          (b) =>
            b.courtId === court.id &&
            b.startMinute < slot.endMinute &&
            b.endMinute > slot.startMinute
        );
      });
      if (!freeCourt) continue;

      // Requests covering the entire slot
      const covering = reqsForDate.filter(
        (r) => r.startMinute <= slot.startMinute && r.endMinute >= slot.endMinute
      );

      for (const anchor of covering) {
        const modality: Modality = anchor.modality;
        const getLevel = (uid: string, fallbackCat: number) =>
          playerLevels?.get(uid) ?? Math.min(10, Math.max(1, Math.round(10.5 - fallbackCat)));
        const anchorLevel = getLevel(anchor.creatorUid, anchor.category);

        // Gather compatible candidates for anchor and rank by dynamic level proximity (Nivel 1-10)
        const pool = covering
          .filter((cand) => {
            if (cand.modality !== modality) return false;
            if (Math.abs(cand.category - anchor.category) > 1) return false;
            return true;
          })
          .sort((a, b) => {
            const diffA = Math.abs(getLevel(a.creatorUid, a.category) - anchorLevel);
            const diffB = Math.abs(getLevel(b.creatorUid, b.category) - anchorLevel);
            if (diffA !== diffB) return diffA - diffB;
            return 0;
          });

        const selectedSlots: ProposedSlot[] = [];
        const selectedUids = new Set<string>();
        const usedReqIds: string[] = [];

        const tryAddRequest = (req: MatchRequest): boolean => {
          const needed = req.partnerUid ? 2 : 1;
          if (selectedSlots.length + needed > 4) return false;
          if (selectedUids.has(req.creatorUid)) return false;
          if (req.partnerUid && selectedUids.has(req.partnerUid)) return false;

          // Check category spread across already selected <= 1
          const cats = [...selectedSlots.map((s) => s.category), req.category];
          const partnerCat = req.partnerUid ? (memberMap.get(req.partnerUid)?.category ?? req.category) : req.category;
          cats.push(partnerCat);
          if (Math.max(...cats) - Math.min(...cats) > 1) return false;

          const creatorMember = memberMap.get(req.creatorUid);
          selectedUids.add(req.creatorUid);
          selectedSlots.push({
            uid: req.creatorUid,
            displayName: req.creatorName,
            category: req.category,
            gender: creatorMember?.gender ?? 'masculino',
            status: 'pending',
            paid: false,
            requestId: req.id,
          });

          if (req.partnerUid) {
            const partnerMember = memberMap.get(req.partnerUid);
            selectedUids.add(req.partnerUid);
            selectedSlots.push({
              uid: req.partnerUid,
              displayName: req.partnerName || partnerMember?.displayName || 'Pareja',
              category: partnerCat,
              gender: partnerMember?.gender ?? 'masculino',
              status: 'pending',
              paid: false,
              requestId: req.id,
            });
          }

          usedReqIds.push(req.id);
          return true;
        };

        tryAddRequest(anchor);
        for (const cand of pool) {
          if (cand.id === anchor.id) continue;
          tryAddRequest(cand);
          if (selectedSlots.length === 4) break;
        }

        if (selectedSlots.length === 4) {
          const allCats = selectedSlots.map((s) => s.category);
          const isSameDay = dateISO === today;
          const deadlineMs = isSameDay ? 30 * 60 * 1000 : 2 * 60 * 60 * 1000;
          return {
            court: freeCourt,
            date: dateISO,
            startMinute: slot.startMinute,
            endMinute: slot.endMinute,
            modality,
            minCategory: Math.min(...allCats),
            maxCategory: Math.max(...allCats),
            slots: selectedSlots,
            usedRequestIds: usedReqIds,
            expiresAt: new Date(Date.now() + deadlineMs).toISOString(),
          };
        }
      }
    }
  }

  return null;
}

export function generateTournamentDraw(params: {
  pairs: TournamentPair[];
  format: TournamentFormat;
  courts: Court[];
  startDate: string;
  club: Club;
}): TournamentMatch[] {
  const { pairs, format, courts, startDate, club } = params;
  const acceptedPairs = pairs.filter((p) => p.partnerAccepted);
  const activeCourts = courts.filter((c) => c.active);
  if (acceptedPairs.length < 2 || activeCourts.length === 0) return [];

  const shuffled = [...acceptedPairs].sort(() => Math.random() - 0.5);
  const matches: TournamentMatch[] = [];
  const slots = generateDaySlots(club);
  const baseSlot = slots[Math.min(2, Math.max(0, slots.length - 1))] || { startMinute: 600, endMinute: 690 };

  let matchIdx = 0;

  if (format === 'groups_knockout' && shuffled.length >= 4) {
    const mid = Math.ceil(shuffled.length / 2);
    const groupA = shuffled.slice(0, mid);
    const groupB = shuffled.slice(mid);

    const buildGroupMatches = (groupPairs: TournamentPair[], groupName: string) => {
      for (let i = 0; i < groupPairs.length; i++) {
        for (let j = i + 1; j < groupPairs.length; j++) {
          const court = activeCourts[matchIdx % activeCourts.length];
          const dayOffset = Math.floor(matchIdx / Math.max(1, activeCourts.length));
          const slot = slots[(2 + dayOffset) % slots.length] || baseSlot;
          matches.push({
            id: `tm_${Date.now()}_${matchIdx}`,
            round: groupName,
            pair1Id: groupPairs[i].id,
            pair1Label: `${groupPairs[i].player1Name} / ${groupPairs[i].player2Name}`,
            pair2Id: groupPairs[j].id,
            pair2Label: `${groupPairs[j].player1Name} / ${groupPairs[j].player2Name}`,
            courtId: court.id,
            courtName: court.name,
            date: addDaysISO(startDate, Math.floor(matchIdx / 4)),
            startMinute: slot.startMinute,
            score: '',
            winnerPairId: '',
            status: 'scheduled',
          });
          matchIdx++;
        }
      }
    };

    buildGroupMatches(groupA, 'Grupo A');
    buildGroupMatches(groupB, 'Grupo B');

    // Placeholder Final
    const finalCourt = activeCourts[0];
    matches.push({
      id: `tm_${Date.now()}_final`,
      round: 'Final',
      pair1Id: 'tbd_a',
      pair1Label: 'Ganador Grupo A',
      pair2Id: 'tbd_b',
      pair2Label: 'Ganador Grupo B',
      courtId: finalCourt.id,
      courtName: finalCourt.name,
      date: addDaysISO(startDate, 1),
      startMinute: (slots[slots.length - 2] || baseSlot).startMinute,
      score: '',
      winnerPairId: '',
      status: 'scheduled',
    });
  } else {
    const roundName = shuffled.length > 4 ? 'Cuartos' : shuffled.length > 2 ? 'Semifinal' : 'Final';
    for (let i = 0; i + 1 < shuffled.length; i += 2) {
      const court = activeCourts[matchIdx % activeCourts.length];
      const slot = slots[Math.min(slots.length - 1, 1 + matchIdx)] || baseSlot;
      matches.push({
        id: `tm_${Date.now()}_${matchIdx}`,
        round: roundName,
        pair1Id: shuffled[i].id,
        pair1Label: `${shuffled[i].player1Name} / ${shuffled[i].player2Name}`,
        pair2Id: shuffled[i + 1].id,
        pair2Label: `${shuffled[i + 1].player1Name} / ${shuffled[i + 1].player2Name}`,
        courtId: court.id,
        courtName: court.name,
        date: startDate,
        startMinute: slot.startMinute,
        score: '',
        winnerPairId: '',
        status: 'scheduled',
      });
      matchIdx++;
    }
  }

  return matches;
}

function toUruguayUTCStamp(dateISO: string, totalMinutes: number): string {
  const hr = Math.floor(totalMinutes / 60);
  const min = totalMinutes % 60;
  const isoWithOffset = `${dateISO}T${String(hr).padStart(2, '0')}:${String(min).padStart(2, '0')}:00-03:00`;
  const dt = new Date(isoWithOffset);
  return dt.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function escapeICalText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

export function buildGoogleCalendarUrl(club: Club, booking: Booking): string {
  const startUtc = toUruguayUTCStamp(booking.date, booking.startMinute);
  const endUtc = toUruguayUTCStamp(booking.date, booking.endMinute);
  const title = `Pádel en ${club.name} — ${booking.courtName}`;
  const location = `${club.address}, ${club.city}`;
  const details = [
    `Turno confirmado en ${club.name}.`,
    `Cancha: ${booking.courtName}`,
    `Horario: ${formatMinutes(booking.startMinute)}–${formatMinutes(booking.endMinute)} hs`,
    `Total: ${formatUYU(booking.totalPrice)}`,
  ].join('\n');

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${startUtc}/${endUtc}`,
    details,
    location,
    ctz: 'America/Montevideo',
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function buildICalContent(club: Club, bookingsToExport: Booking[]): string {
  const nowStamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ArmaPartido//Padel Uruguay//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];

  for (const booking of bookingsToExport) {
    const startUtc = toUruguayUTCStamp(booking.date, booking.startMinute);
    const endUtc = toUruguayUTCStamp(booking.date, booking.endMinute);
    const summary = escapeICalText(`Pádel en ${club.name} — ${booking.courtName}`);
    const location = escapeICalText(`${club.address}, ${club.city}`);
    const description = escapeICalText(
      `Reserva confirmada en ${club.name}. Cancha: ${booking.courtName}. Horario: ${formatMinutes(booking.startMinute)}-${formatMinutes(booking.endMinute)} hs. Total: ${formatUYU(booking.totalPrice)}.`
    );

    lines.push(
      'BEGIN:VEVENT',
      `UID:${booking.id}@armapartido.com`,
      `DTSTAMP:${nowStamp}`,
      `DTSTART:${startUtc}`,
      `DTEND:${endUtc}`,
      `SUMMARY:${summary}`,
      `LOCATION:${location}`,
      `DESCRIPTION:${description}`,
      'STATUS:CONFIRMED',
      'BEGIN:VALARM',
      'TRIGGER:-PT2H',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapeICalText(`Recordatorio: tu partido en ${club.name} empieza en 2 horas.`)}`,
      'END:VALARM',
      'END:VEVENT'
    );
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

export function downloadICalFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export interface ClubPlayerRankingEntry {
  uid: string;
  displayName: string;
  category: number;
  role: ClubMembership['role'];
  blocked: boolean;
  rank: number;
  points: number;
  matchesPlayed: number;
  wins: number;
  losses: number;
  winRate: number;
  frequencyCount: number;
  recent28dCount: number;
  weeklyFrequency: number;
  lastPlayedDate: string;
}

export function computeClubPlayerRanking(params: {
  clubId: string;
  memberships: ClubMembership[];
  bookings: Booking[];
  proposedMatches: ProposedMatch[];
  tournaments: Tournament[];
  playerMatchResults: PlayerMatchResult[];
  clubMatchResults?: PlayerMatchResult[];
  currentUser?: { uid: string; displayName: string; category: number };
}): ClubPlayerRankingEntry[] {
  const {
    clubId,
    memberships,
    bookings,
    proposedMatches,
    tournaments,
    playerMatchResults,
    clubMatchResults = [],
    currentUser,
  } = params;

  type PlayerAcc = {
    uid: string;
    displayName: string;
    category: number;
    role: ClubMembership['role'];
    blocked: boolean;
    wins: number;
    losses: number;
    dates: string[];
  };

  const accMap = new Map<string, PlayerAcc>();

  const ensurePlayer = (uid: string, fallbackName?: string): PlayerAcc => {
    const existing = accMap.get(uid);
    if (existing) return existing;
    const isCurrent = currentUser && currentUser.uid === uid;
    const entry: PlayerAcc = {
      uid,
      displayName: isCurrent ? currentUser.displayName : fallbackName || 'Jugador',
      category: isCurrent ? currentUser.category : 5,
      role: 'player',
      blocked: false,
      wins: 0,
      losses: 0,
      dates: [],
    };
    accMap.set(uid, entry);
    return entry;
  };

  for (const m of memberships) {
    if (m.clubId !== clubId) continue;
    accMap.set(m.uid, {
      uid: m.uid,
      displayName: m.displayName,
      category: m.category,
      role: m.role,
      blocked: m.blocked,
      wins: 0,
      losses: 0,
      dates: [],
    });
  }

  // Merge user-level and club-level playerMatchResults for this club without duplicates
  const mergedResults = new Map<string, PlayerMatchResult>();
  for (const r of clubMatchResults) {
    if (r.clubId === clubId) mergedResults.set(r.id, r);
  }
  for (const r of playerMatchResults) {
    if (r.clubId === clubId) mergedResults.set(r.id, r);
  }

  for (const r of mergedResults.values()) {
    const p = ensurePlayer(r.uid);
    if (r.outcome === 'win') p.wins += 1;
    else p.losses += 1;
    if (r.date) p.dates.push(r.date);
  }

  // Tournament matches in this club
  for (const trn of tournaments) {
    if (trn.clubId !== clubId) continue;
    const pairMap = new Map<string, { p1: string; p1Name: string; p2: string; p2Name: string }>();
    for (const pair of trn.pairs) {
      pairMap.set(pair.id, {
        p1: pair.player1Uid,
        p1Name: pair.player1Name,
        p2: pair.player2Uid,
        p2Name: pair.player2Name,
      });
    }

    for (const m of trn.matches) {
      const pair1 = pairMap.get(m.pair1Id);
      const pair2 = pairMap.get(m.pair2Id);
      const participants: { uid: string; name: string; pairId: string }[] = [];
      if (pair1) {
        participants.push({ uid: pair1.p1, name: pair1.p1Name, pairId: m.pair1Id });
        participants.push({ uid: pair1.p2, name: pair1.p2Name, pairId: m.pair1Id });
      }
      if (pair2) {
        participants.push({ uid: pair2.p1, name: pair2.p1Name, pairId: m.pair2Id });
        participants.push({ uid: pair2.p2, name: pair2.p2Name, pairId: m.pair2Id });
      }

      for (const participant of participants) {
        if (!participant.uid) continue;
        const p = ensurePlayer(participant.uid, participant.name);
        if (m.date) p.dates.push(m.date);
        if (m.status === 'completed' && m.winnerPairId) {
          if (m.winnerPairId === participant.pairId) p.wins += 1;
          else p.losses += 1;
        }
      }
    }
  }

  // Bookings & confirmed proposed matches in this club for play frequency
  const seenBookingIds = new Set<string>();
  for (const b of bookings) {
    if (b.clubId !== clubId) continue;
    if (b.status === 'cancelled' || b.status === 'no_show') continue;
    seenBookingIds.add(b.id);

    const uids = new Set<string>(b.playerUids || []);
    if (b.type !== 'counter' && b.createdByUid) {
      uids.add(b.createdByUid);
    }

    for (const uid of uids) {
      const p = ensurePlayer(uid);
      if (b.date) p.dates.push(b.date);
    }
  }

  for (const pm of proposedMatches) {
    if (pm.clubId !== clubId || pm.status !== 'confirmed') continue;
    if (seenBookingIds.has(pm.bookingId)) continue;
    for (const slot of pm.slots) {
      const p = ensurePlayer(slot.uid, slot.displayName);
      if (pm.date) p.dates.push(pm.date);
    }
  }

  const todayISO = getTodayISO();
  const cutoff28d = addDaysISO(todayISO, -27);

  const rows: ClubPlayerRankingEntry[] = Array.from(accMap.values()).map((p) => {
    const validDates = p.dates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
    const recent28dCount = validDates.filter((d) => d >= cutoff28d && d <= todayISO).length;
    const frequencyCount = validDates.length;
    const weeklyFrequency = Number((recent28dCount / 4).toFixed(1));
    const matchesPlayed = p.wins + p.losses;
    const winRate = matchesPlayed > 0 ? Math.round((p.wins / matchesPlayed) * 100) : 0;
    const points = p.wins * 25 + p.losses * 5 + frequencyCount * 10;
    const lastPlayedDate =
      validDates.length > 0 ? [...validDates].sort((a, b) => b.localeCompare(a))[0] : '';

    return {
      uid: p.uid,
      displayName: p.displayName,
      category: p.category,
      role: p.role,
      blocked: p.blocked,
      rank: 0,
      points,
      matchesPlayed,
      wins: p.wins,
      losses: p.losses,
      winRate,
      frequencyCount,
      recent28dCount,
      weeklyFrequency,
      lastPlayedDate,
    };
  });

  rows.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b.winRate !== a.winRate) return b.winRate - a.winRate;
    if (b.frequencyCount !== a.frequencyCount) return b.frequencyCount - a.frequencyCount;
    return a.displayName.localeCompare(b.displayName, 'es-UY');
  });

  return rows.map((row, idx) => ({
    ...row,
    rank: idx + 1,
  }));
}

export function findAvailabilityOverlaps(
  myWindows: AvailabilityWindow[],
  otherWindows: AvailabilityWindow[],
  minMinutes = 60
): AvailabilityWindow[] {
  const overlaps: AvailabilityWindow[] = [];
  for (const a of myWindows) {
    for (const b of otherWindows) {
      if (a.dayOfWeek !== b.dayOfWeek) continue;
      const startMinute = Math.max(a.startMinute, b.startMinute);
      const endMinute = Math.min(a.endMinute, b.endMinute);
      if (endMinute - startMinute >= minMinutes) {
        overlaps.push({ dayOfWeek: a.dayOfWeek, startMinute, endMinute });
      }
    }
  }
  return overlaps;
}

export interface PlayerLevelSummary {
  uid: string;
  level: number; // 1..10
  exactRating: number; // 1.0..10.0
  baseRating: number;
  deltaFromBase: number;
  tierLabel: string;
  wins: number;
  losses: number;
  matchesWithResult: number;
  recentForm: ('W' | 'L')[];
}

const CATEGORY_BASE_RATING: Record<number, number> = {
  1: 9.2,
  2: 8.4,
  3: 7.5,
  4: 6.5,
  5: 5.5,
  6: 4.5,
  7: 3.5,
  8: 2.5,
};

export function getLevelTierLabel(level: number): string {
  if (level >= 9) return 'Elite';
  if (level >= 7) return 'Avanzado';
  if (level >= 5) return 'Intermedio';
  if (level >= 3) return 'En progreso';
  return 'Inicial';
}

export function computePlayerLevel(params: {
  uid: string;
  category: number;
  tournaments: Tournament[];
  playerMatchResults: PlayerMatchResult[];
  clubMatchResults?: PlayerMatchResult[];
}): PlayerLevelSummary {
  const { uid, category, tournaments, playerMatchResults, clubMatchResults = [] } = params;
  const baseRating = CATEGORY_BASE_RATING[category] ?? 5.5;

  type MatchOutcomeEvent = {
    date: string;
    outcome: 'win' | 'loss';
    isTournament: boolean;
  };

  const events: MatchOutcomeEvent[] = [];

  // Deduplicate user and club match results by id
  const seenResultIds = new Set<string>();
  for (const r of [...playerMatchResults, ...clubMatchResults]) {
    if (r.uid !== uid || seenResultIds.has(r.id)) continue;
    seenResultIds.add(r.id);
    events.push({
      date: r.date || '2026-01-01',
      outcome: r.outcome,
      isTournament: false,
    });
  }

  // Completed tournament matches
  for (const trn of tournaments) {
    const myPairIds = new Set(
      trn.pairs
        .filter((p) => p.player1Uid === uid || p.player2Uid === uid)
        .map((p) => p.id)
    );
    if (myPairIds.size === 0) continue;

    for (const m of trn.matches) {
      if (m.status !== 'completed' || !m.winnerPairId) continue;
      if (!myPairIds.has(m.pair1Id) && !myPairIds.has(m.pair2Id)) continue;
      events.push({
        date: m.date || trn.startDate || '2026-01-01',
        outcome: myPairIds.has(m.winnerPairId) ? 'win' : 'loss',
        isTournament: true,
      });
    }
  }

  // Sort chronologically to compute dynamic progression
  events.sort((a, b) => a.date.localeCompare(b.date));

  let rating = baseRating;
  let wins = 0;
  let losses = 0;
  for (const ev of events) {
    if (ev.outcome === 'win') {
      wins += 1;
      rating = Math.min(10, rating + (ev.isTournament ? 0.45 : 0.35));
    } else {
      losses += 1;
      rating = Math.max(1, rating - (ev.isTournament ? 0.18 : 0.22));
    }
  }

  const exactRating = Number(rating.toFixed(1));
  const level = Math.min(10, Math.max(1, Math.round(exactRating)));
  const deltaFromBase = Number((exactRating - baseRating).toFixed(1));
  const recentForm = events
    .slice(-5)
    .map((ev): 'W' | 'L' => (ev.outcome === 'win' ? 'W' : 'L'));

  return {
    uid,
    level,
    exactRating,
    baseRating,
    deltaFromBase,
    tierLabel: getLevelTierLabel(level),
    wins,
    losses,
    matchesWithResult: wins + losses,
    recentForm,
  };
}

export function computePlayerLevelsMap(params: {
  players: { uid: string; category: number }[];
  tournaments: Tournament[];
  playerMatchResults: PlayerMatchResult[];
  clubMatchResults?: PlayerMatchResult[];
}): Map<string, PlayerLevelSummary> {
  const { players, tournaments, playerMatchResults, clubMatchResults = [] } = params;
  const map = new Map<string, PlayerLevelSummary>();
  for (const p of players) {
    if (map.has(p.uid)) continue;
    map.set(
      p.uid,
      computePlayerLevel({
        uid: p.uid,
        category: p.category,
        tournaments,
        playerMatchResults,
        clubMatchResults,
      })
    );
  }
  return map;
}




