# Trade Tracker — Wireframe & Behavior Spec

**Purpose.** This is the visual-agnostic contract for lite.skyler.tools (the "lite" risk calculator + position tracker). It documents layout structure, information hierarchy, interaction flows, and math/data must-haves — so any implementation session can re-skin or re-interpret the design freely while preserving what makes the tool work.

**What this spec deliberately does NOT constrain:** colors, themes, typography, spacing values, border/shadow treatment, iconography, animation style, component library. Those are the interpreter's choices. Everything below IS binding unless marked *(optional)*.

**The user** is a systematic momentum stock trader. Core workflow: enter with a tight stop for large size → trim heavily into 1R–2R (or raise stop to breakeven) so the trade is risk-free ("freerolled") → let the runner work. Speed during market hours is the top design value: the critical paths are measured in taps, not features.

---

## 1. Page skeleton

Single-page app, one vertical column, no routing.

```
┌──────────────────────────────────────────────────────────────┐
│ HEADER  (identity · open risk · scoreboard · sync · prefs)   │
├──────────────────────────────────────────────────────────────┤
│ [toggle] Position Calculator  (collapsible panel)            │
├──────────────────────────────────────────────────────────────┤
│ Watchlist strip (collapsible)                                │
├──────────────────────────────────────────────────────────────┤
│ [toggle] + Add New Trade  (collapsible manual form)          │
├──────────────────────────────────────────────────────────────┤
│ FILTERS BAR  (status · date range · exports · sync config)   │
├──────────────────────────────────────────────────────────────┤
│ TRADES TABLE                                                 │
├──────────────────────────────────────────────────────────────┤
│ FOOTER  (closed-filter totals · pagination)                  │
└──────────────────────────────────────────────────────────────┘
+ modal layer (stacked dialogs) + toast layer
```

Wide content (the table) scrolls horizontally inside its own container; the page body never scrolls sideways.

---

## 2. Header

Hierarchy rule: **numbers outrank branding.** The app title exists but is visually subordinate to the two live metrics.

1. **Open Risk block — the #1 metric.** Total account risk from non-freerolled positions: dollar amount, percent of account, and a level badge with exactly these states: `CASH` (no open risk), `FREEROLLED`, `LOW`, `MED`, `HIGH`. Must be visible without scrolling, at all times.
2. **Scoreboard strip.** One line: `<Month> · N trades · X% win · +Y.YR · exp +Z.ZZR`, with:
   - a **scope toggle** `[month | all]` (persisted choice)
   - **empty state is an invitation**, not a blank: `"July · 2 trades logged — stats unlock as you log"` (shown when < 3 closed trades in scope)
   - when legacy trades lack share counts: quiet note/tooltip `"N trades excluded (no share counts)"`
   - **streak chip** *(optional)*: `"7d"` with tooltip "7-day logging streak · best 12d" — muted, no gamification styling
   - **stale-positions chip**: `"2 stale positions"` when open trades have no exit/edit in ≥5 days; clicking filters the table to them and opens the Trim/Exit modal on the first
3. Sync status (linked/unlinked/last-synced/error) and a display-preference toggle *(optional chrome)*.

---

## 3. Position calculator (collapsible panel)

**2.0 direction/instrument extension.** A mode rail precedes the settings:
`Long · Short` and `Shares · Option`. Existing trades without a direction are
treated as long. Shares support the complete tracking workflow in both
directions. Option mode sizes purchased calls (long direction) or purchased
puts (short direction) from manual entry delta and premium; it is calculator-
only in the initial release and must not imply support for writing options.

### 3a. Settings row
- **Account size** input (persisted across sessions and synced).
- **Risk %** preset group: `.1% · .25% · .5% · 1% · Custom` + "set as default" affordance.
- **Max % of account** preset group: `5 · 10 · 20 · 50 · 100 · Custom` + "set as default".

### 3b. Inputs row
Four fields, in this order: **Entry Price**, **Stop Loss**, **Ticker** *(optional field)*, **Target Price** *(optional field)*.

