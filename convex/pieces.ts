import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/** A held piece whose holder went silent for this long is up for grabs. */
const CLAIM_TTL_MS = 15_000;

export const list = query({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, { roomId }) => {
    return await ctx.db
      .query("pieces")
      .withIndex("by_room", (q) => q.eq("roomId", roomId))
      .collect();
  },
});

/**
 * Claim a group of pieces for dragging. All-or-nothing: if any piece is held
 * by someone else (and fresh), the claim fails and the client drops the grab.
 */
export const claim = mutation({
  args: { roomId: v.id("rooms"), sessionId: v.string(), pieceIds: v.array(v.number()) },
  handler: async (ctx, { roomId, sessionId, pieceIds }) => {
    const now = Date.now();
    const docs = [];
    for (const pieceId of pieceIds) {
      const doc = await ctx.db
        .query("pieces")
        .withIndex("by_room_piece", (q) => q.eq("roomId", roomId).eq("pieceId", pieceId))
        .first();
      if (!doc || doc.placed) return { ok: false };
      const heldByOther =
        doc.heldBy && doc.heldBy !== sessionId && now - (doc.heldAt ?? 0) < CLAIM_TTL_MS;
      if (heldByOther) return { ok: false };
      docs.push(doc);
    }
    for (const doc of docs) {
      await ctx.db.patch(doc._id, { heldBy: sessionId, heldAt: now });
    }
    return { ok: true };
  },
});

const snapshotValidator = v.object({
  pieceId: v.number(),
  x: v.number(),
  y: v.number(),
  rot: v.number(),
  groupId: v.number(),
  placed: v.boolean(),
  z: v.number(),
});

/** Streamed while dragging — position only, keeps the claim fresh. */
export const move = mutation({
  args: { roomId: v.id("rooms"), sessionId: v.string(), snapshots: v.array(snapshotValidator) },
  handler: async (ctx, { roomId, sessionId, snapshots }) => {
    const now = Date.now();
    for (const s of snapshots) {
      const doc = await ctx.db
        .query("pieces")
        .withIndex("by_room_piece", (q) => q.eq("roomId", roomId).eq("pieceId", s.pieceId))
        .first();
      if (!doc || doc.placed || doc.heldBy !== sessionId) continue;
      await ctx.db.patch(doc._id, { x: s.x, y: s.y, rot: s.rot, z: s.z, heldAt: now });
    }
  },
});

/** Final authoritative write on drop: positions, merges, placements. */
export const release = mutation({
  args: { roomId: v.id("rooms"), sessionId: v.string(), snapshots: v.array(snapshotValidator) },
  handler: async (ctx, { roomId, sessionId, snapshots }) => {
    let newlyPlaced = 0;
    for (const s of snapshots) {
      const doc = await ctx.db
        .query("pieces")
        .withIndex("by_room_piece", (q) => q.eq("roomId", roomId).eq("pieceId", s.pieceId))
        .first();
      if (!doc) continue;
      if (doc.heldBy && doc.heldBy !== sessionId) continue;
      if (!doc.placed && s.placed) newlyPlaced++;
      await ctx.db.patch(doc._id, {
        x: s.x,
        y: s.y,
        rot: s.rot,
        groupId: s.groupId,
        placed: doc.placed || s.placed,
        z: s.z,
        heldBy: undefined,
        heldAt: undefined,
        ...(s.placed && !doc.placed ? { placedBy: sessionId } : {}),
      });
    }
    if (newlyPlaced > 0) {
      const player = await ctx.db
        .query("players")
        .withIndex("by_room_session", (q) => q.eq("roomId", roomId).eq("sessionId", sessionId))
        .first();
      if (player) {
        await ctx.db.patch(player._id, { piecesPlaced: player.piecesPlaced + newlyPlaced });
      }
    }
  },
});
