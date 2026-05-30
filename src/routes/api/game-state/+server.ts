import { json } from '@sveltejs/kit';
import { getSerializedState } from '$lib/server/engine-manager.js';

export function GET() {
	const data = getSerializedState();
	return json(data);
}
