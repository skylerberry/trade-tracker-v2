# Expanded position card — metadata blocks + plan rail

Status: **spec only, not implemented.** Written 2026-08-13.
Companion mock: `docs/mockups/plan-rail.html`.
Target surface: `buildRail(t)` in `app.js` (the expanded tracker row), **not** the
calculator. This does not touch `WIREFRAME_SPEC.md` §3d, which specs the
calculator's pre-trade Freeroll Plan card — a different surface with a different job.

---

## 1. Why

Two problems in the current expanded card.

**The event metadata is styled as a footnote.** `buildRail` builds each event's
second line as one concatenated string:

```
`${fmtDateShort(t.entryDate)} · stop ${fmtPrice(t.initialSL)}${rps !== null ? ' · risk / share $' + rps.toFixed(2) : ''}`
```

rendered into `.rail-line2`. Initial stop and risk-per-share are the two numbers
that define the trade, and they sit at small size in muted gray behind a date,
reading as prose. They should read as data.

**The card's lower-left is empty.** The right column already carries stats plus
the journal; the void is under the Trim/Exit buttons. Nothing in the card shows
the *shape* of the position — where size came off, where it is planned to come
off, and how much is still exposed.

---

## 2. Surface A — event metadata blocks

Replace the trailing `· a · b · c` run-on with a bordered horizontal spec strip
beneath each event's title line. Date moves to the right of the title.

```
● Long entry — 140 shares @ $10.00                    Aug 7 · 9:41 AM PT
  ┌──────────────┬──────────────┬──────────────┬──────────────┐
  │ INITIAL STOP │ RISK / SHARE │ TOTAL RISK   │ COST BASIS   │
  │ 9.50  −5.0%  │ $0.50        │ $70.00  1R   │ $1,400       │
  └──────────────┴──────────────┴──────────────┴──────────────┘
```

- Key: 9px, uppercase, `letter-spacing: .1em`, weight 670, muted.
- Value: 14px, weight 580, primary ink, tabular figures.
- A trailing qualifier inside a value (`−5.0%`, `1R`) renders at 11px muted.
- Risk-flavored values take the red token; captured/realized values take green.
  Neutral facts stay ink-colored. **Color is reserved for sign, not decoration.**

Per-event cell sets:

| Event kind | Cells |
|---|---|
| `entry` | Initial stop · Risk / share · Total risk · Cost basis |
| `trim` | Captured (R) · Realized ($) · Stop moved · Open risk |
| `stop` | Exit price · Realized ($) · vs initial stop |
| `stopmove` | From · To · Open risk · Freeroll (yes/no) |
| `pending` | Target price · R level · Shares · Locks ($) |

Rules:

- A cell whose value is unavailable is **omitted**, not rendered with `—`. The
  strip is `flex` with equal-basis children, so it reflows to 2 or 3 cells cleanly.
- Below ~520px the strip wraps to a 2-up grid.
- `Total risk` shows `1R` as its qualifier — this is the only place in the card
  that names the R unit in dollars, and it is what makes every other R figure legible.

This half is independently shippable and carries most of the readability win.
It has no new data requirements.

---

## 3. Surface B — the plan rail

Full-width band below both columns, above the card footer.

- **X axis:** R multiple, dual-labeled with price. R is primary; price is the label.
- **Y axis:** shares still held.
- The result is a staircase: each executed or planned exit is a step down.

```
  SHARES HELD
   │
   │▒▒▒▒▒▒▒▒▒│═════════════════════│
   │ retired │  traveled · 140 sh  │
   │  risk   │                     ├──────────────┐
   │  zone   │                     │ live · 93 sh │
   │         │                     │              ├╌╌╌╌╌╌╌╌╌╌╌╌▶
   │         │                     │              │ runner 47   ╌╌▶
   └─────────┴─────────────────────┴──────────────┴──────────────
     9.50         10.00                11.00          11.50
      −1R           0R                  +2R            +3R
```

### 3.1 Bands

| Band | Meaning | Treatment |
|---|---|---|
| Retired risk | Stop → entry, once the stop is at/beyond entry | Red hatch, low opacity, struck-through `−$70.00 · −1R` label, plus a green arrow annotated *stop advanced to breakeven* |
| Live risk | Stop → entry, when the stop is still below entry | Solid red tint, label shows live `−$X · −1R`, **no** strike-through |
| Traveled | Entry → highest executed exit, at full original size | Neutral fill |
| Live leg | Highest executed exit → next pending target | Accent tint, accent top edge |
| Runner | Beyond the last pending target | Accent hatch, dashed top edge, dashed arrow running off the right edge |

The retired-risk band is what visually *earns* the `FREEROLLED` badge in the
collapsed row. Today that badge asks the reader to take its word.

### 3.2 Nodes

- **Executed exit** — filled green dot with a halo, flag above: `✓ FILLED · <date>`,
  `Sold 47 @ 11.00`, `+$47.00 · +2.0R`.
- **Pending target** — hollow dot, accent ring, flag: `PLANNED TRIM`,
  `Sell 46 @ 11.50`, `+$69.00 · +3.0R` in muted ink.
