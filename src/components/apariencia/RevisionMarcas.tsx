/**
 * Plataforma → "Marcas de los clubes" (decisión 7: revisión a mano, hasta 1 día hábil).
 * El equipo ve la marca en revisión de cada club, la aprueba o pide un cambio, y marca el paquete
 * (Imagen completa o básico). Solo con Imagen completa la app del jugador usa la marca.
 */
import React, { useState } from 'react';
import type { Club, MarcaDatos } from '../../types/padel';
import { revisarColores } from '../../lib/marcaColores';
import { cambiarPaquete, revisarMarca } from '../../services/marcaService';

const MOTIVO: Record<string, string> = { primera: 'Primera marca', imagenes: 'Logo o fotos nuevas', colores: 'Colores con aviso' };

const Muestra: React.FC<{ m: MarcaDatos }> = ({ m }) => (
  <div className="flex flex-wrap items-center gap-3">
    {m.logo ? <img src={m.logo} alt="" className="h-12 w-12 rounded-lg bg-[#eef2f3] object-contain p-1" /> : <span className="text-xs text-slate-500">Sin logo</span>}
    {(['principal', 'acento', 'fondo'] as const).map((k) => (
      <span key={k} className="flex items-center gap-1.5 text-xs text-slate-600">
        <span className="h-6 w-6 rounded-full ring-1 ring-slate-300" style={{ backgroundColor: m.colores[k] }} />
        {k}
      </span>
    ))}
    {m.fuentes?.titulos && <span className="text-xs text-slate-600">Letras: {m.fuentes.titulos} / {m.fuentes.texto || 'Outfit'}</span>}
    {m.slogan && <span className="text-xs italic text-slate-600">“{m.slogan}”</span>}
    {m.fotos && Object.values(m.fotos).filter(Boolean).map((u) => <img key={u} src={u} alt="" className="h-12 w-20 rounded-md object-cover" />)}
  </div>
);

export const RevisionMarcas: React.FC<{ clubs: Club[]; onToast: (msg: string) => void }> = ({ clubs, onToast }) => {
  const [busy, setBusy] = useState('');
  const [nota, setNota] = useState<Record<string, string>>({});
  const run = async (id: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(id);
    try {
      await fn();
      onToast(ok);
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'No se pudo.');
    } finally {
      setBusy('');
    }
  };
  const pendientes = clubs.filter((c) => c.marcaPendiente).length;
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6" data-testid="revision-marcas">
      <h2 className="font-display text-lg font-bold text-slate-900">Marcas de los clubes</h2>
      <p className="mt-1 text-xs text-slate-500">
        {pendientes ? `${pendientes} para revisar.` : 'Nada para revisar.'} La app del jugador usa la marca del club solo con Imagen completa y la marca aprobada.
      </p>
      <div className="mt-4 divide-y divide-slate-100">
        {clubs.map((c) => {
          const p = c.marcaPendiente;
          const avisos = p ? revisarColores(p.colores).filter((a) => a.nivel !== 'ok') : [];
          return (
            <div key={c.id} className="space-y-3 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-slate-900">{c.name}</p>
                  <p className="text-xs text-slate-500">
                    {c.marca ? `Marca publicada (versión ${c.marca.version})` : 'Sin marca publicada'}
                    {p ? ` · En revisión: ${MOTIVO[p.motivo]}` : ''}
                  </p>
                </div>
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                  Imagen completa
                  <input
                    type="checkbox"
                    checked={c.paquete === 'completo'}
                    disabled={busy === c.id}
                    onChange={(e) => run(c.id, () => cambiarPaquete(c.id, e.target.checked ? 'completo' : 'basico'), e.target.checked ? `${c.name}: Imagen completa activada.` : `${c.name}: vuelve a la instalación básica.`)}
                    className="h-4 w-4 cursor-pointer"
                    data-testid={`paquete-${c.id}`}
                  />
                </label>
              </div>
              {p && (
                <div className="rounded-xl bg-slate-50 p-4">
                  <Muestra m={p} />
                  {avisos.map((a) => (
                    <p key={a.texto} className="mt-2 text-xs text-[#7c2d12]">{a.texto}</p>
                  ))}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={busy === c.id}
                      onClick={() => run(c.id, () => revisarMarca(c.id, true), `Marca de ${c.name} aprobada y publicada.`)}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 cursor-pointer disabled:opacity-50"
                      data-testid={`aprobar-${c.id}`}
                    >
                      Aprobar y publicar
                    </button>
                    <input
                      value={nota[c.id] || ''}
                      onChange={(e) => setNota((n) => ({ ...n, [c.id]: e.target.value }))}
                      placeholder="Qué tiene que cambiar"
                      className="min-w-[200px] flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs"
                    />
                    <button
                      type="button"
                      disabled={busy === c.id || !(nota[c.id] || '').trim()}
                      onClick={() => run(c.id, () => revisarMarca(c.id, false, nota[c.id]), `Le pedimos el cambio a ${c.name}.`)}
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer disabled:opacity-50"
                    >
                      Pedir cambio
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
};