Option mode adds **Entry Delta** and **Option Premium** after the common four
fields. Premium is required; delta is entered manually as an absolute value in
`(0, 1]` and is always described as a first-order estimate, not a live quote.

- Entry/Stop/Target carry fine-adjust steppers (+/−); Stop has a "Copy" affordance.
- **Direction-aware stop validation:** once both prices are present, a long/call
  stop must sit below entry and a short/put stop must sit above entry. A
  wrong-side stop is marked inline and paired with an immediate `Switch to
  Short` / `Switch to Long` action that preserves the entered prices and
  recalculates in the new direction.
- Ticker links out to the ticker's chart (TradingView) when filled.
- A "Clear Calculator" control resets inputs.
- **Keyboard contract (binding):** Tab order is Account → Entry → Stop → Ticker → Target (presets/steppers are excluded from tab order). Enter in a field advances to the next; field content auto-selects on focus so typing replaces. On small screens, committing the Stop field scrolls the results into view.
- **Paste import:** a "Paste Alert" button opens a paste box for a Discord-style alert (`$TICKER @ entry sl stop risk X%`), parsed into the fields. Additionally, pasting alert text **anywhere on the page** (outside inputs) imports it directly.

### 3c. Results — two side-by-side cards (binding layout relationship)

The results are a **pair**: a filled "position" card and a "projection" card, side by side on desktop, stacked on narrow screens. The Shares number is the hero of the whole panel — largest number on the page.

```
┌───────────────────────────────┐  ┌───────────────────────────────┐
│           1,000               │  │  AT TARGET (2.9R)             │
│           SHARES        [⤓]   │  │                               │
│  ───────────────────────────  │  │        +$2,900.00             │
│  Stop Distance   $0.10 (2.4%) │  │                               │
│  Position Size      $4,100.00 │  │  Target Price        104.10   │
│  Total Risk   $100.00 (1.00%) │  │  Profit Per Share     $2.90   │
│  % of Account         41.00%  │  │  ROI                  7.07%   │
└───────────────────────────────┘  │  R/R Multiple          2.9    │
                                   └───────────────────────────────┘
```

- **Shares card:** hero share count; a click on it copies the count; an export icon opens the trade-card export modal *(deferred in the 2.0 initial release)*. Rows: stop distance ($ and %), position size, total risk ($ and %), % of account.
- **Cap display:** when the max-%-of-account cap clamps the position, show `original → capped` (e.g. `1,000 → 609`) — but **every downstream consumer (export, snapshot, sell plan, copy) uses the capped number**. State must come from computation, never parsed back out of rendered text.
- **At Target card:** empty/dashed until a target is set; then target price, profit per share, ROI, R/R multiple. Header carries the R multiple: `AT TARGET (2.9R)`.
- **Option-mode cards:** contract count replaces shares. Rows show estimated
  stop loss per contract, premium outlay, full-premium max loss, and estimated
  stop risk. Target data is explicitly for the underlying (target price,
  underlying move/ROI, and R); option target P&L must not be inferred from the
  entry delta.

### 3d. Freeroll plan card (replaces any R-ladder grid)

```
FREEROLL PLAN   [ ½ @ 1R ] [ ⅓ @ 2R ] [ Back-fill ] [ Off ]
[arrow-right icon] Sell 500 shs (½) @ $101.00 → lock +$500.00, risk → $0 [shield-check icon]
  1R 101.00 · 2R 102.00 · 3R 103.00 · 4R 104.00 · 5R 105.00
```

- **Segmented preset control**, exactly these four choices (persisted): `½ @ 1R` (sell half at 1R), `⅓ @ 2R` (sell a third at 2R), `Back-fill` (sell nothing; at 1R raise stop to breakeven), `Off`.
- **Action sentence** with the real numbers, updating live with the calculator. Back-fill reads: `[arrow-right icon] At $101.00 (1R), raise stop to $100.00 → risk → $0`. Off reads quietly: `No plan — manual management`. The freeroll moment (risk → $0) is the visual anchor of the sentence.
- **R-price line** (quiet, small): 1R–5R prices for setting chart alerts. Clicking a price copies it to the clipboard with confirmation. It must never mutate calculator inputs.

