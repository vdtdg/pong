# Pong Battle

Two balls bounce inside a bounded square, each confined to its own colored territory.  
When a ball hits the boundary between the two territories, the cell flips to its color — expanding its domain.  
A deterministic, infinite tug-of-war between pink and cyan.

## How it works

- The game runs **deterministically** from a single seed
- Server simulates the game and serves the current state via `/api/game-state`
- Clients fetch the state once and simulate locally — all spectators see the exact same game
- No WebSocket needed, just HTTP

## Running locally

```sh
pnpm install
pnpm dev
```

Open `http://localhost:5173`.

## Docker

```sh
docker compose up --build
```

Open `http://localhost:3000`.

## Configuration

Edit `src/lib/config.ts`:

- `GRID_SIZE` — grid cells per side (default 40)
- `TICK_RATE` — simulation ticks per second (default 30)
- `BALL_SPEED` — cells per tick (default 6 / TICK_RATE)
- `PIXEL_SIZE` — canvas pixel size (default 14)
- `COLORS` — synthwave palette
