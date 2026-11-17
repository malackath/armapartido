// Sumarse a un club que eligió "Solo mis jugadores" (17/11/2026, wireframe informes/validar-jugador).
//
// - Si el mail confirmado del jugador está en una ficha del club (sin app), entra directo y la ficha se le une.
// - Si no, queda un pedido (clubs/{club}/joinRequests/{uid}) que aprueban el dueño, el administrador o el encargado.
// - Por celular nunca se une solo (no está confirmado): solo se le sugiere al club la ficha parecida.
// Los clubes "abiertos" siguen como antes: el celular crea su membresía y el disparador une la ficha.
import { getAuth } from 'firebase-admin/auth';
import { HttpsError } from 'firebase-functions/v2/https';
import type { Club, ClubMembership, JoinRequest, UserProfile } from '../../src/types/padel';
import type { ClubClient } from '../../src/types/clientes';
import type { FixedBooking } from '../../src/types/caja';
import { fixedLabel } from '../../src/lib/importarClientes';
import { findClientForJoin } from '../../src/lib/sumarse';
import { normalizeEmail, normalizePhone } from '../../src/lib/clientes';
import { db, now } from './admin';
import { linkOrCreateClient, transferClientToUid } from './clientes';
import { notify } from './notify';

export type JoinStatus = 'adentro' | 'encontrado' | 'pendiente' | 'rechazado';

export interface JoinAnswer {
  status: JoinStatus;
  /** "martes 20:00 · Cancha 1" si el club ya le tenía un turno fijo. */
  fixed?: string;
}

function membershipFrom(profile: UserProfile, clubId: string): Omit<ClubMembership, 'createdAt' | 'updatedAt'> {
  return {
    uid: profile.uid,
    clubId,
    displayName: String(profile.displayName || 'Jugador').slice(0, 80),
    ...(profile.photoUrl ? { photoUrl: profile.photoUrl } : {}),
    role: 'player',
    category: profile.category,
    gender: profile.gender,
    preferredModality: profile.preferredModality,
    weeklyAvailability: (profile.weeklyAvailability ?? []).slice(0, 21),
    noShowCount: 0,
    blocked: false,
    isDiscoverable: true,
    ...(profile.courtSide ? { courtSide: profile.courtSide } : {}),
    ...(profile.hand ? { hand: profile.hand } : {}),
    categoryReview: 'pendiente',
  };
}

async function createMembership(clubId: string, profile: UserProfile, categoryReview: 'pendiente' | 'ok' = 'pendiente') {
  const ref = db.doc(`clubs/${clubId}/memberships/${profile.uid}`);
  await ref.create({ ...membershipFrom(profile, clubId), categoryReview, createdAt: now(), updatedAt: now() }).catch((e: { code?: number }) => {
    if (e.code !== 6) throw e; // ya existía: no se pisa
  });
}

async function fixedOf(clubId: string, clientId: string): Promise<string | undefined> {
  const snap = await db.collection(`clubs/${clubId}/fixedBookings`).where('clientId', '==', clientId).where('active', '==', true).limit(1).get();
  const f = snap.docs[0]?.data() as FixedBooking | undefined;
  return f ? fixedLabel({ dayOfWeek: f.dayOfWeek, startMinute: f.startMinute, court: f.courtName }) : undefined;
}

/** Dueño, administradores y encargados del club: los que reciben el aviso de un pedido nuevo. */
async function staffUids(clubId: string, club: Club): Promise<string[]> {
  const snap = await db.collection(`clubs/${clubId}/memberships`).where('role', 'in', ['admin', 'staff']).get();
  return [...new Set([club.ownerUid, ...snap.docs.map((d) => d.id)].filter(Boolean))];
}

