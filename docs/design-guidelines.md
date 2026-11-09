# Intent Digital Design Guidelines

> **Golden Rule**: Before any UI work, read this document and use `src/components/ui`.

This document locks in the visual aesthetic across every screen of the Intent Digital Owner Portal and public studio. Every interface must strictly follow the brand's authentic palette, typography, and patterns — referencing the public homepage and "Curated offerings" section.

---

## 1. Brand Palette & Design Tokens (`src/styles/tokens.css`)

> **Brand Note**: The brand has **NO orange or terracotta**. Only use the real site palette and patterns.

### Color Tokens

| Token | Hex Value | Role & Usage |
| :--- | :--- | :--- |
| `--espresso` | `#1E1509` | Terrane Dark Brown — Primary text, deep dark bands, headers, footers |
| `--burgundy` | `#41101B` | Cherry / Burgundy — Primary buttons, selected states, featured-card border |
| `--cream` | `#FAF8F5` | Toasted Cream — Page background & active tab background |
| `--beige` | `#F2EFEA` | Warm Oat / Soft Beige — Alternating section background (under wave), segmented controls |
| `--sand` | `#F7F3EE` | Stat tiles, secondary analytical containers |
| `--white` | `#FFFFFF` | Card surfaces, form fields |
| `--border` | `rgba(30, 21, 9, 0.12)` | Card borders, dividers, subtle boundaries |
| `--border-strong` | `rgba(30, 21, 9, 0.24)` | Outline pill borders, active form field borders |
| `--text-2` | `#4A413A` | Secondary body text |
| `--muted` | `#52453C` | Eyebrow labels, timestamps, metadata |
| `--on-dark` | `#FAF8F5` | Cream high-contrast text on dark espresso bands |
| `--on-dark-muted` | `#E6DFD7` | Secondary descriptions on espresso bands |
| `--eyebrow-on-dark` | `#E6DFD7` | Eyebrow tags and pills on espresso bands |
| `--positive` / `--positive-bg` | `#3F5A3A` / `#EEF2EA` | Owned properties, completed projects, Zone X flood |
| `--warning` / `--warning-bg` | `#7A5212` / `#F7EEDC` | In Progress, Analyzing, Shaded flood zone |
| `--negative` / `--negative-bg` | `#8A2A1E` / `#F5E6E3` | Passed, high-risk SFHA flood, deletion states |
| `--info` / `--info-bg` | `#274D73` / `#EBF1F7` | In Design, Watching, informational tags |

### Typography

- **Headings & Editorial Titles**: Serif (`--font-display` / Atelier Fleur / Cormorant Garamond / Playfair Display).
  - Display Hero: `clamp(60px, 6vw, 76px)`
  - H1: `clamp(36px, 4.5vw, 56px)`
  - H2: `32px`
  - H3: `24px`–`26px`
  - Stat Values: `32px` serif
- **Two-Line Headlines**: Second line uses *italic serif* in the **SAME cream color** as the first line (e.g. *"Design the space. Own the budget."*). Never use a contrasting accent color on headlines.
- **Numbered Steps & Lists**: Italic serif numerals (01, 02, 03) in `'Dreams on Paper'` / Atelier Fleur (`Numeral` component).
- **Handwritten Script Accent**: `'Dreams on Paper', cursive` (`--font-script`). Used **sparingly** for subtle stamps and annotations (e.g., small *"Current project"*, *"Featured"*, *"In progress"* stamp). **NEVER for body text**.
- **Everything Else**: Clean Sans-Serif (`--font-body` / Montserrat).
  - Body Paragraphs: `14px`–`16px` (regular, line-height 1.6)
  - Eyebrows & Labels: `11px`–`12px` uppercase with tracking `0.12em`–`0.22em`

### Shapes, Shadows & Depth

- **Border Radius**:
  - `999px` (`--radius-pill`): All action buttons, pills, status tags, search containers.
  - `20px` (`--radius-card`): All content cards and containers.
  - `14px` (`--radius-tile`, `--radius-input`): Stat tiles and form inputs.
  - `10px` (`--radius-sm`): Small badges and dropdown menus.
- **Featured Card Pattern**: White card with a **1.5px burgundy border** (`border: 1.5px solid var(--burgundy)`), identical to the "02" offering card on the public services page. Used for the currently selected/active project.
- **Shadows**:
  - Card: `0 10px 30px rgba(30, 21, 9, 0.05)`
  - Floating / Elevated: `0 18px 48px rgba(30, 21, 9, 0.25)`
  - Hover Lift: `translateY(-2px)` with `0 12px 32px rgba(30, 21, 9, 0.09)`

### Spacing Scale

