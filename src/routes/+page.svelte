<script>
	import GameCanvas from '$lib/GameCanvas.svelte';
	import { COLORS } from '$lib/config.js';
</script>

<main
	class="flex min-h-dvh flex-col items-center justify-center"
	style="background: {COLORS.background}"
>
	<GameCanvas />
	<footer class="py-2">
		<a
			href="https://dtdg.fr"
			class="text-xs opacity-40 transition-opacity hover:opacity-70"
			style="color: {COLORS.ball1}"
		>
			made by vdtdg
		</a>
	</footer>
</main>
