import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { formatElapsed, useGame } from "@/stores/gameStore";

let now = 0;

beforeEach(() => {
  now = 10_000;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  useGame.getState().reset();
});

afterEach(() => vi.restoreAllMocks());

describe("game store timer", () => {
  test("tick accumulates elapsed time", () => {
    useGame.getState().start(48, 0, 0);
    now += 5000;
    useGame.getState().tick();
    expect(useGame.getState().elapsed).toBe(5000);
  });

  test("paused time does not count", () => {
    useGame.getState().start(48, 0, 0);
    now += 2000;
    useGame.getState().setPaused(true);
    now += 60_000; // long coffee break
    useGame.getState().tick();
    expect(useGame.getState().elapsed).toBe(2000);
    useGame.getState().setPaused(false);
    now += 3000;
    useGame.getState().tick();
    expect(useGame.getState().elapsed).toBe(5000);
  });

  test("resuming a save keeps prior elapsed", () => {
    useGame.getState().start(48, 10, 90_000);
    now += 1000;
    useGame.getState().tick();
    expect(useGame.getState().elapsed).toBe(91_000);
    expect(useGame.getState().placedPieces).toBe(10);
  });

  test("complete freezes the timer", () => {
    useGame.getState().start(48, 47, 0);
    now += 4000;
    useGame.getState().complete();
    expect(useGame.getState().completed).toBe(true);
    now += 9999;
    useGame.getState().tick();
    expect(useGame.getState().elapsed).toBe(4000);
  });
});

describe("formatElapsed", () => {
  test("formats minutes and hours", () => {
    expect(formatElapsed(0)).toBe("0:00");
    expect(formatElapsed(65_000)).toBe("1:05");
    expect(formatElapsed(3_600_000)).toBe("1:00:00");
    expect(formatElapsed(3_725_000)).toBe("1:02:05");
  });
});
