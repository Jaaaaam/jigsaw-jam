import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  rooms: defineTable({
    code: v.string(),
    hostSessionId: v.string(),
    imageUrl: v.string(),
    thumbUrl: v.string(),
    seed: v.number(),
    config: v.object({
      rows: v.number(),
      cols: v.number(),
      shape: v.union(v.literal("classic"), v.literal("square")),
      snapTolerance: v.number(),
      rotationEnabled: v.boolean(),
      edgesFirst: v.boolean(),
      casual: v.boolean(),
    }),
    status: v.union(v.literal("playing"), v.literal("completed")),
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
    elapsedAtComplete: v.optional(v.number()),
  }).index("by_code", ["code"]),

  pieces: defineTable({
    roomId: v.id("rooms"),
    pieceId: v.number(),
    x: v.number(),
    y: v.number(),
    rot: v.number(),
    groupId: v.number(),
    placed: v.boolean(),
    z: v.number(),
    heldBy: v.optional(v.string()),
    heldAt: v.optional(v.number()),
    placedBy: v.optional(v.string()),
  })
    .index("by_room", ["roomId"])
    .index("by_room_piece", ["roomId", "pieceId"]),

  players: defineTable({
    roomId: v.id("rooms"),
    sessionId: v.string(),
    name: v.string(),
    color: v.string(),
    cursorX: v.optional(v.number()),
    cursorY: v.optional(v.number()),
    lastSeen: v.number(),
    piecesPlaced: v.number(),
  })
    .index("by_room", ["roomId"])
    .index("by_room_session", ["roomId", "sessionId"]),

  messages: defineTable({
    roomId: v.id("rooms"),
    sessionId: v.string(),
    name: v.string(),
    color: v.string(),
    kind: v.union(v.literal("chat"), v.literal("emoji"), v.literal("system")),
    text: v.string(),
    createdAt: v.number(),
  }).index("by_room", ["roomId"]),
});
