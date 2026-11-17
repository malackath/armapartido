# padel-uy

SaaS para clubes de pádel en Uruguay Marca: **Armá Partido** (armapartido.com).
Cada club tiene su app marca blanca sobre una sola plataforma multi-club. Jugador con cuenta y categoría (1ra a 7ma) únicas.

## Origen
- Prototipo generado en Google AI Studio (React 19 + Vite + Tailwind 4 + Firebase Auth/Firestore + Express `server.ts` para FCM).
- Diseño: Stitch. `design/DESIGN.md` (tokens), `design/mobile/` (5 pantallas jugador), `design/torneo/` (cuadro).
- Reglas de negocio: `docs/reglas-del-producto.pdf` (fuente de verdad viva: Claude Doc "Pádel: reglas del producto").
- Revisión y pendientes: `docs/revision-prototipo.md`.

## Comandos
- `npm install --legacy-peer-deps`
- `npm run dev` (Express + Vite), `npx vite build`, `npm run lint` (tsc)

## Demo (rama claude/demo)
- Demo siempre en hora (16/11): `src/demo/demoHoy.ts` arma los turnos de hoy alrededor de la hora actual (3 canchas en juego, falta uno, deben) y el historial desde el mes anterior (Números ~68 %). Al entrar con un toque, si la demo tiene más de 2 h se rearma sola (`refreshDemoIfStale`). El reinicio escribe primero y borra después. Club de demo abierto de 8 a 24. Antes de las 8:30 el día se arma como si fueran las 9:15.
- Service worker: se registra en `src/main.tsx` (virtual:pwa-register, autoUpdate): recarga sola con la versión nueva y busca actualización cada 30 min.
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
- Prueba de punta a punta en emuladores: `cd functions && npm install && npm test` (armado 10 casos + falta uno 12 casos).
- Publicar en la demo (Blaze desde 15/11/2026, alerta US$5): `cd functions && npm install && cd .. && npx firebase-tools@15 deploy --only functions --project armapartido-demo`.
- "Falta uno" (especificación: Paddle.URU/docs/falta-uno-automatico.md): `functions/src/fill.ts` y `fillRules.ts`, callables `faltaUnoBajarme`, `faltaUnoMeSumo`, `faltaUnoNoPuedo`, `faltaUnoElegir`, `faltaUnoDejarDeBuscar`; el reloj manda las tandas, cierra búsquedas y cuenta turnos recuperados. Colecciones `fillSearches`, `fillInvites`, `recoveries` (solo las escribe el servidor). Pantallas en `src/components/FaltaUno.tsx` (Inicio, Armar partido, Perfil → Avisos), Mostrador y Admin → Falta uno. Pruebas: `functions/test/faltauno.emulator.mjs` (12 casos, corren con `npm test`).

## Caja, cantina, informe del mes y migración (rama claude/project-thread-ebev8y)
- Especificación: Paddle.URU/docs/especificacion-informe-caja-cantina-migracion.md.
- Lógica pura: `src/lib/caja.ts` (dividir, seña en pico, cuenta del turno, caja del día, deudas, informe del mes), `src/lib/informeMail.ts` (mail del día 1), `src/lib/migracion.ts` (limpiar planillas de Wona/ATC/propias).
- Servicio: `src/services/cajaService.ts`. Pantallas: `src/components/caja/` (TurnAccount y CashPanel en el Mostrador; Cantina, Seña, Turnos fijos, Cierres e Informe en el Admin; MyAccount en el perfil del jugador).
- Colecciones nuevas en `clubs/{clubId}`: products, consumptions, cashDays (id = fecha), fixedBookings, recoveries y monthlyReports (solo servidor), migrations (solo script).
- `recoveries` lo escribe el servidor de "Falta uno" (forma acordada en docs/falta-uno-automatico.md). El informe suma solo recuperados contados y señas retenidas.
- Pruebas: `npx tsx scripts/test-caja.ts <carpeta>` (8 pruebas; deja el mail del informe en HTML).
- Migración: `npx tsx scripts/importar-jugadores.ts --archivo <csv> --club <id> --salida <carpeta>` hace la prueba en seco. Cargar: sumar `--cargar --permiso "<quién del club autorizó y cuándo>"` (ley 18.331); `FIREBASE_EMULATORS=1` para emuladores. No manda mails. Plantilla: `scripts/migracion/plantilla-jugadores.csv`.
- Sin hacer todavía: envío real de mails (informe y bienvenida), tareas del servidor (foto del día 1, vencimiento de la seña), Mercado Pago real, tope del fiado, aviso al cerrar la caja.

