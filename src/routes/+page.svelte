<script>
	import GameCanvas from '$lib/GameCanvas.svelte';
	import { COLORS } from '$lib/config.js';
</script>

<main
	class="flex min-h-dvh items-center justify-center"
	style="background: {COLORS.background}"
>
	<GameCanvas />
</main>
