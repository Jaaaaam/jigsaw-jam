import { createGeometry, spriteMargins } from "@/engine/geometry";
import { applySnapshot, createPieces, edgesComplete, neighborIds, scatterPositions, toSnapshot } from "@/engine/puzzle";
import type { PieceSnapshot, PieceState, PuzzleConfig, PuzzleGeometry, Vec2 } from "@/engine/types";
import {
  computeSpriteScale,
  renderClusterSprite,
  renderPieceSprite,
  type ClusterSprite,
  type PieceSprite,
} from "./sprites";

export interface ControllerEvents {
  onPickUp?: (pieceCount: number) => void;
  onDrop?: () => void;
  /** `joined` — the placement connected to already-placed neighbours. */
  onPlace?: (placedCount: number, total: number, joined: boolean) => void;
  onMerge?: () => void;
  onComplete?: () => void;
  onHoverTarget?: () => void;
  onWrongDrop?: () => void;
  /** Throttled position stream while dragging (multiplayer). */
  onStream?: (snapshots: PieceSnapshot[]) => void;
  /** Piece grabbed / released — used for multiplayer claims. */
  onClaim?: (pieceIds: number[]) => void;
  onRelease?: (snapshots: PieceSnapshot[]) => void;
  onZoomChange?: (zoom: number) => void;
  /** Edges-first stash auto-revealed because the edges are done. */
  onEdgesDone?: () => void;
}

export type BoardTextureId = "none" | "felt" | "wood" | "linen";

export interface ControllerOptions {
  ghost: boolean;
  edgeHighlight: boolean;
  /** Green glow + ring while a dragged piece hovers its correct spot. */
  snapGuide: boolean;
  boardColor: string;
  boardTexture: BoardTextureId;
  rotationEnabled: boolean;
  /** Seam darkness on placed pieces, 0 (invisible) to 1 (bold). */
  placedSeam?: number;
  /** Screen-px bands covered by HUD chrome; fitToScene keeps pieces clear of them. */
  viewInsets?: { top: number; bottom: number };
  /** Skip staggered entrances; reveals land instantly. */
  reducedMotion?: boolean;
}

interface Tween {
  piece: PieceState;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  start: number;
  duration: number;
  onDone?: () => void;
}

interface RemoteLock {
  color: string;
}

const LIFT_SCALE = 1.04;

export class GameController {
  readonly geom: PuzzleGeometry;
  readonly pieces: PieceState[];
  private groups = new Map<number, Set<number>>();
  private sprites: PieceSprite[] = [];
  /** Baked merged sprites for snapped-together groups, keyed by groupId. */
  private clusterSprites = new Map<number, { size: number; sprite: ClusterSprite }>();
  /** Board-placed pieces baked as one slab — same look as loose clusters. */
  private placedCache: { count: number; sprite: ClusterSprite } | null = null;
  private spriteScale = 1;
  /** Scratch 2d context for Path2D hit tests. */
  private hitCtx: CanvasRenderingContext2D;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private image: CanvasImageSource;
  private events: ControllerEvents;
  private opts: ControllerOptions;

  // Viewport: world point at canvas centre + pixels-per-world-unit.
  private vpX: number;
  private vpY: number;
  private scale: number;
  private minScale: number;
  private maxScale: number;

  private dirty = true;
  private raf = 0;
  private destroyed = false;
  private zCounter: number;
  private tweens: Tween[] = [];

  // Interaction state
  private drag: {
    groupId: number;
    pointerId: number;
    // world-space offsets from cursor to each piece pos
    offsets: Map<number, Vec2>;
    lastStream: number;
    hovered: boolean;
  } | null = null;
  private pan: { pointerId: number; startX: number; startY: number; vpX: number; vpY: number } | null = null;
  private pointers = new Map<number, Vec2>(); // screen coords
  private pinch: { dist: number; scale: number; midWorld: Vec2 } | null = null;
  private spaceHeld = false;
  private hintPiece: PieceState | null = null;
  /** Freeform hint: the joinable partner piece, ringed alongside hintPiece. */
  private hintPartner: PieceState | null = null;
  private hintStart = 0;
  /** Freeform mode: open table, no board slots — pieces only join each other. */
  private readonly freeform: boolean;
  /** Table plate bounds in freeform mode (world units). */
  private tableRect = { x: 0, y: 0, w: 0, h: 0 };
  private remoteLocks = new Map<number, RemoteLock>();
  private stashedIds = new Set<number>();
  /** Per-piece entrance animation after the stash auto-reveals. */
  private reveals = new Map<number, { start: number; delay: number }>();
  private completed = false;
  paused = false;
  /** Blocks pan/zoom gestures and keys; explicit UI buttons still work. */
  viewLocked = false;

  private abort = new AbortController();

  constructor(args: {
    canvas: HTMLCanvasElement;
    image: CanvasImageSource & { width: number; height: number };
    config: PuzzleConfig;
    seed: number;
    events: ControllerEvents;
    options: ControllerOptions;
    /** Restore a saved / remote game; omit for a fresh scatter. */
    snapshots?: PieceSnapshot[];
  }) {
    this.canvas = args.canvas;
    this.ctx = args.canvas.getContext("2d")!;
    this.image = args.image;
    this.events = args.events;
    this.opts = { ...args.options };
    this.geom = createGeometry(args.config, args.seed, args.image.width, args.image.height);
    this.freeform = args.config.boardMode === "freeform";
    this.pieces = createPieces(this.geom);
    this.zCounter = this.pieces.length;

    if (args.snapshots && args.snapshots.length === this.pieces.length) {
      for (const s of args.snapshots) {
        const p = this.pieces[s.id];
        if (p) applySnapshot(p, s);
        this.zCounter = Math.max(this.zCounter, s.z + 1);
      }
    } else {
      const spots = scatterPositions(this.geom, args.seed, this.pieces.length, this.viewAspect());
      this.pieces.forEach((p, i) => {
        const spot = spots[i]!;
        p.pos.x = spot.x;
        p.pos.y = spot.y;
        if (args.config.rotationEnabled) {
          p.rot = (Math.floor(Math.random() * 4) % 4) as 0 | 1 | 2 | 3;
        }
      });
    }
    this.rebuildGroups();

    if (this.freeform) {
      // table plate: covers the scattered pieces with breathing room
      const { mx, my } = spriteMargins(this.geom);
      let minX = -this.geom.cellW;
      let minY = -this.geom.cellH;
      let maxX = this.geom.width + this.geom.cellW;
      let maxY = this.geom.height + this.geom.cellH;
      for (const p of this.pieces) {
        minX = Math.min(minX, p.pos.x - mx - this.geom.cellW * 0.5);
        minY = Math.min(minY, p.pos.y - my - this.geom.cellH * 0.5);
        maxX = Math.max(maxX, p.pos.x + this.geom.cellW * 1.5 + mx);
        maxY = Math.max(maxY, p.pos.y + this.geom.cellH * 1.5 + my);
      }
      this.tableRect = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    }

    // Sprites
    const spriteScale = computeSpriteScale(this.geom, this.pieces.length);
    this.spriteScale = spriteScale;
    for (const p of this.pieces) {
      this.sprites.push(renderPieceSprite(this.geom, this.image, p.row, p.col, spriteScale));
    }

    this.hitCtx = document.createElement("canvas").getContext("2d")!;

    // Viewport: fit board + tray band
    this.vpX = this.geom.width / 2;
    this.vpY = this.geom.height / 2;
    this.scale = 1;
    this.minScale = 0.05;
    this.maxScale = 8;
    this.resize();
    this.fitToScene();

    this.canvas.style.cursor = "grab";
    this.bindInput();
    this.loop();

    if (import.meta.env.DEV) {
      // dev/test hook — lets tooling inspect and drive the live controller
      (window as unknown as Record<string, unknown>).__jjController = this;
    }
  }

