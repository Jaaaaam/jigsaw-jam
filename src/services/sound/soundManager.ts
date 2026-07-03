import { Howl, Howler } from "howler";
import { defaultVariant, eventForSound, renderSound, type SoundName } from "./synth";
import { useSettings } from "@/stores/settingsStore";

/**
 * Lazily-initialised sound bank. Sounds are synthesized on first use (after a
 * user gesture, so autoplay policies are satisfied). Master volume/mute and
 * per-event enable/variant preferences all come from the settings store.
 */
class SoundManager {
  /** Keyed by `${name}:${variant}` so switching flavours re-renders once. */
  private bank = new Map<string, Howl>();
  private initialised = false;

  init(): void {
    if (this.initialised) return;
    this.initialised = true;
    const { volume, muted } = useSettings.getState();
    Howler.volume(volume);
    Howler.mute(muted);
    useSettings.subscribe((s) => {
      Howler.volume(s.volume);
      Howler.mute(s.muted);
    });
  }

  play(name: SoundName, rate = 1): void {
    this.init();
    const event = eventForSound(name);
    const pref = useSettings.getState().soundPrefs[event];
    if (pref?.enabled === false) return;
    const variant = pref?.variant ?? defaultVariant(event);
    const key = `${name}:${variant ?? "-"}`;
    let howl = this.bank.get(key);
    if (!howl) {
      howl = new Howl({ src: [renderSound(name, variant)], format: ["wav"] });
      this.bank.set(key, howl);
    }
    const id = howl.play();
    if (rate !== 1) howl.rate(rate, id);
  }

  /** Force-play for previews in the sound settings UI (ignores the event mute). */
  preview(name: SoundName, variant?: string): void {
    this.init();
    const event = eventForSound(name);
    const v = variant ?? useSettings.getState().soundPrefs[event]?.variant ?? defaultVariant(event);
    const key = `${name}:${v ?? "-"}`;
    let howl = this.bank.get(key);
    if (!howl) {
      howl = new Howl({ src: [renderSound(name, v)], format: ["wav"] });
      this.bank.set(key, howl);
    }
    howl.play();
  }
}

export const sounds = new SoundManager();

if (import.meta.env.DEV) {
  // dev/test hook — lets tooling inspect the live sound bank
  (globalThis as unknown as Record<string, unknown>).__jjSounds = sounds;
}
