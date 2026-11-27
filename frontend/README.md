# Frontend Application (React 19 + TypeScript + Vite)

> **Documentation**: Refer to [`docs/ai-context.md`](../docs/ai-context.md) and [`docs/development.md`](../docs/development.md).

## Quick Overview

- **Core Framework**: React 19, TypeScript 6, Vite 8
- **UI & Styling**: Tailwind CSS v4, shadcn/ui (`radix-nova`), Lucide Icons
- **Analytics & Rich Editor**: Recharts + Perspective WASM (`@perspective-dev/*` in `/analytics?tab=olap-lab`), TipTap WYSIWYG with Gemini AI assistant
- **Path Alias**: `@/*` maps to `src/*`

## Common Commands

Run from the repository root:
```bash
# Start frontend dev server
pnpm --dir frontend dev

# Lint/format, typecheck, and build bundle
pnpm --dir frontend run check
pnpm --dir frontend run typecheck
pnpm --dir frontend run build

# Run Playwright E2E and axe-core accessibility audit
pnpm --dir frontend run test:e2e
pnpm --dir frontend test:a11y
```
