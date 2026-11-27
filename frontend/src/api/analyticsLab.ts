export interface DatasetSchemaField {
	name: string;
	type: string;
}

export interface DatasetManifestEntry {
	name: string;
	enabled: boolean;
	relative_path?: string;
	rows?: number;
	bytes?: number;
	sha256?: string;
	mime_type?: string;
	schema?: DatasetSchemaField[];
	grain: string;
	description: string;
	max_rows?: number;
	max_bytes?: number;
	reliability_counts?: Record<string, number>;
}

export interface ReleaseManifest {
	release_id: string;
	created_at: string;
	snapshot_date: string;
	pipeline_version: string;
	min_ui_version: string;
	metric_definition_version: string;
	git_commit?: string | null;
	status: string;
	data_classification: string;
	privacy_notice: string;
	source_summary: Record<
		string,
		{ snapshot_date: string; document_count: number }
	>;
	datasets: Record<string, DatasetManifestEntry>;
}

export class AnalyticsLabApiError extends Error {
	statusCode: number;
	constructor(message: string, statusCode: number) {
		super(message);
		this.name = "AnalyticsLabApiError";
		this.statusCode = statusCode;
	}
}

export async function fetchActiveManifest(): Promise<ReleaseManifest> {
	const resp = await fetch("/api/analytics-lab/manifest", {
		headers: { Accept: "application/json" },
	});
	if (!resp.ok) {
		const text = await resp.text().catch(() => "");
		throw new AnalyticsLabApiError(
			text || `Failed to load Analytics Lab manifest (${resp.status})`,
			resp.status,
		);
	}
	return (await resp.json()) as ReleaseManifest;
}

export async function fetchDatasetArrowBuffer(
	releaseId: string,
	datasetName: string,
): Promise<ArrayBuffer> {
	const safeRelease = encodeURIComponent(releaseId);
	const safeDataset = encodeURIComponent(datasetName);
	const resp = await fetch(
		`/api/analytics-lab/releases/${safeRelease}/datasets/${safeDataset}.arrow`,
	);
	if (!resp.ok) {
		const text = await resp.text().catch(() => "");
		throw new AnalyticsLabApiError(
			text ||
				`Failed to fetch Arrow stream for ${datasetName} (${resp.status})`,
			resp.status,
		);
	}
	const buf = await resp.arrayBuffer();
	if (buf.byteLength === 0) {
		throw new Error(`Received empty Arrow IPC stream for ${datasetName}.`);
	}
	return buf;
}
