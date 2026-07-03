import { ConvexReactClient } from "convex/react";

const url = import.meta.env.VITE_CONVEX_URL as string | undefined;

/** Null when no deployment is configured — the app degrades to solo play. */
export const convexClient: ConvexReactClient | null = url ? new ConvexReactClient(url) : null;

export const multiplayerAvailable = convexClient !== null;
