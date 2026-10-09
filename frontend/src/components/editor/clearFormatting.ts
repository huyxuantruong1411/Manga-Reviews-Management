import type { Editor } from "@tiptap/core";

/**
 * Robust Clear Formatting utility for TipTap:
 * 1. Unwraps and lifts list items (bulletList, orderedList, taskList, listItem, taskItem) into plain paragraphs.
 * 2. Resets block node types (headings, blockquotes, codeblocks) to standard paragraphs.
 * 3. Removes all inline marks (bold, italic, underline, strike, code, link, highlight, textStyle, color).
 * 4. Unsets text alignment.
 * 5. Strips any leading bullet characters (•, ⁃, ‣, ◦, ▪, ▫, ·, ∙, -, *, +, etc.) and trailing spacing from the start of selected lines/paragraphs.
 */
export const executeClearFormatting = (editor: Editor | null): void => {
	if (!editor) return;

	// 1. Lift or toggle off any active list formats in the selection
	for (let i = 0; i < 6; i++) {
		if (
			!editor.isActive("bulletList") &&
			!editor.isActive("orderedList") &&
			!editor.isActive("taskList") &&
			!editor.isActive("listItem") &&
			!editor.isActive("taskItem")
		) {
			break;
		}

		if (editor.isActive("bulletList")) {
			editor.chain().focus().toggleBulletList().run();
		}
		if (editor.isActive("orderedList")) {
			editor.chain().focus().toggleOrderedList().run();
		}
		if (editor.isActive("taskList")) {
			editor.chain().focus().toggleTaskList().run();
		}
		if (editor.isActive("listItem")) {
			editor.chain().focus().liftListItem("listItem").run();
		}
		if (editor.isActive("taskItem")) {
			editor.chain().focus().liftListItem("taskItem").run();
		}
	}

	// 2. Remove all inline marks and reset block formats to plain paragraphs
	editor.chain().focus().unsetAllMarks().clearNodes().unsetTextAlign().run();

	// 3. Inspect the updated selection in the document and strip any literal bullet characters
	const { state, view } = editor;
	const { from, to } = state.selection;
	const tr = view.state.tr;

	// Matches leading bullet characters:
	// • (\u2022), ‣ (\u2023), ⁃ (\u2043), ◦ (\u25E6), ▪ (\u25AA), ▫ (\u25AB), · (\u00B7), ∙ (\u2219)
	// or dashes, asterisks, pluses followed by whitespace
	const bulletRegex =
		/^\s*(?:[\u2022\u2023\u2043\u25E6\u25AA\u25AB\u00B7\u2219]\s*|[-*+–—]\s+)+/;

	const deletions: { from: number; to: number }[] = [];

	view.state.doc.nodesBetween(from, to, (node, pos) => {
		if (node.isTextblock && node.textContent) {
			const text = node.textContent;
			const match = text.match(bulletRegex);
			if (match && match[0].length > 0) {
				const startOffset = pos + 1;
				deletions.push({
					from: startOffset,
					to: startOffset + match[0].length,
				});
			}
		}
	});

	if (deletions.length > 0) {
		// Sort deletions in descending order to prevent index drift
		deletions.sort((a, b) => b.from - a.from);
		for (const del of deletions) {
			tr.delete(del.from, del.to);
		}
		view.dispatch(tr);
	}
};
