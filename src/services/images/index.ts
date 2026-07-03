import { picsumProvider } from "./picsum";
import { pexelsProvider } from "./pexels";
import { pixabayProvider } from "./pixabay";
import type { PuzzleImage } from "./types";
import { ProviderError } from "./types";

export * from "./types";

/** Preference order per the product spec: Pexels → Pixabay → Picsum. */
const providers = [pexelsProvider, pixabayProvider, picsumProvider];

const responseCache = new Map<string, PuzzleImage[]>();

export function activeProviderName(): string {
  return providers.find((p) => p.isAvailable())!.name;
}

export function hasSearchProvider(): boolean {
  return providers.some((p) => p.isAvailable() && p.supportsSearch);
}

/**
 * Runs a request against the best available provider, falling back down the
 * chain on rate limits / errors so the picker never dead-ends.
 */
async function withFallback(key: string, run: (p: (typeof providers)[number]) => Promise<PuzzleImage[]>): Promise<PuzzleImage[]> {
  const cached = responseCache.get(key);
  if (cached) return cached;
  let lastError: unknown;
  for (const p of providers) {
    if (!p.isAvailable()) continue;
    try {
      const result = await run(p);
      if (result.length > 0 || p.id === "picsum") {
        responseCache.set(key, result);
        return result;
      }
    } catch (err) {
      lastError = err;
      if (err instanceof ProviderError && !err.rateLimited && p.id === "picsum") throw err;
    }
  }
  throw lastError ?? new Error("No image provider available");
}

export function searchImages(query: string, page = 1): Promise<PuzzleImage[]> {
  return withFallback(`s:${query}:${page}`, (p) => p.search(query, page));
}

export function browseImages(category: string | undefined, page = 1): Promise<PuzzleImage[]> {
  return withFallback(`c:${category ?? "_"}:${page}`, (p) => p.curated(category, page));
}

export async function randomImage(): Promise<PuzzleImage> {
  const seed = Math.random().toString(36).slice(2, 10);
  return {
    id: `picsum-seed-${seed}`,
    url: `https://picsum.photos/seed/${seed}/1600/1200`,
    thumbUrl: `https://picsum.photos/seed/${seed}/400/300`,
    width: 1600,
    height: 1200,
    provider: "picsum",
    alt: "Surprise photo",
  };
}

// ---------------------------------------------------------------- favorites & recents

function readList(key: string): PuzzleImage[] {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "[]") as PuzzleImage[];
  } catch {
    return [];
  }
}

function writeList(key: string, list: PuzzleImage[]): void {
  localStorage.setItem(key, JSON.stringify(list.slice(0, 30)));
}

export const getFavorites = (): PuzzleImage[] => readList("jj:favorites");
export const getRecents = (): PuzzleImage[] => readList("jj:recents");

export function toggleFavorite(img: PuzzleImage): boolean {
  const list = getFavorites();
  const idx = list.findIndex((i) => i.id === img.id);
  if (idx >= 0) {
    list.splice(idx, 1);
    writeList("jj:favorites", list);
    return false;
  }
  writeList("jj:favorites", [img, ...list]);
  return true;
}

export function isFavorite(id: string): boolean {
  return getFavorites().some((i) => i.id === id);
}

export function pushRecent(img: PuzzleImage): void {
  writeList("jj:recents", [img, ...getRecents().filter((i) => i.id !== img.id)]);
}

// ---------------------------------------------------------------- bitmap loading

const bitmapCache = new Map<string, Promise<ImageBitmap | HTMLImageElement>>();

/** Longest side cap keeps sprite memory bounded on huge source photos. */
const MAX_DIM = 2200;

export function loadPuzzleBitmap(url: string): Promise<ImageBitmap | HTMLImageElement> {
  let cached = bitmapCache.get(url);
  if (!cached) {
    cached = (async () => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = url;
      await img.decode();
      const scale = Math.min(1, MAX_DIM / Math.max(img.naturalWidth, img.naturalHeight));
      if (typeof createImageBitmap !== "undefined") {
        return createImageBitmap(img, {
          resizeWidth: Math.round(img.naturalWidth * scale),
          resizeHeight: Math.round(img.naturalHeight * scale),
          resizeQuality: "high",
        });
      }
      return img;
    })();
    bitmapCache.set(url, cached);
    cached.catch(() => bitmapCache.delete(url));
  }
  return cached;
}
