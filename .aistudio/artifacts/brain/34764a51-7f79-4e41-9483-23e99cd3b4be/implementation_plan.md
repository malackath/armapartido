# CuatroEnCancha — Plataforma Marca Blanca de Pádel para Uruguay

**CuatroEnCancha** (`cuatroencancha.com`) es una plataforma web instalable (PWA) multiclub para clubes de pádel en Uruguay que combina reservas instantáneas de canchas, gestión de mostrador y caja, torneos con cuadro automático y un motor de armado de partidos parejos de cuatro jugadores con confirmación sincronizada.

---

## Revisión del Usuario y Decisiones Críticas

> [!IMPORTANT]
> Este plan consolida tus definiciones de producto de la Fase 1 junto con todas las reglas funcionales del documento *Pádel: reglas del producto*. Revisá la propuesta de marca `.com` y el flujo de autenticación antes de aprobar.

- **Nombre de marca y dominio `.com`**: Se propone **CuatroEnCancha** (`cuatroencancha.com`). En búsqueda web abierta no figuran sitios activos ni marcas de pádel compitiendo bajo `cuatroencancha.com` (ni en alternativas de respaldo como `armaset.com`, `vidrioyred.com` o `matchparejo.com`); se recomienda verificar disponibilidad final en registrador antes de comprar el dominio.
- **Reglas confirmadas del armado de partidos**:
  - Modalidad seleccionable por el jugador: **Masculino**, **Femenino** o **Mixto**.
  - **Pareja fija**: Dos jugadores pueden unirse como dupla para que el motor busque otra pareja o dos rivales compatibles.
  - **Tolerancia de nivel**: Hasta **1 categoría de diferencia** entre los cuatro jugadores (escala de 1ra a 8va).
  - **Confirmación de los 4 jugadores**: La cancha se retiene temporalmente y los 4 deben aceptar (plazo de **2 horas**, o **30 minutos** si el partido es en el mismo día). Si alguien rechaza o vence el plazo, se libera el cupo y se busca reemplazo automáticamente.
  - **Tarifa única por turno/horario**: Sin distinción de precios entre socios y no socios en esta etapa; el precio varía por turno, horario nocturno y fin de semana según defina cada club.
- **Autenticación, persistencia y pagos**:
  - **Firebase Authentication (Google Sign-In)** + **Cloud Firestore** con reglas de seguridad estrictas por rol y club. Para pruebas ágiles en esta etapa, la plataforma incluirá un flujo de onboarding/cambio de perfil contextual controlado para simular la vista de los 4 roles sobre los clubes piloto de Montevideo sin comprometer la integridad de las reglas de producción.
  - **Mercado Pago simulado**: Flujo realista de checkout de seña o turno completo (y división en 4 partes para partidos armados), devolución automática al cancelar dentro de la ventana sin cargo, y simulación de débito mensual por cantidad de canchas para el dueño de la plataforma.

---

## 1. Visión General y Concepto Central

### Qué hace
Una única arquitectura multi-club bajo el capó que se presenta al jugador como la app propia (marca blanca: nombre, colores, logotipo) de su club de pádel en Uruguay. Resuelve las cuatro caras del negocio desde una misma PWA instalable:

1. **Jugador**: Cuenta única global para toda la plataforma (categoría única 1ra–8va y ubicación de clubes lista para la futura red inter-clubes). Permite reservar canchas al instante, cargar disponibilidad semanal o pedidos puntuales del mismo día (con prioridad), postularse en pareja fija o individual para partidos parejos, aceptar propuestas de 4 jugadores, inscribirse en pareja a torneos y recibir notificaciones push y registro de avisos por mail.
2. **Encargado (Mostrador)**: Grilla visual del día por cancha y turno, alta rápida de reservas telefónicas o presenciales (incluso para clientes sin cuenta en la app), cobro en mostrador, registro de ausencias con alertas de bloqueo y carga de resultados de torneos.
3. **Administrador del club**: Configuración de marca blanca (nombre y paleta del club), alta de canchas (techada o aire libre, cristal o muro, con/sin luz), horarios y duración de turnos (90 min por defecto), tarifas dinámicas (base, noche, fin de semana), política de cancelación gratis (X horas antes) y límite de faltas, ajuste de categoría oficial de jugadores, gestión de caja, creación de torneos (eliminación directa o grupos + eliminación) y designación de encargados.
4. **Dueño de la plataforma**: Alta y activación de clubes (con dirección y coordenadas en mapa), prueba gratis de 1 mes, facturación mensual por cantidad de canchas (débito automático simulado sin comisión sobre reservas) y tablero de uso real por club.

