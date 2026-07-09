import { motion, type HTMLMotionProps } from "framer-motion";
import { sounds } from "@/services/sound/soundManager";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary:
    "bg-gradient-to-b from-coral-400 to-coral-500 text-white shadow-soft hover:from-coral-300 hover:to-coral-400",
  secondary:
    "glass text-primary shadow-soft hover:bg-white/90 dark:hover:bg-white/10",
  ghost: "text-secondary hover:bg-black/5 dark:hover:bg-white/10",
  danger: "bg-gradient-to-b from-red-400 to-red-500 text-white shadow-soft",
};

const sizes: Record<Size, string> = {
  sm: "px-3.5 py-1.5 text-sm rounded-xl",
  md: "px-5 py-2.5 text-base rounded-2xl",
  lg: "px-7 py-3.5 text-lg rounded-2xl",
};

interface ButtonProps extends HTMLMotionProps<"button"> {
  variant?: Variant;
  size?: Size;
  silent?: boolean;
}

export function Button({ variant = "primary", size = "md", silent, className = "", onClick, ...rest }: ButtonProps) {
  return (
    <motion.button
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.96 }}
      transition={{ type: "spring", stiffness: 500, damping: 28 }}
      className={`inline-flex cursor-pointer items-center justify-center gap-2 font-bold select-none disabled:cursor-not-allowed disabled:opacity-50 disabled:saturate-50 ${variants[variant]} ${sizes[size]} ${className}`}
      onClick={(e) => {
        if (!silent) sounds.play("click");
        onClick?.(e);
      }}
      {...rest}
    />
  );
}

interface IconButtonProps extends HTMLMotionProps<"button"> {
  label: string;
  active?: boolean;
}

/** Round glass icon button used across the game HUD. */
export function IconButton({ label, active, className = "", onClick, children, ...rest }: IconButtonProps) {
  return (
    <motion.button
      whileHover={{ scale: 1.08 }}
      whileTap={{ scale: 0.92 }}
      transition={{ type: "spring", stiffness: 500, damping: 25 }}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={`glass flex h-11 w-11 cursor-pointer items-center justify-center rounded-2xl text-lg shadow-soft ${
        active ? "ring-2 ring-coral-400 bg-coral-50/80 dark:bg-coral-500/20" : ""
      } ${className}`}
      onClick={(e) => {
        sounds.play("click");
        onClick?.(e);
      }}
      {...rest}
    >
      {children}
    </motion.button>
  );
}
