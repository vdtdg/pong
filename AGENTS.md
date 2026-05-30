# Pong Battle — Architecture & Design Decisions

## Overview

A deterministic territorial tug-of-war between two autonomous bouncing balls.  
The game engine is shared between server and client — the server runs the authoritative
simulation, clients replay it deterministically from a snapshot.

```
┌──────────────────────────────────────────────────────┐
│  src/lib/engine.ts     Shared deterministic engine    │
│  - Pure functions: tick(), createState(), ...         │
│  - Seeded PRNG (mulberry32)                           │
│  - Grid: Uint8Array(GRID_SIZE × GRID_SIZE)            │
│  - Balls: [{x, y, vx, vy}]                           │
│                                                       │
│  Runs on BOTH server and client — key design point   │
└──────────────────────────────────────────────────────┘
          ▲                              ▲
          │                              │
 ┌────────┴─────────┐         ┌─────────┴──────────┐
 │ Server (Node.js)  │         │ Client (Browser)    │
 │                   │         │                     │
 │ engine-manager.ts │  HTTP   │ GameCanvas.svelte   │
 │ - Tick loop       │ ─────→  │ - Fetches init      │
 │ - Saves to disk   │  GET    │ - Simulates locally │
 │ - Loads on start  │         │ - raf() loop:       │
 │ - Serves endpoint │         │   tick() + draw()   │
 └───────────────────┘         └─────────────────────┘
```

## File map

```
src/
├── lib/
│   ├── config.ts              # Grid size, tick rate, speed, colors, brightness
│   ├── prng.ts                # mulberry32 seeded PRNG
│   ├── engine.ts              # Shared engine: createState, tick, serialize, deserialize, ...
│   ├── GameCanvas.svelte      # Canvas rendering + client-side tick loop
│   └── server/
│       └── engine-manager.ts  # Server singleton: tick loop, disk persistence
├── routes/
│   ├── +page.svelte           # Main page, mounts GameCanvas
│   ├── +layout.svelte         # Root layout
│   ├── layout.css             # Tailwind + dark background
│   └── api/game-state/
│       └── +server.ts         # GET endpoint → { tick, seed, grid, balls }
├── hooks.server.ts            # Awaits initGame() on startup
└── app.html                   # HTML shell, favicon, theme-color meta
```

## Game Engine

### State

```ts
interface Ball {
  x: number;   // fractional cell index (e.g. 19.5)
  y: number;
  vx: number;  // cells per tick
  vy: number;
}

interface GameState {
  tick: number;
  seed: number;
  grid: Uint8Array;   // GRID_SIZE² cells, 0 = player1, 1 = player2
  balls: [Ball, Ball];
}
```

### Tick logic

Each tick processes both balls:

1. Compute `nx = x + vx`, `ny = y + vy`
2. **Wall check**: if `nx < 0` or `nx >= GRID_SIZE` → reflect vx, clamp position. Same for y.
3. **Territory check**: compare `floor(nx, ny)` against `floor(x, y)`. If the target cell is enemy territory:
   - Flip the cell to the ball's owner
   - Reflect the velocity component that crossed the boundary
   - Apply a tiny deterministic angle jitter (`applySpin`) to break repetitive reflection patterns
   - Don't move the ball (it stays at the boundary)
4. If friendly cell → move ball to (nx, ny)

### Determinism guarantees

- Seeded PRNG (mulberry32) — no `Math.random()` anywhere in the engine
- Fixed timestep (integer tick counter, constant tick rate)
- All bounce jitter derived from `hash(ball.x, ball.y, tick)` — no extra state
- Server is authoritative; clients resync on lag > 120 ticks

### Initial state

- Left half of grid = player 0, right half = player 1
- Ball 0 centered in left half, ball 1 centered in right half
- Random initial angle from PRNG, constant speed `BALL_SPEED`

## Server persistence

- **Save**: serialized JSON written to `data/game-state.json` every 5 s (configurable via `SAVE_INTERVAL`)
- **Load on startup**: if file exists, deserializes and resumes from saved tick
- **Fallback**: if no file, generates fresh state from `SEED` env var (default `12345`)
- **Graceful shutdown**: saves on `SIGTERM`/`SIGINT`
- In Docker, `./data:/app/data` volume mount persists across rebuilds

## Client simulation

1. Fetch `GET /api/game-state` → receives `{ tick, seed, grid, balls }`
2. Deserialize into local `GameState`
3. `requestAnimationFrame` loop:
   - Compute elapsed time → target tick
   - Run `tick()` as many times as needed to catch up
   - If > 120 ticks behind → re-fetch from server (resync)
4. Render to `<canvas>` with pixel-art scaling

## Canvas rendering

- Each cell drawn as a colored `fillRect` at native resolution
- No grid lines (removed for clean look)
- Balls drawn as circles with a larger, semi-transparent glow circle behind
- Colors dimmed via `BRIGHTNESS` config (applied once at module load)
- CSS: `image-rendering: pixelated; max-width/max-height` for responsive scaling

## Responsive layout

- **Desktop**: horizontal flex — counters on sides, canvas centered
- **Mobile** (≤640px): column stack — canvas full-width, counters in a compact row below

## Config

See `src/lib/config.ts`:

| Key | Default | Notes |
|---|---|---|
| `GRID_SIZE` | 20 | cells per side |
| `TICK_RATE` | 60 | ticks per second |
| `BALL_SPEED` | 10 / TICK_RATE | cells per tick (constant for both balls) |
| `PIXEL_SIZE` | 30 | canvas pixels per cell |
| `BRIGHTNESS` | 0.8 | 0–1 dim factor applied to all canvas colors |
| `COLORS` | synthwave neon | player1/2, ball1/2, ball glows, background |

## Environment variables

| Variable | Default | Notes |
|---|---|---|
| `SEED` | `12345` | deterministic game seed |
| `STATE_FILE` | `data/game-state.json` | disk persistence path |
| `SAVE_INTERVAL` | `5000` | ms between state saves |
| `HOST` | `0.0.0.0` | for Docker |
| `PORT` | `3000` | for Docker |

## Design decisions

- **No WebSocket** — HTTP snapshot + client-side simulation makes 1000 concurrent spectators trivial (each client does the work)
- **Engine is a pure function of tick** — no classes, no side effects, runs identically on server and browser
- **Uint8Array grid** — compact, fast to iterate, serialized to `number[]` for JSON
- **Angle jitter on bounces** — tiny deterministic perturbation (±0.1 rad) derived from ball position × tick prevents repetitive bounce patterns without breaking determinism
- **Constant ball speed** — both balls use the same `BALL_SPEED`; only the initial angle varies (jitter is on angle only)
- **adapter-node** — targets Node.js for Docker on VPS, no serverless constraints
- **pnpm** — chosen during project scaffold, used throughout
- **Svelte 5 runes mode** — forced in `svelte.config.js`, project is JS-only (no TypeScript in `.svelte` files)
