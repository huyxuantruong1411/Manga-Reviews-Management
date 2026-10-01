# Frontend Application (React 19 + TypeScript + Vite)

> **Documentation**: Refer to [`docs/ai-context.md`](../docs/ai-context.md) and [`docs/development.md`](../docs/development.md).

## Quick Overview

- **Core Framework**: React 19, TypeScript, Vite
- **UI & Styling**: Tailwind CSS v4, shadcn/ui (`radix-nova`), Lucide Icons
- **Rich Editor**: TipTap WYSIWYG with slash commands, image resizing, and AI assistant
- **Path Alias**: `@/*` maps to `src/*`

## Common Commands

Run from the repository root:
```bash
# Start frontend dev server
pnpm --dir frontend dev

# Typecheck and build bundle
pnpm --dir frontend tsc -b
pnpm --dir frontend build

# Run accessibility audit (axe-core)
pnpm --dir frontend test:a11y

# Capture responsive visual screenshots (Playwright)
python scripts/visual_responsive_check.py --routes / manga/1 panel-words-detector
```
