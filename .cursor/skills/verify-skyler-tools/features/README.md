# Feature map — skyler.tools

Verified from this checkout’s nav and routers (`#viewSeg` in `index.html`, `VIEWS` in `app.js`). There is **no Monitor tab**. **Guide is not a view** (`guide.js` still loads but `GUIDE` is never mounted; Themes replaced it).

| Feature | File | Hash / URL | Nav handle |
| --- | --- | --- | --- |
| Calculator | [calculator.md](calculator.md) | `#positions` | `#viewSeg [data-seg="positions"]` (label Calculator) |
| Journal | [journal.md](journal.md) | `#journal`, `#journal/notes` | `#viewSeg [data-seg="journal"]` |
| Compound | [compound.md](compound.md) | `#compound` | `#viewSeg [data-seg="compound"]` |
| Themes | [themes.md](themes.md) | `#themes`, `#themes/<id>`, `#themes/lookup/<ticker>` | `#viewSeg [data-seg="themes"]` |
| Relative strength | [rs.md](rs.md) | `#rs` | `#viewSeg [data-seg="rs"]` |
| Curate | [curate.md](curate.md) | `/curate.html` | not in nav — type the path |
| Feedback | [feedback.md](feedback.md) | footer modal | `#footerFeedback` |
| Appearance | [appearance.md](appearance.md) | any view | `#themeSeg`, `#accentBtn` |
| Cloud sync | [sync.md](sync.md) | header modal | `#syncBtn` |

```bash
npm run verify -- check <feature>
```

`feature` matches the first column’s slug: `calculator`, `journal`, `compound`, `themes`, `rs`, `curate`, `feedback`, `appearance`, `sync`.
