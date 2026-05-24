import { Node, mergeAttributes } from "@tiptap/core";

export const MangaReferenceExtension = Node.create({
  name: "mangaReference",
  group: "inline",
  inline: true,
  selectable: true,
  atom: true,

  addAttributes() {
    return {
      mangaId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-manga-id"),
        renderHTML: (attributes) => ({
          "data-manga-id": attributes.mangaId,
        }),
      },
      displayTitle: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-display-title") || element.textContent,
        renderHTML: (attributes) => ({
          "data-display-title": attributes.displayTitle,
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "a[data-manga-id]",
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "a",
      mergeAttributes(HTMLAttributes, {
        class: "manga-reference-link text-[var(--brand-orange)] font-semibold hover:underline cursor-pointer transition-all duration-200",
        href: `/manga/${HTMLAttributes["data-manga-id"]}`,
        target: "_blank",
        rel: "noopener noreferrer",
      }),
      HTMLAttributes["data-display-title"] || "Manga",
    ];
  },
});
