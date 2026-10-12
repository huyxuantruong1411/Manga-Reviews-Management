import { createRequire } from "node:module";
import { expect, type Page, type Route, test } from "@playwright/test";

const localRequire = createRequire(import.meta.url);
const axeRequire = createRequire(
	localRequire.resolve("@axe-core/cli/package.json"),
);
const axePath = axeRequire.resolve("axe-core/axe.min.js");

async function assertAccessible(page: Page, selector: string) {
	await page.addScriptTag({ path: axePath });
	const violations = await page.evaluate(async (target) => {
		const axe = (
			window as unknown as {
				axe: {
					run: (
						element: Element,
						options: unknown,
					) => Promise<{ violations: unknown[] }>;
				};
			}
		).axe;
		const element = document.querySelector(target);
		if (!element)
			throw new Error(`Missing accessibility test target: ${target}`);
		return (
			await axe.run(element, {
				runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
			})
		).violations;
	}, selector);
	expect(violations, `WCAG violations in ${selector}`).toEqual([]);
}

const headers = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Headers": "Content-Type",
	"Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};
const svg =
	'<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900"><rect width="600" height="900" fill="white"/><text x="20" y="100">Synthetic page</text></svg>';
const manga = {
	_id: "audit-manga",
	title: "Synthetic library entry",
	read_status: "unread",
	tag_ids: [],
	personal_rating: null,
};
const reply = (route: Route, json: unknown, status = 200) =>
	route.fulfill({ headers, json, status });

async function mockReader(page: Page, mode: string) {
	await page.addInitScript(
		(value) => localStorage.setItem("manga_reading_mode", value),
		mode,
	);
	const progress: Array<{ page: number; mark_as_read: boolean }> = [];
	const chapter = {
		id: "audit-chapter",
		manga_id: "audit-manga",
		chapter_number: "1",
		chapter_numeric: 1,
		language: "en",
		source: "local",
		page_count: 2,
		pages: [1, 2].map((n) => ({
			page_uid: `p${n}`,
			page_number: n,
			width: 600,
			height: 900,
			url: `/audit-page-${n}.svg`,
			filename: `${n}.svg`,
			object_key: `${n}.svg`,
		})),
	};
	await page.route(
		(url) => url.pathname.startsWith("/api/"),
		async (route) => {
			const path = new URL(route.request().url()).pathname;
			if (route.request().method() === "OPTIONS") return reply(route, {});
			if (path.endsWith("/reading-progress")) {
				if (route.request().method() === "POST")
					progress.push(route.request().postDataJSON());
				return reply(route, {});
			}
			if (path === "/api/chapters/audit-chapter") return reply(route, chapter);
			if (path === "/api/manga/audit-manga/chapters")
				return reply(route, { chapters: [chapter], total: 1 });
			if (path === "/api/manga/audit-manga") return reply(route, manga);
			if (path.includes("/bindings/")) return reply(route, { bindings: {} });
			if (path === "/api/translation/capabilities")
				return reply(route, {
					ready_for_inference: false,
					engine: {
						status: "unavailable",
						message: "Chưa cài engine dịch thực.",
					},
				});
			return reply(route, []);
		},
	);
	await page.route("**/audit-page-*.svg", (route) =>
		route.fulfill({ contentType: "image/svg+xml", body: svg }),
	);
	return progress;
}

test("library outage offers retry instead of claiming empty data", async ({
	page,
}) => {
	let failing = true;
	await page.route(
		(url) => url.pathname.startsWith("/api/"),
		(route) => {
			const path = new URL(route.request().url()).pathname;
			if (path === "/api/manga/")
				return failing
					? reply(route, { detail: "Synthetic outage" }, 503)
					: reply(route, { items: [manga], total: 1 });
			return reply(route, []);
		},
	);
	await page.goto("/");
	await expect(page.getByRole("alert")).toContainText("Synthetic outage");
	await assertAccessible(page, '[role="alert"]');
	await expect(
		page.getByText(
			"No manga match your filters or search. Add a manga to start!",
		),
	).toHaveCount(0);
	failing = false;
	await page.getByRole("button", { name: "Thử lại", exact: true }).click();
	await expect(page.getByText(manga.title, { exact: true })).toBeVisible();
});

