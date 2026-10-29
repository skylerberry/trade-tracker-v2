# Calculator

Position sizing. Nav label **Calculator** (narrow: **Calc**). Internal view id is `positions`, not `calc`.

## Sub-features

- Long / short (`#directionSeg`) and shares / options (`#vehicleSeg`)
- Account size `#accountSize`, risk `#riskSeg`, max % `#maxSeg`
- Entry `#entryPrice`, stop `#stopLoss`, ticker `#tickerInput`, target `#targetPrice`
- Risk scenarios `#riskScenarios`, results `#sharesHero` `#rTotalRisk` `#rPosSize`
- Freeroll plan `#planSeg`, **Log trade** `#logTradeBtn`
- Watchlist `#watchSection`, manual add `#formSection`
- Paste alert `#pasteAlertBtn`, clear `#clearCalc`
- Empty table `#emptyState` with `#seedDemo` (Load sample trades)

## How to get to it (user POV)

Open the app (first visit: **Start fresh** or **Load sample trades**). The Calculator tab is the default (`#positions`). Or click **Calculator** in the top nav. Brand link `.brand-name` also goes to `#positions`.

## Driving it with verify

```bash
npm run verify -- check calculator
npm run verify -- shot positions
```

Harness: dismiss welcome with **Start fresh**, click `#viewSeg [data-seg="positions"]`, type entry `100`, stop `95`, ticker `NVDA` into the real inputs.

**Observable end state:** `#sharesHero` reads `25` (default $25,000 account, 0.5% risk, 20% cap does not bind). `#calcModeContextText` stays `Long shares`. `#rTotalRisk` and `#rPosSize` are filled, not `—`.

## Gotchas

- Hash is `#positions`. `#calc` is not a view (`viewFromHash` falls back to positions for unknown hashes).
- First visit always shows `#modalRoot .welcome-card`. Dismiss it through `.wc-fresh` / `.wc-sample`, never by writing `tradeTracker_v2Prefs`.
- `#logTradeBtn` stays `aria-disabled` until size is valid. Logging a trade is a separate journey; this check only proves sizing.
- Option sizing is calculator-only — FAQ states option trades cannot be logged yet. Do not treat a missing log as a bug in options mode.
- Empty tracker (`#emptyState`) is the honest zero-trade state. `#seedDemo` is the user path if a later step needs rows.
