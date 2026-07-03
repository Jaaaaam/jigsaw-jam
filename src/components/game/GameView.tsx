import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { GameController, type ControllerEvents } from "@/canvas/GameController";
import type { PieceSnapshot, PuzzleConfig } from "@/engine/types";
import { loadPuzzleBitmap } from "@/services/images";
import { sounds } from "@/services/sound/soundManager";
import { formatElapsed, useGame } from "@/stores/gameStore";
import { BOARD_COLORS, BOARD_TEXTURES, useSettings } from "@/stores/settingsStore";
import { Button, IconButton } from "@/components/ui/Button";
import { ColorPicker, Segmented, Spinner, Toggle } from "@/components/ui/controls";
import { Modal } from "@/components/ui/Modal";
import { Confetti } from "./Confetti";
import { SoundControl, ThemeToggle } from "@/components/PageShell";
import {
  ArrowLeftIcon, BulbIcon, CloseIcon, EyeIcon, EyeOffIcon, FitIcon, FrameIcon, FullscreenIcon,
  GearIcon, GhostIcon, ImageIcon, LayersIcon, LockIcon, MinusIcon, PauseIcon, PlayIcon, PlusIcon,
  ShuffleIcon, TargetIcon, TidyIcon, ToolsIcon,
} from "@/components/ui/icons";

export interface GameViewProps {
  imageUrl: string;
  thumbUrl?: string;
  config: PuzzleConfig;
  seed: number;
  initialSnapshots?: PieceSnapshot[];
  initialElapsed?: number;
  /** Extra controller events (multiplayer wiring). */
  events?: ControllerEvents;
  onControllerReady?: (c: GameController) => void;
  onControllerGone?: () => void;
  /** Called after local piece drops — solo autosave hook. */
  onDirty?: (c: GameController) => void;
  onRestart?: () => void;
  /** Overlays (live cursors, chat, players) rendered above the canvas. */
  children?: ReactNode;
  completionExtra?: ReactNode;
  canPause?: boolean;
}

