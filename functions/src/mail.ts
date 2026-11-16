/**
 * Envío de mails con Resend (https://resend.com/docs/api-reference/emails/send-email).
 * - La clave vive en Secret Manager (RESEND_API_KEY), nunca en el código.
 * - MAIL_SOLO_A (también secreto): lista de mails separados por coma a los que SÍ se puede mandar.
 *   "*" = a cualquiera (producción). Vacío o sin cargar = no sale ningún mail.
 *   En la demo vale el mail de Ber: así ningún tercero recibe nada sin su OK.
 * - Nunca tira error: un mail que falla no puede romper una reserva ni el armado.
 * - Deja registro en la colección mailLog (solo servidor).
 */
import { logger } from 'firebase-functions';
import { defineSecret } from 'firebase-functions/params';
import { db, now } from './admin';
import type { Mail } from './mailTemplates';

export const RESEND_API_KEY = defineSecret('RESEND_API_KEY');
export const MAIL_SOLO_A = defineSecret('MAIL_SOLO_A');

export const MAIL_FROM = process.env.MAIL_FROM || 'Armá Partido <avisos@armapartido.com>';

export type MailResult = { status: 'enviado'; id: string } | { status: 'salteado' | 'error'; reason: string };

function readSecret(s: ReturnType<typeof defineSecret>): string {
  try {
    return (s.value() || '').trim();
  } catch {
    return '';
  }
}

const EMAIL_RE = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;

export function allowedRecipient(to: string, allowList: string): boolean {
  const list = allowList.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (list.includes('*')) return true;
  return list.includes(to.trim().toLowerCase());
}

export async function sendMail(to: string, mail: Mail, tag: string): Promise<MailResult> {
  const result = await deliver(to, mail);
  try {
    await db.collection('mailLog').add({
      to: to.toLowerCase(),
      subject: mail.subject.slice(0, 200),
      tag,
      ...result,
      createdAt: now(),
    });
  } catch (err) {
    logger.warn('mailLog no se pudo escribir', { err: String(err) });
  }
  return result;
}

async function deliver(to: string, mail: Mail): Promise<MailResult> {
  if (!EMAIL_RE.test(to)) return { status: 'salteado', reason: 'mail inválido' };
  if (to.toLowerCase().endsWith('@demo.armapartido.com')) return { status: 'salteado', reason: 'cuenta de demo' };
  if (!allowedRecipient(to, readSecret(MAIL_SOLO_A))) return { status: 'salteado', reason: 'fuera de MAIL_SOLO_A' };
  const key = readSecret(RESEND_API_KEY);
  if (!key) return { status: 'salteado', reason: 'sin RESEND_API_KEY' };

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: MAIL_FROM, to: [to], subject: mail.subject, html: mail.html, text: mail.text }),
    });
    const data = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok || !data.id) {
      logger.error('Resend rechazó el mail', { status: res.status, message: data.message });
      return { status: 'error', reason: `Resend ${res.status}: ${data.message || 'sin detalle'}` };
    }
    return { status: 'enviado', id: data.id };
  } catch (err) {
    logger.error('Resend no respondió', { err: String(err) });
    return { status: 'error', reason: String(err).slice(0, 200) };
  }
}
