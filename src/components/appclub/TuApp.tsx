/**
 * Admin → "Tu app" (parte 2.2, 16/11/2026): la app con el nombre y el ícono del club, el QR para
 * instalarla, el cartel A4 para el mostrador y la story de Instagram.
 * Wireframe aprobado: project files informes/diferenciacion-mejoras/wireframes-parte2-demo-5-minutos.png (2).
 */
import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import type { Club } from '../../types/padel';
import { clubAppKey, clubAppUrl, prettyUrl, shortClubName } from '../../lib/appDelClub';
import { downloadBytes } from '../../lib/planilla';

interface ClubManifest {
  short_name?: string;
  theme_color?: string;
}

const PITCH = 'Reservá cancha, armá partido y anotate en los torneos.';

function posterHtml(p: { name: string; url: string; qr: string; color: string; icon: string }) {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Cartel · ${esc(p.name)}</title>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700&display=swap" rel="stylesheet">
<style>
@page{size:A4;margin:0}
*{box-sizing:border-box}
body{margin:0;font-family:Outfit,system-ui,sans-serif;background:#e5e7eb}
.bar{position:sticky;top:0;display:flex;justify-content:center;gap:12px;padding:12px;background:#172123}
.bar button{font:600 15px Outfit,sans-serif;padding:10px 18px;border-radius:12px;border:0;cursor:pointer;background:#0ff;color:#172123}
.a4{width:210mm;height:297mm;margin:16px auto;background:#fff;display:flex;flex-direction:column;align-items:center;padding:22mm 18mm 16mm;text-align:center}
.top{width:100%;background:${p.color};color:#fff;border-radius:10mm;padding:12mm 10mm}
.top img{width:26mm;height:26mm;border-radius:6mm;border:1.2mm solid rgba(255,255,255,.35)}
h1{margin:6mm 0 0;font-size:15mm;line-height:1.05;font-weight:700;letter-spacing:-.02em}
.sub{margin:3mm 0 0;font-size:6mm;opacity:.9}
.qr{margin:12mm 0 0;width:92mm;height:92mm}
.url{margin:4mm 0 0;font-size:7.5mm;font-weight:700;color:#172123}
.steps{margin:9mm 0 0;display:grid;grid-template-columns:1fr 1fr 1fr;gap:5mm;width:100%;font-size:4.6mm;color:#334155}
.steps b{display:block;font-size:9mm;color:${p.color}}
.foot{margin-top:auto;font-size:3.6mm;color:#64748b}
@media print{body{background:#fff}.bar{display:none}.a4{margin:0}}
</style></head><body>
<div class="bar"><button onclick="print()">Imprimir</button></div>
<div class="a4">
  <div class="top"><img src="${p.icon}" alt=""><h1>Bajá la app de<br>${esc(p.name)}</h1><p class="sub">${PITCH}</p></div>
  <img class="qr" src="${p.qr}" alt="QR">
  <div class="url">${esc(prettyUrl(p.url))}</div>
  <div class="steps"><div><b>1</b>Apuntá la cámara al código</div><div><b>2</b>Creá tu cuenta en un minuto</div><div><b>3</b>Agregala a tu pantalla de inicio</div></div>
  <div class="foot">Gratis para los jugadores · Funciona con Armá Partido</div>
</div></body></html>`;
}

async function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** Story 1080×1920 para Instagram, dibujada en el navegador. */
async function storyPng(p: { name: string; url: string; qr: string; color: string; icon: string; initials: string }): Promise<Uint8Array> {
  await document.fonts?.ready;
  const c = document.createElement('canvas');
  c.width = 1080;
  c.height = 1920;
  const g = c.getContext('2d')!;
  g.fillStyle = p.color;
  g.fillRect(0, 0, 1080, 1920);
  const font = (w: number, s: number) => `${w} ${s}px Outfit, system-ui, sans-serif`;
  const icon = await loadImage(p.icon);
  const rr = (x: number, y: number, w: number, h: number, r: number) => {
    g.beginPath();
    g.roundRect(x, y, w, h, r);
  };
  if (icon) {
    g.save();
    rr(450, 180, 180, 180, 40);
    g.clip();
    g.drawImage(icon, 450, 180, 180, 180);
    g.restore();
  }
  g.fillStyle = '#fff';
  g.textAlign = 'center';
  g.font = font(600, 54);
  g.fillText('Bajá la app de', 540, 470);
  g.font = font(700, 92);
  const words = p.name.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (g.measureText(t).width > 920 && cur) {
      lines.push(cur);
      cur = w;
    } else cur = t;
  }
  lines.push(cur);
  lines.slice(0, 3).forEach((l, i) => g.fillText(l, 540, 575 + i * 96));
  const top = 575 + (Math.min(3, lines.length) - 1) * 96 + 60;
  g.fillStyle = '#fff';
  rr(210, top, 660, 740, 56);
  g.fill();
  const qr = await loadImage(p.qr);
  if (qr) g.drawImage(qr, 260, top + 40, 560, 560);
  g.fillStyle = '#172123';
  g.font = font(700, 40);
  g.fillText(prettyUrl(p.url), 540, top + 670);
  g.fillStyle = '#fff';
  g.font = font(500, 44);
  g.fillText('Reservá en 10 segundos', 540, top + 840);
  g.fillText('Armá partido · Torneos', 540, top + 900);
  g.globalAlpha = 0.75;
  g.font = font(500, 30);
  g.fillText('Funciona con Armá Partido', 540, 1860);
  const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), 'image/png'));
  return new Uint8Array(await blob.arrayBuffer());
}

const FakeIcon: React.FC<{ label: string }> = ({ label }) => (
  <div className="flex flex-col items-center gap-1">
    <div className="h-12 w-12 rounded-[13px] bg-white/80" />
    <span className="text-[10px] text-white/90">{label}</span>
  </div>
);

export const TuApp: React.FC<{ club: Club; onToast: (m: string) => void }> = ({ club, onToast }) => {
  const key = clubAppKey(club);
  const url = clubAppUrl(key);
  const base = `/clubes/${key}`;
  const [manifest, setManifest] = useState<ClubManifest | null>(null);
  const [ready, setReady] = useState<boolean | null>(null);
  const [qr, setQr] = useState('');
  const color = manifest?.theme_color || club.primaryColor || '#0a5761';
  const short = manifest?.short_name || shortClubName(club.name);
  const initials = club.name.split(/\s+/).filter((w) => /^[A-ZÁÉÍÓÚÑ]/.test(w)).slice(0, 2).map((w) => w[0]).join('');

  useEffect(() => {
    let alive = true;
    fetch(`${base}/manifest.webmanifest`)
      .then((r) => (r.ok ? r.json() : null))
      .then((m) => {
        if (!alive) return;
        setManifest(m);
        setReady(!!m);
      })
      .catch(() => alive && setReady(false));
    QRCode.toDataURL(url, { margin: 1, width: 720, errorCorrectionLevel: 'M', color: { dark: '#172123', light: '#ffffff' } }).then((d) => alive && setQr(d));
    return () => {
      alive = false;
    };
  }, [base, url]);

  const icon = `${base}/icon-512.png`;

  const poster = () => {
    const w = window.open('', '_blank');
    if (!w) {
      onToast('El navegador bloqueó la ventana. Permití las ventanas emergentes para este sitio.');
      return;
    }
    w.document.write(posterHtml({ name: club.name, url, qr, color, icon: new URL(icon, location.origin).href }));
    w.document.close();
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      onToast('Link copiado.');
    } catch {
      onToast(url);
    }
  };

  const story = async () => {
    const png = await storyPng({ name: club.name, url, qr, color, icon, initials });
    downloadBytes(`story-${key}.png`, png, 'image/png');
    onToast('Story bajada: subila a Instagram desde el celular.');
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]" data-testid="tu-app">
      <section className="rounded-2xl border border-line bg-white p-5 text-center">
        <h3 className="font-display text-xl font-bold text-ink">Bajá la app de {club.name}</h3>
        <p className="mt-1 text-[13px] text-muted">{PITCH}</p>
        <div className="mx-auto mt-4 grid h-56 w-56 place-items-center rounded-2xl border border-line bg-white p-2">
          {qr ? <img src={qr} alt={`Código QR de ${prettyUrl(url)}`} className="h-full w-full" /> : <span className="text-sm text-muted">Armando el código…</span>}
        </div>
        <p className="mt-3 font-display text-[15px] font-bold text-ink" data-testid="tu-app-url">
          {prettyUrl(url)}
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {[
            ['Imprimir cartel A4', poster],
            ['Copiar link', copy],
            ['Story de Instagram', story],
          ].map(([label, fn]) => (
            <button
              key={label as string}
              type="button"
              disabled={!qr}
              onClick={fn as () => void}
              className="rounded-full border border-line bg-white px-4 py-2 text-[13px] font-semibold text-brand hover:bg-mist cursor-pointer disabled:opacity-50"
            >
              {label as string}
            </button>
          ))}
        </div>
        <div className="mt-5 grid gap-2 text-left text-[13px] text-ink sm:grid-cols-2">
          <p className="rounded-xl bg-mist p-3">
            <b>iPhone:</b> abrí el link en Safari, tocá Compartir y “Agregar a inicio”.
          </p>
          <p className="rounded-xl bg-mist p-3">
            <b>Android:</b> abrí el link en Chrome y tocá “Instalar app”.
          </p>
        </div>
      </section>

      <section className="flex flex-col items-center">
        <div className="w-[260px] rounded-[36px] border-[6px] border-ink bg-gradient-to-b from-[#3b2a5a] to-[#172123] p-5 pt-8" aria-label="Así se ve en el celular">
          <div className="grid grid-cols-3 gap-y-5">
            <FakeIcon label="Fotos" />
            <FakeIcon label="Mapas" />
            <div className="flex flex-col items-center gap-1" data-testid="tu-app-icono">
              {ready ? (
                <img src={`${base}/icon-192.png`} alt="" className="h-12 w-12 rounded-[13px] ring-2 ring-white/70" />
              ) : (
                <div className="grid h-12 w-12 place-items-center rounded-[13px] text-sm font-bold text-white ring-2 ring-white/70" style={{ background: color }}>
                  {initials}
                </div>
              )}
              <span className="max-w-[72px] truncate text-[10px] font-semibold text-white">{short}</span>
            </div>
            <FakeIcon label="WhatsApp" />
            <FakeIcon label="Banco" />
            <FakeIcon label="Mail" />
          </div>
          <div className="mt-24" />
        </div>
        <p className="mt-3 max-w-[280px] text-center text-xs text-muted">
          Al instalarla, el ícono y el nombre son los de tu club, no “Armá Partido”. Adentro está solo tu club: nunca la competencia al lado.
        </p>
        {ready === false && (
          <p className="mt-2 max-w-[280px] rounded-xl bg-wait-bg p-3 text-center text-xs text-wait">El ícono de tu club todavía no está armado. Lo preparamos nosotros al darte de alta.</p>
        )}
      </section>
    </div>
  );
};
