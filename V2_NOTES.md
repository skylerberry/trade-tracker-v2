# Trade Tracker 2.0 — cap-motion revamp

Ground-up reimplementation of lite.skyler.tools on branch `v2-cap-motion`
(worktree `~/Projects/trade-tracker-v2`). Behavior contract:
`docs/WIREFRAME_SPEC.md`. Visual/motion language: the `cap-design` +
`cap-motion` skills blended with the v1 navy/blue flat identity.

**Fully static.** Production target is lite.skyler.tools — no backend, no
API keys, no `/api`. (An Alpaca live-data layer existed briefly during
development and was deliberately removed on 2026-08-06.)

## Run it locally

```
node serve.mjs        # http://localhost:4173  (plain static server)
node tests/engine.test.mjs   # pure-math engine tests
```

## Files

- `index.html` — page skeleton, modal templates, pre-paint theme script.
- `styles.css` — token-driven theming (all dark styles are variable
  overrides under `[data-theme="dark"]`), cap-design radius ladder /
  weight ceiling, cap-motion easing tokens.
- `icons.js` — inline Lucide set (no CDN); `hydrateIcons()` fills
  `[data-icon]` spans, including cloned modal templates.
- `motion.js` — analytic spring solver + named vocabulary (indicator /
  modal / micro / press / wobble), FLIP pills, interruptible rolling
  digits, collapsibles (height+blur), toast/modal enter-exit,
  reduced-motion handling.
- `engine.js` — pure math per spec §10: cents-normalized risk/share,
  exits model, derived status, freeroll detection, stats/expectancy,
  alert parser, CSV. Covered by `tests/engine.test.mjs`.
- `app.js` — state, calculator, table, modals, toasts, theme/accent
  engine, gist sync.
- `serve.mjs` — static preview server only.

## Signature 2.0 features

- **Direction-aware workflow**: long and short share sizing, descending short
  R targets, cover language, direction-aware stops/P&L/freeroll math, and
  backward-compatible migration of pre-direction trades to `long`. Wrong-side
  calculator stops surface an inline explanation with a one-click direction
  switch; the same underlying-price rule applies to call/put sizing.
- **Purchased-option sizing**: long calls for bullish direction and long puts
  for bearish direction, sized from manual delta + premium. The UI separates
  estimated stop risk from full-premium max loss and labels target output as
  underlying-only. Option logging/writing strategies remain out of scope.
- **Motion system everywhere**: FLIP-pill segmented controls,
  direction-aware rolling digits, spring modals, freeroll shield wobble,
  hover-pausing undo toasts with timer bars, floating pill header
  (IntersectionObserver sentinel; overshoot enter, fast exit).
- **Position rail**: click a row → inline timeline of entry/exits/pending
  targets, position stats, actions, and an append-first trade journal. Journal
  entries are typed (thesis/update/review/lesson), timestamped in ISO at write,
  rendered in local time with timezone, and support inline edit/delete + undo.
  Legacy `notes` text migrates into a preserved "Imported note" entry.
- **One-click flows**: calculator → Log (receipt strip w/ undo + 8s
  countdown), next-action chips execute plan targets with undo.
- **Trim risk manager**: on by default in Trim / Exit. R-price buttons and
  manually entered profitable prices calculate the minimum whole-share trim
  needed for $0 net open risk; turning it off restores direct share/fraction
  control. Explicit full-exit flows keep their sell-all intent.
- **Accent theme engine** (stock-sherlock pattern): 8 Tailwind-standard
  accents + rainbow, inline CSS-var application, per-accent WCAG contrast
  text, accent-derived hero CTA gradient. Persisted under
  `tradeTracker_accent`.
- **Cloud sync** (v1 mechanics, 2.0 surface): header cloud button with
  status dot → sync modal (token + gist id, link/create/unlink, Sync now,
  backup/restore). Safety triad preserved: local-first load, `updated_at`
  conflict guard, poison-pill pause on unreadable cloud data, plus 2s
  debounced pushes on one write chain and keepalive unload flush. Gist
  file shapes (`trades.json`/`settings.json`) match v1 — both versions
  can share a gist.
- **First-run welcome** promoting sync / sample trades / start fresh.
- `Shift+C` clears the calculator (persistent fields kept).

## v1 parity (line-by-line audit, ported)

Digits-only calculator inputs + comma re-format on account-size blur · v1
open-risk thresholds (LOW <1% / MED <4% / HIGH ≥4%) + precision flip ·
archived trades count in header stats · watchlist pill fills the
calculator (Shift+Click = TradingView), 20-ticker cap · trim modal
prefills from next pending target, loss preview state · flat ±0.01
steppers · 8-char tickers (BRK.B) · currentSL focus autofill ·
Shift+Enter ticker → chart · v1-compatible backup shape (restore accepts
v1 backups) · live system-theme follow until an explicit choice ·
add-to-position risk-budget suggestion · per-filter empty states.

v1 localStorage keys are reused throughout — existing data loads as-is.

## Not ported (deliberate)

PDF export, trade-card image export, recordable keyboard shortcuts,
journal images, streak chip, per-field Cmd+Z undo stack, v2 does not sync
live calculator field values (`settings.calcFields`) across devices.
The v1 test suites (exits-engine/stats/Playwright) targeted the old
monolith and were removed; `tests/engine.test.mjs` covers the v2 engine.
