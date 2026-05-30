import { createState, tick, serialize, type GameState } from '$lib/engine.js';
import { TICK_RATE } from '$lib/config.js';

let currentState: GameState;
let intervalId: ReturnType<typeof setInterval> | null = null;

export function initGame(seed?: number): void {
	if (currentState) return;

	const s = seed ?? (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
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
