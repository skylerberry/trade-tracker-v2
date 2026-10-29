# Agent runbook — skyler.tools (this checkout)

Live: [skyler.tools](https://skyler.tools) · local: `npm start` → http://localhost:4173

This folder is the working copy that deploys. Path: `/Users/skylerberry/Projects/skyler-tools-publish`. Do not compile Themes in `skyler-tools-v2`.

## Themes (after the close)

`/themes-update` is the daily job: weekday + 16:15 ET checks, refresh `data/daily-scan.json`, test, commit that file, push `main` (15 Netlify credits). Discord clustering is `/daily-scan` (roster only). Other work still does not push `main` unless the slice is done.

## Before “look at the browser”

Run `npm start` in this repo (safe if already up). Give Skyler the printed laptop URL and, if they need a phone, the LAN URL. Do not assume yesterday’s server is still running.

## Do not publish by default

Pushes to `main` deploy production (`netlify deploy --prod`) and cost **15 Netlify credits** each.

- Work on localhost. Commit locally if they want a snapshot.
- Phone on this Wi-Fi → LAN URL from `npm start`. Off-network → Netlify preview / branch deploy (0 credits), not prod.
- Push `main` / “ship it” / “put it live” only when a **done slice** is ready — stop and say so if they ask mid-tweak.

`localhost` ≠ Preview URL ≠ skyler.tools.

## Prove UI changes

Before opening a PR that changes what people see, follow `.cursor/skills/verify-skyler-tools/SKILL.md`. Use the shipped CLI (`npm run verify -- launch|doctor|check <feature>|shot <route>|cleanup`) to drive Calculator, Journal, Compound, Themes, RS, curate, or footer chrome in a real browser. Keep the evidence folder. Do not ask a human to click through the app for you.
