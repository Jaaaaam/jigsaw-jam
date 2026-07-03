import { createGeometry, spriteMargins } from "@/engine/geometry";
import { applySnapshot, createPieces, neighborIds, scatterPositions, toSnapshot } from "@/engine/puzzle";
import type { PieceSnapshot, PieceState, PuzzleConfig, PuzzleGeometry, Vec2 } from "@/engine/types";
import { computeSpriteScale, renderPieceSprite, type PieceSprite } from "./sprites";

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
}

export type BoardTextureId = "none" | "felt" | "wood" | "linen";

export interface ControllerOptions {
  ghost: boolean;
  edgeHighlight: boolean;
  boardColor: string;
  boardTexture: BoardTextureId;
  rotationEnabled: boolean;
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
  private placedLayer: HTMLCanvasElement;
  private placedCtx: CanvasRenderingContext2D;
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
  private hintStart = 0;
  private remoteLocks = new Map<number, RemoteLock>();
  private stashedIds = new Set<number>();
  private completed = false;
  paused = false;

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
    this.pieces = createPieces(this.geom);
    this.zCounter = this.pieces.length;

    if (args.snapshots && args.snapshots.length === this.pieces.length) {
      for (const s of args.snapshots) {
        const p = this.pieces[s.id];
        if (p) applySnapshot(p, s);
        this.zCounter = Math.max(this.zCounter, s.z + 1);
      }
    } else {
      const spots = scatterPositions(this.geom, args.seed, this.pieces.length);
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

    // Sprites
    const spriteScale = computeSpriteScale(this.geom, this.pieces.length);
    for (const p of this.pieces) {
      this.sprites.push(renderPieceSprite(this.geom, this.image, p.row, p.col, spriteScale));
    }

    // Placed layer at sprite resolution
    this.placedLayer = document.createElement("canvas");
    this.placedLayer.width = Math.ceil(this.geom.width * spriteScale);
    this.placedLayer.height = Math.ceil(this.geom.height * spriteScale);
    this.placedCtx = this.placedLayer.getContext("2d")!;
    this.bakeAllPlaced();

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
    const s = Math.min(rect.width / (w * pad), rect.height / (h * pad));
    this.scale = s;
    this.minScale = s * 0.4;
    this.maxScale = Math.max(4, s * 12);
    this.vpX = (minX + maxX) / 2;
    this.vpY = (minY + maxY) / 2;
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
    Object.assign(this.opts, patch);
    this.dirty = true;
  }

  setStash(on: boolean): void {
    this.stashedIds.clear();
    if (on) {
      for (const p of this.pieces) {
        // solo interior pieces only; grouped or placed stay visible
        if (!p.isEdge && !p.placed && this.groups.get(p.groupId)!.size === 1) {
          this.stashedIds.add(p.id);
        }
      }
    }
    this.dirty = true;
  }

  setRemoteLocks(locks: Map<number, RemoteLock>): void {
    this.remoteLocks = locks;
    this.dirty = true;
  }

  // ----------------------------------------------------------- actions

  shuffle(): void {
    const spots = scatterPositions(this.geom, Math.floor(Math.random() * 0xffffffff), this.pieces.length);
    let i = 0;
    for (const p of this.pieces) {
      if (p.placed) continue;
      const spot = spots[i++ % spots.length]!;
      this.animatePiece(p, spot.x, spot.y, 420);
    }
    // shuffling breaks apart unplaced groups — classic reshuffle behaviour
    for (const p of this.pieces) {
      if (!p.placed) p.groupId = p.id;
    }
    this.rebuildGroups();
    this.dirty = true;
  }

  /** Tidy unplaced singles into the tray band around the board. */
  arrange(): void {
    const loose = this.pieces.filter((p) => !p.placed && !this.stashedIds.has(p.id));
    const spots = scatterPositions(this.geom, 42, this.pieces.length);
    // deterministic tidy: sorted spots left-to-right, top-to-bottom
    const sorted = [...spots].sort((a, b) => a.y - b.y || a.x - b.x);
    const byGroup = new Map<number, PieceState[]>();
    for (const p of loose) {
      const arr = byGroup.get(p.groupId) ?? [];
      arr.push(p);
      byGroup.set(p.groupId, arr);
    }
    let i = 0;
    for (const [, members] of byGroup) {
      if (members.length > 1) continue; // leave assembled clusters alone
      const p = members[0]!;
      const spot = sorted[i++ % sorted.length]!;
      this.animatePiece(p, spot.x, spot.y, 380);
    }
    this.dirty = true;
  }

