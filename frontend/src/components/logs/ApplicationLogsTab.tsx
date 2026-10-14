import {
	AlertCircle,
	AlertTriangle,
	Check,
	ChevronLeft,
	ChevronRight,
	ChevronsLeft,
	ChevronsRight,
	Copy,
	Database,
	Eye,
	FileText,
	Filter,
	Radio,
	RefreshCw,
	Search,
	Server,
	ShieldAlert,
	Terminal,
	X,
} from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useState } from "react";
import client from "../../api/client";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "../ui/dialog";
import { Skeleton } from "../ui/skeleton";

export interface SystemLogItem {
	id: string;
	timestamp: string | null;
	level: string;
	logger: string | null;
	message: string;
	service_name: string | null;
	trace_id: string | null;
	task_id: string | null;
	job_id: string | null;
	manga_id: string | null;
	chapter_id: string | null;
	stage: string | null;
	http_method: string | null;
	http_status: number | null;
	url_path: string | null;
	duration_ms: number | null;
	error_type: string | null;
	error_message: string | null;
	error_stack_trace: string | null;
	raw?: Record<string, unknown> | null;
}

interface SystemLogStats {
	total_logs: number;
	error_count: number;
	warning_count: number;
	by_service: Record<string, number>;
	by_level: Record<string, number>;
	source_engine: string;
}