## Clientes, cuponeras, saldo, venta suelta, libro y Números (rama claude/project-thread-hep7gi)
- Especificación: project files informes/especificacion-clientes-ventas-kpis.md (sección 15 = qué se construyó; decisiones "a confirmar").
- Lógica pura: `src/lib/clientes.ts` (celular, claves `uid` / `c:<fichaId>` / `g:<reservaId>`, duplicados, cuponeras, deudas, libro, `computeNumbers`, hojas) y `src/lib/planilla.ts` (.xlsx sin librería y .csv).
- Servicio: `src/services/clientesService.ts`. Pantallas: `src/components/clientes/` (ficha, buscador/alta, venta suelta, libro, Números, cuponeras). Mostrador: botones "Venta suelta" y "Clientes"; Admin: Clientes, Números, Cuponeras, Caja (con el libro).
- Colecciones nuevas en `clubs/{clubId}`: clients (las de la app con id `u_<uid>`), packTypes, clientPacks (campo `uid` para que el jugador las lea), sales, exportLogs. Reglas en firestore.rules; prueba: `cd scripts/reglas && npx -y firebase-tools@15 emulators:exec --only firestore "node clientes.rules-test.mjs ../../firestore.rules"` (necesita `@firebase/rules-unit-testing` y `firebase` instalados).
- Servidor: `functions/src/clientes.ts` + disparador `clientesAlSumarse` (une por mail verificado, si no crea ficha; por celular solo marca repetido). Prueba en `functions/test/clientes.emulator.mjs` (corre con `npm test`). En la nube de Claude: `functions/.env.local` con `SIN_DISPARADORES=1` (el proxy impide registrar disparadores).
- Pruebas: `npx tsx scripts/test-clientes.ts <carpeta>` (30) y de punta a punta `node scripts/verify-clientes.cjs <url> <carpeta>` (19, con la demo cargada).

