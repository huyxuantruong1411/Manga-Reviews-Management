---
name: ui-ux-design
description: Design system enforcement, shadcn/ui components, mobile-first responsive layout, and Manga/OCR UX rules.
---

# UI/UX Design & Frontend Engineering

See full documentation at [.antigravity/skills/ui-ux-design.md](file:///d:/Projects/Manga/Manga-Reviews-Management/.antigravity/skills/ui-ux-design.md).

## Core Rules:
1. **Design System First**: Reuse `@/components/ui/` components (`button`, `card`, `badge`, `dialog`, `skeleton`, `tooltip`). Use shadcn CLI (`pnpm dlx shadcn@latest add <component> -y`) before creating new UI primitives. No hardcoded inline styles or arbitrary hex colors.
2. **Manga Reader & OCR Specific UX**: All manga images and panels must have skeleton loading and dead-link fallback error handling. High-contrast OCR text with quick-lookup tooltips and clear visual separation between original text and translations.
3. **State Completeness**: Every view/page must implement all 4 states: Loading, Normal, Empty (with helpful CTA), and Error (with Retry action).
4. **Mobile-First Responsive**: Flawless scaling from 375px mobile viewport to 1920px wide desktop.
5. **Auditing & QA**: Run visual responsive check (`pnpm test:visual`), accessibility audit (`pnpm test:a11y`), and `biome check --write`.
