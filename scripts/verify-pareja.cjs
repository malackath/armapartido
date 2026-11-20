// Pareja fija sin torneo (20/11/2026) de punta a punta en los EMULADORES, con capturas.
// Necesita `npm run dev:demo` (VITE_DEMO_MODE=1 y VITE_DEMO_PASSWORD) y la demo cargada (scripts/seed-demo.ts).
// Uso: node scripts/verify-pareja.cjs http://127.0.0.1:5173 <carpeta>
// Martín ve su pareja con Rodrigo y la invitación de Mateo, acepta, cambia horarios e invita a otro jugador.
process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const admin = require('../functions/node_modules/firebase-admin/lib/app/index.js');
const { getFirestore } = require('../functions/node_modules/firebase-admin/lib/firestore/index.js');
if (!admin.getApps().length) admin.initializeApp({ projectId: 'demo-armapartido' });
const db = getFirestore();
const CLUB = 'los_jacarandas';
const [url, out] = process.argv.slice(2);
const base = url.replace(/\/$/, '');
fs.mkdirSync(out, { recursive: true });
const results = [];
const check = (name, ok, extra = '') => results.push(`${ok ? 'OK  ' : 'MAL '} ${name}${extra ? ` (${extra})` : ''}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errs = [];

async function entrar(b, w, h) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, locale: 'es-UY' });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(base + '/', { waitUntil: 'domcontentloaded' });
  await p.getByRole('button', { name: /Entrar como jugador \(5ta\)/i }).click({ timeout: 30000 });
  await p.waitForTimeout(4000);
  return p;
}
async function irAPerfil(p) {
  await p.getByRole('button', { name: /^Perfil$/ }).first().click();
  await p.getByTestId('pareja-fija').waitFor({ timeout: 20000 });
  await p.waitForTimeout(800);
}
const pairReqs = async (id) => (await db.collection(`clubs/${CLUB}/matchRequests`).where('fixedPairId', '==', id).get()).docs.map((d) => d.data());

(async () => {
  const b = await chromium.launch();
  try {
    // Celular
    const p = await entrar(b, 390, 844);
    await irAPerfil(p);
    const card = p.getByTestId('pareja-fija');
    await card.scrollIntoViewIfNeeded();
    const txt = await card.innerText();
    check('1. Se ve la pareja con Rodrigo y sus horarios', /Vos y Rodrigo Núñez/.test(txt) && /noche/.test(txt), txt.split('\n').slice(0, 6).join(' | '));
    check('2. Se ve la invitación de Mateo con Aceptar', /Mateo Cabrera te invita/.test(txt) && /Aceptar/.test(txt));
    await card.screenshot({ path: path.join(out, '1-celular-mi-pareja-fija.png') });
    await p.screenshot({ path: path.join(out, '1b-celular-mi-juego-pantalla.png'), fullPage: true });

    await card.getByRole('button', { name: 'Aceptar' }).click();
    await sleep(4000);
    const mateo = (await db.doc(`clubs/${CLUB}/fixedPairs/pair_demo_mateo_martin`).get()).data();
    check('3. Aceptar la invitación de Mateo la deja activa', mateo.status === 'active', mateo.status);
    const mreqs = await pairReqs('pair_demo_mateo_martin');
    check('4. Al aceptar, la app ya busca rivales los domingos (pedido semanal)', mreqs.some((r) => r.status === 'waiting' || r.status === 'proposed') && mreqs.every((r) => r.dayOfWeek === 0), `${mreqs.length} pedidos`);

    await p.getByTestId('editar-pareja-demo-p09').click();
    await p.getByTestId('pareja-editor').waitFor();
    await p.getByTestId('pareja-franja-3-3').click(); // suma miércoles de noche
    await p.getByTestId('pareja-editor').screenshot({ path: path.join(out, '2-celular-horarios-de-la-pareja.png') });
    await p.getByTestId('pareja-guardar').click();
    await sleep(4000);
    const rod = (await db.doc(`clubs/${CLUB}/fixedPairs/pair_demo_martin_rodrigo`).get()).data();
    check('5. Guardar suma el miércoles a la pareja', rod.cells.includes('3-3'), rod.cells.join(','));
    const rreqs = (await pairReqs('pair_demo_martin_rodrigo')).filter((r) => r.status === 'waiting' || r.status === 'proposed');
    check('6. Hay pedido semanal para el miércoles de noche', rreqs.some((r) => r.dayOfWeek === 3), rreqs.map((r) => `${r.dayOfWeek}:${r.status}`).join(','));

    await p.getByTestId('invitar-pareja').click();
    await p.getByTestId('invitar-pareja-panel').waitFor();
    const ptxt = await p.getByTestId('invitar-pareja-panel').innerText();
    check('7. La lista para invitar no muestra a Rodrigo ni a Mateo (ya son pareja)', !/Rodrigo Núñez/.test(ptxt) && !/Mateo Cabrera/.test(ptxt));
    await p.getByTestId('invitar-pareja-panel').screenshot({ path: path.join(out, '3-celular-invitar-pareja.png') });
    await p.getByRole('button', { name: 'Volver' }).click();

    const pn = await p.getByTestId('ir-prefiero-no');
    await pn.click();
    await p.waitForTimeout(800);
    check('8. "Prefiero no jugar con" se abre desde Mi juego', /Prefiero no jugar con/i.test(await p.locator('body').innerText()) && (await p.getByRole('tab', { name: 'Ajustes' }).getAttribute('aria-selected')) === 'true');

    // Compu
    const d = await entrar(b, 1440, 1000);
    await irAPerfil(d);
    await d.getByTestId('pareja-fija').scrollIntoViewIfNeeded();
    await d.screenshot({ path: path.join(out, '4-compu-mi-juego.png') });
    await d.getByTestId('editar-pareja-demo-p09').click();
    await d.getByTestId('pareja-editor').waitFor();
    await d.getByTestId('pareja-editor').screenshot({ path: path.join(out, '5-compu-horarios-de-la-pareja.png') });
    check('9. Sin errores en la página', errs.length === 0, errs.slice(0, 3).join(' / '));
  } catch (e) {
    check('Error inesperado', false, e.message);
  } finally {
    await b.close();
  }
  console.log(results.join('\n'));
  process.exit(results.some((r) => r.startsWith('MAL')) ? 1 : 0);
})();
