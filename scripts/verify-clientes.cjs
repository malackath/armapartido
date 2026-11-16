// Prueba de punta a punta de clientes, cuponeras, saldo, venta suelta, libro con factura y Números.
// Corre contra los emuladores (npm run dev:demo con VITE_DEMO_MODE=1 y la demo cargada) o contra la
// demo publicada. Saca capturas de escritorio y celular.
// Uso: node scripts/verify-clientes.cjs http://127.0.0.1:5173 <carpeta-capturas>
//      CHANNEL=chrome node scripts/verify-clientes.cjs https://demo.armapartido.com <carpeta>
const { chromium } = require('playwright');
const URL = process.argv[2] || 'http://127.0.0.1:5173';
const OUT = process.argv[3] || '.';
require('fs').mkdirSync(OUT, { recursive: true });
const NAMES = { jugador: 'Martín Silva', mostrador: 'Diego Fernández', dueno: 'Sofía Rodríguez' };
const seg = (t, a, n = 160) => { const i = t.indexOf(a); return i < 0 ? `(no aparece "${a}")` : t.slice(i, i + n).replace(/\n+/g, ' | '); };
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok: !!ok }); console.log(`${ok ? 'OK  ' : 'FALLA'} ${name}${detail ? ' · ' + detail : ''}`); };
const DESK = { width: 1366, height: 900 };
const PHONE = { width: 390, height: 844 };

async function enter(b, who, vp = DESK) {
  const c = await b.newContext({ viewport: vp, deviceScaleFactor: 2 });
  const p = await c.newPage();
  p.errs = [];
  p.on('pageerror', (e) => p.errs.push(e.message));
  p.on('dialog', (d) => d.accept());
  await p.goto(URL);
  await p.waitForSelector('text=/Probá la demo|Entrá a tu club/', { timeout: 40000 });
  await p.getByRole('button', { name: new RegExp(NAMES[who]) }).click();
  await p.waitForTimeout(6000);
  return { c, p };
}
const V = (l) => l.locator('visible=true').first();
const body = (p) => p.innerText('body');
async function menu(p, label) {
  await p.locator('header button').last().click();
  await p.waitForTimeout(700);
  await p.getByText(label).first().click();
  await p.waitForTimeout(3500);
}
async function shot(p, file, full = false) {
  await p.screenshot({ path: `${OUT}/${file}.png`, fullPage: full });
}
async function section(p, label) {
  await V(p.getByRole('button', { name: new RegExp('^' + label) })).click();
  await p.waitForTimeout(2500);
}

