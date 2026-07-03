import { useId, type ReactNode } from "react";
import { motion } from "framer-motion";
import { sounds } from "@/services/sound/soundManager";

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}

export function Slider({ label, value, min, max, step = 1, onChange, format }: SliderProps) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="text-sm font-bold text-secondary">
          {label}
        </label>
        <span className="text-sm font-extrabold text-primary tabular-nums">
          {format ? format(value) : value}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
      />
    </div>
  );
}

interface ToggleProps {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}

export function Toggle({ label, hint, checked, onChange }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => {
        sounds.play("click");
        onChange(!checked);
      }}
      className="flex w-full cursor-pointer items-center justify-between gap-4 py-1 text-left"
    >
      <span>
        <span className="block text-sm font-bold text-primary">{label}</span>
        {hint && <span className="block text-xs text-tertiary">{hint}</span>}
      </span>
      <span
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors duration-200 ${
          checked ? "bg-mint-500" : "bg-black/15 dark:bg-white/15"
        }`}
      >
        <motion.span
          layout
          transition={{ type: "spring", stiffness: 600, damping: 32 }}
          className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-press ${checked ? "right-1" : "left-1"}`}
        />
      </span>
    </button>
  );
}

interface SegmentedProps<T extends string> {
  options: Array<{ value: T; label: ReactNode }>;
  value: T;
  onChange: (v: T) => void;
  ariaLabel: string;
}

export function Segmented<T extends string>({ options, value, onChange, ariaLabel }: SegmentedProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="glass flex gap-1 rounded-2xl p-1"
    >
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => {
            sounds.play("click");
            onChange(o.value);
          }}
          className={`relative flex-1 cursor-pointer rounded-xl px-3 py-1.5 text-sm font-bold transition-colors ${
            value === o.value ? "text-white" : "text-secondary hover:text-primary"
          }`}
        >
          {value === o.value && (
            <motion.span
              layoutId={`seg-${ariaLabel}`}
              className="absolute inset-0 rounded-xl bg-gradient-to-b from-lav-400 to-lav-500 shadow-press"
              transition={{ type: "spring", stiffness: 500, damping: 35 }}
            />
          )}
          <span className="relative">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

interface ColorPickerProps {
  label: string;
  colors: string[];
  value: string;
  onChange: (c: string) => void;
}

export function ColorPicker({ label, colors, value, onChange }: ColorPickerProps) {
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-bold text-secondary">{label}</span>
      <div className="flex flex-wrap items-center gap-2">
        {colors.map((c) => (
          <motion.button
            key={c}
            whileHover={{ scale: 1.15 }}
            whileTap={{ scale: 0.9 }}
            aria-label={`Colour ${c}`}
            aria-pressed={value === c}
            onClick={() => {
              sounds.play("click");
              onChange(c);
            }}
            className={`h-8 w-8 cursor-pointer rounded-full border-2 ${
              value === c ? "border-coral-400 ring-2 ring-coral-300/60" : "border-white/60"
            }`}
            style={{ background: c }}
          />
        ))}
        <label
          htmlFor={id}
          className="relative flex h-8 w-8 cursor-pointer items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-lav-400 text-xs font-black text-lav-500"
          title="Custom colour"
        >
          +
          <input
            id={id}
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 cursor-pointer opacity-0"
            aria-label="Custom colour"
          />
        </label>
      </div>
    </div>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={`h-8 w-8 animate-spin rounded-full border-[3px] border-lav-300 border-t-lav-600 ${className}`}
    />
  );
}
