import { Moon, Sun } from "lucide-react";
import type React from "react";
import { useTheme } from "../../hooks/useTheme";

export const ThemeToggle: React.FC = () => {
	const { theme, toggleTheme } = useTheme();

	return (
		<button
			onClick={toggleTheme}
			className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-gray-800 dark:text-zinc-200 transition-colors"
			aria-label="Toggle Theme"
		>
			{theme === "light" ? <Moon size={20} /> : <Sun size={20} />}
		</button>
	);
};

export default ThemeToggle;
