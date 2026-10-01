import { CheckCircle2, Sparkles, X, Zap } from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";
import {
	subscribeTaskNotification,
	type TaskNotificationPayload,
} from "../../services/notificationService";

export const SteamNotification: React.FC = () => {
	const [activeNotification, setActiveNotification] =
		useState<TaskNotificationPayload | null>(null);
	const [progress, setProgress] = useState(100);

	useEffect(() => {
		const unsubscribe = subscribeTaskNotification((payload) => {
			setActiveNotification(payload);
			setProgress(100);
		});
		return unsubscribe;
	}, []);

	useEffect(() => {
		if (!activeNotification) return;

		const startTime = Date.now();
		const duration = 6500; // 6.5s display time

		const interval = setInterval(() => {
			const elapsed = Date.now() - startTime;
			const remaining = Math.max(0, 100 - (elapsed / duration) * 100);
			setProgress(remaining);
			if (remaining <= 0) {
				clearInterval(interval);
				setActiveNotification(null);
			}
		}, 50);

		return () => clearInterval(interval);
	}, [activeNotification]);

	if (!activeNotification) return null;

	return (
		<div className="fixed bottom-6 right-6 z-[300] max-w-sm w-full animate-in slide-in-from-bottom-5 duration-300 pointer-events-auto">
			<div className="relative overflow-hidden rounded-2xl bg-[#171a21]/95 border border-[#3a4454] shadow-[0_12px_36px_rgba(0,0,0,0.65)] backdrop-blur-md p-4 text-zinc-100 flex items-start gap-3.5 group">
				{/* Steam-Style Left Accent Bar */}
				<div className="absolute top-0 left-0 bottom-0 w-1 bg-gradient-to-b from-amber-400 via-orange-500 to-amber-600 shadow-[0_0_12px_rgba(245,158,11,0.6)]" />

				{/* Achievement / Task Icon */}
				<div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/10 border border-amber-500/40 flex items-center justify-center shrink-0 shadow-inner mt-0.5">
					{activeNotification.type === "success" ? (
						<CheckCircle2 size={22} className="text-amber-400" />
					) : (
						<Sparkles size={22} className="text-amber-400 animate-pulse" />
					)}
				</div>

				{/* Body Content */}
				<div className="flex-1 min-w-0 pr-4">
					<div className="flex items-center gap-1.5 text-[10px] font-extrabold tracking-wider uppercase text-amber-400 font-mono">
						<Zap size={11} />
						<span>{activeNotification.badge || "HỆ THỐNG HOÀN TẤT"}</span>
					</div>
					<h4 className="text-xs font-black text-white truncate mt-0.5 font-spartan">
						{activeNotification.title}
					</h4>
					<p className="text-[11px] text-zinc-300 mt-1 leading-relaxed line-clamp-2">
						{activeNotification.message}
					</p>
				</div>

				{/* Close Button */}
				<button
					type="button"
					onClick={() => setActiveNotification(null)}
					className="text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer p-1"
					title="Đóng thông báo"
				>
					<X size={14} />
				</button>

				{/* Auto Dismiss Progress Bar */}
				<div className="absolute bottom-0 left-0 right-0 h-1 bg-zinc-800">
					<div
						className="h-full bg-gradient-to-r from-amber-500 to-orange-500 transition-all duration-75 ease-linear"
						style={{ width: `${progress}%` }}
					/>
				</div>
			</div>
		</div>
	);
};
