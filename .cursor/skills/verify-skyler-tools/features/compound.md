# Compound

Ten-year compound calculator. Nav label **Compound**.

## Sub-features

- Starting capital `#compoundStartingCapital` and presets `#compoundPresets [data-capital]`
- Deposits / withdrawals `#contributionModeToggle [data-mode]`
- Rate chips `#compoundRates [data-rate]` and year map `#compoundTable`
- Hero `#compoundHeroEnd` `#compoundHeroRate` `#compoundHeroPace`
- Path chart `#compoundChart` and year scrub `#compoundYearScrub`
- How it works `#compoundHowToggle`

## How to get to it (user POV)

Click **Compound** in the top nav, or open `#compound`.

## Driving it with verify

```bash
npm run verify -- check compound
npm run verify -- shot compound
```

Harness: click `#viewSeg [data-seg="compound"]`, then `$25K` (`[data-capital="25000"]`) and `20%` (`[data-rate="20"]`).

**Observable end state:** `#compoundView` is visible, `#compoundTitle` is `Compound calculator`, `#compoundHeroEnd` contains a numeric 10-year value and the words `after 10 years`.

## Gotchas

- Default selected rate in code is **50%**, not 10%. The 10% line is the comparison baseline on the chart, not the selected path.
- Metrics `#metricsBlock` hide on Compound (and Themes / RS). Do not treat a missing scoreboard as a regression on this view.
- Projection copy states constant annual return, no taxes/fees/inflation. Do not “fix” the hero to a real-world CAGR.
- No seed data required.
