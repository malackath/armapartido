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
- Publicada en https://demo.armapartido.com: Firebase `armapartido-demo` (Spark, southamerica-east1, reglas en Paddle.URU/docs/firestore-demo.rules) y Cloudflare Pages `armapartido-demo` (CNAME demo). Cuentas: Paddle.URU/docs/cuentas-demo.md. Se entra con un toque (botones "Entrar como…"); la clave compartida va en `VITE_DEMO_PASSWORD` del .env.production.local de demo-build y queda visible en el bundle: esas cuentas son solo de demo.
- Republicar (en la Mac): `cd /Users/bernoxxx/Desktop/Paddle.URU/demo-build && git pull --ff-only && npx vite build && printf '/*  /index.html  200\n' > dist/_redirects && npx wrangler pages deploy dist --project-name armapartido-demo --branch main --commit-dirty=true` (demo-build tiene `.env.production.local` con la config).
- Verificar: `CHANNEL=chrome node scripts/verify-roles.cjs <url> <contraseña> <carpeta>` y `scripts/verify-demo.cjs` (reserva, refresco, cierre de sesión, reinicio).
- El proyecto Pages "armapartido" es la página Muy pronto: no tocarlo desde la demo. Con wrangler 4, `pages project create` necesita `--force`.

## Caja, cantina, informe del mes y migración (rama claude/project-thread-ebev8y)
- Especificación: Paddle.URU/docs/especificacion-informe-caja-cantina-migracion.md.
- Lógica pura: `src/lib/caja.ts` (dividir, seña en pico, cuenta del turno, caja del día, deudas, informe del mes), `src/lib/informeMail.ts` (mail del día 1), `src/lib/migracion.ts` (limpiar planillas de Wona/ATC/propias).
- Servicio: `src/services/cajaService.ts`. Pantallas: `src/components/caja/` (TurnAccount y CashPanel en el Mostrador; Cantina, Seña, Turnos fijos, Cierres e Informe en el Admin; MyAccount en el perfil del jugador).
- Colecciones nuevas en `clubs/{clubId}`: products, consumptions, cashDays (id = fecha), fixedBookings, recoveries y monthlyReports (solo servidor), migrations (solo script).
- `recoveries` lo escribe el servidor de "Falta uno" (forma acordada en docs/falta-uno-automatico.md). El informe suma solo recuperados contados y señas retenidas.
- Pruebas: `npx tsx scripts/test-caja.ts <carpeta>` (8 pruebas; deja el mail del informe en HTML).
- Migración: `npx tsx scripts/importar-jugadores.ts --archivo <csv> --club <id> --salida <carpeta>` hace la prueba en seco. Cargar: sumar `--cargar --permiso "<quién del club autorizó y cuándo>"` (ley 18.331); `FIREBASE_EMULATORS=1` para emuladores. No manda mails. Plantilla: `scripts/migracion/plantilla-jugadores.csv`.
- Sin hacer todavía: envío real de mails (informe y bienvenida), tareas del servidor (foto del día 1, vencimiento de la seña), Mercado Pago real, tope del fiado, aviso al cerrar la caja.

## Reglas
- Nada de afiliaciones FIP/AAP/Federación ni nivel decimal en la UI: solo categoría.
- Español de Uruguay: "cancha", nunca "pista".
- Sin claves en el código: secretos en Secret Manager. `firebase-applet-config.json` es el proyecto de AI Studio y se reemplaza por el Firebase propio.

## Pendientes técnicos
1. Matchmaking, vencimientos de retención y avisos: mover del cliente a servidor (Cloud Functions / Cloud Run con scheduler).
2. Migrar a Firebase propio de Ber.
3. Restringir el selector de rol (solo para demo).
4. Mercado Pago real (cuenta de cada club, OAuth).
