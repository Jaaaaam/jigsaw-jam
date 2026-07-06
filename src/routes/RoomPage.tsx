import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { GameController } from "@/canvas/GameController";
import { GameView } from "@/components/game/GameView";
import { ChatPanel, CursorsOverlay, PlayersBar, type RoomMessage, type RoomPlayer } from "@/components/game/multiplayer";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/controls";
import { createGeometry } from "@/engine/geometry";
import { randomSeed } from "@/engine/random";
import { scatterPositions } from "@/engine/puzzle";
import type { PieceSnapshot, PuzzleConfig } from "@/engine/types";
import { multiplayerAvailable } from "@/lib/convexClient";
import { NextRoundModal } from "@/components/setup/NextRoundModal";
import { pushRecent, type PuzzleImage } from "@/services/images";
import { colorForSession, getSessionId, randomName } from "@/services/session";
import { useSettings } from "@/stores/settingsStore";
import { PageShell } from "@/components/PageShell";

export default function RoomPage() {
  if (!multiplayerAvailable) return <Navigate to="/join" replace />;
  return <RoomInner />;
}

/** Computes the deterministic initial scatter that all clients share. */
function initialPiecesFor(config: PuzzleConfig, seed: number, imageW: number, imageH: number) {
  const geom = createGeometry(config, seed, imageW, imageH);
  const spots = scatterPositions(geom, seed, config.rows * config.cols);
  return spots.map((s, i) => ({
    pieceId: i,
    x: s.x,
    y: s.y,
    rot: config.rotationEnabled ? Math.floor(Math.random() * 4) : 0,
  }));
}

