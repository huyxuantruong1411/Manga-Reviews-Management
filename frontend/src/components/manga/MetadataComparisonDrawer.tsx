import {
	AlertTriangle,
	CheckCircle,
	Lock,
	RefreshCw,
	ShieldCheck,
	Sparkles,
	Unlock,
	X,
} from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";
import { useAlert } from "../../hooks/useAlert";
import type {
	MetadataApplyRequest,
	MetadataPreviewResponse,
	SourceWork,
} from "../../types/datasource";

interface MetadataComparisonDrawerProps {
	isOpen: boolean;
	onClose: () => void;
	mangaId: string;
	mangaTitle: string;
	source: string;
	sourceWorkId: string;
	sourceWork?: SourceWork;
	onApplied?: () => void;
}

export const MetadataComparisonDrawer: React.FC<
	MetadataComparisonDrawerProps
> = ({
	isOpen,
	onClose,
	mangaId,
	mangaTitle,
	source,
	sourceWorkId,
	sourceWork,
	onApplied,
}) => {
	const { showToast } = useAlert();
	const [loading, setLoading] = useState(false);
	const [applying, setApplying] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [preview, setPreview] = useState<MetadataPreviewResponse | null>(null);
	const [acceptedFields, setAcceptedFields] = useState<Set<string>>(new Set());
	const [fieldLocks, setFieldLocks] = useState<Record<string, boolean>>({});

	const fetchPreview = async () => {
		if (!mangaId || !sourceWorkId) return;
		setLoading(true);
		setError(null);
		try {
			const res = await fetch(`/api/manga/${mangaId}/metadata/preview`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					source,
					source_work_id: sourceWorkId,
					source_work: sourceWork,
				}),
			});
			if (!res.ok) {
				const errData = await res.json().catch(() => ({}));
				throw new Error(errData.detail || `HTTP ${res.status}`);
			}
			const data: MetadataPreviewResponse = await res.json();
			setPreview(data);

			// Initialize accepted fields: automatically accept 'new' fields
			const initialAccepted = new Set<string>();
			const initialLocks: Record<string, boolean> = {};

			data.diffs.forEach((d) => {
				if (d.is_locked) {
					initialLocks[d.field_path] = true;
				}
				if (d.decision_state === "new" && !d.is_locked) {
					initialAccepted.add(d.field_path);
				}
			});

			setAcceptedFields(initialAccepted);
			setFieldLocks(initialLocks);
		} catch (err: any) {
			setError(err.message || "Không thể tải bản so sánh metadata.");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		if (isOpen) {
			fetchPreview();
		}
	}, [isOpen, mangaId, sourceWorkId]);

	if (!isOpen) return null;

	const handleToggleAccept = (field: string) => {
		setAcceptedFields((prev) => {
			const next = new Set(prev);
			if (next.has(field)) {
				next.delete(field);
			} else {
				next.add(field);
			}
			return next;
		});
	};

	const handleToggleLock = (field: string) => {
		setFieldLocks((prev) => {
			const current = Boolean(prev[field]);
			const next = { ...prev, [field]: !current };
			// If locking, remove from accepted fields
			if (!current) {
				setAcceptedFields((acc) => {
					const nextAcc = new Set(acc);
					nextAcc.delete(field);
					return nextAcc;
				});
			}
			return next;
		});
	};

	const handleSelectAllNew = () => {
		if (!preview) return;
		const next = new Set(acceptedFields);
		preview.diffs.forEach((d) => {
			if (d.decision_state === "new" && !fieldLocks[d.field_path]) {
				next.add(d.field_path);
			}
		});
		setAcceptedFields(next);
	};

	const handleApply = async () => {
		if (!preview) return;
		setApplying(true);
		try {
			const payload: MetadataApplyRequest = {
				source,
				source_work_id: sourceWorkId,
				expected_metadata_revision: preview.current_metadata_revision,
				accepted_fields: Array.from(acceptedFields),
				field_locks: fieldLocks,
			};

			const res = await fetch(`/api/manga/${mangaId}/metadata/apply`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			});

			if (res.status === 409) {
				showToast(
					"Xung đột phiên bản: Metadata đã được cập nhật bởi thao tác khác!",
					"error",
				);
				fetchPreview();
				return;
			}

			if (!res.ok) {
				const errData = await res.json().catch(() => ({}));
				throw new Error(errData.detail || `Lỗi ${res.status}`);
			}

			showToast("Đã làm giàu và cập nhật metadata thành công!", "success");
			if (onApplied) onApplied();
			onClose();
		} catch (err: any) {
			showToast(err.message || "Không thể áp dụng metadata.", "error");
		} finally {
			setApplying(false);
		}
	};

	const formatValue = (val: any) => {
		if (val === null || val === undefined || val === "") {
			return (
				<span className="text-muted-foreground italic text-xs">Trống</span>
			);
		}
		if (Array.isArray(val)) {
			if (val.length === 0)
				return (
					<span className="text-muted-foreground italic text-xs">0 mục</span>
				);
			if (typeof val[0] === "string") {
				return (
					<div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
						{val.slice(0, 6).map((item, idx) => (
							<span
								key={idx}
								className="px-1.5 py-0.5 bg-muted rounded text-[11px] font-mono"
							>
								{item}
							</span>
						))}
						{val.length > 6 && (
							<span className="text-[11px] text-muted-foreground self-center">
								+{val.length - 6}
							</span>
						)}
					</div>
				);
			}
			return <span className="text-xs">{val.length} mục</span>;
		}
		if (typeof val === "object") {
			return (
				<span className="text-xs font-mono">
					{JSON.stringify(val).slice(0, 40)}...
				</span>
			);
		}
		const str = String(val);
		return (
			<span className="text-xs break-words line-clamp-3" title={str}>
				{str}
			</span>
		);
	};

	const getFieldLabel = (field: string) => {
		const labels: Record<string, string> = {
			title: "Tiêu đề (Title)",
			alt_titles: "Tên phụ (Alt Titles)",
			description: "Tóm tắt (Description)",
			author: "Tác giả (Author)",
			artist: "Họa sĩ (Artist)",
			year: "Năm phát hành (Year)",
			status: "Tình trạng xuất bản (Status)",
			content_rating: "Độ tuổi (Content Rating)",
			publication_demographic: "Đối tượng (Demographic)",
			original_language: "Ngôn ngữ gốc (Language)",
			links: "Liên kết ngoài (Links)",
			cover_url: "Ảnh bìa (Cover Art)",
		};
		return labels[field] || field;
	};

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
			<div className="bg-card border border-border rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden text-card-foreground">
				{/* Header */}
				<div className="px-6 py-4 border-b border-border flex items-center justify-between bg-muted/30">
					<div className="flex items-center space-x-3">
						<div className="p-2 rounded-lg bg-[var(--brand-orange)]/10 text-[var(--brand-orange)]">
							<Sparkles className="w-5 h-5" />
						</div>
						<div>
							<h3 className="font-semibold text-lg flex items-center gap-2">
								So sánh & Làm giàu Metadata
								<span className="px-2 py-0.5 text-xs font-mono rounded bg-primary/10 text-primary border border-primary/20">
									{source.toUpperCase()}
								</span>
							</h3>
							<p className="text-xs text-muted-foreground">
								Tác phẩm:{" "}
								<span className="font-medium text-foreground">
									{mangaTitle}
								</span>
								{preview && (
									<span className="ml-2 font-mono text-[11px]">
										(Rev: #{preview.current_metadata_revision})
									</span>
								)}
							</p>
						</div>
					</div>
					<button
						type="button"
						onClick={onClose}
						className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition"
					>
						<X className="w-5 h-5" />
					</button>
				</div>

				{/* Protected User Fields Notice */}
				<div className="px-6 py-2.5 bg-blue-500/10 border-b border-blue-500/20 flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400">
					<ShieldCheck className="w-4 h-4 shrink-0" />
					<span>
						<strong>Bảo vệ dữ liệu cá nhân:</strong> Tiến độ đọc, đánh giá cá
						nhân, review và ghi chú được bảo vệ 100% và không bao giờ bị ghi đè.
					</span>
				</div>

				{/* Body Content */}
				<div className="p-6 overflow-y-auto flex-1 space-y-4">
					{loading ? (
						<div className="py-20 flex flex-col items-center justify-center space-y-3">
							<RefreshCw className="w-8 h-8 animate-spin text-[var(--brand-orange)]" />
							<p className="text-sm text-muted-foreground">
								Đang phân tích và đối chiếu metadata...
							</p>
						</div>
					) : error ? (
						<div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
							<AlertTriangle className="w-10 h-10 text-destructive" />
							<p className="text-sm font-medium text-destructive">{error}</p>
							<button
								type="button"
								onClick={fetchPreview}
								className="px-4 py-2 text-xs font-medium rounded-lg bg-muted hover:bg-muted/80 text-foreground"
							>
								Thử lại
							</button>
						</div>
					) : preview ? (
						<>
							{/* Toolbar / Actions */}
							<div className="flex flex-wrap items-center justify-between gap-2 pb-2">
								<div className="flex items-center gap-2">
									<span className="text-xs text-muted-foreground font-medium">
										Đã chọn: {acceptedFields.size} / {preview.diffs.length}{" "}
										trường
									</span>
									<button
										type="button"
										onClick={handleSelectAllNew}
										className="text-xs text-primary hover:underline font-medium"
									>
										Chọn các trường mới
									</button>
									<span className="text-muted-foreground">·</span>
									<button
										type="button"
										onClick={() => setAcceptedFields(new Set())}
										className="text-xs text-muted-foreground hover:underline"
									>
										Bỏ chọn tất cả
									</button>
								</div>
								<div className="text-xs text-muted-foreground flex items-center gap-3">
									<span className="flex items-center gap-1">
										<span className="w-2 h-2 rounded-full bg-green-500 inline-block" />{" "}
										Mới
									</span>
									<span className="flex items-center gap-1">
										<span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />{" "}
										Xung đột
									</span>
									<span className="flex items-center gap-1">
										<span className="w-2 h-2 rounded-full bg-purple-500 inline-block" />{" "}
										Đang khóa
									</span>
								</div>
							</div>

							{/* Diff Table */}
							<div className="border border-border rounded-lg overflow-hidden">
								<table className="w-full text-left text-sm border-collapse">
									<thead>
										<tr className="bg-muted/50 border-b border-border text-xs text-muted-foreground font-medium">
											<th className="py-2.5 px-3 w-10 text-center">Chọn</th>
											<th className="py-2.5 px-3 w-10 text-center">Khóa</th>
											<th className="py-2.5 px-3 w-36">Trường</th>
											<th className="py-2.5 px-3 w-5/12">
												Hiện tại (Thư viện)
											</th>
											<th className="py-2.5 px-3 w-5/12">Đề xuất ({source})</th>
											<th className="py-2.5 px-3 w-24 text-center">
												Trạng thái
											</th>
										</tr>
									</thead>
									<tbody className="divide-y divide-border">
										{preview.diffs.map((diff) => {
											const isLocked = Boolean(fieldLocks[diff.field_path]);
											const isAccepted = acceptedFields.has(diff.field_path);

											let stateBadge = null;
											if (isLocked) {
												stateBadge = (
													<span className="px-2 py-0.5 rounded text-[11px] font-medium bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
														Đang khóa
													</span>
												);
											} else if (diff.decision_state === "new") {
												stateBadge = (
													<span className="px-2 py-0.5 rounded text-[11px] font-medium bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20">
														Mới
													</span>
												);
											} else if (diff.decision_state === "conflict") {
												stateBadge = (
													<span className="px-2 py-0.5 rounded text-[11px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
														Khác biệt
													</span>
												);
											} else {
												stateBadge = (
													<span className="px-2 py-0.5 rounded text-[11px] font-medium bg-muted text-muted-foreground">
														Trùng
													</span>
												);
											}

											return (
												<tr
													key={diff.field_path}
													className={`transition-colors hover:bg-muted/30 ${
														isAccepted ? "bg-primary/5" : ""
													}`}
												>
													{/* Accept Checkbox */}
													<td className="py-3 px-3 text-center">
														<input
															type="checkbox"
															checked={isAccepted}
															disabled={isLocked}
															onChange={() =>
																handleToggleAccept(diff.field_path)
															}
															className="w-4 h-4 rounded border-border text-[var(--brand-orange)] focus:ring-[var(--brand-orange)] disabled:opacity-30 cursor-pointer"
														/>
													</td>

													{/* Lock Toggle */}
													<td className="py-3 px-3 text-center">
														<button
															type="button"
															onClick={() => handleToggleLock(diff.field_path)}
															title={
																isLocked
																	? "Bỏ khóa trường"
																	: "Khóa trường này khỏi tự động cập nhật"
															}
															className={`p-1 rounded transition ${
																isLocked
																	? "text-purple-600 bg-purple-500/10 hover:bg-purple-500/20"
																	: "text-muted-foreground hover:text-foreground hover:bg-muted"
															}`}
														>
															{isLocked ? (
																<Lock className="w-3.5 h-3.5" />
															) : (
																<Unlock className="w-3.5 h-3.5" />
															)}
														</button>
													</td>

													{/* Field Name */}
													<td className="py-3 px-3">
														<div className="font-medium text-xs text-foreground">
															{getFieldLabel(diff.field_path)}
														</div>
														<div className="text-[10px] text-muted-foreground font-mono">
															{diff.field_path}
														</div>
													</td>

													{/* Current Value */}
													<td className="py-3 px-3 text-muted-foreground">
														{formatValue(diff.current_value)}
													</td>

													{/* Candidate Value */}
													<td className="py-3 px-3 text-foreground font-medium">
														{formatValue(diff.candidate_value)}
													</td>

													{/* State Badge */}
													<td className="py-3 px-3 text-center">
														{stateBadge}
													</td>
												</tr>
											);
										})}
									</tbody>
								</table>
							</div>
						</>
					) : null}
				</div>

				{/* Footer */}
				<div className="px-6 py-4 border-t border-border bg-muted/20 flex items-center justify-between">
					<div className="text-xs text-muted-foreground">
						{acceptedFields.size > 0 ? (
							<span>
								Sẽ áp dụng {acceptedFields.size} thay đổi vào tác phẩm
							</span>
						) : (
							<span>Chưa chọn thay đổi nào</span>
						)}
					</div>
					<div className="flex items-center space-x-3">
						<button
							type="button"
							onClick={onClose}
							className="px-4 py-2 text-xs font-medium rounded-lg border border-border hover:bg-muted transition text-foreground"
						>
							Đóng
						</button>
						<button
							type="button"
							onClick={handleApply}
							disabled={applying || acceptedFields.size === 0}
							className="px-5 py-2 text-xs font-semibold rounded-lg bg-[var(--brand-orange)] hover:bg-[var(--brand-coral)] text-white shadow-sm transition disabled:opacity-50 flex items-center gap-2"
						>
							{applying ? (
								<>
									<RefreshCw className="w-3.5 h-3.5 animate-spin" />
									Đang áp dụng...
								</>
							) : (
								<>
									<CheckCircle className="w-3.5 h-3.5" />
									Lưu & Áp dụng
								</>
							)}
						</button>
					</div>
				</div>
			</div>
		</div>
	);
};
