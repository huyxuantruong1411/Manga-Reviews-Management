import { expect, test } from "@playwright/test";

/**
 * visual-reader.spec.ts
 * Visual inspection and responsive layout regression test suite.
 * Evaluates Manga List, Navigation Bar, and Panel Words Detector / OCR Vocabulary Cluster
 * across Mobile (375px) and Desktop (1440px) viewports.
 */

test.describe("Manga Platform Visual & Responsive Audit", () => {
	test.beforeEach(async ({ page }) => {
		await page.route(
			(url) => url.pathname.startsWith("/api/"),
			(route) => {
				const path = new URL(route.request().url()).pathname;
				const json =
					path === "/api/manga/"
						? {
								items: [
									{
										_id: "fixture-manga",
										title: "Synthetic visual fixture",
										read_status: "unread",
										tag_ids: [],
									},
								],
								total: 1,
							}
						: [];
				return route.fulfill({
					json,
					headers: { "Access-Control-Allow-Origin": "*" },
				});
			},
		);
	});
	test("1. Manga List & Navigation Bar Layout Integrity", async ({
		page,
		isMobile,
	}) => {
		// Navigate to manga library homepage
		await page.goto("/", { waitUntil: "domcontentloaded" });

		await expect(
			page.getByText("Synthetic visual fixture", { exact: true }),
		).toBeVisible();
		// Verify main header / navigation presence
		const header = page.locator("header");
		await expect(header).toBeVisible({ timeout: 10000 });

		// Verify main content container rendered
		const mainContent = page.locator("main");
		await expect(mainContent).toBeVisible();

		// Verify no horizontal viewport clipping or overflow
		const hasOverflow = await page.evaluate(() => {
			return document.documentElement.scrollWidth;
		});
		expect(
			hasOverflow,
			"Manga list page should not suffer from horizontal overflow",
		).toBeLessThanOrEqual(page.viewportSize()!.width);

		// Capture visual snapshot for QA inspection
		const viewportTag = isMobile ? "mobile-375px" : "desktop-1440px";
		await page.screenshot({
			path: `test-results/screenshots/manga-list-${viewportTag}.png`,
			fullPage: false,
		});
	});

	test("2. Panel Words Detector & OCR Vocabulary Cluster Layout", async ({
		page,
		isMobile,
	}) => {
		// Mock telemetry and stats
		await page.route("**/api/panels/scan-status*", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					status: "idle",
					stage: "idle",
					is_scanning: false,
					percent: 0,
					current_page: 0,
					total_pages: 0,
					scanned_mangas: [
						{
							manga_id: "mock-manga-1",
							title: "One Piece (Mock Series)",
							panels_count: 10,
							words_count: 240,
						},
					],
				}),
			});
		});

		await page.route("**/api/panels/stats*", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					total_panels: 100,
					total_pages_scanned: 20,
					total_mangas_scanned: 5,
					total_unique_words: 1500,
					frequent_words: [
						{ word: "pirate", count: 42 },
						{ word: "adventure", count: 35 },
					],
				}),
			});
		});

		// Mock search results with rich vocabulary cluster
		await page.route("**/api/panels/search*", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					results: [
						{
							panel_id: "panel-audit-001",
							panel_index: 0,
							manga_id: "mock-manga-1",
							manga_title: "One Piece",
							chapter_id: "mock-chap-1",
							chapter_number: "1",
							volume: "1",
							page_number: 4,
							coords: [0.08, 0.08, 0.92, 0.48],
							raw_text: "I AM GOING TO BE THE PIRATE KING!",
							cleaned_text: "I am going to be the pirate king!",
							language: "en",
							scan_mode: "panel",
							lemmas: ["pirate", "king"],
							vocabulary: [
								{
									term: "pirate",
									lemma: "pirate",
									pos_tag: "NOUN",
									frequency: 3,
								},
								{ term: "king", lemma: "king", pos_tag: "NOUN", frequency: 1 },
							],
						},
					],
					total: 1,
					limit: 12,
					offset: 0,
				}),
			});
		});

		// Navigate to panel-words-detector route
		await page.goto("/panel-words-detector", { waitUntil: "domcontentloaded" });

		// Locate search input
		const searchInput = page.locator('input[placeholder*="Nhập từ khóa"]');
		await expect(searchInput).toBeVisible({ timeout: 10000 });

		// Trigger search to render panel card and vocabulary cluster
		await searchInput.fill("pirate");
		await searchInput.press("Enter");

		// Require the actual OCR token and vocabulary from the fixture, not a generic container.
		const panelCard = page.getByRole("button", { name: "PIRATE", exact: true });
		await expect(panelCard).toBeVisible({ timeout: 10000 });
		await expect(
			page.getByRole("button", { name: "pirate NOUN", exact: true }),
		).toBeVisible();

		// Verify no horizontal overflow in panel reader viewport
		const hasOverflow = await page.evaluate(() => {
			return document.documentElement.scrollWidth;
		});
		expect(
			hasOverflow,
			"Panel words detector must fit within viewport width without horizontal clipping",
		).toBeLessThanOrEqual(page.viewportSize()!.width);

		// Capture visual snapshot of panel reader / OCR vocabulary UI
		const viewportTag = isMobile ? "mobile-375px" : "desktop-1440px";
		await page.screenshot({
			path: `test-results/screenshots/panel-detector-${viewportTag}.png`,
			fullPage: false,
		});
	});
});
