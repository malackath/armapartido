import { logger } from 'firebase-functions';
import type { Booking, MatchRequest, ProposedMatch } from '../../src/types/padel';
import { formatDateFriendly, formatMinutes, getTodayISO } from '../../src/lib/padelUtils';
import { db, now } from './admin';
import { afterRelease, releaseMatch } from './engine';
import { notify } from './notify';

export interface ClockReport {
  clubs: number;
  expiredMatches: number;
  releasedHolds: number;
  unfilledAlerts: number;
  expiredRequests: number;
}

function minutesNow(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

/**
 * El reloj del armado. Corre cada minuto y hace cumplir lo que antes solo se guardaba:
 * 1. Propuestas vencidas: libera la cancha, los que no contestaron quedan afuera, se busca reemplazo.
 * 2. Canchas retenidas sin propuesta viva y con plazo vencido: se liberan.
 * 3. Pedidos del mismo día sin armar: aviso automático una hora antes (antes era un botón).
 * 4. Pedidos puntuales cuya franja ya pasó: quedan vencidos.
 */
export async function runClock(nowDate = new Date()): Promise<ClockReport> {
  const nowISO = nowDate.toISOString();
  const today = getTodayISO();
  const nowMin = minutesNow();
  const report: ClockReport = { clubs: 0, expiredMatches: 0, releasedHolds: 0, unfilledAlerts: 0, expiredRequests: 0 };

  const clubs = await db.collection('clubs').get();
  for (const clubDoc of clubs.docs) {
    report.clubs++;
    const clubId = clubDoc.id;
    const clubName = (clubDoc.get('name') as string) || 'tu club';
    try {
      const [pending, held, waiting] = await Promise.all([
        clubDoc.ref.collection('proposedMatches').where('status', '==', 'pending').get(),
        clubDoc.ref.collection('bookings').where('status', '==', 'held').get(),
        clubDoc.ref.collection('matchRequests').where('status', '==', 'waiting').get(),
      ]);

      // 1. Propuestas vencidas
      const liveBookingIds = new Set<string>();
      for (const d of pending.docs) {
        const m = d.data() as ProposedMatch;
        if (!m.expiresAt || m.expiresAt > nowISO) {
          liveBookingIds.add(m.bookingId);
          continue;
        }
        const released = await releaseMatch(clubId, d.id, { expired: true });
        if (!released) continue;
        report.expiredMatches++;
        const when = `${formatDateFriendly(released.date, false)} ${formatMinutes(released.startMinute)} hs`;
        await Promise.all(
          released.slots.map((s) =>
            notify({
              clubId,
              recipientUid: s.uid,
              eventType: 'match_expired',
              title: `Venció el plazo · ${clubName}`,
              body:
                s.status === 'accepted'
                  ? `No confirmaron los 4 a tiempo el partido del ${when}. Se liberó la cancha y seguimos buscando con tu pedido.`
                  : `No confirmaste a tiempo el partido del ${when}. Se liberó la cancha.`,
            })
          )
        );
        await afterRelease(clubId, released, 'system_clock');
      }

      // 2. Canchas retenidas huérfanas
      for (const d of held.docs) {
        const b = d.data() as Booking;
        if (liveBookingIds.has(d.id)) continue;
        if (!b.holdExpiresAt || b.holdExpiresAt > nowISO) continue;
        await d.ref.update({ status: 'cancelled', updatedAt: now() });
        report.releasedHolds++;
      }

      // 3 y 4. Pedidos en espera
      for (const d of waiting.docs) {
        const r = d.data() as MatchRequest;
        if (r.requestType !== 'priority') continue;
        const past = r.date < today || (r.date === today && nowMin >= r.endMinute);
        if (past) {
          await d.ref.update({ status: 'expired', updatedAt: now() });
          report.expiredRequests++;
          continue;
        }
        const dueAlert =
          r.date === today && !r.unfilledAlertSent && nowMin >= r.startMinute - 60 && nowMin < r.startMinute;
        if (dueAlert) {
          await d.ref.update({ unfilledAlertSent: true, updatedAt: now() });
          const recipients = [r.creatorUid, r.partnerUid].filter(Boolean);
          await Promise.all(
            recipients.map((uid) =>
              notify({
                clubId,
                recipientUid: uid,
                eventType: 'match_unfilled_1h',
                title: `Sin partido armado todavía · ${clubName}`,
                body: `Falta 1 hora para tu franja de hoy (${formatMinutes(r.startMinute)}–${formatMinutes(r.endMinute)}) y aún no se completaron 4 jugadores.`,
              })
            )
          );
          report.unfilledAlerts++;
        }
      }
    } catch (err) {
      logger.error('clock failed for club', { clubId, err: String(err) });
    }
  }
  return report;
}
