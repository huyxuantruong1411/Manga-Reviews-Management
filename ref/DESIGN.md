# Design System Inspired by MangaDex

## 1. Visual Theme & Atmosphere

MangaDex embodies a vibrant, community-driven reading platform centered on manga and comics discovery. The design balances playful energy with professional accessibility, using warm orange accents against a clean, neutral canvas. The visual language feels approachable and modern, with generous whitespace supporting content hierarchy. Anime-inspired imagery is complemented by a calm, light interface that keeps focus on the rich manga artwork. The atmosphere is welcoming to both casual readers and dedicated fans, with deliberate use of color to guide attention to key actions and curated content collections.

**Key Characteristics**
- Warm accent colors (orange, coral) for call-to-action elements and editorial highlights
- Clean, minimal neutral palette anchoring the interface
- Generous spacing supporting scanability and visual breathing room
- Rounded, playful button treatments balancing approachability with professionalism
- Subtle shadows for depth without visual heaviness
- Vibrant secondary accent colors (purple, cyan, blue) for categorical distinction
- Manga artwork as primary visual anchor with supporting UI elements staying understated

## 2. Color Palette & Roles

### Primary
- **Brand Orange** (`#DA7500`): Primary call-to-action buttons, active navigation states, key editorial highlights
- **Coral** (`#FF6740`): Supporting accent for featured content and hover states

### Accent Colors
- **Purple** (`#C084FC`): Genre or tag distinction for supernatural/fantasy content
- **Cyan** (`#05AAF0`): Secondary accent for alternate content categories
- **Sky Blue** (`#1199FF`): Accent for complementary UI elements and interactive highlights

### Interactive
- **Amber** (`#FB923C`): Alternative action states and warning-adjacent interactions
- **Transparent Dark** (`#0009`): Overlay for modals and semi-transparent backgrounds

### Neutral Scale
- **Charcoal** (`#242424`): Primary text color for body content and headings
- **Dark Gray** (`#222222`): Alternative text for contrast-sensitive contexts
- **True Black** (`#000000`): Maximum contrast text and strong emphasis elements
- **Light Gray** (`#F0F1F2`): Secondary background tint for content sections
- **Border Gray** (`#E5E7EB`): Borders, dividers, and subtle section separation
- **Alternate Border** (`#E0E4E6`): Alternative border tone for specific contexts
- **White** (`#FFFFFF`): Primary background, card surfaces, and content areas

### Semantic / Status
- **Error Red** (`#EF4444`): Error states, validation failures, critical alerts
- **Warning Yellow** (`#FACC15`): Warning states, non-critical alerts, caution messaging

### Shadow Colors
- **Transparent Black** (`#0000`): Used frequently for overlay and shadow construction

## 3. Typography Rules

### Font Family
- **Primary:** Spartan (sans-serif)
- **Secondary:** Poppins (sans-serif)
- **Fallback stack:** `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif`

### Hierarchy

| Role | Font | Size | Weight | Line Height | Letter Spacing | Notes |
|------|------|------|--------|-------------|-----------------|-------|
| Display / H1 | Spartan | 32px | 700 | 40px | -0.02em | Page hero titles, large section headers |
| Heading / H2 | Spartan | 24px | 600 | 32px | 0em | Section headlines, content cards |
| Subheading / H3 | Poppins | 14px | 700 | 20px | 0em | Component headings, list titles |
| Heading Label / H6 | Poppins | 16px | 700 | 24px | 0em | Small section labels, tag headers |
| Body Text | Poppins | 12px | 600 | 16px | 0em | Main content, descriptions, card copy |
| Body Alt | Poppins | 16px | 500 | 24px | 0em | Secondary body, larger reading text |
| Link / Interactive | Poppins | 16px | 400 | 24px | 0em | Navigation links, interactive text |
| List Item | Poppins | 14px | 400 | 20px | 0em | Bulleted lists, enumerated items |
| Metadata | Poppins | 12px | 400 | 16px | 0em | Timestamps, author info, captions |

### Principles
- Typography establishes clear visual hierarchy through size and weight variation rather than color alone
- Poppins is the workhorse font for interface elements, maintaining consistency across interactive states
- Spartan headlines provide visual distinction and editorial emphasis for key content
- Line heights are generous to support readability on varied screen sizes
- Small text (12px) is reserved for secondary information; body text never drops below this threshold
- Font weights cluster at 400, 500, 600, and 700 to create distinct perceptual levels
- All interactive text maintains minimum 14px size for accessibility

## 4. Component Stylings

### Buttons

