import { expect, test } from "@playwright/test";

const MOCK_CONNECTOR_STATUS = {
	connector_enabled: true,
	source_system: "manga-datalake-pool",
	contract_name: "manga-reader-package",
	contract_version: "2.0",
	schema_id: "urn:manga-datalake:contract:manga-reader-package:2.0",
	dedicated_port: 8001,
	api_key_configured: true,
	webhook_secret_configured: true,
	tunnel_path_guard_enabled: true,
	allow_unauthenticated_local: false,
	configured_public_base_url: null,
	active_public_base_url: "https://demo-source.ngrok-free.dev",
	ngrok_active: true,
	ngrok_tunnels: [
		{
			name: "command_line",
			proto: "https",
			public_url: "https://demo-source.ngrok-free.dev",
			addr: "http://127.0.0.1:8001",
		},
	],
	pool_stats: {
		ready_mangas: 27,
		ready_chapters: 1362,
		ready_pages: 31809,
		total_size_bytes: 5328756214,
	},
	active_subscriptions_count: 1,
	total_events_count: 2,
	failed_deliveries_count: 0,
	endpoints: {
		info: "/api/connector/v1/info",
		catalog: "/api/connector/v1/catalog",
		package: "/api/connector/v1/packages/{pool_manga_id}",
		media: "/api/connector/v1/media/{bucket}/{object_key}",
	},
};

test.describe("Data Lake Pool External Source Connector Gateway UI", () => {
	test("opens Connector Gateway modal, switches tabs, and maintains zero horizontal overflow", async ({
		page,
	}) => {
		await page.route("**/api/datalake-pool/stats", (route) =>
			route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					total_mangas: 27,
					total_etl_ready: 27,
					total_creators: 28,
					total_chapters: 1362,
					total_pages: 31809,
					total_size_bytes: 5328756214,
					saved_storage_bytes: 5328756214,
				}),
			}),
		);
		await page.route("**/api/datalake-pool/mangas*", (route) =>
			route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ items: [], total: 0, page: 1, page_size: 24 }),
			}),
		);
		await page.route("**/api/datalake-pool/connector/status", (route) =>
			route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(MOCK_CONNECTOR_STATUS),
			}),
		);
		await page.route("**/api/datalake-pool/connector/subscriptions*", (route) =>
			route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ items: [], total: 0 }),
			}),
		);
		await page.route("**/api/datalake-pool/connector/events*", (route) =>
			route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					items: [],
					total: 0,
					has_more: false,
					next_after_event_id: null,
				}),
			}),
		);
		await page.route("**/api/datalake-pool/connector/deliveries*", (route) =>
			route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ items: [], total: 0 }),
			}),
		);

		await page.goto("/datalake-pool", { waitUntil: "networkidle" });

		const openBtn = page.getByRole("button", { name: /ETL Connector/i });
		await expect(openBtn).toBeVisible();
		await openBtn.click();

		const dialog = page.getByRole("dialog");
		await expect(dialog).toBeVisible();
		await expect(
			dialog.getByText("https://demo-source.ngrok-free.dev").first(),
		).toBeVisible();
		await expect(dialog.getByText("ngrok LIVE")).toBeVisible();

		// Zero horizontal overflow check for both Mobile (375px) & Desktop (1440px)
		const hasOverflow = await page.evaluate(
			() => document.documentElement.scrollWidth > window.innerWidth + 1,
		);
		expect(hasOverflow).toBe(false);

		// Switch to Subscriptions & Activity empty states
		await dialog.getByRole("button", { name: /CDC Subscriptions/i }).click();
		await expect(
			dialog.getByText(/Chưa có đăng ký CDC Webhook nào/i),
		).toBeVisible();

		await dialog.getByRole("button", { name: /CDC Events/i }).click();
		await expect(dialog.getByText(/CDC Event Outbox/i)).toBeVisible();

		// Keyboard Escape closes modal
		await page.keyboard.press("Escape");
		await expect(dialog).toBeHidden();
	});
});