### Público objetivo
Clubes de pádel en Montevideo y el interior de Uruguay (dueños, gerentes y encargados de mostrador) y jugadores habituales que buscan completar cuartos parejos sin coordinar por decenas de grupos de WhatsApp.

### Propuesta de valor diferencial
A diferencia de un turnero pasivo, el motor de **Armado de Partidos** cruza disponibilidad semanal, pedidos puntuales prioritarios, categoría (±1), modalidad (masculino/femenino/mixto) y disponibilidad real de canchas libres, reteniendo la pista mientras los cuatro confirman.

---

## 2. Experiencia de Usuario y Diseño Visual

### Identidad Visual y Tema
- **Dirección estética**: **Deportivo luminoso y de alto contraste** — superficie limpia de luz diurna para máxima legibilidad al aire libre junto a la pista, combinada con tipografía atlética geométrica y numerales tabulares de tablero deportivo.
- **Sistema de color 60-30-10 y marca blanca**:
  - **60% Lienzo neutro**: Blanco puro (`#FFFFFF`) y pizarra clara (`#F8FAFC`) como fondo principal (`--background`).
  - **30% Superficies estructurales**: Tarjetas y grillas planas (`#FFFFFF` sobre `#F1F5F9` con borde sutil `1px solid #E2E8F0`) y tinta profunda de alto contraste (`#0F172A` para títulos, `#475569` para texto secundario).
  - **10% Acento de acción**: Verde esmeralda de cancha (`#059669` / `#10B981`) como color base de CuatroEnCancha, sobrescrito dinámicamente por las variables `--club-primary` y `--club-accent` cuando el usuario opera dentro de un club específico (manteniendo contraste WCAG AA ≥ 4.5:1).
  - **Semántica estricta (color + texto/ícono)**: Verde (`#16A34A`) para confirmado/pagado/disponible, Ámbar (`#D97706`) para cancha retenida/pendiente de aceptación, Carmesí (`#DC2626`) para ausencia/cancelado/bloqueado.
- **Tipografía (Regla 2+1)**:
  - **Display y títulos**: `Outfit` (geométrica, atlética, limpia, con `text-wrap: balance` para evitar palabras huérfanas).
  - **Cuerpo e interfaz**: `Plus Jakarta Sans` (alta legibilidad en 13px–16px).
  - **Horarios, precios y marcadores**: `JetBrains Mono` con `font-variant-numeric: tabular-nums` para alinear perfectamente turnos, tarifas en UYU y resultados de sets.
- **Disciplina espacial y anti-cliché**:
  - Cero píldoras decorativas para metadatos: categorías, tipos de cancha (`Techada · Cristal · Con luz`) y estados secundarios se muestran con texto limpio y separadores `·`.
  - Elevación única sin tarjetas anidadas ni barras laterales gruesas (`border-l-4`).
  - Controles siempre en una sola línea (`whitespace-nowrap shrink-0`).

### Arquitectura de Navegación por Contexto
- **Desktop (1440px) — Contrato de 3 zonas y Workspace**:
  - Barra superior limpia de una fila (`gap-8`): Wordmark del club activo (o CuatroEnCancha) + 4–5 enlaces principales según rol (`Grilla`, `Armar Partido`, `Torneos`, `Gestión`) + 1 acción primaria (perfil / instalar PWA o acción principal).
  - En vistas operativas (Mostrador, Admin del Club y Dueño de Plataforma), layout con barra lateral fija (`256px`) y grilla densa de turnos o tablas financieras con filas compactas (`40px`) y columnas numéricas alineadas a la derecha.
