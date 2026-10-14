import { Check, Image as ImageIcon, Sparkles } from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";
import { fetchMangaCoverOptions } from "../../api/tierlists";
import type { HydratedTierItem, MangaCoverOption } from "../../types/tierlist";
import { Button } from "../ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "../ui/dialog";

interface TierItemCustomizeModalProps {
	item: HydratedTierItem | null;
	isOpen: boolean;
	onClose: () => void;
	onApply: (
		mangaId: string,
		coverOption: MangaCoverOption | null,
		note: string,
	) => void;
}

export const TierItemCustomizeModal: React.FC<TierItemCustomizeModalProps> = ({
	item,
	isOpen,
	onClose,
	onApply,
}) => {
	const [coverOptions, setCoverOptions] = useState<MangaCoverOption[]>([]);
	const [selectedOption, setSelectedOption] = useState<MangaCoverOption | null>(
		null,
	);
	const [note, setNote] = useState("");
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!item || !isOpen) return;

		setNote(item.note || "");
		setSelectedOption(null);
		setLoading(true);
		setError(null);

		fetchMangaCoverOptions(item.manga_id)
			.then((opts) => {
				setCoverOptions(opts);
				// Check if current item has a selected cover key
				if (item.selected_minio_key) {
					const found = opts.find(
						(o) => o.minio_key === item.selected_minio_key,
					);
					if (found) setSelectedOption(found);
				} else {
					// Fallback to default cover
					const def = opts.find((o) => o.is_default);
					if (def) setSelectedOption(def);
				}
			})
			.catch((err) => {
				console.error("Failed to load cover options", err);
				setError("Không thể tải danh sách ảnh bìa của bộ truyện.");
			})
			.finally(() => {
				setLoading(false);
			});
	}, [item, isOpen]);

	if (!item) return null;

	const handleSave = () => {
		onApply(item.manga_id, selectedOption, note.trim());
		onClose();
	};

	return (
		<Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="max-w-xl p-6 sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2 text-lg font-spartan font-bold">
						<Sparkles size={18} className="text-primary" />
						<span>Tùy chỉnh thẻ: {item.title}</span>
					</DialogTitle>
					<DialogDescription>
						Chọn ảnh bìa theo tập (Volume Cover) và gắn nhãn ghi chú xuất hiện
						trên thẻ bảng xếp hạng.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4 py-2">
					{/* Note Input */}
					<div className="space-y-1.5">
						<label
							htmlFor="tier-item-note"
							className="text-xs font-bold text-foreground flex items-center justify-between"
						>
							<span>Ghi chú thẻ (Tối đa 120 ký tự)</span>
							<span className="text-[10px] text-muted-foreground font-normal">
								{note.length}/120
							</span>
						</label>
						<input
							id="tier-item-note"
							type="text"
							value={note}
							onChange={(e) => setNote(e.target.value)}
							maxLength={120}
							placeholder="Ví dụ: Siêu phẩm tâm lý, Best Arc, Volume yêu thích..."
							className="w-full px-3 py-2 rounded-xl border border-border bg-background text-foreground text-xs outline-hidden focus:ring-1 focus:ring-primary"
						/>
					</div>

					{/* Volume Cover Options Picker */}
					<div className="space-y-2">
						<div className="flex items-center justify-between">
							<span className="text-xs font-bold text-foreground flex items-center gap-1.5">
								<ImageIcon size={14} className="text-muted-foreground" />
								<span>Chọn ảnh bìa ({coverOptions.length} lựa chọn)</span>
							</span>
							{selectedOption && (
								<button
									type="button"
									onClick={() => {
										const def = coverOptions.find((o) => o.is_default);
										if (def) setSelectedOption(def);
									}}
									className="text-[11px] text-primary hover:underline font-medium"
								>
									Đặt lại bìa mặc định
								</button>
							)}
						</div>

						{loading ? (
							<div className="flex justify-center items-center py-12">
								<div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
							</div>
						) : error ? (
							<div className="p-4 rounded-xl bg-destructive/10 text-destructive text-xs text-center">
								{error}
							</div>
						) : coverOptions.length === 0 ? (
							<div className="p-6 border border-dashed border-border rounded-xl text-center text-xs text-muted-foreground">
								Bộ truyện này chưa có thêm ảnh bìa tập phụ nào được đồng bộ.
							</div>
						) : (
							<div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2.5 max-h-64 overflow-y-auto p-1 border border-border rounded-xl bg-muted/20">
								{coverOptions.map((opt) => {
									const isSelected =
										selectedOption?.minio_key === opt.minio_key;
									const keyId = opt.cover_art_id || opt.minio_key;
									return (
										<button
											key={keyId}
											type="button"
											onClick={() => setSelectedOption(opt)}
											className={`group relative aspect-[2/3] rounded-lg overflow-hidden border-2 transition-all duration-150 ${
												isSelected
													? "border-primary ring-2 ring-primary/40 scale-102 shadow-md"
													: "border-transparent hover:border-primary/50 opacity-80 hover:opacity-100"
											}`}
										>
											<img
												src={opt.cover_url}
												alt={opt.volume ? `Tập ${opt.volume}` : "Bìa gốc"}
												className="w-full h-full object-cover"
												loading="lazy"
											/>

											{/* Volume / Default Label */}
											<div className="absolute inset-x-0 bottom-0 p-1 bg-black/75 backdrop-blur-xs text-white text-[10px] font-bold text-center truncate">
												{opt.is_default
													? "Bìa chính"
													: opt.volume
														? `Tập ${opt.volume}`
														: opt.locale || "Biến thể"}
											</div>

											{/* Selected Tick Indicator */}
											{isSelected && (
												<div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-xs">
													<Check size={12} strokeWidth={3} />
												</div>
											)}
										</button>
									);
								})}
							</div>
						)}
					</div>
				</div>

				<DialogFooter className="gap-2 sm:gap-0">
					<Button type="button" variant="outline" onClick={onClose}>
						Hủy bỏ
					</Button>
					<Button type="button" onClick={handleSave}>
						Lưu thay đổi
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
