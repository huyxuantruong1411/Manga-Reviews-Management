# Coding Agent Guidelines & Repository Governance

> **Audience**: AI Coding Agents (Cursor, Claude, Copilot, Gemini, Aider) & Human Contributors.  
> **Orientation**: Read [`docs/ai-context.md`](docs/ai-context.md) before writing code.

---

## 1. Principles & Source of Truth

1. **Code & Tests Overrule Docs**: When code behavior conflicts with written documentation, code is ground truth. Document the discrepancy before changing code.
2. **Deterministic Context**: Do not guess file structures or perform recursive whole-repo scans. Consult [`docs/code-map.md`](docs/code-map.md) to locate exact files for your task.
3. **No Phantom Refactoring**: Do not refactor unrelated working modules, reformat entire directories, or invent missing abstraction layers unless explicitly instructed.

---

## 2. Core Architectural & Coding Directives

### A. Architecture Guard
- **Routers**: Validate inputs with strict Pydantic v2 schemas (`BaseModel` + `Field`), handle HTTP status codes, and delegate business logic to Domain Services.
- **Services**: Pure business logic, external API orchestration, and MongoDB persistence.
- *Notice*: While legacy code contains direct DB access in a few routers (e.g., [`backend/routers/reviews.py`](backend/routers/reviews.py)), all **new** logic must reside in Services.
- Full details: [`.antigravity/skills/architecture-guard.md`](.antigravity/skills/architecture-guard.md).

### B. Test-Driven Development (TDD)
- When implementing business logic, calculations, scoring, or filters, write failing tests first in [`backend/tests/`](backend/tests/).
- Self-correction loop: Read stack trace and fix incrementally up to 3 attempts.
- Full details: [`.antigravity/skills/tdd-workflow.md`](.antigravity/skills/tdd-workflow.md).

### C. Database Evolution & Indexing
- Every MongoDB schema modification must have corresponding indexes declared in [`backend/database/indexes.py`](backend/database/indexes.py).
- Mandatory index targets: foreign keys (`manga_id`, `chapter_id`), search/sort fields (`created_at`, `timestamp`, `read_status`).
- Full details: [`.antigravity/skills/db-migration-safety.md`](.antigravity/skills/db-migration-safety.md).

### D. Frontend & UI/UX Design System
- **Design System First**: Reuse components in [`frontend/src/components/ui/`](frontend/src/components/ui/) (`button`, `card`, `badge`, `dialog`, `skeleton`, `tooltip`). Add new primitives via `pnpm dlx shadcn@latest add <name> -y`.
- **No Hard-coded Styles**: Never use inline `style={{ ... }}` or raw arbitrary hex codes. Use semantic Tailwind utility classes and theme tokens (`bg-background`, `text-foreground`, `brand-orange`, `brand-coral`).
- **Manga & OCR UX**: All manga images must have Skeleton shimmer loading and Fallback error image handling. OCR text must maintain high WCAG contrast with quick-lookup tooltips.
- **State Completeness**: Every view/card must handle all 4 states: `Loading`, `Normal`, `Empty Data` (with helpful CTA), and `Error` (with Retry action).
- **Mobile-First**: Responsive down to 375px mobile viewport.
- Full details: [`.antigravity/skills/ui-ux-design.md`](.antigravity/skills/ui-ux-design.md).

---

## 3. Tooling Ecosystem & Verification

After editing files, run appropriate formatters and linters:
- **Backend (Python)**:
  ```bash
  uv run --project backend ruff check --fix <modified_files>
  uv run --project backend ruff format <modified_files>
  ```
- **Frontend (TypeScript / React)**:
  ```bash
  npx @biomejs/biome check --write <modified_files>
  ```
- **Verification Tests**:
  - Backend unit tests: `uv run --project backend python -m unittest backend/tests/<test_file>.py`
  - Frontend typecheck & build: `pnpm --dir frontend tsc -b` and `pnpm --dir frontend build`
  - Responsive visual check: `python scripts/visual_responsive_check.py --routes /`

---

## 4. Public Repository Safety & Security Boundaries

- **NEVER Stage or Commit**: Real `.env` files, production credentials, personal API keys (Gemini, MangaDex client secrets), real user review database dumps, local snapshot refs, or copyright raw comic files.
- **Public Placeholders Only**: Keep all examples restricted to safe placeholders (e.g. [`backend/.env.example`](backend/.env.example)).
- Always verify `git status` and staged diffs before completing any task.
