/**
 * ResizableImageExtension — Custom Tiptap Node for images with
 * resize handles, alignment controls, and optional captions.
 */

import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { ResizableImageView } from "./ResizableImageView";

export const ResizableImageExtension = Node.create({
  name: "image",
  group: "block",
  draggable: true,
  atom: true,

  addOptions() {
    return {
      mangaId: "",
    };
  },

  addAttributes() {
    return {
      src: { default: null },
      alt: { default: "" },
      title: { default: "" },
      width: { default: "100%" },
      height: { default: "auto" },
      alignment: { default: "center" }, // left, center, right, full
      caption: { default: "" },
    };
  },

  parseHTML() {
    return [
      {
        tag: "div[data-resizable-image]",
      },
      // Also parse regular img tags to support existing content
      {
        tag: "img[src]",
        getAttrs: (dom: HTMLElement) => ({
          src: dom.getAttribute("src"),
          alt: dom.getAttribute("alt") || "",
          title: dom.getAttribute("title") || "",
          width: dom.style.width || dom.getAttribute("width") || "100%",
          height: dom.style.height || dom.getAttribute("height") || "auto",
        }),
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-resizable-image": "" }),
      ["img", { src: HTMLAttributes.src, alt: HTMLAttributes.alt }],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageView as any);
  },

  addCommands() {
    return {
      setResizableImage:
        (options: { src: string; alt?: string; title?: string; width?: string; alignment?: string }) =>
        ({ commands }: any) => {
          return commands.insertContent({
            type: this.name,
            attrs: options,
          });
        },
    } as any;
  },
});
