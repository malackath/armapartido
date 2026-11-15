# Revisión del prototipo PaddleUY.zip (Google AI Studio)

Fecha: 2026-11-15. Revisado por Claude.

## Qué es
- App "CuatroEnCancha": React + Vite + Firebase (login con Google, Firestore), instalable en el celular (PWA). ~11.900 líneas.
- Cubre los 4 roles (dueño de plataforma, admin del club, mostrador, jugador), reservas, armado de partidos, torneos, notificaciones push, ranking, amigos, lista de espera.
- Mercado Pago está **simulado** (no cobra de verdad).

## Verificado
- Compila (`vite build` OK) después de agregar una dependencia faltante (`react-is`).
- La pantalla de entrada se ve bien en celular (captura revisada).

## Decisiones que tomó AI Studio y Ber tiene que confirmar
- Nombre: CuatroEnCancha (cuatroencancha.com). Dominio NO verificado.
- Partidos masculino / femenino / mixto a elección del jugador.
- Pareja fija permitida.
- Hasta 1 categoría de diferencia.
- Los 4 confirman (2 h, o 30 min el mismo día).
- Sin precio distinto para socios.

## Problemas técnicos (para producción)
1. El armado de partidos corre en el celular del jugador, no en un servidor. Solo funciona si alguien tiene la app abierta, y dos jugadores a la vez pueden pisarse.
2. Los vencimientos (retención de cancha, plazo para aceptar) se guardan pero nadie los ejecuta: falta un proceso en el servidor.
3. Está conectado al proyecto de Firebase que crea AI Studio, no a uno de Ber.
4. Hay un selector para cambiar de rol en la barra (para probar). Hay que sacarlo o restringirlo antes de dar acceso a clubes reales.
5. Mercado Pago simulado.

## Recomendación
Usar este prototipo como base y como "wireframe navegable" (reemplaza el paso 2 de Stitch). Pasarlo a GitHub (malackath, privado) y a un Firebase propio, y mover al servidor el armado de partidos, los vencimientos y los avisos.

---

# Revisión del diseño de Stitch (stitch_cuatroencancha_padel_platform.zip)

4 pantallas: Inicio del club, Armar partido, Perfil del jugador, Mostrador. Más un sistema de diseño (DESIGN.md: fondo claro, cian #0BFBFF para acciones, teal #00696B, tipografía Outfit) y 4 fotos generadas.

## Lo bueno
- Estilo claro y deportivo, coherente entre pantallas. Sirve como guía visual para el prototipo.
- La grilla de canchas del mostrador y la tarjeta del partido armado (2 vs 2, plazo, quién pagó) están muy bien resueltas.

## Problemas
1. Todo está diseñado para computadora (1280 px de ancho). El jugador va a usar la app en el celular: faltan las versiones de celular.
2. Usa un nivel decimal de 1 a 10 ("7.4 FIP") además de la categoría de 1ra a 8va. Las reglas dicen categoría. Hay que decidir uno o explicar cómo conviven.
3. Agrega funciones fuera del alcance: luces de las canchas conectadas, cámara en vivo, venta de bar y accesorios en el mostrador, test de palas, estadísticas avanzadas.
4. Datos de ejemplo con fechas de 2024 y huecos de imagen ("img") sin completar.

## Recomendación
Tomar de Stitch el estilo (colores, tipografía, tarjetas) y aplicarlo sobre el prototipo de AI Studio, que ya funciona. Pedirle a Stitch las pantallas del jugador en versión celular. Dejar fuera de la primera versión las funciones del punto 3.

---

# Revisión de las pantallas de celular de Stitch ("stitch_cuatroencancha_padel_platform copy.zip")

5 pantallas: Inicio, Reservar, Armar partido, Torneos, Perfil. Barra inferior con 5 íconos.

## Lo bueno
- Siguen las reglas: categoría de 1ra a 8va (sin nivel decimal), disponibilidad semanal, partido 2 vs 2 con plazo para aceptar, inscripción en pareja.
- Sin domótica, cámaras ni bar. Fechas de noviembre de 2026.
- Están listas para usarse como diseño de la versión de celular.

## A corregir (son detalles, no rehacer)
1. Reservar: al pagar solo ofrece Mercado Pago. Falta "pagar en el club", que según las reglas es la opción principal.
2. Torneos: la foto de arriba no carga (se ve el texto alternativo).
3. Torneos: dice "avalada por la Federación Uruguaya de Pádel". No tenemos ese aval: sacarlo.
4. Usa "pistas" (español de España) mezclado con "canchas". En Uruguay es "canchas".
5. Inicio: dos partidos abiertos dicen "60 minutos"; los turnos son de 90.
6. Armar partido: la modalidad muestra Masculino y Mixto, falta Femenino.
7. La etiqueta "PRO" junto al nombre no está definida en ningún lado.

---

# Revisión del cuadro de torneo de Stitch (stitch_cuatroencancha_torneo.zip)

2 pantallas: cuadro del torneo en celular y en computadora (modo oscuro).

## Lo bueno
- El cuadro por rondas (octavos, cuartos, semis, final), las pestañas por categoría y la tarjeta "tu próximo partido" están claros. Sirven como base.

## A corregir
1. Vuelven las afiliaciones que no tenemos: "Oficial FIP · AAP 2026", "Ranking Nacional", "Árbitro General (FIP)", "puntuable para el Ranking Nacional". Sacar todo.
2. Vuelve el nivel decimal ("Ratio 7.4"). Usar solo la categoría.
3. "Telemetría en vivo" (saques, smashes, break points) y transmisión en vivo: nadie carga esos datos. Fuera de la primera versión.
4. La versión de computadora tiene fecha de 2024, domótica y caja en la barra: es la del mostrador vieja, no sirve.
