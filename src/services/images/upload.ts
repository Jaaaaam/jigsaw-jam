import type { PuzzleImage } from "./types";

/**
 * Turn a device file into a self-contained PuzzleImage: downscaled and
 * encoded as JPEG data URLs so it flows through the same pipeline as
 * provider photos (play, autosave, resume) with nothing stored elsewhere —
 * once the session ends the image is simply gone.
 */

/** Matches the loadPuzzleBitmap cap — no point encoding more pixels. */
const MAX_FULL = 2200;
const MAX_THUMB = 480;

async function decodeFile(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap !== "undefined") return createImageBitmap(file);
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function importLocalImage(file: File): Promise<PuzzleImage> {
  const source = await decodeFile(file);
  const srcW = "naturalWidth" in source ? source.naturalWidth : source.width;
  const srcH = "naturalHeight" in source ? source.naturalHeight : source.height;

  const encode = (max: number, quality: number) => {
    const k = Math.min(1, max / Math.max(srcW, srcH));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(srcW * k));
    canvas.height = Math.max(1, Math.round(srcH * k));
    const ctx = canvas.getContext("2d")!;
    // flatten transparency — JPEG has no alpha and defaults to black
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    return { dataUrl: canvas.toDataURL("image/jpeg", quality), w: canvas.width, h: canvas.height };
  };

  const full = encode(MAX_FULL, 0.85);
  const thumb = encode(MAX_THUMB, 0.72);
  if ("close" in source) source.close();

  return {
    id: `upload-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    url: full.dataUrl,
    thumbUrl: thumb.dataUrl,
    width: full.w,
    height: full.h,
    provider: "upload",
    alt: file.name,
  };
}
