// Cuponera en la billetera (19/11/2026): Mis cuponeras del jugador (compu, Android, iPhone) y "Leer cuponera"
// en el Mostrador con una cámara falsa que muestra el QR de la cuponera de Lucía.
// Uso: node scripts/verify-billetera.cjs <url> <carpeta> <video.y4m con el QR>
// El video se arma con ffmpeg a partir del QR de demoQr('los_jacarandas', 'demo_pack_lucia').
const { chromium, devices } = require('playwright');
const URL = process.argv[2] || 'http://127.0.0.1:5173';
const OUT = process.argv[3] || '.';
const Y4M = process.argv[4];
require('fs').mkdirSync(OUT, { recursive: true });
const NAMES = { jugadora: 'Lucía Pérez', mostrador: 'Diego Fernández' };
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok: !!ok }); console.log(`${ok ? 'OK  ' : 'FALLA'} ${name}${detail ? ' · ' + detail : ''}`); };
const DESK = { viewport: { width: 1366, height: 900 }, deviceScaleFactor: 2 };

async function enter(b, who, opts = DESK, prender = null) {
  const c = await b.newContext({ ...opts, permissions: ['camera'] });
  const p = await c.newPage();
  p.errs = [];
  p.on('pageerror', (e) => p.errs.push(e.message));
  if (prender) {
    // Simula Google Wallet prendida en el servidor (solo para ver el botón oficial).
    await p.route('**/cuponeraBilletera', async (r) => {
      const res = await r.fetch();
      const j = await res.json();
      j.result.google.disponible = true;
      await r.fulfill({ response: res, json: j });
    });
  }
  await p.goto(URL);
  await p.waitForSelector('text=/Probá la demo|Entrá a tu club/', { timeout: 40000 });
  await p.getByRole('button', { name: new RegExp(NAMES[who]) }).click();
  await p.waitForTimeout(6000);
  return { c, p };
}
const body = (p) => p.innerText('body');
const shot = (p, f, full = false) => p.screenshot({ path: `${OUT}/${f}.png`, fullPage: full });
async function irAMisCuponeras(p) {
  await p.goto(`${URL}/?tab=profile`);
  await p.waitForTimeout(5000);
  await p.getByText('Mi cuenta', { exact: true }).locator('visible=true').first().click();
  await p.waitForTimeout(2500);
  const s = p.locator('[data-testid="mis-cuponeras"]').first();
  await s.waitFor({ timeout: 20000 });
  await s.scrollIntoViewIfNeeded();
  await p.waitForTimeout(1500);
  return s;
}

