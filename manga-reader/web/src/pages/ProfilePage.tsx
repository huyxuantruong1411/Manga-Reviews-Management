import React, { useEffect, useRef, useState } from "react";
import { User, Lock, Save, Camera } from "lucide-react";
import { api, UserProfile } from "@/api/client";
import { useToast } from "@/components/ToastProvider";

interface ProfilePageProps {
  currentUser: UserProfile | null;
  onUpdateUser: (u: UserProfile) => void;
  onOpenAuth: () => void;
}

export const ProfilePage: React.FC<ProfilePageProps> = ({
  currentUser,
  onUpdateUser,
  onOpenAuth,
}) => {
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Declare all hooks unconditionally before any early return
  const [displayName, setDisplayName] = useState(currentUser?.display_name || "");
  const [bio, setBio] = useState(currentUser?.bio || "");
  const [birthDate, setBirthDate] = useState(currentUser?.birth_date || "");
  const [showBirthDate, setShowBirthDate] = useState(Boolean(currentUser?.show_birth_date));
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [avatarImgError, setAvatarImgError] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ type: "success" | "error"; text: string } | null>(
    null
  );
  const [profileLoading, setProfileLoading] = useState(false);

  // Password update
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passMsg, setPassMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [passLoading, setPassLoading] = useState(false);

  useEffect(() => {
    setDisplayName(currentUser?.display_name || "");
    setBio(currentUser?.bio || "");
    setBirthDate(currentUser?.birth_date || "");
    setShowBirthDate(Boolean(currentUser?.show_birth_date));
    setAvatarImgError(false);
  }, [currentUser]);

  if (!currentUser) {
    return (
      <div className="max-w-md mx-auto my-16 p-8 text-center rounded bg-zinc-900 border border-zinc-800 space-y-4">
        <User className="w-10 h-10 text-emerald-400 mx-auto" />
        <h2 className="text-base font-bold font-mono text-zinc-100">HỒ SƠ CÁ NHÂN</h2>
        <p className="text-xs text-zinc-400">
          Vui lòng đăng nhập để xem và quản lý thông tin tài khoản.
        </p>
        <button
          type="button"
          onClick={onOpenAuth}
          className="px-4 py-2 rounded bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-mono font-bold text-xs transition-colors"
        >
          Đăng Nhập Ngay
        </button>
      </div>
    );
  }

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      showToast("Ảnh đại diện vượt quá giới hạn 5MB.", "error");
      return;
    }
    setAvatarLoading(true);
    try {
      const updated = await api.uploadAvatar(file);
      onUpdateUser(updated);
      setAvatarImgError(false);
      showToast("Đã cập nhật ảnh đại diện.", "success");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Không thể tải ảnh đại diện.";
      showToast(msg, "error");
    } finally {
      setAvatarLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileMsg(null);
    setProfileLoading(true);
    try {
      const updated = await api.updateProfile({
        display_name: displayName,
        bio,
        birth_date: birthDate ? birthDate : null,
        show_birth_date: showBirthDate,
      });
      onUpdateUser(updated);
      const msg = "Đã cập nhật thông tin hồ sơ thành công.";
      setProfileMsg({ type: "success", text: msg });
      showToast(msg, "success");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Không thể cập nhật hồ sơ.";
      setProfileMsg({ type: "error", text: msg });
      showToast(msg, "error");
    } finally {
      setProfileLoading(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPassMsg(null);
    if (newPassword !== confirmPassword) {
      setPassMsg({ type: "error", text: "Mật khẩu xác nhận không khớp." });
      return;
    }
    setPassLoading(true);
    try {
      await api.updatePassword({
        current_password: oldPassword,
        new_password: newPassword,
        confirm_password: confirmPassword,
      });
      const msg = "Đổi mật khẩu thành công. Các phiên đăng nhập khác đã được thu hồi.";
      setPassMsg({ type: "success", text: msg });
      showToast("Đã cập nhật mật khẩu thành công.", "success");
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Đổi mật khẩu thất bại.";
      setPassMsg({ type: "error", text: msg });
      showToast(msg, "error");
    } finally {
      setPassLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div className="pb-4 border-b border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold font-mono text-zinc-100 tracking-tight">
            CÀI ĐẶT HỒ SƠ & BẢO MẬT
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Quản lý định danh độc giả, mật khẩu và phiên làm việc
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-full bg-zinc-900 border border-zinc-700 overflow-hidden flex items-center justify-center shrink-0">
            {currentUser.avatar_url && !avatarImgError ? (
              <img
                src={currentUser.avatar_url}
                alt={currentUser.display_name}
                onError={() => setAvatarImgError(true)}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-lg font-bold font-mono text-emerald-400">
                {currentUser.display_name.charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleAvatarUpload}
              className="hidden"
              aria-label="Chọn ảnh đại diện mới"
            />
            <button
              type="button"
              disabled={avatarLoading}
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-xs font-mono text-zinc-200 inline-flex items-center gap-1.5 transition-colors disabled:opacity-40"
            >
              <Camera className="w-3.5 h-3.5 text-emerald-400" />
              <span>{avatarLoading ? "Đang tải ảnh..." : "Đổi Ảnh Đại Diện"}</span>
            </button>
            <p className="text-[10px] font-mono text-zinc-500 mt-1">
              @{currentUser.username} &bull; {currentUser.role.toUpperCase()}
            </p>
          </div>
        </div>
      </div>

      {/* Profile Form */}
      <div className="p-6 rounded bg-zinc-900 border border-zinc-800 space-y-4">
        <h2 className="text-sm font-bold font-mono text-zinc-200 flex items-center gap-2">
          <User className="w-4 h-4 text-emerald-400" />
          <span>THÔNG TIN CÁ NHÂN</span>
        </h2>

        {profileMsg && (
          <div
            role="status"
            className={`p-3 rounded text-xs font-mono border ${
              profileMsg.type === "success"
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                : "bg-rose-500/10 border-rose-500/30 text-rose-300"
            }`}
          >
            {profileMsg.text}
          </div>
        )}

        <form onSubmit={handleUpdateProfile} className="space-y-4 text-xs font-mono">
          <div>
            <label htmlFor="profile-email" className="block text-zinc-400 mb-1 text-[11px]">
              EMAIL ĐĂNG KÝ (BẤT BIẾN)
            </label>
            <input
              id="profile-email"
              type="text"
              disabled
              value={currentUser.email}
              className="w-full bg-zinc-950/50 border border-zinc-800/80 rounded p-2 text-zinc-400 cursor-not-allowed"
            />
          </div>

          <div>
            <label htmlFor="profile-display-name" className="block text-zinc-400 mb-1 text-[11px]">
              TÊN HIỂN THỊ (PUBLIC DISPLAY NAME)
            </label>
            <input
              id="profile-display-name"
              type="text"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-zinc-200 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label htmlFor="profile-bio" className="block text-zinc-400 mb-1 text-[11px]">
              TIỂU SỬ (BIO - TỐI ĐA 500 KÝ TỰ)
            </label>
            <textarea
              id="profile-bio"
              rows={3}
              maxLength={500}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Giới thiệu đôi nét về bản thân hoặc sở thích truyện..."
              className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-zinc-200 focus:outline-none focus:border-emerald-500 font-sans"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
            <div>
              <label htmlFor="profile-birth-date" className="block text-zinc-400 mb-1 text-[11px]">
                NGÀY SINH (TÙY CHỌN)
              </label>
              <input
                id="profile-birth-date"
                type="date"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-zinc-200 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer pb-2">
              <input
                type="checkbox"
                checked={showBirthDate}
                onChange={(e) => setShowBirthDate(e.target.checked)}
                className="rounded border-zinc-700 text-emerald-500 bg-zinc-950 focus:ring-0"
              />
              <span>Hiển thị ngày sinh công khai</span>
            </label>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={profileLoading}
              className="px-4 py-2 rounded bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs flex items-center gap-1.5 transition-colors disabled:opacity-40"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{profileLoading ? "Đang lưu..." : "LƯU THAY ĐỔI"}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Password Form */}
      <div className="p-6 rounded bg-zinc-900 border border-zinc-800 space-y-4">
        <h2 className="text-sm font-bold font-mono text-zinc-200 flex items-center gap-2">
          <Lock className="w-4 h-4 text-emerald-400" />
          <span>ĐỔI MẬT KHẨU & THU HỒI PHIÊN</span>
        </h2>

        {passMsg && (
          <div
            role="status"
            className={`p-3 rounded text-xs font-mono border ${
              passMsg.type === "success"
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                : "bg-rose-500/10 border-rose-500/30 text-rose-300"
            }`}
          >
            {passMsg.text}
          </div>
        )}

        <form onSubmit={handleUpdatePassword} className="space-y-4 text-xs font-mono">
          <div>
            <label htmlFor="profile-old-pass" className="block text-zinc-400 mb-1 text-[11px]">
              MẬT KHẨU HIỆN TẠI
            </label>
            <input
              id="profile-old-pass"
              type="password"
              required
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-zinc-200 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="profile-new-pass" className="block text-zinc-400 mb-1 text-[11px]">
                MẬT KHẨU MỚI (≥ 8 KÝ TỰ, CHỮ & SỐ)
              </label>
              <input
                id="profile-new-pass"
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-zinc-200 focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label
                htmlFor="profile-confirm-pass"
                className="block text-zinc-400 mb-1 text-[11px]"
              >
                XÁC NHẬN MẬT KHẨU MỚI
              </label>
              <input
                id="profile-confirm-pass"
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-zinc-200 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={passLoading || !newPassword || !oldPassword}
              className="px-4 py-2 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 font-bold text-xs flex items-center gap-1.5 transition-colors disabled:opacity-40"
            >
              <span>{passLoading ? "Đang cập nhật..." : "CẬP NHẬT MẬT KHẨU"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
