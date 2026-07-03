import { describe, expect, test } from "vitest";
import { classifyClusterEdges, createGeometry, spriteMargins } from "@/engine/geometry";
import { DEFAULT_CONFIG, type PuzzleConfig } from "@/engine/types";

const config: PuzzleConfig = { ...DEFAULT_CONFIG, rows: 4, cols: 6 };

describe("createGeometry", () => {
  test("edge grids have the right dimensions", () => {
    const g = createGeometry(config, 1, 1200, 800);
    expect(g.horizontal).toHaveLength(config.rows + 1);
    expect(g.horizontal[0]).toHaveLength(config.cols);
    expect(g.vertical).toHaveLength(config.rows);
    expect(g.vertical[0]).toHaveLength(config.cols + 1);
    expect(g.cellW).toBe(1200 / config.cols);
    expect(g.cellH).toBe(800 / config.rows);
  });

  test("border edges are straight, interior edges are curved", () => {
    const g = createGeometry(config, 1, 1200, 800);
    // top + bottom borders
    for (let c = 0; c < config.cols; c++) {
      expect(g.horizontal[0]![c]!.cubics).toHaveLength(0);
      expect(g.horizontal[config.rows]![c]!.cubics).toHaveLength(0);
    }
    // an interior edge is three cubics (approach, bulb, return)
    expect(g.horizontal[1]![0]!.cubics).toHaveLength(3);
    expect(g.vertical[0]![1]!.cubics).toHaveLength(3);
    // left + right borders
    for (let r = 0; r < config.rows; r++) {
      expect(g.vertical[r]![0]!.cubics).toHaveLength(0);
      expect(g.vertical[r]![config.cols]!.cubics).toHaveLength(0);
    }
  });

  test("same seed → identical geometry (multiplayer invariant)", () => {
    const a = createGeometry(config, 777, 1200, 800);
    const b = createGeometry(config, 777, 1200, 800);
    expect(JSON.stringify(a.horizontal)).toBe(JSON.stringify(b.horizontal));
    expect(JSON.stringify(a.vertical)).toBe(JSON.stringify(b.vertical));
  });

  test("different seeds → different tab shapes", () => {
    const a = createGeometry(config, 1, 1200, 800);
    const b = createGeometry(config, 2, 1200, 800);
    expect(JSON.stringify(a.horizontal)).not.toBe(JSON.stringify(b.horizontal));
  });

  test("tab curves stay within the sprite margin", () => {
    const g = createGeometry(config, 123, 1200, 800);
    const { my } = spriteMargins(g);
    for (const row of g.horizontal) {
      for (const edge of row) {
        for (const c of edge.cubics) {
          for (const pt of [c.c1, c.c2, c.to]) {
            expect(Math.abs(pt.y - edge.from.y)).toBeLessThanOrEqual(my);
          }
        }
      }
    }
  });

  test("tab shapes vary between edges (size, position, bulb height)", () => {
    const g = createGeometry(config, 9, 1200, 800);
    // interior horizontal edges: measure tab half-width (|toy| of the first
    // cubic ≈ t) and bulb apex height (|c1y| of the bulb cubic ≈ bulb·t)
    const widths: number[] = [];
    const apexes: number[] = [];
    for (let r = 1; r < config.rows; r++) {
      for (let c = 0; c < config.cols; c++) {
        const cubics = g.horizontal[r]![c]!.cubics;
        const y0 = g.horizontal[r]![c]!.from.y;
        widths.push(Math.abs(cubics[0]!.to.y - y0));
        apexes.push(Math.abs(cubics[1]!.c1.y - y0));
      }
    }
    // wide per-edge parameter ranges → real spread, not near-identical tabs
    expect(Math.max(...widths) - Math.min(...widths)).toBeGreaterThan(g.cellH * 0.02);
    expect(Math.max(...apexes) - Math.min(...apexes)).toBeGreaterThan(g.cellH * 0.05);
  });

  test("portrait images swap the grid so cells stay near-square", () => {
    // landscape preset (4x6) on a portrait 800x1200 photo → 6x4
    const g = createGeometry(config, 1, 800, 1200);
    expect(g.config.rows).toBe(6);
    expect(g.config.cols).toBe(4);
    expect(g.config.rows * g.config.cols).toBe(config.rows * config.cols);
    // cells are square either way on these dimensions
    expect(g.cellW / g.cellH).toBeCloseTo(1, 1);
    // landscape photo keeps the preset orientation
    const l = createGeometry(config, 1, 1200, 800);
    expect(l.config.rows).toBe(4);
    expect(l.config.cols).toBe(6);
  });

  test("cluster edges: two horizontal neighbours share one seam", () => {
    const g = createGeometry(config, 1, 1200, 800);
    // cells (1,1) and (1,2) joined side by side
    const { boundary, seams } = classifyClusterEdges(g, [
      { row: 1, col: 1 },
      { row: 1, col: 2 },
    ]);
    expect(seams).toHaveLength(1);
    // the seam is the vertical edge between col 1 and col 2
    expect(seams[0]).toBe(g.vertical[1]![2]!);
    // outer boundary: 2 tops + 2 bottoms + 1 left + 1 right
    expect(boundary).toHaveLength(6);
    expect(boundary).toContain(g.horizontal[1]![1]!);
    expect(boundary).toContain(g.vertical[1]![1]!);
    expect(boundary).toContain(g.vertical[1]![3]!);
    expect(boundary).not.toContain(g.vertical[1]![2]!);
  });

  test("cluster edges: 2x2 block has four seams and eight boundary edges", () => {
    const g = createGeometry(config, 1, 1200, 800);
    const { boundary, seams } = classifyClusterEdges(g, [
      { row: 1, col: 1 },
      { row: 1, col: 2 },
      { row: 2, col: 1 },
      { row: 2, col: 2 },
    ]);
    expect(seams).toHaveLength(4);
    expect(boundary).toHaveLength(8);
    // no edge appears twice
    expect(new Set([...boundary, ...seams]).size).toBe(12);
  });

  test("cluster edges: single piece is all boundary, no seams", () => {
    const g = createGeometry(config, 1, 1200, 800);
    const { boundary, seams } = classifyClusterEdges(g, [{ row: 0, col: 0 }]);
    expect(seams).toHaveLength(0);
    expect(boundary).toHaveLength(4);
  });

  test("square shape has no curved edges", () => {
    const g = createGeometry({ ...config, shape: "square" }, 1, 1200, 800);
    for (const row of [...g.horizontal, ...g.vertical]) {
      for (const edge of row) expect(edge.cubics).toHaveLength(0);
    }
    expect(spriteMargins(g)).toEqual({ mx: 0, my: 0 });
  });
});
