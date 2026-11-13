import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, CheckCircle2, Info, Trash2, X, XCircle } from "lucide-react";
import { MOTION_EASE, MOTION_SPRING } from "./MotionPrimitives";

export type ToastType = "success" | "error" | "warning" | "info";

interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
}

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "warning" | "default";
}

interface ActiveConfirm extends ConfirmOptions {
  resolve: (result: boolean) => void;
}

interface FeedbackContextValue {
  showToast: (message: string, type?: ToastType) => void;
  confirm: (options: ConfirmOptions | string) => Promise<boolean>;
}

const FeedbackContext = createContext<FeedbackContextValue | undefined>(undefined);

export const FeedbackProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [activeConfirm, setActiveConfirm] = useState<ActiveConfirm | null>(null);
  const cancelBtnRef = useRef<HTMLButtonElement | null>(null);

  const showToast = useCallback((message: string, type: ToastType = "info") => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 4000);
  }, []);

  const confirm = useCallback(
    (options: ConfirmOptions | string): Promise<boolean> => {
      const normalized: ConfirmOptions =
        typeof options === "string" ? { message: options } : options;
      return new Promise((resolve) => {
        setActiveConfirm((prev) => {
          if (prev) prev.resolve(false);
          return { ...normalized, resolve };
        });
      });
    },
    []
  );

  const handleConfirmDecision = useCallback((accepted: boolean) => {
    setActiveConfirm((prev) => {
      if (prev) prev.resolve(accepted);
      return null;
    });
  }, []);

  useEffect(() => {
    if (!activeConfirm) return;
    cancelBtnRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleConfirmDecision(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeConfirm, handleConfirmDecision]);

  const variant = activeConfirm?.variant ?? "warning";

  return (
    <FeedbackContext.Provider value={{ showToast, confirm }}>
      {children}

      {/* Toast Stack */}
      <div
        aria-live="polite"
        className="fixed top-4 right-4 z-[90] flex flex-col gap-2 pointer-events-none max-w-sm w-[calc(100%-2rem)] sm:w-full"
      >
        <AnimatePresence initial={false}>
          {toasts.map((toast) => (
            <motion.div
              layout
              key={toast.id}
              initial={{ opacity: 0, x: 24, scale: 0.96 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 20, scale: 0.96 }}
              transition={MOTION_SPRING}
              className={`pointer-events-auto flex items-start gap-2.5 px-3.5 py-2.5 rounded border shadow-xl text-xs backdrop-blur-md ${
                toast.type === "success"
                  ? "bg-emerald-950/90 border-emerald-500/40 text-emerald-200"
                  : toast.type === "error"
                    ? "bg-rose-950/90 border-rose-500/40 text-rose-200"
                    : toast.type === "warning"
                      ? "bg-amber-950/90 border-amber-500/40 text-amber-200"
                      : "bg-zinc-900/95 border-zinc-700 text-zinc-200"
              }`}
            >
              {toast.type === "success" && (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              )}
              {toast.type === "error" && (
                <XCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              )}
              {toast.type === "warning" && (
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              )}
              {toast.type === "info" && (
                <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
              )}
              <span className="flex-1 leading-relaxed break-words">
                {toast.message}
              </span>
              <button
                type="button"
                aria-label="Đóng thông báo"
                onClick={() =>
                  setToasts((prev) => prev.filter((item) => item.id !== toast.id))
                }
                className="text-zinc-400 hover:text-zinc-100 transition-colors p-0.5 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Confirm Dialog */}
      <AnimatePresence>
        {activeConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16, ease: MOTION_EASE }}
            onClick={(e) => {
              if (e.target === e.currentTarget) handleConfirmDecision(false);
            }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          >
            <motion.div
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="reader-confirm-title"
              aria-describedby="reader-confirm-desc"
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 6 }}
              transition={MOTION_SPRING}
              className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded p-5 shadow-2xl space-y-4"
            >
              <div className="flex items-start gap-3">
                <div
                  className={`p-2 rounded border shrink-0 ${
                    variant === "danger"
                      ? "bg-rose-500/10 border-rose-500/30 text-rose-400"
                      : variant === "warning"
                        ? "bg-amber-500/10 border-amber-500/30 text-amber-400"
                        : "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                  }`}
                >
                  {variant === "danger" ? (
                    <Trash2 className="w-4 h-4" />
                  ) : variant === "warning" ? (
                    <AlertTriangle className="w-4 h-4" />
                  ) : (
                    <Info className="w-4 h-4" />
                  )}
                </div>
                <div className="space-y-1 flex-1 min-w-0">
                  <h3
                    id="reader-confirm-title"
                    className="text-sm font-semibold text-zinc-100 font-mono"
                  >
                    {activeConfirm.title || "XÁC NHẬN THAO TÁC"}
                  </h3>
                  <p
                    id="reader-confirm-desc"
                    className="text-xs text-zinc-400 leading-relaxed whitespace-pre-wrap"
                  >
                    {activeConfirm.message}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
                <button
                  ref={cancelBtnRef}
                  type="button"
                  onClick={() => handleConfirmDecision(false)}
                  className="px-3.5 py-1.5 rounded border border-zinc-700 bg-zinc-950 text-zinc-300 hover:bg-zinc-800 text-xs font-medium transition-colors cursor-pointer"
                >
                  {activeConfirm.cancelLabel || "Hủy"}
                </button>
                <button
                  type="button"
                  onClick={() => handleConfirmDecision(true)}
                  className={`px-3.5 py-1.5 rounded text-xs font-medium transition-colors cursor-pointer ${
                    variant === "danger"
                      ? "bg-rose-600 hover:bg-rose-500 text-white"
                      : "bg-emerald-500 hover:bg-emerald-400 text-zinc-950"
                  }`}
                >
                  {activeConfirm.confirmLabel || "Xác nhận"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </FeedbackContext.Provider>
  );
};

export const useToast = () => {
  const ctx = useContext(FeedbackContext);
  if (!ctx) {
    throw new Error("useToast must be used within FeedbackProvider");
  }
  return ctx;
};

export const useConfirm = () => {
  const ctx = useContext(FeedbackContext);
  if (!ctx) {
    throw new Error("useConfirm must be used within FeedbackProvider");
  }
  return ctx.confirm;
};