- **Móvil (375px–430px PWA Instalable)**:
  - Cumplimiento estricto del tope del 15% de superficie fija vertical.
  - Cabecera compacta (`52px`) con selector de club / notificaciones + barra inferior fija de 4 destinos en zona natural del pulgar (`Reservar`, `Partidos`, `Torneos`, `Perfil`) con áreas táctiles ≥ `44x44px`.
  - Selector horizontal de fechas (`Hoy`, `Mañ`, fechas de la semana) y hojas inferiores (*bottom sheets*) para confirmar reservas, responder propuestas de partido o simular el checkout de Mercado Pago.

### Flujos Clave Paso a Paso
1. **Ingreso y Selector de Club Marca Blanca**: El usuario inicia sesión con Google (cuenta única). Si pertenece a un club (ej. *Pocitos Pádel Club*), la app adopta su branding al instante. Puede cambiar al segundo club piloto (*Carrasco Indoor Pádel*) desde el selector de club para comprobar que su categoría y perfil permanecen unificados.
2. **Reserva Instantánea**: El jugador elige fecha en el carrusel, filtra o recorre las canchas (viendo especificaciones sin píldoras: `Cancha 1 · Techada · Cristal · Luz`), selecciona un turno libre (90 min) con tarifa calculada según franja nocturna/fin de semana, y confirma al instante eligiendo *Pagar en el club* o *Mercado Pago (seña o total)*.
3. **Armado de Partido Parejo (Corazón del producto)**:
   - El jugador carga su categoría (1ra–8va), modalidad preferida (`Masculino` / `Femenino` / `Mixto`), disponibilidad semanal recurrente y/o un **pedido puntual prioritario** (ej. "Hoy de 18 a 21"), opcionalmente eligiendo un compañero como **pareja fija**.
   - El motor de emparejamiento evalúa candidatos compatibles (±1 categoría, misma modalidad, intersección de ≥90 min con cancha libre), retiene la cancha automáticamente en estado `retenida` y envía la propuesta con cuenta regresiva (**2h** o **30m** si es hoy) a los 4 jugadores.
   - A medida que cada jugador acepta, el estado avanza de `1/4` a `4/4`. Al confirmar los 4, la reserva pasa a `confirmada`, se divide el costo entre 4 y cada uno paga su parte. Si alguien rechaza o expira, busca reemplazo automático; si es pedido del mismo día y no se completa 1 hora antes del inicio de la franja, dispara aviso al jugador.
4. **Torneos**: El administrador crea el torneo (nombre, fechas, categorías habilitadas, cupo de parejas, inscripción y formato `Eliminación directa` o `Grupos + Eliminación`). Se notifica a jugadores elegibles; un jugador inscribe a su pareja (quien acepta la invitación); al cerrar inscripción se sortea el cuadro, se bloquean canchas automáticamente y el encargado carga resultados en vivo actualizando el próximo partido de cada pareja.
5. **Mostrador y Caja del Club**: El encargado ve la grilla horaria en vivo, carga reservas telefónicas sin requerir app del cliente, cobra turnos, marca ausencias (sumando faltas y ofreciendo bloqueo al superar el umbral del club) y registra pagos divididos de partidos armados.
6. **Consola de Plataforma (Dueño)**: Lista de clubes con estado (`Prueba gratis 30 días` / `Activa`), métricas de uso (canchas activas, reservas del mes, partidos armados, torneos), alta de nuevos clubes con coordenadas y simulación del débito mensual por cantidad de canchas.

---

## 3. Decisiones Clave de Producto y Compromisos

- **Motor de Emparejamiento y Retención en Cliente + Transacción Firestore**:
  - *Enfoque elegido*: Lógica determinista en TypeScript ejecutada mediante transacciones atómicas en Firestore (`runTransaction`) al crear un pedido puntual, actualizar disponibilidad o responder una propuesta, complementada con un evaluador de expiraciones y alertas al abrir/actualizar el tablero.
  - *Por qué*: Garantiza consistencia sin reservas duplicadas de cancha (`double-booking`) ni condiciones de carrera cuando dos jugadores aceptan simultáneamente, operando nativamente sobre Firestore sin requerir infraestructura externa de cron jobs pagos en esta etapa.
  - *Alternativas descartadas*: Emisión de reservas sin retención previa (riesgo de que la cancha se ocupe mientras los 4 confirman) o backend separado de colas en memoria (rompería la persistencia en Firestore).
