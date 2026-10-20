import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

const URL_REGEX = /(https?:\/\/[^\s<>"{}|\\^`[\]]+|www\.[^\s<>"{}|\\^`[\]]+)/gi;

function cleanUrlMatch(matchedText: string): { url: string; length: number } {
	let clean = matchedText;
	while (clean.length > 0 && /[.,;:!?)]$/.test(clean)) {
		if (
			clean.endsWith(")") &&
			(clean.match(/\(/g) || []).length >= (clean.match(/\)/g) || []).length
		) {
			break;
		}
		clean = clean.slice(0, -1);
	}
	return { url: clean, length: clean.length };
}

export const UrlHighlightExtension = Extension.create({
	name: "urlHighlight",

	addProseMirrorPlugins() {
		return [
			new Plugin({
				key: new PluginKey("urlHighlightPlugin"),
				props: {
					decorations(state) {
						const { doc } = state;
						const decorations: Decoration[] = [];

						doc.descendants((node, pos) => {
							if (!node.isText || !node.text) {
								return;
							}

							// If the text node already has a link mark, the Link extension handles it
							const hasLinkMark = node.marks.some(
								(mark) => mark.type.name === "link",
							);
							if (hasLinkMark) {
								return;
							}

							const matches = node.text.matchAll(URL_REGEX);
							for (const match of matches) {
								if (match.index === undefined) continue;

								const { url, length } = cleanUrlMatch(match[0]);
								if (!url) continue;

								const start = pos + match.index;
								const end = start + length;

								decorations.push(
									Decoration.inline(start, end, {
										class: "editor-url-highlight",
										"data-url": url,
										title: `URL: ${url} (Ctrl + Click để mở)`,
									}),
								);
							}
						});

						return DecorationSet.create(doc, decorations);
					},
					handleClick(_view, _pos, event) {
						const target = event.target as HTMLElement | null;
						if (!target) return false;

						const urlEl = target.closest(
							".editor-url-highlight, .editor-url-link, a:not(.manga-reference-link)",
						);
						if (!urlEl) return false;

						// If Ctrl/Cmd is pressed, open the URL in a new window/tab
						if (event.ctrlKey || event.metaKey) {
							const href =
								urlEl.getAttribute("href") ||
								urlEl.getAttribute("data-url") ||
								urlEl.textContent?.trim();
							if (href) {
								const fullUrl = href.startsWith("http")
									? href
									: `https://${href}`;
								window.open(fullUrl, "_blank", "noopener,noreferrer");
								return true;
							}
						}

						return false;
					},
				},
			}),
		];
	},
});
