// Modo invitados (etapa 6b; decisiones 4.6 a/b/c/d de Ber, 17/11/2026).
// Cuando a un partido le falta uno y en la primera tanda no se sumó nadie del club, y el club recibe invitados:
//  - amigos que un socio autorizó (clubs/{club}/guestPasses), con las reglas de categoría de siempre;
//  - jugadores de otros clubes que aceptaron invitaciones (alertPrefs.otherClubs), con categoría confirmada
//    por su club y MISMA categoría exacta, si su club no pidió que no se los ofrezca (guests.shareMyPlayers).
// El invitado paga su parte más el recargo del club. Al sumarse queda una ficha "invitado" en Clientes.
// Privacidad (ley 18.331): el club que recibe no ve su historial en otros clubes; solo nombre y categoría.
import { HttpsError } from 'firebase-functions/v2/https';
import type { AvailabilityWindow, Booking, Club, ClubMembership, FillSearch, Gender, GuestInfo, GuestPass } from '../../src/types/padel';
import { getDayOfWeekFromISO, getTodayISO } from '../../src/lib/padelUtils';
import { db, isFakePlayer, now } from './admin';
import { notify } from './notify';
import { categoryFits, counterFor, genderFits, prefsOf, weeklyLimit, type CurrentPlayer, type InviteCounter } from './fillRules';

export interface GuestCandidate {
  uid: string;
  info: GuestInfo;
  hasCounter: boolean;
}

const covers = (w: AvailabilityWindow[] | undefined, dow: number, start: number, end: number) =>
  (w ?? []).some((x) => x.dayOfWeek === dow && x.startMinute <= start && x.endMinute >= end);

/** ¿Se avisa a invitados en esta tanda? Solo si el club los recibe, y después de la primera tanda del club. */
export function guestsDue(club: Pick<Club, 'guests'>, s: Pick<FillSearch, 'wave' | 'guestsInvited'>, localCandidates: number): boolean {
  if (!club.guests?.enabled || s.guestsInvited) return false;
  return s.wave >= 1 || localCandidates === 0;
}

export async function guestCandidates(p: {
  clubId: string;
  club: Club;
  search: FillSearch;
  current: CurrentPlayer[];
  targetCategory: number;
  members: Set<string>;
  avoid: Map<string, Set<string>>;
  nowDate: Date;
  limit: number;
}): Promise<GuestCandidate[]> {
  const { search: s } = p;
  const surcharge = Math.max(0, Math.round(p.club.guests?.surcharge ?? 0));
  const exclude = new Set([...s.excludedUids, ...s.invitedUids, ...s.filledUids, ...p.current.map((c) => c.uid)]);
  const pool = new Map<string, { kind: GuestInfo['kind']; homeClubId: string; displayName: string; category: number; gender: Gender }>();

  // 1. Amigos que trajo un socio
  const passes = (await db.collection(`clubs/${p.clubId}/guestPasses`).get()).docs.map((d) => d.data() as GuestPass);
  for (const g of passes) pool.set(g.uid, { kind: 'amigo', homeClubId: '', displayName: g.displayName, category: g.category, gender: g.gender });

  // 2. Jugadores de otros clubes (misma categoría exacta, confirmada por su club)
  const clubs = (await db.collection('clubs').get()).docs.filter((d) => d.id !== p.clubId && (d.get('guests') as Club['guests'])?.shareMyPlayers !== false);
  for (const c of clubs) {
    const ms = (await c.ref.collection('memberships').where('category', '==', p.targetCategory).get()).docs.map((d) => d.data() as ClubMembership);
    for (const m of ms) {
      if (m.role !== 'player' || m.blocked || m.categoryReview === 'pendiente' || pool.has(m.uid)) continue;
      pool.set(m.uid, { kind: 'otro_club', homeClubId: c.id, displayName: m.displayName, category: m.category, gender: m.gender });
    }
  }

  const dow = getDayOfWeekFromISO(s.date);
  const uids = [...pool.keys()].filter((u) => !exclude.has(u) && !p.members.has(u));
  if (!uids.length) return [];
  const users = await db.getAll(...uids.map((u) => db.doc(`users/${u}`)));
  const out: (GuestCandidate & { rank: number })[] = [];
  for (const u of users) {
    const g = pool.get(u.id)!;
    const prefs = prefsOf(u.get('alertPrefs'));
    if (g.kind === 'otro_club' && !prefs.otherClubs) continue; // apagado por defecto (4.6b)
    if (g.kind === 'otro_club' && g.category !== p.targetCategory) continue;
    if (!genderFits(s.modality, s.genderNeeded, g.gender)) continue;
    if (!categoryFits(g.category, prefs.maxCategoryGap, p.club.fillMaxGap ?? 1, p.current)) continue;
    const avoid = new Set((u.get('avoidUids') as string[] | undefined) ?? []);
    if (p.current.some((c) => avoid.has(c.uid) || p.avoid.get(c.uid)?.has(u.id))) continue;
    if (!covers(u.get('weeklyAvailability') as AvailabilityWindow[] | undefined, dow, s.startMinute, s.endMinute)) continue;
    const counter = counterFor(u.get('fillCounter') as InviteCounter | undefined, p.nowDate);
    const lim = weeklyLimit(prefs);
    if (counter.weekCount >= lim.week || counter.dayCount >= lim.day) continue;
    out.push({
      uid: u.id,
      hasCounter: true,
      info: { displayName: g.displayName, category: g.category, gender: g.gender, homeClubId: g.homeClubId, kind: g.kind, surcharge },
      rank: (g.kind === 'amigo' ? 0 : 10) + counter.weekCount,
    });
  }
  out.sort((a, b) => a.rank - b.rank || a.uid.localeCompare(b.uid));

  // Nadie en dos lugares a la vez, tampoco entre clubes: se mira su club de origen a esa hora.
  const free: GuestCandidate[] = [];
  for (const c of out) {
    if (free.length >= p.limit) break;
    const clubsToCheck = c.info.homeClubId ? [c.info.homeClubId] : [];
    let busy = false;
    for (const cid of clubsToCheck) {
      const bs = await db.collection(`clubs/${cid}/bookings`).where('date', '==', s.date).where('playerUids', 'array-contains', c.uid).get();
      busy = bs.docs.some((d) => {
        const b = d.data() as Booking;
        return b.status !== 'cancelled' && b.status !== 'no_show' && b.startMinute < s.endMinute && b.endMinute > s.startMinute;
      });
      if (busy) break;
    }
    if (!busy) free.push({ uid: c.uid, info: c.info, hasCounter: c.hasCounter });
  }
  return free;
}

