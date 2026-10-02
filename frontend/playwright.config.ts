import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E & Visual Testing Configuration for Manga-Reviews-Management.
 * Supports both Desktop (1440px) and Mobile (375px) responsive layout testing.
 */
export default defineConfig({
	testDir: "./tests",
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: process.env.CI ? 1 : undefined,
	reporter: [
		["list"],
		["html", { open: "never", outputFolder: "playwright-report" }],
	],
	use: {
		baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:5173",
		trace: "on-first-retry",
		screenshot: "only-on-failure",
		actionTimeout: 10000,
		navigationTimeout: 15000,
	},
	projects: [
		{
			name: "desktop-chrome",
			use: {
				...devices["Desktop Chrome"],
				viewport: { width: 1440, height: 900 },
			},
		},
		{
			name: "mobile-chrome",
			use: {
				...devices["Pixel 5"],
				viewport: { width: 375, height: 812 },
				isMobile: true,
				hasTouch: true,
			},
		},
	],
	webServer: {
		command: "pnpm dev",
		url: "http://localhost:5173",
		reuseExistingServer: true,
		timeout: 120 * 1000,
	},
});
