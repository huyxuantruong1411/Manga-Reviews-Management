import { getMangaCoverImageUrl } from "../../api/tierlists";
import type { TierlistDetail } from "../../types/tierlist";
import { TIER_COLOR_THEMES } from "../../types/tierlist";

/**
 * Helper to load an image element asynchronously.
 */
function loadImage(src: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.crossOrigin = "anonymous";
		img.onload = () => resolve(img);
		img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
		img.src = src;
	});
}

/**
 * Export full tierlist board to a high-resolution PNG image via HTML5 Canvas.
 * Uses same-origin cover images to guarantee zero CORS tainted canvas errors.
 */
export async function exportTierlistToPng(
	tierlist: TierlistDetail,
): Promise<void> {
	const canvas = document.createElement("canvas");
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("Could not acquire 2D canvas context");

	// Dimensions & Scaling (Retina 2x)
	const scale = 2;
	const boardWidth = 1200;
	const headerHeight = 110;
	const rowHeaderWidth = 180;
	const cardWidth = 110;
	const cardHeight = tierlist.settings.card_aspect === "square" ? 110 : 160;
	const cardGap = 12;
	const rowPaddingY = 14;
	const rowPaddingX = 14;

	// Calculate height needed for each tier row based on card wrapping
	const cardsPerRowMax = Math.max(
		1,
		Math.floor(
			(boardWidth - rowHeaderWidth - rowPaddingX * 2) / (cardWidth + cardGap),
		),
	);

	const rowHeights = tierlist.tiers.map((row) => {
		const numCards = row.items.length;
		if (numCards === 0) return 90;
		const numLines = Math.ceil(numCards / cardsPerRowMax);
		return numLines * cardHeight + (numLines - 1) * cardGap + rowPaddingY * 2;
	});

	const totalRowsHeight = rowHeights.reduce((acc, h) => acc + h, 0);
	const footerHeight = 40;
	const boardHeight = headerHeight + totalRowsHeight + footerHeight;

	canvas.width = boardWidth * scale;
	canvas.height = boardHeight * scale;
	ctx.scale(scale, scale);

	// 1. Background
	ctx.fillStyle = "#09090b"; // Rich dark background
	ctx.fillRect(0, 0, boardWidth, boardHeight);

	// 2. Header
	ctx.fillStyle = "#18181b";
	ctx.fillRect(0, 0, boardWidth, headerHeight);

	// Header Text
	ctx.fillStyle = "#ffffff";
	ctx.font =
		"bold 28px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
	ctx.fillText(tierlist.title, 32, 48);

	ctx.fillStyle = "#a1a1aa";
	ctx.font =
		"normal 15px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
	const subText = `Tác giả: ${tierlist.creator_name}  ·  Phân loại: ${tierlist.category_tag}  ·  Tổng số manga đã xếp: ${tierlist.analytics.ranked_count}/${tierlist.analytics.total_creator_mangas}`;
	ctx.fillText(subText, 32, 80);

	// 3. Render Each Tier Row
	let currentY = headerHeight;

	for (let i = 0; i < tierlist.tiers.length; i++) {
		const row = tierlist.tiers[i];
		const rHeight = rowHeights[i];
		const theme = TIER_COLOR_THEMES[row.color_key] || TIER_COLOR_THEMES.crimson;

		// Row background
		ctx.fillStyle = i % 2 === 0 ? "#121215" : "#18181b";
		ctx.fillRect(0, currentY, boardWidth, rHeight);

		// Left Header Block
		ctx.fillStyle = theme.canvasBg;
		ctx.fillRect(0, currentY, rowHeaderWidth, rHeight);

		// Left Header Label
		ctx.fillStyle = theme.canvasText;
		ctx.font =
			"black 32px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";

		// Label centered
		const labelY = currentY + rHeight / 2 - (row.item_count > 0 ? 10 : 0);
		ctx.fillText(row.label, rowHeaderWidth / 2, labelY);

		// Count indicator
		ctx.font =
			"bold 13px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
		const countStr =
			tierlist.settings.show_rating &&
			row.average_rating !== null &&
			row.average_rating !== undefined
				? `${row.item_count} bộ · ★${row.average_rating}`
				: `${row.item_count} bộ`;
		ctx.fillText(countStr, rowHeaderWidth / 2, labelY + 24);

		// Reset text alignment
		ctx.textAlign = "left";
		ctx.textBaseline = "alphabetic";

		// Draw manga cards inside this row
		const startX = rowHeaderWidth + rowPaddingX;
		const startY = currentY + rowPaddingY;

		for (let j = 0; j < row.items.length; j++) {
			const item = row.items[j];
			const colIdx = j % cardsPerRowMax;
			const lineIdx = Math.floor(j / cardsPerRowMax);

			const cardX = startX + colIdx * (cardWidth + cardGap);
			const cardY = startY + lineIdx * (cardHeight + cardGap);

			// Draw card placeholder
			ctx.fillStyle = "#27272a";
			ctx.beginPath();
			ctx.roundRect(cardX, cardY, cardWidth, cardHeight, 8);
			ctx.fill();

			// Load & Draw Cover Image
			try {
				const coverUrl = getMangaCoverImageUrl(
					item.manga_id,
					item.selected_minio_key,
				);
				const img = await loadImage(coverUrl);

				ctx.save();
				ctx.beginPath();
				ctx.roundRect(cardX, cardY, cardWidth, cardHeight, 8);
				ctx.clip();
				ctx.drawImage(img, cardX, cardY, cardWidth, cardHeight);
				ctx.restore();
			} catch (_err) {
				// Failed to draw image, keep dark placeholder with title
				ctx.fillStyle = "#ffffff";
				ctx.font = "normal 10px sans-serif";
				ctx.fillText(item.title.slice(0, 15), cardX + 6, cardY + 20);
			}

			// Draw card border
			ctx.strokeStyle = "#3f3f46";
			ctx.lineWidth = 1;
			ctx.beginPath();
			ctx.roundRect(cardX, cardY, cardWidth, cardHeight, 8);
			ctx.stroke();

			// Note badge on card top
			if (item.note) {
				ctx.fillStyle = "rgba(0, 0, 0, 0.85)";
				ctx.beginPath();
				ctx.roundRect(cardX + 4, cardY + 4, cardWidth - 8, 16, 4);
				ctx.fill();

				ctx.fillStyle = "#ffffff";
				ctx.font = "bold 9px sans-serif";
				const truncatedNote =
					item.note.length > 14 ? `${item.note.slice(0, 13)}…` : item.note;
				ctx.fillText(truncatedNote, cardX + 8, cardY + 15);
			}

			// Rating badge on card bottom
			if (
				tierlist.settings.show_rating &&
				item.personal_rating !== null &&
				item.personal_rating !== undefined
			) {
				ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
				ctx.beginPath();
				ctx.roundRect(
					cardX + cardWidth - 34,
					cardY + cardHeight - 20,
					30,
					16,
					4,
				);
				ctx.fill();

				ctx.fillStyle = "#fbbf24";
				ctx.font = "bold 10px sans-serif";
				ctx.fillText(
					`★${item.personal_rating}`,
					cardX + cardWidth - 30,
					cardY + cardHeight - 8,
				);
			}
		}

		// Divider line
		ctx.strokeStyle = "#27272a";
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.moveTo(0, currentY + rHeight);
		ctx.lineTo(boardWidth, currentY + rHeight);
		ctx.stroke();

		currentY += rHeight;
	}

	// 4. Footer
	ctx.fillStyle = "#71717a";
	ctx.font =
		"12px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
	ctx.fillText(
		`Manga Reviews Management  ·  Xuất ngày ${new Date().toLocaleDateString("vi-VN")}`,
		32,
		boardHeight - 16,
	);

	// 5. Trigger download
	return new Promise((resolve) => {
		canvas.toBlob((blob) => {
			if (!blob) return resolve();
			const url = URL.createObjectURL(blob);
			const anchor = document.createElement("a");
			anchor.href = url;
			anchor.download = `${tierlist.creator_name.replace(/\s+/g, "_")}_tierlist_${tierlist.title.replace(/\s+/g, "_")}.png`;
			anchor.click();
			URL.revokeObjectURL(url);
			resolve();
		}, "image/png");
	});
}

