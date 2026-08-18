# Trade Tracker Design System

This document defines the visual language and design principles for the Trade Tracker application. **All design changes must follow these guidelines to maintain consistency.**

---

## Design Philosophy

**Flat, Clean, Timeless** - The design prioritizes clarity and simplicity. No gradients, no glassmorphism, no trendy effects. Just clean, functional design that won't look dated.

### Core Principles

1. **Flat design** - No gradients, no glassmorphism, no 3D effects
2. **Solid color backgrounds** - Cards use solid fills, not semi-transparent overlays
3. **Consistent color usage** - The same color should be used everywhere that color appears
4. **Subtle depth** - Use borders and slight background color differences, not shadows
5. **Theme parity** - Light and dark mode should feel like the same app with matching visual hierarchy

### What NOT to Do

- **NO gradients** - Ever. Not for backgrounds, not for buttons, not for cards
- **NO glassmorphism** - No frosted glass effects, no backdrop-blur
- **NO trendy effects** - If it looks like a 2024 design trend, don't use it
- **NO inconsistent colors** - If one button is navy, ALL buttons should be navy
- **NO "heavy" headers** - Headers use light backgrounds with colored top border accents

---

## Theme Parity Strategy

Both light and dark modes share the same visual hierarchy:

| Element | Light Mode | Dark Mode |
|---------|------------|-----------|
| Header background | Light gray `#f8fafc` | Dark charcoal `#1f1f22` |
| Header top border | 3px navy `#1a365d` | 3px blue `#3b82f6` |
| Header text | Navy `#1a365d` | Light gray `#f4f4f5` |
| Sync status | Minimalist dot + muted text | Minimalist dot + muted text |
| Table headers | Card surface `#ffffff` (pinned) | Card surface `#27272a` (pinned) |
| Primary buttons | Navy `#1a365d` | Blue `#3b82f6` |
| Toast accent | 3px navy left border | 3px blue left border |

---

## Color Palette

### Light Mode

#### Blue Hierarchy Strategy (Light Mode)

| Type | Color | Usage |
|------|-------|-------|
| **Primary Action** | `#1a365d` | Solid backgrounds for high-intent buttons |
| **Secondary/Interactive** | `#4b5563` | Ghost buttons, utility actions |

#### Primary Brand Color
```css
--color-primary: #1a365d;        /* Navy blue - solid button backgrounds */
--color-primary-hover: #162e4f;  /* Slightly darker for hover */
--color-accent: #1a365d;         /* Same as primary for consistency */
```

#### Header (Light Mode)
```css
background: #f8fafc;             /* Very light gray */
border-top: 3px solid #1a365d;   /* Navy accent */
color: #1a365d;                  /* Navy text */
```

#### Status Colors
```css
--color-success: #22c55e;        /* Green - synced, gains, closed trades */
--color-warning: #fbbf24;        /* Amber - syncing, warnings */
--color-error: #ef4444;          /* Red - errors, losses, delete actions */
```

#### Sync Status (Light Mode)
```css
/* Minimalist dot style */
background: transparent;
color: #6b7280;                  /* Muted text */

/* Status dot (::before pseudo-element) */
width: 8px;
height: 8px;
border-radius: 50%;
background: #22c55e;             /* Green for synced */
background: #fbbf24;             /* Amber for syncing/not-synced */
background: #ef4444;             /* Red for error */
```

#### Table Headers (Light Mode)
```css
background: var(--surface);      /* the card's own colour — NOT a grey band */
color: var(--text-3);            /* quiet label grey */
```

The trades-table head is `position: sticky`, so its background **must stay
opaque and must match the card**. A transparent head lets rows scroll through
it. Two ancestor rules exist only to keep that working:

- `.table-card` uses `overflow: clip`, not `hidden` — `hidden` creates a
  scroll container, which would capture the sticky head.
- `.table-scroll` is `overflow-x: visible` above 1080px and only switches to
  `auto` below it, for the same reason. Horizontal scrolling and a pinned
  head cannot both apply to the same element.

The head clears the floating pill via
`body:has(.float-bar.in) .trades-table thead th { top: 66px; }`.

#### Toast (Light Mode)
```css
background: #ffffff;
color: #374151;
border: 1px solid #d1d5db;
border-left: 3px solid #1a365d;  /* Navy accent */
border-radius: 8px;
```

