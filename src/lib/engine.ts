import { GRID_SIZE, BALL_SPEED, BALL_RADIUS } from './config.js';
import { mulberry32 } from './prng.js';

export interface Ball {
	x: number;
	y: number;
	vx: number;
	vy: number;
}

export interface GameState {
	tick: number;
	seed: number;
	grid: Uint8Array;
	balls: [Ball, Ball];
}

export interface SerializedState {
	tick: number;
	seed: number;
	grid: number[];
	balls: [Ball, Ball];
}

export function createState(seed: number): GameState {
	const rand = mulberry32(seed);

	const grid = new Uint8Array(GRID_SIZE * GRID_SIZE);
	const mid = Math.floor(GRID_SIZE / 2);

	for (let y = 0; y < GRID_SIZE; y++) {
		for (let x = 0; x < mid; x++) {
			grid[y * GRID_SIZE + x] = 0;
		}
		for (let x = mid; x < GRID_SIZE; x++) {
			grid[y * GRID_SIZE + x] = 1;
		}
	}

	const angle0 = rand() * Math.PI * 2;
	const angle1 = rand() * Math.PI * 2;

	const balls: [Ball, Ball] = [
		{
			x: GRID_SIZE / 4 - 1 + rand() * 2,
			y: GRID_SIZE / 2 - 1 + rand() * 2,
			vx: Math.cos(angle0) * BALL_SPEED,
			vy: Math.sin(angle0) * BALL_SPEED
		},
		{
			x: (3 * GRID_SIZE) / 4 - 1 + rand() * 2,
			y: GRID_SIZE / 2 - 1 + rand() * 2,
			vx: Math.cos(angle1) * BALL_SPEED,
			vy: Math.sin(angle1) * BALL_SPEED
		}
	];

	return { tick: 0, seed, grid, balls };
}

const EPS = 1e-9;

function jitter(x: number, y: number, tick: number): number {
	const a = Math.imul(Math.floor(x * 10000), 2654435761) >>> 0;
	const b = Math.imul(Math.floor(y * 10000), 1597334677) >>> 0;
	const c = Math.imul(tick, 3266489909) >>> 0;
	return ((a ^ b ^ c) % 4001 - 2000) / 20000;
}

function applySpin(ball: Ball, x: number, y: number, tick: number): void {
	const s = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
	const angle = Math.atan2(ball.vy, ball.vx) + jitter(x, y, tick);
	ball.vx = Math.cos(angle) * s;
	ball.vy = Math.sin(angle) * s;
}

function stepBall(ball: Ball, owner: number, grid: Uint8Array, tick: number): void {
	let nx = ball.x + ball.vx;
	let ny = ball.y + ball.vy;

	if (nx <= 0) {
		ball.vx = Math.abs(ball.vx);
		nx = EPS;
		applySpin(ball, ball.x, ball.y, tick);
	}
	if (nx >= GRID_SIZE) {
		ball.vx = -Math.abs(ball.vx);
		nx = GRID_SIZE - EPS;
		applySpin(ball, ball.x, ball.y, tick);
	}
	if (ny <= 0) {
		ball.vy = Math.abs(ball.vy);
		ny = EPS;
		applySpin(ball, ball.x, ball.y, tick);
	}
	if (ny >= GRID_SIZE) {
		ball.vy = -Math.abs(ball.vy);
		ny = GRID_SIZE - EPS;
		applySpin(ball, ball.x, ball.y, tick);
	}

	const minCX = Math.floor(Math.min(ball.x, nx) - BALL_RADIUS);
	const maxCX = Math.floor(Math.max(ball.x, nx) + BALL_RADIUS);
	const minCY = Math.floor(Math.min(ball.y, ny) - BALL_RADIUS);
	const maxCY = Math.floor(Math.max(ball.y, ny) + BALL_RADIUS);

	let bounceX = false;
	let bounceY = false;

	for (let cy = minCY; cy <= maxCY; cy++) {
		for (let cx = minCX; cx <= maxCX; cx++) {
			if (cx < 0 || cx >= GRID_SIZE || cy < 0 || cy >= GRID_SIZE) continue;
			const idx = cy * GRID_SIZE + cx;
			if (grid[idx] !== owner) {
				grid[idx] = owner;
				if (cx < Math.floor(ball.x)) bounceX = true;
				if (cx > Math.floor(ball.x)) bounceX = true;
				if (cy < Math.floor(ball.y)) bounceY = true;
				if (cy > Math.floor(ball.y)) bounceY = true;
			}
		}
	}

	if (bounceX || bounceY) {
		if (bounceX) ball.vx *= -1;
		if (bounceY) ball.vy *= -1;
		applySpin(ball, ball.x, ball.y, tick);
		return;
	}

	ball.x = nx;
	ball.y = ny;
}

export function tick(state: GameState): GameState {
	stepBall(state.balls[0], 0, state.grid, state.tick);
	stepBall(state.balls[1], 1, state.grid, state.tick);
	state.tick++;
	return state;
}

export function serialize(state: GameState): SerializedState {
	return {
		tick: state.tick,
		seed: state.seed,
		grid: Array.from(state.grid),
		balls: [state.balls[0], state.balls[1]]
	};
}

export function deserialize(data: SerializedState): GameState {
	return {
		tick: data.tick,
		seed: data.seed,
		grid: new Uint8Array(data.grid),
		balls: [data.balls[0], data.balls[1]]
	};
}

export function hash(state: GameState): string {
	let h = state.tick;
	for (let i = 0; i < state.grid.length; i += 64) {
		h = ((h << 5) - h + state.grid[i]) | 0;
	}
	return h.toString(36);
}

export function fastForward(state: GameState, targetTick: number): GameState {
	while (state.tick < targetTick) {
		tick(state);
	}
	return state;
}
