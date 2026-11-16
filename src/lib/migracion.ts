/**
 * Migración asistida desde Wona, ATC o una planilla propia del club.
 * Lee un CSV (lo que exporte el sistema viejo o la plantilla nuestra), limpia y junta repetidos.
 * Puro: sin Firebase. Lo usa scripts/importar-jugadores.ts.
 */

export interface RawRow {
  [col: string]: string;
}

export interface CleanPlayer {
  row: number; // fila de la planilla tal como la ve el club (1 = encabezado, 2 = primer jugador)
  name: string;
  email: string;
  phone: string;
  category: number | null;
  fixed: { dayOfWeek: number; startMinute: number; court: string } | null;
  notes: string;
  mergedRows: number[];
}

export interface MigrationReport {
  rows: number;
  ready: CleanPlayer[];
  noEmail: CleanPlayer[];
  duplicates: { kept: number; merged: number; reason: string }[];
  discarded: { row: number; reason: string }[];
  fixedCount: number;
  unknownColumns: string[];
}

/** CSV simple con comillas, separado por coma o punto y coma (Excel en español usa ;). */
export function parseCsv(text: string): RawRow[] {
  const clean = text.replace(/^﻿/, '');
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? '';
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < clean.length; i += 1) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      cur.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && clean[i + 1] === '\n') i += 1;
      cur.push(field);
      rows.push(cur);
      cur = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || cur.length) {
    cur.push(field);
    rows.push(cur);
  }
  const nonEmpty = rows.filter((r) => r.some((c) => c.trim() !== ''));
  const [header, ...data] = nonEmpty;
  if (!header) return [];
  const keys = header.map((h) => h.trim());
  return data.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? '').trim()])));
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');

/** Nombres de columna que reconocemos (de Wona, ATC o planillas a mano). */
const COLS: Record<string, string[]> = {
  name: ['nombre', 'name', 'nombrecompleto', 'cliente', 'jugador', 'socio'],
  last: ['apellido', 'apellidos', 'lastname'],
  email: ['mail', 'email', 'correo', 'correoelectronico', 'email1'],
  phone: ['celular', 'telefono', 'tel', 'movil', 'cel', 'whatsapp', 'phone'],
  category: ['categoria', 'cat', 'nivel', 'categoriapadel'],
  fixedDay: ['turnofijodia', 'diafijo', 'dia', 'diaturnofijo'],
  fixedHour: ['turnofijohora', 'horafijo', 'hora', 'horaturnofijo'],
  fixedCourt: ['turnofijocancha', 'canchafijo', 'cancha'],
  notes: ['notas', 'nota', 'observaciones', 'comentarios'],
};

export function mapColumns(headers: string[]) {
  const map: Record<string, string> = {};
  const used = new Set<string>();
  for (const [field, names] of Object.entries(COLS)) {
    const h = headers.find((x) => names.includes(norm(x)) && !used.has(x));
    if (h) {
      map[field] = h;
      used.add(h);
    }
  }
  return { map, unknown: headers.filter((h) => !used.has(h)) };
}

/** Celular uruguayo a formato 099 123 456. Otros números se dejan como vinieron. */
export function normalizePhone(raw: string): string {
  let d = raw.replace(/\D/g, '');
  if (d.startsWith('598')) d = d.slice(3);
  if (d.length === 8 && d.startsWith('9')) d = `0${d}`;
  if (d.length === 9 && d.startsWith('09')) return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
  return raw.trim();
}

export const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);

const ORD = ['primera', 'segunda', 'tercera', 'cuarta', 'quinta', 'sexta', 'septima'];
/** "5ta", "5", "quinta", "5° cat" → 5. Nivel decimal o algo raro → null (lo elige el jugador al entrar). */
export function parseCategory(raw: string): number | null {
  const s = norm(raw);
  if (!s) return null;
  const ord = ORD.findIndex((o) => s.startsWith(o));
  if (ord >= 0) return ord + 1;
  if (/[.,]/.test(raw)) return null;
  const m = s.match(/^([1-7])(ra|da|ta|ma|va|a|o|cat|categoria)?$/) ?? s.match(/^(?:cat|categoria)([1-7])$/);
  return m ? Number(m[1]) : null;
}

