import { convexTest } from "convex-test";
import schema from "../../convex/schema";
import { api } from "../../convex/_generated/api";
import type { PuzzleConfigArg } from "../../convex/types";

/** convex-test needs the function modules; tests live outside convex/. */
export const modules = import.meta.glob([
  "../../convex/*.ts",
  "../../convex/_generated/*.js",
]);

export const testConfig: PuzzleConfigArg = {
  rows: 2,
  cols: 2,
  shape: "classic",
  snapTolerance: 0.28,
  rotationEnabled: false,
  edgesFirst: false,
  casual: false,
};

export function newTestBackend() {
  return convexTest(schema, modules);
}

export async function createTestRoom(t: ReturnType<typeof convexTest>, hostSessionId = "host") {
  return await t.mutation(api.rooms.create, {
    hostSessionId,
    imageUrl: "https://example.com/img.jpg",
    thumbUrl: "https://example.com/thumb.jpg",
    seed: 42,
    config: testConfig,
    initialPieces: [
      { pieceId: 0, x: -100, y: -100, rot: 0 },
      { pieceId: 1, x: 900, y: -100, rot: 0 },
      { pieceId: 2, x: -100, y: 900, rot: 0 },
      { pieceId: 3, x: 900, y: 900, rot: 0 },
    ],
  });
}

export { api };
