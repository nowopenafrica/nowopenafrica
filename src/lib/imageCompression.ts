// Client-side image compression — resizes to a sensible max dimension and
// re-encodes with the best format the browser supports (WebP, ~25–35% smaller
// than JPEG at the same visual quality; JPEG fallback for older Safari) before
// upload. Photos/logos/products/gallery images hit Supabase Storage — and every
// visitor's browser — much smaller with no visible quality hit. No new
// dependency: canvas + createImageBitmap are natively supported everywhere.

const MAX_DIMENSION = 1600; // long edge, in px — plenty for full-bleed cover images
const QUALITY = 0.82; // high quality, meaningfully smaller than source
const SKIP_BELOW_BYTES = 120 * 1024; // already small — recompressing rarely helps

const canvasToBlob = (canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> =>
  new Promise((resolve) => canvas.toBlob(resolve, type, quality));

export async function compressImage(file: File): Promise<File> {
  // Leave vector/animated/tiny files alone — re-rasterising them loses more
  // than it saves (SVG stays crisp; GIF would lose animation).
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml' || file.type === 'image/gif') return file;
  if (file.size < SKIP_BELOW_BYTES) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    // Encode WebP first (best ratio); fall back to JPEG when the browser
    // can't produce WebP (it returns a non-webp blob or null). Keep whichever
    // is actually smaller.
    const webp = await canvasToBlob(canvas, 'image/webp', QUALITY);
    const jpeg = await canvasToBlob(canvas, 'image/jpeg', QUALITY);

    const candidates: { blob: Blob; ext: string; type: string }[] = [];
    if (webp && webp.type === 'image/webp') candidates.push({ blob: webp, ext: 'webp', type: 'image/webp' });
    if (jpeg && jpeg.type === 'image/jpeg') candidates.push({ blob: jpeg, ext: 'jpg', type: 'image/jpeg' });
    if (candidates.length === 0) return file;

    const best = candidates.reduce((a, b) => (b.blob.size < a.blob.size ? b : a));
    if (best.blob.size >= file.size) return file; // compression didn't actually help — keep original

    const newName = file.name.replace(/\.\w+$/, '') + '.' + best.ext;
    return new File([best.blob], newName, { type: best.type });
  } catch (err) {
    console.warn('Image compression skipped, uploading original:', err);
    return file;
  }
}
