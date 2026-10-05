'use client';
// Client-side photo compression: downscale + JPEG so floor photos stay
// small on the server. Falls back to the original file if compression fails.

export async function compressImage(file: File, maxDim = 1280, quality = 0.7): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bmp, 0, 0, w, h);
    if (typeof bmp.close === 'function') bmp.close();
    const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality));
    return blob || file;
  } catch {
    return file;
  }
}

export function apiOrigin(): string {
  const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';
  try {
    return new URL(base).origin;
  } catch {
    return '';
  }
}
