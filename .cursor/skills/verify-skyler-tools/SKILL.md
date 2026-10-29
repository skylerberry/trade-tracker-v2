---
name: verify-skyler-tools
description: Drive skyler.tools (Trader Tools Suite) in a real browser to prove UI behavior. Use before opening a PR that changes Calculator, Journal, Compound, Themes, RS, curate.html, footer chrome, or routing; after any visual change; and whenever you need screenshots, console errors, or on-screen values (e.g. the Themes asOf date) as evidence.
---

# Verify skyler.tools

This checkout is the app that deploys to [skyler.tools](https://skyler.tools). Prove user-visible behavior with the **shipped CLI** in this folder — not ad-hoc Playwright, CDP, or coordinate-click scripts.

```bash
npm run verify -- launch|doctor|shot <route>|check <feature>|cleanup
# same binary:
node .cursor/skills/verify-skyler-tools/cli.mjs <command>
```

Feature journeys, selectors, and hash routes live in [features/](features/README.md). Read the file for the surface you touched before driving it.

## Launch

Start the repo’s own static server (`serve.mjs` via `npm start`). It is idempotent: if our instance is already on the port, it reuses it.

```bash
npm run verify -- launch
```

- Default: `http://127.0.0.1:4173` (`PORT` overrides, same as `npm start`).
- **Usable-ready signal:** the command exits 0 and prints JSON with `"ready": true` and `"ours": true`. That means `GET /` returned HTML containing `Trader Tools Suite` (the same fingerprint `serve.mjs` uses). Do not drive the app before that.
- If this command started the server, JSON includes `"startedByUs": true` and a `pid`. If something else already had our app up, `"startedByUs": false` — **do not kill that process later**.
- State is written to `.cursor/skills/verify-skyler-tools/.run/state.json`.

`npm start` is also fine when you only need a human URL. For scripted proof, use `verify launch` so cleanup knows what you started.

## Doctor

One read-only HTTP check. No browser, no clicks, no writes.

```bash
npm run verify -- doctor
```

Passes when all of these are true:

1. `GET /` is 200 and the HTML includes `Trader Tools Suite` (this checkout, not a random process on 4173).
2. `GET /data/daily-scan.json` is 200 JSON with an `asOf` date (`YYYY-MM-DD`) and a `themes` array.
3. `GET /curate.html` is 200 and the HTML includes `Curate Themes`.

JSON includes the Themes `asOf` value. If doctor fails, launch (or stop the foreign process on the port) and retry. Do not point doctor at skyler.tools or a Netlify preview — this skill proves **this working copy**.

## Drive

`check` is the harness. It opens a real Chrome window (headless by default), dismisses the first-run welcome through the **Start fresh** / **Load sample trades** buttons, clicks nav tabs and labeled controls, and asserts an on-screen end state. It does **not** poke `localStorage`, call internal `setView`, or click by coordinates.

```bash
npm run verify -- check themes
npm run verify -- check calculator
npm run verify -- check journal
npm run verify -- check compound
npm run verify -- check rs
npm run verify -- check curate
npm run verify -- check feedback
npm run verify -- check appearance
npm run verify -- check sync
```

`shot <route>` captures the view without asserting a journey. Prefer `check` when you changed behavior.

```bash
npm run verify -- shot themes
npm run verify -- shot journal/notes
npm run verify -- shot curate.html
```

Routes the harness understands (hash unless noted):

| Route | Nav / URL | Root |
| --- | --- | --- |
| `positions` (aliases: `calc`, `calculator`) | Calculator tab | `#positions` · `#calcSection` |
| `journal` | Journal tab | `#journal` · `#journalTitleline` |
| `journal/notes` | Journal → Notes | `#journal/notes` · `#notesPanel` |
| `compound` | Compound tab | `#compound` · `#compoundView` |
| `themes` | Themes tab | `#themes` · `#themesView` |
| `themes/<id>` | Themes → a row | `#themes/semiconductors` |
| `themes/lookup/<ticker>` | ticker link from Calculator | `#themes/lookup/NVDA` |
| `rs` | RS tab | `#rs` · `#rsView` |
| `curate.html` | `/curate.html` (not in nav) | `h1` Curate Themes |
| `feedback` | footer **feedback** | `#footerFeedback` → modal |

There is **no Monitor tab**. Guide is not a view (`guide.js` is leftover data code; Themes is the surface). Click `#viewSeg [data-seg="…"]`, not x/y.

## Evidence

Every `check` and `shot` writes a named folder under `.cursor/skills/verify-skyler-tools/evidence/<stamp>-<name>/`:

- `before.png` — view before the proving action
- `after.png` — view after the proving action (or the captured route for `shot`)
- `report.json` — pass/fail, hash, **data values shown on screen** (Themes `#themes-asof`, share count, compound hero, …), and `consoleErrors` / `pageErrors`

Proof is what the user would see. Example: Themes is proven when `#themes-asof` reads `Updated after the close · …` and opening a `button.tracker-row[data-theme]` shows that theme’s `h2` — not when `daily-scan.json` parses.

Keep the folder. Copy the screenshots into the run’s artifacts directory when you open a PR.

## Cleanup

```bash
npm run verify -- cleanup
```

Kills **only** the `serve.mjs` this skill started (`startedByUs` in the state file). Leaves an already-running `npm start` alone. Deletes `.run/state.json`. **Does not delete evidence.** Confirm the evidence folder is still on disk after cleanup.

## Helpers

| Helper | Where |
| --- | --- |
| Feature map | [features/README.md](features/README.md) and one file per surface |
| Chrome | system Chrome / Chromium (`CHROME_PATH` to override). `playwright-core` is a **devDependency** — `npm install` once. |
| Port | `PORT` (default 4173), same as `serve.mjs` |
| Evidence root | `VERIFY_EVIDENCE` (default: `evidence/` in this skill) |
| Headed debug | `VERIFY_HEADED=1` |
| Fingerprint | HTML contains `Trader Tools Suite` |
| First-run modal | `#modalRoot .welcome-card` → `.wc-fresh` (Start fresh) or `.wc-sample` (Load sample trades). Never set `tradeTracker_v2Prefs` yourself. |
| Empty calculator | `#seedDemo` is the user path for sample trades if the welcome is already gone |

Install before the first drive:

```bash
npm install
npm run verify -- launch
npm run verify -- doctor
npm run verify -- check themes
npm run verify -- cleanup
```
