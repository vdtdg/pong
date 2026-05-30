import { createState, tick, serialize, deserialize, type GameState, type SerializedState } from '$lib/engine.js';
import { TICK_RATE } from '$lib/config.js';
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const STATE_FILE = process.env.STATE_FILE || 'data/game-state.json';
const SAVE_INTERVAL = parseInt(process.env.SAVE_INTERVAL || '5000', 10);

let currentState: GameState;
let tickInterval: ReturnType<typeof setInterval> | null = null;
let saveInterval: ReturnType<typeof setInterval> | null = null;

async function ensureDir(): Promise<void> {
	try {
		await mkdir(path.dirname(STATE_FILE), { recursive: true });
	} catch {
		/* directory exists */
	}
}

async function saveState(): Promise<void> {
	if (!currentState) return;
	try {
		await ensureDir();
		const data = serialize(currentState);
		await writeFile(STATE_FILE, JSON.stringify(data), 'utf-8');
	} catch (e) {
		console.error('Failed to save game state:', e);
	}
}

async function loadState(): Promise<GameState | null> {
	try {
		const raw = await readFile(STATE_FILE, 'utf-8');
		const data: SerializedState = JSON.parse(raw);
		return deserialize(data);
	} catch {
		return null;
	}
}

export async function initGame(seed?: number): Promise<void> {
	if (currentState) return;

	const loaded = await loadState();
	if (loaded) {
		currentState = loaded;
		console.log(`[pong] loaded saved state at tick ${loaded.tick} (seed ${loaded.seed})`);
	} else {
		const envSeed = process.env.SEED;
		const s = seed ?? (envSeed ? parseInt(envSeed, 10) || 0 : 12345) >>> 0;
		currentState = createState(s);
		console.log(`[pong] new game with seed ${s}`);
	}

	tickInterval = setInterval(() => {
		tick(currentState);
	}, 1000 / TICK_RATE);

	saveInterval = setInterval(saveState, SAVE_INTERVAL);

	const shutdown = async () => {
		await saveState();
		process.exit(0);
	};
	process.on('SIGTERM', shutdown);
	process.on('SIGINT', shutdown);
}

const viewers = new Map<string, number>();

export function recordHeartbeat(sessionId: string): void {
	const now = Date.now();
	viewers.set(sessionId, now);

	for (const [id, lastSeen] of viewers) {
		if (now - lastSeen > 15_000) viewers.delete(id);
	}
	console.log(`[pong] heartbeat ${sessionId.slice(0, 8)} | ${viewers.size} viewers`);
}

export function getViewerCount(): number {
	const now = Date.now();
	for (const [id, lastSeen] of viewers) {
		if (now - lastSeen > 15_000) viewers.delete(id);
	}
	return viewers.size;
}

export function getCurrentState(): GameState {
	return currentState;
}

export function getSerializedState() {
	if (!currentState) throw new Error('Game not initialized');
	return serialize(currentState);
}
