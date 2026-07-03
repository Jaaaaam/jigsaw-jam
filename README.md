# 🧩 Jigsaw Jam

A cozy, premium-feeling multiplayer jigsaw puzzle game for the web. Pick a beautiful photo, cut it into up to 900 bezier-tab pieces, and solve it solo or live with friends — complete with player cursors, chat, emoji reactions, and satisfying procedural sound.

## Tech stack

React 19 · Vite 8 · TypeScript 6 (strict) · Tailwind CSS 4 · Framer Motion · Zustand · React Router 7 · Howler.js · Convex (real-time multiplayer) · HTML5 Canvas.

## Quick start

```bash
npm install
npm run dev          # solo play works immediately, no keys needed
```

### Enable multiplayer

```bash
npx convex dev       # creates a dev deployment and regenerates convex/_generated
```

Put the deployment URL in `.env.local` as `VITE_CONVEX_URL` (Convex usually writes this for you), restart `npm run dev`, and the **Play with Friends** / **Join a Room** flows light up.

### Optional image API keys

Copy `.env.example` to `.env.local` and add `VITE_PEXELS_API_KEY` / `VITE_PIXABAY_API_KEY` for photo search and curated categories. Without keys the app uses keyless [Picsum](https://picsum.photos) — everything still works.

## Features

**Gameplay** — difficulty presets (Easy 12 → Expert 300) and full custom grids up to 900 pieces, classic bezier tabs or square pieces, adjustable snap tolerance, optional piece rotation (press <kbd>R</kbd>), edges-first mode, casual (timer-free) mode, shuffle, tidy-tray auto-arrange, hint pulses, ghost image, edge-piece highlighting, draggable/resizable preview, progress ring, pause, restart, and automatic local saves you can resume from the home screen.

**Multiplayer (Convex)** — rooms with 6-letter invite codes, deterministic shared piece geometry (only positions sync), per-piece claim locking so two players can't fight over a piece, live named cursors, presence dots, chat, floating emoji reactions, per-player placement stats on the completion screen, and host-only restart.

**Board & display** — zoom (wheel / pinch / keys), pan (drag empty space, <kbd>Space</kbd>+drag, arrows), fullscreen, light/dark themes, board colour picker with custom colours, and felt/wood/linen board textures. All preferences persist.

**Sound** — every effect (pickup, drop, snap, merge, hover-near-target, completion arpeggio, UI ticks) is synthesized at runtime into WAV data played through Howler: zero binary assets, zero licensing worries. Master volume and mute persist.

**Performance** — each piece is pre-rendered once to an offscreen sprite (image clip + bevel), placed pieces are baked into a single static layer, and the render loop only blits visible sprites with viewport culling. A 300-piece puzzle boots in <1s and drags at 100+ fps.

**Accessibility** — full keyboard zoom/pan, visible focus rings, ARIA roles on all controls, screen-reader labels for progress and players, and a reduce-motion setting (also honours the OS preference) that calms every animation.

## Architecture

```
src/
  engine/     Pure TS puzzle math — seeded RNG, bezier edge geometry,
              piece generation, scatter, snapshots. No framework imports.
  canvas/     GameController (render loop, input, snapping, tweens) and
              the offscreen sprite cache. Mutable per-frame state lives
              here, outside React, on purpose.
  stores/     Zustand: persisted settings + low-frequency game meta.
  services/   Image provider abstraction (Pexels → Pixabay → Picsum
              fallback chain), procedural sound bank, saves, session.
  components/ Design system (glass buttons, modal, sliders, pickers),
              game HUD, multiplayer overlays (cursors, chat, players).
  routes/     Home, New Puzzle wizard, solo Play, Join, Room.
convex/       Schema + rooms/pieces/presence/chat functions.
```

Key decisions are documented in [docs/superpowers/specs/2026-07-03-jigsaw-jam-design.md](docs/superpowers/specs/2026-07-03-jigsaw-jam-design.md); the improvement backlog lives in [docs/BACKLOG.md](docs/BACKLOG.md).

## Scripts

```bash
npm run dev       # dev server
npm run build     # typecheck + production build
npm run lint      # oxlint
npm run preview   # serve the production build
```
