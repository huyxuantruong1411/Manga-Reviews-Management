import { ChevronDown, ChevronUp, Search, X } from "lucide-react";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import client from "../../api/client";

interface CreatorMultiSelectProps {
	label: string;
	role: "author" | "artist";
	selected: string[];
	onChange: (selected: string[]) => void;
	placeholder?: string;
}

export const CreatorMultiSelect: React.FC<CreatorMultiSelectProps> = ({
	label,
	role,
	selected,
	onChange,
	placeholder = "Search...",
}) => {
	const [isOpen, setIsOpen] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const [suggestions, setSuggestions] = useState<string[]>([]);
	const [loading, setLoading] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);

	// Fetch suggestions with debounced search query
	useEffect(() => {
		if (!isOpen) return;

		const fetchSuggestions = async () => {
			try {
				setLoading(true);
				const res = await client.get("/api/creators/suggestions", {
					params: { query: searchQuery, role },
				});
				setSuggestions(res.data);
			} catch (err) {
				console.error("Error fetching creator suggestions:", err);
			} finally {
				setLoading(false);
			}
		};

		const debounceTimer = setTimeout(() => {
			fetchSuggestions();
		}, 200);

		return () => clearTimeout(debounceTimer);
	}, [searchQuery, role, isOpen]);

	// Handle outside click to close dropdown
	useEffect(() => {
		const handleOutsideClick = (event: MouseEvent) => {
			if (
				containerRef.current &&
				!containerRef.current.contains(event.target as Node)
			) {
				setIsOpen(false);
			}
		};

		if (isOpen) {
			document.addEventListener("mousedown", handleOutsideClick);
		}
		return () => {
			document.removeEventListener("mousedown", handleOutsideClick);
		};
	}, [isOpen]);

	const toggleSelect = (name: string) => {
		const isSelected = selected.includes(name);
		if (isSelected) {
			onChange(selected.filter((item) => item !== name));
		} else {
			onChange([...selected, name]);
		}
	};

	const handleAddCustom = () => {
		const trimmed = searchQuery.trim();
		if (trimmed && !selected.includes(trimmed)) {
			onChange([...selected, trimmed]);
			setSearchQuery("");
		}
	};

	// Check if query is in suggestions or selected
	const showAddCustomOption =
		searchQuery.trim().length > 0 &&
		!suggestions.some(
			(s) => s.toLowerCase() === searchQuery.trim().toLowerCase(),
		) &&
		!selected.some((s) => s.toLowerCase() === searchQuery.trim().toLowerCase());

	// Render trigger value (comma-separated selected list or placeholder)
	const renderTriggerValue = () => {
		if (selected.length === 0) {
			return (
				<span className="text-zinc-400 text-sm font-medium">{placeholder}</span>
			);
		}
		return (
			<span className="text-[var(--text-primary)] text-sm font-semibold truncate block max-w-full">
				{selected.join(", ")}
			</span>
		);
	};

	return (
		<div className="relative w-full" ref={containerRef}>
			{/* Label and Badge */}
			<div className="flex items-center space-x-1.5 mb-2">
				<label className="block text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">
					{label}
				</label>
				{selected.length > 0 && (
					<span className="text-[var(--brand-orange)] text-xs font-extrabold font-spartan">
						+{selected.length}
					</span>
				)}
			</div>

			{/* Select Button Box */}
			<div
				onClick={() => setIsOpen(!isOpen)}
				className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] hover:border-zinc-400 dark:hover:border-zinc-600 transition cursor-pointer select-none"
			>
				<div className="flex-1 min-w-0 pr-2">{renderTriggerValue()}</div>
				<div className="text-[var(--text-secondary)] flex items-center">
					{isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
				</div>
			</div>

			{/* Dropdown Menu */}
			{isOpen && (
				<div className="absolute z-50 left-0 right-0 mt-2 p-3 bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl shadow-xl space-y-3 max-h-80 overflow-visible flex flex-col">
					{/* Inner Search Box */}
					<div className="relative">
						<Search
							className="absolute left-3 top-3.5 text-zinc-400"
							size={14}
						/>
						<input
							type="text"
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
							placeholder={`Search ${role}...`}
							className="w-full pl-9 pr-4 py-2 text-xs rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-orange)] transition"
							autoFocus
						/>
					</div>

					{/* Selected items tags (chips) */}
					{selected.length > 0 && (
						<div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pb-1 border-b border-[var(--border-primary)]">
							{selected.map((name) => (
								<button
									key={name}
									type="button"
									onClick={() => toggleSelect(name)}
									className="flex items-center space-x-1 px-2 py-1 rounded bg-[var(--bg-primary)] hover:bg-red-500/10 hover:text-red-500 text-[11px] font-bold border border-[var(--border-primary)] text-[var(--text-primary)] transition"
								>
									<X size={10} className="mr-0.5" />
									<span>{name}</span>
								</button>
							))}
						</div>
					)}

					{/* Suggestions list */}
					<div className="overflow-y-auto flex-1 max-h-48 space-y-0.5 pr-1">
						{loading ? (
							<div className="flex justify-center items-center py-4">
								<div className="animate-spin rounded-full h-4 w-4 border-b-2 border-[var(--brand-orange)]"></div>
							</div>
						) : suggestions.length === 0 && !showAddCustomOption ? (
							<div className="text-zinc-500 text-xs py-2 text-center">
								No matches found
							</div>
						) : (
							<>
								{suggestions.map((name) => {
									const isSelected = selected.includes(name);
									return (
										<button
											key={name}
											type="button"
											onClick={() => toggleSelect(name)}
											className={`w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-left text-xs font-semibold hover:bg-[var(--bg-primary)] transition ${
												isSelected
													? "text-[var(--brand-orange)] bg-[var(--brand-orange)]/5"
													: "text-[var(--text-primary)]"
											}`}
										>
											{/* Selected Dot Indicator */}
											<span
												className={`w-2 h-2 rounded-full flex-shrink-0 ${
													isSelected
														? "bg-[var(--brand-orange)]"
														: "bg-transparent border border-zinc-500"
												}`}
											/>
											<span className="truncate">{name}</span>
										</button>
									);
								})}
							</>
						)}

						{/* Custom/New Add Option */}
						{showAddCustomOption && (
							<button
								type="button"
								onClick={handleAddCustom}
								className="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-left text-xs font-bold text-[var(--brand-orange)] hover:bg-[var(--brand-orange)]/5 transition mt-1 border border-dashed border-[var(--brand-orange)]/30"
							>
								<span className="text-lg leading-none">+</span>
								<span className="truncate">Add "{searchQuery.trim()}"</span>
							</button>
						)}
					</div>
				</div>
			)}
		</div>
	);
};
