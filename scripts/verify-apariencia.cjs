// Verifica Admin → Apariencia de punta a punta (17/11/2026):
// la dueña cambia colores, letras, esquinas, slogan, logo y fotos → queda en revisión →
// el Equipo la aprueba → el jugador ve la marca → un cambio solo de color se publica solo →
// sin Imagen completa el jugador vuelve a ver Armá Partido.
// Uso: node scripts/verify-apariencia.cjs http://127.0.0.1:5173 <carpeta> (con la demo cargada)
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const URL = process.argv[2] || 'http://127.0.0.1:5173';
const OUT = path.resolve(process.argv[3] || '.');
fs.mkdirSync(OUT, { recursive: true });
const ROOT = path.resolve(__dirname, '..');
const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(`${ok ? 'OK  ' : 'FALLA'} ${name}${detail ? ' · ' + detail : ''}`); };
const cssVar = (p, v) => p.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), v);

async function entrar(b, quien, vp = { width: 1280, height: 900 }) {
  const c = await b.newContext({ viewport: vp, deviceScaleFactor: 2, locale: 'es-UY' });
  const p = await c.newPage();
  p.errs = [];
  p.on('pageerror', (e) => p.errs.push(e.message));
  await p.goto(URL);
  await p.waitForSelector('text=/Probá la demo|Entrá a tu club/', { timeout: 40000 });
  await p.getByRole('button', { name: quien }).click();
  await p.waitForTimeout(6000);
  return p;
}