export function GameView(props: GameViewProps) {
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controllerRef = useRef<GameController | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  const game = useGame();
  const { boardColor, setBoardColor, boardTexture, setBoardTexture } = useSettings();
  const [ghost, setGhost] = useState(false);
  const [edgeGlow, setEdgeGlow] = useState(false);
  const [snapGuide, setSnapGuide] = useState(true);
  const [stash, setStash] = useState(props.config.edgesFirst);
  const [previewOpen, setPreviewOpen] = useState(true);
  const [previewSize, setPreviewSize] = useState(180);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(() => window.innerWidth >= 1024);
  const [viewLocked, setViewLocked] = useState(false);
  const [uiHidden, setUiHidden] = useState(false);
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [celebrate, setCelebrate] = useState(false);

  const propsRef = useRef(props);
  propsRef.current = props;

  // ------------------------------------------------------------ boot
  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setFailed(false);
    useGame.getState().reset();

    void (async () => {
      try {
        const bitmap = await loadPuzzleBitmap(propsRef.current.imageUrl);
        if (cancelled || !canvasRef.current) return;
        const p = propsRef.current;
        const local: ControllerEvents = {
          onPickUp: () => sounds.play("pickup"),
          onDrop: () => sounds.play("drop"),
          onMerge: () => {
            sounds.play("merge");
            p.onDirty?.(controllerRef.current!);
          },
          onHoverTarget: () => sounds.play("hover"),
          onPlace: (placed, _total, joined) => {
            sounds.play(joined ? "merge" : "snap");
            useGame.getState().setProgress(placed);
            p.onDirty?.(controllerRef.current!);
          },
          onComplete: () => {
            useGame.getState().complete();
            sounds.play("complete");
            setCelebrate(true);
            p.onDirty?.(controllerRef.current!);
          },
          onZoomChange: (z) => useGame.getState().setZoom(z),
        };
        // Compose local UI handlers with external (multiplayer) ones so both fire.
        const events: ControllerEvents = { ...local };
        if (p.events) {
          for (const key of Object.keys(p.events) as Array<keyof ControllerEvents>) {
            const ext = p.events[key] as ((...a: unknown[]) => void) | undefined;
            const loc = local[key] as ((...a: unknown[]) => void) | undefined;
            (events[key] as unknown) = (...a: unknown[]) => {
              loc?.(...a);
              ext?.(...a);
            };
          }
        }
        const controller = new GameController({
          canvas: canvasRef.current,
          image: bitmap as CanvasImageSource & { width: number; height: number },
          config: p.config,
          seed: p.seed,
          events,
          options: {
            ghost: false,
            edgeHighlight: false,
            snapGuide: true,
            boardColor: useSettings.getState().boardColor,
            boardTexture: useSettings.getState().boardTexture,
            rotationEnabled: p.config.rotationEnabled,
            // top bar (+ players bar in rooms) and bottom zoom bar overlay
            // the canvas — keep the initial fit clear of them
            viewInsets: { top: 96, bottom: 76 },
          },
          snapshots: p.initialSnapshots,
        });
        controllerRef.current = controller;
        if (p.config.edgesFirst) controller.setStash(true);
        const total = p.config.rows * p.config.cols;
        useGame.getState().start(total, controller.placedCount, p.initialElapsed ?? 0);
        setReady(true);
        p.onControllerReady?.(controller);
        if (controller.placedCount === total) {
          useGame.getState().complete();
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      controllerRef.current?.destroy();
      controllerRef.current = null;
      propsRef.current.onControllerGone?.();
    };
  }, [props.imageUrl, props.seed, props.config]);

  // timer tick
  useEffect(() => {
    const t = setInterval(() => useGame.getState().tick(), 1000);
    return () => clearInterval(t);
  }, []);

  // H toggles the whole interface away for distraction-free puzzling
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key.toLowerCase() === "h") setUiHidden((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // board colour / texture follow settings
  useEffect(() => {
    controllerRef.current?.setOptions({ boardColor, boardTexture });
  }, [boardColor, boardTexture, ready]);

  const togglePause = useCallback(() => {
    const next = !useGame.getState().paused;
    useGame.getState().setPaused(next);
    if (controllerRef.current) controllerRef.current.paused = next;
    sounds.play("click");
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen();
  }, []);

  const pct = game.totalPieces ? Math.round((game.placedPieces / game.totalPieces) * 100) : 0;

  return (
    <div className="fixed inset-0 overflow-hidden">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-label="Puzzle board" />

      {!ready && !failed && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
          <Spinner />
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-sm font-bold text-secondary"
          >
            Cutting {props.config.rows * props.config.cols} pieces…
          </motion.p>
        </div>
      )}
      {failed && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
          <span className="text-5xl">🌧️</span>
          <p className="max-w-xs text-center text-sm font-semibold text-secondary">
            Couldn't load that photo. It may be temporarily unavailable.
          </p>
          <Button onClick={() => navigate("/new")}>Pick another</Button>
        </div>
      )}

      {/* ------------------------------------------------ zen mode restore */}
      <AnimatePresence>
        {uiHidden && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            aria-label="Show interface"
            title="Show interface (H)"
            className="glass absolute top-3 right-3 z-30 flex h-11 w-11 cursor-pointer items-center justify-center rounded-2xl text-secondary opacity-60 shadow-soft transition-opacity hover:opacity-100"
            onClick={() => {
              sounds.play("click");
              setUiHidden(false);
            }}
          >
            <EyeIcon />
          </motion.button>
        )}
      </AnimatePresence>

      {!uiHidden && (
      <>
      {/* ------------------------------------------------ top bar */}
      <motion.header
        initial={{ y: -60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 28, delay: 0.1 }}
        className="absolute top-3 left-1/2 z-20 flex w-[calc(100%-1.5rem)] max-w-3xl -translate-x-1/2 items-center gap-2 sm:gap-3"
      >
        <IconButton label="Back to menu" onClick={() => navigate("/")}>
          <ArrowLeftIcon />
        </IconButton>
        <div className="glass flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-4 py-2 shadow-soft">
          <ProgressRing pct={pct} />
          <div className="min-w-0">
            <p className="truncate text-sm font-extrabold text-primary">
              {game.placedPieces}/{game.totalPieces} placed
            </p>
            {!props.config.casual && (
              <p className="text-xs font-bold text-tertiary tabular-nums" aria-label="Elapsed time">
                ⏱ {formatElapsed(game.elapsed)}
              </p>
            )}
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            {props.canPause !== false && (
              <IconButton label={game.paused ? "Resume" : "Pause"} onClick={togglePause}>
                {game.paused ? <PlayIcon /> : <PauseIcon />}
              </IconButton>
            )}
            <SoundControl />
          </div>
        </div>
      </motion.header>

      {/* ------------------------------------------------ tools panel */}
      <motion.div
        initial={{ x: -70, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 28, delay: 0.18 }}
        className="absolute top-20 left-3 z-20 sm:top-1/2 sm:-translate-y-1/2"
      >
        <AnimatePresence mode="popLayout" initial={false}>
          {toolsOpen ? (
            <motion.nav
              key="panel"
              aria-label="Puzzle tools"
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              className="glass-strong w-48 rounded-3xl p-2 shadow-float"
            >
              <div className="mb-1 flex items-center justify-between px-2 pt-1">
                <span className="text-xs font-extrabold tracking-wide text-tertiary uppercase">Tools</span>
                <button
                  aria-label="Collapse tools"
                  className="cursor-pointer rounded-lg p-1 text-tertiary hover:bg-black/5 hover:text-primary dark:hover:bg-white/10"
                  onClick={() => { setToolsOpen(false); sounds.play("click"); }}
                >
                  <CloseIcon width={16} height={16} />
                </button>
              </div>
              <ToolRow icon={<ImageIcon />} label="Preview" toggled={previewOpen} onClick={() => setPreviewOpen((o) => !o)} />
              <ToolRow
                icon={<GhostIcon />}
                label="Ghost image"
                toggled={ghost}
                onClick={() => {
                  setGhost(!ghost);
                  controllerRef.current?.setOptions({ ghost: !ghost });
                }}
              />
              <ToolRow
                icon={<FrameIcon />}
                label="Show edges"
                toggled={edgeGlow}
                onClick={() => {
                  setEdgeGlow(!edgeGlow);
                  controllerRef.current?.setOptions({ edgeHighlight: !edgeGlow });
                }}
              />
              <ToolRow
                icon={<TargetIcon />}
                label="Snap guide"
                toggled={snapGuide}
                onClick={() => {
                  setSnapGuide(!snapGuide);
                  controllerRef.current?.setOptions({ snapGuide: !snapGuide });
                }}
              />
              <ToolRow
                icon={<LayersIcon />}
                label="Edges first"
                toggled={stash}
                onClick={() => {
                  setStash(!stash);
                  controllerRef.current?.setStash(!stash);
                }}
              />
              <div className="mx-2 my-1.5 border-t border-black/10 dark:border-white/10" />
              <ToolRow icon={<BulbIcon />} label="Hint" onClick={() => { controllerRef.current?.hint(); sounds.play("pop"); }} />
              <ToolRow icon={<TidyIcon />} label="Tidy pieces" onClick={() => { controllerRef.current?.arrange(); sounds.play("whoosh"); }} />
              <ToolRow icon={<ShuffleIcon />} label="Shuffle" onClick={() => { controllerRef.current?.shuffle(); sounds.play("whoosh"); }} />
              <div className="mx-2 my-1.5 border-t border-black/10 dark:border-white/10" />
              <ToolRow
                icon={<LockIcon />}
                label="Lock view"
                toggled={viewLocked}
                onClick={() => {
                  setViewLocked(!viewLocked);
                  if (controllerRef.current) controllerRef.current.viewLocked = !viewLocked;
                }}
              />
              <ToolRow icon={<EyeOffIcon />} label="Hide interface" onClick={() => setUiHidden(true)} />
              <ToolRow icon={<GearIcon />} label="Settings" onClick={() => setSettingsOpen(true)} />
            </motion.nav>
          ) : (
            <motion.button
              key="pill"
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              className="glass flex cursor-pointer items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-extrabold text-primary shadow-soft"
              onClick={() => { setToolsOpen(true); sounds.play("click"); }}
            >
              <ToolsIcon width={17} height={17} />
              Tools
            </motion.button>
          )}
        </AnimatePresence>
      </motion.div>

      {/* ------------------------------------------------ zoom bar */}
      <motion.div
        initial={{ y: 70, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 28, delay: 0.24 }}
        className="glass absolute bottom-4 left-3 z-20 flex items-center gap-1 rounded-2xl p-1.5 shadow-soft"
        role="group"
        aria-label="View controls"
      >
        <ZoomButton label="Zoom out" onClick={() => controllerRef.current?.zoomBy(1 / 1.25)}>
          <MinusIcon width={17} height={17} />
        </ZoomButton>
        <ZoomButton label="Zoom in" onClick={() => controllerRef.current?.zoomBy(1.25)}>
          <PlusIcon width={17} height={17} />
        </ZoomButton>
        <div className="mx-0.5 h-6 border-l border-black/10 dark:border-white/10" />
        <ZoomButton label="Fit puzzle to screen" onClick={() => controllerRef.current?.fitToScene()} text="Fit">
          <FitIcon width={17} height={17} />
        </ZoomButton>
        <ZoomButton label="Toggle fullscreen" onClick={toggleFullscreen} text="Full screen">
          <FullscreenIcon width={17} height={17} />
        </ZoomButton>
      </motion.div>

      {/* ------------------------------------------------ preview panel */}
      <AnimatePresence>
        {previewOpen && ready && (
          <motion.div
            drag
            dragMomentum={false}
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.85 }}
            className="glass-strong absolute right-4 bottom-4 z-20 cursor-grab rounded-3xl p-3 shadow-float active:cursor-grabbing"
          >
            <img
              src={props.thumbUrl ?? props.imageUrl}
              alt="Puzzle preview"
              draggable={false}
              className="pointer-events-none rounded-2xl object-cover"
              style={{ width: previewSize, height: previewSize * 0.75 }}
            />
            <div className="mt-2 px-1">
              <input
                type="range"
                min={120}
                max={340}
                value={previewSize}
                onChange={(e) => setPreviewSize(Number(e.target.value))}
                aria-label="Preview size"
                className="w-full"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {props.children}
      </>
      )}

      {/* ------------------------------------------------ board settings */}
      <Modal open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Board & display">
        <div className="space-y-5">
          <ColorPicker label="Board colour" colors={BOARD_COLORS} value={boardColor} onChange={setBoardColor} />
          <div>
            <span className="mb-2 block text-sm font-bold text-secondary">Board texture</span>
            <Segmented
              ariaLabel="Board texture"
              options={BOARD_TEXTURES.map((t) => ({ value: t.id, label: t.label }))}
              value={boardTexture}
              onChange={setBoardTexture}
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm font-bold text-secondary">Theme</span>
            <ThemeToggle />
          </div>
          <ReducedMotionToggle />
          {props.onRestart && (
            <Button variant="danger" className="w-full" onClick={() => { setSettingsOpen(false); setConfirmRestart(true); }}>
              Restart puzzle
            </Button>
          )}
          <Button variant="secondary" className="w-full" onClick={() => setSettingsOpen(false)}>
            Done
          </Button>
        </div>
      </Modal>

      <Modal open={confirmRestart} onClose={() => setConfirmRestart(false)} title="Start over?">
        <p className="mb-5 text-sm font-semibold text-secondary">
          All progress on this puzzle will be scattered back to the tray.
        </p>
        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={() => setConfirmRestart(false)}>
            Keep going
          </Button>
          <Button
            variant="danger"
            className="flex-1"
            onClick={() => {
              setConfirmRestart(false);
              props.onRestart?.();
            }}
          >
            Restart
          </Button>
        </div>
      </Modal>

      {/* ------------------------------------------------ pause overlay */}
      <AnimatePresence>
        {game.paused && !game.completed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-6 bg-lav-950/50 backdrop-blur-xl"
          >
            <motion.span
              initial={{ scale: 0.6 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
              className="text-6xl"
            >
              ☕️
            </motion.span>
            <p className="text-2xl font-black text-white">Paused</p>
            <p className="-mt-4 text-sm font-semibold text-white/70">The pieces will wait for you.</p>
            <Button size="lg" onClick={togglePause}>
              ▶ Resume
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ------------------------------------------------ completion */}
      <Confetti active={celebrate} />
      <Modal open={game.completed} title="Puzzle complete! 🎉">
        <div className="space-y-4 text-center">
          <motion.img
            src={props.thumbUrl ?? props.imageUrl}
            alt="Finished puzzle"
            className="mx-auto w-full max-w-xs rounded-2xl shadow-float"
            initial={{ scale: 0.8, rotate: -3 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 200, damping: 18 }}
          />
          <p className="text-lg font-extrabold text-primary">
            {game.totalPieces} pieces
            {!props.config.casual && <> · {formatElapsed(game.elapsed)}</>}
          </p>
          {props.completionExtra}
          <div className="flex gap-3">
            {props.onRestart && (
              <Button variant="secondary" className="flex-1" onClick={props.onRestart}>
                Play again
              </Button>
            )}
            <Button className="flex-1" onClick={() => navigate("/new")}>
              New puzzle
            </Button>
          </div>
          <button
            className="cursor-pointer text-sm font-bold text-tertiary hover:text-secondary"
            onClick={() => navigate("/")}
          >
            Back to menu
          </button>
        </div>
      </Modal>
    </div>
  );
}

interface ToolRowProps {
  icon: ReactNode;
  label: string;
  /** Present = this is a toggle; shows an on/off dot. */
  toggled?: boolean;
  onClick: () => void;
}

function ToolRow({ icon, label, toggled, onClick }: ToolRowProps) {
  const isToggle = toggled !== undefined;
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      role={isToggle ? "switch" : undefined}
      aria-checked={isToggle ? toggled : undefined}
      className={`flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm font-bold transition-colors ${
        toggled
          ? "bg-coral-50/80 text-coral-600 dark:bg-coral-500/20 dark:text-coral-300"
          : "text-secondary hover:bg-black/5 hover:text-primary dark:hover:bg-white/10"
      }`}
      onClick={() => {
        sounds.play("click");
        onClick();
      }}
    >
      <span className="shrink-0">{icon}</span>
      <span className="flex-1 text-left">{label}</span>
      {isToggle && (
        <span
          aria-hidden
          className={`h-2 w-2 shrink-0 rounded-full transition-colors ${
            toggled ? "bg-coral-500" : "bg-black/15 dark:bg-white/20"
          }`}
        />
      )}
    </motion.button>
  );
}

