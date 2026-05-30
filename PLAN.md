# Pong Battle — Implementation Plan

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│  src/lib/engine.ts     Shared deterministic engine   │
│  - Pure functions: tick(), createState(), hash()     │
│  - Seeded PRNG (mulberry32)                          │
│  - Grid: Uint8Array(GRID_SIZE × GRID_SIZE)           │
│  - Balls: [{x, y, vx, vy}]                          │
│  - Config: GRID_SIZE, SPEED, TICK_RATE               │
│                                                      │
│  Runs on BOTH server and client ← key design point  │
└─────────────────────────────────────────────────────┘
           ▲                              ▲
           │                              │
  ┌────────┴─────────┐         ┌─────────┴──────────┐
  │ Server (Node.js)  │         │ Client (Browser)    │
  │                   │         │                     │
  │ engine-manager.ts │  HTTP   │ GameCanvas.svelte   │
  │ - Runs the engine │ ──────→ │ - Fetches init      │
  │ - Generates seed  │  GET    │ - Fast-forwards     │
  │ - Stores tick N   │         │ - raf() loop:       │
  │ - Exposes endpoint│         │   tick() + draw()   │
  └───────────────────┘         └─────────────────────┘
```

---

## Step 1 — Config file

**File:** `src/lib/config.ts`

- `GRID_SIZE = 40` (cells per side)
- `TICK_RATE = 30` (ticks per second)
- `BALL_SPEED = 6 / TICK_RATE` (cells per tick, to move ~6 cells/sec)
- `PIXEL_SIZE = 14` (CSS pixels per cell on canvas)
- `COLORS`: synthwave palette object
  - player1: `'#ff00e5'` (neon pink)
  - player2: `'#00ffe5'` (cyan)
  - background: `'#0a0a1a'` (dark navy)
  - gridLine: `'#1a1a3e'`
  - ball1: `'#ffffff'` (with pink glow)
  - ball2: `'#ffffff'` (with cyan glow)

All values exported as `const` so they tree-shake.

---

## Step 2 — Deterministic PRNG

**File:** `src/lib/prng.ts`

Implement `mulberry32(seed: number): () => number` — returns a function that produces deterministic floats in `[0, 1)`.

- Pure, no global state
- Used by the engine for initial ball velocities

---

## Step 3 — Shared Game Engine

**File:** `src/lib/engine.ts`

This is the heart of the project. Pure functions only. No classes, no side effects.

### Types

```ts
interface Ball {
  x: number;   // fractional cell index (e.g. 19.5)
  y: number;   // fractional cell index
  vx: number;  // cells per tick
  vy: number;  // cells per tick
}

interface GameState {
  tick: number;
  seed: number;
  grid: Uint8Array;  // 0 = player1, 1 = player2
  balls: [Ball, Ball];
}
```

### Exported functions

| Function | Signature | Description |
|---|---|---|
| `createState(seed)` | `(number) => GameState` | Creates initial state: left half = 0, right half = 1. Two balls centered in their halves with random velocities from the seeded PRNG. |
| `tick(state)` | `(GameState) => GameState` | Advances one tick. Mutates in place for performance, returns the same object. See tick logic below. |
| `serialize(state)` | `(GameState) => object` | Converts Uint8Array to number[] for JSON transport, returns `{ tick, seed, grid, balls }`. |
| `deserialize(data)` | `({ tick, seed, grid, balls }) => GameState` | Inverse of serialize. |
| `hash(state)` | `(GameState) => string` | Quick hash of the grid for resync checks (e.g. crc32 or simple FNV). |
| `fastForward(state, targetTick)` | `(GameState, number) => GameState` | Calls `tick()` repeatedly until `state.tick === targetTick`. |

### Tick logic (the core mechanics)

```
for each ball:
  1. Compute next position: nextX = ball.x + ball.vx, nextY = ball.y + ball.vy

  2. Check grid boundaries (walls):
     - If nextX < 0 or nextX >= GRID_SIZE → bounce (vx *= -1), clamp to edge
     - If nextY < 0 or nextY >= GRID_SIZE → bounce (vy *= -1), clamp to edge

  3. Teritory boundary check:
     - Let targetCell = grid[round(nextY)][round(nextX)]
     - If targetCell !== ball.owner:
       → Flip targetCell to ball.owner (claim territory!)
       → Bounce (reflect): compute normal at the contacted edge
         between current cell and target cell, reflect velocity
       → Snap position to the boundary edge (so ball stays in its territory)
     - Else (target cell is own territory):
       → Move ball to nextX, nextY normally

  4. Update ball position

increment tick
```

### Bounce reflection details

When a ball is at cell (cx, cy) and tries to move into cell (tx, ty) which is enemy territory:
- The boundary edge is either vertical or horizontal
- If `cx !== tx` (horizontal move into enemy) → reflect `vx`
- If `cy !== ty` (vertical move into enemy) → reflect `vy`
- If both (diagonal), reflect both
- Snap the ball position to the cell boundary: ball stays exactly on the line

This ensures balls can only ever occupy cells of their own color.

---

## Step 4 — Server Engine Manager

**File:** `src/lib/server/engine-manager.ts`

```ts
// Module-level singleton (lives for the server process lifetime)
let currentState: GameState;

export function initGame(seed?: number) {
  const s = seed ?? Date.now();
  currentState = createState(s);
  // Start the tick loop
  setInterval(() => {
    tick(currentState);
  }, 1000 / TICK_RATE);
}

export function getCurrentState(): GameState {
  return currentState;
}

export function getSerializedState() {
  return serialize(currentState);
}
```

- `initGame()` called once from `hooks.server.ts` on server startup.

---

## Step 5 — Server-side hook

**File:** `src/hooks.server.ts`

```ts
import { initGame } from '$lib/server/engine-manager';

