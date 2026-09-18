/* Relative Strength: theme rank history. Same roster as Themes. */
const RANK_HISTORY = (() => {
    const WINDOWS = (typeof THEME_TRACKER !== 'undefined' && THEME_TRACKER.WINDOWS)
        ? THEME_TRACKER.WINDOWS
        : { d: 'Daily', w: '1W', m: '1M', q: '3M', h: '6M', y: 'YTD' };
    const FOCUSED = (typeof THEME_TRACKER !== 'undefined' && THEME_TRACKER.FOCUSED)
        ? THEME_TRACKER.FOCUSED
        : new Set();
    const CHG_LOOKBACK = 21;
    const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const $ = id => document.getElementById(`rs-${id}`);

    function denseRanks(sessionRanks, ids) {
        const present = ids.filter(id => sessionRanks && sessionRanks[id] != null)
            .sort((a, b) => sessionRanks[a] - sessionRanks[b] || a.localeCompare(b));
        const map = {};
        present.forEach((id, index) => { map[id] = index + 1; });
        return map;
    }

    function rankColor(rank, n) {
        if (!n || rank == null) return 'transparent';
        const t = (rank - 1) / Math.max(1, n - 1);
        const mix = (a, b, p) => a + (b - a) * p;
        const hex = (r, g, b) => `rgb(${r | 0},${g | 0},${b | 0})`;
        if (t < 0.5) {
            const p = t / 0.5;
            return hex(mix(22, 161, p), mix(163, 161, p), mix(74, 170, p));
        }
        const p = (t - 0.5) / 0.5;
        return hex(mix(161, 220, p), mix(161, 38, p), mix(170, 38, p));
    }

    function monthMarks(dates) {
        const marks = [];
        let last = '';
        dates.forEach((date, index) => {
            const month = date.slice(0, 7);
            if (month !== last) {
                marks.push({
                    i: index,
                    label: new Date(date + 'T12:00:00Z').toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }).toUpperCase(),
                });
                last = month;
            }
        });
        return marks;
    }

    function visibleIds(history, names, { scope = 'focus', query = '', window: win = 'm' } = {}) {
        const latest = history.sessions[history.sessions.length - 1];
        const ranks = latest && latest.ranks && latest.ranks[win] || {};
        const q = String(query || '').trim().toLowerCase();
        return Object.keys(ranks).filter(id => {
            if (scope === 'focus' && !FOCUSED.has(id)) return false;
            const name = names[id] || id;
            if (q && !name.toLowerCase().includes(q) && !id.includes(q)) return false;
            return true;
        });
    }

    let history = null, names = {}, error = false, wired = false;
    let win = 'm', scope = 'focus', query = '';
    let pill = null, scopePill = null, pillPlaced = false;

    function sessionsForWindow() {
        if (!history) return [];
        return history.sessions.filter(session => session.ranks && session.ranks[win]);
    }

    function render() {
        const root = document.getElementById('rsView');
        if (!root || !wired) return;
        if (!pillPlaced && root.getClientRects().length) {
            pill?.set(win, true);
            scopePill?.set(scope, true);
            pillPlaced = true;
        }
        const board = $('board');
        if (!board) return;
        if (error || !history || !history.sessions.length) {
            board.innerHTML = `<p class="empty">${error ? 'Couldn’t load rank history.' : 'No rank history yet.'}</p>`;
            return;
        }
        const sessions = sessionsForWindow();
        if (!sessions.length) {
            board.innerHTML = `<p class="empty">No ranks for this window yet.</p>`;
            return;
        }
        const dates = sessions.map(session => session.asOf);
        const latest = sessions[sessions.length - 1];
        const ids = visibleIds({ sessions: [latest] }, names, { scope, query, window: win });
        const latestDense = denseRanks(latest.ranks[win], ids);
        const past = sessions[Math.max(0, sessions.length - 1 - CHG_LOOKBACK)];
        const pastDense = denseRanks(past.ranks[win], ids);
        ids.sort((a, b) => (latestDense[a] - latestDense[b]) || a.localeCompare(b));
        const n = ids.length;
        const grid = `repeat(${dates.length}, minmax(0, 1fr))`;
        const months = monthMarks(dates);
        const monthHtml = months.map((mark, index) => {
            const next = months[index + 1] ? months[index + 1].i : dates.length;
            return `<span style="grid-column:${mark.i + 1} / ${next + 1}">${mark.label}</span>`;
        }).join('');
        const start = dates[0] ? new Date(dates[0] + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : '';
        const end = dates[dates.length - 1] ? new Date(dates[dates.length - 1] + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : '';
        $('period').textContent = `${start} – ${end} · ${WINDOWS[win] || win}`;
        $('count').textContent = `${n} theme${n === 1 ? '' : 's'}`;
        const rows = ids.map(id => {
            const rank = latestDense[id];
            const prev = pastDense[id];
            const chg = prev != null && rank != null ? prev - rank : null;
            const chgCls = chg > 0 ? 'up' : chg < 0 ? 'dn' : 'flat';
            const chgTxt = chg == null ? '—' : chg > 0 ? `+${chg}` : String(chg);
            const cells = sessions.map((session, index) => {
                const dense = denseRanks(session.ranks[win], ids);
                const rk = dense[id];
                const nDay = Object.keys(dense).length;
                return `<button type="button" class="rs-cell" data-id="${escapeHtml(id)}" data-i="${index}" style="background:${rankColor(rk, nDay)}" aria-label="${dates[index]} rank ${rk ?? '—'}"></button>`;
            }).join('');
            return `<div class="rs-row" data-id="${escapeHtml(id)}">
                <div class="rs-stub"><span class="rs-rank">${rank}</span><span class="rs-name">${escapeHtml(names[id] || id)}</span></div>
                <div class="rs-cells" style="grid-template-columns:${grid}">${cells}</div>
                <div class="rs-chg ${chgCls}">${chgTxt}</div>
            </div>`;
        }).join('');
        board.innerHTML = `
            <div class="rs-months"><span></span><div class="rs-month-grid" style="grid-template-columns:${grid}">${monthHtml}</div><span>CHG</span></div>
            ${rows || `<p class="empty">No themes match.</p>`}`;
    }

    function paintTip(event) {
        const tip = $('tip');
        const cell = event.target.closest('.rs-cell');
        if (!tip || !cell || cell.dataset.i == null) { if (tip) tip.hidden = true; return; }
        const sessions = sessionsForWindow();
        const i = Number(cell.dataset.i);
        const id = cell.dataset.id;
        const session = sessions[i];
        if (!session) { tip.hidden = true; return; }
        const ids = visibleIds({ sessions: [sessions[sessions.length - 1]] }, names, { scope, query, window: win });
        const dense = denseRanks(session.ranks[win], ids);
        const date = new Date(session.asOf + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
        tip.hidden = false;
        tip.textContent = `${names[id] || id} · ${date} · #${dense[id] ?? '—'}`;
        tip.style.left = `${event.clientX}px`;
        tip.style.top = `${event.clientY}px`;
    }

    function init() {
        if (wired) return;
        const root = document.getElementById('rsView');
        if (!root) return;
        wired = true;
        const segment = root.querySelector('.windows');
        pill = MOTION.segmented(segment, value => { win = value; render(); });
        const scopeSeg = root.querySelector('.scope');
        scopePill = MOTION.segmented(scopeSeg, value => { scope = value; render(); });
        $('search').addEventListener('input', event => { query = event.target.value; render(); });
        const board = $('board');
        board.addEventListener('pointermove', paintTip);
        board.addEventListener('pointerleave', () => { const tip = $('tip'); if (tip) tip.hidden = true; });
        board.addEventListener('click', event => {
            const row = event.target.closest('.rs-row');
            if (!row) return;
            location.hash = `#themes/${row.dataset.id}`;
        });
        const about = $('aboutToggle');
        const aboutBlock = document.getElementById('rs-aboutBlock');
        about?.addEventListener('click', () => {
            const open = aboutBlock.classList.toggle('is-open');
            about.setAttribute('aria-expanded', String(open));
        });
        fetch('data/daily-scan.json', { cache: 'no-store' }).then(res => res.ok ? res.json() : null).then(catalog => {
            if (catalog && Array.isArray(catalog.themes)) {
                for (const theme of catalog.themes) {
                    if (theme.id && theme.name) names[theme.id] = theme.name;
                }
            }
            const asOf = catalog && catalog.asOf;
            if (asOf && $('asof')) {
                const asOfDate = new Date(asOf + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
                $('asof').textContent = `Updated after the close · ${asOfDate}`;
                const chip = $('asof').closest('.date');
                if (chip && typeof ENGINE !== 'undefined' && ENGINE.expectedPublishedSession) {
                    chip.classList.toggle('is-stale', asOf < ENGINE.expectedPublishedSession());
                }
            }
            render();
        }).catch(() => {});
        fetch('data/theme-ranks.json', { cache: 'no-store' }).then(res => {
            if (!res.ok) throw new Error('unavailable');
            return res.json();
        }).then(raw => {
            if (!raw || raw.schemaVersion !== 1 || !Array.isArray(raw.sessions)) throw new Error('invalid');
            history = raw;
            error = false;
            render();
        }).catch(() => { error = true; history = null; render(); });
    }

    return { init, render, denseRanks, rankColor, visibleIds, monthMarks, CHG_LOOKBACK };
})();
