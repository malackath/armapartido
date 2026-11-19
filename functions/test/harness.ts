// Punto de entrada solo para pruebas: expone el reloj y las reglas sin pasar por Cloud Scheduler.
import '../src/tz';
export { runClock } from '../src/clock';
export { sweepClub } from '../src/engine';
export { categoryFits, isQuietHour, rankCandidates, searchTiming, weeklyLimit, weekKey } from '../src/fillRules';
export { linkOrCreateClient } from '../src/clientes';
export { runAutoFill, slotInBands, dueRunHour } from '../src/autofill';
export { claimSeat, dropFromMatch } from '../src/fill';
export { offerStandby, tryStandbys } from '../src/guardia';
export { reportResult, confirmResult, expireResults, evaluateCategory, decideSuggestion, confirmedResultsOf } from '../src/resultados';
export { runWave } from '../src/fill';
export { authorizeGuest, guestCandidates } from '../src/invitados';
export { alCambiarCuponera, cuponeraPase } from '../src/wallet';
export { armarPase, avisoCambio, nombreCorto, leerCodigoQr } from '../src/wallet/pase';
export { GoogleWallet, linkGuardar, objetoGoogle, idObjeto } from '../src/wallet/google';
export { armarPkpass, passJson, zip, tokenPase, tokenValido } from '../src/wallet/apple';
