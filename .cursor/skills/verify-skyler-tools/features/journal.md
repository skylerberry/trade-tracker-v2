# Journal

Trade review and free notes. Nav label **Journal**.

## Sub-features

- Trades / Notes tabs `#journalTabSeg` (`data-seg="trades"|"notes"`)
- All-time summary `#journalSummary` (`#jsPnl`, `#jsWinRate`, `#jsRecord`, `#jsR`, …)
- Equity curve `#equityCard` `#equityChart` (hidden until there is at least one exit)
- Status filters `#journalSeg` (All / Closed / Winners / Losers / Open / Archived)
- Shared trades table `#tradesTable` (same DOM as Calculator, different filters)
- Free notes `#notesPanel` `#notesList` `#notesNew` at `#journal/notes`
- Per-trade journal entries live on the expanded table row, not on the Notes tab

## How to get to it (user POV)

Click **Journal** in the top nav, or open `#journal`. Switch to Notes with the **Notes** segment or `#journal/notes`.

## Driving it with verify

```bash
npm run verify -- check journal
npm run verify -- shot journal
npm run verify -- shot journal/notes
```

Harness: if the welcome is up, click **Load sample trades** (`.wc-sample`); otherwise click `#seedDemo` when the empty state is showing. Then click **Journal**, read `#jsPnl`, click **Notes**.

**Observable end state:** `#journalTitle` is `Trade journal`, Notes shows `#notesPanel` and `#notesNew`, `location.hash` is `#journal/notes`.

## Gotchas

- **Seed data:** a brand-new profile has no trades. Equity `#equityCard` stays hidden and summary cells can be `$0.00` / `0%` / `0W / 0L` until a trade with an exit exists. The check uses the **Load sample trades** button (welcome or `#seedDemo`) — that is the user path. Do not inject `tradeTracker_trades`.
- Sample seed includes HOOD / CRDO / IONQ / ANET / RGTI. ANET is closed (two exits); RGTI is stopped. Those are what make `#jsPnl` and the equity curve non-empty.
- Performance totals and the equity curve ignore the status/date/search filters (see How it works copy). A filtered table that still shows a big P&L is not a bug.
- Notes search reuses `#tradeSearch` with a different placeholder when `body[data-journal-tab=notes]`.