function ZoomButton({ label, text, onClick, children }: {
  label: string;
  text?: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.94 }}
      aria-label={label}
      title={label}
      className="flex h-9 cursor-pointer items-center gap-1.5 rounded-xl px-2.5 text-sm font-bold text-secondary transition-colors hover:bg-black/5 hover:text-primary dark:hover:bg-white/10"
      onClick={() => {
        sounds.play("click");
        onClick();
      }}
    >
      {children}
      {text && <span className="hidden sm:inline">{text}</span>}
    </motion.button>
  );
}

function ReducedMotionToggle() {
  const reducedMotion = useSettings((s) => s.reducedMotion);
  const setReducedMotion = useSettings((s) => s.setReducedMotion);
  return (
    <Toggle
      label="Reduce motion"
      hint="Calms animations across the app"
      checked={reducedMotion}
      onChange={setReducedMotion}
    />
  );
}

function ProgressRing({ pct }: { pct: number }) {
  const r = 15;
  const c = 2 * Math.PI * r;
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" role="img" aria-label={`${pct}% complete`}>
      <circle cx="20" cy="20" r={r} fill="none" strokeWidth="5" className="stroke-black/10 dark:stroke-white/15" />
      <motion.circle
        cx="20"
        cy="20"
        r={r}
        fill="none"
        strokeWidth="5"
        strokeLinecap="round"
        stroke="url(#ringGrad)"
        strokeDasharray={c}
        animate={{ strokeDashoffset: c * (1 - pct / 100) }}
        transition={{ type: "spring", stiffness: 90, damping: 20 }}
        transform="rotate(-90 20 20)"
      />
      <defs>
        <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#34b47f" />
          <stop offset="100%" stopColor="#7fdcb2" />
        </linearGradient>
      </defs>
      <text
        x="20"
        y="24"
        textAnchor="middle"
        className="fill-current text-[10px] font-black"
        style={{ fill: "var(--text-primary)" }}
      >
        {pct}
      </text>
    </svg>
  );
}
