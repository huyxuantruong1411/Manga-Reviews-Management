# Antigravity Agent Guidelines: Code Knowledge Graph Self-Governance

Dự án này tích hợp **Code Knowledge Graph (CodeGraph MCP & Tree-sitter AST Engine)** để phân tích kiến trúc, truy vết luồng gọi hàm (call graph) và đánh giá vùng ảnh hưởng (impact analysis) trên toàn bộ hệ thống (Python FastAPI Backend + TypeScript/React Frontend).

Mọi AI Agent trong Antigravity IDE khi làm việc trên repository này **bắt buộc** phải tuân thủ 3 nguyên tắc tự quản (Self-Governance Rules) sau:

---

### 1. Tra cứu Code Knowledge Graph Trước Tiên
- **Quy tắc**: Luôn tra cứu Code Knowledge Graph hoặc Dependency Tree trước khi thực hiện `grep_search` diện rộng hoặc phỏng đoán ngữ cảnh code.
- **Công cụ áp dụng**:
  - MCP Tool: `codegraph_explore` (hoặc CLI: `codegraph explore "<query>"`, `codegraph node "<symbol>"`, `codegraph files`).
  - Mục đích: Nắm chính xác vị trí định nghĩa, kiểu dữ liệu, các callers/callees và ngữ cảnh thực thi mà không làm loãng context window của mô hình với hàng chục lần đọc file thủ công.

### 2. Bắt buộc Phân tích Vùng Ảnh Hưởng (Impact Analysis) Khi Refactor
- **Quy tắc**: Đối với mọi yêu cầu Refactor, đổi tên hàm, thay đổi Interface/Schema Pydantic, hoặc chỉnh sửa chữ ký phương thức (method signature), **bắt buộc** phải dùng công cụ Graph để phân tích vùng ảnh hưởng (Impact Analysis / Blast Radius) đến tất cả các Service, Router, Controller, và Test suite liên quan **trước khi** tiến hành sửa bất kỳ dòng code nào.
- **Công cụ áp dụng**:
  - MCP Tool / CLI:
    ```bash
    codegraph impact <symbol>
    codegraph callers <symbol>
    codegraph callees <symbol>
    ```
  - Kiểm tra toàn bộ danh sách symbols bị tác động gián tiếp để lập kế hoạch cập nhật đồng bộ, ngăn ngừa lỗi runtime hoặc gãy API contract giữa Backend và Frontend.

### 3. Tối Ưu Tần Suất Indexing (Chỉ Re-index Khi Thay Đổi Lớn)
- **Quy tắc**: Chỉ thực hiện re-index toàn bộ (`codegraph index`) khi có thay đổi lớn về mặt cấu trúc kiến trúc (như tái cấu trúc thư mục, thêm module lớn, thay đổi build system).
- **Hạn chế**: Không chạy lại toàn bộ đồ thị với các sửa đổi nhỏ lẻ hoặc chỉnh sửa logic cục bộ trong một hàm/file. Khi cần cập nhật các file mới sửa, sử dụng tính năng đồng bộ AST vi sai:
  ```bash
  codegraph sync
  ```
  để tiết kiệm tài nguyên và giữ trạng thái đồ thị luôn nhất quán với mã nguồn.

---

### MCP Server Reference
- **Server Name**: `codegraph`
- **Transport**: Stdio (`codegraph serve --mcp`)
- **Primary Tool**: `codegraph_explore`
- **CLI Commands**:
  - `codegraph callers <symbol>`
  - `codegraph callees <symbol>`
  - `codegraph impact <symbol>`
  - `codegraph status`
  - `codegraph sync`

---

## AI Workflow & Precision Tooling Ecosystem

Bên cạnh CodeGraph, dự án tích hợp bộ công cụ siêu tốc phục vụ quá trình coding của Agent:

1. **`ast-grep` (AST-first Pattern Search)**:
   - Ưu tiên dùng `ast-grep run -p '<pattern>'` để tìm kiếm hàm, JSX tag, decorator hoặc class thay vì dùng regex thô.
2. **`repomix` (Context Packing & Token Optimization)**:
   - Đóng gói ngữ cảnh module lớn khi cần phân tích toàn diện: `repomix`. Output tự động cấu hình trong `repomix.config.json` và đã được chặn trong `.gitignore`.
3. **Linter & Formatter Tự Động (Tốc độ cao)**:
   - **Python/Backend**: Chạy `ruff check --fix <file>` và `ruff format <file>` sau mỗi lần sửa code Python.
   - **TypeScript/Frontend**: Chạy `biome check --write <file>` sau mỗi lần sửa code TS/TSX.
4. **Git Hygiene**:
   - Không commit các tệp context snapshot (`repomix-output.*`) hoặc thư mục cache (`.ruff_cache/`, `.biome/`, `.ast-grep-cache/`).
