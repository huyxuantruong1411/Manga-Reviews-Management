import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type React from "react";
import type { ReactNode } from "react";
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useState,
} from "react";
import {
	MOTION_EASE,
	MOTION_SPRING,
} from "@/components/motion/MotionPrimitives";

export type AlertType = "success" | "error" | "warning" | "info";

interface AlertOptions {
	title: string;
	message: string;
	type?: AlertType;
}

interface ToastItem {
	id: string;
	message: string;
	type: AlertType;
}

interface AlertContextType {
	showAlert: (options: AlertOptions) => void;
	hideAlert: () => void;
	showToast: (message: string, type?: AlertType) => void;
}

const AlertContext = createContext<AlertContextType | undefined>(undefined);

export const AlertProvider: React.FC<{ children: ReactNode }> = ({
	children,
}) => {
	const [isOpen, setIsOpen] = useState(false);
	const [title, setTitle] = useState("");
	const [message, setMessage] = useState("");
	const [type, setType] = useState<AlertType>("info");
	const [toasts, setToasts] = useState<ToastItem[]>([]);

	const showAlert = ({ title, message, type = "info" }: AlertOptions) => {
		setTitle(title);
		setMessage(message);
		setType(type);
		setIsOpen(true);
	};

	const hideAlert = useCallback(() => {
		setIsOpen(false);
	}, []);

	useEffect(() => {
		if (!isOpen) return;
		const handleEsc = (e: KeyboardEvent) => {
			if (e.key === "Escape") hideAlert();
		};
		window.addEventListener("keydown", handleEsc);
		return () => window.removeEventListener("keydown", handleEsc);
	}, [isOpen, hideAlert]);

	const showToast = (message: string, type: AlertType = "info") => {
		const id = Math.random().toString(36).substring(2, 9);
		setToasts((prev) => [...prev, { id, message, type }]);
		setTimeout(() => {
			setToasts((prev) => prev.filter((t) => t.id !== id));
		}, 4000);
	};

	// Icon mapping
	const renderIcon = () => {
		switch (type) {
			case "success":
				return (
					<CheckCircle2 className="w-12 h-12 text-emerald-500 animate-bounce" />
				);
			case "error":
				return <XCircle className="w-12 h-12 text-rose-500 animate-wiggle" />;
			case "warning":
				return <AlertTriangle className="w-12 h-12 text-amber-500" />;
			case "info":
			default:
				return <Info className="w-12 h-12 text-blue-500" />;
		}
	};

	return (
		<AlertContext.Provider value={{ showAlert, hideAlert, showToast }}>
			{children}
			<AnimatePresence>
				{isOpen && (
					<motion.div
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.16, ease: MOTION_EASE }}
						onClick={(e) => {
							if (e.target === e.currentTarget) hideAlert();
						}}
						className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
					>
						<motion.div
							role="alertdialog"
							aria-modal="true"
							initial={{ opacity: 0, scale: 0.94, y: 10 }}
							animate={{ opacity: 1, scale: 1, y: 0 }}
							exit={{ opacity: 0, scale: 0.96, y: 6 }}
							transition={MOTION_SPRING}
							className="relative w-full max-w-md p-6 overflow-hidden bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-2xl"
						>
							{/* Top Close Button */}
							<button
								type="button"
								aria-label="Đóng thông báo"
								onClick={hideAlert}
								className="absolute top-4 right-4 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 transition-colors cursor-pointer"
							>
								<X className="w-5 h-5" />
							</button>

							{/* Content Body */}
							<div className="flex flex-col items-center text-center mt-2">
								<div className="p-3 bg-neutral-50 dark:bg-neutral-800/70 rounded-full mb-4">
									{renderIcon()}
								</div>

								<h3 className="text-xl font-bold text-neutral-950 dark:text-neutral-50 tracking-tight">
									{title}
								</h3>

								<p className="mt-3 text-sm text-neutral-500 dark:text-neutral-400 whitespace-pre-wrap leading-relaxed">
									{message}
								</p>
							</div>

							{/* Bottom Button */}
							<div className="mt-6 flex justify-center">
								<button
									type="button"
									onClick={hideAlert}
									className="w-full sm:w-auto px-6 py-2.5 font-medium text-white bg-orange-600 hover:bg-orange-500 rounded-xl transition-all duration-200 shadow-md shadow-orange-600/15 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 dark:focus:ring-offset-neutral-900 cursor-pointer"
								>
									Okay
								</button>
							</div>
						</motion.div>
					</motion.div>
				)}
			</AnimatePresence>

			{/* Floating Toast Notification Container */}
			<div
				aria-live="polite"
				className="fixed top-6 right-6 z-[200] flex flex-col gap-2 pointer-events-none"
			>
				<AnimatePresence initial={false}>
					{toasts.map((toast) => (
						<motion.div
							layout
							key={toast.id}
							initial={{ opacity: 0, x: 28, scale: 0.96 }}
							animate={{ opacity: 1, x: 0, scale: 1 }}
							exit={{ opacity: 0, x: 24, scale: 0.95 }}
							transition={MOTION_SPRING}
							className={`pointer-events-auto flex items-center space-x-2.5 px-4 py-3 rounded-2xl shadow-xl border text-xs font-bold max-w-md ${
								toast.type === "success"
									? "bg-emerald-50 dark:bg-emerald-950/90 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800"
									: toast.type === "error"
										? "bg-rose-50 dark:bg-rose-950/90 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800"
										: toast.type === "warning"
											? "bg-amber-50 dark:bg-amber-950/90 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800"
											: "bg-white dark:bg-zinc-900 text-[var(--text-primary)] border-[var(--border-primary)]"
							}`}
						>
							{toast.type === "success" && (
								<CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
							)}
							{toast.type === "error" && (
								<XCircle className="w-4 h-4 text-rose-500 shrink-0" />
							)}
							{toast.type === "warning" && (
								<AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
							)}
							{toast.type === "info" && (
								<Info className="w-4 h-4 text-blue-500 shrink-0" />
							)}
							<span className="flex-1 leading-normal pr-1 break-words select-text">
								{toast.message}
							</span>
							<button
								type="button"
								aria-label="Đóng thông báo nhanh"
								onClick={() =>
									setToasts((prev) => prev.filter((t) => t.id !== toast.id))
								}
								className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 transition-colors shrink-0 cursor-pointer"
							>
								<X className="w-3.5 h-3.5" />
							</button>
						</motion.div>
					))}
				</AnimatePresence>
			</div>
		</AlertContext.Provider>
	);
};

export const useAlert = (): AlertContextType => {
	const context = useContext(AlertContext);
	if (context === undefined) {
		throw new Error("useAlert must be used within an AlertProvider");
	}
	return context;
};
