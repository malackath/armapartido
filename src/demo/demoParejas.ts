/**
 * Arma los grupos de jugadores de la demo: cada cancha con 4 jugadores, todos dentro de una
 * categoría de diferencia entre sí (por ejemplo 4ta y 5ta, nunca 4ta con 6ta), y nadie en dos
 * canchas a la misma hora. Pedido de Ber (17/11/2026): "siempre 4 jugadores por cancha, todos de ±1".
 */
import { seeded } from './demoHoy';

export interface DemoPlayerCat {
  uid: string;
  category: number;
}

export interface GroupRequest {
  date: string;
  start: number;
  end: number;
  /** Jugadores que ya están en el turno (el que reservó, el partido armado…). */
  include?: string[];
  /** Categorías que tiene que cubrir el grupo aunque no sean socios con cuenta (cliente del mostrador). */
  cats?: number[];
  /** Cuántos en total (4 salvo casos especiales). */
  size?: number;
}

/** Diferencia máxima de categoría dentro de un mismo partido. */
export const MAX_GAP = 1;

/**
 * `players` son los que se pueden sumar a cualquier turno; `catOf` da la categoría de cualquiera
 * (también de las cuentas de la demo que se ponen a mano con `include`).
 */
export function makeGrouper(players: DemoPlayerCat[], catOf: (uid: string) => number, seed: string) {
  const rnd = seeded(seed);
  const busy = new Map<string, { start: number; end: number; uids: string[] }[]>();

  const isFree = (uid: string, date: string, start: number, end: number) =>
    !(busy.get(date) ?? []).some((b) => b.start < end && b.end > start && b.uids.includes(uid));

  const reserve = (uids: string[], date: string, start: number, end: number) => {
    const list = busy.get(date) ?? [];
    list.push({ start, end, uids: uids.filter(Boolean) });
    busy.set(date, list);
  };

  const shuffle = <T,>(a: T[]) => {
    const out = [...a];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };

  /** Arma el grupo y lo deja ocupado a esa hora. Devuelve los uids (incluidos los que ya estaban). */
  function group(req: GroupRequest): string[] {
    const size = req.size ?? 4;
    const include = (req.include ?? []).filter(Boolean);
    const fixedCats = [...include.map((u) => catOf(u)), ...(req.cats ?? [])];
    const lo = fixedCats.length ? Math.max(1, Math.max(...fixedCats) - MAX_GAP) : 1;
    const hi = fixedCats.length ? Math.min(...fixedCats) : 7 - MAX_GAP;
    const bands = shuffle(Array.from({ length: Math.max(0, hi - lo + 1) }, (_, i) => lo + i));
    const need = size - include.length - (req.cats?.length ?? 0);
    if (need <= 0) {
      reserve(include, req.date, req.start, req.end);
      return include;
    }
    for (const b of bands) {
      const cands = shuffle(
        players.filter((p) => p.category >= b && p.category <= b + MAX_GAP && !include.includes(p.uid) && isFree(p.uid, req.date, req.start, req.end))
      );
      if (cands.length >= need) {
        const out = [...include, ...cands.slice(0, need).map((p) => p.uid)];
        reserve(out, req.date, req.start, req.end);
        return out;
      }
    }
    // Último recurso (no debería pasar): parejos aunque alguno repita hora en otra cancha.
    for (const b of bands) {
      const cands = shuffle(players.filter((p) => p.category >= b && p.category <= b + MAX_GAP && !include.includes(p.uid)));
      if (cands.length >= need) {
        const out = [...include, ...cands.slice(0, need).map((p) => p.uid)];
        reserve(out, req.date, req.start, req.end);
        return out;
      }
    }
    throw new Error(`Demo: no hay ${need} jugadores libres de categoría pareja el ${req.date} a los ${req.start} min`);
  }

  return { group, reserve, isFree };
}

/** Diferencia de categoría de un grupo (para las pruebas). */
export const gapOf = (cats: number[]) => (cats.length ? Math.max(...cats) - Math.min(...cats) : 0);
