import type { Cubic, EdgePath, PuzzleGeometry, PuzzleConfig, Vec2 } from "./types";
import { createRng, range } from "./random";

/**
 * Classic jigsaw edge in unit space: x runs 0→1 along the edge, y is the
 * perpendicular offset (scaled by the neighboring cell size). Three cubics:
 * approach, bulb, return. Based on the well-known parametric tab curve.
 */
interface UnitCubic {
  c1x: number;
  c1y: number;
  c2x: number;
  c2y: number;
  tox: number;
  toy: number;
}

function unitTabCurve(rng: () => number): UnitCubic[] {
  // Per-edge cut personality — wide ranges so neighbouring cuts rarely twin up.
  const t = range(rng, 0.08, 0.13); // tab half-width (neck size)
  const bulb = range(rng, 2.6, 3.4); // bulb height, in units of t (was fixed 3)
  const ear = range(rng, 1.6, 2.4); // bulb roundness / ear spread, in units of t (was fixed 2)
  const b = range(rng, -0.08, 0.08); // tab centre shifted along the edge
  const j = 0.035; // organic jitter
  const a = range(rng, -j, j);
  const c = range(rng, -j, j);
  const d = range(rng, -j, j);
  const e = range(rng, -j, j);
  const sign = rng() < 0.5 ? 1 : -1;
  const s = (y: number) => y * sign;
  return [
    { c1x: 0.2, c1y: s(a), c2x: 0.5 + b + d, c2y: s(-t + c), tox: 0.5 - t + b, toy: s(t + c) },
    {
      c1x: 0.5 - ear * t + b - d,
      c1y: s(bulb * t + c),
      c2x: 0.5 + ear * t + b - d,
      c2y: s(bulb * t + c),
      tox: 0.5 + t + b,
      toy: s(t + c),
    },
    { c1x: 0.5 + b + d, c1y: s(-t + c), c2x: 0.8, c2y: s(e), tox: 1, toy: 0 },
  ];
}

function mapEdge(
  from: Vec2,
  dir: Vec2,
  perp: Vec2,
  perpSize: number,
  unit: UnitCubic[],
): Cubic[] {
  const pt = (u: number, v: number): Vec2 => ({
    x: from.x + dir.x * u + perp.x * v * perpSize,
    y: from.y + dir.y * u + perp.y * v * perpSize,
  });
  return unit.map((s) => ({
    c1: pt(s.c1x, s.c1y),
    c2: pt(s.c2x, s.c2y),
    to: pt(s.tox, s.toy),
  }));
}

export function createGeometry(
  config: PuzzleConfig,
  seed: number,
  width: number,
  height: number,
): PuzzleGeometry {
  const { rows, cols, shape } = config;
  const rng = createRng(seed);
  const cellW = width / cols;
  const cellH = height / rows;
  const curved = shape === "classic";

  const horizontal: EdgePath[][] = [];
  for (let r = 0; r <= rows; r++) {
    const row: EdgePath[] = [];
    for (let c = 0; c < cols; c++) {
      const from = { x: c * cellW, y: r * cellH };
      const to = { x: (c + 1) * cellW, y: r * cellH };
      const interior = curved && r > 0 && r < rows;
      row.push({
        from,
        to,
        cubics: interior ? mapEdge(from, { x: cellW, y: 0 }, { x: 0, y: 1 }, cellH, unitTabCurve(rng)) : [],
      });
    }
    horizontal.push(row);
  }

  const vertical: EdgePath[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: EdgePath[] = [];
    for (let c = 0; c <= cols; c++) {
      const from = { x: c * cellW, y: r * cellH };
      const to = { x: c * cellW, y: (r + 1) * cellH };
      const interior = curved && c > 0 && c < cols;
      row.push({
        from,
        to,
        cubics: interior ? mapEdge(from, { x: 0, y: cellH }, { x: 1, y: 0 }, cellW, unitTabCurve(rng)) : [],
      });
    }
    vertical.push(row);
  }

  return {
    config,
    seed,
    width,
    height,
    cellW,
    cellH,
    // Max tab extent is bulb·t + jitter ≈ 3.4·0.13 + 0.035 ≈ 0.48 of the
    // perpendicular cell size (control-point bound; the curve stays inside).
    margin: 0.48,
    horizontal,
    vertical,
  };
}

function appendForward(path: Path2D, edge: EdgePath, ox: number, oy: number): void {
  if (edge.cubics.length === 0) {
    path.lineTo(edge.to.x - ox, edge.to.y - oy);
    return;
  }
  for (const s of edge.cubics) {
    path.bezierCurveTo(s.c1.x - ox, s.c1.y - oy, s.c2.x - ox, s.c2.y - oy, s.to.x - ox, s.to.y - oy);
  }
}

function appendReversed(path: Path2D, edge: EdgePath, ox: number, oy: number): void {
  if (edge.cubics.length === 0) {
    path.lineTo(edge.from.x - ox, edge.from.y - oy);
    return;
  }
  for (let i = edge.cubics.length - 1; i >= 0; i--) {
    const s = edge.cubics[i]!;
    const prevEnd = i === 0 ? edge.from : edge.cubics[i - 1]!.to;
    path.bezierCurveTo(s.c2.x - ox, s.c2.y - oy, s.c1.x - ox, s.c1.y - oy, prevEnd.x - ox, prevEnd.y - oy);
  }
}

/**
 * Piece outline in cell-local coordinates ((0,0) = the piece's cell origin).
 * Callers position it with canvas transforms.
 */
export function buildPiecePath(geom: PuzzleGeometry, row: number, col: number): Path2D {
  const ox = col * geom.cellW;
  const oy = row * geom.cellH;
  const path = new Path2D();
  const top = geom.horizontal[row]![col]!;
  const right = geom.vertical[row]![col + 1]!;
  const bottom = geom.horizontal[row + 1]![col]!;
  const left = geom.vertical[row]![col]!;
  path.moveTo(top.from.x - ox, top.from.y - oy);
  appendForward(path, top, ox, oy);
  appendForward(path, right, ox, oy);
  appendReversed(path, bottom, ox, oy);
  appendReversed(path, left, ox, oy);
  path.closePath();
  return path;
}

/** Sprite margins (tab overhang) in world units, per axis. */
export function spriteMargins(geom: PuzzleGeometry): { mx: number; my: number } {
  if (geom.config.shape === "square") return { mx: 0, my: 0 };
  return { mx: geom.margin * geom.cellW, my: geom.margin * geom.cellH };
}
