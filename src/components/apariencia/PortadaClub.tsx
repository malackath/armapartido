import React from 'react';
import type { MarcaClub } from '../../lib/marcaClub';

/**
 * Portada de Inicio para clubes con Imagen completa (wireframe Jugador B): foto del club,
 * logo, nombre y slogan. Sin foto, un fondo con el color principal. La usan Inicio y la vista previa del panel.
 */
export const PortadaClub: React.FC<{ marca: Pick<MarcaClub, 'nombre' | 'logo' | 'slogan' | 'fotos'>; compacta?: boolean }> = ({ marca, compacta }) => {
  const foto = marca.fotos?.portada;
  return (
    <section
      className={`relative overflow-hidden rounded-2xl bg-brand text-white ${compacta ? 'min-h-[118px]' : 'min-h-[150px] sm:min-h-[180px]'}`}
      data-testid="portada-club"
    >
      {foto && <img src={foto} alt="" className="absolute inset-0 h-full w-full object-cover" />}
      <div className={`absolute inset-0 ${foto ? 'bg-gradient-to-t from-[#0b0f14]/85 via-[#0b0f14]/40 to-transparent' : 'bg-gradient-to-br from-white/0 to-black/25'}`} />
      <div className={`relative flex h-full items-end gap-3 ${compacta ? 'min-h-[118px] p-3.5' : 'min-h-[150px] p-5 sm:min-h-[180px] sm:p-6'}`}>
        {marca.logo && <img src={marca.logo} alt="" className={`${compacta ? 'h-11 w-11' : 'h-14 w-14 sm:h-16 sm:w-16'} shrink-0 object-contain drop-shadow`} />}
        <div className="min-w-0">
          <p className={`font-display font-bold leading-tight ${compacta ? 'text-[17px]' : 'text-2xl sm:text-3xl'}`}>{marca.nombre}</p>
          {marca.slogan && <p className={`mt-0.5 text-white/85 ${compacta ? 'text-[12px]' : 'text-sm sm:text-base'}`}>{marca.slogan}</p>}
        </div>
      </div>
    </section>
  );
};
