// @vitest-environment edge-runtime
import { describe, expect, test } from "vitest";
import { api, createTestRoom, newTestBackend } from "./helpers";

const snap = (pieceId: number, extra: Partial<{ x: number; y: number; placed: boolean; groupId: number }> = {}) => ({
  pieceId,
  x: extra.x ?? 10,
  y: extra.y ?? 20,
  rot: 0,
  groupId: extra.groupId ?? pieceId,
  placed: extra.placed ?? false,
  z: 50,
});

describe("piece claiming (concurrency guard)", () => {
  test("second player cannot claim a held piece", async () => {
    const t = newTestBackend();
    const { roomId } = await createTestRoom(t);
    const a = await t.mutation(api.pieces.claim, { roomId, sessionId: "alice", pieceIds: [0] });
    expect(a.ok).toBe(true);
    const b = await t.mutation(api.pieces.claim, { roomId, sessionId: "bob", pieceIds: [0] });
    expect(b.ok).toBe(false);
  });

  test("claim is all-or-nothing across a group", async () => {
    const t = newTestBackend();
    const { roomId } = await createTestRoom(t);
    await t.mutation(api.pieces.claim, { roomId, sessionId: "alice", pieceIds: [1] });
    const b = await t.mutation(api.pieces.claim, { roomId, sessionId: "bob", pieceIds: [0, 1] });
    expect(b.ok).toBe(false);
    // piece 0 must not be partially claimed by bob
    const c = await t.mutation(api.pieces.claim, { roomId, sessionId: "carol", pieceIds: [0] });
    expect(c.ok).toBe(true);
  });

  test("stale claims expire after the TTL", async () => {
    const t = newTestBackend();
    const { roomId } = await createTestRoom(t);
    await t.mutation(api.pieces.claim, { roomId, sessionId: "alice", pieceIds: [0] });
    // age the claim well past the 15s TTL
    await t.run(async (ctx) => {
      const doc = await ctx.db
        .query("pieces")
        .withIndex("by_room_piece", (q) => q.eq("roomId", roomId).eq("pieceId", 0))
        .first();
      await ctx.db.patch(doc!._id, { heldAt: Date.now() - 60_000 });
    });
    const b = await t.mutation(api.pieces.claim, { roomId, sessionId: "bob", pieceIds: [0] });
    expect(b.ok).toBe(true);
  });

  test("placed pieces cannot be claimed", async () => {
    const t = newTestBackend();
    const { roomId } = await createTestRoom(t);
    await t.mutation(api.pieces.claim, { roomId, sessionId: "alice", pieceIds: [0] });
    await t.mutation(api.pieces.release, { roomId, sessionId: "alice", snapshots: [snap(0, { placed: true })] });
    const b = await t.mutation(api.pieces.claim, { roomId, sessionId: "bob", pieceIds: [0] });
    expect(b.ok).toBe(false);
  });
});

describe("move / release", () => {
  test("only the holder's moves are applied", async () => {
    const t = newTestBackend();
    const { roomId } = await createTestRoom(t);
    await t.mutation(api.pieces.claim, { roomId, sessionId: "alice", pieceIds: [0] });
    await t.mutation(api.pieces.move, { roomId, sessionId: "bob", snapshots: [snap(0, { x: 999 })] });
    let pieces = await t.query(api.pieces.list, { roomId });
    expect(pieces.find((p) => p.pieceId === 0)!.x).toBe(-100); // untouched
    await t.mutation(api.pieces.move, { roomId, sessionId: "alice", snapshots: [snap(0, { x: 55 })] });
    pieces = await t.query(api.pieces.list, { roomId });
    expect(pieces.find((p) => p.pieceId === 0)!.x).toBe(55);
  });

  test("release clears the hold and applies merges", async () => {
    const t = newTestBackend();
    const { roomId } = await createTestRoom(t);
    await t.mutation(api.pieces.claim, { roomId, sessionId: "alice", pieceIds: [0] });
    await t.mutation(api.pieces.release, {
      roomId,
      sessionId: "alice",
      snapshots: [snap(0, { groupId: 1 })],
    });
    const pieces = await t.query(api.pieces.list, { roomId });
    const p0 = pieces.find((p) => p.pieceId === 0)!;
    expect(p0.groupId).toBe(1);
    expect(p0.heldBy).toBeUndefined();
    // now claimable by someone else
    const b = await t.mutation(api.pieces.claim, { roomId, sessionId: "bob", pieceIds: [0] });
    expect(b.ok).toBe(true);
  });

  test("placements increment the placer's stats and never un-place", async () => {
    const t = newTestBackend();
    const { roomId } = await createTestRoom(t);
    await t.mutation(api.presence.join, { roomId, sessionId: "alice", name: "Alice", color: "#f00" });
    await t.mutation(api.pieces.claim, { roomId, sessionId: "alice", pieceIds: [0, 1] });
    await t.mutation(api.pieces.release, {
      roomId,
      sessionId: "alice",
      snapshots: [snap(0, { placed: true }), snap(1, { placed: true })],
    });
    const players = await t.query(api.presence.listPlayers, { roomId });
    expect(players[0]!.piecesPlaced).toBe(2);
    // a later release with placed=false must not un-place
    await t.mutation(api.pieces.release, { roomId, sessionId: "alice", snapshots: [snap(0, { placed: false })] });
    const pieces = await t.query(api.pieces.list, { roomId });
    expect(pieces.find((p) => p.pieceId === 0)!.placed).toBe(true);
  });
});
