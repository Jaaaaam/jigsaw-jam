import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { BrandLink, PageShell, SoundControl, ThemeToggle } from "@/components/PageShell";
import { Button } from "@/components/ui/Button";
import { PhotoPicker } from "@/components/setup/PhotoPicker";
import { SetupPanel } from "@/components/setup/SetupPanel";
import { pushRecent, type PuzzleImage } from "@/services/images";
import { DEFAULT_CONFIG, type DifficultyId, type PuzzleConfig } from "@/engine/types";
import { randomSeed } from "@/engine/random";
import { sounds } from "@/services/sound/soundManager";

export default function NewPuzzlePage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const hosting = params.get("mode") === "host";

  const [selected, setSelected] = useState<PuzzleImage | null>(null);
  const [difficulty, setDifficulty] = useState<DifficultyId>("medium");
  const [config, setConfig] = useState<PuzzleConfig>(DEFAULT_CONFIG);

  const pieceCount = config.rows * config.cols;

  const start = () => {
    if (!selected) return;
    // uploads are session-only data URLs — keep them out of the small
    // localStorage recents list
    if (selected.provider !== "upload") pushRecent(selected);
    sounds.play("pop");
    const seed = randomSeed();
    if (hosting) {
      navigate("/room/new", { state: { image: selected, config, seed } });
    } else {
      navigate("/play", { state: { image: selected, config, seed } });
    }
  };

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
          <PhotoPicker
            heading={hosting ? "Pick a photo for your room" : "Pick a photo"}
            selected={selected}
            onSelect={setSelected}
            // solo only: rooms share the image by URL through Convex, and a
            // data-URL photo is far too large for the room document
            allowUpload={!hosting}
          />
        </motion.section>

        {/* ------------------------------------------------ configuration */}
        <motion.aside
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.08 }}
          className="glass flex h-fit min-w-0 flex-col gap-5 rounded-4xl p-5 shadow-soft lg:sticky lg:top-6"
        >
          <SetupPanel
            config={config}
            onConfigChange={setConfig}
            difficulty={difficulty}
            onDifficultyChange={setDifficulty}
          />

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
            <Button className="w-full" size="lg" disabled={!selected} onClick={start}>
              {hosting ? "🚀 Create Room" : "▶ Start Puzzle"}
            </Button>
          </div>
        </motion.aside>
      </div>
    </PageShell>
  );
}
