---
trigger: always_on
description: AI Workflow & Tooling Ecosystem rules (ast-grep, repomix, ruff, biome)
---

# AI Workflow & Tooling Ecosystem Governance

This repository is equipped with an advanced AI tooling ecosystem to ensure precision, eliminate context hallucinations, and maintain zero-defect code quality across Python and TypeScript.

All agent interactions must adhere to the following 3 principles:

### Nguyên tắc 1: Cấu trúc hóa việc tìm kiếm (AST-first Pattern Matching)
- **Ưu tiên dùng `ast-grep`** (`ast-grep run -p '<pattern>'`) để truy vết cấu trúc hàm, method call, JSX components, decorator hoặc class phức tạp thay vì dùng regex thô hoặc đoán mò cú pháp.
- Kết hợp với CodeGraph MCP (`codegraph_explore`, `codegraph impact`) để có cái nhìn toàn cảnh về call-tree và blast radius.

### Nguyên tắc 2: Tự động Lint & Format trước khi phản hồi
- Sau mỗi lần sinh code hoặc sửa đổi file, **bắt buộc tự động chạy linter/formatter** tương ứng lên các file vừa chỉnh sửa trước khi hoàn tất phản hồi cho user:
  - **Python (Backend)**: Chạy `ruff check --fix <file>` và `ruff format <file>`.
  - **TypeScript/React (Frontend)**: Chạy `biome check --write <file>`.
- Đảm bảo code mới luôn sạch import thừa, tuân thủ chuẩn style và không có lỗi cú pháp.

### Nguyên tắc 3: Bảo toàn Git & Không commit Context Snapshots
- Tuyệt đối không commit các file đóng gói context (`repomix-output.*`), cache linter (`.ruff_cache/`, `.biome/`, `.ast-grep-cache/`), hoặc database đồ thị vào git.
- Luôn kiểm tra `git status` trước khi thực hiện commit để giữ cho Git repository luôn sạch sẽ.