#### Calculator Card Colors (Light Mode)
```css
/* Position Card */
background: #1a365d;             /* Navy - same as primary */

/* Target Card - Gain */
background: #2d6a4f;             /* Muted forest green */

/* Target Card - Loss */
background: #9b2226;             /* Muted burgundy */

/* Target Card - Inactive/Empty */
background: #f3f4f6;             /* Light gray */
border: 2px dashed #d1d5db;      /* Dashed border creates depth */
```

### Dark Mode

#### Blue Hierarchy Strategy (Dark Mode)

The dark mode uses a two-tier blue system to create visual hierarchy:

| Type | Color | Usage |
|------|-------|-------|
| **Primary Action** | `#3b82f6` | Solid backgrounds for high-intent buttons (Log Trade, Paste Alert, Add New Trade) |
| **Secondary/Interactive** | `#93c5fd` | Ghost buttons, links, hover states (Sync Settings, Watchlist Pills, icon hovers) |

**Why this distinction?** If every interactive element uses the same vibrant blue, users won't know where to look. The lighter `#93c5fd` creates visual breathing room for utility actions that shouldn't compete with primary actions.

#### Primary Brand Color (Dark Mode)
```css
--color-primary: #3b82f6;        /* Medium blue - solid button backgrounds */
--color-primary-hover: #2563eb;  /* Slightly darker for hover */
--color-accent: #93c5fd;         /* Ice blue - ghost buttons, links, secondary actions */
```

**Why blue instead of navy?** The charcoal background (`#27272a`) is too close in value to muted navy, resulting in poor contrast. `#3b82f6` provides good contrast without being too bright.

#### Header (Dark Mode)
```css
background: #1f1f22;             /* Dark charcoal */
border-top: 3px solid #3b82f6;   /* Blue accent */
color: #f4f4f5;                  /* Light text */
```

#### Sync Status (Dark Mode)
```css
/* Minimalist dot style - same as light mode */
background: transparent;
color: #a1a1aa;                  /* Muted text */

/* Status dots use same colors as light mode */
```

#### Table Headers (Dark Mode)
```css
background: #1f1f22;             /* Dark charcoal - matches header */
color: #71717a;                  /* Muted gray text */
```

#### Toast (Dark Mode)
```css
background: #27272a;             /* Card background */
color: #f4f4f5;                  /* Bright text */
border: 1px solid #3f3f46;
border-left: 3px solid #3b82f6;  /* Blue accent */
border-radius: 8px;
```

#### Dark Mode Backgrounds
```css
#18181b                          /* Page background */
#1f1f22                          /* Header, table headers */
#27272a                          /* Card/panel backgrounds */
#2d2d30                          /* Slightly elevated surfaces */
#3f3f46                          /* Borders, dividers */
```

#### Calculator Card Colors (Dark Mode)
```css
/* Position Card */
background: #3b82f6;             /* Blue - matches header accent */

/* Target Card - Gain */
background: #1a4d3a;             /* Softer forest green */

/* Target Card - Loss */
background: #6b2c2c;             /* Softer burgundy */

/* Target Card - Inactive/Empty */
background: #2d2d30;             /* Slightly lighter than surroundings */
border: 2px dashed #3f3f46;      /* Creates inset effect */

/* R-Level Items (inactive) */
background: #2d2d30;             /* Matches inactive target card */
border: 1px solid #3f3f46;       /* Solid border (not dashed) */
color: #71717a;                  /* Label text - muted */
/* Price: #e4e4e7, Profit: #22c55e */

/* R-Level Items (active) */
background: #3b82f6;             /* Primary blue */
border-color: #3b82f6;
/* All text: white */
```

---

## Component Specifications

### Daily Dashboard Clock

- Lives between the product lockup and header utilities on wide screens; moves to its own centered row when space is constrained.
- Shows the user's locale-aware abbreviated date and local time.
- Uses the shared per-character roller with upward motion and a short blur only on changing clock digits.
- A compact `:SS` bubble toggles seconds and persists the preference locally. The control exposes `aria-pressed`, while the changing clock itself is not a live announcement region.
- Uses a solid surface, standard border, inset highlight, and the active accent—no separate visual vocabulary.

