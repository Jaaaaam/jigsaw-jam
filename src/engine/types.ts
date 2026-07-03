export interface Vec2 {
  x: number;
  y: number;
}

export type PieceShape = "classic" | "square";

export type DifficultyId = "easy" | "medium" | "hard" | "expert" | "custom";

export interface PuzzleConfig {
  rows: number;
  cols: number;
  shape: PieceShape;
  /** Snap distance as a fraction of piece size (0.1 = tight, 0.5 = forgiving). */
  snapTolerance: number;
  /** Pieces spawn with random 90° rotations and must be rotated back. */
  rotationEnabled: boolean;
  /** Interior pieces start stashed until the frame is complete. */
  edgesFirst: boolean;
  /** No timer pressure; timer hidden. */
  casual: boolean;
}

/** One cubic bezier segment in absolute world coordinates. */
export interface Cubic {
  c1: Vec2;
  c2: Vec2;
  to: Vec2;
}

/** An edge between two grid points: a line or a chain of cubics. */
export interface EdgePath {
  from: Vec2;
  to: Vec2;
  /** Empty for straight (border/square) edges. */
  cubics: Cubic[];
}

export interface PieceState {
  /** row * cols + col — stable across clients sharing a seed. */
  id: number;
  row: number;
  col: number;
  /** Cell-origin position when correctly placed, in world (image) coords. */
  correct: Vec2;
  /** Current cell-origin position in world coords. */
  pos: Vec2;
  /** Quarter turns clockwise. */
  rot: 0 | 1 | 2 | 3;
  groupId: number;
  placed: boolean;
  z: number;
  isEdge: boolean;
}

/** Serializable snapshot of the dynamic state, for saves and network sync. */
export interface PieceSnapshot {
  id: number;
  x: number;
  y: number;
  rot: 0 | 1 | 2 | 3;
  groupId: number;
  placed: boolean;
  z: number;
}

export interface PuzzleGeometry {
  config: PuzzleConfig;
  seed: number;
  /** World size — matches the (capped) source image. */
  width: number;
  height: number;
  cellW: number;
  cellH: number;
  /** Sprite bounds margin around a cell, in world units (tab overhang). */
  margin: number;
  /** horizontal[r][c] separates (r-1,c) and (r,c); r in 0..rows. */
  horizontal: EdgePath[][];
  /** vertical[r][c] separates (r,c-1) and (r,c); c in 0..cols. */
  vertical: EdgePath[][];
}

export const DIFFICULTY_PRESETS: Record<
  Exclude<DifficultyId, "custom">,
  { label: string; rows: number; cols: number; blurb: string }
> = {
  easy: { label: "Easy", rows: 3, cols: 4, blurb: "12 pieces · a gentle warm-up" },
  medium: { label: "Medium", rows: 6, cols: 8, blurb: "48 pieces · a cozy session" },
  hard: { label: "Hard", rows: 9, cols: 12, blurb: "108 pieces · a real puzzle" },
  expert: { label: "Expert", rows: 15, cols: 20, blurb: "300 pieces · settle in" },
};

export const DEFAULT_CONFIG: PuzzleConfig = {
  rows: 6,
  cols: 8,
  shape: "classic",
  snapTolerance: 0.28,
  rotationEnabled: false,
  edgesFirst: false,
  casual: false,
};
