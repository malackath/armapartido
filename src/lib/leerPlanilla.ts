/**
 * Lee la planilla que exporta Wona, ATC, armatuMatch o el Excel del club: .csv o .xlsx, sin librerías.
 * El .xlsx es un zip: se descomprime con DecompressionStream (navegador y Node 18+) y se lee la primera hoja.
 * Puro: no guarda nada. La planilla original nunca se sube a Firebase.
 */
import { parseCsv, type RawRow } from './migracion';

const td = new TextDecoder('utf-8');

/** CSV en UTF-8 o, si viene de un Excel viejo en español, en Windows-1252. */
export function decodeCsvBytes(bytes: Uint8Array): string {
  const utf = td.decode(bytes);
  if (!utf.includes('�')) return utf;
  try {
    return new TextDecoder('windows-1252').decode(bytes);
  } catch {
    return utf;
  }
}

interface ZipEntry {
  name: string;
  method: number;
  compSize: number;
  offset: number;
}

function zipEntries(b: Uint8Array): ZipEntry[] {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  // Fin del directorio central: firma 0x06054b50, buscada desde el final.
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('El archivo no es un .xlsx válido.');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const out: ZipEntry[] = [];
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const compSize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const offset = dv.getUint32(p + 42, true);
    out.push({ name: td.decode(b.subarray(p + 46, p + 46 + nameLen)), method, compSize, offset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

async function zipRead(b: Uint8Array, e: ZipEntry): Promise<string> {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const start = e.offset + 30 + dv.getUint16(e.offset + 26, true) + dv.getUint16(e.offset + 28, true);
  const data = b.slice(start, start + e.compSize);
  if (e.method === 0) return td.decode(data);
  if (e.method !== 8) throw new Error('Compresión del .xlsx no soportada.');
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return td.decode(new Uint8Array(await new Response(stream).arrayBuffer()));
}

const unescapeXml = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&');

/** "B12" → 1 (columna, desde 0). */
function colIndex(ref: string): number {
  const letters = ref.replace(/\d+/g, '');
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** Texto de un <si> o de un <is>: junta todos los <t> (también los que tienen formato). */
const textOf = (xml: string) => unescapeXml([...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(''));

/** Primera hoja del .xlsx como filas de texto. */
export async function readXlsxGrid(bytes: Uint8Array): Promise<string[][]> {
  const entries = zipEntries(bytes);
  const find = (re: RegExp) => entries.find((e) => re.test(e.name));
  const sheet = find(/^xl\/worksheets\/sheet1\.xml$/i) ?? find(/^xl\/worksheets\/[^/]+\.xml$/i);
  if (!sheet) throw new Error('El .xlsx no tiene hojas.');
  const sharedEntry = find(/^xl\/sharedStrings\.xml$/i);
  const shared = sharedEntry ? [...(await zipRead(bytes, sharedEntry)).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1])) : [];
  const xml = await zipRead(bytes, sheet);
  const grid: string[][] = [];
  for (const row of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: string[] = [];
    let next = 0;
    for (const c of row[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1];
      const inner = c[2] ?? '';
      const ref = attrs.match(/\br="([A-Z]+\d+)"/)?.[1];
      const idx = ref ? colIndex(ref) : next;
      const type = attrs.match(/\bt="(\w+)"/)?.[1] ?? '';
      const v = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? '';
      let val = '';
      if (type === 's') val = shared[Number(v)] ?? '';
      else if (type === 'inlineStr') val = textOf(inner);
      else val = unescapeXml(v);
      cells[idx] = val;
      next = idx + 1;
    }
    grid.push(Array.from(cells, (x) => (x ?? '').trim()));
  }
  return grid;
}

/** Filas con encabezado → objetos, igual que parseCsv. */
function gridToRows(grid: string[][]): RawRow[] {
  const nonEmpty = grid.filter((r) => r.some((c) => c !== ''));
  const [header, ...data] = nonEmpty;
  if (!header) return [];
  const keys = header.map((h) => h.trim());
  return data.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? '').trim()])));
}

export async function readPlanilla(fileName: string, bytes: Uint8Array): Promise<RawRow[]> {
  const isZip = bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (isZip || /\.xlsx$/i.test(fileName)) return gridToRows(await readXlsxGrid(bytes));
  if (/\.xls$/i.test(fileName)) throw new Error('Ese es un Excel viejo (.xls). Abrilo y guardalo como .xlsx o .csv.');
  return parseCsv(decodeCsvBytes(bytes));
}
