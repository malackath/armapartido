/**
 * Planilla de ejemplo para "Importar planilla" (Admin → Clientes): datos ficticios, con los problemas
 * típicos de un export real (repetidos, celulares escritos de mil formas, nivel con decimales, filas sin datos).
 * Sirve para la demo de venta y como modelo para el club.
 */
const NOMBRES = [
  'Agustín', 'Valentina', 'Joaquín', 'Camila', 'Facundo', 'Lucía', 'Matías', 'Florencia', 'Nicolás', 'Sofía',
  'Santiago', 'Martina', 'Federico', 'Micaela', 'Gonzalo', 'Carolina', 'Rodrigo', 'Paula', 'Ignacio', 'Natalia',
  'Sebastián', 'Victoria', 'Emiliano', 'Belén', 'Diego', 'Josefina', 'Bruno', 'Antonella', 'Tomás', 'Mariana',
];
const APELLIDOS = [
  'Pereira', 'Rodríguez', 'González', 'Fernández', 'López', 'Martínez', 'Sosa', 'Silva', 'Díaz', 'Suárez',
  'Benítez', 'Acosta', 'Ramos', 'Núñez', 'Méndez', 'Cabrera', 'Olivera', 'Techera', 'Castro', 'Vázquez',
  'Morales', 'Ferreira', 'Giménez', 'Correa', 'Romero', 'Viera', 'Píriz', 'Bentancor', 'Larrosa', 'Machado',
];
const CATS = ['5ta', '6', 'quinta', '4ta', '7ma', '3.5', '6ta', '', '5', '4'];
const FIJOS: [string, string, string][] = [
  ['martes', '20:00', 'Cancha 1'],
  ['jueves', '19:30', '2'],
  ['lunes', '21:00', 'Cancha 3'],
  ['miércoles', '18:00', 'Cancha 4'],
  ['sábado', '10:00', 'Cancha 9'], // cancha que no existe: se carga la ficha, el turno fijo no
];

const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export function samplePlanillaCsv(): string {
  const rows: string[][] = [['Nombre', 'Apellido', 'Celular', 'Mail', 'Categoría', 'Turno fijo día', 'Turno fijo hora', 'Turno fijo cancha', 'Notas']];
  for (let i = 0; i < 30; i++) {
    const n = NOMBRES[i];
    const a = APELLIDOS[(i * 7) % 30];
    const num = String(91000000 + i * 104729).slice(0, 8);
    const formats = [`0${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`, `+598 ${num}`, `0${num}`, `${num.slice(0, 2)}-${num.slice(2, 5)}-${num.slice(5)}`];
    const phone = i % 9 === 4 ? '' : formats[i % 4];
    const mail = i % 5 === 3 ? '' : `${fold(n)}.${fold(a)}@ejemplo.com`;
    const fijo = i % 6 === 1 ? FIJOS[(i / 6) | 0] : ['', '', ''];
    rows.push([n, a, phone, mail, CATS[i % CATS.length], ...fijo, i === 2 ? 'Prefiere mañana' : '']);
  }
  // Problemas típicos de un export: el mismo jugador dos veces y una fila sin mail ni celular.
  rows.push([NOMBRES[0], APELLIDOS[0], rows[1][2], rows[1][3].toUpperCase(), '5ta', '', '', '', '']);
  rows.push(['Pablo', 'Rivero', '', '', '6ta', '', '', '', 'Sin datos de contacto']);
  const esc = (c: string) => (/[;"\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c);
  return rows.map((r) => r.map(esc).join(';')).join('\r\n');
}