const DAYS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
export function parseDay(raw: string): number | null {
  const s = norm(raw);
  if (!s) return null;
  const i = DAYS.findIndex((d) => d.startsWith(s.slice(0, 3)));
  return i >= 0 ? i : null;
}
export function parseHour(raw: string): number | null {
  const m = raw.trim().match(/^(\d{1,2})(?:[:.h](\d{2}))?/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  return h < 24 && min < 60 ? h * 60 + min : null;
}

export function cleanPlayers(rows: RawRow[]): MigrationReport {
  const headers = rows.length ? Object.keys(rows[0]) : [];
  const { map, unknown } = mapColumns(headers);
  const get = (r: RawRow, f: string) => (map[f] ? r[map[f]] ?? '' : '');
  const discarded: MigrationReport['discarded'] = [];
  const players: CleanPlayer[] = [];
  rows.forEach((r, i) => {
    const row = i + 2;
    const name = [get(r, 'name'), get(r, 'last')].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
    const emailRaw = get(r, 'email').toLowerCase();
    const phone = normalizePhone(get(r, 'phone'));
    if (!name) {
      discarded.push({ row, reason: 'sin nombre' });
      return;
    }
    if (!emailRaw && !phone) {
      discarded.push({ row, reason: `${name}: sin mail ni celular` });
      return;
    }
    const day = parseDay(get(r, 'fixedDay'));
    const hour = parseHour(get(r, 'fixedHour'));
    players.push({
      row,
      name: name.slice(0, 60),
      email: isEmail(emailRaw) ? emailRaw : '',
      phone,
      category: parseCategory(get(r, 'category')),
      fixed: day !== null && hour !== null ? { dayOfWeek: day, startMinute: hour, court: get(r, 'fixedCourt') } : null,
      notes: get(r, 'notes').slice(0, 200),
      mergedRows: [],
    });
  });

  // Juntar repetidos por mail o celular
  const duplicates: MigrationReport['duplicates'] = [];
  const kept: CleanPlayer[] = [];
  for (const p of players) {
    const twin = kept.find((k) => (p.email && k.email === p.email) || (p.phone && k.phone && k.phone === p.phone));
    if (!twin) {
      kept.push(p);
      continue;
    }
    // Mismo mail con otro nombre: suele ser la pareja que reserva por los dos. Se carga solo el primero.
    const sameName = norm(twin.name) === norm(p.name);
    duplicates.push({ kept: twin.row, merged: p.row, reason: sameName ? 'repetido' : `mismo ${p.email && twin.email === p.email ? 'mail' : 'celular'} que ${twin.name}, se carga solo el primero` });
    twin.mergedRows.push(p.row);
    twin.email ||= p.email;
    twin.phone ||= p.phone;
    twin.category ??= p.category;
    twin.fixed ??= p.fixed;
  }

  return {
    rows: rows.length,
    ready: kept.filter((p) => p.email),
    noEmail: kept.filter((p) => !p.email),
    duplicates,
    discarded,
    fixedCount: kept.filter((p) => p.fixed).length,
    unknownColumns: unknown,
  };
}

/** Mail único "tu club ahora reserva acá". Sale a nombre del club, una sola vez, con baja. */
export function buildWelcomeEmail(p: { playerFirstName: string; clubName: string; loginUrl: string; unsubscribeUrl: string; fixedText?: string; logoUrl?: string }): { subject: string; html: string } {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const F = "Outfit, 'Helvetica Neue', Arial, sans-serif";
  const subject = `${p.clubName} ahora reserva con Armá Partido`;
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;background:#e9eeee"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;background:#fff;border-radius:14px;overflow:hidden">
<tr><td style="padding:22px 28px;border-bottom:1px solid #d6e6e7">${p.logoUrl ? `<img src="${esc(p.logoUrl)}" alt="Armá Partido" height="28" style="display:block;height:28px;border:0">` : `<b style="font-family:${F};color:#0a5761;font-size:20px">Armá Partido</b>`}</td></tr>
<tr><td style="padding:28px;font-family:${F};color:#172123">
<p style="font-size:16px;margin:0 0 12px">Hola, ${esc(p.playerFirstName)}:</p>
<p style="font-size:22px;font-weight:700;margin:0 0 12px;line-height:1.25">${esc(p.clubName)} ahora reserva con Armá Partido.</p>
<p style="font-size:15px;line-height:1.5;margin:0 0 12px">Ya te dejamos la cuenta creada con este mail. Desde la app del club reservás cancha, te avisamos cuando falta uno de tu categoría y ves lo que consumiste.</p>
${p.fixedText ? `<p style="font-size:15px;line-height:1.5;margin:0 0 12px;background:#ecfcfc;border-radius:8px;padding:12px 14px">Tu turno fijo ya está cargado: <b>${esc(p.fixedText)}</b>.</p>` : ''}
<p style="text-align:center;margin:24px 0"><a href="${esc(p.loginUrl)}" style="display:inline-block;background:#172123;color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:13px 24px;border-radius:999px">Entrar a la app del club</a></p>
<p style="font-size:13px;color:#5b6b6d;line-height:1.5;margin:0">No hace falta contraseña: tocás el botón y entrás. Si no reconocés este mail, ignoralo.</p>
</td></tr>
<tr><td style="padding:16px 28px 22px;border-top:1px solid #d6e6e7;font-family:${F};font-size:12px;color:#5b6b6d;line-height:1.5">Te escribe ${esc(p.clubName)}, que nos pasó tus datos para que sigas reservando. Es un aviso único. <a href="${esc(p.unsubscribeUrl)}" style="color:#0a5761">No quiero recibir más mails y borren mi cuenta</a>.</td></tr>
</table></td></tr></table></body></html>`;
  return { subject, html };
}
