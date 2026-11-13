import { cn } from "cn";
import {
	AnimatePresence,
	type HTMLMotionProps,
	LayoutGroup,
	motion,
} from "motion/react";
import type React from "react";
import { useEffect } from "react";

export const MOTION_EASE = [0.22, 1, 0.36, 1] as const;

export const MOTION_SPRING = {
	type: "spring" as const,
	stiffness: 420,
	damping: 32,
	mass: 0.8,
};

export const MOTION_PILL_SPRING = {
	type: "spring" as const,
	stiffness: 460,
	damping: 34,
	mass: 0.72,
};

export const MOTION_DURATIONS = {
	fast: 0.14,
	normal: 0.2,
	slow: 0.28,
} as const;

interface PageTransitionProps {
	children: React.ReactNode;
	pageKey?: string;
	className?: string;
}

/**
 * Route-level GPU-only entrance animation for page views.
 */
export const PageTransition: React.FC<PageTransitionProps> = ({
	children,
	pageKey,
	className,
}) => {
	return (
		<motion.div
			key={pageKey}
			initial={{ opacity: 0, y: 6 }}
			animate={{ opacity: 1, y: 0 }}
			exit={{ opacity: 0, y: -4 }}
			transition={{ duration: MOTION_DURATIONS.normal, ease: MOTION_EASE }}
			className={className}
		>
			{children}
		</motion.div>
	);
};

interface AnimatedViewSwitcherProps {
	viewKey: string;
	children: React.ReactNode;
	className?: string;
}

/**
 * Smoothly transitions between result layouts (grid / list / card / compact)
 * without duplicating active DOM nodes during exit.
 */
export const AnimatedViewSwitcher: React.FC<AnimatedViewSwitcherProps> = ({
	viewKey,
	children,
	className,
}) => {
	return (
		<LayoutGroup id={`view-switcher-${viewKey}`}>
			<AnimatePresence mode="wait" initial={false}>
				<motion.div
					key={viewKey}
					initial={{ opacity: 0, y: 8, scale: 0.995 }}
					animate={{ opacity: 1, y: 0, scale: 1 }}
					exit={{ opacity: 0, y: -6, scale: 0.995 }}
					transition={{ duration: 0.16, ease: MOTION_EASE }}
					className={className}
				>
					{children}
				</motion.div>
			</AnimatePresence>
		</LayoutGroup>
	);
};

interface AnimatedItemRevealProps extends HTMLMotionProps<"div"> {
	index?: number;
	children: React.ReactNode;
	hoverLift?: boolean;
}

/**
 * Lightweight staggered card/row entrance with clamped delay for smooth large lists.
 */
export const AnimatedItemReveal: React.FC<AnimatedItemRevealProps> = ({
	index = 0,
	children,
	className,
	hoverLift = false,
	...props
}) => {
	const delay = Math.min(index, 12) * 0.016;
	return (
		<motion.div
			initial={{ opacity: 0, y: 10 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{
				duration: 0.2,
				delay,
				ease: MOTION_EASE,
			}}
			whileHover={hoverLift ? { y: -2 } : undefined}
			className={className}
			{...props}
		>
			{children}
		</motion.div>
	);
};

interface AnimatedTabPillProps {
	layoutId: string;
	className?: string;
}

/**
 * Shared layout indicator pill that slides seamlessly across active tabs.
 */
export const AnimatedTabPill: React.FC<AnimatedTabPillProps> = ({
	layoutId,
	className,
}) => {
	return (
		<motion.span
			layoutId={layoutId}
			transition={MOTION_PILL_SPRING}
			aria-hidden="true"
			className={cn(
				"pointer-events-none absolute inset-0 rounded-xl shadow-sm",
				className,
			)}
		/>
	);
};

interface AnimatedTabPanelProps {
	tabKey: string;
	children: React.ReactNode;
	className?: string;
}

/**
 * Animated tab body swapper using mode="wait" to ensure crisp enter/exit.
 */
export const AnimatedTabPanel: React.FC<AnimatedTabPanelProps> = ({
	tabKey,
	children,
	className,
}) => {
	return (
		<AnimatePresence mode="wait" initial={false}>
			<motion.div
				key={tabKey}
				initial={{ opacity: 0, y: 6 }}
				animate={{ opacity: 1, y: 0 }}
				exit={{ opacity: 0, y: -4 }}
				transition={{ duration: 0.16, ease: MOTION_EASE }}
				className={className}
			>
				{children}
			</motion.div>
		</AnimatePresence>
	);
};

interface CollapsiblePanelProps {
	isOpen: boolean;
	children: React.ReactNode;
	className?: string;
}

/**
 * Animated accordion / filter drawer container.
 */
export const CollapsiblePanel: React.FC<CollapsiblePanelProps> = ({
	isOpen,
	children,
	className,
}) => {
	return (
		<AnimatePresence initial={false}>
			{isOpen && (
				<motion.div
					initial={{ opacity: 0, height: 0, y: -4 }}
					animate={{ opacity: 1, height: "auto", y: 0 }}
					exit={{ opacity: 0, height: 0, y: -4 }}
					transition={{ duration: 0.22, ease: MOTION_EASE }}
					className={cn("overflow-hidden", className)}
				>
					{children}
				</motion.div>
			)}
		</AnimatePresence>
	);
};

interface ModalMotionProps {
	isOpen: boolean;
	onClose: () => void;
	children: React.ReactNode;
	ariaLabel?: string;
	maxWidthClass?: string;
	overlayClassName?: string;
	panelClassName?: string;
}

/**
 * Accessible animated modal shell with Escape key handling and backdrop dismiss.
 */
export const ModalMotion: React.FC<ModalMotionProps> = ({
	isOpen,
	onClose,
	children,
	ariaLabel,
	maxWidthClass = "max-w-md",
	overlayClassName,
	panelClassName,
}) => {
	useEffect(() => {
		if (!isOpen) return;
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				onClose();
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [isOpen, onClose]);

	return (
		<AnimatePresence>
			{isOpen && (
				<motion.div
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{ opacity: 0 }}
					transition={{ duration: 0.16, ease: MOTION_EASE }}
					onClick={(e) => {
						if (e.target === e.currentTarget) onClose();
					}}
					className={cn(
						"fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/65 backdrop-blur-sm",
						overlayClassName,
					)}
				>
					<motion.div
						role="dialog"
						aria-modal="true"
						aria-label={ariaLabel}
						initial={{ opacity: 0, scale: 0.96, y: 8 }}
						animate={{ opacity: 1, scale: 1, y: 0 }}
						exit={{ opacity: 0, scale: 0.96, y: 6 }}
						transition={MOTION_SPRING}
						className={cn("w-full", maxWidthClass, panelClassName)}
					>
						{children}
					</motion.div>
				</motion.div>
			)}
		</AnimatePresence>
	);
};
