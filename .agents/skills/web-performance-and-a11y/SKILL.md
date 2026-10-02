---
name: web-performance-and-a11y
description: Web performance, Core Web Vitals optimization, accessibility (WCAG AA), and Playwright visual testing for manga reading and reviews.
---

# Web Performance & Accessibility (A11y) Directive

See full documentation at [.antigravity/skills/web-performance-and-a11y.md](file:///d:/Projects/Manga/Manga-Reviews-Management/.antigravity/skills/web-performance-and-a11y.md).

## Core Rules:
1. **Core Web Vitals & Image Optimization**:
   - Hero cover or current reader page must use `fetchpriority="high"` and `decoding="async"` (never lazy loaded).
   - Off-screen manga panels and grid cards must use `loading="lazy"` and `decoding="async"`.
   - Always reserve dimensions using CSS `aspect-ratio` or dimension wrappers to prevent Cumulative Layout Shift (CLS). Use Skeleton placeholders (`@/components/ui/skeleton`).
2. **Accessibility (WCAG 2.1 AA Compliance)**:
   - Minimum 4.5:1 text contrast for standard text, 3:1 for badges. OCR text overlays must use high-contrast protective pills (e.g. `bg-black/80 backdrop-blur-sm`).
   - Every rating button and interactive element must be keyboard navigable (`role="button"`, `tabIndex={0}`, `onKeyDown` supporting Enter/Space, and visible `focus-visible:ring-2`).
3. **React Re-Render Prevention**:
   - Wrap list child cards (`ReviewCard`, `PanelCard`, `VocabBadge`) in `React.memo`.
   - Wrap event handlers passed to lists in `useCallback` and memoize heavy string tokenization/calculations with `useMemo`.
4. **Autonomous Playwright QA Verification**:
   - Run `pnpm --dir frontend test:e2e` in headless mode to verify that changes do not break layout on Mobile (375px) or Desktop (1440px).
