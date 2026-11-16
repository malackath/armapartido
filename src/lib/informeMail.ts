/**
 * Mail del informe mensual "Lo que ganaste con Armá Partido".
 * HTML con tablas y estilos en línea (los programas de mail no leen CSS moderno).
 * Respeta la vista previa de docs/vistas-previas-especificacion/informe-mensual-mail.png.
 * Lo usa el Admin (vista previa) y lo va a usar el servidor el día 1 de cada mes.
 */
import type { MonthlyReport } from '../types/caja';
import { monthLabel } from './caja';

const C = { teal: '#0a5761', cian: '#05e2f2', dark: '#172123', mist: '#ecfcfc', gray: '#5b6b6d', line: '#d6e6e7' };
const FONT = "Outfit, 'Helvetica Neue', Arial, sans-serif";

const pesos = (n: number) => `$ ${Math.round(n).toLocaleString('es-UY')}`;
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmtDay = (iso: string) => String(Number(iso.slice(8, 10)));

export interface MonthlyMailOptions {
  ownerFirstName: string;
  detailUrl: string;
  logoUrl?: string;
}

export function monthlyReportSubject(r: MonthlyReport): string {
  return r.totalEarned > 0
    ? `${r.clubName}: Armá Partido te trajo ${pesos(r.totalEarned)} en ${monthLabel(r.month).split(' ')[0]}`
    : `${r.clubName}: tu informe de ${monthLabel(r.month)}`;
}

