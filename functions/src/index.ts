import './tz';
import { setGlobalOptions, logger } from 'firebase-functions';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { linkOrCreateClient } from './clientes';
import type { MatchRequest, Modality } from '../../src/types/padel';
import { formatCategory, formatDateFriendly, formatMinutes, getDayName, getDayOfWeekFromISO, getTodayISO, requestsOverlap } from '../../src/lib/padelUtils';
import { db, isFakePlayer, makeId, now } from './admin';
import { respondToMatch, sweepClub } from './engine';
import { runClock } from './clock';
import { cancelStandby, offerStandby } from './guardia';
import { confirmResult, decideSuggestion, reportResult } from './resultados';
import { runAutoFillNow } from './autofill';
import { notify } from './notify';
import { openFreeSlot, previewFreeSlot, simulateAnswers } from './hueco';
import { cleanRows, importClients } from './importar';
import { chooseUnfilled, claimFromLink, claimSeat, declineInvite, dropFromMatch, publicFillLink, stopSearch } from './fill';
import type { FillChoice } from '../../src/types/padel';

// São Paulo: misma región que Firestore de la demo. Tope de instancias para que un error no dispare costos.
setGlobalOptions({ region: 'southamerica-east1', maxInstances: 3, memory: '256MiB' });

const MODALITIES: Modality[] = ['masculino', 'femenino', 'mixto'];

function requireUid(req: CallableRequest): string {
  if (!req.auth?.uid) throw new HttpsError('unauthenticated', 'Tenés que entrar con tu cuenta.');
  return req.auth.uid;
}

function str(v: unknown, max = 128): string {
  return typeof v === 'string' ? v.slice(0, max) : '';
}

function int(v: unknown, min: number, max: number, name: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) {
    throw new HttpsError('invalid-argument', `Dato inválido: ${name}.`);
  }
  return v;
}

async function requireMember(clubId: string, uid: string) {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(clubId)) throw new HttpsError('invalid-argument', 'Club inválido.');
  const snap = await db.doc(`clubs/${clubId}/memberships/${uid}`).get();
  if (!snap.exists) throw new HttpsError('permission-denied', 'No sos jugador de este club.');
  return snap;
}

