import React, { useState } from 'react';
import { Download, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../lib/pwa';

interface PWAInstallButtonProps {
  compact?: boolean;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ compact = false }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) return null;

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 whitespace-nowrap shrink-0 cursor-pointer"
      >
        <Download className="h-3.5 w-3.5" />
        {compact ? 'Instalar' : 'Instalar App'}
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setShowGuide(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0 cursor-pointer"
        title="Instalar en el celular"
      >
        <Smartphone className="h-3.5 w-3.5 text-emerald-600" />
        {compact ? 'App' : 'Instalar App'}
      </button>

      {showGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-display text-lg font-bold text-slate-900">
                  Instalá la app en tu celular
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  Accedé directo desde tu pantalla de inicio y recibí avisos push de partidos y torneos sin pasar por tiendas.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {isIOS ? (
              <ol className="mt-4 space-y-2.5 rounded-xl bg-slate-50 p-4 text-sm text-slate-700">
                <li>1. Tocá el botón Compartir en la barra inferior de Safari.</li>
                <li>2. Deslizá y elegí Agregar a pantalla de inicio.</li>
                <li>3. Confirmá con Agregar para instalar el acceso directo.</li>
              </ol>
            ) : (
              <ol className="mt-4 space-y-2.5 rounded-xl bg-slate-50 p-4 text-sm text-slate-700">
                <li>1. Abrí el menú de tu navegador (tres puntos arriba a la derecha).</li>
                <li>2. Seleccioná Instalar aplicación o Agregar a pantalla principal.</li>
                <li>3. Aceptá la instalación para recibir notificaciones push en el celular.</li>
              </ol>
            )}

            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="mt-5 w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 cursor-pointer"
            >
              Entendido
            </button>
          </div>
        </div>
      )}
    </>
  );
};
