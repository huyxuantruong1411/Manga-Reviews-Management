---
name: tdd-workflow
description: Enforce Test-Driven Development (Red-Green-Refactor) and autonomous self-correction loop for business logic, scoring, and filters.
---

# TDD Workflow & Self-Correction

See full documentation at [.antigravity/skills/tdd-workflow.md](file:///d:/Projects/Manga/Manga-Reviews-Management/.antigravity/skills/tdd-workflow.md).

## Core Rules:
1. **Red**: Write unit/integration test first (`backend/tests/` or `frontend/src/tests/`). Confirm test FAILS.
2. **Green**: Implement minimal business logic in Service Layer to make test PASS.
3. **Refactor**: Auto format and lint code (`ruff` / `biome`).
4. **Self-Correction**: On failure, inspect stack trace and retry refactor up to 3 times before consulting user.
