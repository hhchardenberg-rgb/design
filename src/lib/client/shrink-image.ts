/**
 * Verkleint een foto in de browser vóór het uploaden. Serverfuncties van
 * Vercel nemen maximaal 4,5 MB per verzoek aan; een telefoonfoto is vaak
 * groter. De server verkleint toch al tot maximaal 3000 px, dus hier
 * gebeurt hetzelfde eerder. Kleine bestanden blijven ongemoeid.
 */
const SAFE_BYTES = 3.5 * 1024 * 1024;

export async function shrinkImageForUpload(file: File, maxDimension = 3000): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || typeof createImageBitmap !== "function") return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return file;
  }
  const largest = Math.max(bitmap.width, bitmap.height);
  if (file.size <= SAFE_BYTES && largest <= maxDimension) {
    bitmap.close();
    return file;
  }

  const ratio = Math.min(1, maxDimension / largest);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * ratio);
  canvas.height = Math.round(bitmap.height * ratio);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return file;
  }
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  // PNG en WebP kunnen transparant zijn (logo's): die blijven doorzichtig
  // via WebP; foto's worden JPEG.
  const keepAlpha = file.type !== "image/jpeg";
  const type = keepAlpha ? "image/webp" : "image/jpeg";
  const base = file.name.replace(/\.[^.]+$/, "");
  for (const quality of [0.9, 0.82, 0.72, 0.6]) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
    if (!blob) break;
    if (blob.size <= SAFE_BYTES || quality === 0.6) {
      // Safari maakt geen WebP en geeft dan PNG terug.
      const actual = blob.type || type;
      const ext = actual === "image/jpeg" ? "jpg" : actual.split("/")[1];
      return new File([blob], `${base}.${ext}`, { type: actual });
    }
  }
  return file;
}
