import { buildClusterPaths, buildPiecePath, spriteMargins, type GridCell } from "@/engine/geometry";
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

/** A merged sprite for a whole snapped-together group of pieces. */
export interface ClusterSprite {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  shadow: HTMLCanvasElement | OffscreenCanvas;
  mx: number;
  my: number;
  scale: number;
  /** Cell whose origin is the cluster-local (0,0) — the min row/col member. */
  originRow: number;
  originCol: number;
  /** Bounding size in cells. */
  cellRows: number;
  cellCols: number;
}

/** Total sprite pixel budget — keeps memory sane on 500+ piece puzzles. */
const PIXEL_BUDGET = 70_000_000;
/** Per-cluster pixel cap — big assembled clusters drop resolution gracefully. */
const CLUSTER_PIXEL_CAP = 24_000_000;

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

interface PaintArgs {
  geom: PuzzleGeometry;
  image: CanvasImageSource;
  /** Union silhouette (closed) — clip, fill, shadow. */
  fill: Path2D;
  /** Outer boundary segments — bevel + crisp cut line. */
  boundary: Path2D;
  /** Interior join segments — subtle seams; null for a single piece. */
  seams: Path2D | null;
  /** Seam darkness 0..1 for interior joins. */
  seamDarkness: number;
  /** Image-space origin of local (0,0) — cell origin of the top-left cell. */
  imgX: number;
  imgY: number;
  /** Local bounds (world units, margins included) — gloss + canvas size. */
  wWorld: number;
  hWorld: number;
  mx: number;
  my: number;
  scale: number;
}

/**
 * Paint the physical "die-cut cardboard" look shared by single pieces and
 * merged clusters: clipped image → glossy top light → double-pass bevel
 * (lit top-left, shaded bottom-right) along the OUTER boundary only →
 * subtle interior seams → crisp cut line. The render loop only blits the
 * result — that is the whole perf story.
 */
function paintSprite(args: PaintArgs): HTMLCanvasElement | OffscreenCanvas {
  const { geom, fill, boundary, seams, mx, my, wWorld, hWorld, scale } = args;
  const w = Math.max(1, Math.ceil(wWorld * scale));
  const h = Math.max(1, Math.ceil(hWorld * scale));
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  const rim = Math.max(1.4, Math.min(geom.cellW, geom.cellH) * 0.02);

  ctx.save();
  // Cell-local world coordinates: translate past the margin, then scale.
  ctx.scale(scale, scale);
  ctx.translate(mx, my);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  ctx.save();
  ctx.clip(fill);
  // Image pixels are world units, so the cell origin maps to local (0,0).
  ctx.drawImage(args.image, -args.imgX, -args.imgY);

  // Soft gloss: light falls from the top, grounding shade at the bottom.
  const gloss = ctx.createLinearGradient(0, -my, 0, hWorld - my);
  gloss.addColorStop(0, "rgba(255,255,255,0.14)");
  gloss.addColorStop(0.45, "rgba(255,255,255,0.02)");
  gloss.addColorStop(1, "rgba(30,20,15,0.08)");
  ctx.fillStyle = gloss;
  ctx.fillRect(-mx, -my, wWorld, hWorld);

  // Bevel along the outer boundary, two passes per side for a rounded edge:
  // lit from the top-left, shaded toward the bottom-right — the joined
  // pieces read as one slab because interior seams get none of this.
  ctx.save();
  ctx.translate(rim * 0.8, rim * 1.0);
  ctx.strokeStyle = "rgba(255,255,255,0.34)";
  ctx.lineWidth = rim * 2.4;
  ctx.stroke(boundary);
  ctx.restore();
  ctx.save();
  ctx.translate(rim * 0.4, rim * 0.5);
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = rim * 1.0;
  ctx.stroke(boundary);
  ctx.restore();
  ctx.save();
  ctx.translate(-rim * 0.8, -rim * 1.0);
  ctx.strokeStyle = "rgba(35,24,18,0.28)";
  ctx.lineWidth = rim * 2.4;
  ctx.stroke(boundary);
  ctx.restore();
  ctx.save();
  ctx.translate(-rim * 0.4, -rim * 0.5);
  ctx.strokeStyle = "rgba(35,24,18,0.24)";
  ctx.lineWidth = rim * 1.0;
  ctx.stroke(boundary);
  ctx.restore();

  // Interior joins: embossed relief like flush-fitting cardboard — a lit
  // lip toward the light, a shaded lip away from it, and a crisp cut line
  // between. Each piece stays readable inside the blob; only the outer
  // bevel and the drop shadow are unified.
  if (seams && args.seamDarkness > 0) {
    const k = args.seamDarkness;
    ctx.save();
    ctx.translate(rim * 0.5, rim * 0.6);
    ctx.strokeStyle = `rgba(255,255,255,${(0.42 * k).toFixed(3)})`;
    ctx.lineWidth = rim * 1.4;
    ctx.stroke(seams);
    ctx.restore();
    ctx.save();
    ctx.translate(-rim * 0.5, -rim * 0.6);
    ctx.strokeStyle = `rgba(35,24,18,${(0.3 * k).toFixed(3)})`;
    ctx.lineWidth = rim * 1.4;
    ctx.stroke(seams);
    ctx.restore();
    ctx.strokeStyle = `rgba(40,28,20,${(0.42 * k).toFixed(3)})`;
    ctx.lineWidth = rim * 0.4;
    ctx.stroke(seams);
  }
  ctx.restore(); // clip

  // Crisp die-cut line — outer boundary only.
  ctx.strokeStyle = "rgba(40,28,20,0.35)";
  ctx.lineWidth = rim * 0.45;
  ctx.stroke(boundary);
  ctx.restore();

  return canvas;
}

