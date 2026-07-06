import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { PhotoPicker } from "./PhotoPicker";
import { SetupPanel } from "./SetupPanel";
import type { PuzzleImage } from "@/services/images";
import { DIFFICULTY_PRESETS, type DifficultyId, type PuzzleConfig } from "@/engine/types";

export interface NextRoundModalProps {
  open: boolean;
  onClose: () => void;
  /** `image` is null when the host keeps the current photo. */
  onConfirm: (image: PuzzleImage | null, config: PuzzleConfig) => void;
  currentThumbUrl: string;
  currentConfig: PuzzleConfig;
  busy: boolean;
}

function difficultyFor(config: PuzzleConfig): DifficultyId {
  for (const [id, p] of Object.entries(DIFFICULTY_PRESETS)) {
    if (p.rows === config.rows && p.cols === config.cols) return id as DifficultyId;
  }
  return "custom";
}

/** Host-only: set up the next round — new photo and/or new config — without leaving the room. */
export function NextRoundModal({ open, onClose, onConfirm, currentThumbUrl, currentConfig, busy }: NextRoundModalProps) {
  const [selected, setSelected] = useState<PuzzleImage | null>(null);
  const [config, setConfig] = useState<PuzzleConfig>(currentConfig);
  const [difficulty, setDifficulty] = useState<DifficultyId>(() => difficultyFor(currentConfig));

  // every opening starts from the room's current photo and config
  useEffect(() => {
    if (!open) return;
    setSelected(null);
    setConfig(currentConfig);
    setDifficulty(difficultyFor(currentConfig));
  }, [open, currentConfig]);

  const pieceCount = config.rows * config.cols;

  return (
    <Modal open={open} onClose={busy ? undefined : onClose} title="Set up the next round" wide>
      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <div className="flex min-h-[40vh] min-w-0 flex-col">
          <PhotoPicker
            heading="Pick a photo"
            selected={selected}
            onSelect={setSelected}
            // rooms share the image by URL through Convex, and a data-URL
            // photo is far too large for the room document
            allowUpload={false}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-5">
          <SetupPanel
            config={config}
            onConfigChange={setConfig}
            difficulty={difficulty}
            onDifficultyChange={setDifficulty}
          />
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-black/10 pt-4 dark:border-white/10">
        <img
          src={selected ? selected.thumbUrl : currentThumbUrl}
          alt=""
          className="h-14 w-18 rounded-xl object-cover"
        />
        <div className="min-w-0 flex-1 text-xs font-semibold text-tertiary">
          <p className="text-sm font-extrabold text-primary">{pieceCount} pieces</p>
          <p>{selected ? (selected.author ? `📷 ${selected.author}` : "New photo") : "Keeping the current photo"}</p>
          {selected && (
            <button className="cursor-pointer font-bold text-secondary underline" onClick={() => setSelected(null)}>
              Keep current photo instead
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy} onClick={() => onConfirm(selected, config)}>
            {busy ? "Starting…" : "🚀 Start next round"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
