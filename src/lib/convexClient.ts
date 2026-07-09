import { ConvexReactClient } from "convex/react";

/**
 * Kill switch for multiplayer, controlled via env. Set
 * `VITE_MULTIPLAYER_ENABLED=false` in `.env.local` (or your host's env vars)
 * to disable rooms; remove it or set it to `true` to re-enable. While off,
 * no Convex client is created (zero Convex requests) and the multiplayer UI
 * shows a "currently not available" message.
 */
export const MULTIPLAYER_ENABLED = import.meta.env.VITE_MULTIPLAYER_ENABLED !== "false";

const url = import.meta.env.VITE_CONVEX_URL as string | undefined;

/** Null when disabled or no deployment is configured — the app degrades to solo play. */
export const convexClient: ConvexReactClient | null =
  MULTIPLAYER_ENABLED && url ? new ConvexReactClient(url) : null;

export const multiplayerAvailable = convexClient !== null;
