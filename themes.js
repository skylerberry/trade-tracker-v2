/* Themes tracker: read-only daily catalog, isolated from trading state. */
const THEME_TRACKER = (() => {
    const WINDOWS = { d: 'Daily', w: '1W', m: '1M', q: '3M', h: '6M', y: 'YTD' };
    const FOCUSED = new Set([
        'semiconductors', 'software-related', 'cybersecurity', 'drones-related',
        'quantum-computing', 'space-satellite', 'robotics', 'neoclouds', 'crypto',
        'gold-miners', 'silver-miners', 'copper', 'commodity-mining', 'ai-storage-infra',
        'healthcare-biotech', 'optics-photonics', 'oil-gas', 'mag-7',
    ]);
    const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const pct = n => Number.isFinite(n) ? `${n > 0 ? '+' : ''}${n.toFixed(2)}%` : '—';
    const money = n => !Number.isFinite(n) ? '—' : n >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : `$${Math.round(n / 1e6)}M`;
    const color = n => !Number.isFinite(n) ? '' : n >= 0 ? 'up' : 'down';
    const count = (n, noun) => `${n} ${noun}${n === 1 ? '' : 's'}`;

    function fold(s) {
        return String(s || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/\$/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
    }
    function compact(s) { return fold(s).replace(/\s+/g, ''); }
    function tokens(s) { return fold(s).split(/\s+/).filter(Boolean); }
    const QUERY_ALIASES = {
        datacenter: ['data center'],
        datacenters: ['data center', 'data centers'],
        datacentre: ['data center'],
        colo: ['data center', 'colocation'],
        colocation: ['data center'],
        semis: ['semiconductor', 'semiconductors'],
        semiconductor: ['semiconductors'],
        cybersecurity: ['cyber security'],
        neocloud: ['neo cloud'],
        neoclouds: ['neo cloud'],
        photonics: ['optics'],
    };
    function searchMatch(hay, query) {
        if (!String(query || '').trim()) return true;
        const hFold = fold(hay);
        const hComp = compact(hay);
        const hTok = new Set(tokens(hay));
        const variants = [fold(query)];
        const alias = QUERY_ALIASES[compact(query)];
        if (alias) variants.push(...alias);
        for (const variant of variants) {
            if (hFold.includes(fold(variant)) || hComp.includes(compact(variant))) return true;
            const vt = tokens(variant);
            if (vt.length > 1 && vt.every(t => hTok.has(t) || hComp.includes(t))) return true;
        }
        return false;
    }

    function maReason(value, on, name) {
        if (!on) return null;
        return value == null ? `${name} unavailable` : value > 0 ? null : `Not above ${name}`;
    }

    function filterReasons(c, { minAdr = 1.5, minDv = 5, aboveOnly = false, above10 = false, above21 = false, above200 = false, max52 = null } = {}) {
        return [
            !Number.isFinite(c.adr) ? 'ADR unavailable' : c.adr < minAdr ? `ADR ${c.adr.toFixed(2)}% < ${minAdr}%` : null,
            !Number.isFinite(c.dv) ? 'Average volume unavailable' : c.dv < minDv * 1e6 ? `Avg. volume ${money(c.dv)} < $${minDv}M` : null,
            maReason(c.ema10, above10, '10 EMA'),
            maReason(c.ema21, above21, '21 EMA'),
            aboveOnly && !(c.ext > 0) ? (c.ext == null ? '50-day SMA unavailable' : 'Not above 50-day SMA') : null,
            maReason(c.sma200, above200, '200 SMA'),
            max52 == null ? null : !Number.isFinite(c.dist52h) ? '52W high unavailable' : c.dist52h > max52 ? `${c.dist52h.toFixed(1)}% below 52W high > ${max52}%` : null,
        ].filter(Boolean);
    }

    function computeThemes(data, options = {}) {
        const { query = '', window: win = 'd', scope = 'all', selected = null } = options;
        const q = query.trim().toLowerCase();
        return (data.themes || []).map(theme => {
            const all = theme.tickers.map(t => data.companies[t]).filter(c => c && !String(c.ticker).toUpperCase().endsWith('.A'));
            const liquid = all.filter(c => c.adr >= 3 && c.dv >= 1e8 && Number.isFinite(c.ret?.[win]));
            const mean = liquid.length ? liquid.reduce((sum, c) => sum + c.ret[win], 0) / liquid.length : null;
            const hayTheme = theme.name;
            const rows = all.filter(c => {
                const hay = `${c.ticker} ${c.name} ${c.does || ''} ${hayTheme}`;
                const textHit = !q || searchMatch(hay, q);
                if (!textHit) return false;
                if (q && compact(c.ticker) === compact(q)) return true;
                return !filterReasons(c, options).length;
            });
            rows.sort((a, b) => (b.ret?.[win] ?? -Infinity) - (a.ret?.[win] ?? -Infinity) || a.ticker.localeCompare(b.ticker));
            return { ...theme, rows, mean, total: all.length };
        }).filter(t => {
            if (!t.rows.length) return false;
            if (scope !== 'focus') return true;
            if (FOCUSED.has(t.id) || t.id === selected) return true;
            return Boolean(q);
        }).sort((a, b) => (b.mean ?? -Infinity) - (a.mean ?? -Infinity) || a.name.localeCompare(b.name));
    }

    function themeForTicker(data, ticker) {
        const tk = String(ticker || '').trim().toUpperCase();
        if (!tk || !data?.themes) return null;
        return data.themes.find(t => t.id !== 'mag-7' && t.tickers.includes(tk))
            || data.themes.find(t => t.tickers.includes(tk))
            || null;
    }

    function tickersLine(rows) {
        return (rows || []).map(c => c.ticker).filter(Boolean).join(', ');
    }

    function loosenFor(c, current) {
        const next = { ...current };
        if (Number.isFinite(c.adr)) next.minAdr = Math.min(current.minAdr, Math.floor(c.adr * 2) / 2);
        if (Number.isFinite(c.dv)) next.minDv = Math.min(current.minDv, Math.floor(c.dv / 5e6) * 5);
        if (!(c.ext > 0)) next.aboveOnly = false;
        if (!(c.ema10 > 0)) next.above10 = false;
        if (!(c.ema21 > 0)) next.above21 = false;
        if (!(c.sma200 > 0)) next.above200 = false;
        if (current.max52 != null && Number.isFinite(c.dist52h) && c.dist52h > current.max52) {
            next.max52 = Math.ceil(c.dist52h);
        }
        return next;
    }

    let data = null, error = false, wired = false, win = 'd', query = '', selected = null, expandAll = false, skipTrackIn = false;
    let minAdr = 1.5, minDv = 5, aboveOnly = false, above10 = false, above21 = false, above200 = false, max52 = null, pill = null, pillPlaced = false, scope = 'focus', scopePill = null, scopePlaced = false;
    const $ = id => document.getElementById(`themes-${id}`);
    const options = () => ({ query, window: win, minAdr, minDv, aboveOnly, above10, above21, above200, max52, selected, scope });
    function parseRoute(hash) {
        if (hash.startsWith('#themes/lookup/')) {
            let ticker = hash.slice(15);
            try { ticker = decodeURIComponent(ticker); } catch { /* Keep malformed links readable. */ }
            return { query: ticker.trim().toLowerCase(), selected: null };
        }
        return { query: null, selected: hash.startsWith('#themes/') ? hash.slice(8) : null };
    }
    function readRoute() {
        const route = parseRoute(location.hash);
        selected = route.selected;
        if (route.query !== null) {
            query = route.query;
            $('search').value = query.toUpperCase();
        }
    }
    const setHash = () => history.replaceState(null, '', selected ? `#themes/${selected}` : '#themes');

    function companyDetails(c) {
        const maChip = (value, name) => {
            const cls = value == null || value === 0 ? 'metric-neutral' : value > 0 ? 'metric-above' : 'metric-below';
            const text = value == null ? `${name} unavailable` : value > 0 ? `Above ${name}` : value < 0 ? `Below ${name}` : `At ${name}`;
            const icons = typeof ICONS !== 'undefined' ? ICONS : null;
            const mark = value > 0 && icons ? icons['arrow-up']
                : value < 0 && icons ? icons['arrow-down']
                : '<i aria-hidden="true"></i>';
            return `<span class="stock-metric ${cls}">${mark}${text}</span>`;
        };
        const distance = !Number.isFinite(c.dist52h) ? '52W high unavailable' : c.dist52h === 0 ? 'At 52W high' : `${c.dist52h.toFixed(1)}% below 52W high`;
        const does = c.does
            ? `<p class="does-line">${escapeHtml(c.does)}<button type="button" class="does-copy" data-copy-does="${escapeHtml(c.ticker)}" aria-label="Copy description" title="Copy description">${typeof ICONS !== 'undefined' ? ICONS.copy : 'Copy'}</button></p>`
            : '';
        return `<div class="tracker-stock-detail"><div class="tracker-company-heading"><strong>${escapeHtml(c.name)}</strong><a href="https://www.tradingview.com/chart/?symbol=${encodeURIComponent(c.ticker)}" target="_blank" rel="noopener noreferrer">Open chart ↗</a><button type="button" class="size-trade" data-size-trade="${escapeHtml(c.ticker)}">Size trade</button></div><div class="stock-metrics"><span class="stock-metric metric-adr"><i aria-hidden="true"></i>${Number.isFinite(c.adr) ? c.adr.toFixed(1) + '%' : '—'} ADR</span><span class="stock-metric metric-volume"><i aria-hidden="true"></i>${money(c.dv)} avg. volume</span>${maChip(c.ema10, '10 EMA')}${maChip(c.ema21, '21 EMA')}${maChip(c.ext, '50-day SMA')}${maChip(c.sma200, '200 SMA')}<span class="stock-metric metric-52h"><i aria-hidden="true"></i>${distance}</span></div>${does}</div>`;
    }

    function trackerHTML(themes) {
        const theme = themes.find(t => t.id === selected);
        const items = theme ? theme.rows.map(c => ({ label: c.ticker, value: c.ret[win], company: c })) : themes.map(t => ({ label: t.name, value: t.mean, theme: t }));
        const max = Math.max(0.01, ...items.map(x => Math.abs(x.value ?? 0)));
        const axis = max >= 10 ? Math.ceil(max / 10) * 10 : Math.ceil(max);
        let trackI = 0;
        const bar = value => {
            const width = Number.isFinite(value) ? Math.abs(value) / axis * 50 : 0;
            const delay = skipTrackIn ? 0 : Math.min(trackI++, 16) * 22;
            const origin = value < 0 ? 'right' : 'left';
            return `<span class="track" aria-hidden="true"><span class="track-zero"></span><span class="track-fill ${color(value)}${skipTrackIn ? ' is-static' : ''}" style="left:${value < 0 ? 50 - width : 50}%;width:${width}%;transform-origin:${origin} center;animation-delay:${delay}ms"></span></span>`;
        };
        const copy = theme && items.length
            ? `<button type="button" class="tracker-copy" data-copy-tickers data-tip="Copy all listed tickers" aria-label="Copy ${items.length} tickers">Copy tickers</button>`
            : '';
        const nameHead = theme
            ? `<button type="button" class="axis-name" data-expand-names aria-pressed="${expandAll}" title="${expandAll ? 'Hide all descriptions' : 'Show all descriptions'}">NAME</button>`
            : `<span>THEME</span>`;
        return `<section class="tracker" aria-label="${theme ? escapeHtml(theme.name) + ' stocks' : 'Theme performance tracker'}"><div class="tracker-heading">${theme ? `<button type="button" class="tracker-back" data-back aria-label="Back to all themes">←</button><h2>${escapeHtml(theme.name)}</h2><span class="tracker-count">${theme.id === 'mag-7' ? `${items.length} of 7 names` : count(items.length, 'name')}</span>${copy}` : `<h2>Theme performance</h2><span class="tracker-count">${count(items.length, 'theme')}</span>`}<span class="tracker-period">${WINDOWS[win]} return</span></div><div class="tracker-axis">${nameHead}<span class="axis-scale"><span>−${axis}%</span><span>0</span><span>+${axis}%</span></span><span>CHANGE</span></div><div class="tracker-rows">${items.map(x => x.company ? `<details class="tracker-stock" ${expandAll || query.toUpperCase() === x.label || (query && searchMatch(`${x.company.ticker} ${x.company.name} ${x.company.does || ''}`, query)) ? 'open' : ''}><summary class="tracker-row ${x.company.ext != null && x.company.ext < 0 ? 'below' : ''}" title="${escapeHtml(x.company.name)}"><span class="tracker-label">${escapeHtml(x.label)}</span>${bar(x.value)}<span class="return ${color(x.value)}">${pct(x.value)}</span></summary>${companyDetails(x.company)}</details>` : `<button type="button" class="tracker-row" data-theme="${escapeHtml(x.theme.id)}" aria-label="Open ${escapeHtml(x.label)}"><span class="tracker-label">${escapeHtml(x.label)}</span>${bar(x.value)}<span class="return ${color(x.value)}">${pct(x.value)}</span></button>`).join('')}</div></section>`;
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
            scopePill?.set(scope, true);
            pillPlaced = true;
        }
        if (!data) { $('workspace').innerHTML = `<p class="empty">${error ? 'Couldn’t load themes. Please reload to try again.' : 'Loading themes…'}</p>`; return; }
        if (location.hash.startsWith('#themes/lookup/')) {
            const ticker = query.toUpperCase();
            const company = data.companies[ticker];
            if (company && filterReasons(company, options()).length) {
                const next = loosenFor(company, options());
                minAdr = next.minAdr;
                minDv = next.minDv;
                aboveOnly = next.aboveOnly;
                if ($('adr')) $('adr').value = minAdr;
                if ($('dv')) $('dv').value = minDv;
                if ($('aboveOnly')) $('aboveOnly').checked = aboveOnly;
                above10 = next.above10 === false ? false : above10;
                above21 = next.above21 === false ? false : above21;
                above200 = next.above200 === false ? false : above200;
                if ($('above10')) $('above10').checked = above10;
                if ($('above21')) $('above21').checked = above21;
                if ($('above200')) $('above200').checked = above200;
                max52 = next.max52 === undefined ? max52 : next.max52;
                if ($('near52')) $('near52').value = max52 == null ? '' : max52;
            }
            selected = themeForTicker(data, ticker)?.id || null;
        }
        const themes = computeThemes(data, options());
        $('counts').textContent = `${count(themes.length, 'theme')} · ${count(new Set(themes.flatMap(t => t.rows.map(c => c.ticker))).size, 'name')}`;
        if ($('belowLegend')) $('belowLegend').hidden = !selected;
        const active = (minAdr !== 1.5 ? 1 : 0) + (minDv !== 5 ? 1 : 0) + (aboveOnly ? 1 : 0) + (above10 ? 1 : 0) + (above21 ? 1 : 0) + (above200 ? 1 : 0) + (max52 != null ? 1 : 0);
        $('filterBadge').textContent = active || '';
        $('filterBadge').hidden = !active;
        renderFeedback();
        const lookupMiss = location.hash.startsWith('#themes/lookup/') && query && !Object.values(data.companies).some(c => c.ticker.toLowerCase().includes(query) || c.name.toLowerCase().includes(query));
        $('workspace').innerHTML = themes.length ? trackerHTML(themes) : `<p class="empty">${lookupMiss ? 'No stock in the current Themes catalog matches “' + escapeHtml(query.toUpperCase()) + '”.' : 'No names match these filters. Try a broader search or reset the filters.'}</p>`;
    }

    function applyFilters() {
        minAdr = Math.max(0, Number($('adr').value) || 0);
        minDv = Math.max(0, Number($('dv').value) || 0);
        $('adr').value = minAdr; $('dv').value = minDv;
        const raw52 = $('near52').value.trim();
        max52 = raw52 === '' ? null : Math.max(0, Number(raw52));
        if (max52 != null && !Number.isFinite(max52)) max52 = null;
        if (max52 != null) $('near52').value = max52;
        aboveOnly = $('aboveOnly').checked;
        above10 = $('above10').checked;
        above21 = $('above21').checked;
        above200 = $('above200').checked;
        render();
    }

    function init() {
        if (wired) return;
        wired = true;
        const root = document.getElementById('themesView');
        const segment = root.querySelector('.windows');
        pill = MOTION.segmented(segment, value => { win = value; render(); });
        const scopeSeg = root.querySelector('.scope');
        scopePill = MOTION.segmented(scopeSeg, value => { scope = value; render(); });
        segment.addEventListener('keydown', event => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.stopPropagation(); event.preventDefault();
            const keys = Object.keys(WINDOWS), i = keys.indexOf(win);
            win = event.key === 'Home' ? keys[0] : event.key === 'End' ? keys.at(-1) : keys[(i + (event.key === 'ArrowRight' ? 1 : -1) + keys.length) % keys.length];
            pill.set(win); segment.querySelector(`[data-seg="${win}"]`).focus(); render();
        });
        root.addEventListener('click', event => {
            const theme = event.target.closest('button[data-theme]');
            if (theme) { selected = theme.dataset.theme; expandAll = false; setHash(); render(); return; }
            if (event.target.closest('[data-expand-names]')) { expandAll = !expandAll; skipTrackIn = true; render(); skipTrackIn = false; return; }
            if (event.target.closest('[data-back]')) { selected = null; expandAll = false; query = ''; $('search').value = ''; setHash(); render(); return; }
            const sizeBtn = event.target.closest('[data-size-trade]');
            if (sizeBtn) {
                window.dispatchEvent(new CustomEvent('skyler:size-trade', { detail: { ticker: sizeBtn.dataset.sizeTrade } }));
                return;
            }
            const copy = event.target.closest('[data-copy-tickers]');
            const doesCopy = event.target.closest('[data-copy-does]');
            if (doesCopy) {
                const line = data?.companies[doesCopy.dataset.copyDoes]?.does;
                if (!line) return;
                const icon = doesCopy.innerHTML;
                const done = () => {
                    if (typeof ICONS !== 'undefined') doesCopy.innerHTML = ICONS['copy-check'];
                    doesCopy.setAttribute('aria-label', 'Copied');
                    setTimeout(() => {
                        if (!doesCopy.isConnected) return;
                        doesCopy.innerHTML = icon;
                        doesCopy.setAttribute('aria-label', 'Copy description');
                    }, 1600);
                };
                (navigator.clipboard?.writeText(line) || Promise.reject()).then(done).catch(() => {
                    const input = document.createElement('textarea');
                    input.value = line;
                    document.body.appendChild(input);
                    input.select();
                    document.execCommand('copy');
                    input.remove();
                    done();
                });
                return;
            }
            if (copy) {
                const theme = computeThemes(data, options()).find(t => t.id === selected);
                const line = tickersLine(theme?.rows);
                if (!line) return;
                const done = () => {
                    copy.textContent = 'Copied';
                    copy.setAttribute('aria-label', 'Copied');
                    setTimeout(() => {
                        if (!copy.isConnected) return;
                        copy.textContent = 'Copy tickers';
                        copy.setAttribute('aria-label', `Copy ${theme.rows.length} tickers`);
                    }, 1600);
                };
                (navigator.clipboard?.writeText(line) || Promise.reject()).then(done).catch(() => {
                    const input = document.createElement('textarea');
                    input.value = line;
                    document.body.appendChild(input);
                    input.select();
                    document.execCommand('copy');
                    input.remove();
                    done();
                });
                return;
            }
            const step = event.target.closest('[data-step-for]');
            if (step) {
                const input = document.getElementById(step.dataset.stepFor) || $(step.dataset.stepFor);
                if (!input) return;
                if (input.id === 'themes-near52' && input.value === '') input.value = Number(step.dataset.step) > 0 ? 10 : 0;
                else Number(step.dataset.step) > 0 ? input.stepUp() : input.stepDown();
                applyFilters();
                return;
            }
            const reveal = event.target.closest('[data-reveal]');
            if (reveal) {
                const c = data.companies[reveal.dataset.reveal];
                $('adr').value = Math.min(minAdr, Math.floor(c.adr * 2) / 2);
                $('dv').value = Math.min(minDv, Math.floor(c.dv / 5e6) * 5);
                if (!(c.ext > 0)) $('aboveOnly').checked = false;
                if (!(c.ema10 > 0)) $('above10').checked = false;
                if (!(c.ema21 > 0)) $('above21').checked = false;
                if (!(c.sma200 > 0)) $('above200').checked = false;
                selected = themeForTicker(data, c.ticker)?.id || null;
                setHash(); applyFilters();
            }
        });
        const syncClear = () => { if ($('searchClear')) $('searchClear').hidden = !$('search').value; };
        $('search').addEventListener('input', event => {
            query = event.target.value.trim().toLowerCase();
            const exact = data?.companies[compact(query).toUpperCase()] || data?.companies[query.replace(/^\$/, '').toUpperCase()];
            selected = exact ? themeForTicker(data, exact.ticker)?.id || null : null;
            setHash(); render();
            syncClear();
        });
        const clearSearch = () => {
            const input = $('search');
            const finish = () => {
                query = ''; selected = null; input.value = ''; input.classList.remove('is-clearing');
                setHash(); render(); input.focus(); syncClear();
            };
            if (!input.value || MOTION.reduceMotion) { finish(); return; }
            input.classList.add('is-clearing');
            input.addEventListener('animationend', finish, { once: true });
        };
        $('searchClear')?.addEventListener('click', clearSearch);
        $('search').addEventListener('keydown', event => { if (event.key === 'Escape') clearSearch(); });
        const filtersBlock = document.getElementById('themes-filtersBlock');
        const filtersWrap = document.getElementById('themes-filtersWrap');
        const setFilters = MOTION.collapsible(filtersBlock, filtersWrap, false);
        const aboutBlock = document.getElementById('themes-aboutBlock');
        const aboutWrap = document.getElementById('themes-aboutWrap');
        const setAbout = MOTION.collapsible(aboutBlock, aboutWrap, false);
        $('filterToggle').addEventListener('click', () => {
            const open = !filtersBlock.classList.contains('is-open');
            setFilters(open);
            if (open) { setAbout(false); $('aboutToggle').setAttribute('aria-expanded', 'false'); }
            $('filterToggle').setAttribute('aria-expanded', String(open));
        });
        $('aboutToggle').addEventListener('click', () => {
            const open = !aboutBlock.classList.contains('is-open');
            setAbout(open);
            if (open) { setFilters(false); $('filterToggle').setAttribute('aria-expanded', 'false'); }
            $('aboutToggle').setAttribute('aria-expanded', String(open));
        });
        for (const id of ['adr', 'dv', 'near52', 'aboveOnly', 'above10', 'above21', 'above200']) $(id).addEventListener('change', applyFilters);
        $('reset').addEventListener('click', () => {
            $('adr').value = 1.5; $('dv').value = 5; $('near52').value = '';
            for (const id of ['aboveOnly', 'above10', 'above21', 'above200']) $(id).checked = false;
            applyFilters();
        });
        window.addEventListener('hashchange', () => { if (location.hash.startsWith('#themes')) { readRoute(); render(); } });
        document.addEventListener('keydown', event => {
            if (document.body.dataset.view !== 'themes') return;
            if (event.ctrlKey || event.metaKey || event.altKey) return;
            if (event.isComposing || event.repeat) return;
            if (event.target.closest('input, textarea, select, [contenteditable]')) return;
            const slash = event.key === '/';
            if (!slash && event.key.length !== 1) return;
            event.preventDefault();
            const input = $('search');
            input.focus();
            if (slash) return;
            const start = input.selectionStart ?? input.value.length;
            const end = input.selectionEnd ?? input.value.length;
            input.setRangeText(event.key, start, end, 'end');
            input.dispatchEvent(new Event('input', { bubbles: true }));
        });
        if (typeof hydrateIcons === 'function') hydrateIcons();
        readRoute();
        render();
        fetch('data/daily-scan.json', { cache: 'no-store' }).then(response => {
            if (!response.ok) throw new Error('catalog unavailable');
            return response.json();
        }).then(raw => {
            if (!raw.companies || !Array.isArray(raw.themes) || !/^\d{4}-\d{2}-\d{2}$/.test(raw.asOf)) throw new Error('invalid catalog');
            data = raw;
            for (const [ticker, c] of Object.entries(data.companies)) { c.ticker = ticker; c.ret ||= {}; }
            const asOfDate = new Date(data.asOf + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
            const asof = $('asof');
            asof.textContent = `Updated after the close · ${asOfDate}`;
            asof.title = `Market data as of ${data.asOf}`;
            const chip = asof.closest('.date');
            if (chip) {
                const expected = typeof ENGINE !== 'undefined' && ENGINE.expectedPublishedSession
                    ? ENGINE.expectedPublishedSession()
                    : data.asOf;
                chip.classList.toggle('is-stale', data.asOf < expected);
            }
            const coverage = $('coverage');
            if (coverage) {
                const missing = Object.values(data.companies).filter(c => !c.does).length;
                coverage.textContent = `${count(Object.keys(data.companies).length - missing, 'company description')} available. ${count((data.unassigned || []).length, 'scan match')} awaiting a theme assignment.`;
            }
            render();
        }).catch(() => { error = true; data = null; render(); });
    }
    return { init, render, computeThemes, filterReasons, parseRoute, themeForTicker, tickersLine, loosenFor, searchMatch };
})();
