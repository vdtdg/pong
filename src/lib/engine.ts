import { GRID_SIZE, BALL_SPEED } from './config.js';
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
			x: GRID_SIZE / 4 - 0.5 + rand() * 1,
			y: GRID_SIZE / 2 - 0.5 + rand() * 1,
			vx: Math.cos(angle0) * BALL_SPEED,
			vy: Math.sin(angle0) * BALL_SPEED
		},
		{
			x: (3 * GRID_SIZE) / 4 - 0.5 + rand() * 1,
			y: GRID_SIZE / 2 - 0.5 + rand() * 1,
			vx: Math.cos(angle1) * BALL_SPEED,
			vy: Math.sin(angle1) * BALL_SPEED
		}
	];

	return { tick: 0, seed, grid, balls };
}

const EPS = 1e-9;

function stepBall(ball: Ball, owner: number, grid: Uint8Array): void {
	let nx = ball.x + ball.vx;
	let ny = ball.y + ball.vy;

	if (nx <= 0) {
		ball.vx = Math.abs(ball.vx);
		nx = EPS;
	}
	if (nx >= GRID_SIZE) {
		ball.vx = -Math.abs(ball.vx);
		nx = GRID_SIZE - EPS;
	}
	if (ny <= 0) {
		ball.vy = Math.abs(ball.vy);
		ny = EPS;
	}
	if (ny >= GRID_SIZE) {
		ball.vy = -Math.abs(ball.vy);
		ny = GRID_SIZE - EPS;
	}

	const targetCX = Math.floor(nx);
	const targetCY = Math.floor(ny);
	const currentCX = Math.floor(ball.x);
	const currentCY = Math.floor(ball.y);

	if (targetCX !== currentCX || targetCY !== currentCY) {
		const idx = targetCY * GRID_SIZE + targetCX;
		if (grid[idx] !== owner) {
			grid[idx] = owner;
			if (targetCX !== currentCX) ball.vx *= -1;
			if (targetCY !== currentCY) ball.vy *= -1;
			return;
		}
	}

	ball.x = nx;
	ball.y = ny;
}

export function tick(state: GameState): GameState {
	stepBall(state.balls[0], 0, state.grid);
	stepBall(state.balls[1], 1, state.grid);
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
