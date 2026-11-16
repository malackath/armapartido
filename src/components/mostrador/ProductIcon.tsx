import React from 'react';
import type { Product } from '../../types/caja';
import { BrandIcon } from '../BrandIcon';

// Íconos de productos de la cantina y del mostrador (pedido de Ber, 16/11/2026), mismo trazo que los
// íconos de marca. Si el producto tiene foto (por ejemplo la de la marca, por acuerdos con auspiciantes),
// se muestra la foto en su lugar.

export type ProductIconName =
  | 'agua' | 'isotonica' | 'cerveza' | 'refresco' | 'snack' | 'cafe' | 'pelotas' | 'grip' | 'toalla' | 'paleta' | 'producto';

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
  producto: (<><path d="M5 8h14l-1 12H6z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></>),
};

const RULES: [RegExp, ProductIconName][] = [
  [/gatorade|powerade|isot[oó]nic|sport/i, 'isotonica'],
  [/agua/i, 'agua'],
  [/cerveza|birra|chopp/i, 'cerveza'],
  [/coca|pepsi|refresco|gaseosa|soda|jugo|lata/i, 'refresco'],
  [/caf[eé]|t[eé]\b|mate/i, 'cafe'],
  [/barr|alfajor|snack|galleti|chocolate|turr[oó]n/i, 'snack'],
  [/pelota/i, 'pelotas'],
  [/grip|cubregrip|overgrip/i, 'grip'],
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
