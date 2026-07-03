import type { ImageProvider, PuzzleImage } from "./types";
import { ProviderError } from "./types";

const KEY = import.meta.env.VITE_PIXABAY_API_KEY as string | undefined;

interface PixabayHit {
  id: number;
  webformatURL: string;
  largeImageURL: string;
  imageWidth: number;
  imageHeight: number;
  user: string;
  tags: string;
}

/**
 * Baseline quality gates, applied server-side so pages stay full (24/page):
 * photos only (no clipart/vectors) and originals big enough to cut cleanly
 * into pieces at the 2200px puzzle cap.
 */
const QUALITY = "image_type=photo&min_width=1600&min_height=1050";

async function call(params: string): Promise<PuzzleImage[]> {
  const res = await fetch(`https://pixabay.com/api/?key=${KEY}&per_page=24&safesearch=true&${QUALITY}&${params}`);
  if (!res.ok) throw new ProviderError(`Pixabay error ${res.status}`, res.status === 429);
  const data = (await res.json()) as { hits: PixabayHit[] };
  return data.hits.map((h) => ({
    id: `pixabay-${h.id}`,
    url: h.largeImageURL,
    thumbUrl: h.webformatURL,
    width: h.imageWidth,
    height: h.imageHeight,
    author: h.user,
    provider: "pixabay",
    alt: h.tags,
  }));
}

export const pixabayProvider: ImageProvider = {
  id: "pixabay",
  name: "Pixabay",
  supportsSearch: true,
  isAvailable: () => Boolean(KEY),
  search: (query, page) => call(`q=${encodeURIComponent(query)}&page=${page}&orientation=horizontal`),
  curated: (category, page) =>
    call(`${category ? `category=${category}&` : "editors_choice=true&"}page=${page}&orientation=horizontal`),
};
