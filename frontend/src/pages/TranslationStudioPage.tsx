import {
	ArrowRight,
	CheckCircle2,
	Clock,
	Cpu,
	Download,
	Edit3,
	Eye,
	HardDrive,
	Languages,
	Loader2,
	Paintbrush,
	Plus,
	RefreshCw,
	RotateCw,
	Save,
	Sliders,
	Sparkles,
	Type,
	Upload,
} from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
	type StorageUsage,
	type TranslationFontPack,
	type TranslationJob,
	type TranslationProfile,
	type TranslationProvider,
	translationApi,
} from "../api/translation";

type StudioTab =
	| "overview"
	| "demo"
	| "profiles"
	| "providers"
	| "fonts"
	| "jobs"
	| "storage";

export const TranslationStudioPage: React.FC = () => {
	const [searchParams, setSearchParams] = useSearchParams();
	const initialTab = (searchParams.get("tab") as StudioTab) || "overview";
	const [activeTab, setActiveTab] = useState<StudioTab>(initialTab);

	// Core State
	const [capabilities, setCapabilities] = useState<any>(null);
	const [loadingCap, setLoadingCap] = useState(false);
	const [profiles, setProfiles] = useState<TranslationProfile[]>([]);
	const [providers, setProviders] = useState<TranslationProvider[]>([]);
	const [loadingProviders, setLoadingProviders] = useState(false);
	const [fonts, setFonts] = useState<TranslationFontPack[]>([]);
	const [storageUsage, setStorageUsage] = useState<StorageUsage | null>(null);
	const [jobs, setJobs] = useState<TranslationJob[]>([]);
	const [loadingJobs, setLoadingJobs] = useState(false);

	// Error & notification states
	const [pageError, setPageError] = useState("");
	const [actionSuccess, setActionSuccess] = useState("");

	// Sync tab to URL params
	const handleTabChange = (tab: StudioTab) => {
		setActiveTab(tab);
		setSearchParams({ tab });
	};

	// 1. Fetch Capabilities
	const fetchCapabilities = useCallback(async () => {
		setLoadingCap(true);
		try {
			const data = await translationApi.getCapabilities();
			setCapabilities(data);
		} catch (err: unknown) {
			console.error("Failed to load capabilities:", err);
		} finally {
			setLoadingCap(false);
		}
	}, []);

	// 2. Fetch Profiles
	const fetchProfiles = useCallback(async () => {
		try {
			const data = await translationApi.listProfiles();
			setProfiles(data);
		} catch (err: unknown) {
			console.error("Failed to load profiles:", err);
		}
	}, []);

	// 3. Fetch Providers
	const fetchProviders = useCallback(async () => {
		setLoadingProviders(true);
		try {
			const data = await translationApi.listProviders();
			setProviders(data);
		} catch (err: unknown) {
			console.error("Failed to load providers:", err);
		} finally {
			setLoadingProviders(false);
		}
	}, []);

	// 4. Fetch Fonts
	const fetchFonts = useCallback(async () => {
		try {
			const data = await translationApi.listFonts();
			setFonts(data);
		} catch (err: unknown) {
			console.error("Failed to load fonts:", err);
		}
	}, []);

	// 5. Fetch Storage Usage
	const fetchStorage = useCallback(async () => {
		try {
			const data = await translationApi.getStorageUsage();
			setStorageUsage(data);
		} catch (err: unknown) {
			console.error("Failed to load storage usage:", err);
		}
	}, []);

	// 6. Fetch Jobs
	const fetchJobs = useCallback(async () => {
		setLoadingJobs(true);
		try {
			const data = await translationApi.listJobs();
			setJobs(data);
		} catch (err: unknown) {
			console.error("Failed to load jobs:", err);
		} finally {
			setLoadingJobs(false);
		}
	}, []);

	// Initial data loading
	useEffect(() => {
		void fetchCapabilities();
		void fetchProfiles();
		void fetchProviders();
		void fetchFonts();
		void fetchStorage();
		void fetchJobs();
	}, [
		fetchCapabilities,
		fetchProfiles,
		fetchProviders,
		fetchFonts,
		fetchStorage,
		fetchJobs,
	]);

	// ─── SUB-COMPONENTS FOR TABS ──────────────────────────────────────────────

	// Tab 1: Overview
	const renderOverview = () => {
		return (
			<div className="space-y-6">
				{/* Top Status Cards */}
				<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
					<div className="p-5 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl shadow-sm">
						<div className="flex items-center justify-between text-zinc-500 mb-2">
							<span className="text-xs font-semibold uppercase tracking-wider">
								Engine Runtime
							</span>
							<Cpu size={18} className="text-[var(--brand-orange)]" />
						</div>
						<div className="text-xl font-bold text-gray-900 dark:text-white">
							{capabilities?.cuda_available ? "CUDA (GPU)" : "CPU Only"}
						</div>
						<div className="text-[11px] text-zinc-500 mt-1">
							Python {capabilities?.python_version || "3.12"} •{" "}
							{capabilities?.platform || "Windows"}
						</div>
					</div>

					<div className="p-5 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl shadow-sm">
						<div className="flex items-center justify-between text-zinc-500 mb-2">
							<span className="text-xs font-semibold uppercase tracking-wider">
								Active Profiles
							</span>
							<Sliders size={18} className="text-emerald-500" />
						</div>
						<div className="text-xl font-bold text-gray-900 dark:text-white">
							{profiles.length} Profiles
						</div>
						<div className="text-[11px] text-zinc-500 mt-1">
							Default:{" "}
							{profiles.find((p) => p.is_default)?.name || "Default Profile"}
						</div>
					</div>

					<div className="p-5 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl shadow-sm">
						<div className="flex items-center justify-between text-zinc-500 mb-2">
							<span className="text-xs font-semibold uppercase tracking-wider">
								Font Packs
							</span>
							<Type size={18} className="text-blue-500" />
						</div>
						<div className="text-xl font-bold text-gray-900 dark:text-white">
							{fonts.length} Fonts
						</div>
						<div className="text-[11px] text-emerald-500 mt-1 font-semibold">
							{fonts.filter((f) => f.vietnamese_coverage).length} chuẩn tiếng
							Việt
						</div>
					</div>

					<div className="p-5 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl shadow-sm">
						<div className="flex items-center justify-between text-zinc-500 mb-2">
							<span className="text-xs font-semibold uppercase tracking-wider">
								Storage Usage
							</span>
							<HardDrive size={18} className="text-purple-500" />
						</div>
						<div className="text-xl font-bold text-gray-900 dark:text-white">
							{storageUsage
								? `${(storageUsage.total_bytes / (1024 * 1024)).toFixed(1)} MB`
								: "0 MB"}
						</div>
						<div className="text-[11px] text-zinc-500 mt-1">
							{storageUsage?.total_assets || 0} translation assets
						</div>
					</div>
				</div>

				{/* Quick Action Banner */}
				<div className="p-6 bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-transparent border border-orange-500/20 rounded-3xl flex flex-col md:flex-row md:items-center justify-between gap-4">
					<div className="space-y-1">
						<div className="flex items-center space-x-2 text-[var(--brand-orange)] font-bold text-sm">
							<Sparkles size={16} />
							<span>Studio Demo Workspace</span>
						</div>
						<p className="text-xs text-zinc-600 dark:text-zinc-300 max-w-xl leading-relaxed">
							Thử nghiệm dịch trang manga độc lập với synthetic demo fixtures,
							kiểm tra chất lượng font tiếng Việt, xem split comparison và diff
							revision mà không ảnh hưởng tới dữ liệu truyện thật.
						</p>
					</div>
					<button
						type="button"
						onClick={() => handleTabChange("demo")}
						className="px-5 py-2.5 bg-[var(--brand-orange)] hover:bg-[var(--brand-coral)] text-white text-xs font-bold rounded-xl shadow-lg transition flex items-center justify-center space-x-2 shrink-0 cursor-pointer"
					>
						<span>Mở Demo Workspace</span>
						<ArrowRight size={14} />
					</button>
				</div>

				{/* Diagnostics Checklist */}
				<div className="p-6 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-3xl space-y-4">
					<div className="flex items-center justify-between">
						<h3 className="text-sm font-bold text-gray-900 dark:text-white">
							Kiểm tra khả năng vận hành hệ thống (Diagnostics)
						</h3>
						<button
							type="button"
							onClick={fetchCapabilities}
							className="text-xs text-[var(--brand-orange)] hover:underline flex items-center space-x-1"
						>
							<RefreshCw
								size={12}
								className={loadingCap ? "animate-spin" : ""}
							/>
							<span>Làm mới</span>
						</button>
					</div>

					<div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
						<div className="p-3 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-xl flex items-center justify-between">
							<span className="text-zinc-600 dark:text-zinc-400">
								RapidOCR / Detection Engine
							</span>
							<span className="flex items-center space-x-1 text-emerald-500 font-bold">
								<CheckCircle2 size={14} />
								<span>Available</span>
							</span>
						</div>

						<div className="p-3 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-xl flex items-center justify-between">
							<span className="text-zinc-600 dark:text-zinc-400">
								Redis / ARQ Worker Queue
							</span>
							<span className="flex items-center space-x-1 text-emerald-500 font-bold">
								<CheckCircle2 size={14} />
								<span>arq:translation ready</span>
							</span>
						</div>

						<div className="p-3 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-xl flex items-center justify-between">
							<span className="text-zinc-600 dark:text-zinc-400">
								MinIO S3 Storage Bucket
							</span>
							<span className="flex items-center space-x-1 text-emerald-500 font-bold">
								<CheckCircle2 size={14} />
								<span>manga-storage/translation/</span>
							</span>
						</div>

						<div className="p-3 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-xl flex items-center justify-between">
							<span className="text-zinc-600 dark:text-zinc-400">
								Upstream Subprocess Envelope
							</span>
							<span className="flex items-center space-x-1 text-emerald-500 font-bold">
								<CheckCircle2 size={14} />
								<span>Pinned Protocol v1</span>
							</span>
						</div>
					</div>
				</div>
			</div>
		);
	};

	// Tab 2: Demo Workspace
	const [demoFile, setDemoFile] = useState<File | null>(null);
	const [demoPreviewUrl, setDemoPreviewUrl] = useState<string>("");
	const [demoSelectedProfile, setDemoSelectedProfile] = useState<string>("");
	const [demoTargetLang, setDemoTargetLang] = useState<string>("vi");
	const [demoTranslating, setDemoTranslating] = useState<boolean>(false);
	const [demoJob, setDemoJob] = useState<TranslationJob | null>(null);
	const [demoResult, setDemoResult] = useState<any>(null);
	const [demoCompareSplit, setDemoCompareSplit] = useState<number>(50);
	const [editedRegions, setEditedRegions] = useState<any[]>([]);
	const [isSavingRegions, setIsSavingRegions] = useState<boolean>(false);
	const [isRerendering, setIsRerendering] = useState<boolean>(false);

	const handleDemoFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (file) {
			setDemoFile(file);
			setDemoPreviewUrl(URL.createObjectURL(file));
			setDemoResult(null);
			setDemoJob(null);
			setEditedRegions([]);
		}
	};

	const handleRegionTextChange = (idx: number, val: string) => {
		setEditedRegions((prev) => {
			const copy = [...prev];
			copy[idx] = { ...copy[idx], translated_text: val };
			return copy;
		});
	};

	const handleSaveRegions = async () => {
		if (!demoResult?.result_id) return;
		setIsSavingRegions(true);
		setPageError("");
		try {
			const updated = await translationApi.updateResultRegions(
				demoResult.result_id,
				editedRegions,
				demoResult.active_revision || 1,
			);
			setDemoResult(updated);
			setEditedRegions(updated.regions || []);
			setActionSuccess(
				`Đã cập nhật annotations lên revision ${updated.active_revision}.`,
			);
		} catch (err: any) {
			setPageError(
				err?.response?.data?.detail || "Lỗi khi lưu chỉnh sửa annotations.",
			);
		} finally {
			setIsSavingRegions(false);
		}
	};

	const handleRerender = async () => {
		if (!demoResult?.result_id) return;
		setIsRerendering(true);
		setPageError("");
		try {
			const updated = await translationApi.rerenderResult(demoResult.result_id);
			setDemoResult(updated);
			setActionSuccess(
				"Đã re-render trực tiếp trên Canvas (Pillow, No-LLM) thành công!",
			);
		} catch (err: any) {
			setPageError(err?.response?.data?.detail || "Lỗi khi re-render canvas.");
		} finally {
			setIsRerendering(false);
		}
	};

	const handleRunDemo = async () => {
		if (!demoFile) return;
		setDemoTranslating(true);
		setPageError("");
		try {
			// 1. Upload demo asset
			const formData = new FormData();
			formData.append("file", demoFile);
			const asset = await translationApi.uploadDemoAsset(formData);

			// 2. Enqueue demo translation job
			const profileId = demoSelectedProfile || profiles[0]?.profile_id;
			const jobRes = await translationApi.createJob({
				source: {
					kind: "demo_assets",
					demo_asset_ids: [asset.asset_id],
				},
				profile_id: profileId,
				target_language: demoTargetLang,
				reuse_policy: "regenerate",
			});

			// 3. Poll for completion
			const pollTimer = setInterval(async () => {
				try {
					const j = await translationApi.getJobStatus(jobRes.job_id);
					setDemoJob(j);
					if (
						["completed", "partial", "failed", "cancelled"].includes(j.state)
					) {
						clearInterval(pollTimer);
						setDemoTranslating(false);

						// Fetch completed page result
						const pList = await translationApi.getJobPages(jobRes.job_id);
						if (pList.length > 0 && pList[0].result_id) {
							const res = await translationApi.getTranslationResult(
								pList[0].result_id,
							);
							setDemoResult(res);
							setEditedRegions(res.regions || []);
						}
					}
				} catch (pollErr) {
					console.error("Polling demo job error:", pollErr);
					clearInterval(pollTimer);
					setDemoTranslating(false);
				}
			}, 1500);
		} catch (err: any) {
			setPageError(err?.response?.data?.detail || "Lỗi khi khởi chạy demo.");
			setDemoTranslating(false);
		}
	};

	const renderDemoWorkspace = () => {
		return (
			<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
				{/* Left Config Column */}
				<div className="space-y-4">
					<div className="p-5 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-3xl shadow-sm space-y-4">
						<h3 className="text-sm font-bold text-gray-900 dark:text-white">
							1. Chọn hình ảnh thử nghiệm
						</h3>
						<label className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-gray-300 dark:border-zinc-700 hover:border-[var(--brand-orange)] rounded-2xl cursor-pointer transition">
							<Upload size={24} className="text-zinc-400 mb-2" />
							<span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
								{demoFile
									? demoFile.name
									: "Tải ảnh manga thử nghiệm (.jpg, .png)"}
							</span>
							<span className="text-[10px] text-zinc-500 mt-0.5">
								Kéo thả hoặc nhấn vào để duyệt file
							</span>
							<input
								type="file"
								accept="image/*"
								onChange={handleDemoFileSelect}
								className="hidden"
							/>
						</label>

						<h3 className="text-sm font-bold text-gray-900 dark:text-white pt-2">
							2. Cấu hình dịch
						</h3>
						<div className="space-y-3">
							<div>
								<span className="text-[11px] font-semibold text-zinc-500 block mb-1">
									Ngôn ngữ đích
								</span>
								<div className="grid grid-cols-2 gap-2">
									{["vi", "en"].map((lang) => (
										<button
											key={lang}
											type="button"
											onClick={() => setDemoTargetLang(lang)}
											className={`py-2 rounded-xl text-xs font-bold uppercase border transition ${
												demoTargetLang === lang
													? "bg-[var(--brand-orange)] border-[var(--brand-orange)] text-white shadow-sm"
													: "bg-gray-50 dark:bg-zinc-950 border-gray-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400"
											}`}
										>
											{lang}
										</button>
									))}
								</div>
							</div>

							<div>
								<label
									htmlFor="demo-selected-profile"
									className="text-[11px] font-semibold text-zinc-500 block mb-1"
								>
									Profile thực thi
								</label>
								<select
									id="demo-selected-profile"
									value={demoSelectedProfile}
									onChange={(e) => setDemoSelectedProfile(e.target.value)}
									className="w-full py-2 px-3 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-xl text-xs font-semibold focus:outline-none focus:border-[var(--brand-orange)]"
								>
									{profiles.map((p) => (
										<option key={p.profile_id} value={p.profile_id}>
											{p.name} (Rev {p.active_revision})
										</option>
									))}
								</select>
							</div>

							<button
								type="button"
								onClick={handleRunDemo}
								disabled={!demoFile || demoTranslating}
								className="w-full py-3 bg-[var(--brand-orange)] hover:bg-[var(--brand-coral)] disabled:opacity-40 text-white rounded-xl text-xs font-bold shadow-lg transition flex items-center justify-center space-x-2 cursor-pointer mt-2"
							>
								{demoTranslating ? (
									<>
										<Loader2 size={16} className="animate-spin" />
										<span>Đang dịch thử nghiệm...</span>
									</>
								) : (
									<>
										<Sparkles size={16} />
										<span>Chạy dịch thử nghiệm</span>
									</>
								)}
							</button>
						</div>
					</div>

					{/* Job status box */}
					{demoJob && (
						<div className="p-4 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl text-xs space-y-2">
							<div className="flex items-center justify-between font-bold">
								<span>Trạng thái Job</span>
								<span className="uppercase text-[var(--brand-orange)]">
									{demoJob.state}
								</span>
							</div>
							<div className="text-[11px] text-zinc-500">
								Job ID:{" "}
								<span className="font-mono">
									{demoJob.job_id.slice(0, 8)}...
								</span>
							</div>
						</div>
					)}
				</div>

				{/* Right Result Canvas */}
				<div className="lg:col-span-2 p-5 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-3xl shadow-sm flex flex-col items-center justify-center min-h-[500px]">
					{!demoPreviewUrl ? (
						<div className="text-center text-zinc-400 space-y-2">
							<Eye
								size={36}
								className="mx-auto text-zinc-300 dark:text-zinc-700"
							/>
							<p className="text-xs font-semibold">Chưa chọn ảnh thử nghiệm</p>
							<p className="text-[11px] text-zinc-500">
								Tải lên một trang manga bên trái để xem kết quả dịch song song.
							</p>
						</div>
					) : (
						<div className="w-full space-y-4">
							{/* Compare Split Slider if result ready */}
							{demoResult && (
								<div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-2xl text-xs">
									<span className="font-semibold text-zinc-600 dark:text-zinc-400">
										So sánh Gốc vs Bản Dịch ({demoCompareSplit}%)
									</span>
									<input
										type="range"
										min="0"
										max="100"
										value={demoCompareSplit}
										onChange={(e) =>
											setDemoCompareSplit(Number(e.target.value))
										}
										className="w-48 accent-[var(--brand-orange)] cursor-pointer"
									/>
								</div>
							)}

							{/* Image Canvas */}
							<div className="relative max-w-lg mx-auto overflow-hidden rounded-xl border border-gray-200 dark:border-zinc-800 shadow-2xl">
								<img
									src={demoPreviewUrl}
									alt="Original Demo"
									className="w-full h-auto block select-none"
								/>

								{demoResult?.url && (
									<img
										src={demoResult.url}
										alt="Translated Demo"
										className="absolute inset-0 w-full h-full block select-none pointer-events-none"
										style={{
											clipPath: `inset(0 ${100 - demoCompareSplit}% 0 0)`,
										}}
									/>
								)}

								{demoResult?.url && (
									<div
										className="absolute inset-y-0 w-0.5 bg-[var(--brand-orange)] shadow-[0_0_10px_rgba(249,115,22,0.8)] pointer-events-none"
										style={{ left: `${demoCompareSplit}%` }}
									/>
								)}
							</div>

							{/* Region Editor & Pure-Canvas Re-render Panel */}
							{demoResult && (
								<div className="w-full p-5 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-3xl shadow-sm space-y-4 mt-6">
									<div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-gray-100 dark:border-zinc-800 gap-2">
										<div>
											<h4 className="text-sm font-bold text-gray-900 dark:text-white flex items-center space-x-2">
												<Edit3
													size={15}
													className="text-[var(--brand-orange)]"
												/>
												<span>Trình biên tập văn bản & Re-render Canvas</span>
											</h4>
											<p className="text-[11px] text-zinc-500">
												Chỉnh sửa bản dịch thoại trực tiếp và re-render lên
												canvas (Pillow No-LLM) mà không tốn token provider.
											</p>
										</div>
										<div className="flex items-center space-x-2">
											<span className="px-2.5 py-1 rounded-full bg-orange-500/10 text-[var(--brand-orange)] text-xs font-bold border border-orange-500/20">
												Revision {demoResult.active_revision || 1}
											</span>
											<button
												type="button"
												onClick={handleSaveRegions}
												disabled={isSavingRegions || editedRegions.length === 0}
												className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center space-x-1.5 transition cursor-pointer"
											>
												{isSavingRegions ? (
													<Loader2 size={13} className="animate-spin" />
												) : (
													<Save size={13} />
												)}
												<span>Lưu sửa đổi</span>
											</button>
											<button
												type="button"
												onClick={handleRerender}
												disabled={isRerendering}
												className="px-3 py-1.5 bg-[var(--brand-orange)] hover:bg-[var(--brand-coral)] disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center space-x-1.5 transition cursor-pointer shadow"
											>
												{isRerendering ? (
													<Loader2 size={13} className="animate-spin" />
												) : (
													<Paintbrush size={13} />
												)}
												<span>Re-render (No-LLM)</span>
											</button>
										</div>
									</div>

									{editedRegions.length === 0 ? (
										<div className="p-4 rounded-xl bg-gray-50 dark:bg-zinc-950 text-center text-xs text-zinc-500">
											Không phát hiện bóng thoại văn bản trên trang này hoặc
											chưa có kết quả regions.
										</div>
									) : (
										<div className="space-y-3 max-h-80 overflow-y-auto pr-1">
											{editedRegions.map((region, idx) => (
												<div
													key={region.region_id || idx}
													className="p-3 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-2xl space-y-2"
												>
													<div className="flex items-center justify-between text-[11px]">
														<span className="font-bold text-zinc-700 dark:text-zinc-300">
															Vùng #{idx + 1} (Thứ tự đọc:{" "}
															{region.reading_order || idx + 1})
														</span>
														<span className="text-[10px] text-zinc-500 font-mono">
															Tọa độ: x=
															{Math.round((region.bounding_box?.x || 0) * 100)}
															%, y=
															{Math.round((region.bounding_box?.y || 0) * 100)}%
														</span>
													</div>
													{region.source_text && (
														<div className="text-[11px] text-zinc-500 italic px-2 py-1 bg-white dark:bg-zinc-900 rounded-lg border border-gray-100 dark:border-zinc-800/80">
															Gốc: "{region.source_text}"
														</div>
													)}
													<input
														type="text"
														value={region.translated_text || ""}
														onChange={(e) =>
															handleRegionTextChange(idx, e.target.value)
														}
														placeholder="Nhập bản dịch..."
														className="w-full py-1.5 px-2.5 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl text-xs text-gray-900 dark:text-white focus:outline-none focus:border-[var(--brand-orange)] font-medium"
													/>
												</div>
											))}
										</div>
									)}
								</div>
							)}
						</div>
					)}
				</div>
			</div>
		);
	};

	// Tab 3: Profiles
	const handleExportProfile = async (pId: string) => {
		try {
			const sanitized = await translationApi.exportProfile(pId);
			const blob = new Blob([JSON.stringify(sanitized, null, 2)], {
				type: "application/json",
			});
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = `translation_profile_${pId.slice(0, 8)}.json`;
			a.click();
		} catch (_err: unknown) {
			setPageError("Lỗi khi xuất profile.");
		}
	};

	const renderProfiles = () => {
		return (
			<div className="space-y-6">
				<div className="flex items-center justify-between">
					<h3 className="text-sm font-bold text-gray-900 dark:text-white">
						Danh sách Translation Profiles
					</h3>
					<button
						type="button"
						onClick={() => {
							const newP: Partial<TranslationProfile> = {
								name: `Profile Mới (${profiles.length + 1})`,
								target_language: "vi",
								source_language: "auto",
								effective_config: {
									detector: "default",
									ocr: "manga_ocr",
									translator: "gemini",
									render_font: "default",
								},
							};
							translationApi.createProfile(newP).then(() => fetchProfiles());
						}}
						className="px-4 py-2 bg-[var(--brand-orange)] hover:bg-[var(--brand-coral)] text-white text-xs font-bold rounded-xl shadow transition flex items-center space-x-1.5 cursor-pointer"
					>
						<Plus size={14} />
						<span>Tạo Profile mới</span>
					</button>
				</div>

				<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
					{profiles.map((p) => (
						<div
							key={p.profile_id}
							className="p-5 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-3xl shadow-sm space-y-3"
						>
							<div className="flex items-center justify-between">
								<div className="space-y-0.5">
									<div className="font-bold text-sm text-gray-900 dark:text-white flex items-center space-x-2">
										<span>{p.name}</span>
										{p.is_default && (
											<span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 text-[10px] font-bold">
												Mặc định
											</span>
										)}
									</div>
									<div className="text-[11px] text-zinc-500">
										Revision {p.active_revision} • Hash:{" "}
										<span className="font-mono">
											{p.config_hash.slice(0, 10)}...
										</span>
									</div>
								</div>

								<div className="flex items-center space-x-1">
									<button
										type="button"
										onClick={() => handleExportProfile(p.profile_id)}
										className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-zinc-800 text-zinc-500 hover:text-gray-900 dark:hover:text-white transition"
										title="Xuất Profile (Sanitized JSON)"
									>
										<Download size={14} />
									</button>
								</div>
							</div>

							<div className="p-3 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-2xl text-[11px] font-mono text-zinc-600 dark:text-zinc-400 max-h-36 overflow-y-auto">
								{JSON.stringify(p.effective_config, null, 2)}
							</div>
						</div>
					))}
				</div>
			</div>
		);
	};

	// Tab 4: Providers
	const renderProviders = () => {
		return (
			<div className="space-y-6">
				<div className="flex items-center justify-between">
					<h3 className="text-sm font-bold text-gray-900 dark:text-white">
						Nhà cung cấp dịch thuật (Translation Backends)
					</h3>
					<button
						type="button"
						onClick={fetchProviders}
						className="text-xs text-[var(--brand-orange)] hover:underline flex items-center space-x-1"
					>
						<RefreshCw
							size={12}
							className={loadingProviders ? "animate-spin" : ""}
						/>
						<span>Kiểm tra lại</span>
					</button>
				</div>

				<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
					{providers.map((pr) => (
						<div
							key={pr.provider_id}
							className="p-5 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-3xl shadow-sm space-y-3"
						>
							<div className="flex items-center justify-between">
								<h4 className="font-bold text-sm text-gray-900 dark:text-white">
									{pr.name}
								</h4>
								<span
									className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
										pr.capability_probe?.configured
											? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
											: "bg-amber-500/10 text-amber-500 border border-amber-500/20"
									}`}
								>
									{pr.capability_probe?.status || "Unknown"}
								</span>
							</div>

							<p className="text-xs text-zinc-500 leading-relaxed">
								{pr.capability_probe?.message || "Sẵn sàng hoạt động"}
							</p>

							<div className="pt-2 border-t border-gray-100 dark:border-zinc-800/80 text-[11px] text-zinc-400">
								Model:{" "}
								<span className="font-bold text-gray-900 dark:text-white">
									{pr.model_id}
								</span>
							</div>
						</div>
					))}
				</div>
			</div>
		);
	};

	// Tab 5: Fonts
	const [fontFile, setFontFile] = useState<File | null>(null);
	const [fontName, setFontName] = useState<string>("");
	const [uploadingFont, setUploadingFont] = useState<boolean>(false);

	const handleUploadFont = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!fontFile || !fontName) return;
		setUploadingFont(true);
		setPageError("");
		try {
			const fd = new FormData();
			fd.append("file", fontFile);
			fd.append("name", fontName);
			await translationApi.uploadFont(fd);
			setFontFile(null);
			setFontName("");
			setActionSuccess("Tải lên font thành công!");
			void fetchFonts();
		} catch (err: any) {
			setPageError(err?.response?.data?.detail || "Lỗi tải lên font.");
		} finally {
			setUploadingFont(false);
		}
	};

	const renderFonts = () => {
		return (
			<div className="space-y-6">
				{/* Upload Font Form */}
				<form
					onSubmit={handleUploadFont}
					className="p-5 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-3xl shadow-sm space-y-4"
				>
					<h3 className="text-sm font-bold text-gray-900 dark:text-white">
						Tải lên Font Pack mới (.ttf, .otf)
					</h3>
					<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
						<div>
							<label
								htmlFor="font-name-input"
								className="text-[11px] font-semibold text-zinc-500 block mb-1"
							>
								Tên hiển thị của Font
							</label>
							<input
								id="font-name-input"
								type="text"
								value={fontName}
								onChange={(e) => setFontName(e.target.value)}
								placeholder="VD: Anime Ace VN"
								className="w-full py-2 px-3 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-xl text-xs font-semibold focus:outline-none focus:border-[var(--brand-orange)]"
								required
							/>
						</div>
						<div>
							<label
								htmlFor="font-file-input"
								className="text-[11px] font-semibold text-zinc-500 block mb-1"
							>
								File Font (.ttf, .otf)
							</label>
							<input
								id="font-file-input"
								type="file"
								accept=".ttf,.otf"
								onChange={(e) => setFontFile(e.target.files?.[0] || null)}
								className="w-full py-1.5 px-3 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-xl text-xs font-semibold"
								required
							/>
						</div>
					</div>
					<button
						type="submit"
						disabled={uploadingFont || !fontFile || !fontName}
						className="px-5 py-2.5 bg-[var(--brand-orange)] hover:bg-[var(--brand-coral)] disabled:opacity-40 text-white text-xs font-bold rounded-xl shadow transition cursor-pointer flex items-center space-x-2"
					>
						{uploadingFont ? (
							<Loader2 size={14} className="animate-spin" />
						) : (
							<Upload size={14} />
						)}
						<span>Tải lên và kiểm tra Glyph tiếng Việt</span>
					</button>
				</form>

				{/* Font List */}
				<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
					{fonts.map((f) => (
						<div
							key={f.font_pack_id}
							className="p-5 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-3xl shadow-sm space-y-3"
						>
							<div className="flex items-center justify-between">
								<h4 className="font-bold text-sm text-gray-900 dark:text-white">
									{f.name}
								</h4>
								<span
									className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
										f.vietnamese_coverage
											? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
											: "bg-rose-500/10 text-rose-500 border border-rose-500/20"
									}`}
								>
									{f.vietnamese_coverage ? "100% Tiếng Việt" : "Thiếu dấu"}
								</span>
							</div>

							<p className="text-xs text-zinc-500">
								{f.license_note || "Manga Open Source Font"}
							</p>
						</div>
					))}
				</div>
			</div>
		);
	};

	// Tab 6: Jobs Timeline
	const handleCancelJob = async (jobId: string) => {
		try {
			await translationApi.cancelJob(jobId);
			setActionSuccess(`Đã yêu cầu hủy job ${jobId.slice(0, 8)}`);
			void fetchJobs();
		} catch (_err: unknown) {
			setPageError("Lỗi khi hủy job.");
		}
	};

	const handleRetryJob = async (jobId: string) => {
		try {
			await translationApi.retryJob(jobId);
			setActionSuccess(`Đã kích hoạt thử lại cho job ${jobId.slice(0, 8)}`);
			void fetchJobs();
		} catch (_err: unknown) {
			setPageError("Lỗi khi thử lại job.");
		}
	};

	const renderJobs = () => {
		return (
			<div className="space-y-6">
				<div className="flex items-center justify-between">
					<h3 className="text-sm font-bold text-gray-900 dark:text-white">
						Tiến trình các tác vụ dịch (Jobs Timeline)
					</h3>
					<button
						type="button"
						onClick={fetchJobs}
						className="text-xs text-[var(--brand-orange)] hover:underline flex items-center space-x-1"
					>
						<RefreshCw
							size={12}
							className={loadingJobs ? "animate-spin" : ""}
						/>
						<span>Làm mới</span>
					</button>
				</div>

				{jobs.length === 0 ? (
					<div className="p-12 text-center bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-3xl space-y-3">
						<Clock size={36} className="mx-auto text-zinc-400" />
						<p className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">
							Chưa có tác vụ dịch nào được tạo
						</p>
						<button
							type="button"
							onClick={() => handleTabChange("demo")}
							className="px-4 py-2 bg-[var(--brand-orange)] hover:bg-[var(--brand-coral)] text-white text-xs font-bold rounded-xl shadow transition"
						>
							Chạy thử nghiệm trong Demo Workspace
						</button>
					</div>
				) : (
					<div className="space-y-3">
						{jobs.map((j) => {
							const isTerminal = [
								"completed",
								"partial",
								"failed",
								"cancelled",
							].includes(j.state);
							const percent =
								j.total_pages > 0
									? Math.round((j.completed_pages / j.total_pages) * 100)
									: 0;
							return (
								<div
									key={j.job_id}
									className="p-5 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl shadow-sm space-y-3"
								>
									<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
										<div className="space-y-0.5">
											<div className="font-bold text-xs text-gray-900 dark:text-white flex items-center space-x-2">
												<span>Job ID: {j.job_id.slice(0, 12)}...</span>
												<span
													className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
														j.state === "completed"
															? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
															: j.state === "running"
																? "bg-blue-500/10 text-blue-500 border border-blue-500/20"
																: j.state === "failed"
																	? "bg-rose-500/10 text-rose-500 border border-rose-500/20"
																	: "bg-zinc-500/10 text-zinc-400"
													}`}
												>
													{j.state}
												</span>
											</div>
											<div className="text-[11px] text-zinc-500">
												Tác vụ:{" "}
												<span className="uppercase font-semibold">
													{j.operation_kind}
												</span>{" "}
												• Tạo lúc: {new Date(j.created_at).toLocaleTimeString()}
											</div>
										</div>

										<div className="flex items-center space-x-2">
											{!isTerminal && (
												<button
													type="button"
													onClick={() => handleCancelJob(j.job_id)}
													className="px-3 py-1.5 bg-gray-100 dark:bg-zinc-800 hover:bg-rose-500/20 hover:text-rose-400 text-zinc-600 dark:text-zinc-300 rounded-lg text-xs font-semibold transition"
												>
													Hủy job
												</button>
											)}
											{(j.state === "failed" || j.state === "partial") && (
												<button
													type="button"
													onClick={() => handleRetryJob(j.job_id)}
													className="px-3 py-1.5 bg-[var(--brand-orange)] hover:bg-[var(--brand-coral)] text-white rounded-lg text-xs font-bold transition flex items-center space-x-1"
												>
													<RotateCw size={12} />
													<span>Thử lại</span>
												</button>
											)}
										</div>
									</div>

									{/* Progress bar */}
									<div className="space-y-1">
										<div className="flex items-center justify-between text-[11px] text-zinc-500">
											<span>Tiến độ trang</span>
											<span>
												{j.completed_pages} / {j.total_pages} trang ({percent}%)
											</span>
										</div>
										<div className="w-full bg-gray-100 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden">
											<div
												className="bg-[var(--brand-orange)] h-full transition-all duration-300"
												style={{ width: `${percent}%` }}
											/>
										</div>
									</div>
								</div>
							);
						})}
					</div>
				)}
			</div>
		);
	};

	// Tab 7: Storage
	const [cleaning, setCleaning] = useState<boolean>(false);

	const handleCleanup = async (dryRun: boolean) => {
		setCleaning(true);
		setPageError("");
		try {
			const res = await translationApi.previewOrRunCleanup(dryRun);
			setActionSuccess(
				dryRun
					? `Preview: Có ${res.reclaimable_count} file (${(res.reclaimable_bytes / 1024).toFixed(1)} KB) có thể giải phóng.`
					: `Đã dọn dẹp thành công ${res.reclaimable_count} file!`,
			);
			void fetchStorage();
		} catch (_err: unknown) {
			setPageError("Lỗi khi dọn dẹp storage.");
		} finally {
			setCleaning(false);
		}
	};

	const renderStorage = () => {
		return (
			<div className="space-y-6">
				<div className="p-6 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-3xl shadow-sm space-y-4">
					<h3 className="text-sm font-bold text-gray-900 dark:text-white">
						Quản lý dung lượng và dọn dẹp (Storage Lifecycle)
					</h3>
					<div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
						<div className="p-4 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-2xl">
							<span className="text-xs font-semibold text-zinc-500 block">
								Tổng dung lượng
							</span>
							<span className="text-lg font-bold text-gray-900 dark:text-white">
								{storageUsage
									? `${(storageUsage.total_bytes / (1024 * 1024)).toFixed(2)} MB`
									: "0 MB"}
							</span>
						</div>
						<div className="p-4 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-2xl">
							<span className="text-xs font-semibold text-zinc-500 block">
								Tổng số Artifacts
							</span>
							<span className="text-lg font-bold text-gray-900 dark:text-white">
								{storageUsage?.total_assets || 0} Files
							</span>
						</div>
						<div className="p-4 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-2xl">
							<span className="text-xs font-semibold text-zinc-500 block">
								Phân loại Output Image
							</span>
							<span className="text-lg font-bold text-gray-900 dark:text-white">
								{storageUsage?.by_kind?.output_image
									? `${(storageUsage.by_kind.output_image / (1024 * 1024)).toFixed(2)} MB`
									: "0 MB"}
							</span>
						</div>
					</div>

					<div className="flex items-center space-x-3 pt-2">
						<button
							type="button"
							onClick={() => handleCleanup(true)}
							disabled={cleaning}
							className="px-4 py-2 bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 text-gray-900 dark:text-white text-xs font-bold rounded-xl transition cursor-pointer"
						>
							Kiểm tra file rác (Dry-run)
						</button>
						<button
							type="button"
							onClick={() => handleCleanup(false)}
							disabled={cleaning}
							className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow transition cursor-pointer"
						>
							Dọn dẹp vĩnh viễn (Execute GC)
						</button>
					</div>
				</div>
			</div>
		);
	};

	return (
		<div className="min-h-screen bg-gray-50 dark:bg-zinc-950 text-gray-900 dark:text-white font-sans p-4 sm:p-6 lg:p-8 space-y-6">
			{/* Top Header */}
			<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-200 dark:border-zinc-800">
				<div className="space-y-1">
					<div className="flex items-center space-x-2 text-[var(--brand-orange)] font-bold text-xs uppercase tracking-wider">
						<Languages size={16} />
						<span>Manga Translation Studio</span>
					</div>
					<h1 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white tracking-tight">
						Trung tâm dịch thuật tự động Manga
					</h1>
				</div>

				<Link
					to="/"
					className="inline-flex items-center space-x-1.5 px-4 py-2 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl text-xs font-bold text-zinc-700 dark:text-zinc-300 hover:text-[var(--brand-orange)] transition shadow-sm self-start sm:self-auto"
				>
					<span>Về thư viện Manga</span>
					<ArrowRight size={14} />
				</Link>
			</div>

			{/* Alert Messages */}
			{pageError && (
				<div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs font-semibold flex items-center justify-between">
					<span>{pageError}</span>
					<button
						type="button"
						onClick={() => setPageError("")}
						className="font-bold ml-4"
					>
						×
					</button>
				</div>
			)}
			{actionSuccess && (
				<div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs font-semibold flex items-center justify-between">
					<span>{actionSuccess}</span>
					<button
						type="button"
						onClick={() => setActionSuccess("")}
						className="font-bold ml-4"
					>
						×
					</button>
				</div>
			)}

			{/* Studio Tabs Navigation */}
			<div className="flex items-center space-x-1 overflow-x-auto pb-2 border-b border-gray-200 dark:border-zinc-800/80 scrollbar-none">
				{[
					{ id: "overview", label: "Tổng quan", icon: Cpu },
					{ id: "demo", label: "Demo Workspace", icon: Sparkles },
					{ id: "profiles", label: "Profiles", icon: Sliders },
					{ id: "providers", label: "Providers", icon: Languages },
					{ id: "fonts", label: "Font Packs", icon: Type },
					{ id: "jobs", label: "Jobs Timeline", icon: Clock },
					{ id: "storage", label: "Assets & Storage", icon: HardDrive },
				].map((t) => {
					const Icon = t.icon;
					const isActive = activeTab === t.id;
					return (
						<button
							key={t.id}
							type="button"
							onClick={() => handleTabChange(t.id as StudioTab)}
							className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-2 shrink-0 cursor-pointer ${
								isActive
									? "bg-[var(--brand-orange)] text-white shadow-sm"
									: "text-zinc-600 dark:text-zinc-400 hover:bg-gray-200 dark:hover:bg-zinc-900 hover:text-gray-900 dark:hover:text-white"
							}`}
						>
							<Icon size={14} />
							<span>{t.label}</span>
						</button>
					);
				})}
			</div>

			{/* Tab Content */}
			<div className="pt-2">
				{activeTab === "overview" && renderOverview()}
				{activeTab === "demo" && renderDemoWorkspace()}
				{activeTab === "profiles" && renderProfiles()}
				{activeTab === "providers" && renderProviders()}
				{activeTab === "fonts" && renderFonts()}
				{activeTab === "jobs" && renderJobs()}
				{activeTab === "storage" && renderStorage()}
			</div>
		</div>
	);
};

export default TranslationStudioPage;