/** Quarter-res blurred silhouette — the resting drop shadow. */
function paintShadow(
  geom: PuzzleGeometry,
  fill: Path2D,
  wWorld: number,
  hWorld: number,
  mx: number,
  my: number,
  scale: number,
): HTMLCanvasElement | OffscreenCanvas {
  const rim = Math.max(1.4, Math.min(geom.cellW, geom.cellH) * 0.02);
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
  sctx.shadowColor = "rgba(25,18,14,0.5)";
  sctx.shadowBlur = rim * 2.0 * shScale * 3; // device px
  sctx.shadowOffsetX = off * shScale;
  sctx.translate(-off, 0);
  sctx.fillStyle = "#000";
  sctx.fill(fill);
  sctx.restore();
  return shadow;
}

/** Pre-render one loose piece: full bevel + cut line around its outline. */
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
  const path = buildPiecePath(geom, row, col);
  const { fill, boundary } = buildClusterPaths(geom, [{ row, col }], row, col);
  const canvas = paintSprite({
    geom,
    image,
    fill,
    boundary,
    seams: null,
    seamDarkness: 0,
    imgX: col * geom.cellW,
    imgY: row * geom.cellH,
    wWorld,
    hWorld,
    mx,
    my,
    scale,
  });
  const shadow = paintShadow(geom, fill, wWorld, hWorld, mx, my, scale);
  return { canvas, shadow, mx, my, scale, path };
}

/**
 * Pre-render a snapped-together group as ONE slab: union-clipped image,
 * bevel and cut line only along the group's outer boundary, faint seams on
 * the interior joins, and a single union drop shadow — so joined pieces
 * bake together visually instead of stacking loose-piece bevels.
 */
export function renderClusterSprite(
  geom: PuzzleGeometry,
  image: CanvasImageSource,
  members: readonly GridCell[],
  baseScale: number,
  seamDarkness: number,
): ClusterSprite {
  const { mx, my } = spriteMargins(geom);
  let minRow = Infinity;
  let minCol = Infinity;
  let maxRow = -Infinity;
  let maxCol = -Infinity;
  for (const m of members) {
    minRow = Math.min(minRow, m.row);
    minCol = Math.min(minCol, m.col);
    maxRow = Math.max(maxRow, m.row);
    maxCol = Math.max(maxCol, m.col);
  }
  const cellRows = maxRow - minRow + 1;
  const cellCols = maxCol - minCol + 1;
  const wWorld = cellCols * geom.cellW + 2 * mx;
  const hWorld = cellRows * geom.cellH + 2 * my;
  const scale = Math.min(baseScale, Math.sqrt(CLUSTER_PIXEL_CAP / (wWorld * hWorld)));

  const { fill, boundary, seams } = buildClusterPaths(geom, members, minRow, minCol);
  const canvas = paintSprite({
    geom,
    image,
    fill,
    boundary,
    seams,
    seamDarkness,
    imgX: minCol * geom.cellW,
    imgY: minRow * geom.cellH,
    wWorld,
    hWorld,
    mx,
    my,
    scale,
  });
  const shadow = paintShadow(geom, fill, wWorld, hWorld, mx, my, scale);
  return { canvas, shadow, mx, my, scale, originRow: minRow, originCol: minCol, cellRows, cellCols };
}
