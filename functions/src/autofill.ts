// "Llenar turnos libres" automático (especificación falta-uno-automatico.md, 4.4 y D12).
// Dos veces por día (9:00 y 14:00, hora de Montevideo) mira las canchas vacías de hoy y mañana en las
// franjas que el club encendió. Si hay al menos 6 jugadores de una misma ventana de categorías que dijeron
// que pueden a esa hora, abre un turno libre y los invita por tandas con el mismo motor de "Llenar con la
// app". A diferencia del botón del mostrador, NO retiene la cancha: si alguien la reserva antes de que se
// junten los 4, la búsqueda se apaga sola y se avisa a los que se habían sumado.
import type { AutoFillBand, AutoFillConfig, AutoFillReport, Booking, Club, Court, FillSearch, Modality } from '../../src/types/padel';
import { addDaysISO, generateDaySlots, getDayOfWeekFromISO } from '../../src/lib/padelUtils';
import { db, now } from './admin';
import { AUTO_FILL_UID } from './fill';
import { AUTO_CLOSE_BEFORE_MIN, MIN_LEAD_MINUTES, bestCategoryWindow, isoDate, minutesUntil } from './fillRules';
import { candidatesFor, liveFreeSlotSearch, loadContext, openFreeSlot } from './hueco';

/** Horas de la revisión automática. */
export const AUTO_RUN_HOURS = [9, 14] as const;
/** Si el reloj se atrasó, la revisión igual corre dentro de este margen (horas). */
export const AUTO_RUN_GRACE_HOURS = 2;
/** Mínimo de candidatos para abrir un turno libre (con menos no se avisa: quemaría el tope). */
export const AUTO_MIN_CANDIDATES = 6;
/** Tiempo mínimo entre la revisión y el cierre de la búsqueda, para que dé a juntar 4. */
export const AUTO_MIN_SEARCH_MINUTES = 60;
/** Tope de turnos libres que abre una revisión (por club), para no inundar de avisos. */
export const AUTO_MAX_PER_RUN = 6;

const MODALITIES: Modality[] = ['masculino', 'femenino', 'mixto'];

export function slotInBands(bands: AutoFillBand[], date: string, startMinute: number): boolean {
  const dow = getDayOfWeekFromISO(date);
  return bands.some((b) => b.days.includes(dow) && startMinute >= b.fromMinute && startMinute < b.toMinute);
}

export function autoFillOn(cfg: AutoFillConfig | undefined): cfg is AutoFillConfig {
  return !!cfg && cfg.enabled === true && Array.isArray(cfg.bands) && cfg.bands.length > 0;
}

/** Qué revisión toca a esta hora (9 o 14), o null si ninguna. */
export function dueRunHour(nowDate: Date): number | null {
  const h = nowDate.getHours();
  for (const run of [...AUTO_RUN_HOURS].reverse()) {
    if (h >= run && h < run + AUTO_RUN_GRACE_HOURS) return run;
  }
  return null;
}

function overlaps(b: Booking, start: number, end: number) {
  return b.status !== 'cancelled' && b.status !== 'no_show' && b.startMinute < end && b.endMinute > start;
}

