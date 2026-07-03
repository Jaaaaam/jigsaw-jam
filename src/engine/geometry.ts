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
  const t = range(rng, 0.07, 0.14); // tab half-width (neck size)
  // Apex height sampled independently of the neck, so skinny-neck/big-head
  // and wide-neck/stubby knobs both occur — like a real die-cut sheet.
  const apex = range(rng, 0.26, 0.42); // bulb apex height, fraction of cell
  const bulb = apex / t; // bulb height in units of t
  const ear = range(rng, 1.35, 2.6); // bulb roundness / ear spread, in units of t
  const b = range(rng, -0.09, 0.09); // tab centre shifted along the edge
  const j = 0.04; // organic jitter
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

/**
 * Orient the grid to the image: presets assume landscape (rows < cols), so a
 * portrait photo would otherwise get tall skinny cells. Swap rows/cols when
 * the swapped grid makes cells closer to square. Deterministic from config +
 * image size, so every client and every save derives the same grid.
 */
function orientConfig(config: PuzzleConfig, width: number, height: number): PuzzleConfig {
  // |log| of cell aspect (cellW/cellH) — 0 is a perfect square
  const skew = (rows: number, cols: number) => Math.abs(Math.log((width * rows) / (height * cols)));
  if (skew(config.cols, config.rows) < skew(config.rows, config.cols)) {
    return { ...config, rows: config.cols, cols: config.rows };
  }
  return config;
}

export function createGeometry(
  rawConfig: PuzzleConfig,
  seed: number,
  width: number,
  height: number,
): PuzzleGeometry {
  const config = orientConfig(rawConfig, width, height);
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
    // Max tab extent is apex + jitter ≈ 0.42 + 0.04 = 0.46 of the
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
  const path = new Path2D();
  appendPieceOutline(path, geom, row, col, col * geom.cellW, row * geom.cellH);
  return path;
}

/** Append one piece's closed outline as a subpath, offset by (ox, oy). */
function appendPieceOutline(path: Path2D, geom: PuzzleGeometry, row: number, col: number, ox: number, oy: number): void {
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
}

export interface GridCell {
  row: number;
  col: number;
}

export interface ClusterEdges {
  /** Outer boundary edges of the cluster — get the bevel and the cut line. */
  boundary: EdgePath[];
  /** Interior edges between member cells — get only a subtle seam. */
  seams: EdgePath[];
}

/**
 * Split a cluster's cell edges into outer boundary vs interior seams.
 * An edge is a seam when the cells on both of its sides are members.
 */
export function classifyClusterEdges(geom: PuzzleGeometry, members: readonly GridCell[]): ClusterEdges {
  const cols = geom.config.cols;
  const has = new Set(members.map((m) => m.row * cols + m.col));
  const inCluster = (r: number, c: number) => has.has(r * cols + c);
  const boundary: EdgePath[] = [];
  const seams: EdgePath[] = [];
  for (const { row, col } of members) {
    // top/left seams are claimed by the lower/right member, so each interior
    // edge lands in `seams` exactly once
    if (inCluster(row - 1, col)) seams.push(geom.horizontal[row]![col]!);
    else boundary.push(geom.horizontal[row]![col]!);
    if (inCluster(row, col - 1)) seams.push(geom.vertical[row]![col]!);
    else boundary.push(geom.vertical[row]![col]!);
    if (!inCluster(row + 1, col)) boundary.push(geom.horizontal[row + 1]![col]!);
    if (!inCluster(row, col + 1)) boundary.push(geom.vertical[row]![col + 1]!);
  }
  return { boundary, seams };
}

export interface ClusterPaths {
  /** Union silhouette of all member pieces — clip/fill/shadow. */
  fill: Path2D;
  /** Open segments along the outer boundary — bevel + cut line strokes. */
  boundary: Path2D;
  /** Open segments along interior joins — seam strokes. */
  seams: Path2D;
}

function edgeSegments(edges: EdgePath[], ox: number, oy: number): Path2D {
  const path = new Path2D();
  for (const edge of edges) {
    path.moveTo(edge.from.x - ox, edge.from.y - oy);
    appendForward(path, edge, ox, oy);
  }
  return path;
}

/**
 * Cluster outline paths in cluster-local coordinates: (0,0) is the cell
 * origin of (originRow, originCol). Member piece outlines share their border
 * curves exactly, so a nonzero fill of the combined subpaths is the union.
 */
export function buildClusterPaths(
  geom: PuzzleGeometry,
  members: readonly GridCell[],
  originRow: number,
  originCol: number,
): ClusterPaths {
  const ox = originCol * geom.cellW;
  const oy = originRow * geom.cellH;
  const fill = new Path2D();
  for (const m of members) appendPieceOutline(fill, geom, m.row, m.col, ox, oy);
  const { boundary, seams } = classifyClusterEdges(geom, members);
  return {
    fill,
    boundary: edgeSegments(boundary, ox, oy),
    seams: edgeSegments(seams, ox, oy),
  };
}

/** Sprite margins (tab overhang) in world units, per axis. */
export function spriteMargins(geom: PuzzleGeometry): { mx: number; my: number } {
  if (geom.config.shape === "square") return { mx: 0, my: 0 };
  return { mx: geom.margin * geom.cellW, my: geom.margin * geom.cellH };
}