export const ApplicationLogsTab: React.FC = () => {
	// Data states
	const [logs, setLogs] = useState<SystemLogItem[]>([]);
	const [stats, setStats] = useState<SystemLogStats | null>(null);
	const [sourceEngine, setSourceEngine] = useState<string>("local_ndjson");
	const [loading, setLoading] = useState(true);
	const [statsLoading, setStatsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	// Pagination
	const [total, setTotal] = useState(0);
	const [page, setPage] = useState(1);
	const [pageSize] = useState(25);

	// Filters
	const [searchTerm, setSearchTerm] = useState("");
	const [debouncedSearch, setDebouncedSearch] = useState("");
	const [selectedService, setSelectedService] = useState<string>("all");
	const [selectedLevel, setSelectedLevel] = useState<string>("all");
	const [activeTraceId, setActiveTraceId] = useState<string | null>(null);

	// Detail Modal
	const [selectedLog, setSelectedLog] = useState<SystemLogItem | null>(null);
	const [copiedField, setCopiedField] = useState<string | null>(null);

	// Search Debounce
	useEffect(() => {
		const timer = setTimeout(() => {
			setDebouncedSearch(searchTerm.trim());
			setPage(1);
		}, 300);
		return () => clearTimeout(timer);
	}, [searchTerm]);

	// Fetch Stats
	const fetchStats = useCallback(async () => {
		try {
			setStatsLoading(true);
			const res = await client.get("/api/system-logs/stats");
			setStats(res.data);
		} catch (err) {
			console.error("Failed to fetch system log stats:", err);
		} finally {
			setStatsLoading(false);
		}
	}, []);

	// Fetch Logs
	const fetchLogs = useCallback(async () => {
		try {
			setLoading(true);
			setError(null);
			const params: Record<string, unknown> = {
				skip: (page - 1) * pageSize,
				limit: pageSize,
			};

			if (debouncedSearch) {
				params.search = debouncedSearch;
			}
			if (selectedService !== "all") {
				params.service_name = selectedService;
			}
			if (selectedLevel !== "all") {
				params.level = selectedLevel;
			}
			if (activeTraceId) {
				params.trace_id = activeTraceId;
			}

			const res = await client.get("/api/system-logs", { params });
			setLogs(res.data?.items || []);
			setTotal(res.data?.total || 0);
			setSourceEngine(res.data?.source_engine || "local_ndjson");
		} catch (err) {
			console.error("Failed to fetch system logs:", err);
			setError("Không thể tải danh sách nhật ký hệ thống. Vui lòng thử lại.");
		} finally {
			setLoading(false);
		}
	}, [
		page,
		pageSize,
		debouncedSearch,
		selectedService,
		selectedLevel,
		activeTraceId,
	]);

	useEffect(() => {
		fetchStats();
	}, [fetchStats]);

	useEffect(() => {
		fetchLogs();
	}, [fetchLogs]);

	const copyToClipboard = (text: string, label: string) => {
		navigator.clipboard.writeText(text);
		setCopiedField(label);
		setTimeout(() => setCopiedField(null), 2000);
	};

	const resetFilters = () => {
		setSearchTerm("");
		setSelectedService("all");
		setSelectedLevel("all");
		setActiveTraceId(null);
		setPage(1);
	};

	const totalPages = Math.max(1, Math.ceil(total / pageSize));

	const getLevelBadgeClass = (level: string) => {
		switch (level.toLowerCase()) {
			case "critical":
				return "bg-rose-500/15 text-rose-500 border-rose-500/30 font-semibold";
			case "error":
				return "bg-red-500/15 text-red-500 border-red-500/30 font-semibold";
			case "warning":
				return "bg-amber-500/15 text-amber-500 border-amber-500/30 font-semibold";
			case "info":
				return "bg-sky-500/15 text-sky-500 border-sky-500/30";
			case "debug":
				return "bg-slate-500/15 text-slate-400 border-slate-500/30";
			default:
				return "bg-muted text-muted-foreground border-border";
		}
	};

	const getServiceBadgeClass = (service: string | null) => {
		switch (service) {
			case "api":
				return "bg-indigo-500/10 text-indigo-400 border-indigo-500/20";
			case "worker_ocr":
				return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
			case "worker_translation":
				return "bg-purple-500/10 text-purple-400 border-purple-500/20";
			case "smoke":
				return "bg-amber-500/10 text-amber-400 border-amber-500/20";
			default:
				return "bg-muted text-muted-foreground border-border";
		}
	};

	return (
		<div className="space-y-6">
			{/* KPI Cards Header */}
			<div className="grid grid-cols-2 md:grid-cols-4 gap-4">
				<Card className="bg-card/60 backdrop-blur-sm border-border/60">
					<CardContent className="p-4 flex items-center justify-between">
						<div>
							<p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
								Tổng Nhật Ký
							</p>
							{statsLoading ? (
								<Skeleton className="h-8 w-20 mt-1" />
							) : (
								<p className="text-2xl font-bold mt-1 text-foreground">
									{stats?.total_logs?.toLocaleString() ??
										total.toLocaleString()}
								</p>
							)}
						</div>
						<div className="p-2.5 rounded-xl bg-primary/10 text-primary">
							<Terminal className="w-5 h-5" />
						</div>
					</CardContent>
				</Card>

				<Card className="bg-card/60 backdrop-blur-sm border-border/60">
					<CardContent className="p-4 flex items-center justify-between">
						<div>
							<p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
								Lỗi & Nghiêm Trọng
							</p>
							{statsLoading ? (
								<Skeleton className="h-8 w-16 mt-1" />
							) : (
								<p className="text-2xl font-bold mt-1 text-rose-500">
									{stats?.error_count ?? 0}
								</p>
							)}
						</div>
						<div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-500">
							<ShieldAlert className="w-5 h-5" />
						</div>
					</CardContent>
				</Card>

				<Card className="bg-card/60 backdrop-blur-sm border-border/60">
					<CardContent className="p-4 flex items-center justify-between">
						<div>
							<p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
								Cảnh Báo (Warning)
							</p>
							{statsLoading ? (
								<Skeleton className="h-8 w-16 mt-1" />
							) : (
								<p className="text-2xl font-bold mt-1 text-amber-500">
									{stats?.warning_count ?? 0}
								</p>
							)}
						</div>
						<div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-500">
							<AlertTriangle className="w-5 h-5" />
						</div>
					</CardContent>
				</Card>

				<Card className="bg-card/60 backdrop-blur-sm border-border/60">
					<CardContent className="p-4 flex items-center justify-between">
						<div>
							<p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
								Nguồn Dữ Liệu
							</p>
							<div className="mt-2">
								{sourceEngine === "elasticsearch" ? (
									<Badge
										variant="outline"
										className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30 gap-1.5"
									>
										<span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
										Elasticsearch Stream
									</Badge>
								) : (
									<Badge
										variant="outline"
										className="bg-amber-500/10 text-amber-500 border-amber-500/30 gap-1.5"
									>
										<Database className="w-3 h-3" />
										Local NDJSON Fallback
									</Badge>
								)}
							</div>
						</div>
						<div className="p-2.5 rounded-xl bg-muted text-muted-foreground">
							<Server className="w-5 h-5" />
						</div>
					</CardContent>
				</Card>
			</div>

			{/* Filter Toolbar */}
			<div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between bg-card/40 p-4 rounded-xl border border-border/60">
				{/* Search Box */}
				<div className="relative flex-1 min-w-[240px]">
					<Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
					<input
						type="text"
						value={searchTerm}
						onChange={(e) => setSearchTerm(e.target.value)}
						placeholder="Tìm kiếm theo thông điệp, logger, lỗi, đường dẫn URL..."
						className="w-full pl-9 pr-8 py-2 text-sm bg-background/80 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/40 text-foreground placeholder:text-muted-foreground"
					/>
					{searchTerm && (
						<button
							type="button"
							onClick={() => setSearchTerm("")}
							className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
						>
							<X className="w-4 h-4" />
						</button>
					)}
				</div>

				{/* Dropdown Filters */}
				<div className="flex flex-wrap items-center gap-2.5">
					{/* Service Filter */}
					<select
						value={selectedService}
						onChange={(e) => {
							setSelectedService(e.target.value);
							setPage(1);
						}}
						className="px-3 py-2 text-sm bg-background/80 border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
					>
						<option value="all">Mọi Tiến Trình (All Services)</option>
						<option value="api">FastAPI (api)</option>
						<option value="worker_ocr">ARQ OCR Worker (worker_ocr)</option>
						<option value="worker_translation">Translation Worker</option>
						<option value="smoke">Smoke Test</option>
					</select>

					{/* Level Filter */}
					<select
						value={selectedLevel}
						onChange={(e) => {
							setSelectedLevel(e.target.value);
							setPage(1);
						}}
						className="px-3 py-2 text-sm bg-background/80 border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
					>
						<option value="all">Mọi Mức Độ (All Levels)</option>
						<option value="info">INFO</option>
						<option value="warning">WARNING</option>
						<option value="error">ERROR</option>
						<option value="critical">CRITICAL</option>
						<option value="debug">DEBUG</option>
					</select>

					{/* Refresh Button */}
					<Button
						variant="outline"
						size="sm"
						onClick={() => {
							fetchLogs();
							fetchStats();
						}}
						disabled={loading}
						className="gap-1.5"
					>
						<RefreshCw
							className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`}
						/>
						Làm mới
					</Button>
				</div>
			</div>

			{/* Active Trace ID Banner */}
			{activeTraceId && (
				<div className="flex items-center justify-between px-4 py-2.5 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 text-sm">
					<div className="flex items-center gap-2 truncate">
						<Radio className="w-4 h-4 shrink-0 text-indigo-400 animate-pulse" />
						<span>
							Đang gom toàn bộ nhật ký theo Trace ID:{" "}
							<code className="px-1.5 py-0.5 rounded bg-indigo-950/60 font-mono text-xs">
								{activeTraceId}
							</code>
						</span>
					</div>
					<Button
						variant="ghost"
						size="sm"
						onClick={() => setActiveTraceId(null)}
						className="h-7 px-2 text-xs text-indigo-300 hover:text-white hover:bg-indigo-500/20"
					>
						<X className="w-3.5 h-3.5 mr-1" />
						Bỏ lọc Trace ID
					</Button>
				</div>
			)}

			{/* Main Content Area */}
			{loading && logs.length === 0 ? (
				<div className="space-y-3">
					{[...Array(6)].map((_, i) => (
						<Skeleton key={i} className="h-16 w-full rounded-xl" />
					))}
				</div>
			) : error ? (
				<Card className="border-rose-500/30 bg-rose-500/5 p-8 text-center">
					<AlertCircle className="w-10 h-10 text-rose-500 mx-auto mb-3" />
					<h3 className="text-base font-semibold text-foreground mb-1">
						Không thể tải dữ liệu
					</h3>
					<p className="text-sm text-muted-foreground mb-4">{error}</p>
					<Button
						variant="outline"
						onClick={fetchLogs}
						className="gap-2 mx-auto"
					>
						<RefreshCw className="w-4 h-4" />
						Thử lại
					</Button>
				</Card>
			) : logs.length === 0 ? (
				<Card className="border-dashed border-border/80 bg-card/30 p-12 text-center">
					<Terminal className="w-12 h-12 text-muted-foreground/60 mx-auto mb-3" />
					<h3 className="text-base font-semibold text-foreground mb-1">
						Không tìm thấy bản ghi log nào
					</h3>
					<p className="text-sm text-muted-foreground max-w-md mx-auto mb-4">
						Không có log nào khớp với các bộ lọc hiện tại hoặc thư mục logs chưa
						có dữ liệu mới.
					</p>
					<Button
						variant="outline"
						onClick={resetFilters}
						className="gap-2 mx-auto"
					>
						<Filter className="w-4 h-4" />
						Đặt lại bộ lọc
					</Button>
				</Card>
			) : (
				<div className="rounded-xl border border-border/70 overflow-hidden bg-card/60 backdrop-blur-sm">
					<div className="overflow-x-auto">
						<table className="w-full text-left text-sm">
							<thead className="bg-muted/60 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border/60">
								<tr>
									<th className="py-3 px-4 w-[160px]">Thời Gian</th>
									<th className="py-3 px-3 w-[110px]">Tiến Trình</th>
									<th className="py-3 px-3 w-[90px]">Mức Độ</th>
									<th className="py-3 px-4">Thông Điệp & Ngữ Cảnh</th>
									<th className="py-3 px-3 w-[140px]">Trace ID</th>
									<th className="py-3 px-3 w-[80px] text-right">Chi Tiết</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-border/40 font-mono text-xs">
								{logs.map((log) => (
									<tr
										key={log.id}
										className="hover:bg-muted/40 transition-colors group"
									>
										{/* Timestamp */}
										<td className="py-2.5 px-4 text-muted-foreground whitespace-nowrap">
											{log.timestamp
												? new Date(log.timestamp).toLocaleTimeString("vi-VN", {
														hour12: false,
														hour: "2-digit",
														minute: "2-digit",
														second: "2-digit",
														fractionalSecondDigits: 3,
													})
												: "-"}
										</td>

										{/* Service */}
										<td className="py-2.5 px-3">
											<Badge
												variant="outline"
												className={`text-[11px] font-medium ${getServiceBadgeClass(log.service_name)}`}
											>
												{log.service_name || "unknown"}
											</Badge>
										</td>

										{/* Level */}
										<td className="py-2.5 px-3">
											<Badge
												variant="outline"
												className={`text-[11px] uppercase ${getLevelBadgeClass(log.level)}`}
											>
												{log.level}
											</Badge>
										</td>

										{/* Message */}
										<td className="py-2.5 px-4 font-sans text-xs">
											<div className="flex items-center gap-2 flex-wrap">
												{/* HTTP method & status */}
												{log.http_method && (
													<span className="font-mono text-[11px] font-semibold text-primary px-1.5 py-0.5 rounded bg-primary/10">
														{log.http_method}
													</span>
												)}
												{log.http_status && (
													<span
														className={`font-mono text-[11px] font-semibold px-1.5 py-0.5 rounded ${
															log.http_status >= 500
																? "bg-rose-500/15 text-rose-400"
																: log.http_status >= 400
																	? "bg-amber-500/15 text-amber-400"
																	: "bg-emerald-500/15 text-emerald-400"
														}`}
													>
														{log.http_status}
													</span>
												)}
												{log.duration_ms !== null &&
													log.duration_ms !== undefined && (
														<span className="font-mono text-[10px] text-muted-foreground">
															{log.duration_ms}ms
														</span>
													)}
												{log.stage && (
													<Badge
														variant="outline"
														className="text-[10px] bg-purple-500/10 text-purple-400 border-purple-500/20"
													>
														stage: {log.stage}
													</Badge>
												)}
												<span className="text-foreground/90 break-all font-mono text-[11px]">
													{log.message}
												</span>
											</div>
											{log.error_message && (
												<p className="mt-1 text-rose-400 text-[11px] font-mono truncate max-w-2xl">
													⚠ {log.error_type ? `${log.error_type}: ` : ""}
													{log.error_message}
												</p>
											)}
										</td>

										{/* Trace ID */}
										<td className="py-2.5 px-3">
											{log.trace_id ? (
												<button
													type="button"
													onClick={() => setActiveTraceId(log.trace_id)}
													title="Nhấn để gom toàn bộ log của trace này"
													className="text-[11px] font-mono text-indigo-400 hover:text-indigo-300 underline decoration-dotted truncate max-w-[120px] block"
												>
													{log.trace_id.slice(0, 8)}...
												</button>
											) : (
												<span className="text-muted-foreground/40">-</span>
											)}
										</td>

										{/* Details Action */}
										<td className="py-2.5 px-3 text-right">
											<Button
												variant="ghost"
												size="sm"
												onClick={() => setSelectedLog(log)}
												className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
											>
												<Eye className="w-3.5 h-3.5" />
												<span className="sr-only">Xem chi tiết</span>
											</Button>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>

					{/* Pagination Footer */}
					<div className="flex flex-col sm:flex-row items-center justify-between px-4 py-3 border-t border-border/60 text-xs text-muted-foreground gap-3">
						<div>
							Hiển thị{" "}
							<span className="font-medium text-foreground">
								{total === 0 ? 0 : (page - 1) * pageSize + 1}
							</span>{" "}
							-{" "}
							<span className="font-medium text-foreground">
								{Math.min(page * pageSize, total)}
							</span>{" "}
							trên tổng số{" "}
							<span className="font-medium text-foreground">
								{total.toLocaleString()}
							</span>{" "}
							bản ghi
						</div>

						<div className="flex items-center gap-1.5">
							<Button
								variant="outline"
								size="sm"
								onClick={() => setPage(1)}
								disabled={page <= 1 || loading}
								className="h-7 w-7 p-0"
							>
								<ChevronsLeft className="w-3.5 h-3.5" />
								<span className="sr-only">Trang đầu</span>
							</Button>
							<Button
								variant="outline"
								size="sm"
								onClick={() => setPage((p) => Math.max(1, p - 1))}
								disabled={page <= 1 || loading}
								className="h-7 w-7 p-0"
							>
								<ChevronLeft className="w-3.5 h-3.5" />
								<span className="sr-only">Trang trước</span>
							</Button>

							<span className="px-2 font-medium text-foreground">
								Trang {page} / {totalPages}
							</span>

							<Button
								variant="outline"
								size="sm"
								onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
								disabled={page >= totalPages || loading}
								className="h-7 w-7 p-0"
							>
								<ChevronRight className="w-3.5 h-3.5" />
								<span className="sr-only">Trang sau</span>
							</Button>
							<Button
								variant="outline"
								size="sm"
								onClick={() => setPage(totalPages)}
								disabled={page >= totalPages || loading}
								className="h-7 w-7 p-0"
							>
								<ChevronsRight className="w-3.5 h-3.5" />
								<span className="sr-only">Trang cuối</span>
							</Button>
						</div>
					</div>
				</div>
			)}

			{/* Detail & Stack Trace Modal */}
			<Dialog
				open={!!selectedLog}
				onOpenChange={(open) => !open && setSelectedLog(null)}
			>
				<DialogContent className="max-w-3xl max-h-[85vh] flex flex-col p-6">
					<DialogHeader>
						<div className="flex items-center gap-2">
							<Badge
								variant="outline"
								className={`uppercase ${selectedLog ? getLevelBadgeClass(selectedLog.level) : ""}`}
							>
								{selectedLog?.level}
							</Badge>
							<Badge
								variant="outline"
								className={getServiceBadgeClass(
									selectedLog?.service_name || null,
								)}
							>
								{selectedLog?.service_name || "unknown"}
							</Badge>
							<DialogTitle className="text-base truncate font-mono">
								{selectedLog?.message || "Chi tiết bản ghi nhật ký"}
							</DialogTitle>
						</div>
						<DialogDescription className="text-xs font-mono text-muted-foreground mt-1">
							{selectedLog?.timestamp
								? new Date(selectedLog.timestamp).toISOString()
								: ""}
						</DialogDescription>
					</DialogHeader>

					<div className="flex-1 overflow-y-auto space-y-4 pr-1 mt-2">
						{/* Context Identifiers */}
						<div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-muted/30 p-3 rounded-lg border border-border/50">
							<div>
								<span className="text-muted-foreground">Trace ID: </span>
								<code className="text-primary font-mono select-all">
									{selectedLog?.trace_id || "N/A"}
								</code>
							</div>
							<div>
								<span className="text-muted-foreground">Logger: </span>
								<code className="text-foreground font-mono">
									{selectedLog?.logger || "N/A"}
								</code>
							</div>
							{selectedLog?.task_id && (
								<div>
									<span className="text-muted-foreground">Task ID: </span>
									<code className="font-mono text-foreground">
										{selectedLog.task_id}
									</code>
								</div>
							)}
							{selectedLog?.job_id && (
								<div>
									<span className="text-muted-foreground">Job ID: </span>
									<code className="font-mono text-foreground">
										{selectedLog.job_id}
									</code>
								</div>
							)}
							{selectedLog?.stage && (
								<div>
									<span className="text-muted-foreground">
										Pipeline Stage:{" "}
									</span>
									<span className="font-semibold text-purple-400">
										{selectedLog.stage}
									</span>
								</div>
							)}
							{selectedLog?.duration_ms !== null &&
								selectedLog?.duration_ms !== undefined && (
									<div>
										<span className="text-muted-foreground">
											Độ trễ xử lý:{" "}
										</span>
										<span className="font-mono text-foreground font-medium">
											{selectedLog.duration_ms} ms
										</span>
									</div>
								)}
						</div>

						{/* Stack Trace (if present) */}
						{selectedLog?.error_stack_trace && (
							<div>
								<div className="flex items-center justify-between mb-1.5">
									<h4 className="text-xs font-semibold text-rose-400 flex items-center gap-1.5">
										<AlertCircle className="w-3.5 h-3.5" />
										Error Stack Trace
									</h4>
									<Button
										variant="ghost"
										size="sm"
										onClick={() =>
											selectedLog.error_stack_trace &&
											copyToClipboard(selectedLog.error_stack_trace, "stack")
										}
										className="h-6 px-2 text-[11px] gap-1"
									>
										{copiedField === "stack" ? (
											<Check className="w-3 h-3 text-emerald-500" />
										) : (
											<Copy className="w-3 h-3" />
										)}
										Sao chép Stack Trace
									</Button>
								</div>
								<pre className="p-3 rounded-lg bg-rose-950/20 border border-rose-500/30 text-rose-300 font-mono text-[11px] overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-60">
									{selectedLog.error_stack_trace}
								</pre>
							</div>
						)}

						{/* Full Raw ECS JSON */}
						<div>
							<div className="flex items-center justify-between mb-1.5">
								<h4 className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
									<FileText className="w-3.5 h-3.5" />
									Raw ECS Payload (JSON)
								</h4>
								<Button
									variant="ghost"
									size="sm"
									onClick={() =>
										copyToClipboard(
											JSON.stringify(selectedLog?.raw || selectedLog, null, 2),
											"raw",
										)
									}
									className="h-6 px-2 text-[11px] gap-1"
								>
									{copiedField === "raw" ? (
										<Check className="w-3 h-3 text-emerald-500" />
									) : (
										<Copy className="w-3 h-3" />
									)}
									Sao chép JSON
								</Button>
							</div>
							<pre className="p-3 rounded-lg bg-muted/40 border border-border/60 text-foreground font-mono text-[11px] overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-60">
								{JSON.stringify(selectedLog?.raw || selectedLog, null, 2)}
							</pre>
						</div>
					</div>
				</DialogContent>
			</Dialog>
		</div>
	);
};
