# Journal — free notes (Trades · Notes)

Status: **spec only, not implemented.** Written 2026-09-11.
Agreed shape: Skyler + ChatGPT proposal, Claude refinements, ChatGPT draft-protection
adjustment. Grok implements from this file.
Target surface: the **Journal** view in `app.js` / `index.html`. The per-trade
journal inside the position rail (`journalMarkup`, `wireJournal`) is **not** touched.

---

## 1. Why

Every journal entry today hangs off a trade. There is nowhere to write a market
observation, a reminder, or a daily recap on a day with no position. That makes
the Journal tab dead on the days it should matter most.

Notes are a second, independent collection. They are not trade entries and never
become trade entries. Trade-specific thoughts keep living with their trades.

---

## 2. Surface

The Journal title row gains a two-way switch: **Trades · Notes**.

```
Trade Journal                                   [ Trades | Notes ]   ⓘ How it works
Review your trades, track your results, and keep notes on what you learn.
```

- Same `M.segmented` seg as the other view switches, two options, springing pill.
- State: `prefs.journalTab` = `'trades' | 'notes'`. Local only, **not** in the
  gist settings payload. Default `'trades'`.
- Hash: `#journal/notes` selects Notes; `#journal` or `#journal/trades` selects
  Trades. `setView` already splits the hash on `/`, so only the tail needs reading.

### Trades (unchanged)

Everything the Journal view shows today.

### Notes

When `prefs.journalTab === 'notes'`, hide:

| Element | Why |
|---|---|
| `#journalScope` | "Closed trades · all time" is about trades |
| `#journalSummary` (includes `#equityCard`) | trade stats |
| `#journalSeg` | status filter is about trades |
| date From / To filters and `#journalFilterNote` | trade date range |
| the trades table, pagination, `#footerTotals` | trade rows |

Show:

- A **New note** button, primary, at the top of the list. Also reachable from the
  Notes empty state.
- The shared search field (`#tradeSearch`), placeholder swapped to **Search notes…**
  and `aria-label` to `Search notes`.
- The notes list.

Keep `#journalHowBlock`. Add one row to its `<dl>`:

> **Notes** — Reminders, market observations, and recaps that aren't tied to a trade.
> Pin what you want to keep in front of you.

### Note card

Neutral card, existing surface tokens, no yellow, no board.

```
┌────────────────────────────────────────────────────────────────┐
│ 📌  Don't add to a position just because it's down.            │
│                                                                │
│     Sep 11 · 6:42 AM PT · edited                     [pin][🗑] │
└────────────────────────────────────────────────────────────────┘
```

- Preview: first non-empty line as the lead, weight 600. Remaining text clamped
  to 3 lines, `text-3`. If the note is a single line, no body row.
- Meta line: `formatJournalTimestamp(createdAt)`. `edited` marker with a full
  `updatedAt` title, same as `.journal-edited`.
- Pinned cards show a pin glyph at the left and sit first. No other styling
  difference beyond the glyph and a slightly stronger border.
- Click the card body to open it in place: the card expands to a textarea with
  **Done** and the same edit/delete controls. One open card at a time. `Esc` closes.
- Actions: pin/unpin (icon button, no confirm), delete (icon button, `confirmModal`,
  see §7).

### Composer

**New note** opens an empty card in the composer slot above the list.

```
┌────────────────────────────────────────────────────────────────┐
│ Write a note…                                                  │
│                                                                │
│  ⏱ Timestamped when added              [Cancel] [Add note]    │
└────────────────────────────────────────────────────────────────┘
```

- `textarea`, `maxlength="2000"`, matches `.journal-compose-input`.
- **Add note** disabled until trimmed text is non-empty. `Cmd/Ctrl+Enter` adds.
- On add: card animates into the list at its sorted position, toast
  `Note added`, composer closes, draft cleared (§5).

---

## 3. Data contract (engine.js)

```js
// note
{ id, text, createdAt, updatedAt, pinned }
```

| Field | Type | Rule |
|---|---|---|
| `id` | string | `uid()`-style, prefixed `nt-` |
| `text` | string | trimmed, non-empty, ≤ 2000 chars |
| `createdAt` | ISO string | set once at add; never changes |
| `updatedAt` | ISO string \| null | set on every text edit; **not** on pin toggle |
| `pinned` | boolean | default `false` |

