# Themes

Browse-first theme tracker. Nav label **Themes**. Data: `data/daily-scan.json` (live catalog). Curated “Does” lines still originate in `data/guide.json` but this view does not mount Guide.

## Sub-features

- asOf chip `#themes-asof` (“Updated after the close · {date}”). Stale when `asOf` is behind `ENGINE.expectedPublishedSession()` (`.date.is-stale`)
- Focused / All `#themesView .scope [data-seg]`
- Windows Daily / 1W / 1M / 3M / 6M / YTD `#themesView .windows [data-win]`
- Search `#themes-search` (ticker, name, Does, theme; aliases like `semis`)
- Filters `#themes-filterToggle` → `#themes-adr` `#themes-dv` `#themes-near52` MA checkboxes
- Theme rows `button.tracker-row[data-theme="<id>"]` → `#themes/<id>`
- Lookup `#themes/lookup/NVDA` (from a ticker in Calculator)
- Copy tickers / copy Does / **Size trade** inside an open name
- How it works `#themes-aboutToggle`

## How to get to it (user POV)

Click **Themes**, or open `#themes`. Open a theme by clicking its row. Jump from a journal/calculator ticker via `#themes/lookup/<ticker>`.

## Driving it with verify

```bash
npm run verify -- check themes
npm run verify -- shot themes
npm run verify -- shot themes/semiconductors
```

Harness: click `#viewSeg [data-seg="themes"]`. Wait until `#themes-asof` matches `/Updated after the close/`. Screenshot. Click the first `button.tracker-row[data-theme]`. Screenshot.

**Observable end state:** asOf chip filled from the catalog; counts in `#themes-counts`; after click, `#themes-workspace h2` matches the row label, `.tracker-back` is visible, hash is `#themes/<id>`.

## Gotchas

- Catalog must include `asOf` `YYYY-MM-DD`, `companies`, and `themes`. If `GET /data/daily-scan.json` 404s, the workspace shows “Couldn’t load themes.” That is a serving/data bug, not a reason to skip the asOf assertion.
- Default scope is **Focused**, not All. A theme that exists in the file but is outside `THEME_TRACKER.FOCUSED` will not appear until All (or a search).
- Theme *return* is the mean of names with ADR ≥ 3% and $vol ≥ $100M. Filters change which names you see, not that mean. Do not expect the bar to move when you tick “Above 50 SMA”.
- Mag 7 keeps all seven names visible regardless of filters.
- Tickers ending in `.A` are dropped from rows.
- **Do not edit `data/daily-scan.json` to make a check pass.** Weekday automation owns that file.
