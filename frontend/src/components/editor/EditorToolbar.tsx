/**
 * EditorToolbar — Rich formatting toolbar for the ReviewEditor.
 * Includes text formatting, headings, lists, alignment, links, image, and AI buttons.
 */

import React, { useState } from "react";
import {
  Bold, Italic, Strikethrough, Code, Underline as UnderlineIcon,
  Heading1, Heading2, Heading3,
  Quote, Minus,
  List, ListOrdered, ListChecks,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Link as LinkIcon, Image as ImageIcon, AtSign,
  Undo, Redo,
  Sparkles, Wand2, Lightbulb, FileText, Highlighter
} from "lucide-react";

interface EditorToolbarProps {
  editor: any;
  onImageUpload: () => void;
  onAI: (mode: "rewrite" | "intro" | "ideas") => void;
  aiLoading: boolean;
  onInsertMangaRef: () => void;
}

const ToolbarBtn: React.FC<{
  onClick: () => void;
  isActive?: boolean;
  title: string;
  disabled?: boolean;
  children: React.ReactNode;
}> = ({ onClick, isActive, title, disabled, children }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    title={title}
    className={`p-1.5 rounded-lg transition-all duration-150 ${
      isActive
        ? "text-[var(--brand-orange)] bg-orange-50 dark:bg-orange-900/20"
        : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-gray-100 dark:hover:bg-zinc-800"
    } disabled:opacity-30 disabled:cursor-not-allowed`}
  >
    {children}
  </button>
);

const Divider = () => (
  <div className="w-px h-5 bg-[var(--border-primary)] mx-0.5 shrink-0" />
);

