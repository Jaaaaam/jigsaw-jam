// @vitest-environment happy-dom
import { beforeEach, describe, expect, test } from "vitest";
import { deleteSave, listSaves, loadSave, newSaveId, writeSave, type SaveGame } from "@/services/saves";
import { DEFAULT_CONFIG } from "@/engine/types";

function makeSave(id: string, updatedAt = Date.now()): SaveGame {
  return {
    id,
    createdAt: updatedAt,
    updatedAt,
    imageUrl: "https://example.com/img.jpg",
    thumbUrl: "https://example.com/thumb.jpg",
    config: DEFAULT_CONFIG,
    seed: 1,
    elapsed: 1000,
    placed: 3,
    total: 48,
    snapshots: [{ id: 0, x: 1, y: 2, rot: 0, groupId: 0, placed: false, z: 0 }],
  };
}

beforeEach(() => localStorage.clear());

describe("saves", () => {
  test("write → list → load round-trip", () => {
    writeSave(makeSave("abc"));
    const metas = listSaves();
    expect(metas).toHaveLength(1);
    expect(metas[0]!.id).toBe("abc");
    // meta index must not carry the heavy snapshots payload
    expect("snapshots" in metas[0]!).toBe(false);
    const full = loadSave("abc");
    expect(full?.snapshots).toHaveLength(1);
  });

  test("updating an existing save does not duplicate it", () => {
    writeSave(makeSave("abc", 100));
    writeSave({ ...makeSave("abc", 200), placed: 10 });
    expect(listSaves()).toHaveLength(1);
    expect(loadSave("abc")?.placed).toBe(10);
  });

  test("evicts the oldest save past the cap", () => {
    for (let i = 0; i < 12; i++) writeSave(makeSave(`save-${i}`, i));
    const metas = listSaves();
    expect(metas).toHaveLength(10);
    expect(loadSave("save-0")).toBeNull();
    expect(loadSave("save-11")).not.toBeNull();
  });

  test("deleteSave removes meta and payload", () => {
    writeSave(makeSave("gone"));
    deleteSave("gone");
    expect(listSaves()).toHaveLength(0);
    expect(loadSave("gone")).toBeNull();
  });

  test("newSaveId is unique", () => {
    const ids = new Set(Array.from({ length: 100 }, newSaveId));
    expect(ids.size).toBe(100);
  });
});
