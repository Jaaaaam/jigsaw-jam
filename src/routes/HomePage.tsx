import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { BrandLink, PageShell, SoundControl, ThemeToggle } from "@/components/PageShell";
import { Button } from "@/components/ui/Button";
import { deleteSave, listSaves, type SaveMeta } from "@/services/saves";
import { formatElapsed } from "@/stores/gameStore";
import { multiplayerAvailable } from "@/lib/convexClient";

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};
const rise = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 260, damping: 24 } },
};

export default function HomePage() {
  const navigate = useNavigate();
  const [saves, setSaves] = useState<SaveMeta[]>(() => listSaves());
  const inProgress = useMemo(() => saves.filter((s) => !s.completedAt), [saves]);

  return (
    <PageShell>
      <header className="flex items-center justify-between">
        <BrandLink />
        <div className="flex items-center gap-2">
          <SoundControl />
          <ThemeToggle />
        </div>
      </header>

      <motion.section
        variants={stagger}
        initial="hidden"
        animate="show"
        className="flex flex-1 flex-col items-center justify-center gap-10 py-14 text-center"
      >
        <motion.div variants={rise} className="space-y-4">
          <motion.div
            className="mx-auto text-7xl"
            animate={{ rotate: [0, -6, 6, 0] }}
            transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          >
            🧩
          </motion.div>
          <h1 className="text-5xl font-black tracking-tight text-primary sm:text-6xl">
            Jigsaw <span className="text-coral-500">Jam</span>
          </h1>
          <p className="mx-auto max-w-md text-lg font-semibold text-secondary">
            Cozy jigsaw puzzles from beautiful photos — solo, or live with friends.
          </p>
        </motion.div>

        <motion.div variants={rise} className="flex flex-col items-center gap-3 sm:flex-row">
          <Button size="lg" onClick={() => navigate("/new")}>
            🎨 New Puzzle
          </Button>
          <Button
            size="lg"
            variant="secondary"
            onClick={() => navigate(multiplayerAvailable ? "/new?mode=host" : "/join")}
          >
            👥 Play with Friends
          </Button>
          <Button size="lg" variant="secondary" onClick={() => navigate("/join")}>
            🔑 Join a Room
          </Button>
        </motion.div>

        {inProgress.length > 0 && (
          <motion.div variants={rise} className="w-full max-w-2xl">
            <h2 className="mb-3 text-left text-sm font-extrabold tracking-wide text-tertiary uppercase">
              Continue puzzling
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {inProgress.slice(0, 4).map((save) => (
                <motion.div
                  key={save.id}
                  whileHover={{ scale: 1.02, y: -2 }}
                  className="glass group relative flex cursor-pointer items-center gap-3 overflow-hidden rounded-3xl p-3 text-left shadow-soft"
                  onClick={() => navigate("/play", { state: { saveId: save.id } })}
                >
                  <img
                    src={save.thumbUrl || save.imageUrl}
                    alt=""
                    className="h-16 w-20 rounded-2xl object-cover"
                    loading="lazy"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-extrabold text-primary">
                      {save.config.rows * save.config.cols} pieces
                    </p>
                    <p className="text-xs font-semibold text-tertiary">
                      {Math.round((save.placed / save.total) * 100)}% · {formatElapsed(save.elapsed)}
                    </p>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-mint-500 to-mint-300"
                        style={{ width: `${(save.placed / save.total) * 100}%` }}
                      />
                    </div>
                  </div>
                  <button
                    aria-label="Delete saved game"
                    className="absolute top-2 right-2 hidden h-6 w-6 cursor-pointer items-center justify-center rounded-full bg-black/30 text-xs text-white group-hover:flex"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteSave(save.id);
                      setSaves(listSaves());
                    }}
                  >
                    ✕
                  </button>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        {!multiplayerAvailable && (
          <motion.p variants={rise} className="max-w-md text-xs font-semibold text-tertiary">
            Multiplayer needs a Convex deployment — run <code className="rounded bg-black/10 px-1 dark:bg-white/10">npx convex dev</code>{" "}
            and set <code className="rounded bg-black/10 px-1 dark:bg-white/10">VITE_CONVEX_URL</code>. Solo play works fully offline.
          </motion.p>
        )}
      </motion.section>

      <footer className="space-y-1.5 pb-2 text-center text-xs font-semibold text-tertiary">
        <p>
          Photos by{" "}
          <Link to="/new" className="underline decoration-dotted">
            Pexels, Pixabay &amp; Picsum
          </Link>{" "}
          artists · Made for slow evenings
        </p>
        <p>
          Crafted by{" "}
          <a
            href="https://jam-silvestre.vercel.app/"
            target="_blank"
            rel="noreferrer"
            className="font-extrabold text-secondary underline decoration-dotted transition-colors hover:text-coral-500"
          >
            Patricia Jamille Silvestre
          </a>
          <span className="mx-1.5">·</span>
          <a
            href="https://www.linkedin.com/in/patricia-jamille-silvestre-7a5963100/"
            target="_blank"
            rel="noreferrer"
            className="underline decoration-dotted transition-colors hover:text-coral-500"
          >
            LinkedIn
          </a>
          <span className="mx-1.5">·</span>
          <a
            href="https://github.com/Jaaaaam"
            target="_blank"
            rel="noreferrer"
            className="underline decoration-dotted transition-colors hover:text-coral-500"
          >
            GitHub
          </a>
        </p>
      </footer>
    </PageShell>
  );
}
