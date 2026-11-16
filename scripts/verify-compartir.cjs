// Verifica las mejoras chicas del 16/11 contra los emuladores (o una demo) y saca capturas:
// link para compartir el "Falta uno" (botón, página pública sin cuenta, entrar por el link),
// "Cómo llegar", las 5 preguntas de categoría y los renglones nuevos del informe.
// Uso (emuladores con la demo cargada): node scripts/verify-compartir.cjs http://127.0.0.1:5173 <carpeta>
const { chromium } = require('playwright');
const path = require('path');
const URL = process.argv[2] || 'http://127.0.0.1:5173';
const OUT = path.resolve(process.argv[3] || '.');
require('fs').mkdirSync(OUT, { recursive: true });
const NAMES = { jugador: 'Martín Silva', mostrador: 'Diego Fernández', dueno: 'Sofía Rodríguez' };
const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(`${ok ? 'OK  ' : 'FALLA'} ${name}${detail ? ' · ' + detail : ''}`); };
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'es-UY' };

async function enter(b, who, opts = PHONE, go = URL) {
  const c = await b.newContext(opts);
  const p = await c.newPage();
  p.errs = [];
  p.on('pageerror', (e) => p.errs.push(e.message));
  await p.goto(URL);
  await p.waitForSelector('text=/Probá la demo|Entrá a tu club/', { timeout: 40000 });
  await p.getByRole('button', { name: new RegExp(NAMES[who]) }).click();
  await p.waitForTimeout(6000);
  if (go !== URL) { await p.goto(go); await p.waitForTimeout(5000); }
  return { c, p };
}

