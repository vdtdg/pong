import { json } from '@sveltejs/kit';
import { recordHeartbeat, getViewerCount } from '$lib/server/engine-manager.js';

export async function POST({ request }) {
	try {
		const { sessionId } = await request.json();
		if (sessionId) recordHeartbeat(sessionId);
	} catch {
		/* ignore malformed body */
	}
	return json({ viewers: getViewerCount() });
}