  // ----------------------------------------------------------- groups

  private rebuildGroups(): void {
    this.groups.clear();
    this.clusterSprites.clear();
    for (const p of this.pieces) {
      let set = this.groups.get(p.groupId);
      if (!set) {
        set = new Set();
        this.groups.set(p.groupId, set);
      }
      set.add(p.id);
    }
  }

  private groupPieces(groupId: number): PieceState[] {
    const ids = this.groups.get(groupId);
    if (!ids) return [];
    const out: PieceState[] = [];
    for (const id of ids) out.push(this.pieces[id]!);
    return out;
  }

  private mergeGroups(intoId: number, fromId: number): void {
    if (intoId === fromId) return;
    const into = this.groups.get(intoId);
    const from = this.groups.get(fromId);
    if (!into || !from) return;
    for (const id of from) {
      into.add(id);
      this.pieces[id]!.groupId = intoId;
    }
    this.groups.delete(fromId);
    this.clusterSprites.delete(fromId);
    this.clusterSprites.delete(intoId);
  }

  /** Lazily bake / rebake the merged sprite for a multi-piece group. */
  private clusterSprite(groupId: number): ClusterSprite {
    const members = this.groups.get(groupId)!;
    const cached = this.clusterSprites.get(groupId);
    if (cached && cached.size === members.size) return cached.sprite;
    const cells = [...members].map((id) => this.pieces[id]!);
    // loose blobs always get full embossed joins — pieces are physical
    // things; the seam slider only flattens the placed picture
    const sprite = renderClusterSprite(this.geom, this.image, cells, this.spriteScale, 1);
    this.clusterSprites.set(groupId, { size: members.size, sprite });
    return sprite;
  }

  // ----------------------------------------------------------- viewport

  resize(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.dirty = true;
  }

  private dpr(): number {
    return Math.min(2, window.devicePixelRatio || 1);
  }

