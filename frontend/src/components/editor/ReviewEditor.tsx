/**
 * ReviewEditor — Full-featured Tiptap review editor.
 * Includes: text formatting, text-align, resizable images, video embeds,
 * audio, file attachments, tables, slash commands, AI writing assistance,
 * manga cross-references, adjustable width.
 */

import React, { useState, useCallback, useRef, useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import { TextStyle } from "@tiptap/extension-text-style";
import Highlight from "@tiptap/extension-highlight";
import Link from "@tiptap/extension-link";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";
import Youtube from "@tiptap/extension-youtube";
import BubbleMenuExtension from "@tiptap/extension-bubble-menu";
import { Search, Loader2, X, BookOpen, HelpCircle, PlayCircle as YoutubeIcon, Trash2 } from "lucide-react";
import { useMangaBlur } from "../../hooks/useMangaBlur";
import { BlurredCover } from "../ui/BlurredCover";

import { EditorToolbar } from "./EditorToolbar.tsx";
import { SlashCommandMenu } from "./SlashCommandMenu.tsx";
import { AIConfirmModal } from "./AIConfirmModal.tsx";
import { AIResultPanel } from "./AIResultPanel.tsx";
import { MangaReferenceExtension } from "./MangaReferenceExtension.ts";
import { MangaReferenceTooltip } from "./MangaReferenceTooltip.tsx";
import { ResizableImageExtension } from "./ResizableImageExtension.ts";
import { VideoExtension } from "./VideoExtension.tsx";
import { AudioExtension } from "./AudioExtension.tsx";
import { FileAttachmentExtension } from "./FileAttachmentExtension.tsx";
import client from "../../api/client";
import { useAlert } from "../../hooks/useAlert";

export type EditorWidth = "compact" | "standard" | "wide" | "full";

const WIDTH_MAP: Record<EditorWidth, string> = {
  compact: "max-w-[640px]",
  standard: "max-w-[768px]",
  wide: "max-w-[1024px]",
  full: "max-w-full",
};

const CustomTableCell = TableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      verticalAlign: {
        default: "top",
        parseHTML: element => element.style.verticalAlign || "top",
        renderHTML: attributes => {
          if (!attributes.verticalAlign || attributes.verticalAlign === "top") {
            return {};
          }
          return {
            style: `vertical-align: ${attributes.verticalAlign}`,
          };
        },
      },
    };
  },
});

const CustomTableHeader = TableHeader.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      verticalAlign: {
        default: "top",
        parseHTML: element => element.style.verticalAlign || "top",
        renderHTML: attributes => {
          if (!attributes.verticalAlign || attributes.verticalAlign === "top") {
            return {};
          }
          return {
            style: `vertical-align: ${attributes.verticalAlign}`,
          };
        },
      },
    };
  },
});


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

const formatAITextToHTML = (text: string): string => {
  const lines = text.split("\n");
  let inList = false;
  const htmlLines: string[] = [];

  for (let line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (inList) {
        htmlLines.push("</ul>");
        inList = false;
      }
      continue;
    }

    // Check if list item
    const listMatch = trimmed.match(/^[-*+]\s+(.*)$/);
    if (listMatch) {
      if (!inList) {
        htmlLines.push('<ul class="list-disc pl-6">');
        inList = true;
      }
      let content = listMatch[1];
      content = content.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
      content = content.replace(/\*(.*?)\*/g, "<em>$1</em>");
      htmlLines.push(`<li>${content}</li>`);
    } else {
      if (inList) {
        htmlLines.push("</ul>");
        inList = false;
      }
      // Parse headers
      const headerMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
      if (headerMatch) {
        const level = headerMatch[1].length;
        let content = headerMatch[2];
        content = content.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
        content = content.replace(/\*(.*?)\*/g, "<em>$1</em>");
        htmlLines.push(`<h${level}>${content}</h${level}>`);
      } else {
        // Plain paragraph or single line
        let content = trimmed;
        content = content.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
        content = content.replace(/\*(.*?)\*/g, "<em>$1</em>");
        htmlLines.push(`<p>${content}</p>`);
      }
    }
  }
  if (inList) {
    htmlLines.push("</ul>");
  }

  return htmlLines.join("");
};

const formatRewriteText = (text: string): string => {
  if (text.includes("\n")) {
    return formatAITextToHTML(text);
  }
  let formatted = text.trim();
  formatted = formatted.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  formatted = formatted.replace(/\*(.*?)\*/g, "<em>$1</em>");
  return formatted;
};

