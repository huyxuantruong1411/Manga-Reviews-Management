import { AlertTriangle, HelpCircle, Trash2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type React from "react";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useRef,
	useState,
} from "react";
import {
	MOTION_EASE,
	MOTION_SPRING,
} from "@/components/motion/MotionPrimitives";
import { Button } from "@/components/ui/button";

export type ConfirmVariant = "danger" | "warning" | "default";

export interface ConfirmOptions {
	title?: string;
	message: string;
	confirmLabel?: string;
	cancelLabel?: string;
	variant?: ConfirmVariant;
}

interface ActiveConfirm extends ConfirmOptions {
	resolve: (result: boolean) => void;
}

interface ConfirmContextType {
	confirm: (options: ConfirmOptions | string) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextType | undefined>(undefined);

export const ConfirmProvider: React.FC<{ children: ReactNode }> = ({
	children,
}) => {
	const [active, setActive] = useState<ActiveConfirm | null>(null);
	const cancelBtnRef = useRef<HTMLButtonElement | null>(null);

	const confirm = useCallback(
		(options: ConfirmOptions | string): Promise<boolean> => {
			const normalized: ConfirmOptions =
				typeof options === "string" ? { message: options } : options;
			return new Promise((resolve) => {
				setActive((prev) => {
					if (prev) prev.resolve(false);
					return { ...normalized, resolve };
				});
			});
		},
		[],
	);

	const handleDecision = useCallback((accepted: boolean) => {
		setActive((prev) => {
			if (prev) prev.resolve(accepted);
			return null;
		});
	}, []);

	useEffect(() => {
		if (!active) return;
		cancelBtnRef.current?.focus();
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				e.preventDefault();
				handleDecision(false);
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [active, handleDecision]);

	const variant = active?.variant ?? "warning";

	return (
		<ConfirmContext.Provider value={{ confirm }}>
			{children}
			<AnimatePresence>
				{active && (
					<motion.div
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.16, ease: MOTION_EASE }}
						onClick={(e) => {
							if (e.target === e.currentTarget) handleDecision(false);
						}}
						className="fixed inset-0 z-[220] flex items-center justify-center p-4 bg-black/65 backdrop-blur-sm"
					>
						<motion.div
							role="alertdialog"
							aria-modal="true"
							aria-labelledby="confirm-dialog-title"
							aria-describedby="confirm-dialog-desc"
							initial={{ opacity: 0, scale: 0.95, y: 10 }}
							animate={{ opacity: 1, scale: 1, y: 0 }}
							exit={{ opacity: 0, scale: 0.96, y: 6 }}
							transition={MOTION_SPRING}
							className="w-full max-w-md rounded-2xl bg-[var(--bg-card)] border border-[var(--border-primary)] p-6 shadow-2xl space-y-5"
						>
							<div className="flex items-start gap-3.5">
								<div
									className={`shrink-0 p-2.5 rounded-xl border ${
										variant === "danger"
											? "bg-red-500/10 border-red-500/25 text-red-500"
											: variant === "warning"
												? "bg-amber-500/10 border-amber-500/25 text-amber-500"
												: "bg-[var(--brand-orange)]/10 border-[var(--brand-orange)]/25 text-[var(--brand-orange)]"
									}`}
								>
									{variant === "danger" ? (
										<Trash2 className="w-5 h-5" />
									) : variant === "warning" ? (
										<AlertTriangle className="w-5 h-5" />
									) : (
										<HelpCircle className="w-5 h-5" />
									)}
								</div>
								<div className="min-w-0 flex-1 space-y-1.5">
									<h3
										id="confirm-dialog-title"
										className="text-base font-bold text-[var(--text-primary)] leading-snug"
									>
										{active.title || "Xác nhận thao tác"}
									</h3>
									<p
										id="confirm-dialog-desc"
										className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap break-words"
									>
										{active.message}
									</p>
								</div>
							</div>

							<div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-1">
								<Button
									ref={cancelBtnRef}
									type="button"
									variant="outline"
									onClick={() => handleDecision(false)}
									className="rounded-xl px-4 py-2 text-xs font-semibold cursor-pointer"
								>
									{active.cancelLabel || "Hủy"}
								</Button>
								<Button
									type="button"
									variant={variant === "danger" ? "destructive" : "default"}
									onClick={() => handleDecision(true)}
									className={`rounded-xl px-4 py-2 text-xs font-bold cursor-pointer ${
										variant === "danger"
											? "bg-red-600 text-white hover:bg-red-500 dark:bg-red-600 dark:hover:bg-red-500"
											: "bg-[var(--brand-orange)] text-white hover:opacity-95"
									}`}
								>
									{active.confirmLabel || "Xác nhận"}
								</Button>
							</div>
						</motion.div>
					</motion.div>
				)}
			</AnimatePresence>
		</ConfirmContext.Provider>
	);
};

export const useConfirm = (): ConfirmContextType => {
	const ctx = useContext(ConfirmContext);
	if (!ctx) {
		throw new Error("useConfirm must be used within a ConfirmProvider");
	}
	return ctx;
};
