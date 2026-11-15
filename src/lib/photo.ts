/**
 * Achica una foto en el celular antes de subirla: recorte cuadrado al centro,
 * 320 x 320 px, WebP. Queda en unos 15 a 40 KB, así el almacenamiento es casi gratis.
 */
export async function squareWebp(file: File, size = 320, quality = 0.82): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo preparar la foto.');
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, size, size);
  bitmap.close?.();
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/webp', quality));
  if (!blob) throw new Error('Este navegador no pudo convertir la foto.');
  return blob;
}