(async () => {
  const b = await chromium.launch({ args: Y4M ? ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${Y4M}`] : [] });

  // ---------- Lucía en la compu ----------
  let { c, p } = await enter(b, 'jugadora');
  let s = await irAMisCuponeras(p);
  let t = await s.innerText();
  check('Compu: Mis cuponeras con la de 10 partes', t.includes('10 partes de cancha') && /7\s*de 10/.test(t), t.slice(0, 80).replace(/\n/g, ' | '));
  check('Compu: los 10 cupones, 3 tachados y 7 libres', (await p.locator('[data-testid="cupon-usado"]').count()) === 3 && (await p.locator('[data-testid="cupon-libre"]').count()) === 7);
  check('Compu: "Guardala en tu celular" con QR', t.includes('Guardala en tu celular') && (await p.locator('[data-testid="pasala-al-celular"] img').count()) === 1);
  await s.screenshot({ path: `${OUT}/1-compu-mis-cuponeras.png` });
  await p.locator('[data-testid="ver-codigo"]').first().click();
  await p.waitForTimeout(1200);
  check('Compu: "Mostrar código" muestra el QR del mostrador', (await p.locator('[data-testid="codigo-mostrador"] img').count()) === 1);
  await s.screenshot({ path: `${OUT}/2-compu-codigo.png` });
  check('Compu: sin errores', p.errs.length === 0, p.errs.join(' | '));
  await c.close();

  // ---------- Lucía en Android (Google Wallet apagada) ----------
  ({ c, p } = await enter(b, 'jugadora', { ...devices['Pixel 7'] }));
  s = await irAMisCuponeras(p);
  t = await s.innerText();
  check('Android sin Google prendida: "llega muy pronto" y sin botón', t.includes('la Billetera de Google llega muy pronto') && (await p.locator('[data-testid="boton-google-wallet"]').count()) === 0);
  await shot(p, '3-android-pronto');
  await c.close();

  // ---------- Lucía en Android (Google Wallet prendida, simulada) ----------
  ({ c, p } = await enter(b, 'jugadora', { ...devices['Pixel 7'] }, true));
  s = await irAMisCuponeras(p);
  check('Android con Google prendida: botón oficial "Agregar a Google Wallet"', (await p.locator('[data-testid="boton-google-wallet"] img[src="/wallet/agregar-a-google-wallet.svg"]').count()) === 1);
  await shot(p, '4-android-boton-google');
  await c.close();

  // ---------- Lucía en iPhone ----------
  ({ c, p } = await enter(b, 'jugadora', { ...devices['iPhone 14'] }));
  s = await irAMisCuponeras(p);
  t = await s.innerText();
  check('iPhone: "Apple Wallet llega muy pronto"', t.includes('Apple Wallet llega muy pronto'));
  await p.getByRole('button', { name: 'Historial' }).first().click();
  await p.waitForTimeout(500);
  check('iPhone: Historial con 3 usos', (await p.locator('[data-testid="historial"] b').count()) === 3);
  await shot(p, '5-iphone-pronto');
  await c.close();

  // ---------- Mostrador: leer cuponera ----------
  ({ c, p } = await enter(b, 'mostrador'));
  await p.locator('header button[aria-expanded]').first().click().catch(() => undefined);
  await p.waitForTimeout(600);
  await p.getByText('Mostrador').first().click().catch(() => undefined);
  await p.waitForTimeout(3500);
  await p.locator('[data-testid="boton-leer-cuponera"]').first().click();
  if (Y4M) {
    await p.locator('[data-testid="cuponera-leida"]').waitFor({ timeout: 15000 }).catch(() => undefined);
    t = await p.locator('[data-testid="leer-cuponera"]').innerText();
    check('Mostrador: la cámara lee el QR y muestra a Lucía con 7 de 10', t.includes('Cuponera válida') && t.includes('Lucía') && /quedan\s*7\s*de 10/.test(t), t.replace(/\n/g, ' | ').slice(0, 160));
    await shot(p, '6-mostrador-leida');
  }
  check('Mostrador: sin errores', p.errs.length === 0, p.errs.join(' | '));
  await c.close();

  // ---------- Mostrador en tablet ----------
  // Sin cámara (otro navegador): el código se escribe o lo pasa un lector USB.
  const b2 = await chromium.launch();
  ({ c, p } = await enter(b2, 'mostrador', { ...devices['iPad (gen 7) landscape'] }));
  await p.locator('[data-testid="boton-leer-cuponera"]').first().click();
  await p.waitForTimeout(2000);
  await p.fill('#codigo-cuponera', 'AP1.otro_club.ABCDEFGHJKLMNPQRSTUVWXYZ');
  await p.getByRole('button', { name: 'Buscar' }).click();
  await p.waitForTimeout(500);
  t = await p.locator('[data-testid="leer-cuponera"]').innerText();
  check('Mostrador: código de otro club se rechaza', t.includes('Es una cuponera de otro club'));
  await p.fill('#codigo-cuponera', 'hola');
  await p.getByRole('button', { name: 'Buscar' }).click();
  await p.waitForTimeout(500);
  t = await p.locator('[data-testid="leer-cuponera"]').innerText();
  check('Mostrador: texto cualquiera se rechaza', t.includes('no es de una cuponera'));
  await shot(p, '7-mostrador-rechazo');
  await p.fill('#codigo-cuponera', 'AP1.los_jacarandas.BUCFPUYPT4X7NQXT6L77KUS7');
  await p.getByRole('button', { name: 'Buscar' }).click();
  await p.waitForTimeout(800);
  t = await p.locator('[data-testid="leer-cuponera"]').innerText();
  check('Tablet con lector: el código de Lucía la encuentra', t.includes('Lucía') && t.includes('Cuponera válida'));
  await shot(p, '8-tablet-lector');
  await c.close();
  await b2.close();

  await b.close();
  const bad = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - bad} de ${results.length} OK`);
  process.exit(bad ? 1 : 0);
})();
