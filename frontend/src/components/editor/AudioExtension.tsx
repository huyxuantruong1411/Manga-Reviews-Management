/**
 * AudioExtension — Custom Tiptap Node for audio embeds.
 * Renders a styled <audio> player with controls.
 */

import { mergeAttributes, Node } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import { Music, Trash2, Volume2 } from "lucide-react";
import type React from "react";

// ─── React NodeView ──────────────────────────────────────────
const AudioNodeView: React.FC<{
	node: any;
	deleteNode: () => void;
	selected: boolean;
}> = ({ node, deleteNode, selected }) => {
	const { src, filename } = node.attrs;

	return (
		<NodeViewWrapper className="relative my-4">
			<div
				className={`relative mx-auto max-w-[640px] rounded-2xl border transition-all duration-200 ${
					selected
						? "border-[var(--brand-orange)] ring-2 ring-[var(--brand-orange)]/30 bg-gradient-to-r from-orange-50/50 to-amber-50/50 dark:from-orange-900/10 dark:to-amber-900/10"
						: "border-[var(--border-primary)] bg-[var(--bg-primary)]/40"
				} p-4`}
			>
				<div className="flex items-center space-x-3">
					<div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--brand-orange)] to-[var(--brand-coral)] flex items-center justify-center shrink-0 shadow-sm">
						<Music size={18} className="text-white" />
					</div>
					<div className="flex-1 min-w-0">
						{filename && (
							<div className="text-xs font-bold text-[var(--text-primary)] truncate mb-1.5 flex items-center space-x-1">
								<Volume2
									size={12}
									className="text-[var(--text-secondary)] shrink-0"
								/>
								<span>{filename}</span>
							</div>
						)}
						<audio
							src={src}
							controls
							preload="metadata"
							className="w-full h-8"
							style={{ display: "block" }}
						>
							Your browser does not support the audio tag.
						</audio>
					</div>
					{selected && (
						<button
							onClick={deleteNode}
							className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition shrink-0"
							title="Delete Audio"
						>
							<Trash2 size={14} />
						</button>
					)}
				</div>
			</div>
		</NodeViewWrapper>
	);
};

// ─── Tiptap Node Extension ──────────────────────────────────
export const AudioExtension = Node.create({
	name: "audio",
	group: "block",
	draggable: true,
	atom: true,

	addAttributes() {
		return {
			src: { default: null },
			filename: { default: "" },
		};
	},

	parseHTML() {
		return [{ tag: "div[data-audio]" }];
	},

	renderHTML({ HTMLAttributes }) {
		return [
			"div",
			mergeAttributes(HTMLAttributes, { "data-audio": "" }),
			["audio", { src: HTMLAttributes.src, controls: "true" }],
		];
	},

	addNodeView() {
		return ReactNodeViewRenderer(AudioNodeView);
	},

	addCommands() {
		return {
			setAudio:
				(options: { src: string; filename?: string }) =>
				({ commands }: any) => {
					return commands.insertContent({
						type: this.name,
						attrs: options,
					});
				},
		} as any;
	},
});
