import { ChevronUp } from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";

export const ScrollToTopButton: React.FC = () => {
	const [isVisible, setIsVisible] = useState(false);

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

	if (!isVisible) return null;

	return (
		<button
			type="button"
			onClick={scrollToTop}
			aria-label="Cuộn lên đầu trang"
			title="Cuộn lên đầu trang"
			className="fixed bottom-6 right-6 z-40 p-3 rounded-2xl bg-zinc-900/90 dark:bg-zinc-800/90 text-amber-400 hover:text-amber-300 border border-amber-500/30 hover:border-amber-500/60 shadow-xl backdrop-blur-md transition-all duration-300 hover:scale-110 active:scale-95 cursor-pointer animate-in fade-in zoom-in-75"
		>
			<ChevronUp
				size={20}
				className="transition-transform group-hover:-translate-y-0.5"
			/>
		</button>
	);
};
