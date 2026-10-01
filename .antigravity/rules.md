# Antigravity Autonomous Agent Rules & Skill Governance

## Core Directive: Mandatory Pre-Execution Skill Lookup
> **"Trước khi thực hiện bất kỳ yêu cầu code/refactor nào, hãy tự tra cứu xem yêu cầu đó thuộc Skill nào ở trên và tự động tuân thủ toàn bộ quy trình của Skill đó."**

---

## 1. Skill Taxonomy & Trigger Conditions

| Skill | Đường dẫn Quy Chuẩn | Khi Nào Kích Hoạt (Triggers) | Quy Định Bắt Buộc |
|---|---|---|---|
| **TDD Workflow & Self-Correction** | [`.antigravity/skills/tdd-workflow.md`](file:///d:/Projects/Manga/Manga-Reviews-Management/.antigravity/skills/tdd-workflow.md) | Thêm logic nghiệp vụ mới, sửa đổi thuật toán tính điểm, filter, pagination, review auth | Bắt buộc viết test trước (RED), viết code để PASS (GREEN), tự động sửa lỗi theo stack trace tối đa 3 lần. |
| **Architecture Guard** | [`.antigravity/skills/architecture-guard.md`](file:///d:/Projects/Manga/Manga-Reviews-Management/.antigravity/skills/architecture-guard.md) | Thêm/sửa Endpoint Router, Service hoặc Data Access | Cấm query DB hoặc xử lý tính toán trong Router/Controller. Bắt buộc validate đầu vào qua Pydantic DTO. |
| **Database Migration Safety** | [`.antigravity/skills/db-migration-safety.md`](file:///d:/Projects/Manga/Manga-Reviews-Management/.antigravity/skills/db-migration-safety.md) | Thêm field mới, đổi schema MongoDB, tối ưu query | Bắt buộc có script migration 2 chiều (Up/Down) và đánh index khóa ngoại (`manga_id`, `created_at`, `timestamp`). |
| **Code Knowledge Graph** | [`.agents/rules/code_knowledge_graph.md`](file:///d:/Projects/Manga/Manga-Reviews-Management/.agents/rules/code_knowledge_graph.md) | Khảo sát luồng gọi hàm, refactoring, đổi tên symbol | Tra cứu `codegraph_explore` / `codegraph impact` trước khi sửa code; không grep thô. |
| **Tooling Ecosystem** | [`.agents/rules/tooling_ecosystem.md`](file:///d:/Projects/Manga/Manga-Reviews-Management/.agents/rules/tooling_ecosystem.md) | Sau mỗi lần sinh code hoặc sửa đổi file | Chạy `ruff check --fix` + `ruff format` (Python), `biome check --write` (TS/TSX); không commit cache snapshot. |

---

## 2. Quy Trình Vận Hành Tự Hành Chuẩn (Standard Autonomous Execution Cycle)

Mỗi khi nhận yêu cầu phát triển hoặc refactor từ User:
1. **Phân loại tác vụ (Skill Mapping)**: Xác định yêu cầu chạm tới các Skill nào trong bảng trên.
2. **Impact Analysis**: Dùng `codegraph impact <symbol>` khoanh vùng blast radius.
3. **Áp dụng TDD**: Nếu có logic mới, tạo test trước và chạy test FAIL trước khi viết code.
4. **Kiểm soát ranh giới**: Viết logic vào Service, giữ Router mỏng và validate DTO nghiêm ngặt.
5. **Đảm bảo DB/Index**: Nếu có schema mới, cập nhật indexes và script migration.
6. **Tự động Lint & Format**: Chạy `ruff` cho Python và `biome` cho TypeScript trước khi báo cáo kết quả.