  screenToWorld(sx: number, sy: number): Vec2 {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: this.vpX + (sx - rect.left - rect.width / 2) / this.scale,
      y: this.vpY + (sy - rect.top - rect.height / 2) / this.scale,
    };
  }

  worldToScreen(wx: number, wy: number): Vec2 {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (wx - this.vpX) * this.scale + rect.width / 2,
      y: (wy - this.vpY) * this.scale + rect.height / 2,
    };
  }

  /** Frame the board plus every loose piece — the whole scene, not just the board. */
  fitToScene(): void {
    const rect = this.canvas.getBoundingClientRect();
    const { mx, my } = spriteMargins(this.geom);
    let minX = 0;
    let minY = 0;
    let maxX = this.geom.width;
    let maxY = this.geom.height;
    for (const p of this.pieces) {
      if (p.placed || this.stashedIds.has(p.id)) continue;
      minX = Math.min(minX, p.pos.x - mx);
      minY = Math.min(minY, p.pos.y - my);
      maxX = Math.max(maxX, p.pos.x + this.geom.cellW + mx);
      maxY = Math.max(maxY, p.pos.y + this.geom.cellH + my);
    }
    const w = maxX - minX;
    const h = maxY - minY;
    const pad = 1.06;
    // frame the scene inside the band left free by HUD chrome, so scattered
    // pieces don't boot up hidden behind the top bar / zoom controls
    const insetT = this.opts.viewInsets?.top ?? 0;
    const insetB = this.opts.viewInsets?.bottom ?? 0;
    const availH = Math.max(80, rect.height - insetT - insetB);
    const s = Math.min(rect.width / (w * pad), availH / (h * pad));
    this.scale = s;
    this.minScale = s * 0.4;
    this.maxScale = Math.max(4, s * 12);
    this.vpX = (minX + maxX) / 2;
    // shift the world centre so it lands mid-way between the insets
    this.vpY = (minY + maxY) / 2 - (insetT - insetB) / (2 * s);
    this.dirty = true;
    this.events.onZoomChange?.(s);
  }

  fitToBoard(): void {
    const rect = this.canvas.getBoundingClientRect();
    const s = Math.min(rect.width / (this.geom.width * 1.12), rect.height / (this.geom.height * 1.12));
    this.zoomTo(s);
  }

  get zoomLevel(): number {
    return this.scale;
  }

  zoomBy(factor: number, pivot?: Vec2): void {
    this.zoomTo(this.scale * factor, pivot);
  }

  private zoomTo(next: number, pivot?: Vec2): void {
    const clamped = Math.min(this.maxScale, Math.max(this.minScale, next));
    if (pivot) {
      // keep the world point under the pivot stationary
      const before = this.screenToWorld(pivot.x, pivot.y);
      this.scale = clamped;
      const after = this.screenToWorld(pivot.x, pivot.y);
      this.vpX += before.x - after.x;
      this.vpY += before.y - after.y;
    } else {
      this.scale = clamped;
    }
    this.dirty = true;
    this.events.onZoomChange?.(this.scale);
  }

  panBy(dxScreen: number, dyScreen: number): void {
    this.vpX -= dxScreen / this.scale;
    this.vpY -= dyScreen / this.scale;
    this.dirty = true;
  }

  // ----------------------------------------------------------- options

  setOptions(patch: Partial<ControllerOptions>): void {
    const prevSeam = this.opts.placedSeam;
    Object.assign(this.opts, patch);
    // seam darkness is baked into the placed slab and loose clusters — redo on change
    if (patch.placedSeam !== undefined && patch.placedSeam !== prevSeam) {
      this.placedCache = null;
      this.clusterSprites.clear();
    }
    this.dirty = true;
  }

  setStash(on: boolean): void {
    this.stashedIds.clear();
    // stashing after the edges are already done would hide pieces the
    // player is actively working with — treat it as a no-op
    if (on && !edgesComplete(this.pieces, this.freeform)) {
      for (const p of this.pieces) {
        // solo interior pieces only; grouped or placed stay visible
        if (!p.isEdge && !p.placed && this.groups.get(p.groupId)!.size === 1) {
          this.stashedIds.add(p.id);
        }
      }
    }
    this.dirty = true;
  }

  /** After any placement/merge: pour the stash onto the table if edges are done. */
  private maybeAutoReveal(): void {
    if (this.stashedIds.size === 0) return;
    if (!edgesComplete(this.pieces, this.freeform)) return;
    this.revealStash();
    this.events.onEdgesDone?.();
  }

  /** Un-stash with a staggered pop-in, radiating out from the board centre. */
  private revealStash(): void {
    const ids = [...this.stashedIds];
    this.stashedIds.clear();
    if (ids.length === 0) return;
    if (!this.opts.reducedMotion) {
      const cx = this.freeform ? this.tableRect.x + this.tableRect.w / 2 : this.geom.width / 2;
      const cy = this.freeform ? this.tableRect.y + this.tableRect.h / 2 : this.geom.height / 2;
      const byDist = ids
        .map((id) => {
          const p = this.pieces[id]!;
          return { id, d: Math.hypot(p.pos.x - cx, p.pos.y - cy) };
        })
        .sort((a, b) => a.d - b.d);
      // ~12ms per piece, capped so huge puzzles finish pouring in ~1.2s
      const step = Math.min(12, 1200 / byDist.length);
      const now = performance.now();
      byDist.forEach(({ id }, i) => this.reveals.set(id, { start: now, delay: i * step }));
    }
    this.dirty = true;
  }

  setRemoteLocks(locks: Map<number, RemoteLock>): void {
    this.remoteLocks = locks;
    this.dirty = true;
  }

  // ----------------------------------------------------------- actions

  /** Canvas width/height ratio — shapes where the scatter tray puts pieces. */
  private viewAspect(): number {
    const rect = this.canvas.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 ? rect.width / rect.height : 16 / 9;
  }

  shuffle(): void {
    const spots = scatterPositions(
      this.geom,
      Math.floor(Math.random() * 0xffffffff),
      this.pieces.length,
      this.viewAspect(),
    );
    let i = 0;
    const moved: PieceSnapshot[] = [];
    for (const p of this.pieces) {
      // leave pieces another player is holding alone — fighting their drag
      // would desync; the claim TTL frees them soon enough
      if (p.placed || this.remoteLocks.has(p.id)) continue;
      // snapped-together groups are progress, not mess — never break or
      // scatter them: in freeform they're the ONLY progress there is
      if (this.groups.get(p.groupId)!.size > 1) continue;
      const spot = spots[i++ % spots.length]!;
      this.animatePiece(p, spot.x, spot.y, 420);
      // sync the resting spot, not the mid-tween position
      moved.push({ id: p.id, x: spot.x, y: spot.y, rot: p.rot, groupId: p.groupId, placed: false, z: p.z });
    }
    // persist to the room — otherwise the next remote echo reverts the shuffle
    if (moved.length) this.events.onRelease?.(moved);
    this.dirty = true;
  }

  /** Tidy unplaced singles into the tray band around the board. */
  arrange(): void {
    const loose = this.pieces.filter(
      (p) => !p.placed && !this.stashedIds.has(p.id) && !this.remoteLocks.has(p.id),
    );
    const spots = scatterPositions(this.geom, 42, this.pieces.length, this.viewAspect());
    // tidy slots read left-to-right, top-to-bottom…
    const sorted = [...spots].sort((a, b) => a.y - b.y || a.x - b.x);
    const singles = loose.filter((p) => this.groups.get(p.groupId)!.size === 1);
    // …and pieces keep their current arrangement: each single goes to the
    // slot matching its present reading order, so tidy straightens the mess
    // instead of resetting every shuffle back to one canonical layout.
    singles.sort((a, b) => a.pos.y - b.pos.y || a.pos.x - b.pos.x);
    const moved: PieceSnapshot[] = [];
    singles.forEach((p, i) => {
      const spot = sorted[i % sorted.length]!;
      this.animatePiece(p, spot.x, spot.y, 380);
      moved.push({ id: p.id, x: spot.x, y: spot.y, rot: p.rot, groupId: p.groupId, placed: false, z: p.z });
    });
    // persist to the room — otherwise the next remote echo reverts the tidy
    if (moved.length) this.events.onRelease?.(moved);
    this.dirty = true;
  }

  /** Pick the piece (and freeform partner) a hint should ring — no visuals. */
  chooseHint(): { pieceId: number; partnerId?: number } | null {
    const candidates = this.pieces.filter((p) => !p.placed && !this.stashedIds.has(p.id));
    if (candidates.length === 0) return null;
    // prefer edge pieces, then lowest id for stability
    candidates.sort((a, b) => Number(b.isEdge) - Number(a.isEdge) || a.id - b.id);
    if (this.freeform) {
      // no board slot to point at — ring a piece and a grid-neighbour it can
      // join, preferring pairs that extend the biggest assembled cluster
      candidates.sort(
        (a, b) =>
          this.groups.get(b.groupId)!.size - this.groups.get(a.groupId)!.size ||
          Number(b.isEdge) - Number(a.isEdge) ||
          a.id - b.id,
      );
      for (const p of candidates) {
        const partner = neighborIds(this.geom, p)
          .map((id) => this.pieces[id]!)
          .find((n) => n.groupId !== p.groupId && !this.stashedIds.has(n.id));
        if (partner) return { pieceId: p.id, partnerId: partner.id };
      }
      return null;
    }
    return { pieceId: candidates[0]!.id };
  }

  /** Ring the given piece (and optional partner) with the hint pulse. */
  showHint(pieceId: number, partnerId?: number): void {
    const p = this.pieces[pieceId];
    if (!p || p.placed) return;
    this.hintPiece = p;
    this.hintPartner = partnerId !== undefined ? (this.pieces[partnerId] ?? null) : null;
    this.hintStart = performance.now();
    this.dirty = true;
  }

  hint(): void {
    const choice = this.chooseHint();
    if (choice) this.showHint(choice.pieceId, choice.partnerId);
  }

  rotateHovered(clientX: number, clientY: number): void {
    if (!this.opts.rotationEnabled) return;
    const target = this.drag
      ? this.groupPieces(this.drag.groupId)[0]
      : this.hitTest(this.screenToWorld(clientX, clientY));
    if (!target || target.placed) return;
    this.rotateGroup(target.groupId);
  }

  private rotateGroup(groupId: number): void {
    const members = this.groupPieces(groupId);
    if (members.length === 0) return;
    // rotating mid-tween would pivot from transient positions
    this.finishTweens(members);
    // pivot: centre of the group's cells
    let cx = 0;
    let cy = 0;
    for (const p of members) {
      cx += p.pos.x + this.geom.cellW / 2;
      cy += p.pos.y + this.geom.cellH / 2;
    }
    cx /= members.length;
    cy /= members.length;
    for (const p of members) {
      const px = p.pos.x + this.geom.cellW / 2 - cx;
      const py = p.pos.y + this.geom.cellH / 2 - cy;
      // 90° clockwise
      p.pos.x = cx + -py - this.geom.cellW / 2;
      p.pos.y = cy + px - this.geom.cellH / 2;
      p.rot = ((p.rot + 1) % 4) as 0 | 1 | 2 | 3;
    }
    if (this.drag?.groupId === groupId) {
      // re-anchor drag offsets after rotation
      const cursor = this.lastCursorWorld;
      if (cursor) {
        for (const p of members) {
          this.drag.offsets.set(p.id, { x: p.pos.x - cursor.x, y: p.pos.y - cursor.y });
        }
      }
    }
    this.dirty = true;
  }

  getSnapshots(): PieceSnapshot[] {
    return this.pieces.map(toSnapshot);
  }

  applyRemote(snapshots: PieceSnapshot[]): void {
    let changed = false;
    for (const s of snapshots) {
      const p = this.pieces[s.id];
      if (!p) continue;
      // never stomp a piece the local player is holding
      if (this.drag && this.groups.get(this.drag.groupId)?.has(p.id)) continue;
      applySnapshot(p, s);
      this.zCounter = Math.max(this.zCounter, s.z + 1);
      changed = true;
    }
    if (changed) {
      this.rebuildGroups();
      this.placedCache = null;
      this.dirty = true;
      this.checkComplete(false);
      this.maybeAutoReveal();
    }
  }

  get placedCount(): number {
    let n = 0;
    for (const p of this.pieces) if (p.placed) n++;
    return n;
  }

  /** Progress toward completion: board mode counts placed pieces; freeform counts the biggest assembled cluster. */
  get progressCount(): number {
    if (!this.freeform) return this.placedCount;
    let max = 0;
    for (const [, ids] of this.groups) max = Math.max(max, ids.size);
    return max <= 1 ? 0 : max;
  }

  // ----------------------------------------------------------- input

  private lastCursorWorld: Vec2 | null = null;

  private bindInput(): void {
    const c = this.canvas;
    const sig = { signal: this.abort.signal };

    c.addEventListener("pointerdown", (e) => this.onPointerDown(e), sig);
    window.addEventListener("pointermove", (e) => this.onPointerMove(e), sig);
    window.addEventListener("pointerup", (e) => this.onPointerUp(e), sig);
    window.addEventListener("pointercancel", (e) => this.onPointerUp(e), sig);
    c.addEventListener("wheel", (e) => this.onWheel(e), { passive: false, signal: this.abort.signal });
    window.addEventListener(
      "keydown",
      (e) => {
        if (e.code === "Space") this.spaceHeld = true;
        if (this.paused) return;
        const tag = (e.target as HTMLElement | null)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        if (!this.viewLocked) {
          if (e.key === "+" || e.key === "=") this.zoomBy(1.2);
          if (e.key === "-") this.zoomBy(1 / 1.2);
          if (e.key === "0") this.fitToScene();
          if (e.key === "ArrowLeft") this.panBy(60, 0);
          if (e.key === "ArrowRight") this.panBy(-60, 0);
          if (e.key === "ArrowUp") this.panBy(0, 60);
          if (e.key === "ArrowDown") this.panBy(0, -60);
        }
        if (e.key.toLowerCase() === "r" && this.lastClient) {
          this.rotateHovered(this.lastClient.x, this.lastClient.y);
        }
      },
      sig,
    );
    window.addEventListener(
      "keyup",
      (e) => {
        if (e.code === "Space") this.spaceHeld = false;
      },
      sig,
    );
    const ro = new ResizeObserver(() => this.resize());
    ro.observe(c);
    this.abort.signal.addEventListener("abort", () => ro.disconnect());
  }

  private lastClient: Vec2 | null = null;

  private onPointerDown(e: PointerEvent): void {
    if (this.paused || this.completed) return;
    this.canvas.setPointerCapture?.(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (this.pointers.size === 2 && !this.drag && !this.viewLocked) {
      // begin pinch
      const [a, b] = [...this.pointers.values()];
      const dist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      const rect = this.canvas.getBoundingClientRect();
      const mid = { x: (a!.x + b!.x) / 2 - rect.left, y: (a!.y + b!.y) / 2 - rect.top };
      this.pinch = { dist, scale: this.scale, midWorld: this.screenToWorld(mid.x + rect.left, mid.y + rect.top) };
      this.pan = null;
      return;
    }
    if (this.pointers.size > 1) return;

    const world = this.screenToWorld(e.clientX, e.clientY);
    this.lastCursorWorld = world;

    const forcePan = this.spaceHeld || e.button === 1 || e.button === 2;
    const hit = forcePan ? null : this.hitTest(world);
    if (hit && !hit.placed && !this.remoteLocks.has(hit.id)) {
      const members = this.groupPieces(hit.groupId);
      // settle any in-flight snap animation first — capturing drag offsets
      // mid-tween lets the tween fight the drag and leaves the group's true
      // positions out of line with the rigidly-drawn cluster
      this.finishTweens(members);
      const offsets = new Map<number, Vec2>();
      for (const p of members) {
        offsets.set(p.id, { x: p.pos.x - world.x, y: p.pos.y - world.y });
        p.z = ++this.zCounter;
      }
      this.drag = { groupId: hit.groupId, pointerId: e.pointerId, offsets, lastStream: 0, hovered: false };
      this.events.onPickUp?.(members.length);
      this.events.onClaim?.(members.map((p) => p.id));
      this.dirty = true;
    } else if (!this.viewLocked) {
      this.pan = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, vpX: this.vpX, vpY: this.vpY };
    }
    if (this.drag || this.pan) this.canvas.style.cursor = "grabbing";
  }

  private onPointerMove(e: PointerEvent): void {
    this.lastClient = { x: e.clientX, y: e.clientY };
    if (!this.pointers.has(e.pointerId)) {
      return;
    }
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (this.pinch && this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      const dist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      const next = this.pinch.scale * (dist / this.pinch.dist);
      const midX = (a!.x + b!.x) / 2;
      const midY = (a!.y + b!.y) / 2;
      this.scale = Math.min(this.maxScale, Math.max(this.minScale, next));
      // keep pinch-start world point under the midpoint
      const nowMid = this.screenToWorld(midX, midY);
      this.vpX += this.pinch.midWorld.x - nowMid.x;
      this.vpY += this.pinch.midWorld.y - nowMid.y;
      this.dirty = true;
      this.events.onZoomChange?.(this.scale);
      return;
    }

    if (this.drag && e.pointerId === this.drag.pointerId) {
      const world = this.screenToWorld(e.clientX, e.clientY);
      this.lastCursorWorld = world;
      const members = this.groupPieces(this.drag.groupId);
      for (const p of members) {
        const off = this.drag.offsets.get(p.id)!;
        p.pos.x = world.x + off.x;
        p.pos.y = world.y + off.y;
      }
      // near-target glow + one-shot hover cue — all snap-guide feedback,
      // so the toggle silences the sound too, not just the drawing
      const near = this.opts.snapGuide && this.isNearTarget(members);
      if (near && !this.drag.hovered) {
        this.drag.hovered = true;
        this.events.onHoverTarget?.();
      } else if (!near) {
        this.drag.hovered = false;
      }
      const now = performance.now();
      if (now - this.drag.lastStream > 90) {
        this.drag.lastStream = now;
        this.events.onStream?.(members.map(toSnapshot));
      }
      this.dirty = true;
      return;
    }

    if (this.pan && e.pointerId === this.pan.pointerId) {
      this.vpX = this.pan.vpX - (e.clientX - this.pan.startX) / this.scale;
      this.vpY = this.pan.vpY - (e.clientY - this.pan.startY) / this.scale;
      this.dirty = true;
    }
  }

  private onPointerUp(e: PointerEvent): void {
    this.pointers.delete(e.pointerId);
    if (this.pinch && this.pointers.size < 2) this.pinch = null;

    if (this.drag && e.pointerId === this.drag.pointerId) {
      const groupId = this.drag.groupId;
      this.drag = null;
      this.settleGroup(groupId);
    }
    if (this.pan && e.pointerId === this.pan.pointerId) this.pan = null;
    if (!this.drag && !this.pan) this.canvas.style.cursor = "grab";
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    if (this.paused || this.viewLocked) return;
    if (e.ctrlKey || e.metaKey) {
      // trackpad pinch gesture
      this.zoomBy(Math.exp(-e.deltaY * 0.01), { x: e.clientX, y: e.clientY });
    } else {
      this.zoomBy(e.deltaY < 0 ? 1.12 : 1 / 1.12, { x: e.clientX, y: e.clientY });
    }
  }

  // ----------------------------------------------------------- snapping

  private snapDistance(): number {
    return Math.min(this.geom.cellW, this.geom.cellH) * this.geom.config.snapTolerance;
  }

  private isNearTarget(members: PieceState[]): boolean {
    if (!this.freeform) {
      const tol = this.snapDistance();
      for (const p of members) {
        if (p.rot !== 0) continue;
        if (Math.hypot(p.pos.x - p.correct.x, p.pos.y - p.correct.y) < tol) return true;
      }
    }
    // joining loose neighbours counts too — snapping works away from the board
    return this.findNeighborJoin(members) !== null;
  }

  /**
   * Find a loose neighbouring piece the dragged group can join, anywhere on
   * the table. Slightly more forgiving than board snap: without the pocket
   * to aim at, players line pieces up by eye against overhanging tabs.
   */
  private findNeighborJoin(
    members: PieceState[],
  ): { neighbor: PieceState; piece: PieceState; errX: number; errY: number } | null {
    const tol = this.snapDistance() * 1.3;
    const memberIds = new Set(members.map((m) => m.id));
    for (const p of members) {
      for (const nId of neighborIds(this.geom, p)) {
        const n = this.pieces[nId]!;
        if (memberIds.has(n.id) || n.placed) continue;
        if (n.rot !== p.rot) continue;
        // expected offset between cell origins, rotated by the shared rotation
        let dx = n.correct.x - p.correct.x;
        let dy = n.correct.y - p.correct.y;
        for (let i = 0; i < p.rot; i++) {
          const t = dx;
          dx = -dy;
          dy = t;
        }
        const errX = n.pos.x - p.pos.x - dx;
        const errY = n.pos.y - p.pos.y - dy;
        if (Math.hypot(errX, errY) < tol) return { neighbor: n, piece: p, errX, errY };
      }
    }
    return null;
  }

  private settleGroup(groupId: number): void {
    const members = this.groupPieces(groupId);
    if (members.length === 0) return;

    // 1) Snap to board — never in freeform: the table has no fixed slots
    const tol = this.snapDistance();
    let anchor: PieceState | null = null;
    if (!this.freeform) {
      for (const p of members) {
        if (p.rot === 0 && Math.hypot(p.pos.x - p.correct.x, p.pos.y - p.correct.y) < tol) {
          anchor = p;
          break;
        }
      }
    }
    if (anchor) {
      // "Pieces join" outranks "snap in place": placing against an already
      // placed neighbour reads as joining pieces, not a lone board snap.
      const memberIds = new Set(members.map((m) => m.id));
      const joined = members.some((p) =>
        neighborIds(this.geom, p).some((nId) => !memberIds.has(nId) && this.pieces[nId]!.placed),
      );
      // placed pieces render from the baked slab, so land them instantly —
      // a tween would be invisible anyway
      for (const p of members) {
        p.pos.x = p.correct.x;
        p.pos.y = p.correct.y;
        p.placed = true;
      }
      this.placedCache = null;
      const total = this.pieces.length;
      window.setTimeout(() => {
        this.events.onPlace?.(this.placedCount, total, joined);
        this.events.onRelease?.(members.map(toSnapshot));
        this.checkComplete(true);
        this.maybeAutoReveal();
      }, 150);
      // no onDrop here — the snap/join sound is the drop feedback
      this.clusterSprites.delete(groupId); // placed groups render from the baked slab
      this.dirty = true;
      return;
    }

    // 2) Snap to a neighbouring piece / group
    const merged = this.tryNeighborMerge(members);
    this.events.onRelease?.(this.groupPieces(this.pieces[members[0]!.id]!.groupId).map(toSnapshot));
    if (merged) {
      this.events.onMerge?.();
      // in freeform, joins are the only progress — completion happens here
      this.checkComplete(true);
      this.maybeAutoReveal();
    } else {
      this.events.onDrop?.();
    }
    this.dirty = true;
  }

  private tryNeighborMerge(members: PieceState[]): boolean {
    const join = this.findNeighborJoin(members);
    if (!join) return false;
    this.mergeGroups(join.neighbor.groupId, join.piece.groupId);
    // Rigid re-align: land every member exactly on the neighbour-anchored
    // grid, healing any accumulated drift. The cluster is drawn rigid from
    // one anchor, so the true positions (hitboxes) must match to the pixel.
    const anchor = join.neighbor;
    for (const m of this.groupPieces(anchor.groupId)) {
      if (m === anchor) continue;
      let dx = m.correct.x - anchor.correct.x;
      let dy = m.correct.y - anchor.correct.y;
      for (let i = 0; i < anchor.rot; i++) {
        const t = dx;
        dx = -dy;
        dy = t;
      }
      this.animatePiece(m, anchor.pos.x + dx, anchor.pos.y + dy, 120);
    }
    return true;
  }

  private checkComplete(fromLocal: boolean): void {
    if (this.completed) return;
    const solved = this.freeform
      ? this.groups.size === 1 // the whole picture assembled, wherever it sits
      : this.pieces.every((p) => p.placed);
    if (solved) {
      this.completed = true;
      this.dirty = true;
      if (fromLocal || true) this.events.onComplete?.();
    }
  }

  // ----------------------------------------------------------- hit test

  private hitTest(world: Vec2): PieceState | null {
    const { mx, my } = spriteMargins(this.geom);
    const sorted = [...this.pieces].sort((a, b) => b.z - a.z);
    for (const p of sorted) {
      if (p.placed || this.stashedIds.has(p.id)) continue;
      // transform into piece-local (cell) space, honouring rotation
      const cx = p.pos.x + this.geom.cellW / 2;
      const cy = p.pos.y + this.geom.cellH / 2;
      let lx = world.x - cx;
      let ly = world.y - cy;
      for (let i = 0; i < p.rot; i++) {
        // inverse of clockwise quarter turns
        const t = lx;
        lx = ly;
        ly = -t;
      }
      lx += this.geom.cellW / 2;
      ly += this.geom.cellH / 2;
      if (lx < -mx || ly < -my || lx > this.geom.cellW + mx || ly > this.geom.cellH + my) continue;
      const sprite = this.sprites[p.id]!;
      const s = sprite.scale;
      const ctx = this.hitCtx;
      ctx.save();
      ctx.setTransform(s, 0, 0, s, 0, 0);
      const inside = ctx.isPointInPath(sprite.path, lx * s, ly * s);
      ctx.restore();
      if (inside) return p;
    }
    return null;
  }

  // ----------------------------------------------------------- baking

  /**
   * Lazily bake all board-placed pieces as ONE slab with the same physical
   * look as loose clusters — outer bevel, gloss, subtle interior seams —
   * so classic board and freeform read identically.
   */
  private placedSprite(): ClusterSprite | null {
    const placed = this.pieces.filter((p) => p.placed);
    if (placed.length === 0) return null;
    if (this.placedCache && this.placedCache.count === placed.length) return this.placedCache.sprite;
    const sprite = renderClusterSprite(this.geom, this.image, placed, this.spriteScale, this.opts.placedSeam ?? 0.3);
    this.placedCache = { count: placed.length, sprite };
    return sprite;
  }

  // ----------------------------------------------------------- animation

  /** Jump the given pieces' active tweens straight to their targets. */
  private finishTweens(members: PieceState[]): void {
    if (this.tweens.length === 0) return;
    const ids = new Set(members.map((m) => m.id));
    const rest: Tween[] = [];
    for (const t of this.tweens) {
      if (ids.has(t.piece.id)) {
        t.piece.pos.x = t.toX;
        t.piece.pos.y = t.toY;
        t.onDone?.();
      } else {
        rest.push(t);
      }
    }
    this.tweens = rest;
    this.dirty = true;
  }

  private animatePiece(p: PieceState, toX: number, toY: number, duration: number, onDone?: () => void): void {
    this.tweens = this.tweens.filter((t) => t.piece.id !== p.id);
    this.tweens.push({ piece: p, fromX: p.pos.x, fromY: p.pos.y, toX, toY, start: performance.now(), duration, onDone });
    this.dirty = true;
  }

  private stepTweens(now: number): void {
    if (this.tweens.length === 0) return;
    const done: Tween[] = [];
    for (const t of this.tweens) {
      const k = Math.min(1, (now - t.start) / t.duration);
      const e = 1 - Math.pow(1 - k, 3); // ease-out cubic
      t.piece.pos.x = t.fromX + (t.toX - t.fromX) * e;
      t.piece.pos.y = t.fromY + (t.toY - t.fromY) * e;
      if (k >= 1) done.push(t);
    }
    if (done.length) {
      this.tweens = this.tweens.filter((t) => !done.includes(t));
      for (const t of done) t.onDone?.();
    }
    this.dirty = true;
  }

  // ----------------------------------------------------------- render

  private loop = (): void => {
    if (this.destroyed) return;
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    this.stepTweens(now);
    if (this.reveals.size > 0) this.dirty = true;
    const hintActive = this.hintPiece && now - this.hintStart < 3200;
    if (hintActive) this.dirty = true;
    if (!this.dirty) return;
    this.dirty = false;
    this.render(now);
  };

  private render(now: number): void {
    const ctx = this.ctx;
    const dpr = this.dpr();
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // world transform
    ctx.setTransform(
      this.scale * dpr,
      0,
      0,
      this.scale * dpr,
      w / 2 - this.vpX * this.scale * dpr,
      h / 2 - this.vpY * this.scale * dpr,
    );

    // Plate: the photo-sized board with its pocket, or the big open table
    const r = Math.min(this.geom.cellW, this.geom.cellH) * 0.15;
    const plate = this.freeform
      ? { x: this.tableRect.x - r, y: this.tableRect.y - r, w: this.tableRect.w + 2 * r, h: this.tableRect.h + 2 * r }
      : { x: -r, y: -r, w: this.geom.width + 2 * r, h: this.geom.height + 2 * r };
    ctx.save();
    ctx.fillStyle = this.opts.boardColor;
    ctx.shadowColor = "rgba(20,10,40,0.25)";
    ctx.shadowBlur = 30 / this.scale;
    ctx.shadowOffsetY = 8 / this.scale;
    roundRect(ctx, plate.x, plate.y, plate.w, plate.h, r);
    ctx.fill();
    ctx.restore();

    if (!this.freeform) {
      // Recessed pocket where the image assembles — defines the play area.
      ctx.save();
      ctx.fillStyle = "rgba(10,5,25,0.10)";
      roundRect(ctx, 0, 0, this.geom.width, this.geom.height, r * 0.4);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.10)";
      ctx.lineWidth = Math.max(1 / this.scale, r * 0.06);
      roundRect(ctx, -r * 0.5, -r * 0.5, this.geom.width + r, this.geom.height + r, r * 0.6);
      ctx.stroke();
      ctx.restore();
    }

    const pattern = this.texturePattern();
    if (pattern) {
      ctx.save();
      roundRect(ctx, plate.x, plate.y, plate.w, plate.h, r);
      ctx.clip();
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = pattern;
      ctx.fillRect(plate.x, plate.y, plate.w, plate.h);
      ctx.restore();
    }

    // Ghost preview — board mode only; freeform has no fixed destination
    if (this.opts.ghost && !this.completed && !this.freeform) {
      ctx.save();
      ctx.globalAlpha = 0.16;
      ctx.drawImage(this.image, 0, 0, this.geom.width, this.geom.height);
      ctx.restore();
    }

    // Placed pieces — one baked slab, same physical look as loose clusters
    // (never any in freeform)
    if (!this.freeform) {
      const placed = this.placedSprite();
      if (placed) {
        const px = placed.originCol * this.geom.cellW - placed.mx;
        const py = placed.originRow * this.geom.cellH - placed.my;
        const pw = placed.cellCols * this.geom.cellW + 2 * placed.mx;
        const ph = placed.cellRows * this.geom.cellH + 2 * placed.my;
        const rim = Math.min(this.geom.cellW, this.geom.cellH) * 0.02;
        ctx.drawImage(placed.shadow, px + rim * 0.4, py + rim * 1.6, pw, ph);
        ctx.drawImage(placed.canvas, px, py, pw, ph);
      }
    }

    // Visible world rect for culling
    const rect = this.canvas.getBoundingClientRect();
    const tl = this.screenToWorld(rect.left, rect.top);
    const br = this.screenToWorld(rect.right, rect.bottom);
    const cullPad = Math.max(this.geom.cellW, this.geom.cellH) * 2;

    const draggedGroup = this.drag?.groupId ?? -1;
    // Draw units: loose singles, and snapped-together groups as one merged
    // cluster sprite — one bevel, one shadow, so joins read as one slab.
    const seenGroups = new Set<number>();
    const units: Array<{ z: number; ref: PieceState; cluster: PieceState[] | null }> = [];
    for (const p of this.pieces) {
      if (p.placed || this.stashedIds.has(p.id)) continue;
      if (
        p.pos.x + cullPad < tl.x ||
        p.pos.y + cullPad < tl.y ||
        p.pos.x - cullPad > br.x ||
        p.pos.y - cullPad > br.y
      ) {
        continue;
      }
      if (this.groups.get(p.groupId)!.size > 1) {
        if (seenGroups.has(p.groupId)) continue;
        seenGroups.add(p.groupId);
        const members = this.groupPieces(p.groupId);
        let z = 0;
        for (const m of members) z = Math.max(z, m.z);
        units.push({ z, ref: members[0]!, cluster: members });
      } else {
        units.push({ z: p.z, ref: p, cluster: null });
      }
    }
    units.sort((a, b) => a.z - b.z);

    for (const u of units) {
      const dragged = u.ref.groupId === draggedGroup;
      if (u.cluster) this.drawCluster(ctx, u.cluster, dragged);
      else this.drawPiece(ctx, u.ref, dragged, now);
    }

    // Hint pulse
    if (this.hintPiece && now - this.hintStart < 3200 && !this.hintPiece.placed) {
      const t = (now - this.hintStart) / 600;
      const alpha = 0.35 + 0.3 * Math.sin(t * Math.PI);
      const p = this.hintPiece;
      ctx.save();
      ctx.strokeStyle = `rgba(246,90,51,${alpha.toFixed(3)})`;
      ctx.lineWidth = 5 / this.scale;
      ctx.setLineDash([14 / this.scale, 10 / this.scale]);
      const ring = (piece: PieceState) => {
        ctx.beginPath();
        ctx.arc(
          piece.pos.x + this.geom.cellW / 2,
          piece.pos.y + this.geom.cellH / 2,
          Math.max(this.geom.cellW, this.geom.cellH) * 0.85,
          0,
          Math.PI * 2,
        );
        ctx.stroke();
      };
      if (this.hintPartner) {
        // freeform: ring the two pieces that fit together
        ring(this.hintPartner);
      } else {
        // board mode: mark the piece's destination slot
        ctx.strokeRect(p.correct.x, p.correct.y, this.geom.cellW, this.geom.cellH);
      }
      ring(p);
      ctx.restore();
    } else if (this.hintPiece && now - this.hintStart >= 3200) {
      this.hintPiece = null;
      this.hintPartner = null;
    }

    // Completed sheen
    if (this.completed && !this.freeform) {
      ctx.save();
      ctx.globalAlpha = 0.08;
      ctx.fillStyle = "#ffffff";
      roundRect(ctx, 0, 0, this.geom.width, this.geom.height, r * 0.5);
      ctx.fill();
      ctx.restore();
    }
  }

  /** 0..1 entrance progress for a revealing piece; null = not revealing. */
  private revealProgress(id: number, now: number): number | null {
    const r = this.reveals.get(id);
    if (!r) return null;
    const k = (now - r.start - r.delay) / 350;
    if (k >= 1) {
      this.reveals.delete(id);
      return null;
    }
    return Math.max(0, k);
  }

  private drawPiece(ctx: CanvasRenderingContext2D, p: PieceState, dragged: boolean, now: number): void {
    const sprite = this.sprites[p.id]!;
    const cw = this.geom.cellW;
    const ch = this.geom.cellH;
    ctx.save();
    ctx.translate(p.pos.x + cw / 2, p.pos.y + ch / 2);
    if (p.rot) ctx.rotate((p.rot * Math.PI) / 2);
    const reveal = this.revealProgress(p.id, now);
    if (reveal !== null) {
      // staggered entrance: pieces still waiting their turn stay invisible
      if (reveal === 0) {
        ctx.restore();
        return;
      }
      const e = 1 - Math.pow(1 - reveal, 3);
      ctx.globalAlpha = e;
      ctx.scale(0.3 + 0.7 * e, 0.3 + 0.7 * e);
    }
    if (dragged) {
      ctx.scale(LIFT_SCALE, LIFT_SCALE);
      ctx.shadowColor = "rgba(25,18,14,0.4)";
      ctx.shadowBlur = 24 / this.scale;
      ctx.shadowOffsetY = 10 / this.scale;
    }
    const lock = this.remoteLocks.get(p.id);
    const rim = Math.min(cw, ch) * 0.02;
    if (!dragged) {
      // baked soft silhouette grounds resting pieces on the table
      ctx.drawImage(
        sprite.shadow,
        -cw / 2 - sprite.mx + rim * 0.4,
        -ch / 2 - sprite.my + rim * 1.6,
        cw + 2 * sprite.mx,
        ch + 2 * sprite.my,
      );
    }
    ctx.drawImage(
      sprite.canvas,
      -cw / 2 - sprite.mx,
      -ch / 2 - sprite.my,
      cw + 2 * sprite.mx,
      ch + 2 * sprite.my,
    );
    if (this.opts.edgeHighlight && p.isEdge && !dragged) {
      ctx.strokeStyle = "rgba(246,90,51,0.85)";
      ctx.lineWidth = 3 / this.scale;
      ctx.strokeRect(-cw / 2, -ch / 2, cw, ch);
    }
    if (lock) {
      ctx.strokeStyle = lock.color;
      ctx.lineWidth = 3.5 / this.scale;
      ctx.globalAlpha = 0.9;
      ctx.strokeRect(-cw / 2 - sprite.mx * 0.4, -ch / 2 - sprite.my * 0.4, cw + sprite.mx * 0.8, ch + sprite.my * 0.8);
    }
    if (dragged && this.drag?.hovered && this.opts.snapGuide) {
      ctx.shadowColor = "rgba(52,180,127,0.9)";
      ctx.shadowBlur = 30 / this.scale;
      ctx.strokeStyle = "rgba(52,180,127,0.9)";
      ctx.lineWidth = 3 / this.scale;
      ctx.strokeRect(-cw / 2, -ch / 2, cw, ch);
    }
    ctx.restore();
  }

  /**
   * Draw a snapped-together group as one rigid slab. The cluster sprite is
   * laid out in unrotated cell space, so anchoring at any member's cell
   * centre and applying the shared rotation lands every piece correctly.
   */
  private drawCluster(ctx: CanvasRenderingContext2D, members: PieceState[], dragged: boolean): void {
    const ref = members[0]!;
    const sprite = this.clusterSprite(ref.groupId);
    const cw = this.geom.cellW;
    const ch = this.geom.cellH;
    const w = sprite.cellCols * cw + 2 * sprite.mx;
    const h = sprite.cellRows * ch + 2 * sprite.my;
    // ref's cell offset inside the cluster's unrotated layout
    const offX = (ref.col - sprite.originCol) * cw;
    const offY = (ref.row - sprite.originRow) * ch;
    const x = -offX - cw / 2 - sprite.mx;
    const y = -offY - ch / 2 - sprite.my;
    ctx.save();
    ctx.translate(ref.pos.x + cw / 2, ref.pos.y + ch / 2);
    if (ref.rot) ctx.rotate((ref.rot * Math.PI) / 2);
    if (dragged) {
      ctx.scale(LIFT_SCALE, LIFT_SCALE);
      ctx.shadowColor = "rgba(25,18,14,0.4)";
      ctx.shadowBlur = 24 / this.scale;
      ctx.shadowOffsetY = 10 / this.scale;
    }
    const rim = Math.min(cw, ch) * 0.02;
    if (!dragged) {
      // one soft union silhouette grounds the whole slab
      ctx.drawImage(sprite.shadow, x + rim * 0.4, y + rim * 1.6, w, h);
    }
    ctx.drawImage(sprite.canvas, x, y, w, h);

    // per-member overlays, in the cluster's unrotated cell space
    const cellX = (m: PieceState) => x + sprite.mx + (m.col - sprite.originCol) * cw;
    const cellY = (m: PieceState) => y + sprite.my + (m.row - sprite.originRow) * ch;
    if (this.opts.edgeHighlight && !dragged) {
      ctx.strokeStyle = "rgba(246,90,51,0.85)";
      ctx.lineWidth = 3 / this.scale;
      for (const m of members) {
        if (m.isEdge) ctx.strokeRect(cellX(m), cellY(m), cw, ch);
      }
    }
    // one outline around the whole blob — claims are all-or-nothing per
    // group, so per-piece rectangles would just draw a weird grid
    const lock = members.map((m) => this.remoteLocks.get(m.id)).find(Boolean);
    if (lock) {
      ctx.strokeStyle = lock.color;
      ctx.lineWidth = 3.5 / this.scale;
      ctx.globalAlpha = 0.9;
      ctx.strokeRect(
        x + sprite.mx * 0.6,
        y + sprite.my * 0.6,
        sprite.cellCols * cw + sprite.mx * 0.8,
        sprite.cellRows * ch + sprite.my * 0.8,
      );
      ctx.globalAlpha = 1;
    }
    if (dragged && this.drag?.hovered && this.opts.snapGuide) {
      ctx.shadowColor = "rgba(52,180,127,0.9)";
      ctx.shadowBlur = 30 / this.scale;
      ctx.strokeStyle = "rgba(52,180,127,0.9)";
      ctx.lineWidth = 3 / this.scale;
      ctx.strokeRect(x + sprite.mx, y + sprite.my, sprite.cellCols * cw, sprite.cellRows * ch);
    }
    ctx.restore();
  }

  private patternCache: { id: BoardTextureId; pattern: CanvasPattern | null } | null = null;

  /** World-space texture tile for the board plate, cached per texture id. */
  private texturePattern(): CanvasPattern | null {
    const id = this.opts.boardTexture;
    if (id === "none") return null;
    if (this.patternCache?.id === id) return this.patternCache.pattern;
    const t = Math.max(12, Math.round(Math.min(this.geom.cellW, this.geom.cellH) / 3));
    const tile = document.createElement("canvas");
    tile.width = t;
    tile.height = t;
    const c = tile.getContext("2d")!;
    c.strokeStyle = "rgba(255,255,255,0.7)";
    c.fillStyle = "rgba(255,255,255,0.7)";
    if (id === "felt") {
      for (let i = 0; i < t; i++) {
        c.globalAlpha = Math.random() * 0.5;
        c.fillRect(Math.random() * t, Math.random() * t, 1.2, 1.2);
      }
    } else if (id === "wood") {
      c.lineWidth = 1;
      for (let y = 2; y < t; y += 5) {
        c.globalAlpha = 0.25 + Math.random() * 0.3;
        c.beginPath();
        c.moveTo(0, y);
        c.bezierCurveTo(t * 0.3, y + 1.5, t * 0.7, y - 1.5, t, y);
        c.stroke();
      }
    } else {
      // linen: fine crosshatch
      c.lineWidth = 0.6;
      c.globalAlpha = 0.35;
      for (let i = 0; i < t; i += 3) {
        c.beginPath();
        c.moveTo(i, 0);
        c.lineTo(i, t);
        c.stroke();
        c.beginPath();
        c.moveTo(0, i);
        c.lineTo(t, i);
        c.stroke();
      }
    }
    const pattern = this.ctx.createPattern(tile, "repeat");
    this.patternCache = { id, pattern };
    return pattern;
  }

  markDirty(): void {
    this.dirty = true;
  }

  destroy(): void {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    this.abort.abort();
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