const getYoutubeId = (url: string): string | null => {
  if (!url) return null;
  const trimmed = url.trim();
  
  // Try using URL parser for robust parsing
  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.toLowerCase();
    
    if (host.includes("youtube.com") || host.includes("youtube-nocookie.com")) {
      // 1. check search params for 'v'
      const v = parsed.searchParams.get("v");
      if (v && v.length === 11) return v;
      
      // 2. check pathname
      const pathParts = parsed.pathname.split("/").filter(Boolean);
      // E.g., /shorts/ID, /embed/ID, /v/ID, /live/ID
      if (pathParts.length >= 2) {
        const type = pathParts[0].toLowerCase();
        const id = pathParts[1];
        if (["shorts", "embed", "v", "live"].includes(type) && id && id.length === 11) {
          return id;
        }
      }
    } else if (host.includes("youtu.be")) {
      // youtu.be/ID
      const pathParts = parsed.pathname.split("/").filter(Boolean);
      const id = pathParts[0];
      if (id && id.length === 11) {
        return id;
      }
    }
  } catch (e) {
    // Fallback to regex if URL parsing fails
  }

  // Regex fallback
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=|shorts\/|live\/)([^#\&\?]*).*/;
  const match = trimmed.match(regExp);
  if (match && match[2] && match[2].length === 11) {
    return match[2];
  }
  
  const idMatch = trimmed.match(/^[a-zA-Z0-9_-]{11}$/);
  if (idMatch) {
    return trimmed;
  }
  
  return null;
};


interface ReviewEditorProps {
  mangaId: string;
  reviewId?: string | null;
  manga: {
    _id: string;
    title: string;
    alt_titles?: string[];
    description?: string;
    author?: string;
    artist?: string;
    year?: string;
    status?: string;
    tag_ids?: string[];
  };
  initialContent?: any;
  reviewTitle: string;
  onTitleChange: (title: string) => void;
  onSave: (contentJson: any) => Promise<void>;
  onBack: () => void;
  onCleanup: () => Promise<void>;
  lastUpdated?: string;
}

export const ReviewEditor: React.FC<ReviewEditorProps> = ({
  mangaId,
  reviewId,
  manga,
  initialContent,
  reviewTitle,
  onTitleChange,
  onSave,
  onBack,
  onCleanup,
  lastUpdated,
}) => {
  const { showToast } = useAlert();
  const [editorWidth, setEditorWidth] = useState<EditorWidth>("standard");
  const [isSaving, setIsSaving] = useState(false);
  const { shouldBlur } = useMangaBlur();

  // AI state
  const [, setAiMode] = useState<"rewrite" | "intro" | "ideas" | null>(null);
  const [aiConfirm, setAiConfirm] = useState<{
    prompt: string;
    estimatedTokens: number;
    mode: string;
    selectedStyle?: string;
    customStyleText?: string;
  } | null>(null);
  const [aiResult, setAiResult] = useState<{
    text: string;
    mode: string;
    selectedText?: string;
    selectionFrom?: number;
    selectionTo?: number;
  } | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  // Manga Reference state
  const [hoveredRef, setHoveredRef] = useState<{
    mangaId: string;
    position: { top: number; left: number };
  } | null>(null);
  const [pendingRef, setPendingRef] = useState<{
    mangaId: string;
    from: number;
    to: number;
    title: string;
    altTitles: string[];
    position: { top: number; left: number };
  } | null>(null);
  const [editingRef, setEditingRef] = useState<{
    mangaId: string;
    displayTitle: string;
    altTitles: string[];
    position: { top: number; left: number };
    nodePos: number;
  } | null>(null);

  // Search Modal state
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const hoverTimeoutRef = useRef<any>(null);

  // Help Modal state
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [activeHelpTab, setActiveHelpTab] = useState<"slash" | "ai" | "ref" | "formatting" | "examples">("slash");

  // YouTube modal state
  const [showYoutubeModal, setShowYoutubeModal] = useState(false);
  const [youtubeUrl, setYoutubeUrl] = useState("");

  // Upload progress state
  const [uploadingMedia, setUploadingMedia] = useState(false);

  // Sticky action bar measurement
  const headerRef = useRef<HTMLDivElement>(null);
  const [headerHeight, setHeaderHeight] = useState(0);

  useEffect(() => {
    if (headerRef.current) {
      const resizeObserver = new ResizeObserver((entries) => {
        for (let entry of entries) {
          setHeaderHeight(entry.target.clientHeight);
        }
      });
      resizeObserver.observe(headerRef.current);
      return () => resizeObserver.disconnect();
    }
  }, []);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        orderedList: {
          HTMLAttributes: { class: "list-decimal pl-6" },
        },
        bulletList: {
          HTMLAttributes: { class: "list-disc pl-6" },
        },
      }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      ResizableImageExtension.configure({
        mangaId: mangaId,
      }),
      Placeholder.configure({ placeholder: 'Viết review của bạn... Gõ "/" để xem các lệnh nhanh.' }),
      BubbleMenuExtension,
      Underline,
      TextStyle,
      Highlight.configure({ multicolor: true }),
      Link.configure({ openOnClick: false, autolink: true }),
      TaskList,
      TaskItem.configure({ nested: true }),
      MangaReferenceExtension,
      // Table extensions
      Table.configure({ resizable: true }),
      TableRow,
      CustomTableHeader,
      CustomTableCell,
      // YouTube embeds
      Youtube.configure({
        inline: false,
        nocookie: true,
        addPasteHandler: false,
        HTMLAttributes: {
          class: "rounded-xl overflow-hidden my-4",
          referrerpolicy: "strict-origin-when-cross-origin",
          referrerPolicy: "strict-origin-when-cross-origin",
        },
      }),
      // Custom media extensions
      VideoExtension,
      AudioExtension,
      FileAttachmentExtension,
    ],
    content: initialContent || {},
    editorProps: {
      attributes: {
        class:
          "prose dark:prose-invert focus:outline-none max-w-none min-h-[400px] text-[var(--text-primary)] font-poppins text-base leading-relaxed p-0 border-none bg-transparent",
        spellcheck: "false",
        autocorrect: "off",
        autocapitalize: "off",
      },
      // Handle drag & drop of external images and files
      handleDrop: (_view, event, _slice, moved) => {
        if (moved) return false; // Internal move, let Tiptap handle it

        const files = event.dataTransfer?.files;
        if (files && files.length > 0) {
          event.preventDefault();
          for (let i = 0; i < files.length; i++) {
            handleFileDropOrPaste(files[i]);
          }
          return true;
        }

        // Check for dragged image HTML (external image drag)
        const html = event.dataTransfer?.getData("text/html");
        if (html) {
          const match = html.match(/<img[^>]+src="([^"]+)"/);
          if (match && match[1]) {
            event.preventDefault();
            handleExternalImageUrl(match[1]);
            return true;
          }
        }

        // Check for dragged URL text
        const url = event.dataTransfer?.getData("text/plain");
        if (url && /^https?:\/\/.+\.(jpg|jpeg|png|gif|webp|svg|bmp)/i.test(url)) {
          event.preventDefault();
          handleExternalImageUrl(url);
          return true;
        }

        return false;
      },
      // Handle paste of images and external image URLs
      handlePaste: (_view, event) => {
        // Check for pasted YouTube URLs first
        const text = event.clipboardData?.getData("text/plain");
        if (text) {
          const trimmedText = text.trim();
          if (/^https?:\/\/([a-zA-Z0-9-]+\.)?(youtube\.com|youtu\.be|youtube-nocookie\.com)\//i.test(trimmedText)) {
            const videoId = getYoutubeId(trimmedText);
            if (videoId) {
              event.preventDefault();
              editor?.commands.setYoutubeVideo({
                src: `https://www.youtube.com/watch?v=${videoId}`,
                width: 640,
                height: 360,
              });
              return true;
            }
          }
        }

        const files = event.clipboardData?.files;
        if (files && files.length > 0) {
          for (let i = 0; i < files.length; i++) {
            if (files[i].type.startsWith("image/")) {
              event.preventDefault();
              handleFileDropOrPaste(files[i]);
              return true;
            }
          }
        }

        // Check for pasted HTML with image
        const html = event.clipboardData?.getData("text/html");
        if (html) {
          const match = html.match(/<img[^>]+src="([^"]+)"/);
          if (match && match[1] && match[1].startsWith("http")) {
            event.preventDefault();
            handleExternalImageUrl(match[1]);
            return true;
          }
        }

        return false;
      },
    },
  });

  // Scan and resolve @uuid patterns in the text
  const scanAndResolveReferences = async (editorInstance: any) => {
    if (!editorInstance) return;
    const docText = editorInstance.state.doc.textContent;
    const regex = /@([a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}|[a-fA-F0-9]{24})/g;
    let match;
    const matches: { text: string; id: string }[] = [];
    while ((match = regex.exec(docText)) !== null) {
      matches.push({ text: match[0], id: match[1] });
    }

    // Replace matches backwards so we don't mess up document indices
    for (const m of matches) {
      try {
        const res = await client.get(`/api/manga/resolve-reference/${m.id}`);
        if (res.data) {
          let foundPos = -1;
          editorInstance.state.doc.descendants((node: any, pos: number) => {
            if (node.isText && node.text.includes(m.text)) {
              const indexInNode = node.text.indexOf(m.text);
              foundPos = pos + indexInNode;
              return false;
            }
          });

          if (foundPos !== -1) {
            editorInstance.chain()
              .insertContentAt({ from: foundPos, to: foundPos + m.text.length }, {
                type: "mangaReference",
                attrs: {
                  mangaId: res.data._id || res.data.id,
                  displayTitle: res.data.title,
                }
              })
              .run();
          }
        }
      } catch (err) {
        console.warn("Could not auto-resolve reference on load:", m.id);
      }
    }
  };

  // Run auto-scan when editor content is initialized
  useEffect(() => {
    if (!editor) return;
    const timer = setTimeout(() => {
      scanAndResolveReferences(editor);
    }, 150);
    return () => clearTimeout(timer);
  }, [editor]);

  const checkAndConfirmMangaReference = async (id: string, from: number, to: number) => {
    if (pendingRef && pendingRef.mangaId === id) return;
    try {
      const res = await client.get(`/api/manga/resolve-reference/${id}`);
      if (res.data) {
        const coords = editor?.view.coordsAtPos(from);
        const editorEl = editor?.view.dom.closest(".editor-content-wrapper") as HTMLElement;
        let pos = { top: 0, left: 0 };
        if (editorEl && coords) {
          const rect = editorEl.getBoundingClientRect();
          pos = { top: coords.bottom - rect.top + 8, left: coords.left - rect.left };
        }
        setPendingRef({
          mangaId: res.data._id || res.data.id,
          from,
          to,
          title: res.data.title,
          altTitles: res.data.alt_titles || [],
          position: pos,
        });
      }
    } catch (e) {
      console.warn("Manga ref ID not resolved on typing:", id);
    }
  };

  // Listen for typed @uuid references
  useEffect(() => {
    if (!editor) return;

    const handleUpdate = () => {
      const { state } = editor;
      const $from = state.selection.$from;
      const textBefore = $from.parent.textBetween(Math.max(0, $from.parentOffset - 50), $from.parentOffset, "\n");
      const match = textBefore.match(/@([a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}|[a-fA-F0-9]{24})$/);
      if (match) {
        const id = match[1];
        if (id.length === 24 || id.length === 36) {
          const nodeStart = $from.start();
          const matchStart = nodeStart + $from.parentOffset - match[0].length;
          const matchEnd = nodeStart + $from.parentOffset;
          checkAndConfirmMangaReference(id, matchStart, matchEnd);
        }
      }
    };

    editor.on("update", handleUpdate);
    return () => {
      editor.off("update", handleUpdate);
    };
  }, [editor, pendingRef]);

  // Listen for clicks/selection on mangaReference node to open title swapper popover
  useEffect(() => {
    if (!editor) return;

    const handleSelection = () => {
      const { state } = editor;
      const { from } = state.selection;
      const node = state.doc.nodeAt(from);
      
      if (node && node.type.name === "mangaReference") {
        const coords = editor.view.coordsAtPos(from);
        const editorEl = editor.view.dom.closest(".editor-content-wrapper") as HTMLElement;
        let pos = { top: 0, left: 0 };
        if (editorEl && coords) {
          const rect = editorEl.getBoundingClientRect();
          pos = { top: coords.bottom - rect.top + 8, left: coords.left - rect.left };
        }

        client.get(`/api/manga/resolve-reference/${node.attrs.mangaId}`).then(res => {
          setEditingRef({
            mangaId: node.attrs.mangaId,
            displayTitle: node.attrs.displayTitle,
            altTitles: res.data.alt_titles || [],
            position: pos,
            nodePos: from,
          });
        }).catch(() => {
          setEditingRef({
            mangaId: node.attrs.mangaId,
            displayTitle: node.attrs.displayTitle,
            altTitles: [],
            position: pos,
            nodePos: from,
          });
        });
      } else {
        setEditingRef(null);
      }
    };

    editor.on("selectionUpdate", handleSelection);
    return () => {
      editor.off("selectionUpdate", handleSelection);
    };
  }, [editor]);

  // Handle image upload
  const handleImageUpload = useCallback(
    async (file: File) => {
      if (!editor) return;
      setUploadingMedia(true);
      const formData = new FormData();
      formData.append("file", file);
      try {
        const res = await client.post(
          `/api/manga/${mangaId}/reviews/upload-image`,
          formData,
          { headers: { "Content-Type": "multipart/form-data" } }
        );
        editor.chain().focus().insertContent({
          type: "image",
          attrs: { src: res.data.url, alt: file.name },
        }).run();
      } catch (err) {
        console.error("Image upload failed", err);
        showToast("Failed to upload image. Please try again.", "error");
      } finally {
        setUploadingMedia(false);
      }
    },
    [editor, mangaId]
  );

  // Handle external image URL (proxy download to MinIO)
  const handleExternalImageUrl = useCallback(
    async (imageUrl: string) => {
      if (!editor) return;
      setUploadingMedia(true);
      showToast("Đang tải ảnh từ URL bên ngoài...", "info");
      try {
        const res = await client.post(
          `/api/manga/${mangaId}/reviews/upload-image-url`,
          { url: imageUrl }
        );
        editor.chain().focus().insertContent({
          type: "image",
          attrs: { src: res.data.url },
        }).run();
        showToast("Đã tải ảnh thành công!", "success");
      } catch (err: any) {
        console.error("External image proxy failed", err);
        // Fallback: insert direct URL
        editor.chain().focus().insertContent({
          type: "image",
          attrs: { src: imageUrl },
        }).run();
        showToast("Không thể proxy ảnh, đã chèn URL trực tiếp.", "warning");
      } finally {
        setUploadingMedia(false);
      }
    },
    [editor, mangaId]
  );

  // Handle video upload
  const handleVideoUpload = useCallback(
    async (file: File) => {
      if (!editor) return;
      setUploadingMedia(true);
      showToast("Đang tải video lên...", "info");
      const formData = new FormData();
      formData.append("file", file);
      try {
        const res = await client.post(
          `/api/manga/${mangaId}/reviews/upload-video`,
          formData,
          { headers: { "Content-Type": "multipart/form-data" }, timeout: 300000 }
        );
        editor.chain().focus().insertContent({
          type: "video",
          attrs: { src: res.data.url, filename: res.data.filename || file.name },
        }).run();
        showToast("Video đã được tải lên thành công!", "success");
      } catch (err: any) {
        console.error("Video upload failed", err);
        const msg = err.response?.data?.detail || "Tải video thất bại. Vui lòng thử lại.";
        showToast(msg, "error");
      } finally {
        setUploadingMedia(false);
      }
    },
    [editor, mangaId]
  );

  // Handle audio upload
  const handleAudioUpload = useCallback(
    async (file: File) => {
      if (!editor) return;
      setUploadingMedia(true);
      const formData = new FormData();
      formData.append("file", file);
      try {
        const res = await client.post(
          `/api/manga/${mangaId}/reviews/upload-media`,
          formData,
          { headers: { "Content-Type": "multipart/form-data" } }
        );
        editor.chain().focus().insertContent({
          type: "audio",
          attrs: { src: res.data.url, filename: res.data.filename || file.name },
        }).run();
        showToast("Audio đã được tải lên!", "success");
      } catch (err: any) {
        console.error("Audio upload failed", err);
        showToast("Tải audio thất bại.", "error");
      } finally {
        setUploadingMedia(false);
      }
    },
    [editor, mangaId]
  );

  // Handle file attachment upload
  const handleFileAttachmentUpload = useCallback(
    async (file: File) => {
      if (!editor) return;
      setUploadingMedia(true);
      const formData = new FormData();
      formData.append("file", file);
      try {
        const res = await client.post(
          `/api/manga/${mangaId}/reviews/upload-media`,
          formData,
          { headers: { "Content-Type": "multipart/form-data" } }
        );
        editor.chain().focus().insertContent({
          type: "fileAttachment",
          attrs: { url: res.data.url, filename: res.data.filename || file.name, size: res.data.size || 0 },
        }).run();
        showToast("File đã được đính kèm!", "success");
      } catch (err: any) {
        console.error("File upload failed", err);
        showToast("Đính kèm file thất bại.", "error");
      } finally {
        setUploadingMedia(false);
      }
    },
    [editor, mangaId]
  );

  // Unified handler for dropped/pasted files — routes to correct upload by MIME type
  const handleFileDropOrPaste = useCallback(
    (file: File) => {
      if (file.type.startsWith("image/")) {
        handleImageUpload(file);
      } else if (file.type.startsWith("video/")) {
        handleVideoUpload(file);
      } else if (file.type.startsWith("audio/")) {
        handleAudioUpload(file);
      } else {
        handleFileAttachmentUpload(file);
      }
    },
    [handleImageUpload, handleVideoUpload, handleAudioUpload, handleFileAttachmentUpload]
  );

  // Insert YouTube embed
  const handleInsertYoutube = useCallback(() => {
    if (!editor || !youtubeUrl.trim()) return;
    
    const videoId = getYoutubeId(youtubeUrl.trim());
    if (!videoId) {
      showToast("URL YouTube không hợp lệ. Vui lòng nhập link video YouTube chính xác.", "warning");
      return;
    }

    const cleanUrl = `https://www.youtube.com/watch?v=${videoId}`;
    
    editor.commands.setYoutubeVideo({
      src: cleanUrl,
      width: 640,
      height: 360,
    });
    setYoutubeUrl("");
    setShowYoutubeModal(false);
  }, [editor, youtubeUrl]);

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleImageUpload(file);
    e.target.value = "";
  };

  // Refs for video/audio/file inputs
  const videoInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef2 = useRef<HTMLInputElement>(null);


  // AI flow
  const triggerAI = useCallback(
    async (mode: "rewrite" | "intro" | "ideas") => {
      if (!editor) return;
      setAiMode(mode);
      setAiLoading(true);

      const { from, to, empty } = editor.state.selection;
      const selectedText = empty ? "" : editor.state.doc.textBetween(from, to, " ");

      const selectionText = selectedText.trim();
      const wordCount = selectionText.split(/\s+/).filter(Boolean).length;
      const hasLetters = /[a-zA-Zà-ỹÀ-Ỹ0-9]/.test(selectionText);

      if (mode === "rewrite") {
        if (!selectionText || selectionText.length < 60 || wordCount < 10 || !hasLetters) {
          showToast(
            "Vui lòng quét chọn một đoạn văn bản đầy đủ ý nghĩa (tối thiểu 60 ký tự và 10 từ) để AI có đủ ngữ cảnh xử lý.",
            "warning"
          );
          setAiMode(null);
          setAiLoading(false);
          return;
        }
      }

      try {
        const res = await client.post("/api/ai/preview", {
          manga_id: mangaId,
          mode,
          selected_text: selectedText,
          existing_review_json: editor.getJSON(),
          rewrite_style: mode === "rewrite" ? REWRITE_STYLES[0].label : "",
        });
        setAiConfirm({
          prompt: res.data.prompt,
          estimatedTokens: res.data.estimated_tokens,
          mode,
          selectedStyle: "default",
          customStyleText: "",
        });
        if (mode === "rewrite") {
          setAiResult({
            text: "",
            mode,
            selectedText,
            selectionFrom: from,
            selectionTo: to,
          });
        }
      } catch (err: any) {
        console.error("AI preview failed", err);
        let errorMessage = "Không thể kết nối tới dịch vụ AI. Vui lòng thử lại.";
        if (err.response?.data?.detail) {
          const detail = err.response.data.detail;
          if (detail.includes("429")) {
            errorMessage = "Tần suất yêu cầu quá nhanh (429 Too Many Requests). Vui lòng đợi một lát rồi thử lại.";
          } else {
            errorMessage = `Lỗi từ dịch vụ AI: ${detail}`;
          }
        }
        showToast(errorMessage, "error");
        setAiMode(null);
      } finally {
        setAiLoading(false);
      }
    },
    [editor, mangaId]
  );

  const handleStyleChange = useCallback(
    async (styleId: string, customText: string = "") => {
      if (!editor || !aiConfirm) return;
      const { from, to, empty } = editor.state.selection;
      const selectedText = empty ? "" : editor.state.doc.textBetween(from, to, " ");

      let styleText = "";
      if (styleId === "custom") {
        styleText = customText.trim() || "Hãy viết lại đoạn văn.";
      } else {
        const found = REWRITE_STYLES.find((s) => s.id === styleId);
        styleText = found ? found.label : "Hãy viết lại đoạn văn.";
      }

      try {
        const res = await client.post("/api/ai/preview", {
          manga_id: mangaId,
          mode: "rewrite",
          selected_text: selectedText,
          existing_review_json: editor.getJSON(),
          rewrite_style: styleText,
        });

        setAiConfirm({
          prompt: res.data.prompt,
          estimatedTokens: res.data.estimated_tokens,
          mode: "rewrite",
          selectedStyle: styleId,
          customStyleText: customText,
        });
      } catch (err) {
        console.error("Failed to update AI preview", err);
      }
    },
    [editor, aiConfirm, mangaId]
  );

  const handleAIConfirm = useCallback(async () => {
    if (!aiConfirm || !editor) return;
    const mode = aiConfirm.mode as "rewrite" | "intro" | "ideas";
    const styleId = aiConfirm.selectedStyle || "default";
    const customText = aiConfirm.customStyleText || "";
    
    setAiConfirm(null);
    setAiLoading(true);

    const { from, to } = editor.state.selection;
    const selectedText = aiResult?.selectedText || "";

    let styleText = "";
    if (styleId === "custom") {
      styleText = customText.trim() || "Hãy viết lại đoạn văn.";
    } else {
      const found = REWRITE_STYLES.find((s) => s.id === styleId);
      styleText = found ? found.label : "Hãy viết lại đoạn văn.";
    }

    try {
      const res = await client.post("/api/ai/generate", {
        manga_id: mangaId,
        mode,
        selected_text: selectedText,
        existing_review_json: editor.getJSON(),
        rewrite_style: styleText,
      });

      if (mode === "rewrite") {
        setAiResult({
          text: res.data.result,
          mode,
          selectedText,
          selectionFrom: aiResult?.selectionFrom ?? from,
          selectionTo: aiResult?.selectionTo ?? to,
        });
      } else {
        setAiResult({ text: res.data.result, mode });
      }
    } catch (err: any) {
      console.error("AI generate failed", err);
      let errorMessage = "Lỗi khi gọi AI. Vui lòng thử lại.";
      if (err.response?.data?.detail) {
        const detail = err.response.data.detail;
        if (detail.includes("429")) {
          errorMessage = "Tần suất yêu cầu quá nhanh (429 Too Many Requests). Vui lòng đợi một lát rồi thử lại.";
        } else {
          errorMessage = `Lỗi từ dịch vụ AI: ${detail}`;
        }
      }
      showToast(errorMessage, "error");
      setAiMode(null);
      setAiResult(null);
    } finally {
      setAiLoading(false);
    }
  }, [aiConfirm, editor, mangaId, aiResult]);

  // Insert AI result into editor
  const handleAIInsert = useCallback(
    (text: string) => {
      if (!editor || !aiResult) return;
      if (aiResult.mode === "rewrite" && aiResult.selectionFrom !== undefined && aiResult.selectionTo !== undefined) {
        editor
          .chain()
          .focus()
          .deleteRange({ from: aiResult.selectionFrom, to: aiResult.selectionTo })
          .insertContentAt(aiResult.selectionFrom, formatRewriteText(text))
          .run();
      } else {
        // Cursor-based insertion with surrounding whitespace checks for Mode 2 & 3
        const { state } = editor;
        const currentPos = state.selection.from;
        const size = state.doc.content.size;

        const isStart = currentPos <= 2;
        const isEnd = currentPos >= size - 2;

        const textBefore = state.doc.textBetween(Math.max(0, currentPos - 6), currentPos, "\n");
        const textAfter = state.doc.textBetween(currentPos, Math.min(size, currentPos + 6), "\n");

        const hasContentBefore = !isStart && state.doc.textBetween(0, currentPos).trim().length > 0;
        const hasContentAfter = !isEnd && state.doc.textBetween(currentPos, size).trim().length > 0;

        let prefixHtml = "";
        if (hasContentBefore) {
          if (textBefore.endsWith("\n\n")) {
            prefixHtml = "";
          } else if (textBefore.endsWith("\n")) {
            prefixHtml = "<p></p>";
          } else {
            prefixHtml = "<p></p>";
          }
        }

        let suffixHtml = "";
        if (hasContentAfter) {
          if (textAfter.startsWith("\n\n")) {
            suffixHtml = "";
          } else if (textAfter.startsWith("\n")) {
            suffixHtml = "<p></p>";
          } else {
            suffixHtml = "<p></p>";
          }
        }

        const htmlToInsert = `${prefixHtml}${formatAITextToHTML(text)}${suffixHtml}`;
        editor.chain().focus().insertContentAt(currentPos, htmlToInsert).run();
      }
      setAiResult(null);
      setAiMode(null);
    },
    [editor, aiResult]
  );

  // Manga reference handling
  const handleInsertMangaReference = () => {
    setShowSearchModal(true);
    setSearchQuery("");
    setSearchResults([]);
  };

  const handleSearchManga = async (q: string) => {
    setSearchQuery(q);
    if (!q.trim()) {
      setSearchResults([]);
      return;
    }
    setSearchLoading(true);
    try {
      const res = await client.get(`/api/manga/?search=${encodeURIComponent(q)}&limit=6`);
      setSearchResults(res.data.items || []);
    } catch (err) {
      console.error("Manga search failed", err);
    } finally {
      setSearchLoading(false);
    }
  };

  const handleSelectMangaRef = (selectedManga: any) => {
    if (!editor) return;
    const refNode = {
      type: "mangaReference",
      attrs: {
        mangaId: selectedManga._id || selectedManga.id,
        displayTitle: selectedManga.title,
      },
    };
    editor.chain().focus().insertContent(refNode).run();
    setShowSearchModal(false);

    // Open edit popover immediately to let them choose title
    setTimeout(() => {
      const { from } = editor.state.selection;
      const coords = editor.view.coordsAtPos(from - 1);
      const editorEl = editor.view.dom.closest(".editor-content-wrapper") as HTMLElement;
      let pos = { top: 0, left: 0 };
      if (editorEl && coords) {
        const rect = editorEl.getBoundingClientRect();
        pos = { top: coords.bottom - rect.top + 8, left: coords.left - rect.left };
      }
      setEditingRef({
        mangaId: selectedManga._id || selectedManga.id,
        displayTitle: selectedManga.title,
        altTitles: selectedManga.alt_titles || [],
        position: pos,
        nodePos: from - 1,
      });
    }, 100);
  };

  const updateRefTitle = (displayTitle: string) => {
    if (!editor || !editingRef) return;
    editor.chain()
      .focus()
      .setNodeSelection(editingRef.nodePos)
      .updateAttributes("mangaReference", { displayTitle })
      .run();
    setEditingRef(null);
  };

  const confirmMangaReference = (titleOption?: string) => {
    if (!editor || !pendingRef) return;
    const displayTitle = titleOption || pendingRef.title;
    editor.chain()
      .focus()
      .deleteRange({ from: pendingRef.from, to: pendingRef.to })
      .insertContentAt(pendingRef.from, {
        type: "mangaReference",
        attrs: {
          mangaId: pendingRef.mangaId,
          displayTitle: displayTitle,
        }
      })
      .run();
    setPendingRef(null);
  };

  // Hover detection event delegation on the editor wrapper
  const handleMouseOver = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const link = target.closest(".manga-reference-link");
    if (link) {
      const mId = link.getAttribute("data-manga-id");
      if (mId) {
        if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
        const rect = link.getBoundingClientRect();
        setHoveredRef({
          mangaId: mId,
          position: {
            top: rect.top + window.scrollY,
            left: rect.left + rect.width / 2 + window.scrollX,
          },
        });
      }
    }
  };

  const handleMouseOut = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const link = target.closest(".manga-reference-link");
    if (link) {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = setTimeout(() => {
        setHoveredRef(null);
      }, 300);
    }
  };

  const handleClientCleanup = async () => {
    if (!editor) return;

    const { state, view } = editor;
    const { tr } = state;
    const replacements: { from: number; to: number; text: string }[] = [];

    state.doc.descendants((node, pos) => {
      if (node.isText && node.text) {
        // Skip codeBlock parent nodes
        const parent = state.doc.resolve(pos).parent;
        if (parent && parent.type.name === "codeBlock") {
          return;
        }

        const text = node.text;
        const cleanedText = text
          .replace(/\u00a0/g, " ")
          .replace(/\u3000/g, " ")
          .replace(/\t/g, " ")
          .replace(/ {2,}/g, " ");

        if (cleanedText !== text) {
          replacements.push({
            from: pos,
            to: pos + node.nodeSize,
            text: cleanedText
          });
        }
      }
    });

    if (replacements.length > 0) {
      // Apply replacements from right to left (back to front) to preserve positions
      for (let i = replacements.length - 1; i >= 0; i--) {
        const { from, to, text } = replacements[i];
        tr.insertText(text, from, to);
      }
      view.dispatch(tr);
    }

    // Also call backend cleanup if saved review exists to sync DB state
    if (reviewId) {
      try {
        await onCleanup();
      } catch (err) {
        console.error("Backend cleanup failed", err);
      }
    }
  };

  const handleTooltipMouseEnter = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
  };

  const onSaveRef = useRef(onSave);
  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  const handleSave = useCallback(async () => {
    if (!editor) return;
    setIsSaving(true);
    try {
      await onSaveRef.current(editor.getJSON());
    } finally {
      setIsSaving(false);
    }
  }, [editor]);

  // Keyboard shortcut Ctrl+S / Cmd+S to save
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleSave]);

  // Finalize (cleanup orphaned media) on unmount to preserve Ctrl+Z during editing session
  const reviewIdRef = useRef(reviewId);
  useEffect(() => {
    reviewIdRef.current = reviewId;
  }, [reviewId]);

  useEffect(() => {
    return () => {
      const finalReviewId = reviewIdRef.current;
      if (finalReviewId) {
        client.post(`/api/manga/${mangaId}/reviews/${finalReviewId}/finalize`).catch((err) => {
          console.warn("Finalize on unmount failed:", err);
        });
      }
    };
  }, [mangaId]);

  return (
    <div className={`review-editor-container mx-auto space-y-6 py-4 pb-24 animate-in fade-in duration-300 ${WIDTH_MAP[editorWidth]}`}>
      {/* Hidden file inputs for various media types */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml,image/bmp"
        className="hidden"
        onChange={handleFileInputChange}
      />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/mp4,video/webm,video/ogg,video/quicktime,video/x-msvideo,video/x-matroska"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleVideoUpload(f);
          e.target.value = "";
        }}
      />
      <input
        ref={audioInputRef}
        type="file"
        accept="audio/mpeg,audio/wav,audio/ogg,audio/mp4,audio/x-m4a,audio/flac,audio/aac,audio/webm"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleAudioUpload(f);
          e.target.value = "";
        }}
      />
      <input
        ref={fileInputRef2}
        type="file"
        accept=".pdf,.zip,.rar,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.md,.json,.xml"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFileAttachmentUpload(f);
          e.target.value = "";
        }}
      />

      {/* Editor Header / Action Bar */}
      <div 
        ref={headerRef}
        className="sticky top-[64px] z-30 flex items-center justify-between border-b border-[var(--border-primary)] pb-4 pt-2 bg-[var(--bg-primary)]"
      >
        <button
          onClick={onBack}
          className="flex items-center space-x-2 text-sm font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition animate-pulse-subtle"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          <span>Back to Manga Info</span>
        </button>

        <div className="flex items-center space-x-2">
          {/* Width presets */}
          <div className="flex items-center border border-[var(--border-primary)] rounded-lg overflow-hidden text-xs font-semibold">
            {(["compact", "standard", "wide", "full"] as EditorWidth[]).map((w) => (
              <button
                key={w}
                onClick={() => setEditorWidth(w)}
                title={`${w.charAt(0).toUpperCase() + w.slice(1)} width`}
                className={`px-2 py-1.5 transition ${
                  editorWidth === w
                    ? "bg-[var(--brand-orange)] text-white"
                    : "text-[var(--text-secondary)] hover:bg-gray-100 dark:hover:bg-zinc-800"
                }`}
              >
                {w === "compact" ? "640" : w === "standard" ? "768" : w === "wide" ? "1024" : "100%"}
              </button>
            ))}
          </div>

          <button
            onClick={handleClientCleanup}
            className="px-3 py-1.5 border border-[var(--border-primary)] text-[var(--brand-orange)] hover:bg-gray-50 dark:hover:bg-zinc-800 rounded-xl text-xs font-bold flex items-center space-x-1.5 transition"
            title="Clean tabs and extra spaces"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a10 10 0 1 0 10 10"/><path d="M12 6v6l4 2"/></svg>
            <span>Clean</span>
          </button>

          <button
            onClick={() => setShowHelpModal(true)}
            className="px-3 py-1.5 border border-[var(--border-primary)] text-zinc-500 hover:bg-gray-50 dark:hover:bg-zinc-800 rounded-xl text-xs font-bold flex items-center space-x-1.5 transition"
            title="Editor Guide"
          >
            <HelpCircle size={14} />
            <span>Guide</span>
          </button>

          <button
            onClick={handleSave}
            disabled={isSaving || uploadingMedia}
            className="px-4 py-1.5 bg-[var(--brand-orange)] hover:bg-[var(--brand-coral)] text-white rounded-xl text-xs font-bold flex items-center space-x-1.5 shadow-sm transition disabled:opacity-60"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
            <span>{isSaving ? "Saving..." : uploadingMedia ? "Uploading..." : "Save Review"}</span>
          </button>
        </div>
      </div>

      {/* AI Loading indicator */}
      {aiLoading && (
        <div className="flex items-center space-x-2 text-sm text-[var(--brand-orange)] animate-pulse font-semibold">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin"><path d="M12 2a10 10 0 1 0 10 10"/></svg>
          <span>Đang kết nối với AI...</span>
        </div>
      )}

      {/* AI Confirm Modal */}
      {aiConfirm && (
        <AIConfirmModal
          prompt={aiConfirm.prompt}
          estimatedTokens={aiConfirm.estimatedTokens}
          mode={aiConfirm.mode}
          selectedStyle={aiConfirm.selectedStyle}
          customStyleText={aiConfirm.customStyleText}
          onStyleChange={handleStyleChange}
          onConfirm={handleAIConfirm}
          onCancel={() => { setAiConfirm(null); setAiMode(null); setAiResult(null); }}
        />
      )}

      {/* AI Result Panel */}
      {aiResult && aiResult.text && (
        <AIResultPanel
          text={aiResult.text}
          mode={aiResult.mode}
          selectedText={aiResult.selectedText}
          onInsert={handleAIInsert}
          onDiscard={() => { setAiResult(null); setAiMode(null); }}
          onRegenerateRewrite={() => triggerAI("rewrite")}
        />
      )}

      {/* Manga Reference Hover Tooltip */}
      {hoveredRef && (
        <MangaReferenceTooltip
          mangaId={hoveredRef.mangaId}
          position={hoveredRef.position}
          onClose={() => setHoveredRef(null)}
          onMouseEnter={handleTooltipMouseEnter}
        />
      )}

      {/* Floating confirm popup for typed @uuid references */}
      {pendingRef && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setPendingRef(null)} />
          <div
            className="absolute z-50 bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl shadow-2xl p-3 max-w-sm text-xs space-y-2 animate-in fade-in slide-in-from-top-1 duration-150"
            style={{ top: pendingRef.position.top, left: pendingRef.position.left }}
          >
            <div className="font-semibold text-[var(--text-primary)]">
              Phát hiện manga: <span className="text-[var(--brand-orange)] font-bold">{pendingRef.title}</span>
            </div>
            <div className="flex space-x-1.5">
              <button
                onClick={() => confirmMangaReference()}
                className="px-2 py-1 bg-[var(--brand-orange)] text-white font-bold rounded-lg hover:bg-[var(--brand-coral)] transition text-[10px]"
              >
                Chèn liên kết
              </button>
              <button
                onClick={() => setPendingRef(null)}
                className="px-2 py-1 border border-[var(--border-primary)] text-[var(--text-secondary)] font-semibold rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-800 transition text-[10px]"
              >
                Bỏ qua
              </button>
            </div>
          </div>
        </>
      )}

      {/* Floating title swapper popover */}
      {editingRef && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setEditingRef(null)} />
          <div
            className="absolute z-50 bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl shadow-2xl p-3 w-64 text-xs space-y-2 animate-in fade-in slide-in-from-top-1 duration-150"
            style={{ top: editingRef.position.top, left: editingRef.position.left }}
          >
            <div className="font-bold text-[var(--text-secondary)] pb-1.5 border-b border-[var(--border-primary)] text-[10px] uppercase tracking-wider">
              Chọn tiêu đề hiển thị
            </div>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              <button
                onClick={() => updateRefTitle(editingRef.displayTitle)}
                className="w-full text-left p-1.5 rounded-lg hover:bg-[var(--brand-orange)]/10 text-[var(--text-primary)] hover:text-[var(--brand-orange)] font-semibold transition truncate block"
              >
                {editingRef.displayTitle}
              </button>
              {editingRef.altTitles.map((alt, idx) => (
                <button
                  key={idx}
                  onClick={() => updateRefTitle(alt)}
                  className="w-full text-left p-1.5 rounded-lg hover:bg-[var(--brand-orange)]/10 text-[var(--text-primary)] hover:text-[var(--brand-orange)] font-semibold transition truncate block"
                >
                  {alt}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Document Canvas */}
      <div
        onMouseOver={handleMouseOver}
        onMouseOut={handleMouseOut}
        className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-3xl p-8 md:p-12 shadow-sm space-y-6 min-h-[600px] relative"
      >
        {/* Title */}
        <input
          type="text"
          value={reviewTitle}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="Untitled Review"
          spellCheck="false"
          autoCorrect="off"
          autoCapitalize="off"
          className="w-full text-4xl font-extrabold font-spartan bg-transparent border-none outline-none placeholder:text-zinc-300 dark:placeholder:text-zinc-700 text-[var(--text-primary)] focus:ring-0 focus:outline-none p-0"
        />

        <div className="text-[10px] text-[var(--text-secondary)] font-semibold flex items-center space-x-2 pb-4 border-b border-[var(--border-primary)]/50">
          <span>Personal Review for {manga.title}</span>
          {lastUpdated && (
            <>
              <span>•</span>
              <span>Last updated {new Date(lastUpdated).toLocaleString()}</span>
            </>
          )}
        </div>

        {/* Toolbar */}
        <div 
          className="sticky z-30 py-2 bg-[var(--bg-card)]"
          style={{ top: `${64 + headerHeight}px` }}
        >
          <EditorToolbar
            editor={editor}
            onImageUpload={() => fileInputRef.current?.click()}
            onVideoUpload={() => videoInputRef.current?.click()}
            onAudioUpload={() => audioInputRef.current?.click()}
            onFileAttachmentUpload={() => fileInputRef2.current?.click()}
            onInsertYoutube={() => setShowYoutubeModal(true)}
            onAI={triggerAI}
            aiLoading={aiLoading}
            onInsertMangaRef={handleInsertMangaReference}
          />
        </div>

        {/* Editor Area with slash command support */}
        <div className="relative prose prose-zinc dark:prose-invert max-w-none text-base leading-relaxed editor-content-wrapper">
          <SlashCommandMenu
            editor={editor}
            onImageUpload={() => fileInputRef.current?.click()}
            onVideoUpload={() => videoInputRef.current?.click()}
            onAudioUpload={() => audioInputRef.current?.click()}
            onFileAttachmentUpload={() => fileInputRef2.current?.click()}
            onInsertYoutube={() => setShowYoutubeModal(true)}
            onAI={triggerAI}
            onInsertMangaRef={handleInsertMangaReference}
          />
          <EditorContent editor={editor} />

          {editor && (
            <BubbleMenu
              editor={editor}
              shouldShow={({ editor }) => editor.isActive("table")}
            >
              <div className="flex items-center space-x-1 bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl shadow-xl px-2 py-1.5 text-xs font-semibold text-[var(--text-secondary)] floating-toolbar animate-in fade-in zoom-in-95 duration-100">
                <button
                  onClick={() => editor.chain().focus().addRowBefore().run()}
                  className="p-1 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded transition"
                  title="Thêm dòng phía trên"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                </button>
                <button
                  onClick={() => editor.chain().focus().addRowAfter().run()}
                  className="p-1 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded transition"
                  title="Thêm dòng phía dưới"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12"/><line x1="12" y1="5" x2="12" y2="19"/></svg>
                </button>
                
                <div className="w-px h-4 bg-[var(--border-primary)] mx-0.5" />
                
                <button
                  onClick={() => editor.chain().focus().addColumnBefore().run()}
                  className="p-1 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded transition"
                  title="Thêm cột bên trái"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12"/><line x1="12" y1="5" x2="12" y2="19"/></svg>
                </button>
                <button
                  onClick={() => editor.chain().focus().addColumnAfter().run()}
                  className="p-1 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded transition"
                  title="Thêm cột bên phải"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                </button>
                
                <div className="w-px h-4 bg-[var(--border-primary)] mx-0.5" />

                <button
                  onClick={() => editor.chain().focus().mergeCells().run()}
                  className="px-1.5 py-0.5 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded transition text-[10px] font-bold text-[var(--brand-orange)]"
                  title="Gộp các ô (Merge)"
                >
                  Merge
                </button>
                <button
                  onClick={() => editor.chain().focus().splitCell().run()}
                  className="px-1.5 py-0.5 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded transition text-[10px]"
                  title="Tách ô (Split)"
                >
                  Split
                </button>

                <div className="w-px h-4 bg-[var(--border-primary)] mx-0.5" />

                <span className="text-[9px] text-[var(--text-secondary)] uppercase font-extrabold px-1">Dọc:</span>
                <button
                  onClick={() => editor.chain().focus().setCellAttribute("verticalAlign", "top").run()}
                  className={`px-1.5 py-0.5 rounded transition text-[10px] ${
                    editor.isActive("tableCell", { verticalAlign: "top" }) || editor.isActive("tableHeader", { verticalAlign: "top" })
                      ? "text-[var(--brand-orange)] font-bold bg-orange-50 dark:bg-orange-900/10"
                      : "hover:bg-gray-100 dark:hover:bg-zinc-800"
                  }`}
                  title="Căn lề trên (Align Top)"
                >
                  Top
                </button>
                <button
                  onClick={() => editor.chain().focus().setCellAttribute("verticalAlign", "middle").run()}
                  className={`px-1.5 py-0.5 rounded transition text-[10px] ${
                    editor.isActive("tableCell", { verticalAlign: "middle" }) || editor.isActive("tableHeader", { verticalAlign: "middle" })
                      ? "text-[var(--brand-orange)] font-bold bg-orange-50 dark:bg-orange-900/10"
                      : "hover:bg-gray-100 dark:hover:bg-zinc-800"
                  }`}
                  title="Căn giữa dọc (Align Middle)"
                >
                  Mid
                </button>
                <button
                  onClick={() => editor.chain().focus().setCellAttribute("verticalAlign", "bottom").run()}
                  className={`px-1.5 py-0.5 rounded transition text-[10px] ${
                    editor.isActive("tableCell", { verticalAlign: "bottom" }) || editor.isActive("tableHeader", { verticalAlign: "bottom" })
                      ? "text-[var(--brand-orange)] font-bold bg-orange-50 dark:bg-orange-900/10"
                      : "hover:bg-gray-100 dark:hover:bg-zinc-800"
                  }`}
                  title="Căn lề dưới (Align Bottom)"
                >
                  Bot
                </button>

                <div className="w-px h-4 bg-[var(--border-primary)] mx-0.5" />

                <button
                  onClick={() => editor.chain().focus().deleteTable().run()}
                  className="p-1 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 rounded transition flex items-center space-x-1"
                  title="Xóa toàn bộ bảng"
                >
                  <Trash2 size={14} />
                  <span className="text-[10px] font-bold">Xóa Bảng</span>
                </button>
              </div>
            </BubbleMenu>
          )}
        </div>
      </div>

      {/* YouTube URL Modal */}
      {showYoutubeModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-[var(--border-primary)]">
              <h3 className="text-base font-bold text-[var(--text-primary)] flex items-center space-x-2">
                <YoutubeIcon className="text-red-500" size={18} />
                <span>Chèn Video YouTube</span>
              </h3>
              <button
                onClick={() => { setShowYoutubeModal(false); setYoutubeUrl(""); }}
                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 transition text-[var(--text-secondary)]"
              >
                <X size={18} />
              </button>
            </div>

            {/* Input */}
            <div className="p-5 space-y-4">
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                Nhập link video YouTube (Ví dụ: https://www.youtube.com/watch?v=... hoặc https://youtu.be/...) để nhúng trình phát video trực tiếp vào bài review.
              </p>
              <input
                type="text"
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && handleInsertYoutube()}
                className="w-full text-sm bg-transparent border border-[var(--border-primary)] rounded-xl px-3.5 py-2.5 outline-none focus:border-[var(--brand-orange)] text-[var(--text-primary)] transition"
              />
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end space-x-2.5 p-4 bg-[var(--bg-primary)]/40 border-t border-[var(--border-primary)]">
              <button
                onClick={() => { setShowYoutubeModal(false); setYoutubeUrl(""); }}
                className="px-3.5 py-2 text-xs font-bold text-[var(--text-secondary)] hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-xl transition"
              >
                Hủy bỏ
              </button>
              <button
                onClick={handleInsertYoutube}
                className="px-4 py-2 bg-[var(--brand-orange)] hover:bg-[var(--brand-coral)] text-white text-xs font-bold rounded-xl shadow-sm transition"
              >
                Chèn Video
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Manga Search Modal for Reference Insertion */}
      {showSearchModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-[var(--border-primary)]">
              <h3 className="text-base font-bold text-[var(--text-primary)] flex items-center space-x-2">
                <BookOpen className="text-[var(--brand-orange)]" size={18} />
                <span>Tìm kiếm Manga để liên kết</span>
              </h3>
              <button
                onClick={() => setShowSearchModal(false)}
                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 transition text-[var(--text-secondary)]"
              >
                <X size={18} />
              </button>
            </div>

            {/* Search Input */}
            <div className="p-4 bg-[var(--bg-primary)]/40 border-b border-[var(--border-primary)] relative flex items-center">
              <Search className="absolute left-7 text-[var(--text-secondary)]" size={16} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearchManga(e.target.value)}
                placeholder="Nhập tên manga, tác giả, họa sĩ..."
                autoFocus
                className="w-full text-sm bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl pl-11 pr-4 py-2.5 outline-none focus:border-[var(--brand-orange)] text-[var(--text-primary)] transition"
              />
            </div>

            {/* Results */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2.5 min-h-[200px] max-h-[400px]">
              {searchLoading && (
                <div className="flex items-center justify-center py-12 space-x-2 text-[var(--brand-orange)]">
                  <Loader2 className="animate-spin" size={20} />
                  <span className="text-xs font-semibold">Đang tìm kiếm...</span>
                </div>
              )}

              {!searchLoading && searchResults.length === 0 && searchQuery && (
                <div className="text-center py-12 text-xs text-[var(--text-secondary)] font-semibold">
                  Không tìm thấy manga nào khớp với "{searchQuery}"
                </div>
              )}

              {!searchLoading && searchResults.length === 0 && !searchQuery && (
                <div className="text-center py-12 text-xs text-[var(--text-secondary)] font-semibold">
                  Bắt đầu nhập để tìm kiếm manga trong thư viện của bạn...
                </div>
              )}

              {!searchLoading && searchResults.map((item) => (
                <button
                  key={item._id || item.id}
                  onClick={() => handleSelectMangaRef(item)}
                  className="w-full flex space-x-3.5 p-3 rounded-2xl border border-transparent hover:border-[var(--brand-orange)]/30 hover:bg-[var(--brand-orange)]/5 transition text-left items-start group"
                >
                  {item.cover_url ? (
                    <BlurredCover
                      src={item.cover_url}
                      alt={item.title}
                      className="w-10 h-14 object-cover rounded-lg border border-[var(--border-primary)] shadow-sm shrink-0"
                      shouldBlur={shouldBlur(item)}
                    />
                  ) : (
                    <div className="w-10 h-14 bg-gray-50 dark:bg-zinc-800 rounded-lg flex items-center justify-center border border-[var(--border-primary)] shrink-0">
                      <BookOpen size={16} className="text-[var(--text-secondary)]" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1 space-y-1">
                    <h4 className="text-xs font-bold text-[var(--text-primary)] group-hover:text-[var(--brand-orange)] transition line-clamp-1">
                      {item.title}
                    </h4>
                    {item.author && (
                      <p className="text-[10px] text-[var(--text-secondary)] font-semibold truncate">
                        Tác giả: {item.author}
                      </p>
                    )}
                    {item.status && (
                      <span className="inline-block text-[9px] font-bold text-zinc-500 bg-zinc-100 dark:bg-zinc-800 dark:text-zinc-400 px-1.5 py-0.5 rounded-md">
                        {item.status}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Editor Help Modal */}
      {showHelpModal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-[var(--border-primary)]">
              <h3 className="text-base font-bold text-[var(--text-primary)] flex items-center space-x-2">
                <HelpCircle className="text-[var(--brand-orange)]" size={20} />
                <span>Hướng dẫn sử dụng Trình soạn thảo</span>
              </h3>
              <button
                onClick={() => setShowHelpModal(false)}
                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 transition text-[var(--text-secondary)]"
              >
                <X size={20} />
              </button>
            </div>

            {/* Navigation Tabs */}
            <div className="flex border-b border-[var(--border-primary)] bg-[var(--bg-primary)]/40 p-2 overflow-x-auto gap-1">
              {[
                { id: "slash", label: "Lệnh nhanh (/)" },
                { id: "ai", label: "Trợ lý AI" },
                { id: "ref", label: "Tham chiếu (@)" },
                { id: "formatting", label: "Định dạng khác" },
                { id: "examples", label: "Ví dụ minh họa ✨" }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveHelpTab(tab.id as any)}
                  className={`px-4 py-2 text-xs font-bold rounded-xl transition ${
                    activeHelpTab === tab.id
                      ? "bg-[var(--brand-orange)] text-white shadow-sm"
                      : "text-[var(--text-secondary)] hover:bg-gray-100 dark:hover:bg-zinc-800"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4 text-sm leading-relaxed text-[var(--text-secondary)]">
              {activeHelpTab === "slash" && (
                <div className="space-y-4">
                  <div className="p-3.5 bg-[var(--bg-primary)]/60 rounded-2xl border border-[var(--border-primary)]">
                    <p className="text-xs font-semibold text-[var(--text-primary)] mb-1">💡 Cách kích hoạt:</p>
                    <p className="text-xs">Gõ ký tự <code className="px-1.5 py-0.5 bg-gray-150 dark:bg-zinc-800 rounded font-bold text-[var(--brand-orange)]">/</code> ở đầu dòng trống hoặc sau một dấu cách. Menu lệnh sẽ hiện ra ngay lập tức dưới con trỏ.</p>
                  </div>

                  <div className="space-y-2.5">
                    <div className="flex items-start space-x-3">
                      <span className="font-bold text-[var(--text-primary)] w-28 shrink-0">H1, H2, H3:</span>
                      <span>Tạo các tiêu đề đề mục lớn, vừa và nhỏ để phân chia bố cục bài viết.</span>
                    </div>
                    <div className="flex items-start space-x-3">
                      <span className="font-bold text-[var(--text-primary)] w-28 shrink-0">Danh sách:</span>
                      <span>Hỗ trợ danh sách không thứ tự (Bullet), có thứ tự (Numbered), và danh sách việc cần làm (Task checklist với hộp kiểm có thể tick chọn trực tiếp).</span>
                    </div>
                    <div className="flex items-start space-x-3">
                      <span className="font-bold text-[var(--text-primary)] w-28 shrink-0">Hình ảnh:</span>
                      <span>Chọn và tải ảnh trực tiếp từ máy của bạn lên server lưu trữ MinIO để chèn vào bài viết.</span>
                    </div>
                    <div className="flex items-start space-x-3">
                      <span className="font-bold text-[var(--text-primary)] w-28 shrink-0">Bảng (Table):</span>
                      <span>Chèn bảng dữ liệu Notion-style. Khi ở trong bảng, menu quản lý bảng xuất hiện hỗ trợ thêm/xóa dòng/cột, gộp/tách ô và quản lý dòng tiêu đề.</span>
                    </div>
                    <div className="flex items-start space-x-3">
                      <span className="font-bold text-[var(--text-primary)] w-28 shrink-0">Đa phương tiện:</span>
                      <span>Nhúng video YouTube, tải lên video trực tiếp (hỗ trợ streaming), tải lên tệp âm thanh (audio), hoặc đính kèm các tài liệu (PDF, ZIP, Word, v.v.).</span>
                    </div>
                    <div className="flex items-start space-x-3">
                      <span className="font-bold text-[var(--text-primary)] w-28 shrink-0">Trích dẫn / Code:</span>
                      <span>Định dạng khối trích dẫn (Blockquote) nghệ thuật hoặc khối mã nguồn (Code block) định dạng monospaced.</span>
                    </div>
                  </div>

                  <div className="border-t border-[var(--border-primary)] pt-3">
                    <p className="text-xs font-semibold text-[var(--text-primary)] mb-2">⌨️ Phím tắt khi mở menu:</p>
                    <ul className="list-disc pl-5 text-xs space-y-1">
                      <li>Sử dụng phím mũi tên <kbd className="px-1.5 py-0.5 border rounded">↑</kbd> / <kbd className="px-1.5 py-0.5 border rounded">↓</kbd> để di chuyển giữa các lệnh.</li>
                      <li>Ấn <kbd className="px-1.5 py-0.5 border rounded">Enter</kbd> để kích hoạt lệnh đang chọn.</li>
                      <li>Ấn <kbd className="px-1.5 py-0.5 border rounded">Esc</kbd> để đóng menu nhanh.</li>
                    </ul>
                  </div>
                </div>
              )}

              {activeHelpTab === "ai" && (
                <div className="space-y-4">
                  <div className="p-3.5 bg-[var(--bg-primary)]/60 rounded-2xl border border-[var(--border-primary)]">
                    <p className="text-xs font-semibold text-[var(--text-primary)] mb-1">🤖 Ba chế độ hỗ trợ bởi Google Gemini:</p>
                    <p className="text-xs">Mọi yêu cầu đều được xác nhận thông qua hộp thoại hiển thị số lượng tokens ước tính và xem trước nội dung prompt trước khi gửi.</p>
                  </div>

                  <div className="space-y-3.5">
                    <div>
                      <h4 className="font-bold text-purple-600 dark:text-purple-400 text-xs flex items-center space-x-1.5 mb-1">
                        <span>✦ Viết lại đoạn chọn (Rewrite)</span>
                      </h4>
                      <p className="text-xs">Bôi đen một đoạn văn bản (tối thiểu 50 ký tự), nhấn nút <strong>AI</strong> trên thanh công cụ hoặc gõ lệnh để chọn. Có 11 phong cách soạn sẵn (Trang trọng, Ngắn gọn, Chi tiết, Kể chuyện, Hài hước, v.v.) hoặc tự viết yêu cầu tùy chỉnh. Bản sửa đổi sẽ hiện side-by-side với so sánh khác biệt (diff view) để bạn duyệt hoặc thử lại.</p>
                    </div>

                    <div>
                      <h4 className="font-bold text-blue-500 text-xs flex items-center space-x-1.5 mb-1">
                        <span>✦ Tạo đoạn mở đầu (Intro)</span>
                      </h4>
                      <p className="text-xs">AI sẽ tự động đọc ngữ cảnh manga hiện tại (tên, tác giả, thể loại, tóm tắt) kèm theo bản nháp review hiện tại để viết một đoạn mở đầu lôi cuốn bằng tiếng Việt (thích hợp đăng mạng xã hội như Facebook/TikTok).</p>
                    </div>

                    <div>
                      <h4 className="font-bold text-amber-500 text-xs flex items-center space-x-1.5 mb-1">
                        <span>✦ Đề xuất ý tưởng phân tích (Ideas)</span>
                      </h4>
                      <p className="text-xs">AI phân tích tác phẩm và đề xuất 5-7 chủ đề/góc nhìn độc đáo phục vụ cho việc lên kịch bản review sâu sắc (phù hợp viết blog hoặc làm video YouTube/TikTok).</p>
                    </div>
                  </div>
                </div>
              )}

              {activeHelpTab === "ref" && (
                <div className="space-y-4">
                  <div className="p-3.5 bg-[var(--bg-primary)]/60 rounded-2xl border border-[var(--border-primary)]">
                    <p className="text-xs font-semibold text-[var(--text-primary)] mb-1">🔗 Tham chiếu liên kết Manga nội bộ:</p>
                    <p className="text-xs">Liên kết chéo các manga có trong thư viện của bạn với các tính năng tương tác trực quan cao.</p>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <span className="font-bold text-[var(--text-primary)] block mb-1">Chèn nhanh bằng cú pháp @:</span>
                      <p className="text-xs">Khi bạn gõ ký tự <code className="px-1.5 py-0.5 bg-gray-150 dark:bg-zinc-800 rounded font-bold text-[var(--brand-orange)]">@id_manga</code> (ví dụ: <code className="font-semibold text-zinc-500">@6a0ebc89140cfcb7986b618b</code>), hệ thống sẽ kiểm tra cơ sở dữ liệu. Nếu khớp, một popup xác nhận sẽ hiện ra cho phép bạn chèn link tham chiếu ngay lập tức.</p>
                    </div>

                    <div>
                      <span className="font-bold text-[var(--text-primary)] block mb-1">Tìm kiếm & Chèn bằng giao diện:</span>
                      <p className="text-xs">Nhấn nút <code className="font-bold">@</code> trên thanh công cụ hoặc chọn "Manga Reference" trong slash menu để mở hộp thoại tìm kiếm. Gõ từ khóa để chọn nhanh tác phẩm cần liên kết.</p>
                    </div>

                    <div>
                      <span className="font-bold text-[var(--text-primary)] block mb-1">Thay đổi Tiêu đề hiển thị:</span>
                      <p className="text-xs">Nhấp chuột trực tiếp vào liên kết tham chiếu đã chèn. Một menu popover sẽ hiển thị danh sách tất cả các tiêu đề thay thế (alt titles) của manga đó từ database, cho phép bạn đổi tên liên kết chỉ trong 1 click.</p>
                    </div>

                    <div>
                      <span className="font-bold text-[var(--text-primary)] block mb-1">Hover Preview Card:</span>
                      <p className="text-xs">Khi người dùng di chuột qua liên kết tham chiếu, một popup sang trọng sẽ hiện lên hiển thị ảnh bìa, tác giả, trạng thái xuất bản, và điểm đánh giá cá nhân của manga đó.</p>
                    </div>
                  </div>
                </div>
              )}

              {activeHelpTab === "formatting" && (
                <div className="space-y-4">
                  <div className="space-y-3">
                    <div>
                      <span className="font-bold text-[var(--text-primary)] block mb-1">Căn lề (Text Alignment):</span>
                      <p className="text-xs">Hỗ trợ Căn trái, Căn giữa, Căn phải và Căn đều hai bên trực tiếp trên các đoạn văn hoặc tiêu đề mục.</p>
                    </div>

                    <div>
                      <span className="font-bold text-[var(--text-primary)] block mb-1">Gạch chân & Tô màu nổi bật (Highlight):</span>
                      <p className="text-xs">Dùng các nút gạch dưới và bút highlight trên thanh công cụ để nhấn mạnh các từ khóa quan trọng.</p>
                    </div>

                    <div>
                      <span className="font-bold text-[var(--text-primary)] block mb-1">Chiều rộng khung soạn thảo (Width presets):</span>
                      <p className="text-xs">Bạn có thể chọn giữa các kích thước: <strong>Compact (640px)</strong>, <strong>Standard (768px)</strong>, <strong>Wide (1024px)</strong>, và <strong>Full-width (100%)</strong> ở góc trên bên phải để tối ưu hóa góc nhìn soạn thảo.</p>
                    </div>

                    <div>
                      <span className="font-bold text-[var(--text-primary)] block mb-1">Tự động dọn dẹp khoảng trắng dư thừa (Clean):</span>
                      <p className="text-xs">Nhấn nút <strong>Clean</strong> ở đầu trang để tự động dọn dẹp tất cả các ký tự Tab dính lộn, cũng như thu gọn các chuỗi khoảng trắng đôi hoặc khoảng trắng dư thừa liên tiếp về dạng 1 khoảng trắng duy nhất trên toàn bộ bài viết, giúp văn bản trở nên chuẩn mực tức thì.</p>
                    </div>
                  </div>
                </div>
              )}

              {activeHelpTab === "examples" && (
                <div className="space-y-6">
                  {/* Manga Reference Example */}
                  <div className="space-y-2">
                    <span className="text-xs font-extrabold text-[var(--brand-orange)] uppercase tracking-wider block">
                      1. Ví dụ về Tham chiếu Manga (@)
                    </span>
                    <div className="p-4 bg-[var(--bg-primary)]/40 rounded-2xl border border-[var(--border-primary)] space-y-3">
                      <p className="text-xs">
                        Khi chèn liên kết manga (gõ <code className="px-1 bg-gray-150 dark:bg-zinc-800 rounded">@</code> hoặc qua thanh công cụ), một badge liên kết thông minh sẽ hiển thị:
                      </p>
                      <div className="p-3 bg-[var(--bg-card)] rounded-xl border border-[var(--border-primary)] text-xs">
                        Gần đây tôi cực kỳ ấn tượng với tác phẩm{" "}
                        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-lg bg-[var(--brand-orange)]/10 text-[var(--brand-orange)] font-bold border border-[var(--brand-orange)]/20 cursor-pointer shadow-sm">
                          📖 Monster
                        </span>{" "}
                        của tác giả Urasawa Naoki nhờ cốt truyện trinh thám cực kỳ sâu sắc...
                      </div>
                      
                      <p className="text-xs">
                        Khi người đọc <strong>di chuột qua</strong> (hover) liên kết, một thẻ xem trước thông tin chi tiết (Preview Card) sẽ xuất hiện:
                      </p>
                      
                      {/* Fake Hover Tooltip Card */}
                      <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl p-4 shadow-lg max-w-sm space-y-3 transform scale-95 origin-top-left border-l-4 border-l-[var(--brand-orange)]">
                        <div className="flex space-x-3.5">
                          <div className="w-12 h-16 bg-zinc-200 dark:bg-zinc-800 rounded-lg overflow-hidden shrink-0 border border-[var(--border-primary)] shadow-sm">
                            <img 
                              src="https://images.unsplash.com/photo-1578632767115-351597cf2477?w=150" 
                              className="w-full h-full object-cover" 
                              alt="Monster Cover" 
                            />
                          </div>
                          <div className="min-w-0 flex-1 space-y-1">
                            <h4 className="font-bold text-xs text-[var(--text-primary)] truncate">Monster</h4>
                            <p className="text-[10px] text-[var(--text-secondary)] font-semibold truncate">Tác giả: Urasawa Naoki</p>
                            <div className="flex items-center space-x-1.5 pt-0.5">
                              <span className="inline-block text-[9px] font-bold text-green-500 bg-green-500/10 px-1.5 py-0.5 rounded-md">
                                Completed
                              </span>
                              <span className="text-[9px] font-bold text-yellow-500 bg-yellow-500/10 px-1.5 py-0.5 rounded-md flex items-center space-x-0.5">
                                <span className="fill-yellow-500">★</span> 9.5
                              </span>
                            </div>
                          </div>
                        </div>
                        <p className="text-[10px] text-[var(--text-secondary)] leading-relaxed line-clamp-2">
                          Câu chuyện bắt đầu tại Düsseldorf, Đức năm 1986, xoay quanh bác sĩ Kenzou Tenma, một bác sĩ phẫu thuật não trẻ tài hoa...
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* AI Rewrite Example */}
                  <div className="space-y-2">
                    <span className="text-xs font-extrabold text-[var(--brand-orange)] uppercase tracking-wider block">
                      2. Ví dụ về Trợ lý AI Viết lại (Rewrite Diff)
                    </span>
                    <div className="p-4 bg-[var(--bg-primary)]/40 rounded-2xl border border-[var(--border-primary)] space-y-3">
                      <p className="text-xs">
                        Bôi đen đoạn văn cần sửa đổi và chọn <strong>AI Rewrite</strong>. Hệ thống sẽ so sánh điểm khác biệt trực quan:
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                        <div className="p-3.5 bg-red-500/5 border border-red-500/15 rounded-xl space-y-1">
                          <span className="text-[9px] font-extrabold text-red-500 uppercase tracking-wider block">
                            Bản nháp gốc
                          </span>
                          <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                            bộ manga này mình thấy đọc rất là hay luôn á, mọi người nên đọc thử vì nét vẽ đẹp và cốt truyện có nhiều cú plot twist đỉnh.
                          </p>
                        </div>
                        
                        <div className="p-3.5 bg-green-500/5 border border-green-500/15 rounded-xl space-y-1">
                          <span className="text-[9px] font-extrabold text-green-500 uppercase tracking-wider block">
                            AI Viết Lại (Phong cách "Lôi cuốn")
                          </span>
                          <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                            Đây là một tác phẩm thực sự xuất sắc mà bạn không nên bỏ lỡ. Tác phẩm sở hữu nét vẽ tinh tế, sắc sảo cùng cốt truyện lôi cuốn với những cú bẻ lái (plot twist) đầy bất ngờ và ngoạn mục.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Slash Command Example */}
                  <div className="space-y-2">
                    <span className="text-xs font-extrabold text-[var(--brand-orange)] uppercase tracking-wider block">
                      3. Ví dụ về Menu lệnh nhanh (Slash Command Menu)
                    </span>
                    <div className="p-4 bg-[var(--bg-primary)]/40 rounded-2xl border border-[var(--border-primary)] space-y-3">
                      <p className="text-xs">
                        Khi gõ <code className="px-1 bg-gray-150 dark:bg-zinc-800 rounded">/</code> tại một dòng mới, menu thông minh sẽ mở ra tại vị trí con trỏ:
                      </p>
                      
                      <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl shadow-md divide-y divide-[var(--border-primary)] max-w-xs overflow-hidden text-xs transform scale-95 origin-top-left">
                        <div className="p-2 bg-[var(--bg-primary)]/60 text-[9px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                          Định dạng
                        </div>
                        <div className="flex items-center space-x-2.5 p-2 bg-[var(--brand-orange)]/10 text-[var(--brand-orange)]">
                          <span className="font-bold w-5 text-center text-xs">H1</span>
                          <span className="font-semibold text-xs">Heading 1 (Tiêu đề lớn)</span>
                        </div>
                        <div className="flex items-center space-x-2.5 p-2 hover:bg-gray-50 dark:hover:bg-zinc-800 text-[var(--text-primary)]">
                          <span className="font-bold w-5 text-center text-xs">H2</span>
                          <span className="font-semibold text-xs">Heading 2 (Tiêu đề vừa)</span>
                        </div>
                        <div className="flex items-center space-x-2.5 p-2 hover:bg-gray-50 dark:hover:bg-zinc-800 text-[var(--text-primary)]">
                          <span className="w-5 text-center text-xs">✓</span>
                          <span className="font-semibold text-xs">Task List (Việc cần làm)</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Floating Save Button */}
      <button
        onClick={handleSave}
        disabled={isSaving}
        className="fixed bottom-20 right-6 z-[100] w-12 h-12 bg-[var(--brand-orange)] hover:bg-[var(--brand-coral)] text-white rounded-full flex items-center justify-center shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-110 active:scale-95 group focus:outline-none disabled:opacity-60"
        title="Lưu bài viết (Ctrl + S)"
      >
        {isSaving ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
        )}
        <span className="absolute right-14 bg-zinc-900 dark:bg-zinc-800 text-white text-[10px] font-bold px-2 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200 whitespace-nowrap shadow-md border border-zinc-800 dark:border-zinc-700">
          Lưu bài viết (Ctrl+S)
        </span>
      </button>

      {/* Floating Help Button at the bottom-right of the screen */}
      <button
        onClick={() => setShowHelpModal(true)}
        className="fixed bottom-6 right-6 z-[100] w-12 h-12 bg-[var(--brand-orange)] hover:bg-[var(--brand-coral)] text-white rounded-full flex items-center justify-center shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-110 active:scale-95 group focus:outline-none"
        title="Hướng dẫn sử dụng Editor"
      >
        <HelpCircle size={22} className="animate-pulse-subtle" />
        <span className="absolute right-14 bg-zinc-900 dark:bg-zinc-800 text-white text-[10px] font-bold px-2 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200 whitespace-nowrap shadow-md border border-zinc-800 dark:border-zinc-700">
          Hướng dẫn sử dụng
        </span>
      </button>
    </div>
  );
};
