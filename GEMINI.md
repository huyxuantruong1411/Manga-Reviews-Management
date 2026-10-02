# Project Guidelines & Code Knowledge Graph Rules

## Code Knowledge Graph & Self-Governance Directive

This repository uses **CodeGraph** (Tree-sitter AST & MCP Server) for code intelligence and impact analysis across FastAPI (Python) and React (TypeScript).

When pair programming or performing development tasks:
1. **Always consult Code Knowledge Graph / Dependency Tree first**: Before doing wide `grep` searches or guessing codebase flow, use `codegraph_explore` / `codegraph explore <symbol>` / `codegraph callers <symbol>` to inspect definitions, callers, and callees.
2. **Mandatory Impact Analysis before refactoring**: For any refactoring, function renaming, or interface/schema alteration, execute `codegraph impact <symbol>` to determine the blast radius across dependent routers, services, models, and tests before writing code.
3. **Controlled re-indexing**: Only run `codegraph index` on major architectural changes. For minor file changes, use incremental `codegraph sync`.
4. **Automated Incremental Sync & Persistent Codebase Memory**: Every git commit automatically triggers incremental `codegraph sync` via local `.git/hooks/post-commit` (and `scripts/sync_codebase_memory.py`), recording commit diffs and active context into [`.antigravity/codebase-memory.json`](file:///d:/Projects/Manga/Manga-Reviews-Management/.antigravity/codebase-memory.json) to eliminate context amnesia.

## AI Workflow & Precision Tooling Guidelines
- **AST Pattern Search (`ast-grep`)**: Prefer `ast-grep run -p '<pattern>'` over raw regex when inspecting function/class structures.
- **Auto Linting & Formatting**: Run `ruff check --fix` + `ruff format` on edited Python files, and `biome check --write` on edited TS/TSX files.
- **Context Packing (`repomix`)**: Use `repomix` when bundling modules for deep architectural analysis. Never commit context outputs (`repomix-output.*`) or linter caches.

## Mandatory Pre-Execution Skill Lookup Directive
Trước khi thực hiện bất kỳ yêu cầu code/refactor nào, hãy tự tra cứu xem yêu cầu đó thuộc Skill nào và tự động tuân thủ toàn bộ quy trình của Skill đó:
- **`tdd-workflow`** ([`.antigravity/skills/tdd-workflow.md`](file:///d:/Projects/Manga/Manga-Reviews-Management/.antigravity/skills/tdd-workflow.md)): Viết test FAIL trước, viết code PASS sau, tự sửa tối đa 3 lần theo stack trace.
- **`architecture-guard`** ([`.antigravity/skills/architecture-guard.md`](file:///d:/Projects/Manga/Manga-Reviews-Management/.antigravity/skills/architecture-guard.md)): Cấm query DB hay tính toán trong Controller, ép buộc validate Pydantic DTO.
- **`db-migration-safety`** ([`.antigravity/skills/db-migration-safety.md`](file:///d:/Projects/Manga/Manga-Reviews-Management/.antigravity/skills/db-migration-safety.md)): Bắt buộc Up/Down migration, bắt buộc đánh index khóa ngoại (`manga_id`, `created_at`, `timestamp`).
- **`ui-ux-design`** ([`.antigravity/skills/ui-ux-design.md`](file:///d:/Projects/Manga/Manga-Reviews-Management/.antigravity/skills/ui-ux-design.md)): Khi nhận bất kỳ yêu cầu nào liên quan đến phát triển Frontend, Component, Page, hoặc sửa đổi Layout/UX, agent BẮT BUỘC phải đọc và tuân thủ `.antigravity/skills/ui-ux-design.md`, ưu tiên dùng shadcn CLI để lấy component trước khi tự viết mới.
- **`web-performance-and-a11y`** ([`.antigravity/skills/web-performance-and-a11y.md`](file:///d:/Projects/Manga/Manga-Reviews-Management/.antigravity/skills/web-performance-and-a11y.md)):
  - Khi nhận tác vụ thay đổi giao diện, tối ưu render hoặc thêm trang mới, Agent BẮT BUỘC phải đọc và tuân thủ `.antigravity/skills/web-performance-and-a11y.md`.
  - Tối ưu Core Web Vitals cho manga reader (lazy loading, skeleton placeholder, `decoding="async"`), chuẩn truy cập A11y WCAG AA (độ tương phản màu chữ OCR, phím điều hướng rating/modal), và ngăn ngừa re-render thừa trong danh sách nhiều phần tử.
  - Sau khi hoàn thành UI phức tạp, Agent tự động chạy test Playwright headless (`pnpm --dir frontend test:e2e`) để xác nhận không có lỗi layout ở cả 2 viewport (Mobile 375px & Desktop 1440px) trước khi báo cáo hoàn tất.
- **`ci-cd-guardian`** ([`.antigravity/skills/ci-cd-guardian.md`](file:///d:/Projects/Manga/Manga-Reviews-Management/.antigravity/skills/ci-cd-guardian.md)):
  - Khi thay đổi code, toolchain hoặc workflow, tuân thủ CI Guardian.
  - Trước push, chạy các local checks áp dụng cho diff bằng toolchain của CI (`scripts/ci/check_python.py`, `pytest`, `biome check`, `tsc -b`, `build`).
  - Khi đã có quyền push và truy cập GitHub, xác minh `ci-gate` cùng các checks bắt buộc trên đúng source revision và run tương ứng.
  - Chỉ báo "remote verified" khi các checks đó thành công; nếu chưa push, không có run hoặc thiếu quyền truy cập, báo đúng trạng thái "local verified" hoặc "remote verification pending", nêu nguyên nhân. Không bypass checks để hoàn tất tác vụ.


## Redis Caching & Async Task Worker (ARQ) Architecture

### 1. Hạ tầng Redis (Docker & Persistent Storage)
- **Container**: `manga-redis` chạy image `redis:alpine` trên cổng `127.0.0.1:6379`.
- **Dữ liệu bền vững (Drive D)**: Toàn bộ dữ liệu Redis AOF (`appendonly yes`) được mount trực tiếp vào `d:\Projects\Manga\Manga-Reviews-Management\backend\redis_data` (tương tự như `backend/minio_data`).
- **Khởi chạy container**:
  ```bash
  docker compose -f backend/docker-compose.yml up -d redis
  ```

### 2. Chuẩn Caching Layer (`backend/core/redis.py`)
- **Connection Pool & Fallback**:
  - Dùng `init_redis_pool()` và connection pool thread-safe / loop-aware.
  - Nếu Redis offline hoặc lỗi mạng, hệ thống **tự động fallback**, không ném exception làm sập API endpoints.
- **Quy tắc đặt Cache Key**:
  - Manga Detail: `manga:detail:{manga_id}` (TTL: 300s).
  - Reviews List: `reviews:manga:{manga_id}` (TTL: 180s).
  - OCR Task Status: `task:ocr:{job_id}` (TTL: 86400s).
- **Quy tắc vô hiệu hóa Cache (Cache Invalidation)**:
  - Khi cập nhật/xóa manga: gọi `delete_cache(f"manga:detail:{manga_id}")`.
  - Khi thêm/sửa/xóa review: gọi `delete_cache(f"reviews:manga:{manga_id}")`.

### 3. Background Task Queue (ARQ Worker)
- **Cấu hình Worker**: [`backend/tasks/worker.py`](file:///d:/Projects/Manga/Manga-Reviews-Management/backend/tasks/worker.py) với `WorkerSettings`.
- **Lệnh chạy Worker**:
  ```bash
  uv run --project backend arq backend.tasks.worker.WorkerSettings
  ```
- **Task OCR bất đồng bộ**:
  - Hàm task: `process_manga_panel_ocr(ctx, panel_id: int | str, image_path: str, language: str = 'en')`.
  - Tách biệt hoàn toàn xử lý nặng (RapidOCR, MangaOCRService cleaning, spaCy lemma extraction) ra khỏi vòng lặp HTTP Request.
- **Endpoints Quản lý Task**:
  - Tra cứu trạng thái task: `GET /tasks/{task_id}` hoặc `GET /api/tasks/{task_id}`.
  - Đẩy task OCR ngầm: `POST /tasks/ocr` (nhận `panel_id`, `image_path`, `language`).
  - Kích hoạt OCR ngầm cho panel có sẵn: `POST /api/panels/{panel_id}/ocr-async`.