#### Primary Button
- **Background:** `#DA7500`
- **Text Color:** `#FFFFFF`
- **Font:** Poppins, 16px, weight 400
- **Padding:** `0px 12px`
- **Height:** `40px`
- **Border Radius:** `8px`
- **Border:** `0px solid transparent`
- **Box Shadow:** `none`
- **Line Height:** `24px`
- **Hover State:** Background brightens to `#EB8C1F`
- **Active State:** Background darkens to `#C56500`
- **Disabled State:** Background becomes `#D3D3D3`, text `#808080`

#### Secondary Button (Ghost)
- **Background:** `transparent`
- **Text Color:** `#242424`
- **Font:** Poppins, 16px, weight 400
- **Padding:** `4px 0px`
- **Height:** `40px`
- **Border Radius:** `9999px`
- **Border:** `0px solid transparent`
- **Box Shadow:** `none`
- **Line Height:** `24px`
- **Hover State:** Background becomes `#F0F1F2`
- **Active State:** Text color darkens to `#000000`

#### Icon Button (Light)
- **Background:** `#F0F1F2`
- **Text Color:** `#242424`
- **Font:** Poppins, 16px, weight 400
- **Padding:** `0px`
- **Height:** `40px`
- **Width:** `40px`
- **Border Radius:** `9999px`
- **Border:** `0px solid transparent`
- **Box Shadow:** `none`
- **Hover State:** Background becomes `#E5E7EB`
- **Active State:** Background becomes `#D3D3D3`

#### Icon Button (Ghost)
- **Background:** `transparent`
- **Text Color:** `#242424`
- **Font:** Poppins, 16px, weight 400
- **Padding:** `4px 0px`
- **Height:** `40px`
- **Width:** `40px`
- **Border Radius:** `9999px`
- **Border:** `0px solid transparent`
- **Box Shadow:** `none`
- **Hover State:** Background becomes `rgba(229, 231, 235, 0.5)`

### Cards & Containers

#### Content Card
- **Background:** `#FFFFFF`
- **Text Color:** `#242424`
- **Font:** Poppins, 16px, weight 400
- **Padding:** `0px`
- **Height:** `80px`
- **Width:** `532px`
- **Border Radius:** `0px`
- **Border:** `0px solid transparent`
- **Box Shadow:** `rgba(0, 0, 0, 0.1) 0px 1px 3px 0px, rgba(0, 0, 0, 0.1) 0px 1px 2px -1px`
- **Line Height:** `24px`
- **Hover State:** Box shadow increases to `rgba(0, 0, 0, 0.1) 0px 10px 15px -3px`
- **Margin Bottom:** `16px`

#### Featured Section Card
- **Background:** `#F0F1F2`
- **Text Color:** `#242424`
- **Font:** Poppins, 16px, weight 400
- **Padding:** `24px`
- **Border Radius:** `0px`
- **Border:** `1px solid #E5E7EB`
- **Box Shadow:** `none`

#### Overlay Container (Dark)
- **Background:** `rgba(0, 0, 0, 0.6)`
- **Border Radius:** `0px`
- **Backdrop Filter:** `blur(4px)` (optional)

### Inputs & Forms

#### Text Input
- **Background:** `#FFFFFF`
- **Text Color:** `#242424`
- **Font:** Poppins, 16px, weight 400
- **Padding:** `0px 12px`
- **Height:** `40px`
- **Width:** `250px`
- **Border Radius:** `0px`
- **Border:** `1px solid #C1C1C1`
- **Box Shadow:** `none`
- **Line Height:** `24px`
- **Focus State:** Border color becomes `#DA7500`, box shadow `0px 0px 0px 3px rgba(218, 117, 0, 0.1)`
- **Error State:** Border becomes `#EF4444`
- **Placeholder Color:** `#999999`

#### Search Input (Large)
- **Background:** `#FFFFFF`
- **Text Color:** `#242424`
- **Font:** Poppins, 16px, weight 400
- **Padding:** `12px 16px`
- **Height:** `44px`
- **Border Radius:** `4px`
- **Border:** `1px solid #E5E7EB`
- **Box Shadow:** `rgba(0, 0, 0, 0.05) 0px 1px 2px 0px`

### Navigation

#### Primary Navigation Item
- **Background:** `transparent`
- **Text Color:** `#242424`
- **Font:** Poppins, 14px, weight 400
- **Padding:** `8px 16px`
- **Height:** `auto`
- **Border Radius:** `4px`
- **Border:** `0px solid transparent`
- **Active State:** Background `#DA7500`, text color `#FFFFFF`
- **Hover State:** Background `#F0F1F2`

#### Sidebar Navigation
- **Background:** `#FFFFFF`
- **Border Right:** `1px solid #E5E7EB`
- **Padding:** `16px 0px`

#### Navigation Badge (New)
- **Background:** `#FF6740`
- **Text Color:** `#FFFFFF`
- **Font:** Poppins, 12px, weight 700
- **Padding:** `2px 8px`
- **Border Radius:** `4px`
- **Font Size:** `10px`

