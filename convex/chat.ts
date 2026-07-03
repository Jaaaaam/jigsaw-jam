import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { RoomArgs, SendMessageArgs } from "./types";

export async function sendMessageHandler(ctx: MutationCtx, args: SendMessageArgs) {
  const text = args.text.trim().slice(0, 300);
  if (!text) return;
  await ctx.db.insert("messages", { ...args, text, createdAt: Date.now() });
}

export const send = mutation({
  args: {
    roomId: v.id("rooms"),
    sessionId: v.string(),
    name: v.string(),
    color: v.string(),
    kind: v.union(v.literal("chat"), v.literal("emoji")),
    text: v.string(),
  },
  handler: sendMessageHandler,
});

export async function listMessagesHandler(ctx: QueryCtx, { roomId }: RoomArgs) {
  const all = await ctx.db
    .query("messages")
    .withIndex("by_room", (q) => q.eq("roomId", roomId))
    .collect();
  return all.slice(-80);
}

export const list = query({
  args: { roomId: v.id("rooms") },
  handler: listMessagesHandler,
});
