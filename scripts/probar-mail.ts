/**
 * Prueba de mails en la demo: entra como la cuenta de plataforma y llama a la función `mailPrueba`,
 * que manda las 2 plantillas (confirmar cuenta y aviso) al mail indicado. Igual pasa por MAIL_SOLO_A.
 *   DEMO_PASSWORD='...' FIREBASE_CONFIG_FILE=/ruta/firebase-demo-config.json MAIL_TO=tu@mail npx tsx scripts/probar-mail.ts
 */
import { readFileSync } from 'node:fs';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';

const config = JSON.parse(readFileSync(process.env.FIREBASE_CONFIG_FILE || 'firebase-demo-config.json', 'utf8'));
const to = process.env.MAIL_TO;
const password = process.env.DEMO_PASSWORD;
if (!to || !password) throw new Error('Faltan MAIL_TO o DEMO_PASSWORD');

const app = initializeApp(config);
await signInWithEmailAndPassword(getAuth(app), process.env.DEMO_ACCOUNT || 'plataforma@demo.armapartido.com', password);
const res = await httpsCallable(getFunctions(app, 'southamerica-east1'), 'mailPrueba')({ to });
console.log(JSON.stringify(res.data, null, 2));
process.exit(0);
