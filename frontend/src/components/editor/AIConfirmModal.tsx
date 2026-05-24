/**
 * AIConfirmModal — Shows prompt preview and token estimate before calling Gemini.
 * Required UX gate before any AI API call.
 */

import React from "react";
import { Sparkles, Wand2, FileText, Lightbulb, X } from "lucide-react";

interface AIConfirmModalProps {
  prompt: string;
  estimatedTokens: number;
  mode: string;
  selectedStyle?: string;
  customStyleText?: string;
  onStyleChange?: (styleId: string, customText?: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

const MODE_CONFIG: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  rewrite: {
    icon: <Wand2 size={18} />,
    label: "Viết lại đoạn văn chọn",
    color: "text-purple-500",
  },
  intro: {
    icon: <FileText size={18} />,
    label: "Tạo đoạn mở đầu review",
    color: "text-blue-500",
  },
  ideas: {
    icon: <Lightbulb size={18} />,
    label: "Gợi ý ý tưởng phân tích",
    color: "text-amber-500",
  },
};

const REWRITE_STYLES = [
  { id: "default", label: "✨ Viết lại hay hơn, sửa lỗi văn phong & chính tả (Mặc định)" },
  { id: "grammar", label: "📝 Chỉ sửa lỗi chính tả & ngữ pháp" },
  { id: "formal", label: "👔 Phong cách trang trọng, nghiêm túc" },
  { id: "humorous", label: "🤪 Phong cách hài hước, dí dỏm" },
  { id: "dramatic", label: "🔥 Phong cách kịch tính, lôi cuốn" },
  { id: "concise", label: "✂️ Tóm tắt ngắn gọn, súc tích" },
  { id: "detailed", label: "📖 Mở rộng chi tiết, phân tích sâu sắc" },
  { id: "poetic", label: "🎨 Phong cách bay bổng, giàu hình ảnh" },
  { id: "friendly", label: "💬 Phong cách gần gũi, dễ hiểu" },
  { id: "analytical", label: "🔬 Phân tích học thuật, chuyên sâu" },
  { id: "custom", label: "⚙️ Tùy chỉnh (Nhập yêu cầu riêng của bạn)" }
];

export const AIConfirmModal: React.FC<AIConfirmModalProps> = ({
  prompt,
  estimatedTokens,
  mode,
  selectedStyle = "default",
  customStyleText = "",
  onStyleChange,
  onConfirm,
  onCancel,
}) => {
  const config = MODE_CONFIG[mode] || { icon: <Sparkles size={18} />, label: mode, color: "text-purple-500" };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />

      {/* Modal */}
      <div className="relative bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-[var(--border-primary)]">
          <div className="flex items-center space-x-2.5">
            <div className={`${config.color}`}>{config.icon}</div>
            <div>
              <h3 className="font-bold text-[var(--text-primary)] text-sm">Xác nhận gọi AI</h3>
              <p className="text-xs text-[var(--text-secondary)]">{config.label}</p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="p-1.5 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg transition text-[var(--text-secondary)]"
          >
            <X size={16} />
          </button>
        </div>

        {/* Token info */}
        <div className="px-5 py-3 bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/10 dark:to-blue-900/10 border-b border-[var(--border-primary)]">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[var(--text-secondary)]">Ước tính token sẽ sử dụng:</span>
            <span className="font-bold text-[var(--text-primary)]">~{estimatedTokens.toLocaleString()} tokens</span>
          </div>
          <div className="flex items-center justify-between text-xs mt-1">
            <span className="text-[var(--text-secondary)]">Model:</span>
            <span className="font-semibold text-purple-600 dark:text-purple-400">Gemini 3.5 Flash</span>
          </div>
        </div>

        {/* Style selection for rewrite mode */}
        {mode === "rewrite" && onStyleChange && (
          <div className="px-5 py-4 border-b border-[var(--border-primary)] space-y-3 bg-[var(--bg-primary)]/30">
            <label className="block text-[10px] font-extrabold text-[var(--text-secondary)] uppercase tracking-wider">
              Chọn phong cách / Yêu cầu viết lại:
            </label>
            <select
              value={selectedStyle}
              onChange={(e) => onStyleChange(e.target.value, customStyleText)}
              className="w-full text-xs bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl px-3 py-2.5 outline-none focus:border-[var(--brand-orange)] text-[var(--text-primary)] transition font-bold"
            >
              {REWRITE_STYLES.map((style) => (
                <option key={style.id} value={style.id}>
                  {style.label}
                </option>
              ))}
            </select>

            {selectedStyle === "custom" && (
              <div className="space-y-1.5 animate-in fade-in slide-in-from-top-1 duration-150">
                <label className="block text-[9px] font-extrabold text-[var(--text-secondary)] uppercase tracking-wider">
                  Nhập yêu cầu tùy chỉnh:
                </label>
                <input
                  type="text"
                  value={customStyleText}
                  onChange={(e) => onStyleChange("custom", e.target.value)}
                  placeholder="Ví dụ: Dịch sang tiếng Anh, viết theo phong cách thơ..."
                  className="w-full text-xs bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl px-3 py-2 outline-none focus:border-[var(--brand-orange)] text-[var(--text-primary)] transition font-semibold"
                />
              </div>
            )}
          </div>
        )}

        {/* Prompt preview */}
        <div className="p-5">
          <p className="text-[10px] text-[var(--text-secondary)] font-bold uppercase tracking-wider mb-2">
            Prompt sẽ gửi tới AI
          </p>
          <div className="bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-xl p-3 max-h-40 overflow-y-auto">
            <pre className="text-xs text-[var(--text-primary)] whitespace-pre-wrap font-mono leading-relaxed">
              {prompt}
            </pre>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end space-x-2 px-5 pb-5">
          <button
            onClick={onCancel}
            className="px-4 py-2 border border-[var(--border-primary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-gray-50 dark:hover:bg-zinc-800 rounded-xl text-xs font-semibold transition"
          >
            Huỷ
          </button>
          <button
            onClick={onConfirm}
            className="px-5 py-2 bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-600 hover:to-indigo-600 text-white rounded-xl text-xs font-bold flex items-center space-x-1.5 shadow-md transition"
          >
            <Sparkles size={13} />
            <span>Gọi AI</span>
          </button>
        </div>
      </div>
    </div>
  );
};
