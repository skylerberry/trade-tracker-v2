/* ============================================================
   curate.js — private dashboard that edits data/guide.json and
   commits it to main via the GitHub contents API. Possession of
   a repo-scoped fine-grained PAT is the whole auth model: with
   no token the page is a read-only viewer. Scanner data
   (data/movers.json) is deliberately out of reach here.
   ============================================================ */
'use strict';

(() => {
    const $ = (id) => document.getElementById(id);
    const OWNER = 'skylerberry';
    const REPO = 'trade-tracker-v2';
    const PATH = 'data/guide.json';
    const API = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${PATH}`;
    const TOKEN_KEY = 'tradeTracker_curateToken';

    let token = localStorage.getItem(TOKEN_KEY) || '';
    let doc = { themes: [], companies: {} };   // working copy, raw guide.json shape
    let baseline = '';                          // JSON of the last loaded/published state
    let sha = '';                               // blob sha the working copy is based on
    let busy = false;
    let statusHtml = '';

    function escapeHtml(s) {
        return String(s ?? '').replace(/[&<>"']/g, c => (
            { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
        ));
    }

    const serialize = () => JSON.stringify(doc, null, 2) + '\n';
    const isDirty = () => serialize() !== baseline;

    /* ---------- GitHub ---------- */

    function ghHeaders() {
        return {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
        };
    }

    const b64ToUtf8 = (b64) => new TextDecoder().decode(
        Uint8Array.from(atob(b64.replace(/\n/g, '')), c => c.charCodeAt(0)));
    const utf8ToB64 = (s) => {
        const bytes = new TextEncoder().encode(s);
        let bin = '';
        for (const b of bytes) bin += String.fromCharCode(b);
        return btoa(bin);
    };

    async function load() {
        try {
            if (token) {
                const res = await fetch(API, { headers: ghHeaders(), cache: 'no-store' });
                if (res.status === 401 || res.status === 403) { setStatus('Token rejected by GitHub — check it below.', 'err'); return; }
                if (!res.ok) throw new Error(String(res.status));
                const body = await res.json();
                doc = JSON.parse(b64ToUtf8(body.content));
                sha = body.sha;
            } else {
                const res = await fetch('data/guide.json', { cache: 'no-store' });
                if (!res.ok) throw new Error(String(res.status));
                doc = await res.json();
                sha = '';
            }
            doc.themes = Array.isArray(doc.themes) ? doc.themes : [];
            doc.companies = doc.companies && typeof doc.companies === 'object' ? doc.companies : {};
            baseline = serialize();
            setStatus(token ? `Loaded from main (${sha.slice(0, 7)}).` : 'Read-only — add a token to publish.');
        } catch {
            setStatus('Couldn’t load guide.json.', 'err');
        }
        render();
    }

    async function publish() {
        const problems = validate();
        if (problems.some(p => !p.warn) || !token || busy) return;
        busy = true;
        renderBar();
        const themes = doc.themes.length;
        const names = Object.keys(doc.companies).length;
        try {
            const res = await fetch(API, {
                method: 'PUT',
                headers: ghHeaders(),
                body: JSON.stringify({
                    message: `Guide: ${themes} themes, ${names} names.`,
                    content: utf8ToB64(serialize()),
                    sha,
                }),
            });
            if (res.status === 409 || res.status === 422) {
                setStatus('guide.json changed on GitHub since this page loaded — copy your edits somewhere safe, then reload.', 'err');
            } else if (!res.ok) {
                setStatus(`Publish failed (${res.status}).`, 'err');
            } else {
                const body = await res.json();
                sha = body.content.sha;
                baseline = serialize();
                const url = body.commit?.html_url;
                setStatus(`Published <a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml((body.commit?.sha || '').slice(0, 7))}</a> — live in about a minute.`);
            }
        } catch {
            setStatus('Publish failed — network error.', 'err');
        }
        busy = false;
        render();
    }

    /* ---------- validation (mirrors tests/guide.test.mjs) ---------- */

    function validate() {
        const problems = [];
        const ids = new Set();
        const used = new Set();
        for (const t of doc.themes) {
            if (!String(t.name || '').trim()) problems.push({ msg: 'A theme is missing its name.' });
            if (ids.has(t.id)) problems.push({ msg: `Duplicate theme id "${t.id}".` });
            ids.add(t.id);
            for (const tk of t.tickers || []) {
                used.add(tk);
                const c = doc.companies[tk];
                if (!c || !String(c.name || '').trim() || !String(c.does || '').trim()) {
                    problems.push({ msg: `${tk} (in ${t.name || t.id}) needs a company record with a name and a Does line.` });
                }
            }
        }
        for (const [tk, c] of Object.entries(doc.companies)) {
            if (!String(c.name || '').trim() || !String(c.does || '').trim()) {
                if (![...used].includes(tk)) problems.push({ msg: `${tk} is missing a name or Does line.` });
            } else if (!used.has(tk)) {
                problems.push({ warn: true, msg: `${tk} isn’t listed under any theme (kept, just unused).` });
            }
        }
        return problems;
    }

    /* ---------- edits ---------- */

    function slug(name) {
        let base = String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'theme';
        let id = base, n = 2;
        while (doc.themes.some(t => t.id === id)) id = `${base}-${n++}`;
        return id;
    }

    function addTheme(name) {
        const clean = String(name || '').trim();
        if (!clean) return;
        doc.themes.push({ id: slug(clean), name: clean, blurb: '', tickers: [] });
        render();
    }

    function addTicker(theme, raw) {
        const tk = String(raw || '').trim().toUpperCase();
        if (!tk || !/^[A-Z0-9.-]{1,10}$/.test(tk) || theme.tickers.includes(tk)) return;
        theme.tickers.push(tk);
        if (!doc.companies[tk]) doc.companies[tk] = { name: '', does: '' };
        render();
    }

    /* ---------- render ---------- */

    function setStatus(html, kind) {
        statusHtml = html;
        const el = $('statusLine');
        el.innerHTML = html;
        el.className = `curate-status${kind === 'err' ? ' is-err' : ''}`;
    }

    function renderBar() {
        const problems = validate();
        const blockers = problems.filter(p => !p.warn);
        const dirty = isDirty();
        $('publishBtn').disabled = !token || !dirty || !!blockers.length || busy;
        $('publishBtn').textContent = busy ? 'Publishing…' : 'Publish';
        $('discardBtn').disabled = !dirty || busy;
        $('tokenCard').hidden = !!token;
        $('tokenForget').hidden = !token;
        const el = $('statusLine');
        if (dirty && !el.className.includes('is-err')) {
            el.className = 'curate-status is-dirty';
            el.textContent = blockers.length
                ? 'Unpublished edits — fix the problems below first.'
                : 'Unpublished edits.';
        } else if (!dirty) {
            el.className = 'curate-status';
            el.innerHTML = statusHtml;
        }
        $('problems').innerHTML = problems.map(p =>
            `<li${p.warn ? ' class="is-warn"' : ''}>${escapeHtml(p.msg)}</li>`).join('');
    }

    function renderThemes() {
        $('themesHost').innerHTML = doc.themes.map((t, i) => {
            const chips = (t.tickers || []).map(tk => {
                const c = doc.companies[tk];
                const okRec = c && String(c.name || '').trim() && String(c.does || '').trim();
                return `<span class="tick-chip${okRec ? '' : ' is-broken'}">${escapeHtml(tk)}<button type="button" data-act="delTick" data-i="${i}" data-tk="${escapeHtml(tk)}" aria-label="Remove ${escapeHtml(tk)}">×</button></span>`;
            }).join('');
            return `
            <div class="theme-card" data-i="${i}">
                <div class="theme-card-head">
                    <div class="theme-fields">
                        <input value="${escapeHtml(t.name)}" data-bind="name" data-i="${i}" aria-label="Theme name">
                        <input value="${escapeHtml(t.blurb || '')}" data-bind="blurb" data-i="${i}" placeholder="Blurb (optional)" aria-label="Theme blurb">
                    </div>
                    <div class="theme-tools">
                        <button class="btn btn-ghost btn-sm" data-act="up" data-i="${i}" ${i ? '' : 'disabled'} aria-label="Move up">↑</button>
                        <button class="btn btn-ghost btn-sm" data-act="down" data-i="${i}" ${i < doc.themes.length - 1 ? '' : 'disabled'} aria-label="Move down">↓</button>
                        <button class="btn btn-ghost btn-sm" data-act="delTheme" data-i="${i}" aria-label="Delete theme">Delete</button>
                    </div>
                </div>
                <div class="tick-chips">${chips || '<span class="co-orphan">No names yet.</span>'}</div>
                <div class="tick-add">
                    <input placeholder="NVDA" data-tickadd="${i}" aria-label="Add ticker to ${escapeHtml(t.name)}">
                    <button class="btn btn-ghost btn-sm" data-act="addTick" data-i="${i}">Add name</button>
                </div>
            </div>`;
        }).join('') || '<p class="curate-note">No themes yet — add one below.</p>';
    }

    function renderCompanies() {
        const q = String($('coSearch').value || '').trim().toLowerCase();
        const used = new Set(doc.themes.flatMap(t => t.tickers || []));
        const rows = Object.keys(doc.companies)
            .sort()
            .filter(tk => !q || tk.toLowerCase().includes(q) || String(doc.companies[tk].name || '').toLowerCase().includes(q))
            .map(tk => {
                const c = doc.companies[tk];
                return `
                <div class="co-row">
                    <span class="co-tk">${escapeHtml(tk)}${used.has(tk) ? '' : '<br><span class="co-orphan">unused</span>'}</span>
                    <input value="${escapeHtml(c.name || '')}" placeholder="Company name" data-co="${escapeHtml(tk)}" data-bind="name" aria-label="${escapeHtml(tk)} name">
                    <textarea placeholder="What it does, one everyday sentence." data-co="${escapeHtml(tk)}" data-bind="does" aria-label="${escapeHtml(tk)} Does line">${escapeHtml(c.does || '')}</textarea>
                    <button class="btn btn-ghost btn-sm" data-act="delCo" data-tk="${escapeHtml(tk)}" aria-label="Delete ${escapeHtml(tk)}">Delete</button>
                </div>`;
            }).join('');
        $('companiesHost').innerHTML = rows || `<p class="curate-note">${q ? 'No matches.' : 'No companies yet.'}</p>`;
    }

    function render() { renderThemes(); renderCompanies(); renderBar(); }

    /* ---------- wiring ---------- */

    function wire() {
        $('tokenSave').addEventListener('click', () => {
            const v = $('tokenInput').value.trim();
            if (!v) return;
            token = v;
            localStorage.setItem(TOKEN_KEY, v);
            $('tokenInput').value = '';
            load();
        });
        $('tokenForget').addEventListener('click', () => {
            token = '';
            localStorage.removeItem(TOKEN_KEY);
            load();
        });
        $('publishBtn').addEventListener('click', publish);
        $('discardBtn').addEventListener('click', () => {
            doc = JSON.parse(baseline);
            render();
        });
        $('addThemeBtn').addEventListener('click', () => {
            addTheme($('newThemeName').value);
            $('newThemeName').value = '';
        });
        $('newThemeName').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { addTheme(e.target.value); e.target.value = ''; }
        });
        $('coSearch').addEventListener('input', renderCompanies);

        document.body.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-act]');
            if (!btn) return;
            const i = Number(btn.dataset.i);
            const act = btn.dataset.act;
            if (act === 'delTick') {
                const t = doc.themes[i];
                t.tickers = t.tickers.filter(tk => tk !== btn.dataset.tk);
                render();
            } else if (act === 'addTick') {
                const input = document.querySelector(`[data-tickadd="${i}"]`);
                addTicker(doc.themes[i], input.value);
            } else if (act === 'delTheme') {
                if (confirm(`Delete theme "${doc.themes[i].name}"? Its companies stay in the list below.`)) {
                    doc.themes.splice(i, 1);
                    render();
                }
            } else if (act === 'up' || act === 'down') {
                const j = act === 'up' ? i - 1 : i + 1;
                [doc.themes[i], doc.themes[j]] = [doc.themes[j], doc.themes[i]];
                render();
            } else if (act === 'delCo') {
                const tk = btn.dataset.tk;
                if (confirm(`Delete ${tk}? It will also be removed from any theme that lists it.`)) {
                    delete doc.companies[tk];
                    for (const t of doc.themes) t.tickers = (t.tickers || []).filter(x => x !== tk);
                    render();
                }
            }
        });

        document.body.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter') return;
            const add = e.target.closest('[data-tickadd]');
            if (add) { e.preventDefault(); addTicker(doc.themes[Number(add.dataset.tickadd)], add.value); }
        });

        /* Text edits update state in place — no re-render, so focus survives typing. */
        document.body.addEventListener('input', (e) => {
            const el = e.target;
            if (el.dataset.co) {
                doc.companies[el.dataset.co][el.dataset.bind] = el.value;
            } else if (el.dataset.bind && el.dataset.i !== undefined && el.closest('.theme-card')) {
                doc.themes[Number(el.dataset.i)][el.dataset.bind] = el.value;
            } else return;
            renderBar();
        });

        window.addEventListener('beforeunload', (e) => {
            if (isDirty()) e.preventDefault();
        });
    }

    wire();
    load();
})();