- **Mercado Pago y Despacho de Mails Simulados con Registro Real**:
  - *Enfoque elegido*: Pantalla y modal de checkout de Mercado Pago fiel al flujo real (elección de seña % o turno entero, cálculo automático de 1/4 para partidos armados, reembolso automático si se cancela antes de las X horas y débito mensual por cancha), persistiendo cada transacción en la colección de pagos/caja de Firestore. Las notificaciones combinan **Web Notifications reales** (cuando el usuario otorga permiso en la PWA) + un **Centro de Avisos y Registro Push/Mail** que refleja exactamente la matriz de eventos del documento.
  - *Por qué*: Permite demostrar y probar el ciclo económico y de avisos completo de punta a punta sin exponer credenciales productivas de Mercado Pago ni SMTP.
- **Preparado para Red Multi-Club ("Lo que dejamos previsto")**:
  - *Enfoque elegido*: El perfil del jugador (`users/{uid}`) almacena una única categoría global y preferencias; cada club guarda dirección y coordenadas (`lat`, `lng`), y la estructura de pedidos de partido admite un arreglo `clubIds[]` aunque en esta primera fase filtre por el club activo.
  - *Por qué*: Cumple el requisito arquitectónico de escalar luego a un buscador transversal de clubes cercanos sin migrar ni rehacer el modelo de datos.

---

## 4. Arquitectura Técnica y Estrategia de Datos

### Diagrama de Arquitectura del Sistema

```
┌───────────────────────────────────────────────────────────────────────────┐
│                 PWA React + Vite + Tailwind (App Instalable)              │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │  Motor de Tema Marca Blanca (--club-primary / --club-accent)        │  │
│  │  Service Worker (vite-plugin-pwa) + Prompt Instalación + Offline    │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                      │                                    │
│  ┌───────────────┐  ┌────────────────┴───────────────┐  ┌──────────────┐  │
│  │ Auth & Perfil │  │  Vistas por Rol (RBAC UI)      │  │ Notificador  │  │
│  │ Único Global  │  │  • Jugador (Reservas/Match/Torn)│  │ Matriz Push  │  │
│  │ (Google Auth) │  │  • Encargado (Grilla/Caja/Faltas)│ │ + Log Mail   │  │
│  └───────┬───────┘  │  • Admin Club (Config/Canchas) │  └──────┬───────┘  │
│          │          │  • Dueño Plataforma (Clubes)   │         │          │
└──────────┼──────────┴────────────────┬───────────────┴─────────┼──────────┘
           │                           │                         │
           ▼                           ▼                         ▼
┌───────────────────────────────────────────────────────────────────────────┐
│              Capa de Dominio & Motor de Emparejamiento (Client TS)        │
│  • Algoritmo Matchmaking: Categoría (±1) + Género + Pareja Fija + Hueco   │
│  • Validador de Tarifas Dinámicas (Base / Noche / Fin de Semana)          │
│  • Generador de Cuadros de Torneo (Eliminación Directa / Grupos + Elim.)  │
│  • Simulador de Pagos Mercado Pago (Seña / Total / 4 partes / Reembolso)  │
└──────────────────────────────────────┬────────────────────────────────────┘
                                       │ Transacciones & Listeners Tiempo Real
                                       ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                   Firebase Platform (Auth + Cloud Firestore)              │
│  • firebase-blueprint.json (Esquema estricto) + firestore.rules (Zero-Trust)
│  • /users/{uid} (Cuenta única, categoría global, disponibilidad semanal)   │
│  • /clubs/{clubId} (Branding, reglas, lat/lng, suscripción, canchas)      │
│  • /clubs/{clubId}/bookings/{bookingId} (Turnos directos, mostrador, holds)
│  • /clubs/{clubId}/matchRequests/{reqId} & proposedMatches/{matchId}      │
│  • /clubs/{clubId}/tournaments/{tId} (Inscripciones en pareja & cuadros)  │
│  • /clubs/{clubId}/payments/{payId} & notifications/{notifId}             │
└───────────────────────────────────────────────────────────────────────────┘
```

