import {
	BookOpen,
	Calendar,
	ExternalLink,
	Globe,
	Layers,
	PenTool,
	Star,
	Users,
} from "lucide-react";
import type React from "react";
import type { MALExtendedMetadata } from "../../types/externalReview";

interface MALExtendedMetadataPanelProps {
	metadata: MALExtendedMetadata;
	className?: string;
}

export const MALExtendedMetadataPanel: React.FC<
	MALExtendedMetadataPanelProps
> = ({ metadata, className = "" }) => {
	return (
		<div
			className={`bg-gradient-to-br from-[var(--bg-card)] to-[var(--bg-secondary)]/30 border border-[var(--border-primary)] rounded-3xl p-5 sm:p-6 shadow-sm space-y-5 ${className}`}
		>
			{/* Header */}
			<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--border-primary)]/60 pb-4">
				<div className="flex items-center space-x-3">
					<div className="w-10 h-10 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-500 font-black text-sm shrink-0">
						MAL
					</div>
					<div>
						<h4 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
							<span>MyAnimeList Extended Metadata</span>
							{metadata.score && (
								<span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black bg-amber-500/10 text-amber-500 border border-amber-500/20">
									<Star size={12} className="fill-amber-500" />
									{metadata.score.toFixed(2)}
								</span>
							)}
						</h4>
						<p className="text-xs text-[var(--text-secondary)] mt-0.5">
							Mã liên kết: #{metadata.mal_id} • Cập nhật lần cuối:{" "}
							{new Date(metadata.last_enriched_at).toLocaleDateString()}
						</p>
					</div>
				</div>

				<a
					href={metadata.canonical_url}
					target="_blank"
					rel="noopener noreferrer"
					className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-blue-500/10 hover:bg-blue-500/20 text-blue-500 transition border border-blue-500/20 self-start sm:self-auto"
				>
					<span>Mở trên MyAnimeList</span>
					<ExternalLink size={13} />
				</a>
			</div>

			{/* Alternative Titles */}
			{(metadata.japanese_title ||
				metadata.english_title ||
				metadata.synonyms.length > 0) && (
				<div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
					{metadata.japanese_title && (
						<div className="p-3 rounded-2xl bg-[var(--bg-secondary)]/40 border border-[var(--border-primary)]/50">
							<span className="text-[var(--text-secondary)] font-medium block mb-1">
								🇯🇵 Tiêu đề tiếng Nhật
							</span>
							<span className="text-[var(--text-primary)] font-bold text-sm">
								{metadata.japanese_title}
							</span>
						</div>
					)}
					{metadata.english_title && (
						<div className="p-3 rounded-2xl bg-[var(--bg-secondary)]/40 border border-[var(--border-primary)]/50">
							<span className="text-[var(--text-secondary)] font-medium block mb-1">
								🇬🇧 Tiêu đề tiếng Anh
							</span>
							<span className="text-[var(--text-primary)] font-bold text-sm">
								{metadata.english_title}
							</span>
						</div>
					)}
					{metadata.synonyms.length > 0 && (
						<div className="md:col-span-2 p-3 rounded-2xl bg-[var(--bg-secondary)]/40 border border-[var(--border-primary)]/50">
							<span className="text-[var(--text-secondary)] font-medium block mb-1">
								Tên gọi khác (Synonyms)
							</span>
							<div className="flex flex-wrap gap-1.5 mt-1">
								{metadata.synonyms.map((syn) => (
									<span
										key={syn}
										className="px-2 py-0.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-primary)] text-[var(--text-primary)] font-medium text-xs"
									>
										{syn}
									</span>
								))}
							</div>
						</div>
					)}
				</div>
			)}

			{/* Information Grid */}
			<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 text-xs">
				<div className="p-3 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-primary)]/60">
					<span className="text-[var(--text-secondary)] flex items-center gap-1.5 mb-1">
						<BookOpen size={13} className="text-blue-500" />
						<span>Định dạng & Tiến độ</span>
					</span>
					<span className="font-bold text-[var(--text-primary)]">
						{metadata.media_type || "Manga"} •{" "}
						{metadata.volumes ? `${metadata.volumes} tập` : "? tập"} (
						{metadata.chapters ? `${metadata.chapters} chp` : "? chp"})
					</span>
				</div>

				<div className="p-3 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-primary)]/60">
					<span className="text-[var(--text-secondary)] flex items-center gap-1.5 mb-1">
						<Globe size={13} className="text-emerald-500" />
						<span>Trạng thái phát hành</span>
					</span>
					<span className="font-bold text-[var(--text-primary)]">
						{metadata.status || "Chưa rõ"}
					</span>
				</div>

				<div className="p-3 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-primary)]/60">
					<span className="text-[var(--text-secondary)] flex items-center gap-1.5 mb-1">
						<Calendar size={13} className="text-amber-500" />
						<span>Thời gian xuất bản</span>
					</span>
					<span
						className="font-bold text-[var(--text-primary)] truncate block"
						title={metadata.published_string || ""}
					>
						{metadata.published_string || "Chưa rõ"}
					</span>
				</div>

				<div className="p-3 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-primary)]/60">
					<span className="text-[var(--text-secondary)] flex items-center gap-1.5 mb-1">
						<Layers size={13} className="text-purple-500" />
						<span>Tạp chí Serialization</span>
					</span>
					<span className="font-bold text-[var(--text-primary)] truncate block">
						{metadata.serialization.length > 0
							? metadata.serialization.join(", ")
							: "Chưa có"}
					</span>
				</div>
			</div>

			{/* Authors & Roles */}
			{metadata.authors.length > 0 && (
				<div className="p-3.5 rounded-2xl bg-[var(--bg-secondary)]/30 border border-[var(--border-primary)]/60 space-y-2">
					<span className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider flex items-center gap-1.5">
						<PenTool size={13} className="text-[var(--brand-orange)]" />
						<span>Tác giả & Vai trò (MAL)</span>
					</span>
					<div className="flex flex-wrap gap-2">
						{metadata.authors.map((author) => (
							<div
								key={author.name + author.role}
								className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-primary)] text-xs shadow-xs"
							>
								{author.url ? (
									<a
										href={author.url}
										target="_blank"
										rel="noopener noreferrer"
										className="font-bold text-[var(--text-primary)] hover:text-[var(--brand-orange)] transition flex items-center gap-1"
									>
										<span>{author.name}</span>
										<ExternalLink size={10} className="opacity-60" />
									</a>
								) : (
									<span className="font-bold text-[var(--text-primary)]">
										{author.name}
									</span>
								)}
								<span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-[var(--brand-orange)]/10 text-[var(--brand-orange)] border border-[var(--brand-orange)]/20">
									{author.role}
								</span>
							</div>
						))}
					</div>
				</div>
			)}

			{/* Genres, Themes & Demographics */}
			{(metadata.genres.length > 0 ||
				metadata.demographics.length > 0 ||
				metadata.themes.length > 0) && (
				<div className="flex flex-wrap items-center gap-1.5 pt-1">
					{metadata.demographics.map((demo) => (
						<span
							key={demo}
							className="px-2.5 py-1 rounded-xl text-xs font-bold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20"
						>
							{demo}
						</span>
					))}
					{metadata.genres.map((g) => (
						<span
							key={g}
							className="px-2.5 py-1 rounded-xl text-xs font-medium bg-[var(--bg-card)] text-[var(--text-primary)] border border-[var(--border-primary)]"
						>
							{g}
						</span>
					))}
					{metadata.themes.map((theme) => (
						<span
							key={theme}
							className="px-2.5 py-1 rounded-xl text-xs font-medium bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20"
						>
							#{theme}
						</span>
					))}
				</div>
			)}

			{/* Statistics footer */}
			{(metadata.rank || metadata.popularity || metadata.members) && (
				<div className="flex flex-wrap items-center gap-4 text-xs text-[var(--text-secondary)] border-t border-[var(--border-primary)]/40 pt-3">
					{metadata.rank && (
						<span className="flex items-center gap-1">
							<strong>Xếp hạng:</strong> #{metadata.rank.toLocaleString()}
						</span>
					)}
					{metadata.popularity && (
						<span className="flex items-center gap-1">
							<strong>Độ phổ biến:</strong> #
							{metadata.popularity.toLocaleString()}
						</span>
					)}
					{metadata.members && (
						<span className="flex items-center gap-1">
							<Users size={12} />
							<strong>Thành viên:</strong> {metadata.members.toLocaleString()}
						</span>
					)}
					{metadata.favorites && (
						<span className="flex items-center gap-1">
							<Star size={12} className="text-amber-500" />
							<strong>Yêu thích:</strong> {metadata.favorites.toLocaleString()}
						</span>
					)}
				</div>
			)}
		</div>
	);
};

export default MALExtendedMetadataPanel;
