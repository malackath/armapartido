# padel-uy

SaaS para clubes de pádel en Uruguay Marca: **Armá Partido** (armapartido.com).
Cada club tiene su app marca blanca sobre una sola plataforma multi-club. Jugador con cuenta y categoría (1ra a 8va) únicas.

## Origen
- Prototipo generado en Google AI Studio (React 19 + Vite + Tailwind 4 + Firebase Auth/Firestore + Express `server.ts` para FCM).
- Diseño: Stitch. `design/DESIGN.md` (tokens), `design/mobile/` (5 pantallas jugador), `design/torneo/` (cuadro).
- Reglas de negocio: `docs/reglas-del-producto.pdf` (fuente de verdad viva: Claude Doc "Pádel: reglas del producto").
- Revisión y pendientes: `docs/revision-prototipo.md`.

## Comandos
- `npm install --legacy-peer-deps`
- `npm run dev` (Express + Vite), `npx vite build`, `npm run lint` (tsc)

## Demo (rama claude/demo)
- Mundo de demo: `src/demo/demoWorld.ts` (club Los Jacarandás, 5 cuentas por rol + 17 jugadores, reservas, partidos, torneos). Reinicio: `src/demo/resetDemo.ts` (botón "Reiniciar demo" en el menú del avatar, solo dueño o plataforma).
- Cargar en emuladores: `npm run dev:demo` y luego `FIREBASE_EMULATORS=1 DEMO_PASSWORD='prueba-local-123' npx tsx scripts/seed-demo.ts`.
- Cargar en Firebase real: `DEMO_PASSWORD=... FIREBASE_CONFIG_FILE=<config.json> npm run demo:seed`. Contraseña y config de la demo viven en la Mac de Ber (Paddle.URU/docs), nunca en el repo.
- Build de demo: variables `VITE_FIREBASE_*`, `VITE_DEMO_MODE=1`, `VITE_PLATFORM_OWNER_EMAILS=plataforma@demo.armapartido.com`.
- Publicada en https://demo.armapartido.com: Firebase `armapartido-demo` (Blaze desde 15/11/2026, southamerica-east1, reglas en Paddle.URU/docs/firestore-demo.rules) y Cloudflare Pages `armapartido-demo` (CNAME demo). Cuentas: Paddle.URU/docs/cuentas-demo.md. Se entra con un toque (botones "Entrar como…"); la clave compartida va en `VITE_DEMO_PASSWORD` del .env.production.local de demo-build y queda visible en el bundle: esas cuentas son solo de demo.
- Republicar (en la Mac): `cd /Users/bernoxxx/Desktop/Paddle.URU/demo-build && git pull --ff-only && npx vite build && printf '/*  /index.html  200\n' > dist/_redirects && cd dist && npx wrangler pages deploy . --project-name armapartido-demo --branch main --commit-dirty=true` (desde dentro de dist: si no, wrangler confunde la carpeta functions/ de Firebase con funciones de Cloudflare; demo-build tiene `.env.production.local` con la config).
- Verificar: `CHANNEL=chrome node scripts/verify-roles.cjs <url> <contraseña> <carpeta>` y `scripts/verify-demo.cjs` (reserva, refresco, cierre de sesión, reinicio).
- El proyecto Pages "armapartido" es la página Muy pronto: no tocarlo desde la demo. Con wrangler 4, `pages project create` necesita `--force`.

## Armado en el servidor (Cloud Functions, `functions/`)
- El armado de partidos ya no corre en el celular: `functions/src` (callables `armadoCrearPedido`, `armadoBuscar`, `armadoResponder`, `armadoAceptarPareja` y el reloj `armadoReloj` cada minuto), región southamerica-east1, hora America/Montevideo. Usa `src/lib/padelUtils.ts` (se empaqueta con esbuild).
- El reloj libera propuestas y canchas retenidas vencidas, manda el aviso 1 h antes de los pedidos del mismo día y vence pedidos puntuales pasados.
- Prueba de punta a punta en emuladores: `cd functions && npm install && npm test` (9 casos: armado, aceptaciones simultáneas, carrera, rechazo, permisos, reloj).
- Publicar en la demo (Blaze desde 15/11/2026, alerta US$5): `cd functions && npm install && cd .. && npx firebase-tools@15 deploy --only functions --project armapartido-demo`.
- Especificación de "Falta uno" (siguiente paso): Paddle.URU/docs/falta-uno-automatico.md.

## Reglas
- Nada de afiliaciones FIP/AAP/Federación ni nivel decimal en la UI: solo categoría.
- Español de Uruguay: "cancha", nunca "pista".
- Sin claves en el código: secretos en Secret Manager. `firebase-applet-config.json` es el proyecto de AI Studio y se reemplaza por el Firebase propio.

## Pendientes técnicos
1. Hecho en `functions/` el armado, los vencimientos y sus avisos. Falta: avisos de cancelación y lista de espera de reservas comunes, mails (Resend), reglas de seguridad que impidan al celular escribir partidos armados.
2. Migrar a Firebase propio de Ber.
3. Restringir el selector de rol (solo para demo).
4. Mercado Pago real (cuenta de cada club, OAuth).
