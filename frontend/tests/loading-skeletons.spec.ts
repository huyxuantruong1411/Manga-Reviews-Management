import { expect, type Route, test } from "@playwright/test";

const headers = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Headers": "Content-Type",
	"Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

const reply = (route: Route, json: unknown, status = 200) =>
	route.fulfill({ headers, json, status });

test.describe("Loading Skeletons & Layout Stability Suite", () => {
	test("1. Manga List initial fetch renders skeleton without empty flash, then transitions to data", async ({
		page,
	}) => {
		let resolveMangaRequest: () => void = () => {};
		const mangaPromise = new Promise<void>((resolve) => {
			resolveMangaRequest = resolve;
		});

		await page.route(
			(url) => url.pathname.startsWith("/api/"),
			async (route) => {
				const path = new URL(route.request().url()).pathname;
				if (route.request().method() === "OPTIONS") return reply(route, {});

				if (path === "/api/tags/") {
					return reply(route, []);
				}

				if (path === "/api/manga/") {
					// Hold request until we assert the skeleton state
					await mangaPromise;
					return reply(route, {
						items: [
							{
								_id: "manga-fixture-1",
								title: "Skeleton Verified Manga Title",
								read_status: "reading",
								tag_ids: [],
								personal_rating: 9,
							},
						],
						total: 1,
					});
				}

				return reply(route, {});
			},
		);

		await page.goto("/", { waitUntil: "domcontentloaded" });

		// Assert LoadingRegion is active with aria-busy="true"
		const loadingRegion = page.locator('[role="status"][aria-busy="true"]');
		await expect(loadingRegion.first()).toBeVisible({ timeout: 5000 });

		// Verify screen reader text
		const srText = page.locator(".sr-only").first();
		await expect(srText).toBeAttached();

		// Verify empty state is NOT shown while loading
		await expect(page.getByText("Không tìm thấy truyện nào")).not.toBeVisible();

		// Release the API response
		resolveMangaRequest();

		// Wait for actual manga card to appear
		await expect(page.getByText("Skeleton Verified Manga Title")).toBeVisible({
			timeout: 10000,
		});

		// Skeleton region should be gone
		await expect(
			page.locator('[role="status"][aria-busy="true"]'),
		).not.toBeVisible();

		// Verify no horizontal overflow in desktop/mobile
		const hasOverflow = await page.evaluate(() => {
			return document.documentElement.scrollWidth > window.innerWidth + 2;
		});
		expect(hasOverflow).toBeFalsy();
	});

	test("2. Manga Detail Page displays composite skeleton during initial fetch", async ({
		page,
	}) => {
		let resolveDetail: () => void = () => {};
		const detailPromise = new Promise<void>((resolve) => {
			resolveDetail = resolve;
		});

		await page.route(
			(url) => url.pathname.startsWith("/api/"),
			async (route) => {
				const path = new URL(route.request().url()).pathname;
				if (route.request().method() === "OPTIONS") return reply(route, {});

				if (path === "/api/manga/manga-detail-fixture/chapters") {
					await detailPromise;
					return reply(route, {
						chapters: [
							{
								id: "chap-1",
								manga_id: "manga-detail-fixture",
								chapter_number: "1",
								title: "Chapter 1",
								page_count: 15,
							},
						],
						total: 1,
					});
				}

				if (path === "/api/manga/manga-detail-fixture") {
					await detailPromise;
					return reply(route, {
						_id: "manga-detail-fixture",
						title: "Detailed Manga Entry",
						description: "Rich description of the manga.",
						read_status: "completed",
						tag_ids: [],
						links: [],
						authors: [],
						artists: [],
					});
				}

				if (path.includes("/bindings/")) return reply(route, { bindings: {} });

				return reply(route, []);
			},
		);

		await page.goto("/manga/manga-detail-fixture", {
			waitUntil: "domcontentloaded",
		});

		// Assert detail skeleton is active
		const loadingRegion = page.locator('[role="status"][aria-busy="true"]');
		await expect(loadingRegion.first()).toBeVisible({ timeout: 5000 });

		// Release response
		resolveDetail();

		// Assert detail content loaded
		await expect(page.getByText("Detailed Manga Entry")).toBeVisible({
			timeout: 10000,
		});
		await expect(
			page.getByText("Rich description of the manga."),
		).toBeVisible();
	});

	test("3. Downloads page displays skeleton during initialLoading and avoids false empty state flash", async ({
		page,
	}) => {
		let resolveDownloads: () => void = () => {};
		const downloadsPromise = new Promise<void>((resolve) => {
			resolveDownloads = resolve;
		});

		await page.route(
			(url) => url.pathname.startsWith("/api/"),
			async (route) => {
				const path = new URL(route.request().url()).pathname;
				if (route.request().method() === "OPTIONS") return reply(route, {});

				if (path.includes("/downloads")) {
					await downloadsPromise;
					return reply(route, []);
				}

				return reply(route, []);
			},
		);

		await page.goto("/downloads", { waitUntil: "domcontentloaded" });

		// Assert skeleton is displayed during initial loading
		const loadingRegion = page.locator('[role="status"][aria-busy="true"]');
		await expect(loadingRegion.first()).toBeVisible({ timeout: 5000 });

		// False empty state "No downloads found" must NOT be visible yet
		await expect(page.getByText("No downloads found")).not.toBeVisible();

		// Release response (empty task array)
		resolveDownloads();

		// Now the empty state should legitimately appear
		await expect(page.getByText("No downloads found")).toBeVisible({
			timeout: 10000,
		});
	});

	test("4. Audit Logs page table shows skeleton rows during query pending", async ({
		page,
	}) => {
		let resolveLogs: () => void = () => {};
		const logsPromise = new Promise<void>((resolve) => {
			resolveLogs = resolve;
		});

		await page.route(
			(url) => url.pathname.startsWith("/api/"),
			async (route) => {
				const path = new URL(route.request().url()).pathname;
				if (route.request().method() === "OPTIONS") return reply(route, {});

				if (path === "/api/audit-logs/actions") {
					return reply(route, { actions: ["create", "update"] });
				}
				if (path === "/api/audit-logs/stats") {
					return reply(route, {
						total_logs: 10,
						manga_logs: 5,
						review_logs: 3,
						system_logs: 2,
						last_24h_count: 1,
						action_counts: { create: 5, update: 5 },
					});
				}
				if (path === "/api/audit-logs") {
					await logsPromise;
					return reply(route, {
						items: [
							{
								_id: "log-audit-1",
								timestamp: new Date().toISOString(),
								action: "create",
								entity_type: "manga",
								entity_id: "manga-999",
								entity_title: "Audit Test Manga",
								actor: "tester",
								field: null,
								old_value: null,
								new_value: null,
								note: "Created test item",
							},
						],
						total: 1,
						skip: 0,
						limit: 25,
						source_engine: "mongodb",
					});
				}

				return reply(route, {});
			},
		);

		await page.goto("/audit-logs", { waitUntil: "domcontentloaded" });

		// Assert table row skeletons are present
		const loadingRows = page.locator('[role="status"][aria-busy="true"]');
		await expect(loadingRows.first()).toBeVisible({ timeout: 5000 });

		// Release response
		resolveLogs();

		// Actual row is displayed
		await expect(page.getByText("Audit Test Manga")).toBeVisible({
			timeout: 10000,
		});
	});

	test("5. Respects prefers-reduced-motion without breaking layout", async ({
		page,
	}) => {
		// Emulate reduced motion
		await page.emulateMedia({ reducedMotion: "reduce" });

		await page.route(
			(url) => url.pathname.startsWith("/api/"),
			async (route) => {
				// Don't respond immediately so skeleton stays visible
				await new Promise((r) => setTimeout(r, 800));
				return reply(route, { items: [], total: 0 });
			},
		);

		await page.goto("/", { waitUntil: "domcontentloaded" });

		const skeleton = page.locator(".motion-reduce\\:animate-none").first();
		await expect(skeleton).toBeAttached();
	});
});
