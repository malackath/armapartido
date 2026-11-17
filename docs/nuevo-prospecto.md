# Nuevo prospecto: su app con su marca en <slug>.armapartido.com

Para mostrarle a un club (o prospecto) cómo queda la app con su logo, sus colores y su nombre.
Los datos son los de la demo (ficticios). La marca cambia solo lo que se ve: logo, nombre, header,
botones, acento y fondo. Nunca cambia los colores de estado (pagado, debe, sin confirmar, falta uno)
ni los de categoría.

## Pasos
1. Guardar el logo (PNG o JPG; si tiene fondo blanco, el script lo quita).
2. Desde la carpeta del repo, armar la marca:
   ```
   node scripts/nuevo-prospecto.cjs --slug padelclub --nombre "Padel Club" --logo ruta/logo.png --principal "#0D162A" --acento "#C8F400" --secundario "#1EA5E6"
   ```
   Sin `--principal` / `--acento` toma los colores del logo. Deja todo en `public/clubes/<slug>/`.
3. Probar en local: `npm run dev:demo` (o la demo cargada) y abrir `/?club=<slug>`.
4. Commit en la rama completa de la demo y publicar con `bash Paddle.URU/docs/publicar-demo.sh <rama>`.
5. Cloudflare (una vez por prospecto): Pages → armapartido-demo → Custom domains → `<slug>.armapartido.com`,
   y en DNS de armapartido.com un CNAME `<slug>` → `armapartido-demo.pages.dev` con proxy.
6. Mientras el dominio no esté activo, se ve igual en `https://demo.armapartido.com/?club=<slug>`.

## Cómo funciona
- `src/lib/marcaClub.ts` lee `public/clubes/<slug>/marca.json` según el subdominio (o `?club=`), antes de mostrar la app.
- Control de contraste: el color principal se oscurece hasta leerse sobre blanco (4,5:1); el texto
  sobre el acento se elige entre blanco, negro o el principal (el que más contraste). Por eso un verde
  lima va como acento (botones con texto azul marino) y nunca como texto sobre blanco.
- `reemplazos` en marca.json cambia el nombre del club de la demo en los textos (torneo, dirección).
- Header, entrada y título de la pestaña muestran el logo y el nombre del club, con "con Armá Partido" chico.