/** Un socio autoriza a un amigo suyo como invitado del club (4.6b: "amigos que un socio invita"). */
export async function authorizeGuest(p: { clubId: string; byUid: string; friendUid: string }): Promise<GuestPass> {
  const cRef = db.doc(`clubs/${p.clubId}`);
  const [byM, friendRel, friendM, friendUser, club] = await Promise.all([
    cRef.collection('memberships').doc(p.byUid).get(),
    db.doc(`users/${p.byUid}/friends/${p.friendUid}`).get(),
    cRef.collection('memberships').doc(p.friendUid).get(),
    db.doc(`users/${p.friendUid}`).get(),
    cRef.get(),
  ]);
  if (!byM.exists) throw new HttpsError('permission-denied', 'No sos jugador de este club.');
  if (!friendRel.exists) throw new HttpsError('failed-precondition', 'Solo podés invitar a alguien de tus amigos.');
  if (friendM.exists) throw new HttpsError('already-exists', 'Ya juega en este club.');
  if (!friendUser.exists) throw new HttpsError('not-found', 'No encontramos a ese jugador.');
  const pass: GuestPass = {
    uid: p.friendUid,
    clubId: p.clubId,
    displayName: String(friendUser.get('displayName') ?? friendRel.get('displayName') ?? 'Jugador').slice(0, 80),
    category: Number(friendUser.get('category') ?? friendRel.get('category') ?? 7),
    gender: (friendUser.get('gender') ?? friendRel.get('gender') ?? 'masculino') as Gender,
    invitedBy: p.byUid,
    invitedByName: String(byM.get('displayName') ?? '').slice(0, 80),
  };
  await cRef.collection('guestPasses').doc(p.friendUid).set({ ...pass, createdAt: now() });
  const clubName = (club.get('name') as string) || 'el club';
  await notify({
    clubId: p.clubId,
    recipientUid: p.friendUid,
    eventType: 'fill_update',
    title: `${pass.invitedByName.split(' ')[0] || 'Un amigo'} te invitó a ${clubName}`,
    body: `Cuando a un partido de tu categoría le falte uno en ${clubName}, te vamos a avisar. Pagás en el club, como siempre.`,
  });
  return pass;
}

export async function removeGuestPass(p: { clubId: string; byUid: string; friendUid: string; isStaff: boolean }) {
  const ref = db.doc(`clubs/${p.clubId}/guestPasses/${p.friendUid}`);
  const g = (await ref.get()).data() as GuestPass | undefined;
  if (!g) return;
  if (g.invitedBy !== p.byUid && !p.isStaff) throw new HttpsError('permission-denied', 'Solo quien lo invitó o el club.');
  await ref.delete();
}

/** Al sumarse un invitado: ficha "invitado" en Clientes (si no tenía), sin datos de otros clubes. */
export async function guestClientRecord(clubId: string, uid: string, info: GuestInfo) {
  if (isFakePlayer(uid)) return;
  const clients = db.collection(`clubs/${clubId}/clients`);
  if (!(await clients.where('uid', '==', uid).limit(1).get()).empty) return;
  const id = `u_${uid}`;
  const name = info.displayName.slice(0, 80);
  try {
    await clients.doc(id).create({
      id, clubId, name, phone: '', noPhone: false, email: '', category: info.category, uid, linkedBy: 'mail',
      linkedAtISO: new Date().toISOString(), origin: 'invitado', createdByUid: uid, createdByName: name.slice(0, 60),
      createdOn: getTodayISO(), noticeGiven: true, acceptsNews: false, rut: '', businessName: '',
      note: info.kind === 'amigo' ? 'Invitado por un socio' : 'Invitado de otro club', balance: 0, status: 'active',
      createdAt: now(), updatedAt: now(),
    });
  } catch {
    // ya existía con ese id: no se pisa
  }
}
