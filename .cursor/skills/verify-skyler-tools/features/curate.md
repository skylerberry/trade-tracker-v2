# Curate

Private editor for `data/guide.json`. **Not in the app nav.** Separate page `curate.html`.

## Sub-features

- GitHub token card `#tokenCard` `#tokenInput` `#tokenSave` (hidden until needed)
- Status `#statusLine`, Discard `#discardBtn`, Publish `#publishBtn`
- Themes host `#themesHost` (add `#newThemeName` `#addThemeBtn`)
- Companies `#companiesHost` with filter `#coSearch`
- Back link `.curate-back` → `./#themes`

## How to get to it (user POV)

Open `/curate.html` on the same origin (type the path; no nav item). Without a token it is a read-only viewer of local `data/guide.json`.

## Driving it with verify

```bash
npm run verify -- check curate
npm run verify -- shot curate.html
```

Harness: `GET /curate.html`, wait until `#statusLine` is no longer `Loading…`.

**Observable end state:** `h1` is `Curate Themes`; status mentions `Read-only`; `#themesHost .theme-card` count is > 0.

## Gotchas

- **Publish writes `data/guide.json` to `main`.** Never click `#publishBtn` in a proof run. The check is read-only.
- Without `tradeTracker_curateToken`, GitHub is not called; the page fetches local `data/guide.json`. A missing file is a real failure (`Couldn’t load guide.json.`).
- Scanner lists (`movers.json` / daily-scan) are intentionally out of reach here. Do not expect scan-only names to appear.
- `robots: noindex`. This page is not a public product surface; still prove it if you touch `curate.html` / `curate.js`.
- Chromium requests `/favicon.ico` here (the page has no favicon link). `serve.mjs` 404s that path. Harmless; do not treat that console line as a Curate failure.
