export const GRID_SIZE = 20;
export const TICK_RATE = 60;
export const BALL_SPEED = 10 / TICK_RATE;
export const PIXEL_SIZE = 30;
export const BALL_RADIUS = 0.4;
export const BRIGHTNESS = 0.8;

export const COLORS = {
	background: '#0a0a1a',
	player1: '#ff00e5',
	player2: '#00ffe5',
	ball1: '#ffffff',
	ball2: '#ffffff',
	ball1Glow: '#ff00e5',
	ball2Glow: '#00ffe5'
} as const;

export function dimColor(hex: string, factor: number): string {
	const r = parseInt(hex.slice(1, 3), 16);
	const g = parseInt(hex.slice(3, 5), 16);
	const b = parseInt(hex.slice(5, 7), 16);
	const dr = Math.round(r * factor);
	const dg = Math.round(g * factor);
	const db = Math.round(b * factor);
	return '#' + [dr, dg, db].map((c) => c.toString(16).padStart(2, '0')).join('');
}
