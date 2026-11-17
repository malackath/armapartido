// Importar la planilla de jugadores desde Admin → Clientes (16/11/2026, parte 2.3).
// La pantalla lee el .csv/.xlsx en el navegador y manda solo las filas limpias; la planilla original no se sube.
// Acá se vuelve a calcular todo contra las fichas que ya hay, se cargan fichas y turnos fijos y se deja
// registrado el permiso del club (Ley 18.331). No manda ningún mensaje.
import { HttpsError } from 'firebase-functions/v2/https';
import type { Booking, Club, Court } from '../../src/types/padel';
import type { FixedBooking } from '../../src/types/caja';
import type { ClubClient } from '../../src/types/clientes';
import { addDaysISO, calculateSlotPrice, getDayOfWeekFromISO, getTodayISO } from '../../src/lib/padelUtils';
import { matchCourt, planImport, type ImportRow } from '../../src/lib/importarClientes';
import { db, makeId, now } from './admin';

export const MAX_ROWS = 3000;
const WEEKS = 12;

/** Valida lo que llega del celular: nunca se confía en la forma. */
export function cleanRows(raw: unknown): ImportRow[] {
  if (!Array.isArray(raw) || raw.length === 0) throw new HttpsError('invalid-argument', 'La planilla no tiene jugadores.');
  if (raw.length > MAX_ROWS) throw new HttpsError('invalid-argument', `Hasta ${MAX_ROWS} jugadores por vez.`);
  return raw.map((x, i) => {
    const r = (x ?? {}) as Record<string, unknown>;
    const s = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
    const name = s(r.name, 80);
    if (!name) throw new HttpsError('invalid-argument', `Fila sin nombre (${i + 1}).`);
    const phone = s(r.phone, 20);
    const email = s(r.email, 120).toLowerCase();
    const cat = r.category;
    const f = r.fixed as Record<string, unknown> | null | undefined;
    const fixed =
      f && Number.isInteger(f.dayOfWeek) && Number.isInteger(f.startMinute) && (f.dayOfWeek as number) >= 0 && (f.dayOfWeek as number) <= 6 && (f.startMinute as number) >= 0 && (f.startMinute as number) < 24 * 60
        ? { dayOfWeek: f.dayOfWeek as number, startMinute: f.startMinute as number, court: s(f.court, 40) }
        : null;
    return {
      row: Number.isInteger(r.row) ? (r.row as number) : i + 2,
      name,
      email: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? email : '',
      phone: /^\+[0-9]{8,15}$/.test(phone) ? phone : '',
      category: Number.isInteger(cat) && (cat as number) >= 1 && (cat as number) <= 7 ? (cat as number) : null,
      fixed,
    };
  });
}

