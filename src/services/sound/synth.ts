/**
 * Tiny procedural sound synth. Every effect in the game is rendered to a WAV
 * data URI at startup — zero binary assets, zero licensing, instant load.
 */

const SAMPLE_RATE = 44100;

interface Layer {
  type: "sine" | "triangle" | "noise";
  /** Start/end frequency (Hz); ignored for noise. */
  from?: number;
  to?: number;
  /** Delay before the layer starts (s). */
  at?: number;
  duration: number;
  gain: number;
  /** Attack/release as fractions of duration. */
  attack?: number;
  release?: number;
}

function renderLayers(layers: Layer[]): Float32Array {
  const total = Math.max(...layers.map((l) => (l.at ?? 0) + l.duration));
  const n = Math.ceil(total * SAMPLE_RATE);
  const out = new Float32Array(n);
  for (const l of layers) {
    const start = Math.floor((l.at ?? 0) * SAMPLE_RATE);
    const len = Math.floor(l.duration * SAMPLE_RATE);
    const attack = Math.max(1, Math.floor(len * (l.attack ?? 0.02)));
    const release = Math.max(1, Math.floor(len * (l.release ?? 0.4)));
    let phase = 0;
    for (let i = 0; i < len && start + i < n; i++) {
      const t = i / len;
      const freq = (l.from ?? 440) + ((l.to ?? l.from ?? 440) - (l.from ?? 440)) * t;
      phase += (2 * Math.PI * freq) / SAMPLE_RATE;
      let v: number;
      if (l.type === "noise") v = Math.random() * 2 - 1;
      else if (l.type === "triangle") v = (2 / Math.PI) * Math.asin(Math.sin(phase));
      else v = Math.sin(phase);
      let env = 1;
      if (i < attack) env = i / attack;
      else if (i > len - release) env = (len - i) / release;
      out[start + i]! += v * env * l.gain;
    }
  }
  // soft clip
  for (let i = 0; i < n; i++) out[i] = Math.tanh(out[i]! * 1.2) * 0.85;
  return out;
}

function toWavDataUri(samples: Float32Array): string {
  const n = samples.length;
  const buf = new ArrayBuffer(44 + n * 2);
  const view = new DataView(buf);
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + n * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i]!)) * 0x7fff, true);
  }
  let binary = "";
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return `data:audio/wav;base64,${btoa(binary)}`;
}

export type SoundName =
  | "pickup"
  | "drop"
  | "snap"
  | "merge"
  | "wrong"
  | "hover"
  | "complete"
  | "click"
  | "pop"
  | "whoosh";

/** User-facing sound events (mute granularity). UI sounds are grouped. */
export type SoundEventId = "pickup" | "drop" | "snap" | "merge" | "hover" | "complete" | "ui";

export const SOUND_EVENTS: Array<{ id: SoundEventId; label: string; hint: string }> = [
  { id: "pickup", label: "Grab piece", hint: "When you pick a piece up" },
  { id: "drop", label: "Drop piece", hint: "When a piece lands anywhere" },
  { id: "snap", label: "Snap in place", hint: "When a piece locks onto the board" },
  { id: "merge", label: "Pieces join", hint: "When two pieces click together" },
  { id: "hover", label: "Near-target cue", hint: "Soft tick when you hover the right spot" },
  { id: "complete", label: "Puzzle complete", hint: "The celebration jingle" },
  { id: "ui", label: "Buttons & interface", hint: "Clicks, chat pops, whooshes" },
];

export function eventForSound(name: SoundName): SoundEventId {
  if (name === "click" || name === "pop" || name === "whoosh" || name === "wrong") return "ui";
  return name;
}

/** Selectable flavours per event; the first entry is the default. */
export const SOUND_VARIANTS: Partial<Record<SoundEventId, Array<{ id: string; label: string }>>> = {
  pickup: [
    { id: "blip", label: "Blip" },
    { id: "tick", label: "Tick" },
    { id: "bubble", label: "Bubble" },
  ],
  drop: [
    { id: "thud", label: "Thud" },
    { id: "tap", label: "Tap" },
    { id: "bloop", label: "Bloop" },
  ],
  snap: [
    { id: "lock", label: "Lock" },
    { id: "click", label: "Click" },
    { id: "thock", label: "Thock" },
    { id: "snick", label: "Snick" },
    { id: "chime", label: "Chime" },
    { id: "pop", label: "Pop" },
  ],
  merge: [
    { id: "latch", label: "Latch" },
    { id: "click", label: "Click" },
    { id: "thock", label: "Thock" },
    { id: "snick", label: "Snick" },
    { id: "chime", label: "Chime" },
  ],
};