### 3e. Log Trade (one-click, binding)

A single primary action. Clicking it **saves the trade immediately** (no form round-trip): ticker, entry, stop, share count, snapshot of the calc state, the active freeroll plan, today's date, derived status. The button area swaps to an inline confirm strip for ~8s:

```
[circle-check icon] NVDA logged — 1,000 shs, risking $100.00 (1.0%)   [Undo]  [Edit details]
```

Undo removes the trade; "Edit details" opens the manual form in edit mode. A same-ticker+entry+date double-click must not duplicate.

---

## 4. Watchlist strip

Collapsible row: label + count badge, ticker pills (each links to its chart, each removable), an Edit affordance opening a management modal *(deferred in the 2.0 initial release)*, and a quick-add input. Ticker validation identical between quick-add and modal paths.

## 5. Manual Add/Edit trade form

For backfill and edits only (the calculator is the primary entry path). Fields: ticker, entry price, entry date, initial stop, current stop (with a "= Initial" copy button), legacy sale rows, and no user-facing status control — **status is always derived from exits** (open / partially closed / closed / stopped out). Editing sales or entry/stop rebuilds the trade's exits so derived numbers can't desync. Legacy sale-row editing is *(deferred in the 2.0 initial release)*.

---

## 6. Tracker — filters bar

Left to right: **status filter** (All Active / Open / Freerolled / Partially closed / Closed / Stopped out / Archived — values must match derived statuses), **date range** picker + clear, then export actions: **PDF export** (open trades; *deferred in the 2.0 initial release*), an **Export menu** (Download CSV / Download TSV / Copy for Excel), and **sync configuration**.

## 7. Tracker — the table

Column contract (order binding, labels adjustable):

| # | Column | Content |
|---|--------|---------|
| 1 | **Ticker** | Bold symbol; sub-line beneath: `Jul 2 · 1,000 shs` (entry date · original size; size omitted when unknown) |
| 2 | **Entry** | Entry price |
| 3 | **Stop** | *Current* stop; when it differs from initial, initial shown as sub-line/tooltip |
| 4 | **Realized** | Realized P&L from exits: `+$500.00` / `−$120.00` / `—` when uncomputable. Never render a wrong number: unknown = "—" |
| 5 | **R** | Realized R: `+1.0R`; `BE` tag when closed and \|R\| < 0.05; `—` when unknown |
| 6 | **Next** | The next-action chip (see below) + a `⋯` affordance opening the Trim/Exit modal |
| 7 | **Status** | Badge (derived status) + sell-plan progress dots |
| 8 | **Actions** | Icon buttons: Manage (details), Add to Position, Edit, Archive, Delete — every icon-only button carries an accessible name + tooltip |

Numeric columns use tabular numerals. All user-entered strings are escaped at render.

### Next-action chip semantics (binding)

| Trade state | Chip | One click does |
|---|---|---|
| Pending sell target | `Sell 500 @ 101.00` | Records the exit at plan values, marks the target executed, re-derives status, toast with **Undo** (`Sold 500 NVDA @ 101.00 · +$500 locked · FREEROLLED [shield-check icon]` — freeroll suffix only when the flip happens) |
| Pending back-fill target | `Stop → 100.00` | Raises current stop to breakeven, marks target executed (no exit record), toast + Undo |
| Freerolled, no pending targets | quiet `[shield-check icon] runner` text | — (⋯ still opens the modal) |
| Open, no plan | `Trim…` | Opens the Trim/Exit modal |
| Closed / archived | empty | — |

Chip execution clamps planned shares to remaining. Undo fully reverses: exit removed, target un-executed, stop restored, status re-derived.

## 8. Footer

When the status filter shows closed trades: totals line `14 closed · 9W/5L · +11.2R · +$3,480`. Pagination when > 1 page; the totals line renders even on single pages.

