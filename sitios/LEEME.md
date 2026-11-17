# Sitios web de clubes (plantilla)

Sitio estático de una página para cada club, con botón de reservar que lleva a su app de Armá Partido.
No toca la app ni la demo: es una carpeta aparte que se publica sola.

## Armar un sitio
1. Copiar `clubes/padelclub/` a `clubes/<slug>/`.
2. Cambiar `club.json` (nombre, colores, textos, precios, torneos, horarios, link de la app).
3. Poner las fotos en `fotos/` como `.jpg` (los nombres se eligen en `club.json > fotos`) y el logo con fondo transparente en `logo.png`.
4. Construir:

```
cd armapartido && python3 sitios/construir.py <slug>
```

Sale en `sitios/dist/<slug>/`: `index.html`, fotos en WebP y JPG (800 y 1600 px) y `_headers` con cache largo.
Necesita `pip install jinja2 pillow`.

## Publicar (Cloudflare Pages, un proyecto por sitio)

```
cd armapartido && npx wrangler pages deploy sitios/dist/<slug> --project-name sitio-<slug> --branch main
```

Después, en Cloudflare: proyecto `sitio-<slug>` > Custom domains > `<slug>-web.armapartido.com`.
No usar `sitio.<slug>.armapartido.com`: dos niveles de subdominio no los cubre el certificado gratis.

## Reglas
- "Cancha", nunca "pista". Categorías 1ra a 7ma, sin decimales. Turnos de 90 minutos. Se paga en el club.
- Si `demo: true`, el pie dice "Demo creada con Armá Partido" y la página no se indexa en buscadores.