/**
 * Generate formatted Markdown string of the tierlist.
 */
export function generateTierlistMarkdown(tierlist: TierlistDetail): string {
	const lines: string[] = [];

	lines.push(`# Bảng xếp hạng tác phẩm: ${tierlist.creator_name}`);
	lines.push(`> **Tiêu đề**: ${tierlist.title}`);
	if (tierlist.description) {
		lines.push(`> **Mô tả**: ${tierlist.description}`);
	}
	lines.push(
		`> **Phân loại**: ${tierlist.category_tag} · **Tỷ lệ hoàn thành**: ${tierlist.analytics.completion_pct}% (${tierlist.analytics.ranked_count}/${tierlist.analytics.total_creator_mangas} bộ)`,
	);
	lines.push("");

	for (const row of tierlist.tiers) {
		const theme = TIER_COLOR_THEMES[row.color_key];
		const descSuffix = row.description ? ` — *${row.description}*` : "";
		lines.push(`### Hàng ${row.label} (${theme.label})${descSuffix}`);

		if (row.items.length === 0) {
			lines.push("*(Chưa có manga nào trong hàng này)*");
		} else {
			for (const item of row.items) {
				const ratingPart =
					tierlist.settings.show_rating &&
					item.personal_rating !== null &&
					item.personal_rating !== undefined
						? ` — ★ ${item.personal_rating}`
						: "";
				const notePart = item.note ? ` [${item.note}]` : "";
				const yearPart = item.year ? ` (${item.year})` : "";
				lines.push(`- **${item.title}**${yearPart}${ratingPart}${notePart}`);
			}
		}
		lines.push("");
	}

	if (tierlist.unranked_pool.length > 0) {
		lines.push(`### Chưa xếp hạng (${tierlist.unranked_pool.length} bộ)`);
		for (const item of tierlist.unranked_pool) {
			lines.push(`- ${item.title}`);
		}
		lines.push("");
	}

	return lines.join("\n");
}

/**
 * Download Markdown file.
 */
export function exportTierlistToMarkdown(tierlist: TierlistDetail): void {
	const content = generateTierlistMarkdown(tierlist);
	const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = `${tierlist.creator_name.replace(/\s+/g, "_")}_tierlist.md`;
	anchor.click();
	URL.revokeObjectURL(url);
}

/**
 * Download raw JSON file.
 */
export function exportTierlistToJson(tierlist: TierlistDetail): void {
	const content = JSON.stringify(tierlist, null, 2);
	const blob = new Blob([content], { type: "application/json;charset=utf-8" });
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = `${tierlist.creator_name.replace(/\s+/g, "_")}_tierlist.json`;
	anchor.click();
	URL.revokeObjectURL(url);
}
