import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const send = mutation({
  args: {
    roomId: v.id("rooms"),
    sessionId: v.string(),
    name: v.string(),
    color: v.string(),
    kind: v.union(v.literal("chat"), v.literal("emoji")),
    text: v.string(),
  },
  handler: async (ctx, args) => {
    const text = args.text.trim().slice(0, 300);
    if (!text) return;
    await ctx.db.insert("messages", { ...args, text, createdAt: Date.now() });
  },
});

export const list = query({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, { roomId }) => {
    const all = await ctx.db
      .query("messages")
      .withIndex("by_room", (q) => q.eq("roomId", roomId))
      .collect();
    return all.slice(-80);
  },
});
