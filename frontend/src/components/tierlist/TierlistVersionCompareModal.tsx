import {
	ArrowDownRight,
	ArrowRight,
	ArrowUpRight,
	GitCompare,
	Minus,
	Sparkles,
} from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";
import { compareTierlists } from "../../api/tierlists";
import type {
	TierlistComparisonResponse,
	TierlistSummary,
} from "../../types/tierlist";
import { Button } from "../ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "../ui/dialog";

interface TierlistVersionCompareModalProps {
	creatorName: string;
	availableVersions: TierlistSummary[];
	currentTierlistId: string;
	isOpen: boolean;
	onClose: () => void;
}

export const TierlistVersionCompareModal: React.FC<
	TierlistVersionCompareModalProps
> = ({
	creatorName,
	availableVersions,
	currentTierlistId,
	isOpen,
	onClose,
}) => {
	const [baseId, setBaseId] = useState<string>(currentTierlistId);
	const [targetId, setTargetId] = useState<string>("");
	const [comparison, setComparison] =
		useState<TierlistComparisonResponse | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Initialize default target version
	useEffect(() => {
		if (availableVersions.length > 1) {
			const other = availableVersions.find((v) => v._id !== currentTierlistId);
			if (other) setTargetId(other._id);
		}
		setBaseId(currentTierlistId);
	}, [currentTierlistId, availableVersions]);

	// Fetch comparison when baseId or targetId change
	useEffect(() => {
		if (!isOpen || !baseId || !targetId || baseId === targetId) {
			setComparison(null);
			return;
		}

		setLoading(true);
		setError(null);
		compareTierlists(creatorName, baseId, targetId)
			.then((res) => {
				setComparison(res);
			})
			.catch((err) => {
				console.error("Comparison failed", err);
				setError("Không thể so sánh 2 phiên bản này.");
			})
			.finally(() => {
				setLoading(false);
			});
	}, [isOpen, creatorName, baseId, targetId]);

	return (
		<Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="max-w-2xl sm:max-w-3xl p-6 max-h-[85vh] flex flex-col">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2 text-lg font-spartan font-bold">
						<GitCompare size={20} className="text-primary" />
						<span>So sánh Phiên bản Tierlist</span>
					</DialogTitle>
					<DialogDescription>
						Đối chiếu sự thay đổi thứ hạng manga giữa hai phiên bản đánh giá của
						cùng tác giả.
					</DialogDescription>
				</DialogHeader>

				{/* Version Pickers */}
				<div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-2 border-b border-border">
					<div>
						<label
							htmlFor="select-base-version"
							className="text-xs font-bold text-muted-foreground block mb-1"
						>
							Phiên bản gốc (Base):
						</label>
						<select
							id="select-base-version"
							value={baseId}
							onChange={(e) => setBaseId(e.target.value)}
							className="w-full px-3 py-2 rounded-xl border border-border bg-background text-foreground text-xs font-medium outline-hidden focus:ring-1 focus:ring-primary"
						>
							{availableVersions.map((v) => (
								<option key={v._id} value={v._id}>
									{v.title} {v.is_default ? "★" : ""} (Rev {v.revision})
								</option>
							))}
						</select>
					</div>

					<div>
						<label
							htmlFor="select-target-version"
							className="text-xs font-bold text-muted-foreground block mb-1"
						>
							Phiên bản đối chiếu (Target):
						</label>
						<select
							id="select-target-version"
							value={targetId}
							onChange={(e) => setTargetId(e.target.value)}
							className="w-full px-3 py-2 rounded-xl border border-border bg-background text-foreground text-xs font-medium outline-hidden focus:ring-1 focus:ring-primary"
						>
							<option value="">-- Chọn phiên bản đối chiếu --</option>
							{availableVersions.map((v) => (
								<option key={v._id} value={v._id} disabled={v._id === baseId}>
									{v.title} {v.is_default ? "★" : ""} (Rev {v.revision})
								</option>
							))}
						</select>
					</div>
				</div>

				{/* Comparison Content */}
				<div className="flex-1 overflow-y-auto py-3 space-y-4">
					{baseId === targetId ? (
						<div className="py-12 text-center text-xs text-muted-foreground">
							Vui lòng chọn 2 phiên bản khác nhau để thực hiện so sánh.
						</div>
					) : loading ? (
						<div className="py-16 flex items-center justify-center">
							<div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
						</div>
					) : error ? (
						<div className="p-4 rounded-xl bg-destructive/10 text-destructive text-xs text-center">
							{error}
						</div>
					) : comparison ? (
						<>
							{/* KPI Summary Cards */}
							<div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
								<div className="p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 flex flex-col items-center justify-center text-center">
									<span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
										Tăng hạng
									</span>
									<span className="text-xl font-spartan font-black text-emerald-600 dark:text-emerald-400">
										+{comparison.summary.promoted || 0}
									</span>
								</div>

								<div className="p-3 rounded-xl border border-rose-500/30 bg-rose-500/10 flex flex-col items-center justify-center text-center">
									<span className="text-[10px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">
										Giảm hạng
									</span>
									<span className="text-xl font-spartan font-black text-rose-600 dark:text-rose-400">
										-{comparison.summary.demoted || 0}
									</span>
								</div>

								<div className="p-3 rounded-xl border border-sky-500/30 bg-sky-500/10 flex flex-col items-center justify-center text-center">
									<span className="text-[10px] font-bold uppercase tracking-wider text-sky-600 dark:text-sky-400">
										Mới xếp
									</span>
									<span className="text-xl font-spartan font-black text-sky-600 dark:text-sky-400">
										+{comparison.summary.newly_ranked || 0}
									</span>
								</div>

								<div className="p-3 rounded-xl border border-zinc-500/30 bg-zinc-500/10 flex flex-col items-center justify-center text-center">
									<span className="text-[10px] font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
										Giữ nguyên
									</span>
									<span className="text-xl font-spartan font-black text-zinc-600 dark:text-zinc-400">
										{comparison.summary.unchanged || 0}
									</span>
								</div>
							</div>

							{/* Diffs List */}
							<div className="space-y-2">
								<h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
									Chi tiết dịch chuyển ({comparison.diffs.length} bộ)
								</h4>
								<div className="border border-border rounded-xl divide-y divide-border overflow-hidden">
									{comparison.diffs.map((diff) => {
										let badge = (
											<span className="flex items-center gap-1 text-[11px] font-semibold text-zinc-500">
												<Minus size={12} /> Giữ nguyên
											</span>
										);

										if (diff.movement === "promoted") {
											badge = (
												<span className="flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
													<ArrowUpRight size={14} /> Lên hạng (+
													{diff.tier_delta})
												</span>
											);
										} else if (diff.movement === "demoted") {
											badge = (
												<span className="flex items-center gap-1 text-[11px] font-bold text-rose-600 dark:text-rose-400">
													<ArrowDownRight size={14} /> Hạ hạng (
													{diff.tier_delta})
												</span>
											);
										} else if (diff.movement === "newly_ranked") {
											badge = (
												<span className="flex items-center gap-1 text-[11px] font-bold text-sky-600 dark:text-sky-400">
													<Sparkles size={13} /> Mới xếp hạng
												</span>
											);
										} else if (diff.movement === "unranked") {
											badge = (
												<span className="flex items-center gap-1 text-[11px] font-bold text-amber-600 dark:text-amber-400">
													<Minus size={13} /> Về Unranked
												</span>
											);
										}

										return (
											<div
												key={diff.manga_id}
												className="p-2.5 flex items-center justify-between gap-3 hover:bg-muted/40 transition"
											>
												<div className="flex items-center gap-2.5 min-w-0">
													{diff.cover_url ? (
														<img
															src={diff.cover_url}
															alt={diff.title}
															className="w-8 h-11 object-cover rounded-md flex-shrink-0"
															loading="lazy"
														/>
													) : (
														<div className="w-8 h-11 rounded-md bg-muted flex-shrink-0" />
													)}
													<div className="min-w-0">
														<p className="font-semibold text-xs text-foreground truncate">
															{diff.title}
														</p>
														<div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
															<span className="px-1.5 py-0.2 rounded bg-muted font-bold">
																{diff.from_tier_label || "Chưa xếp"}
															</span>
															<ArrowRight size={11} />
															<span className="px-1.5 py-0.2 rounded bg-primary/10 text-primary font-bold">
																{diff.to_tier_label || "Chưa xếp"}
															</span>
														</div>
													</div>
												</div>
												<div className="flex-shrink-0">{badge}</div>
											</div>
										);
									})}
								</div>
							</div>
						</>
					) : null}
				</div>

				<div className="pt-2 border-t border-border flex justify-end">
					<Button type="button" variant="outline" onClick={onClose}>
						Đóng
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
};
