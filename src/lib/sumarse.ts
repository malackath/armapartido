/**
 * Validar al jugador contra la lista del club al sumarse (17/11/2026). Puro: lo usan el servidor y las pruebas.
 * - Por mail (confirmado): es él. Solo si hay UNA ficha activa con ese mail, sin app o ya unida a él.
 * - Por celular (no confirmado): nunca se une solo; se le muestra al club como "parecido".
 */
import type { ClubClient } from '../types/clientes';
import type { Club, JoinPolicy } from '../types/padel';

export const joinPolicyOf = (club: Pick<Club, 'joinPolicy'> | null | undefined): JoinPolicy => club?.joinPolicy ?? 'abierto';

export function findClientForJoin(
  clients: ClubClient[],
  email: string,
  phone: string,
  uid: string
): { match: ClubClient | null; similar: ClubClient | null } {
  const usable = clients.filter((c) => c.status === 'active' && !c.erased && !c.mergedInto && (!c.uid || c.uid === uid));
  const byEmail = email ? usable.filter((c) => c.email && c.email === email) : [];
  const match = byEmail.length === 1 ? byEmail[0] : null;
  const similar = !match && phone ? usable.find((c) => !c.uid && c.phone === phone) ?? null : null;
  return { match, similar };
}
