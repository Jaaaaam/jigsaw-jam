import type { ImageProvider, PuzzleImage } from "./types";
import { ProviderError } from "./types";

const KEY = import.meta.env.VITE_PEXELS_API_KEY as string | undefined;

interface PexelsPhoto {
  id: number;
  width: number;
  height: number;
  photographer: string;
  alt: string;
  src: { large2x: string; large: string; medium: string };
}

function map(p: PexelsPhoto): PuzzleImage {
  return {
    id: `pexels-${p.id}`,
    url: p.src.large2x || p.src.large,
    thumbUrl: p.src.medium,
    width: p.width,
    height: p.height,
    author: p.photographer,
    provider: "pexels",
    alt: p.alt,
  };
}

async function call(path: string): Promise<PuzzleImage[]> {
  const res = await fetch(`https://api.pexels.com/v1/${path}`, {
    headers: { Authorization: KEY ?? "" },
  });
  if (!res.ok) throw new ProviderError(`Pexels error ${res.status}`, res.status === 429);
  const data = (await res.json()) as { photos: PexelsPhoto[] };
  return data.photos.map(map);
}

export const pexelsProvider: ImageProvider = {
  id: "pexels",
  name: "Pexels",
  supportsSearch: true,
  isAvailable: () => Boolean(KEY),
  search: (query, page) =>
    call(`search?query=${encodeURIComponent(query)}&per_page=24&page=${page}&orientation=landscape`),
  curated: (category, page) =>
    category
      ? call(`search?query=${encodeURIComponent(category)}&per_page=24&page=${page}&orientation=landscape`)
      : call(`curated?per_page=24&page=${page}`),
};
