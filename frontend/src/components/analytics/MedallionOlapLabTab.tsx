import type { Table } from "@perspective-dev/client";
import { PerspectiveViewer } from "@perspective-dev/react";
import type { ViewerConfigUpdate } from "@perspective-dev/viewer";
import {
	AlertTriangle,
	BarChart2,
	BookOpen,
	Database,
	Info,
	RefreshCw,
	RotateCcw,
	ShieldCheck,
	Table2,
} from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
	type DatasetManifestEntry,
	fetchActiveManifest,
	fetchDatasetArrowBuffer,
	type ReleaseManifest,
} from "../../api/analyticsLab";
import {
	OLAP_INSIGHT_PRESETS,
	type OlapInsightPreset,
} from "../../config/olapPresets";
import { useTheme } from "../../hooks/useTheme";
import { loadArrowTable, safeDeleteTable } from "../../lib/perspective";

function summarizeDominantReliability(counts?: Record<string, number>): string {
	if (!counts) return "unknown";
	if (Object.keys(counts).length === 0) return "insufficient_data";
	if ((counts.high ?? 0) > 0) return "high";
	if ((counts.medium ?? 0) > 0) return "medium";
	if ((counts.low ?? 0) > 0) return "low";
	return "insufficient_data";
}

function reliabilityBadgeClass(status: string): string {
	const s = status.toLowerCase();
	if (s === "high") {
		return "border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
	}
	if (s === "medium") {
		return "border-sky-500/40 bg-sky-500/15 text-sky-700 dark:text-sky-300";
	}
	if (s === "insufficient_data") {
		return "border-rose-500/40 bg-rose-500/15 text-rose-700 dark:text-rose-300";
	}
	return "border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-300";
}

interface PerspectiveViewportProps {
	releaseId: string;
	preset: OlapInsightPreset;
	enabled: boolean;
	perspectiveTheme: "Pro Dark" | "Pro Light";
}

