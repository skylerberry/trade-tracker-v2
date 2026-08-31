/* ============================================================
   guide.js — Themes board
   Curated guide.json stays the Does overlay. The live page reads
   data/daily-scan.json: a wide net of names (ADR / $vol on each),
   ranked only on the liquid cut (3% ADR, $100M $vol).
   ============================================================ */
'use strict';

const GUIDE = (() => {
    const $ = (id) => document.getElementById(id);
    const WINDOWS = [
        { id: 'd', label: 'Daily' },
        { id: 'w', label: '1W' },
        { id: 'm', label: '1M' },
        { id: 'q', label: '3M' },
    ];
    const SIZE_K = 8;
    const RANK_MIN_ADR = 3;
    const RANK_MIN_DV = 100_000_000;
    const BROWSE_MIN_ADR = 2.5;
    const BROWSE_MIN_DV = 20_000_000;

    function escapeHtml(s) {
        return String(s ?? '').replace(/[&<>"']/g, c => (
            { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
        ));
    }
    function tickerOf(value) {
        return String(value || '').trim().toUpperCase();
    }
    function numOrNull(v) {
        if (v === '' || v == null) return null;
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
    }
    function slugId(name, taken) {
        const base = String(name || 'theme').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'theme';
        let id = base, n = 2;
        while (taken.has(id)) id = `${base}-${n++}`;
        return id;
    }

    function parseCompanies(raw) {
        const companies = {};
        const src = raw && typeof raw === 'object' ? raw : {};
        const incoming = src.companies && typeof src.companies === 'object' ? src.companies : {};
        for (const [key, val] of Object.entries(incoming)) {
            const ticker = String(key || '').trim().toUpperCase();
            const name = String(val?.name || '').trim();
            const does = String(val?.does || '').trim();
            if (!ticker || !name || !does) continue;
            companies[ticker] = { ticker, name, does };
        }
        return companies;
    }

    function resolveThemes(raw, companies, source, taken) {
        const themes = [];
        const src = raw && typeof raw === 'object' ? raw : {};
        for (const t of Array.isArray(src.themes) ? src.themes : []) {
            const id = String(t?.id || '').trim();
            const name = String(t?.name || '').trim();
            if (!id || !name || taken.has(id)) continue;
            taken.add(id);
            const seen = new Set();
            const names = [];
            for (const tk of Array.isArray(t.tickers) ? t.tickers : []) {
                const ticker = String(tk || '').trim().toUpperCase();
                if (!ticker || seen.has(ticker) || !companies[ticker]) continue;
                seen.add(ticker);
                names.push(companies[ticker]);
            }
            themes.push({
                id,
                name,
                blurb: String(t?.blurb || '').trim(),
                source,
                companies: names,
            });
        }
        return themes;
    }

    function parse(raw) {
        const companies = parseCompanies(raw);
        return { themes: resolveThemes(raw, companies, 'curated', new Set()), companies };
    }

    function combine(curatedRaw, moversRaw) {
        const companies = { ...parseCompanies(moversRaw), ...parseCompanies(curatedRaw) };
        const taken = new Set();
        const themes = [
            ...resolveThemes(curatedRaw, companies, 'curated', taken),
            ...resolveThemes(moversRaw, companies, 'generated', taken),
        ];
        const asOf = typeof moversRaw?.asOf === 'string' ? moversRaw.asOf.trim() : '';
        return { themes, companies, asOf };
    }

    function fmtAsOf(s) {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
        if (!m) return s;
        const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
        return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
    }

    function hay(company) {
        return `${company.ticker} ${company.name} ${company.does}`.toLowerCase();
    }

    function matchesQuery(company, theme, q) {
        if (!q) return true;
        if (hay(company).includes(q)) return true;
        if (theme.name.toLowerCase().includes(q)) return true;
        if (theme.blurb.toLowerCase().includes(q)) return true;
        return false;
    }

    function view(data, { query = '', themeId = null } = {}) {
        const q = String(query || '').trim().toLowerCase();
        const id = themeId && themeId !== 'all' ? String(themeId) : null;
        const themes = [];
        for (const theme of data?.themes || []) {
            if (id && theme.id !== id) continue;
            const companies = theme.companies.filter(c => matchesQuery(c, theme, q));
            if (!companies.length) continue;
            themes.push({ ...theme, companies });
        }
        const nameCount = new Set(themes.flatMap(t => t.companies.map(c => c.ticker))).size;
        return {
            themes,
            themeCount: themes.length,
            nameCount,
            query: String(query || '').trim(),
            themeId: id,
            empty: themes.length === 0,
        };
    }

    function rail(data, query) {
        const shown = view(data, { query, themeId: null });
        const counts = new Map(shown.themes.map(t => [t.id, t.companies.length]));
        return [
            { id: 'all', name: 'All', source: 'curated', count: shown.nameCount },
            ...(data?.themes || []).map(t => ({
                id: t.id,
                name: t.name,
                source: t.source || 'curated',
                count: counts.get(t.id) || 0,
            })),
        ];
    }

    function parseScanTickers(text) {
        const seen = new Set();
        const out = [];
        for (const part of String(text || '').split(',')) {
            const ticker = tickerOf(part.replace(/`/g, ''));
            if (!ticker || ticker === 'BELOW' || ticker === 'BELOW:') continue;
            if (seen.has(ticker)) continue;
            seen.add(ticker);
            out.push(ticker);
        }
        return out;
    }

    function parseScanPost(text) {
        const raw = String(text || '');
        const liq = raw.match(/^\s*-\s*Liquidity:\s*(\$\d+(?:\.\d+)?[KMB]?\+)/mi);
        const vol = raw.match(/^\s*-\s*Volatility:\s*(\d+(?:\.\d+)?%\+)/mi);
        const themes = [];
        const lines = raw.split(/\r?\n/);
        for (let i = 0; i < lines.length; i++) {
            const m = lines[i].match(/^\*\*(.+?) \((\d+)\/(\d+), (\d+)%\):\*\*(?:\s*`([^`]*)`)?\s*$/);
            if (!m) continue;
            const above = parseScanTickers(m[5] || '');
            let below = [];
            const next = (lines[i + 1] || '').trim();
            const bm = next.match(/^below:\s*`([^`]*)`\s*$/i);
            if (bm) {
                below = parseScanTickers(bm[1]);
                i += 1;
            }
            const total = above.length + below.length;
            themes.push({
                name: m[1].trim(),
                above,
                below,
                aboveCount: above.length,
                total,
                pct: total ? Math.round(100 * above.length / total) : 0,
            });
        }
        return {
            floors: {
                liquidity: liq ? liq[1] : '',
                volatility: vol ? vol[1] : '',
            },
            themes,
        };
    }

    function scanAsOf(path) {
        const base = String(path || '').split(/[\\/]/).pop() || '';
        const m = base.match(/(\d{4}-\d{2}-\d{2})/);
        return m ? m[1] : '';
    }

    function meanPct(values) {
        let sum = 0, n = 0;
        for (const v of Array.isArray(values) ? values : []) {
            if (typeof v !== 'number' || !Number.isFinite(v)) continue;
            sum += v;
            n += 1;
        }
        return n ? sum / n : null;
    }

    function formatPct(v) {
        if (typeof v !== 'number' || !Number.isFinite(v)) return '—';
        const sign = v > 0 ? '+' : '';
        return `${sign}${v.toFixed(2)}%`;
    }

    function formatDv(n) {
        if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return '—';
        if (n >= 1e9) return `$${(n / 1e9).toFixed(n >= 10e9 ? 0 : 1)}B`;
        if (n >= 1e6) return `$${(n / 1e6).toFixed(n >= 100e6 ? 0 : 1)}M`;
        if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
        return `$${Math.round(n)}`;
    }

    function adjPct(raw, n, k = SIZE_K) {
        if (raw == null || n <= 0) return null;
        return raw * n / (n + k);
    }

    function isRankable(c, gates = {}) {
        const minAdr = numOrNull(gates.minAdr) ?? RANK_MIN_ADR;
        const minDv = numOrNull(gates.minDv) ?? RANK_MIN_DV;
        return (c?.adr ?? 0) >= minAdr && (c?.dv ?? 0) >= minDv;
    }

    function passesBrowse(c, floors = {}) {
        const minAdr = numOrNull(floors.minAdr) ?? BROWSE_MIN_ADR;
        const minDv = numOrNull(floors.minDv) ?? BROWSE_MIN_DV;
        if (c?.adr == null || c?.dv == null) return false;
        return c.adr >= minAdr && c.dv >= minDv;
    }

    function windowPct(company, window) {
        const n = company?.ret?.[window];
        return typeof n === 'number' && Number.isFinite(n) ? n : null;
    }

    function healthOf(companies) {
        let aboveCount = 0, total = 0;
        for (const c of Array.isArray(companies) ? companies : []) {
            let reading = null;
            if (typeof c.above50 === 'boolean') reading = c.above50;
            else if (c.side === 'above') reading = true;
            else if (c.side === 'below') reading = false;
            if (reading == null) continue;
            total += 1;
            if (reading) aboveCount += 1;
        }
        return {
            aboveCount,
            total,
            pct: total ? Math.round(100 * aboveCount / total) : 0,
        };
    }

    function parseCatalog(raw) {
        const src = raw && typeof raw === 'object' ? raw : {};
        const companies = {};
        const incoming = src.companies && typeof src.companies === 'object' ? src.companies : {};
        for (const [key, val] of Object.entries(incoming)) {
            const ticker = tickerOf(key);
            if (!ticker) continue;
            const retSrc = val?.ret && typeof val.ret === 'object' ? val.ret : {};
            const ext = numOrNull(val?.ext);
            companies[ticker] = {
                ticker,
                name: String(val?.name || ticker).trim() || ticker,
                does: String(val?.does || '').trim(),
                ret: {
                    d: numOrNull(retSrc.d),
                    w: numOrNull(retSrc.w),
                    m: numOrNull(retSrc.m),
                    q: numOrNull(retSrc.q),
                },
                ext,
                above50: ext == null ? null : ext >= 0,
                adr: numOrNull(val?.adr),
                dv: numOrNull(val?.dv),
            };
        }
        const themes = [];
        for (const t of Array.isArray(src.themes) ? src.themes : []) {
            const id = String(t?.id || '').trim();
            const name = String(t?.name || '').trim();
            if (!id || !name) continue;
            const seen = new Set();
            const names = [];
            const tickers = Array.isArray(t.tickers) ? t.tickers : (Array.isArray(t.companies) ? t.companies : []);
            const belowSet = new Set((Array.isArray(t.below) ? t.below : []).map(tickerOf).filter(Boolean));
            const aboveSet = new Set((Array.isArray(t.above) ? t.above : []).map(tickerOf).filter(Boolean));
            for (const tk of tickers) {
                const ticker = tickerOf(typeof tk === 'string' ? tk : tk?.ticker);
                if (!ticker || seen.has(ticker) || !companies[ticker]) continue;
                seen.add(ticker);
                let side = null;
                if (belowSet.has(ticker)) side = 'below';
                else if (aboveSet.has(ticker)) side = 'above';
                else if (companies[ticker].above50 === true) side = 'above';
                else if (companies[ticker].above50 === false) side = 'below';
                names.push({ ...companies[ticker], side });
            }
            themes.push({
                id,
                name,
                blurb: String(t?.blurb || '').trim(),
                companies: names,
            });
        }
        const rank = src.rank && typeof src.rank === 'object' ? src.rank : {};
        const browse = src.browse && typeof src.browse === 'object' ? src.browse : {};
        return {
            source: String(src.source || 'daily-scan'),
            asOf: String(src.asOf || '').trim(),
            k: numOrNull(src.k) || SIZE_K,
            floors: src.floors && typeof src.floors === 'object' ? src.floors : {},
            rank: {
                minAdr: numOrNull(rank.minAdr) ?? RANK_MIN_ADR,
                minDv: numOrNull(rank.minDv) ?? RANK_MIN_DV,
            },
            browse: {
                minAdr: numOrNull(browse.minAdr) ?? BROWSE_MIN_ADR,
                minDv: numOrNull(browse.minDv) ?? BROWSE_MIN_DV,
            },
            themes,
            companies,
        };
    }

    function mergeRoster(prev, scan) {
        const prevList = Array.isArray(prev) ? prev : [];
        const scanList = Array.isArray(scan) ? scan : [];
        const assignment = new Map();
        const scanById = new Map();
        for (const t of scanList) {
            const id = String(t?.id || '').trim();
            if (!id) continue;
            scanById.set(id, t);
            for (const tk of Array.isArray(t.tickers) ? t.tickers : []) {
                const ticker = tickerOf(tk);
                if (ticker) assignment.set(ticker, id);
            }
        }
        const prevById = new Map();
        for (const t of prevList) {
            const id = String(t?.id || '').trim();
            if (!id) continue;
            prevById.set(id, t);
        }
        const orderedIds = [];
        const seenId = new Set();
        for (const t of [...scanList, ...prevList]) {
            const id = String(t?.id || '').trim();
            if (!id || seenId.has(id)) continue;
            seenId.add(id);
            orderedIds.push(id);
        }
        const out = [];
        for (const id of orderedIds) {
            const scanT = scanById.get(id);
            const prevT = prevById.get(id);
            const name = String(scanT?.name || prevT?.name || '').trim();
            if (!name) continue;
            const tickers = [];
            const seenTk = new Set();
            for (const tk of [...(prevT?.tickers || []), ...(scanT?.tickers || [])]) {
                const ticker = tickerOf(tk);
                if (!ticker || seenTk.has(ticker)) continue;
                if (assignment.has(ticker) && assignment.get(ticker) !== id) continue;
                seenTk.add(ticker);
                tickers.push(ticker);
            }
            out.push({
                id, name,
                blurb: String(scanT?.blurb || prevT?.blurb || '').trim(),
                tickers,
                above: scanT?.above || [],
                below: scanT?.below || [],
            });
        }
        return out;
    }

    function catalogFromScan(scan, companies, opts = {}) {
        const src = scan && typeof scan === 'object' ? scan : {};
        const incoming = companies && typeof companies === 'object' ? companies : {};
        const quotes = opts.quotes && typeof opts.quotes === 'object' ? opts.quotes : {};
        const taken = new Set();
        const scanThemes = [];
        const collect = (list, into, seen) => {
            for (const tk of Array.isArray(list) ? list : []) {
                const ticker = tickerOf(tk);
                if (!ticker || seen.has(ticker)) continue;
                seen.add(ticker);
                into.push(ticker);
            }
        };
        for (const t of Array.isArray(src.themes) ? src.themes : []) {
            const name = String(t?.name || '').trim();
            if (!name) continue;
            const id = slugId(name, taken);
            taken.add(id);
            const seen = new Set();
            const above = [];
            const below = [];
            collect(t.above, above, seen);
            collect(t.below, below, seen);
            scanThemes.push({
                id, name,
                blurb: String(t?.blurb || '').trim(),
                tickers: [...above, ...below],
                above, below,
            });
        }
        const merged = mergeRoster(opts.roster, scanThemes);
        const byScan = new Map(scanThemes.map(t => [t.id, t]));
        const outCompanies = {};
        const put = (ticker) => {
            if (!ticker || outCompanies[ticker]) return;
            const rec = incoming[ticker] || {};
            const q = quotes[ticker] || {};
            outCompanies[ticker] = {
                name: String(rec.name || '').trim() || ticker,
                does: String(rec.does || '').trim(),
                ret: {
                    d: numOrNull(q.d),
                    w: numOrNull(q.w),
                    m: numOrNull(q.m),
                    q: numOrNull(q.q),
                },
                ext: numOrNull(q.ext),
                adr: numOrNull(q.adr),
                dv: numOrNull(q.dv),
            };
        };
        const themes = [];
        for (const t of merged) {
            const scanT = byScan.get(t.id);
            for (const tk of t.tickers) put(tk);
            themes.push({
                id: t.id,
                name: t.name,
                blurb: String(scanT?.blurb || t.blurb || '').trim(),
                tickers: t.tickers,
                above: scanT?.above || t.above || [],
                below: scanT?.below || t.below || [],
            });
        }
        const floorsSrc = src.floors && typeof src.floors === 'object' ? src.floors : {};
        return {
            source: 'daily-scan',
            asOf: String(src.asOf || '').trim(),
            k: SIZE_K,
            floors: {
                liquidity: String(floorsSrc.liquidity || '').trim(),
                volatility: String(floorsSrc.volatility || '').trim(),
            },
            rank: { minAdr: RANK_MIN_ADR, minDv: RANK_MIN_DV },
            browse: { minAdr: BROWSE_MIN_ADR, minDv: BROWSE_MIN_DV },
            themes,
            companies: outCompanies,
        };
    }

    function rankThemes(data, {
        query = '', themeId = null, window = 'd',
        minAdr = null, minDv = null, sort = 'pct',
    } = {}) {
        const catalog = data?.source === 'daily-scan' || data?.rank ? data : parseCatalog(data);
        const q = String(query || '').trim().toLowerCase();
        const id = themeId && themeId !== 'all' ? String(themeId) : null;
        const win = WINDOWS.some(w => w.id === window) ? window : 'd';
        const rankGates = catalog.rank || { minAdr: RANK_MIN_ADR, minDv: RANK_MIN_DV };
        const browse = {
            minAdr: minAdr == null ? (catalog.browse?.minAdr ?? BROWSE_MIN_ADR) : minAdr,
            minDv: minDv == null ? (catalog.browse?.minDv ?? BROWSE_MIN_DV) : minDv,
        };
        const k = catalog.k || SIZE_K;
        const themes = [];
        for (const theme of catalog.themes || []) {
            if (id && theme.id !== id) continue;
            const themeHit = !q || theme.name.toLowerCase().includes(q) || String(theme.blurb || '').toLowerCase().includes(q);
            let companies = theme.companies || [];
            if (q && !themeHit) companies = companies.filter(c => matchesQuery(c, theme, q));
            const shown = companies.filter(c => passesBrowse(c, browse));
            const rankSet = companies.filter(c => isRankable(c, rankGates));
            if (!shown.length && !rankSet.length && !id) continue;
            const withRet = rankSet.map(c => ({ ...c, windowPct: windowPct(c, win) })).filter(c => c.windowPct != null);
            const groupPct = meanPct(withRet.map(c => c.windowPct));
            const adj = adjPct(groupPct, withRet.length, k);
            const sheet = shown.map(c => ({ ...c, windowPct: windowPct(c, win) }));
            sheet.sort((a, b) => {
                const av = sort === 'adr' ? a.adr : sort === 'dv' ? a.dv : sort === 'ticker' ? a.ticker : a.windowPct;
                const bv = sort === 'adr' ? b.adr : sort === 'dv' ? b.dv : sort === 'ticker' ? b.ticker : b.windowPct;
                if (sort === 'ticker') return String(av).localeCompare(String(bv));
                if (av == null && bv == null) return 0;
                if (av == null) return 1;
                if (bv == null) return -1;
                return bv - av;
            });
            themes.push({
                ...theme,
                companies: sheet,
                roster: companies,
                rankSet,
                nRet: withRet.length,
                groupPct,
                adj,
                health: healthOf(rankSet),
                window: win,
            });
        }
        if (!id) themes.sort((a, b) => (b.adj ?? -Infinity) - (a.adj ?? -Infinity));
        const nameCount = new Set(themes.flatMap(t => t.companies.map(c => c.ticker))).size;
        return {
            themes,
            themeCount: themes.length,
            nameCount,
            query: String(query || '').trim(),
            themeId: id,
            window: win,
            browse,
            rank: rankGates,
            k,
            empty: themes.length === 0,
            asOf: catalog.asOf,
            floors: catalog.floors,
        };
    }

    function logoSrc(ticker) {
        return `https://financialmodelingprep.com/image-stock/${encodeURIComponent(ticker)}.png`;
    }
    function logoHTML(ticker) {
        const tk = escapeHtml(String(ticker || '').toUpperCase());
        return `<span class="tk-logo" title="${tk}"><img src="${logoSrc(tk)}" alt="" onerror="this.parentElement.classList.add('is-fallback')"><span class="tk-fb">${tk.slice(0, 2)}</span></span>`;
    }
    function signOf(v) { return v > 0.005 ? 'up' : v < -0.005 ? 'down' : ''; }
    function trackWidth(v) {
        if (v == null) return 0;
        return Math.min(100, Math.abs(v) / 0.12 * 100);
    }

    let data = { themes: [], companies: {}, asOf: '' };
    let query = '';
    let themeId = null;
    let windowId = 'd';
    let minAdr = BROWSE_MIN_ADR;
    let minDv = BROWSE_MIN_DV;
    let sort = 'pct';
    let loaded = false;
    let loadError = false;
    let revealed = false;

    function themeFromHash() {
        const m = (location.hash || '').match(/^#themes\/([a-z0-9-]+)/i);
        return m ? m[1] : null;
    }

    function writeHash() {
        const next = themeId ? `#themes/${themeId}` : '#themes';
        if (location.hash !== next) history.replaceState(null, '', next);
    }

    function rankedState() {
        return rankThemes(data, { query, themeId: null, window: windowId, minAdr, minDv, sort });
    }

    function boardRow(theme, open) {
        const h = theme.health || { aboveCount: 0, total: 0, pct: 0 };
        return `<button type="button" class="tb-row${open === theme.id ? ' is-open' : ''}" data-open="${escapeHtml(theme.id)}">
            <span><span class="tb-name">${escapeHtml(theme.name)}</span>
                <span class="tb-meta">${h.total} liquid · ${theme.nRet} with a reading</span></span>
            <span class="tb-pct" data-sign="${signOf(theme.groupPct)}">${formatPct(theme.groupPct)}
                <span class="tb-track"><i style="width:${trackWidth(theme.adj)}%"></i></span>
            </span>
        </button>`;
    }

    function sheetHTML(theme) {
        if (!theme) return '<p class="themes-empty">Pick a theme.</p>';
        const h = theme.health || { aboveCount: 0, total: 0, pct: 0 };
        const rows = theme.companies.map(c => `
            <article class="tb-name-row${c.side === 'below' ? ' is-below' : ''}">
                ${logoHTML(c.ticker)}
                <div class="tb-tk">${escapeHtml(c.ticker)}</div>
                <div class="tb-copy">
                    <div class="tb-co">${escapeHtml(c.name || c.ticker)}</div>
                    <p class="tb-line${c.does ? '' : ' is-miss'}">${c.does ? escapeHtml(c.does) : '—'}</p>
                    <p class="tb-stats">${c.adr != null ? escapeHtml(c.adr.toFixed(1) + '%') : '—'} ADR · ${escapeHtml(formatDv(c.dv))}</p>
                </div>
                <div class="tb-np" data-sign="${signOf(c.windowPct)}">${formatPct(c.windowPct)}</div>
            </article>`).join('');
        return `
            <div class="tb-sheet-head">
                <h2>${escapeHtml(theme.name)}</h2>
                <span class="tb-health">${h.aboveCount}/${h.total} · ${h.pct}%</span>
                <span class="tb-pct" data-sign="${signOf(theme.groupPct)}">${formatPct(theme.groupPct)}</span>
            </div>
            <p class="tb-sheet-note">Ranking uses names at $100M+ and 3%+ ADR. This list follows your ADR / dollar-volume floors.</p>
            ${rows || '<p class="themes-empty">No names pass those floors in this theme.</p>'}`;
    }

    function render() {
        const host = $('themesDesk');
        if (!host) return;
        const clear = $('themesSearchClear');
        if (clear) clear.hidden = !query;
        if (loadError) {
            host.innerHTML = '<p class="themes-empty">Couldn’t load the scan.</p>';
            return;
        }
        if (!loaded) {
            host.innerHTML = '<p class="themes-empty">Loading…</p>';
            return;
        }
        const state = rankedState();
        if ($('themesCount')) {
            $('themesCount').textContent = loaded
                ? `${state.themeCount} themes · ${state.nameCount} names`
                : '';
        }
        if ($('themesAsof')) $('themesAsof').textContent = state.asOf ? fmtAsOf(state.asOf) : '';
        if ($('themesSub')) {
            const liq = state.floors?.liquidity || '$20M+';
            const vol = state.floors?.volatility || '2.5%+';
            $('themesSub').textContent = `${liq} dollar volume · ${vol} ADR on the sheet · ranked at $100M+ and 3%+ ADR`;
        }
        if (!state.themes.length) {
            host.innerHTML = query
                ? '<p class="themes-empty">Nothing matches that search.</p>'
                : '<p class="themes-empty">No scan on this build.</p>';
            return;
        }
        const known = themeId && state.themes.some(t => t.id === themeId);
        if (!known) themeId = state.themes[0].id;
        const open = state.themes.find(t => t.id === themeId) || state.themes[0];
        host.innerHTML = `
            <div class="tb-list" role="list">${state.themes.map(t => boardRow(t, themeId)).join('')}</div>
            <div class="tb-sheet">${sheetHTML(open)}</div>`;
        if (typeof hydrateIcons === 'function') hydrateIcons(host);
        const asof = $('themesAsof');
        if (asof && window.MOTION && !revealed && asof.textContent.trim()) {
            revealed = true;
            window.MOTION.letterReveal(asof);
        }
    }

    function setTheme(id) {
        const state = rankedState();
        const known = id && state.themes.some(t => t.id === id);
        themeId = known ? id : (state.themes[0]?.id || null);
        writeHash();
        render();
    }

    function setQuery(value) {
        query = String(value || '');
        render();
    }

    function wire() {
        const input = $('themesSearch');
        const clear = $('themesSearchClear');
        const desk = $('themesDesk');
        const winSeg = $('themesWinSeg');
        if (input) {
            input.addEventListener('input', () => setQuery(input.value));
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && input.value) {
                    e.stopPropagation();
                    input.value = '';
                    setQuery('');
                }
            });
        }
        if (clear) {
            clear.addEventListener('click', () => {
                if (input) { input.value = ''; input.focus(); }
                setQuery('');
            });
        }
        if (desk) {
            desk.addEventListener('click', (e) => {
                const row = e.target.closest('[data-open]');
                if (!row) return;
                setTheme(row.dataset.open);
            });
        }
        if (winSeg) {
            if (window.MOTION) {
                window.MOTION.segmented(winSeg, (id) => { windowId = id; render(); });
            } else {
                winSeg.addEventListener('click', (e) => {
                    const btn = e.target.closest('[data-win]');
                    if (!btn) return;
                    windowId = btn.dataset.win;
                    winSeg.querySelectorAll('[data-win]').forEach(b => b.classList.toggle('is-active', b === btn));
                    render();
                });
            }
        }
        const adrIn = $('themesMinAdr');
        const dvIn = $('themesMinDv');
        const sortIn = $('themesSort');
        if (adrIn) adrIn.addEventListener('change', () => {
            const n = Number(adrIn.value);
            minAdr = Number.isFinite(n) ? n : BROWSE_MIN_ADR;
            render();
        });
        if (dvIn) dvIn.addEventListener('change', () => {
            const raw = String(dvIn.value || '20M').toUpperCase();
            const m = raw.match(/^([\d.]+)\s*([MBK])?$/);
            if (!m) return;
            const n = Number(m[1]);
            const mul = m[2] === 'B' ? 1e9 : m[2] === 'K' ? 1e3 : 1e6;
            minDv = n * mul;
            render();
        });
        if (sortIn) sortIn.addEventListener('change', () => {
            sort = sortIn.value || 'pct';
            render();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
            if (document.body.dataset.view !== 'themes') return;
            const el = document.activeElement;
            if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
            if (!input) return;
            e.preventDefault();
            input.focus();
            input.select();
        });
        window.addEventListener('hashchange', () => {
            if (document.body.dataset.view !== 'themes') return;
            const id = themeFromHash();
            if (id && id !== themeId) setTheme(id);
        });
    }

    async function fetchJson(path) {
        const res = await fetch(path, { cache: 'no-store' });
        if (!res.ok) throw new Error(String(res.status));
        return res.json();
    }

    async function load() {
        try {
            data = parseCatalog(await fetchJson('data/daily-scan.json'));
            loaded = true;
            loadError = !data.themes.length;
            minAdr = data.browse.minAdr;
            minDv = data.browse.minDv;
            if ($('themesMinAdr')) $('themesMinAdr').value = String(minAdr);
            if ($('themesMinDv')) $('themesMinDv').value = minDv >= 1e9 ? `${minDv / 1e9}B` : `${minDv / 1e6}M`;
        } catch {
            data = { themes: [], companies: {}, asOf: '', rank: { minAdr: RANK_MIN_ADR, minDv: RANK_MIN_DV }, browse: { minAdr: BROWSE_MIN_ADR, minDv: BROWSE_MIN_DV } };
            loaded = true;
            loadError = true;
        }
        const fromHash = themeFromHash();
        if (fromHash) themeId = fromHash;
        render();
    }

    function init() {
        wire();
        render();
        load();
    }

    return {
        parse, combine, view, rail, init, render,
        parseScanPost, scanAsOf, catalogFromScan, parseCatalog,
        WINDOWS, meanPct, formatPct, formatDv, mergeRoster, rankThemes, adjPct,
        isRankable, passesBrowse, RANK_MIN_ADR, RANK_MIN_DV, SIZE_K,
    };
})();
