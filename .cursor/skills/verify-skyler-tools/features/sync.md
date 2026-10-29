# Cloud sync

Optional GitHub gist sync. Header cloud button. Not a hash route.

## Sub-features

- `#syncBtn` + indicator `#syncInd` (`data-s="off"|…`)
- Choice screen `.sy-have` / `.sy-new`
- Token screen `.sy-token`, optional gist `.sy-gist`, **Link & sync** `.sy-link`
- Linked screen: status, **Sync now**, pairing QR, **Unlink** `.sy-unlink`
- Backup row `.sy-backup` / `.sy-restore` (same JSON backup as the footer)

## How to get to it (user POV)

Click the cloud icon in the header. First-run welcome **Set up cloud sync** also opens it. Footer **backup** downloads without opening this modal.

## Driving it with verify

```bash
npm run verify -- check sync
```

Harness: click `#syncBtn`. Wait for `#modalRoot .sync-card` and `.sy-have`.

**Observable end state:** modal title is `Cloud sync`; the choice screen offers **I have a GitHub account**.

## Gotchas

- **Do not paste a real token in a proof run.** Linking creates or writes a private gist. The check stops at the choice screen.
- Token lives in `localStorage` (`tradeTracker_gistToken`). Never dump it into evidence JSON.
- Pairing links carry the token — treat like a password (copy in the UI says so).
- Sync is optional. A passing app with `#syncInd[data-s=off]` is the default, not a failure.