const PerspectiveViewport: React.FC<PerspectiveViewportProps> = ({
	releaseId,
	preset,
	enabled,
	perspectiveTheme,
}) => {
	const [table, setTable] = useState<Table | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [viewMode, setViewMode] = useState<"preset" | "grid">("preset");
	const [baseConfig, setBaseConfig] = useState<ViewerConfigUpdate>(
		preset.defaultConfig,
	);
	const [rowCount, setRowCount] = useState<number | null>(null);
	const activeTableRef = useRef<Table | null>(null);
	const requestSeqRef = useRef(0);

	useEffect(() => {
		setViewMode("preset");
		setBaseConfig(preset.defaultConfig);
	}, [preset]);

	const loadDataset = useCallback(async () => {
		const reqId = ++requestSeqRef.current;

		await safeDeleteTable(activeTableRef.current);
		activeTableRef.current = null;
		setTable(null);
		setRowCount(null);

		if (!enabled) {
			setError(null);
			setLoading(false);
			return;
		}

		setLoading(true);
		setError(null);
		try {
			const buffer = await fetchDatasetArrowBuffer(
				releaseId,
				preset.datasetName,
			);
			if (requestSeqRef.current !== reqId) return;

			const tbl = await loadArrowTable(
				buffer,
				`${releaseId}:${preset.datasetName}`,
			);
			if (requestSeqRef.current !== reqId) {
				await safeDeleteTable(tbl);
				return;
			}

			const size = await tbl.size();
			if (requestSeqRef.current !== reqId) {
				await safeDeleteTable(tbl);
				return;
			}

			activeTableRef.current = tbl;
			setTable(tbl);
			setRowCount(size);
		} catch (err) {
			if (requestSeqRef.current === reqId) {
				const msg =
					err instanceof Error ? err.message : "Failed to load Arrow dataset.";
				setError(msg);
				setTable(null);
				setRowCount(null);
			}
		} finally {
			if (requestSeqRef.current === reqId) {
				setLoading(false);
			}
		}
	}, [releaseId, preset.datasetName, enabled]);

	useEffect(() => {
		void loadDataset();
		return () => {
			requestSeqRef.current += 1;
			const toDelete = activeTableRef.current;
			activeTableRef.current = null;
			setTable(null);
			void safeDeleteTable(toDelete);
		};
	}, [loadDataset]);

	const viewerConfig = useMemo<ViewerConfigUpdate>(
		() => ({
			...baseConfig,
			theme: perspectiveTheme,
		}),
		[baseConfig, perspectiveTheme],
	);

	const handleResetPreset = useCallback(() => {
		setViewMode("preset");
		setBaseConfig({ ...preset.defaultConfig });
	}, [preset.defaultConfig]);

	const handleToggleGrid = useCallback(() => {
		if (viewMode === "preset") {
			setViewMode("grid");
			setBaseConfig({ ...preset.gridFallbackConfig });
		} else {
			setViewMode("preset");
			setBaseConfig({ ...preset.defaultConfig });
		}
	}, [viewMode, preset]);

	return (
		<Card className="gap-0 py-0 overflow-hidden border-[var(--border-primary)] bg-[var(--bg-card)]">
			<div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b border-[var(--border-primary)] bg-[var(--bg-secondary)]">
				<div className="flex items-center gap-2.5 text-xs">
					<span className="font-mono font-semibold text-[var(--text-primary)]">
						{preset.datasetName}.arrow
					</span>
					{rowCount !== null && (
						<Badge variant="outline" className="text-[11px]">
							{rowCount} rows in WASM
						</Badge>
					)}
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={handleToggleGrid}
					>
						{viewMode === "preset" ? <Table2 /> : <BarChart2 />}
						{viewMode === "preset"
							? "Inspect Table Grid"
							: "Restore Chart Preset"}
					</Button>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={handleResetPreset}
					>
						<RotateCcw />
						Reset Preset
					</Button>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => void loadDataset()}
					>
						<RefreshCw />
						Reload
					</Button>
				</div>
			</div>

			<div className="relative w-full min-h-[520px] h-[calc(100vh-360px)]">
				{!enabled ? (
					<div className="flex h-full min-h-[360px] flex-col items-center justify-center gap-2 p-6 text-center text-sm text-[var(--text-secondary)]">
						<p className="font-semibold text-[var(--text-primary)]">
							Dataset disabled in current release contract
						</p>
						<p>
							Check <code>analytics/schema_contract.yml</code> for{" "}
							<code>{preset.datasetName}</code>.
						</p>
					</div>
				) : loading ? (
					<div className="flex h-full min-h-[360px] flex-col justify-center gap-3 p-6">
						<Skeleton className="h-8 w-56" />
						<Skeleton className="h-[360px] w-full rounded-xl" />
						<p className="text-center text-xs text-[var(--text-secondary)]">
							Loading {preset.datasetName} Arrow IPC stream into Perspective
							WASM…
						</p>
					</div>
				) : error ? (
					<div className="flex h-full min-h-[360px] flex-col items-center justify-center gap-3 p-6 text-center">
						<p className="font-semibold text-rose-500">
							Failed to load Perspective dataset
						</p>
						<p className="max-w-lg text-xs text-[var(--text-secondary)]">
							{error}
						</p>
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() => void loadDataset()}
						>
							<RefreshCw />
							Retry
						</Button>
					</div>
				) : rowCount === 0 ? (
					<div className="flex h-full min-h-[360px] flex-col items-center justify-center gap-2 p-6 text-center text-sm text-[var(--text-secondary)]">
						<p className="font-semibold text-[var(--text-primary)]">
							Empty mart (0 rows)
						</p>
						<p>
							No rows qualified for <code>{preset.datasetName}</code> in release{" "}
							<code>{releaseId}</code>.
						</p>
					</div>
				) : table ? (
					<div className="absolute inset-0">
						<PerspectiveViewer
							client={table}
							config={viewerConfig}
							className="h-full w-full block"
						/>
					</div>
				) : null}
			</div>
		</Card>
	);
};

export interface MedallionOlapLabTabProps {
	presetIds?: string[];
	title?: string;
	subtitle?: string;
	compact?: boolean;
}

