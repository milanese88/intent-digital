# Intent Digital Design Guidelines

> **Golden Rule**: Before any UI work, read this document and use `src/components/ui`.

This document locks in the visual aesthetic across every screen of the Intent Digital Owner Portal and public studio. Every interface must strictly follow these design tokens and principles.

---

## 1. Design Tokens (`src/styles/tokens.css`)

### Color Palette

| Token | Hex Value | Role & Usage |
| :--- | :--- | :--- |
| `--espresso` | `#1B130D` | Primary text, deep dark bands, headers, footers |
| `--burgundy` | `#3A1418` | Primary action buttons, active tab underlines, selected states |
| `--terracotta` | `#C05A2A` | Designer Hub accent pill & highlights only |
| `--terracotta-soft` | `#E9B08F` | Accent italic text on dark espresso hero bands |
| `--cream` | `#FAF8F4` | Anchoring page canvas & active tab background |
| `--beige` | `#F2EEE8` | Soft panels, segmented controls, table headers |
| `--sand` | `#F7F3EE` | Stat tiles, secondary analytical containers |
| `--border` | `#E4DDD3` | Card borders, dividers, subtle boundaries |
| `--border-strong` | `#CFC5B8` | Outline pill borders, active form field borders |
| `--text-2` | `#4A413A` | Secondary body text |
| `--muted` | `#5E544C` | Eyebrow labels, timestamps, metadata |
| `--on-dark` | `#FAF8F4` | Primary high-contrast text on espresso bands |
| `--on-dark-muted` | `#CFC5B8` | Secondary descriptions on espresso bands |
| `--eyebrow-on-dark` | `#E9DFD2` | Eyebrow tags and pills on espresso bands |
| `--positive` / `--positive-bg` | `#3F5A3A` / `#EEF2EA` | Owned properties, completed projects, Zone X flood |
| `--warning` / `--warning-bg` | `#7A5212` / `#F7EEDC` | In Progress, Analyzing, Shaded flood zone |
| `--negative` / `--negative-bg` | `#8A2A1E` / `#F5E6E3` | Passed, high-risk SFHA flood, deletion states |
| `--info` / `--info-bg` | `#274D73` / `#EBF1F7` | In Design, Watching, informational tags |

### Typography

- **Headings & Big Numbers**: Serif (`--font-display` / Atelier Fleur / Cormorant Garamond / Playfair Display).
  - Display Hero: `clamp(60px, 6vw, 76px)`
  - H1: `clamp(36px, 4.5vw, 56px)`
  - H2: `32px`
  - H3: `24px`–`26px`
  - Stat Values: `32px` serif
- **Everything Else**: Clean Sans-Serif (`--font-body` / Montserrat).
  - Body Paragraphs: `14px`–`16px` (regular, line-height 1.6)
  - Eyebrows & Labels: `11px`–`12px` uppercase with tracking `0.12em`–`0.22em`

### Shapes, Shadows & Depth

- **Border Radius**:
  - `999px` (`--radius-pill`): All action buttons, pills, status tags, search containers.
  - `20px` (`--radius-card`): All content cards and containers.
  - `14px` (`--radius-tile`, `--radius-input`): Stat tiles and form inputs.
  - `10px` (`--radius-sm`): Small badges and dropdown menus.
- **Shadows**:
  - Card: `0 10px 30px rgba(27, 19, 13, 0.07)`
  - Floating / Elevated: `0 18px 48px rgba(27, 19, 13, 0.28)`
  - Hover Lift: `translateY(-2px)` with `0 12px 32px rgba(27, 19, 13, 0.09)`

### Spacing Scale

`4px`, `8px`, `12px`, `16px`, `20px`, `24px`, `32px`, `48px`, `64px`, `96px`.

---

## 2. Core Styling Rules

1. **Serif for headings and big numbers, sans for everything else**:
   Always use `--font-display` for section titles, modal headers, card titles, and key stat tile numbers. All body text, navigation, tables, labels, form controls, and buttons must use `--font-sans`.
2. **Uppercase letter-spaced labels**:
   Field labels, eyebrows, table headers, and category tags must be uppercase with `letter-spacing: 0.12em` to `0.22em`.
3. **Pill-shaped buttons**:
   All buttons must be pill-shaped (`border-radius: 999px`). Never use sharp or slightly rounded rectangles for actions.
4. **Color roles**:
   - **Burgundy (`--burgundy`)** is reserved for primary actions, selected tabs, and key interactive focal points.
   - **Terracotta (`--terracotta`)** is used strictly in Designer Hub as its distinctive studio accent.
   - Do not use generic blues, greens, or reds. Use the designated tokens.
5. **Espresso dark bands for heroes**:
   Section heroes use full-width dark espresso bands (`--espresso`) with high-contrast text (`--on-dark`, `--eyebrow-on-dark`) and optional photo overlays.
6. **Generous whitespace**:
   Allow layouts room to breathe. Use at least `24px` between cards, `40px`–`64px` section margins, and minimum `96px` top hero padding.
7. **No emoji**:
   Never use raw emojis in the interface. Use refined SVG glyphs, typographic initials, or architectural labels.
8. **No arbitrary gradients**:
   Gradients are strictly prohibited except for photographic hero overlays and bottom fade blends to `--cream`.
9. **No default browser-styled controls**:
   Inputs, selects, checkboxes, and buttons must use the custom styling with 44px touch targets and visible focus rings (`--focus-ring`).
10. **Always use shared components**:
    Import and reuse components from `src/components/ui`.

---

## 3. Shared Components Inventory (`src/components/ui`)

| Component | Purpose & Variants |
| :--- | :--- |
| `Button` | Accessible pill button: `primary` (burgundy), `secondary` (outline), `accent` (terracotta), `outline-on-dark`, `text`. |
| `Pill` | Status tags and chips: `neutral`, `positive`, `warning`, `negative`, `info`. |
| `Card` | White surface with thin border, 20px radius, optional hover lift. |
| `StatTile` | Analytics tile with serif big number, sans uppercase label, sand/white surface. |
| `Eyebrow` | Uppercase tracking label with `onLight` and `onDark` variants. |
| `SectionHeading`| Editorial serif heading (`display`, `h1`, `h2`, `h3`) with optional `onDark`. |
| `SegmentedControl`| Pill toggle group on soft beige container. |
| `Tabs` | Navigation tabs with `light` and `on-dark` (seamless edge blend) variants. |
| `SidePanel` | Slide-in drawer with dark blur overlay, header, scrollable body, and footer. |
| `Field` | Form control with uppercase label, custom input/select/textarea, and validation error. |
| `EmptyState` | Elegant dashed container with title, description, and action button. No emoji. |
| `DarkBand` | Full-width espresso hero band with photo overlay and bottom cream fade. |