### Theme Toggle
```css
/* Light Mode */
background: transparent;
border: 1px solid #d1d5db;
color: #6b7280;

/* Light Mode Hover */
background: #f3f4f6;
border-color: #9ca3af;
color: #374151;

/* Dark Mode */
border-color: #52525b;
color: #a1a1aa;

/* Dark Mode Hover */
background: #3f3f46;
border-color: #71717a;
color: #e4e4e7;
```

### Primary Button
```css
/* Light Mode */
background-color: #1a365d;
border: 1px solid #10233d;
box-shadow: inset 0 1.5px 0 rgba(255, 255, 255, 0.20);
color: white;

/* Dark Mode */
background-color: #3b82f6;
border: 1px solid #1d4ed8;
box-shadow: inset 0 1.5px 0 rgba(255, 255, 255, 0.20);
color: white;
```

**Used for:** Position Size Calculator, Log Trade, Paste Alert, Export, Save, Submit

### Direction semantics

- Long-position context uses the global success green, independent of the
  selected accent.
- Short-position context uses the global danger red.
- **Exception — the `.direction-tag` in a table row** follows the active
  accent for long (`--primary`) and danger red for short. The row already
  spends green on realized P&L, so a green `LONG` on every row would compete
  with the number that matters.
- Segmented-control selection remains accent-colored so green/red is reserved
  for direction rather than generic selection state.

### Secondary Button (Ghost Style)
```css
/* Light Mode */
background: transparent;
border: 1px solid #d1d5db;
color: #4b5563;

/* Dark Mode */
background: transparent;
border: 1px solid #52525b;
color: #a1a1aa;
```

**Used for:** Cancel, Close, secondary actions

### Utility Button (Ice Blue Ghost - Dark Mode Only)
```css
/* Dark Mode */
background: transparent;
border: 1px solid #93c5fd;
color: #93c5fd;

/* Dark Mode Hover */
background: rgba(147, 197, 253, 0.1);
```

**Used for:** Sync Settings, Watchlist Pills (text), Icon button hovers

**Why separate from Secondary?** These use the accent blue (`#93c5fd`) to indicate interactivity without competing with primary action buttons. They create visual breathing room for utility functions.

### Form Inputs
```css
/* Light Mode */
background: white;
border: 1px solid #d1d5db;
color: #374151;

/* Dark Mode */
background: #27272a;
border: 1px solid #52525b;
color: #f4f4f5;

/* Focus Ring - Light Mode */
box-shadow: 0 0 0 3px rgba(26, 54, 93, 0.15);

/* Focus Ring - Dark Mode */
box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.35);
```

---

## Typography

```css
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
```

No custom fonts. System fonts only.

---

## Spacing

Base unit: 4px

Common values: 8px, 12px, 16px, 20px, 24px, 30px

---

## Border Radius

```css
--radius-sm: 4px;    /* Badges, small elements */
--radius-md: 6px;    /* Buttons, inputs */
--radius-lg: 8px;    /* Cards, panels, toasts */
--radius-xl: 12px;   /* Large cards, modals */
--radius-full: 9999px;  /* Pills, theme toggle */
```

---

## Shadows

Minimal. Prefer borders for definition.

```css
--shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
--shadow-md: 0 2px 8px rgba(0, 0, 0, 0.1);
--shadow-lg: 0 10px 40px rgba(0, 0, 0, 0.2);  /* Modals only */
```

---

## Dark Mode Implementation

### One Selector Pattern

