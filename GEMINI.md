# Project Guidelines & Code Knowledge Graph Rules

## Code Knowledge Graph & Self-Governance Directive

This repository uses **CodeGraph** (Tree-sitter AST & MCP Server) for code intelligence and impact analysis across FastAPI (Python) and React (TypeScript).

When pair programming or performing development tasks:
1. **Always consult Code Knowledge Graph / Dependency Tree first**: Before doing wide `grep` searches or guessing codebase flow, use `codegraph_explore` / `codegraph explore <symbol>` / `codegraph callers <symbol>` to inspect definitions, callers, and callees.
2. **Mandatory Impact Analysis before refactoring**: For any refactoring, function renaming, or interface/schema alteration, execute `codegraph impact <symbol>` to determine the blast radius across dependent routers, services, models, and tests before writing code.
3. **Controlled re-indexing**: Only run `codegraph index` on major architectural changes. For minor file changes, use incremental `codegraph sync`.

## AI Workflow & Precision Tooling Guidelines
- **AST Pattern Search (`ast-grep`)**: Prefer `ast-grep run -p '<pattern>'` over raw regex when inspecting function/class structures.
- **Auto Linting & Formatting**: Run `ruff check --fix` + `ruff format` on edited Python files, and `biome check --write` on edited TS/TSX files.
- **Context Packing (`repomix`)**: Use `repomix` when bundling modules for deep architectural analysis. Never commit context outputs (`repomix-output.*`) or linter caches.
