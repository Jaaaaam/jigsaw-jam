import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const ONLINE_WINDOW_MS = 12_000;

export const join = mutation({
  args: {
    roomId: v.id("rooms"),
    sessionId: v.string(),
    name: v.string(),
    color: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("players")
      .withIndex("by_room_session", (q) => q.eq("roomId", args.roomId).eq("sessionId", args.sessionId))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { name: args.name, color: args.color, lastSeen: Date.now() });
      return;
    }
    await ctx.db.insert("players", {
      roomId: args.roomId,
      sessionId: args.sessionId,
      name: args.name,
      color: args.color,
      lastSeen: Date.now(),
      piecesPlaced: 0,
    });
    await ctx.db.insert("messages", {
      roomId: args.roomId,
      sessionId: args.sessionId,
      name: args.name,
      color: args.color,
      kind: "system",
      text: `${args.name} joined the puzzle`,
      createdAt: Date.now(),
    });
  },
});

export const heartbeat = mutation({
  args: {
    roomId: v.id("rooms"),
    sessionId: v.string(),
    cursorX: v.optional(v.number()),
    cursorY: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const player = await ctx.db
      .query("players")
      .withIndex("by_room_session", (q) => q.eq("roomId", args.roomId).eq("sessionId", args.sessionId))
      .first();
    if (!player) return;
    await ctx.db.patch(player._id, {
      lastSeen: Date.now(),
      ...(args.cursorX !== undefined ? { cursorX: args.cursorX, cursorY: args.cursorY } : {}),
    });
  },
});

export const listPlayers = query({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, { roomId }) => {
    const players = await ctx.db
      .query("players")
      .withIndex("by_room", (q) => q.eq("roomId", roomId))
      .collect();
    const now = Date.now();
    return players.map((p) => ({ ...p, online: now - p.lastSeen < ONLINE_WINDOW_MS }));
  },
});
