import type { PieceSnapshot, PuzzleConfig } from "@/engine/types";

export interface SaveMeta {
  id: string;
  createdAt: number;
  updatedAt: number;
  imageUrl: string;
  thumbUrl: string;
  config: PuzzleConfig;
  seed: number;
  elapsed: number;
  placed: number;
  total: number;
  completedAt?: number;
}

export interface SaveGame extends SaveMeta {
  snapshots: PieceSnapshot[];
}

const INDEX_KEY = "jj:saves";
const MAX_SAVES = 10;

function readIndex(): SaveMeta[] {
  try {
    return JSON.parse(localStorage.getItem(INDEX_KEY) ?? "[]") as SaveMeta[];
  } catch {
    return [];
  }
}

function writeIndex(list: SaveMeta[]): void {
  localStorage.setItem(INDEX_KEY, JSON.stringify(list));
}

export function listSaves(): SaveMeta[] {
  return readIndex().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function loadSave(id: string): SaveGame | null {
  try {
    const raw = localStorage.getItem(`jj:save:${id}`);
    return raw ? (JSON.parse(raw) as SaveGame) : null;
  } catch {
    return null;
  }
}

export function writeSave(save: SaveGame): void {
  const { snapshots: _snapshots, ...meta } = save;
  let index = readIndex().filter((m) => m.id !== save.id);
  index.unshift(meta);
  // LRU-evict to respect localStorage quotas on big puzzles
  while (index.length > MAX_SAVES) {
    const evicted = index.pop()!;
    localStorage.removeItem(`jj:save:${evicted.id}`);
  }
  try {
    localStorage.setItem(`jj:save:${save.id}`, JSON.stringify(save));
    writeIndex(index);
  } catch {
    // quota exceeded — drop the oldest and retry once
    const oldest = index.at(-1);
    if (oldest && oldest.id !== save.id) {
      localStorage.removeItem(`jj:save:${oldest.id}`);
      writeIndex(index.filter((m) => m.id !== oldest.id));
      try {
        localStorage.setItem(`jj:save:${save.id}`, JSON.stringify(save));
      } catch {
        /* give up quietly — autosave will retry */
      }
    }
  }
}

export function deleteSave(id: string): void {
  localStorage.removeItem(`jj:save:${id}`);
  writeIndex(readIndex().filter((m) => m.id !== id));
}

export function newSaveId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