### Modelo de Datos y Seguridad (Firestore)
- **Identidad única global (`/users/{uid}` y `/users/{uid}/private/info`)**: Aislamiento de PII (email, teléfono) siguiendo la estrategia de colección dividida. Almacena `category` (1–8), `gender` / `preferredModality`, `weeklyAvailability` (bloques día + hora inicio/fin) y `clubIds`.
- **Clubes multi-tenant (`/clubs/{clubId}`)**: Nombre, slug, colores marca blanca, dirección, `geo: { lat, lng }`, `slotDurationMinutes` (90), `openHour`/`closeHour`, `pricing: { base, nightFromHour, nightPrice, weekendPrice }`, `cancellationHours`, `maxNoShowsBeforeBlock`, `mercadoPago: { enabled, mode: 'full' | 'deposit', depositPercent }`, `subscription: { status: 'trial' | 'active', trialEndsAt, pricePerCourt, courtCount }`.
- **Subcolecciones operativas por club**:
  - `courts`: Nombre, `surface` (`cristal` | `muro`), `roof` (`techada` | `aire_libre`), `hasLights`, `active`.
  - `memberships`: Rol dentro del club (`admin`, `staff`, `player`), `noShowCount`, `blocked`, `categoryOverride`.
  - `bookings`: `courtId`, `date`, `startMinute`, `endMinute`, `type` (`direct` | `counter` | `matched` | `tournament`), `status` (`held` | `confirmed` | `cancelled` | `no_show`), `holdExpiresAt`, `totalPrice`, `paymentStatus`, `playerUids[]`, `guestName` (para mostrador).
  - `matchRequests`: `clubIds[]`, `creatorUid`, `partnerUid` (opcional para pareja fija), `category`, `modality` (`masculino` | `femenino` | `mixto`), `date` (para pedido puntual prioritario), `startMinute`, `endMinute`, `isPrioritySameDay`, `status` (`waiting` | `proposed` | `confirmed` | `expired`).
  - `proposedMatches`: `clubId`, `bookingId`, `courtId`, `date`, `startMinute`, `endMinute`, `modality`, `players[]` (4 slots con `uid`, `category`, `status: 'pending' | 'accepted' | 'declined'`, `paidShare`), `expiresAt`, `status` (`pending` | `confirmed` | `cancelled`).
  - `tournaments`: Configuración, `format` (`knockout` | `groups_knockout`), `categories[]`, `maxPairs`, `entryFee`, `registrationOpen`, `pairs[]` (con aceptación del compañero y pago) y `bracketMatches[]` (enlazando resultados y reserva automática de canchas).
  - `notifications`: Registro de eventos push + mail vinculados al usuario y club.
- **Seguridad Zero-Trust**: `firestore.rules` validado contra `firebase-blueprint.json` con helpers `isValid*`, límites de tamaño en strings y arreglos, timestamps de servidor y control de roles por membresía del club + administrador de plataforma (`bernardo@awalabs.com` y colección `/admins`).

### Mapeo Interactivo de Componentes y Estados
- **Carga inicial y datos semilla**: Si Firestore está vacío al primer ingreso del dueño/admin, un inicializador idempotente siembra 2 clubes piloto en Montevideo (*Pocitos Pádel Club* y *Carrasco Indoor Pádel*) con canchas, tarifas, jugadores de distintas categorías (3ra a 7ma), disponibilidad semanal y un torneo abierto para que el armado de partidos y la grilla funcionen desde el primer clic.
- **Resiliencia UI**: Skeletons de grilla en carga, estados vacíos guiados con CTA claro en cada módulo, manejo estructurado de errores de permisos de Firestore y banner no intrusivo cuando el dispositivo pierde conexión (`OfflineIndicator`).
- **PWA y Notificaciones**: Configuración completa con `vite-plugin-pwa`, iconos PNG 192x192 / 512x512 / maskable / apple-touch-icon, botón de instalación integrado en la interfaz (`PWAInstallButton`) y disparador de notificaciones web nativas sincronizado con la matriz de eventos de la plataforma.
