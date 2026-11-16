import React, { useEffect, useState } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';

/** Pantalla completa (pedido de Ber, 16/11/2026): el club deja el Mostrador abierto en el monitor. Sale con el mismo botón o con Esc. */
export const FullscreenButton: React.FC = () => {
  const [on, setOn] = useState(() => typeof document !== 'undefined' && !!document.fullscreenElement);
  useEffect(() => {
    const f = () => setOn(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', f);
    return () => document.removeEventListener('fullscreenchange', f);
  }, []);
  if (typeof document === 'undefined' || !document.fullscreenEnabled) return null;
  const toggle = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen().catch(() => {});
  };
  return (
    <button
      type="button"
      onClick={toggle}
      title={on ? 'Salir de pantalla completa (Esc)' : 'Pantalla completa'}
      aria-pressed={on}
      className="hidden items-center justify-center gap-2 rounded-xl border border-line bg-white px-3.5 py-3 text-sm font-semibold text-ink hover:bg-mist cursor-pointer md:inline-flex"
    >
      {on ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
      <span className="hidden 2xl:inline">{on ? 'Salir' : 'Pantalla completa'}</span>
    </button>
  );
};
