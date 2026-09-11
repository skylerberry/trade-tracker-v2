# Themes tracker and daily refresh

**Working copy:** `/Users/skylerberry/Projects/skyler-tools-publish`  
(`skyler-tools-v2` is a stale checkout. Do not compile or refresh Themes there.)

The Themes page uses one static catalog, `data/daily-scan.json`. Browser clients receive derived metrics and company descriptions; credentials and raw bars stay on the local machine.

## Daily (after the close)

Grok: `/themes-update`. It is autonomous: NY weekday → after 16:15 ET → fast-forward `origin/main` → `npm run themes:update` → tests → commit **only** `data/daily-scan.json` → `git push origin main` (15 Netlify credits). Stop at the first failed check. Weekends, holidays, and incomplete sessions leave the last catalog in place and do not push.

## Refresh after the close

From this repository, after **4:15 PM America/New_York** on a trading day:

```sh
npm run themes:update
npm test
python3 -m unittest discover -s tests -p 'test_themes_update.py'
npm run build
```

The refresh command uses the dependency-free engine in `~/Projects/magic-scan/scan.py`. Override its location with `MAGIC_SCAN_DIR` or `--scanner-dir`. Credentials are resolved by that engine from its existing environment/project/shared `.env` configuration. No credentials are copied into this repository.

It fetches fresh adjusted SIP daily bars, identifies the completed session from SPY, and computes daily/1W/1M/3M/YTD returns, 20-session ADR, 30-session mean dollar volume, position relative to SMA50, and distance below the highest daily high in 252 sessions. YTD anchors on the final available session of the previous year (including years with a December 31 holiday). New listings with insufficient history have null readings.

The normal snapshot floor is 2.5% ADR, $20M mean dollar volume, and $1 price. Mag 7 explicitly retains all seven members. The page defaults to 3% ADR and $100M; filters affect stock visibility, while theme means always use the fixed 3%/$100M comparison group. Theme ordering uses the displayed mean, with no size adjustment. Changing search does not redefine the comparison population.

Theme membership comes from `data/theme-roster.json`, not that day's filtered results. This preserves temporarily excluded members for future sessions. Mag 7 uses AAPL, MSFT, AMZN, GOOGL, META, NVDA, and TSLA; Alphabet is counted once. Stocks can belong to Mag 7 and their ordinary theme. Counts of names deduplicate tickers.

Descriptions and company names are read from the canonical RS Tape files, `~/Projects/RS Tape/rs/data/does.csv` and `identity.csv` (override with `RS_DOES` / `RS_IDENTITY`). Nonempty canonical values take precedence. `data/company-descriptions.json` is a portable fallback snapshot, not the editing source of truth. Improve Does lines in RS Tape; the refresh does not generate new claims about businesses. The command reports missing descriptions and qualifying symbols without a theme. It does not silently invent classifications.

Review the report and the catalog diff. The refresh aborts before writing if the session is stale, Mag 7 is incomplete, or coverage drops by more than 25%. A successful catalog write is atomic. Weekends and market holidays leave the last completed catalog unchanged.

## How this fits `/daily-scan`

The Grok skill at `~/.grok/skills/daily-scan/SKILL.md` is the editorial workflow: scan, verify businesses against RS Tape or primary company sources, group the above- and below-SMA50 names, and prepare the Discord text. Its default 5% ADR / $50M cut is separate from this page's broader browse catalog and 3% / $100M defaults. The skill does not publish.

For new assignments, compile the reviewed post **in this checkout**, then run the refresh above:

```sh
npm run scan:themes -- /absolute/path/to/daily-scan-YYYY-MM-DD.md /absolute/path/to/daily-scan.csv
npm run themes:update
```

`scan:themes` merges assignments into `data/theme-roster.json` only. It does not write the public catalog. `themes:update` rebuilds `data/daily-scan.json` (full-universe measurements, YTD, 52W distance, Mag 7, Does from RS Tape). If it is before 16:15 ET, the roster still updates; the catalog waits until `/themes-update` after the close. Review both files when assignments change.

## Publish

After reviewing the update:

```sh
git add data/daily-scan.json data/theme-roster.json
git commit -m "Refresh Themes after the close"
git push origin main
```

The existing GitHub Actions `Deploy` workflow builds the site and deploys `dist/` to Netlify. Monitor that workflow for success. A production deployment costs 15 Netlify credits under the current project runbook.

**The scan is not scheduled.** Refresh and commit/push are explicit local steps; deployment after a push is automatic. The header describes the intended daily cadence, not a configured scheduler. Scheduling requires a runner with the local engine and approved credentials; do not infer public redistribution rights from calculations or filters.

## Reproduce a historical snapshot

```sh
python3 scripts/update-themes.py --bars-cache /absolute/path/to/bars-cache.json.gz --as-of 2026-09-10
```

The cache must have the Magic Scan `universe` and `bars` format and sufficient history. This mode does not contact Alpaca. It still validates coverage and refuses to regress the current catalog date.

## UI behavior

- Exact ticker search opens its theme and company description immediately.
- Hidden search matches explain each blocking filter; Reveal changes only those filters.
- Gray names are below SMA50. Details include semantic metric dots, 52W distance, Does text, and a chart link beside the company name.
- Filters use fixed-width inputs and 0.5% ADR / $5M volume steppers.
- The timeframe indicator uses the site's `MOTION.segmented` spring; data rendering must not call its snapping `refresh()` method.
- Styles are scoped to `#themesView`. Trading, journal, and compound state are separate.