const RECIPES: Record<string, Layer[]> = {
  "pickup.blip": [
    { type: "sine", from: 320, to: 420, duration: 0.07, gain: 0.35, release: 0.5 },
    { type: "noise", duration: 0.015, gain: 0.06 },
  ],
  "pickup.tick": [
    { type: "sine", from: 1000, to: 940, duration: 0.03, gain: 0.2, release: 0.6 },
    { type: "noise", duration: 0.006, gain: 0.08 },
  ],
  "pickup.bubble": [{ type: "sine", from: 260, to: 540, duration: 0.09, gain: 0.3, release: 0.5 }],

  "drop.thud": [
    { type: "sine", from: 190, to: 120, duration: 0.09, gain: 0.4, release: 0.6 },
    { type: "noise", duration: 0.02, gain: 0.08 },
  ],
  "drop.tap": [
    { type: "noise", duration: 0.01, gain: 0.14 },
    { type: "sine", from: 420, to: 360, duration: 0.05, gain: 0.22, release: 0.55 },
  ],
  "drop.bloop": [{ type: "sine", from: 520, to: 240, duration: 0.09, gain: 0.3, release: 0.55 }],

  // Lock: latch "cl-click" — click, low thunk, then the bolt seating.
  "snap.lock": [
    { type: "noise", duration: 0.008, gain: 0.24 },
    { type: "sine", from: 230, to: 150, duration: 0.06, gain: 0.42, release: 0.6 },
    { type: "noise", at: 0.055, duration: 0.007, gain: 0.2 },
    { type: "sine", from: 340, to: 280, at: 0.058, duration: 0.055, gain: 0.3, release: 0.55 },
    { type: "sine", from: 1500, to: 1450, at: 0.058, duration: 0.02, gain: 0.07, release: 0.7 },
  ],
  "snap.chime": [
    { type: "noise", duration: 0.012, gain: 0.22 },
    { type: "sine", from: 660, to: 655, duration: 0.14, gain: 0.32, release: 0.7 },
    { type: "sine", from: 990, to: 985, at: 0.01, duration: 0.12, gain: 0.14, release: 0.8 },
  ],
  "snap.pop": [
    { type: "noise", duration: 0.008, gain: 0.18 },
    { type: "sine", from: 420, to: 720, duration: 0.07, gain: 0.32, release: 0.5 },
    { type: "sine", from: 1100, at: 0.01, duration: 0.04, gain: 0.08, release: 0.7 },
  ],
  // Board-snap takes the same click family as joining, slightly weightier.
  "snap.click": [
    { type: "noise", duration: 0.005, gain: 0.34, release: 0.9 },
    { type: "sine", from: 850, to: 600, duration: 0.035, gain: 0.34, attack: 0.05, release: 0.65 },
    { type: "sine", from: 2400, to: 2300, duration: 0.012, gain: 0.11, release: 0.85 },
    { type: "sine", from: 210, to: 150, at: 0.006, duration: 0.05, gain: 0.2, release: 0.5 },
  ],
  "snap.thock": [
    { type: "noise", duration: 0.006, gain: 0.18 },
    { type: "sine", from: 155, to: 108, duration: 0.085, gain: 0.55, attack: 0.04, release: 0.5 },
    { type: "sine", from: 470, to: 420, duration: 0.028, gain: 0.15, release: 0.7 },
  ],
  "snap.snick": [
    { type: "noise", duration: 0.004, gain: 0.24, release: 0.9 },
    { type: "sine", from: 720, to: 570, duration: 0.02, gain: 0.24, release: 0.75 },
    { type: "noise", at: 0.03, duration: 0.005, gain: 0.3, release: 0.9 },
    { type: "sine", from: 520, to: 390, at: 0.032, duration: 0.04, gain: 0.36, release: 0.6 },
    { type: "sine", from: 1800, at: 0.032, duration: 0.012, gain: 0.09, release: 0.85 },
  ],

  "merge.latch": [
    { type: "noise", duration: 0.007, gain: 0.18 },
    { type: "sine", from: 300, to: 210, duration: 0.055, gain: 0.34, release: 0.55 },
    { type: "sine", from: 1200, to: 1150, at: 0.004, duration: 0.02, gain: 0.06, release: 0.7 },
  ],
  // Crisp mechanical click: sharp transient, short bright body, instant stop.
  "merge.click": [
    { type: "noise", duration: 0.005, gain: 0.32, release: 0.9 },
    { type: "sine", from: 850, to: 620, duration: 0.03, gain: 0.3, attack: 0.05, release: 0.7 },
    { type: "sine", from: 2400, to: 2300, duration: 0.012, gain: 0.1, release: 0.85 },
  ],
  // Deep keyboard-style thock: soft transient, round low body.
  "merge.thock": [
    { type: "noise", duration: 0.006, gain: 0.16 },
    { type: "sine", from: 165, to: 118, duration: 0.075, gain: 0.5, attack: 0.04, release: 0.5 },
    { type: "sine", from: 480, to: 430, duration: 0.025, gain: 0.14, release: 0.7 },
  ],
  // Quick double "sn-ick": two tiny clicks a few ms apart.
  "merge.snick": [
    { type: "noise", duration: 0.004, gain: 0.22, release: 0.9 },
    { type: "sine", from: 700, to: 560, duration: 0.02, gain: 0.22, release: 0.75 },
    { type: "noise", at: 0.028, duration: 0.005, gain: 0.28, release: 0.9 },
    { type: "sine", from: 520, to: 400, at: 0.03, duration: 0.035, gain: 0.32, release: 0.6 },
    { type: "sine", from: 1800, at: 0.03, duration: 0.012, gain: 0.08, release: 0.85 },
  ],
  "merge.chime": [
    { type: "noise", duration: 0.012, gain: 0.18 },
    { type: "sine", from: 520, to: 515, duration: 0.13, gain: 0.3, release: 0.7 },
    { type: "sine", from: 780, at: 0.012, duration: 0.11, gain: 0.12, release: 0.8 },
  ],

  wrong: [
    { type: "triangle", from: 210, to: 190, duration: 0.07, gain: 0.22, release: 0.5 },
    { type: "triangle", from: 180, to: 160, at: 0.09, duration: 0.08, gain: 0.2, release: 0.6 },
  ],
  hover: [{ type: "sine", from: 1180, to: 1240, duration: 0.045, gain: 0.12, release: 0.6 }],
  complete: [
    { type: "sine", from: 523, duration: 0.16, gain: 0.28, release: 0.5 },
    { type: "sine", from: 659, at: 0.11, duration: 0.16, gain: 0.28, release: 0.5 },
    { type: "sine", from: 784, at: 0.22, duration: 0.18, gain: 0.28, release: 0.5 },
    { type: "sine", from: 1046, at: 0.34, duration: 0.42, gain: 0.3, release: 0.75 },
    { type: "sine", from: 1318, at: 0.34, duration: 0.42, gain: 0.14, release: 0.75 },
  ],
  click: [
    { type: "sine", from: 900, to: 880, duration: 0.035, gain: 0.2, release: 0.6 },
    { type: "noise", duration: 0.008, gain: 0.05 },
  ],
  pop: [{ type: "sine", from: 420, to: 700, duration: 0.08, gain: 0.25, release: 0.55 }],
  whoosh: [{ type: "noise", duration: 0.22, gain: 0.1, attack: 0.3, release: 0.6 }],
};

export function defaultVariant(event: SoundEventId): string | undefined {
  return SOUND_VARIANTS[event]?.[0]?.id;
}

/** Render a sound, honouring a variant when the event has flavours. */
export function renderSound(name: SoundName, variant?: string): string {
  const event = eventForSound(name);
  const variants = SOUND_VARIANTS[event];
  let key: string = name;
  if (variants && (name === "pickup" || name === "drop" || name === "snap" || name === "merge")) {
    const chosen = variants.some((v) => v.id === variant) ? variant : variants[0]!.id;
    key = `${name}.${chosen}`;
  }
  const recipe = RECIPES[key] ?? RECIPES[name];
  return toWavDataUri(renderLayers(recipe!));
}
