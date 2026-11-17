// "Solo mis jugadores" de punta a punta en los EMULADORES (17/11/2026), con capturas.
// Necesita `npm run dev:demo` (con VITE_DEMO_MODE=1 y VITE_DEMO_PASSWORD) y la demo cargada (scripts/seed-demo.ts).
// Uso: node scripts/verify-sumarse.cjs http://127.0.0.1:5173 <carpeta>
// Pone el club en "Solo mis jugadores" desde la pantalla, registra dos jugadores nuevos (uno con el mail en Clientes
// y otro desconocido con el celular de una ficha), y el encargado une al segundo desde el Mostrador.
process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const admin = require('../functions/node_modules/firebase-admin/lib/app/index.js');
const { getFirestore } = require('../functions/node_modules/firebase-admin/lib/firestore/index.js');
const { getAuth } = require('../functions/node_modules/firebase-admin/lib/auth/index.js');
if (!admin.getApps().length) admin.initializeApp({ projectId: 'demo-armapartido' });
const db = getFirestore();
const auth = getAuth();
const CLUB = 'los_jacarandas';
const [url, out] = process.argv.slice(2);
const base = url.replace(/\/$/, '');
fs.mkdirSync(out, { recursive: true });
const results = [];
const check = (name, ok, extra = '') => { results.push(`${ok ? 'OK  ' : 'MAL '} ${name}${extra ? ` (${extra})` : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errs = [];

async function entrar(b, rol, w = 1440, h = 1000) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, locale: 'es-UY' });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(base + '/', { waitUntil: 'domcontentloaded' });
  await p.getByRole('button', { name: new RegExp(`Entrar como ${rol}`, 'i') }).click({ timeout: 30000 });
  await p.waitForTimeout(4000);
  return p;
}

/** Registro completo por la pantalla. El emulador no manda el mail de confirmación: se marca confirmado a mano. */
async function registrar(b, mail, nombre, celular) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'es-UY' });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(base + '/', { waitUntil: 'domcontentloaded' });
  await p.getByTestId('demo-crear-cuenta').click({ timeout: 30000 });
  await p.fill('#auth-mail', mail);
  await p.fill('#auth-clave', 'clave-prueba-123');
  await p.getByTestId('auth-enviar').click();
  await p.waitForSelector('#reg-nombre', { timeout: 30000 });
  const u = await auth.getUserByEmail(mail);
  await auth.updateUser(u.uid, { emailVerified: true });
  await p.fill('#reg-nombre', nombre);
  await p.fill('#reg-celular', celular);
  await p.check('#reg-acepto');
  await p.getByRole('button', { name: 'Seguir', exact: true }).click();
  await p.getByRole('button', { name: 'Seguir sin foto', exact: true }).click();
  await p.getByTestId('cat-6').click();
  await p.getByRole('button', { name: 'Seguir', exact: true }).click();
  await p.getByRole('radio', { name: 'Femenino', exact: true }).click();
  await p.getByRole('radio', { name: 'Mixtos' }).click();
  await p.getByRole('radio', { name: 'Revés' }).click();
  await p.getByRole('button', { name: 'Seguir', exact: true }).click();
  await p.getByRole('button', { name: 'Seguir sin horarios', exact: true }).click();
  await p.getByTestId('reg-terminar').click();
  await p.getByRole('button', { name: 'Armar un partido' }).waitFor({ timeout: 40000 });
  await p.waitForTimeout(800);
  return { p, uid: u.uid };
}

(async () => {
  const club = db.doc(`clubs/${CLUB}`);
  // Si se corre de nuevo: cuentas de prueba de la vez anterior afuera
  for (const mail of ['florencia.socia@ejemplo.uy', 'matias.nuevo@ejemplo.uy']) {
    const u = await auth.getUserByEmail(mail).catch(() => null);
    if (!u) continue;
    await auth.deleteUser(u.uid);
    await club.collection('memberships').doc(u.uid).delete();
    await club.collection('joinRequests').doc(u.uid).delete();
    await club.collection('clients').doc(`u_${u.uid}`).delete();
  }
  // Ficha de la planilla con su mail y su turno fijo (como si la hubiera importado el club)
  await club.collection('clients').doc('vs_socia').set({ id: 'vs_socia', clubId: CLUB, name: 'Florencia Socia', phone: '+59891234001', noPhone: false, email: 'florencia.socia@ejemplo.uy', category: 4, uid: '', origin: 'migracion', createdByUid: 'x', createdByName: 'Importación', createdOn: '2026-11-17', noticeGiven: false, acceptsNews: false, rut: '', businessName: '', note: '', balance: 0, status: 'active', createdAt: new Date(), updatedAt: new Date() });
  await club.collection('fixedBookings').doc('vs_fijo').set({ id: 'vs_fijo', clubId: CLUB, courtId: 'x', courtName: 'Cancha 1', dayOfWeek: 2, startMinute: 20 * 60, endMinute: 21 * 60 + 30, holderName: 'Florencia Socia', holderUid: '', clientId: 'vs_socia', phone: '', fromDate: '2026-11-17', untilDate: '2027-05-11', active: true, bookingIds: [], createdByUid: 'x', createdAt: new Date(), updatedAt: new Date() });
  // Ficha sin mail con un celular: el desconocido va a tener el mismo
  await club.collection('clients').doc('vs_parecido').set({ id: 'vs_parecido', clubId: CLUB, name: 'Matías Pereira', phone: '+59891234002', noPhone: false, email: '', category: 5, uid: '', origin: 'migracion', createdByUid: 'x', createdByName: 'Importación', createdOn: '2026-11-17', noticeGiven: false, acceptsNews: false, rut: '', businessName: '', note: '', balance: 0, status: 'active', createdAt: new Date(), updatedAt: new Date() });

  const b = await chromium.launch();
  // 1) La dueña pone "Solo mis jugadores"
  const d = await entrar(b, 'dueña del club');
  await d.goto(base + '/?tab=admin', { waitUntil: 'domcontentloaded' });
  await d.getByRole('button', { name: /Jugadores y encargados/ }).first().click({ timeout: 30000 });
  await d.getByTestId('quien-se-suma').waitFor({ timeout: 20000 });
  await d.getByTestId('politica-solo_clientes').click();
  await sleep(2000);
  check('La dueña cambia a "Solo mis jugadores"', (await club.get()).get('joinPolicy') === 'solo_clientes');
  await d.getByTestId('quien-se-suma').screenshot({ path: `${out}/1-interruptor.png` });

  // 2) Jugadora con su mail en Clientes
  const s = await registrar(b, 'florencia.socia@ejemplo.uy', 'Florencia Rodríguez', '099 555 111');
  const sTxt = await s.p.locator('body').innerText();
  check('Socia: "¡Te encontramos!" y su turno fijo', /Te encontramos, Florencia/.test(sTxt) && /martes 20:00 · Cancha 1/.test(sTxt), sTxt.slice(0, 160).replace(/\n/g, ' | '));
  await s.p.screenshot({ path: `${out}/2-jugador-encontrado.png` });
  check('Socia: queda en el club y unida a su ficha', (await club.collection('memberships').doc(s.uid).get()).exists && (await club.collection('clients').doc('vs_socia').get()).get('uid') === s.uid);

  // 3) Desconocido con el celular de una ficha
  const x = await registrar(b, 'matias.nuevo@ejemplo.uy', 'Matías Pereira', '091 234 002');
  check('Desconocido: "Le mandamos tu pedido"', (await x.p.getByTestId('sumarse-pendiente').count()) === 1);
  await x.p.screenshot({ path: `${out}/3-jugador-pedido.png` });
  await x.p.getByRole('button', { name: 'Reservar cancha' }).click();
  await x.p.getByTestId('pedido-sumarse').waitFor({ timeout: 20000 }).catch(() => {});
  check('Desconocido: al entrar ve "Esperando que el club te confirme"', /Esperando que/.test(await x.p.getByTestId('pedido-sumarse').innerText().catch(() => '')));
  await x.p.screenshot({ path: `${out}/4-jugador-esperando.png` });
  check('Desconocido: no es del club todavía', !(await club.collection('memberships').doc(x.uid).get()).exists);

  // 4) La dueña ve el pedido en Admin
  await d.reload({ waitUntil: 'domcontentloaded' });
  await d.getByRole('button', { name: /Jugadores y encargados/ }).first().click({ timeout: 30000 });
  await d.getByTestId(`pedido-${x.uid}`).waitFor({ timeout: 20000 });
  const badge = await d.getByTestId('badge-nuevos').innerText().catch(() => '');
  check('Admin: el pedido aparece, con "Unir a su ficha" y la insignia en el menú', /Matías Pereira/.test(await d.getByTestId('pedidos-sumarse').innerText()) && Number(badge) >= 1, `insignia ${badge}`);
  await d.screenshot({ path: `${out}/5-admin-pedidos.png` });

  // 5) El encargado lo une desde el Mostrador
  const m = await entrar(b, 'encargado de mostrador');
  await m.goto(base + '/?tab=staff', { waitUntil: 'domcontentloaded' });
  await m.getByTestId('mostrador-pedidos').waitFor({ timeout: 30000 });
  await m.getByTestId('mostrador-pedidos').getByRole('button').first().click();
  await m.getByTestId(`aprobar-${x.uid}`).waitFor({ timeout: 10000 });
  await m.screenshot({ path: `${out}/6-mostrador-pedidos.png` });
  await m.getByTestId(`aprobar-${x.uid}`).click();
  await sleep(4000);
  check('Mostrador: al unir, el jugador queda en el club y con la ficha que ya tenía', (await club.collection('memberships').doc(x.uid).get()).exists && (await club.collection('clients').doc('vs_parecido').get()).get('uid') === x.uid);
  check('Mostrador: el aviso de pedidos desaparece', (await m.getByTestId('mostrador-pedidos').count()) === 0);
  await m.screenshot({ path: `${out}/7-mostrador-despues.png` });

  // 6) El jugador ya no ve el aviso de espera
  await x.p.reload({ waitUntil: 'domcontentloaded' });
  await sleep(5000);
  check('Jugador: ya no espera la confirmación', (await x.p.getByTestId('pedido-sumarse').count()) === 0);
  await x.p.screenshot({ path: `${out}/8-jugador-adentro.png` });

  await club.update({ joinPolicy: 'abierto' });
  check('Sin errores en la página', errs.length === 0, errs.join(' / ').slice(0, 300));
  await b.close();
  console.log(results.join('\n'));
  const bad = results.filter((r) => r.startsWith('MAL')).length;
  console.log(`${results.length - bad} de ${results.length} bien`);
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error('FALLÓ', e.message); console.log(results.join('\n')); process.exit(1); });
