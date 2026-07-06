import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { Segmented, Spinner } from "@/components/ui/controls";
import {
  browseImages,
  CATEGORIES,
  getFavorites,
  getRecents,
  hasSearchProvider,
  importLocalImage,
  isFavorite,
  randomImage,
  searchImages,
  toggleFavorite,
  type PuzzleImage,
} from "@/services/images";
import { sounds } from "@/services/sound/soundManager";

type Tab = "browse" | "search" | "favorites" | "recents";

/** Every remote provider serves 24 per page; a short page means it's the last. */
const PAGE_SIZE = 24;

export interface PhotoPickerProps {
  heading: string;
  selected: PuzzleImage | null;
  onSelect: (img: PuzzleImage) => void;
  /** Uploads are session-only data URLs — too large for shared room docs. */
  allowUpload: boolean;
}

/** Browse/search/saved photo grid with selection — shared by the New Puzzle page and the in-room next-round modal. */
export function PhotoPicker({ heading, selected, onSelect, allowUpload }: PhotoPickerProps) {
  const [tab, setTab] = useState<Tab>("browse");
  const [category, setCategory] = useState<string | undefined>(undefined);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [images, setImages] = useState<PuzzleImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [favTick, setFavTick] = useState(0);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async (t: Tab, cat: string | undefined, q: string, pg: number) => {
    setError(null);
    if (t === "favorites") {
      setImages(getFavorites());
      return;
    }
    if (t === "recents") {
      setImages(getRecents());
      return;
    }
    setLoading(true);
    try {
      const list =
        t === "search" && q.trim() ? await searchImages(q.trim(), pg) : await browseImages(cat, pg);
      setImages(list);
    } catch {
      setError("Couldn't load photos right now — check your connection and try again.");
      setImages([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(tab, category, query, page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, category, page]);

  const uploadFile = async (file: File) => {
    setImporting(true);
    setError(null);
    try {
      const img = await importLocalImage(file);
      setImages((cur) => [img, ...cur]);
      onSelect(img);
      sounds.play("pop");
    } catch {
      setError("Couldn't read that image — try a JPEG or PNG file.");
    } finally {
      setImporting(false);
    }
  };

  const surprise = async () => {
    const img = await randomImage();
    onSelect(img);
    sounds.play("pop");
  };

  const tabs: Array<{ id: Tab; label: string }> = useMemo(
    () => [
      { id: "browse", label: "Browse" },
      ...(hasSearchProvider() ? [{ id: "search" as Tab, label: "Search" }] : []),
      { id: "favorites", label: "♥ Saved" },
      { id: "recents", label: "Recent" },
    ],
    [],
  );

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-black text-primary">{heading}</h1>
        <div className="ml-auto flex items-center gap-2">
          {allowUpload && (
            <>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void uploadFile(file);
                }}
              />
              <Button size="sm" variant="secondary" disabled={importing} onClick={() => fileRef.current?.click()}>
                {importing ? "Importing…" : "⬆ Upload photo"}
              </Button>
            </>
          )}
          <Button size="sm" variant="secondary" onClick={() => void surprise()}>
            🎲 Surprise me
          </Button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented
          ariaLabel="Image source"
          options={tabs.map((t) => ({ value: t.id, label: t.label }))}
          value={tab}
          onChange={(t) => {
            setTab(t);
            setPage(1);
          }}
        />
        {tab === "search" && (
          <form
            className="flex flex-1 gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setPage(1);
              void load("search", category, query, 1);
            }}
          >
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Sunsets, kittens, mountains…"
              aria-label="Search photos"
              className="glass min-w-40 flex-1 rounded-2xl px-4 py-2 text-sm font-semibold text-primary placeholder:text-tertiary"
            />
            <Button size="sm" type="submit">
              Search
            </Button>
          </form>
        )}
      </div>

      {tab === "browse" && !hasSearchProvider() && (
        <p className="mb-3 text-xs font-semibold text-tertiary">
          Browsing the free Picsum library — categories show different photo mixes. Add a free
          Pexels or Pixabay API key (see <code className="rounded bg-black/10 px-1 dark:bg-white/10">.env.example</code>) for real
          category and search results.
        </p>
      )}
      {tab === "browse" && (
        <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
          <CategoryChip
            label="✨ All"
            active={!category}
            onClick={() => {
              setCategory(undefined);
              setPage(1);
            }}
          />
          {CATEGORIES.map((c) => (
            <CategoryChip
              key={c.id}
              label={`${c.emoji} ${c.label}`}
              active={category === c.id}
              onClick={() => {
                setCategory(c.id);
                setPage(1);
              }}
            />
          ))}
        </div>
      )}

      <div className="relative flex-1">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center">
            <Spinner />
          </div>
        )}
        {error && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <span className="text-4xl">🌧️</span>
            <p className="max-w-xs text-sm font-semibold text-secondary">{error}</p>
            <Button size="sm" variant="secondary" onClick={() => void load(tab, category, query, page)}>
              Try again
            </Button>
          </div>
        )}
        {!error && !loading && images.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <span className="text-4xl">{tab === "favorites" ? "💜" : "🔍"}</span>
            <p className="max-w-xs text-sm font-semibold text-secondary">
              {tab === "favorites"
                ? "No saved photos yet — tap the heart on any photo to keep it here."
                : tab === "recents"
                  ? "Photos you play will show up here."
                  : "Nothing found — try another search."}
            </p>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {images.map((img, i) => (
            <motion.button
              key={img.id}
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: Math.min(i * 0.03, 0.4) }}
              whileHover={{ scale: 1.035, y: -2 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => {
                onSelect(img);
                sounds.play("pickup");
              }}
              className={`group relative aspect-[4/3] cursor-pointer overflow-hidden rounded-2xl bg-black/5 shadow-soft ${
                selected?.id === img.id ? "ring-4 ring-coral-400" : ""
              }`}
              aria-label={img.alt ?? "Photo"}
              aria-pressed={selected?.id === img.id}
            >
              <img
                src={img.thumbUrl}
                alt={img.alt ?? ""}
                loading="lazy"
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
              {img.author && (
                <span className="absolute right-0 bottom-0 left-0 truncate bg-gradient-to-t from-black/60 to-transparent px-2 pt-4 pb-1 text-left text-[10px] font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100">
                  {img.author}
                </span>
              )}
              <span
                role="button"
                aria-label={isFavorite(img.id) ? "Remove from saved" : "Save photo"}
                className="absolute top-1.5 right-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/35 text-sm backdrop-blur-sm transition-transform hover:scale-110"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFavorite(img);
                  setFavTick((t) => t + 1);
                  sounds.play("pop");
                  if (tab === "favorites") setImages(getFavorites());
                }}
              >
                {isFavorite(img.id) && favTick >= 0 ? "💜" : "🤍"}
              </span>
              {selected?.id === img.id && (
                <motion.span
                  layoutId="selected-check"
                  className="absolute bottom-1.5 left-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-coral-500 text-sm text-white shadow-press"
                >
                  ✓
                </motion.span>
              )}
            </motion.button>
          ))}
        </div>
      </div>

      {(tab === "browse" || tab === "search") && !error && images.length > 0 && (
        <div className="mt-4 flex items-center justify-center gap-3" role="navigation" aria-label="Photo pages">
          <Button
            size="sm"
            variant="secondary"
            disabled={page === 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            ← Prev
          </Button>
          <span className="min-w-16 text-center text-sm font-bold text-tertiary" aria-live="polite">
            Page {page}
          </span>
          <Button
            size="sm"
            variant="secondary"
            disabled={loading || images.length < PAGE_SIZE}
            onClick={() => setPage((p) => p + 1)}
          >
            Next →
          </Button>
        </div>
      )}
    </>
  );
}

function CategoryChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <motion.button
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={() => {
        sounds.play("click");
        onClick();
      }}
      aria-pressed={active}
      className={`shrink-0 cursor-pointer rounded-full px-4 py-1.5 text-sm font-bold whitespace-nowrap transition-colors ${
        active
          ? "bg-gradient-to-b from-lav-400 to-lav-500 text-white shadow-press"
          : "glass text-secondary hover:text-primary"
      }`}
    >
      {label}
    </motion.button>
  );
}
