export interface PuzzleImage {
  id: string;
  /** Full-size URL used for the puzzle (CORS-enabled). */
  url: string;
  thumbUrl: string;
  width: number;
  height: number;
  author?: string;
  provider: string;
  alt?: string;
}

export interface ImageProvider {
  readonly id: string;
  readonly name: string;
  /** False when a required API key is missing. */
  isAvailable(): boolean;
  supportsSearch: boolean;
  search(query: string, page: number): Promise<PuzzleImage[]>;
  /** Curated/popular feed; category optional. */
  curated(category: string | undefined, page: number): Promise<PuzzleImage[]>;
}

export class ProviderError extends Error {
  readonly rateLimited: boolean;

  constructor(message: string, rateLimited: boolean) {
    super(message);
    this.rateLimited = rateLimited;
  }
}

export const CATEGORIES = [
  { id: "nature", label: "Nature", emoji: "🌿" },
  { id: "animals", label: "Animals", emoji: "🦊" },
  { id: "ocean", label: "Ocean", emoji: "🌊" },
  { id: "mountains", label: "Mountains", emoji: "🏔️" },
  { id: "city", label: "City", emoji: "🌆" },
  { id: "food", label: "Food", emoji: "🍜" },
  { id: "flowers", label: "Flowers", emoji: "🌸" },
  { id: "travel", label: "Travel", emoji: "✈️" },
  { id: "art", label: "Art", emoji: "🎨" },
  { id: "space", label: "Space", emoji: "🪐" },
] as const;
