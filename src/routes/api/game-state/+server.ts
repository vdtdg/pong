import { json } from '@sveltejs/kit';
import { getSerializedState, getViewerCount } from '$lib/server/engine-manager.js';

export function GET() {
	const data = getSerializedState();
	return json({ ...data, viewers: getViewerCount() });
}
