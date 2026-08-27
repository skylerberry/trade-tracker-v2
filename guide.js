/* ============================================================
   guide.js — thematic company reference
   Data lives in data/guide.json (themes list tickers; companies
   are keyed by ticker with name + Does). A name can sit in more
   than one theme without duplicating the sentence.
   ============================================================ */
'use strict';

const GUIDE = (() => {
    const $ = (id) => document.getElementById(id);

    function escapeHtml(s) {
        return String(s ?? '').replace(/[&<>"']/g, c => (
            { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
        ));
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

    /* Curated guide.json + scanner-owned movers.json, one merged view.
       Curated wins every collision — a hand-written Does line and a
       hand-picked theme id are never overwritten by the nightly scan. */
    function combine(curatedRaw, moversRaw) {
        const companies = { ...parseCompanies(moversRaw), ...parseCompanies(curatedRaw) };
        const taken = new Set();
        const themes = [
            ...resolveThemes(curatedRaw, companies, 'curated', taken),
            ...resolveThemes(moversRaw, companies, 'generated', taken),
        ];
        
        /* Derive "All gainers" as unique union of the 4 gainer timeframes */
        const gainerIds = ['gainers-1w', 'gainers-1m', 'gainers-3m', 'gainers-6m'];
        const gainerThemes = themes.filter(t => gainerIds.includes(t.id));
        if (gainerThemes.length > 1) {
            const allTickers = new Set();
            gainerThemes.forEach(t => {
                t.companies.forEach(c => allTickers.add(c.ticker));
            });
            const allCompanies = Array.from(allTickers)
                .map(ticker => companies[ticker])
                .filter(Boolean);
            if (allCompanies.length > 0) {
                themes.push({
                    id: 'gainers-all',
                    name: 'All gainers',
                    blurb: 'Unique union of all four gainer timeframes',
                    source: 'generated',
                    derived: true,
                    companies: allCompanies,
                });
            }
        }
        
        const asOf = typeof moversRaw?.asOf === 'string' ? moversRaw.asOf.trim() : '';
        return { themes, companies, asOf };
    }

    /* Scan sections carry the scan date so a stale list reads as stale.
       ISO dates render as "Aug 26"; anything else passes through. */
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
        const showingAll = !themeId || themeId === 'all';
        const themes = [];
        for (const theme of data?.themes || []) {
            if (id && theme.id !== id) continue;
            /* All view shows curated themes only, not generated scans or derived */
            if (showingAll && theme.source !== 'curated') continue;
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

    let data = { themes: [], companies: {}, asOf: '' };
    let query = '';
    let themeId = 'all';
    let loaded = false;
    let loadError = false;

    function renderRail() {
        const host = $('themesRail');
        if (!host) return;
        const items = rail(data, query);
        const hasBoth = items.some(i => i.source === 'generated') && items.some(i => i.source !== 'generated');
        let divided = false;
        host.innerHTML = items.map(item => {
            const on = item.id === themeId;
            const btn = `<button type="button" class="themes-rail-item${on ? ' is-active' : ''}${item.count ? '' : ' is-empty'}" data-theme-id="${escapeHtml(item.id)}" aria-pressed="${on ? 'true' : 'false'}"><span class="themes-rail-name">${escapeHtml(item.name)}</span><span class="themes-rail-n">${item.count}</span></button>`;
            if (hasBoth && !divided && item.source === 'generated') {
                divided = true;
                return `<div class="themes-rail-sep">Scans</div>${btn}`;
            }
            return btn;
        }).join('');
    }

    function renderBody() {
        const host = $('themesBody');
        if (!host) return;
        host.scrollTop = 0;
        
        /* Set data attribute for sticky header styling */
        host.dataset.themeView = themeId === 'all' ? 'all' : 'single';
        
        if (loadError) {
            host.innerHTML = '<p class="themes-empty">Couldn’t load the guide.</p>';
            return;
        }
        if (!loaded) {
            host.innerHTML = '<p class="themes-empty">Loading…</p>';
            return;
        }
        const state = view(data, { query, themeId });
        if (state.empty) {
            host.innerHTML = query
                ? '<p class="themes-empty">Nothing matches that search.</p>'
                : '<p class="themes-empty">No names in this list yet.</p>';
            return;
        }
        host.innerHTML = state.themes.map(theme => {
            const rows = theme.companies.map(c => `
                <article class="themes-row" data-ticker="${escapeHtml(c.ticker)}">
                    <div class="themes-tk">${escapeHtml(c.ticker)}</div>
                    <div class="themes-copy">
                        <div class="themes-name">${escapeHtml(c.name)}</div>
                        <p class="themes-does">${escapeHtml(c.does)}</p>
                    </div>
                </article>`).join('');
            const blurb = theme.blurb
                ? `<p class="themes-blurb">${escapeHtml(theme.blurb)}</p>`
                : '';
            const asOf = theme.source === 'generated' && data.asOf
                ? `<span class="themes-asof">${escapeHtml(fmtAsOf(data.asOf))}</span>`
                : '';
            
            /* Add copy button for gainer scans */
            const isGainerScan = theme.id === 'gainers-all' || theme.id.startsWith('gainers-');
            const copyBtn = isGainerScan
                ? `<button type="button" class="themes-copy-btn" data-theme-id="${escapeHtml(theme.id)}" title="Copy tickers"><span data-icon="clipboard-copy"></span></button>`
                : '';
            
            return `
                <section class="themes-section" aria-labelledby="theme-${escapeHtml(theme.id)}">
                    <header class="themes-section-head">
                        <div>
                            <h2 class="themes-kicker" id="theme-${escapeHtml(theme.id)}">${escapeHtml(theme.name)}</h2>
                            ${blurb}
                        </div>
                        <span class="themes-section-meta">${asOf}<span class="themes-section-n">${theme.companies.length}</span>${copyBtn}</span>
                    </header>
                    <div class="themes-rows">${rows}</div>
                </section>`;
        }).join('');
        
        /* Hydrate icons in dynamically inserted content */
        if (window.hydrateIcons) window.hydrateIcons(host);
    }

    function renderCount() {
        const el = $('themesCount');
        if (!el) return;
        const state = view(data, { query, themeId });
        const names = state.nameCount;
        const nameWord = names === 1 ? 'name' : 'names';
        if (!loaded || loadError) { el.textContent = ''; return; }
        if (query) {
            el.textContent = `${names} ${nameWord}`;
            return;
        }
        if (themeId !== 'all') {
            el.textContent = `${names} ${nameWord}`;
            return;
        }
        const themes = data.themes.filter(t => t.companies.length).length;
        const themeWord = themes === 1 ? 'theme' : 'themes';
        el.textContent = `${themes} ${themeWord} · ${names} ${nameWord}`;
    }

    function render() {
        renderRail();
        renderBody();
        renderCount();
        const clear = $('themesSearchClear');
        if (clear) clear.hidden = !query;
    }

    function setTheme(id) {
        /* An id the data doesn't know (stale link, removed theme) falls back
           to All rather than filtering the page down to nothing. */
        const known = id && id !== 'all' && (data?.themes || []).some(t => t.id === id);
        themeId = known ? id : 'all';
        render();
    }

    function setQuery(value) {
        query = String(value || '');
        render();
    }

    function wire() {
        const input = $('themesSearch');
        const clear = $('themesSearchClear');
        const railHost = $('themesRail');
        const bodyHost = $('themesBody');
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
        if (railHost) {
            /* Scoped to the item class — a bare [data-theme] selector would
               walk past the rail and grab <html data-theme="dark">. */
            railHost.addEventListener('click', (e) => {
                const btn = e.target.closest('.themes-rail-item');
                if (!btn) return;
                setTheme(btn.dataset.themeId);
            });
        }
        if (bodyHost) {
            /* Copy tickers button for gainer scans */
            bodyHost.addEventListener('click', (e) => {
                const btn = e.target.closest('.themes-copy-btn');
                if (!btn) return;
                const themeId = btn.dataset.themeId;
                const theme = data.themes.find(t => t.id === themeId);
                if (!theme) return;
                const tickers = theme.companies.map(c => c.ticker).join(' ');
                navigator.clipboard.writeText(tickers);
                const APP = window.APP || {};
                if (APP.toast) {
                    APP.toast(`<b>${theme.companies.length} ticker${theme.companies.length === 1 ? '' : 's'}</b> copied`);
                }
            });
        }
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
    }

    async function fetchJson(path) {
        const res = await fetch(path, { cache: 'no-store' });
        if (!res.ok) throw new Error(String(res.status));
        return res.json();
    }

    async function load() {
        /* movers.json is scanner-owned and optional — the page is complete
           without it, so its absence is not an error state. */
        const movers = await fetchJson('data/movers.json').catch(() => null);
        try {
            data = combine(await fetchJson('data/guide.json'), movers);
            loaded = true;
            loadError = false;
        } catch {
            data = combine(null, movers);
            loaded = true;
            loadError = !data.themes.length;
        }
        render();
    }

    function init() {
        wire();
        render();
        load();
    }

    return { parse, combine, view, rail, init, render };
})();
