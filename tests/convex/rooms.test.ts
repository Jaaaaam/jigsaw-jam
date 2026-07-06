// @vitest-environment edge-runtime
import { describe, expect, test } from "vitest";
import { api, createTestRoom, newTestBackend, testConfig } from "./helpers";

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

  test("updateSettings is host-only", async () => {
    const t = newTestBackend();
    const { roomId, code } = await createTestRoom(t, "host");
    await t.mutation(api.rooms.updateSettings, {
      roomId,
      sessionId: "impostor",
      settings: { snapGuide: false, edgesFirst: true },
    });
    let room = await t.query(api.rooms.getByCode, { code });
    expect(room?.settings).toBeUndefined();
    await t.mutation(api.rooms.updateSettings, {
      roomId,
      sessionId: "host",
      settings: { snapGuide: false, edgesFirst: true },
    });
    room = await t.query(api.rooms.getByCode, { code });
    expect(room?.settings).toEqual({ snapGuide: false, edgesFirst: true });
  });

  test("nextRound is host-only and swaps photo, config, seed and pieces", async () => {
    const t = newTestBackend();
    const { roomId, code } = await createTestRoom(t, "host");
    await t.mutation(api.rooms.complete, { roomId, elapsed: 5000 });
    await t.mutation(api.presence.join, { roomId, sessionId: "host", name: "H", color: "#f00" });
    await t.mutation(api.pieces.release, {
      roomId,
      sessionId: "host",
      snapshots: [{ pieceId: 0, x: 0, y: 0, rot: 0, groupId: 0, placed: true, z: 1 }],
    });
    const nextArgs = {
      imageUrl: "https://example.com/next.jpg",
      thumbUrl: "https://example.com/next-thumb.jpg",
      seed: 99,
      config: { ...testConfig, rows: 3, cols: 2, edgesFirst: true },
      // 3x2 round: more pieces than the 2x2 room started with
      initialPieces: Array.from({ length: 6 }, (_, i) => ({ pieceId: i, x: i * 10, y: 0, rot: 0 })),
    };
    // non-host: ignored
    await t.mutation(api.rooms.nextRound, { roomId, sessionId: "impostor", ...nextArgs });
    let room = await t.query(api.rooms.getByCode, { code });
    expect(room?.imageUrl).toBe("https://example.com/img.jpg");
    // host: applied
    await t.mutation(api.rooms.nextRound, { roomId, sessionId: "host", ...nextArgs });
    room = await t.query(api.rooms.getByCode, { code });
    expect(room?.imageUrl).toBe("https://example.com/next.jpg");
    expect(room?.seed).toBe(99);
    expect(room?.config.rows).toBe(3);
    expect(room?.status).toBe("playing");
    expect(room?.completedAt).toBeUndefined();
    expect(room?.elapsedAtComplete).toBeUndefined();
    expect(room?.choosingAt).toBeUndefined();
    expect(room?.settings).toEqual({ snapGuide: true, edgesFirst: true });
    const pieces = await t.query(api.pieces.list, { roomId });
    expect(pieces).toHaveLength(6);
    expect(pieces.every((p) => !p.placed)).toBe(true);
    const players = await t.query(api.presence.listPlayers, { roomId });
    expect(players.every((p) => p.piecesPlaced === 0)).toBe(true);
  });

  test("setChoosing is host-only and sets/clears the timestamp", async () => {
    const t = newTestBackend();
    const { roomId, code } = await createTestRoom(t, "host");
    await t.mutation(api.rooms.setChoosing, { roomId, sessionId: "impostor", choosing: true });
    let room = await t.query(api.rooms.getByCode, { code });
    expect(room?.choosingAt).toBeUndefined();
    await t.mutation(api.rooms.setChoosing, { roomId, sessionId: "host", choosing: true });
    room = await t.query(api.rooms.getByCode, { code });
    expect(room?.choosingAt).toBeGreaterThan(0);
    await t.mutation(api.rooms.setChoosing, { roomId, sessionId: "host", choosing: false });
    room = await t.query(api.rooms.getByCode, { code });
    expect(room?.choosingAt).toBeUndefined();
  });

  test("broadcastHint is host-only and stamps a timestamp", async () => {
    const t = newTestBackend();
    const { roomId, code } = await createTestRoom(t, "host");
    await t.mutation(api.rooms.broadcastHint, { roomId, sessionId: "impostor", pieceId: 1 });
    let room = await t.query(api.rooms.getByCode, { code });
    expect(room?.hint).toBeUndefined();
    await t.mutation(api.rooms.broadcastHint, { roomId, sessionId: "host", pieceId: 1, partnerId: 2 });
    room = await t.query(api.rooms.getByCode, { code });
    expect(room?.hint?.pieceId).toBe(1);
    expect(room?.hint?.partnerId).toBe(2);
    expect(room?.hint?.at).toBeGreaterThan(0);
  });
});
