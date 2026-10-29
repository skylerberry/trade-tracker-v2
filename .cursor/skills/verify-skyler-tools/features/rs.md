# Relative strength (RS)

Theme rank history after each close. Nav label **RS**. Same roster as Themes.

## Sub-features

- asOf chip `#rs-asof`
- Focused / All (same `.scope` pattern as Themes)
- Rank window Daily / 1W / 1M / 3M / 6M / YTD (default **1M**, not Daily)
- Index SPY / QQQ `#rsView .bench [data-seg]`
- Search `#rs-search`
- Board `#rs-board` rows `.rs-row[data-id]` with cells `.rs-cell`
- Hover tip `#rs-tip`
- Click a row → `#themes/<id>`
- How it works `#rs-aboutToggle`

## How to get to it (user POV)

Click **RS** in the top nav, or open `#rs`. Click a theme row to land on that theme in Themes.

## Driving it with verify

```bash
npm run verify -- check rs
npm run verify -- shot rs
```

Harness: click `#viewSeg [data-seg="rs"]`. Wait for `#rs-asof` and `.rs-row`. Screenshot. Click the first `.rs-row`.

**Observable end state:** `#rs-asof` contains `Updated after the close`; `#rs-period` mentions the window and `vs SPY` (default); after click, hash is `#themes/<row data-id>` and `#themesView` is visible.

## Gotchas

- Needs both `data/daily-scan.json` (names + asOf) and `data/theme-ranks.json` (sessions). Missing ranks → “No rank history yet.” / “No ranks for this window yet.” Do not weaken the check to accept the empty string as success.
- Default window is **1M** (`data-seg="m"`), not Daily.
- Until a session records SPY/QQQ benchmarks, order falls back to the same mean Themes uses (see How it works).
- Not named Monitor. There is no `#monitor` view.
