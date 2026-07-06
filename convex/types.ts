import { v, type GenericId, type Infer } from "convex/values";

/**
 * Equivalent to `Id<"rooms">` from `_generated/dataModel`, but expressed
 * directly so this file stays import-free of generated code — the schema
 * imports this module, and going through `_generated` would be circular.
 */
type RoomId = GenericId<"rooms">;

/* ------------------------------------------------------------- validators */

export const puzzleConfigValidator = v.object({
  rows: v.number(),
  cols: v.number(),
  shape: v.union(v.literal("classic"), v.literal("square")),
  // optional: rooms created before freeform mode existed omit it
  boardMode: v.optional(v.union(v.literal("board"), v.literal("freeform"))),
  snapTolerance: v.number(),
  rotationEnabled: v.boolean(),
  edgesFirst: v.boolean(),
  casual: v.boolean(),
});
export type PuzzleConfigArg = Infer<typeof puzzleConfigValidator>;

/** Host-controlled, room-wide play settings. */
export const roomSettingsValidator = v.object({
  snapGuide: v.boolean(),
  edgesFirst: v.boolean(),
});
export type RoomSettingsArg = Infer<typeof roomSettingsValidator>;

/** Transient host hint broadcast, overwritten each time. */
export const roomHintValidator = v.object({
  pieceId: v.number(),
  partnerId: v.optional(v.number()),
  at: v.number(),
});

export const initialPieceValidator = v.object({
  pieceId: v.number(),
  x: v.number(),
  y: v.number(),
  rot: v.number(),
});
export type InitialPieceArg = Infer<typeof initialPieceValidator>;

export const pieceSnapshotValidator = v.object({
  pieceId: v.number(),
  x: v.number(),
  y: v.number(),
  rot: v.number(),
  groupId: v.number(),
  placed: v.boolean(),
  z: v.number(),
});
export type PieceSnapshotArg = Infer<typeof pieceSnapshotValidator>;

/* ------------------------------------------------------------- arg shapes */

export type RoomArgs = {
  roomId: RoomId;
};

export type RoomSessionArgs = RoomArgs & {
  sessionId: string;
};

export type RoomCodeArgs = {
  code: string;
};

export type CreateRoomArgs = {
  hostSessionId: string;
  imageUrl: string;
  thumbUrl: string;
  seed: number;
  config: PuzzleConfigArg;
  initialPieces: InitialPieceArg[];
};

export type CompleteRoomArgs = RoomArgs & {
  elapsed: number;
};

export type RestartRoomArgs = RoomSessionArgs & {
  seed: number;
  initialPieces: InitialPieceArg[];
};

export type UpdateSettingsArgs = RoomSessionArgs & {
  settings: RoomSettingsArg;
};

export type NextRoundArgs = RoomSessionArgs & {
  imageUrl: string;
  thumbUrl: string;
  seed: number;
  config: PuzzleConfigArg;
  initialPieces: InitialPieceArg[];
};

export type SetChoosingArgs = RoomSessionArgs & {
  choosing: boolean;
};

export type BroadcastHintArgs = RoomSessionArgs & {
  pieceId: number;
  partnerId?: number;
};

export type ClaimPiecesArgs = RoomSessionArgs & {
  pieceIds: number[];
};

export type MovePiecesArgs = RoomSessionArgs & {
  snapshots: PieceSnapshotArg[];
};

export type JoinRoomArgs = RoomSessionArgs & {
  name: string;
  color: string;
};

export type HeartbeatArgs = RoomSessionArgs & {
  cursorX?: number;
  cursorY?: number;
};

export type SendMessageArgs = RoomSessionArgs & {
  name: string;
  color: string;
  kind: "chat" | "emoji";
  text: string;
};