Add to `engine.js` next to `normalizeJournal`:

```js
function normalizeNotes(raw) → note[]
```

- Non-array → `[]`.
- Drops entries with empty trimmed text.
- Coerces `id` (fallback `nt-<index>`), `pinned` (`=== true`), timestamps through
  `validIso`; missing `createdAt` falls back to `updatedAt`, then now.
- Never throws. Same tolerance as `normalizeJournal`.

Also export:

```js
function sortNotes(notes) → note[]     // pinned first, then createdAt desc
function notePreview(text) → { lead, rest }   // first non-empty line, remainder
```

Sort is by `createdAt`, not `updatedAt`, so editing a note does not move it.
Pin toggles do not change `updatedAt`.

---

## 4. Storage, backup, sync

### localStorage

New key in `K`: `notes: 'tradeTracker_notes'`. New state `let notes = []`.
Loaded in the same block as trades, normalized through `E.normalizeNotes` on load.

```js
function saveNotes() {
    localStorage.setItem(K.notes, JSON.stringify(notes));
    schedulePush('notes');
}
```

### Backup

`backupPayload()` adds `notes`. `backupVersion` stays `2`; the field is additive.

Restore rule in the `restoreFile` handler:

- `data.notes` is an array → replace local notes with `normalizeNotes(data.notes)`.
- `data.notes` is **undefined** → leave local notes untouched. An older backup
  must not erase notes.
- The pre-restore safety file includes `notes` too.

Restore toast stays `Restored N trades`; append `· M notes` only when the file
carried a notes array.

### Gist

Third gist file: `notes.json`, array of notes.

- `schedulePush('notes')` uses the **2000 ms** settings delay, not the 300 ms
  trades delay.
- `filePayload('notes')` → `{ 'notes.json': { content: JSON.stringify(notes, null, 2) } }`.
- Gist create (`POST`) includes `notes.json` alongside the other two.
- Pull: read `notes.json`. **Absent file** → keep local notes and, if local notes
  are non-empty, `schedulePush('notes')` so the gist gains the file. **Present**
  → normalize, replace, `saveNotes` without push if changed. Unreadable → same
  paused behaviour as trades.
- Conflict on push (`isConflict` true, `kind === 'notes'`): re-read `notes.json`
  and merge with `GIST_SYNC.mergeNotes(local, cloud)` before the PATCH. Same
  semantics as `mergeTrades`: union by `id`; per id the later `updatedAt` (then
  `createdAt`) wins, local wins a tie; `pinned` follows the winning side; a note
  present on only one side is kept. Known consequence, accepted for v1 and
  identical to trades: a note deleted on device A can come back if device B
  pushes a conflicting `notes.json` that still holds it. No tombstones this
  release. Add `mergeNotes` to `gist-sync.js` and cases to `tests/sync.test.mjs`.

Because a gist PATCH only touches the files it names, a device running an older
build that has no notes support cannot delete `notes.json`. No guard needed there.

Do **not** put notes in `settingsPayload()`.

---

## 5. Draft protection and save cadence

Two different things. Keep them separate.

**Local persistence** protects writing. **Cloud push** is batched.

| Situation | Local | Cloud |
|---|---|---|
| Typing in the New note composer | draft saved to `tradeTracker_noteDraft` on `input`, debounced 300 ms | nothing |
| Add note | note appended, `saveNotes()`, draft key removed | `schedulePush('notes')` (2 s) |
| Editing an existing note | `updatedAt` + text written into `notes`, `saveNotes()` on `input`, debounced 400 ms | `schedulePush('notes')` re-arms each time; fires 2 s after the last edit |
| Card closed / tab hidden | nothing extra | existing hide-flush path (`pushFile(kind, { flush: true })`) covers `'notes'` like the other kinds |
| Pin toggle | `saveNotes()` | `schedulePush('notes')` |

Draft key shape: `{ text, at }`. Not in the backup, not synced. On opening the
composer, if a draft exists restore it and show the quiet hint
**Draft restored** in the footer where the timestamp hint sits. Cancel clears
the draft after a `confirmModal` only if the draft is non-empty.

