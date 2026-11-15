// Generado desde design/marca/iconos (set propio de Armá Partido). No editar a mano.
import React from 'react';

const PATHS: Record<string, string> = {
  'armar-partido': `<circle cx="7" cy="7" r="3"/><circle cx="17" cy="7" r="3"/><circle cx="7" cy="17" r="3"/><circle cx="17" cy="17" r="3" stroke-dasharray="2.4 2.4"/>`,
  'cancha': `<rect x="5" y="2" width="14" height="20" rx="1"/><path d="M5 12h14M12 5.5v13M5 5.5h14M5 18.5h14"/>`,
  'categoria': `<path d="M4 20h4v-5H4zM10 20h4V10h-4zM16 20h4V4h-4z"/>`,
  'compartir': `<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>`,
  'cristal': `<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 8l3-3M8 13l8-8M13 19l6-6"/>`,
  'descubierta': `<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>`,
  'falta-uno': `<circle cx="9" cy="8" r="4"/><path d="M2 21c1.4-4 4-6 7-6 1.5 0 2.9.5 4 1.4"/><path d="M19 14v6M16 17h6"/>`,
  'horario': `<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>`,
  'inicio': `<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9v11h14V9"/><path d="M10 20v-6h4v6"/>`,
  'luz': `<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>`,
  'muro': `<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v6M15 9v6M9 15v6"/>`,
  'notificaciones': `<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/>`,
  'pago-en-club': `<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 9.5v5M18 9.5v5"/>`,
  'pago-online': `<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>`,
  'paleta': `<circle cx="13.5" cy="9.5" r="6.5"/><path d="M9 14.5 3.5 20.5"/><path d="M11.5 7.5h.01M15.5 7.5h.01M11.5 11.5h.01M15.5 11.5h.01"/>`,
  'pareja': `<circle cx="8.5" cy="8" r="3"/><circle cx="16" cy="9" r="2.5"/><path d="M2.5 20c1-3.5 3.3-5.5 6-5.5s5 2 6 5.5"/><path d="M15 14.5c2.6-.3 5 1.4 6.5 5"/>`,
  'perfil': `<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>`,
  'reservar': `<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/><path d="m9 15 2 2 4-4"/>`,
  'resultado': `<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M12 5v14"/><path d="M6 10h2v4M15.5 10h2.5l-2.5 4h2.5"/>`,
  'techada': `<path d="M2 11c3-5 6.5-7 10-7s7 2 10 7"/><rect x="5" y="11" width="14" height="10" rx="1"/><path d="M5 16h14"/>`,
  'torneos': `<path d="M8 21h8M12 16v5M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3"/>`,
  'ubicacion': `<path d="M12 21s-7-6.3-7-12a7 7 0 0 1 14 0c0 5.7-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/>`,
};

export type BrandIconName = 'armar-partido' | 'cancha' | 'categoria' | 'compartir' | 'cristal' | 'descubierta' | 'falta-uno' | 'horario' | 'inicio' | 'luz' | 'muro' | 'notificaciones' | 'pago-en-club' | 'pago-online' | 'paleta' | 'pareja' | 'perfil' | 'reservar' | 'resultado' | 'techada' | 'torneos' | 'ubicacion';

interface BrandIconProps {
  name: BrandIconName;
  size?: number;
  className?: string;
  strokeWidth?: number;
}

export const BrandIcon: React.FC<BrandIconProps> = ({ name, size = 22, className, strokeWidth = 2 }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className={className}
    dangerouslySetInnerHTML={{ __html: PATHS[name] }}
  />
);
