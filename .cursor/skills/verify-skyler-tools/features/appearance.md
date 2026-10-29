# Appearance

Color mode and accent. Header chrome, every view.

## Sub-features

- Light / Dark / OLED `#themeSeg [data-seg="light"|"dark"|"oled"]` — sets `html[data-theme]`
- Accent `#accentBtn` → `#accentMenu`
- First visit is **light** (pre-paint script in `index.html`); stored as `tradeTracker_theme`

## How to get to it (user POV)

Use the sun / moon / sparkles segment in the header. Accent is the palette icon.

## Driving it with verify

```bash
npm run verify -- check appearance
```

Harness: click `#themeSeg button[data-seg="dark"]`.

**Observable end state:** `document.documentElement.getAttribute('data-theme') === 'dark'`. Screenshot before (light) and after (dark). The check switches back to light so it does not leave the profile dirty for a later check in the same browser context (each CLI invocation uses a fresh profile anyway).

## Gotchas

- `data-theme` is always set (never “system”). Do not assert `prefers-color-scheme` alone.
- OLED is a real third mode, not dark with extra CSS. If you change OLED tokens, add a headed shot — the automated check covers dark only.
- Accent menu items are painted in JS; wait for `#accentMenu` children before clicking an accent.