export const MedallionOlapLabTab: React.FC<MedallionOlapLabTabProps> = ({
	presetIds,
	title = "Manga Deep Analytics — Medallion OLAP Lab",
	subtitle = "Bronze Parquet → DuckDB/dbt Silver & Gold → Apache Arrow IPC → Perspective WASM",
	compact = false,
}) => {
	const { theme } = useTheme();
	const perspectiveTheme = theme === "dark" ? "Pro Dark" : "Pro Light";

	const availablePresets = useMemo(() => {
		if (!presetIds || presetIds.length === 0) {
			return OLAP_INSIGHT_PRESETS;
		}
		const filtered = OLAP_INSIGHT_PRESETS.filter((p) =>
			presetIds.includes(p.id),
		);
		return filtered.length > 0 ? filtered : OLAP_INSIGHT_PRESETS;
	}, [presetIds]);

	const [manifest, setManifest] = useState<ReleaseManifest | null>(null);
	const [loadingManifest, setLoadingManifest] = useState(true);
	const [manifestError, setManifestError] = useState<string | null>(null);
	const [activePresetId, setActivePresetId] = useState<string>(
		availablePresets[0].id,
	);
	const [contractModalOpen, setContractModalOpen] = useState(false);

	useEffect(() => {
		if (!availablePresets.some((p) => p.id === activePresetId)) {
			setActivePresetId(availablePresets[0].id);
		}
	}, [availablePresets, activePresetId]);

	const loadManifest = useCallback(async () => {
		setLoadingManifest(true);
		setManifestError(null);
		try {
			const data = await fetchActiveManifest();
			setManifest(data);
		} catch (err) {
			setManifestError(
				err instanceof Error
					? err.message
					: "Could not load active Analytics Lab release manifest.",
			);
			setManifest(null);
		} finally {
			setLoadingManifest(false);
		}
	}, []);

	useEffect(() => {
		void loadManifest();
	}, [loadManifest]);

	const activePreset = useMemo(
		() =>
			availablePresets.find((p) => p.id === activePresetId) ??
			availablePresets[0],
		[availablePresets, activePresetId],
	);

	const activeDatasetMeta: DatasetManifestEntry | undefined =
		manifest?.datasets?.[activePreset.datasetName];
	const datasetEnabled = Boolean(activeDatasetMeta?.enabled);
	const dominantRel = summarizeDominantReliability(
		activeDatasetMeta?.reliability_counts,
	);

	return (
		<div className="space-y-4">
			{/* Top Medallion Release & Privacy Bar */}
			<Card className="border-[var(--border-primary)] bg-[var(--bg-card)]">
				<CardHeader className="pb-2">
					<div className="flex flex-wrap items-start justify-between gap-3">
						<div className="flex items-start gap-3">
							<div className="mt-0.5 rounded-lg bg-[var(--brand-orange)]/15 p-2 text-[var(--brand-orange)]">
								<Database size={18} />
							</div>
							<div>
								<CardTitle className="text-base font-bold text-[var(--text-primary)]">
									{title}
								</CardTitle>
								<CardDescription className="text-xs text-[var(--text-secondary)]">
									{subtitle}
								</CardDescription>
							</div>
						</div>
						<div className="flex flex-wrap items-center gap-2">
							{manifest && (
								<>
									<Badge variant="outline">
										Release: {manifest.release_id}
									</Badge>
									<Badge variant="outline">
										Snapshot: {manifest.snapshot_date}
									</Badge>
									<Badge variant="outline">
										Metrics v{manifest.metric_definition_version}
									</Badge>
								</>
							)}
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={() => void loadManifest()}
							>
								<RefreshCw />
								Refresh Release
							</Button>
						</div>
					</div>
				</CardHeader>
				{!compact && (
					<CardContent>
						<div className="flex items-center gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-800 dark:text-emerald-200">
							<ShieldCheck size={15} className="shrink-0" />
							<span>
								Privacy Guard: Browser WASM loads curated aggregate Arrow marts
								only. Raw personal review prose, external review text, and OCR
								dialogue are excluded from default exports.
							</span>
						</div>
					</CardContent>
				)}
			</Card>

			{/* Insight Mart Sub-tabs */}
			{availablePresets.length > 1 && (
				<nav
					aria-label="Medallion Insight Marts"
					className="flex gap-1.5 overflow-x-auto pb-1"
				>
					{availablePresets.map((preset) => {
						const isSelected = preset.id === activePreset.id;
						return (
							<Button
								key={preset.id}
								type="button"
								size="sm"
								variant={isSelected ? "default" : "outline"}
								onClick={() => setActivePresetId(preset.id)}
								className={
									isSelected
										? "bg-[var(--brand-orange)] text-white hover:bg-[var(--brand-coral)] shrink-0"
										: "shrink-0"
								}
							>
								{preset.tabLabel}
							</Button>
						);
					})}
				</nav>
			)}

			{loadingManifest ? (
				<Card className="border-[var(--border-primary)] bg-[var(--bg-card)]">
					<CardContent className="space-y-3 py-6">
						<Skeleton className="h-6 w-72" />
						<Skeleton className="h-4 w-full max-w-2xl" />
						<Skeleton className="h-[460px] w-full rounded-xl" />
					</CardContent>
				</Card>
			) : manifestError || !manifest ? (
				<Card className="border-rose-500/30 bg-rose-500/5">
					<CardContent className="flex flex-col items-center justify-center gap-3 py-10 text-center">
						<p className="font-semibold text-rose-500">
							No published Analytics Lab release available
						</p>
						<p className="max-w-xl text-xs text-[var(--text-secondary)]">
							{manifestError}
						</p>
						<code className="rounded bg-[var(--bg-secondary)] px-3 py-1.5 text-xs text-[var(--text-primary)]">
							uv run --project analytics python -m
							analytics.scripts.run_pipeline --allow-existing-uri
						</code>
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() => void loadManifest()}
						>
							<RefreshCw />
							Retry
						</Button>
					</CardContent>
				</Card>
			) : (
				<>
					{/* Curated Insight Header & Statistical Caveats */}
					<Card className="border-[var(--border-primary)] bg-[var(--bg-card)]">
						<CardContent className="flex flex-wrap items-start justify-between gap-4 py-4">
							<div className="min-w-0 flex-1 space-y-1.5">
								<div className="flex flex-wrap items-center gap-2">
									<h2 className="text-base font-bold text-[var(--text-primary)]">
										{activePreset.title}
									</h2>
									<Badge
										variant="outline"
										className={reliabilityBadgeClass(dominantRel)}
									>
										Reliability: {dominantRel.replace(/_/g, " ")}
									</Badge>
									<Badge variant="outline">
										n = {activeDatasetMeta?.rows ?? 0} rows
									</Badge>
								</div>
								<p className="text-sm text-[var(--text-primary)]">
									{activePreset.question}
								</p>
								<p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300">
									<AlertTriangle size={14} className="mt-0.5 shrink-0" />
									<span>{activePreset.caveats}</span>
								</p>
							</div>

							<div className="flex flex-wrap items-center gap-2">
								{activeDatasetMeta?.reliability_counts && (
									<Badge variant="outline" className="text-[11px]">
										high: {activeDatasetMeta.reliability_counts.high ?? 0} ·
										med: {activeDatasetMeta.reliability_counts.medium ?? 0} ·
										low: {activeDatasetMeta.reliability_counts.low ?? 0} ·
										insuff:{" "}
										{activeDatasetMeta.reliability_counts.insufficient_data ??
											0}
									</Badge>
								)}
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={() => setContractModalOpen(true)}
								>
									<Info />
									Metric Contract
								</Button>
							</div>
						</CardContent>
					</Card>

					<PerspectiveViewport
						releaseId={manifest.release_id}
						preset={activePreset}
						enabled={datasetEnabled}
						perspectiveTheme={perspectiveTheme}
					/>

					<Dialog open={contractModalOpen} onOpenChange={setContractModalOpen}>
						<DialogContent className="max-w-xl bg-[var(--bg-card)] text-[var(--text-primary)] border-[var(--border-primary)]">
							<DialogHeader>
								<DialogTitle className="flex items-center gap-2">
									<BookOpen size={18} />
									Metric Contract: {activePreset.datasetName}
								</DialogTitle>
								<DialogDescription>
									Curated Gold Mart metadata, grain, and cryptographic digest.
								</DialogDescription>
							</DialogHeader>
							<dl className="grid grid-cols-1 sm:grid-cols-[130px_1fr] gap-2.5 text-xs">
								<dt className="font-semibold text-[var(--text-secondary)]">
									Row Grain
								</dt>
								<dd>{activeDatasetMeta?.grain ?? "Curated Gold Mart"}</dd>

								<dt className="font-semibold text-[var(--text-secondary)]">
									Denominator
								</dt>
								<dd>{activePreset.denominatorDesc}</dd>

								<dt className="font-semibold text-[var(--text-secondary)]">
									Formula / Rules
								</dt>
								<dd>{activePreset.formulaNotes}</dd>

								<dt className="font-semibold text-[var(--text-secondary)]">
									Caveats
								</dt>
								<dd>{activePreset.caveats}</dd>

								<dt className="font-semibold text-[var(--text-secondary)]">
									Rows / Size
								</dt>
								<dd>
									{activeDatasetMeta?.rows ?? "—"} rows ·{" "}
									{activeDatasetMeta?.bytes
										? `${(activeDatasetMeta.bytes / 1024).toFixed(1)} KB`
										: "—"}{" "}
									(Arrow IPC stream)
								</dd>

								<dt className="font-semibold text-[var(--text-secondary)]">
									SHA-256
								</dt>
								<dd className="font-mono text-[11px] break-all">
									{activeDatasetMeta?.sha256 ?? "—"}
								</dd>
							</dl>
						</DialogContent>
					</Dialog>
				</>
			)}
		</div>
	);
};

export default MedallionOlapLabTab;
