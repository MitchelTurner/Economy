/** Client-side pre-processing: HEIC→JPEG, longest edge 1600px, JPEG q=0.8, strip EXIF via canvas. */

const MAX_EDGE = 1600;
const QUALITY = 0.8;

export function isHeicFile(file: Blob & { name?: string; type?: string }): boolean {
  const type = (file.type ?? '').toLowerCase();
  const name = (file.name ?? '').toLowerCase();
  return (
    type === 'image/heic' ||
    type === 'image/heif' ||
    name.endsWith('.heic') ||
    name.endsWith('.heif')
  );
}

/** Convert HEIC/HEIF to a JPEG Blob when the browser cannot decode natively. */
export async function ensureDecodableImage(
  file: Blob & { name?: string; type?: string },
): Promise<Blob> {
  if (!isHeicFile(file)) return file;
  try {
    // Native decode (Safari) — prefer this when available
    await createImageBitmap(file);
    return file;
  } catch {
    // fall through to heic2any
  }
  try {
    const heic2any = (await import('heic2any')).default;
    const converted = await heic2any({
      blob: file,
      toType: 'image/jpeg',
      quality: QUALITY,
    });
    return Array.isArray(converted) ? converted[0]! : converted;
  } catch (err) {
    throw new Error(
      `Could not decode HEIC image. Try exporting as JPEG. (${(err as Error).message})`,
    );
  }
}

/** Decode via createImageBitmap, with <img> fallback for picky mobile browsers. */
async function decodeToBitmap(blob: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(blob);
  } catch {
    // Some Android/WebView builds reject createImageBitmap for camera JPEGs.
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Browser could not decode this image'));
      el.src = url;
    });
    return await createImageBitmap(img);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function preprocessReceiptImage(file: Blob & { name?: string; type?: string }): Promise<{
  blob: Blob;
  hash: string;
}> {
  const decodable = await ensureDecodableImage(file);
  const bitmap = await decodeToBitmap(decodable);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unsupported');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('JPEG encode failed'))),
      'image/jpeg',
      QUALITY,
    );
  });

  const hash = await sha256Hex(blob);
  return { blob, hash };
}

export async function sha256Hex(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1] ?? '');
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
