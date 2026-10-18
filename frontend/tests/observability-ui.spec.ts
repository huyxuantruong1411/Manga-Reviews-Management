import { expect, type Route, test } from "@playwright/test";

const headers = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Headers": "Content-Type",
	"Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

const reply = (route: Route, json: unknown, status = 200) =>
	route.fulfill({ headers, json, status });

test.describe("Observability Center (Audit & Application Logs)", () => {
	test.beforeEach(async ({ page }) => {
		await page.route(
			(url) => url.pathname.startsWith("/api/"),
			async (route) => {
				const path = new URL(route.request().url()).pathname;
				if (route.request().method() === "OPTIONS") return reply(route, {});

				if (path === "/api/audit-logs/actions") {
					return reply(route, { actions: ["create", "update", "delete"] });
				}
				if (path === "/api/audit-logs/stats") {
					return reply(route, {
						total_logs: 42,
						manga_logs: 20,
						review_logs: 12,
						system_logs: 10,
						last_24h_count: 5,
						action_counts: { create: 15, update: 27 },
					});
				}
				if (path === "/api/audit-logs") {
					return reply(route, {
						items: [
							{
								_id: "log-1",
								timestamp: new Date().toISOString(),
								action: "create",
								entity_type: "manga",
								entity_id: "manga-12345678",
								entity_title: "Chainsaw Man",
								actor: "admin",
								field: null,
								old_value: null,
								new_value: null,
								note: "Synthetic audit log",
							},
						],
						total: 1,
						skip: 0,
						limit: 25,
						source_engine: "mongodb",
					});
				}
				if (path === "/api/system-logs/stats") {
					return reply(route, {
						total_logs: 100,
						error_count: 2,
						warning_count: 5,
						by_service: { api: 60, worker_ocr: 40 },
						by_level: { info: 93, warning: 5, error: 2 },
						source_engine: "local_ndjson",
					});
				}
				if (path === "/api/system-logs") {
					return reply(route, {
						items: [
							{
								id: "syslog-1",
								timestamp: new Date().toISOString(),
								level: "info",
								logger: "backend.main",
								message: "Uvicorn running on http://127.0.0.1:8000",
								service_name: "api",
								trace_id: "trace-abc-123",
								task_id: null,
								job_id: null,
								manga_id: null,
								chapter_id: null,
								stage: null,
								http_method: "GET",
								http_status: 200,
								url_path: "/api/system-logs",
								duration_ms: 12.5,
								error_type: null,
								error_message: null,
								error_stack_trace: null,
							},
						],
						total: 1,
						skip: 0,
						limit: 25,
						source_engine: "local_ndjson",
					});
				}
				if (path === "/api/system-logs/elk-status") {
					return reply(route, {
						elasticsearch_available: false,
						elasticsearch_host: "http://localhost:9200",
						elasticsearch_version: null,
						kibana_available: false,
						kibana_host: "http://localhost:5601",
						kibana_embed_dashboard_url: null,
						kibana_embed_discover_url: null,
						filebeat_status: "configured",
						logstash_status: "configured",
						indices_count: 0,
						message: "Elasticsearch offline",
					});
				}

				return reply(route, []);
			},
		);
	});

	test("renders 3 sub-tabs and switches seamlessly between them on desktop (1440px)", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await page.goto("/audit-logs");

		// Header checks
		await expect(
			page.getByRole("heading", { name: "Audit Logs & Observability" }),
		).toBeVisible();

		// Sub-tabs existence
		const auditTabBtn = page.getByRole("button", {
			name: /Audit Logs \(Nghiệp Vụ\)/,
		});
		const systemTabBtn = page.getByRole("button", {
			name: /Application Logs \(ECS Bản Địa\)/,
		});
		const kibanaTabBtn = page.getByRole("button", {
			name: /Kibana Observability/,
		});

		await expect(auditTabBtn).toBeVisible();
		await expect(systemTabBtn).toBeVisible();
		await expect(kibanaTabBtn).toBeVisible();

		// Initially on audit tab: shows audit table item
		await expect(page.getByText("Chainsaw Man")).toBeVisible();
		await expect(page.getByText("MongoDB Storage")).toBeVisible();

		// Switch to Application Logs (Tab 2)
		await systemTabBtn.click();
		await expect(page).toHaveURL(/.*tab=system/);
		await expect(
			page.getByText("Uvicorn running on http://127.0.0.1:8000"),
		).toBeVisible();
		await expect(page.getByText("Local NDJSON Fallback")).toBeVisible();

		// Switch to Kibana Observability (Tab 3)
		await kibanaTabBtn.click();
		await expect(page).toHaveURL(/.*tab=kibana/);
		await expect(page.getByText("Cụm ELK Chưa Được Khởi Động")).toBeVisible();
		await expect(page.getByText("Lệnh khởi chạy container ELK:")).toBeVisible();

		// Test CTA to return to Application Logs tab
		const switchToAppLogsBtn = page.getByRole("button", {
			name: "Chuyển Sang Xem Logs Cục Bộ",
		});
		await expect(switchToAppLogsBtn).toBeVisible();
		await switchToAppLogsBtn.click();
		await expect(page).toHaveURL(/.*tab=system/);
		await expect(
			page.getByText("Uvicorn running on http://127.0.0.1:8000"),
		).toBeVisible();
	});

	test("is fully responsive on mobile (375px viewport)", async ({ page }) => {
		await page.setViewportSize({ width: 375, height: 667 });
		await page.goto("/audit-logs");

		await expect(
			page.getByRole("heading", { name: "Audit Logs & Observability" }),
		).toBeVisible();

		// Verify Tab Buttons are accessible via horizontal scroll
		const systemTabBtn = page.getByRole("button", {
			name: /Application Logs \(ECS Bản Địa\)/,
		});
		await systemTabBtn.scrollIntoViewIfNeeded();
		await systemTabBtn.click();

		await expect(page).toHaveURL(/.*tab=system/);
		await expect(
			page.getByText("Uvicorn running on http://127.0.0.1:8000"),
		).toBeVisible();
	});
});
