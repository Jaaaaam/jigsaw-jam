import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { BrandLink, PageShell, SoundControl, ThemeToggle } from "@/components/PageShell";
import { Button } from "@/components/ui/Button";
import { Segmented, Slider, Spinner, Toggle } from "@/components/ui/controls";
import {
  browseImages,
  CATEGORIES,
  getFavorites,
  getRecents,
  hasSearchProvider,
  isFavorite,
  pushRecent,
  randomImage,
  searchImages,
  toggleFavorite,
  type PuzzleImage,
} from "@/services/images";
import { DEFAULT_CONFIG, DIFFICULTY_PRESETS, type DifficultyId, type PuzzleConfig } from "@/engine/types";
import { randomSeed } from "@/engine/random";
import { sounds } from "@/services/sound/soundManager";

type Tab = "browse" | "search" | "favorites" | "recents";

export default function NewPuzzlePage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const hosting = params.get("mode") === "host";

  const [tab, setTab] = useState<Tab>("browse");
  const [category, setCategory] = useState<string | undefined>(undefined);
  const [query, setQuery] = useState("");
  const [images, setImages] = useState<PuzzleImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<PuzzleImage | null>(null);
  const [favTick, setFavTick] = useState(0);

  const [difficulty, setDifficulty] = useState<DifficultyId>("medium");
  const [config, setConfig] = useState<PuzzleConfig>(DEFAULT_CONFIG);

  const load = useCallback(async (t: Tab, cat: string | undefined, q: string) => {
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
      const list = t === "search" && q.trim() ? await searchImages(q.trim()) : await browseImages(cat);
      setImages(list);
    } catch {
      setError("Couldn't load photos right now — check your connection and try again.");
      setImages([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(tab, category, query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, category]);

  const applyPreset = (id: DifficultyId) => {
    setDifficulty(id);
    if (id !== "custom") {
      const p = DIFFICULTY_PRESETS[id];
      setConfig((c) => ({ ...c, rows: p.rows, cols: p.cols }));
    }
  };

  const pieceCount = config.rows * config.cols;

  const start = async () => {
    if (!selected) return;
    pushRecent(selected);
    sounds.play("pop");
    const seed = randomSeed();
    if (hosting) {
      navigate("/room/new", { state: { image: selected, config, seed } });
    } else {
      navigate("/play", { state: { image: selected, config, seed } });
    }
  };

  const surprise = async () => {
    const img = await randomImage();
    setSelected(img);
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
    <PageShell>
      <header className="flex items-center justify-between">
        <BrandLink />
        <div className="flex items-center gap-2">
          <SoundControl />
          <ThemeToggle />
        </div>
      </header>

      <div className="mt-6 grid flex-1 gap-6 lg:grid-cols-[1fr_340px]">
        {/* ------------------------------------------------ image picker */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass flex min-h-[60vh] min-w-0 flex-col rounded-4xl p-5 shadow-soft"
        >
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <h1 className="text-lg font-black text-primary">
              {hosting ? "Pick a photo for your room" : "Pick a photo"}
            </h1>
            <div className="ml-auto flex items-center gap-2">
              <Button size="sm" variant="secondary" onClick={surprise}>
                🎲 Surprise me
              </Button>
            </div>
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Segmented
              ariaLabel="Image source"
              options={tabs.map((t) => ({ value: t.id, label: t.label }))}
              value={tab}
              onChange={(t) => setTab(t)}
            />
            {tab === "search" && (
              <form
                className="flex flex-1 gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void load("search", category, query);
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
              <CategoryChip label="✨ All" active={!category} onClick={() => setCategory(undefined)} />
              {CATEGORIES.map((c) => (
                <CategoryChip
                  key={c.id}
                  label={`${c.emoji} ${c.label}`}
                  active={category === c.id}
                  onClick={() => setCategory(c.id)}
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
                <Button size="sm" variant="secondary" onClick={() => void load(tab, category, query)}>
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
                    setSelected(img);
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
        </motion.section>

        {/* ------------------------------------------------ configuration */}
        <motion.aside
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.08 }}
          className="glass flex h-fit min-w-0 flex-col gap-5 rounded-4xl p-5 shadow-soft lg:sticky lg:top-6"
        >
          <div>
            <h2 className="mb-3 text-lg font-black text-primary">Difficulty</h2>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(DIFFICULTY_PRESETS) as Array<Exclude<DifficultyId, "custom">>).map((id) => {
                const p = DIFFICULTY_PRESETS[id];
                return (
                  <motion.button
                    key={id}
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => {
                      applyPreset(id);
                      sounds.play("click");
                    }}
                    aria-pressed={difficulty === id}
                    className={`cursor-pointer rounded-2xl border-2 p-3 text-left transition-colors ${
                      difficulty === id
                        ? "border-coral-400 bg-coral-50/70 dark:bg-coral-500/15"
                        : "border-transparent bg-black/5 hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10"
                    }`}
                  >
                    <span className="block text-sm font-extrabold text-primary">{p.label}</span>
                    <span className="block text-[11px] font-semibold text-tertiary">{p.blurb}</span>
                  </motion.button>
                );
              })}
            </div>
            <button
              className={`mt-2 w-full cursor-pointer rounded-2xl border-2 p-2 text-sm font-bold transition-colors ${
                difficulty === "custom"
                  ? "border-coral-400 bg-coral-50/70 text-primary dark:bg-coral-500/15"
                  : "border-transparent bg-black/5 text-secondary hover:bg-black/10 dark:bg-white/5"
              }`}
              onClick={() => applyPreset("custom")}
              aria-pressed={difficulty === "custom"}
            >
              Custom · {pieceCount} pieces
            </button>
            <AnimatePresence>
              {difficulty === "custom" && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="space-y-3 pt-3">
                    <Slider
                      label="Columns"
                      value={config.cols}
                      min={2}
                      max={30}
                      onChange={(cols) => setConfig((c) => ({ ...c, cols }))}
                    />
                    <Slider
                      label="Rows"
                      value={config.rows}
                      min={2}
                      max={30}
                      onChange={(rows) => setConfig((c) => ({ ...c, rows }))}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div>
            <h2 className="mb-2 text-lg font-black text-primary">Pieces</h2>
            <Segmented
              ariaLabel="Piece shape"
              options={[
                { value: "classic", label: "Classic tabs" },
                { value: "square", label: "Squares" },
              ]}
              value={config.shape}
              onChange={(shape) => setConfig((c) => ({ ...c, shape }))}
            />
            <div className="mt-3">
              <Slider
                label="Snap forgiveness"
                value={Math.round(config.snapTolerance * 100)}
                min={10}
                max={50}
                onChange={(v) => setConfig((c) => ({ ...c, snapTolerance: v / 100 }))}
                format={(v) => (v < 20 ? "Precise" : v < 35 ? "Comfy" : "Forgiving")}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Toggle
              label="Rotation mode"
              hint="Pieces spawn rotated — press R to turn them"
              checked={config.rotationEnabled}
              onChange={(rotationEnabled) => setConfig((c) => ({ ...c, rotationEnabled }))}
            />
            <Toggle
              label="Edges first"
              hint="Stash interior pieces until the frame is done"
              checked={config.edgesFirst}
              onChange={(edgesFirst) => setConfig((c) => ({ ...c, edgesFirst }))}
            />
            <Toggle
              label="Casual mode"
              hint="Hide the timer, just vibe"
              checked={config.casual}
              onChange={(casual) => setConfig((c) => ({ ...c, casual }))}
            />
          </div>

          <div className="border-t border-black/10 pt-4 dark:border-white/10">
            <AnimatePresence mode="wait">
              {selected ? (
                <motion.div
                  key={selected.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className="mb-3 flex items-center gap-3"
                >
                  <img src={selected.thumbUrl} alt="" className="h-14 w-18 rounded-xl object-cover" />
                  <div className="min-w-0 text-xs font-semibold text-tertiary">
                    <p className="text-sm font-extrabold text-primary">{pieceCount} pieces</p>
                    {selected.author && <p className="truncate">📷 {selected.author}</p>}
                    <p className="capitalize">{selected.provider}</p>
                  </div>
                </motion.div>
              ) : (
                <motion.p
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="mb-3 text-sm font-semibold text-tertiary"
                >
                  Choose a photo to begin ↑
                </motion.p>
              )}
            </AnimatePresence>
            <Button className="w-full" size="lg" disabled={!selected} onClick={() => void start()}>
              {hosting ? "🚀 Create Room" : "▶ Start Puzzle"}
            </Button>
          </div>
        </motion.aside>
      </div>
    </PageShell>
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
