<script>
	import { onMount } from 'svelte';
	import { base } from '$app/paths';
	import { GRID_SIZE, PIXEL_SIZE, TICK_RATE, COLORS, BRIGHTNESS, dimColor } from './config.js';
	import { deserialize, tick } from './engine.js';

	const C = {
		background: COLORS.background,
		player1: dimColor(COLORS.player1, BRIGHTNESS),
		player2: dimColor(COLORS.player2, BRIGHTNESS),
		ball1: dimColor(COLORS.ball1, BRIGHTNESS),
		ball2: dimColor(COLORS.ball2, BRIGHTNESS)
	};

	const sessionId = crypto.randomUUID();
	let canvasEl = $state();
	let state = $state(null);
	let rafId = $state(0);
	let startTick = $state(0);
	let startTime = $state(0);
	let error = $state('');
	let count1 = $state(0);
	let count2 = $state(0);
	let viewers = $state(0);
	let heartbeatId = 0;
	const totalCells = GRID_SIZE * GRID_SIZE;

	function draw(ctx, s) {
		const { grid, balls } = s;

		ctx.fillStyle = C.background;
		ctx.fillRect(0, 0, GRID_SIZE * PIXEL_SIZE, GRID_SIZE * PIXEL_SIZE);

		let c1 = 0;
		let c2 = 0;
		for (let y = 0; y < GRID_SIZE; y++) {
			for (let x = 0; x < GRID_SIZE; x++) {
				const cell = grid[y * GRID_SIZE + x];
				if (cell === 0) c1++;
				else c2++;
				ctx.fillStyle = cell === 0 ? C.player1 : C.player2;
				ctx.fillRect(x * PIXEL_SIZE, y * PIXEL_SIZE, PIXEL_SIZE, PIXEL_SIZE);
			}
		}
		count1 = c1;
		count2 = c2;



		const ballRadius = PIXEL_SIZE * 0.4;

		for (let i = 0; i < 2; i++) {
			const b = balls[i];
			const bx = b.x * PIXEL_SIZE;
			const by = b.y * PIXEL_SIZE;

			ctx.fillStyle = i === 0 ? C.ball1 : C.ball2;
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
			const res = await fetch(`${base}/api/game-state`);
			if (!res.ok) throw new Error('Fetch failed');
			const data = await res.json();
			state = deserialize(data);
			startTick = data.tick;
			startTime = performance.now();
			viewers = data.viewers ?? 0;
			error = '';
			sendHeartbeat();
		} catch (e) {
			error = 'Disconnected — retrying...';
			setTimeout(resync, 2000);
		}
	}

	async function init() {
		try {
			const res = await fetch(`${base}/api/game-state`);
			if (!res.ok) throw new Error('Fetch failed');
			const data = await res.json();
			state = deserialize(data);
			startTick = data.tick;
			startTime = performance.now();
			viewers = data.viewers ?? 0;
			error = '';
			sendHeartbeat();
			rafId = requestAnimationFrame(loop);
		} catch (e) {
			error = 'Failed to connect — retrying...';
			setTimeout(init, 2000);
		}
	}

	let resuming = false;

	async function handleResume() {
		if (document.hidden || resuming || !state) return;
		resuming = true;
		if (rafId) cancelAnimationFrame(rafId);
		await resync();
		if (state && canvasEl) {
			rafId = requestAnimationFrame(loop);
		}
		resuming = false;
	}

	async function sendHeartbeat() {
		try {
			const res = await fetch(`${base}/api/heartbeat`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ sessionId })
			});
			const data = await res.json();
			viewers = data.viewers ?? viewers;
		} catch {
			/* silent */
		}
	}

	onMount(() => {
		init();
		heartbeatId = setInterval(sendHeartbeat, 10_000);
		document.addEventListener('visibilitychange', handleResume);
		window.addEventListener('focus', handleResume);
		return () => {
			if (rafId) cancelAnimationFrame(rafId);
			clearInterval(heartbeatId);
			document.removeEventListener('visibilitychange', handleResume);
			window.removeEventListener('focus', handleResume);
		};
	});
</script>

<div class="root">
	<div class="game-wrapper">
		<div class="counter side-left counter-p1">
			<span class="count-num">{count1}</span>
			<span class="count-pct">{((count1 / totalCells) * 100).toFixed(1)}%</span>
		</div>

		<div class="game-area">
			<canvas
				bind:this={canvasEl}
				width={GRID_SIZE * PIXEL_SIZE}
				height={GRID_SIZE * PIXEL_SIZE}
				class="pixelated"
			></canvas>
			<div class="counts-bar">
				<span class="bar-count bar-count-p1">{count1}</span>
				<span class="bar-pct">{((count1 / totalCells) * 100).toFixed(1)}%</span>
				<span class="bar-divider"></span>
				<span class="bar-count bar-count-p2">{count2}</span>
				<span class="bar-pct">{((count2 / totalCells) * 100).toFixed(1)}%</span>
			</div>
			<div class="viewer-count">
				&#128065; {viewers} watching
			</div>
		</div>

		<div class="counter side-right counter-p2">
			<span class="count-num">{count2}</span>
			<span class="count-pct">{((count2 / totalCells) * 100).toFixed(1)}%</span>
		</div>
	</div>

	{#if error}
		<div class="error-overlay">
			{error}
		</div>
	{/if}
</div>

<style>
.root {
	position: relative;
	display: flex;
	align-items: center;
	justify-content: center;
}

.game-wrapper {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 16px;
}

.game-area {
	display: flex;
	flex-direction: column;
	align-items: center;
}

.pixelated {
	image-rendering: pixelated;
	image-rendering: crisp-edges;
	max-width: calc(100vw - 200px);
	max-height: 95vmin;
}

.counter {
	display: flex;
	flex-direction: column;
	align-items: center;
	font-family: monospace;
	width: 80px;
	flex-shrink: 0;
}

.count-num {
	font-size: 2.2rem;
	font-weight: bold;
	text-shadow: 0 0 12px currentColor;
	line-height: 1;
}

.count-pct {
	font-size: 0.9rem;
	opacity: 0.7;
	margin-top: 4px;
}

.counter-p1,
.bar-count-p1 {
	color: #ff00e5;
}

.counter-p2,
.bar-count-p2 {
	color: #00ffe5;
}

.counts-bar {
	display: none;
}

.viewer-count {
	align-self: flex-end;
	font-family: monospace;
	font-size: 1.2rem;
	color: #666688;
	margin-top: 6px;
}

.error-overlay {
	position: absolute;
	inset: 0;
	display: flex;
	align-items: center;
	justify-content: center;
	background: rgba(0, 0, 0, 0.8);
	color: white;
}

@media (max-width: 640px) {
	.side-left,
	.side-right {
		display: none;
	}

	.game-wrapper {
		gap: 0;
	}

	.pixelated {
		max-width: 95vw;
		max-height: 75vh;
	}

	.counts-bar {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		padding: 8px 16px;
		font-family: monospace;
		font-size: 0.85rem;
	}

	.bar-count {
		font-weight: bold;
		text-shadow: 0 0 8px currentColor;
	}

	.bar-pct {
		opacity: 0.5;
		color: #8888aa;
		font-size: 0.75rem;
	}

	.bar-divider {
		width: 1px;
		height: 12px;
		background: #333366;
		margin: 0 6px;
	}
}
</style>
