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
- Publicación: Cloudflare Pages, proyecto aparte de "armapartido" (que es la página Muy pronto). Con wrangler 4, `pages project create` necesita `--force`.

## Reglas
- Nada de afiliaciones FIP/AAP/Federación ni nivel decimal en la UI: solo categoría.
- Español de Uruguay: "cancha", nunca "pista".
- Sin claves en el código: secretos en Secret Manager. `firebase-applet-config.json` es el proyecto de AI Studio y se reemplaza por el Firebase propio.

## Pendientes técnicos
1. Matchmaking, vencimientos de retención y avisos: mover del cliente a servidor (Cloud Functions / Cloud Run con scheduler).
2. Migrar a Firebase propio de Ber.
3. Restringir el selector de rol (solo para demo).
4. Mercado Pago real (cuenta de cada club, OAuth).
