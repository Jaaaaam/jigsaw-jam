/** Anonymous per-browser identity for multiplayer presence. */

export const PLAYER_COLORS = [
  "#f65a33", "#8461c9", "#34b47f", "#eeb32b",
  "#3b82f6", "#ec4899", "#14b8a6", "#f97316",
];

const ADJECTIVES = ["Cozy", "Swift", "Sunny", "Mellow", "Brave", "Dreamy", "Lucky", "Gentle"];
const ANIMALS = ["Fox", "Owl", "Otter", "Panda", "Bunny", "Koala", "Duck", "Cat"];

export function getSessionId(): string {
  let id = localStorage.getItem("jj:session");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("jj:session", id);
  }
  return id;
}

export function randomName(): string {
  const a = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]!;
  const b = ANIMALS[Math.floor(Math.random() * ANIMALS.length)]!;
  return `${a} ${b}`;
}

export function colorForSession(sessionId: string): string {
  let h = 0;
  for (const ch of sessionId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PLAYER_COLORS[h % PLAYER_COLORS.length]!;
}