### Badges & Tags

#### Genre Badge
- **Background:** `#C084FC` (purple for supernatural), `#05AAF0` (cyan for alt), `#1199FF` (blue for secondary)
- **Text Color:** `#FFFFFF`
- **Font:** Poppins, 12px, weight 600
- **Padding:** `4px 8px`
- **Border Radius:** `4px`
- **Height:** `auto`
- **Display:** `inline-block`

#### Status Tag
- **Background:** `#FACC15` (warning), `#EF4444` (error)
- **Text Color:** `#000000` (for yellow), `#FFFFFF` (for red)
- **Font:** Poppins, 12px, weight 600
- **Padding:** `2px 6px`
- **Border Radius:** `2px`

## 5. Layout Principles

### Spacing System
- **Base Unit:** `8px`
- **Scale:** `4px` (micro), `8px` (xs), `12px` (sm), `16px` (md), `24px` (lg), `32px` (xl), `48px` (2xl), `64px` (3xl), `96px` (4xl), `144px` (5xl)
- **Usage Contexts:**
  - `4px`: Icon spacing, tight component gaps
  - `8px`: Button padding, form field spacing
  - `16px`: Section margins, navigation item padding
  - `24px`: Card padding, content container padding
  - `32px`: Major section spacing
  - `96px-144px`: Hero/banner vertical rhythm

### Grid & Container
- **Max Width:** `1440px` (primary content area)
- **Sidebar Width:** `240px` (navigation sidebar)
- **Main Content Width:** `1200px` (adjusts with sidebar visibility)
- **Column Strategy:** 12-column flexible grid
- **Gutter Width:** `16px` between columns
- **Section Padding:** `32px` horizontal (desktop), `16px` (tablet), `12px` (mobile)

### Whitespace Philosophy
MangaDex prioritizes breathing room between content sections. Large vertical gaps (32px–96px) separate distinct content zones, allowing visual hierarchy to emerge naturally. Horizontal padding scales with viewport, ensuring text never feels cramped. Card-based layouts use consistent 16px gaps to create rhythm without visual monotony. Whitespace around featured content (hero images, title cards) extends to 96px to create prominence.

### Border Radius Scale
- **0px:** Cards, input fields, large containers (clean, modern aesthetic)
- **2px:** Small badges, minimal accent badges
- **4px:** Search inputs, medium containers, subtle rounding
- **8px:** Primary buttons, action containers
- **9999px:** Icon buttons, fully rounded elements, circular avatars

## 6. Depth & Elevation

| Level | Treatment | Use |
|-------|-----------|-----|
| **Flat (None)** | `box-shadow: none` | Backgrounds, borders, typography |
| **Subtle (sm)** | `rgba(0, 0, 0, 0.1) 0px 1px 3px 0px, rgba(0, 0, 0, 0.1) 0px 1px 2px -1px` | Cards, subtle containment |
| **Base (md)** | `rgba(0, 0, 0, 0.1) 0px 10px 15px -3px, rgba(0, 0, 0, 0.1) 0px 4px 6px -4px` | Hovered cards, floating elements |
| **Elevated (lg)** | `rgba(0, 0, 0, 0.1) 0px 4px 6px -1px, rgba(0, 0, 0, 0.1) 0px 2px 4px -2px` | Modals, popups, toasts |

**Shadow Philosophy:**
MangaDex uses restrained shadows to create subtle depth without visual noise. Shadows are minimal on initial render (subtle level) and increase on interaction (hover, focus) to provide responsive feedback. Overlays use semi-transparent black (`rgba(0, 0, 0, 0.6)`) rather than drop shadows to maintain UI clarity. This approach keeps the interface clean while layering information hierarchically.

## 7. Do's and Don'ts

### Do
- Use **warm orange** (`#DA7500`) for primary actions and calls-to-action
- Apply **generous spacing** (32px minimum) between major content sections
- Employ **rounded buttons** (`9999px` radius) for accessibility and visual warmth
- Maintain **consistent text color** (`#242424`) for body content across light backgrounds
- Use **Poppins font** consistently for all interface text below headings
- Apply **subtle shadows** only on interactive elements and hover states to signal interactivity
- Group **related navigation items** visually with consistent padding and hover states
- Display **genre tags** with distinct accent colors to aid content discovery
- Scale **padding proportionally** across breakpoints (32px desktop → 16px mobile)
- Reserve **16px minimum line height** for all body text to ensure readability

