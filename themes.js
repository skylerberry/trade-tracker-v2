/* Themes tracker: read-only daily catalog, isolated from trading state. */
const THEME_TRACKER = (() => {
    const WINDOWS = { d: 'Daily', w: '1W', m: '1M', q: '3M', y: 'YTD' };
    const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const pct = n => Number.isFinite(n) ? `${n > 0 ? '+' : ''}${n.toFixed(2)}%` : '—';
    const money = n => !Number.isFinite(n) ? '—' : n >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : `$${Math.round(n / 1e6)}M`;
    const color = n => !Number.isFinite(n) ? '' : n >= 0 ? 'up' : 'down';
    const count = (n, noun) => `${n} ${noun}${n === 1 ? '' : 's'}`;

    function filterReasons(c, { minAdr = 3, minDv = 100, aboveOnly = false } = {}) {
        return [
            !Number.isFinite(c.adr) ? 'ADR unavailable' : c.adr < minAdr ? `ADR ${c.adr.toFixed(2)}% < ${minAdr}%` : null,
            !Number.isFinite(c.dv) ? 'Average volume unavailable' : c.dv < minDv * 1e6 ? `Avg. volume ${money(c.dv)} < $${minDv}M` : null,
            aboveOnly && !(c.ext > 0) ? (c.ext == null ? '50-day SMA unavailable' : 'Not above 50-day SMA') : null,
        ].filter(Boolean);
    }

    function computeThemes(data, options = {}) {
        const { query = '', window: win = 'd' } = options;
        const q = query.trim().toLowerCase();
        return (data.themes || []).map(theme => {
            const all = theme.tickers.map(t => data.companies[t]).filter(Boolean);
            const liquid = all.filter(c => c.adr >= 3 && c.dv >= 1e8 && Number.isFinite(c.ret?.[win]));
            const mean = liquid.length ? liquid.reduce((sum, c) => sum + c.ret[win], 0) / liquid.length : null;
            const themeHit = theme.name.toLowerCase().includes(q);
            const rows = all.filter(c => !filterReasons(c, options).length && (!q || themeHit || `${c.ticker} ${c.name}`.toLowerCase().includes(q)));
            rows.sort((a, b) => (b.ret?.[win] ?? -Infinity) - (a.ret?.[win] ?? -Infinity) || a.ticker.localeCompare(b.ticker));
            return { ...theme, rows, mean, total: all.length };
        }).filter(t => t.rows.length).sort((a, b) => (b.mean ?? -Infinity) - (a.mean ?? -Infinity) || a.name.localeCompare(b.name));
    }

    let data = null, error = false, wired = false, win = 'd', query = '', selected = null;
    let minAdr = 3, minDv = 100, aboveOnly = false, pill = null, pillPlaced = false;
    const $ = id => document.getElementById(`themes-${id}`);
    const options = () => ({ query, window: win, minAdr, minDv, aboveOnly });
    const fromHash = () => location.hash.startsWith('#themes/') ? location.hash.slice(8) : null;
    const setHash = () => history.replaceState(null, '', selected ? `#themes/${selected}` : '#themes');

    function companyDetails(c) {
        const trend = c.ext == null ? '50-day SMA unavailable' : c.ext < 0 ? 'Below 50-day SMA' : c.ext > 0 ? 'Above 50-day SMA' : 'At 50-day SMA';
        const trendClass = c.ext == null || c.ext === 0 ? 'metric-neutral' : c.ext > 0 ? 'metric-above' : 'metric-below';
        const distance = !Number.isFinite(c.dist52h) ? '52W high unavailable' : c.dist52h === 0 ? 'At 52W high' : `${c.dist52h.toFixed(1)}% below 52W high`;
        return `<div class="tracker-stock-detail"><div class="tracker-company-heading"><strong>${escapeHtml(c.name)}</strong><a href="https://www.tradingview.com/chart/?symbol=${encodeURIComponent(c.ticker)}" target="_blank" rel="noopener noreferrer">Open chart ↗</a></div><div class="stock-metrics"><span class="stock-metric metric-adr"><i aria-hidden="true"></i>${Number.isFinite(c.adr) ? c.adr.toFixed(1) + '%' : '—'} ADR</span><span class="stock-metric metric-volume"><i aria-hidden="true"></i>${money(c.dv)} avg. volume</span><span class="stock-metric ${trendClass}"><i aria-hidden="true"></i>${trend}</span><span class="stock-metric metric-52h"><i aria-hidden="true"></i>${distance}</span></div>${c.does ? `<p>${escapeHtml(c.does)}</p>` : ''}</div>`;
    }

    function trackerHTML(themes) {
        const theme = themes.find(t => t.id === selected);
        const items = theme ? theme.rows.map(c => ({ label: c.ticker, value: c.ret[win], company: c })) : themes.map(t => ({ label: t.name, value: t.mean, theme: t }));
        const max = Math.max(0.01, ...items.map(x => Math.abs(x.value ?? 0)));
        const axis = max >= 10 ? Math.ceil(max / 10) * 10 : Math.ceil(max);
        const bar = value => {
            const width = Number.isFinite(value) ? Math.abs(value) / axis * 50 : 0;
            return `<span class="track" aria-hidden="true"><span class="track-zero"></span><span class="track-fill ${color(value)}" style="left:${value < 0 ? 50 - width : 50}%;width:${width}%"></span></span>`;
        };
        return `<section class="tracker" aria-label="${theme ? escapeHtml(theme.name) + ' stocks' : 'Theme performance tracker'}"><div class="tracker-heading">${theme ? `<button type="button" class="tracker-back" data-back aria-label="Back to all themes">←</button><h2>${escapeHtml(theme.name)}</h2><span class="tracker-count">${theme.id === 'mag-7' ? `${items.length} of 7 names` : count(items.length, 'name')}</span>` : `<h2>Theme performance</h2><span class="tracker-count">${count(items.length, 'theme')}</span>`}<span class="tracker-period">${WINDOWS[win]} return</span></div><div class="tracker-axis"><span>${theme ? 'NAME' : 'THEME'}</span><span class="axis-scale"><span>−${axis}%</span><span>0</span><span>+${axis}%</span></span><span>CHANGE</span></div><div class="tracker-rows">${items.map(x => x.company ? `<details class="tracker-stock" ${query.toUpperCase() === x.label ? 'open' : ''}><summary class="tracker-row ${x.company.ext != null && x.company.ext < 0 ? 'below' : ''}" title="${escapeHtml(x.company.name)}"><span class="tracker-label">${escapeHtml(x.label)}</span>${bar(x.value)}<span class="return ${color(x.value)}">${pct(x.value)}</span></summary>${companyDetails(x.company)}</details>` : `<button type="button" class="tracker-row" data-theme="${escapeHtml(x.theme.id)}" aria-label="Open ${escapeHtml(x.label)}"><span class="tracker-label">${escapeHtml(x.label)}</span>${bar(x.value)}<span class="return ${color(x.value)}">${pct(x.value)}</span></button>`).join('')}</div></section>`;
    }

    function renderFeedback() {
        if (!query) { $('searchFeedback').innerHTML = ''; return; }
        const hidden = Object.values(data.companies).filter(c => `${c.ticker} ${c.name}`.toLowerCase().includes(query)).map(c => ({ c, reasons: filterReasons(c, options()) })).filter(x => x.reasons.length);
        $('searchFeedback').innerHTML = hidden.length ? `<div class="search-feedback"><div class="feedback-heading">${count(hidden.length, 'matching name')} hidden by filters</div>${hidden.map(({ c, reasons }) => `<div class="hidden-match"><div><strong>${escapeHtml(c.ticker)}</strong><span>${escapeHtml(c.name)}</span><small>${escapeHtml(reasons.join(' · '))}</small>${query === c.ticker.toLowerCase() && c.does ? `<p class="search-company-does">${escapeHtml(c.does)}</p>` : ''}</div><button type="button" data-reveal="${escapeHtml(c.ticker)}">Adjust filters & reveal</button></div>`).join('')}</div>` : '';
    }

    function render() {
        if (!wired) return;
        // Initial reveal may follow hidden layout. Never snap a spring on data changes.
        if (!pillPlaced && document.getElementById('themesView').getClientRects().length) {
            pill?.set(win, true);
            pillPlaced = true;
        }
        if (!data) { $('workspace').innerHTML = `<p class="empty">${error ? 'Couldn’t load themes. Please reload to try again.' : 'Loading themes…'}</p>`; return; }
        const themes = computeThemes(data, options());
        $('counts').textContent = `${count(themes.length, 'theme')} · ${count(new Set(themes.flatMap(t => t.rows.map(c => c.ticker))).size, 'name')}`;
        $('filterBadge').textContent = aboveOnly ? '3' : '2';
        renderFeedback();
        $('workspace').innerHTML = themes.length ? trackerHTML(themes) : '<p class="empty">No names match these filters. Try a broader search or reset the filters.</p>';
    }

    function applyFilters() {
        minAdr = Math.max(0, Number($('adr').value) || 0);
        minDv = Math.max(20, Number($('dv').value) || 20);
        $('adr').value = minAdr; $('dv').value = minDv;
        aboveOnly = $('aboveOnly').checked;
        render();
    }

    function init() {
        if (wired) return;
        wired = true;
        const root = document.getElementById('themesView');
        const segment = root.querySelector('.windows');
        pill = MOTION.segmented(segment, value => { win = value; render(); });
        segment.addEventListener('keydown', event => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.stopPropagation(); event.preventDefault();
            const keys = Object.keys(WINDOWS), i = keys.indexOf(win);
            win = event.key === 'Home' ? keys[0] : event.key === 'End' ? keys.at(-1) : keys[(i + (event.key === 'ArrowRight' ? 1 : -1) + keys.length) % keys.length];
            pill.set(win); segment.querySelector(`[data-seg="${win}"]`).focus(); render();
        });
        root.addEventListener('click', event => {
            const theme = event.target.closest('button[data-theme]');
            if (theme) { selected = theme.dataset.theme; setHash(); render(); return; }
            if (event.target.closest('[data-back]')) { selected = null; query = ''; $('search').value = ''; setHash(); render(); return; }
            const step = event.target.closest('[data-step-for]');
            if (step) { const input = $(step.dataset.stepFor); Number(step.dataset.step) > 0 ? input.stepUp() : input.stepDown(); applyFilters(); return; }
            const reveal = event.target.closest('[data-reveal]');
            if (reveal) {
                const c = data.companies[reveal.dataset.reveal];
                $('adr').value = Math.min(minAdr, Math.floor(c.adr * 2) / 2);
                $('dv').value = Math.min(minDv, Math.floor(c.dv / 5e6) * 5);
                if (!(c.ext > 0)) $('aboveOnly').checked = false;
                selected = data.themes.find(t => t.tickers.includes(c.ticker))?.id || null;
                setHash(); applyFilters();
            }
        });
        $('search').addEventListener('input', event => {
            query = event.target.value.trim().toLowerCase();
            const exact = data?.companies[query.toUpperCase()];
            selected = exact ? data.themes.find(t => t.tickers.includes(exact.ticker))?.id || null : null;
            setHash(); render();
        });
        $('search').addEventListener('keydown', event => { if (event.key === 'Escape') { query = ''; selected = null; $('search').value = ''; setHash(); render(); } });
        for (const [button, panel] of [['filterToggle', 'filters'], ['aboutToggle', 'about']]) $(button).addEventListener('click', () => { $(panel).hidden = !$(panel).hidden; $(button).setAttribute('aria-expanded', String(!$(panel).hidden)); });
        for (const id of ['adr', 'dv', 'aboveOnly']) $(id).addEventListener('change', applyFilters);
        $('reset').addEventListener('click', () => { $('adr').value = 3; $('dv').value = 100; $('aboveOnly').checked = false; applyFilters(); });
        window.addEventListener('hashchange', () => { if (location.hash.startsWith('#themes')) { selected = fromHash(); render(); } });
        document.addEventListener('keydown', event => { if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey && document.body.dataset.view === 'themes' && !event.target.closest('input,textarea,[contenteditable]')) { event.preventDefault(); $('search').focus(); } });
        selected = fromHash();
        render();
        fetch('data/daily-scan.json', { cache: 'no-store' }).then(response => {
            if (!response.ok) throw new Error('catalog unavailable');
            return response.json();
        }).then(raw => {
            if (!raw.companies || !Array.isArray(raw.themes) || !/^\d{4}-\d{2}-\d{2}$/.test(raw.asOf)) throw new Error('invalid catalog');
            data = raw;
            for (const [ticker, c] of Object.entries(data.companies)) { c.ticker = ticker; c.ret ||= {}; }
            $('asof').textContent = `${new Date(data.asOf + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })} close`;
            $('asof').title = `Data as of ${data.asOf}`;
            const missing = Object.values(data.companies).filter(c => !c.does).length;
            $('coverage').textContent = `${count(Object.keys(data.companies).length - missing, 'company description')} available. ${count((data.unassigned || []).length, 'scan match')} awaiting a theme assignment.`;
            render();
        }).catch(() => { error = true; data = null; render(); });
    }
    return { init, render, computeThemes, filterReasons };
})();
