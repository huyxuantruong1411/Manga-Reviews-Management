import {
	AlertCircle,
	CheckCircle2,
	ExternalLink,
	Loader2,
	ShieldCheck,
	Sparkles,
} from "lucide-react";
import type React from "react";
import { useState } from "react";
import client from "../../../api/client";

interface SessionVerificationBannerProps {
	providerId: string;
	providerDisplayName?: string;
	onWarmupSuccess?: () => void;
}

export const SessionVerificationBanner: React.FC<
	SessionVerificationBannerProps
> = ({ providerId, providerDisplayName = "Comix", onWarmupSuccess }) => {
	const [status, setStatus] = useState<
		"idle" | "warming" | "success" | "error"
	>("idle");
	const [errorMessage, setErrorMessage] = useState<string>("");

	const handleWarmup = async () => {
		setStatus("warming");
		setErrorMessage("");
		try {
			await client.post(`/api/datasources/${providerId}/warmup-session`, {
				target_url: providerId === "comix" ? "https://comix.to" : undefined,
			});
			setStatus("success");
			if (onWarmupSuccess) {
				onWarmupSuccess();
			}
		} catch (err: any) {
			const detail =
				err?.response?.data?.detail ||
				err?.message ||
				"Không thể khởi động phiên xác minh.";
			setErrorMessage(detail);
			setStatus("error");
		}
	};

	return (
		<div className="p-3.5 rounded-xl border border-purple-500/30 bg-purple-500/5 dark:bg-purple-950/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
			<div className="flex items-start gap-2.5 min-w-0">
				<div className="p-2 rounded-lg bg-purple-500/15 text-purple-400 shrink-0 mt-0.5 sm:mt-0">
					{status === "success" ? (
						<CheckCircle2 size={16} className="text-emerald-400" />
					) : (
						<ShieldCheck size={16} className="text-purple-400" />
					)}
				</div>
				<div className="space-y-0.5 min-w-0">
					<div className="flex items-center gap-2 flex-wrap">
						<span className="font-bold text-[var(--text-primary)]">
							Xác thực Anti-Bot & Session Cloudflare ({providerDisplayName})
						</span>
						<span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-purple-500/20 text-purple-400 border border-purple-500/30 font-semibold">
							Local AI / HITL
						</span>
					</div>
					<p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
						{status === "idle" && (
							<>
								Hệ thống tự động giải CAPTCHA (Turnstile/Slider) bằng Local AI.
								Nếu bị chặn, hãy mở trình duyệt 1 chạm để lấy phiên duyệt.
							</>
						)}
						{status === "warming" && (
							<span className="text-purple-400 animate-pulse font-medium">
								Đang khởi chạy trình duyệt xác minh Cloudflare Turnstile, vui
								lòng chờ...
							</span>
						)}
						{status === "success" && (
							<span className="text-emerald-400 font-medium">
								Phiên hoạt động đã được lưu vào storage_state.json thành công!
							</span>
						)}
						{status === "error" && (
							<span className="text-rose-400 font-medium">
								{errorMessage || "Lỗi khi thực hiện xác minh phiên."}
							</span>
						)}
					</p>
				</div>
			</div>

			<div className="flex items-center gap-2 shrink-0 self-end sm:self-center w-full sm:w-auto justify-end">
				{status === "error" && (
					<button
						type="button"
						onClick={handleWarmup}
						className="px-3 py-1.5 rounded-lg bg-rose-500/15 text-rose-400 hover:bg-rose-500/25 border border-rose-500/30 font-bold transition flex items-center gap-1.5 cursor-pointer text-xs"
					>
						<AlertCircle size={13} />
						<span>Thử lại</span>
					</button>
				)}
				{status !== "success" && status !== "error" && (
					<button
						type="button"
						onClick={handleWarmup}
						disabled={status === "warming"}
						className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50 text-xs shadow-sm"
					>
						{status === "warming" ? (
							<>
								<Loader2 size={13} className="animate-spin" />
								<span>Đang mở trình duyệt...</span>
							</>
						) : (
							<>
								<Sparkles size={13} />
								<span>Mở trình duyệt xác minh 1 chạm</span>
								<ExternalLink size={12} className="opacity-70" />
							</>
						)}
					</button>
				)}
				{status === "success" && (
					<span className="px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-bold flex items-center gap-1">
						<CheckCircle2 size={13} />
						<span>Đã sẵn sàng</span>
					</span>
				)}
			</div>
		</div>
	);
};

export default SessionVerificationBanner;
