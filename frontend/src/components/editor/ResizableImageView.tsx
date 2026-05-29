/**
 * ResizableImageView — React NodeView for ResizableImageExtension.
 * Features: drag-to-resize, alignment controls, caption, floating toolbar.
 */

import React, { useState, useRef, useCallback, useEffect } from "react";
import { NodeViewWrapper } from "@tiptap/react";
import {
  AlignLeft, AlignCenter, AlignRight, Maximize2, Trash2, Type,
  GripVertical
} from "lucide-react";

interface ResizableImageViewProps {
  node: any;
  updateAttributes: (attrs: any) => void;
  deleteNode: () => void;
  selected: boolean;
}

export const ResizableImageView: React.FC<ResizableImageViewProps> = ({
  node,
  updateAttributes,
  deleteNode,
  selected,
}) => {
  const { src, alt, width, alignment, caption } = node.attrs;
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [showCaption, setShowCaption] = useState(!!caption);
  const [captionText, setCaptionText] = useState(caption || "");
  const [currentWidth, setCurrentWidth] = useState<number | null>(null);

  const startResize = useCallback(
    (e: React.MouseEvent, corner: string) => {
      e.preventDefault();
      e.stopPropagation();
      setIsResizing(true);

      const startX = e.clientX;
      const startY = e.clientY;
      const container = containerRef.current?.parentElement;
      if (!container || !imgRef.current) return;

      const containerWidth = container.getBoundingClientRect().width;
      const imgRect = imgRef.current.getBoundingClientRect();
      const startImgWidth = imgRect.width;
      const aspectRatio = imgRect.width / imgRect.height;

      const onMouseMove = (ev: MouseEvent) => {
        let dx = ev.clientX - startX;
        if (corner === "left" || corner === "top-left" || corner === "bottom-left") {
          dx = -dx;
        }
        const newWidth = Math.max(100, Math.min(containerWidth, startImgWidth + dx));
        const pct = Math.round((newWidth / containerWidth) * 100);
        setCurrentWidth(pct);
      };

      const onMouseUp = () => {
        setIsResizing(false);
        if (currentWidth !== null) {
          updateAttributes({ width: `${currentWidth}%` });
        }
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [currentWidth, updateAttributes]
  );

  // Sync currentWidth when width changes externally
  useEffect(() => {
    const numW = parseInt(width);
    if (!isNaN(numW)) setCurrentWidth(numW);
  }, [width]);

  const handleCaptionBlur = () => {
    updateAttributes({ caption: captionText });
  };

  const alignClass = {
    left: "mr-auto",
    center: "mx-auto",
    right: "ml-auto",
    full: "w-full",
  }[alignment] || "mx-auto";

  const displayWidth = currentWidth ? `${currentWidth}%` : width;

  return (
    <NodeViewWrapper className="relative my-4" data-drag-handle>
      <div
        ref={containerRef}
        className={`relative group ${alignClass}`}
        style={{ width: alignment === "full" ? "100%" : displayWidth, maxWidth: "100%" }}
      >
        {/* Floating toolbar */}
        {selected && (
          <div className="absolute -top-10 left-1/2 -translate-x-1/2 z-30 flex items-center space-x-1 bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl shadow-xl px-2 py-1.5 animate-in fade-in slide-in-from-bottom-1 duration-150">
            <button
              onClick={() => updateAttributes({ alignment: "left" })}
              className={`p-1 rounded-lg transition ${alignment === "left" ? "text-[var(--brand-orange)] bg-orange-50 dark:bg-orange-900/20" : "text-[var(--text-secondary)] hover:bg-gray-100 dark:hover:bg-zinc-800"}`}
              title="Align Left"
            >
              <AlignLeft size={14} />
            </button>
            <button
              onClick={() => updateAttributes({ alignment: "center" })}
              className={`p-1 rounded-lg transition ${alignment === "center" ? "text-[var(--brand-orange)] bg-orange-50 dark:bg-orange-900/20" : "text-[var(--text-secondary)] hover:bg-gray-100 dark:hover:bg-zinc-800"}`}
              title="Align Center"
            >
              <AlignCenter size={14} />
            </button>
            <button
              onClick={() => updateAttributes({ alignment: "right" })}
              className={`p-1 rounded-lg transition ${alignment === "right" ? "text-[var(--brand-orange)] bg-orange-50 dark:bg-orange-900/20" : "text-[var(--text-secondary)] hover:bg-gray-100 dark:hover:bg-zinc-800"}`}
              title="Align Right"
            >
              <AlignRight size={14} />
            </button>
            <button
              onClick={() => updateAttributes({ alignment: "full" })}
              className={`p-1 rounded-lg transition ${alignment === "full" ? "text-[var(--brand-orange)] bg-orange-50 dark:bg-orange-900/20" : "text-[var(--text-secondary)] hover:bg-gray-100 dark:hover:bg-zinc-800"}`}
              title="Full Width"
            >
              <Maximize2 size={14} />
            </button>

            <div className="w-px h-4 bg-[var(--border-primary)] mx-0.5" />

            <button
              onClick={() => {
                setShowCaption(!showCaption);
                if (showCaption) {
                  updateAttributes({ caption: "" });
                  setCaptionText("");
                }
              }}
              className={`p-1 rounded-lg transition ${showCaption ? "text-[var(--brand-orange)] bg-orange-50 dark:bg-orange-900/20" : "text-[var(--text-secondary)] hover:bg-gray-100 dark:hover:bg-zinc-800"}`}
              title="Toggle Caption"
            >
              <Type size={14} />
            </button>

            <div className="w-px h-4 bg-[var(--border-primary)] mx-0.5" />

            <button
              onClick={deleteNode}
              className="p-1 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition"
              title="Delete Image"
            >
              <Trash2 size={14} />
            </button>

            {/* Width indicator */}
            <span className="text-[9px] font-bold text-[var(--text-secondary)] ml-1 tabular-nums">
              {displayWidth}
            </span>
          </div>
        )}

        {/* Image with resize handles */}
        <div className={`relative inline-block w-full ${selected ? "ring-2 ring-[var(--brand-orange)] ring-offset-2 rounded-lg" : ""}`}>
          <img
            ref={imgRef}
            src={src}
            alt={alt}
            className="w-full h-auto rounded-lg select-none"
            draggable={false}
          />

          {/* Resize handles - only show when selected */}
          {selected && (
            <>
              {/* Right handle */}
              <div
                className="absolute top-1/2 -right-2 -translate-y-1/2 w-4 h-10 bg-[var(--brand-orange)] rounded-full cursor-ew-resize flex items-center justify-center shadow-md hover:scale-110 transition opacity-80 hover:opacity-100"
                onMouseDown={(e) => startResize(e, "right")}
              >
                <GripVertical size={10} className="text-white" />
              </div>
              {/* Left handle */}
              <div
                className="absolute top-1/2 -left-2 -translate-y-1/2 w-4 h-10 bg-[var(--brand-orange)] rounded-full cursor-ew-resize flex items-center justify-center shadow-md hover:scale-110 transition opacity-80 hover:opacity-100"
                onMouseDown={(e) => startResize(e, "left")}
              >
                <GripVertical size={10} className="text-white" />
              </div>
              {/* Corner handles */}
              <div
                className="absolute -bottom-1.5 -right-1.5 w-3.5 h-3.5 bg-[var(--brand-orange)] rounded-full cursor-nwse-resize shadow-md hover:scale-125 transition"
                onMouseDown={(e) => startResize(e, "bottom-right")}
              />
              <div
                className="absolute -bottom-1.5 -left-1.5 w-3.5 h-3.5 bg-[var(--brand-orange)] rounded-full cursor-nesw-resize shadow-md hover:scale-125 transition"
                onMouseDown={(e) => startResize(e, "bottom-left")}
              />
              <div
                className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-[var(--brand-orange)] rounded-full cursor-nesw-resize shadow-md hover:scale-125 transition"
                onMouseDown={(e) => startResize(e, "top-right")}
              />
              <div
                className="absolute -top-1.5 -left-1.5 w-3.5 h-3.5 bg-[var(--brand-orange)] rounded-full cursor-nwse-resize shadow-md hover:scale-125 transition"
                onMouseDown={(e) => startResize(e, "top-left")}
              />
            </>
          )}
        </div>

        {/* Caption */}
        {showCaption && (
          <input
            type="text"
            value={captionText}
            onChange={(e) => setCaptionText(e.target.value)}
            onBlur={handleCaptionBlur}
            placeholder="Add a caption..."
            className="w-full text-center text-xs text-[var(--text-secondary)] bg-transparent border-none outline-none mt-2 font-medium italic placeholder:text-zinc-400 dark:placeholder:text-zinc-600"
          />
        )}
      </div>
    </NodeViewWrapper>
  );
};
