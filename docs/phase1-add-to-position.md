# Phase 1: Add-to-Position Calculator

## What I learned from the source

Spreadsheet (`Tracker & Calcs.xlsx`, **Calculators** sheet, columns G-H, rows 16-27) confirms the formula and the freeroll edge case. Decomposed:

```
sharesToAdd = ROUND(
    (Account · Risk%  −  CurShares · (CurAvg − NewStop))
    ─────────────────────────────────────────────────────
                 (NewAddPrice − NewStop)
)
```

| Term | Meaning |
|---|---|
| `Account · Risk%` | Total $ risk budget |
| `CurShares · (CurAvg − NewStop)` | Risk already on the books vs the **new** stop |
| `(NewAddPrice − NewStop)` | Per-new-share risk |

**Freeroll case** is just `CurAvg < NewStop` → middle term goes negative → numerator inflates → bigger add. Mathematically: existing shares already have a profit cushion against the new stop, so new shares can absorb more drawdown without busting the risk budget. Right answer, surprising answer — **UI must explain.**

Other outputs (H25-H27):
- `newAvg = ((CurShares · CurAvg) + (AddShares · AddPrice)) / (CurShares + AddShares)`
- `newSLWidthPct = (newAvg − NewStop) / newAvg`
- `newPositionSize = (CurShares + AddShares) · newAvg`

## Codebase reality check

- **`app.js:743 renderTradeActions`** — three button slots per row (Manage / Edit / Delete). Add-to fits cleanly here for active trades.
- **`app.js:4644 getCurrentPosition`** — reads `trade.entryPrice` + `sellPlan.initialShares` + `sales[]`. **Has no concept of position adds today.** Average cost = entry price. This is the central data-model gap.
- **`app.js:4857 openQuickSellModal`** — perfect template. Modal shell, `qs-*` CSS classes, escape handler, `window.openX` exposure pattern. Mirror it exactly.
- **`app.js:5154 calculateOpenHeat`** — reads `(entryPrice − currentSL) × shares`. Today this would silently lie if a position has been added to. Phase 1b will need to update this.

## Recommended scope

Split into **1a** (calculator only, ship now) and **1b** (persisted adds, ship next).

1a delivers the value — the math is what's hard to do in your head. 1b makes it durable in the data model. Doing both at once doubles the PR size and risk.

---

## Phase 1a — Calculator modal (this PR)

**Entry point:** new "Add to Position" icon button in `renderTradeActions` for active trades only (open / partially_closed). Plus icon, between Manage and Edit. Hidden for terminal/archived rows.

**Modal `#addPositionModal`** — clone of Quick Sell shell, new `.add-position-modal` class, `ap-*` element IDs.

```
┌─ Add to QQQ ─────────────────────────────────  ×
│  Current avg: $28.50 · 500 shares · Acct $100k · Risk 1%
│
│  ⓘ Stop is above your average — existing shares are at
│     risk-free or better against this stop, so the calculator
│     allowed a larger add. Verify this is the size you
│     actually want.                (only shown when applicable)
│
│  New add price        New stop loss
│  [$ 28.50  +/-]       [$ 25.50  +/-]
│
│  ┌─────────────────────────────────────────┐
│  │  583 shares to add                       │
│  │  New avg          $25.96                 │
│  │  New SL width     1.78%                  │
│  │  New position     $28,116                │
│  └─────────────────────────────────────────┘
│
│  [Copy to clipboard]                  [Done]
└────────────────────────────────────────────────
```

### Pre-fill rules

| Field | Source |
|---|---|
| `CurAvg` | `getEffectiveAvg(trade)` — see shim below |
| `CurShares` | `getCurrentPosition(trade).remaining` when available; **always editable**, empty placeholder otherwise |
| `Account` | global `accountSize` |
| `Risk%` | **editable field in modal**, pre-filled with user's saved default |
| `NewAddPrice` | empty (user always types this) |
| `NewStop` | `trade.currentSL` |

**`getEffectiveAvg(trade)` shim** — added in 1a, body just returns `trade.entryPrice` for now. Exists as a single seam so 1b's data-model change only touches one function. 1b also adds `getEffectiveShares` and `getEffectiveRiskPerShare` alongside it.

