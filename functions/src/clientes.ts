/**
 * Ficha de cliente al sumarse a un club desde la app (especificación clientes-ventas-kpis, sección 4).
 *
 * Cuando alguien se hace jugador de un club:
 * 1. Si ya hay una ficha unida a su cuenta, no se hace nada.
 * 2. Si hay UNA ficha sin app con su mismo mail y el mail está verificado, se une sola
 *    (linkedBy 'mail'): pasan lo que debe, sus cuponeras y su saldo, y sus turnos del mostrador.
 * 3. Si no, se crea una ficha nueva con origen "la app". Si el celular que cargó coincide con una
 *    ficha sin app, las dos quedan como "posible repetido" para que el club las una (nunca se une
 *    sola por celular: el celular no está verificado).
 */
import { getAuth } from 'firebase-admin/auth';
import type { ClubClient } from '../../src/types/clientes';
import type { Booking } from '../../src/types/padel';
import type { Consumption } from '../../src/types/caja';
import { normalizeEmail, normalizePhone } from '../../src/lib/clientes';
import { getTodayISO } from '../../src/lib/padelUtils';
import { db, isFakePlayer, now } from './admin';

export type LinkResult = { action: 'ya_tenia' | 'unida_por_mail' | 'creada' | 'creada_posible_repetido' | 'salteada'; clientId?: string };

export async function linkOrCreateClient(clubId: string, uid: string): Promise<LinkResult> {
  if (isFakePlayer(uid)) return { action: 'salteada' };
  const club = db.doc(`clubs/${clubId}`);
  const [mSnap, userSnap, privSnap] = await Promise.all([
    club.collection('memberships').doc(uid).get(),
    db.doc(`users/${uid}`).get(),
    db.doc(`users/${uid}/private/info`).get(),
  ]);
  const m = mSnap.data();
  if (!m || m.role !== 'player') return { action: 'salteada' };

  const clients = club.collection('clients');
  const mine = await clients.where('uid', '==', uid).limit(1).get();
  if (!mine.empty) return { action: 'ya_tenia', clientId: mine.docs[0].id };

  let email = '';
  let verified = false;
  try {
    const u = await getAuth().getUser(uid);
    email = normalizeEmail(u.email ?? '');
    verified = !!u.emailVerified;
  } catch {
    email = normalizeEmail(String(privSnap.get('email') ?? ''));
  }
  const phone = normalizePhone(String(privSnap.get('phone') ?? ''));
  const name = String(m.displayName || userSnap.get('displayName') || 'Jugador').slice(0, 80);
  const todayISO = getTodayISO();

  // 2. Unir por mail verificado (solo si hay exactamente una ficha sin app con ese mail)
  if (email && verified) {
    const same = (await clients.where('email', '==', email).get()).docs
      .map((d) => d.data() as ClubClient)
      .filter((c) => c.status === 'active' && !c.uid && !c.erased);
    if (same.length === 1) {
      const c = same[0];
      const batch = db.batch();
      batch.update(clients.doc(c.id), { uid, linkedBy: 'mail', linkedAtISO: new Date().toISOString(), updatedAt: now() });
      const old = `c:${c.id}`;
      const [cons, bks, packs] = await Promise.all([
        club.collection('consumptions').where('participantUids', 'array-contains', old).get(),
        club.collection('bookings').where('clientId', '==', c.id).get(),
        club.collection('clientPacks').where('clientId', '==', c.id).get(),
      ]);
      cons.docs.forEach((d) => {
        const x = d.data() as Consumption;
        if (x.status !== 'pending') return;
        batch.update(d.ref, {
          participantUids: x.participantUids.map((k) => (k === old ? uid : k)),
          paidUids: x.paidUids.map((k) => (k === old ? uid : k)),
          ...(x.forUid === '' && !x.shared ? { forUid: uid } : {}),
          updatedAt: now(),
        });
      });
      bks.docs.forEach((d) => {
        const b = d.data() as Booking;
        if (b.type === 'counter' && b.playerUids.length === 0 && (b.status === 'confirmed' || b.status === 'held') && b.date >= todayISO) {
          batch.update(d.ref, { playerUids: [uid], updatedAt: now() });
        }
      });
      packs.docs.forEach((d) => batch.update(d.ref, { uid, updatedAt: now() }));
      await batch.commit();
      return { action: 'unida_por_mail', clientId: c.id };
    }
  }

  // 3. Ficha nueva con origen "la app"
  const samePhone = phone
    ? (await clients.where('phone', '==', phone).get()).docs.map((d) => d.data() as ClubClient).filter((c) => c.status === 'active' && !c.uid)
    : [];
  const c: ClubClient = {
    id: `u_${uid}`,
    clubId,
    name,
    phone,
    noPhone: false,
    email,
    category: typeof m.category === 'number' ? m.category : null,
    uid,
    linkedBy: 'mail',
    linkedAtISO: new Date().toISOString(),
    origin: 'app',
    createdByUid: uid,
    createdByName: name.slice(0, 60),
    createdOn: todayISO,
    // Al registrarse en la app aceptó el aviso de datos del club
    noticeGiven: true,
    acceptsNews: false,
    rut: '',
    businessName: '',
    note: '',
    balance: 0,
    status: 'active',
    ...(samePhone.length ? { reviewDuplicate: true } : {}),
  };
  const batch = db.batch();
  // create (no set): si el mostrador o la carga de la demo ya la hicieron con el mismo id, no se pisa
  batch.create(clients.doc(c.id), { ...c, createdAt: now(), updatedAt: now() });
  samePhone.forEach((s) => batch.update(clients.doc(s.id), { reviewDuplicate: true, updatedAt: now() }));
  try {
    await batch.commit();
  } catch (err) {
    if ((err as { code?: number }).code === 6) return { action: 'ya_tenia', clientId: c.id };
    throw err;
  }
  return { action: samePhone.length ? 'creada_posible_repetido' : 'creada', clientId: c.id };
}
