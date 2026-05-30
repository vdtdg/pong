import { createState, tick, serialize, type GameState } from '$lib/engine.js';
import { TICK_RATE } from '$lib/config.js';

let currentState: GameState;
let intervalId: ReturnType<typeof setInterval> | null = null;

export function initGame(seed?: number): void {
	if (currentState) return;

	const envSeed = process.env.SEED;
	const s = seed ?? (envSeed ? parseInt(envSeed, 10) || 0 : 12345) >>> 0;
	currentState = createState(s);

	intervalId = setInterval(() => {
		tick(currentState);
	}, 1000 / TICK_RATE);
}

export function getCurrentState(): GameState {
	return currentState;
}

export function getSerializedState() {
	if (!currentState) throw new Error('Game not initialized');
	return serialize(currentState);
}