(async () => {
  const b = await chromium.launch();

  // 1. Dueña: Admin → Apariencia
  const d = await entrar(b, /Sofía Rodríguez/);
  await d.goto(`${URL}/?tab=admin`); await d.waitForTimeout(5000);
  await d.getByRole('button', { name: /^Apariencia/ }).locator('visible=true').first().click();
  await d.waitForSelector('[data-testid=apariencia]');
  await d.waitForTimeout(800);
  await d.screenshot({ path: `${OUT}/1-apariencia-inicio.png`, fullPage: true });
  check('Panel abre con la marca de Armá Partido', (await d.getByTestId('control-contraste').innerText()).includes('Se lee bien'));

  // Rojo → aviso
  await d.getByTestId('color-principal').getByLabel('Color principal en código').fill('#dc2626');
  await d.waitForTimeout(300);
  check('Rojo muestra el aviso de errores', (await d.getByTestId('control-contraste').innerText()).includes('rojo se confunde'));
  // Fondo oscuro → bloquea
  await d.getByTestId('color-fondo').getByLabel('Fondo en código').fill('#1e293b');
  await d.waitForTimeout(300);
  check('Fondo oscuro no deja guardar', await d.getByTestId('guardar-marca').isDisabled());
  await d.screenshot({ path: `${OUT}/2-avisos-contraste.png` });

  // Marca tipo Pádel Club: logo, navy + volt lime, fondo celeste, Space Grotesk, esquinas redondas, slogan, portada
  await d.getByTestId('input-logo').setInputFiles(path.join(ROOT, 'public/clubes/padelclub/logo.png'));
  await d.waitForFunction(() => document.querySelector('[data-testid=vista-previa] img'), null, { timeout: 20000 });
  check('Sugiere colores del logo', (await d.getByTestId('color-principal').getByRole('button', { name: /Del logo/ }).count()) > 0);
  await d.getByTestId('color-principal').getByRole('button', { name: 'Deep Navy' }).click();
  await d.getByTestId('color-acento').getByRole('button', { name: 'Volt Lime' }).click();
  await d.getByTestId('color-fondo').getByLabel('Fondo en código').fill('#c7e4f3');
  await d.getByTestId('fuente-texto').selectOption('Space Grotesk');
  await d.getByRole('radio', { name: 'Redondas' }).click();
  await d.getByTestId('slogan').fill('Jugá bajo las luces');
  await d.getByTestId('foto-portada').getByRole('button', { name: 'Subir' }).click();
  await d.getByTestId('input-foto').setInputFiles(path.join(ROOT, 'public/img/inicio-club.webp'));
  await d.waitForFunction(() => document.querySelector('[data-testid=foto-portada] img'), null, { timeout: 20000 });
  await d.getByTestId('foto-reservar').getByRole('button', { name: 'Subir' }).click();
  await d.getByTestId('input-foto').setInputFiles(path.join(ROOT, 'public/img/cancha-descubierta.webp'));
  await d.waitForFunction(() => document.querySelector('[data-testid=foto-reservar] img'), null, { timeout: 20000 });
  await d.waitForTimeout(1500);
  check('Contraste OK con la marca nueva', (await d.getByTestId('control-contraste').innerText()).includes('Se lee bien'));
  check('Vista previa con el slogan', (await d.getByTestId('vista-previa').innerText()).includes('Jugá bajo las luces'));
  const btn = await d.getByTestId('guardar-marca').innerText();
  check('Botón avisa que va a revisión', btn.includes('revisión'), btn);
  await d.screenshot({ path: `${OUT}/3-apariencia-padelclub.png`, fullPage: true });
  await d.getByTestId('vista-previa').screenshot({ path: `${OUT}/3b-vista-previa.png` });
  await d.getByTestId('guardar-marca').click();
  await d.waitForSelector('[data-testid=aviso-revision]', { timeout: 20000 });
  check('Queda en revisión', (await d.getByTestId('aviso-revision').innerText()).includes('primera marca'));
  await d.screenshot({ path: `${OUT}/4-en-revision.png` });

  // 2. Jugador antes de aprobar: Armá Partido
  const j0 = await entrar(b, /Martín Silva/, { width: 390, height: 844 });
  check('Sin aprobar, el jugador ve Armá Partido', (await j0.locator('[data-testid=portada-club]').count()) === 0 && (await cssVar(j0, '--color-brand')) === '#0a5761', await cssVar(j0, '--color-brand'));
  await j0.context().close();

  // 3. Equipo aprueba
  const e = await entrar(b, /Equipo Armá Partido/);
  await e.goto(`${URL}/?tab=platform`); await e.waitForTimeout(4000);
  await e.getByTestId('revision-marcas').scrollIntoViewIfNeeded();
  await e.getByTestId('revision-marcas').screenshot({ path: `${OUT}/5-plataforma-revision.png` });
  await e.locator('[data-testid^=aprobar-]').first().click();
  await e.waitForFunction(() => !document.querySelector('[data-testid^=aprobar-]'), null, { timeout: 20000 });
  check('El Equipo aprueba', true);

  // 4. Jugador con la marca
  const j = await entrar(b, /Martín Silva/, { width: 390, height: 844 });
  await j.waitForSelector('[data-testid=portada-club]', { timeout: 15000 });
  const brand = await cssVar(j, '--color-brand');
  check('Jugador ve los colores del club', brand === '#0b132b', brand);
  check('Jugador ve el logo en el header', (await j.locator('[data-testid=logo-club]').count()) === 1);
  check('Portada con slogan en Inicio', (await j.getByTestId('portada-club').innerText()).includes('Jugá bajo las luces'));
  check('Letra del club', (await j.evaluate(() => getComputedStyle(document.body).fontFamily)).includes('Space Grotesk'));
  check('Esquinas redondas', (await cssVar(j, '--radius-xl')) === '20px', await cssVar(j, '--radius-xl'));
  await j.waitForTimeout(1500);
  await j.screenshot({ path: `${OUT}/6-jugador-inicio.png` });
  await j.goto(`${URL}/?tab=booking`); await j.waitForTimeout(3500);
  const fotoReservar = await j.locator('header img').first().getAttribute('src');
  check('Reservar usa la foto del club', /firebasestorage|9199/.test(fotoReservar || ''), (fotoReservar || '').slice(0, 60));
  await j.screenshot({ path: `${OUT}/7-jugador-reservar.png` });
  const jd = await entrar(b, /Martín Silva/, { width: 1280, height: 900 });
  await jd.waitForSelector('[data-testid=portada-club]', { timeout: 15000 });
  await jd.waitForTimeout(1500);
  await jd.screenshot({ path: `${OUT}/6b-jugador-inicio-compu.png` });
  await jd.context().close();

  // 5. Solo un color: se publica solo
  await d.reload(); await d.waitForTimeout(6000);
  await d.getByRole('button', { name: /^Apariencia/ }).locator('visible=true').first().click();
  await d.waitForSelector('[data-testid=aviso-publicada]', { timeout: 15000 });
  await d.getByTestId('color-acento').getByRole('button', { name: 'Amarillo' }).click();
  const btn2 = await d.getByTestId('guardar-marca').innerText();
  check('Cambio de color: "Guardar cambios" sin revisión', btn2 === 'Guardar cambios', btn2);
  await d.getByTestId('guardar-marca').click();
  await j.waitForFunction(() => getComputedStyle(document.documentElement).getPropertyValue('--color-action').trim() === '#facc15', null, { timeout: 20000 });
  check('El jugador ve el acento nuevo al instante', true);
  await d.screenshot({ path: `${OUT}/8-dueña-con-marca.png` });

  // 6. Sin Imagen completa → Armá Partido
  await e.reload(); await e.waitForTimeout(5000);
  await e.locator('[data-testid^=paquete-]').first().click();
  await j.waitForFunction(() => !document.querySelector('[data-testid=portada-club]') && getComputedStyle(document.documentElement).getPropertyValue('--color-brand').trim() === '#0a5761', null, { timeout: 20000 });
  check('Sin Imagen completa vuelve a Armá Partido', true);
  await j.screenshot({ path: `${OUT}/9-jugador-sin-paquete.png` });
  await e.locator('[data-testid^=paquete-]').first().click();
  await j.waitForSelector('[data-testid=portada-club]', { timeout: 20000 });

  const errs = [...d.errs, ...e.errs, ...j.errs];
  check('Sin errores en la página', errs.length === 0, errs.join(' / '));
  await b.close();
  const bad = results.filter((x) => !x).length;
  console.log(`${results.length - bad} de ${results.length} bien`);
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error('FALLA', e.message); process.exit(1); });
