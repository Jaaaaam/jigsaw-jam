import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { BrandLink, PageShell, SoundControl, ThemeToggle } from "@/components/PageShell";
import { Button } from "@/components/ui/Button";
import { multiplayerAvailable } from "@/lib/convexClient";
import { useSettings } from "@/stores/settingsStore";
import { randomName } from "@/services/session";

export default function JoinPage() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const playerName = useSettings((s) => s.playerName);
  const setPlayerName = useSettings((s) => s.setPlayerName);

  const join = () => {
    const clean = code.trim().toUpperCase();
    if (clean.length < 4) return;
    if (!playerName.trim()) setPlayerName(randomName());
    navigate(`/room/${clean}`);
  };

  return (
    <PageShell>
      <header className="flex items-center justify-between">
        <BrandLink />
        <div className="flex items-center gap-2">
          <SoundControl />
          <ThemeToggle />
        </div>
      </header>

      <div className="flex flex-1 items-center justify-center">
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 24 }}
          className="glass-strong w-full max-w-md rounded-4xl p-8 shadow-float"
        >
          <div className="mb-6 text-center">
            <span className="text-5xl">🔑</span>
            <h1 className="mt-3 text-2xl font-black text-primary">Join a room</h1>
            <p className="mt-1 text-sm font-semibold text-secondary">
              Ask your friend for their 6-letter invite code.
            </p>
          </div>

          {multiplayerAvailable ? (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                join();
              }}
            >
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
                placeholder="ABC123"
                aria-label="Invite code"
                autoFocus
                className="glass w-full rounded-2xl px-4 py-4 text-center font-mono text-2xl font-black tracking-[0.4em] text-primary uppercase placeholder:text-tertiary/50"
              />
              <input
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value.slice(0, 24))}
                placeholder={`Your name (or stay "${randomName()}")`}
                aria-label="Your display name"
                className="glass w-full rounded-2xl px-4 py-3 text-sm font-bold text-primary placeholder:text-tertiary"
              />
              <Button type="submit" size="lg" className="w-full" disabled={code.length < 4}>
                Join puzzle →
              </Button>
            </form>
          ) : (
            <div className="space-y-4 text-center">
              <p className="text-sm font-semibold text-secondary">
                Multiplayer isn't configured yet. To enable it:
              </p>
              <ol className="mx-auto max-w-xs list-decimal space-y-1 pl-6 text-left text-sm font-semibold text-secondary">
                <li>
                  Run <code className="rounded bg-black/10 px-1 dark:bg-white/10">npx convex dev</code>
                </li>
                <li>
                  Put the deployment URL in <code className="rounded bg-black/10 px-1 dark:bg-white/10">.env.local</code> as{" "}
                  <code className="rounded bg-black/10 px-1 dark:bg-white/10">VITE_CONVEX_URL</code>
                </li>
                <li>Restart the dev server</li>
              </ol>
              <Button variant="secondary" className="w-full" onClick={() => navigate("/new")}>
                Play solo instead
              </Button>
            </div>
          )}
        </motion.div>
      </div>
    </PageShell>
  );
}