test("slow old search cannot overwrite the new query", async ({ page }) => {
	let releaseOld: (() => void) | undefined;
	const held = new Promise<void>((resolve) => {
		releaseOld = resolve;
	});
	let oldStarted = false;
	await page.route(
		(url) => url.pathname.startsWith("/api/"),
		async (route) => {
			const url = new URL(route.request().url());
			if (url.pathname !== "/api/manga/") return reply(route, []);
			const query = url.searchParams.get("search") || "initial";
			if (query === "older") {
				oldStarted = true;
				await held;
			}
			await reply(route, {
				items: [{ ...manga, title: `AUDIT ${query}` }],
				total: 1,
			});
		},
	);
	await page.goto("/");
	await expect(page.getByText("AUDIT initial", { exact: true })).toBeVisible();
	const search = page.getByPlaceholder(
		"Search by title, author, artist, alt titles...",
	);
	await search.fill("older");
	await expect.poll(() => oldStarted).toBe(true);
	await search.fill("newer");
	await expect(page.getByText("AUDIT newer", { exact: true })).toBeVisible();
	releaseOld?.();
	// Let the released network response and React commit finish before asserting stability.
	await page.waitForTimeout(250);
	await expect(search).toHaveValue("newer");
	await expect(page.getByText("AUDIT newer", { exact: true })).toBeVisible();
	await expect(page.getByText("AUDIT older", { exact: true })).toHaveCount(0);
});

test("single reader fits the viewport after the image loads", async ({
	page,
}) => {
	await mockReader(page, "single");
	await page.goto("/manga/audit-manga/read/audit-chapter");
	await expect(page.getByAltText("Page 1", { exact: true })).toBeVisible();
	await expect
		.poll(() =>
			page
				.getByAltText("Page 1", { exact: true })
				.evaluate((img: HTMLImageElement) => img.naturalWidth),
		)
		.toBe(600);
	expect(
		await page.evaluate(() => document.documentElement.scrollWidth),
	).toBeLessThanOrEqual(page.viewportSize()!.width);
});

for (const mode of ["double_ltr", "double_rtl"]) {
	test(`${mode} records completion for an even-page chapter`, async ({
		page,
	}) => {
		const progress = await mockReader(page, mode);
		await page.goto("/manga/audit-manga/read/audit-chapter");
		await expect(page.getByAltText("Page 2", { exact: true })).toBeVisible();
		await page.keyboard.press(
			mode === "double_rtl" ? "ArrowLeft" : "ArrowRight",
		);
		await expect
			.poll(() => progress.some((item) => item.mark_as_read))
			.toBe(true);
	});
}

for (const input of ["mouse", "keyboard"]) {
	test(`image retry really loads again using ${input}`, async ({ page }) => {
		await mockReader(page, "long_strip");
		let requests = 0;
		await page.route("**/audit-page-1.svg", (route) => {
			requests++;
			return route.fulfill(
				requests === 1
					? { status: 503, body: "Synthetic outage" }
					: { contentType: "image/svg+xml", body: svg },
			);
		});
		await page.goto("/manga/audit-manga/read/audit-chapter");
		const retry = page.getByRole("button", { name: "Thử lại", exact: true });
		await expect(retry).toBeVisible();
		if (input === "mouse") await retry.click();
		else {
			await retry.focus();
			await retry.press("Enter");
		}
		await expect.poll(() => requests).toBe(2);
		await expect(page.getByAltText("Page 1", { exact: true })).toBeVisible();
		await expect(retry).toHaveCount(0);
	});
}

test("old language bindings cannot replace a newer translation selection", async ({
	page,
}) => {
	await mockReader(page, "single");
	let releaseOld: (() => void) | undefined;
	const held = new Promise<void>((resolve) => {
		releaseOld = resolve;
	});
	let oldStarted = false;
	await page.route("**/api/translation/bindings/**", async (route) => {
		const lang = new URL(route.request().url()).searchParams.get(
			"target_language",
		);
		if (lang === "vi") {
			oldStarted = true;
			await held;
		}
		await reply(route, {
			bindings: { p1: { url: `/audit-${lang}.svg`, chosen_result_id: lang } },
		});
	});
	await page.route("**/audit-*.svg", (route) =>
		route.fulfill({ contentType: "image/svg+xml", body: svg }),
	);
	await page.goto("/manga/audit-manga/read/audit-chapter");
	await expect.poll(() => oldStarted).toBe(true);
	await page.getByTitle("Bản dịch Manga AI (Translation Studio)").click();
	await page.getByRole("button", { name: "en", exact: true }).click();
	await page.getByTitle("Xem trang đã dịch").click();
	await expect(page.getByAltText("Page 1", { exact: true })).toHaveAttribute(
		"src",
		"/audit-en.svg",
	);
	releaseOld?.();
	await page.waitForTimeout(250);
	await expect(page.getByAltText("Page 1", { exact: true })).toHaveAttribute(
		"src",
		"/audit-en.svg",
	);
});

