/**
 * Catálogo base de productos de un club (idea de Ber, 16/11/2026): al configurar el club, el
 * administrador tilda lo que vende y solo pone el precio. Sin precios sugeridos: cada club pone los suyos.
 * Cada producto tiene su propio ícono (Ber eligió íconos en vez de fotos, 16/11).
 */
export type CatalogGroup = 'Bebidas' | 'Cafetería' | 'Snacks y comida' | 'Pádel' | 'Alquiler';

export interface CatalogItem {
  id: string;
  name: string;
  group: CatalogGroup;
  /** Ícono de ProductIcon. */
  icon: string;
  /** Si por defecto lleva la cuenta de stock. */
  tracksStock: boolean;
}

export const CATALOG: CatalogItem[] = [
  { id: 'agua', name: 'Agua 500 ml', group: 'Bebidas', icon: 'agua', tracksStock: true },
  { id: 'agua_gas', name: 'Agua con gas', group: 'Bebidas', icon: 'agua_gas', tracksStock: true },
  { id: 'agua_15', name: 'Agua 1,5 l', group: 'Bebidas', icon: 'agua_grande', tracksStock: true },
  { id: 'isotonica', name: 'Bebida isotónica', group: 'Bebidas', icon: 'isotonica', tracksStock: true },
  { id: 'refresco', name: 'Refresco lata', group: 'Bebidas', icon: 'refresco', tracksStock: true },
  { id: 'refresco_light', name: 'Refresco sin azúcar', group: 'Bebidas', icon: 'refresco_light', tracksStock: true },
  { id: 'jugo', name: 'Jugo', group: 'Bebidas', icon: 'jugo', tracksStock: true },
  { id: 'cerveza', name: 'Cerveza lata', group: 'Bebidas', icon: 'cerveza', tracksStock: true },
  { id: 'cerveza_litro', name: 'Cerveza litro', group: 'Bebidas', icon: 'cerveza_botella', tracksStock: true },
  { id: 'energizante', name: 'Energizante', group: 'Bebidas', icon: 'energizante', tracksStock: true },
  { id: 'cafe', name: 'Café', group: 'Cafetería', icon: 'cafe', tracksStock: false },
  { id: 'cafe_leche', name: 'Café con leche', group: 'Cafetería', icon: 'cafe_leche', tracksStock: false },
  { id: 'te', name: 'Té', group: 'Cafetería', icon: 'te', tracksStock: false },
  { id: 'alfajor', name: 'Alfajor', group: 'Snacks y comida', icon: 'alfajor', tracksStock: true },
  { id: 'barrita', name: 'Barrita de cereal', group: 'Snacks y comida', icon: 'snack', tracksStock: true },
  { id: 'papitas', name: 'Papitas', group: 'Snacks y comida', icon: 'papitas', tracksStock: true },
  { id: 'chocolate', name: 'Chocolate', group: 'Snacks y comida', icon: 'chocolate', tracksStock: true },
  { id: 'fruta', name: 'Fruta', group: 'Snacks y comida', icon: 'fruta', tracksStock: true },
  { id: 'sandwich', name: 'Sándwich', group: 'Snacks y comida', icon: 'sandwich', tracksStock: true },
  { id: 'tostado', name: 'Tostado', group: 'Snacks y comida', icon: 'tostado', tracksStock: false },
  { id: 'pelotas', name: 'Tubo de pelotas', group: 'Pádel', icon: 'pelotas', tracksStock: true },
  { id: 'grip', name: 'Grip', group: 'Pádel', icon: 'grip', tracksStock: true },
  { id: 'muñequera', name: 'Muñequera', group: 'Pádel', icon: 'munequera', tracksStock: true },
  { id: 'toalla', name: 'Toalla', group: 'Pádel', icon: 'toalla', tracksStock: true },
  { id: 'protector', name: 'Protector de paleta', group: 'Pádel', icon: 'protector', tracksStock: true },
  { id: 'alq_paleta', name: 'Alquiler de paleta', group: 'Alquiler', icon: 'paleta', tracksStock: false },
  { id: 'alq_toalla', name: 'Alquiler de toalla', group: 'Alquiler', icon: 'toalla', tracksStock: false },
];

export const CATALOG_GROUPS: CatalogGroup[] = ['Bebidas', 'Cafetería', 'Snacks y comida', 'Pádel', 'Alquiler'];

/** Dónde se vende un producto: en la Cantina, en el Mostrador o en los dos. */
export type ProductPlace = 'ambos' | 'cantina' | 'mostrador';
export const soldAt = (p: { where?: ProductPlace }, place: 'cantina' | 'mostrador') => !p.where || p.where === 'ambos' || p.where === place;