`initTheme()` (plus the pre-paint script in `index.html`'s `<head>`) guarantees `data-theme` is **always** set on `<html>` — including for system-preference followers, who also get live OS-theme switching. Dark styles are therefore defined exactly once:

```css
[data-theme="dark"] .element {
    /* styles */
}
```

**Never add `@media (prefers-color-scheme: dark)` rules.** The old dual-selector convention (removed July 2026) duplicated ~1,200 lines and caused drift between the two copies. If a dark style doesn't apply, the bug is in theme initialization, not a missing media query.

### Native UI Elements

```css
[data-theme="dark"] {
    color-scheme: dark;  /* Required for scrollbars, checkboxes, etc. */
}
```

---

## Checklist for Design Changes

Before making any visual change, verify:

- [ ] Does it follow the flat design principle (no gradients, no glassmorphism)?
- [ ] Does the color match existing elements of the same type?
- [ ] Have you added the `[data-theme="dark"]` styles (single pattern — no `prefers-color-scheme` media queries)?
- [ ] Does it look correct in light mode?
- [ ] Does it look correct in dark mode?
- [ ] Do interactive states (hover, active, focus) exist for both themes?
- [ ] Is there structural parity between themes (same borders, same layout)?
- [ ] Does it maintain theme parity (matching visual hierarchy)?

---

## Quick Reference: Light Mode Colors (Zinc Palette)

| Element | Color |
|---------|-------|
| Header background | `#f8fafc` |
| Header top border | `#1a365d` |
| Primary buttons, active states | `#1a365d` |
| Primary hover | `#162e4f` |
| Table header background | `--surface` (`#ffffff`) |
| Table header text | `--text-3` (`#71717a`) |
| Sync status text | `#71717a` |
| Toast background | `#ffffff` |
| Toast left accent | `#1a365d` |
| Theme toggle border | `#d4d4d8` |
| Theme toggle icon | `#71717a` |
| Table ticker text | `#18181b` |
| Table price text | `#3f3f46` |
| Table date text | `#71717a` |
| Container border | `#e4e4e7` |
| Row hover | `color-mix(--primary 4%, --surface)` |

## Quick Reference: Dark Mode Colors

| Element | Color |
|---------|-------|
| Header background | `#1f1f22` |
| Header top border | `#3b82f6` |
| Primary buttons, active states | `#3b82f6` |
| Primary hover | `#2563eb` |
| Page background | `#18181b` |
| Card/panel background | `#27272a` |
| Table header background | `#1f1f22` |
| Table header text | `#71717a` |
| Borders, dividers | `#3f3f46` |
| Secondary borders | `#52525b` |
| Sync status text | `#a1a1aa` |
| Muted text | `#71717a` |
| Secondary text | `#a1a1aa` |
| Primary text | `#e4e4e7` |
| Bright text | `#f4f4f5` |
| Toast background | `#27272a` |
| Toast left accent | `#3b82f6` |
| Theme toggle border | `#52525b` |
| Theme toggle icon | `#a1a1aa` |
| Position card | `#3b82f6` |
| Gain card | `#1a4d3a` |
| Loss card | `#6b2c2c` |
| Table row hover | `color-mix(--primary 10%, --surface)` |
| Table date text | `#a1a1aa` |
| Table price text | `#e4e4e7` |
| Watchlist pill background | `#2d2d30` |
| Watchlist pill hover | `transparent` with `#93c5fd` border |

---

## Text Hierarchy in Tables

To reduce eye strain and create visual hierarchy, table cells use differentiated text colors:

| Cell Type | Light Mode | Dark Mode |
|-----------|------------|-----------|
| **Ticker** (primary) | Default (inherits) | `#f4f4f5` (bright) |
| **Prices** (secondary) | `--color-gray-700` | `#e4e4e7` |
| **Dates** (tertiary) | `--color-gray-500` | `#a1a1aa` |

---

## Interactive Hover States

### Table Row Hover
Subtle background highlight helps track across columns. It is a wash of the
**active accent**, not a fixed grey — a flat `#fafafa` on `#ffffff` is a 2%
delta, which reads as no hover at all.

```css
--row-hover: color-mix(in srgb, var(--primary)  4%, var(--surface));  /* light */
--row-hover: color-mix(in srgb, var(--primary) 10%, var(--surface));  /* dark  */
--row-hover: color-mix(in srgb, var(--primary) 14%, var(--surface));  /* oled  */
```

### Watchlist Pill Hover
Muted default state transitions to high-contrast on hover.

```css
/* Dark Mode - Default (recessed) */
[data-theme="dark"] .watchlist-pill {
    background-color: #2d2d30;
    border-color: #52525b;
    color: #93c5fd;
}

/* Dark Mode - Hover (punchy) */
[data-theme="dark"] .watchlist-pill:hover {
    background-color: transparent;
    border-color: #93c5fd;
    color: #93c5fd;
}
```

---

## Collapsible Sections

Used for content that can be hidden to reduce visual clutter (e.g., Watchlist).

### Structure
- **Header**: Clickable row with title, optional count badge, and chevron indicator
- **Content**: Hidden by default, revealed on click
- **State persistence**: Expanded/collapsed state saved to localStorage

### Styling
```css
/* Container */
border: 1px solid var(--color-gray-200);
border-radius: 8px;
overflow: hidden;

/* Header */
background: var(--color-gray-100);
padding: 10px 14px;

/* Header hover */
background: var(--color-gray-200);

/* Content area */
background: var(--color-bg);
border-top: 1px solid var(--color-gray-200);
padding: 12px 14px;

/* Chevron rotation on expand */
transform: rotate(180deg);
transition: transform 0.2s;
```

### Count Badge
Small pill showing item count. Must remain visible on header hover.

```css
background: var(--color-gray-200);
padding: 2px 8px;
border-radius: 10px;
font-size: 0.75rem;
font-weight: 600;
color: var(--color-gray-600);

/* On header hover - darken to stay visible */
background: var(--color-gray-300);
```

---

## Destructive Actions

### Inline Delete Button
Small, muted button that becomes dangerous on hover. Used for granular delete actions within lists.

```css
/* Default state - unobtrusive */
padding: 2px 8px;
font-size: 0.7rem;
color: var(--color-gray-500);
background: none;
border: 1px solid var(--color-gray-300);
border-radius: 4px;

/* Hover state - danger indication */
color: var(--color-danger);
border-color: var(--color-danger);
background: rgba(239, 68, 68, 0.1);
```

### Full-Width Delete Button
Used for major destructive actions (e.g., "Delete All Data").

```css
/* Default state */
width: 100%;
padding: 8px 12px;
font-size: 0.8rem;
color: var(--color-danger);
background: none;
border: 1px solid var(--color-danger);
border-radius: 6px;

/* Hover state - filled danger */
background: var(--color-danger);
color: white;
```

### Confirmation Pattern
- Single confirmation for reversible or minor deletions
- Double confirmation for irreversible bulk deletions ("Delete All Data")

---

## Trades Table

The table follows a standard table-design checklist. Each item and where it
lives:

| Item | Where |
|------|-------|
| **Header** | `.trades-table thead th` — sticky, opaque, quiet uppercase labels |
| **Row style** | Hairline dividers `color-mix(--border 55%, --surface)`; accent-wash hover |
| **Spacing** | 15px cell padding, 20px outer gutter so content clears the 16px card radius |
| **Search** | `#tradeSearch` — matches ticker, direction, status, dates, prices, notes, plan text; `/` focuses it, `Esc` clears |
| **Actions** | Four row icons in an always-visible bordered track, plus the `⋯` trim entry |
| **Filter & sort** | Status pills + date range; click-to-sort headers with `aria-sort` |
| **Responsiveness** | Table down to 620px, one card per trade below it |
| **Pagination** | `PAGE_SIZE = 20`, prev/next, `N / M` readout |

### Column grouping

Entry/Stop are *what you did*; Realized/R are *what happened*. The seam is a
26px gap plus a header-only hairline (`th.th-group::before`) — never
full-height grid lines.

### Sort behaviour

Tri-state per column: **descending → ascending → off**. "Off" is not arbitrary
order; it restores **entry date, newest first**, which is the sort the table
has no column for (the date lives inside the ticker cell). Null values always
sink to the bottom in both directions, so an unfilled column never buries the
rows that do have values.

### Controls that must NOT be ghosted

Row actions and the `⋯` keep full opacity and their bordered track at rest.
An earlier iteration faded them to 50% until hover; it reads as broken rather
than calm. The `⋯` is instead simply **absent** where no action exists — it
does not render on closed, stopped or archived rows.

### Status badges

Outline style: 1px border in the state's own colour over a soft tint (or
transparent for closed/archived). A fully-filled pill reads as a button.

### Mobile cards (≤620px)

Same DOM, no JS branch — the row becomes a grid:

```
"tick tick stat stat"
"rule rule rule rule"
"entr stop real rr"
"next next acts acts"
```

`stat` and `acts` need two columns each; one column is too narrow for
`FREEROLLED` or a four-icon cluster. Number cells use `align-self: start` so
Realized/R line up with Entry/Stop, which carry a second line. Column labels
come from `td[data-k]` via `::before`, since the head is hidden here.
