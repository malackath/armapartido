// Uso: node club.cjs <url> <carpeta> <nombre del jugador nuevo>
const { chromium } = require('playwright');
const [url, out, nombre] = process.argv.slice(2);
const log = (...a) => console.log(...a);
const base = url.replace(/\/$/, '');
async function entrar(b, rol, w = 1440, h = 1000) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, locale: 'es-UY' });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => log('ERROR página:', e.message));
  await p.goto(base + '/', { waitUntil: 'domcontentloaded' });
  await p.getByRole('button', { name: new RegExp(`Entrar como ${rol}`, 'i') }).click({ timeout: 30000 });
  await p.waitForTimeout(4000);
  return p;
}
(async () => {
  const b = await chromium.launch();
  // Dueña: Administración → Jugadores y encargados
  const d = await entrar(b, 'dueña del club');
  await d.goto(base + '/?tab=admin', { waitUntil: 'domcontentloaded' });
  const nav = d.getByRole('button', { name: /Jugadores y encargados/ }).first();
  await nav.waitFor({ timeout: 30000 });
  log('insignia en el menú:', await d.getByTestId('badge-nuevos').innerText().catch(() => 'no aparece'));
  await nav.click();
  await d.getByTestId('se-sumaron').waitFor({ timeout: 20000 });
  await d.waitForTimeout(800);
  await d.screenshot({ path: `${out}/20-admin-se-sumaron.png` });
  log('bloque "Se sumaron":', (await d.getByTestId('se-sumaron').innerText()).replace(/\n+/g, ' | ').slice(0, 300));
  const fila = d.locator('[data-testid^="nuevo-"]', { hasText: nombre });
  await fila.getByRole('button', { name: 'Corregir categoría' }).click();
  await fila.getByTestId('cat-5').click();
  await d.waitForTimeout(400);
  await d.screenshot({ path: `${out}/21-admin-corregir.png` });
  await fila.getByTestId('corregir-guardar').click();
  await d.waitForTimeout(2000);
  log(nombre, 'sigue pendiente:', await d.locator('[data-testid^="nuevo-"]', { hasText: nombre }).count());
  await d.screenshot({ path: `${out}/22-admin-corregido.png` });
  // Mostrador: Clientes → ficha de un jugador con la app → pestaña Juego
  const m = await entrar(b, 'encargado de mostrador');
  await m.goto(base + '/?tab=staff', { waitUntil: 'domcontentloaded' });
  await m.getByRole('button', { name: /^Clientes$/ }).first().click({ timeout: 30000 });
  await m.waitForTimeout(1500);
  const busca = m.locator('input[placeholder*="uscar"] >> visible=true').first();
  await busca.fill('Lucía');
  await m.waitForTimeout(800);
  await m.locator('text=Lucía Pérez >> visible=true').first().click();
  await m.getByTestId('ficha-juego').waitFor({ timeout: 20000 });
  await m.waitForTimeout(600);
  await m.screenshot({ path: `${out}/23-mostrador-ficha-juego.png` });
  log('ficha Juego:', (await m.getByTestId('ficha-juego').innerText()).replace(/\n+/g, ' | '));
  await b.close();
})().catch((e) => { console.error('FALLÓ', e.message); process.exit(1); });
