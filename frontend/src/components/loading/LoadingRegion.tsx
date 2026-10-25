import type React from "react";

interface LoadingRegionProps {
	label: string;
	children: React.ReactNode;
	className?: string;
}

/**
 * Accessible loading region wrapper.
 * Marks the container with aria-busy="true" and role="status",
 * provides visually hidden screen-reader announcement,
 * and hides decorative skeleton bones from screen readers.
 */
export const LoadingRegion: React.FC<LoadingRegionProps> = ({
	label,
	children,
	className = "",
}) => {
	return (
		<div
			role="status"
			aria-busy="true"
			aria-label={label}
			className={className}
		>
			<span className="sr-only">{label}</span>
			<div aria-hidden="true" className="w-full">
				{children}
			</div>
		</div>
	);
};

export default LoadingRegion;
