// Verifica en la demo publicada: reinicia los datos (como la dueña) y saca capturas de
// Falta uno, caja, cantina, turnos fijos, informe del mes, Mi cuenta y seña.
// Uso: CHANNEL=chrome node scripts/verify-caja.cjs https://demo.armapartido.com <carpeta-capturas>
const { chromium } = require('playwright');
const URL = process.argv[2] || 'https://demo.armapartido.com';
const OUT = process.argv[3] || '.';
require('fs').mkdirSync(OUT, { recursive: true });
const NAMES = { jugador: 'Martín Silva', mostrador: 'Diego Fernández', dueno: 'Sofía Rodríguez', jugadora: 'Lucía Pérez' };
const seg = (t, a, n = 300) => { const i = t.indexOf(a); return i < 0 ? `(no aparece "${a}")` : t.slice(i, i + n).replace(/\n+/g, ' | '); };
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok }); console.log(`${ok ? 'OK  ' : 'FALLA'} ${name}${detail ? ' · ' + detail : ''}`); };

async function enter(b, who, vp) {
  const c = await b.newContext({ viewport: vp || { width: 1280, height: 1000 } });
  const p = await c.newPage();
  p.errs = [];
  p.on('pageerror', (e) => p.errs.push(e.message));
  p.on('dialog', (d) => d.accept());
  await p.goto(URL);
  await p.waitForSelector('text=/Probá la demo|Entrá a tu club/', { timeout: 40000 });
  await p.getByRole('button', { name: new RegExp(NAMES[who]) }).click();
  await p.waitForTimeout(7000);
  return { c, p };
}
const V = (l) => l.locator('visible=true').first();
async function menu(p, label) {
  await p.locator('header button').last().click();
  await p.waitForTimeout(700);
  await p.getByText(label).first().click();
  await p.waitForTimeout(3500);
}
async function adminSection(p, label, file, key) {
  await V(p.getByRole('button', { name: new RegExp('^' + label) })).click();
  await p.waitForTimeout(3000);
  await p.screenshot({ path: `${OUT}/${file}.png`, fullPage: true });
  const t = await p.innerText('body');
  check(`Admin → ${label}`, t.includes(key), seg(t, key, 160));
}

(async () => {
  const b = await chromium.launch(process.env.CHANNEL ? { channel: process.env.CHANNEL } : {});
  // 1) Dueña: reiniciar la demo
  let { c, p } = await enter(b, 'dueno');
  await menu(p, 'Reiniciar demo');
  let done = false;
  for (let i = 0; i < 40 && !done; i++) { await p.waitForTimeout(1500); done = (await p.innerText('body')).includes('Demo reiniciada'); }
  check('Reiniciar demo', done);
  await p.reload(); await p.waitForTimeout(7000);
  await menu(p, 'Admin del club');
  await adminSection(p, 'Falta uno', '1-admin-falta-uno', 'Buscar reemplazo solo');
  await adminSection(p, 'Cantina', '2-admin-cantina', 'Tubo de pelotas');
  await adminSection(p, 'Turnos fijos', '3-admin-turnos-fijos', 'Grupo de los martes');
  await adminSection(p, 'Caja', '4-admin-caja', 'Cierres de caja');
  await adminSection(p, 'Informe del mes', '5-admin-informe', 'Lo que suma al total');
  await V(p.getByRole('button', { name: /Ver el mail/ })).click(); await p.waitForTimeout(2500);
  await p.screenshot({ path: `${OUT}/6-admin-vista-mail.png` });
  check('Informe → Ver el mail', (await p.locator('iframe').count()) > 0);
  console.log('   errores de página:', p.errs.length);
  await c.close();
  // 2) Mostrador
  ({ c, p } = await enter(b, 'mostrador'));
  await menu(p, 'Mostrador');
  let t = await p.innerText('body');
  check('Mostrador: botones Caja y Venta rápida', /Caja/.test(t) && t.includes('Venta rápida'));
  await p.screenshot({ path: `${OUT}/7-mostrador.png` });
  const turno = p.locator('button').filter({ hasText: /Partido armado/i }).first();
  if (await turno.count()) {
    await turno.click(); await p.waitForTimeout(2000);
    t = await p.innerText('body');
    check('Mostrador: cuenta del turno con cantina', t.includes('AGREGAR DE LA CANTINA') || /Agregar de la cantina/i.test(t), seg(t, 'Falta cobrar', 60));
    await p.screenshot({ path: `${OUT}/8-mostrador-cuenta-turno.png` });
  } else check('Mostrador: cuenta del turno con cantina', false, 'no encontré el partido armado de hoy');
  await V(p.getByRole('button', { name: /^Caja/ })).click(); await p.waitForTimeout(2000);
  t = await p.innerText('body');
  check('Mostrador: panel de caja', /Caja de hoy/.test(t));
  await p.screenshot({ path: `${OUT}/9-mostrador-caja.png` });
  console.log('   errores de página:', p.errs.length);
  await c.close();
  // 3) Jugador en celular
  ({ c, p } = await enter(b, 'jugador', { width: 390, height: 844 }));
  await p.screenshot({ path: `${OUT}/10-jugador-inicio.png` });
  await V(p.getByRole('button', { name: /^Perfil$/ })).click(); await p.waitForTimeout(3000);
  t = await p.innerText('body');
  check('Jugador: Mi cuenta en el club', t.includes('Mi cuenta en'), seg(t, 'Mi cuenta en', 120));
  check('Jugador: Avisos de Falta uno', /Avisos/i.test(t));
  await p.screenshot({ path: `${OUT}/11-jugador-perfil.png`, fullPage: true });
  console.log('   errores de página:', p.errs.length);
  await c.close();
  await b.close();
  const bad = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - bad} de ${results.length} verificaciones OK. Capturas en ${OUT}`);
  process.exit(bad ? 1 : 0);
})();
