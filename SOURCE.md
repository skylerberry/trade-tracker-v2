# Where these files came from

Copies only. Originals were not modified.

## App (workspace root)

Copied from `/Users/skylerberry/Projects/trade-tracker-v2` on 2026-08-13.

This is the working Trade Tracker V2 tree. All public-site work happens here.

## `_import/skyler-tools/`

Copied from `/Users/skylerberry/Projects/skyler-tools` on 2026-08-13.

Reference copies for porting:

- `js/compoundView.js` + `css/compound.css` — compound table
- `js/stats.js` + `js/statsChart.js` + `css/stats.css` — stats dashboard
- `js/state.js` + `js/dataManager.js` — live-site localStorage / backup shape
- `js/viewManager.js` — hash routing
- `index.html` — markup for compound, journal, stats, positions

Do not treat `_import/` as runtime code. Port from it into the app root.

## Ported so far

- Compound table math and live-site trade import live in `engine.js`
- Compound UI is `compound.js` (not the `_import` file)
- Hash views: `#positions` `#journal` `#compound` (`#dashboard` aliases Positions)