## Rol Cantina, tarjeta de cancha y pantalla completa (16/11, rama claude/project-thread-n7l22z)
- Rol de club `cantina` (clubes grandes): `src/components/cantina/CantinaView.tsx` (venta suelta de cantina/alquiler/otros, cargar consumos a la cuenta del turno con `TurnAccount itemsOnly`, caja de la cantina). Reglas: `isClubCantina` en firestore.rules (cobros solo kind cantina/venta, sin canchas ni cuponeras; descuenta stock). Los hooks `useClubOps(clubId, true)` y `useClientesData(clubId, true)` filtran lo que puede leer. Cuenta demo: cantina@demo.armapartido.com (Romina Ferreira).
- Verificar: `node scripts/verify-cantina.cjs <url> <carpeta>` (con hora simulada la demo puede rearmarse sola al entrar).
- Tarjeta de cancha (`src/components/mostrador/CourtCard.tsx`): cancha 2:1 fija, azul = vidrio y verde = hormigón (`COURT_SURFACE`), insignia de pago sobre la foto. Ber odia el marrón: el color `wait` es naranja (#c2410c), nada de ocre.
- Botón de pantalla completa en el Mostrador (`FullscreenButton`, API Fullscreen).

## Mails con Resend (16/11, rama claude/project-thread-4a3ata)
- `functions/src/mail.ts`: `sendMail(to, mail, tag)` llama a la API de Resend con `fetch` (sin librería), nunca tira error y deja registro en `mailLog` (solo servidor). Remitente `Armá Partido <avisos@armapartido.com>` (cambia con `MAIL_FROM`).
- Secretos en Secret Manager (nunca en el código): `RESEND_API_KEY` y `MAIL_SOLO_A` (mails permitidos separados por coma; `*` = todos; vacío = no sale nada). En la demo `MAIL_SOLO_A` = el mail de Ber. Las cuentas `@demo.armapartido.com` nunca reciben mail.
- Cargar secretos (en la Mac): `npx firebase-tools@15 functions:secrets:set RESEND_API_KEY --project armapartido-demo` (y lo mismo con `MAIL_SOLO_A`). Sin esos dos secretos el deploy de funciones falla.
- `functions/src/mailTemplates.ts`: base común + "Confirmá tu cuenta" + aviso genérico. El informe mensual sigue en `src/lib/informeMail.ts` (diseño esperando OK de Ber).
- `notify.ts` ahora manda mail en los avisos que lo llevan (matriz CHANNELS), solo a mails verificados. Callables nuevas: `mailConfirmarCuenta` (para el registro, 1 cada 2 min) y `mailPrueba` (solo plataforma).
- En la nube de Claude, `functions/.env.local` con `SIN_DISPARADORES=1` no se sube al repo.

## Reglas
- Nada de afiliaciones FIP/AAP/Federación ni nivel decimal en la UI: solo categoría.
- Español de Uruguay: "cancha", nunca "pista".
- Sin claves en el código: secretos en Secret Manager. `firebase-applet-config.json` es el proyecto de AI Studio y se reemplaza por el Firebase propio.

## Pendientes técnicos
1. Hecho en `functions/` el armado, los vencimientos y sus avisos. Falta: avisos de cancelación y lista de espera de reservas comunes, informe mensual por mail (espera OK del diseño), reglas de seguridad que impidan al celular escribir partidos armados.
2. Migrar a Firebase propio de Ber.
3. Restringir el selector de rol (solo para demo).
4. Mercado Pago real (cuenta de cada club, OAuth).

## Mejoras de diferenciación (16/11, rama claude/project-thread-to3pa4)
- Propuesta y wireframes: project files informes/diferenciacion-mejoras/.
- Link para compartir el "Falta uno": `/f/<club>/<búsqueda>` abre `src/components/FaltaUnoLinkPage.tsx` sin cuenta (sin nombres ni fotos, Ley 18.331). Callables `faltaUnoLink` (sin cuenta) y `faltaUnoSumarmePorLink` (`claimFromLink` en `functions/src/fill.ts`: mismas reglas de categoría, género y bloqueo; sin disponibilidad ni tope). El invite y el recuperado quedan con `via: 'link'`. Botón "Compartir por WhatsApp / Copiar link" en `ShareFillLink` (FaltaUno.tsx). Helpers en `src/lib/compartir.ts`.
- "Cómo llegar" (Google Maps, sin API) en la invitación, la tarjeta del partido, el perfil del club y la página del link.
- "No sé mi categoría": 5 preguntas, `suggestCategory` en `src/lib/registro.ts` (sugiere 7ma a 5ta; "Con categoría" → la de su último torneo).
- Informe del mes: renglones informativos `appBookings`, `matchesBuilt`, `viaLink` (no suman al total).
- Verificar: `node scripts/verify-compartir.cjs <url> <carpeta>` (necesita un partido buscando reemplazo donde esté el jugador de la demo). Pruebas del servidor E7–E9 en `functions/test/faltauno.emulator.mjs`.
- Para publicar hace falta también `deploy --only functions` (callables nuevas).
- Llenar un turno libre con un toque (parte 2.1): `functions/src/hueco.ts` (callables `huecoVistaPrevia`, `huecoLlenar`, `huecoSimular` solo demo), FillSearch `kind: 'free_slot'` con ventana de categorías (`bestCategoryWindow`) y descuento opcional 0/10/20/30. Pantalla `src/components/mostrador/LlenarHueco.tsx`, pestaña "Llenar con la app" en la nueva reserva del Mostrador (por defecto si falta más de 1 h). Pruebas H1–H3. Los jugadores de la demo pueden de 8 a 18 todos los días (más sus noches). Verificar: `node scripts/verify-hueco.cjs`.
- Importar planilla (parte 2.3): Admin → Clientes → "Importar planilla" (`src/components/clientes/ImportarPlanilla.tsx`). Lee .csv/.xlsx en el navegador sin librería (`src/lib/leerPlanilla.ts`), limpia con `migracion.ts`, arma el plan con `src/lib/importarClientes.ts` y carga con la callable `clientesImportar` (`functions/src/importar.ts`, solo rol admin): fichas origen `migracion`, no duplica por mail/celular, turnos fijos 12 semanas (`fixedBookings.clientId`), registro en `migrations` con el permiso (Ley 18.331). Al registrarse con ese mail verificado, `linkOrCreateClient` le pasa la ficha y el turno fijo. No manda mensajes. Planilla de ejemplo: `src/lib/planillaEjemplo.ts`. Pruebas I1–I3 y `node scripts/verify-importar.cjs <url> <carpeta> [planilla.xlsx]`.
- App con el nombre del club (parte 2.2): dirección `<clave>.armapartido.com` (clave = slug sin guiones, `clubAppKey` en `src/lib/appDelClub.ts`) o `?club=<clave>`. `index.html` cambia el manifiesto y el apple-touch-icon a `public/clubes/<clave>/` antes de cargar; `App.tsx` abre ese club y pone el título. Íconos y manifiesto por club: `node scripts/app-del-club.cjs --slug <slug> --nombre "..." --corto "..." --siglas XX --color "#..."` (usa Playwright y la Outfit de `scripts/app-del-club/`). Admin → "Tu app" (`src/components/appclub/TuApp.tsx`): QR (paquete `qrcode`), cartel A4 imprimible, copiar link y story 1080×1920. `VITE_CLUB_APP_URL` (ej. `https://demo.armapartido.com/?club={slug}`) cambia el link mientras el subdominio no esté en Cloudflare. Verificar: `node scripts/verify-tu-app.cjs <url> <carpeta>`.