**Why CurShares is always editable, not just a fallback chain:** `getCurrentPosition` returns `null` whenever a trade has no `sellPlan` (manual "+ Add New Trade" form path — `index.html:314-377` has no shares input) or `sellPlan.enabled === false`. For those trades there's no honest way to compute current shares: there's no `initialShares` field, and `sales[]` uses fractional portions (`"1/3"`) not absolute counts. Rather than guessing from `snapshot.shares` (stale for partials), make `CurShares` always-editable like Risk%: pre-fill when confident, empty placeholder otherwise.

**Why Risk% is editable in the modal:** pyramiding often warrants different (typically smaller) risk than fresh entries. Forcing the user out to change a global default is friction. Pre-fill with default; let them override per-add.

### Validation / error states

| Condition | Treatment |
|---|---|
| `NewStop ≥ NewAddPrice` | Disable output card; inline error "Stop must be below add price" (mirrors `#calcStopLossError` at index.html:172) |
| `CurAvg < NewStop` (freeroll) | Show informational banner. Compute normally. **Not** an error. |
| `sharesToAdd ≤ 0` | "No room to add — existing position already at or above the risk budget vs this stop" |
| `accountSize` not set | Disable action button on the row; tooltip "Set account size in calculator first" |
| Total position $ would exceed user's **Max % of Account** setting | Non-blocking warning beneath the output card: "This would be 67% of your account, above your 50% max." Risk math is honest; position-size cap shouldn't be silently violated. |

### Copy button (v1)

Single button copies just the share count (`583`). That's the number going into a broker order. Multi-line "share trade" formatting is a Phase 2+ feature, not a v1 concern.

### Files changed in 1a

| File | Changes |
|---|---|
| `index.html` | New `<div id="addPositionModal" class="modal hidden">…` block near `quickSellModal` (~line 779). |
| `app.js` | (1) New action button in `renderTradeActions` (line 805 active-trades branch, line 743 render fn). (2) New section ~line 4853 mirroring Quick Sell: `openAddPositionModal`, `closeAddPositionModal`, `recomputeAddPosition`, `copyAddPositionResult`. (3) Wire input listeners + escape key. (4) Expose via `window.openAddPositionModal`. |
| `styles.css` | New `.add-position-modal` + `.ap-*` block. Reuse `qs-*` token values directly — only override what differs. Both light + dark + media-query selectors per `DESIGN_SYSTEM.md` checklist. |

No changes to data model. No changes to existing functions. ~250-300 lines of additions, fully isolated.

---

## Phase 1b — Persisted adds (next PR)

Scoped here so we know what we're growing into.

- **New schema:** `trade.adds: [{ shares, price, date, newStop }]`
- **New helpers:** `getEffectiveAvg(trade)`, `getEffectiveShares(trade)`, `getEffectiveRiskPerShare(trade)`. Replace direct `trade.entryPrice` reads in:
  - `calculateOpenHeat` (app.js:5154)
  - `getCurrentPosition` + sellPlan progress renderer
  - `updateQuickSellProfit` (P&L calc would otherwise understate gains on adds)
  - Snapshot display + Position Snapshot section
- **Migration:** existing trades have `adds === undefined` → effective values fall back to current behavior. No data migration needed.
- **Modal grows** a "Log Add" primary button alongside "Copy to clipboard".

**Why split:** 1b touches Open Risk math, Quick Sell P&L, and the trade-details snapshot. Each is a separate verification surface. 1a touches only new code.

---

## Decisions (resolved)

1. **Action-button placement** — between Manage and Edit, plus icon. Verify in mockup that the row-level "+" doesn't visually conflate with the section-level "+ Add New Trade" button (different size/context should handle it, but worth a check).
2. **Default risk %** — pre-fill with user's **Set as default** value, but keep the field editable in the modal so per-add overrides don't require a global setting change.
3. **ROUND not ROUNDUP** — for adds, ROUND is the right choice on its own merits: ROUNDUP would systematically bias every pyramid slightly above the risk budget, and pyramid sizing should err toward restraint. (Position Size Calc uses ROUNDUP for fresh entries to *guarantee* hitting the risk target — different goal, different choice.)
4. **Phase 1b is split.** Ship 1a, live with it for a week, then 1b with that real-use feedback baked in.
