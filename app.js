/* ============================================================
   app.js — Trade Tracker 2.0
   State, calculator, tracker table, modals, toasts, cloud sync.
   Motion comes only from the MOTION vocabulary; math only from
   ENGINE. localStorage keys are v1-compatible so existing data
   flows straight in.
   ============================================================ */
'use strict';

(() => {
    const E = ENGINE, M = MOTION;
    const $ = (id) => document.getElementById(id);

    /* ---------- storage keys (v1-compatible) ---------- */
    const K = {
        trades: 'tradeTracker_trades',
        theme: 'tradeTracker_theme',
        account: 'tradeTracker_accountSize',
        risk: 'tradeTracker_defaultRisk',
        max: 'tradeTracker_defaultMax',
        plan: 'tradeTracker_freerollPreset',
        watch: 'tradeTracker_watchlist',
        prefs: 'tradeTracker_v2Prefs',
        accent: 'tradeTracker_accent',
        gistToken: 'tradeTracker_gistToken',
        gistId: 'tradeTracker_gistId',
        gistUpdatedAt: 'tradeTracker_gistUpdatedAt',
        lastSync: 'tradeTracker_lastSync',
    };

    /* ---------- state ---------- */
    let trades = [];
    let prefs = {
        scope: 'month', calcOpen: true, watchOpen: false, metricsOpen: true, scenariosOpen: true,
        riskPreset: '0.5', riskCustom: 0.5, maxPreset: '20', maxCustom: 20,
        plan: 'half-1r', showSeconds: false,
        direction: 'long', vehicle: 'shares',
    };
    const RISK_PRESETS = ['0.1', '0.125', '0.25', '0.5', '1'];
    let account = 25000;
    let watchlist = [];
    let filters = { status: 'active', from: '', to: '', page: 1, q: '', sortKey: '', sortDir: 'desc' };
    let datePick = null;
    let dateView = null;
    const VIEWS = ['positions', 'journal', 'compound', 'themes'];
    let view = 'positions';
    let viewReady = false;
    const viewFilters = { positions: 'active', journal: 'all' };
    const PAGE_SIZE = 20;
    let expandedId = null;
    let logConfirmTimer = null, lastLoggedId = null;
    let editFormFocusTimer = null;

    const uid = () => 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    /* Accepts "25k" → 25,000 and "1.2m" → 1,200,000 (v1 shorthand). */
    const parseNum = (v) => {
        const s = String(v ?? '').replace(/[,$\s]/g, '');
        const suffix = /([kmKM])$/.exec(s);
        const n = parseFloat(s);
        if (!isFinite(n)) return null;
        if (suffix) return n * (suffix[1].toLowerCase() === 'k' ? 1e3 : 1e6);
        return n;
    };
    const deepClone = (o) => JSON.parse(JSON.stringify(o));
    const fmtShareCount = (n) => `${E.fmtShares(n)} ${Number(n) === 1 ? 'share' : 'shares'}`;
    const JOURNAL_KINDS = {
        thesis: { label: 'Thesis', icon: 'target', prompt: 'What is the setup, catalyst, and invalidation?' },
        update: { label: 'Update', icon: 'activity', prompt: 'What changed in the trade, and why?' },
        review: { label: 'Review', icon: 'clipboard-check', prompt: 'How did the execution match the plan?' },
        lesson: { label: 'Lesson', icon: 'lightbulb', prompt: 'What should you repeat or change next time?' },
        note: { label: 'Imported note', icon: 'notebook-pen', prompt: '' },
    };
    const journalKindTagMarkup = (kind) => {
        const meta = JOURNAL_KINDS[kind] || JOURNAL_KINDS.update;
        if (kind === 'note') return E.escapeHtml(meta.label);
        return `<span class="journal-hash" aria-hidden="true">#</span>${E.escapeHtml(meta.label)}`;
    };

    function normalizeTrade(t) {
        if (!Array.isArray(t.exits)) t.exits = [];
        if (t.archived === undefined) t.archived = false;
        if (!t.id) t.id = uid();
        t.journal = E.normalizeJournal(t);
        t.notes = '';
        t.direction = E.directionOf(t);
        return t;
    }

    /* ---------- persistence ---------- */
    function loadAll() {
        try { trades = JSON.parse(localStorage.getItem(K.trades)) || []; } catch { trades = []; }
        trades.forEach(normalizeTrade);
        account = parseNum(localStorage.getItem(K.account)) ?? 25000;
        const r = localStorage.getItem(K.risk); if (r) { prefs.riskPreset = r; if (!RISK_PRESETS.includes(r)) { prefs.riskPreset = 'custom'; prefs.riskCustom = parseNum(r) ?? 0.5; } }
        const mx = localStorage.getItem(K.max); if (mx) { prefs.maxPreset = mx; if (!['5', '10', '20', '50', '100'].includes(mx)) { prefs.maxPreset = 'custom'; prefs.maxCustom = parseNum(mx) ?? 20; } }
        const pl = localStorage.getItem(K.plan); if (pl) prefs.plan = pl;
        try { watchlist = JSON.parse(localStorage.getItem(K.watch)) || []; } catch { watchlist = []; }
        if (watchlist.length && typeof watchlist[0] === 'object') watchlist = watchlist.map(w => w.ticker || w.symbol).filter(Boolean);
        try { Object.assign(prefs, JSON.parse(localStorage.getItem(K.prefs)) || {}); } catch { /* keep defaults */ }
        prefs.direction = prefs.direction === 'short' ? 'short' : 'long';
        prefs.vehicle = prefs.vehicle === 'option' ? 'option' : 'shares';
    }
    function saveTrades() {
        localStorage.setItem(K.trades, JSON.stringify(trades));
        schedulePush('trades');
    }
    function savePrefs() {
        schedulePush('settings');
        localStorage.setItem(K.prefs, JSON.stringify(prefs));
        localStorage.setItem(K.account, String(account));
        localStorage.setItem(K.risk, prefs.riskPreset === 'custom' ? String(prefs.riskCustom) : prefs.riskPreset);
        localStorage.setItem(K.max, prefs.maxPreset === 'custom' ? String(prefs.maxCustom) : prefs.maxPreset);
        localStorage.setItem(K.plan, prefs.plan);
        localStorage.setItem(K.watch, JSON.stringify(watchlist));
    }

    /* ---------- rollers (lazy per element) ---------- */
    const rollers = new WeakMap();
    function rollTo(el, text) {
        if (!rollers.has(el)) rollers.set(el, M.roller(el));
        rollers.get(el)(text);
    }

    /* ---------- daily dashboard clock ---------- */
    const clockDateRoller = M.roller($('dailyDate'), { alwaysUp: true });
    const clockTimeRoller = M.roller($('dailyTime'), { alwaysUp: true });
    const clockSecondsRoller = M.roller($('dailySeconds'), { alwaysUp: true });
    let clockStartTimer = null, clockTickTimer = null;

    function timeZoneOffsetMinutes(date, timeZone) {
        const wholeSecond = new Date(Math.floor(date.getTime() / 1000) * 1000);
        const values = {};
        new Intl.DateTimeFormat('en-US', {
            timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
        }).formatToParts(wholeSecond).forEach(part => {
            if (part.type !== 'literal') values[part.type] = Number(part.value);
        });
        return (Date.UTC(values.year, values.month - 1, values.day, values.hour, values.minute, values.second) - wholeSecond.getTime()) / 60000;
    }

    function marketOffsetLabel(hours) {
        if (Math.abs(hours) < 0.001) return '±0';
        const magnitude = Math.abs(hours).toFixed(2).replace(/\.00$/, '').replace(/0$/, '');
        return `${hours > 0 ? '+' : '−'}${magnitude}`;
    }

    function updateDailyClock() {
        const now = new Date();
        const dateText = new Intl.DateTimeFormat(undefined, {
            weekday: 'short', month: 'short', day: 'numeric',
        }).format(now);
        const timeParts = new Intl.DateTimeFormat(undefined, {
            hour: 'numeric', minute: '2-digit',
        }).formatToParts(now);
        const hour = timeParts.find(p => p.type === 'hour')?.value || '';
        const minute = timeParts.find(p => p.type === 'minute')?.value || '';
        const period = timeParts.find(p => p.type === 'dayPeriod')?.value || '';
        const zone = new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' })
            .formatToParts(now).find(p => p.type === 'timeZoneName')?.value || 'local';
        const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
        const marketDeltaHours = (timeZoneOffsetMinutes(now, localZone) - timeZoneOffsetMinutes(now, 'America/New_York')) / 60;
        const offsetLabel = marketOffsetLabel(marketDeltaHours);
        const offsetPhrase = Math.abs(marketDeltaHours) < 0.001 ? 'same time as ET'
            : `${Math.abs(marketDeltaHours)} hour${Math.abs(marketDeltaHours) === 1 ? '' : 's'} ${marketDeltaHours > 0 ? 'ahead of' : 'behind'} ET`;

        clockDateRoller(dateText.replace(/ /g, '\u00a0'));
        clockTimeRoller(`${hour}:${minute}`);
        if (prefs.showSeconds) clockSecondsRoller(`:${String(now.getSeconds()).padStart(2, '0')}`);
        $('dailyPeriod').textContent = period;
        $('dailyZone').textContent = zone;
        $('marketOffset').textContent = offsetLabel;
        $('localTime').dateTime = now.toISOString();
        const session = E.marketSession(now);
        const sessEl = $('marketSess');
        if (sessEl) {
            sessEl.dataset.state = session.state;
            $('marketSessLabel').textContent = session.label;
            /* instant tip with a live countdown; empty title blocks the
               clock's native tooltip from doubling up on the badge */
            sessEl.title = '';
            const left = session.minutesLeft;
            const span = left === null ? '' : left >= 60 ? `${Math.floor(left / 60)}h ${left % 60}m` : `${left}m`;
            const countdown = left === null ? ''
                : session.state === 'open' ? ` · Closing bell in ${span}`
                    : session.state === 'pre' ? ` · Opening bell in ${span}`
                        : ` · After hours ends in ${span}`;
            sessEl.dataset.tip = session.detail + countdown;
            const tip = $('instantTip');
            if (tip && !tip.hidden && tip.__anchor === sessEl) tip.textContent = sessEl.dataset.tip;
        }
        $('dailyZoneTag').title = `${zone} · ${offsetPhrase}`;
        $('dailyClock').title = `${session.detail} · Local time · ${zone} · ${offsetPhrase}`;
        $('dailyClock').setAttribute('aria-label', `${session.label}. ${dateText}, ${hour}:${minute}${prefs.showSeconds ? ':' + String(now.getSeconds()).padStart(2, '0') : ''} ${period} ${zone}, ${offsetPhrase}`.trim());
    }

    function setClockSeconds(show, persist = true) {
        prefs.showSeconds = !!show;
        $('dailySeconds').hidden = !prefs.showSeconds;
        $('secondsToggle').setAttribute('aria-pressed', String(prefs.showSeconds));
        $('secondsToggle').title = prefs.showSeconds ? 'Hide seconds' : 'Show seconds';
        if (!prefs.showSeconds) {
            $('dailySeconds').textContent = '';
            delete $('dailySeconds').__cells;
        }
        updateDailyClock();
        if (persist) savePrefs();
    }

    function startDailyClock() {
        setClockSeconds(prefs.showSeconds, false);
        $('secondsToggle').addEventListener('click', () => setClockSeconds(!prefs.showSeconds));
        clearTimeout(clockStartTimer);
        clearInterval(clockTickTimer);
        clockStartTimer = setTimeout(() => {
            updateDailyClock();
            clockTickTimer = setInterval(updateDailyClock, 1000);
        }, 1000 - (Date.now() % 1000));
    }

    /* ---------- theme ---------- */
    const THEMES = new Set(['light', 'dark', 'oled']);
    const themeMode = () => document.documentElement.getAttribute('data-theme');
    const isDarkMode = () => {
        const t = themeMode();
        return t === 'dark' || t === 'oled';
    };
    const isOledMode = () => themeMode() === 'oled';

    function setTheme(mode) {
        if (!THEMES.has(mode) || themeMode() === mode) return;
        M.themeSwap(() => {
            document.documentElement.setAttribute('data-theme', mode);
            localStorage.setItem(K.theme, mode);
            applyAccent(accentName);
        }).then(() => {
            requestAnimationFrame(refreshSegs);
        });
    }

    /* ---------- accent theme engine (stock-sherlock pattern) ----------
       Named accents with a light/dark/oled seed each; every derived var
       (--primary/-hover/--accent/-soft/--focus-ring) is computed and set
       inline on <html>, overriding the stylesheet defaults. OLED seeds
       sit one step brighter so they read as neon on true black. */
    /* Tailwind 600s (light fills) / 500s (dark fills) / 400s (OLED fills).
       8 + rainbow = a clean 3×3 grid. Seeds live in icons.js so the
       tab favicon can resolve the same colors before app.js loads. */
    const ACCENTS = ACCENT_SEEDS;
    let accentName = 'navy';
    let rainbowRAF = null;
    function accentSeed(name) {
        return accentSeedFor(name, themeMode());
    }
    const hexRgb = (hex) => { const h = hex.replace('#', ''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); };
    const rgbHex = (rgb) => '#' + rgb.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
    const mix = (hex, other, t) => { const a = hexRgb(hex), b = hexRgb(other); return rgbHex(a.map((v, i) => v + (b[i] - v) * t)); };
    function hslToHex(h, s, l) {
        const a = s * Math.min(l, 1 - l);
        const f = (n) => { const k = (n + h / 30) % 12; return Math.round(255 * (l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1))); };
        return rgbHex([f(0), f(8), f(4)]);
    }
    /* WCAG relative luminance → ink text on bright fills, white on deep ones */
    function relLum([r, g, b]) {
        const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    }
    function setAccentVars(main) {
        const dark = isDarkMode();
        const oled = isOledMode();
        const s = document.documentElement.style;
        const [r, g, b] = hexRgb(main);
        s.setProperty('--primary-contrast', 1.05 / (relLum([r, g, b]) + 0.05) < 3.5 ? '#16181d' : '#ffffff');
        s.setProperty('--primary', main);
        s.setProperty('--primary-hover', mix(main, '#000000', 0.15));
        s.setProperty('--primary-border', mix(main, '#000000', 0.28));
        s.setProperty('--accent', dark ? mix(main, '#ffffff', oled ? 0.55 : 0.45) : main);
        s.setProperty('--accent-soft', `rgba(${r},${g},${b},${oled ? 0.18 : dark ? 0.14 : 0.08})`);
        s.setProperty('--focus-ring', `rgba(${r},${g},${b},${oled ? 0.42 : dark ? 0.35 : 0.18})`);
        // hero CTA (cap radialblue, derived from the accent)
        s.setProperty('--cta-grad', `radial-gradient(90% 100% at 15% 12%, ${mix(main, '#ffffff', 0.42)} 0%, ${main} 100%)`);
        s.setProperty('--cta-ring', `0 0 0 1px ${mix(main, dark ? '#ffffff' : '#000000', 0.2)}`);
        paintFavicon(main);
    }
    function rainbowFrame(ts) {
        const dark = isDarkMode();
        const oled = isOledMode();
        setAccentVars(hslToHex((ts / 1000 * 45) % 360, oled ? 0.78 : dark ? 0.7 : 0.65, oled ? 0.72 : dark ? 0.7 : 0.42));
        rainbowRAF = requestAnimationFrame(rainbowFrame);
    }
    function applyAccent(name) {
        accentName = name;
        localStorage.setItem(K.accent, name);
        if (rainbowRAF) { cancelAnimationFrame(rainbowRAF); rainbowRAF = null; }
        if (name === 'rainbow') {
            if (M.reduceMotion) setAccentVars('#7c3aed'); // static stand-in
            else rainbowRAF = requestAnimationFrame(rainbowFrame);
        } else {
            setAccentVars(accentSeed(name));
        }
        renderAccentDots();
    }
    function renderAccentDots() {
        const menu = $('accentMenu');
        if (!menu.childElementCount) {
            [...Object.keys(ACCENTS), 'rainbow'].forEach(n => {
                const d = document.createElement('button');
                d.className = 'accent-dot' + (n === 'rainbow' ? ' rainbow' : '');
                d.dataset.accent = n;
                d.setAttribute('role', 'menuitem');
                d.title = n[0].toUpperCase() + n.slice(1);
                d.setAttribute('aria-label', n + ' accent');
                d.addEventListener('click', () => { applyAccent(n); schedulePush('settings'); closeMenu(menu); });
                menu.appendChild(d);
            });
        }
        menu.querySelectorAll('.accent-dot').forEach(d => {
            const n = d.dataset.accent;
            if (n !== 'rainbow') d.style.background = accentSeed(n);
            d.classList.toggle('active', n === accentName);
        });
    }
    /* Menus spring in, then leave on a faster non-bouncy tween. Animation
       interruption reads the in-flight visual state so rapid toggles do not
       jump or flash. */
    const menuAnimations = new WeakMap();
    function menuTrigger(el) {
        if (el === $('accentMenu')) return $('accentBtn');
        if (el === $('exportMenu')) return $('exportBtn');
        if (el === $('datePop')) return datePick?.trigger || null;
        return null;
    }
    function menuFrame(el) {
        const s = getComputedStyle(el);
        return { opacity: s.opacity, transform: s.transform, filter: s.filter };
    }
    function openMenu(el) {
        const running = menuAnimations.get(el);
        const from = running ? menuFrame(el) : { opacity: 0, transform: 'scale(0.94) translateY(-5px)', filter: 'blur(3px)' };
        if (running) running.cancel();
        el.hidden = false;
        el.dataset.menuState = 'opening';
        el.style.pointerEvents = '';
        menuTrigger(el)?.setAttribute('aria-expanded', 'true');
        if (!M.reduceMotion) {
            if (!el.style.transformOrigin) el.style.transformOrigin = 'top right';
            const anim = el.animate(
                [from, { opacity: 1, transform: 'none', filter: 'blur(0)' }],
                { duration: 180, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
            menuAnimations.set(el, anim);
            anim.finished.then(() => {
                if (menuAnimations.get(el) !== anim) return;
                menuAnimations.delete(el);
                el.dataset.menuState = 'open';
            }).catch(() => {});
        } else {
            el.dataset.menuState = 'open';
        }
    }
    function closeMenu(el) {
        if (el.hidden || el.dataset.menuState === 'closing') return;
        const running = menuAnimations.get(el);
        const from = menuFrame(el);
        if (running) running.cancel();
        menuTrigger(el)?.setAttribute('aria-expanded', 'false');
        if (M.reduceMotion) {
            el.hidden = true;
            el.dataset.menuState = 'closed';
            return;
        }
        el.dataset.menuState = 'closing';
        el.style.pointerEvents = 'none';
        const anim = el.animate(
            [from, { opacity: 0, transform: 'scale(0.96) translateY(-4px)', filter: 'blur(2px)' }],
            { duration: 130, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' });
        menuAnimations.set(el, anim);
        anim.finished.then(() => {
            if (menuAnimations.get(el) !== anim) return;
            el.hidden = true;
            el.style.pointerEvents = '';
            el.dataset.menuState = 'closed';
            anim.cancel();
            menuAnimations.delete(el);
        }).catch(() => {});
    }
    function toggleMenu(el) {
        if (el.hidden || el.dataset.menuState === 'closing') openMenu(el);
        else closeMenu(el);
    }
    $('accentBtn').addEventListener('click', (e) => {
        e.stopPropagation();
        closeMenu($('exportMenu'));
        closeDatePop();
        toggleMenu($('accentMenu'));
    });
    /* First visit is light mode by design (the splash is built for it) —
       so no OS-theme follow; the header toggle is one tap away. */
    document.addEventListener('visibilitychange', () => {
        if (accentName !== 'rainbow' || M.reduceMotion) return;
        if (document.hidden) { cancelAnimationFrame(rainbowRAF); rainbowRAF = null; }
        else if (!rainbowRAF) rainbowRAF = requestAnimationFrame(rainbowFrame);
    });

    /* ---------- toasts (single surface, polite; undo-first) ---------- */
    function toast(msg, { undo, undone = 'Undone', error, ms = 6000 } = {}) {
        const root = $('toastRoot');
        while (root.children.length >= 3) root.firstElementChild.remove();
        const el = document.createElement('div');
        el.className = 'toast' + (error ? ' error' : '');
        const ic = document.createElement('span');
        ic.className = 'toast-ic ic-draw';
        ic.innerHTML = ICONS[error ? 'circle-x' : 'circle-check'];
        el.appendChild(ic);
        const span = document.createElement('span');
        span.className = 'toast-msg';
        span.innerHTML = msg; // callers pass escaped content
        el.appendChild(span);
        let closed = false;
        let clock = null;
        let hold = null;
        const close = () => {
            if (closed) return; closed = true;
            clock?.cancel();
            if (hold) clearTimeout(hold);
            el.classList.add('out');
            setTimeout(() => el.remove(), 180);
        };
        const startClock = (duration) => {
            clock?.cancel();
            if (hold) { clearTimeout(hold); hold = null; }
            if (!M.reduceMotion) {
                clock = timer.animate(
                    [{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }],
                    { duration, easing: 'linear', fill: 'forwards' });
                clock.finished.then(close).catch(() => {});
            } else {
                hold = setTimeout(close, duration);
            }
        };
        let undoBtn = null;
        if (undo) {
            undoBtn = document.createElement('button');
            undoBtn.className = 'toast-undo';
            undoBtn.textContent = 'Undo';
            undoBtn.addEventListener('click', () => {
                if (closed || !undoBtn) return;
                undoBtn.remove();
                undoBtn = null;
                undo();
                span.innerHTML = undone;
                el.classList.remove('error');
                startClock(2800);
            });
            el.appendChild(undoBtn);
        }
        const track = document.createElement('span');
        track.className = 'toast-timer-track';
        const timer = document.createElement('span');
        timer.className = 'toast-timer';
        track.appendChild(timer);
        el.appendChild(track);
        root.appendChild(el);
        M.toastEnter(el);
        startClock(ms);
        el.addEventListener('mouseenter', () => clock?.pause());
        el.addEventListener('mouseleave', () => clock?.play());
        return close;
    }

    /* ---------- modal manager (stack, esc topmost, focus return) ---------- */
    const modalStack = [];
    function openModal(tplId, setup) {
        const root = $('modalRoot');
        const opener = document.activeElement;
        const backdrop = document.createElement('div');
        backdrop.className = 'modal-backdrop';
        const holder = document.createElement('div');
        holder.className = 'modal-holder';
        const card = $(tplId).content.firstElementChild.cloneNode(true);
        hydrateIcons(card); // template content is outside the document — the init pass never saw it
        card.setAttribute('role', 'dialog');
        card.setAttribute('aria-modal', 'true');
        const titleEl = card.querySelector('.modal-title, .wc-title');
        if (titleEl) { titleEl.id = 'mt-' + Date.now(); card.setAttribute('aria-labelledby', titleEl.id); }
        holder.appendChild(card);
        root.appendChild(backdrop);
        root.appendChild(holder);
        document.body.style.overflow = 'hidden';
        const isSplash = card.classList.contains('welcome-card');
        if (isSplash) document.body.classList.add('is-splash');
        requestAnimationFrame(() => backdrop.classList.add('in'));
        if (isSplash) M.splashEnter(card); else M.modalEnter(card);

        const entry = { backdrop, holder, card, opener, closing: false };
        modalStack.push(entry);
        function close(result) {
            if (entry.closing) return; entry.closing = true;
            closeDatePop();
            modalStack.splice(modalStack.indexOf(entry), 1);
            backdrop.classList.remove('in');
            if (isSplash && !modalStack.some((m) => m.card.classList.contains('welcome-card'))) {
                document.body.classList.remove('is-splash');
            }
            M.modalExit(card).then(() => { backdrop.remove(); holder.remove(); });
            if (!modalStack.length) document.body.style.overflow = '';
            if (opener && opener.focus) opener.focus();
            if (entry.onClose) entry.onClose(result);
        }
        entry.close = close;
        backdrop.addEventListener('click', () => close());
        card.querySelectorAll('.modal-close, .modal-cancel').forEach(b => b.addEventListener('click', () => close()));
        card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.target.tagName === 'INPUT') {
                const primary = card.querySelector('.btn-primary, .btn-danger');
                if (primary) { e.preventDefault(); primary.click(); }
            }
        });
        setup && setup(card, close, entry);
        /* Splash has no field to land on — focus the dialog, not the CTA,
           so the primary button doesn't open with a stuck focus ring. */
        if (isSplash) card.tabIndex = -1;
        const focusTarget = isSplash
            ? card
            : (card.querySelector('[data-autofocus]') || card.querySelector('input, textarea, button.btn-primary'));
        if (focusTarget) setTimeout(() => { focusTarget.focus(); focusTarget.select && focusTarget.select(); }, 60);
        return entry;
    }
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        const dateOpen = isDatePopOpen();
        if (dateOpen) {
            e.preventDefault();
            closeDatePop();
            return;
        }
        if (modalStack.length) {
            e.preventDefault();
            modalStack[modalStack.length - 1].close();
            return;
        }
        const menus = [$('exportMenu'), $('accentMenu')];
        const menuOpen = menus.some(el => el && !el.hidden && el.dataset.menuState !== 'closing');
        menus.forEach(closeMenu);
        if (menuOpen) return;
        if (closeEditForm()) e.preventDefault();
    });
    function confirmModal(title, body, yesLabel, onYes, { danger = true } = {}) {
        openModal('tpl-confirm', (card, close) => {
            card.querySelector('.cf-title').textContent = title;
            card.querySelector('.cf-body').textContent = body;
            const yes = card.querySelector('.cf-yes');
            yes.textContent = yesLabel;
            if (!danger) { yes.classList.remove('btn-danger'); yes.classList.add('btn-primary'); }
            yes.addEventListener('click', () => { close(); onYes(); });
        });
    }

    /* ---------- collapsible panels ---------- */
    const panels = {};
    function wirePanel(sectionId, wrapId, toggleId, openKey) {
        const section = $(sectionId);
        const set = M.collapsible(section, $(wrapId), prefs[openKey]);
        $(toggleId).addEventListener('click', () => {
            prefs[openKey] = !section.classList.contains('is-open');
            set(prefs[openKey]);
            $(toggleId).setAttribute('aria-expanded', String(prefs[openKey]));
            savePrefs();
            if (prefs[openKey]) requestAnimationFrame(refreshSegs);
        });
        panels[sectionId] = { set, section };
    }

    function syncMetricsToggle() {
        const open = prefs.metricsOpen !== false;
        const btn = $('metricsToggle');
        if (!btn) return;
        btn.setAttribute('aria-expanded', String(open));
        btn.setAttribute('aria-label', open ? 'Hide summary' : 'Show summary');
    }

    function wireMetrics() {
        const open = prefs.metricsOpen !== false;
        prefs.metricsOpen = open;
        const set = M.collapsible($('metricsBlock'), $('metricsRowWrap'), open);
        $('metricsToggle').addEventListener('click', () => {
            prefs.metricsOpen = !prefs.metricsOpen;
            set(prefs.metricsOpen);
            syncMetricsToggle();
            savePrefs();
            if (prefs.metricsOpen) requestAnimationFrame(() => segs.scope?.refresh());
        });
        syncMetricsToggle();
        panels.metricsBlock = { set, section: $('metricsBlock') };
    }

    function syncScenariosToggle() {
        const open = prefs.scenariosOpen !== false;
        const btn = $('riskScenariosToggle');
        if (!btn) return;
        btn.setAttribute('aria-expanded', String(open));
        btn.setAttribute('aria-label', open ? 'Hide risk scenarios' : 'Show risk scenarios');
    }

    function wireRiskScenarios() {
        const open = prefs.scenariosOpen !== false;
        prefs.scenariosOpen = open;
        const set = M.collapsible($('riskScenarios'), $('riskScenariosBody'), open);
        $('riskScenariosToggle').addEventListener('click', () => {
            prefs.scenariosOpen = !prefs.scenariosOpen;
            set(prefs.scenariosOpen);
            syncScenariosToggle();
            savePrefs();
        });
        syncScenariosToggle();
        panels.riskScenarios = { set, section: $('riskScenarios') };
    }

    function wireInstantTips() {
        const tip = $('instantTip');
        if (!tip || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
        let current = null;

        let hideTimer = null;
        const hide = () => {
            if (tip.hidden) return;
            current = null;
            tip.__anchor = null;
            /* fade out, then release — mirrors the entrance */
            tip.classList.add('is-out');
            clearTimeout(hideTimer);
            hideTimer = setTimeout(() => {
                tip.hidden = true;
                tip.classList.remove('is-out');
                delete tip.dataset.place;
            }, 130);
        };

        const place = (el) => {
            const text = el.getAttribute('data-tip');
            if (!text) { hide(); return; }
            clearTimeout(hideTimer);
            tip.classList.remove('is-out');
            current = el;
            tip.__anchor = el;
            tip.textContent = text;
            tip.hidden = false;
            const rect = el.getBoundingClientRect();
            const gap = 8;
            const pad = 8;
            const tw = tip.offsetWidth;
            const th = tip.offsetHeight;
            const anchor = rect.left + rect.width / 2;
            let left = anchor - tw / 2;
            let top = rect.top - th - gap;
            let where = 'above';
            if (top < pad) {
                top = rect.bottom + gap;
                where = 'below';
            }
            left = Math.max(pad, Math.min(left, window.innerWidth - tw - pad));
            tip.dataset.place = where;
            tip.style.setProperty('--caret-x', `${Math.round(anchor - left)}px`);
            tip.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
        };

        document.addEventListener('pointerover', (event) => {
            const el = event.target.closest('[data-tip]');
            if (!el) {
                if (current) hide();
                return;
            }
            if (el !== current) place(el);
        });
        document.addEventListener('focusin', (event) => {
            const el = event.target.closest('[data-tip]');
            if (el) place(el);
        });
        document.addEventListener('focusout', (event) => {
            if (!event.relatedTarget || !event.relatedTarget.closest('[data-tip]')) hide();
        });
        window.addEventListener('scroll', hide, true);
    }

    /* Empty-state icon rebuilds itself on hover, like the brand mark. */
    (() => {
        const ic = document.querySelector('#emptyState .empty-ic');
        ic?.addEventListener('pointerenter', () => {
            ic.classList.remove('ic-draw');
            void ic.offsetWidth;
            ic.classList.add('ic-draw');
        });
    })();

    /* ---------- segmented controls ---------- */
    const segs = {};
    function refreshSegs() { Object.values(segs).forEach(s => s.refresh()); }
    function refreshFilterSegs() {
        segs.status?.refresh();
        segs.journal?.refresh();
    }
    window.addEventListener('resize', () => refreshSegs());

    function wireSegs() {
        segs.scope = M.segmented($('scopeSeg'), (v) => { prefs.scope = v; savePrefs(); renderHeader(); });
        segs.direction = M.segmented($('directionSeg'), (v) => {
            prefs.direction = v === 'short' ? 'short' : 'long';
            savePrefs(); syncCalculatorMode(); recalc();
        });
        segs.vehicle = M.segmented($('vehicleSeg'), (v) => {
            prefs.vehicle = v === 'option' ? 'option' : 'shares';
            savePrefs(); syncCalculatorMode(); recalc();
        });
        segs.risk = M.segmented($('riskSeg'), (v) => {
            prefs.riskPreset = v;
            if (v === 'custom') { $('riskCustom').focus(); $('riskCustom').select(); }
            savePrefs(); recalc();
        });
        segs.max = M.segmented($('maxSeg'), (v) => {
            prefs.maxPreset = v;
            if (v === 'custom') { $('maxCustom').focus(); $('maxCustom').select(); }
            savePrefs(); recalc();
        });
        segs.plan = M.segmented($('planSeg'), (v) => { prefs.plan = v; savePrefs(); recalc(); });
        segs.view = M.segmented($('viewSeg'), (v) => setView(v, { fromSegment: true }));
        segs.status = M.segmented($('statusSeg'), (v) => {
            filters.status = v; viewFilters.positions = v; filters.page = 1; renderTable();
        });
        segs.journal = M.segmented($('journalSeg'), (v) => {
            filters.status = v; viewFilters.journal = v; filters.page = 1; renderTable();
        });
        segs.formDirection = M.segmented($('formDirectionSeg'), (v) => {
            const direction = v === 'short' ? 'short' : 'long';
            $('fDirection').value = direction;
            $('manualDirectionHint').textContent = direction === 'short' ? 'Stop sits above entry' : 'Stop sits below entry';
        });
    }

    /* ============================================================
       CALCULATOR
       ============================================================ */
    const calcFields = ['accountSize', 'entryPrice', 'stopLoss', 'tickerInput', 'targetPrice', 'optionDelta', 'optionPremium'];
    const numericCalcFields = ['riskCustom', 'maxCustom', 'entryPrice', 'stopLoss', 'targetPrice', 'optionDelta', 'optionPremium'];

    function decimalOnly(value) {
        let clean = '', hasDecimal = false;
        for (const char of String(value ?? '')) {
            if (char >= '0' && char <= '9') clean += char;
            else if (char === '.' && !hasDecimal) { clean += char; hasDecimal = true; }
        }
        return clean;
    }

    function accountNotationOnly(value) {
        let clean = '', hasDecimal = false, hasSuffix = false;
        for (const char of String(value ?? '')) {
            if (char >= '0' && char <= '9' && !hasSuffix) clean += char;
            else if (char === '.' && !hasDecimal && !hasSuffix) { clean += char; hasDecimal = true; }
            else if ((char === 'k' || char === 'K' || char === 'm' || char === 'M') && clean && clean !== '.' && !hasSuffix) {
                clean += char.toLowerCase();
                hasSuffix = true;
            }
        }
        return clean;
    }

    function commaFormatAccount(value) {
        if (!value) return '';
        const hasDecimal = value.includes('.');
        const [rawWhole = '', fraction = ''] = value.split('.');
        const whole = (rawWhole.replace(/^0+(?=\d)/, '') || (hasDecimal ? '0' : rawWhole));
        const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        return hasDecimal ? `${grouped}.${fraction}` : grouped;
    }

    function sanitizeNumericInput(el, sanitizer, pattern) {
        el.pattern = pattern;
        el.addEventListener('input', () => {
            const start = el.selectionStart ?? el.value.length;
            const clean = sanitizer(el.value);
            if (clean === el.value) return;
            const cleanBeforeCaret = sanitizer(el.value.slice(0, start)).length;
            el.value = clean;
            el.setSelectionRange(cleanBeforeCaret, cleanBeforeCaret);
        });
    }

    numericCalcFields.forEach(id => {
        sanitizeNumericInput($(id), decimalOnly, '[0-9]*[.]?[0-9]*');
    });
    function bindMoneyNotation(el) {
        if (!el) return;
        el.pattern = '[0-9]*[.]?[0-9]*[kKmM]?';
        el.addEventListener('input', () => {
            const start = el.selectionStart ?? el.value.length;
            const clean = accountNotationOnly(el.value);
            const hasSuffix = /[km]$/.test(clean);
            const expanded = hasSuffix ? parseNum(clean) : null;
            const formatted = hasSuffix && expanded !== null
                ? expanded.toLocaleString('en-US')
                : commaFormatAccount(clean);
            if (formatted === el.value) return;
            const nextCaret = hasSuffix
                ? formatted.length
                : commaFormatAccount(accountNotationOnly(el.value.slice(0, start))).length;
            el.value = formatted;
            el.setSelectionRange(nextCaret, nextCaret);
        });
    }
    bindMoneyNotation($('accountSize'));

    /* Risk presets as fractions of 1% — a view, not a different value. */
    const RISK_FRACTIONS = { '0.1': '⅒', '0.125': '⅛', '0.25': '¼', '0.5': '½', '1': '1' };
    function syncRiskLabels() {
        const frac = prefs.riskView === 'frac';
        document.querySelectorAll('#riskSeg button[data-seg]').forEach((b, i) => {
            const v = b.dataset.seg;
            if (!(v in RISK_FRACTIONS)) return;
            const next = frac ? RISK_FRACTIONS[v] : (v === '1' ? '1%' : `${v.replace('0.', '.')}%`);
            if (b.textContent === next) return; // first paint: no morph
            if (M.reduceMotion) { b.textContent = next; return; }
            /* the wave (mockup D): per-button width FLIP + blur arrival,
               rippling left→right at 45ms per pill */
            const w0 = b.getBoundingClientRect().width;
            b.textContent = next;
            const w1 = b.getBoundingClientRect().width;
            const delay = i * 45;
            if (Math.abs(w1 - w0) > 0.5) {
                b.animate([{ width: `${w0}px` }, { width: `${w1}px` }],
                    { duration: 320, delay, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'backwards' });
            }
            b.animate([{ opacity: 0, filter: 'blur(4px)' }, { opacity: 1, filter: 'blur(0)' }],
                { duration: 240, delay, easing: 'ease-out', fill: 'backwards' });
        });
        const t = $('riskViewToggle');
        t.textContent = frac ? '%' : '½';
        t.setAttribute('aria-pressed', String(frac));
        t.dataset.tip = frac ? 'Show presets as percentages' : 'Show presets as fractions of 1%';
        requestAnimationFrame(() => segs.risk?.refresh()); // label widths change the pill
        setTimeout(() => segs.risk?.refresh(), 560);       // settle after the wave lands
    }
    $('riskViewToggle').addEventListener('click', (e) => {
        e.preventDefault();
        prefs.riskView = prefs.riskView === 'frac' ? 'pct' : 'frac';
        savePrefs();
        syncRiskLabels();
    });

    function riskPct() { return prefs.riskPreset === 'custom' ? (prefs.riskCustom || 0) : parseFloat(prefs.riskPreset); }
    function maxPct() { return prefs.maxPreset === 'custom' ? (prefs.maxCustom || 100) : parseFloat(prefs.maxPreset); }

    function formatRiskValue(value) {
        return Number(value.toFixed(4)).toString();
    }

    function setRiskPercent(value) {
        const normalized = Math.max(0.01, Math.min(100, Math.round(value * 10000) / 10000));
        const preset = RISK_PRESETS.find(v => Math.abs(parseFloat(v) - normalized) < 0.000001);
        if (preset) {
            prefs.riskPreset = preset;
        } else {
            prefs.riskPreset = 'custom';
            prefs.riskCustom = normalized;
            $('riskCustom').value = formatRiskValue(normalized);
        }
        segs.risk.set(prefs.riskPreset);
        savePrefs();
        recalc();
        if (prefs.scenariosOpen !== false) M.flash($('riskScenarios'), 'scenario-pulse');
    }

    function readCalc() {
        return {
            account,
            riskPct: riskPct(), maxPct: maxPct(),
            entry: parseNum($('entryPrice').value),
            stop: parseNum($('stopLoss').value),
            target: parseNum($('targetPrice').value),
            ticker: $('tickerInput').value.trim().toUpperCase(),
            direction: prefs.direction,
            delta: parseNum($('optionDelta').value),
            premium: parseNum($('optionPremium').value),
        };
    }

    function syncCalculatorMode() {
        const optionMode = prefs.vehicle === 'option';
        const short = prefs.direction === 'short';
        $('optionInputs').hidden = !optionMode;
        $('maxPctLabelText').textContent = optionMode ? 'Max prem %' : 'Max %';
        $('maxPctHelp').textContent = optionMode
            ? 'Caps how much of your account can be committed to option premium. If this limit reduces your risk-based contract count, the original count is shown struck through.'
            : 'Caps how much of your account can go into one position. If this limit reduces your risk-based share count, the original count is shown struck through.';
        $('calcModeContext').dataset.direction = prefs.direction;
        $('calcModeContextText').textContent = optionMode
            ? `Long ${short ? 'put' : 'call'} · calculator only`
            : `${short ? 'Short' : 'Long'} shares`;
        $('optionGuidanceKind').textContent = `Long ${short ? 'puts' : 'calls'} only`;
        $('positionUnitLabel').textContent = optionMode ? 'contracts' : 'shares';
        $('sharesCopyBtn').title = optionMode ? 'Copy contract count' : 'Type your own share count — risk solves backwards';
        $('sharesCopyMini').hidden = optionMode;
        $('rStopDistLabel').textContent = optionMode ? 'Estimated loss / contract' : 'Stop distance';
        $('rPosSizeLabel').textContent = optionMode ? 'Premium outlay' : 'Position size';
        $('rTotalRiskLabel').textContent = optionMode ? 'Max loss (premium paid)' : 'Total risk';
        $('rPctAcctLabel').textContent = optionMode ? 'Estimated stop risk' : '% of account';
        $('freerollPlan').classList.toggle('is-option-mode', optionMode);
        $('planTitle').textContent = optionMode ? 'Underlying R map' : 'Freeroll plan';
        $('planSeg').hidden = optionMode;
    }

    function syncStopValidation(c) {
        const hasRelationship = E.isNum(c.entry) && c.entry > 0 && E.isNum(c.stop) && c.stop > 0;
        const invalid = hasRelationship && E.riskPerShare(c.entry, c.stop, c.direction) === null;
        const nextDirection = c.direction === 'short' ? 'long' : 'short';
        const notice = $('calcValidation');
        const stopInput = $('stopLoss');

        notice.classList.toggle('is-visible', invalid);
        notice.setAttribute('aria-hidden', String(!invalid));
        $('stopLossField').classList.toggle('has-error', invalid);
        $('calcValidationSwitch').tabIndex = invalid ? 0 : -1;
        $('calcValidationSwitch').dataset.direction = nextDirection;

        if (invalid) {
            const mode = c.direction === 'short' ? 'Short' : 'Long';
            const relation = c.direction === 'short' ? 'above' : 'below';
            $('calcValidationText').textContent = `Stop loss must be ${relation} entry price in ${mode} mode.`;
            $('calcValidationSwitchText').textContent = `Switch to ${nextDirection === 'short' ? 'Short' : 'Long'}`;
            stopInput.setAttribute('aria-invalid', 'true');
            stopInput.setAttribute('aria-describedby', 'calcValidationText');
        } else {
            stopInput.removeAttribute('aria-invalid');
            stopInput.removeAttribute('aria-describedby');
        }
    }

    let lastCalc = null;
    function renderRiskScenarios(c, currentResult) {
        const section = $('riskScenarios');
        const grid = $('riskScenariosGrid');
        const empty = $('riskScenariosEmpty');
        const context = $('riskScenariosContext');
        const optionMode = prefs.vehicle === 'option';
        const currentRisk = riskPct();
        const ready = currentResult.valid && currentRisk > 0;

        const nextState = ready ? 'ready' : 'empty';
        const stateChanged = section.dataset.state !== nextState;
        section.dataset.state = nextState;
        grid.hidden = !ready;
        empty.hidden = ready;
        if (stateChanged && section.classList.contains('is-open')) {
            $('riskScenariosBody').style.height = 'auto';
        }
        if (!ready) {
            context.textContent = E.isNum(c.entry) && E.isNum(c.stop)
                ? 'Complete the setup to compare'
                : 'Fill entry and stop to compare';
            return;
        }

        const scenarios = [
            { key: 'safer', risk: Math.max(0.01, currentRisk / 2) },
            { key: 'current', risk: currentRisk },
            { key: 'higher', risk: Math.min(100, currentRisk * 2) },
        ];
        const unit = optionMode ? 'contract' : 'share';
        context.textContent = `Same setup · ${formatRiskValue(maxPct())}% ${optionMode ? 'premium' : 'account'} cap`;

        scenarios.forEach(({ key, risk }) => {
            const button = grid.querySelector(`[data-scenario="${key}"]`);
            const result = optionMode
                ? E.calcOptionPosition({ ...c, riskPct: risk })
                : E.calcPosition({ ...c, riskPct: risk });
            const count = optionMode ? result.contracts : result.shares;
            const valid = result.valid;
            const countText = valid ? E.fmtShares(count) : '0';
            const unitText = `${unit}${count === 1 ? '' : 's'}`;
            const allocation = valid ? E.fmtPct(result.pctOfAccount) : '—';
            const riskDollars = valid ? E.fmtMoney(result.totalRisk) : 'Below minimum';

            button.dataset.risk = String(risk);
            button.classList.toggle('is-capped', !!result.capped);
            button.querySelector('.risk-scenario-pct').textContent = `${formatRiskValue(risk)}%`;
            button.querySelector('.risk-scenario-position strong').textContent = countText;
            button.querySelector('.risk-scenario-position span').textContent = unitText;
            const meta = button.querySelectorAll('.risk-scenario-meta span');
            meta[0].textContent = `${allocation} account`;
            meta[1].textContent = valid ? `${riskDollars} risk${result.capped ? ' · capped' : ''}` : riskDollars;
            button.setAttribute('aria-label', `${key === 'current' ? 'Current' : key === 'safer' ? 'Safer' : 'Higher'} scenario: ${formatRiskValue(risk)} percent risk, ${countText} ${unitText}, ${allocation} of account, ${riskDollars} risk${result.capped ? ', allocation capped' : ''}`);
        });
    }

    function recalc() {
        const c = readCalc();
        const optionMode = prefs.vehicle === 'option';
        const res = optionMode ? E.calcOptionPosition(c) : E.calcPosition(c);
        const underlying = optionMode ? E.calcPosition({ ...c, maxPct: 100 }) : res;
        lastCalc = { inputs: c, res };
        syncStopValidation(c);

        // hero + position card
        const units = optionMode ? res.contracts : res.shares;
        rollTo($('sharesHero'), res.valid ? E.fmtShares(units) : '0');
        const sharesCap = $('sharesCap');
        const allocationCapped = res.valid && !optionMode && res.capped;
        sharesCap.hidden = !(res.valid && (optionMode || allocationCapped));
        sharesCap.classList.toggle('is-capped', allocationCapped);
        sharesCap.removeAttribute('aria-label');
        if (res.valid && optionMode) sharesCap.textContent = res.limitedBy === 'allocation'
            ? `Premium allocation constraint · risk sizing suggested ${E.fmtShares(res.rawContracts)}`
            : 'Risk budget constraint';
        else if (allocationCapped) {
            const rawCount = fmtShareCount(res.rawShares);
            const cappedCount = fmtShareCount(res.shares);
            sharesCap.setAttribute('aria-label', `Risk sizing suggested ${rawCount}. Limited to ${cappedCount} by the ${maxPct()} percent maximum of account.`);
            sharesCap.innerHTML = `
                <span class="shares-cap-source"><span>Risk sizing</span> <s>${rawCount}</s></span>
                <span class="shares-cap-arrow" aria-hidden="true">→</span>
                <strong>${cappedCount}</strong>
                <span class="shares-cap-reason">${maxPct()}% account cap</span>`;
        }
        $('rStopDist').textContent = res.valid ? (optionMode
            ? E.fmtMoney(res.riskPerContract)
            : `$${res.rps.toFixed(2)} (${res.stopDistPct.toFixed(2)}%)`) : '—';
        $('rPosSize').textContent = res.valid ? E.fmtMoney(optionMode ? res.premiumOutlay : res.posSize) : '—';
        $('rTotalRisk').textContent = res.valid ? (optionMode
            ? E.fmtMoney(res.maxLoss)
            : `${E.fmtMoney(res.totalRisk)} (${res.totalRiskPct.toFixed(2)}%)`) : '—';
        $('rPctAcct').textContent = res.valid ? (optionMode
            ? `${E.fmtMoney(res.totalRisk)} (${res.totalRiskPct.toFixed(2)}%)`
            : E.fmtPct(res.pctOfAccount)) : '—';

        renderRiskScenarios(c, res);

        // target card
        const tc = $('targetCard');
        const target = underlying.valid ? underlying.target : null;
        if (res.valid && target) {
            const gain = target.perShare >= 0;
            tc.dataset.state = gain ? 'gain' : 'loss';
            $('targetHead').textContent = optionMode ? 'Underlying at target' : 'At target';
            $('targetProfitLabel').hidden = false;
            $('targetProfitLabel').textContent = optionMode ? 'Underlying reward' : 'Projected P&L';
            $('tRr').hidden = false;
            $('tRr').textContent = E.fmtR(target.rr);
            rollTo($('targetProfit'), optionMode ? E.fmtR(target.rr) : E.fmtMoney(target.profit, true));
            $('tPrice').textContent = E.fmtPrice(target.price);
            $('tPerShareLabel').textContent = optionMode ? 'Underlying move' : 'Per share';
            $('tRoiLabel').textContent = optionMode ? 'Underlying ROI' : 'ROI';
            $('tPerShare').textContent = E.fmtMoney(target.perShare, true);
            $('tRoi').textContent = E.fmtPct((target.perShare / c.entry) * 100);
        } else {
            tc.dataset.state = 'empty';
            $('targetHead').textContent = optionMode ? 'Underlying at target' : 'At target';
            $('targetProfitLabel').hidden = true;
            $('tRr').hidden = true;
            $('targetProfit').textContent = 'set a target';
            delete $('targetProfit').__cells;
            $('tPerShareLabel').textContent = optionMode ? 'Underlying move' : 'Per share';
            $('tRoiLabel').textContent = optionMode ? 'Underlying ROI' : 'ROI';
            ['tPrice', 'tPerShare', 'tRoi'].forEach(id => $(id).textContent = '—');
        }

        // freeroll plan sentence + r line
        renderPlan(c, res);

        // ticker chart link
        const link = $('tickerLink');
        if (c.ticker) {
            link.hidden = false;
            link.href = `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(c.ticker)}`;
        } else link.hidden = true;

        // log button + collapsed hint — aria-disabled, not disabled, so a
        // click on the grayed button can walk the user to the missing field,
        // and the hover tip names what's blocking the log
        const ready = !optionMode && res.valid && !!c.ticker;
        const logBtn = $('logTradeBtn');
        logBtn.setAttribute('aria-disabled', String(!ready));
        if (ready || optionMode) {
            delete logBtn.dataset.tip;
        } else {
            const missing = [];
            if (!E.isNum(c.entry) || c.entry <= 0) missing.push('entry');
            if (!E.isNum(c.stop) || c.stop <= 0) missing.push('stop');
            if (!c.ticker) missing.push('ticker');
            logBtn.dataset.tip = !(c.account > 0) ? 'Set your account size first · click to jump there'
                : missing.length ? `Missing ${missing.join(' + ')} · click to jump there`
                    : !res.valid ? `Stop is on the wrong side for ${c.direction === 'short' ? 'Short' : 'Long'} · click to fix`
                        : 'Complete the setup to log';
        }
        $('logTradeBtn').textContent = optionMode ? 'Calculator only · option logging later'
            : ready ? `Log ${prefs.direction === 'short' ? 'short ' : ''}${c.ticker} — ${fmtShareCount(res.shares)}` : 'Log trade';
        $('calcHint').textContent = res.valid && c.ticker
            ? `${c.ticker} · ${optionMode ? `${E.fmtShares(units)} ${units === 1 ? 'contract' : 'contracts'}` : fmtShareCount(units)} · risk ${E.fmtMoney(res.totalRisk)}` : '';
    }

    function renderPlan(c, res) {
        const sentence = $('planSentence');
        const rLine = $('rLine');
        const rLineNote = $('rLineNote');

        function hideLadder() {
            rLine.hidden = true;
            rLineNote.hidden = true;
        }

        function showLadder({ optionMode = false } = {}) {
            const plan = optionMode || prefs.plan === 'off' ? null
                : prefs.plan === 'third-2r' ? { level: 2, hint: `${c.direction === 'short' ? 'cover' : 'sell'} ⅓` }
                    : prefs.plan === 'backfill' ? { level: 1, hint: 'stop → BE' }
                        : { level: 1, hint: `${c.direction === 'short' ? 'cover' : 'sell'} ½` };
            rLine.innerHTML = res.rPrices.map((price, index) => {
                const level = index + 1;
                const isPlan = plan?.level === level;
                const planMark = isPlan ? `<span class="r-rung-mark" aria-hidden="true">${ICONS['shield-check']}</span>` : '';
                return `<button type="button" class="r-rung${isPlan ? ' is-plan' : ''}" data-copy="${price.toFixed(2)}" data-r="${level}" aria-label="Copy ${level}R price ${price.toFixed(2)}${isPlan ? ` — plan: ${plan.hint}` : ''}">
                    ${planMark}
                    <span class="r-rung-level">${level}R</span>
                    <span class="r-rung-price">${E.fmtPrice(price)}</span>
                    <span class="r-rung-hint">${isPlan ? plan.hint : ''}</span>
                </button>`;
            }).join('');
            $('rLineNoteText').textContent = optionMode
                ? 'Select an underlying price to copy · calculator fields stay unchanged'
                : 'Select a price to copy · calculator fields stay unchanged';
            rLine.hidden = false;
            rLineNote.hidden = false;
        }

        if (prefs.vehicle === 'option') {
            sentence.textContent = res.valid
                ? 'R levels follow the underlying. Option target P&L is not estimated from entry delta.'
                : 'Fill the underlying entry, stop, delta, and premium to size the position.';
            if (res.valid) showLadder({ optionMode: true });
            else hideLadder();
            return;
        }
        if (!res.valid) {
            sentence.textContent = prefs.plan === 'off' ? 'No plan — manual management' : 'Fill entry & stop to see the plan';
            hideLadder();
            return;
        }
        const rp = res.rps;
        const entry = c.entry;
        const sign = E.directionSign(c.direction);
        const exitVerb = c.direction === 'short' ? 'Cover' : 'Sell';
        const fmt = E.fmtPrice;
        if (prefs.plan === 'half-1r') {
            const n = Math.ceil(res.shares / 2);
            const lock = n * rp;
            sentence.innerHTML = `<span class="plan-lead-icon">${ICONS['arrow-right']}</span>${exitVerb} <b class="fr-lock">${fmtShareCount(n)} (½)</b> @ $${fmt(entry + sign * rp)} → lock <b class="fr-lock">${E.fmtMoney(lock, true)}</b>, <span class="fr-zero" id="frZero">risk → $0 <span class="shield">${ICONS['shield-check']}</span></span>`;
        } else if (prefs.plan === 'third-2r') {
            const n = Math.ceil(res.shares / 3);
            const lock = n * rp * 2;
            sentence.innerHTML = `<span class="plan-lead-icon">${ICONS['arrow-right']}</span>${exitVerb} <b class="fr-lock">${fmtShareCount(n)} (⅓)</b> @ $${fmt(entry + sign * rp * 2)} → lock <b class="fr-lock">${E.fmtMoney(lock, true)}</b>, <span class="fr-zero" id="frZero">risk → $0 <span class="shield">${ICONS['shield-check']}</span></span>`;
        } else if (prefs.plan === 'backfill') {
            sentence.innerHTML = `<span class="plan-lead-icon">${ICONS['arrow-right']}</span>At $${fmt(entry + sign * rp)} (1R), move stop to $${fmt(entry)} → <span class="fr-zero" id="frZero">risk → $0 <span class="shield">${ICONS['shield-check']}</span></span>`;
        } else {
            sentence.textContent = 'No plan — manual management';
        }
        showLadder();
    }

    $('rLine').addEventListener('click', (e) => {
        const b = e.target.closest('[data-copy]');
        if (!b) return;
        navigator.clipboard.writeText(b.dataset.copy);
        toast(`Copied <b>${b.dataset.r}R · ${b.dataset.copy}</b> — set your alert`);
    });

    /* keyboard contract: Enter advances, Tab-in selects so the next key
       replaces. Pointer/touch must not select — tap-out on iOS leaves the
       highlight, and the next tap + keystroke wipes the field. */
    function selectOnKeyboardFocus(el) {
        let fromPointer = false;
        el.addEventListener('pointerdown', () => { fromPointer = true; });
        el.addEventListener('focus', () => {
            if (fromPointer) { fromPointer = false; return; }
            el.select();
        });
        el.addEventListener('blur', () => {
            fromPointer = false;
            const n = el.value.length;
            try { el.setSelectionRange(n, n); } catch (_) { /* type=number etc. */ }
        });
    }

    calcFields.forEach((id) => {
        const el = $(id);
        selectOnKeyboardFocus(el);
        el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const activeFields = calcFields.filter(fieldId => prefs.vehicle === 'option' || !['optionDelta', 'optionPremium'].includes(fieldId));
                const next = activeFields[activeFields.indexOf(id) + 1];
                if (next) $(next).focus();
                else $('logTradeBtn').focus();
                if (id === 'stopLoss' && window.innerWidth < 700) $('calcResults').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        });
        el.addEventListener('input', () => {
            if (id === 'accountSize') {
                account = parseNum(el.value) ?? account;
                savePrefs(); renderHeader();
            }
            recalc();
        });
    });
    $('riskCustom').addEventListener('input', (e) => {
        prefs.riskCustom = parseNum(e.target.value) ?? 0;
        if (prefs.riskPreset !== 'custom') { prefs.riskPreset = 'custom'; segs.risk.set('custom'); }
        segs.risk.refresh(); // input width may change the segment size
        savePrefs(); recalc();
    });
    let lastScenarioPickAt = 0;
    $('riskScenariosGrid').addEventListener('click', (e) => {
        const scenario = e.target.closest('.risk-scenario');
        const nextRisk = scenario ? parseNum(scenario.dataset.risk) : null;
        const now = performance.now();
        if (nextRisk === null || now - lastScenarioPickAt < 220) return;
        lastScenarioPickAt = now;
        if (Math.abs(nextRisk - riskPct()) > 0.000001) setRiskPercent(nextRisk);
    });
    $('maxCustom').addEventListener('input', (e) => {
        prefs.maxCustom = parseNum(e.target.value) ?? 100;
        if (prefs.maxPreset !== 'custom') { prefs.maxPreset = 'custom'; segs.max.set('custom'); }
        segs.max.refresh();
        savePrefs(); recalc();
    });

    /* steppers: fine adjust ±0.01 (±0.05 above $100) */
    document.querySelectorAll('[data-step]').forEach(btn => {
        btn.addEventListener('click', () => {
            const input = $(btn.dataset.for);
            const cur = parseNum(input.value) ?? 0;
            const next = Math.max(0, cur + (btn.dataset.step === 'up' ? 0.01 : -0.01));
            input.value = next.toFixed(2);
            recalc();
        });
    });

    /* Shift+Enter on ticker opens the TradingView chart (v1) */
    $('tickerInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.shiftKey) {
            const tk = $('tickerInput').value.trim().toUpperCase();
            if (tk) { e.preventDefault(); window.open(`https://www.tradingview.com/chart/?symbol=${encodeURIComponent(tk)}`, '_blank', 'noopener'); }
        }
    });
    /* Account size stays numeric while editing; commas restore on blur. */
    $('accountSize').addEventListener('blur', () => {
        if (account) $('accountSize').value = account.toLocaleString('en-US');
    });

    $('copyStop').addEventListener('click', () => {
        const v = $('stopLoss').value;
        if (v) { navigator.clipboard.writeText(v); toast(`Stop <b>${E.escapeHtml(v)}</b> copied`); }
    });
    $('calcValidationSwitch').addEventListener('click', () => {
        const nextDirection = $('calcValidationSwitch').dataset.direction === 'short' ? 'short' : 'long';
        prefs.direction = nextDirection;
        segs.direction.set(nextDirection);
        savePrefs();
        syncCalculatorMode();
        recalc();
        requestAnimationFrame(() => {
            $('directionSeg').querySelector(`[data-seg="${nextDirection}"]`)?.focus();
            M.flash($('calcModeContext'), 'flash');
        });
    });
    function copyShareCount() {
        if (!lastCalc?.res?.valid) return;
        const optionMode = prefs.vehicle === 'option';
        const units = optionMode ? lastCalc.res.contracts : lastCalc.res.shares;
        navigator.clipboard.writeText(String(units));
        toast(optionMode
            ? `<b>${E.fmtShares(units)}</b> ${units === 1 ? 'contract' : 'contracts'} copied`
            : `<b>${fmtShareCount(units)}</b> copied`);
    }
    /* Cuesta's ask: enter the shares you actually bought and let the site do
       the math backwards. The hero opens an inline editor; committing derives
       the implied risk % (the risk seg jumps to that custom value) and the
       normal forward solve reproduces the typed count. */
    const sharesEditEl = $('sharesEdit');
    sanitizeNumericInput(sharesEditEl, decimalOnly, '[0-9]*');
    const sizeSharesEdit = () => { sharesEditEl.style.width = `${Math.max(2, sharesEditEl.value.length + 0.5)}ch`; };
    sharesEditEl.addEventListener('input', sizeSharesEdit);
    function closeSharesEdit() {
        sharesEditEl.hidden = true;
        $('sharesCopyBtn').hidden = false;
    }
    function commitSharesEdit() {
        const n = Math.floor(parseNum(sharesEditEl.value) ?? 0);
        closeSharesEdit();
        const c = lastCalc?.inputs;
        const rps = c ? E.riskPerShare(c.entry, c.stop, c.direction) : null;
        if (!n || n <= 0 || rps === null || !(c.account > 0)) return;
        if (n === lastCalc.res?.shares) return;
        /* ceil at 4dp so the forward floor lands on the typed count */
        const implied = Math.ceil((n * rps / c.account) * 100 * 10000) / 10000;
        setRiskPercent(implied);
        toast(`<b>${fmtShareCount(n)}</b> → risk ${formatRiskValue(riskPct())}%`);
    }
    sharesEditEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); commitSharesEdit(); }
        else if (e.key === 'Escape') { e.stopPropagation(); closeSharesEdit(); }
    });
    sharesEditEl.addEventListener('blur', () => { if (!sharesEditEl.hidden) commitSharesEdit(); });
    $('sharesCopyBtn').addEventListener('click', () => {
        if (prefs.vehicle === 'option') { copyShareCount(); return; } // contracts stay copy-only
        if (!lastCalc?.res?.valid) return;
        sharesEditEl.value = String(lastCalc.res.shares || '');
        sizeSharesEdit();
        $('sharesCopyBtn').hidden = true;
        sharesEditEl.hidden = false;
        sharesEditEl.focus();
        sharesEditEl.select();
    });
    $('sharesCopyMini').addEventListener('click', copyShareCount);
    function clearCalculator() {
        ['entryPrice', 'stopLoss', 'tickerInput', 'targetPrice', 'optionDelta', 'optionPremium'].forEach(id => $(id).value = '');
        recalc();
        $('entryPrice').focus();
    }
    $('clearCalc').addEventListener('click', clearCalculator);
    $('clearCalcMobile')?.addEventListener('click', clearCalculator);

    /* ---------- paste alert ---------- */
    const isCompleteAlert = parsed => !!parsed
        && E.isNum(parsed.entry) && parsed.entry > 0
        && E.isNum(parsed.stop) && parsed.stop > 0;

    function applyAlert(parsed) {
        if (!parsed) { toast('Couldn’t read that alert', { error: true }); return; }
        if (view !== 'positions') setView('positions');
        if (parsed.ticker) $('tickerInput').value = parsed.ticker;
        if (parsed.entry !== null) $('entryPrice').value = String(parsed.entry);
        if (parsed.stop !== null) $('stopLoss').value = String(parsed.stop);
        if (parsed.riskPct !== null) {
            const preset = RISK_PRESETS.find(p => parseFloat(p) === parsed.riskPct);
            if (preset) { prefs.riskPreset = preset; segs.risk.set(preset); }
            else { prefs.riskPreset = 'custom'; prefs.riskCustom = parsed.riskPct; $('riskCustom').value = String(parsed.riskPct); segs.risk.set('custom'); }
            savePrefs();
        }
        const wasClosed = !panels.calcSection.section.classList.contains('is-open');
        if (wasClosed) { prefs.calcOpen = true; panels.calcSection.set(true); }
        recalc();
        M.flash($('positionCard'), 'flash');
        toast(`Imported <b>${E.escapeHtml(parsed.ticker || 'alert')}</b> — check the numbers, then Log`);
        const delay = wasClosed && !M.reduceMotion ? 280 : 80;
        setTimeout(() => {
            $('calcResults').scrollIntoView({
                behavior: M.reduceMotion ? 'auto' : 'smooth',
                block: 'center',
            });
        }, delay);
    }

    function openPasteAlertModal(prefill = '') {
        openModal('tpl-paste', (card, close) => {
            const box = card.querySelector('.paste-box');
            box.value = prefill;
            card.querySelector('.paste-import').addEventListener('click', () => {
                close(); applyAlert(E.parseAlert(box.value));
            });
        });
    }

    $('pasteAlertBtn').addEventListener('click', async () => {
        let clipboardText = '';
        try {
            clipboardText = (await navigator.clipboard?.readText?.())?.trim() || '';
        } catch { /* permission or browser support — use the manual fallback */ }
        const parsed = E.parseAlert(clipboardText);
        if (isCompleteAlert(parsed)) {
            applyAlert(parsed);
            return;
        }
        openPasteAlertModal(clipboardText);
    });
    document.addEventListener('paste', (e) => {
        const t = e.target;
        if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || modalStack.length) return;
        const text = e.clipboardData.getData('text');
        const parsed = E.parseAlert(text);
        if (parsed && parsed.ticker && (parsed.entry !== null || parsed.stop !== null)) {
            e.preventDefault();
            applyAlert(parsed);
        }
    });

    /* ---------- log trade (one click, binding) ---------- */
    /* Not ready → walk the user to the first field that's blocking the log. */
    function focusFirstMissingCalcField(c = {}, res) {
        const target = !(c.account > 0) ? 'accountSize'
            : !E.isNum(c.entry) || c.entry <= 0 ? 'entryPrice'
                : !E.isNum(c.stop) || c.stop <= 0 ? 'stopLoss'
                    : res && !res.valid ? 'stopLoss' // wrong-side stop — the inline notice explains
                        : !c.ticker ? 'tickerInput' : null;
        if (!target) return;
        const el = $(target);
        el.scrollIntoView({ behavior: M.reduceMotion ? 'auto' : 'smooth', block: 'center' });
        setTimeout(() => el.focus(), M.reduceMotion ? 0 : 250);
        M.flash(el.closest('.field') || el.closest('.setting') || el, 'flash');
    }
    $('logTradeBtn').addEventListener('click', () => {
        const { inputs: c, res } = lastCalc || {};
        if (prefs.vehicle === 'option') return;
        if (!res?.valid || !c?.ticker) { focusFirstMissingCalcField(c, res); return; }
        const today = E.todayLocalISO();
        const dupe = trades.find(t => t.ticker === c.ticker && t.entryPrice === c.entry && t.entryDate === today && E.directionOf(t) === c.direction);
        if (dupe) {
            toast(`<b>${E.escapeHtml(c.ticker)}</b> already logged today at this entry`, { error: true });
            const row = document.querySelector(`tr[data-id="${dupe.id}"]`);
            if (row) M.flash(row, 'flash');
            return;
        }
        const trade = {
            id: uid(),
            ticker: c.ticker,
            direction: c.direction,
            entryPrice: c.entry,
            initialSL: c.stop,
            currentSL: c.stop,
            entryDate: today,
            shares: res.shares,
            exits: [],
            sellPlan: E.buildSellPlan(prefs.plan, res, c.entry, c.direction),
            snapshot: {
                account: c.account, riskPct: c.riskPct, maxPct: c.maxPct,
                target: c.target ?? null, shares: res.shares, direction: c.direction,
                posSize: res.posSize, totalRisk: res.totalRisk, capped: res.capped,
            },
            archived: false, journal: [], notes: '',
            createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        };
        trades.unshift(trade);
        saveTrades();
        lastLoggedId = trade.id;
        renderAll();

        // inline confirm strip: receipt pill with a legible 8s lifespan;
        // hovering pauses the clock (same contract as toasts)
        const btn = $('logTradeBtn'), strip = $('logConfirm');
        btn.hidden = true; strip.hidden = false;
        $('logConfirmText').innerHTML =
            `<b>${E.escapeHtml(trade.ticker)}</b> logged` +
            `<span class="lc-meta">${fmtShareCount(res.shares)} · risking ${E.fmtMoney(res.totalRisk)} (${res.totalRiskPct.toFixed(2)}%)</span>`;
        strip.querySelector('.lc-timer')?.remove();
        const lcTimer = document.createElement('span');
        lcTimer.className = 'lc-timer';
        strip.appendChild(lcTimer);
        M.toastEnter(strip);
        clearTimeout(logConfirmTimer);
        if (!M.reduceMotion) {
            const anim = lcTimer.animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], { duration: 8000, easing: 'linear', fill: 'forwards' });
            anim.finished.then(() => { if (lcTimer.isConnected) dismissLogConfirm(); }).catch(() => {});
            strip.onmouseenter = () => anim.pause();
            strip.onmouseleave = () => anim.play();
        } else {
            logConfirmTimer = setTimeout(dismissLogConfirm, 8000);
        }
    });
    function dismissLogConfirm() {
        clearTimeout(logConfirmTimer);
        $('logConfirm').hidden = true;
        $('logTradeBtn').hidden = false;
    }
    $('logUndoBtn').addEventListener('click', () => {
        if (lastLoggedId) {
            trades = trades.filter(t => t.id !== lastLoggedId);
            lastLoggedId = null;
            saveTrades(); renderAll();
        }
        dismissLogConfirm();
    });
    $('logEditBtn').addEventListener('click', () => {
        dismissLogConfirm();
        if (lastLoggedId) openEditForm(lastLoggedId);
    });

    /* ============================================================
       HEADER — open risk + scoreboard
       ============================================================ */
    function renderHeader() {
        const risk = E.accountRisk(trades, account);
        rollTo($('openRiskDollars'), E.fmtMoney(risk.dollars));
        $('openRiskPct').textContent = risk.pct === null ? '—'
            : `${risk.pct.toFixed(risk.pct < 1 ? 2 : 1)}% of account`;
        const badge = $('openRiskLevel');
        if (badge.dataset.level !== risk.level) {
            badge.dataset.level = risk.level;
            badge.textContent = risk.level;
            if (risk.level === 'FREEROLLED') M.wobble(badge);
        }
        segs.scope && segs.scope.set(prefs.scope, true);

        const s = E.computeStats(trades, prefs.scope);
        const scopeName = prefs.scope === 'month' ? s.monthName : 'All time';
        const ready = s.n >= 3;
        const setSign = (el, n) => {
            el.dataset.sign = E.isNum(n) && n > 0 ? 'up' : E.isNum(n) && n < 0 ? 'down' : '';
        };
        $('sbTrades').textContent = String(s.n);
        $('sbRecord').textContent = s.n ? `${s.wins}W / ${s.losses}L` : '';
        if (ready) {
            $('sbWin').textContent = s.winRate === null ? '—' : Math.round(s.winRate * 100) + '%';
            $('sbR').textContent = E.fmtR(s.sumR);
            $('sbPnl').textContent = E.fmtMoney(s.sumPnl, true);
            $('sbExp').textContent = s.expectancy === null ? '—'
                : (s.expectancy > 0 ? '+' : s.expectancy < 0 ? '−' : '') + Math.abs(s.expectancy).toFixed(2) + 'R';
            setSign($('sbR'), s.sumR);
            setSign($('sbPnl'), s.sumPnl);
            setSign($('sbExp'), s.expectancy);
        } else {
            $('sbWin').textContent = '—';
            $('sbR').textContent = '—';
            $('sbPnl').textContent = '—';
            $('sbExp').textContent = '—';
            setSign($('sbR'), null);
            setSign($('sbPnl'), null);
            setSign($('sbExp'), null);
        }
        const notes = [];
        if (!ready) notes.push(`${scopeName} · stats unlock after 3 closed trades`);
        if (s.excluded) notes.push(`${s.excluded} trade${s.excluded === 1 ? '' : 's'} excluded (no share counts)`);
        $('scoreboardNote').textContent = notes.join(' · ');

        const stale = E.staleTrades(trades);
        const chip = $('staleChip');
        chip.hidden = stale.length === 0;
        if (stale.length) chip.textContent = `${stale.length} stale position${stale.length === 1 ? '' : 's'}`;

        // floating pill header mirrors the two live metrics
        rollTo($('fbRisk'), E.fmtMoney(risk.dollars));
        const fbBadge = $('fbBadge');
        if (fbBadge.dataset.level !== risk.level) { fbBadge.dataset.level = risk.level; fbBadge.textContent = risk.level; }
        $('fbScore').textContent = s.n >= 3
            ? `${scopeName} · ${E.fmtR(s.sumR)} · ${s.winRate === null ? '—' : Math.round(s.winRate * 100) + '%'} win`
            : `${scopeName} · ${s.n} logged`;
    }

    /* ---------- floating header visibility ----------
       Sentinel pattern: the pill appears exactly when the real header's
       metrics scroll out of view — no scroll-position guessing. */
    let headerOffscreen = false;
    let calcInView = true;
    function syncFloatBar() {
        const show = headerOffscreen && !calcInView;
        $('floatBar').classList.toggle('in', show);
        $('floatBar').setAttribute('aria-hidden', String(!show));
    }
    new IntersectionObserver(([entry]) => {
        headerOffscreen = !entry.isIntersecting;
        syncFloatBar();
    }, { rootMargin: '-30px 0px 0px 0px' }).observe(document.querySelector('.app-header'));
    new IntersectionObserver(([entry]) => {
        calcInView = entry.isIntersecting;
        syncFloatBar();
    }).observe(document.querySelector('.calc-settings'));
    $('fbCalc').addEventListener('click', () => {
        if (view !== 'positions') { setView('positions'); return; }
        window.scrollTo({ top: 0, behavior: M.reduceMotion ? 'auto' : 'smooth' });
        if (!panels.calcSection.section.classList.contains('is-open')) { prefs.calcOpen = true; panels.calcSection.set(true); savePrefs(); }
        setTimeout(() => $('entryPrice').focus(), M.reduceMotion ? 0 : 350);
    });
    $('staleChip').addEventListener('click', () => {
        const stale = E.staleTrades(trades);
        if (!stale.length) return;
        setView('positions');
        filters.status = 'active'; viewFilters.positions = 'active'; filters.page = 1;
        segs.status.set('active');
        renderTable();
        stale.forEach(t => {
            const row = document.querySelector(`tr[data-id="${t.id}"]`);
            if (row) M.flash(row, 'flash');
        });
        openTrimModal(stale[0].id);
    });

    const round2 = E.round2;

    function viewFromHash() {
        const h = (location.hash || '#').slice(1).toLowerCase();
        if (h === 'dashboard' || h === 'tracker' || h === '') return 'positions';
        return VIEWS.includes(h) ? h : 'positions';
    }

    /* ---------- equity curve (journal) ----------
       Hand-rolled SVG like compound.js: tokens for color, area + line,
       dashed peak line and a red wash over the peak→now give-back. */
    function renderEquity() {
        const card = $('equityCard');
        if (!card) return;
        if (view !== 'journal') { card.hidden = true; return; }
        const eq = E.equityCurve(trades);
        card.hidden = eq.points.length === 0;
        if (card.hidden) return;
        const rMode = (prefs.equityMode || 'usd') === 'r';
        const cur = rMode ? eq.currentR : eq.current;
        const num = $('eqNum');
        num.textContent = rMode ? E.fmtR(eq.currentR) : E.fmtMoney(eq.current, true);
        num.dataset.sign = cur > 0 ? 'up' : cur < 0 ? 'down' : '';
        const dd = rMode ? eq.drawdownR : eq.drawdown;
        const atPeak = dd <= 0.0001;
        $('eqDd').dataset.state = atPeak ? 'ok' : 'down';
        const ddPct = !rMode && account > 0 ? (eq.drawdown / account) * 100 : null;
        $('eqDdVal').textContent = atPeak ? 'At equity highs'
            : rMode ? `−${eq.drawdownR.toFixed(1)}R from peak`
                : `−${E.fmtMoney(eq.drawdown)}${ddPct !== null ? ` · ${ddPct.toFixed(ddPct < 1 ? 2 : 1)}% of account` : ''}`;
        $('eqPeak').textContent = rMode ? E.fmtR(eq.peakR) : E.fmtMoney(eq.peak, true);
        $('eqCount').textContent = String(eq.points.length);
        $('eqMeta').textContent = `${eq.points.length} exit${eq.points.length === 1 ? '' : 's'} · all time`;

        const tok = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
        const up = tok('--success') || '#16a34a';
        const down = tok('--danger') || '#dc2626';
        const upSoft = tok('--success-soft') || 'rgba(22,163,74,0.10)';
        const downSoft = tok('--danger-soft') || 'rgba(220,38,38,0.08)';
        const grid = tok('--border') || '#e4e4e7';
        const surface = tok('--surface') || '#fff';

        const host = $('equityChart');
        const W = Math.max(host.clientWidth || 560, 280);
        const H = 170;
        const pad = { l: 8, r: 10, t: 14, b: 10 };
        const raw = [{ value: 0, r: 0 }, ...eq.points]; // curve starts at zero
        const vals = raw.map(p => (rMode ? p.r : p.value));
        const peakI = eq.peakIndex + 1;
        const max = Math.max(...vals, 0), min = Math.min(...vals, 0);
        const span = (max - min) || 1;
        const X = (i) => pad.l + (i / (vals.length - 1)) * (W - pad.l - pad.r);
        const Y = (v) => pad.t + (1 - (v - min) / span) * (H - pad.t - pad.b);
        const pts = vals.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`);
        const line = 'M' + pts.join(' L');
        const area = `${line} L${X(vals.length - 1).toFixed(1)},${Y(Math.max(min, 0)).toFixed(1)} L${X(0).toFixed(1)},${Y(Math.max(min, 0)).toFixed(1)} Z`;
        const color = cur >= 0 ? up : down;
        const soft = cur >= 0 ? upSoft : downSoft;
        host.innerHTML = `
            <svg viewBox="0 0 ${W} ${H}" height="${H}" role="img" aria-label="Cumulative realized P&L, ${eq.points.length} exits">
                <line x1="${pad.l}" x2="${W - pad.r}" y1="${Y(0).toFixed(1)}" y2="${Y(0).toFixed(1)}" stroke="${grid}" stroke-width="1"/>
                ${!atPeak ? `<rect x="${X(peakI).toFixed(1)}" y="${pad.t}" width="${(X(vals.length - 1) - X(peakI)).toFixed(1)}" height="${H - pad.t - pad.b}" fill="${downSoft}"/>` : ''}
                <path d="${area}" fill="${soft}"/>
                <path d="${line}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
                ${!atPeak ? `
                    <line x1="${X(peakI).toFixed(1)}" x2="${W - pad.r}" y1="${Y(vals[peakI]).toFixed(1)}" y2="${Y(vals[peakI]).toFixed(1)}" stroke="${down}" stroke-width="1" stroke-dasharray="3 4" stroke-opacity="0.6"/>
                    <circle cx="${X(peakI).toFixed(1)}" cy="${Y(vals[peakI]).toFixed(1)}" r="3.5" fill="${surface}" stroke="${down}" stroke-width="1.6"/>
                ` : ''}
                <circle cx="${X(vals.length - 1).toFixed(1)}" cy="${Y(vals[vals.length - 1]).toFixed(1)}" r="4" fill="${color}"/>
            </svg>`;
    }

    function renderJournalSummary() {
        const el = $('journalSummary');
        if (!el) return;
        renderEquity();
        el.hidden = view !== 'journal';
        if (view !== 'journal') return;
        let pnl = 0, wins = 0, losses = 0, winSum = 0, lossSum = 0, r = 0, rCount = 0;
        for (const t of trades) {
            if (t.archived) continue;
            const s = E.deriveStatus(t);
            if (s !== 'closed' && s !== 'stopped') continue;
            const p = E.getRealizedPnL(t);
            const rr = E.getRealizedR(t);
            if (p === null) continue;
            pnl += p;
            if (rr !== null) { r += rr; rCount++; }
            if (p > 0) { wins++; winSum += p; }
            else if (p < 0) { losses++; lossSum += p; }
        }
        const decided = wins + losses;
        $('jsPnl').textContent = E.fmtMoney(round2(pnl), true);
        $('jsPnl').dataset.sign = pnl > 0 ? 'up' : pnl < 0 ? 'down' : '';
        $('jsWinRate').textContent = decided ? Math.round((wins / decided) * 100) + '%' : '—';
        $('jsRecord').textContent = `${wins}W / ${losses}L`;
        $('jsAvgWin').textContent = wins ? E.fmtMoney(round2(winSum / wins), true) : '—';
        $('jsAvgWin').dataset.sign = wins ? 'up' : '';
        $('jsAvgLoss').textContent = losses ? E.fmtMoney(round2(lossSum / losses), true) : '—';
        $('jsAvgLoss').dataset.sign = losses ? 'down' : '';
        $('jsR').textContent = rCount ? E.fmtR(round2(r)) : '—';
        $('jsR').dataset.sign = r > 0 ? 'up' : r < 0 ? 'down' : '';
        $('jsAvgR').textContent = rCount ? E.fmtR(round2(r / rCount)) : '—';
        $('jsAvgR').dataset.sign = rCount ? ((r / rCount) > 0 ? 'up' : (r / rCount) < 0 ? 'down' : '') : '';
    }

    function setView(name, { syncHash = true, instant = false, fromSegment = false } = {}) {
        if (!VIEWS.includes(name)) name = 'positions';
        if (name === view && viewReady) return;

        const animate = viewReady && !instant && !M.reduceMotion;
        if (view === 'positions' || view === 'journal') viewFilters[view] = filters.status;
        view = name;
        document.body.dataset.view = view;
        if (syncHash) {
            const next = '#' + view;
            if (location.hash !== next) history.replaceState(null, '', next);
        }
        /* Segment click already springs the pill — don't snap it. */
        if (!fromSegment) segs.view?.set(view, instant || !viewReady);
        if ($('journalSummary')) $('journalSummary').hidden = view !== 'journal';
        if ($('compoundView')) $('compoundView').hidden = view !== 'compound';
        if ($('themesView')) $('themesView').hidden = view !== 'themes';
        if ($('journalSeg')) $('journalSeg').hidden = view !== 'journal';
        if ($('statusSeg')) $('statusSeg').hidden = view !== 'positions';
        if (view === 'positions') {
            filters.status = viewFilters.positions || 'active';
            filters.page = 1;
            segs.status?.set(filters.status, true);
        } else if (view === 'journal') {
            filters.status = viewFilters.journal || 'all';
            filters.page = 1;
            segs.journal?.set(filters.status, true);
        } else if (view === 'compound') {
            COMPOUND.syncAccount(account);
            COMPOUND.render();
        } else if (view === 'themes') {
            window.scrollTo(0, 0);
            GUIDE.render();
        }
        if ($('fbCalc')) $('fbCalc').textContent = view === 'positions' ? 'Calculator' : 'Positions';
        renderJournalSummary();
        renderTable();
        document.body.offsetHeight;
        refreshFilterSegs();
        if (view !== 'compound' && view !== 'themes' && prefs.metricsOpen !== false) {
            const wrap = $('metricsRowWrap');
            if (wrap) wrap.style.height = 'auto';
            requestAnimationFrame(() => segs.scope?.refresh());
        }
        if (animate) {
            const incoming = view === 'compound' ? $('compoundView') : $('trackerMount');
            M.rowEnter(incoming);
        }
        viewReady = true;
    }

    /* ============================================================
       TABLE
       ============================================================ */
    function badgeState(t) {
        const s = E.deriveStatus(t);
        if ((s === 'open' || s === 'partial') && E.isFreeRolled(t)) return 'freerolled';
        return s;
    }
    function matchesFilter(t, status = filters.status) {
        const s = E.deriveStatus(t);
        const b = badgeState(t);
        switch (status) {
            case 'active': return s === 'open' || s === 'partial' || s === 'freerolled';
            case 'open': return (s === 'open' || s === 'freerolled') && b !== 'freerolled' ? s === 'open' : s === 'open' && b === 'open';
            case 'freerolled': return b === 'freerolled';
            case 'partial': return s === 'partial';
            case 'closed': return s === 'closed';
            case 'stopped': return s === 'stopped';
            case 'archived': return s === 'archived';
            case 'all': return true;
            case 'winners': return E.getRealizedPnL(t) > 0;
            case 'losers': return E.getRealizedPnL(t) < 0;
            default: return true;
        }
    }
    /* Every data point the row can show should be reachable by typing, not just
       the ticker — that's the whole point of a search box on a table like this. */
    function searchHaystack(t) {
        const parts = [
            t.ticker, E.directionOf(t), E.statusLabel(badgeState(t)),
            t.entryDate, t.notes, t.setup, t.tags,
            t.entryPrice, E.currentStop(t), t.initialSL,
        ];
        const na = nextAction(t);
        if (na && na.label) parts.push(na.label);
        if (Array.isArray(t.exits)) for (const x of t.exits) parts.push(x.price, x.shares, x.note);
        if (t.sellPlan?.targets) for (const x of t.sellPlan.targets) parts.push(x.rLevel, x.price, x.note);
        return parts.filter(v => v !== null && v !== undefined && v !== '')
            .map(v => String(v).toLowerCase()).join(' ');
    }
    /* Every term must appear somewhere in the row, in any order. */
    function matchesQuery(t) {
        if (!filters.q) return true;
        const hay = searchHaystack(t);
        return filters.q.split(/\s+/).every(term => hay.includes(term));
    }

    /* null/undefined always sink to the bottom regardless of direction, so an
       unfilled column never buries the rows that do have values. */
    const STATUS_ORDER = ['open', 'partial', 'freerolled', 'closed', 'stopped', 'archived'];
    const SORT_KEYS = {
        ticker:   t => (t.ticker || '').toLowerCase(),
        entry:    t => E.isNum(t.entryPrice) ? t.entryPrice : null,
        stop:     t => { const v = E.currentStop(t); return E.isNum(v) ? v : null; },
        realized: t => E.getRealizedPnL(t),
        r:        t => E.getRealizedR(t),
        status:   t => STATUS_ORDER.indexOf(badgeState(t)),
    };
    const entryTime = t => { const d = Date.parse(t.entryDate); return Number.isNaN(d) ? 0 : d; };

    function sortTrades(list) {
        const get = SORT_KEYS[filters.sortKey];
        /* No explicit key = the order you actually think in: newest entry first. */
        if (!get) return list.sort((a, b) => entryTime(b) - entryTime(a));
        const sign = filters.sortDir === 'asc' ? 1 : -1;
        return list.sort((a, b) => {
            const av = get(a), bv = get(b);
            const aNull = av === null || av === undefined;
            const bNull = bv === null || bv === undefined;
            if (aNull && bNull) return entryTime(b) - entryTime(a);
            if (aNull) return 1;
            if (bNull) return -1;
            if (av < bv) return -sign;
            if (av > bv) return sign;
            return entryTime(b) - entryTime(a);
        });
    }

    function visibleTrades() {
        const kept = trades.filter(t => {
            if (filters.status !== 'archived' && t.archived) return false;
            if (!matchesFilter(t)) return false;
            if (filters.from && t.entryDate && t.entryDate < filters.from) return false;
            if (filters.to && t.entryDate && t.entryDate > filters.to) return false;
            if (!matchesQuery(t)) return false;
            return true;
        });
        return sortTrades(kept);
    }

    function nextAction(t) {
        const s = E.deriveStatus(t);
        if (s === 'closed' || s === 'stopped' || s === 'archived') return null;
        const pend = E.pendingTargets(t);
        if (pend.length) {
            const p = pend[0];
            if (p.isStopRaise) return { type: 'raise', label: `Stop → ${E.fmtMoney(p.newStop)}`, target: p };
            const rem = E.getRemainingShares(t);
            const n = rem === null ? p.shares : Math.min(p.shares ?? rem, rem);
            const verb = E.directionOf(t) === 'short' ? 'Cover' : 'Sell';
            return { type: 'exit', label: `${verb} ${E.fmtShares(n)} @ ${E.fmtMoney(p.price)}`, target: p, shares: n };
        }
        if (E.isFreeRolled(t)) {
            const rem = E.getRemainingShares(t);
            const sub = rem ? `${fmtShareCount(rem)} · $0 at risk` : '$0 at risk';
            return { type: 'runner', label: 'Let it run', sub };
        }
        return { type: 'trim' };
    }

    const STATUS_NOUN = {
        active: 'active', open: 'open', freerolled: 'freerolled', partial: 'partial',
        closed: 'closed', stopped: 'stopped', archived: 'archived',
        winners: 'winners', losers: 'losers',
    };

    function emptyTitleForStatus(status) {
        return {
            active: 'No active trades',
            open: 'No open trades',
            freerolled: 'No freerolled trades',
            partial: 'No partial trades',
            closed: 'No closed trades',
            stopped: 'No stopped trades',
            archived: 'No archived trades',
            winners: 'No winning trades',
            losers: 'No losing trades',
            all: 'Nothing to show',
        }[status] || 'No trades';
    }

    function emptySubForStatus(status) {
        return {
            active: 'Active is open, freerolled, and partial. Nothing is live right now.',
            open: 'No positions sitting at the original stop.',
            freerolled: 'No trades with the stop at or beyond entry.',
            partial: 'No trades with a trim already on.',
            closed: 'No trades closed at a profit or scratch.',
            stopped: 'No trades stopped out.',
            archived: 'Archived trades live here after you put them away.',
            winners: 'No closed trades in the green.',
            losers: 'No closed trades in the red.',
            all: 'Archived trades stay under Archived.',
        }[status] || 'Nothing in this filter right now.';
    }

    function hiddenBucket() {
        const keys = view === 'journal'
            ? ['closed', 'winners', 'losers', 'open', 'archived']
            : ['active', 'open', 'freerolled', 'partial', 'closed', 'stopped', 'archived'];
        let best = null;
        for (const key of keys) {
            if (key === filters.status) continue;
            let n = 0;
            for (const t of trades) {
                if (key !== 'archived' && t.archived) continue;
                if (matchesFilter(t, key)) n++;
            }
            if (n && (!best || n > best.n)) best = { key, n };
        }
        return best;
    }

    function fillEmptyState() {
        const title = document.querySelector('#emptyState .empty-title');
        const sub = document.querySelector('#emptyState .empty-sub');
        const cta = $('emptyCta');
        const alt = $('emptyAlt');
        const seed = $('seedDemo');
        if (!title || !sub || !cta || !alt || !seed) return;

        const bookEmpty = trades.length === 0;
        const q = $('tradeSearch')?.value.trim() || '';

        const setCta = (action, label) => {
            cta.hidden = false;
            cta.dataset.action = action;
            cta.textContent = label;
        };
        const setAlt = (action, label) => {
            if (!action) { alt.hidden = true; alt.dataset.action = ''; alt.textContent = ''; return; }
            alt.hidden = false;
            alt.dataset.action = action;
            alt.textContent = label;
        };

        seed.hidden = !(bookEmpty && view !== 'journal');

        if (bookEmpty && view === 'journal') {
            title.textContent = 'No journal yet';
            sub.textContent = 'Closed trades land here. Size and log from Positions.';
            setCta('goto-positions', 'Go to Positions');
            setAlt();
            return;
        }
        if (bookEmpty) {
            title.textContent = 'No trades yet';
            sub.textContent = 'Size a position in the calculator, then log it — one click.';
            setCta('log', 'Log a trade');
            setAlt();
            return;
        }
        if (filters.q) {
            title.textContent = `No trades match “${q}”`;
            sub.textContent = 'Try a different ticker, or clear the search.';
            setCta('clear-search', 'Clear search');
            setAlt();
            return;
        }
        if (filters.from || filters.to) {
            title.textContent = 'No trades in this range';
            sub.textContent = 'Nothing logged between From and To.';
            setCta('clear-dates', 'Clear dates');
            setAlt();
            return;
        }

        title.textContent = emptyTitleForStatus(filters.status);
        sub.textContent = emptySubForStatus(filters.status);
        if (view === 'journal') setCta('goto-positions', 'Go to Positions');
        else setCta('log', 'Log a trade');
        const bucket = hiddenBucket();
        const noun = bucket && STATUS_NOUN[bucket.key];
        if (bucket && noun) setAlt(`set-status:${bucket.key}`, `View ${bucket.n} ${noun}`);
        else setAlt();
    }

    function focusCalculator() {
        if (view !== 'positions') setView('positions');
        if (!panels.calcSection.section.classList.contains('is-open')) {
            prefs.calcOpen = true;
            panels.calcSection.set(true);
            savePrefs();
        }
        const field = $('tickerInput');
        field.scrollIntoView({ behavior: M.reduceMotion ? 'auto' : 'smooth', block: 'center' });
        setTimeout(() => field.focus(), M.reduceMotion ? 0 : 350);
    }

    function applyEmptyAction(action) {
        if (!action) return;
        if (action === 'log') return focusCalculator();
        if (action === 'goto-positions') return setView('positions');
        if (action === 'clear-search') {
            $('searchClear')?.click();
            return;
        }
        if (action === 'clear-dates') {
            $('dateClear')?.click();
            return;
        }
        if (action.startsWith('set-status:')) {
            const status = action.slice('set-status:'.length);
            filters.status = status;
            filters.page = 1;
            if (view === 'journal') {
                viewFilters.journal = status;
                segs.journal?.set(status);
            } else {
                viewFilters.positions = status;
                segs.status?.set(status);
            }
            renderTable();
        }
    }

    function renderTable() {
        const tbody = $('tradesBody');
        const vis = visibleTrades();
        const pages = Math.max(1, Math.ceil(vis.length / PAGE_SIZE));
        filters.page = Math.min(filters.page, pages);
        const pageItems = vis.slice((filters.page - 1) * PAGE_SIZE, filters.page * PAGE_SIZE);

        tbody.textContent = '';
        const isEmpty = !vis.length;
        $('emptyState').hidden = !isEmpty;
        document.querySelector('.table-scroll').style.display = isEmpty ? 'none' : '';
        if (isEmpty) fillEmptyState();

        for (const t of pageItems) {
            tbody.appendChild(buildRow(t));
            if (t.id === expandedId) tbody.appendChild(buildRail(t, false));
        }

        const count = $('footerTotals');
        const isClosedView = ['closed', 'stopped', 'winners', 'losers', 'all'].includes(filters.status);
        count.hidden = !vis.length;
        if (vis.length) {
            if (view === 'journal') {
                /* the journal summary cards already carry W/L, R, and P&L */
                count.innerHTML = `<span class="f-val">${vis.length}</span> trade${vis.length === 1 ? '' : 's'}`;
            } else if (isClosedView) {
                let w = 0, l = 0, r = 0, pnl = 0;
                for (const t of vis) {
                    const p = E.getRealizedPnL(t), rr = E.getRealizedR(t);
                    if (p !== null) { pnl += p; if (p > 0) w++; else if (p < 0) l++; }
                    if (rr !== null) r += rr;
                }
                const sep = '<span class="f-sep">·</span>';
                count.innerHTML = [
                    `<span class="f-val">${vis.length}</span> closed`,
                    `<span class="f-val">${w}W/${l}L</span>`,
                    `<span class="f-val">${E.fmtR(r)}</span>`,
                    `<span class="f-val">${E.fmtMoney(round2(pnl), true)}</span>`,
                ].join(sep);
            } else {
                count.innerHTML = `<span class="f-val">${vis.length}</span> position${vis.length === 1 ? '' : 's'}`;
            }
        } else {
            count.innerHTML = '';
        }
        $('pager').hidden = pages <= 1;
        $('tableFooter').hidden = pages <= 1;
        if (pages > 1) {
            $('pageInfo').textContent = `${filters.page} / ${pages}`;
            $('pagePrev').disabled = filters.page <= 1;
            $('pageNext').disabled = filters.page >= pages;
        }
    }
    $('pagePrev').addEventListener('click', () => { filters.page--; renderTable(); });
    $('pageNext').addEventListener('click', () => { filters.page++; renderTable(); });
    $('emptyCta')?.addEventListener('click', () => applyEmptyAction($('emptyCta').dataset.action));
    $('emptyAlt')?.addEventListener('click', () => applyEmptyAction($('emptyAlt').dataset.action));

    /* ---------- search ---------- */
    (function initSearch() {
        const input = $('tradeSearch'), clear = $('searchClear');
        if (!input) return;
        const apply = () => {
            filters.q = input.value.trim().toLowerCase();
            filters.page = 1;
            clear.hidden = !input.value;
            renderTable();
        };
        input.addEventListener('input', apply);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && input.value) { e.stopPropagation(); input.value = ''; apply(); }
        });
        clear.addEventListener('click', () => { input.value = ''; apply(); input.focus(); });
        /* "/" focuses search, the way every table you already use behaves */
        document.addEventListener('keydown', (e) => {
            if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
            const el = document.activeElement;
            if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
            if (!['positions', 'journal'].includes(document.body.dataset.view)) return;
            e.preventDefault();
            input.focus();
            input.select();
        });
    })();

    /* ---------- click-to-sort ----------
       Tri-state: desc → asc → off. "Off" is not arbitrary order — it returns to
       entry date, newest first, which is the sort the table has no column for
       (the date lives inside the ticker cell). */
    (function initSort() {
        const head = document.querySelector('#tradesTable thead');
        if (!head) return;
        head.addEventListener('click', (e) => {
            const btn = e.target.closest('button.th-sort');
            if (!btn) return;
            const key = btn.dataset.sort;
            if (filters.sortKey !== key) { filters.sortKey = key; filters.sortDir = 'desc'; }
            else if (filters.sortDir === 'desc') { filters.sortDir = 'asc'; }
            else { filters.sortKey = ''; filters.sortDir = 'desc'; }
            filters.page = 1;
            syncSortHeads();
            renderTable();
        });
    })();
    function syncSortHeads() {
        document.querySelectorAll('#tradesTable thead th').forEach(th => {
            const btn = th.querySelector('button.th-sort');
            if (!btn) return;
            if (btn.dataset.sort === filters.sortKey && filters.sortKey) {
                th.setAttribute('aria-sort', filters.sortDir === 'asc' ? 'ascending' : 'descending');
            } else {
                th.removeAttribute('aria-sort');
            }
        });
    }

    function iconBtn(label, iconName, cls = '') {
        return `<button class="icon-btn ${cls}" data-act="${label.toLowerCase().replace(/\s/g, '-')}" aria-label="${label}" data-tip="${label}">${ICONS[iconName]}</button>`;
    }

    function buildRow(t) {
        const tr = document.createElement('tr');
        tr.className = 'trade-row';
        tr.dataset.id = t.id;
        const orig = E.getOriginalShares(t);
        const pnl = E.getRealizedPnL(t);
        const r = E.getRealizedR(t);
        const b = badgeState(t);
        const stop = E.currentStop(t);
        const na = nextAction(t);

        const direction = E.directionOf(t);
        const subParts = [
            `<span class="direction-tag" data-direction="${direction}">${direction}</span>`,
            `<span class="cell-date">${E.fmtDateShort(t.entryDate)}</span>`,
        ];
        const sub = subParts.join('<span class="cell-dot" aria-hidden="true">·</span>');
        const entryHtml = E.fmtMoney(t.entryPrice)
            + (orig !== null ? `<span class="cell-entry-qty">${fmtShareCount(orig)}</span>` : '');
        const EM = '<span class="cell-empty">—</span>';
        const stopHtml = stop === null ? EM
            : E.fmtMoney(stop) + (E.isNum(t.initialSL) && stop !== t.initialSL ? `<span class="cell-stop-initial" title="Initial stop">${E.fmtMoney(t.initialSL)}</span>` : '');
        const pnlCls = pnl === null ? 'pnl-flat' : pnl > 0 ? 'pnl-gain' : pnl < 0 ? 'pnl-loss' : 'pnl-flat';
        const hasExits = Array.isArray(t.exits) && t.exits.length > 0;
        const pnlHtml = (pnl === null || (pnl === 0 && !hasExits)) ? EM : E.fmtMoney(pnl, true);
        const rHtml = hasExits ? E.fmtR(r) : EM;

        let nextHtml = '';
        if (na) {
            if (na.type === 'runner') {
                const rem = E.getRemainingShares(t);
                const zero = '<span class="next-runner-zero">$0 at risk</span>';
                const sub = rem ? `${fmtShareCount(rem)} · ${zero}` : zero;
                nextHtml = `<span class="next-runner" title="Stop covers the remaining shares — nothing left at risk. Trim anytime with ⋯" aria-label="${E.escapeHtml(na.label)} — ${E.escapeHtml(na.sub)}"><span class="shield">${ICONS['shield-check']}</span><span class="next-runner-copy"><span class="next-runner-label">${na.label}</span><span class="next-runner-sub">${sub}</span></span></span>`;
            }
            else if (na.type === 'trim') nextHtml = `<button class="next-chip" data-act="trim">Trim…</button>`;
            else {
                const tip = na.type === 'raise' ? 'Move the stop'
                    : E.directionOf(t) === 'short' ? 'Log this cover' : 'Log this sell';
                nextHtml = `<button class="next-chip" data-act="chip" data-tip="${tip}" aria-label="${tip}: ${E.escapeHtml(na.label)}">${na.label}</button>`;
            }
        }
        const moreBtn = (na && E.deriveStatus(t) !== 'archived') ? `<button class="next-more" data-act="trim" aria-label="Open trim or exit for ${E.escapeHtml(t.ticker)}" data-tip="Open trim / exit">⋯</button>` : '';

        const dots = (t.sellPlan?.enabled && Array.isArray(t.sellPlan.targets) && t.sellPlan.targets.length)
            ? `<span class="plan-dots">${t.sellPlan.targets.filter(x => x.rLevel !== 'exit').map(x => `<span class="plan-dot ${x.status === 'executed' ? 'done' : ''}"></span>`).join('')}</span>`
            : '';

        tr.innerHTML = `
            <td class="cell-ticker"><b>${E.escapeHtml(t.ticker)}</b><span class="cell-sub">${sub}</span></td>
            <td class="num" data-k="Entry">${entryHtml}</td>
            <td class="num" data-k="Stop">${stopHtml}</td>
            <td class="num cell-group ${pnlCls}" data-k="Realized">${pnlHtml}</td>
            <td class="num cell-r ${pnlCls}" data-k="R">${rHtml}</td>
            <td class="cell-next"><span class="next-cell">${nextHtml}${moreBtn}</span></td>
            <td class="cell-status"><span class="status-badge" data-s="${b}">${b === 'freerolled' ? `<span class="shield">${ICONS['shield-check']}</span>` : ''}${E.statusLabel(b)}</span>${dots}</td>
            <td class="cell-actions"><span class="row-actions">
                ${iconBtn('Add to position', 'plus')}
                ${iconBtn('Edit', 'pencil')}
                ${t.archived ? iconBtn('Unarchive', 'archive-restore') : iconBtn('Archive', 'archive')}
                ${iconBtn('Delete', 'trash', 'danger')}
            </span></td>`;

        tr.addEventListener('click', (e) => {
            const act = e.target.closest('[data-act]');
            if (act) {
                e.stopPropagation();
                handleRowAction(t.id, act.dataset.act);
                return;
            }
            if (e.target.closest('a')) return;
            toggleRail(t.id);
        });
        return tr;
    }

    function handleRowAction(id, act) {
        switch (act) {
            case 'chip': executeChip(id); break;
            case 'trim': openTrimModal(id); break;
            case 'add-to-position': openAddToModal(id); break;
            case 'edit': openEditForm(id); break;
            case 'archive': setArchived(id, true); break;
            case 'unarchive': setArchived(id, false); break;
            case 'delete': deleteTrade(id); break;
        }
    }

    /* ---------- expandable position rail ---------- */
    function toggleRail(id) {
        expandedId = expandedId === id ? null : id;
        renderTable();
        if (expandedId) {
            const rail = document.querySelector('tr.rail-row .rail-wrap');
            if (rail && !M.reduceMotion) {
                const h = rail.scrollHeight;
                rail.animate(
                    [{ height: '0px', opacity: 0, filter: 'blur(4px)' }, { height: h + 'px', opacity: 1, filter: 'blur(0)' }],
                    { duration: 300, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
            }
        }
    }

    function formatJournalTimestamp(value, { full = false } = {}) {
        const date = new Date(value);
        if (!Number.isFinite(date.getTime())) return 'Timestamp unavailable';
        if (full) {
            return new Intl.DateTimeFormat(undefined, {
                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
                hour: 'numeric', minute: '2-digit', second: '2-digit', timeZoneName: 'short',
            }).format(date);
        }
        const day = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
        const time = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date);
        const zone = new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' }).formatToParts(date)
            .find(part => part.type === 'timeZoneName')?.value || '';
        return `${day} · ${time}${zone ? ` ${zone}` : ''}`;
    }

    function journalMarkup(t) {
        const journal = E.normalizeJournal(t);
        const defaultKind = journal.some(entry => entry.kind === 'thesis') ? 'update' : 'thesis';
        const entries = [...journal].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        const kindButtons = Object.entries(JOURNAL_KINDS).filter(([kind]) => kind !== 'note').map(([kind, meta]) => `
            <button type="button" class="journal-kind-btn${kind === defaultKind ? ' is-active' : ''}" data-journal-kind="${kind}"
                role="radio" aria-checked="${kind === defaultKind}" aria-label="${meta.label} tag">${ICONS[meta.icon]}<span>${journalKindTagMarkup(kind)}</span></button>`).join('');
        const entryList = entries.length ? entries.map(entry => {
            const meta = JOURNAL_KINDS[entry.kind] || JOURNAL_KINDS.update;
            const text = E.escapeHtml(entry.text).replace(/\n/g, '<br>');
            const edited = entry.updatedAt && entry.updatedAt !== entry.createdAt
                ? `<span class="journal-edited" title="Updated ${E.escapeHtml(formatJournalTimestamp(entry.updatedAt, { full: true }))}">edited</span>` : '';
            return `<article class="journal-entry" data-journal-id="${E.escapeHtml(entry.id)}" data-kind="${entry.kind}">
                <span class="journal-entry-icon" aria-hidden="true">${ICONS[meta.icon]}</span>
                <div class="journal-entry-main">
                    <div class="journal-entry-head">
                        <span class="journal-entry-type">${journalKindTagMarkup(entry.kind)}</span>
                        <time datetime="${E.escapeHtml(entry.createdAt)}" title="${E.escapeHtml(formatJournalTimestamp(entry.createdAt, { full: true }))}">${formatJournalTimestamp(entry.createdAt)}</time>
                        ${edited}
                        <span class="journal-entry-actions">
                            <button type="button" class="icon-btn" data-journal-action="edit" data-tip="Edit" aria-label="Edit ${meta.label.toLowerCase()} entry">${ICONS.pencil}</button>
                            <button type="button" class="icon-btn danger" data-journal-action="delete" data-tip="Delete" aria-label="Delete ${meta.label.toLowerCase()} entry">${ICONS.trash}</button>
                        </span>
                    </div>
                    <p class="journal-entry-copy">${text}</p>
                    <div class="journal-entry-editor" hidden>
                        <textarea maxlength="2000" aria-label="Edit journal entry">${E.escapeHtml(entry.text)}</textarea>
                        <div class="journal-edit-actions">
                            <button type="button" class="btn btn-ghost btn-sm" data-journal-action="cancel-edit">Cancel</button>
                            <button type="button" class="btn btn-primary btn-sm" data-journal-action="save-edit">Save changes</button>
                        </div>
                    </div>
                </div>
            </article>`;
        }).join('') : `<div class="journal-empty">
            <span class="journal-empty-ic ic-draw" aria-hidden="true">${ICONS['notebook-pen']}</span>
            <strong>No journal entries yet</strong>
            <p>Write the setup and what would invalidate it.</p>
        </div>`;

        return `<div class="rail-journal" data-default-kind="${defaultKind}">
            <div class="journal-title-row">
                <div><div class="rail-title">Trade journal</div><span>Timestamped decisions, not a scratchpad.</span></div>
                <span class="journal-count">${journal.length} ${journal.length === 1 ? 'entry' : 'entries'}</span>
            </div>
            <div class="journal-composer">
                <div class="journal-kind-picker" role="radiogroup" aria-label="Journal entry tag">${kindButtons}</div>
                <textarea class="journal-compose-input" maxlength="2000" placeholder="${JOURNAL_KINDS[defaultKind].prompt}" aria-label="New journal entry"></textarea>
                <div class="journal-compose-footer">
                    <span class="journal-timestamp-hint">${ICONS.clock}<span>Timestamped when added</span></span>
                    <button type="button" class="btn btn-primary btn-sm journal-add" disabled>${ICONS.plus}<span>Add entry</span></button>
                </div>
            </div>
            <div class="journal-list">${entryList}</div>
        </div>`;
    }

    function wireJournal(td, tradeId) {
        const journal = td.querySelector('.rail-journal');
        if (!journal) return;
        const compose = journal.querySelector('.journal-compose-input');
        const add = journal.querySelector('.journal-add');
        let selectedKind = journal.dataset.defaultKind || 'update';

        const syncAdd = () => { add.disabled = !compose.value.trim(); };
        compose.addEventListener('input', syncAdd);
        compose.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !add.disabled) {
                event.preventDefault();
                add.click();
            }
        });
        journal.querySelectorAll('[data-journal-kind]').forEach(button => button.addEventListener('click', () => {
            selectedKind = button.dataset.journalKind;
            journal.querySelectorAll('[data-journal-kind]').forEach(item => {
                const active = item === button;
                item.classList.toggle('is-active', active);
                item.setAttribute('aria-checked', String(active));
            });
            compose.placeholder = JOURNAL_KINDS[selectedKind].prompt;
            compose.focus();
        }));
        add.addEventListener('click', () => {
            const text = compose.value.trim();
            if (!text) return;
            const entry = { id: uid(), kind: selectedKind, text, createdAt: new Date().toISOString(), updatedAt: null };
            const trade = trades.find(item => item.id === tradeId);
            mutateTrade(tradeId, (target) => {
                target.journal = E.normalizeJournal(target);
                target.notes = '';
                target.journal.push(entry);
            }, `<b>${E.escapeHtml(trade?.ticker || 'Trade')}</b> journal entry added`, { flashRow: false });
            requestAnimationFrame(() => {
                const added = document.querySelector(`.journal-entry[data-journal-id="${entry.id}"]`);
                if (added) M.rowEnter(added);
            });
        });

        journal.addEventListener('click', (event) => {
            const button = event.target.closest('[data-journal-action]');
            if (!button) return;
            const article = button.closest('.journal-entry');
            const entryId = article?.dataset.journalId;
            if (!entryId) return;
            const action = button.dataset.journalAction;
            const copy = article.querySelector('.journal-entry-copy');
            const editor = article.querySelector('.journal-entry-editor');
            const actions = article.querySelector('.journal-entry-actions');
            const input = editor.querySelector('textarea');

            if (action === 'edit') {
                copy.hidden = true;
                actions.hidden = true;
                editor.hidden = false;
                article.classList.add('is-editing');
                input.focus();
                input.setSelectionRange(input.value.length, input.value.length);
            } else if (action === 'cancel-edit') {
                const trade = trades.find(item => item.id === tradeId);
                const entry = trade?.journal?.find(item => item.id === entryId);
                input.value = entry?.text || '';
                copy.hidden = false;
                actions.hidden = false;
                editor.hidden = true;
                article.classList.remove('is-editing');
            } else if (action === 'save-edit') {
                const text = input.value.trim();
                if (!text) { input.focus(); return; }
                const trade = trades.find(item => item.id === tradeId);
                mutateTrade(tradeId, (target) => {
                    const entry = target.journal.find(item => item.id === entryId);
                    if (entry) { entry.text = text; entry.updatedAt = new Date().toISOString(); }
                }, `<b>${E.escapeHtml(trade?.ticker || 'Trade')}</b> journal entry updated`, { flashRow: false });
            } else if (action === 'delete') {
                const trade = trades.find(item => item.id === tradeId);
                const from = trade?.ticker ? ` from ${trade.ticker}` : '';
                confirmModal('Delete journal entry', `This removes the timestamped entry${from}.`, 'Delete entry', () => {
                    mutateTrade(tradeId, (target) => {
                        target.journal = target.journal.filter(item => item.id !== entryId);
                    }, `<b>${E.escapeHtml(trade?.ticker || 'Trade')}</b> journal entry deleted`, { flashRow: false });
                });
            }
        });
    }

    function buildRail(t) {
        const tr = document.createElement('tr');
        tr.className = 'rail-row';
        const td = document.createElement('td');
        td.colSpan = 8;
        const rps = E.tradeRiskPerShare(t);
        const rem = E.getRemainingShares(t);
        const pnl = E.getRealizedPnL(t);
        const risk = E.getOpenRiskDollars(t);
        const direction = E.directionOf(t);
        const exitPast = direction === 'short' ? 'Covered' : 'Sold';
        const exitVerb = direction === 'short' ? 'cover' : 'sell';

        const events = [];
        events.push({ kind: 'entry', l1: `<b>${direction === 'short' ? 'Short entry' : 'Long entry'}</b> — ${E.getOriginalShares(t) !== null ? fmtShareCount(E.getOriginalShares(t)) + ' @ ' : ''}${E.fmtPrice(t.entryPrice)}`, l2: `${E.fmtDateShort(t.entryDate)} · stop ${E.fmtPrice(t.initialSL)}${rps !== null ? ' · risk / share $' + rps.toFixed(2) : ''}` });
        for (const x of (t.exits || [])) {
            const kind = x.kind === 'stop' ? 'stop' : 'trim';
            events.push({ kind, l1: `<b>${x.kind === 'stop' ? 'Stopped' : exitPast}</b> ${fmtShareCount(x.shares)} @ ${E.fmtPrice(x.price)}`, l2: `${E.fmtDateShort(x.date)}${E.isNum(x.rMultiple) ? ' · ' + E.fmtR(x.rMultiple) : ''}${x.estimated ? ' · est.' : ''}` });
        }
        const stop = E.currentStop(t);
        if (E.isNum(stop) && E.isNum(t.initialSL) && stop !== t.initialSL && rem !== 0) {
            events.push({ kind: 'stopmove', l1: `<b>Stop moved</b> to ${E.fmtPrice(stop)}`, l2: E.directionalMove(t.entryPrice, stop, t) >= 0 ? 'at/beyond entry — freeroll' : `from ${E.fmtPrice(t.initialSL)}` });
        }
        for (const p of E.pendingTargets(t)) {
            events.push({ kind: 'pending', l1: p.isStopRaise ? `Pending — stop → ${E.fmtPrice(p.newStop)} at ${E.fmtPrice(p.price)}` : `Pending — ${exitVerb} ${fmtShareCount(p.shares)} @ ${E.fmtPrice(p.price)}`, l2: 'plan target' });
        }

        /* stat strip (mockup A): numbers lead the rail; open risk carries a
           tone — hot while money is exposed, safe once freerolled */
        const status = E.deriveStatus(t);
        const doneish = status === 'closed' || status === 'stopped' || status === 'archived';
        const orig = E.getOriginalShares(t);
        const freerolled = risk === 0 && rem !== null && rem > 0;
        const riskPctAcct = risk !== null && account > 0 ? (risk / account) * 100 : null;
        const hasExits = Array.isArray(t.exits) && t.exits.length > 0;
        const rr = E.getRealizedR(t);
        const cards = [
            {
                k: 'Open risk',
                v: risk === null ? '—' : E.fmtMoney(risk),
                sub: freerolled ? 'freerolled' : doneish ? 'position closed'
                    : riskPctAcct !== null && risk > 0 ? `${riskPctAcct.toFixed(riskPctAcct < 1 ? 2 : 1)}% of account` : '',
                tone: freerolled ? 'safe' : risk > 0 ? 'hot' : '',
            },
            {
                k: 'Remaining',
                v: rem === null ? '—' : E.fmtShares(rem),
                sub: orig !== null ? `of ${E.fmtShares(orig)} shares` : 'size unknown',
            },
            {
                k: 'Realized',
                v: pnl === null ? '—' : E.fmtMoney(pnl, pnl !== 0),
                sub: hasExits ? (rr !== null ? E.fmtR(rr) : '') : 'no exits yet',
                tone: pnl > 0 ? 'up' : pnl < 0 ? 'down' : '',
            },
        ];
        if (rps !== null) cards.push({ k: 'Risk / share', v: '$' + rps.toFixed(2), sub: 'entry − stop' });
        if (E.isNum(stop) && E.isNum(t.entryPrice) && t.entryPrice > 0) {
            cards.push({
                k: 'Stop distance',
                v: ((Math.abs(t.entryPrice - stop) / t.entryPrice) * 100).toFixed(1) + '%',
                sub: `stop ${E.fmtPrice(stop)}`,
            });
        }
        const stripHtml = cards.map(cd => `
            <div class="rail-stat-card"${cd.tone ? ` data-tone="${cd.tone}"` : ''}>
                <span class="rsc-k">${cd.k}</span>
                <span class="rsc-v">${cd.v}</span>
                <span class="rsc-s">${cd.sub || ''}</span>
            </div>`).join('');

        td.innerHTML = `<div class="rail-wrap"><div class="rail">
            <div class="rail-statstrip">${stripHtml}</div>
            <div class="rail-lanes">
                <div>
                    <div class="rail-title">Position</div>
                    <div class="rail-events">${events.map(ev => `
                        <div class="rail-event kind-${ev.kind}"><span class="rail-marker">${ev.kind === 'pending' ? ICONS['circle-dashed'] : ''}</span>
                        <span><span class="rail-line1">${ev.l1}</span><span class="rail-line2"> ${ev.l2}</span></span></div>`).join('')}
                    </div>
                    <div class="rail-actions">${doneish ? '' : `
                        <button class="btn btn-primary btn-sm" data-act="trim">Trim / Exit</button>
                        <button class="btn btn-ghost btn-sm" data-act="add-to-position">Add to position</button>`}
                        <button class="btn btn-ghost btn-sm" data-act="edit">Edit</button>
                    </div>
                </div>
                <div class="rail-side">
                    ${journalMarkup(t)}
                </div>
            </div>
        </div></div>`;

        td.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', (e) => {
            e.stopPropagation();
            handleRowAction(t.id, b.dataset.act);
        }));
        wireJournal(td, t.id);
        tr.appendChild(td);
        return tr;
    }

    /* ---------- trade mutation with undo ---------- */
    function mutateTrade(id, fn, msg, { flashRow = true } = {}) {
        const idx = trades.findIndex(t => t.id === id);
        if (idx < 0) return;
        const before = deepClone(trades[idx]);
        const wasFreerolled = E.isFreeRolled(trades[idx]);
        fn(trades[idx]);
        trades[idx].updatedAt = new Date().toISOString();
        saveTrades();
        renderAll();
        const nowFreerolled = E.isFreeRolled(trades[idx]);
        const flipped = !wasFreerolled && nowFreerolled;
        if (flashRow) {
            const row = document.querySelector(`tr[data-id="${id}"]`);
            if (row) {
                M.flash(row, 'flash');
                if (flipped) { const sh = row.querySelector('.shield'); if (sh) M.wobble(sh); }
            }
        }
        if (msg) {
            toast(msg + (flipped ? ` · <b>FREEROLLED</b> <span class="shield">${ICONS['shield-check']}</span>` : ''), {
                undo: () => {
                    const i = trades.findIndex(t => t.id === id);
                    if (i >= 0) trades[i] = before; else trades.unshift(before);
                    saveTrades(); renderAll();
                },
            });
        }
        return flipped;
    }

    /* ---------- next-action chip execution ---------- */
    function executeChip(id) {
        const t = trades.find(x => x.id === id);
        if (!t) return;
        const na = nextAction(t);
        if (!na || (na.type !== 'exit' && na.type !== 'raise')) { openTrimModal(id); return; }
        if (na.type === 'raise') {
            mutateTrade(id, (tr) => {
                tr.currentSL = na.target.newStop;
                na.target.ref.status = 'executed';
                const ref = tr.sellPlan.targets.find(x => x.id === na.target.ref.id) || tr.sellPlan.targets[tr.sellPlan.targets.indexOf(na.target.ref)];
                if (ref) ref.status = 'executed';
            }, `<b>${E.escapeHtml(t.ticker)}</b> stop → ${E.fmtPrice(na.target.newStop)}`);
            return;
        }
        const rem = E.getRemainingShares(t);
        const n = rem === null ? na.shares : Math.min(na.shares, rem);
        if (!n) { openTrimModal(id); return; }
        const exitId = uid();
        mutateTrade(id, (tr) => {
            const target = tr.sellPlan.targets.find(x => x.id === na.target.ref.id) || na.target.ref;
            tr.exits.push({ id: exitId, shares: n, price: na.target.price, date: E.todayLocalISO(), rMultiple: E.computeExitR(tr, na.target.price), kind: rem !== null && n >= rem ? 'close' : 'trim' });
            target.status = 'executed';
            target.exitId = exitId;
        }, `${E.directionOf(t) === 'short' ? 'Covered' : 'Sold'} ${fmtShareCount(n)} of <b>${E.escapeHtml(t.ticker)}</b> @ ${E.fmtPrice(na.target.price)} · ${E.fmtMoney(round2(n * E.directionalMove(t.entryPrice, na.target.price, t)), true)} locked`);
    }

    /* ---------- archive / delete ---------- */
    function setArchived(id, archived) {
        const t = trades.find(x => x.id === id);
        if (!t) return;
        mutateTrade(id, (tr) => { tr.archived = archived; tr.archivedAt = archived ? new Date().toISOString() : null; },
            `<b>${E.escapeHtml(t.ticker)}</b> ${archived ? 'archived' : 'restored'}`, { flashRow: false });
    }
    function deleteTrade(id) {
        const idx = trades.findIndex(t => t.id === id);
        if (idx < 0) return;
        const t = trades[idx];
        const journalCount = E.normalizeJournal(t).length;
        const journalNote = journalCount
            ? ` and ${journalCount === 1 ? 'its journal entry' : `its ${journalCount} journal entries`}`
            : '';
        confirmModal(
            `Delete ${t.ticker}`,
            `This removes the ${t.ticker} trade${journalNote}.`,
            'Delete trade',
            () => {
                const row = document.querySelector(`tr[data-id="${id}"]`);
                const before = deepClone(t);
                const doRemove = () => {
                    trades.splice(trades.findIndex(x => x.id === id), 1);
                    if (expandedId === id) expandedId = null;
                    saveTrades(); renderAll();
                    toast(`<b>${E.escapeHtml(t.ticker)}</b> deleted`, {
                        undo: () => { trades.splice(Math.min(idx, trades.length), 0, before); saveTrades(); renderAll(); },
                    });
                };
                if (row) M.collapseAway(row, doRemove); else doRemove();
            },
        );
    }

    /* ============================================================
       TRIM / EXIT MODAL (the market-hours workhorse)
       ============================================================ */
    function openTrimModal(id, { preselectAll = false } = {}) {
        const t = trades.find(x => x.id === id);
        if (!t) return;
        const s = E.deriveStatus(t);
        if (s === 'closed' || s === 'stopped' || s === 'archived') { toast('Position already closed', { error: true }); return; }
        const direction = E.directionOf(t);
        const exitVerb = direction === 'short' ? 'Covering' : 'Selling';
        const exitPast = direction === 'short' ? 'Covered' : 'Sold';

        openModal('tpl-trim', (card, close) => {
            const qs = (sel) => card.querySelector(sel);
            qs('.tm-ticker').textContent = t.ticker;
            qs('.tm-shares-label').textContent = direction === 'short' ? 'Shares to cover' : 'Shares to sell';
            qs('.tm-confirm').textContent = direction === 'short' ? 'Confirm cover' : 'Confirm exit';
            const rps = E.tradeRiskPerShare(t);
            let rem = E.getRemainingShares(t);
            const sizeUnknown = rem === null;
            qs('.tm-context').textContent = `${direction === 'short' ? 'Short' : 'Long'} entry ${E.fmtMoney(t.entryPrice)}${rem !== null ? ` · ${fmtShareCount(rem)} remaining` : ''}`;
            qs('.tm-size-ask').hidden = !sizeUnknown;

            const priceIn = qs('.tm-price'), sharesIn = qs('.tm-shares'), dateIn = qs('.tm-date'),
                stopIn = qs('.tm-stop'), sizeIn = qs('.tm-size-input'), preview = qs('.tm-preview'),
                errEl = qs('.tm-error'), remLbl = qs('.tm-remaining'), riskNote = qs('.tm-risk-note'),
                riskManager = qs('.tm-risk-manager'), riskToggle = qs('.tm-risk-toggle'),
                confirmBtn = qs('.tm-confirm');
            dateIn.value = E.todayLocalISO();
            bindDateField(qs('.tm-date-btn'), dateIn, { allowEmpty: false, emptyLabel: 'Date' });
            stopIn.placeholder = `keep ${E.fmtPrice(E.currentStop(t))}`;
            // v1 prefill: next pending sell target seeds price + clamped shares;
            // focus goes to shares when a price is waiting, else to price
            const pending = E.pendingTargets(t).find(p => !p.isStopRaise);
            if (pending && E.isNum(pending.price)) {
                priceIn.value = pending.price.toFixed(2);
                if (rem !== null && E.isNum(pending.shares)) sharesIn.value = String(Math.min(pending.shares, rem));
                sharesIn.setAttribute('data-autofocus', '');
            } else {
                priceIn.setAttribute('data-autofocus', '');
            }

            const effRemaining = () => {
                if (!sizeUnknown) return rem;
                const n = parseNum(sizeIn.value);
                return n && n > 0 ? Math.max(0, n - E.soldShares(t)) : null;
            };
            const tradeForSizing = () => {
                if (!sizeUnknown) return t;
                const n = parseNum(sizeIn.value);
                return n && n > 0 ? { ...t, shares: n } : t;
            };
            const fractionFor = (n, r) => {
                if (!n || !r) return '';
                const candidates = [[2, '½'], [3, '⅓'], [4, '¼'], [5, '⅕'], [6, '⅙']];
                return candidates.find(([d]) => Math.ceil(r / d) === n)?.[1] || '';
            };
            let riskManagerOn = true;
            let selectedR = null;
            let fracSeg = M.segmented(qs('.tm-frac-seg'), (v) => {
                if (riskManagerOn) return;
                const r = effRemaining();
                if (r === null) return;
                const f = parseFloat(v);
                sharesIn.value = String(f === 1 ? r : Math.max(1, Math.ceil(r * f)));
                update();
            });

            function syncFractionIndicator(n) {
                const r = effRemaining();
                if (r === null || !n) { fracSeg.set(''); return; }
                const choices = [
                    ['0.5', Math.ceil(r * 0.5)],
                    ['0.333', Math.ceil(r / 3)],
                    ['0.25', Math.ceil(r * 0.25)],
                    ['1', r],
                ];
                fracSeg.set(choices.find(([, shares]) => shares === n)?.[0] || '');
            }

            function applyRiskSizing(price) {
                const n = E.freerollSharesAtPrice(tradeForSizing(), price);
                sharesIn.dataset.auto = 'true';
                riskNote.classList.toggle('is-managed', n !== null);
                if (n > 0) {
                    sharesIn.value = String(n);
                    syncFractionIndicator(n);
                    const at = selectedR ? ` at ${selectedR}R` : ' at this price';
                    riskNote.textContent = `Auto-sized ${fmtShareCount(n)}${at} — minimum trim for $0 net open risk.`;
                } else if (n === 0) {
                    sharesIn.value = '';
                    syncFractionIndicator(null);
                    riskNote.textContent = 'This position is already freerolled. Turn Risk Manager off for a discretionary trim.';
                } else {
                    sharesIn.value = '';
                    syncFractionIndicator(null);
                    riskNote.classList.remove('is-managed');
                    riskNote.textContent = effRemaining() === null
                        ? 'Enter the position size to calculate a freeroll trim.'
                        : 'No trim at this price zeroes the risk and still leaves a runner. Turn Risk Manager off for a manual exit.';
                }
                return n;
            }

            function renderRPresets() {
                const r = effRemaining();
                const sizingTrade = tradeForSizing();
                qs('.tm-r-presets').innerHTML = rps === null ? '' : [1, 2, 3, 5].map(level => {
                    const p = round2(t.entryPrice + E.directionSign(t) * rps * level);
                    const n = riskManagerOn ? E.freerollSharesAtPrice(sizingTrade, p) : null;
                    const frac = n > 0 ? fractionFor(n, r) : '';
                    const helper = !riskManagerOn ? 'Sets price only'
                        : n > 0 ? `${frac ? frac + ' · ' : ''}${fmtShareCount(n)} to $0 risk`
                            : n === 0 ? 'Already freerolled' : (r === null ? 'Enter position size' : 'Manual exit only');
                    return `<button type="button" class="tm-r-preset${selectedR === level ? ' is-selected' : ''}" data-r="${level}" data-price="${p}">
                        <span class="tm-r-preset-main"><b>${level}R</b><span>${E.fmtPrice(p)}</span></span>
                        <span class="tm-r-preset-sub">${helper}</span>
                    </button>`;
                }).join('');
            }

            function setRiskManager(enabled) {
                riskManagerOn = enabled;
                riskManager.dataset.enabled = String(enabled);
                riskToggle.setAttribute('aria-checked', String(enabled));
                qs('.tm-risk-toggle-label').textContent = enabled ? 'On' : 'Off';
                sharesIn.readOnly = enabled;
                sharesIn.setAttribute('aria-describedby', 'tmRiskNote');
                qs('.tm-frac-seg').classList.toggle('is-locked', enabled);
                qs('.tm-frac-seg').querySelectorAll('button').forEach(b => { b.disabled = enabled; });
                if (enabled) {
                    applyRiskSizing(parseNum(priceIn.value));
                } else {
                    delete sharesIn.dataset.auto;
                    riskNote.classList.remove('is-managed');
                    riskNote.textContent = 'Manual sizing — type shares or choose a fraction of the remaining position.';
                    syncFractionIndicator(parseNum(sharesIn.value));
                }
                renderRPresets();
                update();
            }

            function update() {
                const r = effRemaining();
                remLbl.textContent = r !== null ? `of ${fmtShareCount(r)} remaining` : '';
                const price = parseNum(priceIn.value);
                const n = parseNum(sharesIn.value);
                errEl.hidden = true;
                preview.classList.remove('freeroll');
                const hasRequiredValues = E.isNum(price) && !!n && n > 0;
                const exceedsRemaining = hasRequiredValues && r !== null && n > r;
                confirmBtn.disabled = !hasRequiredValues || exceedsRemaining;
                preview.hidden = !hasRequiredValues || exceedsRemaining;
                if (!hasRequiredValues) { preview.replaceChildren(); return; }
                if (r !== null && n > r) {
                    errEl.hidden = false;
                    errEl.textContent = `Only ${fmtShareCount(r)} remaining`;
                    preview.replaceChildren();
                    return;
                }
                const pnl = round2(n * E.directionalMove(t.entryPrice, price, t));
                const rr = E.computeExitR(t, price);
                const after = r !== null ? r - n : null;
                const newStop = parseNum(stopIn.value) ?? E.currentStop(t);
                let risk = null, frFlip = false;
                if (after !== null && after > 0 && E.isNum(newStop)) {
                    const realizedAfter = (E.getRealizedPnL(t) ?? 0) + pnl;
                    risk = Math.max(0, round2(after * -E.directionalMove(t.entryPrice, newStop, t) - realizedAfter));
                    frFlip = risk === 0;
                }
                const resultR = rr !== null ? `<span class="tm-preview-r">${E.fmtR(rr)}</span>` : '';
                let afterLabel = after === 0 ? 'Position closed' : after !== null ? `${fmtShareCount(after)} remain` : 'Position size unknown';
                let outcome = '';
                if (after === 0) {
                    outcome = '<span class="tm-preview-state is-closed"><span>Full exit</span></span>';
                } else if (risk !== null && frFlip) {
                    outcome = `<span class="tm-preview-state is-freeroll"><span class="shield">${ICONS['shield-check']}</span><span><b>Freeroll</b><small>$0 at risk</small></span></span>`;
                } else if (risk !== null) {
                    outcome = `<span class="tm-preview-state is-risk"><span><b>${E.fmtMoney(risk)}</b><small>open risk</small></span></span>`;
                }
                const html = `
                    <div class="tm-preview-primary">
                        <span class="tm-preview-metric">
                            <small>${exitVerb}</small>
                            <strong>${fmtShareCount(n)}</strong>
                        </span>
                        <span class="tm-preview-metric tm-preview-result">
                            <small>Projected result</small>
                            <span><strong class="tm-preview-pnl">${E.fmtMoney(pnl, true)}</strong>${resultR}</span>
                        </span>
                    </div>
                    <div class="tm-preview-after">
                        <span class="tm-preview-metric">
                            <small>After exit</small>
                            <strong>${afterLabel}</strong>
                        </span>
                        ${outcome}
                    </div>`;
                preview.innerHTML = html;
                preview.classList.toggle('loss', pnl < 0);
                if (frFlip) preview.classList.add('freeroll');
            }
            priceIn.addEventListener('input', () => {
                selectedR = null;
                if (riskManagerOn) applyRiskSizing(parseNum(priceIn.value));
                renderRPresets();
                update();
            });
            sharesIn.addEventListener('input', update);
            stopIn.addEventListener('input', update);
            sizeIn.addEventListener('input', () => {
                if (riskManagerOn) applyRiskSizing(parseNum(priceIn.value));
                renderRPresets();
                update();
            });
            qs('.tm-r-presets').addEventListener('click', (e) => {
                const b = e.target.closest('[data-price]');
                if (b) {
                    selectedR = parseFloat(b.dataset.r);
                    priceIn.value = b.dataset.price;
                    if (riskManagerOn) applyRiskSizing(parseNum(priceIn.value));
                    renderRPresets();
                    update();
                }
            });
            riskToggle.addEventListener('click', () => setRiskManager(!riskManagerOn));
            qs('.tm-be').addEventListener('click', () => {
                const n = parseNum(sharesIn.value) || 0;
                const price = parseNum(priceIn.value);
                const be = E.breakevenStop(t, n, price);
                if (be !== null) { stopIn.value = String(be); update(); }
            });
            setRiskManager(!preselectAll);
            if (preselectAll) {
                const r = effRemaining();
                if (r) { sharesIn.value = String(r); fracSeg.set('1'); }
            }
            update();

            qs('.tm-confirm').addEventListener('click', () => {
                const price = parseNum(priceIn.value);
                const n = parseNum(sharesIn.value);
                const r = effRemaining();
                if (!E.isNum(price) || !n || n <= 0) { errEl.hidden = false; errEl.textContent = 'Price and shares required'; return; }
                if (r !== null && n > r) { errEl.hidden = false; errEl.textContent = `Only ${fmtShareCount(r)} remaining`; return; }
                const date = dateIn.value || E.todayLocalISO();
                const newStop = parseNum(stopIn.value);
                const sizeVal = sizeUnknown ? parseNum(sizeIn.value) : null;
                close();
                const exitId = uid();
                mutateTrade(id, (tr) => {
                    if (sizeVal && sizeVal > 0) tr.shares = sizeVal;
                    const remNow = E.getRemainingShares(tr);
                    const closing = remNow !== null && n >= remNow;
                    tr.exits.push({
                        id: exitId, shares: n, price, date,
                        rMultiple: E.computeExitR(tr, price),
                        kind: closing ? (E.isNum(tr.initialSL) && (price - tr.initialSL) * E.directionSign(tr) <= 0 ? 'stop' : 'close') : 'trim',
                    });
                    if (E.isNum(newStop) && newStop > 0) tr.currentSL = newStop;
                    // Link only when both price and planned quantity are met;
                    // a smaller manual trim must not falsely complete a freeroll target.
                    if (tr.sellPlan?.enabled) {
                        const match = (tr.sellPlan.targets || []).find(x => {
                            if (x.status === 'executed' || x.action === 'raise-stop' || !E.isNum(x.price) || Math.abs(x.price - price) / x.price > 0.005) return false;
                            const planned = E.plannedShares(tr, x);
                            return !E.isNum(planned) || n >= Math.min(planned, remNow ?? planned);
                        });
                        if (match) { match.status = 'executed'; match.exitId = exitId; }
                    }
                }, `${exitPast} ${fmtShareCount(n)} of <b>${E.escapeHtml(t.ticker)}</b> @ ${E.fmtPrice(price)} · ${E.fmtMoney(round2(n * E.directionalMove(t.entryPrice, price, t)), true)}`);
            });
        });
    }

    /* ============================================================
       ADD TO POSITION (pyramiding)
       ============================================================ */
    function openAddToModal(id) {
        const t = trades.find(x => x.id === id);
        if (!t) return;
        const s = E.deriveStatus(t);
        if (s === 'closed' || s === 'stopped' || s === 'archived') { toast('Position already closed', { error: true }); return; }
        openModal('tpl-addto', (card, close) => {
            const qs = (sel) => card.querySelector(sel);
            qs('.ap-ticker').textContent = t.ticker;
            const rem = E.getRemainingShares(t);
            qs('.ap-context').textContent = `Now: ${rem !== null ? fmtShareCount(rem) + ' @ ' : ''}avg ${E.fmtPrice(t.entryPrice)} · stop ${E.fmtPrice(E.currentStop(t))}`;
            const sharesIn = qs('.ap-shares'), priceIn = qs('.ap-price'), stopIn = qs('.ap-stop');
            const prev = qs('.ap-preview'), confirmBtn = qs('.ap-confirm');
            function update() {
                const n = parseNum(sharesIn.value), p = parseNum(priceIn.value);
                const haveInputs = !!n && n > 0 && E.isNum(p);
                confirmBtn.disabled = !haveInputs;
                prev.hidden = !haveInputs;
                if (!haveInputs) { prev.replaceChildren(); return; }
                // v1 risk-budget math: how many shares the default risk allows at this stop
                const stopForBudget = parseNum(stopIn.value) ?? E.currentStop(t);
                let hint = '';
                const addRiskPerShare = E.riskPerShare(p, stopForBudget, t.direction);
                if (rem !== null && E.isNum(stopForBudget) && addRiskPerShare !== null && account > 0) {
                    const budget = account * (riskPct() / 100);
                    const existingRisk = rem * Math.max(0, -E.directionalMove(t.entryPrice, stopForBudget, t));
                    const suggest = Math.round((budget - existingRisk) / addRiskPerShare);
                    if (suggest > 0) hint = `<span class="ap-hint">risk budget allows ~<b>${fmtShareCount(suggest)}</b> at ${riskPct()}%</span>`;
                    else hint = '<span class="ap-hint">no room to add at this stop within your risk budget</span>';
                }
                if (rem === null) {
                    prev.innerHTML = `Adding <b>${fmtShareCount(n)}</b> @ <b>${E.fmtPrice(p)}</b>` + (hint ? '<br>' + hint : '');
                    return;
                }
                const newTotal = rem + n;
                const avg = round2((rem * t.entryPrice + n * p) / newTotal);
                const stop = parseNum(stopIn.value) ?? E.currentStop(t);
                const risk = E.isNum(stop) ? round2(Math.max(0, newTotal * -E.directionalMove(avg, stop, t) - (E.getRealizedPnL(t) ?? 0))) : null;
                prev.innerHTML = `New: <b>${fmtShareCount(newTotal)}</b> @ avg <b>${E.fmtPrice(avg)}</b>` +
                    (risk !== null ? ` · risk ${E.fmtMoney(risk)}${risk === 0 ? ` <span class="fr-zero"><span class="shield">${ICONS['shield-check']}</span> still freerolled</span>` : ''}` : '') +
                    (hint ? '<br>' + hint : '');
            }
            [sharesIn, priceIn, stopIn].forEach(el => el.addEventListener('input', update));
            update();
            confirmBtn.addEventListener('click', () => {
                const n = parseNum(sharesIn.value), p = parseNum(priceIn.value);
                if (!n || n <= 0 || !E.isNum(p)) return;
                const stop = parseNum(stopIn.value);
                close();
                mutateTrade(id, (tr) => {
                    const remNow = E.getRemainingShares(tr) ?? 0;
                    const orig = E.getOriginalShares(tr) ?? 0;
                    const newAvg = round2(((remNow * tr.entryPrice) + n * p) / (remNow + n));
                    tr.entryPrice = newAvg;
                    tr.shares = orig + n;
                    if (E.isNum(stop) && stop > 0) tr.currentSL = stop;
                    // R math stays anchored to initial risk; exits keep frozen R
                }, `Added ${fmtShareCount(n)} to <b>${E.escapeHtml(t.ticker)}</b> @ ${E.fmtPrice(p)}`);
            });
        });
    }

    /* ============================================================
       MANUAL ADD / EDIT FORM
       ============================================================ */
    let formShellExit = null;
    function finishJournalFormExit(el) {
        if (formShellExit) {
            el.removeEventListener('transitionend', formShellExit);
            formShellExit = null;
        }
        el.classList.remove('is-exiting');
        el.style.height = '';
        el.style.opacity = '';
        el.style.marginBottom = '';
    }
    function openEditForm(id) {
        const t = trades.find(x => x.id === id);
        prefs.formOpen = true;
        finishJournalFormExit($('formSection'));
        panels.formSection.set(true);
        $('formToggle').setAttribute('aria-expanded', 'true');
        if (t) {
            $('formTitle').textContent = `Edit ${t.ticker}`;
            $('editTradeId').value = t.id;
            $('fTicker').value = t.ticker;
            $('fEntry').value = t.entryPrice ?? '';
            $('fDate').value = t.entryDate ?? '';
            $('fShares').value = E.getOriginalShares(t) ?? '';
            $('fInitialSL').value = t.initialSL ?? '';
            $('fCurrentSL').value = t.currentSL ?? '';
            $('fDirection').value = E.directionOf(t);
            segs.formDirection.set(E.directionOf(t));
            $('formSubmit').textContent = 'Save changes';
        } else {
            $('formTitle').textContent = 'Add trade manually';
            $('editTradeId').value = '';
            $('tradeForm').reset();
            $('fDirection').value = 'long';
            segs.formDirection.set('long');
            $('fDate').value = E.todayLocalISO();
            $('formSubmit').textContent = 'Save trade';
        }
        fDateField?.sync();
        $('formSection').scrollIntoView({ behavior: M.reduceMotion ? 'auto' : 'smooth', block: 'center' });
        clearTimeout(editFormFocusTimer);
        editFormFocusTimer = setTimeout(() => $('fTicker').focus(), 250);
    }
    $('fCopyInitial').addEventListener('click', () => { $('fCurrentSL').value = $('fInitialSL').value; });
    /* v1 nicety: empty current-stop autofills from initial on focus, selected
       so the next keystroke replaces it */
    $('fCurrentSL').addEventListener('focus', (e) => {
        if (!e.target.value && $('fInitialSL').value) {
            e.target.value = $('fInitialSL').value;
            requestAnimationFrame(() => e.target.select());
        }
    });
    function closeEditForm({ restoreFocus = true } = {}) {
        const section = panels.formSection?.section;
        if (!section?.classList.contains('is-open') && !prefs.formOpen) return false;
        const editId = $('editTradeId').value;
        clearTimeout(editFormFocusTimer);
        const onJournal = document.body.dataset.view === 'journal';
        if (onJournal && !M.reduceMotion) {
            finishJournalFormExit(section);
            const h = section.getBoundingClientRect().height;
            section.classList.add('is-exiting');
            section.style.height = h + 'px';
            section.style.opacity = '1';
            section.style.marginBottom = '0px';
            void section.offsetHeight;
            formShellExit = (event) => {
                if (event.target !== section || event.propertyName !== 'height') return;
                panels.formSection.set(false, true);
                finishJournalFormExit(section);
            };
            section.addEventListener('transitionend', formShellExit);
            section.style.height = '0px';
            section.style.opacity = '0';
            section.style.marginBottom = '-14px';
        } else {
            panels.formSection.set(false);
        }
        prefs.formOpen = false;
        $('formToggle').setAttribute('aria-expanded', 'false');
        savePrefs();
        $('tradeForm').reset();
        $('fDirection').value = 'long';
        segs.formDirection.set('long');
        $('editTradeId').value = '';
        $('formTitle').textContent = 'Add trade manually';
        $('formSubmit').textContent = 'Save trade';
        fDateField?.sync();
        if (restoreFocus) {
            const pencil = editId && document.querySelector(`tr[data-id="${editId}"] [data-act="edit"]`);
            if (pencil) pencil.focus();
            else if (section.contains(document.activeElement)) document.activeElement.blur();
        }
        return true;
    }
    const fDateField = bindDateField($('fDateBtn'), $('fDate'), { allowEmpty: false, emptyLabel: 'Date' });
    $('formCancel').addEventListener('click', () => { closeEditForm(); });
    $('tradeForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const id = $('editTradeId').value;
        const rawTicker = $('fTicker').value.trim().toUpperCase();
        if (!/^[A-Z0-9.\-]{1,8}$/.test(rawTicker)) { toast('Ticker: 1–8 chars, letters/digits/.-', { error: true }); return; }
        const vals = {
            ticker: rawTicker,
            direction: $('fDirection').value === 'short' ? 'short' : 'long',
            entryPrice: parseNum($('fEntry').value),
            entryDate: $('fDate').value || E.todayLocalISO(),
            shares: parseNum($('fShares').value),
            initialSL: parseNum($('fInitialSL').value),
            currentSL: parseNum($('fCurrentSL').value),
        };
        if (!vals.ticker || !E.isNum(vals.entryPrice) || !E.isNum(vals.initialSL)) return;
        if (E.riskPerShare(vals.entryPrice, vals.initialSL, vals.direction) === null) {
            toast(`${vals.direction === 'short' ? 'Short' : 'Long'} stop must sit ${vals.direction === 'short' ? 'above' : 'below'} entry`, { error: true });
            return;
        }
        if (!E.isNum(vals.currentSL)) vals.currentSL = vals.initialSL;
        const savedBits = [];
        if (E.isNum(vals.shares)) savedBits.push(fmtShareCount(vals.shares));
        if (E.isNum(vals.entryPrice)) savedBits.push(`@ ${E.fmtPrice(vals.entryPrice)}`);
        const savedLine = `<b>${E.escapeHtml(vals.ticker)}</b> saved` + (savedBits.length ? ` · ${savedBits.join(' ')}` : '');
        if (id) {
            mutateTrade(id, (tr) => {
                Object.assign(tr, vals);
                // entry/stop edits rebuild frozen exit R so derived numbers can't desync
                for (const x of tr.exits) x.rMultiple = E.computeExitR(tr, x.price);
            }, savedLine);
        } else {
            const added = {
                id: uid(), ...vals, exits: [],
                sellPlan: { enabled: false, preset: 'off', targets: [] },
                archived: false, journal: [], notes: '',
                createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
            };
            trades.unshift(added);
            saveTrades(); renderAll();
            toast(`<b>${E.escapeHtml(vals.ticker)}</b> added`, {
                undo: () => {
                    trades = trades.filter(t => t.id !== added.id);
                    saveTrades(); renderAll();
                },
            });
        }
        closeEditForm({ restoreFocus: false });
    });

    /* ============================================================
       WATCHLIST
       ============================================================ */
    function renderWatchlist() {
        $('watchCount').textContent = watchlist.length;
        const isEmpty = watchlist.length === 0;
        $('watchBody').classList.toggle('is-empty', isEmpty);
        $('watchBody').classList.remove('is-adding');
        $('watchEmpty').hidden = !isEmpty;
        $('watchEmptyAdd').hidden = false;
        $('watchAddForm').hidden = isEmpty;
        const wrap = $('watchPills');
        wrap.textContent = '';
        for (const tk of watchlist) {
            const pill = document.createElement('span');
            pill.className = 'watch-pill';
            pill.innerHTML = `<button class="wp-tk" title="Click to fill ticker, Shift+Click to open TradingView">${E.escapeHtml(tk)}</button><button class="wp-x" aria-label="Remove ${E.escapeHtml(tk)}" title="Remove">${ICONS.x}</button>`;
            pill.querySelector('.wp-tk').addEventListener('click', (e) => {
                if (e.shiftKey) {
                    window.open(`https://www.tradingview.com/chart/?symbol=${encodeURIComponent(tk)}`, '_blank', 'noopener');
                    return;
                }
                // v1 workflow: pill fills the calculator and tees up entry price
                $('tickerInput').value = tk;
                if (!panels.calcSection.section.classList.contains('is-open')) { prefs.calcOpen = true; panels.calcSection.set(true); savePrefs(); }
                recalc();
                $('entryPrice').focus();
                $('entryPrice').scrollIntoView({ behavior: M.reduceMotion ? 'auto' : 'smooth', block: 'center' });
            });
            pill.querySelector('.wp-x').addEventListener('click', () => {
                watchlist = watchlist.filter(x => x !== tk);
                savePrefs(); renderWatchlist();
            });
            wrap.appendChild(pill);
        }
    }
    $('watchEmptyAdd').addEventListener('click', () => {
        $('watchEmptyAdd').hidden = true;
        $('watchAddForm').hidden = false;
        $('watchBody').classList.add('is-adding');
        if (!M.reduceMotion) {
            $('watchAddForm').animate(
                [{ opacity: 0, transform: 'translateY(-4px)' }, { opacity: 1, transform: 'none' }],
                { duration: 200, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
        }
        $('watchAddInput').focus();
    });
    function addWatchTickers(tickers) {
        const parsed = Array.isArray(tickers) ? tickers : E.parseWatchlistTickers(tickers);
        if (!parsed.length) { toast('Ticker must be 1–5 letters', { error: true }); return false; }
        const room = 20 - watchlist.length;
        if (room <= 0) { toast('Watchlist full (max 20)', { error: true }); return true; }
        const fresh = parsed.filter(t => !watchlist.includes(t));
        if (!fresh.length) { toast('Already on the watchlist'); return true; }
        const added = fresh.slice(0, room);
        watchlist.push(...added);
        savePrefs();
        renderWatchlist();
        if (fresh.length > room) toast('Watchlist full (max 20)');
        else if (added.length === 1) toast(`Added <b>${E.escapeHtml(added[0])}</b>`);
        else if (added.length > 1) toast(`Added <b>${added.length}</b> tickers`);
        return true;
    }
    $('watchAddForm').addEventListener('submit', (e) => {
        e.preventDefault();
        if (addWatchTickers($('watchAddInput').value)) $('watchAddInput').value = '';
    });
    $('watchAddInput').addEventListener('paste', (e) => {
        const parsed = E.parseWatchlistTickers(e.clipboardData.getData('text'));
        if (parsed.length < 2) return;
        e.preventDefault();
        addWatchTickers(parsed);
        $('watchAddInput').value = '';
    });

    /* ============================================================
       FILTERS / EXPORT / BACKUP
       ============================================================ */
    function dateISO(d) {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
    function isDatePopOpen() {
        const pop = $('datePop');
        return pop && !pop.hidden && pop.dataset.menuState !== 'closing';
    }
    function syncDateField(btn, value, emptyLabel) {
        if (!btn) return;
        const label = btn.querySelector('.date-field-value');
        if (label) label.textContent = value ? E.fmtDateShort(value) : emptyLabel;
        btn.classList.toggle('is-empty', !value);
        const picking = isDatePopOpen() && datePick?.trigger === btn;
        btn.classList.toggle('is-picking', picking);
        btn.setAttribute('aria-expanded', String(picking));
    }
    function syncDatePickState() {
        syncDateField($('dateFromBtn'), filters.from, 'From');
        syncDateField($('dateToBtn'), filters.to, 'To');
        if (datePick?.trigger && datePick.trigger !== $('dateFromBtn') && datePick.trigger !== $('dateToBtn')) {
            syncDateField(datePick.trigger, datePick.get(), datePick.emptyLabel || 'Date');
        }
        $('dateClear').classList.toggle('is-on', !!(filters.from || filters.to));
    }
    function applyDateFilters() {
        filters.from = $('dateFrom').value;
        filters.to = $('dateTo').value;
        if (filters.from && filters.to && filters.from > filters.to) {
            const swap = filters.from;
            filters.from = filters.to;
            filters.to = swap;
            $('dateFrom').value = filters.from;
            $('dateTo').value = filters.to;
        }
        filters.page = 1;
        syncDatePickState();
        renderTable();
    }
    function placeDatePop(trigger) {
        const pop = $('datePop');
        const wasHidden = pop.hidden;
        if (wasHidden) {
            pop.style.visibility = 'hidden';
            pop.hidden = false;
        }
        const rect = trigger.getBoundingClientRect();
        const tw = pop.offsetWidth;
        const th = pop.offsetHeight;
        const gap = 8;
        const pad = 8;
        let left = rect.left;
        if (left + tw > window.innerWidth - pad) left = Math.max(pad, rect.right - tw);
        left = Math.max(pad, Math.min(left, window.innerWidth - tw - pad));
        let top = rect.bottom + gap;
        let origin = left + tw / 2 > rect.left + rect.width / 2 ? 'top right' : 'top left';
        if (top + th > window.innerHeight - pad && rect.top - gap - th > pad) {
            top = rect.top - th - gap;
            origin = origin.replace('top', 'bottom');
        }
        pop.style.left = `${Math.round(left)}px`;
        pop.style.top = `${Math.round(top)}px`;
        pop.style.transformOrigin = origin;
        if (wasHidden) {
            pop.hidden = true;
            pop.style.visibility = '';
        }
    }
    function renderDatePop() {
        const today = E.todayLocalISO();
        if (!dateView) {
            const seed = datePick?.get() || today;
            const parsed = E.parseLocalDate(seed) || new Date();
            dateView = { y: parsed.getFullYear(), m: parsed.getMonth() };
        }
        const title = new Date(dateView.y, dateView.m, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        $('datePopTitle').textContent = title;
        $('datePopClear').hidden = !datePick?.allowEmpty;
        const range = datePick?.range?.() || null;
        const selected = new Set();
        if (range) {
            if (range.from) selected.add(range.from);
            if (range.to) selected.add(range.to);
        } else {
            const value = datePick?.get();
            if (value) selected.add(value);
        }
        const first = new Date(dateView.y, dateView.m, 1);
        const start = new Date(first);
        start.setDate(1 - first.getDay());
        const grid = $('datePopGrid');
        grid.replaceChildren();
        for (let i = 0; i < 42; i++) {
            const day = new Date(start);
            day.setDate(start.getDate() + i);
            const iso = dateISO(day);
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'date-pop-day';
            btn.textContent = String(day.getDate());
            btn.dataset.iso = iso;
            if (day.getMonth() !== dateView.m) btn.classList.add('is-outside');
            if (iso === today) btn.classList.add('is-today');
            if (selected.has(iso)) btn.classList.add('is-selected');
            if (range?.from && range?.to && iso > range.from && iso < range.to) btn.classList.add('is-in-range');
            grid.appendChild(btn);
        }
        syncDatePickState();
    }
    function filterDateBinding(which) {
        return {
            id: which,
            trigger: which === 'from' ? $('dateFromBtn') : $('dateToBtn'),
            get: () => which === 'from' ? filters.from : filters.to,
            set: (iso) => {
                $(which === 'from' ? 'dateFrom' : 'dateTo').value = iso;
                applyDateFilters();
            },
            range: () => ({ from: filters.from, to: filters.to }),
            allowEmpty: true,
            emptyLabel: which === 'from' ? 'From' : 'To',
            onPick() {
                if (which === 'from' && !filters.to) openDatePop(filterDateBinding('to'));
                else closeDatePop();
            },
        };
    }
    function openDatePop(binding) {
        datePick = binding;
        const seed = binding.get() || E.todayLocalISO();
        const parsed = E.parseLocalDate(seed) || new Date();
        dateView = { y: parsed.getFullYear(), m: parsed.getMonth() };
        closeMenu($('exportMenu'));
        closeMenu($('accentMenu'));
        renderDatePop();
        placeDatePop(binding.trigger);
        const pop = $('datePop');
        if (pop.hidden || pop.dataset.menuState === 'closing') openMenu(pop);
        else syncDatePickState();
    }
    function closeDatePop() {
        const pop = $('datePop');
        if (pop && !pop.hidden) closeMenu(pop);
        const trigger = datePick?.trigger;
        if (trigger) {
            trigger.classList.remove('is-picking');
            trigger.setAttribute('aria-expanded', 'false');
        }
        syncDatePickState();
    }
    function pickDate(iso) {
        if (!datePick) return;
        datePick.set(iso);
        if (datePick.onPick) datePick.onPick(iso);
        else closeDatePop();
    }
    function toggleDatePop(binding) {
        if (isDatePopOpen() && datePick?.trigger === binding.trigger) {
            closeDatePop();
            return;
        }
        openDatePop(binding);
    }
    function bindDateField(btn, hidden, { allowEmpty = false, emptyLabel = 'Date' } = {}) {
        const api = {
            sync() { syncDateField(btn, hidden.value, emptyLabel); },
            get: () => hidden.value,
            set(iso) { hidden.value = iso; api.sync(); },
        };
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleDatePop({
                trigger: btn,
                get: api.get,
                set: api.set,
                allowEmpty,
                emptyLabel,
                onPick: () => closeDatePop(),
            });
        });
        api.sync();
        return api;
    }
    $('dateFromBtn').addEventListener('click', (e) => {
        e.stopPropagation();
        toggleDatePop(filterDateBinding('from'));
    });
    $('dateToBtn').addEventListener('click', (e) => {
        e.stopPropagation();
        toggleDatePop(filterDateBinding('to'));
    });
    $('datePop').addEventListener('click', (e) => {
        e.stopPropagation();
        const day = e.target.closest('.date-pop-day');
        if (day) { pickDate(day.dataset.iso); return; }
        const act = e.target.closest('[data-cal]')?.dataset.cal;
        if (act === 'prev') { dateView.m -= 1; if (dateView.m < 0) { dateView.m = 11; dateView.y -= 1; } renderDatePop(); placeDatePop(datePick.trigger); }
        if (act === 'next') { dateView.m += 1; if (dateView.m > 11) { dateView.m = 0; dateView.y += 1; } renderDatePop(); placeDatePop(datePick.trigger); }
        if (act === 'today') pickDate(E.todayLocalISO());
        if (act === 'clear' && datePick) {
            datePick.set('');
            if (datePick.allowEmpty && datePick.id) renderDatePop();
            else closeDatePop();
        }
    });
    $('dateClear').addEventListener('click', (e) => {
        e.stopPropagation();
        $('dateFrom').value = ''; $('dateTo').value = '';
        filters.from = ''; filters.to = '';
        filters.page = 1;
        closeDatePop();
        syncDatePickState();
        renderTable();
    });

    $('exportBtn').addEventListener('click', (e) => {
        e.stopPropagation();
        closeMenu($('accentMenu'));
        closeDatePop();
        toggleMenu($('exportMenu'));
    });
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.menu-wrap')) { closeMenu($('exportMenu')); closeMenu($('accentMenu')); }
        if (!e.target.closest('#datePop') && !e.target.closest('[aria-controls="datePop"]')) closeDatePop();
    });
    window.addEventListener('scroll', () => { if (isDatePopOpen()) closeDatePop(); }, true);
    function download(name, content, type = 'text/plain') {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([content], { type }));
        a.download = name;
        a.click();
        URL.revokeObjectURL(a.href);
    }
    function tradeCountLabel(n) {
        return `${n} trade${n === 1 ? '' : 's'}`;
    }
    async function exportVisible(kind) {
        const vis = visibleTrades();
        if (!vis.length) {
            toast('No trades to export', { error: true });
            return;
        }
        const stamp = E.todayLocalISO();
        const count = tradeCountLabel(vis.length);
        try {
            if (kind === 'csv') {
                download(`trades-${stamp}.csv`, E.toCSV(vis, ','), 'text/csv');
                toast(`Downloaded ${count} as CSV`);
            } else if (kind === 'tsv') {
                download(`trades-${stamp}.tsv`, E.toCSV(vis, '\t'), 'text/tab-separated-values');
                toast(`Downloaded ${count} as TSV`);
            } else if (kind === 'excel') {
                await navigator.clipboard.writeText(E.toCSV(vis, '\t'));
                toast(`${count} copied for Excel`);
            }
        } catch {
            toast(kind === 'excel' ? 'Couldn’t copy for Excel' : 'Couldn’t download the export', { error: true });
        }
    }
    function downloadBackup(silent = false) {
        try {
            download(`trade-tracker-backup-${E.todayLocalISO()}.json`, JSON.stringify(backupPayload(), null, 2), 'application/json');
            if (!silent) toast('Backup downloaded');
        } catch {
            toast('Couldn’t download the backup', { error: true });
        }
    }
    $('exportMenu').addEventListener('click', (e) => {
        const b = e.target.closest('[data-export]');
        if (!b) return;
        closeMenu($('exportMenu'));
        switch (b.dataset.export) {
            case 'csv':
            case 'tsv':
            case 'excel':
                exportVisible(b.dataset.export);
                break;
            case 'backup':
                downloadBackup();
                break;
            case 'restore': $('restoreFile').click(); break;
        }
    });
    /* v1-compatible backup shape (v1 restore reads app/trades/settings/watchlist) */
    function backupPayload() {
        return {
            app: 'trade-tracker', backupVersion: 2, exportedAt: new Date().toISOString(),
            trades,
            settings: {
                accountSize: account, defaultRiskPercent: riskPct(), defaultMaxPercent: maxPct(),
                direction: prefs.direction, vehicle: prefs.vehicle,
            },
            watchlist,
        };
    }
    $('footerBackup').addEventListener('click', () => {
        downloadBackup();
    });
    function openFeedbackModal({ returnToFaq = false } = {}) {
        openModal('tpl-feedback', (card, close, entry) => {
            let sent = false;
            /* Came from the FAQ and didn't send → land back on the FAQ. */
            entry.onClose = () => { if (returnToFaq && !sent) openFaqModal(); };
            const qs = (sel) => card.querySelector(sel);
            const msg = qs('.feedback-message');
            const err = qs('.feedback-error');
            const send = qs('.feedback-send');
            const submit = async () => {
                const text = msg.value.trim();
                if (!text) {
                    err.hidden = false;
                    err.textContent = 'Write a note first.';
                    msg.focus();
                    return;
                }
                err.hidden = true;
                send.disabled = true;
                const showSent = () => {
                    sent = true;
                    card.classList.add('is-sent');
                    qs('.feedback-form').setAttribute('aria-hidden', 'true');
                    qs('.feedback-sent').setAttribute('aria-hidden', 'false');
                    const done = qs('.feedback-sent-done');
                    done.focus();
                    const hold = setTimeout(close, M.reduceMotion ? 900 : 2200);
                    done.addEventListener('click', () => { clearTimeout(hold); close(); });
                };
                const live = /(?:^|\.)skyler\.tools$|(?:^|\.)netlify\.app$/.test(location.hostname);
                if (!live) { showSent(); return; }
                try {
                    const body = new URLSearchParams({
                        'form-name': 'feedback',
                        'bot-field': '',
                        message: text,
                        email: qs('.feedback-email').value.trim(),
                        view: view || '',
                        theme: themeMode() || '',
                        accent: accentName || '',
                    });
                    const res = await fetch('/', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                        body,
                    });
                    if (!res.ok) throw new Error(String(res.status));
                    showSent();
                } catch {
                    err.hidden = false;
                    err.textContent = 'Couldn’t send. Try again in a moment.';
                    send.disabled = false;
                }
            };
            send.addEventListener('click', submit);
            msg.addEventListener('keydown', (e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                    e.preventDefault();
                    submit();
                }
            });
        });
    }
    function openFaqModal() {
        openModal('tpl-faq', (card, close) => {
            const items = [...card.querySelectorAll('.faq-item')];
            /* The first answer lands open — a FAQ shouldn't open as a table of contents. */
            const sets = items.map((item, index) => {
                const wrap = item.querySelector('.faq-a-wrap');
                const btn = item.querySelector('.faq-q');
                const set = M.collapsible(item, wrap, index === 0);
                btn.setAttribute('aria-expanded', String(index === 0));
                btn.addEventListener('click', () => {
                    const next = !item.classList.contains('is-open');
                    items.forEach((other, i) => {
                        sets[i](other === item && next);
                        other.querySelector('.faq-q').setAttribute('aria-expanded', String(other === item && next));
                    });
                });
                return set;
            });
            card.querySelector('.faq-feedback')?.addEventListener('click', () => {
                close();
                openFeedbackModal({ returnToFaq: true });
            });
        });
    }
    $('footerFaq').addEventListener('click', openFaqModal);
    $('footerFeedback').addEventListener('click', openFeedbackModal);
    $('restoreFile').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        e.target.value = '';
        if (!file) return;
        let data;
        try { data = JSON.parse(await file.text()); } catch { toast('Not a valid backup file', { error: true }); return; }
        const incoming = Array.isArray(data) ? data : data.trades;
        if (!Array.isArray(incoming)) { toast('No trades found in that file', { error: true }); return; }
        confirmModal('Restore from backup', `Replaces your ${trades.length} current trades with ${incoming.length} from the file. A safety copy of the current data downloads first.`, 'Restore', () => {
            download(`pre-restore-${Date.now()}.json`, JSON.stringify({ trades }, null, 2), 'application/json');
            trades = incoming;
            trades.forEach(normalizeTrade);
            if (Array.isArray(data.watchlist)) watchlist = data.watchlist;
            const acct = E.isNum(data.account) ? data.account : data.settings?.accountSize;
            if (E.isNum(acct)) { account = acct; $('accountSize').value = account.toLocaleString('en-US'); }
            if (data.settings?.direction === 'long' || data.settings?.direction === 'short') prefs.direction = data.settings.direction;
            if (data.settings?.vehicle === 'shares' || data.settings?.vehicle === 'option') prefs.vehicle = data.settings.vehicle;
            segs.direction.set(prefs.direction, true);
            segs.vehicle.set(prefs.vehicle, true);
            syncCalculatorMode();
            saveTrades(); savePrefs(); renderAll();
            toast(`Restored ${trades.length} trades`);
        });
    });

    /* ============================================================
       CLOUD SYNC — GitHub Gist (v1 mechanics, 2.0 surface)
       Local-first · 2s debounced pushes on a single write chain ·
       updated_at conflict merge · poison-pill pause · hide/unload flush.
       GitHub GETs are max-age=60 — every gist fetch uses cache: no-store.
       ============================================================ */
    const GIST_API = 'https://api.github.com/gists';
    const sync = {
        token: localStorage.getItem(K.gistToken) || '',
        gistId: localStorage.getItem(K.gistId) || '',
        baseline: localStorage.getItem(K.gistUpdatedAt) || null,
        state: 'off', text: 'Not linked',
        timers: {}, chain: Promise.resolve(),
        inflight: 0, loadFailed: false, modalCard: null,
    };
    const syncLinked = () => !!(sync.token && sync.gistId);
    const gistFetch = (url, opts = {}) => fetch(url, GIST_SYNC.fetchInit(sync.token, opts));
    function fmtRelTime(iso) {
        if (!iso) return '';
        const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
        if (mins < 1) return 'just now';
        if (mins < 60) return `${mins} min${mins === 1 ? '' : 's'} ago`;
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
        return new Date(iso).toLocaleDateString();
    }
    function syncSet(state, text) {
        sync.state = state; sync.text = text;
        $('syncInd').dataset.s = state;
        $('syncBtn').title = `Cloud sync — ${text}`;
        if (sync.modalCard && sync.modalCard.isConnected) {
            sync.modalCard.querySelector('.sync-status-dot').dataset.s = state;
            sync.modalCard.querySelector('.sync-status-text').textContent = text;
        }
    }
    function settingsPayload() {
        return JSON.stringify({
            accountSize: account, defaultRiskPercent: riskPct(), defaultMaxPercent: maxPct(),
            calcExpanded: prefs.calcOpen, watchlist,
            direction: prefs.direction, vehicle: prefs.vehicle,
            theme: themeMode(), accent: accentName,
        }, null, 2);
    }
    async function gistFileContent(json, name) {
        const f = json.files?.[name];
        if (!f) return null;
        if (f.truncated && f.raw_url) {
            const r = await fetch(f.raw_url, { cache: 'no-store' });
            return r.ok ? r.text() : null;
        }
        return f.content ?? null;
    }
    /* Pull cloud state; adopt it when it parses (cloud is source of truth
       across devices). Garbage cloud data pauses pushes instead of ever
       overwriting it (v1 poison-pill guard). */
    async function syncPull() {
        if (!syncLinked()) return;
        sync.inflight++;
        syncSet('syncing', 'Syncing…');
        try {
            const res = await gistFetch(`${GIST_API}/${sync.gistId}`);
            if (!res.ok) throw new Error(`GitHub ${res.status}`);
            const json = await res.json();
            const tradesRaw = await gistFileContent(json, 'trades.json');
            if (tradesRaw !== null) {
                let cloud;
                try { cloud = JSON.parse(tradesRaw); } catch { cloud = undefined; }
                if (!Array.isArray(cloud)) {
                    sync.loadFailed = true;
                    syncSet('paused', 'Sync paused — cloud data unreadable');
                    toast('Cloud trades unreadable — sync paused, local data kept safe', { error: true });
                    return;
                }
                sync.loadFailed = false;
                if (JSON.stringify(cloud) !== JSON.stringify(trades)) {
                    trades = cloud;
                    trades.forEach(normalizeTrade);
                    localStorage.setItem(K.trades, JSON.stringify(trades));
                    renderAll();
                }
            }
            const settingsRaw = await gistFileContent(json, 'settings.json');
            if (settingsRaw !== null) {
                try {
                    const s = JSON.parse(settingsRaw);
                    if (E.isNum(s.accountSize)) { account = s.accountSize; $('accountSize').value = account.toLocaleString('en-US'); }
                    if (Array.isArray(s.watchlist)) { watchlist = s.watchlist; renderWatchlist(); }
                    if (s.direction === 'long' || s.direction === 'short') prefs.direction = s.direction;
                    if (s.vehicle === 'shares' || s.vehicle === 'option') prefs.vehicle = s.vehicle;
                    /* appearance follows the gist too, so a paired phone matches */
                    if (s.theme === 'light' || s.theme === 'dark' || s.theme === 'oled') {
                        setTheme(s.theme);
                        segs.theme?.set(s.theme, true);
                    }
                    if (typeof s.accent === 'string' && (ACCENTS[s.accent] || s.accent === 'rainbow')) applyAccent(s.accent);
                    localStorage.setItem(K.prefs, JSON.stringify(prefs));
                    segs.direction.set(prefs.direction, true);
                    segs.vehicle.set(prefs.vehicle, true);
                    syncCalculatorMode();
                    renderHeader(); recalc();
                } catch { /* settings are non-critical */ }
            }
            sync.baseline = json.updated_at;
            localStorage.setItem(K.gistUpdatedAt, sync.baseline);
            localStorage.setItem(K.lastSync, new Date().toISOString());
            syncSet('ok', `Synced · ${fmtRelTime(localStorage.getItem(K.lastSync))}`);
        } catch (err) {
            syncSet('error', `Sync error — ${err.message || 'network'}`);
        } finally {
            sync.inflight = Math.max(0, sync.inflight - 1);
        }
    }
    function schedulePush(kind) {
        if (!syncLinked() || sync.loadFailed) return;
        clearTimeout(sync.timers[kind]);
        /* Trades are discrete actions — wait just long enough to batch a
           double-save, then push while the tab is still in front. Settings
           can stay slower. */
        const delay = kind === 'trades' ? 300 : 2000;
        sync.timers[kind] = setTimeout(() => {
            sync.timers[kind] = null;
            pushFile(kind);
        }, delay);
    }
    function filePayload(kind) {
        return kind === 'trades'
            ? { 'trades.json': { content: JSON.stringify(trades, null, 2) } }
            : { 'settings.json': { content: settingsPayload() } };
    }
    function pushFile(kind, { flush = false, keepalive = false } = {}) {
        if (!syncLinked() || sync.loadFailed) return;
        sync.inflight++;
        sync.chain = sync.chain.then(async () => {
            try {
                if (!syncLinked() || sync.loadFailed) return;
                syncSet('syncing', 'Syncing…');
                if (!flush && sync.baseline) {
                    const head = await gistFetch(`${GIST_API}/${sync.gistId}`);
                    if (head.ok) {
                        const meta = await head.json();
                        if (GIST_SYNC.isConflict(sync.baseline, meta.updated_at)) {
                            if (kind === 'trades') {
                                const tradesRaw = await gistFileContent(meta, 'trades.json');
                                let cloud;
                                try { cloud = JSON.parse(tradesRaw); } catch { cloud = undefined; }
                                if (!Array.isArray(cloud)) {
                                    sync.loadFailed = true;
                                    syncSet('paused', 'Sync paused — cloud data unreadable');
                                    toast('Cloud trades unreadable — sync paused, local data kept safe', { error: true });
                                    return;
                                }
                                trades = GIST_SYNC.mergeTrades(trades, cloud);
                                trades.forEach(normalizeTrade);
                                localStorage.setItem(K.trades, JSON.stringify(trades));
                                renderAll();
                            }
                            sync.baseline = meta.updated_at;
                        }
                    }
                }
                const res = await gistFetch(`${GIST_API}/${sync.gistId}`, {
                    method: 'PATCH',
                    body: JSON.stringify({ files: filePayload(kind) }),
                    keepalive,
                });
                if (!res.ok) throw new Error(`GitHub ${res.status}`);
                const json = await res.json();
                sync.baseline = json.updated_at;
                localStorage.setItem(K.gistUpdatedAt, sync.baseline);
                localStorage.setItem(K.lastSync, new Date().toISOString());
                syncSet('ok', `Synced · ${fmtRelTime(localStorage.getItem(K.lastSync))}`);
            } catch (err) {
                syncSet('error', `Sync error — ${err.message || 'network'}`);
            } finally {
                sync.inflight = Math.max(0, sync.inflight - 1);
            }
        });
    }
    function pendingPush() {
        return Object.values(sync.timers).some(Boolean);
    }
    /* Hidden tabs are still alive — use a normal fetch. keepalive only on unload
       (iOS Safari drops keepalive PATCH when the tab is merely backgrounded). */
    function flushPending(reason) {
        const keepalive = GIST_SYNC.keepaliveFor(reason);
        for (const kind of Object.keys(sync.timers)) {
            if (sync.timers[kind]) {
                clearTimeout(sync.timers[kind]);
                sync.timers[kind] = null;
                pushFile(kind, { flush: true, keepalive });
            }
        }
    }
    function pullIfIdle() {
        if (!syncLinked() || sync.loadFailed || pendingPush() || sync.inflight) return;
        if (sync.state === 'error' || sync.state === 'paused') return;
        syncPull();
    }
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) flushPending('hidden');
        else pullIfIdle();
    });
    window.addEventListener('pagehide', () => flushPending('unload'));
    window.addEventListener('beforeunload', () => flushPending('unload'));
    window.addEventListener('pageshow', (e) => { if (e.persisted) pullIfIdle(); });

    async function linkGist(token, gistId, errEl) {
        sync.token = token;
        try {
            if (gistId) {
                const res = await gistFetch(`${GIST_API}/${gistId}`);
                if (!res.ok) throw new Error(res.status === 404 ? 'Gist not found (check the ID)' : `GitHub said ${res.status} (check the token)`);
                sync.gistId = gistId;
            } else {
                const res = await gistFetch(GIST_API, {
                    method: 'POST',
                    body: JSON.stringify({
                        description: 'skyler.tools Trader Tools Suite data', public: false,
                        files: { 'trades.json': { content: JSON.stringify(trades, null, 2) }, 'settings.json': { content: settingsPayload() } },
                    }),
                });
                if (!res.ok) throw new Error(`Couldn’t create a gist (GitHub ${res.status} — token needs the gist scope)`);
                const json = await res.json();
                sync.gistId = json.id;
                sync.baseline = json.updated_at;
                localStorage.setItem(K.gistUpdatedAt, sync.baseline);
            }
            localStorage.setItem(K.gistToken, sync.token);
            localStorage.setItem(K.gistId, sync.gistId);
            await syncPull();
            toast(`Cloud sync linked <span class="shield">${ICONS['shield-check']}</span>`);
            return true;
        } catch (err) {
            if (errEl) { errEl.hidden = false; errEl.textContent = err.message; }
            syncSet('error', 'Link failed');
            return false;
        }
    }
    function unlinkGist() {
        sync.token = ''; sync.gistId = ''; sync.baseline = null; sync.loadFailed = false;
        [K.gistToken, K.gistId, K.gistUpdatedAt, K.lastSync].forEach(k => localStorage.removeItem(k));
        syncSet('off', 'Not linked');
        toast('Sync unlinked — local data kept');
    }
    /* One link/QR pairs the next device: token + gist id in the URL fragment
       (fragments never reach a server). Shown only inside the sync modal,
       generated locally, consumed and stripped from the URL on open. */
    function pairingLink() {
        if (!syncLinked()) return null;
        const payload = btoa(JSON.stringify({ t: sync.token, g: sync.gistId }))
            .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        return `${location.origin}${location.pathname}#pair=${payload}`;
    }
    function readPairLink() {
        const m = /^#pair=([A-Za-z0-9_-]+)$/.exec(location.hash || '');
        if (!m) return null;
        history.replaceState(null, '', location.pathname + location.search + '#positions');
        try {
            const p = JSON.parse(atob(m[1].replace(/-/g, '+').replace(/_/g, '/')));
            if (p && typeof p.t === 'string' && p.t && typeof p.g === 'string' && p.g) return p;
        } catch { /* invalid payload — handled below */ }
        return { invalid: true };
    }
    function applyPairing(p) {
        if (p.invalid) { toast('That pairing link didn’t work — copy a fresh one from the other device', { error: true }); return; }
        if (sync.token === p.t && sync.gistId === p.g) { syncPull(); return; }
        confirmModal('Pair this device',
            'Link this device to your synced trades? The token stays in this browser and you can unlink anytime.',
            'Pair & sync', () => {
                sync.token = p.t; sync.gistId = p.g; sync.baseline = null; sync.loadFailed = false;
                localStorage.setItem(K.gistToken, sync.token);
                localStorage.setItem(K.gistId, sync.gistId);
                localStorage.removeItem(K.gistUpdatedAt);
                syncPull();
                toast(`Cloud sync linked <span class="shield">${ICONS['shield-check']}</span>`);
            }, { danger: false });
    }

    function openSyncModal() {
        openModal('tpl-sync', (card, close, entry) => {
            sync.modalCard = card;
            entry.onClose = () => { sync.modalCard = null; };
            const qs = (sel) => card.querySelector(sel);
            function renderLinked() {
                qs('.sync-status-dot').dataset.s = sync.state;
                qs('.sync-status-text').textContent = sync.state === 'ok'
                    ? `Synced · ${fmtRelTime(localStorage.getItem(K.lastSync))}` : sync.text;
                /* degrade to the copy-link button if qr.js ever fails to load */
                const link = pairingLink();
                const svg = link && typeof QR !== 'undefined' ? QR.svg(link) : null;
                const box = qs('.sync-pair-qr');
                box.hidden = !svg;
                if (svg) box.innerHTML = svg;
            }
            const setScreen = (name) => {
                const screen = syncLinked() ? 'linked' : name;
                card.querySelectorAll('.sync-screen').forEach(el => { el.hidden = el.dataset.screen !== screen; });
                card.classList.toggle('is-linked', syncLinked());
                if (screen === 'linked') renderLinked();
                if (screen === 'token') setTimeout(() => qs('.sy-token').focus(), 60);
            };
            const tokenIn = qs('.sy-token');
            const looksLikeToken = (v) => /^(ghp_|github_pat_)[A-Za-z0-9_]{16,}$/.test(v.trim());
            async function doLink() {
                const errEl = qs('.sync-error');
                errEl.hidden = true;
                const token = tokenIn.value.trim();
                if (!token) { errEl.hidden = false; errEl.textContent = 'Paste the token GitHub showed you.'; return; }
                const linkBtn = qs('.sy-link');
                if (linkBtn.disabled) return;
                linkBtn.disabled = true;
                const ok = await linkGist(token, qs('.sy-gist').value.trim(), errEl);
                linkBtn.disabled = false;
                if (ok) setScreen('linked');
            }
            qs('.sy-have').addEventListener('click', () => setScreen('token'));
            qs('.sy-new').addEventListener('click', () => setScreen('signup'));
            qs('.sy-signed').addEventListener('click', () => setScreen('token'));
            card.querySelectorAll('.sy-back').forEach(b => b.addEventListener('click', () => setScreen('choice')));
            qs('.sync-adv-toggle').addEventListener('click', () => {
                qs('.sync-adv-field').hidden = false;
                qs('.sync-adv-toggle').hidden = true;
                qs('.sy-gist').focus();
            });
            /* A pasted token that looks complete links on its own — no extra click. */
            tokenIn.addEventListener('paste', () => {
                setTimeout(() => { if (looksLikeToken(tokenIn.value)) doLink(); }, 50);
            });
            qs('.sy-link').addEventListener('click', doLink);
            qs('.sync-now').addEventListener('click', () => { syncPull(); });
            qs('.sy-unlink').addEventListener('click', () => { unlinkGist(); setScreen('choice'); });
            qs('.sync-pair-link').addEventListener('click', () => {
                const link = pairingLink();
                if (!link) return;
                navigator.clipboard.writeText(link);
                toast('Pairing link copied — treat it like a password');
            });
            qs('.sy-backup').addEventListener('click', () => {
                downloadBackup();
            });
            qs('.sy-restore').addEventListener('click', () => { close(); $('restoreFile').click(); });
            setScreen('choice');
        });
    }
    $('syncBtn').addEventListener('click', openSyncModal);

    /* ---------- keyboard: Shift+C clears the calculator ---------- */
    document.addEventListener('keydown', (e) => {
        if ((e.key === 'C' || e.key === 'c') && e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
            const t = e.target;
            if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable || modalStack.length) return;
            e.preventDefault();
            $('clearCalc').click();
        }
    });

    function liveJournal() {
        try {
            const j = JSON.parse(localStorage.getItem('riskCalcJournal') || '[]');
            return Array.isArray(j) ? j : [];
        } catch { return []; }
    }

    function importLiveSite() {
        const mapped = E.migrateLiveSiteJournal(liveJournal()).map(normalizeTrade);
        trades = mapped;
        try {
            const s = JSON.parse(localStorage.getItem('riskCalcSettings') || 'null');
            if (s?.startingAccountSize) account = Number(s.startingAccountSize) || account;
            if (s?.defaultRiskPercent != null) {
                const r = String(s.defaultRiskPercent);
                if (RISK_PRESETS.includes(r)) prefs.riskPreset = r;
                else { prefs.riskPreset = 'custom'; prefs.riskCustom = Number(s.defaultRiskPercent) || 0.5; }
            }
            if (s?.theme === 'light' || s?.theme === 'dark' || s?.theme === 'oled') setTheme(s.theme);
        } catch { /* keep current settings */ }
        prefs.importedLiveSite = true;
        prefs.onboarded = true;
        saveTrades();
        savePrefs();
        $('accountSize').value = account ? account.toLocaleString('en-US') : '';
        COMPOUND.syncAccount(account);
        renderAll();
        toast(`Imported ${trades.length} trade${trades.length === 1 ? '' : 's'} from the previous site`);
    }

    /* ---------- first-run welcome (cap-style, once) ---------- */
    function maybeOnboard() {
        const forceWelcome = new URLSearchParams(location.search).has('welcome');
        const live = liveJournal();
        if (!forceWelcome && !trades.length && live.length && !prefs.liveImportOffered) {
            prefs.liveImportOffered = true;
            prefs.onboarded = true;
            savePrefs();
            openModal('tpl-import', (card, close) => {
                const copy = card.querySelector('.import-copy');
                if (copy) {
                    copy.textContent = `This browser still has ${live.length} trade${live.length === 1 ? '' : 's'} from the previous skyler.tools. Import them into the suite — nothing on the old site is deleted.`;
                }
                card.querySelector('.wc-import').addEventListener('click', () => { close(); importLiveSite(); });
            });
            return;
        }
        if (!forceWelcome && (prefs.onboarded || trades.length || syncLinked())) return;
        if (!forceWelcome) { prefs.onboarded = true; savePrefs(); }
        openModal('tpl-welcome', (card, close) => {
            M.letterReveal(card.querySelector('.wc-title'));
            M.wobble(card.querySelector('.wc-mark'));
            const rec = card.querySelector('.wc-rec');
            if (rec) {
                setTimeout(() => M.wobble(rec), 740);
                /* the same nudge replays when the pointer lands on the CTA */
                card.querySelector('.wc-cta')?.addEventListener('pointerenter', () => M.wobble(rec));
            }
            card.querySelector('.wc-sync').addEventListener('click', () => { close(); openSyncModal(); });
            card.querySelector('.wc-sample').addEventListener('click', () => { close(); $('seedDemo').click(); });
        });
    }

    /* ============================================================
       DEMO SEED
       ============================================================ */
    $('seedDemo').addEventListener('click', () => {
        const d = (offset) => {
            const dt = new Date(); dt.setDate(dt.getDate() - offset);
            return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
        };
        const at = (offset, hour = 15) => { const dt = new Date(); dt.setDate(dt.getDate() - offset); dt.setHours(hour, 0, 0, 0); return dt.toISOString(); };
        const j = (kind, text, offset) => [{ id: uid(), kind, text, createdAt: at(offset), updatedAt: null }];
        const mk = (o) => ({ exits: [], sellPlan: { enabled: false, preset: 'off', targets: [] }, archived: false, journal: [], notes: '', id: uid(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), ...o });
        trades = [
            mk({ ticker: 'HOOD', entryPrice: 104.20, initialSL: 101.60, currentSL: 104.20, entryDate: d(6), shares: 480,
                exits: [{ id: uid(), shares: 240, price: 106.80, date: d(4), rMultiple: 1, kind: 'trim' }],
                sellPlan: { enabled: true, preset: 'half-1r', initialShares: 480, targets: [{ id: 'sp1', rLevel: 1, price: 106.80, shares: 240, action: 'sell', status: 'executed' }] },
                journal: j('update', 'Theme captain. Trimmed half at 1R, stop to entry — free-rolling the runner.', 4) }),
            mk({ ticker: 'CRDO', entryPrice: 148.50, initialSL: 144.10, currentSL: 144.10, entryDate: d(2), shares: 260,
                sellPlan: { enabled: true, preset: 'half-1r', initialShares: 260, targets: [{ id: 'sp1', rLevel: 1, price: 152.90, shares: 130, action: 'sell', status: 'pending' }] },
                journal: j('thesis', 'AI networking. Waiting on 1R to trim half.', 2) }),
            mk({ ticker: 'IONQ', entryPrice: 42.80, initialSL: 41.20, currentSL: 41.20, entryDate: d(1), shares: 700,
                sellPlan: { enabled: true, preset: 'backfill', initialShares: 700, targets: [{ id: 'sp1', rLevel: 1, price: 44.40, shares: 0, action: 'raise-stop', newStop: 42.80, status: 'pending' }] } }),
            mk({ ticker: 'ANET', entryPrice: 128.00, initialSL: 125.50, currentSL: 125.50, entryDate: d(14), shares: 400,
                exits: [{ id: uid(), shares: 200, price: 133.00, date: d(11), rMultiple: 2, kind: 'trim' }, { id: uid(), shares: 200, price: 136.75, date: d(8), rMultiple: 3.5, kind: 'close' }],
                journal: j('review', 'Clean two-stage exit into strength.', 8) }),
            mk({ ticker: 'RGTI', entryPrice: 18.40, initialSL: 17.75, currentSL: 17.75, entryDate: d(9), shares: 1500,
                exits: [{ id: uid(), shares: 1500, price: 17.72, date: d(7), rMultiple: -1.05, kind: 'stop' }],
                journal: j('lesson', 'Gap fade, stopped clean. Took the planned loss without widening the stop.', 7) }),
        ];
        saveTrades();
        renderAll();
        toast('Sample trades loaded — delete or edit freely');
    });

    /* ============================================================
       RENDER ALL + INIT
       ============================================================ */
    function renderAll() {
        renderHeader();
        renderJournalSummary();
        renderTable();
        renderWatchlist();
        recalc();
    }

    function init() {
        const pairPayload = readPairLink(); // strips #pair= before the hash view resolves
        loadAll();
        hydrateIcons();
        startDailyClock();
        accentName = localStorage.getItem(K.accent) || 'cyan';
        applyAccent(accentName);
        $('accountSize').value = account ? account.toLocaleString('en-US') : '';
        wireSegs();
        segs.theme = M.segmented($('themeSeg'), (v) => { setTheme(v); schedulePush('settings'); });
        segs.eqMode = M.segmented($('eqModeSeg'), (v) => { prefs.equityMode = v; savePrefs(); renderEquity(); });
        new ResizeObserver(() => { if (view === 'journal') renderEquity(); }).observe($('equityChart'));
        new MutationObserver(() => { if (view === 'journal') renderEquity(); })
            .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'style'] });
        wirePanel('calcSection', 'calcBodyWrap', 'calcToggle', 'calcOpen');
        wirePanel('watchSection', 'watchBodyWrap', 'watchToggle', 'watchOpen');
        wirePanel('formSection', 'formBodyWrap', 'formToggle', 'formOpen');
        wireMetrics();
        wireRiskScenarios();
        wireInstantTips();
        if (prefs.formOpen === undefined) { prefs.formOpen = false; panels.formSection.set(false, true); }
        $('fDate').value = E.todayLocalISO();
        fDateField.sync();
        syncCalculatorMode();
        syncRiskLabels();
        COMPOUND.init({ account, parseNum, bindMoneyNotation });
        GUIDE.init();
        setView(viewFromHash(), { instant: true });
        window.addEventListener('hashchange', () => setView(viewFromHash(), { syncHash: false }));
        renderAll();
        requestAnimationFrame(() => {
            segs.theme.set(document.documentElement.getAttribute('data-theme'), true);
            segs.scope.set(prefs.scope, true);
            segs.direction.set(prefs.direction, true);
            segs.vehicle.set(prefs.vehicle, true);
            if (prefs.riskPreset === 'custom') $('riskCustom').value = String(prefs.riskCustom);
            segs.risk.set(prefs.riskPreset, true);
            if (prefs.maxPreset === 'custom') $('maxCustom').value = String(prefs.maxCustom);
            segs.max.set(prefs.maxPreset, true);
            segs.plan.set(prefs.plan, true);
            segs.status.set(filters.status, true);
            segs.formDirection.set('long', true);
            segs.eqMode.set(prefs.equityMode || 'usd', true);
            segs.view.set(view, true);
            segs.journal.set(viewFilters.journal, true);
            syncCalculatorMode();
            requestAnimationFrame(refreshSegs);
        });
        document.fonts?.ready?.then(() => refreshSegs());
        if (syncLinked()) syncPull();
        else syncSet('off', 'Not linked');
        if (pairPayload) {
            prefs.onboarded = true;
            savePrefs();
            applyPairing(pairPayload);
        } else {
            maybeOnboard();
        }
    }
    
    /* Expose toast for guide.js */
    window.APP = window.APP || {};
    window.APP.toast = toast;
    
    init();
})();