export const EditorToolbar: React.FC<EditorToolbarProps> = ({
  editor,
  onImageUpload,
  onAI,
  aiLoading,
  onInsertMangaRef,
}) => {
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [showAiMenu, setShowAiMenu] = useState(false);

  if (!editor) return null;

  const handleSetLink = () => {
    if (!linkUrl) {
      editor.chain().focus().unsetLink().run();
    } else {
      editor.chain().focus().setLink({ href: linkUrl, target: "_blank" }).run();
    }
    setLinkUrl("");
    setShowLinkInput(false);
  };

  return (
    <div className="relative z-10">
      <div className="flex flex-wrap gap-0.5 p-2 border border-[var(--border-primary)] bg-[var(--bg-primary)]/60 backdrop-blur-sm rounded-xl items-center text-[var(--text-secondary)]">
        {/* Text Formatting */}
        <ToolbarBtn onClick={() => editor.chain().focus().toggleBold().run()} isActive={editor.isActive("bold")} title="Bold (Ctrl+B)">
          <Bold size={15} />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleItalic().run()} isActive={editor.isActive("italic")} title="Italic (Ctrl+I)">
          <Italic size={15} />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleUnderline().run()} isActive={editor.isActive("underline")} title="Underline (Ctrl+U)">
          <UnderlineIcon size={15} />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleStrike().run()} isActive={editor.isActive("strike")} title="Strikethrough">
          <Strikethrough size={15} />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleCode().run()} isActive={editor.isActive("code")} title="Inline Code">
          <Code size={15} />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleHighlight().run()} isActive={editor.isActive("highlight")} title="Highlight">
          <Highlighter size={15} />
        </ToolbarBtn>

        <Divider />

        {/* Headings */}
        <ToolbarBtn onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} isActive={editor.isActive("heading", { level: 1 })} title="Heading 1">
          <Heading1 size={15} />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} isActive={editor.isActive("heading", { level: 2 })} title="Heading 2">
          <Heading2 size={15} />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} isActive={editor.isActive("heading", { level: 3 })} title="Heading 3">
          <Heading3 size={15} />
        </ToolbarBtn>

        <Divider />

        {/* Lists */}
        <ToolbarBtn onClick={() => editor.chain().focus().toggleBulletList().run()} isActive={editor.isActive("bulletList")} title="Bullet List">
          <List size={15} />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} isActive={editor.isActive("orderedList")} title="Ordered List">
          <ListOrdered size={15} />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleTaskList().run()} isActive={editor.isActive("taskList")} title="Task List">
          <ListChecks size={15} />
        </ToolbarBtn>

        <Divider />

        {/* Alignment */}
        <ToolbarBtn onClick={() => editor.chain().focus().setTextAlign("left").run()} isActive={editor.isActive({ textAlign: "left" })} title="Align Left">
          <AlignLeft size={15} />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().setTextAlign("center").run()} isActive={editor.isActive({ textAlign: "center" })} title="Align Center">
          <AlignCenter size={15} />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().setTextAlign("right").run()} isActive={editor.isActive({ textAlign: "right" })} title="Align Right">
          <AlignRight size={15} />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().setTextAlign("justify").run()} isActive={editor.isActive({ textAlign: "justify" })} title="Justify">
          <AlignJustify size={15} />
        </ToolbarBtn>

        <Divider />

        {/* Block elements */}
        <ToolbarBtn onClick={() => editor.chain().focus().toggleBlockquote().run()} isActive={editor.isActive("blockquote")} title="Blockquote">
          <Quote size={15} />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Divider">
          <Minus size={15} />
        </ToolbarBtn>

        <Divider />

        {/* Link */}
        <ToolbarBtn
          onClick={() => {
            if (editor.isActive("link")) {
              editor.chain().focus().unsetLink().run();
            } else {
              setShowLinkInput(true);
              setLinkUrl(editor.getAttributes("link").href || "");
            }
          }}
          isActive={editor.isActive("link")}
          title="Link"
        >
          <LinkIcon size={15} />
        </ToolbarBtn>

        {/* Image upload */}
        <ToolbarBtn onClick={onImageUpload} title="Insert Image">
          <ImageIcon size={15} />
        </ToolbarBtn>

        {/* Manga Reference */}
        <ToolbarBtn onClick={onInsertMangaRef} title="Insert Manga Reference (@)">
          <AtSign size={15} />
        </ToolbarBtn>

        <Divider />

        {/* Undo / Redo */}
        <ToolbarBtn onClick={() => editor.chain().focus().undo().run()} title="Undo (Ctrl+Z)">
          <Undo size={15} />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().redo().run()} title="Redo (Ctrl+Y)">
          <Redo size={15} />
        </ToolbarBtn>

        <Divider />

        {/* AI Assist */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowAiMenu(!showAiMenu)}
            disabled={aiLoading}
            title="AI Writing Assistant"
            className={`flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all duration-150 ${
              showAiMenu
                ? "bg-gradient-to-r from-purple-500 to-indigo-500 text-white shadow-md"
                : "text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 border border-purple-200 dark:border-purple-800"
            } disabled:opacity-40`}
          >
            <Sparkles size={13} />
            <span>AI</span>
          </button>

          {showAiMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowAiMenu(false)} />
              <div className="absolute top-full left-0 mt-2 z-50 bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl shadow-xl overflow-hidden w-52">
                <div className="p-2 text-[10px] text-[var(--text-secondary)] font-bold uppercase tracking-wider border-b border-[var(--border-primary)]">
                  AI Writing Assistant
                </div>
                <button
                  className="w-full flex items-center space-x-2.5 px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-zinc-800 transition text-left"
                  onClick={() => { setShowAiMenu(false); onAI("rewrite"); }}
                >
                  <Wand2 size={14} className="text-purple-500 shrink-0" />
                  <div>
                    <div className="text-xs font-semibold text-[var(--text-primary)]">Viết lại đoạn chọn</div>
                    <div className="text-[10px] text-[var(--text-secondary)]">Cải thiện văn phong</div>
                  </div>
                </button>
                <button
                  className="w-full flex items-center space-x-2.5 px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-zinc-800 transition text-left"
                  onClick={() => { setShowAiMenu(false); onAI("intro"); }}
                >
                  <FileText size={14} className="text-blue-500 shrink-0" />
                  <div>
                    <div className="text-xs font-semibold text-[var(--text-primary)]">Tạo đoạn mở đầu</div>
                    <div className="text-[10px] text-[var(--text-secondary)]">Giới thiệu hấp dẫn</div>
                  </div>
                </button>
                <button
                  className="w-full flex items-center space-x-2.5 px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-zinc-800 transition text-left"
                  onClick={() => { setShowAiMenu(false); onAI("ideas"); }}
                >
                  <Lightbulb size={14} className="text-amber-500 shrink-0" />
                  <div>
                    <div className="text-xs font-semibold text-[var(--text-primary)]">Gợi ý ý tưởng</div>
                    <div className="text-[10px] text-[var(--text-secondary)]">Các góc nhìn phân tích</div>
                  </div>
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Link input popup */}
      {showLinkInput && (
        <div className="absolute top-full left-0 mt-2 z-50 bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl shadow-xl p-3 flex items-center space-x-2 w-80">
          <input
            type="url"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="https://..."
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && handleSetLink()}
            className="flex-1 text-sm bg-transparent border border-[var(--border-primary)] rounded-lg px-2.5 py-1.5 outline-none focus:border-[var(--brand-orange)] text-[var(--text-primary)]"
          />
          <button
            onClick={handleSetLink}
            className="px-3 py-1.5 bg-[var(--brand-orange)] text-white rounded-lg text-xs font-bold transition hover:bg-[var(--brand-coral)]"
          >
            Set
          </button>
          <button
            onClick={() => setShowLinkInput(false)}
            className="p-1.5 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg transition text-[var(--text-secondary)]"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      )}
    </div>
  );
};