---

## 9. Modal layer — global contract (binding)

One shared modal manager:
- Modals **stack**; Escape closes only the topmost; backdrop click closes; body scroll locks while any modal is open.
- Focus: opener element remembered, primary input autofocused (+selected) on open, focus returned on close.
- Every dialog: proper dialog semantics (`role="dialog"`, labelled), an `x` Lucide close icon, and Enter submits from its primary inputs.

### 9a. Trim/Exit modal (the market-hours workhorse)

```
┌─ Trim / Exit  NVDA ─────────────────────── [x icon] ┐
│ Entry $100.00 · 500 shares remaining                │
│                                                     │
│ (only when size unknown:)                           │
│ Position size?  [____] shares — needed to track P&L │
│                                                     │
│ Exit price                                          │
│ [ 101.00        ]                                   │
│ [1R · 101.00] [2R · 102.00] [3R · 103.00] [5R·105.00]│
│                                                     │
│ Shares to sell                                      │
│ [ 250     ]  of 500 remaining                       │
│ [½ (250)] [⅓ (166)] [¼ (125)] [All (500)]           │
│                                                     │
│ Date  [ 5 Jul 2026 ]                                │
│                                                     │
│ New stop (optional)  [ keep 99.00 ]  [BE]           │
│                                                     │
│ Selling 250 shs → +$250.00 · +1.0R ·                │
│ remaining 250 shs · risk $0 → FREEROLL [shield icon]│
│                                                     │
│              [ Cancel ]   [ Confirm ]               │
└─────────────────────────────────────────────────────┘
```

Binding behaviors:
- Works for **every** trade. Unknown position size → asks once, persists on confirm.
- **Freeroll Risk Manager is on by default.** With it on, entering a profitable
  exit price or pressing `1R · 2R · 3R · 5R` fills the price and the minimum
  whole-share trim that reduces net open risk to $0 while leaving a runner.
  The calculation uses remaining shares, realized P&L, the current stop, and
  direction. On a fresh position this resolves to ½ at 1R, ⅓ at 2R, ¼ at 3R,
  and ⅙ at 5R (always rounded up when needed to remove all risk).
- Turning Risk Manager off unlocks the share field and fraction presets for a
  discretionary trim or regular exit. R buttons then fill price only. Fraction
  presets are **fractions of remaining** and recompute live (including while
  the size field is being typed). "All" is the full-exit path and opens with
  Risk Manager off so the explicit close intent is preserved.
- Live preview line: shares → P&L → R → remaining → resulting risk, with the freeroll flip called out.
- "BE" one-tap fills the post-trim breakeven stop (entry − realized/remaining).
- Clamp: cannot sell more than remaining (inline error, not a system dialog). Enter submits. Off-plan prices only link to a plan target when within ±0.5% of it.
- Opening "exit remaining position" flows preselect **All**.

### 9b. Trade Details modal *(deferred in the 2.0 initial release)*
Sections in order: trade overview (prices, dates, status) → calculator snapshot (if captured) → **Position Progress** (per-exit rows: shares @ price, R each; plan targets with executed/pending state; "Log Sale"/trim entry points) → per-trade **journal** (typed entries: Entry Thesis / During Trade / Exit Review / Lessons Learned; up to 3 images per entry) → archive/delete.

### 9c. Other modals
**Add to Position** (pyramiding: new shares + price → effective average, updated risk, freeroll banner), **Export trade card** (image export with privacy mode toggle; *deferred in the 2.0 initial release*), **Sync setup** (token + gist link/verify/unlink, plus token-free **Download backup / Restore from file**), **Keyboard shortcuts** (recordable bindings; *deferred in the 2.0 initial release*), **Watchlist editor** *(deferred in the 2.0 initial release)*, **Paste alert**.

### 9d. Toasts
Single toast surface, polite live-region. Variants: neutral, error (visually distinct), and action toasts carrying an **Undo** button (used by: trade delete, chip execution, trim confirm). Destructive actions prefer immediate-action + Undo over confirm dialogs (exception: whole-dataset operations keep explicit confirms).

