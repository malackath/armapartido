/**
 * Migración asistida: carga los jugadores y turnos fijos de un club desde una planilla (CSV).
 *
 * Prueba en seco (no toca nada, solo arma el informe y los mails de bienvenida para revisar):
 *   npx tsx scripts/importar-jugadores.ts --archivo clientes.csv --club los_jacarandas --salida ./migracion-club
 *
 * Carga de verdad (con el permiso del club escrito, que queda guardado):
 *   GOOGLE_APPLICATION_CREDENTIALS=... npx tsx scripts/importar-jugadores.ts --archivo clientes.csv --club <id> \
 *     --cargar --permiso "Contrato firmado el 15/11/2026 por <dueño>, cláusula de datos" [--semanas 12]
 *   (contra emuladores: FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 GCLOUD_PROJECT=demo-armapartido)
 *
 * NO manda mails. Los deja escritos en la carpeta de salida; mandarlos necesita Resend y el OK de Ber.
 * La planilla original no se guarda en Firebase.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildWelcomeEmail, cleanPlayers, parseCsv, type CleanPlayer } from '../src/lib/migracion';

const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const flag = (name: string) => args.includes(`--${name}`);

const file = opt('archivo');
const clubId = opt('club');
const out = opt('salida') || './migracion';
const weeks = Math.min(26, Math.max(1, Number(opt('semanas') || 12)));
if (!file || !clubId) {
  console.error('Uso: --archivo <planilla.csv> --club <id del club> [--salida carpeta] [--cargar --permiso "..."]');
  process.exit(1);
}

const DAYS = ['domingos', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados'];
const hhmm = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
const CAT = ['1ra', '2da', '3ra', '4ta', '5ta', '6ta', '7ma'];
const courtLabel = (c: string) => (/^\d+$/.test(c.trim()) ? `Cancha ${c.trim()}` : c);
const fixedText = (p: CleanPlayer) => (p.fixed ? `los ${DAYS[p.fixed.dayOfWeek]} a las ${hhmm(p.fixed.startMinute)}${p.fixed.court ? ` en ${courtLabel(p.fixed.court)}` : ''}` : undefined);

const report = cleanPlayers(parseCsv(readFileSync(file, 'utf8')));
mkdirSync(join(out, 'mails'), { recursive: true });

const lines = [
  `# Migración: revisión de la planilla`,
  ``,
  `Archivo: ${file} · club: ${clubId} · ${new Date().toISOString().slice(0, 10)}`,
  ``,
  `| | Cantidad |`,
  `|---|---|`,
  `| Filas leídas | ${report.rows} |`,
  `| Listas para cargar (con mail) | ${report.ready.length} |`,
  `| Sin mail (solo celular): se avisan en el club | ${report.noEmail.length} |`,
  `| Repetidos que se juntaron | ${report.duplicates.length} |`,
  `| Descartadas | ${report.discarded.length} |`,
  `| Con turno fijo | ${report.fixedCount} |`,
  `| Sin categoría (la elige el jugador al entrar) | ${[...report.ready, ...report.noEmail].filter((p) => p.category === null).length} |`,
  ``,
];
if (report.unknownColumns.length) lines.push(`Columnas que no usamos: ${report.unknownColumns.join(', ')}`, '');
if (report.duplicates.length) lines.push('## Repetidos', ...report.duplicates.map((d) => `- Fila ${d.merged} junto con la ${d.kept}: ${d.reason}`), '');
if (report.discarded.length) lines.push('## Descartadas', ...report.discarded.map((d) => `- Fila ${d.row}: ${d.reason}`), '');
if (report.noEmail.length) lines.push('## Sin mail (avisar en el club o con el cartel QR)', ...report.noEmail.map((p) => `- ${p.name} · ${p.phone}${p.fixed ? ` · fijo ${fixedText(p)}` : ''}`), '');
lines.push('## Listos para cargar', '| Nombre | Mail | Celular | Categoría | Turno fijo |', '|---|---|---|---|---|');
report.ready.forEach((p) => lines.push(`| ${p.name} | ${p.email} | ${p.phone} | ${p.category ? CAT[p.category - 1] : 'sin dato'} | ${fixedText(p) ?? ''} |`));
writeFileSync(join(out, 'revision.md'), lines.join('\n'));
writeFileSync(join(out, 'jugadores-limpios.json'), JSON.stringify(report, null, 2));

report.ready.forEach((p, i) => {
  const mail = buildWelcomeEmail({
    playerFirstName: p.name.split(' ')[0],
    clubName: opt('nombre-club') || 'Tu club',
    loginUrl: 'https://<app-del-club>/entrar',
    unsubscribeUrl: 'https://<app-del-club>/baja',
    fixedText: fixedText(p),
    logoUrl: 'https://demo.armapartido.com/brand/logo-horizontal-color.png',
  });
  if (i < 3) writeFileSync(join(out, 'mails', `bienvenida-${i + 1}.html`), mail.html);
});

console.log(`Filas ${report.rows} · listas ${report.ready.length} · sin mail ${report.noEmail.length} · repetidos ${report.duplicates.length} · descartadas ${report.discarded.length} · turnos fijos ${report.fixedCount}`);
console.log(`Revisión: ${join(out, 'revision.md')}`);

if (!flag('cargar')) {
  console.log('Prueba en seco: no se cargó nada. Para cargar: --cargar --permiso "..."');
  process.exit(0);
}
const permiso = opt('permiso');
if (!permiso || permiso.length < 10) {
  console.error('Para cargar hace falta --permiso con el detalle del permiso del club (ley de datos 18.331).');
  process.exit(1);
}

// ---------- Carga ----------
const { initializeApp, applicationDefault } = await import('firebase-admin/app');
const { getAuth } = await import('firebase-admin/auth');
const { getFirestore, FieldValue } = await import('firebase-admin/firestore');
// FIREBASE_EMULATORS=1 (igual que seed-demo) apunta a los emuladores locales
if (process.env.FIREBASE_EMULATORS === '1') {
  process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
  process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099';
}
initializeApp(process.env.FIRESTORE_EMULATOR_HOST ? { projectId: process.env.GCLOUD_PROJECT || 'demo-armapartido' } : { credential: applicationDefault() });
const auth = getAuth();
const db = getFirestore();

const clubSnap = await db.doc(`clubs/${clubId}`).get();
if (!clubSnap.exists) {
  console.error(`No existe el club ${clubId}.`);
  process.exit(1);
}
const club = clubSnap.data() as { name: string; slotDurationMinutes?: number; basePrice: number; nightFromHour: number; nightPrice: number; weekendPrice: number };
const courts = (await db.collection(`clubs/${clubId}/courts`).get()).docs.map((d) => d.data() as { id: string; name: string; active: boolean });
const existingBookings = (await db.collection(`clubs/${clubId}/bookings`).get()).docs.map((d) => d.data() as { courtId: string; date: string; startMinute: number; endMinute: number; status: string });
const priceAt = (date: string, start: number) => {
  const dow = new Date(`${date}T12:00:00`).getDay();
  const night = start >= club.nightFromHour * 60;
  if (dow === 0 || dow === 6) return Math.max(club.weekendPrice, night ? club.nightPrice : club.weekendPrice);
  return night ? club.nightPrice : club.basePrice;
};
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (s: string, n: number) => {
  const d = new Date(`${s}T12:00:00`);
  d.setDate(d.getDate() + n);
  return iso(d);
};
const findCourt = (name: string) => courts.find((c) => c.active && (c.name.toLowerCase() === name.toLowerCase() || name.replace(/\D/g, '') !== '' && c.name.replace(/\D/g, '') === name.replace(/\D/g, '')));

let created = 0;
let linked = 0;
let fixedMade = 0;
const skippedWeeks: string[] = [];
const migrationId = `mig_${Date.now().toString(36)}`;
for (const p of report.ready) {
  let uid: string;
  try {
    uid = (await auth.getUserByEmail(p.email)).uid;
    linked += 1; // ya tenía cuenta (por otro club): no se duplica
  } catch {
    uid = (await auth.createUser({ email: p.email, displayName: p.name, emailVerified: false })).uid;
    created += 1;
  }
  const userRef = db.doc(`users/${uid}`);
  const userSnap = await userRef.get();
  if (!userSnap.exists) {
    await userRef.set({ uid, displayName: p.name, photoUrl: '', category: p.category ?? 5, gender: 'masculino', preferredModality: 'mixto', weeklyAvailability: [], activeClubIds: [clubId], createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    await db.doc(`users/${uid}/private/info`).set({ uid, email: p.email, phone: p.phone, updatedAt: FieldValue.serverTimestamp() });
  } else {
    await userRef.update({ activeClubIds: FieldValue.arrayUnion(clubId), updatedAt: FieldValue.serverTimestamp() });
  }
  await db.doc(`clubs/${clubId}/memberships/${uid}`).set(
    {
      uid,
      clubId,
      displayName: p.name,
      role: 'player',
      category: p.category ?? 5,
      categoryConfirmed: p.category !== null,
      gender: 'masculino',
      preferredModality: 'mixto',
      weeklyAvailability: [],
      noShowCount: 0,
      blocked: false,
      isDiscoverable: true,
      migratedFrom: migrationId,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  if (p.fixed) {
    const court = findCourt(p.fixed.court);
    if (!court) {
      console.log(`  ${p.name}: no encontré la cancha "${p.fixed.court}", el turno fijo no se cargó`);
      continue;
    }
    let first = iso(new Date());
    while (new Date(`${first}T12:00:00`).getDay() !== p.fixed.dayOfWeek) first = addDays(first, 1);
    const end = p.fixed.startMinute + (club.slotDurationMinutes || 90);
    const fixedId = `fijo_${migrationId}_${p.row}`;
    const ids: string[] = [];
    for (let w = 0; w < weeks; w += 1) {
      const date = addDays(first, w * 7);
      if (existingBookings.some((b) => b.courtId === court.id && b.date === date && b.status !== 'cancelled' && b.startMinute < end && b.endMinute > p.fixed!.startMinute)) {
        skippedWeeks.push(`${p.name} ${date}`);
        continue;
      }
      const id = `bk_${migrationId}_${p.row}_${w}`;
      ids.push(id);
      const b = { id, clubId, courtId: court.id, courtName: court.name, date, startMinute: p.fixed.startMinute, endMinute: end, type: 'counter', status: 'confirmed', createdByUid: uid, playerUids: [uid], guestName: p.phone ? `${p.name} · ${p.phone}` : p.name, totalPrice: priceAt(date, p.fixed.startMinute), paidAmount: 0, paymentMethod: 'club', paymentStatus: 'pending', holdExpiresAt: '', fixedId, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() };
      existingBookings.push(b);
      await db.doc(`clubs/${clubId}/bookings/${id}`).set(b);
    }
    await db.doc(`clubs/${clubId}/fixedBookings/${fixedId}`).set({ id: fixedId, clubId, courtId: court.id, courtName: court.name, dayOfWeek: p.fixed.dayOfWeek, startMinute: p.fixed.startMinute, endMinute: end, holderName: p.name, holderUid: uid, phone: p.phone, fromDate: first, untilDate: addDays(first, (weeks - 1) * 7), active: true, bookingIds: ids, createdByUid: uid, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    fixedMade += 1;
  }
}

await db.doc(`clubs/${clubId}/migrations/${migrationId}`).set({
  id: migrationId,
  clubId,
  sourceFile: file.split('/').pop(),
  permission: permiso,
  rows: report.rows,
  loaded: report.ready.length,
  created,
  linked,
  fixed: fixedMade,
  noEmail: report.noEmail.length,
  emailsSent: false,
  createdAt: FieldValue.serverTimestamp(),
});
console.log(`Cargados ${report.ready.length}: ${created} cuentas nuevas, ${linked} ya tenían cuenta. Turnos fijos: ${fixedMade}. Semanas salteadas por cancha ocupada: ${skippedWeeks.length}.`);
console.log(`Registro de la migración: clubs/${clubId}/migrations/${migrationId}. Los mails NO se mandaron.`);