`4px`, `8px`, `12px`, `16px`, `20px`, `24px`, `32px`, `48px`, `64px`, `96px`.

---

## 2. Core Styling Rules

1. **No Orange / Terracotta**:
   The brand palette strictly excludes orange, cognac, or terracotta. All primary accents are burgundy (`#41101B`) and espresso (`#1E1509`).
2. **Buttons are pill-shaped with trailing arrow ("→")**:
   - On light surfaces: Burgundy pill (`var(--burgundy)`) with white uppercase letter-spaced text and "→" (e.g. `INQUIRE →`, `+ CREATE YOUR FIRST PROJECT →`, `CREATE PROJECT →`).
   - On dark espresso bands: Cream pill (`var(--cream)`) with espresso text and "→" (e.g. `+ NEW PROJECT →`), or translucent outline pills (`outline-on-dark`).
3. **Headline styling**:
   The second line of display titles uses italic serif in the **SAME cream color** as the first line (e.g. *Own the budget.*).
4. **Dark bands for heroes**:
   Section heroes use full-width dark espresso bands (`--espresso`) with cream high-contrast text (`--on-dark`), subtle outline pills (`rgba(250, 248, 245, 0.08)`), and bottom fade to `--cream`.
5. **Featured card pattern**:
   Selected or highlighted cards use `featured={true}` which applies the signature 1.5px burgundy border.
6. **Project card covers**:
   Covers show the project image, the linked property's aerial view, or a plain espresso/beige tone block. No numeric initials (e.g. no "11" text placeholder).
7. **Budget progress bars and accents**:
   Burgundy on light backgrounds (`var(--burgundy)`), cream on dark backgrounds (`var(--cream)`).
8. **Soft wave divider**:
   Use `WaveDivider` to create organic transitions between cream (`--cream`) and beige (`--beige`) sections.
9. **No emoji**:
   Never use raw emojis in the interface. Use refined SVG glyphs, typographic initials, or architectural labels.
10. **Always use shared components**:
    Import and reuse components from `src/components/ui`.

### Designer Hub & Studio Patterns
- **Room Bar**: Pill chips for rooms. Selected = espresso fill with cream text (`var(--espresso)`); others white with thin border. Each pill displays room name and itemized total (e.g. `Kitchen $38.5K`). Include `+ ADD ROOM` button and 3-dots action menu (rename, reorder, delete).
- **Room Board**: White Card with serif room name (`var(--font-display)`) and style line (both editable inline), paired with `SegmentedControl` (Mood board · Before / after · Floor plan · Renders).
- **Mood Board Grid**: 4-column responsive grid with 120px rows. Each tile can be small (1×1), wide (2×1), or large (2×2) with caption pill bottom-left. Drag-and-drop reordering on desktop plus keyboard/mobile move buttons. Drop zone at the end with safe photo pipeline (JPEG max 2000px, EXIF metadata stripped, random unguessable Blob paths).
- **Before / After**: Interactive comparison slider (`<input type="range" />` split view) or side-by-side column view.
- **Floor Plan & Renders**: Gallery grid with captions and lightbox modal view.

---

## 3. Shared Components Inventory (`src/components/ui`)

| Component | Purpose & Variants |
| :--- | :--- |
| `Button` | Accessible pill button: `primary` (burgundy with "→"), `secondary` (outline), `cream-on-dark` (cream pill with espresso text), `outline-on-dark`, `text`. |
| `Pill` | Status tags and chips: `neutral`, `positive`, `warning`, `negative`, `info`. |
| `Card` | White surface with thin border, 20px radius, optional `featured` (burgundy border) and `hoverable` lift. |
| `StatTile` | Analytics tile with serif big number, sans uppercase label, sand/white surface. |
| `Eyebrow` | Uppercase tracking label with `onLight` and `onDark` variants. |
| `SectionHeading`| Editorial serif heading (`display`, `h1`, `h2`, `h3`) with optional `onDark`. |
| `SegmentedControl`| Pill toggle group on soft beige container. |
| `Tabs` | Navigation tabs with `light` and `on-dark` (seamless edge blend) variants. |
| `SidePanel` | Slide-in drawer with dark blur overlay, header, scrollable body, and footer. |
| `Field` | Form control with uppercase label, custom input/select/textarea, and validation error. |
| `EmptyState` | Elegant dashed container with title, description, and action button. No emoji. |
| `DarkBand` | Full-width espresso hero band with photo overlay and bottom cream fade. |
| `Numeral` | Editorial italic serif numeral (01, 02, 03) for steps and list indicators. |
| `ScriptAccent` | Handwritten script stamp (`Dreams on Paper`) for subtle editorial badges (e.g. "Current project"). |
| `WaveDivider` | Soft wave SVG divider between cream and beige page sections. |