(async () => {
  const b = await chromium.launch(process.env.CHANNEL ? { channel: process.env.CHANNEL } : {});

  // ---------------- Mostrador (Diego), escritorio ----------------
  let { c, p } = await enter(b, 'mostrador');
  await menu(p, 'Mostrador');
  let t = await body(p);
  check('Mostrador: botones "Venta suelta" y "Clientes"', t.includes('Venta suelta') && t.includes('Clientes'));

  await V(p.getByRole('button', { name: /Clientes/ })).click();
  await p.waitForTimeout(2000);
  t = await body(p);
  check('Clientes: lista con y sin app', t.includes('Ana Laura Techera') && /clientes · \d+ con app/.test(t), seg(t, 'clientes ·', 60));
  check('Clientes: chips de deuda, cuponera y saldo', t.includes('Debe') && t.includes('Cuponera:') && t.includes('Saldo'));
  await shot(p, '01-mostrador-clientes');

  await V(p.getByRole('button', { name: /Posibles repetidos/ })).click();
  await p.waitForTimeout(800);
  t = await body(p);
  check('Clientes: "Posibles repetidos" muestra a Jorge Brum dos veces', (t.match(/Jorge Brum/g) || []).length >= 2, seg(t, 'Mismo celular', 120));
  await V(p.getByRole('button', { name: /^Todos$/ })).click();

  // W1: ficha
  await V(p.locator('[data-testid="clientes-lista"] button').filter({ hasText: 'Ana Laura Techera' })).click();
  await p.waitForTimeout(1500);
  t = await body(p);
  check('W1 Ficha: deuda, cuponera y movimientos', t.includes('Cobrar lo que debe') && t.includes('Invitarlo a la app'), seg(t, 'Ana Laura Techera', 200));
  await shot(p, '02-ficha-cliente');
  await V(p.getByRole('button', { name: /^Cuponeras/ })).click().catch(() => {});
  await p.waitForTimeout(800);
  t = await body(p);
  check('W1 Ficha → Cuponeras: "5 turnos completos" con usos', t.includes('5 turnos completos'), seg(t, '5 turnos completos', 120));
  await shot(p, '03-ficha-cuponeras');
  await p.keyboard.press('Escape');
  await p.waitForTimeout(500);

  // W2: alta con celular repetido
  await p.reload();
  await p.waitForTimeout(5000);
  if (!(await body(p)).includes('Venta suelta')) await menu(p, 'Mostrador');
  await V(p.getByRole('button', { name: /Clientes/ })).click();
  await p.waitForTimeout(1500);
  await V(p.getByRole('button', { name: /\+ Nuevo cliente/ })).click();
  await p.waitForTimeout(500);
  const nuevo = p.locator('[data-testid="clientes-lista"]');
  const startNew = nuevo.getByRole('button', { name: /\+ Nuevo cliente/ });
  if (await startNew.count() > 1) await startNew.last().click();
  else if (await nuevo.getByPlaceholder('Nombre y apellido').count() === 0) await startNew.first().click();
  await p.waitForTimeout(500);
  await V(p.getByPlaceholder('Nombre y apellido')).fill('Jorge Brum');
  await V(p.getByPlaceholder(/Celular/)).fill('099 333 444');
  await V(p.getByText('Le avisé que sus datos quedan en el club')).click();
  await V(p.getByRole('button', { name: 'Guardar ficha' })).click();
  await p.waitForTimeout(1200);
  t = await body(p);
  check('W2 Alta: celular repetido pregunta "¿Es la misma persona?"', /Es la misma persona|Es alguna de estas personas/.test(t), seg(t, 'Ese celular', 90));
  await shot(p, '04-alta-repetido');
  await V(p.getByRole('button', { name: 'Volver' })).click().catch(() => {});

  // W3: cuenta del turno con cuponera (Ana, hoy 11:00, Cancha 3)
  await p.reload();
  await p.waitForTimeout(5000);
  if (!(await body(p)).includes('Venta suelta')) await menu(p, 'Mostrador');
  { const g = V(p.getByRole('tab', { name: 'Grilla' })); if (await g.count()) { await g.click(); await p.waitForTimeout(800); } } // vista Canchas: los turnos pasados están en la grilla
  const anaTurno = p.locator('button').filter({ hasText: /Ana Laura/ }).first();
  if (await anaTurno.count()) {
    await anaTurno.click();
    await p.waitForTimeout(2000);
    t = await body(p);
    check('W3 Cuenta del turno: ofrece "Usar cuponera"', t.includes('Usar cuponera'), seg(t, 'Usar cuponera', 60));
    await shot(p, '05-turno-con-cuponera');
    const usar = p.getByRole('button', { name: /Usar cuponera/ });
    if (await usar.count()) {
      await V(usar).click();
      await p.waitForTimeout(2500);
      t = await body(p);
      check('W3 Usar cuponera: la cancha queda paga sin plata nueva', /Pagad|cuponera/i.test(t) && !t.includes('Usar cuponera'), seg(t, 'Quedan', 60));
      await shot(p, '06-turno-pagado-con-cuponera');
    }
    await p.keyboard.press('Escape');
  } else check('W3 Cuenta del turno: ofrece "Usar cuponera"', false, 'no encontré el turno de Ana de las 11:00');

  // W4: venta suelta a cuenta
  await p.reload();
  await p.waitForTimeout(5000);
  if (!(await body(p)).includes('Venta suelta')) await menu(p, 'Mostrador');
  await V(p.getByRole('button', { name: /Venta suelta/ })).click();
  await p.waitForTimeout(1500);
  await V(p.getByRole('button', { name: /Sin nombre/ })).click();
  await p.waitForTimeout(800);
  t = await body(p);
  check('W4 Venta suelta: pestañas por rubro', t.includes('Cantina') && t.includes('Cuponeras y saldo') && t.includes('Clases'));
  await shot(p, '07-venta-suelta');
  console.log('   errores de página (mostrador):', p.errs.length, p.errs.slice(0, 3).join(' | '));
  await c.close();

  // ---------------- Admin (Sofía), escritorio ----------------
  ({ c, p } = await enter(b, 'dueno'));
  await menu(p, 'Admin del club');
  await section(p, 'Clientes');
  t = await body(p);
  check('Admin → Clientes', t.includes('Ana Laura Techera') && t.includes('Bajar a planilla'));
  await shot(p, '08-admin-clientes');
  await section(p, 'Cuponeras');
  t = await body(p);
  check('Admin → Cuponeras: las del club, vendidas y sin usar', t.includes('10 partes de cancha') && t.includes('Vendidas:') && t.includes('No se vende'), seg(t, 'Vendidas:', 50));
  await shot(p, '09-admin-cuponeras');
  await section(p, 'Caja');
  t = await body(p);
  check('W5 Libro de ventas con factura', t.includes('Marcar facturadas') || /Factura/.test(t), seg(t, 'Factura', 80));
  await p.locator('[data-testid="libro"]').scrollIntoViewIfNeeded().catch(() => {});
  await shot(p, '10-admin-libro', true);
  await section(p, 'Números');
  t = await body(p);
  check('W6 Números: KPIs, rubros y mapa de calor', /Ocupaci|ocupad/i.test(t) && t.includes('Cuponeras') && /Dejaron de venir/i.test(t), seg(t, 'Dejaron de venir', 80));
  await shot(p, '11-admin-numeros', true);
  await section(p, 'Informe del mes');
  t = await body(p);
  check('Informe del mes: clientes nuevos y "Llegaron por Armá Partido"', t.includes('Clientes nuevos') && t.includes('Llegaron por Armá Partido'));
  console.log('   errores de página (admin):', p.errs.length, p.errs.slice(0, 3).join(' | '));
  await c.close();

  // ---------------- Celular ----------------
  ({ c, p } = await enter(b, 'mostrador', PHONE));
  await menu(p, 'Mostrador');
  await V(p.getByRole('button', { name: /Clientes/ })).click();
  await p.waitForTimeout(1800);
  t = await body(p);
  check('Celular: Clientes en el Mostrador', t.includes('Ana Laura Techera'));
  await shot(p, '12-celular-mostrador-clientes');
  await c.close();

  ({ c, p } = await enter(b, 'dueno', PHONE));
  await menu(p, 'Admin del club');
  await section(p, 'Números');
  t = await body(p);
  check('Celular: Números', /Dejaron de venir/i.test(t));
  await shot(p, '13-celular-numeros');
  await section(p, 'Caja');
  await p.locator('[data-testid="libro"]').scrollIntoViewIfNeeded().catch(() => {});
  await p.waitForTimeout(500);
  await shot(p, '14-celular-libro');
  const sw = await p.evaluate(() => document.documentElement.scrollWidth);
  check('Celular: sin scroll de costado en el libro', sw <= 392, `ancho ${sw}`);
  await c.close();

  ({ c, p } = await enter(b, 'jugador', PHONE));
  await p.getByText('Perfil').last().click();
  await p.waitForTimeout(2500);
  const mi = p.getByText(/Mi cuenta en/).first();
  if (await mi.count()) { await mi.click(); await p.waitForTimeout(2500); }
  t = await body(p);
  check('Jugador: ve su cuponera y su saldo a favor en la app', t.includes('10 partes de cancha') && /Saldo a favor/i.test(t), seg(t, 'Saldo a favor', 60));
  await shot(p, '15-celular-jugador-mi-cuenta', true);
  console.log('   errores de página (jugador):', p.errs.length, p.errs.slice(0, 3).join(' | '));
  await c.close();

  await b.close();
  const bad = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - bad} de ${results.length} bien`);
  process.exit(bad ? 1 : 0);
})();