/** Revisa hoy y mañana y abre los turnos libres que correspondan. */
export async function runAutoFill(clubId: string, nowDate = new Date(), trigger: AutoFillReport['trigger'] = 'scheduled'): Promise<AutoFillReport> {
  const cRef = db.doc(`clubs/${clubId}`);
  const club = { ...((await cRef.get()).data() as Club), id: clubId };
  const report: AutoFillReport = { ranAt: nowDate.toISOString(), trigger, enabled: autoFillOn(club.autoFill), checkedSlots: 0, opened: [], skipped: [] };
  if (!autoFillOn(club.autoFill)) return report;
  const bands = club.autoFill.bands;

  const courts = (await cRef.collection('courts').get()).docs
    .map((d) => ({ ...(d.data() as Court), id: d.id }))
    .filter((c) => c.active !== false)
    .sort((a, b) => a.name.localeCompare(b.name, 'es', { numeric: true }));
  const slots = generateDaySlots(club);
  const today = isoDate(nowDate);
  const dates = [today, addDaysISO(today, 1)];

  for (const date of dates) {
    const [bookingsSnap, searchesSnap] = await Promise.all([
      cRef.collection('bookings').where('date', '==', date).get(),
      cRef.collection('fillSearches').where('date', '==', date).get(),
    ]);
    const bookings = bookingsSnap.docs.map((d) => d.data() as Booking);
    const searches = searchesSnap.docs.map((d) => d.data() as FillSearch);
    for (const slot of slots) {
      if (!slotInBands(bands, date, slot.startMinute)) continue;
      report.checkedSlots++;
      const base = { date, startMinute: slot.startMinute };
      // Tiene que quedar al menos una hora para juntar gente antes del cierre (2 h antes del turno).
      const left = minutesUntil(date, slot.startMinute, nowDate);
      if (left < AUTO_CLOSE_BEFORE_MIN + AUTO_MIN_SEARCH_MINUTES || left < MIN_LEAD_MINUTES + 15) {
        if (left > 0) report.skipped.push({ ...base, reason: 'too_late' });
        continue;
      }
      // Una sola invitación automática por horario (y nunca dos veces el mismo): no avisar dos veces a los mismos.
      if (searches.some((s) => s.auto && s.startMinute === slot.startMinute)) {
        report.skipped.push({ ...base, reason: 'already_tried' });
        continue;
      }
      const court = courts.find(
        (c) => !bookings.some((b) => b.courtId === c.id && overlaps(b, slot.startMinute, slot.endMinute)) && !liveFreeSlotSearch(searches, c.id, slot.startMinute, slot.endMinute)
      );
      if (!court) {
        report.skipped.push({ ...base, reason: 'no_free_court' });
        continue;
      }
      if (report.opened.length >= AUTO_MAX_PER_RUN) {
        report.skipped.push({ ...base, reason: 'limit' });
        continue;
      }
      // Candidatos con los topes al día (cada turno abierto ya descontó a los que avisó).
      const ctx = await loadContext(clubId, date);
      const gap = ctx.club.fillMaxGap ?? 1;
      const options = MODALITIES.map((modality) => {
        const cands = candidatesFor(ctx, { date, startMinute: slot.startMinute, endMinute: slot.endMinute, modality, nowDate });
        return { modality, ...bestCategoryWindow(cands.map((c) => c.category), gap) };
      });
      // Primero masculino o femenino si alcanza; si no, mixto.
      const gendered = options.filter((o) => o.modality !== 'mixto').sort((a, b) => b.count - a.count)[0];
      const mixto = options.find((o) => o.modality === 'mixto')!;
      const pick = gendered.count >= AUTO_MIN_CANDIDATES ? gendered : mixto;
      if (pick.count < AUTO_MIN_CANDIDATES) {
        report.skipped.push({ ...base, reason: 'few_players', candidates: pick.count });
        continue;
      }
      try {
        const r = await openFreeSlot({
          clubId,
          courtId: court.id,
          date,
          startMinute: slot.startMinute,
          modality: pick.modality,
          discountPct: 0,
          staffUid: AUTO_FILL_UID,
          nowDate,
          auto: true,
          window: { min: pick.min, max: pick.max },
        });
        report.opened.push({
          ...base,
          courtName: court.name,
          modality: pick.modality,
          minCategory: r.window.min,
          maxCategory: r.window.max,
          candidates: pick.count,
          invited: r.invited,
          searchId: r.searchId,
        });
        searches.push({ auto: true, kind: 'free_slot', status: 'searching', courtId: court.id, startMinute: slot.startMinute, endMinute: slot.endMinute } as FillSearch);
      } catch {
        // Se ocupó justo en este momento: sigue con el próximo.
        report.skipped.push({ ...base, reason: 'no_free_court' });
      }
    }
  }
  return report;
}

/**
 * Lo llama el reloj de cada minuto. Corre la revisión de las 9:00 o de las 14:00 una sola vez por día
 * (el registro en autoFillRuns hace de candado aunque el reloj corra dos veces a la vez).
 */
export async function maybeRunAutoFill(clubId: string, club: Club, nowDate = new Date()): Promise<AutoFillReport | null> {
  if (!autoFillOn(club.autoFill)) return null;
  const run = dueRunHour(nowDate);
  if (run === null) return null;
  const ref = db.doc(`clubs/${clubId}/autoFillRuns/${isoDate(nowDate)}_${String(run).padStart(2, '0')}`);
  try {
    await ref.create({ startedAt: nowDate.toISOString(), createdAt: now() });
  } catch {
    return null; // ya corrió
  }
  const report = await runAutoFill(clubId, nowDate, 'scheduled');
  await ref.set({ ...report, finishedAt: new Date().toISOString() }, { merge: true });
  return report;
}

/** "Revisar ahora" desde Admin (también sirve para mostrarlo en la demo). */
export async function runAutoFillNow(clubId: string, nowDate = new Date()): Promise<AutoFillReport> {
  const report = await runAutoFill(clubId, nowDate, 'manual');
  const id = `${isoDate(nowDate)}_manual_${String(nowDate.getHours()).padStart(2, '0')}${String(nowDate.getMinutes()).padStart(2, '0')}${String(nowDate.getSeconds()).padStart(2, '0')}`;
  await db.doc(`clubs/${clubId}/autoFillRuns/${id}`).set({ ...report, createdAt: now() });
  return report;
}
