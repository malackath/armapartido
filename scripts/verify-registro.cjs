// Uso: node registro.cjs <url> <carpeta> [mail]
const { chromium } = require('playwright');
const path = require('path');
const [url, out, mailArg] = process.argv.slice(2);
const mail = mailArg || `nuevo${Date.now() % 100000}@prueba.armapartido.com`;
const photo = path.resolve(process.env.FOTO || 'public/img/demo/perfiles/demo-p07.webp');
const log = (...a) => console.log(...a);
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'es-UY' });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  const shot = async (n) => { await p.waitForTimeout(500); await p.screenshot({ path: `${out}/${n}.png` }); log('captura', n); };
  await p.goto(url, { waitUntil: 'domcontentloaded' });
  await p.getByTestId('demo-crear-cuenta').click({ timeout: 30000 });
  await p.fill('#auth-mail', mail);
  await p.fill('#auth-clave', 'clave-prueba-123');
  await shot('01-crear-cuenta');
  await p.getByTestId('auth-enviar').click();
  await p.waitForSelector('#reg-nombre', { timeout: 30000 });
  log('OK cuenta creada:', mail);
  // Paso 1: vos
  await p.getByRole('button', { name: 'Seguir', exact: true }).click();
  await shot('02-vos-errores');
  await p.fill('#reg-nombre', process.env.NOMBRE || 'Valentina Sosa');
  await p.fill('#reg-celular', '099 123 456');
  await p.check('#reg-acepto');
  await shot('03-vos');
  await p.getByRole('button', { name: 'Seguir', exact: true }).click();
  // Paso 2: foto
  await p.setInputFiles('#reg-foto', photo);
  await p.getByRole('button', { name: 'Seguir', exact: true }).waitFor({ timeout: 30000 });
  await shot('04-foto');
  await p.getByRole('button', { name: 'Seguir', exact: true }).click();
  // Paso 3: categoría + ayuda
  await p.getByRole('button', { name: /No sé|no sé/ }).first().click().catch(() => log('sin botón de ayuda'));
  await shot('05-ayuda');
  await p.getByRole('button', { name: 'Entendido' }).click();
  await p.getByTestId('cat-6').click();
  await shot('06-categoria');
  await p.getByRole('button', { name: 'Seguir', exact: true }).click();
  // Paso 4: juego
  await p.getByRole('radio', { name: 'Femenino', exact: true }).click();
  await p.getByRole('radio', { name: 'Mixtos' }).click();
  await p.getByRole('radio', { name: 'Revés' }).click();
  await p.getByRole('radio', { name: 'Derecha' }).click();
  await shot('07-juego');
  await p.getByRole('button', { name: 'Seguir', exact: true }).click();
  // Paso 5: cuándo
  for (const k of ['2-3', '4-3', '6-0']) await p.getByTestId(`franja-${k}`).click();
  await shot('08-cuando');
  log('resumen:', await p.getByTestId('resumen-horarios').innerText());
  await p.getByRole('button', { name: 'Seguir', exact: true }).click();
  // Paso 6: avisos
  await shot('09-avisos');
  await p.getByTestId('reg-terminar').click();
  await p.getByRole('button', { name: 'Armar un partido' }).waitFor({ timeout: 30000 });
  await shot('10-listo');
  log('OK registro terminado');
  await p.getByRole('button', { name: 'Reservar cancha' }).click();
  await p.waitForTimeout(1500);
  await shot('11-entro-a-la-app');
  // Perfil
  await p.evaluate(() => { const u = new URL(location.href); u.searchParams.set('tab', 'profile'); history.pushState({}, '', u); });
  await p.goto(url.replace(/\/$/, '') + '/?tab=profile', { waitUntil: 'domcontentloaded' });
  await p.getByTestId('ficha-jugador').first().waitFor({ timeout: 30000 });
  await shot('12-perfil-juego');
  await p.getByRole('tab', { name: /Mi cuenta/ }).click().catch(() => p.getByRole('button', { name: /Mi cuenta/ }).click());
  await shot('13-perfil-cuenta');
  await p.getByRole('tab', { name: /Ajustes/ }).click().catch(() => p.getByRole('button', { name: /Ajustes/ }).click());
  await shot('14-perfil-ajustes');
  await p.setViewportSize({ width: 1440, height: 1000 });
  await p.getByRole('tab', { name: /Mi juego/ }).click().catch(() => p.getByRole('button', { name: /Mi juego/ }).click());
  await shot('15-perfil-compu');
  log('errores de página:', errs.length ? errs : 'ninguno');
  await b.close();
})().catch(async (e) => { console.error('FALLÓ', e.message); process.exit(1); });
