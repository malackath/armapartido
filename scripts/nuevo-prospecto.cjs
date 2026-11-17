// Nuevo prospecto / club con marca completa (17/11/2026): logo + colores + nombre → app en <slug>.armapartido.com.
//
// Uso (desde la carpeta del repo):
//   node scripts/nuevo-prospecto.cjs --slug padelclub --nombre "Padel Club" --logo ruta/al/logo.png \
//        --principal "#0B1530" --acento "#C8F400" [--secundario "#1EA5E6"] [--fondo "#..."] [--corto "Padel Club"] \
//        [--direccion "..."] [--fondo-logo quitar|dejar] [--fuente-titulos "Outfit"] [--fuente-texto "Space Grotesk"]
//   Sin --principal/--acento los toma del logo (el oscuro más usado = principal, el más vivo = acento).
//
// Deja en public/clubes/<slug>/:
//   marca.json        nombre, logo y colores (lo lee src/lib/marcaClub.ts al abrir <slug>.armapartido.com)
//   logo.png          el logo sin el fondo blanco, recortado
//   icon-192.png, icon-512.png, maskable-512.png, apple-touch-icon.png, manifest.webmanifest  (app instalada)
//
// Después: publicar la demo (Paddle.URU/docs/publicar-demo.sh) y sumar el dominio <slug>.armapartido.com
// al proyecto de Cloudflare Pages armapartido-demo + CNAME con proxy (ver docs/nuevo-prospecto.md).
// Los datos son los de la demo (ficticios): la marca solo cambia lo que se ve.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const slug = (arg('slug') || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const nombre = arg('nombre');
const logoIn = arg('logo');
const isHex = (h) => /^#[0-9a-fA-F]{6}$/.test(h || '');
if (!slug || !/^[a-z0-9]{2,40}$/.test(slug) || !nombre || !logoIn || !fs.existsSync(logoIn)) {
  console.error('Faltan datos. Uso: node scripts/nuevo-prospecto.cjs --slug padelclub --nombre "Padel Club" --logo logo.png [--principal #hex --acento #hex]');
  process.exit(1);
}
for (const k of ['principal', 'acento', 'secundario', 'fondo']) {
  if (arg(k) && !isHex(arg(k))) {
    console.error(`--${k} tiene que ser un color #RRGGBB`);
    process.exit(1);
  }
}
if (['www', 'demo', 'app', 'admin', 'api', 'mail'].includes(slug)) {
  console.error(`"${slug}" está reservado.`);
  process.exit(1);
}
const out = path.resolve(__dirname, '..', 'public', 'clubes', slug);
fs.mkdirSync(out, { recursive: true });
const logoB64 = fs.readFileSync(logoIn).toString('base64');
const logoMime = /\.jpe?g$/i.test(logoIn) ? 'image/jpeg' : /\.webp$/i.test(logoIn) ? 'image/webp' : 'image/png';

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.setContent('<canvas id="c"></canvas>');

  // 1) Logo: quitar el fondo claro que toca los bordes (relleno desde las esquinas), recortar y analizar colores.
  const res = await p.evaluate(async ({ src, quitar }) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const W = img.naturalWidth, H = img.naturalHeight;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, W, H);
    const a = d.data;
    const claro = (i) => a[i] > 232 && a[i + 1] > 232 && a[i + 2] > 232;
    if (quitar) {
      const seen = new Uint8Array(W * H);
      const stack = [];
      for (let i = 0; i < W; i++) stack.push(i, (H - 1) * W + i);
      for (let j = 0; j < H; j++) stack.push(j * W, j * W + W - 1);
      while (stack.length) {
        const k = stack.pop();
        if (seen[k]) continue;
        seen[k] = 1;
        if (!claro(k * 4)) continue;
        a[k * 4 + 3] = 0;
        const px = k % W, py = (k / W) | 0;
        if (px > 0) stack.push(k - 1);
        if (px < W - 1) stack.push(k + 1);
        if (py > 0) stack.push(k - W);
        if (py < H - 1) stack.push(k + W);
      }
      // borde suave: píxeles casi blancos pegados a lo transparente quedan semitransparentes
      for (let k = 0; k < W * H; k++) {
        if (a[k * 4 + 3] === 0) continue;
        const v = Math.min(a[k * 4], a[k * 4 + 1], a[k * 4 + 2]);
        if (v > 200) {
          const px = k % W, py = (k / W) | 0;
          const vecinoTransp = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
            const qx = px + dx, qy = py + dy;
            return qx >= 0 && qy >= 0 && qx < W && qy < H && a[(qy * W + qx) * 4 + 3] === 0;
          });
          if (vecinoTransp) a[k * 4 + 3] = Math.round(255 * (1 - (v - 200) / 55));
        }
      }
    }
    // recorte
    let minX = W, minY = H, maxX = 0, maxY = 0;
    for (let k = 0; k < W * H; k++) {
      if (a[k * 4 + 3] > 10) {
        const px = k % W, py = (k / W) | 0;
        if (px < minX) minX = px; if (px > maxX) maxX = px;
        if (py < minY) minY = py; if (py > maxY) maxY = py;
      }
    }
    x.putImageData(d, 0, 0);
    const side = Math.max(maxX - minX, maxY - minY) + 8;
    const t = document.createElement('canvas');
    t.width = t.height = Math.min(side, 256);
    const s = t.width / side;
    const tx = t.getContext('2d');
    tx.imageSmoothingQuality = 'high';
    tx.drawImage(c, minX - (side - (maxX - minX)) / 2, minY - (side - (maxY - minY)) / 2, side, side, 0, 0, t.width, t.height);
    // colores: cuantizar los píxeles opacos
    const cuenta = new Map();
    for (let k = 0; k < W * H; k += 3) {
      if (a[k * 4 + 3] < 250) continue;
      const r = a[k * 4], g = a[k * 4 + 1], bl = a[k * 4 + 2];
      if (r > 225 && g > 225 && bl > 225) continue;
      const key = [r, g, bl].map((v) => Math.round(v / 16) * 16).join(',');
      cuenta.set(key, (cuenta.get(key) || 0) + 1);
    }
    const top = [...cuenta.entries()].sort((m, n) => n[1] - m[1]).slice(0, 12).map(([k, n]) => [k.split(',').map(Number), n]);
    return { png: t.toDataURL('image/png'), top };
  }, { src: `data:${logoMime};base64,${logoB64}`, quitar: arg('fondo-logo', 'quitar') === 'quitar' });

  fs.writeFileSync(path.join(out, 'logo.png'), Buffer.from(res.png.split(',')[1], 'base64'));

  const hex = (c) => '#' + c.map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');
  const lumOf = ([r, g, bl]) => 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  const sat = ([r, g, bl]) => Math.max(r, g, bl) - Math.min(r, g, bl);
  const oscuros = res.top.filter(([c]) => lumOf(c) < 90);
  const vivos = [...res.top].sort((m, n) => sat(n[0]) * Math.sqrt(n[1]) - sat(m[0]) * Math.sqrt(m[1]));
  const principal = arg('principal') || (oscuros[0] ? hex(oscuros[0][0]) : hex(res.top[0][0]));
  const acento = arg('acento') || (vivos[0] ? hex(vivos[0][0]) : principal);
  const secundario = arg('secundario');

  const marca = {
    slug,
    nombre,
    nombreCorto: arg('corto', nombre).slice(0, 14),
    logo: `/clubes/${slug}/logo.png`,
    colores: { principal, acento, ...(secundario ? { secundario } : {}), ...(arg('fondo') ? { fondo: arg('fondo') } : {}) },
    ...(arg('fuente-titulos') || arg('fuente-texto') ? { fuentes: { ...(arg('fuente-titulos') ? { titulos: arg('fuente-titulos') } : {}), ...(arg('fuente-texto') ? { texto: arg('fuente-texto') } : {}) } } : {}),
    ...(arg('direccion') ? { direccion: arg('direccion') } : {}),
    // Los datos de ejemplo son los del club de la demo: estos textos se cambian por el nombre del club.
    reemplazos: { 'Los Jacarandás Pádel': nombre, 'Jacarandás': nombre },
    prospecto: true,
  };
  fs.writeFileSync(path.join(out, 'marca.json'), JSON.stringify(marca, null, 2) + '\n');

  // 2) Íconos de la app instalada: el logo sobre blanco.
  const iconHtml = (size, pad) => `<!doctype html><html><body style="margin:0;width:${size}px;height:${size}px;background:#fff;display:grid;place-items:center">
    <img src="${res.png}" style="width:${size - 2 * pad}px;height:${size - 2 * pad}px;object-fit:contain"></body></html>`;
  const shot = async (file, size, pad) => {
    await p.setViewportSize({ width: size, height: size });
    await p.setContent(iconHtml(size, pad));
    await p.waitForTimeout(100);
    await p.screenshot({ path: path.join(out, file) });
  };
  await shot('icon-192.png', 192, 6);
  await shot('icon-512.png', 512, 16);
  await shot('maskable-512.png', 512, 80);
  await shot('apple-touch-icon.png', 180, 10);

  const base = `/clubes/${slug}`;
  const manifest = {
    id: `/?club=${slug}`,
    name: nombre,
    short_name: marca.nombreCorto,
    description: `Reservá cancha, armá partido y anotate en los torneos de ${nombre}.`,
    theme_color: principal,
    background_color: '#ffffff',
    display: 'standalone',
    start_url: `/?club=${slug}`,
    scope: '/',
    icons: [
      { src: `${base}/icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: `${base}/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: `${base}/maskable-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
  fs.writeFileSync(path.join(out, 'manifest.webmanifest'), JSON.stringify(manifest, null, 2) + '\n');
  await b.close();

  console.log(`Listo: public/clubes/${slug}/`);
  console.log(`  principal ${principal}${arg('principal') ? '' : ' (tomado del logo)'} · acento ${acento}${arg('acento') ? '' : ' (tomado del logo)'}${secundario ? ` · secundario ${secundario}` : ''}`);
  console.log(`  Probar en local: npm run dev y abrir http://localhost:3000/?club=${slug}`);
  console.log(`  Publicar: commit + publicar-demo.sh, y sumar ${slug}.armapartido.com en Cloudflare (docs/nuevo-prospecto.md).`);
})();
