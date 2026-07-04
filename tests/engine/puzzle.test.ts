import { describe, expect, test } from "vitest";
import { createGeometry } from "@/engine/geometry";
import { applySnapshot, createPieces, edgesComplete, neighborIds, scatterPositions, toSnapshot } from "@/engine/puzzle";
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

  test("scatter fills the viewport shape, not a uniform ring", () => {
    const bounds = (spots: ReturnType<typeof scatterPositions>) => {
      let minX = 0, maxX = geom.width, minY = 0, maxY = geom.height;
      for (const s of spots) {
        minX = Math.min(minX, s.x);
        maxX = Math.max(maxX, s.x + geom.cellW);
        minY = Math.min(minY, s.y);
        maxY = Math.max(maxY, s.y + geom.cellH);
      }
      return (maxX - minX) / (maxY - minY);
    };
    const wide = bounds(scatterPositions(geom, 7, 48, 21 / 9));
    const tall = bounds(scatterPositions(geom, 7, 48, 9 / 21));
    // widescreen scatter spreads sideways; phone scatter stacks vertically
    expect(wide).toBeGreaterThan(1.5);
    expect(tall).toBeLessThan(1);
    expect(wide).toBeGreaterThan(tall);
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

describe("edgesComplete", () => {
  const pc = (isEdge: boolean, placed: boolean, groupId: number) => ({ isEdge, placed, groupId });

  test("classic: true only when every edge piece is placed", () => {
    const pieces = [pc(true, true, 0), pc(true, true, 1), pc(false, false, 2)];
    expect(edgesComplete(pieces, false)).toBe(true);
  });

  test("classic: false while any edge piece is loose", () => {
    const pieces = [pc(true, true, 0), pc(true, false, 1), pc(false, false, 2)];
    expect(edgesComplete(pieces, false)).toBe(false);
  });

  test("freeform: true when all edge pieces share one group", () => {
    const pieces = [pc(true, false, 7), pc(true, false, 7), pc(false, false, 2)];
    expect(edgesComplete(pieces, true)).toBe(true);
  });

  test("freeform: false when the border sits in two chunks", () => {
    const pieces = [pc(true, false, 7), pc(true, false, 8), pc(false, false, 2)];
    expect(edgesComplete(pieces, true)).toBe(false);
  });

  test("no edge pieces at all counts as not complete", () => {
    expect(edgesComplete([pc(false, false, 0)], false)).toBe(false);
    expect(edgesComplete([], true)).toBe(false);
  });
});
