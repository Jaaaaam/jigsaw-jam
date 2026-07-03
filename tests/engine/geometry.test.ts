import { describe, expect, test } from "vitest";
import { createGeometry, spriteMargins } from "@/engine/geometry";
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

  test("square shape has no curved edges", () => {
    const g = createGeometry({ ...config, shape: "square" }, 1, 1200, 800);
    for (const row of [...g.horizontal, ...g.vertical]) {
      for (const edge of row) expect(edge.cubics).toHaveLength(0);
    }
    expect(spriteMargins(g)).toEqual({ mx: 0, my: 0 });
  });
});
