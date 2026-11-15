// Punto de entrada solo para pruebas: expone el reloj y el armado sin pasar por Cloud Scheduler.
import '../src/tz';
export { runClock } from '../src/clock';
export { sweepClub } from '../src/engine';
