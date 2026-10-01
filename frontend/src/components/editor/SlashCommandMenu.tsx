/**
 * SlashCommandMenu — Notion-style "/" command palette for the editor.
 * Triggers when user types "/" at the start of an empty line.
 */

import {
	AlignCenter,
	AlignLeft,
	AlignRight,
	AtSign,
	Code2,
	FileText,
	Heading1,
	Heading2,
	Heading3,
	Image as ImageIcon,
	Lightbulb,
	List,
	ListChecks,
	ListOrdered,
	Minus,
	Music as MusicIcon,
	Paperclip as PaperclipIcon,
	Quote,
	Table,
	Video as VideoIcon,
	PlayCircle as YoutubeIcon,
} from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";

interface SlashCommand {
	id: string;
	title: string;
	description: string;
	icon: React.ReactNode;
	action: (editor: any) => void;
}

interface SlashCommandMenuProps {
	editor: any;
	onImageUpload: () => void;
	onAI: (mode: "intro" | "ideas") => void;
	onInsertMangaRef: () => void;
	onInsertYoutube: () => void;
	onVideoUpload: () => void;
	onAudioUpload: () => void;
	onFileAttachmentUpload: () => void;
}

export const SlashCommandMenu: React.FC<SlashCommandMenuProps> = ({
	editor,
	onImageUpload,
	onAI,
	onInsertMangaRef,
	onInsertYoutube,
	onVideoUpload,
	onAudioUpload,
	onFileAttachmentUpload,
}) => {
	const [isOpen, setIsOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [position, setPosition] = useState({ top: 0, left: 0 });
	const [selectedIndex, setSelectedIndex] = useState(0);
	const menuRef = useRef<HTMLDivElement>(null);
	const slashPosRef = useRef<number | null>(null);

	const allCommands: SlashCommand[] = [
		{
			id: "h1",
			title: "Heading 1",
			description: "Large section heading",
			icon: <Heading1 size={16} />,
			action: (e) => e.chain().focus().toggleHeading({ level: 1 }).run(),
		},
		{
			id: "h2",
			title: "Heading 2",
			description: "Medium section heading",
			icon: <Heading2 size={16} />,
			action: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
		},
		{
			id: "h3",
			title: "Heading 3",
			description: "Small section heading",
			icon: <Heading3 size={16} />,
			action: (e) => e.chain().focus().toggleHeading({ level: 3 }).run(),
		},
		{
			id: "bullet",
			title: "Bullet List",
			description: "Unordered list",
			icon: <List size={16} />,
			action: (e) => e.chain().focus().toggleBulletList().run(),
		},
		{
			id: "ordered",
			title: "Ordered List",
			description: "Numbered list",
			icon: <ListOrdered size={16} />,
			action: (e) => e.chain().focus().toggleOrderedList().run(),
		},
		{
			id: "tasks",
			title: "Task List",
			description: "Checklist with checkboxes",
			icon: <ListChecks size={16} />,
			action: (e) => e.chain().focus().toggleTaskList().run(),
		},
		{
			id: "table",
			title: "Table",
			description: "Insert a 3x3 table",
			icon: <Table size={16} className="text-teal-500" />,
			action: (e) =>
				e
					.chain()
					.focus()
					.insertTable({ rows: 3, cols: 3, withHeaderRow: true })
					.run(),
		},
		{
			id: "quote",
			title: "Blockquote",
			description: "Highlighted quote block",
			icon: <Quote size={16} />,
			action: (e) => e.chain().focus().toggleBlockquote().run(),
		},
		{
			id: "code",
			title: "Code Block",
			description: "Monospaced code block",
			icon: <Code2 size={16} />,
			action: (e) => e.chain().focus().toggleCodeBlock().run(),
		},
		{
			id: "divider",
			title: "Divider",
			description: "Horizontal rule",
			icon: <Minus size={16} />,
			action: (e) => e.chain().focus().setHorizontalRule().run(),
		},
		{
			id: "image",
			title: "Image",
			description: "Upload an image",
			icon: <ImageIcon size={16} />,
			action: () => onImageUpload(),
		},
		{
			id: "youtube",
			title: "YouTube Embed",
			description: "Embed a YouTube video player",
			icon: <YoutubeIcon size={16} className="text-red-500" />,
			action: () => onInsertYoutube(),
		},
		{
			id: "video",
			title: "Upload Video",
			description: "Upload video to editor",
			icon: <VideoIcon size={16} className="text-blue-500" />,
			action: () => onVideoUpload(),
		},
		{
			id: "audio",
			title: "Upload Audio",
			description: "Upload audio file to editor",
			icon: <MusicIcon size={16} className="text-emerald-500" />,
			action: () => onAudioUpload(),
		},
		{
			id: "file",
			title: "Upload Document",
			description: "Upload and attach document files",
			icon: <PaperclipIcon size={16} className="text-amber-500" />,
			action: () => onFileAttachmentUpload(),
		},
		{
			id: "align-left",
			title: "Align Left",
			description: "Left-align text",
			icon: <AlignLeft size={16} />,
			action: (e) => e.chain().focus().setTextAlign("left").run(),
		},
		{
			id: "align-center",
			title: "Align Center",
			description: "Center-align text",
			icon: <AlignCenter size={16} />,
			action: (e) => e.chain().focus().setTextAlign("center").run(),
		},
		{
			id: "align-right",
			title: "Align Right",
			description: "Right-align text",
			icon: <AlignRight size={16} />,
			action: (e) => e.chain().focus().setTextAlign("right").run(),
		},
		{
			id: "ai-intro",
			title: "Generate Intro",
			description: "AI introduction paragraph",
			icon: <FileText size={16} className="text-purple-500" />,
			action: () => onAI("intro"),
		},
		{
			id: "ai-ideas",
			title: "Generate Ideas",
			description: "AI review topic suggestions",
			icon: <Lightbulb size={16} className="text-yellow-500" />,
			action: () => onAI("ideas"),
		},
		{
			id: "manga-ref",
			title: "Manga Reference",
			description: "Insert a manga link / hover-card",
			icon: <AtSign size={16} className="text-[var(--brand-orange)]" />,
			action: () => onInsertMangaRef(),
		},
	];

	const filteredCommands = allCommands.filter(
		(cmd) =>
			cmd.title.toLowerCase().includes(query.toLowerCase()) ||
			cmd.description.toLowerCase().includes(query.toLowerCase()),
	);

	const closeMenu = useCallback(() => {
		setIsOpen(false);
		setQuery("");
		setSelectedIndex(0);
		slashPosRef.current = null;
	}, []);

	const executeCommand = useCallback(
		(cmd: SlashCommand) => {
			if (!editor || slashPosRef.current === null) return;
			// Delete the slash + query text
			const { state } = editor;
			const { from } = state.selection;
			const deleteFrom = slashPosRef.current;
			const deleteTo = from;
			editor
				.chain()
				.focus()
				.deleteRange({ from: deleteFrom, to: deleteTo })
				.run();
			// Execute the command
			cmd.action(editor);
			closeMenu();
		},
		[editor, closeMenu],
	);

	// Listen for keystrokes in editor
	useEffect(() => {
		if (!editor) return;

		const handleKeyDown = (e: KeyboardEvent) => {
			if (!isOpen) return;

			if (e.key === "ArrowDown") {
				e.preventDefault();
				setSelectedIndex((i) => Math.min(i + 1, filteredCommands.length - 1));
			} else if (e.key === "ArrowUp") {
				e.preventDefault();
				setSelectedIndex((i) => Math.max(i - 1, 0));
			} else if (e.key === "Enter") {
				e.preventDefault();
				if (filteredCommands[selectedIndex]) {
					executeCommand(filteredCommands[selectedIndex]);
				}
			} else if (e.key === "Escape") {
				closeMenu();
			}
		};

		document.addEventListener("keydown", handleKeyDown, true);
		return () => document.removeEventListener("keydown", handleKeyDown, true);
	}, [isOpen, filteredCommands, selectedIndex, executeCommand, closeMenu]);

	// Listen for text updates
	useEffect(() => {
		if (!editor) return;

		const handleUpdate = () => {
			const { state } = editor;
			const { from } = state.selection;
			const textBefore = state.doc.textBetween(
				Math.max(0, from - 50),
				from,
				"\n",
			);
			const lastNewline = textBefore.lastIndexOf("\n");
			const lineText =
				lastNewline >= 0 ? textBefore.slice(lastNewline + 1) : textBefore;

			if (lineText.startsWith("/")) {
				const q = lineText.slice(1);
				setQuery(q);
				setSelectedIndex(0);
				if (!isOpen) {
					slashPosRef.current = from - lineText.length;
				}
				// Position menu near cursor
				try {
					const coords = editor.view.coordsAtPos(from);
					const editorEl = editor.view.dom.closest(
						".editor-content-wrapper",
					) as HTMLElement;
					if (editorEl) {
						const rect = editorEl.getBoundingClientRect();
						setPosition({
							top: coords.bottom - rect.top + 8,
							left: coords.left - rect.left,
						});
					}
				} catch {}
				setIsOpen(true);
			} else {
				if (isOpen) closeMenu();
			}
		};

		editor.on("update", handleUpdate);
		return () => editor.off("update", handleUpdate);
	}, [editor, isOpen, closeMenu]);

	if (!isOpen || filteredCommands.length === 0) return null;

	return (
		<div
			ref={menuRef}
			className="absolute z-50 bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl shadow-2xl overflow-hidden w-64"
			style={{ top: position.top, left: position.left }}
		>
			<div className="p-1.5 text-[10px] text-[var(--text-secondary)] font-bold uppercase tracking-wider px-3 pt-2.5">
				Lệnh nhanh
			</div>
			<div className="max-h-64 overflow-y-auto">
				{filteredCommands.map((cmd, idx) => (
					<button
						key={cmd.id}
						className={`w-full flex items-center space-x-3 px-3 py-2.5 text-left transition ${
							idx === selectedIndex
								? "bg-[var(--brand-orange)]/10 text-[var(--brand-orange)]"
								: "hover:bg-gray-50 dark:hover:bg-zinc-800 text-[var(--text-primary)]"
						}`}
						onMouseDown={(e) => {
							e.preventDefault();
							executeCommand(cmd);
						}}
						onMouseEnter={() => setSelectedIndex(idx)}
					>
						<span
							className={`shrink-0 ${idx === selectedIndex ? "text-[var(--brand-orange)]" : "text-[var(--text-secondary)]"}`}
						>
							{cmd.icon}
						</span>
						<div>
							<div className="text-xs font-semibold">{cmd.title}</div>
							<div className="text-[10px] text-[var(--text-secondary)]">
								{cmd.description}
							</div>
						</div>
					</button>
				))}
			</div>
		</div>
	);
};
