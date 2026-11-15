# padel-uy

SaaS para clubes de pádel en Uruguay (nombre comercial a definir; el prototipo usa "CuatroEnCancha").
Cada club tiene su app marca blanca sobre una sola plataforma multi-club. Jugador con cuenta y categoría (1ra a 8va) únicas.

## Origen
- Prototipo generado en Google AI Studio (React 19 + Vite + Tailwind 4 + Firebase Auth/Firestore + Express `server.ts` para FCM).
- Diseño: Stitch. `design/DESIGN.md` (tokens), `design/mobile/` (5 pantallas jugador), `design/torneo/` (cuadro).
- Reglas de negocio: `docs/reglas-del-producto.pdf` (fuente de verdad viva: Claude Doc "Pádel: reglas del producto").
- Revisión y pendientes: `docs/revision-prototipo.md`.

## Comandos
- `npm install --legacy-peer-deps`
- `npm run dev` (Express + Vite), `npx vite build`, `npm run lint` (tsc)

## Reglas
- Nada de afiliaciones FIP/AAP/Federación ni nivel decimal en la UI: solo categoría.
- Español de Uruguay: "cancha", nunca "pista".
- Sin claves en el código: secretos en Secret Manager. `firebase-applet-config.json` es el proyecto de AI Studio y se reemplaza por el Firebase propio.

## Pendientes técnicos
1. Matchmaking, vencimientos de retención y avisos: mover del cliente a servidor (Cloud Functions / Cloud Run con scheduler).
2. Migrar a Firebase propio de Ber.
3. Restringir el selector de rol (solo para demo).
4. Mercado Pago real (cuenta de cada club, OAuth).
