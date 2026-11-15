import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Download, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../lib/pwa';

interface PWAInstallButtonProps {
  compact?: boolean;
  /** Abre la guía de instalación (el modal vive fuera del menú para que no se corte). */
  onShowGuide: () => void;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ compact = false, onShowGuide }) => {
  const { isInstallable, isInstalled, install } = usePWAInstall();

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
    <button
      type="button"
      onClick={onShowGuide}
      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0 cursor-pointer"
      title="Instalar la app"
    >
      <Smartphone className="h-3.5 w-3.5 text-emerald-600" />
      {compact ? 'Instalar la app' : 'Instalar App'}
    </button>
  );
};

interface InstallGuideModalProps {
  open: boolean;
  onClose: () => void;
}

/** Guía para instalar la app. Se dibuja sobre <body> para quedar centrada en cualquier pantalla. */
export const InstallGuideModal: React.FC<InstallGuideModalProps> = ({ open, onClose }) => {
  const { isIOS } = usePWAInstall();
  const closeRef = useRef<HTMLButtonElement>(null);
  const isPhone = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  const steps = isIOS
    ? [
        'Tocá el botón Compartir en la barra de Safari.',
        'Deslizá y elegí Agregar a pantalla de inicio.',
        'Confirmá con Agregar.',
      ]
    : isPhone
      ? [
          'Abrí el menú del navegador (los tres puntos arriba a la derecha).',
          'Elegí Instalar aplicación o Agregar a pantalla principal.',
          'Aceptá, y la app queda en tu pantalla de inicio con sus avisos.',
        ]
      : [
          'En Chrome o Edge, tocá el ícono de instalar a la derecha de la barra de direcciones.',
          'Si no aparece, abrí el menú del navegador y elegí Instalar Armá Partido.',
          `Para el celular, abrí ${window.location.host} desde el teléfono y seguí los mismos pasos.`,
        ];

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="install-guide-title"
        className="flex max-h-[calc(100dvh-2rem)] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
      >
        <div className="flex items-start justify-between gap-4 px-6 pt-6">
          <div>
            <h3 id="install-guide-title" className="font-display text-lg font-bold text-slate-900">
              {isPhone || isIOS ? 'Instalá la app en tu celular' : 'Instalá la app'}
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              Entrás directo desde tu pantalla de inicio y recibís avisos de partidos y torneos, sin pasar por tiendas.
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <ol className="mx-6 mt-4 space-y-2.5 overflow-y-auto rounded-xl bg-slate-50 p-4 text-sm text-slate-700">
          {steps.map((s, i) => (
            <li key={i}>
              {i + 1}. {s}
            </li>
          ))}
        </ol>

        <div className="px-6 pb-6 pt-5">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 cursor-pointer"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
