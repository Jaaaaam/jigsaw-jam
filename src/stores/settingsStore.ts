import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { SoundEventId } from "@/services/sound/synth";

export type ThemeMode = "light" | "dark";

export interface BoardTexture {
  id: "none" | "felt" | "wood" | "linen";
  label: string;
}

export const BOARD_TEXTURES: BoardTexture[] = [
  { id: "none", label: "Smooth" },
  { id: "felt", label: "Felt" },
  { id: "wood", label: "Wood" },
  { id: "linen", label: "Linen" },
];

export const BOARD_COLORS = [
  // light
  "#f3ead9", "#e8e1f6", "#dde9e2", "#f0dccd",
  // mid
  "#aeb7c9", "#8fa1a8",
  // dark
  "#3d2764", "#22303c",
];

export interface SoundEventPref {
  enabled: boolean;
  variant?: string;
}

interface SettingsState {
  theme: ThemeMode;
  volume: number;
  muted: boolean;
  /** Per-event overrides; events absent here are enabled with default variant. */
  soundPrefs: Partial<Record<SoundEventId, SoundEventPref>>;
  boardColor: string;
  boardTexture: BoardTexture["id"];
  playerName: string;
  reducedMotion: boolean;
  setTheme: (t: ThemeMode) => void;
  setVolume: (v: number) => void;
  setMuted: (m: boolean) => void;
  setBoardColor: (c: string) => void;
  setBoardTexture: (t: BoardTexture["id"]) => void;
  setPlayerName: (n: string) => void;
  setReducedMotion: (r: boolean) => void;
  setSoundEventEnabled: (id: SoundEventId, enabled: boolean) => void;
  setSoundVariant: (id: SoundEventId, variant: string) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      theme:
        typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light",
      volume: 0.7,
      muted: false,
      soundPrefs: {},
      boardColor: "#3d2764",
      boardTexture: "none",
      playerName: "",
      reducedMotion:
        typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      setTheme: (theme) => set({ theme }),
      setVolume: (volume) => set({ volume }),
      setMuted: (muted) => set({ muted }),
      setBoardColor: (boardColor) => set({ boardColor }),
      setBoardTexture: (boardTexture) => set({ boardTexture }),
      setPlayerName: (playerName) => set({ playerName }),
      setReducedMotion: (reducedMotion) => set({ reducedMotion }),
      setSoundEventEnabled: (id, enabled) =>
        set((s) => ({ soundPrefs: { ...s.soundPrefs, [id]: { ...s.soundPrefs[id], enabled } } })),
      setSoundVariant: (id, variant) =>
        set((s) => ({
          soundPrefs: { ...s.soundPrefs, [id]: { enabled: s.soundPrefs[id]?.enabled ?? true, variant } },
        })),
    }),
    { name: "jj:settings" },
  ),
);
