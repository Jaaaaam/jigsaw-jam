// @vitest-environment edge-runtime
import { describe, expect, test } from "vitest";
import { api, createTestRoom, newTestBackend } from "./helpers";

describe("rooms", () => {
  test("create returns a readable 6-char code and inserts pieces", async () => {
    const t = newTestBackend();
    const { code, roomId } = await createTestRoom(t);
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/); // no 0/O/1/I
    const pieces = await t.query(api.pieces.list, { roomId });
    expect(pieces).toHaveLength(4);
    expect(pieces.every((p) => !p.placed)).toBe(true);
  });

  test("getByCode is case-insensitive and null for unknown codes", async () => {
    const t = newTestBackend();
    const { code } = await createTestRoom(t);
    const room = await t.query(api.rooms.getByCode, { code: code.toLowerCase() });
    expect(room?.code).toBe(code);
    expect(await t.query(api.rooms.getByCode, { code: "NOPE99" })).toBeNull();
  });

  test("complete marks the room once and keeps the first time", async () => {
    const t = newTestBackend();
    const { code, roomId } = await createTestRoom(t);
    await t.mutation(api.rooms.complete, { roomId, elapsed: 5000 });
    await t.mutation(api.rooms.complete, { roomId, elapsed: 9999 });
    const room = await t.query(api.rooms.getByCode, { code });
    expect(room?.status).toBe("completed");
    expect(room?.elapsedAtComplete).toBe(5000);
  });

  test("restart is host-only and rescatters pieces", async () => {
    const t = newTestBackend();
    const { roomId, code } = await createTestRoom(t, "host");
    const fresh = [
      { pieceId: 0, x: 1, y: 1, rot: 0 },
      { pieceId: 1, x: 2, y: 2, rot: 0 },
      { pieceId: 2, x: 3, y: 3, rot: 0 },
      { pieceId: 3, x: 4, y: 4, rot: 0 },
    ];
    // non-host: ignored
    await t.mutation(api.rooms.restart, { roomId, sessionId: "impostor", seed: 7, initialPieces: fresh });
    let room = await t.query(api.rooms.getByCode, { code });
    expect(room?.seed).toBe(42);
    // host: applied
    await t.mutation(api.rooms.restart, { roomId, sessionId: "host", seed: 7, initialPieces: fresh });
    room = await t.query(api.rooms.getByCode, { code });
    expect(room?.seed).toBe(7);
    const pieces = await t.query(api.pieces.list, { roomId });
    expect(pieces.find((p) => p.pieceId === 0)).toMatchObject({ x: 1, y: 1, placed: false });
  });
});
