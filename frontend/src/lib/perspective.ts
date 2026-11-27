import perspective, { type Client, type Table } from "@perspective-dev/client";
import SERVER_WASM from "@perspective-dev/server/dist/wasm/perspective-server.wasm?url";
import perspectiveViewer from "@perspective-dev/viewer";
import CLIENT_WASM from "@perspective-dev/viewer/dist/wasm/perspective-viewer.wasm?url";
import "@perspective-dev/viewer/themes/pro.css";
import "@perspective-dev/viewer/themes/pro-dark.css";
import "@perspective-dev/viewer-datagrid";
import "@perspective-dev/viewer-charts";

let bootstrapPromise: Promise<Client> | null = null;
let tableSequence = 0;

/**
 * Initializes Perspective WASM binaries and WebWorker once per browser session.
 */
export function getPerspectiveClient(): Promise<Client> {
	if (!bootstrapPromise) {
		bootstrapPromise = (async () => {
			await perspectiveViewer.init({
				server: () => fetch(SERVER_WASM),
				viewer: () => fetch(CLIENT_WASM),
			});
			return await perspective.worker();
		})().catch((err) => {
			bootstrapPromise = null;
			throw err instanceof Error ? err : new Error(String(err));
		});
	}
	return bootstrapPromise;
}

export async function loadArrowTable(
	buffer: ArrayBuffer,
	tablePrefix: string,
): Promise<Table> {
	const client = await getPerspectiveClient();
	const uniqueName = `${tablePrefix}#${++tableSequence}`;
	return await client.table(buffer, { name: uniqueName });
}

export async function safeDeleteTable(table: Table | null): Promise<void> {
	if (!table) return;
	try {
		await table.delete({ lazy: true });
	} catch {
		// Ignore cleanup errors if worker already recycled the table
	}
}
