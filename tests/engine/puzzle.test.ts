import { describe, expect, test } from "vitest";
import { createGeometry } from "@/engine/geometry";
import { applySnapshot, createPieces, neighborIds, scatterPositions, toSnapshot } from "@/engine/puzzle";
import { DEFAULT_CONFIG, type PuzzleConfig } from "@/engine/types";

const config: PuzzleConfig = { ...DEFAULT_CONFIG, rows: 3, cols: 4 };
const geom = createGeometry(config, 5, 1200, 900);

describe("createPieces", () => {
  test("creates rows*cols pieces at their correct positions", () => {
    const pieces = createPieces(geom);
    expect(pieces).toHaveLength(12);
    const p = pieces[5]!; // row 1, col 1
    expect(p.row).toBe(1);
    expect(p.col).toBe(1);
    expect(p.correct).toEqual({ x: geom.cellW, y: geom.cellH });
    expect(p.pos).toEqual(p.correct);
  });

  test("flags edge pieces correctly", () => {
    const pieces = createPieces(geom);
    const edges = pieces.filter((p) => p.isEdge);
    // 3x4 grid: everything except the two interior pieces is an edge
    expect(edges).toHaveLength(10);
    expect(pieces[5]!.isEdge).toBe(false);
    expect(pieces[6]!.isEdge).toBe(false);
  });
});

describe("scatterPositions", () => {
  test("is deterministic per seed and covers all pieces", () => {
    const a = scatterPositions(geom, 42, 12);
    const b = scatterPositions(geom, 42, 12);
    expect(a).toEqual(b);
    expect(a).toHaveLength(12);
  });

  test("all slots land outside the board", () => {
    const spots = scatterPositions(geom, 42, 12);
    for (const s of spots) {
      const inside =
        s.x > 0 && s.x + geom.cellW < geom.width && s.y > 0 && s.y + geom.cellH < geom.height;
      expect(inside).toBe(false);
    }
  });
});

describe("snapshots", () => {
  test("round-trips piece state", () => {
    const [piece] = createPieces(geom);
    piece!.pos = { x: 123, y: 456 };
    piece!.rot = 3;
    piece!.groupId = 7;
    piece!.placed = true;
    piece!.z = 99;
    const snap = toSnapshot(piece!);
    const [fresh] = createPieces(geom);
    applySnapshot(fresh!, snap);
    expect(fresh!.pos).toEqual({ x: 123, y: 456 });
    expect(fresh!.rot).toBe(3);
    expect(fresh!.groupId).toBe(7);
    expect(fresh!.placed).toBe(true);
    expect(fresh!.z).toBe(99);
  });
});

describe("neighborIds", () => {
  test("corner piece has two neighbours", () => {
    const pieces = createPieces(geom);
    expect(neighborIds(geom, pieces[0]!).sort()).toEqual([1, 4]);
  });

  test("interior piece has four neighbours", () => {
    const pieces = createPieces(geom);
    expect(neighborIds(geom, pieces[5]!).sort((a, b) => a - b)).toEqual([1, 4, 6, 9]);
  });
});
