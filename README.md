# skyler.tools Trade Tracker 2.0

Live: [skyler.tools](https://skyler.tools)

A local-first swing-trade risk calculator and position tracker from
[skyler.tools](https://skyler.tools), built for the
enter → trim → freeroll → exit workflow. The app is fully static and runs
without a backend.

## What it does

### Position sizing

- Calculates shares from account size, risk percentage, entry, and stop
- Sizes both long and short share positions with direction-aware stops, R
  levels, targets, plans, exits, and realized P&L
- Flags a stop on the wrong side of entry and offers a one-click switch to the
  matching Long or Short setup without clearing the entered prices
- Sizes purchased calls and puts from manually entered delta and premium,
  with explicit risk-vs-allocation constraints and full-premium max loss
- Caps position size by a configurable percentage of the account
- Shows target profit, ROI, and R/R
- Builds half-at-1R, third-at-2R, back-fill, or manual management plans
- Parses Discord-style trade alerts and opens symbols in TradingView
- Logs a calculated trade in one click with an undo window
- Keeps option sizing calculator-only for now; option positions are not yet
  written into the share-trade log

### Position tracking

- Tracks shares, entry and stop prices, partial exits, realized P&L, and R
- Derives open, freerolled, partial, closed, and stopped-out statuses
- Provides fast Trim/Exit and Add to position workflows
- Auto-sizes trims at 1R, 2R, 3R, 5R—or any profitable price—to remove open
  risk while preserving a runner, with a one-toggle manual override
- Expands each row into a timeline, position statistics, actions, and a
  timestamped trade journal with thesis, update, review, and lesson entries
- Filters by status and date, with pagination and stale-position reminders
- Exports CSV, TSV, Excel-ready clipboard data, and JSON backups, including
  journal timestamps and content

### Themes

- A browse-first reference of everyday one-liners for what a company does
- Grouped by theme, with search across ticker, name, Does line, and theme
- Curated in `data/guide.json` — add a company record, then list its ticker
  under one or more themes
- Scan lists live in `data/movers.json` (same shape, plus an `asOf` date) —
  scanner-owned, optional, shown after the curated themes under a "Scans"
  seam. Curated data wins every collision; automation never edits guide.json

### Personalization and persistence

- Stores data locally using v1-compatible `localStorage` keys
- Optionally syncs trades, settings, and a 20-symbol watchlist through a
  private GitHub Gist
- Supports light and dark themes, system-theme following, and accent colors
- Includes keyboard-friendly entry flows and reduced-motion support

## Run locally

Requires Node.js 18 or newer.

```bash
npm start
```

Safe to run if a server is already up — it reuses it, or restarts a
laptop-only listener so a phone on the same Wi-Fi can connect.

- Laptop: [http://localhost:4173](http://localhost:4173)
- Phone (same Wi-Fi): the `http://192.168.…:4173` URL `npm start` prints

This is **not** a Netlify Preview URL. Localhost is your machine.
A Preview URL is a free temporary copy on Netlify’s servers. Production
(`skyler.tools`) is the live site.

The app has no runtime dependencies. Files are read from disk on every
request, so a browser refresh picks up CSS/JS edits (hard-refresh if a
tab was left open).

## Production

Deployed on the existing Netlify site for [skyler.tools](https://skyler.tools)
(`unique-cupcake-bbbd71`). Pushes to `main` publish through GitHub Actions.
`netlify.toml` copies the runtime files into `dist/` and publishes that folder.

## Test

```bash
npm test
```

The test suite exercises the DOM-free calculations and data contracts in
`engine.js`.

## GitHub Gist sync

Sync is optional; local data remains the default source of truth.

1. Open the cloud button in the header.
2. Enter a GitHub personal access token with Gist access.
3. Link an existing Gist ID or create a new private Gist.
4. Use the same token and Gist ID on another device.

The sync flow checks the Gist's `updated_at` value before writing and pauses
on conflicts or unreadable cloud data. JSON backup and restore remain
available without enabling sync.

## Project structure

- `index.html` — application shell and modal templates
- `styles.css` — responsive components and theme tokens
- `app.js` — UI, state, persistence, and sync
- `engine.js` — trade math and data contracts
- `motion.js` — animation primitives and reduced-motion behavior
- `icons.js` — bundled inline icon set
- `serve.mjs` — local static preview server
- `docs/WIREFRAME_SPEC.md` — long-term behavior contract
- `V2_NOTES.md` — current-release implementation notes
