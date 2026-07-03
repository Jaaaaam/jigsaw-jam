import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const configValidator = v.object({
  rows: v.number(),
  cols: v.number(),
  shape: v.union(v.literal("classic"), v.literal("square")),
  snapTolerance: v.number(),
  rotationEnabled: v.boolean(),
  edgesFirst: v.boolean(),
  casual: v.boolean(),
});

function makeCode(): string {
  // no 0/O/1/I — codes get read aloud
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return code;
}

export const create = mutation({
  args: {
    hostSessionId: v.string(),
    imageUrl: v.string(),
    thumbUrl: v.string(),
    seed: v.number(),
    config: configValidator,
    /** Deterministic initial scatter, computed client-side from the seed. */
    initialPieces: v.array(
      v.object({ pieceId: v.number(), x: v.number(), y: v.number(), rot: v.number() }),
    ),
  },
  handler: async (ctx, args) => {
    let code = makeCode();
    // regenerate on the (unlikely) collision
    while (await ctx.db.query("rooms").withIndex("by_code", (q) => q.eq("code", code)).first()) {
      code = makeCode();
    }
    const roomId = await ctx.db.insert("rooms", {
      code,
      hostSessionId: args.hostSessionId,
      imageUrl: args.imageUrl,
      thumbUrl: args.thumbUrl,
      seed: args.seed,
      config: args.config,
      status: "playing",
      createdAt: Date.now(),
    });
    for (const p of args.initialPieces) {
      await ctx.db.insert("pieces", {
        roomId,
        pieceId: p.pieceId,
        x: p.x,
        y: p.y,
        rot: p.rot,
        groupId: p.pieceId,
        placed: false,
        z: p.pieceId,
      });
    }
    return { roomId, code };
  },
});

export const getByCode = query({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    return await ctx.db
      .query("rooms")
      .withIndex("by_code", (q) => q.eq("code", code.toUpperCase()))
      .first();
  },
});

export const complete = mutation({
  args: { roomId: v.id("rooms"), elapsed: v.number() },
  handler: async (ctx, { roomId, elapsed }) => {
    const room = await ctx.db.get(roomId);
    if (!room || room.status === "completed") return;
    await ctx.db.patch(roomId, {
      status: "completed",
      completedAt: Date.now(),
      elapsedAtComplete: elapsed,
    });
  },
});

/** Host-only: scatter everything again and resume play. */
export const restart = mutation({
  args: {
    roomId: v.id("rooms"),
    sessionId: v.string(),
    seed: v.number(),
    initialPieces: v.array(
      v.object({ pieceId: v.number(), x: v.number(), y: v.number(), rot: v.number() }),
    ),
  },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room || room.hostSessionId !== args.sessionId) return;
    await ctx.db.patch(args.roomId, { status: "playing", seed: args.seed, completedAt: undefined });
    const pieces = await ctx.db
      .query("pieces")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .collect();
    const byId = new Map(args.initialPieces.map((p) => [p.pieceId, p]));
    for (const piece of pieces) {
      const init = byId.get(piece.pieceId);
      if (!init) continue;
      await ctx.db.patch(piece._id, {
        x: init.x,
        y: init.y,
        rot: init.rot,
        groupId: piece.pieceId,
        placed: false,
        z: piece.pieceId,
        heldBy: undefined,
        heldAt: undefined,
      });
    }
    const players = await ctx.db
      .query("players")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .collect();
    for (const p of players) await ctx.db.patch(p._id, { piecesPlaced: 0 });
  },
});
