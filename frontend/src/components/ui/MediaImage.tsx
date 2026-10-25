import { cn } from "cn";
import { ImageOff, RefreshCw } from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";
import { Button } from "./button";
import { Skeleton } from "./skeleton";

export interface MediaImageProps {
	src: string | null | undefined;
	alt: string;
	className?: string;
	containerClassName?: string;
	aspectRatio?: string;
	loading?: "lazy" | "eager";
	priority?: boolean;
	decoding?: "async" | "sync" | "auto";
	fallbackText?: string;
	retryLabel?: string;
	referrerPolicy?: React.HTMLAttributeReferrerPolicy;
	onLoad?: () => void;
	onError?: () => void;
	onClick?: (e: React.MouseEvent) => void;
}

export const MediaImage: React.FC<MediaImageProps> = ({
	src,
	alt,
	className = "w-full h-full object-cover",
	containerClassName = "relative overflow-hidden w-full h-full",
	aspectRatio,
	loading = "lazy",
	priority = false,
	decoding = "async",
	fallbackText = "Không tải được hình ảnh",
	retryLabel = "Thử lại",
	referrerPolicy = "no-referrer",
	onLoad,
	onError,
	onClick,
}) => {
	const [loaded, setLoaded] = useState(false);
	const [error, setError] = useState(false);
	const [attempt, setAttempt] = useState(0);

	// Reset states when src changes
	useEffect(() => {
		setLoaded(false);
		setError(false);
		setAttempt(0);
	}, [src]);

	if (!src) {
		return (
			<div
				className={cn(
					"flex flex-col items-center justify-center bg-muted/60 text-muted-foreground p-3 text-center text-xs",
					containerClassName,
				)}
				style={aspectRatio ? { aspectRatio } : undefined}
				onClick={onClick}
			>
				<ImageOff size={20} className="mb-1 opacity-60" />
				<span>Không có ảnh</span>
			</div>
		);
	}

	if (error) {
		return (
			<div
				role="alert"
				className={cn(
					"flex flex-col items-center justify-center gap-2 bg-muted/80 p-3 text-center text-xs text-muted-foreground",
					containerClassName,
				)}
				style={aspectRatio ? { aspectRatio } : undefined}
			>
				<ImageOff size={22} className="text-destructive/80" />
				<span className="max-w-[14rem] line-clamp-2 leading-tight">
					{fallbackText}
				</span>
				<Button
					type="button"
					size="sm"
					variant="outline"
					className="h-7 text-xs px-2.5 gap-1"
					onClick={(e) => {
						e.preventDefault();
						e.stopPropagation();
						setError(false);
						setLoaded(false);
						setAttempt((prev) => prev + 1);
					}}
				>
					<RefreshCw size={12} />
					<span>{retryLabel}</span>
				</Button>
			</div>
		);
	}

	return (
		<div
			className={cn("relative overflow-hidden", containerClassName)}
			style={aspectRatio ? { aspectRatio } : undefined}
			onClick={onClick}
		>
			{!loaded && (
				<Skeleton
					className="absolute inset-0 w-full h-full rounded-none"
					aria-hidden="true"
				/>
			)}
			<img
				key={`${src}-${attempt}`}
				src={src}
				alt={alt}
				decoding={decoding}
				loading={priority ? "eager" : loading}
				fetchPriority={priority ? "high" : "auto"}
				referrerPolicy={referrerPolicy}
				onLoad={() => {
					setLoaded(true);
					onLoad?.();
				}}
				onError={() => {
					setError(true);
					onError?.();
				}}
				className={cn(
					className,
					"transition-opacity duration-300",
					loaded ? "opacity-100" : "opacity-0",
				)}
			/>
		</div>
	);
};

export default MediaImage;
