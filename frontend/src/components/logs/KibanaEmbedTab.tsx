import {
	Activity,
	AlertTriangle,
	Check,
	Copy,
	ExternalLink,
	Eye,
	Layers,
	LayoutDashboard,
	RefreshCw,
	Server,
	Terminal,
} from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useState } from "react";
import client from "../../api/client";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Skeleton } from "../ui/skeleton";

export interface SystemLogELKStatus {
	elasticsearch_available: boolean;
	elasticsearch_host: string;
	elasticsearch_version?: string | null;
	kibana_available: boolean;
	kibana_host: string;
	kibana_embed_dashboard_url?: string | null;
	kibana_embed_discover_url?: string | null;
	filebeat_status: string;
	logstash_status: string;
	indices_count: number;
	message: string;
}

interface KibanaEmbedTabProps {
	onSwitchToAppLogs?: () => void;
}

export const KibanaEmbedTab: React.FC<KibanaEmbedTabProps> = ({
	onSwitchToAppLogs,
}) => {
	const [status, setStatus] = useState<SystemLogELKStatus | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [activeView, setActiveView] = useState<"dashboard" | "discover">(
		"dashboard",
	);
	const [iframeLoading, setIframeLoading] = useState(true);
	const [copied, setCopied] = useState(false);

	const fetchStatus = useCallback(async () => {
		try {
			setLoading(true);
			setError(null);
			const res = await client.get("/api/system-logs/elk-status");
			setStatus(res.data);
			setIframeLoading(true);
		} catch (err) {
			console.error("Failed to query ELK status:", err);
			setError("Không thể kiểm tra trạng thái cụm ELK. Vui lòng thử lại.");
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		fetchStatus();
	}, [fetchStatus]);

	const bootstrapCommand =
		"python scripts/elk/bootstrap_env.py\ndocker compose -f infra/elk/docker-compose.elk.yml --env-file infra/elk/.env up -d";

	const copyCommand = () => {
		navigator.clipboard.writeText(bootstrapCommand);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	const embedUrl =
		activeView === "dashboard"
			? status?.kibana_embed_dashboard_url ||
				"http://localhost:5601/app/dashboards#/view/manga-observability-overview?embed=true"
			: status?.kibana_embed_discover_url ||
				"http://localhost:5601/app/discover#/?embed=true";

	return (
		<div className="space-y-6">
			{/* Top Control & Health Status Bar */}
			<Card className="bg-card/70 backdrop-blur-md border-border/70 shadow-sm">
				<CardContent className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
					{/* Status Indicators */}
					<div className="flex flex-wrap items-center gap-3">
						<div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/60 border border-border/60 text-xs">
							<Server className="w-3.5 h-3.5 text-muted-foreground" />
							<span className="font-medium text-foreground">
								Elasticsearch:
							</span>
							{loading ? (
								<Skeleton className="h-4 w-12" />
							) : status?.elasticsearch_available ? (
								<Badge
									variant="outline"
									className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30 gap-1 text-[11px]"
								>
									<span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
									Online ({status.elasticsearch_version || "8.15"})
								</Badge>
							) : (
								<Badge
									variant="outline"
									className="bg-rose-500/15 text-rose-500 border-rose-500/30 gap-1 text-[11px]"
								>
									<span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
									Offline
								</Badge>
							)}
						</div>

						<div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/60 border border-border/60 text-xs">
							<Activity className="w-3.5 h-3.5 text-muted-foreground" />
							<span className="font-medium text-foreground">Kibana:</span>
							{loading ? (
								<Skeleton className="h-4 w-12" />
							) : status?.kibana_available ? (
								<Badge
									variant="outline"
									className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30 gap-1 text-[11px]"
								>
									<span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
									Online (:5601)
								</Badge>
							) : (
								<Badge
									variant="outline"
									className="bg-rose-500/15 text-rose-500 border-rose-500/30 gap-1 text-[11px]"
								>
									<span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
									Offline
								</Badge>
							)}
						</div>

						{status?.indices_count !== undefined &&
							status.indices_count > 0 && (
								<div className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted/40 border border-border/40 text-xs text-muted-foreground">
									<Layers className="w-3.5 h-3.5" />
									<span>{status.indices_count} Log Indices</span>
								</div>
							)}
					</div>

					{/* View Switcher & Action Links */}
					<div className="flex flex-wrap items-center gap-2">
						{status?.kibana_available && (
							<div className="inline-flex rounded-lg border border-border bg-muted/40 p-1">
								<button
									type="button"
									onClick={() => {
										setActiveView("dashboard");
										setIframeLoading(true);
									}}
									className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors ${
										activeView === "dashboard"
											? "bg-background text-foreground shadow-sm"
											: "text-muted-foreground hover:text-foreground"
									}`}
								>
									<LayoutDashboard className="w-3.5 h-3.5" />
									Dashboard
								</button>
								<button
									type="button"
									onClick={() => {
										setActiveView("discover");
										setIframeLoading(true);
									}}
									className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors ${
										activeView === "discover"
											? "bg-background text-foreground shadow-sm"
											: "text-muted-foreground hover:text-foreground"
									}`}
								>
									<Eye className="w-3.5 h-3.5" />
									Discover
								</button>
							</div>
						)}

						<Button
							variant="outline"
							size="sm"
							onClick={fetchStatus}
							disabled={loading}
							className="h-8 gap-1.5 text-xs"
						>
							<RefreshCw
								className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`}
							/>
							<span className="hidden sm:inline">Làm mới</span>
						</Button>

						{status?.kibana_available && (
							<Button
								variant="default"
								size="sm"
								asChild
								className="h-8 gap-1.5 text-xs font-medium"
							>
								<a
									href={status.kibana_host || "http://localhost:5601"}
									target="_blank"
									rel="noreferrer"
								>
									<ExternalLink className="w-3.5 h-3.5" />
									<span>Mở Tab Riêng</span>
								</a>
							</Button>
						)}
					</div>
				</CardContent>
			</Card>

			{/* Main Content Area */}
			{loading && !status ? (
				<Card className="bg-card/50 border-border/60">
					<CardContent className="p-8 flex flex-col items-center justify-center space-y-4 min-h-[400px]">
						<RefreshCw className="w-8 h-8 text-primary animate-spin" />
						<p className="text-sm text-muted-foreground">
							Đang kiểm tra kết nối tới dịch vụ Kibana & Elasticsearch...
						</p>
					</CardContent>
				</Card>
			) : status?.kibana_available ? (
				/* Embedded Kibana iFrame */
				<div className="relative w-full h-[calc(100vh-280px)] min-h-[720px] rounded-xl overflow-hidden border border-border shadow-md bg-card">
					{iframeLoading && (
						<div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-card/85 backdrop-blur-sm gap-3">
							<div className="p-3 rounded-full bg-primary/10 text-primary animate-pulse">
								<Activity className="w-6 h-6 animate-spin" />
							</div>
							<p className="text-sm font-medium text-foreground">
								Đang tải giao diện Kibana nhúng ({activeView})...
							</p>
							<p className="text-xs text-muted-foreground">
								Chế độ Anonymous Viewer không yêu cầu đăng nhập.
							</p>
						</div>
					)}
					<iframe
						src={embedUrl}
						title="Kibana Observability Center"
						className="w-full h-full border-0"
						onLoad={() => setIframeLoading(false)}
						allow="clipboard-write"
					/>
				</div>
			) : (
				/* Aesthetic ELK Cluster Offline Fallback Card */
				<Card className="bg-gradient-to-br from-card via-card to-background border-border/80 shadow-md">
					<CardHeader className="text-center pb-2 pt-8">
						<div className="mx-auto w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 mb-3 shadow-inner">
							<AlertTriangle className="w-7 h-7" />
						</div>
						<CardTitle className="text-xl font-bold tracking-tight text-foreground">
							Cụm ELK Chưa Được Khởi Động
						</CardTitle>
						<p className="text-sm text-muted-foreground max-w-xl mx-auto mt-2 leading-relaxed">
							Hệ thống vẫn đang tự động ghi nhật ký có cấu trúc theo chuẩn ECS
							vào file NDJSON cục bộ (
							<code className="px-1.5 py-0.5 rounded bg-muted font-mono text-xs text-foreground">
								logs/manga-*.ndjson
							</code>
							). Bạn vẫn có thể xem toàn bộ logs qua tab{" "}
							<span className="font-semibold text-foreground">
								Application Logs (Bản Địa)
							</span>
							.
						</p>
					</CardHeader>

					<CardContent className="p-6 md:p-8 space-y-6 max-w-2xl mx-auto">
						{error && (
							<div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-500 text-center font-medium">
								{error}
							</div>
						)}

						{/* Command Snippet Card */}
						<div className="space-y-2">
							<div className="flex items-center justify-between text-xs text-muted-foreground">
								<span className="flex items-center gap-1.5 font-medium">
									<Terminal className="w-3.5 h-3.5" />
									Lệnh khởi chạy container ELK:
								</span>
								<Button
									variant="ghost"
									size="sm"
									onClick={copyCommand}
									className="h-7 px-2 text-xs gap-1 text-primary hover:text-primary"
								>
									{copied ? (
										<>
											<Check className="w-3.5 h-3.5 text-emerald-500" />
											<span className="text-emerald-500">Đã sao chép</span>
										</>
									) : (
										<>
											<Copy className="w-3.5 h-3.5" />
											<span>Sao chép lệnh</span>
										</>
									)}
								</Button>
							</div>

							<div className="relative rounded-lg bg-zinc-950 p-4 font-mono text-xs text-zinc-100 border border-zinc-800 shadow-inner overflow-x-auto">
								<pre className="space-y-1">
									<code>
										<span className="text-zinc-500">
											# 1. Sinh file cấu hình và cấp quyền thư mục
										</span>
										{"\n"}python scripts/elk/bootstrap_env.py
									</code>
									{"\n\n"}
									<code>
										<span className="text-zinc-500">
											# 2. Khởi chạy cụm Elasticsearch, Kibana, Filebeat,
											Logstash
										</span>
										{"\n"}docker compose -f infra/elk/docker-compose.elk.yml
										--env-file infra/elk/.env up -d
									</code>
								</pre>
							</div>
						</div>

						{/* Explanatory Steps */}
						<div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
							<div className="p-3 rounded-lg bg-muted/40 border border-border/50">
								<div className="font-semibold text-foreground mb-1">
									1. Bootstrap
								</div>
								<p className="text-muted-foreground">
									Tự động tạo mật khẩu an toàn và cấu hình pipeline Logstash &
									templates Elasticsearch.
								</p>
							</div>
							<div className="p-3 rounded-lg bg-muted/40 border border-border/50">
								<div className="font-semibold text-foreground mb-1">
									2. Khởi động Docker
								</div>
								<p className="text-muted-foreground">
									Khởi chạy 4 container độc lập không ảnh hưởng tới MongoDB và
									Redis hiện tại.
								</p>
							</div>
							<div className="p-3 rounded-lg bg-muted/40 border border-border/50">
								<div className="font-semibold text-foreground mb-1">
									3. Trải nghiệm tức thì
								</div>
								<p className="text-muted-foreground">
									Kibana tự động load sẵn Dashboard và quyền Anonymous Viewer
									cho tab này.
								</p>
							</div>
						</div>

						{/* Action Buttons */}
						<div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
							<Button
								variant="default"
								onClick={fetchStatus}
								disabled={loading}
								className="w-full sm:w-auto gap-2"
							>
								<RefreshCw
									className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
								/>
								<span>Kiểm Tra Lại Kết Nối</span>
							</Button>

							{onSwitchToAppLogs && (
								<Button
									variant="outline"
									onClick={onSwitchToAppLogs}
									className="w-full sm:w-auto gap-2"
								>
									<Eye className="w-4 h-4 text-primary" />
									<span>Chuyển Sang Xem Logs Cục Bộ</span>
								</Button>
							)}
						</div>
					</CardContent>
				</Card>
			)}
		</div>
	);
};
export default KibanaEmbedTab;
