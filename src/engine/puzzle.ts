import type { PieceSnapshot, PieceState, PuzzleGeometry, Vec2 } from "./types";
import { createRng, shuffleInPlace } from "./random";

export function createPieces(geom: PuzzleGeometry): PieceState[] {
  const { rows, cols } = geom.config;
  const pieces: PieceState[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const id = r * cols + c;
      const correct = { x: c * geom.cellW, y: r * geom.cellH };
      pieces.push({
        id,
        row: r,
        col: c,
        correct,
        pos: { ...correct },
        rot: 0,
        groupId: id,
        placed: false,
        z: id,
        isEdge: r === 0 || c === 0 || r === rows - 1 || c === cols - 1,
      });
    }
  }
  return pieces;
}

/**
 * Deterministic scatter: slot bands around the board, shuffled by seed.
 * Bands grow toward `viewAspect` (viewport width/height), so the tray fills
 * the screen shape — tall side columns on a widescreen, top/bottom rows on a
 * phone — instead of ringing the board uniformly. Multiplayer stores the
 * host's scatter in the room, so the aspect only shapes the initial layout.
 */
export function scatterPositions(
  geom: PuzzleGeometry,
  seed: number,
  count: number,
  viewAspect = 16 / 9,
): Vec2[] {
  const rng = createRng(seed ^ 0x9e3779b9);
  const slotW = geom.cellW * 1.35;
  const slotH = geom.cellH * 1.35;
  const gap = Math.max(geom.cellW, geom.cellH) * 0.55;

  // inner box: board + breathing gap
  const innerL = -gap;
  const innerT = -gap;
  const innerW = geom.width + 2 * gap;
  const innerH = geom.height + 2 * gap;

  // Greedily add side columns / top-bottom rows, always growing the
  // dimension that brings the scene's aspect closer to the viewport's.
  let colsL = 0;
  let colsR = 0;
  let rowsT = 0;
  let rowsB = 0;
  const sceneW = () => innerW + (colsL + colsR) * slotW;
  const sceneH = () => innerH + (rowsT + rowsB) * slotH;
  const capacity = () => {
    const down = Math.max(1, Math.floor(sceneH() / slotH));
    const across = Math.max(1, Math.floor(innerW / slotW));
    return (colsL + colsR) * down + (rowsT + rowsB) * across;
  };
  while (capacity() < count && colsL + colsR + rowsT + rowsB < 64) {
    if (sceneW() / sceneH() < viewAspect) {
      if (colsL <= colsR) colsL++;
      else colsR++;
    } else {
      if (rowsT <= rowsB) rowsT++;
      else rowsB++;
    }
  }

  const slots: Vec2[] = [];
  const top = innerT - rowsT * slotH;
  const down = Math.max(1, Math.floor(sceneH() / slotH));
  const across = Math.max(1, Math.floor(innerW / slotW));
  // side columns span the full scene height (they own the corners)
  for (let i = 1; i <= colsL; i++) {
    for (let j = 0; j < down; j++) slots.push({ x: innerL - i * slotW, y: top + j * slotH });
  }
  for (let i = 0; i < colsR; i++) {
    for (let j = 0; j < down; j++) slots.push({ x: innerL + innerW + i * slotW, y: top + j * slotH });
  }
  // top/bottom rows span the inner width only
  for (let j = 1; j <= rowsT; j++) {
    for (let i = 0; i < across; i++) slots.push({ x: innerL + i * slotW, y: innerT - j * slotH });
  }
  for (let j = 0; j < rowsB; j++) {
    for (let i = 0; i < across; i++) slots.push({ x: innerL + i * slotW, y: innerT + innerH + j * slotH });
  }

  shuffleInPlace(slots, rng);
  return slots.slice(0, count).map((s) => ({
    x: s.x + (rng() - 0.5) * geom.cellW * 0.3,
    y: s.y + (rng() - 0.5) * geom.cellH * 0.3,
  }));
}

export function toSnapshot(p: PieceState): PieceSnapshot {
  return { id: p.id, x: p.pos.x, y: p.pos.y, rot: p.rot, groupId: p.groupId, placed: p.placed, z: p.z };
}

export function applySnapshot(p: PieceState, s: PieceSnapshot): void {
  p.pos.x = s.x;
  p.pos.y = s.y;
  p.rot = s.rot;
  p.groupId = s.groupId;
  p.placed = s.placed;
  p.z = s.z;
}

/** Neighbor ids (up/down/left/right) within the grid, else -1 filtered out. */
export function neighborIds(geom: PuzzleGeometry, piece: PieceState): number[] {
  const { rows, cols } = geom.config;
  const out: number[] = [];
  if (piece.row > 0) out.push(piece.id - cols);
  if (piece.row < rows - 1) out.push(piece.id + cols);
  if (piece.col > 0) out.push(piece.id - 1);
  if (piece.col < cols - 1) out.push(piece.id + 1);
  return out;
}