- **Pending stop raise** (`isStopRaise`) — **not a step down.** Renders as a small
  upward chevron on the axis at its trigger price with the label
  `stop → 10.00 @ 11.00`. Back-fill plans sell nothing; a staircase step there
  would be a lie.
- **Entry** — full-height vertical rule, the only pure-black line in the chart.

### 3.3 Axis extent

- Left edge: `min(initial stop, current stop)` at its R value.
- Right edge: `max(furthest pending target, highest executed exit) + 1R`, floor of `+4R`,
  so the runner band always has room to run.
- Ticks at every integer R in range. Prices come from `entry + directionSign · rps · R`.

---

## 4. Correctness traps

These are the parts most likely to be got wrong. They are not hypothetical —
each one is reachable through existing UI.

**4.1 Plot executed exits by their frozen R, never by recomputing from `entryPrice`.**
`openAddToModal` rewrites `tr.entryPrice` to the blended average and grows
`tr.shares`, while exits keep their frozen `rMultiple` (`app.js`, the
`add-to-position` mutate: *"R math stays anchored to initial risk; exits keep
frozen R"*). After an add, `entry + R·rps` no longer reproduces a historical exit's
stored R. Use `x.rMultiple` for executed nodes and derive only *pending* node
positions from the current entry.

**4.2 The staircase is not monotonically decreasing.** An add-to-position raises
the held count. The renderer must walk events chronologically and allow steps
**up**, drawn with a distinct riser (accent, upward chevron) so a size increase
never reads as a partial exit.

**4.3 Shorts invert price but not R.** `directionOf(t) === 'short'` means R rises
as price falls. Because the X axis is R-primary, the geometry is unchanged —
only the price labels descend left-to-right. Do not sort or position by raw price.

**4.4 Most trades have no plan.** `pendingTargets` returns `[]` unless
`trade.sellPlan.enabled` is true. The no-plan rail is the common case, not the
edge case: render retired/live risk + traveled + a single open-ended "held"
band, and put a ghost `+ Add target` chip on the axis. It must look deliberate,
not broken.

**4.5 `getOriginalShares` can return `null`.** With no share count there is no Y
axis. Degrade to a 40px price-only strip: bands and nodes, no heights, no
`SHARES HELD` label.

**4.6 Stopped out.** The staircase terminates with a step to zero at the stop
price, in red. The runner and live-leg bands do not render.

---

## 5. Not building

**Current-price marker.** The earlier mock carried a `LAST 10.62` marker. There
is no quote feed anywhere in the app — the only match for live pricing is a
disclaimer in the option calculator (*"it is not a live quote"*). The marker is
removed from the mock. It is the single highest-value addition to this rail if a
quote source ever lands, because it turns a plan diagram into a position monitor.

**Drag-to-reprice nodes.** The rail should eventually be the planning surface —
drag a pending node to reprice, click to set share count. Deferred: it needs a
write path into `trade.sellPlan.targets` and an undo story, which is a larger
change than the render. Ship read-only first.

**Option mode.** `calcOptionPosition` exists but trade-level option handling
isn't traced here. Contracts would substitute for shares on the Y axis. Confirm
before building.

---

## 6. Collapsed-row variant

A 40px version of the same bands, no labels except price ticks, sized to fit the
tracker row. Worth doing: if the rail only exists in the expanded card, it is
invisible while scanning, and a 20-row table showing where every position sits in
its plan is arguably the stronger feature. Mocked at the bottom of
`docs/mockups/plan-rail.html`.

---

## 7. Implementation notes

- Entry point is `buildRail(t)`. The metadata strip replaces the `ev.l2` string
  concatenation; the rail is a third child appended after `.rail-side`.
- **Reference code by symbol, not line number.** `app.js` is actively edited and
  line numbers drift (`buildRail` moved 15 lines during the writing of this spec).
- All data needed already exists: `tradeRiskPerShare`, `getOriginalShares`,
  `getRemainingShares`, `getRealizedPnL`, `getOpenRiskDollars`, `currentStop`,
  `pendingTargets`, `directionOf`, `directionSign`, `directionalMove`, plus
  `x.rMultiple` on exits. **No data-model change is required.**
- Render as inline SVG with a `viewBox` and `width: 100%`. Geometry is computed
  in R-space and mapped through one `xOf(r)` function; heights through one
  `yOf(shares)`. Keep both pure so the collapsed variant reuses them.
- Suggested split: `planrail.js` exporting `buildPlanRail(t) → SVGElement`, and a
  `planrail.css`, so `app.js` and `styles.css` each take a one-line change.
  This also keeps the diff small if the card is being edited in parallel.

---

## 8. Open decisions

1. Which visual language wins — this decay staircase, or one of the existing
   showroom candidates in `docs/mockups/r-ladder-fable.html` (Flight Path /
   Profit Skyline / Ticker Rail) and `r-ladder-my-take.html`. They were built for
   the calculator's R ladder; this rail is for a *live* position with executed
   history, so the jobs differ, but the vocabulary should not.
2. Whether the rail renders for closed and archived trades, or collapses to a
   static summary once there is nothing left to plan.
3. Whether the collapsed-row variant ships with the expanded rail or after.
