/**
 * FileAttachmentExtension — Custom Tiptap Node for file attachments
 * (PDF, documents, spreadsheets, etc.)
 * Renders a styled download card.
 */

import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import React from "react";
import { NodeViewWrapper } from "@tiptap/react";
import { Trash2, FileText, Download, FileSpreadsheet, FileImage, File, Archive } from "lucide-react";

// Map file extensions to icons and colors
const FILE_ICON_MAP: Record<string, { icon: any; color: string; bg: string }> = {
  pdf: { icon: FileText, color: "text-red-500", bg: "from-red-500 to-rose-600" },
  doc: { icon: FileText, color: "text-blue-500", bg: "from-blue-500 to-indigo-600" },
  docx: { icon: FileText, color: "text-blue-500", bg: "from-blue-500 to-indigo-600" },
  xls: { icon: FileSpreadsheet, color: "text-green-500", bg: "from-green-500 to-emerald-600" },
  xlsx: { icon: FileSpreadsheet, color: "text-green-500", bg: "from-green-500 to-emerald-600" },
  csv: { icon: FileSpreadsheet, color: "text-green-500", bg: "from-green-500 to-emerald-600" },
  ppt: { icon: FileImage, color: "text-orange-500", bg: "from-orange-500 to-amber-600" },
  pptx: { icon: FileImage, color: "text-orange-500", bg: "from-orange-500 to-amber-600" },
  zip: { icon: Archive, color: "text-yellow-600", bg: "from-yellow-500 to-amber-600" },
  rar: { icon: Archive, color: "text-yellow-600", bg: "from-yellow-500 to-amber-600" },
  txt: { icon: FileText, color: "text-zinc-500", bg: "from-zinc-400 to-zinc-600" },
  md: { icon: FileText, color: "text-zinc-500", bg: "from-zinc-400 to-zinc-600" },
  json: { icon: FileText, color: "text-purple-500", bg: "from-purple-500 to-violet-600" },
  xml: { icon: FileText, color: "text-purple-500", bg: "from-purple-500 to-violet-600" },
};

const getFileInfo = (filename: string) => {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  return FILE_ICON_MAP[ext] || { icon: File, color: "text-zinc-500", bg: "from-zinc-400 to-zinc-600" };
};

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

// ─── React NodeView ──────────────────────────────────────────
const FileAttachmentNodeView: React.FC<{
  node: any;
  deleteNode: () => void;
  selected: boolean;
}> = ({ node, deleteNode, selected }) => {
  const { url, filename, size } = node.attrs;
  const fileInfo = getFileInfo(filename || "unknown");
  const IconComponent = fileInfo.icon;
  const ext = (filename || "").split(".").pop()?.toUpperCase() || "FILE";

  return (
    <NodeViewWrapper className="relative my-4">
      <div
        className={`relative mx-auto max-w-[480px] rounded-2xl border transition-all duration-200 ${
          selected
            ? "border-[var(--brand-orange)] ring-2 ring-[var(--brand-orange)]/30"
            : "border-[var(--border-primary)]"
        } bg-[var(--bg-card)] hover:shadow-md group`}
      >
        <div className="flex items-center space-x-3 p-3.5">
          {/* File type icon */}
          <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${fileInfo.bg} flex items-center justify-center shrink-0 shadow-sm`}>
            <IconComponent size={20} className="text-white" />
          </div>

          {/* File info */}
          <div className="flex-1 min-w-0">
            <div className="text-xs font-bold text-[var(--text-primary)] truncate">
              {filename || "Untitled file"}
            </div>
            <div className="flex items-center space-x-2 mt-0.5">
              <span className="text-[9px] font-bold text-white bg-zinc-400 dark:bg-zinc-600 px-1.5 py-0.5 rounded uppercase">
                {ext}
              </span>
              {size > 0 && (
                <span className="text-[10px] text-[var(--text-secondary)] font-semibold">
                  {formatFileSize(size)}
                </span>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center space-x-1 shrink-0">
            <a
              href={url}
              download={filename}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded-lg text-[var(--brand-orange)] hover:bg-orange-50 dark:hover:bg-orange-900/20 transition"
              title="Download"
            >
              <Download size={14} />
            </a>
            {selected && (
              <button
                onClick={deleteNode}
                className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition"
                title="Delete Attachment"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        </div>
      </div>
    </NodeViewWrapper>
  );
};

// ─── Tiptap Node Extension ──────────────────────────────────
export const FileAttachmentExtension = Node.create({
  name: "fileAttachment",
  group: "block",
  draggable: true,
  atom: true,

  addAttributes() {
    return {
      url: { default: null },
      filename: { default: "" },
      size: { default: 0 },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-file-attachment]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-file-attachment": "" }),
      ["a", { href: HTMLAttributes.url, download: HTMLAttributes.filename }, HTMLAttributes.filename],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(FileAttachmentNodeView);
  },

  addCommands() {
    return {
      setFileAttachment:
        (options: { url: string; filename?: string; size?: number }) =>
        ({ commands }: any) => {
          return commands.insertContent({
            type: this.name,
            attrs: options,
          });
        },
    };
  },
});