(async () => {
  const b = await chromium.launch();

  const SOLO = process.env.SOLO || '';
  if (!SOLO) {
  // 1) Jugador con un partido que busca reemplazo: el botón para compartir
  let { c, p } = await enter(b, 'jugador', PHONE, `${URL}/?tab=matchmaking`);
  const share = p.getByTestId('compartir-falta-uno').first();
  await share.waitFor({ timeout: 30000 }).catch(() => {});
  const hasShare = (await share.count()) > 0;
  check('Partido buscando reemplazo muestra "Compartir por WhatsApp"', hasShare);
  let link = '';
  if (hasShare) {
    await share.scrollIntoViewIfNeeded();
    await p.waitForTimeout(600);
    await p.screenshot({ path: `${OUT}/1-partido-compartir.png` });
    const wa = await share.getByRole('link', { name: /WhatsApp/ }).getAttribute('href');
    const text = decodeURIComponent(wa.split('text=')[1]);
    link = (text.match(/https?:\/\/\S+\/f\/\S+/) || [''])[0];
    check('Mensaje de WhatsApp con el link', !!link, text);
  }
  const maps = await p.getByRole('link', { name: /Cómo llegar/ }).first().getAttribute('href').catch(() => '');
  check('"Cómo llegar" en el partido', /google\.com\/maps/.test(maps || ''), maps);
  console.log('   errores de página:', p.errs.length, p.errs.slice(0, 2).join(' | '));
  await c.close();

  // 2) Sin cuenta: la página pública
  if (link) {
    const c2 = await b.newContext(PHONE);
    const p2 = await c2.newPage();
    p2.errs = [];
    p2.on('pageerror', (e) => p2.errs.push(e.message));
    await p2.goto(link);
    await p2.getByText(/para jugar/).first().waitFor({ timeout: 30000 }).catch(() => {});
    await p2.waitForTimeout(800);
    await p2.screenshot({ path: `${OUT}/2-link-sin-cuenta.png`, fullPage: true });
    const t = await p2.innerText('body');
    check('Página pública abre sin cuenta', /Falta 1 para jugar/.test(t), t.slice(0, 160).replace(/\n+/g, ' | '));
    check('Página pública sin nombres de jugadores', !/Florencia|Rodrigo|Mateo|Martín/.test(t));
    await p2.getByRole('button', { name: 'Quiero jugar' }).click();
    await p2.waitForTimeout(1500);
    await p2.screenshot({ path: `${OUT}/3-link-pide-cuenta.png` });
    check('"Quiero jugar" sin cuenta lleva a entrar', /Probá la demo|Entrá a tu club|Crear cuenta/.test(await p2.innerText('body')));
    console.log('   errores de página:', p2.errs.length);
    await c2.close();

    // 3) Otro jugador del club (6ta) entra por el link
    ({ c, p } = await enter(b, 'mostrador', PHONE, link));
    await p.getByRole('button', { name: 'Quiero jugar' }).click();
    await p.getByTestId('link-resultado').waitFor({ timeout: 30000 }).catch(() => {});
    await p.waitForTimeout(800);
    await p.screenshot({ path: `${OUT}/4-link-adentro.png` });
    const t3 = await p.innerText('body');
    check('Entra por el link', /¡Adentro!/.test(t3), (await p.getByTestId('link-resultado').innerText().catch(() => '')).replace(/\n+/g, ' | '));
    await p.reload();
    await p.waitForTimeout(5000);
    await p.screenshot({ path: `${OUT}/5-link-ya-completo.png` });
    check('Después, el link dice que está completo', /ya está completo|Ya estás en este partido/.test(await p.innerText('body')));
    await c.close();
  }

  }
  // 4) Registro: "No sé mi categoría" con 5 preguntas
  {
    const c4 = await b.newContext(PHONE);
    const p4 = await c4.newPage();
    p4.errs = [];
    p4.on('pageerror', (e) => p4.errs.push(e.message));
    await p4.goto(URL);
    await p4.getByTestId('demo-crear-cuenta').click({ timeout: 40000 });
    await p4.fill('#auth-mail', `cat${Date.now() % 100000}@prueba.armapartido.com`);
    await p4.fill('#auth-clave', 'clave-prueba-123');
    await p4.getByTestId('auth-enviar').click();
    await p4.waitForSelector('#reg-nombre', { timeout: 30000 });
    await p4.fill('#reg-nombre', 'Valentina Sosa');
    await p4.fill('#reg-celular', '099 123 456');
    await p4.check('#reg-acepto');
    await p4.getByRole('button', { name: 'Seguir', exact: true }).click();
    await p4.getByRole('button', { name: /^Seguir( sin foto)?$/ }).click(); // foto: se puede seguir sin foto
    await p4.getByRole('button', { name: /No sé mi categoría/ }).click();
    await p4.waitForTimeout(600);
    await p4.screenshot({ path: `${OUT}/6-categoria-preguntas.png` });
    for (const o of ['6 meses a 2 años', '1 o 2', 'Nunca', 'A veces', 'Bandeja']) await p4.getByRole('button', { name: o, exact: true }).click();
    await p4.getByTestId('sugerencia-categoria').scrollIntoViewIfNeeded();
    await p4.waitForTimeout(500);
    await p4.screenshot({ path: `${OUT}/7-categoria-sugerida.png` });
    const sug = await p4.getByTestId('sugerencia-categoria').innerText();
    check('Sugiere 6ta con esas respuestas', /6ta/.test(sug), sug.replace(/\n+/g, ' | '));
    await p4.getByRole('button', { name: 'Usar 6ta' }).click();
    await p4.waitForTimeout(600);
    await p4.screenshot({ path: `${OUT}/8-categoria-elegida.png` });
    check('Al usarla queda elegida en la escalera', (await p4.getByTestId('cat-6').getAttribute('aria-pressed').catch(() => null)) === 'true' || (await p4.getByTestId('cat-6').getAttribute('aria-checked').catch(() => null)) === 'true');
    console.log('   errores de página:', p4.errs.length);
    await c4.close();
  }

  // 5) Dueña: informe del mes con los renglones nuevos
  ({ c, p } = await enter(b, 'dueno', { viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 1 }, `${URL}/?tab=admin`));
  await p.getByRole('button', { name: /^Informe del mes/ }).locator('visible=true').first().click().catch(() => {});
  await p.waitForTimeout(3000);
  const card = p.getByText('Cómo anduvo el mes').first();
  await card.scrollIntoViewIfNeeded().catch(() => {});
  await p.waitForTimeout(500);
  await p.screenshot({ path: `${OUT}/9-informe.png` });
  const t5 = await p.innerText('body');
  check('Informe con "Reservas hechas por la app (no suman)"', /Reservas hechas por la app \(no suman\)/.test(t5));
  check('Informe con "Partidos que armó la app sola"', /Partidos que armó la app sola/.test(t5));
  await c.close();

  await b.close();
  const ok = results.filter(Boolean).length;
  console.log(`\n${ok}/${results.length} OK`);
  process.exit(ok === results.length ? 0 : 1);
})();