### Don't
- Mix **multiple accent colors** in a single call-to-action; reserve orange for primary actions
- Use **shadows on text** or typography elements; let color and weight define hierarchy
- Place **content without padding** against container edges; maintain 16px minimum gutters
- Apply **letter spacing** to body text; reserve tight tracking for headlines only
- Use **colors below 16px** size without sufficient contrast; test against WCAG AA
- Stack **more than two font sizes** within a single component; simplify visual hierarchy
- Exceed **1440px width** on desktop to maintain comfortable reading line lengths
- Apply **full-width layouts** on mobile below 768px; maintain readable column widths
- Mix **rounded and sharp borders** in the same interface zone; maintain visual consistency
- Use **0px letter spacing** on long-form content; add subtle tracking for legibility

## 8. Responsive Behavior

### Breakpoints

| Name | Width | Key Changes |
|------|-------|-------------|
| **Mobile (xs)** | 320px–479px | Single-column layout, full-width cards, 12px padding, stacked navigation |
| **Mobile (sm)** | 480px–639px | Single-column optimized, 14px body text, simplified header |
| **Tablet (md)** | 640px–1023px | Two-column layout, sidebar collapses to icon menu, 16px padding |
| **Tablet (lg)** | 1024px–1279px | Three-column optional, sidebar restored, 24px padding |
| **Desktop (xl)** | 1280px–1535px | Full layout, 240px sidebar, 32px padding, centered max-width 1440px |
| **Desktop (2xl)** | 1536px+ | Same as xl; content centers with max-width constraints |

### Touch Targets
- **Minimum interactive size:** `40px × 40px` (buttons, icon buttons)
- **Recommended touch target:** `44px × 44px` (mobile navigation, form inputs)
- **Spacing between targets:** `8px` minimum to prevent accidental activation
- **Text links:** Wrap in `44px` vertical padding minimum; increase font size to `14px+` on mobile
- **Form inputs:** Maintain `40px` height minimum; increase to `44px` on touch devices

### Collapsing Strategy
- **Sidebar:** Collapses to icon-only state at 1024px; fully hides below 768px with hamburger menu
- **Navigation:** Horizontal top nav on desktop; converts to tab-based or drawer navigation on mobile
- **Cards:** Full-width single column on mobile (< 768px); two-column grid at 768px–1200px; three-column at 1200px+
- **Typography:** Reduce h2 from `24px` to `20px` on mobile; h3 maintains `14px`; body text stays `12px` minimum
- **Padding:** Halve gutter values below 768px (32px → 16px, 24px → 12px)
- **Images:** Scale to 100% viewport width on mobile; constrain to 80% on tablet; fixed width on desktop
- **Modals:** Full-screen overlay on mobile (< 640px); centered modal (600px) on desktop

## 9. Agent Prompt Guide

### Quick Color Reference
- **Primary CTA:** Brand Orange (`#DA7500`)
- **Secondary CTA:** Coral (`#FF6740`)
- **Background (Primary):** White (`#FFFFFF`)
- **Background (Secondary):** Light Gray (`#F0F1F2`)
- **Heading Text:** Charcoal (`#242424`)
- **Body Text:** Charcoal (`#242424`)
- **Borders/Dividers:** Border Gray (`#E5E7EB`)
- **Error State:** Error Red (`#EF4444`)
- **Warning State:** Warning Yellow (`#FACC15`)
- **Interactive Overlay:** Transparent Black (`#0009`)
- **Genre Tags:** Purple (`#C084FC`), Cyan (`#05AAF0`), Sky Blue (`#1199FF`)

### Iteration Guide

1. **All buttons** should use `#DA7500` (Brand Orange) for primary actions; reserve secondary buttons for ghost style with transparent background and `#242424` text.

2. **Typography hierarchy** relies on Poppins for interface text and Spartan for editorial headlines; never drop body text below `12px` or use font weight lighter than 400.

3. **Spacing consistency:** Maintain `8px` base unit throughout; section gaps range `16px` (tight) to `96px` (hero prominence); card padding defaults to `24px`.

4. **Shadow application:** Apply subtle shadows (`0px 1px 3px`) only to cards and hover states; never shadow text; increase to medium shadows on interaction (hover, focus).

5. **Color usage:** Charcoal (`#242424`) is the workhorse text color; use pure black (`#000000`) only for maximum contrast; reserve accent colors for tags, badges, and CTAs.

6. **Border radius:** Cards and containers use `0px`; buttons use `8px` (primary) or `9999px` (icon); badges use `2px` (compact) or `4px` (standard).

7. **Responsive adaptation:** Reduce padding by 50% below 768px; stack two-column layouts to single column; collapse sidebar to icon menu; maintain minimum `44px` touch targets.

8. **Focus states:** Add `0px 0px 0px 3px rgba(218, 117, 0, 0.1)` ring around interactive elements on focus; use `:focus-visible` for keyboard navigation visibility.

9. **Form validation:** Error states use `#EF4444` border; warning states use `#FACC15` background; always pair color changes with icon or text label for accessibility.