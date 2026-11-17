// Resultados y categoría sugerida (etapa 6a; decisiones 4.1, 4.2 y 4.3 de Ber, 17/11/2026).
// Lógica pura: la usan el servidor (sugerencias al club) y la app (racha del jugador).
import { addDaysISO, formatCategory } from './padelUtils';

/** Reglas internas de la sugerencia. El jugador nunca las ve; el club ve el motivo en palabras. */
export const REGLAS_CATEGORIA = {
  ventana: 10, // últimos N partidos confirmados
  subirGanados: 7, // ganar 7 de 10…
  subirContraIgualOMejor: 3, // …con al menos 3 victorias contra parejas de su categoría o mejor
  bajarPerdidos: 8, // perder 8 de 10
  esperaTrasNo: 5, // si el club dice que no, 5 partidos más antes de volver a sugerir
  horasParaConfirmar: 48,
  diasParaCargar: 7, // un partido se puede cargar hasta 7 días después
} as const;

/** Un partido visto desde un jugador. Categorías: 1 = 1ra (la mejor) … 7 = 7ma. */
export interface MyResult {
  date: string;
  won: boolean;
  /** Categorías de los dos rivales al momento de evaluar. */
  rivalCats: number[];
}

export interface Suggestion {
  to: number;
  reason: string;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

/**
 * ¿Hay que sugerirle al club un cambio de categoría? `results` = confirmados, de cualquier orden.
 * Mira los últimos `ventana`. Sin la ventana completa no sugiere nada.
 */
export function suggestCategory(category: number, results: MyResult[]): Suggestion | null {
  const R = REGLAS_CATEGORIA;
  const last = [...results].sort((a, b) => b.date.localeCompare(a.date)).slice(0, R.ventana);
  if (last.length < R.ventana) return null;
  const won = last.filter((r) => r.won);
  const lost = last.filter((r) => !r.won);
  // "Igual o mejor": promedio de los rivales en su categoría o en una más alta (número menor o igual).
  const strongWins = won.filter((r) => avg(r.rivalCats) <= category + 0.01);
  if (category > 1 && won.length >= R.subirGanados && strongWins.length >= R.subirContraIgualOMejor) {
    const top = Math.min(...strongWins.map((r) => Math.round(avg(r.rivalCats))));
    return {
      to: category - 1,
      reason: `Ganó ${won.length} de sus últimos ${last.length} partidos, ${strongWins.length} contra parejas de ${formatCategory(Math.min(category, top))}${top < category ? ' o mejores' : ''}.`,
    };
  }
  if (category < 7 && lost.length >= R.bajarPerdidos) {
    const weakLosses = lost.filter((r) => avg(r.rivalCats) >= category - 0.01).length;
    return {
      to: category + 1,
      reason: `Perdió ${lost.length} de sus últimos ${last.length} partidos${weakLosses ? `, ${weakLosses} contra parejas de ${formatCategory(category)} o de abajo` : ''}.`,
    };
  }
  return null;
}

/** Lunes de la semana de una fecha ISO. */
function mondayOf(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  const dow = (d.getDay() + 6) % 7; // 0 = lunes
  return addDaysISO(iso, -dow);
}

/**
 * Lo que ve el jugador (4.3): jugados, este mes y semanas seguidas jugando (contando la actual
 * solo si ya jugó; si esta semana todavía no, la racha sigue viva desde la anterior).
 */
export function playerStreak(dates: string[], todayISO: string): { played: number; thisMonth: number; weeksInARow: number } {
  const past = dates.filter((d) => d && d <= todayISO);
  const month = todayISO.slice(0, 7);
  const weeks = new Set(past.map(mondayOf));
  let w = mondayOf(todayISO);
  if (!weeks.has(w)) w = addDaysISO(w, -7);
  let streak = 0;
  while (weeks.has(w)) {
    streak++;
    w = addDaysISO(w, -7);
  }
  return { played: past.length, thisMonth: past.filter((d) => d.startsWith(month)).length, weeksInARow: streak };
}
