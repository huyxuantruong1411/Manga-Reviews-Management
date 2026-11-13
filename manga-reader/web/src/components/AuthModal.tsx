import React, { useState, useEffect } from "react";
import { LayoutGroup } from "motion/react";
import { X, Lock, Mail, ShieldCheck, ArrowRight, RotateCcw } from "lucide-react";
import { api, UserProfile } from "@/api/client";
import { AnimatedTabPanel, AnimatedTabPill, ModalMotion } from "./MotionPrimitives";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (user: UserProfile) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [tab, setTab] = useState<"login" | "register" | "verify_otp">("login");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [countdown, setCountdown] = useState(120);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState("");

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    if (isOpen && tab === "verify_otp" && countdown > 0) {
      timer = setInterval(() => setCountdown((c) => c - 1), 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isOpen, tab, countdown]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await api.login({ email, password });
      onSuccess(data.user);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Đăng nhập thất bại.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.register({ email, username, password, display_name: displayName });
      setRegisteredEmail(email);
      setTab("verify_otp");
      setCountdown(120);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Đăng ký thất bại.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.verifyEmail({ email: registeredEmail, otp_code: otpCode.trim() });
      const data = await api.login({ email: registeredEmail, password });
      onSuccess(data.user);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Xác thực OTP thất bại.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (countdown > 0) return;
    try {
      await api.resendOtp(registeredEmail);
      setCountdown(120);
      setError(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Không thể gửi lại OTP.";
      setError(msg);
    }
  };

  return (
    <ModalMotion
      isOpen={isOpen}
      onClose={onClose}
      ariaLabel={tab === "register" ? "Đăng ký tài khoản" : "Đăng nhập hệ thống"}
      maxWidthClass="max-w-sm"
    >
      <div className="bg-zinc-900 border border-zinc-800 rounded-md shadow-2xl p-6 relative">
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng cửa sổ đăng nhập"
          className="absolute top-4 right-4 p-1 text-zinc-400 hover:text-zinc-100 rounded hover:bg-zinc-800 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Tab switcher */}
        {tab !== "verify_otp" ? (
          <LayoutGroup id="auth-modal-tabs">
            <div className="grid grid-cols-2 p-1 rounded bg-zinc-950 border border-zinc-800 mb-6 mt-2">
              <button
                type="button"
                onClick={() => {
                  setTab("login");
                  setError(null);
                }}
                className={`relative py-2 text-xs font-mono font-medium text-center rounded transition-colors ${
                  tab === "login" ? "text-emerald-300" : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {tab === "login" && (
                  <AnimatedTabPill
                    layoutId="auth-modal-tab-pill"
                    className="rounded bg-emerald-500/15 border border-emerald-500/40"
                  />
                )}
                <span className="relative z-10">ĐĂNG NHẬP</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setTab("register");
                  setError(null);
                }}
                className={`relative py-2 text-xs font-mono font-medium text-center rounded transition-colors ${
                  tab === "register" ? "text-emerald-300" : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {tab === "register" && (
                  <AnimatedTabPill
                    layoutId="auth-modal-tab-pill"
                    className="rounded bg-emerald-500/15 border border-emerald-500/40"
                  />
                )}
                <span className="relative z-10">ĐĂNG KÝ</span>
              </button>
            </div>
          </LayoutGroup>
        ) : (
          <div className="mb-4 text-center">
            <div className="w-10 h-10 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mx-auto mb-2">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-semibold text-zinc-100">Xác Thực Mã OTP</h3>
            <p className="text-xs text-zinc-400 mt-1">
              Mã gồm 6 chữ số đã được gửi tới{" "}
              <span className="font-mono text-zinc-200">{registeredEmail}</span>
            </p>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="mb-4 p-2.5 rounded bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-medium"
          >
            {error}
          </div>
        )}

        <AnimatedTabPanel tabKey={tab}>
          {tab === "login" && (
            <form onSubmit={handleLogin} className="space-y-3">
              <div>
                <label htmlFor="auth-login-email" className="block text-[11px] font-mono text-zinc-400 mb-1">
                  EMAIL HOẶC USERNAME
                </label>
                <div className="relative">
                  <Mail className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <input
                    id="auth-login-email"
                    type="text"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin hoặc admin@mangareader.local"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded px-8 py-2 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500 font-sans"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="auth-login-password"
                  className="block text-[11px] font-mono text-zinc-400 mb-1"
                >
                  MẬT KHẨU
                </label>
                <div className="relative">
                  <Lock className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <input
                    id="auth-login-password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded px-8 py-2 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500 font-sans"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 rounded bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-xs font-mono transition-colors flex items-center justify-center gap-1.5 mt-4 disabled:opacity-50"
              >
                <span>{loading ? "ĐANG XỬ LÝ..." : "ĐĂNG NHẬP HỆ THỐNG"}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </form>
          )}

          {tab === "register" && (
            <form onSubmit={handleRegister} className="space-y-3">
              <div>
                <label htmlFor="auth-reg-email" className="block text-[11px] font-mono text-zinc-400 mb-1">
                  EMAIL
                </label>
                <input
                  id="auth-reg-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="user@example.com"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label htmlFor="auth-reg-username" className="block text-[11px] font-mono text-zinc-400 mb-1">
                  USERNAME
                </label>
                <input
                  id="auth-reg-username"
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="manga_fan99"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label htmlFor="auth-reg-display" className="block text-[11px] font-mono text-zinc-400 mb-1">
                  TÊN HIỂN THỊ
                </label>
                <input
                  id="auth-reg-display"
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Otaku Reader"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label htmlFor="auth-reg-password" className="block text-[11px] font-mono text-zinc-400 mb-1">
                  MẬT KHẨU (≥ 8 KÝ TỰ, CHỮ & SỐ)
                </label>
                <input
                  id="auth-reg-password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Pass123456"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 rounded bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-xs font-mono transition-colors flex items-center justify-center gap-1.5 mt-4 disabled:opacity-50"
              >
                <span>{loading ? "ĐANG TẠO..." : "TẠO TÀI KHOẢN & NHẬN OTP"}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </form>
          )}

          {tab === "verify_otp" && (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div>
                <label
                  htmlFor="auth-otp-input"
                  className="block text-[11px] font-mono text-zinc-400 mb-1 text-center"
                >
                  NHẬP MÃ OTP 6 CHỮ SỐ
                </label>
                <input
                  id="auth-otp-input"
                  type="text"
                  required
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  placeholder="123456"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-4 py-2.5 text-center text-lg tracking-widest font-mono text-emerald-400 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span>
                  Hết hạn sau: <span className="font-mono text-emerald-400">{countdown}s</span>
                </span>
                <button
                  type="button"
                  disabled={countdown > 0}
                  onClick={handleResendOtp}
                  className="text-zinc-300 hover:text-emerald-400 disabled:opacity-40 flex items-center gap-1 transition-colors"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Gửi lại</span>
                </button>
              </div>

              <button
                type="submit"
                disabled={loading || otpCode.length < 6}
                className="w-full py-2.5 px-4 rounded bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-xs font-mono transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <span>{loading ? "ĐANG XÁC THỰC..." : "XÁC NHẬN & ĐĂNG NHẬP"}</span>
              </button>
            </form>
          )}
        </AnimatedTabPanel>
      </div>
    </ModalMotion>
  );
};