---

## 10. Data & math contracts (binding — this is the product)

### Exits model
```
trade.exits: [{ id, shares, price, date, rMultiple, kind: 'trim'|'close'|'stop', estimated? }]
```
One canonical record of executions. Plans (`sellPlan.targets[]`) stay separate; an executed target back-links its exit. Never store the same execution in two places with independent numbers.

### Engine (pure functions; null = "unknown", never NaN, never a guessed number)
`getOriginalShares · getRemainingShares · getRealizedPnL (0 = known zero) · getRealizedR · getOpenRiskDollars · isFreeRolled · freerollSharesAtPrice · deriveStatus` — every renderer shows `—` for null.

### Math rules
- `directionSign = +1` for long and `−1` for short. Missing direction migrates
  to long.
- `riskPerShare = round4((entry − initialStop) × directionSign)` — cents-normalized so float noise never changes a share count (4.10/4.00/$100 risk = exactly 1,000 shares).
- `rMultiple = ((exitPrice − entry) × directionSign) / riskPerShare`, frozen at write time.
- Purchased option sizing estimates premium loss/share as
  `min(premium, abs(delta) × riskPerShare)`, multiplies by 100 per contract,
  and uses the smaller contract count allowed by the risk budget and maximum
  premium allocation. `premium × 100 × contracts` is always exposed as the
  full-premium max loss.
- **Freerolled** = realized P&L ≥ remaining open risk at current stop (or an executed plan target).
- `freerollSharesAtPrice` solves the minimum integer `n` where realized P&L
  after the proposed trim covers the current-stop risk of the remaining
  shares. It returns `0` when already risk-free and `null` when inputs are
  unknown, the price is not profitable, or no runner can remain.
- **Derived status**: closed when remaining = 0; stopped-out when closed and
  the last exit reaches/passes the initial stop in the adverse direction;
  partial when any exit; else open.
- Dates are `YYYY-MM-DD`, parsed **and written** as local time (UTC parsing/stamping shifts a day in western timezones — both directions must be guarded).
- Stats: win = P&L > 0, loss = P&L < 0, BE band \|R\| < 0.05 excluded from both; `expectancy = avgWinR·winRate − |avgLossR|·(1−winRate)`; unknown-P&L trades excluded and counted. Month scope keys off last exit date.

### Sell-plan presets
`half-1r` → one target (rLevel 1, half the original shares). `third-2r` → one target (rLevel 2, a third). `backfill` → one zero-share target at 1R that raises the stop. `off` → no plan. Legacy multi-target plans must still render and execute generically.

### Persistence & sync safety
- Local-first: first paint renders from local storage before any network.
- Cloud sync (GitHub Gist): truncation-safe reads, never overwrite cloud with empty data after a failed read, conflict check before push, pending writes flushed on tab close, single write queue.
- Token-free JSON backup/restore as the safety net.
- CSV/TSV export includes: ticker, dates, prices, share counts, realized P&L/R, status, and exits serialized as `"500@101.00 2026-07-02; …"`.

---

## 11. Critical-path budgets (the soul of the app — binding)

| Flow | Budget |
|---|---|
| Calculator filled → trade logged | **1 click** (+ optional Undo) |
| Planned trim when price tags the level | **1 click** from the table row |
| Off-plan trim | ≤ 3 interactions: open modal → preset(s) → Enter |
| Sell everything (day-trade exit) | open modal → **All** → price → Enter |
| See how the month is going | **0 clicks** (header scoreboard) |
| Know current account risk | **0 clicks** (header, always visible) |

## 12. Accessibility & responsiveness floors

Keyboard completes every critical path; visible focus states; icon buttons have accessible names; toasts announce politely; reduced-motion preference disables pulses/animation; inputs ≥16px effective size on touch (no zoom-on-focus); tap targets comfortable on phone; the table is the only horizontal scroller.
