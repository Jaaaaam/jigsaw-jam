import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { GameController } from "@/canvas/GameController";
import { IconButton } from "@/components/ui/Button";
import { ChatIcon, CloseIcon, SendIcon } from "@/components/ui/icons";
import { sounds } from "@/services/sound/soundManager";

export interface RoomPlayer {
  sessionId: string;
  name: string;
  color: string;
  online: boolean;
  piecesPlaced: number;
  cursorX?: number;
  cursorY?: number;
}

export interface RoomMessage {
  id: string;
  sessionId: string;
  name: string;
  color: string;
  kind: "chat" | "emoji" | "system";
  text: string;
  createdAt: number;
}

// ------------------------------------------------------------------ players

/** Inline players + room-code cluster for the game top bar. */
export function PlayersBar({ players, hostSessionId, mySessionId, code }: {
  players: RoomPlayer[];
  hostSessionId: string;
  mySessionId: string;
  code: string;
}) {
  const [copied, setCopied] = useState(false);
  const online = [...players].sort((a, b) => Number(b.online) - Number(a.online) || b.piecesPlaced - a.piecesPlaced);
  const onlineCount = online.filter((p) => p.online).length;
  const shown = online.slice(0, 5);
  const overflow = online.length - shown.length;
  return (
    <div className="flex min-w-0 items-center gap-2">
      <div className="flex shrink-0 -space-x-1.5" title={`${onlineCount} online`}>
        {shown.map((p) => (
          <div key={p.sessionId} className="relative" title={`${p.name} · ${p.piecesPlaced} placed`}>
            <div
              className={`flex h-7 w-7 items-center justify-center rounded-full border-2 border-white text-[11px] font-black text-white dark:border-lav-900 ${p.online ? "" : "opacity-40 grayscale"}`}
              style={{ background: p.color }}
            >
              {p.name.charAt(0).toUpperCase()}
            </div>
            {p.sessionId === hostSessionId && (
              <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 text-[9px]" title="Host">👑</span>
            )}
            {p.online && (
              <span className="absolute right-0 bottom-0 h-2 w-2 rounded-full border border-white bg-mint-500" />
            )}
          </div>
        ))}
        {overflow > 0 && (
          <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-black/10 text-[10px] font-black text-secondary dark:border-lav-900 dark:bg-white/15">
            +{overflow}
          </div>
        )}
      </div>
      <span className="hidden text-xs font-bold whitespace-nowrap text-tertiary md:inline">
        {onlineCount} online
      </span>
      <button
        className="glass shrink-0 cursor-pointer rounded-xl px-2.5 py-1 font-mono text-xs font-black tracking-widest text-primary hover:bg-white/80 dark:hover:bg-white/10"
        title="Copy invite code"
        onClick={() => {
          void navigator.clipboard.writeText(code);
          setCopied(true);
          sounds.play("pop");
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? "Copied! ✓" : `${code} ⧉`}
      </button>
      <span className="sr-only">
        Players: {online.map((p) => `${p.name}${p.sessionId === mySessionId ? " (you)" : ""}`).join(", ")}
      </span>
    </div>
  );
}

// ------------------------------------------------------------------ cursors

/**
 * Remote cursors live outside React's render cycle: a rAF loop projects
 * world→screen through the controller so cursors stay glued during pan/zoom.
 */
export function CursorsOverlay({ players, mySessionId, controller }: {
  players: RoomPlayer[];
  mySessionId: string;
  controller: GameController | null;
}) {
  const holder = useRef<HTMLDivElement>(null);
  const playersRef = useRef(players);
  playersRef.current = players;

  useEffect(() => {
    if (!controller) return;
    let raf = 0;
    const nodes = new Map<string, HTMLDivElement>();
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const root = holder.current;
      if (!root) return;
      const list = playersRef.current.filter(
        (p) => p.sessionId !== mySessionId && p.online && p.cursorX !== undefined,
      );
      const seen = new Set<string>();
      for (const p of list) {
        seen.add(p.sessionId);
        let node = nodes.get(p.sessionId);
        if (!node) {
          node = document.createElement("div");
          node.className =
            "absolute flex items-start gap-1 transition-transform duration-100 ease-out will-change-transform";
          node.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="${p.color}" stroke="white" stroke-width="1.5"><path d="M3 2l7 19 2.5-8L21 10.5z"/></svg><span style="background:${p.color}" class="rounded-full px-2 py-0.5 text-[10px] font-black text-white shadow-press">${escapeHtml(p.name)}</span>`;
          root.appendChild(node);
          nodes.set(p.sessionId, node);
        }
        const s = controller.worldToScreen(p.cursorX!, p.cursorY!);
        node.style.transform = `translate(${s.x}px, ${s.y}px)`;
      }
      for (const [id, node] of nodes) {
        if (!seen.has(id)) {
          node.remove();
          nodes.delete(id);
        }
      }
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      for (const [, n] of nodes) n.remove();
    };
  }, [controller, mySessionId]);

  return <div ref={holder} aria-hidden className="pointer-events-none absolute inset-0 z-10 overflow-hidden" />;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}

// ------------------------------------------------------------------ chat

const EMOJI = ["👏", "🎉", "😂", "😍", "🤯", "🧩"];

export function ChatPanel({ messages, mySessionId, onSend }: {
  messages: RoomMessage[];
  mySessionId: string;
  onSend: (kind: "chat" | "emoji", text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [unread, setUnread] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const lastCount = useRef(messages.length);

  useEffect(() => {
    if (messages.length > lastCount.current) {
      if (!open) setUnread((u) => u + (messages.length - lastCount.current));
      const last = messages.at(-1);
      if (last && last.sessionId !== mySessionId && last.kind !== "system") sounds.play("pop");
    }
    lastCount.current = messages.length;
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open, mySessionId]);

  return (
    <>
      {/* z-30 + slide left while open: the panel spans this edge and would
          otherwise sit on top of its own toggle, making chat impossible to hide */}
      <div
        className={`absolute bottom-1/2 z-30 translate-y-1/2 transition-[right] duration-300 ${
          open ? "right-[19.5rem]" : "right-3"
        }`}
      >
        <div className="relative">
          <IconButton
            label={open ? "Hide chat" : "Show chat"}
            active={open}
            onClick={() => { setOpen(!open); setUnread(0); }}
          >
            <ChatIcon />
          </IconButton>
          {unread > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-coral-500 px-1 text-[10px] font-black text-white"
            >
              {unread}
            </motion.span>
          )}
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.aside
            initial={{ x: 340, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 340, opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
            className="glass-strong absolute top-24 right-3 bottom-24 z-20 flex w-72 flex-col rounded-3xl p-3 shadow-float"
            aria-label="Room chat"
          >
            <div className="mb-1 flex items-center justify-between px-1 pt-0.5">
              <span className="text-xs font-extrabold tracking-wide text-tertiary uppercase">Chat</span>
              <button
                aria-label="Hide chat"
                className="cursor-pointer rounded-lg p-1 text-tertiary hover:bg-black/5 hover:text-primary dark:hover:bg-white/10"
                onClick={() => { setOpen(false); sounds.play("click"); }}
              >
                <CloseIcon width={16} height={16} />
              </button>
            </div>
            <div ref={listRef} className="flex-1 space-y-2 overflow-y-auto pr-1">
              {messages.length === 0 && (
                <p className="mt-8 text-center text-xs font-semibold text-tertiary">
                  Say hi to your puzzle pals 👋
                </p>
              )}
              {messages.map((m) =>
                m.kind === "system" ? (
                  <p key={m.id} className="text-center text-[11px] font-semibold text-tertiary">
                    {m.text}
                  </p>
                ) : (
                  <div key={m.id} className={`flex flex-col ${m.sessionId === mySessionId ? "items-end" : "items-start"}`}>
                    <span className="px-1 text-[10px] font-bold" style={{ color: m.color }}>
                      {m.sessionId === mySessionId ? "You" : m.name}
                    </span>
                    <span
                      className={`max-w-[85%] rounded-2xl px-3 py-1.5 text-sm font-semibold break-words ${
                        m.kind === "emoji"
                          ? "bg-transparent text-3xl"
                          : m.sessionId === mySessionId
                            ? "bg-gradient-to-b from-lav-400 to-lav-500 text-white"
                            : "bg-black/5 text-primary dark:bg-white/10"
                      }`}
                    >
                      {m.text}
                    </span>
                  </div>
                ),
              )}
            </div>
            <div className="mt-2 flex gap-1">
              {EMOJI.map((e) => (
                <button
                  key={e}
                  className="flex-1 cursor-pointer rounded-xl py-1 text-lg transition-transform hover:scale-125"
                  aria-label={`React ${e}`}
                  onClick={() => onSend("emoji", e)}
                >
                  {e}
                </button>
              ))}
            </div>
            <form
              className="mt-2 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!text.trim()) return;
                onSend("chat", text);
                setText("");
              }}
            >
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Message…"
                aria-label="Chat message"
                className="glass min-w-0 flex-1 rounded-xl px-3 py-2 text-sm font-semibold text-primary placeholder:text-tertiary"
              />
              <IconButton label="Send message" type="submit" className="h-9 w-9 shrink-0">
                <SendIcon width={16} height={16} />
              </IconButton>
            </form>
          </motion.aside>
        )}
      </AnimatePresence>

      <FloatingReactions messages={messages} />
    </>
  );
}

/** Emoji reactions float up from the bottom like little balloons. */
function FloatingReactions({ messages }: { messages: RoomMessage[] }) {
  const [floats, setFloats] = useState<Array<{ key: string; emoji: string; x: number }>>([]);
  const seen = useRef(new Set<string>());

  useEffect(() => {
    const fresh = messages.filter(
      (m) => m.kind === "emoji" && !seen.current.has(m.id) && Date.now() - m.createdAt < 5000,
    );
    if (fresh.length === 0) return;
    for (const m of fresh) seen.current.add(m.id);
    setFloats((f) => [
      ...f,
      ...fresh.map((m) => ({ key: m.id, emoji: m.text, x: 20 + Math.random() * 60 })),
    ]);
  }, [messages]);

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-30 overflow-hidden">
      <AnimatePresence>
        {floats.map((f) => (
          <motion.span
            key={f.key}
            initial={{ opacity: 0, y: 0, scale: 0.6 }}
            animate={{ opacity: [0, 1, 1, 0], y: -280, scale: [0.6, 1.4, 1.2, 1] }}
            transition={{ duration: 2.4, ease: "easeOut" }}
            onAnimationComplete={() => setFloats((cur) => cur.filter((c) => c.key !== f.key))}
            className="absolute bottom-24 text-4xl"
            style={{ left: `${f.x}%` }}
          >
            {f.emoji}
          </motion.span>
        ))}
      </AnimatePresence>
    </div>
  );
}
