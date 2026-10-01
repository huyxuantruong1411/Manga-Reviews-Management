---
trigger: always_on
description: Mandatory skill lookup and autonomous workflow directive before code and refactor operations
---

# Agent Skills & Autonomous Workflows Governance

## Core Directive
Trước khi thực hiện bất kỳ yêu cầu code/refactor nào, Agent **BẮT BUỘC** phải tự tra cứu xem yêu cầu đó thuộc Skill nào dưới đây và tự động tuân thủ toàn bộ quy trình của Skill đó:

1. **`tdd-workflow`**:
   - Viết test trước (`backend/tests/` hoặc `frontend/src/tests/`).
   - Chạy test FAIL trước khi viết code nghiệp vụ để PASS.
   - Cơ chế tự sửa: Nếu test fail, đọc stack trace và tự refactor tối đa 3 lần trước khi hỏi lại User.
2. **`architecture-guard`**:
   - Nghiêm cấm đặt logic truy vấn database hoặc logic tính toán nặng bên trong Controller/Router.
   - Bắt buộc validate đầu vào qua Pydantic v2 DTOs.
   - Giữ Router mỏng, ủy quyền toàn bộ business logic cho Service.
3. **`db-migration-safety`**:
   - Mọi thay đổi schema MongoDB phải đi kèm file migration rõ ràng (Up/Down).
   - Bắt buộc đánh index trên các khóa ngoại (`manga_id`, `chapter_id`, `user_id`) và các trường tìm kiếm/sắp xếp (`created_at`, `timestamp`, `read_status`).
4. **`code-knowledge-graph`**:
   - Luôn dùng `codegraph impact <symbol>` / `codegraph_explore` phân tích blast radius trước khi sửa đổi.
5. **`tooling-ecosystem`**:
   - Tự động chạy `ruff check --fix` + `ruff format` (Python) và `biome check --write` (TS/TSX) sau mỗi lần sửa file.
6. **`ui-ux-design`**:
   - Khi nhận bất kỳ yêu cầu nào liên quan đến phát triển Frontend, Component, Page, hoặc sửa đổi Layout/UX, agent **BẮT BUỘC** phải đọc và tuân thủ `.antigravity/skills/ui-ux-design.md`, ưu tiên dùng shadcn CLI để lấy component trước khi tự viết mới.
