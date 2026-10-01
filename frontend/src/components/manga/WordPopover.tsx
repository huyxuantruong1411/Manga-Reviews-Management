import { BookOpen, CheckCircle2, Sparkles, Volume2, X } from "lucide-react";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import client from "../../api/client";
import type { WordDefinition } from "../../types/panel";

interface WordPopoverProps {
	word: string;
	position: { x: number; y: number };
	onClose: () => void;
}

export const WordPopover: React.FC<WordPopoverProps> = ({
	word,
	position,
	onClose,
}) => {
	const [definition, setDefinition] = useState<WordDefinition | null>(null);
	const [loading, setLoading] = useState(true);
	const [isPlayingAudio, setIsPlayingAudio] = useState(false);
	const audioRef = useRef<HTMLAudioElement | null>(null);

	useEffect(() => {
		const closeOnEscape = (event: KeyboardEvent) => {
			if (event.key === "Escape") onClose();
		};
		window.addEventListener("keydown", closeOnEscape);
		return () => {
			window.removeEventListener("keydown", closeOnEscape);
			audioRef.current?.pause();
			window.speechSynthesis?.cancel();
		};
	}, [onClose, word]);

	useEffect(() => {
		let isMounted = true;

		client
			.get(`/api/dictionary/define/${encodeURIComponent(word.toLowerCase())}`)
			.then((res) => {
				if (isMounted) {
					setDefinition(res.data);
					setLoading(false);
				}
			})
			.catch(() => {
				if (isMounted) {
					setDefinition({
						word,
						phonetic: "",
						audio_url: "",
						meanings: [],
						status: "unavailable",
					});
					setLoading(false);
				}
			});

		return () => {
			isMounted = false;
		};
	}, [word]);

	const fallbackSpeech = () => {
		if ("speechSynthesis" in window) {
			setIsPlayingAudio(true);
			const utterance = new SpeechSynthesisUtterance(word);
			utterance.lang = "en-US";
			utterance.rate = 0.9;
			utterance.onend = () => setIsPlayingAudio(false);
			utterance.onerror = () => setIsPlayingAudio(false);
			window.speechSynthesis.speak(utterance);
		}
	};

	const playAudio = () => {
		if (definition?.audio_url) {
			setIsPlayingAudio(true);
			const audio = new Audio(definition.audio_url);
			audioRef.current?.pause();
			audioRef.current = audio;
			audio.onended = () => setIsPlayingAudio(false);
			audio.onerror = () => {
				setIsPlayingAudio(false);
				fallbackSpeech();
			};
			audio.play().catch(() => fallbackSpeech());
		} else {
			fallbackSpeech();
		}
	};

	// Keep popover within screen viewport
	const viewportWidth =
		typeof window !== "undefined" ? window.innerWidth : 1024;
	const viewportHeight =
		typeof window !== "undefined" ? window.innerHeight : 768;
	const popoverWidth = Math.min(340, viewportWidth - 32);
	let left = position.x - popoverWidth / 2;
	if (left < 16) left = 16;
	if (left + popoverWidth > viewportWidth - 16)
		left = viewportWidth - popoverWidth - 16;

	return (
		<div
			role="dialog"
			aria-label={`Tra từ ${word}`}
			className="fixed z-50 rounded-2xl shadow-2xl p-4 border border-amber-500/30 text-left bg-zinc-950/95 backdrop-blur-xl text-zinc-100 animate-in fade-in zoom-in-95 duration-200"
			style={{
				top: `${Math.max(16, Math.min(position.y + 12, viewportHeight - 380))}px`,
				left: `${left}px`,
				width: `${popoverWidth}px`,
				maxHeight: "calc(100dvh - 32px)",
				overflowY: "auto",
			}}
			onClick={(e) => e.stopPropagation()}
		>
			{/* Header */}
			<div className="flex items-start justify-between pb-3 border-b border-white/10">
				<div className="space-y-0.5">
					<div className="flex items-center gap-2">
						<span className="text-lg font-black text-white tracking-wide capitalize">
							{word}
						</span>
						<button
							type="button"
							onClick={playAudio}
							className="p-1.5 rounded-full bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 transition cursor-pointer"
							title="Nghe phát âm"
						>
							<Volume2
								size={14}
								className={isPlayingAudio ? "animate-pulse text-amber-400" : ""}
							/>
						</button>
					</div>
					{definition?.phonetic && (
						<div className="text-xs font-mono text-amber-400/90 tracking-wide">
							{definition.phonetic}
						</div>
					)}
				</div>

				<button
					type="button"
					onClick={onClose}
					aria-label="Đóng từ điển"
					className="text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition cursor-pointer"
				>
					<X size={15} />
				</button>
			</div>

			{/* Meanings Content */}
			<div className="mt-3 max-h-[260px] overflow-y-auto space-y-2.5 pr-1 text-sm">
				{loading ? (
					<div className="py-6 flex flex-col items-center justify-center gap-2 text-zinc-400">
						<Sparkles size={18} className="text-amber-400 animate-spin" />
						<span className="text-xs">Đang tra cứu từ điển...</span>
					</div>
				) : definition && definition.meanings.length > 0 ? (
					definition.meanings.map((meaning, idx) => (
						<div
							key={idx}
							className="space-y-1 bg-white/[0.04] p-2.5 rounded-xl border border-white/5"
						>
							<div className="flex items-center gap-1.5">
								<span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
									{meaning.part_of_speech}
								</span>
							</div>
							<p className="text-zinc-200 text-xs leading-relaxed">
								{meaning.definition}
							</p>
							{meaning.example && (
								<p className="text-amber-200/80 text-[11px] italic pl-2 border-l-2 border-amber-500/40">
									"{meaning.example}"
								</p>
							)}
						</div>
					))
				) : (
					<div className="py-4 text-center text-xs text-zinc-400">
						{definition?.status === "unavailable"
							? "Chưa kết nối được từ điển. Vui lòng thử lại."
							: "Không tìm thấy định nghĩa tiếng Anh cho từ này."}
					</div>
				)}
			</div>

			{/* Footer Pill */}
			<div className="mt-3 pt-2 border-t border-white/5 flex items-center justify-between text-[11px] text-zinc-500">
				<span className="flex items-center gap-1 text-[10px]">
					<BookOpen size={11} className="text-amber-500/70" />
					Free Dictionary API
				</span>
				{definition?.cached && (
					<span className="text-emerald-400/80 flex items-center gap-1 text-[10px]">
						<CheckCircle2 size={11} /> Đã cache
					</span>
				)}
			</div>
		</div>
	);
};
