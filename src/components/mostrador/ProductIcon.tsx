import React from 'react';
import type { Product } from '../../types/caja';
import { BrandIcon } from '../BrandIcon';

// Íconos de productos de la cantina y del mostrador (pedido de Ber, 16/11/2026), mismo trazo que los
// íconos de marca. Si el producto tiene foto (por ejemplo la de la marca, por acuerdos con auspiciantes),
// se muestra la foto en su lugar.

export type ProductIconName =
  | 'agua' | 'agua_gas' | 'agua_grande' | 'isotonica' | 'cerveza' | 'cerveza_botella' | 'refresco' | 'refresco_light' | 'jugo' | 'energizante'
  | 'cafe' | 'cafe_leche' | 'te' | 'snack' | 'alfajor' | 'papitas' | 'chocolate' | 'fruta' | 'sandwich' | 'tostado'
  | 'pelotas' | 'grip' | 'munequera' | 'toalla' | 'protector' | 'paleta' | 'producto';

const PATHS: Record<Exclude<ProductIconName, 'paleta'>, React.ReactNode> = {
  agua: (<><path d="M10 2h4v3l2 3v12a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V8l2-3z" /><path d="M8 12h8" /></>),
  isotonica: (<><path d="M10 2h4v4h-4z" /><path d="M9 6h6l1 3v11a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V9z" /><path d="M8 13h8" /></>),
  cerveza: (<><path d="M5 6h10v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z" /><path d="M15 9h2a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2" /><path d="M8 10v7M12 10v7" /><path d="M5 6c0-2 2-3 5-3s5 1 5 3" /></>),
  refresco: (<><rect x="7" y="3" width="10" height="18" rx="2" /><path d="M7 7h10M7 17h10" /></>),
  snack: (<><rect x="3" y="8" width="18" height="8" rx="2" /><path d="M7 8v8M17 8v8" /></>),
  cafe: (<><path d="M4 9h12v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z" /><path d="M16 11h2a2 2 0 0 1 0 4h-2" /><path d="M8 3v3M12 3v3" /></>),
  pelotas: (<><rect x="7" y="2" width="10" height="20" rx="3" /><circle cx="12" cy="7" r="2.2" /><circle cx="12" cy="12" r="2.2" /><circle cx="12" cy="17" r="2.2" /></>),
  grip: (<><rect x="8" y="2" width="8" height="20" rx="2" /><path d="M8 8l8-3M8 13l8-3M8 18l8-3" /></>),
  toalla: (<><path d="M4 4h12v16H4z" /><path d="M16 4h2a2 2 0 0 1 2 2v10h-4" /><path d="M4 15h12" /></>),
  agua_gas: (<><path d="M10 2h4v3l2 3v12a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V8l2-3z" /><circle cx="11" cy="12" r="1" /><circle cx="13.2" cy="15.5" r="1" /><circle cx="10.8" cy="18" r=".8" /></>),
  agua_grande: (<><path d="M10.5 2h3v2.5l3.5 3.5v12.5a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 7 20.5V8l3.5-3.5z" /><path d="M7 11h10M7 16h10" /></>),
  cerveza_botella: (<><path d="M10.5 2h3v5l2 3v10.5a1.5 1.5 0 0 1-1.5 1.5h-4A1.5 1.5 0 0 1 8.5 20.5V10l2-3z" /><path d="M8.5 13h7v5h-7z" /></>),
  refresco_light: (<><rect x="7" y="3" width="10" height="18" rx="2" /><path d="M7 7h10M7 17h10" /><ellipse cx="12" cy="12" rx="1.6" ry="2.2" /></>),
  jugo: (<><path d="M8 7h8l-1 14H9z" /><path d="M8.5 12h7" /><path d="M13 7l2-5h2" /></>),
  energizante: (<><rect x="8" y="2" width="8" height="20" rx="2" /><path d="M12.8 7 10.5 12h3l-2.3 5" /></>),
  cafe_leche: (<><path d="M3 8h13v7a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5z" /><path d="M16 10h2a2.5 2.5 0 0 1 0 5h-2" /><path d="M3 11c2.5 1.5 5 1.5 6.5 0s4-1.5 6.5 0" /><path d="M2 22h17" /></>),
  te: (<><path d="M3 10h12v4a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5z" /><path d="M15 11.5h1.5a2 2 0 0 1 0 4H15" /><path d="M10 10c0-3 2-5.5 6-6" /><rect x="15.5" y="4" width="4" height="4.5" rx=".8" /><path d="M2 22h15" /></>),
  alfajor: (<><ellipse cx="12" cy="9" rx="8" ry="3" /><path d="M4 9v5c0 1.7 3.6 3 8 3s8-1.3 8-3V9" /><path d="M4 11.5c0 1.7 3.6 3 8 3s8-1.3 8-3" /></>),
  papitas: (<><path d="M6 4l2 1.5L10 4l2 1.5L14 4l2 1.5L18 4l-1 16H7z" /><path d="M9.5 11c1-1.5 4-1.5 5 0s-1 4-2.5 4-3.5-2.5-2.5-4z" /></>),
  chocolate: (<><rect x="6" y="3" width="12" height="18" rx="1.5" /><path d="M6 9h12M6 15h12M12 3v18" /></>),
  fruta: (<><path d="M12 8c-3-2-8-1-8 5 0 4 3 8 5.5 8 1 0 1.5-.5 2.5-.5s1.5.5 2.5.5C17 21 20 17 20 13c0-6-5-7-8-5z" /><path d="M12 8V5" /><path d="M12 5c1-2 3-2.5 4-2-.5 1.5-2 2.5-4 2" /></>),
  sandwich: (<><path d="M3 12 12 4l9 8z" /><path d="M3 12h18" /><path d="M4 15h16" /><path d="M3.5 18h17" /></>),
  tostado: (<><path d="M3 19 12 5l9 14z" /><path d="M12 5v14" /><path d="M5.5 15.5h4M14.5 15.5h4" /></>),
  munequera: (<><ellipse cx="12" cy="8" rx="7" ry="3" /><path d="M5 8v8c0 1.7 3.1 3 7 3s7-1.3 7-3V8" /><path d="M8.5 12.5v4M12 13v4.5M15.5 12.5v4" /></>),
  protector: (<><path d="M12 2a6.5 6.5 0 0 1 6.5 6.5c0 3.9-2.9 6.5-6.5 6.5s-6.5-2.6-6.5-6.5A6.5 6.5 0 0 1 12 2z" /><path d="M12 15v7" /><path d="M5.9 6.2a6.5 6.5 0 0 1 12.2 0" strokeWidth={4} /></>),
  producto: (<><path d="M5 8h14l-1 12H6z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></>),
};

const RULES: [RegExp, ProductIconName][] = [
  [/gatorade|powerade|isot[oó]nic|sport/i, 'isotonica'],
  [/agua.*gas/i, 'agua_gas'],
  [/agua.*(1[,.]5|litro|2 ?l)/i, 'agua_grande'],
  [/agua/i, 'agua'],
  [/cerveza.*(litro|botella)/i, 'cerveza_botella'],
  [/cerveza|birra|chopp/i, 'cerveza'],
  [/energ|monster|red ?bull|speed/i, 'energizante'],
  [/jugo|limonada/i, 'jugo'],
  [/(sin az[uú]car|light|zero)/i, 'refresco_light'],
  [/coca|pepsi|refresco|gaseosa|soda|lata/i, 'refresco'],
  [/caf[eé].*leche|cortado|capuch/i, 'cafe_leche'],
  [/\bt[eé]\b|infusi/i, 'te'],
  [/caf[eé]|mate/i, 'cafe'],
  [/alfajor/i, 'alfajor'],
  [/papa|chips|nacho/i, 'papitas'],
  [/chocolate|bomb[oó]n/i, 'chocolate'],
  [/fruta|banana|manzana/i, 'fruta'],
  [/tostado|tostad/i, 'tostado'],
  [/s[aá]ndwich|refuerzo|wrap/i, 'sandwich'],
  [/barr|snack|galleti|turr[oó]n/i, 'snack'],
  [/pelota/i, 'pelotas'],
  [/grip|cubregrip|overgrip/i, 'grip'],
  [/mu[ñn]equera/i, 'munequera'],
  [/protector|cinta/i, 'protector'],
  [/toalla/i, 'toalla'],
  [/paleta/i, 'paleta'],
];

/** Ícono que corresponde a un producto: el que eligió el club, o uno deducido del nombre. */
export function iconForProduct(p: Pick<Product, 'name'> & { icon?: string }): ProductIconName {
  if (p.icon && (p.icon in PATHS || p.icon === 'paleta')) return p.icon as ProductIconName;
  return RULES.find(([re]) => re.test(p.name))?.[1] ?? 'producto';
}

export const ProductIcon: React.FC<{ product: Pick<Product, 'name'> & { icon?: string; photoUrl?: string }; size?: number; className?: string }> = ({ product, size = 32, className = '' }) => {
  const icon = iconForProduct(product);
  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center overflow-hidden bg-white text-brand ${className}`}
      style={{ width: size, height: size, borderRadius: Math.min(12, Math.round(size * 0.28)) }}
    >
      {product.photoUrl ? (
        <img src={product.photoUrl} alt="" className="h-full w-full object-cover" />
      ) : icon === 'paleta' ? (
        <BrandIcon name="paleta" size={Math.round(size * 0.6)} />
      ) : (
        <svg viewBox="0 0 24 24" width={Math.round(size * 0.6)} height={Math.round(size * 0.6)} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          {PATHS[icon]}
        </svg>
      )}
    </span>
  );
};
