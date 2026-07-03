import { create } from "zustand";

interface GameState {
  totalPieces: number;
  placedPieces: number;
  /** Milliseconds of active play (excludes pauses). */
  elapsed: number;
  startedAt: number | null;
  paused: boolean;
  completed: boolean;
  zoom: number;

  start: (totalPieces: number, initialPlaced: number, elapsed: number) => void;
  setProgress: (placed: number) => void;
  tick: () => void;
  setPaused: (p: boolean) => void;
  complete: () => void;
  setZoom: (z: number) => void;
  reset: () => void;
}

export const useGame = create<GameState>()((set, get) => ({
  totalPieces: 0,
  placedPieces: 0,
  elapsed: 0,
  startedAt: null,
  paused: false,
  completed: false,
  zoom: 1,

  start: (totalPieces, initialPlaced, elapsed) =>
    set({
      totalPieces,
      placedPieces: initialPlaced,
      elapsed,
      startedAt: performance.now(),
      paused: false,
      completed: false,
    }),
  setProgress: (placedPieces) => set({ placedPieces }),
  tick: () => {
    const { startedAt, paused, completed, elapsed } = get();
    if (startedAt === null || paused || completed) return;
    const now = performance.now();
    set({ elapsed: elapsed + (now - startedAt), startedAt: now });
  },
  setPaused: (paused) => {
    const { startedAt, elapsed } = get();
    if (paused && startedAt !== null) {
      set({ paused, elapsed: elapsed + (performance.now() - startedAt), startedAt: performance.now() });
    } else {
      set({ paused, startedAt: performance.now() });
    }
  },
  complete: () => {
    get().tick();
    set({ completed: true });
  },
  setZoom: (zoom) => set({ zoom }),
  reset: () =>
    set({
      totalPieces: 0,
      placedPieces: 0,
      elapsed: 0,
      startedAt: null,
      paused: false,
      completed: false,
      zoom: 1,
    }),
}));

export function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}