export async function importClients(p: {
  clubId: string;
  staffUid: string;
  staffName: string;
  rows: ImportRow[];
  permission: string;
  sourceFile: string;
  fileRows: number;
  merged: number;
  discarded: number;
}) {
  const clubRef = db.doc(`clubs/${p.clubId}`);
  const [clubSnap, clientsSnap, courtsSnap] = await Promise.all([clubRef.get(), clubRef.collection('clients').get(), clubRef.collection('courts').get()]);
  if (!clubSnap.exists) throw new HttpsError('not-found', 'No existe el club.');
  const club = { ...(clubSnap.data() as Club), id: p.clubId };
  const clients = clientsSnap.docs.map((d) => d.data() as ClubClient);
  const courts = courtsSnap.docs.map((d) => ({ ...(d.data() as Court), id: d.id }));
  const plan = planImport(p.rows, clients, { merged: p.merged, discarded: p.discarded });
  const today = getTodayISO();
  const migrationId = makeId('mig');

  // Escrituras en tandas (Firestore acepta hasta 500 por tanda).
  let batch = db.batch();
  let ops = 0;
  const flush = async (force = false) => {
    if (ops && (force || ops >= 400)) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  };

  const clientIdByRow = new Map<number, string>();
  for (const r of plan.create) {
    const id = makeId('cli');
    clientIdByRow.set(r.row, id);
    const c: ClubClient = {
      id,
      clubId: p.clubId,
      name: r.name,
      phone: r.phone,
      noPhone: !r.phone,
      email: r.email,
      category: r.category,
      uid: '',
      origin: 'migracion',
      createdByUid: p.staffUid,
      createdByName: p.staffName.slice(0, 60),
      createdOn: today,
      // El club declaró que tiene el permiso de sus jugadores para pasar los datos.
      noticeGiven: true,
      acceptsNews: false,
      rut: '',
      businessName: '',
      note: '',
      balance: 0,
      status: 'active',
    };
    batch.set(clubRef.collection('clients').doc(id), { ...c, createdAt: now(), updatedAt: now() });
    ops++;
    await flush();
  }
  for (const u of plan.update) {
    clientIdByRow.set(u.row.row, u.clientId);
    if (Object.keys(u.patch).length) {
      batch.update(clubRef.collection('clients').doc(u.clientId), { ...u.patch, updatedAt: now() });
      ops++;
      await flush();
    }
  }
  await flush(true);

  // Turnos fijos: 12 semanas desde el próximo día que toca, salteando las semanas con la cancha ocupada.
  const bookingsSnap = await clubRef.collection('bookings').where('date', '>=', today).get();
  const taken = bookingsSnap.docs.map((d) => d.data() as Booking).filter((b) => b.status !== 'cancelled');
  const dur = club.slotDurationMinutes || 90;
  let fixedMade = 0;
  let weeksSkipped = 0;
  const noCourt: string[] = [];
  for (const r of [...plan.create, ...plan.update.map((u) => u.row)]) {
    if (!r.fixed) continue;
    const court = matchCourt(courts, r.fixed.court);
    if (!court) {
      noCourt.push(r.name);
      continue;
    }
    const clientId = clientIdByRow.get(r.row)!;
    const start = r.fixed.startMinute;
    const end = start + dur;
    let first = today;
    while (getDayOfWeekFromISO(first) !== r.fixed.dayOfWeek) first = addDaysISO(first, 1);
    const fixedId = `fijo_${migrationId}_${r.row}`;
    const ids: string[] = [];
    for (let w = 0; w < WEEKS; w++) {
      const date = addDaysISO(first, w * 7);
      if (taken.some((b) => b.courtId === court.id && b.date === date && b.startMinute < end && b.endMinute > start)) {
        weeksSkipped++;
        continue;
      }
      const id = `bk_${migrationId}_${r.row}_${w}`;
      const b = {
        id,
        clubId: p.clubId,
        courtId: court.id,
        courtName: court.name,
        date,
        startMinute: start,
        endMinute: end,
        type: 'counter',
        status: 'confirmed',
        createdByUid: p.staffUid,
        playerUids: [],
        clientId,
        guestName: r.name,
        totalPrice: calculateSlotPrice(club, date, start),
        paidAmount: 0,
        paymentMethod: 'club',
        paymentStatus: 'pending',
        holdExpiresAt: '',
        fixedId,
      } as unknown as Booking;
      taken.push(b);
      ids.push(id);
      batch.set(clubRef.collection('bookings').doc(id), { ...b, createdAt: now(), updatedAt: now() });
      ops++;
      await flush();
    }
    const fx: FixedBooking = {
      id: fixedId,
      clubId: p.clubId,
      courtId: court.id,
      courtName: court.name,
      dayOfWeek: r.fixed.dayOfWeek,
      startMinute: start,
      endMinute: end,
      holderName: r.name,
      holderUid: '',
      clientId,
      phone: r.phone,
      fromDate: first,
      untilDate: addDaysISO(first, (WEEKS - 1) * 7),
      active: true,
      bookingIds: ids,
      createdByUid: p.staffUid,
    };
    batch.set(clubRef.collection('fixedBookings').doc(fixedId), { ...fx, createdAt: now(), updatedAt: now() });
    ops++;
    fixedMade++;
    await flush();
  }

  batch.set(clubRef.collection('migrations').doc(migrationId), {
    id: migrationId,
    clubId: p.clubId,
    via: 'admin',
    sourceFile: p.sourceFile.slice(0, 120),
    permission: p.permission,
    byUid: p.staffUid,
    byName: p.staffName.slice(0, 60),
    rows: p.fileRows,
    created: plan.create.length,
    updated: plan.update.length,
    fixed: fixedMade,
    weeksSkipped,
    noCourt,
    emailsSent: false,
    createdAt: now(),
  });
  ops++;
  await flush(true);

  return { migrationId, created: plan.create.length, already: plan.update.length, fixed: fixedMade, weeksSkipped, noCourt };
}
