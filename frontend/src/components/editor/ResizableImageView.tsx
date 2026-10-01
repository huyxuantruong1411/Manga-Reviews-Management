/**
 * ResizableImageView — React NodeView for ResizableImageExtension.
 * Features: drag-to-resize, alignment controls, caption, floating toolbar, image cropping.
 */

import { NodeViewWrapper } from "@tiptap/react";
import {
	AlignCenter,
	AlignLeft,
	AlignRight,
	Crop,
	GripVertical,
	Loader2,
	Maximize2,
	Trash2,
	Type,
	X,
} from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import client from "../../api/client";

interface ResizableImageViewProps {
	editor: any;
	node: any;
	updateAttributes: (attrs: any) => void;
	deleteNode: () => void;
	selected: boolean;
	getPos: () => number;
	extension: any;
}

export const ResizableImageView: React.FC<ResizableImageViewProps> = ({
	editor,
	node,
	updateAttributes,
	deleteNode,
	selected,
	getPos,
	extension,
}) => {
	const { src, alt, width, alignment, caption } = node.attrs;
	const imgRef = useRef<HTMLImageElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const [, setIsResizing] = useState(false);
	const [showCaption, setShowCaption] = useState(!!caption);
	const [captionText, setCaptionText] = useState(caption || "");
	const [currentWidth, setCurrentWidth] = useState<number | null>(null);

	// Crop states
	const [isCropModalOpen, setIsCropModalOpen] = useState(false);
	const [cropRect, setCropRect] = useState({ x: 10, y: 10, w: 80, h: 80 });
	const [isCropping, setIsCropping] = useState(false);
	const cropImgRef = useRef<HTMLImageElement>(null);

	// Manual Node Selection on click
	const selectNode = useCallback(
		(e: React.MouseEvent) => {
			const target = e.target as HTMLElement;
			if (
				target.closest(".resize-handle") ||
				target.closest(".floating-toolbar")
			) {
				return;
			}
			if (typeof getPos === "function") {
				e.preventDefault();
				e.stopPropagation();
				const pos = getPos();
				editor.commands.setNodeSelection(pos);
			}
		},
		[editor, getPos],
	);

	const startResize = useCallback(
		(e: React.MouseEvent, corner: string) => {
			e.preventDefault();
			e.stopPropagation();
			setIsResizing(true);

			const startX = e.clientX;
			const container = containerRef.current?.parentElement;
			if (!container || !imgRef.current) return;

			const containerWidth = container.getBoundingClientRect().width;
			const imgRect = imgRef.current.getBoundingClientRect();
			const startImgWidth = imgRect.width;

			const onMouseMove = (ev: MouseEvent) => {
				let dx = ev.clientX - startX;
				if (
					corner === "left" ||
					corner === "top-left" ||
					corner === "bottom-left"
				) {
					dx = -dx;
				}
				const newWidth = Math.max(
					100,
					Math.min(containerWidth, startImgWidth + dx),
				);
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
		[currentWidth, updateAttributes],
	);

	// Sync currentWidth when width changes externally
	useEffect(() => {
		const numW = parseInt(width);
		if (!isNaN(numW)) setCurrentWidth(numW);
	}, [width]);

	const handleCaptionBlur = () => {
		updateAttributes({ caption: captionText });
	};

	// Crop Box drag to move
	const handleCropBoxMouseDown = (e: React.MouseEvent) => {
		e.preventDefault();
		const startX = e.clientX;
		const startY = e.clientY;
		const imgEl = cropImgRef.current;
		if (!imgEl) return;
		const rect = imgEl.getBoundingClientRect();
		const initialRect = { ...cropRect };

		const onMouseMove = (ev: MouseEvent) => {
			const dx = ((ev.clientX - startX) / rect.width) * 100;
			const dy = ((ev.clientY - startY) / rect.height) * 100;

			let newX = initialRect.x + dx;
			let newY = initialRect.y + dy;

			if (newX < 0) newX = 0;
			if (newY < 0) newY = 0;
			if (newX + initialRect.w > 100) newX = 100 - initialRect.w;
			if (newY + initialRect.h > 100) newY = 100 - initialRect.h;

			setCropRect((prev) => ({ ...prev, x: newX, y: newY }));
		};

		const onMouseUp = () => {
			document.removeEventListener("mousemove", onMouseMove);
			document.removeEventListener("mouseup", onMouseUp);
		};

		document.addEventListener("mousemove", onMouseMove);
		document.addEventListener("mouseup", onMouseUp);
	};

	// Crop Box handles resize
	const handleHandleMouseDown = (e: React.MouseEvent, handle: string) => {
		e.preventDefault();
		e.stopPropagation();
		const startX = e.clientX;
		const startY = e.clientY;
		const imgEl = cropImgRef.current;
		if (!imgEl) return;
		const rect = imgEl.getBoundingClientRect();
		const initialRect = { ...cropRect };

		const onMouseMove = (ev: MouseEvent) => {
			const dx = ((ev.clientX - startX) / rect.width) * 100;
			const dy = ((ev.clientY - startY) / rect.height) * 100;

			let newX = initialRect.x;
			let newY = initialRect.y;
			let newW = initialRect.w;
			let newH = initialRect.h;

			if (handle === "top-left") {
				newX = initialRect.x + dx;
				newY = initialRect.y + dy;
				newW = initialRect.w - dx;
				newH = initialRect.h - dy;
			} else if (handle === "top-right") {
				newY = initialRect.y + dy;
				newW = initialRect.w + dx;
				newH = initialRect.h - dy;
			} else if (handle === "bottom-left") {
				newX = initialRect.x + dx;
				newW = initialRect.w - dx;
				newH = initialRect.h + dy;
			} else if (handle === "bottom-right") {
				newW = initialRect.w + dx;
				newH = initialRect.h + dy;
			}

			const MIN_SIZE = 5;
			if (newW < MIN_SIZE) {
				if (handle === "top-left" || handle === "bottom-left") {
					newX = initialRect.x + initialRect.w - MIN_SIZE;
				}
				newW = MIN_SIZE;
			}
			if (newH < MIN_SIZE) {
				if (handle === "top-left" || handle === "top-right") {
					newY = initialRect.y + initialRect.h - MIN_SIZE;
				}
				newH = MIN_SIZE;
			}

			if (newX < 0) {
				newW += newX;
				newX = 0;
			}
			if (newY < 0) {
				newH += newY;
				newY = 0;
			}
			if (newX + newW > 100) {
				newW = 100 - newX;
			}
			if (newY + newH > 100) {
				newH = 100 - newY;
			}

			setCropRect({ x: newX, y: newY, w: newW, h: newH });
		};

		const onMouseUp = () => {
			document.removeEventListener("mousemove", onMouseMove);
			document.removeEventListener("mouseup", onMouseUp);
		};

		document.addEventListener("mousemove", onMouseMove);
		document.addEventListener("mouseup", onMouseUp);
	};

	const handleApplyCrop = useCallback(() => {
		const img = cropImgRef.current;
		if (!img) return;

		const naturalW = img.naturalWidth;
		const naturalH = img.naturalHeight;

		const cropX = (cropRect.x / 100) * naturalW;
		const cropY = (cropRect.y / 100) * naturalH;
		const cropW = (cropRect.w / 100) * naturalW;
		const cropH = (cropRect.h / 100) * naturalH;

		const canvas = document.createElement("canvas");
		canvas.width = cropW;
		canvas.height = cropH;

		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		try {
			ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
		} catch (err) {
			console.error("Canvas draw failed", err);
			return;
		}

		const mangaId = extension.options.mangaId;

		canvas.toBlob(
			async (blob) => {
				if (!blob) return;
				setIsCropping(true);
				const file = new File([blob], `cropped-${Date.now()}.jpg`, {
					type: "image/jpeg",
				});
				const formData = new FormData();
				formData.append("file", file);

				try {
					const res = await client.post(
						`/api/manga/${mangaId}/reviews/upload-image`,
						formData,
						{ headers: { "Content-Type": "multipart/form-data" } },
					);
					updateAttributes({ src: res.data.url });
					setIsCropModalOpen(false);
				} catch (uploadErr) {
					console.error("Upload cropped image failed", uploadErr);
				} finally {
					setIsCropping(false);
				}
			},
			"image/jpeg",
			0.9,
		);
	}, [cropRect, extension, updateAttributes]);

	const alignMap: Record<string, string> = {
		left: "mr-auto",
		center: "mx-auto",
		right: "ml-auto",
		full: "w-full",
	};
	const alignClass = alignMap[alignment] || "mx-auto";

	const displayWidth = currentWidth ? `${currentWidth}%` : width;

	return (
		<NodeViewWrapper className="relative my-4" data-drag-handle>
			<div
				ref={containerRef}
				className={`relative group ${alignClass}`}
				style={{
					width: alignment === "full" ? "100%" : displayWidth,
					maxWidth: "100%",
				}}
			>
				{/* Floating toolbar */}
				{selected && (
					<div className="absolute -top-10 left-1/2 -translate-x-1/2 z-30 flex items-center space-x-1 bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl shadow-xl px-2 py-1.5 animate-in fade-in slide-in-from-bottom-1 duration-150 floating-toolbar">
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
							onClick={() => setIsCropModalOpen(true)}
							className="p-1 rounded-lg text-[var(--text-secondary)] hover:bg-gray-100 dark:hover:bg-zinc-800 hover:text-[var(--brand-orange)] transition animate-pulse-subtle"
							title="Crop Image"
						>
							<Crop size={14} />
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
				<div
					onMouseDown={selectNode}
					className={`relative inline-block w-full cursor-pointer ${selected ? "ring-2 ring-[var(--brand-orange)] ring-offset-2 rounded-lg" : ""}`}
				>
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
								className="absolute top-1/2 -right-2 -translate-y-1/2 w-4 h-10 bg-[var(--brand-orange)] rounded-full cursor-ew-resize flex items-center justify-center shadow-md hover:scale-110 transition opacity-80 hover:opacity-100 resize-handle"
								onMouseDown={(e) => startResize(e, "right")}
							>
								<GripVertical
									size={10}
									className="text-white pointer-events-none"
								/>
							</div>
							{/* Left handle */}
							<div
								className="absolute top-1/2 -left-2 -translate-y-1/2 w-4 h-10 bg-[var(--brand-orange)] rounded-full cursor-ew-resize flex items-center justify-center shadow-md hover:scale-110 transition opacity-80 hover:opacity-100 resize-handle"
								onMouseDown={(e) => startResize(e, "left")}
							>
								<GripVertical
									size={10}
									className="text-white pointer-events-none"
								/>
							</div>
							{/* Corner handles */}
							<div
								className="absolute -bottom-1.5 -right-1.5 w-3.5 h-3.5 bg-[var(--brand-orange)] rounded-full cursor-nwse-resize shadow-md hover:scale-125 transition resize-handle"
								onMouseDown={(e) => startResize(e, "bottom-right")}
							/>
							<div
								className="absolute -bottom-1.5 -left-1.5 w-3.5 h-3.5 bg-[var(--brand-orange)] rounded-full cursor-nesw-resize shadow-md hover:scale-125 transition resize-handle"
								onMouseDown={(e) => startResize(e, "bottom-left")}
							/>
							<div
								className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-[var(--brand-orange)] rounded-full cursor-nesw-resize shadow-md hover:scale-125 transition resize-handle"
								onMouseDown={(e) => startResize(e, "top-right")}
							/>
							<div
								className="absolute -top-1.5 -left-1.5 w-3.5 h-3.5 bg-[var(--brand-orange)] rounded-full cursor-nwse-resize shadow-md hover:scale-125 transition resize-handle"
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

			{/* Crop Modal */}
			{isCropModalOpen && (
				<div
					onClick={(e) => e.stopPropagation()}
					onKeyDown={(e) => e.stopPropagation()}
					className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
				>
					<div className="bg-[var(--bg-card)] border border-[var(--border-primary)] w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
						{/* Header */}
						<div className="flex items-center justify-between p-5 border-b border-[var(--border-primary)]">
							<h3 className="text-base font-bold text-[var(--text-primary)] flex items-center space-x-2">
								<Crop className="text-[var(--brand-orange)]" size={18} />
								<span>Cắt hình ảnh</span>
							</h3>
							<button
								onClick={() => setIsCropModalOpen(false)}
								className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 transition text-[var(--text-secondary)]"
								disabled={isCropping}
							>
								<X size={18} />
							</button>
						</div>

						{/* Crop Area */}
						<div className="flex-1 p-6 overflow-auto flex items-center justify-center bg-[var(--bg-primary)]/40 min-h-[300px]">
							<div className="relative inline-block select-none overflow-hidden rounded-lg shadow-md max-w-full">
								<img
									ref={cropImgRef}
									src={src}
									alt="Crop Preview"
									className="max-w-full max-h-[50vh] object-contain block select-none pointer-events-none"
									crossOrigin="anonymous"
								/>

								{/* Crop Box Overlay */}
								<div
									style={{
										position: "absolute",
										left: `${cropRect.x}%`,
										top: `${cropRect.y}%`,
										width: `${cropRect.w}%`,
										height: `${cropRect.h}%`,
									}}
									className="border-2 border-dashed border-[var(--brand-orange)] shadow-[0_0_0_9999px_rgba(0,0,0,0.6)] cursor-move"
									onMouseDown={handleCropBoxMouseDown}
								>
									{/* Corner handles */}
									{/* Top-Left */}
									<div
										className="absolute -top-1.5 -left-1.5 w-3.5 h-3.5 bg-[var(--brand-orange)] rounded-full cursor-nwse-resize shadow-md"
										onMouseDown={(e) => handleHandleMouseDown(e, "top-left")}
									/>
									{/* Top-Right */}
									<div
										className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-[var(--brand-orange)] rounded-full cursor-nesw-resize shadow-md"
										onMouseDown={(e) => handleHandleMouseDown(e, "top-right")}
									/>
									{/* Bottom-Left */}
									<div
										className="absolute -bottom-1.5 -left-1.5 w-3.5 h-3.5 bg-[var(--brand-orange)] rounded-full cursor-nesw-resize shadow-md"
										onMouseDown={(e) => handleHandleMouseDown(e, "bottom-left")}
									/>
									{/* Bottom-Right */}
									<div
										className="absolute -bottom-1.5 -right-1.5 w-3.5 h-3.5 bg-[var(--brand-orange)] rounded-full cursor-nwse-resize shadow-md"
										onMouseDown={(e) =>
											handleHandleMouseDown(e, "bottom-right")
										}
									/>
								</div>
							</div>
						</div>

						{/* Footer */}
						<div className="flex items-center justify-end space-x-2.5 p-4 bg-[var(--bg-primary)]/40 border-t border-[var(--border-primary)]">
							<button
								onClick={() => setIsCropModalOpen(false)}
								className="px-4 py-2 text-xs font-bold text-[var(--text-secondary)] hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-xl transition"
								disabled={isCropping}
							>
								Hủy bỏ
							</button>
							<button
								onClick={handleApplyCrop}
								className="px-5 py-2 bg-[var(--brand-orange)] hover:bg-[var(--brand-coral)] text-white text-xs font-bold rounded-xl shadow-sm transition flex items-center space-x-1.5 disabled:opacity-60"
								disabled={isCropping}
							>
								{isCropping ? (
									<>
										<Loader2 className="animate-spin" size={14} />
										<span>Đang cắt ảnh...</span>
									</>
								) : (
									<>
										<Crop size={14} />
										<span>Áp dụng</span>
									</>
								)}
							</button>
						</div>
					</div>
				</div>
			)}
		</NodeViewWrapper>
	);
};
