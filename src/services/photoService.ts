import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { db, storage } from '../lib/firebase';
import { squareWebp } from '../lib/photo';

/** Sube la foto de perfil achicada y la copia al perfil y a las membresías del jugador en cada club. */
export async function uploadProfilePhoto(uid: string, clubIds: string[], file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Elegí una imagen (JPG, PNG o similar).');
  const blob = await squareWebp(file);
  const r = ref(storage, `avatars/${uid}.webp`);
  await uploadBytes(r, blob, { contentType: 'image/webp', cacheControl: 'public,max-age=86400' });
  // El parámetro v evita que el navegador muestre la foto vieja.
  const url = `${await getDownloadURL(r)}&v=${Date.now()}`;
  await updateDoc(doc(db, 'users', uid), { photoUrl: url, updatedAt: serverTimestamp() });
  // Las membresías se actualizan de a una; si alguna falla (club viejo), la foto igual queda en el perfil.
  await Promise.allSettled(
    clubIds.map((c) => updateDoc(doc(db, 'clubs', c, 'memberships', uid), { photoUrl: url, updatedAt: serverTimestamp() }))
  );
  return url;
}
