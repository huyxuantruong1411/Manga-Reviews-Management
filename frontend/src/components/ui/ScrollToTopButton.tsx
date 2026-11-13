import { ChevronUp } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type React from "react";
import { useEffect, useState } from "react";
import { MOTION_SPRING } from "@/components/motion/MotionPrimitives";
import { useDownload } from "../../hooks/useDownload";

export const ScrollToTopButton: React.FC = () => {
	const [isVisible, setIsVisible] = useState(false);
	const { tasks, isWidgetOpen } = useDownload();

	useEffect(() => {
		const toggleVisibility = () => {
			if (window.scrollY > 350) {
				setIsVisible(true);
			} else {
				setIsVisible(false);
			}
		};

		window.addEventListener("scroll", toggleVisibility, { passive: true });
		return () => window.removeEventListener("scroll", toggleVisibility);
	}, []);

	const scrollToTop = () => {
		window.scrollTo({
			top: 0,
			behavior: "smooth",
		});
	};

	const hasDownloadWidget =
		isWidgetOpen ||
		tasks.some((t) =>
			["pending", "downloading", "failed", "cancelled"].includes(t.status),
		);

	const bottomPosition = hasDownloadWidget ? "bottom-24" : "bottom-6";

	return (
		<AnimatePresence>
			{isVisible && (
				<motion.button
					type="button"
					onClick={scrollToTop}
					aria-label="Cuộn lên đầu trang"
					title="Cuộn lên đầu trang"
					initial={{ opacity: 0, scale: 0.8, y: 14 }}
					animate={{ opacity: 1, scale: 1, y: 0 }}
					exit={{ opacity: 0, scale: 0.8, y: 12 }}
					whileHover={{ scale: 1.08, y: -2 }}
					whileTap={{ scale: 0.94 }}
					transition={MOTION_SPRING}
					className={`fixed ${bottomPosition} right-6 z-40 p-3 rounded-2xl bg-zinc-900/90 dark:bg-zinc-800/90 text-amber-400 hover:text-amber-300 border border-amber-500/30 hover:border-amber-500/60 shadow-xl backdrop-blur-md transition-[colors,bottom,border-color] duration-200 cursor-pointer group`}
				>
					<ChevronUp
						size={20}
						className="transition-transform group-hover:-translate-y-0.5"
					/>
				</motion.button>
			)}
		</AnimatePresence>
	);
};
