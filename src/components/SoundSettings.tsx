import { Modal } from "./ui/Modal";
import { Toggle } from "./ui/controls";
import { sounds } from "@/services/sound/soundManager";
import { defaultVariant, SOUND_EVENTS, SOUND_VARIANTS, type SoundEventId, type SoundName } from "@/services/sound/synth";
import { useSettings } from "@/stores/settingsStore";
import { PlayIcon } from "./ui/icons";

/** Which concrete sound previews each event row. */
const PREVIEW_SOUND: Record<SoundEventId, SoundName> = {
  pickup: "pickup",
  drop: "drop",
  snap: "snap",
  merge: "merge",
  hover: "hover",
  complete: "complete",
  ui: "click",
};

export function SoundSettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const soundPrefs = useSettings((s) => s.soundPrefs);
  const setEnabled = useSettings((s) => s.setSoundEventEnabled);
  const setVariant = useSettings((s) => s.setSoundVariant);

  return (
    <Modal open={open} onClose={onClose} title="Sounds">
      <div className="space-y-1">
        {SOUND_EVENTS.map((ev) => {
          const pref = soundPrefs[ev.id];
          const enabled = pref?.enabled !== false;
          const variants = SOUND_VARIANTS[ev.id];
          const activeVariant = pref?.variant ?? defaultVariant(ev.id);
          return (
            <div key={ev.id} className="rounded-2xl px-2 py-1.5 transition-colors hover:bg-black/[0.03] dark:hover:bg-white/5">
              <div className="flex items-center gap-2">
                <button
                  aria-label={`Preview ${ev.label} sound`}
                  title="Preview"
                  disabled={!enabled}
                  className="glass flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-xl text-lav-600 transition-transform hover:scale-110 disabled:cursor-default disabled:opacity-35 dark:text-lav-300"
                  onClick={() => sounds.preview(PREVIEW_SOUND[ev.id])}
                >
                  <PlayIcon width={14} height={14} />
                </button>
                <div className="min-w-0 flex-1">
                  <Toggle
                    label={ev.label}
                    hint={ev.hint}
                    checked={enabled}
                    onChange={(on) => setEnabled(ev.id, on)}
                  />
                </div>
              </div>
              {variants && enabled && (
                <div className="mt-1 ml-10 flex flex-wrap gap-1.5">
                  {variants.map((v) => (
                    <button
                      key={v.id}
                      aria-pressed={activeVariant === v.id}
                      className={`cursor-pointer rounded-full px-3 py-1 text-xs font-bold transition-colors ${
                        activeVariant === v.id
                          ? "bg-gradient-to-b from-lav-400 to-lav-500 text-white shadow-press"
                          : "bg-black/5 text-secondary hover:bg-black/10 hover:text-primary dark:bg-white/10 dark:hover:bg-white/15"
                      }`}
                      onClick={() => {
                        setVariant(ev.id, v.id);
                        sounds.preview(PREVIEW_SOUND[ev.id], v.id);
                      }}
                    >
                      {v.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-xs font-semibold text-tertiary">
        Tap a style to hear it. These settings are remembered on this device.
      </p>
    </Modal>
  );
}