/** Carga un pedido para jugar y prueba armar el partido en el momento. */
export const armadoCrearPedido = onCall(async (req) => {
  const uid = requireUid(req);
  const d = (req.data ?? {}) as Record<string, unknown>;
  const clubId = str(d.clubId);
  const member = await requireMember(clubId, uid);
  const profile = await db.doc(`users/${uid}`).get();

  const modality = str(d.modality) as Modality;
  if (!MODALITIES.includes(modality)) throw new HttpsError('invalid-argument', 'Modalidad inválida.');
  const requestType = d.requestType === 'priority' ? 'priority' : 'weekly';
  const date = str(d.date, 10);
  if (requestType === 'priority' && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HttpsError('invalid-argument', 'Fecha inválida.');
  const dayOfWeek = int(d.dayOfWeek, 0, 6, 'día');
  const startMinute = int(d.startMinute, 0, 1440, 'hora de inicio');
  const endMinute = int(d.endMinute, 0, 1440, 'hora de fin');
  if (endMinute <= startMinute) throw new HttpsError('invalid-argument', 'La franja está al revés.');
  const partnerUid = str(d.partnerUid);
  const partnerName = str(d.partnerName, 80);

  const creatorName = (str(profile.get('displayName'), 80) || str(member.get('displayName'), 80) || 'Jugador');
  const category = Number(profile.get('category') ?? member.get('category'));
  const autoAccept = !partnerUid || isFakePlayer(partnerUid);
  // Un jugador no puede tener dos pedidos que se pisen (ni él ni su pareja fija).
  const asked = { requestType, date: requestType === 'priority' ? date : '', dayOfWeek: requestType === 'priority' ? getDayOfWeekFromISO(date) : dayOfWeek, startMinute, endMinute } as const;
  const people = [uid, partnerUid].filter((u) => u && !isFakePlayer(u));
  const reqsCol = db.collection(`clubs/${clubId}/matchRequests`);
  const open = (
    await Promise.all(
      people.flatMap((u) => [
        reqsCol.where('creatorUid', '==', u).get(),
        reqsCol.where('partnerUid', '==', u).get(),
      ])
    )
  )
    .flatMap((q) => q.docs.map((x) => x.data() as MatchRequest))
    .filter((r) => r.status === 'waiting' || r.status === 'proposed');
  const clash = open.find((r) => (r.requestType === 'weekly' || r.date >= getTodayISO()) && requestsOverlap(asked, r));
  if (clash) {
    const who = clash.creatorUid === uid || clash.partnerUid === uid ? 'Ya tenés' : `${partnerName || 'Tu pareja'} ya tiene`;
    const when = clash.requestType === 'priority' ? formatDateFriendly(clash.date, false) : `cada ${getDayName(clash.dayOfWeek).toLowerCase()}`;
    throw new HttpsError(
      'already-exists',
      `${who} un pedido ${when} de ${formatMinutes(clash.startMinute)} a ${formatMinutes(clash.endMinute)} que se pisa con este. Cambiá el horario o cancelá el otro.`
    );
  }

  const reqId = makeId('mreq');
  const newReq: MatchRequest = {
    id: reqId,
    clubId,
    clubIds: [clubId],
    creatorUid: uid,
    creatorName,
    partnerUid,
    partnerName,
    partnerAccepted: autoAccept,
    category,
    modality,
    requestType,
    date: requestType === 'priority' ? date : '',
    dayOfWeek,
    startMinute,
    endMinute,
    isSameDay: requestType === 'priority' && date === getTodayISO(),
    status: 'waiting',
    unfilledAlertSent: false,
  };
  await db.doc(`clubs/${clubId}/matchRequests/${reqId}`).set({ ...newReq, createdAt: now(), updatedAt: now() });

  if (partnerUid && !autoAccept) {
    const clubName = ((await db.doc(`clubs/${clubId}`).get()).get('name') as string) || 'tu club';
    await notify({
      clubId,
      recipientUid: partnerUid,
      eventType: 'pair_invite',
      title: `Invitación de pareja fija · ${clubName}`,
      body: `${creatorName} te invitó a buscar rivales (${modality}, ${formatCategory(category)}).`,
    });
  }

  const proposedMatch = await sweepClub(clubId, uid, requestType === 'priority' ? date : undefined);
  return { request: newReq, proposedMatch };
});

/** Botón "buscar partidos": vuelve a correr el armado del club. */
export const armadoBuscar = onCall(async (req) => {
  const uid = requireUid(req);
  const clubId = str((req.data as Record<string, unknown>)?.clubId);
  await requireMember(clubId, uid);
  return { proposedMatch: await sweepClub(clubId, uid) };
});

/** Aceptar o rechazar un lugar en un partido propuesto. */
export const armadoResponder = onCall(async (req) => {
  const uid = requireUid(req);
  const d = (req.data ?? {}) as Record<string, unknown>;
  const clubId = str(d.clubId);
  const matchId = str(d.matchId);
  const slotUid = str(d.slotUid);
  const decision = d.decision === 'declined' ? 'declined' : d.decision === 'accepted' ? 'accepted' : null;
  if (!matchId || !slotUid || !decision) throw new HttpsError('invalid-argument', 'Faltan datos.');
  const member = await requireMember(clubId, uid);
  const role = member.get('role');
  // Cada uno responde por su lugar. En la demo se puede "simular" por los jugadores ficticios.
  // El mostrador y el administrador del club pueden responder por cualquiera (por ejemplo, si llaman por teléfono).
  const allowed = slotUid === uid || isFakePlayer(slotUid) || role === 'admin' || role === 'staff';
  if (!allowed) throw new HttpsError('permission-denied', 'Solo podés responder por tu lugar.');
  const result = await respondToMatch({ clubId, matchId, slotUid, decision, actorUid: uid });
  return { result };
});

/** La pareja fija acepta la invitación y se prueba armar el partido. */
export const armadoAceptarPareja = onCall(async (req) => {
  const uid = requireUid(req);
  const d = (req.data ?? {}) as Record<string, unknown>;
  const clubId = str(d.clubId);
  const requestId = str(d.requestId);
  await requireMember(clubId, uid);
  const ref = db.doc(`clubs/${clubId}/matchRequests/${requestId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Ese pedido ya no existe.');
  const r = snap.data() as MatchRequest;
  if (r.partnerUid !== uid) throw new HttpsError('permission-denied', 'La invitación no es para vos.');
  await ref.update({ partnerAccepted: true, updatedAt: now() });
  const clubName = ((await db.doc(`clubs/${clubId}`).get()).get('name') as string) || 'tu club';
  await notify({
    clubId,
    recipientUid: r.creatorUid,
    eventType: 'pair_invite',
    title: `Pareja confirmada · ${clubName}`,
    body: `${r.partnerName || 'Tu compañero'} aceptó tu invitación de pareja fija (${r.modality}).`,
    tab: 'matchmaking',
  });
  const proposedMatch = await sweepClub(clubId, uid, r.requestType === 'priority' ? r.date : undefined);
  return { proposedMatch };
});

/** Reloj: cada minuto, hora de Montevideo. */
export const armadoReloj = onSchedule({ schedule: 'every 1 minutes', timeZone: 'America/Montevideo' }, async () => {
  const report = await runClock();
  if (report.expiredMatches || report.releasedHolds || report.unfilledAlerts || report.expiredRequests) {
    logger.info('reloj', report);
  }
});

// -----------------------------------------------------------------------------
// "Falta uno" automático
// -----------------------------------------------------------------------------

function canActFor(uid: string, target: string, role: unknown): boolean {
  return target === uid || isFakePlayer(target) || role === 'admin' || role === 'staff';
}

/** "No puedo ir": salir de un partido armado. Se busca reemplazo solo. */
export const faltaUnoBajarme = onCall(async (req) => {
  const uid = requireUid(req);
  const d = (req.data ?? {}) as Record<string, unknown>;
  const clubId = str(d.clubId);
  const matchId = str(d.matchId);
  const target = str(d.uid) || uid;
  const member = await requireMember(clubId, uid);
  if (!canActFor(uid, target, member.get('role'))) throw new HttpsError('permission-denied', 'Solo podés bajarte vos.');
  return dropFromMatch({ clubId, matchId, uid: target });
});

/** "Me sumo": el primero que confirma entra. */
export const faltaUnoMeSumo = onCall(async (req) => {
  const uid = requireUid(req);
  const d = (req.data ?? {}) as Record<string, unknown>;
  const clubId = str(d.clubId);
  await requireMember(clubId, uid);
  return { result: await claimSeat({ clubId, searchId: str(d.searchId), uid }) };
});

/** Página pública del link de "Falta uno": no pide cuenta y no devuelve datos de los jugadores. */
export const faltaUnoLink = onCall(async (req) => {
  const d = (req.data ?? {}) as Record<string, unknown>;
  const clubId = str(d.clubId);
  const searchId = str(d.searchId);
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(clubId) || !/^[a-zA-Z0-9_-]{1,128}$/.test(searchId)) throw new HttpsError('invalid-argument', 'Link inválido.');
  const info = await publicFillLink(clubId, searchId);
  if (!info) throw new HttpsError('not-found', 'Este link no existe.');
  return info;
});

/** "Quiero jugar" desde el link compartido. */
export const faltaUnoSumarmePorLink = onCall(async (req) => {
  const uid = requireUid(req);
  const d = (req.data ?? {}) as Record<string, unknown>;
  const clubId = str(d.clubId);
  await requireMember(clubId, uid);
  return { result: await claimFromLink({ clubId, searchId: str(d.searchId), uid }) };
});

// -----------------------------------------------------------------------------
// Llenar un turno libre con un toque (Mostrador, 16/11)
// -----------------------------------------------------------------------------

async function requireStaff(clubId: string, uid: string) {
  const member = await requireMember(clubId, uid);
  const role = member.get('role');
  if (role !== 'admin' && role !== 'staff') throw new HttpsError('permission-denied', 'Solo el mostrador o el administrador.');
}

function slotArgs(d: Record<string, unknown>) {
  const date = str(d.date, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HttpsError('invalid-argument', 'Fecha inválida.');
  const courtId = str(d.courtId);
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(courtId)) throw new HttpsError('invalid-argument', 'Cancha inválida.');
  return { clubId: str(d.clubId), courtId, date, startMinute: int(d.startMinute, 0, 24 * 60 - 1, 'hora') };
}

/** Cuántos pueden a esa hora, por modalidad, para mostrar antes de tocar "Llenar con la app". */
export const huecoVistaPrevia = onCall(async (req) => {
  const uid = requireUid(req);
  const a = slotArgs((req.data ?? {}) as Record<string, unknown>);
  await requireStaff(a.clubId, uid);
  return previewFreeSlot(a);
});

export const huecoLlenar = onCall(async (req) => {
  const uid = requireUid(req);
  const d = (req.data ?? {}) as Record<string, unknown>;
  const a = slotArgs(d);
  await requireStaff(a.clubId, uid);
  const modality = str(d.modality) as Modality;
  if (!MODALITIES.includes(modality)) throw new HttpsError('invalid-argument', 'Modalidad inválida.');
  return openFreeSlot({ ...a, modality, discountPct: int(d.discountPct ?? 0, 0, 30, 'descuento'), staffUid: uid });
});

/** Admin → Falta uno → "Revisar ahora": corre la revisión de turnos libres en el momento. */
export const turnosLibresRevisar = onCall(async (req) => {
  const uid = requireUid(req);
  const d = (req.data ?? {}) as Record<string, unknown>;
  const clubId = str(d.clubId);
  const member = await requireMember(clubId, uid);
  if (member.get('role') !== 'admin') throw new HttpsError('permission-denied', 'Solo el administrador del club.');
  return runAutoFillNow(clubId);
});

/** Solo para la demo de venta: los jugadores ficticios invitados contestan. */
export const huecoSimular = onCall(async (req) => {
  const uid = requireUid(req);
  const d = (req.data ?? {}) as Record<string, unknown>;
  const clubId = str(d.clubId);
  await requireStaff(clubId, uid);
  return { won: await simulateAnswers({ clubId, searchId: str(d.searchId), n: int(d.n ?? 1, 1, 4, 'cantidad') }) };
});

// -----------------------------------------------------------------------------
// Importar la planilla de jugadores (Admin → Clientes, 16/11)
// -----------------------------------------------------------------------------

export const clientesImportar = onCall({ timeoutSeconds: 300, memory: '512MiB' }, async (req) => {
  const uid = requireUid(req);
  const d = (req.data ?? {}) as Record<string, unknown>;
  const clubId = str(d.clubId);
  const member = await requireMember(clubId, uid);
  if (member.get('role') !== 'admin') throw new HttpsError('permission-denied', 'Solo el dueño o el administrador del club.');
  const permission = str(d.permission, 300).trim();
  if (permission.length < 10) throw new HttpsError('invalid-argument', 'Falta el permiso de los jugadores (Ley 18.331).');
  return importClients({
    clubId,
    staffUid: uid,
    staffName: String(member.get('displayName') ?? 'Administrador'),
    rows: cleanRows(d.rows),
    permission,
    sourceFile: str(d.sourceFile, 120),
    fileRows: int(d.fileRows ?? 0, 0, 100000, 'filas'),
    merged: int(d.merged ?? 0, 0, 100000, 'repetidos'),
    discarded: int(d.discarded ?? 0, 0, 100000, 'descartadas'),
  });
});

/** Suplente de guardia (etapa 4): "si se baja alguien en ese horario, contá conmigo". */
export const suplenteOfrecer = onCall(async (req) => {
  const uid = requireUid(req);
  const d = (req.data ?? {}) as Record<string, unknown>;
  const clubId = str(d.clubId);
  await requireMember(clubId, uid);
  const date = str(d.date, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HttpsError('invalid-argument', 'Fecha inválida.');
  const startMinute = int(d.startMinute, 0, 1440, 'hora de inicio');
  const endMinute = int(d.endMinute, 0, 1440, 'hora de fin');
  return { standby: await offerStandby({ clubId, uid, date, startMinute, endMinute }) };
});

export const suplenteCancelar = onCall(async (req) => {
  const uid = requireUid(req);
  const d = (req.data ?? {}) as Record<string, unknown>;
  const clubId = str(d.clubId);
  await requireMember(clubId, uid);
  await cancelStandby({ clubId, uid, id: str(d.id) });
  return { result: 'ok' };
});

/** "No puedo" en una invitación. */
export const faltaUnoNoPuedo = onCall(async (req) => {
  const uid = requireUid(req);
  const d = (req.data ?? {}) as Record<string, unknown>;
  const clubId = str(d.clubId);
  await requireMember(clubId, uid);
  await declineInvite({ clubId, searchId: str(d.searchId), uid });
  return { result: 'ok' };
});

/** Sin cuarto: jugar igual, seguir buscando o cancelar. */
export const faltaUnoElegir = onCall(async (req) => {
  const uid = requireUid(req);
  const d = (req.data ?? {}) as Record<string, unknown>;
  const clubId = str(d.clubId);
  await requireMember(clubId, uid);
  const choice = str(d.choice) as FillChoice;
  if (!['keep_searching', 'play_as_three', 'cancel'].includes(choice)) throw new HttpsError('invalid-argument', 'Opción inválida.');
  return chooseUnfilled({ clubId, searchId: str(d.searchId), uid, choice });
});

/** Mostrador: dejar de buscar. */
export const faltaUnoDejarDeBuscar = onCall(async (req) => {
  const uid = requireUid(req);
  const d = (req.data ?? {}) as Record<string, unknown>;
  const clubId = str(d.clubId);
  const member = await requireMember(clubId, uid);
  const role = member.get('role');
  if (role !== 'admin' && role !== 'staff') throw new HttpsError('permission-denied', 'Solo el mostrador o el administrador.');
  await stopSearch(clubId, str(d.searchId));
  return { result: 'ok' };
});

// -----------------------------------------------------------------------------
// Clientes: ficha del club al sumarse desde la app (une por mail verificado o crea una nueva)
// -----------------------------------------------------------------------------

// En la nube de pruebas de Claude el emulador no puede registrar disparadores de Firestore (el proxy
// corta esa llamada local): ahí se corre con SIN_DISPARADORES=1 y la prueba llama la función directo.
export const clientesAlSumarse = process.env.SIN_DISPARADORES === '1' ? undefined : onDocumentCreated('clubs/{clubId}/memberships/{uid}', async (event) => {
  const res = await linkOrCreateClient(event.params.clubId, event.params.uid);
  logger.info('clientes', { clubId: event.params.clubId, uid: event.params.uid, ...res });
});

/** Resultados (etapa 6a): uno de los 4 carga, uno de la otra pareja confirma en 48 h. */
export const resultadoCargar = onCall(async (req) => {
  const uid = requireUid(req);
  const d = (req.data ?? {}) as Record<string, unknown>;
  const clubId = str(d.clubId);
  await requireMember(clubId, uid);
  const bookingId = str(d.bookingId);
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(bookingId)) throw new HttpsError('invalid-argument', 'Partido inválido.');
  if (d.winner !== 'A' && d.winner !== 'B') throw new HttpsError('invalid-argument', 'Elegí quién ganó.');
  const partnerUid = str(d.partnerUid) || undefined;
  return { result: await reportResult({ clubId, uid, bookingId, winner: d.winner, score: str(d.score, 40), partnerUid }) };
});

export const resultadoConfirmar = onCall(async (req) => {
  const uid = requireUid(req);
  const d = (req.data ?? {}) as Record<string, unknown>;
  const clubId = str(d.clubId);
  await requireMember(clubId, uid);
  return { status: await confirmResult({ clubId, uid, bookingId: str(d.bookingId), agree: d.agree === true }) };
});

/** El club (dueño o encargado) acepta o descarta una sugerencia de categoría. */
export const categoriaDecidir = onCall(async (req) => {
  const uid = requireUid(req);
  const d = (req.data ?? {}) as Record<string, unknown>;
  const clubId = str(d.clubId);
  await requireStaff(clubId, uid);
  await decideSuggestion({ clubId, byUid: uid, uid: str(d.uid), accept: d.accept === true });
  return { ok: true };
});
