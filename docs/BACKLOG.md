# Backlog & technical debt

## Product enhancements
- **Puzzle of the day** — shared daily seed + image; leaderboard by completion time.
- **Custom image upload** — needs storage (Convex file storage) + moderation story.
- **Piece rotation in multiplayer** — engine supports it; wire `rot` through the room config UI once conflict UX (rotating a claimed group) is designed.
- **Spectator mode** — join a room without claiming pieces.
- **Mobile haptics** — `navigator.vibrate` on snap/merge.
- **Zoom minimap** — corner overview showing viewport rect for Expert puzzles.
- **Save thumbnails of progress** — render the placed layer to a small dataURL for richer resume cards.
- **Achievements / streaks** — cozy, Duolingo-style gentle rewards.

## Technical debt
- `convex/_generated/*` is hand-written boilerplate (codegen requires a configured deployment). Running `npx convex dev` regenerates it — files are identical templates, but confirm after major Convex upgrades.
- Piece claim is optimistic client-side: the `claim` mutation result isn't awaited before the drag starts. The `release` mutation guards consistency (non-holders' writes are ignored), but a visible "piece snatched back" correction animation would polish rare races.
- `hitTest` sorts all pieces per click (`O(n log n)`); fine at 900 pieces, but a spatial grid would make it `O(1)` if we ever go past that.
- Remote piece updates snap instantly; interpolate remote moves (~100ms lerp) for smoother other-player drags on slow networks.
- Chat query returns the last 80 messages without pagination.
- Sound recipes are tuned by ear in `synth.ts`; consider exposing a debug page to audition them.

## Known trade-offs (documented decisions)
- Picsum "search" is a deterministic hash into curated pages (Picsum has no search API) — real search activates with a Pexels/Pixabay key.
- Reshuffling breaks apart unplaced groups (classic jigsaw-app behaviour, keeps shuffle meaningful).
- Multiplayer timer is wall-clock from room creation and cannot pause (shared session).
