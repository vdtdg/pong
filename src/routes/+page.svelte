<script>
	import GameCanvas from '$lib/GameCanvas.svelte';
</script>

<main class="page-main">
	<GameCanvas />
	<footer class="page-footer">
		<a href="https://dtdg.fr" class="footer-link">
			made by vdtdg
		</a>
	</footer>
</main>

<style>
	.page-main {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 100dvh;
		background: #0a0a1a;
	}

	.page-footer {
		padding: 0.5rem 0;
	}

	.footer-link {
		font-size: 0.75rem;
		color: #ffffff;
		opacity: 0.4;
		text-decoration: none;
		transition: opacity 0.2s;
	}

	.footer-link:hover {
		opacity: 0.7;
	}
</style>
