import { describe, expect, test } from "vitest";
import { createRng, range, shuffleInPlace } from "@/engine/random";

describe("createRng", () => {
  test("same seed produces identical sequences", () => {
    const a = createRng(1234);
    const b = createRng(1234);
    for (let i = 0; i < 100; i++) expect(a()).toBe(b());
  });

  test("different seeds diverge", () => {
    const a = createRng(1);
    const b = createRng(2);
    const seqA = Array.from({ length: 10 }, a);
    const seqB = Array.from({ length: 10 }, b);
    expect(seqA).not.toEqual(seqB);
  });

  test("values stay in [0, 1)", () => {
    const rng = createRng(99);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("range", () => {
  test("stays within bounds", () => {
    const rng = createRng(7);
    for (let i = 0; i < 500; i++) {
      const v = range(rng, -0.5, 0.5);
      expect(v).toBeGreaterThanOrEqual(-0.5);
      expect(v).toBeLessThan(0.5);
    }
  });
});

describe("shuffleInPlace", () => {
  test("is a permutation and deterministic per seed", () => {
    const items = Array.from({ length: 50 }, (_, i) => i);
    const a = shuffleInPlace([...items], createRng(42));
    const b = shuffleInPlace([...items], createRng(42));
    expect(a).toEqual(b);
    expect([...a].sort((x, y) => x - y)).toEqual(items);
    expect(a).not.toEqual(items); // astronomically unlikely to be identity
  });
});
