# Web Performance & Accessibility (A11y) Engineering Directive

> **Source Inspiration**: Curated from `addyosmani/agent-skills` (Web Performance, Core Web Vitals & Accessibility Standards) tailored for Manga Reader & Reviews Platform.  
> **Audience**: AI Coding Agents & Frontend Engineers.  
> **Target Environment**: React 19, TypeScript, Tailwind CSS, Vite.

---

## 1. Core Web Vitals (CWV) for Manga Reader & Media Applications

Manga applications deal with high-density image grids, large vertical scrolling canvases, and dynamic OCR overlays. The following rules are mandatory:

### A. Image Loading Strategy (LCP & Memory Efficiency)
1. **Hero / Active Cover Art**:
   - The first visible manga cover or currently viewed reader page must NEVER be lazy loaded.
   - Mark hero image with `fetchpriority="high"` and `decoding="async"`.
2. **Off-screen Panels & Secondary Pages**:
   - Off-screen images (e.g., subsequent pages in a chapter or grid items below fold) must use:
     ```tsx
     <img
       src={cropUrl}
       alt={`Khung tranh #${panel.panel_index + 1}`}
       loading="lazy"
       decoding="async"
       className="w-full h-auto object-contain"
     />
     ```
3. **Cumulative Layout Shift (CLS) Prevention**:
   - Always reserve space for image containers using CSS `aspect-ratio` or explicit width/height wrappers.
   - Use Skeleton placeholders (`components/ui/skeleton`) matching the anticipated aspect ratio while the image stream resolves:
     ```tsx
     <div className="relative aspect-[3/4] w-full overflow-hidden rounded-xl bg-muted/40">
       {!isLoaded && <Skeleton className="absolute inset-0 animate-pulse" />}
       <img ... onLoad={() => setIsLoaded(true)} />
     </div>
     ```
4. **Rendering Optimization**:
   - For long lists (panel lists, manga grids), apply `content-visibility: auto` with `contain-intrinsic-size` to allow the browser to skip layout and paint for off-screen cards until scrolled into view.

---

## 2. Web Accessibility (WCAG 2.1 AA Compliance)

### A. OCR Vocabulary & Badge Contrast (Text Legibility)
Manga comic art varies from pure white speech bubbles to deep black shadows. Dynamic text overlays must never blend into background art:
1. **Contrast Ratio**:
   - Minimum **4.5:1** contrast ratio for normal text and **3.0:1** for large text / UI badges against background.
2. **Backdrop Protection**:
   - Always wrap OCR bounding box labels, word popovers, and lemma badges in high-contrast protective pills:
     ```tsx
     <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-black/80 backdrop-blur-sm text-emerald-300 border border-emerald-500/30 text-xs font-semibold">
       {token.term}
     </span>
     ```
3. **Theme Tokens**:
   - Rely on semantic tokens (`text-foreground`, `text-muted-foreground`, `bg-card`, `bg-background`) instead of hardcoded hex codes.

### B. Keyboard Navigability & Interactive Elements
Every action possible with a mouse or touch must be equally executable via keyboard alone:
1. **Interactive Controls**:
   - Every rating button, filter pill, modal trigger, and reader action must be reachable via `Tab` / `Shift+Tab`.
   - Never attach `onClick` to a non-interactive element (`div`, `span`) without adding `role="button"`, `tabIndex={0}`, and an `onKeyDown` handler:
     ```tsx
     <div
       role="button"
       tabIndex={0}
       aria-label={`Chọn đánh giá ${star} sao`}
       onClick={() => onRate(star)}
       onKeyDown={(e) => {
         if (e.key === "Enter" || e.key === " ") {
           e.preventDefault();
           onRate(star);
         }
       }}
       className="focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
     >
       ...
     </div>
     ```
2. **Visible Focus Rings**:
   - Every interactive element must display distinct focus styles using Tailwind:
     `focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none focus-visible:ring-offset-2 focus-visible:ring-offset-background`.
3. **Screen Readers & ARIA Labels**:
   - Icon-only buttons must have an `aria-label` or visually hidden text:
     `<button aria-label="Đóng cửa sổ"><X className="w-4 h-4" /></button>`.
   - Loading skeletons and spinners must indicate status: `role="status"` and `aria-label="Đang tải dữ liệu"`.

---

## 3. React Performance: Preventing Redundant Re-Renders

Review lists, chapter reader thumbnails, and OCR vocabulary clusters often contain hundreds of DOM nodes. Redundant renders degrade INP (Interaction to Next Paint):

### A. Component Memoization
1. **Child Card Memoization**:
   - Wrap leaf components that receive stable object props with `React.memo`:
     ```tsx
     export const ReviewCard = React.memo(({ review, onVote, onEdit }: ReviewCardProps) => { ... });
     ```
2. **Callback Stabilization**:
   - Functions passed as props to list items MUST be wrapped in `useCallback` with exact dependency arrays:
     ```tsx
     const handleWordClick = useCallback((word: string, e: React.MouseEvent) => {
       setSelectedWord(word);
       setAnchorEl(e.currentTarget);
     }, []);
     ```

### B. Memoize Heavy Computations
1. Tokenizing dense OCR sentences, sorting review sentiment scores, or calculating bounding box intersections must be memoized with `useMemo`:
   ```tsx
   const processedTokens = useMemo(() => {
     return tokenizeAndClassify(rawText, activeQuery);
   }, [rawText, activeQuery]);
   ```

### C. State Colocation
1. Keep transient local UI state (popover open state, hover state, image zoom scale) inside the component that uses it, rather than lifting it to the parent list page.
2. For long lists exceeding 50 items (e.g. Manga Reviews, Scanned Panels), utilize pagination or windowed virtualization (`@tanstack/react-virtual`).

---

## 4. Autonomous Agent Verification Protocol

Before declaring any frontend or UI/UX task completed, the agent must execute:
1. **Type & Build Check**:
   ```bash
   pnpm --dir frontend tsc -b
   ```
2. **Biome Linter / Formatter**:
   ```bash
   npx @biomejs/biome check --write <modified_files>
   ```
3. **Accessibility Audit**:
   ```bash
   pnpm --dir frontend test:a11y
   ```
4. **Playwright Visual & Layout Regression Verification**:
   ```bash
   pnpm --dir frontend test:e2e
   ```
   Confirm that all viewport tests (Mobile 375px & Desktop 1440px) pass with zero horizontal layout breaks.
