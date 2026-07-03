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
 * Deterministic scatter: slots in a band around the board, shuffled by seed.
 * Multiplayer clients derive the same initial layout with zero sync traffic.
 */
export function scatterPositions(geom: PuzzleGeometry, seed: number, count: number): Vec2[] {
  const rng = createRng(seed ^ 0x9e3779b9);
  const slotW = geom.cellW * 1.35;
  const slotH = geom.cellH * 1.35;
  const gap = Math.max(geom.cellW, geom.cellH) * 0.55;

  const slots: Vec2[] = [];
  let ring = 0;
  while (slots.length < count && ring < 24) {
    const left = -gap - slotW * (ring + 1);
    const top = -gap - slotH * (ring + 1);
    const right = geom.width + gap + slotW * ring;
    const bottom = geom.height + gap + slotH * ring;
    const colsAcross = Math.ceil((right - left + slotW) / slotW);
    const rowsDown = Math.ceil((bottom - top - slotH) / slotH);
    for (let i = 0; i < colsAcross; i++) {
      slots.push({ x: left + i * slotW, y: top });
      slots.push({ x: left + i * slotW, y: bottom });
    }
    for (let i = 1; i < rowsDown; i++) {
      slots.push({ x: left, y: top + i * slotH });
      slots.push({ x: right, y: top + i * slotH });
    }
    ring++;
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
