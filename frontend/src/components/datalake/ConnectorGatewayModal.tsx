import {
	Activity,
	AlertTriangle,
	Check,
	Copy,
	Globe,
	KeyRound,
	Plug,
	Radio,
	RefreshCw,
	RotateCw,
	Send,
	ShieldCheck,
	Terminal,
	Trash2,
	Webhook,
	X,
} from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
	getConnectorAdminStatus,
	listConnectorAdminDeliveries,
	listConnectorAdminEvents,
	listConnectorAdminSubscriptions,
	retryConnectorAdminDelivery,
	revokeConnectorAdminSubscription,
	testConnectorAdminSubscription,
} from "../../api/datalakePool";
import { useAlert } from "../../hooks/useAlert";
import type {
	CdcDeliveryItem,
	CdcEventItem,
	CdcSubscriptionItem,
	ConnectorStatusResponse,
} from "../../types/datalakePool";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";

interface ConnectorGatewayModalProps {
	isOpen: boolean;
	onClose: () => void;
}

type ModalTab = "connection" | "subscriptions" | "activity";

const formatTimestamp = (iso?: string | null): string => {
	if (!iso) return "—";
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return iso;
	return date.toLocaleString();
};

export const ConnectorGatewayModal: React.FC<ConnectorGatewayModalProps> = ({
	isOpen,
	onClose,
}) => {
	const { showToast } = useAlert();
	const [activeTab, setActiveTab] = useState<ModalTab>("connection");
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const [statusData, setStatusData] = useState<ConnectorStatusResponse | null>(
		null,
	);
	const [subscriptions, setSubscriptions] = useState<CdcSubscriptionItem[]>([]);
	const [events, setEvents] = useState<CdcEventItem[]>([]);
	const [deliveries, setDeliveries] = useState<CdcDeliveryItem[]>([]);

	const [copiedKey, setCopiedKey] = useState<string | null>(null);
	const [busyId, setBusyId] = useState<string | null>(null);

	const loadAll = useCallback(async () => {
		try {
			setLoading(true);
			setError(null);
			const [st, subs, evs, dlvs] = await Promise.all([
				getConnectorAdminStatus(),
				listConnectorAdminSubscriptions({ limit: 100 }),
				listConnectorAdminEvents({ limit: 40 }),
				listConnectorAdminDeliveries({ limit: 40 }),
			]);
			setStatusData(st);
			setSubscriptions(subs.items);
			setEvents(evs.items);
			setDeliveries(dlvs.items);
		} catch (err: unknown) {
			const msg =
				err instanceof Error
					? err.message
					: "Không thể tải trạng thái External Source Connector";
			setError(msg);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		if (!isOpen) return;
		void loadAll();
	}, [isOpen, loadAll]);

	useEffect(() => {
		if (!isOpen) return;
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [isOpen, onClose]);

	const copyText = useCallback(
		(key: string, value: string) => {
			void navigator.clipboard.writeText(value);
			setCopiedKey(key);
			showToast("Đã sao chép vào clipboard", "success");
			setTimeout(() => setCopiedKey(null), 1800);
		},
		[showToast],
	);

	const effectiveBaseUrl = useMemo(() => {
		if (statusData?.active_public_base_url) {
			return statusData.active_public_base_url;
		}
		const port = statusData?.dedicated_port ?? 8001;
		return `http://127.0.0.1:${port}`;
	}, [statusData]);

	const readerEnvSnippet = useMemo(() => {
		return [
			`UPSTREAM_SOURCE_BASE_URL=${effectiveBaseUrl}`,
			"UPSTREAM_SOURCE_API_KEY=<copy CONNECTOR_API_KEY from backend/.env>",
			"UPSTREAM_WEBHOOK_SECRET=<copy CONNECTOR_WEBHOOK_SECRET from backend/.env>",
			"UPSTREAM_SKIP_NGROK_WARNING=true",
		].join("\n");
	}, [effectiveBaseUrl]);

	const handleRevokeSubscription = useCallback(
		async (subscriptionKey: string) => {
			try {
				setBusyId(subscriptionKey);
				await revokeConnectorAdminSubscription(subscriptionKey);
				showToast("Đã hủy đăng ký CDC webhook", "success");
				await loadAll();
			} catch (err: unknown) {
				showToast(
					err instanceof Error ? err.message : "Hủy subscription thất bại",
					"error",
				);
			} finally {
				setBusyId(null);
			}
		},
		[loadAll, showToast],
	);

	const handleTestSubscription = useCallback(
		async (subscriptionKey: string) => {
			try {
				setBusyId(subscriptionKey);
				const rec = await testConnectorAdminSubscription(subscriptionKey);
				if (rec.status === "DELIVERED") {
					showToast(
						`Ping webhook thành công (HTTP ${rec.response_status ?? 200})`,
						"success",
					);
				} else {
					showToast(
						`Ping thất bại: ${rec.last_error || "Không kết nối được callback URL"}`,
						"error",
					);
				}
				await loadAll();
			} catch (err: unknown) {
				showToast(
					err instanceof Error ? err.message : "Gửi ping webhook thất bại",
					"error",
				);
			} finally {
				setBusyId(null);
			}
		},
		[loadAll, showToast],
	);

	const handleRetryDelivery = useCallback(
		async (deliveryId: string) => {
			try {
				setBusyId(deliveryId);
				const rec = await retryConnectorAdminDelivery(deliveryId);
				if (rec.status === "DELIVERED") {
					showToast("Gửi lại webhook thành công", "success");
				} else {
					showToast(
						`Retry thất bại: ${rec.last_error || "Unknown error"}`,
						"error",
					);
				}
				await loadAll();
			} catch (err: unknown) {
				showToast(
					err instanceof Error ? err.message : "Retry delivery thất bại",
					"error",
				);
			} finally {
				setBusyId(null);
			}
		},
		[loadAll, showToast],
	);

	if (!isOpen) return null;

	return (
		<div
			role="dialog"
			aria-modal="true"
			aria-labelledby="connector-gateway-title"
			className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-6 bg-black/70 backdrop-blur-xs"
		>
			<div className="relative w-full max-w-5xl max-h-[92vh] flex flex-col rounded-2xl sm:rounded-3xl bg-[var(--bg-card)] border border-[var(--border-primary)] shadow-2xl overflow-hidden">
				{/* Header */}
				<div className="p-4 sm:p-6 border-b border-[var(--border-primary)] flex items-start justify-between gap-3">
					<div className="space-y-1 min-w-0">
						<div className="flex flex-wrap items-center gap-2">
							<span className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 shrink-0">
								<Plug size={20} />
							</span>
							<h2
								id="connector-gateway-title"
								className="text-lg sm:text-xl font-black text-[var(--text-primary)]"
							>
								External Source Connector &amp; ngrok Gateway
							</h2>
							<Badge className="bg-blue-600/20 text-blue-300 font-mono text-[11px] border-blue-500/30">
								Contract v2.0
							</Badge>
							{statusData?.ngrok_active ? (
								<Badge className="bg-emerald-600/20 text-emerald-300 border-emerald-500/30 text-[11px]">
									<Radio size={12} className="mr-1 animate-pulse" />
									ngrok LIVE
								</Badge>
							) : (
								<Badge
									variant="outline"
									className="text-amber-300 border-amber-500/30 text-[11px]"
								>
									ngrok Offline
								</Badge>
							)}
						</div>
						<p className="text-xs sm:text-sm text-[var(--text-secondary)]">
							Cổng kết nối chuẩn cho hệ thống đọc truyện (QL-DocTruyen) kéo danh
							mục, ETL Package v2.0, stream ảnh Zero-Copy và nhận CDC Webhook.
						</p>
					</div>

					<div className="flex items-center gap-1.5 shrink-0">
						<Button
							size="sm"
							variant="outline"
							onClick={() => void loadAll()}
							disabled={loading}
							aria-label="Làm mới trạng thái connector"
							className="min-h-[44px] min-w-[44px] sm:min-h-[36px] sm:min-w-0"
						>
							<RefreshCw size={15} className={loading ? "animate-spin" : ""} />
							<span className="hidden sm:inline ml-1.5">Làm mới</span>
						</Button>
						<button
							type="button"
							onClick={onClose}
							aria-label="Đóng cửa sổ Connector"
							className="min-h-[44px] min-w-[44px] sm:min-h-[36px] sm:min-w-[36px] flex items-center justify-center rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)] transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none cursor-pointer"
						>
							<X size={20} />
						</button>
					</div>
				</div>

				{/* Tab Bar */}
				<div className="px-4 sm:px-6 py-3 border-b border-[var(--border-primary)] bg-[var(--bg-input)]/30 flex flex-wrap items-center gap-2">
					<button
						type="button"
						onClick={() => setActiveTab("connection")}
						className={`min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none cursor-pointer ${
							activeTab === "connection"
								? "bg-[var(--brand-orange)] text-white"
								: "text-[var(--text-secondary)] hover:text-[var(--text-primary)] bg-[var(--bg-card)] border border-[var(--border-primary)]"
						}`}
					>
						<Globe size={14} />
						<span>1. Kết nối &amp; ngrok</span>
					</button>

					<button
						type="button"
						onClick={() => setActiveTab("subscriptions")}
						className={`min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none cursor-pointer ${
							activeTab === "subscriptions"
								? "bg-[var(--brand-orange)] text-white"
								: "text-[var(--text-secondary)] hover:text-[var(--text-primary)] bg-[var(--bg-card)] border border-[var(--border-primary)]"
						}`}
					>
						<Webhook size={14} />
						<span>2. CDC Subscriptions ({subscriptions.length})</span>
					</button>

					<button
						type="button"
						onClick={() => setActiveTab("activity")}
						className={`min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none cursor-pointer ${
							activeTab === "activity"
								? "bg-[var(--brand-orange)] text-white"
								: "text-[var(--text-secondary)] hover:text-[var(--text-primary)] bg-[var(--bg-card)] border border-[var(--border-primary)]"
						}`}
					>
						<Activity size={14} />
						<span>
							3. CDC Events &amp; Deliveries ({events.length}/
							{deliveries.length})
						</span>
					</button>
				</div>

				{/* Body */}
				<div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
					{loading && !statusData ? (
						<div
							role="status"
							aria-label="Đang tải trạng thái Connector"
							className="space-y-4"
						>
							<div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
								<Skeleton className="h-24 w-full rounded-2xl" />
								<Skeleton className="h-24 w-full rounded-2xl" />
								<Skeleton className="h-24 w-full rounded-2xl" />
							</div>
							<Skeleton className="h-36 w-full rounded-2xl" />
							<Skeleton className="h-44 w-full rounded-2xl" />
						</div>
					) : error ? (
						<div className="p-6 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-center space-y-3">
							<AlertTriangle className="mx-auto text-rose-400" size={28} />
							<p className="font-semibold text-sm">{error}</p>
							<Button
								size="sm"
								variant="outline"
								onClick={() => void loadAll()}
							>
								Thử lại
							</Button>
						</div>
					) : (
						statusData && (
							<>
								{activeTab === "connection" && (
									<div className="space-y-4">
										{/* Status KPI Cards */}
										<div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
											<div className="p-4 rounded-2xl bg-[var(--bg-input)]/40 border border-[var(--border-primary)] space-y-1.5">
												<div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
													<span>Bảo mật API Key</span>
													<KeyRound size={15} className="text-orange-400" />
												</div>
												<div className="text-base font-bold text-[var(--text-primary)]">
													{statusData.api_key_configured
														? "Đã cấu hình (Fail-Closed)"
														: "Chưa cấu hình"}
												</div>
												<p className="text-[11px] text-[var(--text-secondary)]">
													Tunnel Path Guard:{" "}
													<strong className="text-emerald-400">
														{statusData.tunnel_path_guard_enabled
															? "BẬT"
															: "TẮT"}
													</strong>
												</p>
											</div>

											<div className="p-4 rounded-2xl bg-[var(--bg-input)]/40 border border-[var(--border-primary)] space-y-1.5">
												<div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
													<span>Dữ liệu sẵn sàng ETL</span>
													<ShieldCheck size={15} className="text-blue-400" />
												</div>
												<div className="text-base font-bold text-[var(--text-primary)]">
													{statusData.pool_stats.ready_mangas} manga ·{" "}
													{statusData.pool_stats.ready_chapters} chương
												</div>
												<p className="text-[11px] text-[var(--text-secondary)]">
													{statusData.pool_stats.ready_pages.toLocaleString()}{" "}
													trang (Zero-Copy Proxy)
												</p>
											</div>

											<div className="p-4 rounded-2xl bg-[var(--bg-input)]/40 border border-[var(--border-primary)] space-y-1.5">
												<div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
													<span>CDC Realtime</span>
													<Webhook size={15} className="text-purple-400" />
												</div>
												<div className="text-base font-bold text-[var(--text-primary)]">
													{statusData.active_subscriptions_count} đang theo dõi
												</div>
												<p className="text-[11px] text-[var(--text-secondary)]">
													{statusData.total_events_count} events ·{" "}
													{statusData.failed_deliveries_count} delivery lỗi
												</p>
											</div>
										</div>

										{/* Active ngrok / Public URL Box */}
										<div className="p-4 rounded-2xl bg-[var(--bg-input)]/40 border border-[var(--border-primary)] space-y-3">
											<div className="flex flex-wrap items-center justify-between gap-2">
												<div className="flex items-center gap-2">
													<Globe size={16} className="text-emerald-400" />
													<span className="text-sm font-bold text-[var(--text-primary)]">
														Base URL kết nối hiện tại
													</span>
												</div>
												<Button
													size="sm"
													variant="outline"
													onClick={() => copyText("url", effectiveBaseUrl)}
													className="text-xs min-h-[36px]"
												>
													{copiedKey === "url" ? (
														<Check
															size={14}
															className="mr-1.5 text-emerald-400"
														/>
													) : (
														<Copy size={14} className="mr-1.5" />
													)}
													Sao chép URL
												</Button>
											</div>

											<div className="p-3 rounded-xl bg-zinc-950 border border-[var(--border-primary)] font-mono text-xs text-emerald-300 break-all">
												{effectiveBaseUrl}
											</div>

											{statusData.ngrok_tunnels.length > 0 ? (
												<div className="space-y-1.5">
													<p className="text-xs font-semibold text-[var(--text-secondary)]">
														Tunnels phát hiện từ ngrok (127.0.0.1:4040):
													</p>
													{statusData.ngrok_tunnels.map((t) => (
														<div
															key={t.public_url}
															className="flex flex-wrap items-center justify-between gap-2 text-xs p-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border-primary)]"
														>
															<span className="font-mono text-emerald-300 break-all">
																{t.public_url}
															</span>
															<span className="text-[var(--text-secondary)] font-mono">
																→ {t.addr}
															</span>
														</div>
													))}
												</div>
											) : (
												<div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-200 text-xs space-y-2">
													<div className="flex items-center gap-2 font-semibold">
														<Terminal size={14} className="shrink-0" />
														<span>
															Chạy lệnh sau trên PowerShell để bật Isolated
															Connector (:{statusData.dedicated_port}) + ngrok
															HTTPS:
														</span>
													</div>
													<div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-zinc-950 font-mono text-zinc-200 overflow-x-auto">
														<code>
															.\scripts\start_connector_ngrok.ps1 -InitSecrets
														</code>
														<Button
															size="sm"
															variant="outline"
															onClick={() =>
																copyText(
																	"cmd",
																	".\\scripts\\start_connector_ngrok.ps1 -InitSecrets",
																)
															}
															className="text-[11px] shrink-0"
														>
															{copiedKey === "cmd" ? (
																<Check size={13} className="text-emerald-400" />
															) : (
																<Copy size={13} />
															)}
														</Button>
													</div>
												</div>
											)}
										</div>

										{/* Reader .env Handoff Block */}
										<div className="p-4 rounded-2xl bg-[var(--bg-input)]/40 border border-[var(--border-primary)] space-y-2.5">
											<div className="flex flex-wrap items-center justify-between gap-2">
												<span className="text-sm font-bold text-[var(--text-primary)]">
													Cấu hình cho hệ thống đọc truyện (QL-DocTruyen .env)
												</span>
												<Button
													size="sm"
													variant="outline"
													onClick={() => copyText("env", readerEnvSnippet)}
													className="text-xs min-h-[36px]"
												>
													{copiedKey === "env" ? (
														<Check
															size={14}
															className="mr-1.5 text-emerald-400"
														/>
													) : (
														<Copy size={14} className="mr-1.5" />
													)}
													Sao chép .env
												</Button>
											</div>
											<pre className="p-3 rounded-xl bg-zinc-950 border border-[var(--border-primary)] text-xs font-mono text-zinc-200 overflow-x-auto leading-relaxed">
												{readerEnvSnippet}
											</pre>
										</div>

										{/* Endpoint Directory */}
										<div className="p-4 rounded-2xl bg-[var(--bg-input)]/40 border border-[var(--border-primary)] space-y-2">
											<span className="text-sm font-bold text-[var(--text-primary)] block">
												Danh sách Endpoints Connector (`/api/connector/v1`)
											</span>
											<div className="grid grid-cols-1 md:grid-cols-2 gap-2">
												{Object.entries(statusData.endpoints).map(
													([name, epPath]) => (
														<div
															key={name}
															className="p-2.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-primary)] text-xs space-y-0.5"
														>
															<div className="font-semibold text-[var(--text-secondary)]">
																{name}
															</div>
															<div className="font-mono text-blue-300 break-all">
																{epPath}
															</div>
														</div>
													),
												)}
											</div>
										</div>
									</div>
								)}

								{activeTab === "subscriptions" && (
									<div className="space-y-3">
										{subscriptions.length === 0 ? (
											<div className="py-12 px-4 text-center rounded-2xl border border-dashed border-[var(--border-primary)] space-y-2">
												<Webhook
													size={32}
													className="mx-auto text-[var(--text-secondary)]"
												/>
												<p className="text-sm font-semibold text-[var(--text-primary)]">
													Chưa có đăng ký CDC Webhook nào
												</p>
												<p className="text-xs text-[var(--text-secondary)] max-w-md mx-auto">
													Khi Admin phía hệ thống đọc truyện bật CDC cho một bộ
													manga (`POST /api/connector/v1/cdc/subscriptions`),
													subscription sẽ hiển thị tại đây.
												</p>
											</div>
										) : (
											subscriptions.map((sub) => (
												<div
													key={sub.provider_subscription_key}
													className="p-4 rounded-2xl bg-[var(--bg-input)]/40 border border-[var(--border-primary)] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
												>
													<div className="space-y-1 min-w-0">
														<div className="flex flex-wrap items-center gap-2">
															<Badge
																className={
																	sub.status === "ACTIVE"
																		? "bg-emerald-600/20 text-emerald-300 border-emerald-500/30"
																		: "bg-zinc-700/40 text-zinc-300 border-zinc-600/40"
																}
															>
																{sub.status}
															</Badge>
															<span className="font-mono text-xs text-orange-300">
																{sub.pool_manga_id}
															</span>
															<span className="font-mono text-[11px] text-[var(--text-secondary)]">
																{sub.provider_subscription_key}
															</span>
														</div>
														<div className="text-xs font-mono text-zinc-200 break-all">
															{sub.callback_url}
														</div>
														<div className="text-[11px] text-[var(--text-secondary)] flex flex-wrap gap-3">
															<span>Consumer: {sub.consumer_id}</span>
															<span>
																Last event: {formatTimestamp(sub.last_event_at)}
															</span>
														</div>
													</div>

													<div className="flex items-center gap-2 shrink-0">
														<Button
															size="sm"
															variant="outline"
															disabled={
																busyId === sub.provider_subscription_key ||
																sub.status !== "ACTIVE"
															}
															onClick={() =>
																void handleTestSubscription(
																	sub.provider_subscription_key,
																)
															}
															className="text-xs min-h-[36px]"
														>
															<Send size={13} className="mr-1.5" />
															Ping
														</Button>
														<Button
															size="sm"
															variant="outline"
															disabled={
																busyId === sub.provider_subscription_key ||
																sub.status === "CANCELLED"
															}
															onClick={() =>
																void handleRevokeSubscription(
																	sub.provider_subscription_key,
																)
															}
															className="text-xs text-rose-400 border-rose-500/30 hover:bg-rose-500/10 min-h-[36px]"
														>
															<Trash2 size={13} className="mr-1.5" />
															Hủy
														</Button>
													</div>
												</div>
											))
										)}
									</div>
								)}

								{activeTab === "activity" && (
									<div className="space-y-5">
										{/* Outbound Deliveries */}
										<div className="space-y-2.5">
											<h3 className="text-sm font-bold text-[var(--text-primary)]">
												Webhook Deliveries ({deliveries.length})
											</h3>
											{deliveries.length === 0 ? (
												<p className="text-xs text-[var(--text-secondary)] p-4 rounded-xl border border-dashed border-[var(--border-primary)]">
													Chưa có lượt đẩy webhook nào được ghi nhận.
												</p>
											) : (
												<div className="space-y-2">
													{deliveries.map((dlv) => (
														<div
															key={dlv.delivery_id}
															className="p-3 rounded-xl bg-[var(--bg-input)]/40 border border-[var(--border-primary)] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
														>
															<div className="space-y-1 min-w-0">
																<div className="flex flex-wrap items-center gap-2">
																	<Badge
																		className={
																			dlv.status === "DELIVERED"
																				? "bg-emerald-600/20 text-emerald-300 border-emerald-500/30"
																				: dlv.status === "FAILED"
																					? "bg-rose-600/20 text-rose-300 border-rose-500/30"
																					: "bg-amber-600/20 text-amber-300 border-amber-500/30"
																		}
																	>
																		{dlv.status}
																	</Badge>
																	<span className="font-mono font-semibold text-zinc-200">
																		{dlv.event_type}
																	</span>
																	<span className="font-mono text-[var(--text-secondary)]">
																		{dlv.pool_manga_id}
																	</span>
																	{dlv.response_status && (
																		<span className="font-mono text-blue-300">
																			HTTP {dlv.response_status}
																		</span>
																	)}
																</div>
																<div className="text-[11px] text-[var(--text-secondary)] break-all">
																	{dlv.callback_url} ·{" "}
																	{formatTimestamp(dlv.updated_at)}
																</div>
																{dlv.last_error && (
																	<div className="text-[11px] text-rose-400 break-all">
																		{dlv.last_error}
																	</div>
																)}
															</div>

															{dlv.status === "FAILED" && (
																<Button
																	size="sm"
																	variant="outline"
																	disabled={busyId === dlv.delivery_id}
																	onClick={() =>
																		void handleRetryDelivery(dlv.delivery_id)
																	}
																	className="text-xs shrink-0 min-h-[36px]"
																>
																	<RotateCw size={13} className="mr-1.5" />
																	Thử lại
																</Button>
															)}
														</div>
													))}
												</div>
											)}
										</div>

										{/* CDC Event Outbox */}
										<div className="space-y-2.5">
											<h3 className="text-sm font-bold text-[var(--text-primary)]">
												CDC Event Outbox ({events.length})
											</h3>
											{events.length === 0 ? (
												<p className="text-xs text-[var(--text-secondary)] p-4 rounded-xl border border-dashed border-[var(--border-primary)]">
													Chưa có sự kiện CDC nào phát sinh. Khi đồng bộ, chỉnh
													sửa hoặc xóa chương trong Pool, sự kiện sẽ tự động ghi
													vào outbox để đẩy webhook hoặc cho Reader polling.
												</p>
											) : (
												<div className="space-y-2">
													{events.map((ev) => (
														<div
															key={ev.eventId}
															className="p-3 rounded-xl bg-[var(--bg-input)]/40 border border-[var(--border-primary)] text-xs space-y-1"
														>
															<div className="flex flex-wrap items-center justify-between gap-2">
																<div className="flex flex-wrap items-center gap-2">
																	<Badge className="bg-blue-600/20 text-blue-300 border-blue-500/30 font-mono text-[10px]">
																		{ev.eventType}
																	</Badge>
																	<span className="font-mono text-orange-300">
																		{ev.poolMangaId}
																	</span>
																	{ev.poolChapterId && (
																		<span className="font-mono text-zinc-400">
																			/ {ev.poolChapterId}
																		</span>
																	)}
																	<span className="text-[var(--text-secondary)]">
																		rev #{ev.poolRevision}
																	</span>
																</div>
																<span className="text-[11px] text-[var(--text-secondary)]">
																	{formatTimestamp(ev.occurredAt)}
																</span>
															</div>
															<div className="font-mono text-[11px] text-zinc-400 break-all">
																{ev.eventId} · sha256:
																{ev.payloadSha256.slice(0, 16)}…
															</div>
														</div>
													))}
												</div>
											)}
										</div>
									</div>
								)}
							</>
						)
					)}
				</div>

				{/* Footer */}
				<div className="p-3.5 sm:p-4 border-t border-[var(--border-primary)] bg-[var(--bg-card)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs text-[var(--text-secondary)]">
					<span>
						Tài liệu tích hợp:{" "}
						<code className="font-mono text-zinc-300">
							docs/contracts/external-source-connector.md
						</code>
					</span>
					<span className="font-mono text-[11px]">
						Header bắt buộc: X-Connector-API-Key
					</span>
				</div>
			</div>
		</div>
	);
};