Existing-note edits show a quiet **Saved** in the card footer after the local
write lands. It reads local save, not sync. The header cloud icon already shows
sync state; do not duplicate it on the card.

---

## 6. Search

Reuse `#tradeSearch`. No second input.

- `filters.q` stays the trades query. Add `filters.notesQ`.
- `initSearch`'s `apply` writes to whichever query the active Journal tab owns
  and calls `renderNotes()` or `renderTable()` accordingly.
- Switching Trades ↔ Notes swaps the input value to that tab's stored query and
  swaps placeholder/aria-label. Each tab keeps its own query.
- Match rule: same as `matchesQuery`, every whitespace-split term must appear in
  lowercased `text`.
- Results keep pinned-first order. Search filters, it does not re-rank.
- No date filter for notes in v1.

---

## 7. Delete, undo, pin

- Delete: `confirmModal('Delete note', 'This removes the note and its timestamp.', 'Delete note', …)`,
  then toast `Note deleted`. Same pattern as journal-entry delete this release.
  If journal-entry delete later moves to undo toast, move both together.
- Pin: instant, no confirm, toast-free. The card FLIPs to its new slot with the
  existing list motion.

---

## 8. Empty and filtered states

Reuse `.empty-state` markup, not `.journal-empty` (that one is the rail's).

**No notes yet**

> **A place for your trading thoughts**
> Keep reminders, market observations, and daily recaps, even when you haven't logged a trade.
> **New note**

CTA action `new-note`. No alt link.

**Search, no match**

> **No notes match "…"**
> Try a different word, or clear the search.
> **Clear search**

Reuse the `clear-search` action; it must clear `filters.notesQ` when Notes is active.

---

## 9. Export

- Backup JSON: `notes` field (§4).
- When Notes is active, the CSV / TSV / Excel items in `#exportMenu` export the
  **visible notes** instead of trades. Columns: `Created`, `Updated`, `Pinned`, `Text`.
  Text is escaped through the same `esc` as the trades exporter. File name
  `notes-YYYY-MM-DD.csv` / `.tsv`.
- No new menu items.

---

## 10. Tests

`tests/engine.test.mjs`:

- `normalizeNotes`: non-array → `[]`; blank text dropped; missing `pinned` → `false`;
  bad `createdAt` falls back to `updatedAt`, then a valid ISO now; ids coerced to strings.
- `sortNotes`: pinned first, then `createdAt` desc, stable for equal timestamps.
- `notePreview`: leading blank lines skipped; single line → empty `rest`.

`tests/sync.test.mjs`:

- `mergeNotes`: later `updatedAt` wins; `pinned` follows the winner; union by id;
  the missing-from-one-side rule matches `mergeTrades`.
- App source contains `'notes.json'` in `filePayload`, the gist create body, and
  the pull path. Same string-assert style the file already uses for `trades.json`.

---

## 11. Manual green

1. Journal → Notes → New note → type → close the tab → reopen → composer shows the draft.
2. Add note → card appears first (no pins yet) → header cloud shows a single sync ~2 s later, not one per keystroke.
3. Pin a note → it moves to the top → refresh → still pinned, still first.
4. Edit a note → **Saved** appears → gist gets one PATCH after the last edit.
5. Search `semis` → only matching notes, pinned matches first → switch to Trades → trade search is what it was.
6. Download backup → file has `notes` → restore a **pre-notes** backup → notes survive.
7. Link a second device with no `notes.json` in the gist → first push from device one creates it → device two pulls it.
8. `npm test` green.
9. Position rail journal unchanged: kinds, default kind, edit, delete.

---

## 12. Out of scope

Ticker tags or auto-linking `$TICKER`, categories, images, a daily-recap template,
markdown rendering, note-to-trade promotion, a notes date filter, cross-device
draft sync.

---

## 13. Release isolation

This ships as its own commit series and its own push to `main`. The working tree
currently carries uncommitted Themes edits (`app.js`, `themes.js`, `themes.css`,
`styles.css`, `scripts/update-themes.py`, `data/daily-scan.json`, `tests/themes.test.mjs`).
Either land or stash those **before** starting Notes. A push to `main` deploys
whatever is on the branch, so separate commits alone do not isolate the release.
Check `git diff --stat main..HEAD` before pushing.
