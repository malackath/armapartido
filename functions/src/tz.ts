// Todas las reglas de horario se calculan en hora de Montevideo (Uruguay no cambia la hora desde 2015).
// Este módulo se importa primero en index.ts para que rija antes de cualquier cálculo de fechas.
process.env.TZ = 'America/Montevideo';

export {};
