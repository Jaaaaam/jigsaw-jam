import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { initialPieceValidator, puzzleConfigValidator, roomSettingsValidator } from "./types";
import type {
  BroadcastHintArgs,
  CompleteRoomArgs,
  CreateRoomArgs,
  RestartRoomArgs,
  RoomCodeArgs,
  UpdateSettingsArgs,
} from "./types";

function makeCode(): string {
  // no 0/O/1/I — codes get read aloud
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return code;
}

export async function createRoomHandler(ctx: MutationCtx, args: CreateRoomArgs) {
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
}

export const create = mutation({
  args: {
    hostSessionId: v.string(),
    imageUrl: v.string(),
    thumbUrl: v.string(),
    seed: v.number(),
    config: puzzleConfigValidator,
    /** Deterministic initial scatter, computed client-side from the seed. */
    initialPieces: v.array(initialPieceValidator),
  },
  handler: createRoomHandler,
});

export async function getRoomByCodeHandler(ctx: QueryCtx, { code }: RoomCodeArgs) {
  return await ctx.db
    .query("rooms")
    .withIndex("by_code", (q) => q.eq("code", code.toUpperCase()))
    .first();
}

export const getByCode = query({
  args: { code: v.string() },
  handler: getRoomByCodeHandler,
});

export async function completeRoomHandler(ctx: MutationCtx, { roomId, elapsed }: CompleteRoomArgs) {
  const room = await ctx.db.get(roomId);
  if (!room || room.status === "completed") return;
  await ctx.db.patch(roomId, {
    status: "completed",
    completedAt: Date.now(),
    elapsedAtComplete: elapsed,
  });
}

export const complete = mutation({
  args: { roomId: v.id("rooms"), elapsed: v.number() },
  handler: completeRoomHandler,
});

/** Host-only: scatter everything again and resume play. */
export async function restartRoomHandler(ctx: MutationCtx, args: RestartRoomArgs) {
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
}

export const restart = mutation({
  args: {
    roomId: v.id("rooms"),
    sessionId: v.string(),
    seed: v.number(),
    initialPieces: v.array(initialPieceValidator),
  },
  handler: restartRoomHandler,
});

/** Host-only: room-wide play settings (snap guide, edges first). */
export async function updateSettingsHandler(ctx: MutationCtx, args: UpdateSettingsArgs) {
  const room = await ctx.db.get(args.roomId);
  if (!room || room.hostSessionId !== args.sessionId) return;
  await ctx.db.patch(args.roomId, { settings: args.settings });
}

export const updateSettings = mutation({
  args: { roomId: v.id("rooms"), sessionId: v.string(), settings: roomSettingsValidator },
  handler: updateSettingsHandler,
});

/** Host-only: flash a hint on every player's board. */
export async function broadcastHintHandler(ctx: MutationCtx, args: BroadcastHintArgs) {
  const room = await ctx.db.get(args.roomId);
  if (!room || room.hostSessionId !== args.sessionId) return;
  await ctx.db.patch(args.roomId, {
    hint: {
      pieceId: args.pieceId,
      ...(args.partnerId !== undefined ? { partnerId: args.partnerId } : {}),
      at: Date.now(),
    },
  });
}

export const broadcastHint = mutation({
  args: {
    roomId: v.id("rooms"),
    sessionId: v.string(),
    pieceId: v.number(),
    partnerId: v.optional(v.number()),
  },
  handler: broadcastHintHandler,
});
