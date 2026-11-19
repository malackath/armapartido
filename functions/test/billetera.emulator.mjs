// Cuponera en la billetera (19/11/2026): QR, permisos, pase de Google (con una API de Google falsa) y .pkpass de Apple.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { generateKeyPairSync, createVerify } from 'node:crypto';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
process.env.GCLOUD_PROJECT = 'demo-armapartido';
const admin = require('../node_modules/firebase-admin/lib/app/index.js');
const { getFirestore } = require('../node_modules/firebase-admin/lib/firestore/index.js');
if (!admin.getApps().length) admin.initializeApp({ projectId: 'demo-armapartido' });
const db = getFirestore();
const H = require('../lib-test/harness.js');
const CLUB = 'los_jacarandas';
const results = [];
async function step(name, fn) {
  try { await fn(); results.push(`OK   ${name}`); } catch (e) { results.push(`FALLA ${name}: ${e.message}`); }
}
const club = db.doc(`clubs/${CLUB}`);
const packRef = club.collection('clientPacks').doc('demo_pack_lucia');
const pack0 = (await packRef.get()).data();
const lucia = pack0?.uid;
const ms = (await club.collection('memberships').get()).docs.map((d) => d.data());
const staff = ms.find((m) => m.role === 'staff');
const otro = ms.find((m) => m.role === 'player' && m.uid !== lucia);
const req = (uid, data) => ({ auth: { uid, token: {} }, data });

await step('W1 la cuponera de la demo trae QR y el jugador lo recibe', async () => {
  assert.ok(pack0, 'falta demo_pack_lucia');
  assert.ok(H.leerCodigoQr(pack0.qr), `QR inválido: ${pack0.qr}`);
  const r = await H.cuponeraPase(req(lucia, { clubId: CLUB, packId: 'demo_pack_lucia' }));
  assert.equal(r.qr, pack0.qr);
  assert.equal(r.google.disponible, false, 'sin secretos Google queda apagada');
  assert.equal(r.apple.disponible, false, 'Apple apagada');
});
await step('W2 sin QR: el servidor crea uno solo, aunque pidan dos a la vez', async () => {
  await packRef.update({ qr: null });
  const [a, b] = await Promise.all([1, 2].map(() => H.cuponeraPase(req(lucia, { clubId: CLUB, packId: 'demo_pack_lucia' }))));
  assert.equal(a.qr, b.qr);
  assert.ok(H.leerCodigoQr(a.qr));
  assert.equal((await packRef.get()).data().qr, a.qr);
});
await step('W3 otro jugador no puede ver la cuponera; el encargado sí', async () => {
  await assert.rejects(() => H.cuponeraPase(req(otro.uid, { clubId: CLUB, packId: 'demo_pack_lucia' })), /no es tuya/);
  const r = await H.cuponeraPase(req(staff.uid, { clubId: CLUB, packId: 'demo_pack_lucia' }));
  assert.ok(r.qr);
});
await step('W4 pedir Google Wallet apagada avisa "muy pronto"', async () => {
  await assert.rejects(() => H.cuponeraPase(req(lucia, { clubId: CLUB, packId: 'demo_pack_lucia', billetera: 'google' })), /muy pronto/);
  await assert.rejects(() => H.cuponeraPase(req(lucia, { clubId: CLUB, packId: 'demo_pack_lucia', billetera: 'apple' })), /muy pronto/);
});

// Google falsa: guarda lo que se le pide
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
function googleFalsa({ cupoAgotado = false } = {}) {
  const pedidos = [];
  const f = async (url, init = {}) => {
    const body = init.body && url.includes('walletobjects') ? JSON.parse(init.body) : init.body;
    pedidos.push({ url, method: init.method || 'GET', body });
    const ok = (j) => ({ ok: true, status: 200, json: async () => j, text: async () => JSON.stringify(j) });
    if (url.includes('oauth2')) return ok({ access_token: 'tok', expires_in: 3600 });
    if (url.endsWith('/addMessage') && cupoAgotado && body?.message?.messageType === 'TEXT_AND_NOTIFY') return { ok: false, status: 429, json: async () => ({}), text: async () => 'QuotaExceededException' };
    return ok({});
  };
  const g = new H.GoogleWallet({ issuerId: '3388000000012345678', cuenta: { client_email: 'wallet@demo.iam.gserviceaccount.com', private_key: privateKey }, origenes: ['https://demo.armapartido.com'] }, f);
  return { g, pedidos };
}

