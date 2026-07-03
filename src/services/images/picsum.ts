import type { ImageProvider, PuzzleImage } from "./types";
import { ProviderError } from "./types";

/**
 * Lorem Picsum — keyless, CORS-friendly, always available. Serves as the
 * guaranteed fallback provider; it has no real search, so queries hash into
 * a stable pseudo-feed (still beautiful photos, deterministic per query).
 */
export const picsumProvider: ImageProvider = {
  id: "picsum",
  name: "Picsum",
  supportsSearch: false,

  isAvailable: () => true,

  async search(query: string, page: number): Promise<PuzzleImage[]> {
    // No search API — derive a stable page offset from the query text.
    return this.curated(query, page);
  },

  async curated(category: string | undefined, page: number): Promise<PuzzleImage[]> {
    // Picsum has no categories/search: hash the term into a stable page
    // offset so each category at least browses a different slice.
    let offset = 0;
    if (category) {
      for (const ch of category) offset = (offset * 31 + ch.charCodeAt(0)) % 30;
    }
    const effectivePage = offset + page;
    const res = await fetch(`https://picsum.photos/v2/list?page=${effectivePage}&limit=24`);
    if (!res.ok) throw new ProviderError(`Picsum error ${res.status}`, res.status === 429);
    const list = (await res.json()) as Array<{
      id: string;
      author: string;
      width: number;
      height: number;
    }>;
    return list.map((it) => ({
      id: `picsum-${it.id}`,
      url: `https://picsum.photos/id/${it.id}/1600/1200`,
      thumbUrl: `https://picsum.photos/id/${it.id}/400/300`,
      width: 1600,
      height: 1200,
      author: it.author,
      provider: "picsum",
      alt: `Photo by ${it.author}`,
    }));
  },
};
