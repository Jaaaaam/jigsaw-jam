import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { IconButton } from "./ui/Button";
import { useSettings } from "@/stores/settingsStore";
import { Slider } from "./ui/controls";
import { MoonIcon, SpeakerIcon, SpeakerOffIcon, SunIcon } from "./ui/icons";
import { SoundSettingsModal } from "./SoundSettings";
import { useState } from "react";
import { AnimatePresence } from "framer-motion";

export function PageShell({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <motion.main
      className={`relative z-10 mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-6 sm:px-8 ${className}`}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.28, ease: "easeOut" }}
    >
      {children}
    </motion.main>
  );
}

export function ThemeToggle() {
  const theme = useSettings((s) => s.theme);
  const setTheme = useSettings((s) => s.setTheme);
  return (
    <IconButton
      label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
    >
      {theme === "dark" ? <SunIcon /> : <MoonIcon />}
    </IconButton>
  );
}

export function SoundControl() {
  const { volume, muted, setVolume, setMuted } = useSettings();
  const [open, setOpen] = useState(false);
  const [soundsOpen, setSoundsOpen] = useState(false);
  return (
    <div className="relative">
      <IconButton
        label={muted ? "Unmute sounds" : "Sound settings"}
        active={open}
        onClick={() => setOpen((o) => !o)}
      >
        {muted || volume === 0 ? <SpeakerOffIcon /> : <SpeakerIcon />}
      </IconButton>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.95 }}
            className="glass-strong absolute right-0 z-40 mt-2 w-56 rounded-3xl p-4 shadow-float"
          >
            <Slider
              label="Volume"
              value={Math.round(volume * 100)}
              min={0}
              max={100}
              onChange={(v) => {
                setVolume(v / 100);
                if (v > 0 && muted) setMuted(false);
              }}
              format={(v) => `${v}%`}
            />
            <div className="mt-3 space-y-1">
              <button
                className="w-full cursor-pointer rounded-xl py-2 text-sm font-bold text-secondary hover:bg-black/5 dark:hover:bg-white/10"
                onClick={() => setMuted(!muted)}
              >
                {muted ? "Unmute" : "Mute all"}
              </button>
              <button
                className="w-full cursor-pointer rounded-xl py-2 text-sm font-bold text-secondary hover:bg-black/5 dark:hover:bg-white/10"
                onClick={() => {
                  setOpen(false);
                  setSoundsOpen(true);
                }}
              >
                Customize sounds…
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <SoundSettingsModal open={soundsOpen} onClose={() => setSoundsOpen(false)} />
    </div>
  );
}

export function BrandLink() {
  return (
    <Link to="/" className="flex items-center gap-2 text-xl font-black text-primary">
      <span className="animate-float inline-block text-2xl">🧩</span>
      <span>
        Jigsaw <span className="text-coral-500">Jam</span>
      </span>
    </Link>
  );
}