await step('W5 al descontar 1 parte: el pase pasa a 6 y avisa "Te quedan 6 de 10"', async () => {
  const p = (await packRef.get()).data();
  const antes = { ...p, usesLeft: 7, wallet: { google: { objectId: 'x' } } };
  const despues = { ...p, usesLeft: 6, wallet: { google: { objectId: '3388000000012345678.ap_los_jacarandas_demo_pack_lucia' } } };
  const { g, pedidos } = googleFalsa();
  const r = await H.alCambiarCuponera(CLUB, antes, despues, { g });
  assert.equal(r.google, 'avisado');
  const patch = pedidos.find((x) => x.method === 'PATCH' && x.url.includes('genericObject'));
  assert.ok(patch, 'no hizo PATCH del objeto');
  assert.equal(patch.body.textModulesData.find((t) => t.id === 'quedan').body, '6 de 10');
  const msg = pedidos.find((x) => x.url.endsWith('/addMessage'));
  assert.equal(msg.body.message.messageType, 'TEXT_AND_NOTIFY');
  assert.equal(msg.body.message.body, 'Usaste 1 parte. Te quedan 6 de 10.');
  const avisos = (await packRef.get()).data().wallet.google.avisos;
  assert.equal(avisos.n, 1);
});
await step('W6 el 4to aviso del día va sin notificación (tope de Google: 3)', async () => {
  const hoy = (await packRef.get()).data().wallet.google.avisos.dia;
  const p = (await packRef.get()).data();
  const conTres = { ...p, wallet: { google: { objectId: 'o', avisos: { dia: hoy, n: 3 } } } };
  const { g, pedidos } = googleFalsa();
  const r = await H.alCambiarCuponera(CLUB, { ...conTres, usesLeft: 6 }, { ...conTres, usesLeft: 5 }, { g });
  assert.equal(r.google, 'sin_aviso');
  assert.deepEqual(pedidos.filter((x) => x.url.endsWith('/addMessage')).map((x) => x.body.message.messageType), ['TEXT']);
});
await step('W7 si Google corta el cupo, el mensaje igual queda en el pase sin aviso', async () => {
  const { g, pedidos } = googleFalsa({ cupoAgotado: true });
  const r = await g.mensaje('o', 'hola', true);
  assert.equal(r, 'sin_aviso');
  assert.deepEqual(pedidos.filter((x) => x.url.endsWith('/addMessage')).map((x) => x.body.message.messageType), ['TEXT_AND_NOTIFY', 'TEXT']);
});
await step('W8 sin cambio de saldo no se toca nada', async () => {
  const p = (await packRef.get()).data();
  const { g, pedidos } = googleFalsa();
  const r = await H.alCambiarCuponera(CLUB, p, { ...p, wallet: { google: { objectId: 'o' } } }, { g });
  assert.equal(r.hecho, 'nada');
  assert.equal(pedidos.length, 0);
});
await step('W9 diseño: genérico sin Imagen completa, con marca del club si la tiene aprobada', async () => {
  const c = (await club.get()).data();
  const p = (await packRef.get()).data();
  const gen = H.armarPase({ ...c, paquete: 'basico' }, p, '2026-11-19', 'https://demo.armapartido.com');
  assert.equal(gen.conMarca, false);
  assert.equal(gen.colores.fondo, '#0a5761');
  assert.equal(gen.logo, 'https://demo.armapartido.com/wallet/logo-armapartido.png');
  const marca = { colores: { principal: '#0f2a44', acento: '#ff6b4a', fondo: '#eef3f8' }, logo: 'https://firebasestorage.googleapis.com/v0/b/x/o/clubs%2Fbahia%2Fmarca%2Flogo-1.png?alt=media&token=t', fotos: { portada: 'https://firebasestorage.googleapis.com/v0/b/x/o/clubs%2Fbahia%2Fmarca%2Fportada-1.webp?alt=media' }, version: 1, publicadaEl: '2026-11-17' };
  const con = H.armarPase({ ...c, paquete: 'completo', marca }, p, '2026-11-19', 'https://demo.armapartido.com');
  assert.equal(con.conMarca, true);
  assert.equal(con.colores.fondo, '#0f2a44');
  assert.equal(con.colores.texto, '#ffffff');
  assert.ok(con.logo.includes('logo-1.png'));
  assert.equal(con.portada, undefined, 'la portada WebP no va (Apple pide PNG)');
  assert.equal(con.titular.split(' ').length, 2);
  assert.match(con.titular, /^\S+ [A-ZÁÉÍÓÚ]\.$/);
  const o = H.objetoGoogle('1', con, p.id);
  assert.equal(o.hexBackgroundColor, '#0f2a44');
  assert.equal(o.barcode.type, 'QR_CODE');
  assert.equal(o.barcode.value, p.qr);
  const plano = JSON.stringify(o);
  assert.ok(!/\+598|@|\$/.test(plano), 'el pase no lleva celular, mail ni montos');
});
await step('W10 link "Agregar a Google Wallet": JWT firmado y con el objeto', async () => {
  const cfg = { issuerId: '1', cuenta: { client_email: 'wallet@demo.iam.gserviceaccount.com', private_key: privateKey }, origenes: ['https://demo.armapartido.com'] };
  const url = H.linkGuardar(cfg, '1.ap_x_y');
  assert.ok(url.startsWith('https://pay.google.com/gp/v/save/'));
  const [h, b, s] = url.split('/').pop().split('.');
  const v = createVerify('RSA-SHA256'); v.update(`${h}.${b}`);
  assert.ok(v.verify(publicKey, Buffer.from(s, 'base64url')), 'firma inválida');
  const j = JSON.parse(Buffer.from(b, 'base64url').toString());
  assert.equal(j.typ, 'savetowallet');
  assert.equal(j.aud, 'google');
  assert.deepEqual(j.payload.genericObjects, [{ id: '1.ap_x_y' }]);
  assert.ok(url.length < 1800, `link largo: ${url.length}`);
});
await step('W11 Apple (apagada): el .pkpass se arma, se abre y la firma verifica', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pkpass-'));
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(dir, 'k.pem'), '-out', join(dir, 'c.pem'), '-days', '1', '-subj', '/CN=Pass Type ID: pass.com.armapartido.cuponera'], { stdio: 'ignore' });
  const cfg = { passTypeId: 'pass.com.armapartido.cuponera', teamId: 'ABCDE12345', webServiceUrl: 'https://ejemplo/walletApple', certPem: readFileSync(join(dir, 'c.pem'), 'utf8'), keyPem: readFileSync(join(dir, 'k.pem'), 'utf8'), wwdrPem: readFileSync(join(dir, 'c.pem'), 'utf8'), semilla: 'semilla-de-prueba' };
  const c = (await club.get()).data();
  const p = (await packRef.get()).data();
  const pase = H.armarPase(c, p, '2026-11-19', 'https://demo.armapartido.com');
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex');
  const buf = H.armarPkpass(cfg, pase, { 'icon.png': png, 'logo.png': png });
  writeFileSync(join(dir, 'c.pkpass'), buf);
  const lista = execFileSync('unzip', ['-Z1', join(dir, 'c.pkpass')]).toString().trim().split('\n').sort();
  assert.deepEqual(lista, ['icon.png', 'logo.png', 'manifest.json', 'pass.json', 'signature']);
  execFileSync('unzip', ['-o', '-q', join(dir, 'c.pkpass'), '-d', join(dir, 'x')]);
  const pj = JSON.parse(readFileSync(join(dir, 'x', 'pass.json'), 'utf8'));
  assert.equal(pj.storeCard.primaryFields[0].value, `${p.usesLeft} de ${p.usesTotal}`);
  assert.equal(pj.storeCard.primaryFields[0].changeMessage, 'Te quedan %@');
  assert.equal(pj.barcodes[0].message, p.qr);
  assert.ok(H.tokenValido(cfg, pj.serialNumber, pj.authenticationToken));
  assert.ok(!H.tokenValido(cfg, pj.serialNumber, 'x'.repeat(32)));
  execFileSync('openssl', ['smime', '-verify', '-binary', '-inform', 'DER', '-in', join(dir, 'x', 'signature'), '-content', join(dir, 'x', 'manifest.json'), '-noverify', '-out', '/dev/null'], { stdio: 'pipe' });
});

// Dejar la cuponera de Lucía como la carga la demo
await packRef.set(pack0);
console.log('\nBilletera:\n' + results.join('\n'));
process.exit(results.some((r) => r.startsWith('FALLA')) ? 1 : 0);