initGame();
```

Minimal. Initializes the game when the Node process starts.

---

## Step 6 — API Endpoint

**File:** `src/routes/api/game-state/+server.ts`

```
GET /api/game-state
→ returns { tick, seed, grid: number[], balls: [...], hash: string }
```

- Calls `getSerializedState()` from engine manager
- Returns JSON
- No caching (game state changes every tick)
- CORS headers if needed (though same-origin)

---

## Step 7 — Canvas Component

**File:** `src/lib/GameCanvas.svelte`

### Behavior

1. On mount: fetch `GET /api/game-state`
2. Instantiate engine state via `deserialize(data)`
3. Call `fastForward(state, data.tick)` (should be no-op since we're at current tick)
4. Compute `startTick = data.tick`, `startTime = performance.now()`
5. Start `requestAnimationFrame` loop:

```
each frame:
  now = performance.now()
  elapsed = (now - startTime) / 1000  // seconds
  targetTick = startTick + elapsed * TICK_RATE
  ticksToRun = floor(targetTick) - state.tick

  if ticksToRun > 0:
    // If client is behind, run multiple ticks at once (catch-up)
    for i in 0..ticksToRun:
      tick(state)
    // But clamp to some max (e.g. 120) to avoid spiral of death
    if ticksToRun > 120:
      // Too far behind, re-fetch from server
      reFetch()
```

6. Render to `<canvas>`:
   - Draw background (dark navy)
   - For each cell: fillRect with player1 or player2 color
   - Optional: draw subtle grid lines
   - For each ball: draw a circle with its glow color
   - Optional: CRT scanlines overlay, vignette

### Why `fastForward` can be skipped

The client receives the state at tick N. It starts its own timer from that point. So `state.tick` already equals `data.tick` — no forward needed. We just start ticking forward in the raf loop.

### Canvas sizing
- `canvas.width = GRID_SIZE * PIXEL_SIZE`
- `canvas.height = GRID_SIZE * PIXEL_SIZE`
- Scale to fill the viewport using CSS `max-width: 100vmin; max-height: 100vmin; image-rendering: pixelated;`

---

## Step 8 — Page Layout

**File:** `src/routes/+page.svelte`

```svelte
<script>
  import GameCanvas from '$lib/GameCanvas.svelte';
</script>

<main class="flex min-h-screen items-center justify-center bg-black">
  <GameCanvas />
</main>
```

**File:** `src/routes/layout.css` — keep existing Tailwind import, add synthwave dark background.

---

## Step 9 — HTML Favicon

Replace `src/lib/assets/favicon.svg` with a simple pixel-art SVG of the two balls.

---

## Step 10 — Docker Setup

### `Dockerfile`

```dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/build /app/build
COPY --from=builder /app/package.json /app/package.json
COPY --from=builder /app/node_modules /app/node_modules
EXPOSE 3000
ENV HOST=0.0.0.0
ENV PORT=3000
CMD ["node", "build"]
```

### `docker-compose.yml` (for convenience)

```yaml
services:
  pong:
    build: .
    ports:
      - '3000:3000'
    restart: unless-stopped
```

### `.dockerignore`
```
node_modules
.git
.svelte-kit
```

---

## Step 11 — Svelte Adapter

Switch `adapter-auto` to `adapter-node` in `svelte.config.js` and install `@sveltejs/adapter-node`.

---

## Step 12 — Readme Update

Update `README.md` with:
- Short description
- `docker compose up --build` instructions
- Screenshot placeholder

---

## Implementation Order (what to code first)

| # | File | Depends on |
|---|---|---|
| 1 | `src/lib/config.ts` | nothing |
| 2 | `src/lib/prng.ts` | nothing |
| 3 | `src/lib/engine.ts` | config, prng |
| 4 | `src/lib/server/engine-manager.ts` | engine |
| 5 | `src/hooks.server.ts` | engine-manager |
| 6 | `src/routes/api/game-state/+server.ts` | engine-manager |
| 7 | `src/lib/GameCanvas.svelte` | engine, config |
| 8 | `src/routes/+page.svelte` | GameCanvas |
| 9 | `src/routes/layout.css` | nothing |
| 10 | `Dockerfile`, `docker-compose.yml`, `.dockerignore` | nothing |
| 11 | `README.md` | everything |
| 12 | `svelte.config.js` (adapter-node) | nothing |

---

## Determinism Checklist

- [x] Seeded PRNG (mulberry32), no `Math.random()` anywhere
- [x] Fixed timestep (integer tick counter)
- [x] No floating-point accumulation issues (ball x/y are floats but always derived from tick * velocity, not incremental adds)
  - Actually: we DO incrementally add velocity. To keep server and client in sync, the server provides the authoritative state at tick N, and the client replays from there. Small float errors won't diverge meaningfully over ~1 second (30 ticks). Plus the resync mechanism (re-fetch every 30s) corrects drift.
- [x] All clients start from the same seed + tick + grid snapshot
- [x] Engine is a pure function of its state — no external inputs

---

## Synthwave Pixel-Art Visual Spec

```
Color palette:
  Background:  #0a0a1a (deep navy)
  Player 1:    #ff00e5 (hot magenta / neon pink)
  Player 2:    #00ffe5 (cyan / teal)
  Grid lines:  #1a1a3e (subtle, barely visible)
  Ball 1:      #ffffff with #ff00e5 glow
  Ball 2:      #ffffff with #00ffe5 glow

Style:
  - image-rendering: pixelated
  - No border-radius, no gradients (flat pixels)
  - Optional CRT effect: scanlines via canvas or CSS overlay
  - Optional chromatic aberration on ball edges
  - Dark background surrounding the grid
```