function RoomInner() {
  const { code } = useParams<{ code: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const sessionId = useMemo(getSessionId, []);
  const myColor = useMemo(() => colorForSession(sessionId), [sessionId]);
  const playerName = useSettings((s) => s.playerName) || randomName();

  const createRoom = useMutation(api.rooms.create);
  const creatingRef = useRef(false);
  const [createError, setCreateError] = useState(false);

  // ---- /room/new : host creates the room, then redirects to its code
  const hostState = location.state as { image?: PuzzleImage; config?: PuzzleConfig; seed?: number } | null;
  const isNew = code === "new";
  useEffect(() => {
    if (!isNew || creatingRef.current) return;
    if (!hostState?.image || !hostState.config || hostState.seed === undefined) return;
    creatingRef.current = true;
    void (async () => {
      try {
        // Use the provider-reported dimensions capped like loadPuzzleBitmap does.
        const img = hostState.image!;
        const cap = 2200 / Math.max(img.width, img.height);
        const scale = Math.min(1, cap);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const { code: newCode } = await createRoom({
          hostSessionId: sessionId,
          imageUrl: img.url,
          thumbUrl: img.thumbUrl,
          seed: hostState.seed!,
          config: hostState.config!,
          initialPieces: initialPiecesFor(hostState.config!, hostState.seed!, w, h),
        });
        navigate(`/room/${newCode}`, { replace: true });
      } catch {
        setCreateError(true);
      }
    })();
  }, [isNew, hostState, createRoom, navigate, sessionId]);

  const room = useQuery(api.rooms.getByCode, isNew ? "skip" : { code: code ?? "" });

  if (isNew) {
    if (!hostState?.image) return <Navigate to="/new?mode=host" replace />;
    return (
      <CenteredNote>
        {createError ? (
          <>
            <span className="text-4xl">🌧️</span>
            <p className="text-sm font-semibold text-secondary">Couldn't create the room. Is your Convex dev server running?</p>
            <Button onClick={() => navigate("/new?mode=host")}>Back</Button>
          </>
        ) : (
          <>
            <Spinner />
            <p className="text-sm font-bold text-secondary">Setting up your room…</p>
          </>
        )}
      </CenteredNote>
    );
  }

  if (room === undefined) {
    return (
      <CenteredNote>
        <Spinner />
        <p className="text-sm font-bold text-secondary">Finding room {code}…</p>
      </CenteredNote>
    );
  }
  if (room === null) {
    return (
      <CenteredNote>
        <span className="text-4xl">🕵️</span>
        <p className="text-sm font-semibold text-secondary">
          No room called <span className="font-mono font-black">{code}</span> — check the code with your friend.
        </p>
        <Button onClick={() => navigate("/join")}>Try another code</Button>
      </CenteredNote>
    );
  }

  return <ActiveRoom roomId={room._id} room={room} sessionId={sessionId} playerName={playerName} myColor={myColor} />;
}

function CenteredNote({ children }: { children: React.ReactNode }) {
  return (
    <PageShell>
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">{children}</div>
    </PageShell>
  );
}

interface RoomDoc {
  _id: Id<"rooms">;
  code: string;
  hostSessionId: string;
  imageUrl: string;
  thumbUrl: string;
  seed: number;
  config: PuzzleConfig;
  status: "playing" | "completed";
  createdAt: number;
  elapsedAtComplete?: number;
  settings?: { snapGuide: boolean; edgesFirst: boolean };
  hint?: { pieceId: number; partnerId?: number; at: number };
  choosingAt?: number;
}

function ActiveRoom({ roomId, room, sessionId, playerName, myColor }: {
  roomId: Id<"rooms">;
  room: RoomDoc;
  sessionId: string;
  playerName: string;
  myColor: string;
}) {
  const pieceDocs = useQuery(api.pieces.list, { roomId });
  const playerDocs = useQuery(api.presence.listPlayers, { roomId });
  const messageDocs = useQuery(api.chat.list, { roomId });

  const join = useMutation(api.presence.join);
  const heartbeat = useMutation(api.presence.heartbeat);
  const claim = useMutation(api.pieces.claim);
  const move = useMutation(api.pieces.move);
  const release = useMutation(api.pieces.release);
  const complete = useMutation(api.rooms.complete);
  const nextRound = useMutation(api.rooms.nextRound);
  const setChoosing = useMutation(api.rooms.setChoosing);
  const sendMessage = useMutation(api.chat.send);
  const updateSettings = useMutation(api.rooms.updateSettings);
  const broadcastHint = useMutation(api.rooms.broadcastHint);

  const [controller, setController] = useState<GameController | null>(null);
  const controllerRef = useRef<GameController | null>(null);
  const cursorRef = useRef<{ x: number; y: number } | null>(null);

  const isHost = room.hostSessionId === sessionId;

  // room-wide play settings, host-controlled; legacy rooms fall back to config
  const effectiveSettings = room.settings ?? { snapGuide: true, edgesFirst: room.config.edgesFirst };

  // join + heartbeat presence (with cursor piggybacked). Every heartbeat
  // re-runs listPlayers for every player in the room, so these rates are a
  // major driver of Convex usage — keep them as low as presence allows
  // (ONLINE_WINDOW_MS in convex/presence.ts must stay comfortably larger).
  useEffect(() => {
    void join({ roomId, sessionId, name: playerName, color: myColor });
    const beat = () => {
      if (document.hidden) return; // backgrounded tabs just go stale
      void heartbeat({
        roomId,
        sessionId,
        ...(cursorRef.current ? { cursorX: cursorRef.current.x, cursorY: cursorRef.current.y } : {}),
      }).catch(() => undefined);
    };
    const t = setInterval(beat, 10000);
    return () => clearInterval(t);
  }, [roomId, sessionId, playerName, myColor, join, heartbeat]);

  // stream cursor position (throttled) from pointer moves over the canvas
  useEffect(() => {
    if (!controller) return;
    let last = 0;
    let lastSent: { x: number; y: number } | null = null;
    const onMove = (e: PointerEvent) => {
      cursorRef.current = controller.screenToWorld(e.clientX, e.clientY);
      const now = Date.now();
      if (now - last <= 500) return;
      // skip micro-jitters — no point re-running listPlayers for a wiggle
      if (lastSent && Math.hypot(e.clientX - lastSent.x, e.clientY - lastSent.y) < 8) return;
      last = now;
      lastSent = { x: e.clientX, y: e.clientY };
      void heartbeat({
        roomId,
        sessionId,
        cursorX: cursorRef.current.x,
        cursorY: cursorRef.current.y,
      }).catch(() => undefined);
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, [controller, roomId, sessionId, heartbeat]);

  // initial snapshots for the controller boot
  const initialSnapshots = useMemo<PieceSnapshot[] | undefined>(() => {
    if (!pieceDocs || pieceDocs.length === 0) return undefined;
    return pieceDocs.map((d) => ({
      id: d.pieceId,
      x: d.x,
      y: d.y,
      rot: (d.rot % 4) as 0 | 1 | 2 | 3,
      groupId: d.groupId,
      placed: d.placed,
      z: d.z,
    }));
    // boot once per game round; live updates flow through applyRemote below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pieceDocs !== undefined, room.seed]);

  // live remote updates + remote lock outlines
  useEffect(() => {
    if (!controller || !pieceDocs) return;
    const now = Date.now();
    controller.applyRemote(
      pieceDocs
        .filter((d) => !(d.heldBy === sessionId))
        .map((d) => ({
          id: d.pieceId,
          x: d.x,
          y: d.y,
          rot: (d.rot % 4) as 0 | 1 | 2 | 3,
          groupId: d.groupId,
          placed: d.placed,
          z: d.z,
        })),
    );
    const locks = new Map<number, { color: string }>();
    const colorBySession = new Map((playerDocs ?? []).map((p) => [p.sessionId, p.color]));
    for (const d of pieceDocs) {
      if (d.heldBy && d.heldBy !== sessionId && now - (d.heldAt ?? 0) < 15000) {
        locks.set(d.pieceId, { color: colorBySession.get(d.heldBy) ?? "#999" });
      }
    }
    controller.setRemoteLocks(locks);
  }, [controller, pieceDocs, playerDocs, sessionId]);

  // host-controlled room settings — one source of truth for every board
  useEffect(() => {
    if (!controller) return;
    controller.setOptions({ snapGuide: effectiveSettings.snapGuide });
    controller.setStash(effectiveSettings.edgesFirst);
  }, [controller, effectiveSettings.snapGuide, effectiveSettings.edgesFirst]);

  // host hint broadcast — flash the pulse on every board, skip stale ones
  useEffect(() => {
    if (!controller || !room.hint) return;
    if (Date.now() - room.hint.at > 3200) return;
    controller.showHint(room.hint.pieceId, room.hint.partnerId);
  }, [controller, room.hint]);

  const players: RoomPlayer[] = useMemo(
    () =>
      (playerDocs ?? []).map((p) => ({
        sessionId: p.sessionId,
        name: p.name,
        color: p.color,
        online: p.online,
        piecesPlaced: p.piecesPlaced,
        cursorX: p.cursorX,
        cursorY: p.cursorY,
      })),
    [playerDocs],
  );

  const messages: RoomMessage[] = useMemo(
    () =>
      (messageDocs ?? []).map((m) => ({
        id: m._id,
        sessionId: m.sessionId,
        name: m.name,
        color: m.color,
        kind: m.kind,
        text: m.text,
        createdAt: m.createdAt,
      })),
    [messageDocs],
  );

  const events = useMemo(
    () => ({
      onClaim: (pieceIds: number[]) => void claim({ roomId, sessionId, pieceIds }).catch(() => undefined),
      onStream: (snapshots: PieceSnapshot[]) =>
        void move({ roomId, sessionId, snapshots: snapshots.map(toWire) }).catch(() => undefined),
      onRelease: (snapshots: PieceSnapshot[]) =>
        void release({ roomId, sessionId, snapshots: snapshots.map(toWire) }).catch(() => undefined),
      onComplete: () =>
        void complete({ roomId, elapsed: Date.now() - room.createdAt }).catch(() => undefined),
      onEdgesDone: () => {
        // keep the room doc truthful so late joiners don't boot stashed
        if (isHost) {
          void updateSettings({
            roomId,
            sessionId,
            settings: { snapGuide: effectiveSettings.snapGuide, edgesFirst: false },
          }).catch(() => undefined);
        }
      },
    }),
    [claim, move, release, complete, updateSettings, roomId, sessionId, room.createdAt, isHost, effectiveSettings.snapGuide],
  );

  const onHostSettingsChange = useCallback(
    (settings: { snapGuide: boolean; edgesFirst: boolean }) =>
      void updateSettings({ roomId, sessionId, settings }).catch(() => undefined),
    [updateSettings, roomId, sessionId],
  );

  const onHostHint = useCallback(() => {
    const choice = controllerRef.current?.chooseHint();
    if (!choice) return;
    void broadcastHint({ roomId, sessionId, ...choice }).catch(() => undefined);
  }, [broadcastHint, roomId, sessionId]);

  // "Play again" / "Start over" open the next-round setup instead of restarting directly
  const [nextRoundOpen, setNextRoundOpen] = useState(false);
  const [nextRoundBusy, setNextRoundBusy] = useState(false);

  const openNextRound = useCallback(() => {
    setNextRoundOpen(true);
    void setChoosing({ roomId, sessionId, choosing: true }).catch(() => undefined);
  }, [setChoosing, roomId, sessionId]);

  const closeNextRound = useCallback(() => {
    setNextRoundOpen(false);
    void setChoosing({ roomId, sessionId, choosing: false }).catch(() => undefined);
  }, [setChoosing, roomId, sessionId]);

  const confirmNextRound = useCallback(
    async (image: PuzzleImage | null, config: PuzzleConfig) => {
      const seed = randomSeed();
      let w: number;
      let h: number;
      if (image) {
        // provider-reported dimensions capped like loadPuzzleBitmap does — must
        // match what every client will actually load
        const scale = Math.min(1, 2200 / Math.max(image.width, image.height));
        w = Math.round(image.width * scale);
        h = Math.round(image.height * scale);
        if (image.provider !== "upload") pushRecent(image);
      } else {
        // same photo: the current controller's geometry already has the answer
        w = controllerRef.current?.geom.width ?? 1600;
        h = controllerRef.current?.geom.height ?? 1200;
      }
      setNextRoundBusy(true);
      try {
        await nextRound({
          roomId,
          sessionId,
          imageUrl: image?.url ?? room.imageUrl,
          thumbUrl: image?.thumbUrl ?? room.thumbUrl,
          seed,
          config,
          initialPieces: initialPiecesFor(config, seed, w, h),
        });
        setNextRoundOpen(false); // nextRound clears choosingAt itself
      } finally {
        setNextRoundBusy(false);
      }
    },
    [nextRound, roomId, sessionId, room.imageUrl, room.thumbUrl],
  );

  // wait for first piece payload before booting the canvas
  if (!pieceDocs) {
    return (
      <CenteredNote>
        <Spinner />
        <p className="text-sm font-bold text-secondary">Joining {room.code}…</p>
      </CenteredNote>
    );
  }

  const topPlayers = [...players].sort((a, b) => b.piecesPlaced - a.piecesPlaced).slice(0, 5);

  return (
    <GameView
      key={`${room.code}-${room.seed}-${room.imageUrl}`}
      imageUrl={room.imageUrl}
      thumbUrl={room.thumbUrl}
      config={room.config}
      seed={room.seed}
      initialSnapshots={initialSnapshots}
      initialElapsed={room.status === "completed" ? (room.elapsedAtComplete ?? 0) : Date.now() - room.createdAt}
      canPause={false}
      events={events}
      onControllerReady={(c) => {
        controllerRef.current = c;
        setController(c);
      }}
      onControllerGone={() => {
        controllerRef.current = null;
        setController(null);
      }}
      onRestart={isHost ? openNextRound : undefined}
      multiplayer
      isHost={isHost}
      hostSettings={effectiveSettings}
      onHostSettingsChange={onHostSettingsChange}
      onHostHint={onHostHint}
      topBarExtra={
        <PlayersBar players={players} hostSessionId={room.hostSessionId} mySessionId={sessionId} code={room.code} />
      }
      completionExtra={
        <div className="glass rounded-2xl p-3 text-left">
          <p className="mb-2 text-xs font-extrabold tracking-wide text-tertiary uppercase">Team effort</p>
          {topPlayers.map((p) => (
            <div key={p.sessionId} className="flex items-center gap-2 py-0.5 text-sm font-bold text-primary">
              <span className="h-3 w-3 rounded-full" style={{ background: p.color }} />
              <span className="flex-1 truncate">{p.name}{p.sessionId === sessionId ? " (you)" : ""}</span>
              <span className="tabular-nums">{p.piecesPlaced} 🧩</span>
            </div>
          ))}
        </div>
      }
    >
      <CursorsOverlay players={players} mySessionId={sessionId} controller={controller} />
      {!isHost && room.choosingAt !== undefined && Date.now() - room.choosingAt < 180000 && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-3 bg-lav-950/40 backdrop-blur-sm">
          <Spinner />
          <p className="glass rounded-2xl px-4 py-2 text-sm font-bold text-primary shadow-soft">
            {players.find((p) => p.sessionId === room.hostSessionId)?.name ?? "The host"} is choosing the next
            puzzle…
          </p>
        </div>
      )}
      {isHost && (
        <NextRoundModal
          open={nextRoundOpen}
          onClose={closeNextRound}
          onConfirm={(image, config) => void confirmNextRound(image, config)}
          currentThumbUrl={room.thumbUrl}
          currentConfig={room.config}
          busy={nextRoundBusy}
        />
      )}
      <ChatPanel
        messages={messages}
        mySessionId={sessionId}
        onSend={(kind, text) =>
          void sendMessage({ roomId, sessionId, name: playerName, color: myColor, kind, text }).catch(() => undefined)
        }
      />
    </GameView>
  );
}

function toWire(s: PieceSnapshot) {
  return { pieceId: s.id, x: s.x, y: s.y, rot: s.rot, groupId: s.groupId, placed: s.placed, z: s.z };
}
