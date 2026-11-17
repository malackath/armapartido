/**
 * Admin → Apariencia (17/11/2026). Wireframe: project files alta-de-club/wireframe-fuente/project/Apariencia.dc.html.
 * El club cambia principal, acento, fondo (claro), letras, esquinas, slogan, logo y fotos, con vista previa en vivo.
 * Quedan fijos los colores de estado, las categorías, los errores y el color del texto.
 * Guardar lo manda al servidor (marcaGuardar): se publica solo o queda en revisión (decisión 7).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Club, MarcaDatos } from '../../types/padel';
import {
  ESQUINAS,
  FOTOS_MARCA,
  FUENTES,
  FUENTES_SOLO_TITULOS,
  MARCA_ARMA_PARTIDO,
  SLOGAN_MAX,
  cambiaronImagenes,
  esHex,
  fondosSugeridos,
  revisarColores,
  variablesDeMarca,
} from '../../lib/marcaColores';
import { cargarFuentesGoogle } from '../../lib/marcaClub';
import { coloresDelLogo, guardarMarca, prepararFoto, prepararLogo, subirImagenMarca } from '../../services/marcaService';
import { CategoryBadge } from '../ui/People';
import { PortadaClub } from './PortadaClub';

const PRINCIPALES = [
  { name: 'Armá Partido', hex: '#0a5761' },
  { name: 'Deep Navy', hex: '#0b132b' },
  { name: 'Cyan Court', hex: '#0284c7' },
  { name: 'Verde', hex: '#15803d' },
  { name: 'Violeta', hex: '#6d28d9' },
  { name: 'Naranja', hex: '#ea580c' },
];
const ACENTOS = [
  { name: 'Cian', hex: '#0bfbff' },
  { name: 'Volt Lime', hex: '#d4ff00' },
  { name: 'Amarillo', hex: '#facc15' },
  { name: 'Naranja', hex: '#f97316' },
  { name: 'Rosa', hex: '#f472b6' },
  { name: 'Blanco', hex: '#ffffff' },
];

const MOTIVO: Record<string, string> = {
  primera: 'es la primera marca del club',
  imagenes: 'cambiaron el logo o las fotos',
  colores: 'algún color tiene un aviso de contraste',
};

const fecha = (iso?: string) => (iso ? new Date(iso).toLocaleString('es-UY', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : '');
const quitarMeta = (m: MarcaDatos & Record<string, unknown>): MarcaDatos => {
  const { colores, fuentes, esquinas, slogan, logo, fotos } = m;
  return JSON.parse(JSON.stringify({ colores, fuentes, esquinas, slogan, logo, fotos }));
};

function marcaInicial(club: Club): MarcaDatos {
  const base = club.marcaPendiente || club.marca || club.marcaAlta;
  if (base) return quitarMeta(base as MarcaDatos & Record<string, unknown>);
  return { ...MARCA_ARMA_PARTIDO, colores: { ...MARCA_ARMA_PARTIDO.colores, principal: esHex(club.primaryColor) ? club.primaryColor.toLowerCase() : MARCA_ARMA_PARTIDO.colores.principal } };
}

const Card: React.FC<{ title: string; detail?: string; children: React.ReactNode; testId?: string }> = ({ title, detail, children, testId }) => (
  <section className="rounded-2xl border border-line bg-white p-5 sm:p-6" data-testid={testId}>
    <h2 className="font-display text-[17px] font-bold text-ink">{title}</h2>
    {detail && <p className="mt-0.5 text-[13px] text-muted">{detail}</p>}
    <div className="mt-4">{children}</div>
  </section>
);

const Swatches: React.FC<{
  label: string;
  detail: string;
  value: string;
  options: { name: string; hex: string }[];
  onChange: (hex: string) => void;
  testId: string;
}> = ({ label, detail, value, options, onChange, testId }) => {
  const [txt, setTxt] = useState(value);
  useEffect(() => setTxt(value), [value]);
  return (
    <div className="border-t border-[#eef5f5] py-4 first:border-0 first:pt-0" data-testid={testId}>
      <p className="text-sm font-semibold text-ink">
        {label} <span className="font-normal text-muted">· {detail}</span>
      </p>
      <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
        {options.map((o) => (
          <button
            key={o.hex + o.name}
            type="button"
            title={o.name}
            aria-label={o.name}
            aria-pressed={value.toLowerCase() === o.hex.toLowerCase()}
            onClick={() => onChange(o.hex.toLowerCase())}
            className={`h-10 w-10 cursor-pointer rounded-full ${value.toLowerCase() === o.hex.toLowerCase() ? 'ring-[3px] ring-ink ring-offset-2' : 'ring-1 ring-[#c5d8d9]'}`}
            style={{ backgroundColor: o.hex }}
          />
        ))}
        <label className="ml-1 flex items-center gap-2 text-[13px] text-muted">
          u otro:
          <input type="color" value={esHex(value) ? value : '#000000'} onChange={(e) => onChange(e.target.value.toLowerCase())} className="h-10 w-12 cursor-pointer rounded-lg border border-line bg-white" aria-label={`${label}: elegir otro color`} />
          <input
            value={txt}
            onChange={(e) => {
              setTxt(e.target.value);
              const v = e.target.value.trim();
              if (esHex(v)) onChange(v.toLowerCase());
            }}
            className="w-[92px] rounded-lg border border-line px-2 py-2 font-mono text-[13px] uppercase text-ink"
            aria-label={`${label} en código`}
          />
        </label>
      </div>
    </div>
  );
};

/** Vista previa del celular del jugador, con las variables de la marca solo dentro del recuadro. */
const VistaPrevia: React.FC<{ club: Club; m: MarcaDatos }> = ({ club, m }) => {
  const vars = variablesDeMarca(m) as React.CSSProperties;
  const style: React.CSSProperties = {
    ...vars,
    ['--font-display' as string]: `"${m.fuentes?.titulos || 'Outfit'}", system-ui, sans-serif`,
    fontFamily: `"${m.fuentes?.texto || 'Outfit'}", system-ui, sans-serif`,
    backgroundColor: (vars as Record<string, string>)['--color-page'],
  };
  const nav = ['Inicio', 'Reservar', 'Armar', 'Torneos', 'Perfil'];
  return (
    <div className="mx-auto w-[300px] rounded-[38px] border-[10px] border-[#172123] bg-[#172123] shadow-xl" data-testid="vista-previa">
      <div className="overflow-hidden rounded-[28px]" style={style}>
        <div className="flex items-center gap-2.5 bg-brand px-3.5 py-3 text-white">
          {m.logo ? <img src={m.logo} alt="" className="h-9 w-9 object-contain" /> : <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-xs font-bold">{club.name.slice(0, 2).toUpperCase()}</span>}
          <div className="min-w-0">
            <p className="truncate font-display text-[15px] font-bold leading-tight">{club.name}</p>
            <p className="text-[10px] text-white/60">con Armá Partido</p>
          </div>
        </div>
        <div className="space-y-3 p-3">
          <PortadaClub marca={{ nombre: club.name, logo: m.logo, slogan: m.slogan || 'Tu slogan va acá', fotos: m.fotos }} compacta />
          <div className="rounded-xl border border-line bg-white p-3">
            <div className="flex items-center justify-between">
              <p className="font-display text-[14px] font-bold text-ink">
                Hoy 20:00 <span className="font-normal text-muted">· Cancha 2</span>
              </p>
              <span className="rounded-full bg-ok-bg px-2 py-0.5 text-[11px] font-semibold text-ok">Libre</span>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <p className="text-[13px] text-muted">
                Hoy 21:30 · Cancha 1
              </p>
              <span className="rounded-full bg-busy px-2 py-0.5 text-[11px] font-semibold text-ink">Ocupado</span>
            </div>
          </div>
          <div className="flex items-center justify-between rounded-xl bg-white p-3">
            <p className="flex items-center gap-1.5 text-[13px] font-semibold text-ink">
              Falta uno · <CategoryBadge category={4} />
            </p>
            <span className="rounded-xl bg-action px-3 py-1.5 text-[12px] font-bold text-on-action">Sumarme</span>
          </div>
          <span className="block rounded-xl bg-brand py-2.5 text-center text-[13px] font-semibold text-white">Ver torneos</span>
        </div>
        <div className="grid grid-cols-5 border-t border-line bg-white py-2">
          {nav.map((n, i) => (
            <span key={n} className={`text-center text-[10.5px] ${i === 0 ? 'font-bold text-brand' : 'text-muted'}`}>
              {n}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};

export const AparienciaPanel: React.FC<{ club: Club; onToast: (msg: string) => void }> = ({ club, onToast }) => {
  const inicial = useMemo(() => marcaInicial(club), [club]);
  const [m, setM] = useState<MarcaDatos>(inicial);
  const [busy, setBusy] = useState(false);
  const [subiendo, setSubiendo] = useState<string>('');
  const [delLogo, setDelLogo] = useState<string[]>([]);
  const logoInput = useRef<HTMLInputElement>(null);
  const fotoInput = useRef<HTMLInputElement>(null);
  const fotoCual = useRef<(typeof FOTOS_MARCA)[number]['id']>('portada');

  // Si llega una versión nueva del servidor y no hay cambios sin guardar, se toma esa.
  const firmaInicial = JSON.stringify(inicial);
  const [base, setBase] = useState(firmaInicial);
  const dirty = JSON.stringify(m) !== base;
  useEffect(() => {
    if (!dirty) {
      setM(inicial);
      setBase(firmaInicial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firmaInicial]);

  useEffect(() => cargarFuentesGoogle([m.fuentes?.titulos, m.fuentes?.texto]), [m.fuentes?.titulos, m.fuentes?.texto]);

  const avisos = revisarColores(m.colores);
  const bloquea = avisos.some((a) => a.nivel === 'bloquea');
  const ok = avisos.every((a) => a.nivel === 'ok');
  const setColor = (k: keyof MarcaDatos['colores'], v: string) => setM((x) => ({ ...x, colores: { ...x.colores, [k]: v } }));

  const completo = club.paquete === 'completo';
  const vaARevision = !club.marca || cambiaronImagenes(club.marca, m) || !ok;

  const restablecer = () => {
    const alta = club.marcaAlta ? quitarMeta(club.marcaAlta as MarcaDatos & Record<string, unknown>) : MARCA_ARMA_PARTIDO;
    setM(alta);
    onToast(club.marcaAlta ? 'Volviste a la marca del alta. Falta guardar.' : 'Volviste a los colores de Armá Partido. Falta guardar.');
  };

  const onLogo = async (f?: File) => {
    if (!f) return;
    setSubiendo('logo');
    try {
      const img = await prepararLogo(f);
      setDelLogo(coloresDelLogo(img.canvas));
      const url = await subirImagenMarca(club.id, 'logo', img);
      setM((x) => ({ ...x, logo: url }));
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'No se pudo subir el logo.');
    } finally {
      setSubiendo('');
    }
  };
  const onFoto = async (f?: File) => {
    const cual = fotoCual.current;
    if (!f) return;
    setSubiendo(cual);
    try {
      const url = await subirImagenMarca(club.id, cual, await prepararFoto(f));
      setM((x) => ({ ...x, fotos: { ...(x.fotos || {}), [cual]: url } }));
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'No se pudo subir la foto.');
    } finally {
      setSubiendo('');
    }
  };

  const guardar = async () => {
    if (bloquea) return;
    setBusy(true);
    try {
      const r = await guardarMarca(club.id, m);
      setBase(JSON.stringify(m));
      onToast(r.estado === 'publicada' ? 'Listo: tus jugadores ya ven los cambios.' : 'Guardado. Lo revisamos y se publica en hasta 1 día hábil.');
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'No se pudo guardar.');
    } finally {
      setBusy(false);
    }
  };

  const fuentesTexto = FUENTES.filter((f) => !FUENTES_SOLO_TITULOS.has(f));

  return (
    <div className="space-y-5" data-testid="apariencia">
      {/* Estado de la marca */}
      {!completo && (
        <p className="rounded-xl bg-wait-bg px-4 py-3 text-[13.5px] text-ink" data-testid="aviso-paquete">
          <b>Tu club tiene la instalación básica:</b> tus jugadores ven Armá Partido con el nombre del club. Podés dejar tu marca lista; se aplica cuando el club pase a Imagen completa.
        </p>
      )}
      {club.marcaPendiente && (
        <p className="rounded-xl bg-[#ecfcfc] px-4 py-3 text-[13.5px] text-ink" data-testid="aviso-revision">
          <b>En revisión</b> desde el {fecha(club.marcaPendiente.enviadaEl)}, porque {MOTIVO[club.marcaPendiente.motivo]}. La revisamos en hasta 1 día hábil.
          {club.marca ? ' Mientras tanto tus jugadores ven la marca anterior.' : ''}
        </p>
      )}
      {club.marcaRechazo && !club.marcaPendiente && (
        <p className="rounded-xl bg-due-bg px-4 py-3 text-[13.5px] text-ink" data-testid="aviso-rechazo">
          <b>Pedimos un cambio:</b> {club.marcaRechazo.nota}
        </p>
      )}
      {club.marca && !club.marcaPendiente && completo && (
        <p className="rounded-xl bg-ok-bg px-4 py-3 text-[13.5px] text-ok" data-testid="aviso-publicada">
          Publicada el {fecha(club.marca.publicadaEl)}. Los cambios de color que se leen bien se publican solos; un logo o una foto nueva vuelve a revisión.
        </p>
      )}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <Card title="Colores" detail="Los cambios se ven al instante en la vista previa.">
            {delLogo.length > 0 && (
              <p className="mb-3 text-[12.5px] text-muted">Sacamos los colores de tu logo: están primeros en cada lista.</p>
            )}
            <Swatches
              label="Color principal"
              detail="header, botones y detalles importantes"
              value={m.colores.principal}
              options={[...delLogo.map((h, i) => ({ name: `Del logo ${i + 1}`, hex: h })), ...PRINCIPALES]}
              onChange={(v) => setColor('principal', v)}
              testId="color-principal"
            />
            <Swatches
              label="Color de acento"
              detail="botones de acción, chips y destacados"
              value={m.colores.acento}
              options={[...delLogo.map((h, i) => ({ name: `Del logo ${i + 1}`, hex: h })), ...ACENTOS]}
              onChange={(v) => setColor('acento', v)}
              testId="color-acento"
            />
            <Swatches
              label="Fondo"
              detail="siempre claro, para que el texto se lea"
              value={m.colores.fondo}
              options={fondosSugeridos(m.colores.principal, m.colores.acento).map((f) => ({ name: f.label, hex: f.hex }))}
              onChange={(v) => setColor('fondo', v)}
              testId="color-fondo"
            />
            <div className="space-y-1.5" data-testid="control-contraste">
              {avisos.map((a) => (
                <p
                  key={a.texto}
                  className={`rounded-xl px-3.5 py-2.5 text-[13px] ${a.nivel === 'ok' ? 'bg-ok-bg text-ok' : a.nivel === 'bloquea' ? 'bg-due-bg text-due' : 'bg-wait-bg text-[#7c2d12]'}`}
                >
                  {a.texto}
                </p>
              ))}
            </div>
          </Card>

          <Card title="Letras y esquinas" detail="Letras de Google Fonts, sin costo.">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-[12.5px] font-semibold text-ink">
                Títulos
                <select
                  value={m.fuentes?.titulos || 'Outfit'}
                  onChange={(e) => setM((x) => ({ ...x, fuentes: { ...(x.fuentes || {}), titulos: e.target.value } }))}
                  className="mt-1.5 w-full rounded-xl border border-line bg-white px-3 py-2.5 text-sm text-ink"
                  data-testid="fuente-titulos"
                >
                  {FUENTES.map((f) => (
                    <option key={f} value={f}>{f}{f === 'Outfit' ? ' (Armá Partido)' : ''}</option>
                  ))}
                </select>
              </label>
              <label className="block text-[12.5px] font-semibold text-ink">
                Texto
                <select
                  value={m.fuentes?.texto || 'Outfit'}
                  onChange={(e) => setM((x) => ({ ...x, fuentes: { ...(x.fuentes || {}), texto: e.target.value } }))}
                  className="mt-1.5 w-full rounded-xl border border-line bg-white px-3 py-2.5 text-sm text-ink"
                  data-testid="fuente-texto"
                >
                  {fuentesTexto.map((f) => (
                    <option key={f} value={f}>{f}{f === 'Outfit' ? ' (Armá Partido)' : ''}</option>
                  ))}
                </select>
              </label>
            </div>
            <p className="mt-4 text-[12.5px] font-semibold text-ink">Esquinas</p>
            <div className="mt-1.5 flex flex-wrap gap-2" role="radiogroup" aria-label="Esquinas">
              {ESQUINAS.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  role="radio"
                  aria-checked={(m.esquinas || 'medias') === e.id}
                  onClick={() => setM((x) => ({ ...x, esquinas: e.id }))}
                  className={`flex items-center gap-2 border px-3.5 py-2 text-sm cursor-pointer ${(m.esquinas || 'medias') === e.id ? 'border-brand bg-mist font-semibold text-brand' : 'border-line bg-white text-muted'}`}
                  style={{ borderRadius: e.px }}
                >
                  <span className="h-4 w-4 border-2 border-current" style={{ borderRadius: Math.min(e.px, 8) / 2 }} />
                  {e.label}
                </button>
              ))}
            </div>
          </Card>

          <Card title="Slogan" detail="Va debajo del nombre del club en la portada de Inicio.">
            <input
              value={m.slogan || ''}
              maxLength={SLOGAN_MAX}
              placeholder="Ej.: Jugá bajo las luces"
              onChange={(e) => setM((x) => ({ ...x, slogan: e.target.value }))}
              className="w-full rounded-xl border border-line bg-white px-3 py-2.5 text-sm text-ink"
              data-testid="slogan"
            />
            <p className="mt-1.5 text-right text-[12px] text-muted tabular-nums">{(m.slogan || '').length}/{SLOGAN_MAX}</p>
          </Card>

          <Card title="Logo y fotos" detail="Un logo o una foto nueva pasa por revisión antes de que lo vean tus jugadores.">
            <input ref={logoInput} type="file" accept="image/png,image/webp,image/svg+xml,image/jpeg" className="hidden" onChange={(e) => { onLogo(e.target.files?.[0]); e.target.value = ''; }} data-testid="input-logo" />
            <input ref={fotoInput} type="file" accept="image/*" className="hidden" onChange={(e) => { onFoto(e.target.files?.[0]); e.target.value = ''; }} data-testid="input-foto" />
            <div className="flex items-center gap-4">
              <div
                className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl border border-line"
                style={{ backgroundImage: 'repeating-conic-gradient(#eef2f3 0% 25%, #ffffff 0% 50%)', backgroundSize: '16px 16px' }}
              >
                {m.logo ? <img src={m.logo} alt="Logo del club" className="h-16 w-16 object-contain" /> : <span className="text-[11px] text-muted">Sin logo</span>}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">Logo</p>
                <p className="text-[12.5px] text-muted">PNG con fondo transparente. Sacamos sus colores para sugerírtelos.</p>
                <div className="mt-2 flex gap-2">
                  <button type="button" onClick={() => logoInput.current?.click()} disabled={!!subiendo} className="rounded-xl border border-line bg-white px-3 py-2 text-[13px] font-semibold text-ink hover:bg-mist cursor-pointer disabled:opacity-50">
                    {subiendo === 'logo' ? 'Subiendo…' : m.logo ? 'Cambiar logo' : 'Subir logo'}
                  </button>
                  {m.logo && (
                    <button type="button" onClick={() => setM((x) => ({ ...x, logo: undefined }))} className="rounded-xl px-3 py-2 text-[13px] text-muted hover:text-ink cursor-pointer">
                      Quitar
                    </button>
                  )}
                </div>
              </div>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {FOTOS_MARCA.map((f) => {
                const url = m.fotos?.[f.id];
                return (
                  <div key={f.id} className="overflow-hidden rounded-xl border border-line" data-testid={`foto-${f.id}`}>
                    <div className="relative aspect-[16/9] bg-mist">
                      {url ? <img src={url} alt="" className="absolute inset-0 h-full w-full object-cover" /> : <span className="absolute inset-0 flex items-center justify-center text-[12px] text-muted">Foto de Armá Partido</span>}
                    </div>
                    <div className="flex items-center justify-between gap-2 px-3 py-2">
                      <div className="min-w-0">
                        <p className="text-[13px] font-semibold text-ink">{f.label}</p>
                        <p className="truncate text-[11.5px] text-muted">{f.detalle}</p>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        {url && (
                          <button type="button" onClick={() => setM((x) => ({ ...x, fotos: { ...(x.fotos || {}), [f.id]: undefined } }))} className="px-2 py-1 text-[12px] text-muted hover:text-ink cursor-pointer">
                            Quitar
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={!!subiendo}
                          onClick={() => {
                            fotoCual.current = f.id;
                            fotoInput.current?.click();
                          }}
                          className="rounded-lg border border-line bg-white px-2.5 py-1 text-[12px] font-semibold text-ink hover:bg-mist cursor-pointer disabled:opacity-50"
                        >
                          {subiendo === f.id ? 'Subiendo…' : url ? 'Cambiar' : 'Subir'}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card title="Fijos en todos los clubes" detail="No se pueden cambiar: un jugador que va a varios clubes los reconoce siempre." testId="fijos">
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-ok-bg px-3 py-1 text-[12.5px] font-semibold text-ok">Libre</span>
              <span className="rounded-full bg-busy px-3 py-1 text-[12.5px] font-semibold text-ink">Ocupado</span>
              <span className="rounded-full bg-wait-bg px-3 py-1 text-[12.5px] font-semibold text-wait">A cobrar</span>
              <span className="rounded-full bg-live-fill px-3 py-1 text-[12.5px] font-semibold text-ink">En juego</span>
              <span className="flex items-center gap-1 rounded-full bg-white px-2 py-1 text-[12.5px] font-semibold text-ink ring-1 ring-line">
                {[1, 2, 3, 4, 5, 6, 7].map((c) => <CategoryBadge key={c} category={c} size={18} />)}
                <span className="ml-1">Categorías 1ra a 7ma</span>
              </span>
              <span className="rounded-full bg-due-bg px-3 py-1 text-[12.5px] font-semibold text-due">Errores y avisos</span>
            </div>
            <p className="mt-3 text-[12.5px] text-muted">El color del texto lo elige la app según el contraste.</p>
          </Card>
        </div>

        <div className="xl:sticky xl:top-28">
          <p className="mb-3 text-center text-xs font-semibold tracking-wide text-muted uppercase">Vista previa en vivo</p>
          <VistaPrevia club={club} m={m} />
          <div className="mt-5 space-y-2">
            <button
              type="button"
              onClick={guardar}
              disabled={busy || !dirty || bloquea || !!subiendo}
              className="w-full rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-40 cursor-pointer"
              data-testid="guardar-marca"
            >
              {busy ? 'Guardando…' : !dirty ? 'Sin cambios' : vaARevision ? 'Guardar y mandar a revisión' : 'Guardar cambios'}
            </button>
            <button type="button" onClick={restablecer} className="w-full rounded-xl border border-line bg-white px-5 py-2.5 text-[13px] font-semibold text-muted hover:text-ink cursor-pointer" data-testid="restablecer">
              Restablecer los del alta
            </button>
            {dirty && vaARevision && !bloquea && <p className="text-center text-[12px] text-muted">Se revisa a mano en hasta 1 día hábil.</p>}
          </div>
        </div>
      </div>
    </div>
  );
};
