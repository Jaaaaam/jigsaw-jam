// @vitest-environment edge-runtime
import { describe, expect, test } from "vitest";
import { api, createTestRoom, newTestBackend } from "./helpers";

describe("presence", () => {
  test("join creates a player and a system message; rejoin updates in place", async () => {
    const t = newTestBackend();
    const { roomId } = await createTestRoom(t);
    await t.mutation(api.presence.join, { roomId, sessionId: "s1", name: "Ada", color: "#f00" });
    await t.mutation(api.presence.join, { roomId, sessionId: "s1", name: "Ada L.", color: "#0f0" });
    const players = await t.query(api.presence.listPlayers, { roomId });
    expect(players).toHaveLength(1);
    expect(players[0]).toMatchObject({ name: "Ada L.", color: "#0f0", online: true });
    const messages = await t.query(api.chat.list, { roomId });
    expect(messages.filter((m) => m.kind === "system")).toHaveLength(1);
  });

  test("heartbeat updates cursor and players go offline after the window", async () => {
    const t = newTestBackend();
    const { roomId } = await createTestRoom(t);
    await t.mutation(api.presence.join, { roomId, sessionId: "s1", name: "Ada", color: "#f00" });
    await t.mutation(api.presence.heartbeat, { roomId, sessionId: "s1", cursorX: 12, cursorY: 34 });
    let players = await t.query(api.presence.listPlayers, { roomId });
    expect(players[0]).toMatchObject({ cursorX: 12, cursorY: 34, online: true });
    // silence beyond the 12s online window
    await t.run(async (ctx) => {
      const p = await ctx.db.query("players").withIndex("by_room", (q) => q.eq("roomId", roomId)).first();
      await ctx.db.patch(p!._id, { lastSeen: Date.now() - 60_000 });
    });
    players = await t.query(api.presence.listPlayers, { roomId });
    expect(players[0]!.online).toBe(false);
  });
});

describe("chat", () => {
  test("trims long messages and drops empty ones", async () => {
    const t = newTestBackend();
    const { roomId } = await createTestRoom(t);
    const base = { roomId, sessionId: "s1", name: "Ada", color: "#f00", kind: "chat" as const };
    await t.mutation(api.chat.send, { ...base, text: "   " });
    await t.mutation(api.chat.send, { ...base, text: "x".repeat(500) });
    const messages = await t.query(api.chat.list, { roomId });
    expect(messages).toHaveLength(1);
    expect(messages[0]!.text).toHaveLength(300);
  });

  test("list caps at the last 80 messages", async () => {
    const t = newTestBackend();
    const { roomId } = await createTestRoom(t);
    const base = { roomId, sessionId: "s1", name: "Ada", color: "#f00", kind: "chat" as const };
    for (let i = 0; i < 85; i++) {
      await t.mutation(api.chat.send, { ...base, text: `msg ${i}` });
    }
    const messages = await t.query(api.chat.list, { roomId });
    expect(messages).toHaveLength(80);
    expect(messages.at(-1)!.text).toBe("msg 84");
    expect(messages[0]!.text).toBe("msg 5");
  });

  test("emoji reactions pass through", async () => {
    const t = newTestBackend();
    const { roomId } = await createTestRoom(t);
    await t.mutation(api.chat.send, {
      roomId, sessionId: "s1", name: "Ada", color: "#f00", kind: "emoji", text: "🎉",
    });
    const messages = await t.query(api.chat.list, { roomId });
    expect(messages[0]).toMatchObject({ kind: "emoji", text: "🎉" });
  });
});