  hint(): void {
    const candidates = this.pieces.filter((p) => !p.placed && !this.stashedIds.has(p.id));
    if (candidates.length === 0) return;
    // prefer edge pieces, then lowest id for stability
    candidates.sort((a, b) => Number(b.isEdge) - Number(a.isEdge) || a.id - b.id);
    this.hintPiece = candidates[0]!;
    this.hintStart = performance.now();
    this.dirty = true;
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
      this.bakeAllPlaced();
      this.dirty = true;
      this.checkComplete(false);
    }
  }

  get placedCount(): number {
    let n = 0;
    for (const p of this.pieces) if (p.placed) n++;
    return n;
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
        if (e.key === "+" || e.key === "=") this.zoomBy(1.2);
        if (e.key === "-") this.zoomBy(1 / 1.2);
        if (e.key === "0") this.fitToScene();
        if (e.key === "ArrowLeft") this.panBy(60, 0);
        if (e.key === "ArrowRight") this.panBy(-60, 0);
        if (e.key === "ArrowUp") this.panBy(0, 60);
        if (e.key === "ArrowDown") this.panBy(0, -60);
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

    if (this.pointers.size === 2 && !this.drag) {
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
      const offsets = new Map<number, Vec2>();
      for (const p of members) {
        offsets.set(p.id, { x: p.pos.x - world.x, y: p.pos.y - world.y });
        p.z = ++this.zCounter;
      }
      this.drag = { groupId: hit.groupId, pointerId: e.pointerId, offsets, lastStream: 0, hovered: false };
      this.events.onPickUp?.(members.length);
      this.events.onClaim?.(members.map((p) => p.id));
      this.dirty = true;
    } else {
      this.pan = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, vpX: this.vpX, vpY: this.vpY };
    }
    this.canvas.style.cursor = "grabbing";
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
      // near-target glow + one-shot hover cue
      const near = this.isNearTarget(members);
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
    if (this.paused) return;
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
    const tol = this.snapDistance();
    for (const p of members) {
      if (p.rot !== 0) return false;
      if (Math.hypot(p.pos.x - p.correct.x, p.pos.y - p.correct.y) < tol) return true;
    }
    return false;
  }

  private settleGroup(groupId: number): void {
    const members = this.groupPieces(groupId);
    if (members.length === 0) return;

    // 1) Snap to board
    const tol = this.snapDistance();
    let anchor: PieceState | null = null;
    for (const p of members) {
      if (p.rot === 0 && Math.hypot(p.pos.x - p.correct.x, p.pos.y - p.correct.y) < tol) {
        anchor = p;
        break;
      }
    }
    if (anchor) {
      // "Pieces join" outranks "snap in place": placing against an already
      // placed neighbour reads as joining pieces, not a lone board snap.
      const memberIds = new Set(members.map((m) => m.id));
      const joined = members.some((p) =>
        neighborIds(this.geom, p).some((nId) => !memberIds.has(nId) && this.pieces[nId]!.placed),
      );
      for (const p of members) {
        this.animatePiece(p, p.correct.x, p.correct.y, 140, () => {
          p.placed = true;
          this.bakePiece(p);
          this.dirty = true;
        });
      }
      // mark placed immediately for game state; animation is cosmetic
      const total = this.pieces.length;
      window.setTimeout(() => {
        this.events.onPlace?.(this.placedCount, total, joined);
        this.events.onRelease?.(members.map(toSnapshot));
        this.checkComplete(true);
      }, 150);
      // no onDrop here — the snap/join sound is the drop feedback
      for (const p of members) p.placed = true;
      return;
    }

    // 2) Snap to a neighbouring piece / group
    const merged = this.tryNeighborMerge(members);
    this.events.onRelease?.(this.groupPieces(this.pieces[members[0]!.id]!.groupId).map(toSnapshot));
    if (merged) {
      this.events.onMerge?.();
    } else {
      this.events.onDrop?.();
    }
    this.dirty = true;
  }

  private tryNeighborMerge(members: PieceState[]): boolean {
    const tol = this.snapDistance();
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
        if (Math.hypot(errX, errY) < tol) {
          // move the dragged members onto the neighbour's group
          for (const m of members) {
            this.animatePiece(m, m.pos.x + errX, m.pos.y + errY, 120);
          }
          this.mergeGroups(n.groupId, p.groupId);
          return true;
        }
      }
    }
    return false;
  }

  private checkComplete(fromLocal: boolean): void {
    if (this.completed) return;
    if (this.pieces.every((p) => p.placed)) {
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
      const ctx = this.placedCtx; // any 2d ctx works for isPointInPath
      ctx.save();
      ctx.setTransform(s, 0, 0, s, 0, 0);
      const inside = ctx.isPointInPath(sprite.path, lx * s, ly * s);
      ctx.restore();
      if (inside) return p;
    }
    return null;
  }

  // ----------------------------------------------------------- baking

  private bakeAllPlaced(): void {
    this.placedCtx.setTransform(1, 0, 0, 1, 0, 0);
    this.placedCtx.clearRect(0, 0, this.placedLayer.width, this.placedLayer.height);
    for (const p of this.pieces) if (p.placed) this.bakePiece(p);
  }

  private bakePiece(p: PieceState): void {
    const sprite = this.sprites[p.id]!;
    const s = this.placedLayer.width / this.geom.width;
    this.placedCtx.setTransform(1, 0, 0, 1, 0, 0);
    this.placedCtx.drawImage(
      sprite.canvas,
      (p.correct.x - sprite.mx) * s,
      (p.correct.y - sprite.my) * s,
      (this.geom.cellW + 2 * sprite.mx) * s,
      (this.geom.cellH + 2 * sprite.my) * s,
    );
  }

  // ----------------------------------------------------------- animation

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

    // Board plate
    const r = Math.min(this.geom.cellW, this.geom.cellH) * 0.15;
    ctx.save();
    ctx.fillStyle = this.opts.boardColor;
    ctx.shadowColor = "rgba(20,10,40,0.25)";
    ctx.shadowBlur = 30 / this.scale;
    ctx.shadowOffsetY = 8 / this.scale;
    roundRect(ctx, -r, -r, this.geom.width + 2 * r, this.geom.height + 2 * r, r);
    ctx.fill();
    ctx.restore();

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

    const pattern = this.texturePattern();
    if (pattern) {
      ctx.save();
      roundRect(ctx, -r, -r, this.geom.width + 2 * r, this.geom.height + 2 * r, r);
      ctx.clip();
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = pattern;
      ctx.fillRect(-r, -r, this.geom.width + 2 * r, this.geom.height + 2 * r);
      ctx.restore();
    }

    // Ghost preview
    if (this.opts.ghost && !this.completed) {
      ctx.save();
      ctx.globalAlpha = 0.16;
      ctx.drawImage(this.image, 0, 0, this.geom.width, this.geom.height);
      ctx.restore();
    }

    // Placed pieces (pre-baked layer)
    ctx.drawImage(this.placedLayer, 0, 0, this.geom.width, this.geom.height);

    // Visible world rect for culling
    const rect = this.canvas.getBoundingClientRect();
    const tl = this.screenToWorld(rect.left, rect.top);
    const br = this.screenToWorld(rect.right, rect.bottom);
    const cullPad = Math.max(this.geom.cellW, this.geom.cellH) * 2;

    const draggedGroup = this.drag?.groupId ?? -1;
    const drawList: PieceState[] = [];
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
      drawList.push(p);
    }
    drawList.sort((a, b) => a.z - b.z);

    for (const p of drawList) {
      const dragged = p.groupId === draggedGroup;
      this.drawPiece(ctx, p, dragged);
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
      ctx.strokeRect(p.correct.x, p.correct.y, this.geom.cellW, this.geom.cellH);
      // ring around the piece itself
      ctx.beginPath();
      ctx.arc(
        p.pos.x + this.geom.cellW / 2,
        p.pos.y + this.geom.cellH / 2,
        Math.max(this.geom.cellW, this.geom.cellH) * 0.85,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
      ctx.restore();
    } else if (this.hintPiece && now - this.hintStart >= 3200) {
      this.hintPiece = null;
    }

    // Completed sheen
    if (this.completed) {
      ctx.save();
      ctx.globalAlpha = 0.08;
      ctx.fillStyle = "#ffffff";
      roundRect(ctx, 0, 0, this.geom.width, this.geom.height, r * 0.5);
      ctx.fill();
      ctx.restore();
    }
  }

  private drawPiece(ctx: CanvasRenderingContext2D, p: PieceState, dragged: boolean): void {
    const sprite = this.sprites[p.id]!;
    const cw = this.geom.cellW;
    const ch = this.geom.cellH;
    ctx.save();
    ctx.translate(p.pos.x + cw / 2, p.pos.y + ch / 2);
    if (p.rot) ctx.rotate((p.rot * Math.PI) / 2);
    if (dragged) {
      ctx.scale(LIFT_SCALE, LIFT_SCALE);
      ctx.shadowColor = "rgba(20,10,40,0.45)";
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
    if (dragged && this.drag?.hovered) {
      ctx.shadowColor = "rgba(52,180,127,0.9)";
      ctx.shadowBlur = 30 / this.scale;
      ctx.strokeStyle = "rgba(52,180,127,0.9)";
      ctx.lineWidth = 3 / this.scale;
      ctx.strokeRect(-cw / 2, -ch / 2, cw, ch);
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
