import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { pieceSnapshotValidator } from "./types";
import type { ClaimPiecesArgs, MovePiecesArgs, RoomArgs } from "./types";
import type { Doc, Id } from "./_generated/dataModel";

/** A held piece whose holder went silent for this long is up for grabs. */
const CLAIM_TTL_MS = 15_000;

async function pieceByRoomAndId(
  ctx: QueryCtx,
  roomId: Id<"rooms">,
  pieceId: number,
): Promise<Doc<"pieces"> | null> {
  return await ctx.db
    .query("pieces")
    .withIndex("by_room_piece", (q) => q.eq("roomId", roomId).eq("pieceId", pieceId))
    .first();
}

export async function listPiecesHandler(ctx: QueryCtx, { roomId }: RoomArgs) {
  return await ctx.db
    .query("pieces")
    .withIndex("by_room", (q) => q.eq("roomId", roomId))
    .collect();
}

export const list = query({
  args: { roomId: v.id("rooms") },
  handler: listPiecesHandler,
});

/**
 * Claim a group of pieces for dragging. All-or-nothing: if any piece is held
 * by someone else (and fresh), the claim fails and the client drops the grab.
 */
export async function claimPiecesHandler(
  ctx: MutationCtx,
  { roomId, sessionId, pieceIds }: ClaimPiecesArgs,
) {
  const now = Date.now();
  const docs: Doc<"pieces">[] = [];
  for (const pieceId of pieceIds) {
    const doc = await pieceByRoomAndId(ctx, roomId, pieceId);
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
}

export const claim = mutation({
  args: { roomId: v.id("rooms"), sessionId: v.string(), pieceIds: v.array(v.number()) },
  handler: claimPiecesHandler,
});

/** Streamed while dragging — position only, keeps the claim fresh. */
export async function movePiecesHandler(
  ctx: MutationCtx,
  { roomId, sessionId, snapshots }: MovePiecesArgs,
) {
  const now = Date.now();
  for (const s of snapshots) {
    const doc = await pieceByRoomAndId(ctx, roomId, s.pieceId);
    if (!doc || doc.placed || doc.heldBy !== sessionId) continue;
    await ctx.db.patch(doc._id, { x: s.x, y: s.y, rot: s.rot, z: s.z, heldAt: now });
  }
}

export const move = mutation({
  args: {
    roomId: v.id("rooms"),
    sessionId: v.string(),
    snapshots: v.array(pieceSnapshotValidator),
  },
  handler: movePiecesHandler,
});

/** Final authoritative write on drop: positions, merges, placements. */
export async function releasePiecesHandler(
  ctx: MutationCtx,
  { roomId, sessionId, snapshots }: MovePiecesArgs,
) {
  let newlyPlaced = 0;
  for (const s of snapshots) {
    const doc = await pieceByRoomAndId(ctx, roomId, s.pieceId);
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
}

export const release = mutation({
  args: {
    roomId: v.id("rooms"),
    sessionId: v.string(),
    snapshots: v.array(pieceSnapshotValidator),
  },
  handler: releasePiecesHandler,
});
