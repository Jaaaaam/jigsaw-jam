// @vitest-environment happy-dom
import { beforeEach, describe, expect, test } from "vitest";
import { colorForSession, getSessionId, PLAYER_COLORS, randomName } from "@/services/session";

beforeEach(() => localStorage.clear());

describe("session", () => {
  test("session id is stable across calls", () => {
    const first = getSessionId();
    expect(getSessionId()).toBe(first);
  });

  test("colorForSession is deterministic and from the palette", () => {
    const color = colorForSession("some-session");
    expect(colorForSession("some-session")).toBe(color);
    expect(PLAYER_COLORS).toContain(color);
  });

  test("randomName produces a two-word name", () => {
    expect(randomName().split(" ")).toHaveLength(2);
  });
});
