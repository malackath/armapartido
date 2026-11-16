/**
 * Catálogo base de productos de un club (idea de Ber, 16/11/2026): al configurar el club, el
 * administrador tilda lo que vende y solo pone el precio. Sin precios sugeridos: cada club pone los suyos.
 * Cada producto trae un prompt para generar su foto en Flow (lo hace Ber; ver project files cantina/).
 */
export type CatalogGroup = 'Bebidas' | 'Cafetería' | 'Snacks y comida' | 'Pádel' | 'Alquiler';

export interface CatalogItem {
  id: string;
  name: string;
  group: CatalogGroup;
  /** Ícono de ProductIcon hasta que haya foto. */
  icon: string;
  /** Si por defecto lleva la cuenta de stock. */
  tracksStock: boolean;
  /** Prompt para la foto en Flow (fondo liso claro, producto genérico, sin marcas). */
  flow: string;
}

const P = (what: string) =>
  `Foto de producto, ${what}, sin marcas ni logos ni texto, centrado sobre fondo liso color celeste muy claro (#E8F5F5), luz suave de estudio, sombra corta, vista frontal levemente desde arriba, formato 4:3, estilo catálogo limpio y realista.`;

export const CATALOG: CatalogItem[] = [
  { id: 'agua', name: 'Agua 500 ml', group: 'Bebidas', icon: 'agua', tracksStock: true, flow: P('una botella de agua mineral sin gas de 500 ml, plástico transparente, tapa azul') },
  { id: 'agua_gas', name: 'Agua con gas', group: 'Bebidas', icon: 'agua', tracksStock: true, flow: P('una botella de agua con gas de 500 ml, plástico transparente con burbujas, tapa verde') },
  { id: 'agua_15', name: 'Agua 1,5 l', group: 'Bebidas', icon: 'agua', tracksStock: true, flow: P('una botella de agua mineral de 1,5 litros, plástico transparente') },
  { id: 'isotonica', name: 'Bebida isotónica', group: 'Bebidas', icon: 'isotonica', tracksStock: true, flow: P('una botella de bebida deportiva isotónica de 500 ml, líquido celeste, etiqueta lisa sin texto') },
  { id: 'refresco', name: 'Refresco lata', group: 'Bebidas', icon: 'refresco', tracksStock: true, flow: P('una lata de refresco de 354 ml, color rojo liso sin marca, gotas de frío') },
  { id: 'refresco_light', name: 'Refresco sin azúcar', group: 'Bebidas', icon: 'refresco', tracksStock: true, flow: P('una lata de refresco sin azúcar de 354 ml, color plateado liso sin marca, gotas de frío') },
  { id: 'jugo', name: 'Jugo', group: 'Bebidas', icon: 'refresco', tracksStock: true, flow: P('una botellita de jugo de naranja de 300 ml, etiqueta lisa sin texto') },
  { id: 'cerveza', name: 'Cerveza lata', group: 'Bebidas', icon: 'cerveza', tracksStock: true, flow: P('una lata de cerveza de 473 ml, color dorado liso sin marca, gotas de frío') },
  { id: 'cerveza_litro', name: 'Cerveza litro', group: 'Bebidas', icon: 'cerveza', tracksStock: true, flow: P('una botella de vidrio ámbar de cerveza de 1 litro, etiqueta lisa sin texto') },
  { id: 'energizante', name: 'Energizante', group: 'Bebidas', icon: 'refresco', tracksStock: true, flow: P('una lata alta y fina de bebida energizante de 250 ml, color azul liso sin marca') },
  { id: 'cafe', name: 'Café', group: 'Cafetería', icon: 'cafe', tracksStock: false, flow: P('una taza blanca de café espresso con platito') },
  { id: 'cafe_leche', name: 'Café con leche', group: 'Cafetería', icon: 'cafe', tracksStock: false, flow: P('una taza blanca grande de café con leche con espuma') },
  { id: 'te', name: 'Té', group: 'Cafetería', icon: 'cafe', tracksStock: false, flow: P('una taza blanca de té con el hilo del saquito colgando') },
  { id: 'alfajor', name: 'Alfajor', group: 'Snacks y comida', icon: 'snack', tracksStock: true, flow: P('un alfajor de chocolate en envoltorio liso plateado sin marca') },
  { id: 'barrita', name: 'Barrita de cereal', group: 'Snacks y comida', icon: 'snack', tracksStock: true, flow: P('una barrita de cereal en envoltorio liso verde claro sin marca') },
  { id: 'papitas', name: 'Papitas', group: 'Snacks y comida', icon: 'snack', tracksStock: true, flow: P('un paquete chico de papas fritas, bolsa lisa amarilla sin marca') },
  { id: 'chocolate', name: 'Chocolate', group: 'Snacks y comida', icon: 'snack', tracksStock: true, flow: P('una barra de chocolate en envoltorio liso azul oscuro sin marca') },
  { id: 'fruta', name: 'Fruta', group: 'Snacks y comida', icon: 'snack', tracksStock: true, flow: P('una banana y una manzana roja juntas') },
  { id: 'sandwich', name: 'Sándwich', group: 'Snacks y comida', icon: 'snack', tracksStock: true, flow: P('un sándwich de jamón y queso en pan de miga, cortado en triángulo, en un envoltorio transparente') },
  { id: 'tostado', name: 'Tostado', group: 'Snacks y comida', icon: 'snack', tracksStock: false, flow: P('un tostado de jamón y queso dorado cortado al medio sobre un plato blanco') },
  { id: 'pelotas', name: 'Tubo de pelotas', group: 'Pádel', icon: 'pelotas', tracksStock: true, flow: P('un tubo transparente con tres pelotas de pádel amarillas, tapa blanca, sin marca') },
  { id: 'grip', name: 'Grip', group: 'Pádel', icon: 'grip', tracksStock: true, flow: P('un overgrip de paleta de pádel enrollado, color blanco, sin marca') },
  { id: 'muñequera', name: 'Muñequera', group: 'Pádel', icon: 'toalla', tracksStock: true, flow: P('una muñequera deportiva de toalla color turquesa, sin marca') },
  { id: 'toalla', name: 'Toalla', group: 'Pádel', icon: 'toalla', tracksStock: true, flow: P('una toalla deportiva chica doblada, color turquesa, sin marca') },
  { id: 'protector', name: 'Protector de paleta', group: 'Pádel', icon: 'paleta', tracksStock: true, flow: P('una cinta protectora transparente para el borde de una paleta de pádel, enrollada') },
  { id: 'alq_paleta', name: 'Alquiler de paleta', group: 'Alquiler', icon: 'paleta', tracksStock: false, flow: P('una paleta de pádel negra y turquesa genérica sin marca, apoyada en diagonal') },
  { id: 'alq_toalla', name: 'Alquiler de toalla', group: 'Alquiler', icon: 'toalla', tracksStock: false, flow: P('una toalla blanca doblada con una etiqueta de cartón en blanco') },
];

export const CATALOG_GROUPS: CatalogGroup[] = ['Bebidas', 'Cafetería', 'Snacks y comida', 'Pádel', 'Alquiler'];

/** Dónde se vende un producto: en la Cantina, en el Mostrador o en los dos. */
export type ProductPlace = 'ambos' | 'cantina' | 'mostrador';
export const soldAt = (p: { where?: ProductPlace }, place: 'cantina' | 'mostrador') => !p.where || p.where === 'ambos' || p.where === place;