export function buildMonthlyReportEmail(r: MonthlyReport, o: MonthlyMailOptions): string {
  const mes = monthLabel(r.month);
  const mesCorto = mes.split(' ')[0];
  const good = r.totalEarned >= r.feeUYU && r.totalEarned > 0;

  const rows: { title: string; detail: string; amount: number }[] = [];
  if (r.slotsFilled.count)
    rows.push({
      title: `${r.slotsFilled.count} ${r.slotsFilled.count === 1 ? 'turno libre que se llenó' : 'turnos libres que se llenaron'}`,
      detail: 'Estaban vacíos, avisamos a los jugadores de la categoría y alguien reservó',
      amount: r.slotsFilled.amount,
    });
  if (r.playersReplaced.count)
    rows.push({
      title: `${r.playersReplaced.count} ${r.playersReplaced.count === 1 ? 'lugar cubierto' : 'lugares cubiertos'} cuando alguien se bajó`,
      detail: 'El partido siguió en pie porque entró otro jugador desde el aviso',
      amount: r.playersReplaced.amount,
    });
  if (r.matchesCompleted.count)
    rows.push({
      title: `${r.matchesCompleted.count} ${r.matchesCompleted.count === 1 ? 'partido que se completó' : 'partidos que se completaron'}`,
      detail: `Les faltaba gente; contamos solo los ${r.matchesCompleted.seats} lugares que llenó el aviso`,
      amount: r.matchesCompleted.amount,
    });
  if (r.depositsKept.count)
    rows.push({
      title: `${r.depositsKept.count} ${r.depositsKept.count === 1 ? 'seña que quedó' : 'señas que quedaron'} para el club`,
      detail: 'Reservas en horario pico que no vinieron ni avisaron',
      amount: r.depositsKept.amount,
    });

  const kpis: [string, string][] = [
    [String(r.playedBookings), 'turnos jugados'],
    [`${r.occupancyPct} %`, 'canchas ocupadas'],
    [String(r.noShows), 'ausencias sin aviso'],
    [pesos(r.cantinaCollected), 'cobrado en cantina'],
    [String(r.newPlayers), r.newFromApp !== undefined ? `clientes nuevos, ${r.newFromApp} por Armá Partido` : 'jugadores nuevos'],
    [pesos(r.uncollected), 'quedó sin cobrar'],
  ];

  const kpiCell = ([v, k]: [string, string]) => `
    <td width="33%" style="padding:5px" valign="top">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${C.line};border-radius:10px">
        <tr><td style="padding:12px">
          <div style="font-family:${FONT};font-size:22px;font-weight:700;color:${C.dark}">${esc(v)}</div>
          <div style="font-family:${FONT};font-size:12px;color:${C.gray}">${esc(k)}</div>
        </td></tr>
      </table>
    </td>`;

  const feeLabel = r.isTrial ? 'El valor de tu plan' : `Tu cuota de ${mesCorto}`;
  const partialNote = r.partial ? ` (del ${fmtDay(r.fromDate)} al ${fmtDay(r.toDate)})` : '';

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(monthlyReportSubject(r))}</title></head>
<body style="margin:0;padding:0;background:#e9eeee">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#e9eeee"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden">
  <tr><td style="padding:22px 28px;border-bottom:1px solid ${C.line}">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td valign="middle">${o.logoUrl ? `<img src="${esc(o.logoUrl)}" alt="Armá Partido" height="30" style="display:block;height:30px;border:0">` : `<span style="font-family:${FONT};font-size:20px;font-weight:700;color:${C.teal}">Armá Partido</span>`}</td>
      <td align="right" valign="middle" style="font-family:${FONT};font-size:13px;color:${C.gray}">Informe de <b>${esc(mes)}</b>${esc(partialNote)}<br>${esc(r.clubName)}</td>
    </tr></table>
  </td></tr>

  <tr><td style="background:${C.teal};padding:30px 28px 26px;color:#ffffff">
    <div style="font-family:${FONT};font-size:15px;color:#d8eef0">Hola, ${esc(o.ownerFirstName)}. Esto es lo que Armá Partido hizo por tu club en ${esc(mesCorto)}:</div>
    <div style="font-family:${FONT};font-size:46px;line-height:1.05;font-weight:700;margin:8px 0 4px;color:#ffffff">${pesos(r.totalEarned)}</div>
    <div style="font-family:${FONT};font-size:16px;color:#ffffff">en turnos y lugares que se llenaron por nuestros avisos</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px"><tr>
      <td width="50%" style="padding-right:6px" valign="top">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#236e77;border-radius:10px"><tr><td style="padding:12px 14px">
          <div style="font-family:${FONT};font-size:12px;letter-spacing:.05em;text-transform:uppercase;color:#cfe6e8">${esc(feeLabel)}</div>
          <div style="font-family:${FONT};font-size:22px;font-weight:700;color:#ffffff">${pesos(r.feeUYU)}</div>
        </td></tr></table>
      </td>
      <td width="50%" style="padding-left:6px" valign="top">
        ${
          good
            ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.cian};border-radius:10px"><tr><td style="padding:12px 14px">
          <div style="font-family:${FONT};font-size:12px;letter-spacing:.05em;text-transform:uppercase;color:#14444a">Te devolvió</div>
          <div style="font-family:${FONT};font-size:22px;font-weight:700;color:${C.dark}">${String(r.multiple).replace('.', ',')} veces la cuota</div>
        </td></tr></table>`
            : `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#236e77;border-radius:10px"><tr><td style="padding:12px 14px">
          <div style="font-family:${FONT};font-size:12px;letter-spacing:.05em;text-transform:uppercase;color:#cfe6e8">Este mes</div>
          <div style="font-family:${FONT};font-size:15px;font-weight:600;color:#ffffff">Todavía no llegamos a la cuota. Abajo va qué podemos hacer.</div>
        </td></tr></table>`
        }
      </td>
    </tr></table>
  </td></tr>

  <tr><td style="padding:22px 28px 6px">
    <div style="font-family:${FONT};font-size:13px;letter-spacing:.06em;text-transform:uppercase;font-weight:700;color:${C.teal};margin-bottom:6px">Lo que ganaste, turno por turno</div>
    ${
      rows.length
        ? rows
            .map(
              (row) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-bottom:1px solid ${C.line}"><tr>
      <td style="padding:11px 0" valign="top"><div style="font-family:${FONT};font-size:16px;font-weight:600;color:${C.dark}">${esc(row.title)}</div><div style="font-family:${FONT};font-size:13px;color:${C.gray};margin-top:2px">${esc(row.detail)}</div></td>
      <td align="right" valign="top" style="padding:11px 0 11px 16px;font-family:${FONT};font-size:18px;font-weight:700;color:${C.dark};white-space:nowrap">${pesos(row.amount)}</td>
    </tr></table>`
            )
            .join('')
        : `<p style="font-family:${FONT};font-size:15px;color:${C.dark}">Este mes ningún turno se llenó por un aviso nuestro.</p>`
    }
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.mist};border-radius:10px;margin:8px 0 4px"><tr>
      <td style="padding:12px 14px;font-family:${FONT};font-size:18px;font-weight:700;color:${C.dark}">Total</td>
      <td align="right" style="padding:12px 14px;font-family:${FONT};font-size:18px;font-weight:700;color:${C.dark}">${pesos(r.totalEarned)}</td>
    </tr></table>
    <p style="font-family:${FONT};font-size:13px;line-height:1.45;color:${C.gray}">Solo contamos un turno si nuestro aviso salió antes de que se ocupara, el jugador entró desde ese aviso y el partido se jugó. Cancelados y ausencias no cuentan.</p>
  </td></tr>

  <tr><td style="padding:16px 23px 6px">
    <div style="font-family:${FONT};font-size:13px;letter-spacing:.06em;text-transform:uppercase;font-weight:700;color:${C.teal};margin:0 5px 6px">Cómo anduvo el mes</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>${kpis.slice(0, 3).map(kpiCell).join('')}</tr>
      <tr>${kpis.slice(3).map(kpiCell).join('')}</tr>
    </table>
  </td></tr>

  ${
    r.tip
      ? `<tr><td style="padding:16px 28px 0">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.mist};border-left:4px solid ${C.teal};border-radius:6px"><tr><td style="padding:12px 14px;font-family:${FONT};font-size:15px;line-height:1.4;color:${C.dark}"><b>Para el mes que viene:</b> ${esc(r.tip)}</td></tr></table>
  </td></tr>`
      : ''
  }

  <tr><td align="center" style="padding:24px 28px 6px">
    <a href="${esc(o.detailUrl)}" style="display:inline-block;background:${C.dark};color:#ffffff;text-decoration:none;font-family:${FONT};font-weight:600;font-size:15px;padding:13px 22px;border-radius:999px">Ver el detalle turno por turno</a>
    <p style="font-family:${FONT};font-size:13px;color:${C.gray};margin:10px 0 0">Cada número tiene su lista en el Admin del club, para que lo puedas revisar.</p>
  </td></tr>

  <tr><td style="padding:18px 28px 24px;border-top:1px solid ${C.line};font-family:${FONT};font-size:12px;line-height:1.5;color:${C.gray}">
    Te llega porque sos responsable de ${esc(r.clubName)} en Armá Partido. Podés sumar a otra persona o dejar de recibirlo desde Admin, Informe.<br>Armá Partido · armapartido.com
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}
