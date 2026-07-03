import { useEffect, useRef } from "react";
import { useSettings } from "@/stores/settingsStore";

const COLORS = ["#f65a33", "#8461c9", "#34b47f", "#eeb32b", "#3b82f6", "#ec4899"];

/** Lightweight canvas confetti burst — no dependency, respects reduced motion. */
export function Confetti({ active }: { active: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const reducedMotion = useSettings((s) => s.reducedMotion);

  useEffect(() => {
    if (!active || reducedMotion) return;
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    ctx.scale(dpr, dpr);

    interface P {
      x: number; y: number; vx: number; vy: number;
      w: number; h: number; rot: number; vr: number; color: string; life: number;
    }
    const parts: P[] = [];
    const spawn = (cx: number, cy: number, n: number) => {
      for (let i = 0; i < n; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 4 + Math.random() * 9;
        parts.push({
          x: cx, y: cy,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 6,
          w: 6 + Math.random() * 6,
          h: 4 + Math.random() * 4,
          rot: Math.random() * Math.PI,
          vr: (Math.random() - 0.5) * 0.3,
          color: COLORS[Math.floor(Math.random() * COLORS.length)]!,
          life: 1,
        });
      }
    };
    spawn(window.innerWidth / 2, window.innerHeight * 0.4, 120);
    const t1 = setTimeout(() => spawn(window.innerWidth * 0.25, window.innerHeight * 0.5, 60), 280);
    const t2 = setTimeout(() => spawn(window.innerWidth * 0.75, window.innerHeight * 0.5, 60), 520);

    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(32, now - last) / 16.7;
      last = now;
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      let alive = false;
      for (const p of parts) {
        if (p.life <= 0) continue;
        alive = true;
        p.vy += 0.25 * dt;
        p.vx *= 0.99;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
        p.life -= 0.004 * dt;
        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 2));
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.sin(p.rot * 2)) + 1);
        ctx.restore();
      }
      if (alive) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [active, reducedMotion]);

  if (!active) return null;
  return <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 z-[60] h-full w-full" />;
}
