/**
 * Plantillas mínimas de mail (HTML con tablas y estilos en línea, como el informe del mes).
 * Base común + "Confirmá tu cuenta" + aviso genérico (los avisos con mail de notify.ts).
 * El diseño del informe mensual NO está acá: espera el OK de Ber (src/lib/informeMail.ts).
 */

const C = { teal: '#0a5761', dark: '#172123', mist: '#ecfcfc', gray: '#5b6b6d', line: '#d6e6e7', bg: '#e9eeee' };
const FONT = "Outfit, 'Helvetica Neue', Arial, sans-serif";

export const APP_URL = process.env.APP_URL || 'https://demo.armapartido.com';
const LOGO_URL = `${APP_URL}/brand/logo-horizontal-color.png`;

export const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export interface Mail {
  subject: string;
  html: string;
  text: string;
}

interface LayoutParts {
  title: string;
  preheader: string;
  /** Párrafos ya escapados (pueden traer <b>). */
  paragraphs: string[];
  button?: { label: string; url: string };
  /** Línea chica al pie (ya escapada). */
  footnote?: string;
  clubName?: string;
}

function layout(p: LayoutParts): string {
  const btn = p.button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 6px"><tr><td style="background:${C.teal};border-radius:12px">
        <a href="${esc(p.button.url)}" style="display:inline-block;padding:14px 26px;font-family:${FONT};font-size:16px;font-weight:700;color:#ffffff;text-decoration:none">${esc(p.button.label)}</a>
      </td></tr></table>`
    : '';
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(p.title)}</title></head>
<body style="margin:0;padding:0;background:${C.bg}">
<div style="display:none;max-height:0;overflow:hidden">${esc(p.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden">
  <tr><td style="padding:20px 28px;border-bottom:1px solid ${C.line}">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td valign="middle"><img src="${esc(LOGO_URL)}" alt="Armá Partido" height="30" style="display:block;height:30px;border:0"></td>
      ${p.clubName ? `<td align="right" valign="middle" style="font-family:${FONT};font-size:13px;color:${C.gray}">${esc(p.clubName)}</td>` : ''}
    </tr></table>
  </td></tr>
  <tr><td style="padding:28px 28px 8px">
    <div style="font-family:${FONT};font-size:24px;line-height:1.2;font-weight:700;color:${C.dark}">${esc(p.title)}</div>
    ${p.paragraphs.map((t) => `<p style="font-family:${FONT};font-size:16px;line-height:1.5;color:${C.dark};margin:14px 0 0">${t}</p>`).join('\n    ')}
    ${btn}
  </td></tr>
  <tr><td style="padding:18px 28px 26px">
    ${p.footnote ? `<p style="font-family:${FONT};font-size:13px;line-height:1.45;color:${C.gray};margin:0 0 10px">${p.footnote}</p>` : ''}
    <p style="font-family:${FONT};font-size:13px;line-height:1.45;color:${C.gray};margin:0">Armá Partido · <a href="${esc(APP_URL)}" style="color:${C.teal}">${esc(APP_URL.replace(/^https?:\/\//, ''))}</a></p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

/** Mail de "Confirmá tu cuenta" (registro). `link` = enlace de verificación de Firebase Auth. */
export function confirmAccountMail(o: { firstName: string; link: string; clubName?: string }): Mail {
  const subject = 'Confirmá tu cuenta de Armá Partido';
  const hola = o.firstName ? `Hola, ${esc(o.firstName)}.` : 'Hola.';
  const html = layout({
    title: 'Confirmá tu cuenta',
    preheader: 'Tocá el botón para confirmar tu mail y empezar a reservar canchas.',
    clubName: o.clubName,
    paragraphs: [
      `${hola} Ya casi está: confirmá que este mail es tuyo y listo, podés reservar canchas y armar partidos de tu categoría.`,
    ],
    button: { label: 'Confirmar mi cuenta', url: o.link },
    footnote: 'Si no creaste una cuenta en Armá Partido, ignorá este mail: no pasa nada.',
  });
  const text = `${o.firstName ? `Hola, ${o.firstName}.` : 'Hola.'} Confirmá tu cuenta de Armá Partido entrando a este enlace:\n${o.link}\n\nSi no creaste una cuenta, ignorá este mail.`;
  return { subject, html, text };
}

/** Aviso genérico (reserva confirmada, partido armado, torneo…): título + texto + botón a la app. */
export function noticeMail(o: { title: string; body: string; url: string; clubName?: string }): Mail {
  const html = layout({
    title: o.title,
    preheader: o.body.slice(0, 120),
    clubName: o.clubName,
    paragraphs: [esc(o.body)],
    button: { label: 'Abrir Armá Partido', url: o.url },
    footnote: 'Te llega porque tenés cuenta en Armá Partido.',
  });
  return { subject: o.title, html, text: `${o.body}\n\nAbrir Armá Partido: ${o.url}` };
}
