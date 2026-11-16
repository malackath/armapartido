// Arma la "app del club" (parte 2.2, 16/11/2026): manifiesto e íconos con el nombre y el color del club,
// para que al instalarla en el celular diga "Jacarandás" y no "Armá Partido".
// Uso: node scripts/app-del-club.cjs --slug los-jacarandas --nombre "Los Jacarandás Pádel" --corto "Jacarandás" --siglas LJ --color "#6b3fa0" [--deporte pádel]
// Deja public/clubes/<slug>/ (manifest.webmanifest, icon-192.png, icon-512.png, maskable-512.png, apple-touch-icon.png).
// Para un club nuevo se corre una vez al darlo de alta y se publica (no hay costo por club).
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const slug = (arg('slug') || '').toLowerCase().replace(/[^a-z0-9]/g, ''); // sin guiones: losjacarandas.armapartido.com
const name = arg('nombre');
const short = arg('corto', name);
const initials = arg('siglas', name.split(/\s+/).filter((w) => /^[A-ZÁÉÍÓÚÑ]/.test(w)).slice(0, 2).map((w) => w[0]).join(''));
const color = arg('color', '#0a5761');
if (!slug || !name || !/^[a-z0-9]{2,40}$/.test(slug)) { console.error('Faltan --slug y --nombre'); process.exit(1); }
const out = path.resolve(__dirname, '..', 'public', 'clubes', slug);
fs.mkdirSync(out, { recursive: true });
const font = fs.readFileSync(path.join(__dirname, 'app-del-club', 'outfit-700.woff2')).toString('base64'); // Outfit (OFL), la tipografía de la marca
const html = (size, pad) => `<!doctype html><html><head><style>
@font-face{font-family:O;src:url(data:font/woff2;base64,${font}) format('woff2');font-weight:700}
html,body{margin:0;width:${size}px;height:${size}px}
.i{width:${size}px;height:${size}px;background:${color};display:grid;place-items:center;box-sizing:border-box;padding:${pad}px}
.t{font-family:O;font-weight:700;color:#fff;font-size:${Math.round((size - 2 * pad) * 0.46)}px;letter-spacing:-0.02em;line-height:1}
.b{position:absolute;bottom:${Math.round(size * 0.085 + pad * 0.6)}px;left:0;right:0;text-align:center;font-family:O;font-weight:700;color:rgba(255,255,255,.72);font-size:${Math.round((size - 2 * pad) * 0.085)}px;letter-spacing:.08em}
</style></head><body><div class="i"><div class="t">${initials}</div></div><div class="b">${arg("deporte", "PÁDEL").toUpperCase()}</div></body></html>`;
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const shot = async (file, size, pad) => {
    await p.setViewportSize({ width: size, height: size });
    await p.setContent(html(size, pad));
    await p.waitForTimeout(150);
    await p.screenshot({ path: path.join(out, file) });
  };
  await shot('icon-192.png', 192, 0);
  await shot('icon-512.png', 512, 0);
  await shot('maskable-512.png', 512, 70);
  await shot('apple-touch-icon.png', 180, 0);
  await b.close();
  const base = `/clubes/${slug}`;
  const manifest = {
    id: `/?club=${slug}`,
    name,
    short_name: short,
    description: `Reservá cancha, armá partido y anotate en los torneos de ${name}.`,
    theme_color: color,
    background_color: '#E8F5F5',
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
  console.log(`Listo: ${out}`);
})();
