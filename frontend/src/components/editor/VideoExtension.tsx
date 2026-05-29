/**
 * VideoExtension — Custom Tiptap Node for uploaded video files.
 * Renders a <video> player with controls, responsive sizing.
 */

import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import React, { useState } from "react";
import { NodeViewWrapper } from "@tiptap/react";
import { Trash2, Maximize2, AlignCenter, Play } from "lucide-react";

// ─── React NodeView ──────────────────────────────────────────
const VideoNodeView: React.FC<{
  node: any;
  updateAttributes: (attrs: any) => void;
  deleteNode: () => void;
  selected: boolean;
}> = ({ node, updateAttributes, deleteNode, selected }) => {
  const { src, width, filename } = node.attrs;
  const [isFullWidth, setIsFullWidth] = useState(width === "100%");

  return (
    <NodeViewWrapper className="relative my-4">
      <div
        className={`relative group ${isFullWidth ? "w-full" : "max-w-[640px]"} mx-auto`}
        style={{ width: isFullWidth ? "100%" : width }}
      >
        {/* Floating toolbar */}
        {selected && (
          <div className="absolute -top-10 left-1/2 -translate-x-1/2 z-30 flex items-center space-x-1 bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl shadow-xl px-2 py-1.5 animate-in fade-in duration-150">
            <button
              onClick={() => {
                const newFull = !isFullWidth;
                setIsFullWidth(newFull);
                updateAttributes({ width: newFull ? "100%" : "640px" });
              }}
              className="p-1 rounded-lg text-[var(--text-secondary)] hover:bg-gray-100 dark:hover:bg-zinc-800 transition"
              title="Toggle Full Width"
            >
              <Maximize2 size={14} />
            </button>
            <button
              onClick={deleteNode}
              className="p-1 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition"
              title="Delete Video"
            >
              <Trash2 size={14} />
            </button>
          </div>
        )}

        <div className={`relative rounded-xl overflow-hidden bg-black ${selected ? "ring-2 ring-[var(--brand-orange)] ring-offset-2" : ""}`}>
          <video
            src={src}
            controls
            preload="metadata"
            className="w-full h-auto max-h-[500px]"
            style={{ display: "block" }}
          >
            Your browser does not support the video tag.
          </video>
        </div>

        {filename && (
          <div className="text-center text-[10px] text-[var(--text-secondary)] font-semibold mt-1.5 flex items-center justify-center space-x-1">
            <Play size={10} />
            <span>{filename}</span>
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
};

// ─── Tiptap Node Extension ──────────────────────────────────
export const VideoExtension = Node.create({
  name: "video",
  group: "block",
  draggable: true,
  atom: true,

  addAttributes() {
    return {
      src: { default: null },
      width: { default: "100%" },
      filename: { default: "" },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-video]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-video": "" }),
      ["video", { src: HTMLAttributes.src, controls: "true" }],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(VideoNodeView);
  },

  addCommands() {
    return {
      setVideo:
        (options: { src: string; filename?: string; width?: string }) =>
        ({ commands }: any) => {
          return commands.insertContent({
            type: this.name,
            attrs: options,
          });
        },
    };
  },
});
