/**
 * AIResultPanel — Shows AI-generated text with diff view for rewrite mode.
 * Allows insert or discard of the generated content.
 */

import React from "react";
import { Check, X, RefreshCw, Wand2, FileText, Lightbulb } from "lucide-react";

interface AIResultPanelProps {
  text: string;
  mode: string;
  selectedText?: string;
  onInsert: (text: string) => void;
  onDiscard: () => void;
  onRegenerateRewrite?: () => void;
}

const MODE_LABELS: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  rewrite: {
    label: "Đề xuất viết lại",
    icon: <Wand2 size={13} />,
    color: "bg-purple-100 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300",
  },
  intro: {
    label: "Đoạn mở đầu được tạo",
    icon: <FileText size={13} />,
    color: "bg-blue-100 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300",
  },
  ideas: {
    label: "Ý tưởng được gợi ý",
    icon: <Lightbulb size={13} />,
    color: "bg-amber-100 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300",
  },
};

export const AIResultPanel: React.FC<AIResultPanelProps> = ({
  text,
  mode,
  selectedText,
  onInsert,
  onDiscard,
  onRegenerateRewrite,
}) => {
  const config = MODE_LABELS[mode] || MODE_LABELS.intro;

  return (
    <div className={`border rounded-2xl overflow-hidden shadow-lg ${config.color}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-current/20">
        <div className="flex items-center space-x-2 text-xs font-bold">
          {config.icon}
          <span>{config.label}</span>
        </div>
        <div className="flex items-center space-x-1.5">
          {mode === "rewrite" && onRegenerateRewrite && (
            <button
              onClick={onRegenerateRewrite}
              title="Tạo lại"
              className="p-1.5 hover:opacity-70 rounded-lg transition"
            >
              <RefreshCw size={13} />
            </button>
          )}
          <button
            onClick={onDiscard}
            title="Huỷ bỏ"
            className="p-1.5 hover:opacity-70 rounded-lg transition"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 bg-white/60 dark:bg-black/30">
        {mode === "rewrite" && selectedText && (
          <div className="mb-3">
            <div className="text-[10px] font-bold uppercase tracking-wider opacity-60 mb-1">Văn bản gốc</div>
            <div className="text-xs text-[var(--text-secondary)] line-through opacity-60 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-lg p-2.5 leading-relaxed">
              {selectedText}
            </div>
            <div className="text-[10px] font-bold uppercase tracking-wider opacity-60 mt-2.5 mb-1">Phiên bản cải thiện</div>
          </div>
        )}
        <div className="text-sm text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap bg-green-50/50 dark:bg-green-900/10 border border-green-200 dark:border-green-800 rounded-lg p-3">
          {text}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end space-x-2 px-4 py-3 border-t border-current/20">
        <button
          onClick={onDiscard}
          className="px-3 py-1.5 text-xs font-semibold hover:opacity-70 transition rounded-lg border border-current/30"
        >
          Huỷ bỏ
        </button>
        <button
          onClick={() => onInsert(text)}
          className="flex items-center space-x-1.5 px-4 py-1.5 bg-[var(--brand-orange)] hover:bg-[var(--brand-coral)] text-white rounded-lg text-xs font-bold transition shadow-sm"
        >
          <Check size={13} />
          <span>{mode === "rewrite" ? "Thay thế" : "Chèn vào bài"}</span>
        </button>
      </div>
    </div>
  );
};
