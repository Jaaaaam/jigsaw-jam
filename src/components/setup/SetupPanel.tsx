import { AnimatePresence, motion } from "framer-motion";
import { Segmented, Slider, Toggle } from "@/components/ui/controls";
import { DIFFICULTY_PRESETS, type DifficultyId, type PuzzleConfig } from "@/engine/types";
import { sounds } from "@/services/sound/soundManager";

export interface SetupPanelProps {
  config: PuzzleConfig;
  onConfigChange: (config: PuzzleConfig) => void;
  difficulty: DifficultyId;
  onDifficultyChange: (difficulty: DifficultyId) => void;
}

/** Difficulty, board mode, piece shape and play-mode toggles — shared by the New Puzzle page and the in-room next-round modal. */
export function SetupPanel({ config, onConfigChange, difficulty, onDifficultyChange }: SetupPanelProps) {
  const pieceCount = config.rows * config.cols;

  const applyPreset = (id: DifficultyId) => {
    onDifficultyChange(id);
    if (id !== "custom") {
      const p = DIFFICULTY_PRESETS[id];
      onConfigChange({ ...config, rows: p.rows, cols: p.cols });
    }
  };

  return (
    <>
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
                  onChange={(cols) => onConfigChange({ ...config, cols })}
                />
                <Slider
                  label="Rows"
                  value={config.rows}
                  min={2}
                  max={30}
                  onChange={(rows) => onConfigChange({ ...config, rows })}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div>
        <h2 className="mb-2 text-lg font-black text-primary">Board</h2>
        <Segmented
          ariaLabel="Board mode"
          options={[
            { value: "board", label: "Classic board" },
            { value: "freeform", label: "Free table" },
          ]}
          value={config.boardMode ?? "board"}
          onChange={(boardMode) => onConfigChange({ ...config, boardMode })}
        />
        <p className="mt-1.5 text-[11px] font-semibold text-tertiary">
          {(config.boardMode ?? "board") === "board"
            ? "Pieces snap into a photo-sized board."
            : "A big open table — no slots, build the picture anywhere by joining pieces."}
        </p>
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
          onChange={(shape) => onConfigChange({ ...config, shape })}
        />
        <div className="mt-3">
          <Slider
            label="Snap forgiveness"
            value={Math.round(config.snapTolerance * 100)}
            min={10}
            max={50}
            onChange={(v) => onConfigChange({ ...config, snapTolerance: v / 100 })}
            format={(v) => (v < 20 ? "Precise" : v < 35 ? "Comfy" : "Forgiving")}
          />
        </div>
      </div>

      <div className="space-y-1">
        <Toggle
          label="Rotation mode"
          hint="Pieces spawn rotated — press R to turn them"
          checked={config.rotationEnabled}
          onChange={(rotationEnabled) => onConfigChange({ ...config, rotationEnabled })}
        />
        <Toggle
          label="Edges first"
          hint="Stash interior pieces until the frame is done"
          checked={config.edgesFirst}
          onChange={(edgesFirst) => onConfigChange({ ...config, edgesFirst })}
        />
        <Toggle
          label="Casual mode"
          hint="Hide the timer, just vibe"
          checked={config.casual}
          onChange={(casual) => onConfigChange({ ...config, casual })}
        />
      </div>
    </>
  );
}