test("failed cover provides an accessible retry and recovers", async ({
	page,
}) => {
	let requests = 0;
	await page.route(
		(url) => url.pathname.startsWith("/api/"),
		(route) =>
			reply(
				route,
				new URL(route.request().url()).pathname === "/api/manga/"
					? { items: [{ ...manga, cover_url: "/fixture-cover.svg" }], total: 1 }
					: [],
			),
	);
	await page.route("**/fixture-cover.svg", (route) => {
		requests++;
		return route.fulfill(
			requests === 1
				? { status: 503, body: "outage" }
				: { contentType: "image/svg+xml", body: svg },
		);
	});
	await page.goto("/");
	const retry = page.getByRole("button", {
		name: "Tải lại ảnh bìa",
		exact: true,
	});
	await expect(retry).toBeVisible();
	await retry.focus();
	await retry.press("Enter");
	await expect.poll(() => requests).toBe(2);
	await expect(retry).toHaveCount(0);
	await expect(page.getByAltText(manga.title, { exact: true })).toBeVisible();
	expect(new URL(page.url()).pathname).toBe("/");
});

test("browser history restores library query and results", async ({ page }) => {
	await page.route(
		(url) => url.pathname.startsWith("/api/"),
		(route) => {
			const url = new URL(route.request().url());
			return reply(
				route,
				url.pathname === "/api/manga/"
					? {
							items: [
								{ ...manga, title: `Query ${url.searchParams.get("search")}` },
							],
							total: 1,
						}
					: [],
			);
		},
	);
	await page.goto("/?search=first");
	await expect(page.getByText("Query first", { exact: true })).toBeVisible();
	// Simulate navigation to another saved URL without unmounting the library route.
	await page.evaluate(() => {
		history.pushState(null, "", "/?search=second");
		window.dispatchEvent(new PopStateEvent("popstate"));
	});
	const search = page.getByPlaceholder(
		"Search by title, author, artist, alt titles...",
	);
	await expect(search).toHaveValue("second");
	await expect(page.getByText("Query second", { exact: true })).toBeVisible();
	await page.goBack();
	await expect(search).toHaveValue("first");
	await expect(page.getByText("Query first", { exact: true })).toBeVisible();
	await page.goForward();
	await expect(search).toHaveValue("second");
	await expect(page.getByText("Query second", { exact: true })).toBeVisible();
});

test("leaving the reader flushes the last page before the debounce expires", async ({
	page,
}) => {
	const progress = await mockReader(page, "single");
	await page.goto("/manga/audit-manga/read/audit-chapter");
	await expect(page.getByAltText("Page 1", { exact: true })).toBeVisible();
	await page.keyboard.press("ArrowRight");
	await expect(page.getByAltText("Page 2", { exact: true })).toBeVisible();
	await page.getByTitle("Đóng trình đọc", { exact: true }).click();
	await expect
		.poll(() => progress.some((item) => item.page === 2 && item.mark_as_read))
		.toBe(true);
});

test("reading progress writes settle in order", async ({ page }) => {
	await mockReader(page, "single");
	let release: (() => void) | undefined;
	const held = new Promise<void>((resolve) => {
		release = resolve;
	});
	const writes: number[] = [];
	await page.route(
		"**/api/manga/audit-manga/reading-progress",
		async (route) => {
			if (route.request().method() !== "POST") return reply(route, {});
			writes.push(route.request().postDataJSON().page);
			if (writes.length === 1) await held;
			return reply(route, {});
		},
	);
	await page.goto("/manga/audit-manga/read/audit-chapter");
	await expect.poll(() => writes.length).toBe(1);
	await page.keyboard.press("ArrowRight");
	await expect(page.getByAltText("Page 2", { exact: true })).toBeVisible();
	await page.waitForTimeout(450);
	try {
		expect(writes).toEqual([1]);
	} finally {
		release?.();
	}
	await expect.poll(() => writes).toEqual([1, 2]);
});
