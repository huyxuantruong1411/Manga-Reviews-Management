import { Eye, EyeOff } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { Button } from "./button";
import { Skeleton } from "./skeleton";

interface BlurredCoverProps {
	src: string | null | undefined;
	alt: string;
	className?: string;
	shouldBlur: boolean;
	referrerPolicy?: React.HTMLAttributeReferrerPolicy;
	onClick?: (e: React.MouseEvent) => void;
}

export const BlurredCover: React.FC<BlurredCoverProps> = (props) => (
	<CoverImage
		key={`${props.src || "missing"}:${props.shouldBlur}`}
		{...props}
	/>
);

const CoverImage: React.FC<BlurredCoverProps> = ({
	src,
	alt,
	className = "w-full h-full object-cover",
	shouldBlur,
	referrerPolicy = "no-referrer",
	onClick,
}) => {
	const [revealed, setRevealed] = useState(false);
	const [loaded, setLoaded] = useState(false);
	const [failed, setFailed] = useState(false);
	const [attempt, setAttempt] = useState(0);

	if (!src) {
		return (
			<div className="w-full h-full flex flex-col items-center justify-center text-zinc-400 dark:text-zinc-650 text-xs bg-zinc-100 dark:bg-zinc-900 border border-[var(--border-primary)] rounded">
				<span>No Cover</span>
			</div>
		);
	}

	const isCurrentlyBlurred = shouldBlur && !revealed;
	if (failed)
		return (
			<div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-muted p-2 text-center text-xs text-muted-foreground">
				<span>Không tải được ảnh bìa</span>
				<Button
					type="button"
					size="sm"
					variant="outline"
					className="h-auto whitespace-normal"
					onClick={(event) => {
						event.preventDefault();
						event.stopPropagation();
						setFailed(false);
						setLoaded(false);
						setAttempt((value) => value + 1);
					}}
				>
					Tải lại ảnh bìa
				</Button>
			</div>
		);

	return (
		<div
			className="relative w-full h-full overflow-hidden group/blur"
			onClick={onClick}
		>
			{!loaded && (
				<Skeleton
					className="absolute inset-0 h-full w-full"
					aria-hidden="true"
				/>
			)}
			<img
				key={attempt}
				src={src}
				alt={alt}
				onLoad={() => setLoaded(true)}
				onError={() => setFailed(true)}
				className={`${className} ${loaded ? "opacity-100" : "opacity-0"} transition-all duration-300 ${
					isCurrentlyBlurred ? "filter blur-2xl scale-110 brightness-[0.4]" : ""
				}`}
				referrerPolicy={referrerPolicy}
				loading="lazy"
			/>

			{isCurrentlyBlurred && (
				<div className="absolute inset-0 flex flex-col items-center justify-center bg-black/45 backdrop-blur-[2px] transition duration-200 z-[2] prevent-nav">
					<button
						type="button"
						onClick={(e) => {
							e.stopPropagation();
							e.preventDefault();
							setRevealed(true);
						}}
						className="p-2.5 rounded-full bg-zinc-900/90 hover:bg-zinc-800 text-white border border-white/20 shadow-lg transition duration-200 hover:scale-110 active:scale-95 cursor-pointer flex items-center justify-center"
						title="Reveal cover art"
					>
						<EyeOff size={16} />
					</button>
					<span className="text-[10px] font-extrabold text-white/95 uppercase tracking-widest mt-2 select-none drop-shadow-md">
						NSFW BLURRED
					</span>
				</div>
			)}

			{shouldBlur && revealed && (
				<button
					type="button"
					onClick={(e) => {
						e.stopPropagation();
						e.preventDefault();
						setRevealed(false);
					}}
					className="absolute top-2 right-2 p-1.5 rounded-full bg-zinc-950/85 hover:bg-zinc-900 text-white border border-white/10 shadow transition opacity-0 group-hover/blur:opacity-100 duration-200 z-[2] cursor-pointer flex items-center justify-center"
					title="Re-blur cover art"
				>
					<Eye size={12} />
				</button>
			)}
		</div>
	);
};

export default BlurredCover;
