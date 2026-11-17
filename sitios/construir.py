#!/usr/bin/env python3
"""Arma el sitio estático de un club a partir de su club.json, fotos y logo.

Uso:  python3 sitios/construir.py padelclub
Sale en sitios/dist/<slug>/ (index.html + img/), listo para subir a Cloudflare Pages.
Necesita: pip install jinja2 pillow
"""
import json, sys, shutil
from pathlib import Path
from PIL import Image
from jinja2 import Environment, FileSystemLoader
from markupsafe import Markup, escape

AQUI = Path(__file__).resolve().parent
ANCHOS = (800, 1600)


def optimizar(origen: Path, destino: Path):
    """Cada foto en 800 y 1600 px, WebP (principal) y JPG (respaldo)."""
    im = Image.open(origen).convert("RGB")
    for w in ANCHOS:
        a = im if im.width <= w else im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
        a.save(destino / f"{origen.stem}-{w}.webp", "WEBP", quality=72, method=6)
        a.save(destino / f"{origen.stem}-{w}.jpg", "JPEG", quality=74, optimize=True, progressive=True)
    return im.size


def main(slug: str):
    club = AQUI / "clubes" / slug
    c = json.loads((club / "club.json").read_text(encoding="utf-8"))
    sal = AQUI / "dist" / slug
    if sal.exists():
        shutil.rmtree(sal)
    (sal / "img").mkdir(parents=True)

    tam = {}
    for f in sorted((club / "fotos").glob("*.jpg")):
        tam[f.stem] = optimizar(f, sal / "img")

    logo = Image.open(club / "logo.png").convert("RGBA")
    for w in (64, 128, 180):
        logo.resize((w, w), Image.LANCZOS).save(sal / "img" / f"logo-{w}.png", optimize=True)

    def ancho(nombre):  # ancho real de la versión grande (nunca se agranda)
        return min(ANCHOS[-1], tam[nombre][0])

    def foto(nombre, alt, sizes):
        w, h = tam[nombre]
        return Markup(
            f'<picture><source type="image/webp" srcset="img/{nombre}-800.webp 800w, img/{nombre}-1600.webp {ancho(nombre)}w" sizes="{sizes}">'
            f'<img src="img/{nombre}-800.jpg" srcset="img/{nombre}-800.jpg 800w, img/{nombre}-1600.jpg {ancho(nombre)}w" sizes="{sizes}" '
            f'alt="{escape(alt)}" width="{w}" height="{h}" loading="lazy" decoding="async"></picture>'
        )

    env = Environment(loader=FileSystemLoader(AQUI / "plantilla"), autoescape=True, trim_blocks=True, lstrip_blocks=True)
    env.globals["foto"] = foto
    env.globals["ancho"] = ancho
    html = env.get_template("index.html.j2").render(c=c, col=c["colores"])
    (sal / "index.html").write_text(html, encoding="utf-8")
    # Cache largo para imágenes en Cloudflare Pages
    (sal / "_headers").write_text("/img/*\n  Cache-Control: public, max-age=31536000, immutable\n")

    total = sum(p.stat().st_size for p in sal.rglob("*") if p.is_file())
    print(f"Listo: {sal}  ({total/1024:.0f} KB en total)")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "padelclub")
