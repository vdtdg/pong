<script>
	import { base } from '$app/paths';
	import './layout.css';

	let { children } = $props();
</script>

<svelte:head>
	<title>Pong Battle</title>
	<meta name="description" content="Watch two autonomous balls fight for territory in a deterministic pixel-art tug-of-war." />
	<meta property="og:title" content="Pong Battle" />
	<meta property="og:description" content="Watch two autonomous balls fight for territory in a deterministic pixel-art tug-of-war." />
	<meta property="og:type" content="website" />
	<link rel="icon" href="{base}/favicon.svg" />
</svelte:head>

{@render children()}
