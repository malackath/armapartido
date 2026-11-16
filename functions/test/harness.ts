// Punto de entrada solo para pruebas: expone el reloj y las reglas sin pasar por Cloud Scheduler.
import '../src/tz';
export { runClock } from '../src/clock';
export { sweepClub } from '../src/engine';
export { categoryFits, isQuietHour, rankCandidates, searchTiming, weeklyLimit, weekKey } from '../src/fillRules';
export { linkOrCreateClient } from '../src/clientes';
