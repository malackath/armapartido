/** Registro del jugador y revisión de la categoría por el club (16/11/2026). */
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { db, storage } from '../lib/firebase';
import { squareWebp } from '../lib/photo';
import { formatCategory } from '../lib/padelUtils';
import type { AlertPrefs, AvailabilityWindow, Club, ClubMembership, CourtSide, Gender, Hand, Modality, UserProfile } from '../types/padel';
import { dispatchNotification } from './firestoreService';
import { askToJoin, type JoinAnswer } from './sumarseService';
import { joinPolicyOf } from '../lib/sumarse';

/** Perfil guardado o null si la cuenta todavía no hizo el registro. */
export async function getUserProfileOrNull(uid: string): Promise<UserProfile | null> {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? (snap.data() as UserProfile) : null;
}

/** Sube la foto achicada a Storage y devuelve la dirección. No toca el perfil (todavía no existe). */
export async function uploadSignupPhoto(uid: string, file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Elegí una imagen (JPG, PNG o similar).');
  const blob = await squareWebp(file);
  const r = ref(storage, `avatars/${uid}.webp`);
  await uploadBytes(r, blob, { contentType: 'image/webp', cacheControl: 'public,max-age=86400' });
  return `${await getDownloadURL(r)}&v=${Date.now()}`;
}

export interface SignupData {
  uid: string;
  email: string;
  displayName: string;
  phone: string;
  photoUrl: string;
  category: number;
  gender: Gender;
  preferredModality: Modality;
  courtSide: CourtSide;
  hand?: Hand;
  weeklyAvailability: AvailabilityWindow[];
  alertPrefs: AlertPrefs;
}

function membershipFrom(profile: UserProfile, club: Club): Omit<ClubMembership, 'createdAt' | 'updatedAt'> {
  return {
    uid: profile.uid,
    clubId: club.id,
    displayName: profile.displayName,
    ...(profile.photoUrl ? { photoUrl: profile.photoUrl } : {}),
    role: 'player',
    category: profile.category,
    gender: profile.gender,
    preferredModality: profile.preferredModality,
    weeklyAvailability: profile.weeklyAvailability,
    noShowCount: 0,
    blocked: false,
    isDiscoverable: true,
    ...(profile.courtSide ? { courtSide: profile.courtSide } : {}),
    ...(profile.hand ? { hand: profile.hand } : {}),
    categoryReview: 'pendiente',
  };
}

/**
 * Suma al jugador al club. Necesita el mail confirmado (reglas); si todavía no lo confirmó,
 * devuelve null y la app lo vuelve a intentar cuando entre con el mail confirmado.
 * Club con "Solo mis jugadores": lo resuelve el servidor (entra si su mail está en Clientes; si no, pedido).
 */
export async function joinClub(profile: UserProfile, club: Club): Promise<JoinAnswer | null> {
  if (joinPolicyOf(club) === 'solo_clientes') {
    try {
      return await askToJoin(club.id);
    } catch (e) {
      console.warn('[registro] Todavía no se pudo pedir para sumarse:', e);
      return null;
    }
  }
  try {
    await setDoc(doc(db, 'clubs', club.id, 'memberships', profile.uid), {
      ...membershipFrom(profile, club),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return { status: 'adentro' };
  } catch (e) {
    console.warn('[registro] Todavía no se pudo sumar al club:', e);
    return null;
  }
}

/** Guarda todo el registro de una vez y suma al jugador al club. */
export async function finishSignup(data: SignupData, club: Club | null): Promise<{ profile: UserProfile; joined: boolean; join: JoinAnswer | null }> {
  const profile: UserProfile = {
    uid: data.uid,
    displayName: data.displayName.trim().slice(0, 80),
    ...(data.photoUrl ? { photoUrl: data.photoUrl } : {}),
    category: data.category,
    gender: data.gender,
    preferredModality: data.preferredModality,
    weeklyAvailability: data.weeklyAvailability.slice(0, 21),
    activeClubIds: club ? [club.id] : [],
    alertPrefs: data.alertPrefs,
    courtSide: data.courtSide,
    ...(data.hand ? { hand: data.hand } : {}),
    signupDone: true,
  };
  await setDoc(doc(db, 'users', data.uid), { ...profile, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  // El celular va aparte: solo lo ven el jugador y el club (por la ficha de cliente).
  await setDoc(doc(db, 'users', data.uid, 'private', 'info'), {
    uid: data.uid,
    email: data.email || 'sin-mail@armapartido.com',
    phone: data.phone,
    updatedAt: serverTimestamp(),
  });
  const join = club ? await joinClub(profile, club) : null;
  const joined = join?.status === 'adentro' || join?.status === 'encontrado';
  return { profile, joined, join };
}

/** Guarda cambios del perfil y los copia a la membresía de cada club. */
export async function saveProfileChanges(
  profile: UserProfile,
  changes: Partial<Pick<UserProfile, 'displayName' | 'category' | 'gender' | 'preferredModality' | 'courtSide' | 'hand' | 'weeklyAvailability'>>,
  clubIds: string[]
): Promise<UserProfile> {
  const next = { ...profile, ...changes };
  await updateDoc(doc(db, 'users', profile.uid), { ...changes, updatedAt: serverTimestamp() });
  const memberChanges: Record<string, unknown> = { ...changes, updatedAt: serverTimestamp() };
  // Si cambia su categoría, el club la vuelve a mirar.
  if (changes.category !== undefined && changes.category !== profile.category) memberChanges.categoryReview = 'pendiente';
  await Promise.allSettled(clubIds.map((c) => updateDoc(doc(db, 'clubs', c, 'memberships', profile.uid), memberChanges)));
  return next;
}

/** El club confirma la categoría que eligió el jugador, o la corrige y le avisa. */
export async function reviewMemberCategory(params: {
  club: Club;
  member: ClubMembership;
  category: number;
  byUid: string;
}): Promise<void> {
  const { club, member, category, byUid } = params;
  const changed = category !== member.category;
  await updateDoc(doc(db, 'clubs', club.id, 'memberships', member.uid), {
    category,
    categoryReview: 'ok',
    updatedAt: serverTimestamp(),
  });
  if (changed) {
    await dispatchNotification({
      clubId: club.id,
      recipientUid: member.uid,
      eventType: 'category_changed',
      title: `${club.name} te puso en ${formatCategory(category)}`,
      body: `Elegiste ${formatCategory(member.category)}. Para armarte partidos, en ${club.name} jugás en ${formatCategory(category)}.`,
      currentUserUid: byUid,
      tab: 'profile',
    }).catch(() => undefined);
  }
}

/** Cambia el celular del jugador (lo ve solo el club). */
export async function savePrivatePhone(uid: string, email: string, phone: string): Promise<void> {
  await setDoc(doc(db, 'users', uid, 'private', 'info'), { uid, email: email || 'sin-mail@armapartido.com', phone, updatedAt: serverTimestamp() });
}
