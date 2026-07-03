import { buildPiecePath, spriteMargins } from "@/engine/geometry";
import type { PuzzleGeometry } from "@/engine/types";

export interface PieceSprite {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  /** Pre-blurred silhouette drawn under loose pieces — depth for free. */
  shadow: HTMLCanvasElement | OffscreenCanvas;
  /** World-unit margins baked around the cell (tab overhang). */
  mx: number;
  my: number;
  /** Sprite pixels per world unit. */
  scale: number;
  path: Path2D;
}

/** Total sprite pixel budget — keeps memory sane on 500+ piece puzzles. */
const PIXEL_BUDGET = 70_000_000;

export function computeSpriteScale(geom: PuzzleGeometry, pieceCount: number): number {
  const { mx, my } = spriteMargins(geom);
  const w = geom.cellW + 2 * mx;
  const h = geom.cellH + 2 * my;
  const ideal = Math.min(2, Math.max(1, globalThis.devicePixelRatio || 1));
  const budgetScale = Math.sqrt(PIXEL_BUDGET / (pieceCount * w * h));
  return Math.min(ideal, budgetScale, 1.5);
}

function makeCanvas(w: number, h: number): HTMLCanvasElement | OffscreenCanvas {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

/**
 * Pre-render one piece with a physical "die-cut cardboard" look:
 * clipped image → glossy top light → double-pass bevel (lit top-left,
 * shaded bottom-right) → crisp cut line. A separate low-res blurred
 * silhouette provides the resting drop shadow. The render loop only
 * blits these — that is the whole perf story.
 */
export function renderPieceSprite(
  geom: PuzzleGeometry,
  image: CanvasImageSource,
  row: number,
  col: number,
  scale: number,
): PieceSprite {
  const { mx, my } = spriteMargins(geom);
  const wWorld = geom.cellW + 2 * mx;
  const hWorld = geom.cellH + 2 * my;
  const w = Math.max(1, Math.ceil(wWorld * scale));
  const h = Math.max(1, Math.ceil(hWorld * scale));
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  const path = buildPiecePath(geom, row, col);
  const rim = Math.max(1.4, Math.min(geom.cellW, geom.cellH) * 0.02);

  ctx.save();
  // Cell-local world coordinates: translate past the margin, then scale.
  ctx.scale(scale, scale);
  ctx.translate(mx, my);

  ctx.save();
  ctx.clip(path);
  // Image pixels are world units, so the cell origin maps to local (0,0).
  ctx.drawImage(image, -col * geom.cellW, -row * geom.cellH);

  // Soft gloss: light falls from the top, grounding shade at the bottom.
  const gloss = ctx.createLinearGradient(0, -my, 0, geom.cellH + my);
  gloss.addColorStop(0, "rgba(255,255,255,0.16)");
  gloss.addColorStop(0.45, "rgba(255,255,255,0.02)");
  gloss.addColorStop(1, "rgba(20,10,40,0.10)");
  ctx.fillStyle = gloss;
  ctx.fillRect(-mx, -my, wWorld, hWorld);

  // Bevel, two passes each side for a rounded-edge feel.
  ctx.lineJoin = "round";
  ctx.save();
  ctx.translate(rim * 0.9, rim * 1.1);
  ctx.strokeStyle = "rgba(255,255,255,0.38)";
  ctx.lineWidth = rim * 2.6;
  ctx.stroke(path);
  ctx.restore();
  ctx.save();
  ctx.translate(rim * 0.45, rim * 0.55);
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = rim * 1.1;
  ctx.stroke(path);
  ctx.restore();
  ctx.save();
  ctx.translate(-rim * 0.9, -rim * 1.1);
  ctx.strokeStyle = "rgba(15,8,30,0.34)";
  ctx.lineWidth = rim * 2.6;
  ctx.stroke(path);
  ctx.restore();
  ctx.save();
  ctx.translate(-rim * 0.45, -rim * 0.55);
  ctx.strokeStyle = "rgba(15,8,30,0.28)";
  ctx.lineWidth = rim * 1.1;
  ctx.stroke(path);
  ctx.restore();
  ctx.restore(); // clip

  // Crisp die-cut line.
  ctx.strokeStyle = "rgba(25,15,45,0.4)";
  ctx.lineWidth = rim * 0.55;
  ctx.stroke(path);
  ctx.restore();

  // ---- resting drop shadow: quarter-res blurred silhouette --------------
  const shScale = scale / 3;
  const sw = Math.max(1, Math.ceil(wWorld * shScale));
  const sh = Math.max(1, Math.ceil(hWorld * shScale));
  const shadow = makeCanvas(sw, sh);
  const sctx = shadow.getContext("2d") as CanvasRenderingContext2D;
  sctx.save();
  sctx.scale(shScale, shScale);
  sctx.translate(mx, my);
  // Offset trick: draw the fill far off-canvas and pull only its blurred
  // shadow back into frame, leaving a pure soft silhouette.
  const off = 10000;
  sctx.shadowColor = "rgba(18,10,38,0.55)";
  sctx.shadowBlur = rim * 2.2 * shScale * 3; // device px
  sctx.shadowOffsetX = off * shScale;
  sctx.translate(-off, 0);
  sctx.fillStyle = "#000";
  sctx.fill(path);
  sctx.restore();

  return { canvas, shadow, mx, my, scale, path };
}
