<script>
	import { onMount } from 'svelte';
	import { GRID_SIZE, PIXEL_SIZE, TICK_RATE, COLORS } from './config.js';
	import { deserialize, tick, fastForward, type GameState, type SerializedState } from './engine.js';

	let canvasEl = $state<HTMLCanvasElement>();
	let state = $state<GameState | null>(null);
	let rafId = $state(0);
	let startTick = $state(0);
	let startTime = $state(0);
	let error = $state('');

	function draw(ctx: CanvasRenderingContext2D, s: GameState) {
		const { grid, balls } = s;

		ctx.fillStyle = COLORS.background;
		ctx.fillRect(0, 0, GRID_SIZE * PIXEL_SIZE, GRID_SIZE * PIXEL_SIZE);

		for (let y = 0; y < GRID_SIZE; y++) {
			for (let x = 0; x < GRID_SIZE; x++) {
				const cell = grid[y * GRID_SIZE + x];
				ctx.fillStyle = cell === 0 ? COLORS.player1 : COLORS.player2;
				ctx.fillRect(x * PIXEL_SIZE, y * PIXEL_SIZE, PIXEL_SIZE, PIXEL_SIZE);
			}
		}

		ctx.strokeStyle = COLORS.gridLine;
		ctx.lineWidth = 0.5;
		for (let x = 0; x <= GRID_SIZE; x++) {
			ctx.beginPath();
			ctx.moveTo(x * PIXEL_SIZE, 0);
			ctx.lineTo(x * PIXEL_SIZE, GRID_SIZE * PIXEL_SIZE);
			ctx.stroke();
		}
		for (let y = 0; y <= GRID_SIZE; y++) {
			ctx.beginPath();
			ctx.moveTo(0, y * PIXEL_SIZE);
			ctx.lineTo(GRID_SIZE * PIXEL_SIZE, y * PIXEL_SIZE);
			ctx.stroke();
		}

		const ballRadius = PIXEL_SIZE * 0.4;
		const glowRadius = PIXEL_SIZE * 0.8;

		for (let i = 0; i < 2; i++) {
			const b = balls[i];
			const bx = b.x * PIXEL_SIZE;
			const by = b.y * PIXEL_SIZE;
			const glow = i === 0 ? COLORS.ball1Glow : COLORS.ball2Glow;

			ctx.save();
			ctx.globalAlpha = 0.3;
			ctx.fillStyle = glow;
			ctx.shadowColor = glow;
			ctx.shadowBlur = 12;
			ctx.beginPath();
			ctx.arc(bx, by, glowRadius, 0, Math.PI * 2);
			ctx.fill();
			ctx.restore();

			ctx.fillStyle = i === 0 ? COLORS.ball1 : COLORS.ball2;
			ctx.beginPath();
			ctx.arc(bx, by, ballRadius, 0, Math.PI * 2);
			ctx.fill();
		}
	}

	function loop() {
		if (!state || !canvasEl) return;

		const now = performance.now();
		const elapsed = (now - startTime) / 1000;
		const targetTick = Math.floor(startTick + elapsed * TICK_RATE);
		const ticksToRun = targetTick - state.tick;

		if (ticksToRun > 0) {
			if (ticksToRun > 120) {
				resync();
				return;
			}
			for (let i = 0; i < ticksToRun; i++) {
				tick(state);
			}
		}

		const ctx = canvasEl.getContext('2d');
		if (ctx) draw(ctx, state);

		rafId = requestAnimationFrame(loop);
	}

	async function resync() {
		try {
			const res = await fetch('/api/game-state');
			if (!res.ok) throw new Error('Fetch failed');
			const data: SerializedState = await res.json();
			state = deserialize(data);
			startTick = data.tick;
			startTime = performance.now();
			error = '';
		} catch (e) {
			error = 'Disconnected — retrying...';
			setTimeout(resync, 2000);
		}
	}

	async function init() {
		try {
			const res = await fetch('/api/game-state');
			if (!res.ok) throw new Error('Fetch failed');
			const data: SerializedState = await res.json();
			state = deserialize(data);
			startTick = data.tick;
			startTime = performance.now();
			error = '';
			rafId = requestAnimationFrame(loop);
		} catch (e) {
			error = 'Failed to connect — retrying...';
			setTimeout(init, 2000);
		}
	}

	onMount(() => {
		init();
		return () => {
			if (rafId) cancelAnimationFrame(rafId);
		};
	});
</script>

<canvas
	bind:this={canvasEl}
	width={GRID_SIZE * PIXEL_SIZE}
	height={GRID_SIZE * PIXEL_SIZE}
	class="pixelated max-h-[100vmin] max-w-[100vmin]"
></canvas>

{#if error}
	<div class="absolute inset-0 flex items-center justify-center bg-black/80 text-white">
		{error}
	</div>
{/if}

<style>
	.pixelated {
		image-rendering: pixelated;
		image-rendering: crisp-edges;
	}
</style>