export async function requestJoin(clubId: string, uid: string): Promise<JoinAnswer> {
  const clubRef = db.doc(`clubs/${clubId}`);
  const [clubSnap, memberSnap, userSnap, privSnap, reqSnap] = await Promise.all([
    clubRef.get(),
    clubRef.collection('memberships').doc(uid).get(),
    db.doc(`users/${uid}`).get(),
    db.doc(`users/${uid}/private/info`).get(),
    clubRef.collection('joinRequests').doc(uid).get(),
  ]);
  if (!clubSnap.exists) throw new HttpsError('not-found', 'No existe el club.');
  if (memberSnap.exists) return { status: 'adentro' };
  if (!userSnap.exists) throw new HttpsError('failed-precondition', 'Primero terminá tu registro.');
  const club = { ...(clubSnap.data() as Club), id: clubId };
  const profile = { ...(userSnap.data() as UserProfile), uid };

  const user = await getAuth().getUser(uid);
  if (!user.emailVerified) throw new HttpsError('failed-precondition', 'Confirmá tu mail para sumarte al club.');
  const email = normalizeEmail(user.email ?? '');
  const phone = normalizePhone(String(privSnap.get('phone') ?? ''));

  if ((club.joinPolicy ?? 'abierto') === 'abierto') {
    await createMembership(clubId, profile);
    await linkOrCreateClient(clubId, uid);
    return { status: 'adentro' };
  }

  const clients = (await clubRef.collection('clients').get()).docs.map((d) => d.data() as ClubClient);
  const { match, similar } = findClientForJoin(clients, email, phone, uid);

  if (match) {
    // Está en la lista del club: entra directo, con la categoría que el club ya le conocía si la tenía.
    await createMembership(clubId, match.category ? { ...profile, category: match.category } : profile, match.category ? 'ok' : 'pendiente');
    if (!match.uid) await transferClientToUid(clubId, match, uid, 'mail');
    await linkOrCreateClient(clubId, uid);
    if (reqSnap.exists) await reqSnap.ref.update({ status: 'aprobado', resolvedByName: 'Su mail estaba en la lista', updatedAt: now() });
    return { status: 'encontrado', fixed: await fixedOf(clubId, match.id) };
  }

  const prev = reqSnap.data() as JoinRequest | undefined;
  if (prev?.status === 'rechazado') return { status: 'rechazado' };
  if (prev?.status === 'pendiente') return { status: 'pendiente' };

  const req: JoinRequest = {
    uid,
    clubId,
    displayName: String(profile.displayName || 'Jugador').slice(0, 80),
    ...(profile.photoUrl ? { photoUrl: profile.photoUrl } : {}),
    email,
    phone,
    category: profile.category,
    status: 'pendiente',
    ...(similar ? { similarClientId: similar.id, similarClientName: similar.name.slice(0, 80) } : {}),
  };
  await reqSnap.ref.set({ ...req, createdAt: now(), updatedAt: now() });
  const first = req.displayName.split(' ')[0];
  await Promise.all(
    (await staffUids(clubId, club)).map((to) =>
      notify({
        clubId,
        recipientUid: to,
        eventType: 'join_request',
        title: `${req.displayName} pide sumarse al club`,
        body: `No encontramos su mail en tu lista de clientes. Aprobá a ${first} en el Mostrador o en Admin → Jugadores.`,
        tab: 'staff',
      })
    )
  );
  return { status: 'pendiente' };
}

export async function resolveJoin(p: { clubId: string; uid: string; action: 'aprobar' | 'unir' | 'rechazar'; byUid: string; byName: string }): Promise<{ status: JoinRequest['status'] }> {
  const clubRef = db.doc(`clubs/${p.clubId}`);
  const reqRef = clubRef.collection('joinRequests').doc(p.uid);
  const [clubSnap, reqSnap, userSnap] = await Promise.all([clubRef.get(), reqRef.get(), db.doc(`users/${p.uid}`).get()]);
  if (!clubSnap.exists) throw new HttpsError('not-found', 'No existe el club.');
  const req = reqSnap.data() as JoinRequest | undefined;
  if (!req) throw new HttpsError('not-found', 'Ese pedido ya no está.');
  if (req.status !== 'pendiente') return { status: req.status };
  const club = { ...(clubSnap.data() as Club), id: p.clubId };

  if (p.action === 'rechazar') {
    await reqRef.update({ status: 'rechazado', resolvedByUid: p.byUid, resolvedByName: p.byName.slice(0, 60), updatedAt: now() });
    await notify({
      clubId: p.clubId,
      recipientUid: p.uid,
      eventType: 'join_resolved',
      title: `${club.name} no confirmó tu pedido`,
      body: 'Si sos jugador del club, hablá con el encargado: quizás te anotaron con otro mail.',
      tab: 'home',
    });
    return { status: 'rechazado' };
  }

  if (!userSnap.exists) throw new HttpsError('failed-precondition', 'El jugador ya no tiene cuenta.');
  const profile = { ...(userSnap.data() as UserProfile), uid: p.uid };

  if (p.action === 'unir') {
    if (!req.similarClientId) throw new HttpsError('failed-precondition', 'Ese pedido no tiene una ficha parecida.');
    const cSnap = await clubRef.collection('clients').doc(req.similarClientId).get();
    const c = cSnap.data() as ClubClient | undefined;
    if (!c || c.status !== 'active' || c.erased || (c.uid && c.uid !== p.uid)) throw new HttpsError('failed-precondition', 'Esa ficha ya no se puede unir.');
    if (!c.uid) await transferClientToUid(p.clubId, c, p.uid, 'mostrador');
  }

  await createMembership(p.clubId, profile);
  await linkOrCreateClient(p.clubId, p.uid);
  await reqRef.update({ status: 'aprobado', resolvedByUid: p.byUid, resolvedByName: p.byName.slice(0, 60), updatedAt: now() });
  await notify({
    clubId: p.clubId,
    recipientUid: p.uid,
    eventType: 'join_resolved',
    title: `¡Ya sos parte de ${club.name}!`,
    body: 'El club confirmó tu pedido. Ya podés reservar y armar partidos.',
    tab: 'home',
  });
  return { status: 'aprobado' };
}
