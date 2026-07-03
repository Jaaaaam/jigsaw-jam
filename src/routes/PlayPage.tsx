import { useCallback, useMemo, useRef, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import type { GameController } from "@/canvas/GameController";
import { GameView } from "@/components/game/GameView";
import type { PuzzleConfig } from "@/engine/types";
import { randomSeed } from "@/engine/random";
import type { PuzzleImage } from "@/services/images";
import { loadSave, newSaveId, writeSave, type SaveGame } from "@/services/saves";
import { useGame } from "@/stores/gameStore";

interface PlayState {
  image?: PuzzleImage;
  config?: PuzzleConfig;
  seed?: number;
  saveId?: string;
}

/** Solo play: boots from a fresh config or a saved game, autosaves as you go. */
export default function PlayPage() {
  const location = useLocation();
  const state = (location.state ?? {}) as PlayState;

  const [restartSeed, setRestartSeed] = useState<number | null>(null);

  const boot = useMemo(() => {
    if (state.saveId) {
      const save = loadSave(state.saveId);
      if (!save) return null;
      return {
        saveId: save.id,
        imageUrl: save.imageUrl,
        thumbUrl: save.thumbUrl,
        config: save.config,
        seed: save.seed,
        snapshots: save.snapshots,
        elapsed: save.elapsed,
        createdAt: save.createdAt,
      };
    }
    if (state.image && state.config && state.seed !== undefined) {
      return {
        saveId: newSaveId(),
        imageUrl: state.image.url,
        thumbUrl: state.image.thumbUrl,
        config: state.config,
        seed: state.seed,
        snapshots: undefined,
        elapsed: 0,
        createdAt: Date.now(),
      };
    }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.saveId, state.image, state.config, state.seed, restartSeed]);

  const controllerRef = useRef<GameController | null>(null);
  const saveTimer = useRef<number>(0);

  const persist = useCallback(
    (controller: GameController) => {
      if (!boot) return;
      const g = useGame.getState();
      g.tick();
      const save: SaveGame = {
        id: boot.saveId,
        createdAt: boot.createdAt,
        updatedAt: Date.now(),
        imageUrl: boot.imageUrl,
        thumbUrl: boot.thumbUrl ?? boot.imageUrl,
        config: boot.config,
        seed: restartSeed ?? boot.seed,
        elapsed: useGame.getState().elapsed,
        placed: controller.progressCount,
        total: controller.pieces.length,
        snapshots: controller.getSnapshots(),
        ...(useGame.getState().completed ? { completedAt: Date.now() } : {}),
      };
      writeSave(save);
    },
    [boot, restartSeed],
  );

  // debounce autosave: at most once every 3s, always on drop events
  const onDirty = useCallback(
    (controller: GameController) => {
      const now = Date.now();
      if (now - saveTimer.current < 3000) return;
      saveTimer.current = now;
      persist(controller);
    },
    [persist],
  );

  if (!boot) return <Navigate to="/new" replace />;

  const seed = restartSeed ?? boot.seed;

  return (
    <GameView
      key={`${boot.saveId}-${seed}`}
      imageUrl={boot.imageUrl}
      thumbUrl={boot.thumbUrl}
      config={boot.config}
      seed={seed}
      initialSnapshots={restartSeed ? undefined : boot.snapshots}
      initialElapsed={restartSeed ? 0 : boot.elapsed}
      onControllerReady={(c) => {
        controllerRef.current = c;
      }}
      onControllerGone={() => {
        // final save when leaving the page
        if (controllerRef.current) persist(controllerRef.current);
        controllerRef.current = null;
      }}
      onDirty={onDirty}
      onRestart={() => setRestartSeed(randomSeed())}
    />
  );
}
