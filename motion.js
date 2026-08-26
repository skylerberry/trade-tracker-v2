/* ============================================================
   motion.js — Trade Tracker 2.0 motion system (cap-motion)
   Analytic spring solver + auto-sleeping rAF driver + the
   named vocabulary. All geometry moves on springs; opacity /
   color live in CSS. One vocabulary, defined once, used
   everywhere — no inline ad-hoc values.
   ============================================================ */
'use strict';

const MOTION = (() => {

    const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* ---------- analytic spring-mass-damper ---------- */
    class Spring {
        constructor(stiffness, damping, mass = 1) {
            this.k = stiffness; this.c = damping; this.m = mass;
            this.pos = 0; this.vel = 0; this.target = 0;
        }
        step(dtMs) {
            const dt = dtMs / 1000;
            const w0 = Math.sqrt(this.k / this.m);
            const zeta = this.c / (2 * Math.sqrt(this.k * this.m));
            const x0 = this.pos - this.target;
            const v0 = this.vel;
            let nx, nv;
            if (zeta < 0.99) {
                const wd = w0 * Math.sqrt(1 - zeta * zeta);
                const decay = Math.exp(-zeta * w0 * dt);
                const sin = Math.sin(wd * dt), cos = Math.cos(wd * dt);
                const B = (v0 + x0 * zeta * w0) / Math.max(wd, 1e-4);
                nx = decay * (x0 * cos + B * sin);
                nv = -zeta * w0 * nx + decay * wd * (B * cos - x0 * sin);
            } else {
                const decay = Math.exp(-w0 * dt);
                const B = v0 + w0 * x0;
                nx = decay * (x0 + B * dt);
                nv = -w0 * nx + decay * B;
            }
            this.pos = this.target + nx;
            this.vel = nv;
        }
        settled(eps = 0.05) {
            return Math.abs(this.vel) < eps && Math.abs(this.pos - this.target) < eps;
        }
        snap(v) { this.pos = this.target = v; this.vel = 0; }
    }

    const SPRINGS = {
        indicator: { stiffness: 400, damping: 32 },            // FLIP pills
        modal:     { stiffness: 500, damping: 25 },            // dialog enters
        micro:     { stiffness: 600, damping: 20 },            // tap/hover scale
        morph:     { stiffness: 260, damping: 32, mass: 0.9 }, // large layout morphs
        press:     { stiffness: 600, damping: 22 },            // physical press
        wobble:    { stiffness: 200, damping: 9 },             // freeroll shield kick
    };
    const makeSpring = (name) => {
        const p = SPRINGS[name];
        return new Spring(p.stiffness, p.damping, p.mass || 1);
    };

    /* ---------- auto-sleeping rAF driver ---------- */
    const drivers = [];
    let running = false, lastT = 0;
    function loop(now) {
        const dt = lastT ? Math.min(now - lastT, 64) : 16.7;
        lastT = now;
        let alive = false;
        for (const d of drivers) {
            if (d.sleeping) continue;
            let done = true;
            for (const s of d.springs) { s.step(dt); if (!s.settled(d.eps)) done = false; }
            d.apply();
            if (done) d.sleeping = true; else alive = true;
        }
        if (alive) requestAnimationFrame(loop);
        else running = false;
    }
    function addDriver(springs, apply, eps = 0.05) {
        const d = { springs, apply, eps, sleeping: true };
        drivers.push(d);
        return {
            poke() {
                d.sleeping = false;
                if (!running) { running = true; lastT = 0; requestAnimationFrame(loop); }
            },
        };
    }

    /* ---------- FLIP pill (vanilla layoutId) ----------
       One absolutely-positioned .seg-pill behind the active button of a
       segmented control. place(btn) springs x + width to it. */
    function flipPill(pillEl) {
        const x = makeSpring('indicator');
        const w = makeSpring('indicator');
        let placed = false;
        const drv = addDriver([x, w], () => {
            pillEl.style.transform = `translateX(${x.pos}px)`;
            pillEl.style.width = `${w.pos}px`;
        });
        return function place(btn, instant = false) {
            if (!btn) { pillEl.style.opacity = '0'; placed = false; return false; }
            const left = btn.offsetLeft;
            const width = btn.offsetWidth;
            /* Hidden or not-yet-laid-out targets measure 0. Don't lock that
               in — white label on a missing pill is the reload flash. */
            if (width < 1) {
                pillEl.style.opacity = '0';
                placed = false;
                return false;
            }
            pillEl.style.opacity = '1';
            if (instant || reduceMotion || !placed) {
                x.snap(left); w.snap(width);
                pillEl.style.transform = `translateX(${x.pos}px)`;
                pillEl.style.width = `${w.pos}px`;
                placed = true;
                return true;
            }
            x.target = left;
            w.target = width;
            drv.poke();
            placed = true;
            return true;
        };
    }

    /* Wire a segmented control: container has .seg-pill + buttons[data-seg].
       onPick(value, btn) fires on click; returns { set(value) } for programmatic.
       Contrast color waits on .is-ready so a late pill never blanks the label. */
    function segmented(container, onPick) {
        const pill = container.querySelector('.seg-pill');
        const place = flipPill(pill);
        const btns = () => [...container.querySelectorAll('[data-seg]')];
        let retries = 0;

        function mark(btn) {
            btns().forEach((b) => {
                const on = b === btn;
                b.classList.toggle('is-active', on);
                b.setAttribute('aria-selected', on ? 'true' : 'false');
            });
        }

        function placeWhenReady(btn, instant) {
            if (place(btn, instant)) {
                container.classList.add('is-ready');
                retries = 0;
                return;
            }
            container.classList.remove('is-ready');
            if (!btn?.getClientRects().length || retries > 8) return;
            retries += 1;
            requestAnimationFrame(() => placeWhenReady(btn, true));
        }

        const api = {
            set(value, instant = false) {
                const btn = btns().find(b => b.dataset.seg === String(value));
                if (!btn) return;
                const apply = () => { mark(btn); placeWhenReady(btn, instant); };
                if (instant) requestAnimationFrame(apply);
                else apply();
            },
            refresh() {
                const active = btns().find(b => b.classList.contains('is-active'));
                if (active) placeWhenReady(active, true);
            },
        };
        container.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-seg]');
            if (!btn || btn.disabled) return;
            api.set(btn.dataset.seg);
            onPick && onPick(btn.dataset.seg, btn);
        });
        if (typeof ResizeObserver === 'function') {
            new ResizeObserver(() => api.refresh()).observe(container);
        }
        return api;
    }

    /* ---------- one-shot spring keyframes for WAAPI ----------
       Samples the analytic spring into keyframes so one-shot enters get real
       spring character without a persistent driver. */
    function springKeyframes(name, from, to, ms = 420) {
        const s = makeSpring(name);
        s.snap(0); s.target = 1;
        const frames = [];
        const steps = Math.ceil(ms / (1000 / 60));
        for (let i = 0; i <= steps; i++) {
            if (i) s.step(1000 / 60);
            const t = s.pos;
            const f = {};
            for (const k of Object.keys(from)) f[k] = from[k] + (to[k] - from[k]) * t;
            frames.push(f);
        }
        return frames;
    }

    /* Splash enter: no slide — grows from the middle toward the viewer,
       blur settling as it lands. Gentler and longer than modalEnter. */
    function splashEnter(el) {
        if (reduceMotion) return;
        const frames = springKeyframes('modal', { s: 0.9, b: 6, o: 0 }, { s: 1, b: 0, o: 1 }, 520)
            .map(f => ({
                transform: `scale(${f.s})`,
                filter: `blur(${Math.max(0, f.b)}px)`,
                opacity: Math.min(1, Math.max(0, f.o * 1.8)),
            }));
        el.animate(frames, { duration: 520, easing: 'linear' });
    }

    /* Modal enter: scale 0.95, y 10 → identity on the `modal` spring. */
    function modalEnter(el) {
        if (reduceMotion) return;
        const frames = springKeyframes('modal', { s: 0.95, y: 10, o: 0 }, { s: 1, y: 0, o: 1 }, 400)
            .map(f => ({ transform: `translateY(${f.y}px) scale(${f.s})`, opacity: Math.min(1, f.o * 2.2) }));
        el.animate(frames, { duration: 400, easing: 'linear' });
    }
    /* Modal exit: exits never bounce — fast plain tween. Resolves when done. */
    function modalExit(el) {
        if (reduceMotion) return Promise.resolve();
        return el.animate(
            [{ transform: 'none', opacity: 1 }, { transform: 'translateY(8px) scale(0.96)', opacity: 0 }],
            { duration: 170, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' }
        ).finished.catch(() => {});
    }

    /* ---------- rolling digits (WAAPI, direction-aware) ----------
       Container gets per-char cells; on update, changed chars roll up (gains)
       or down (losses). 300ms --ease-out-expo. */
    const ROLL = { duration: 300, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' };
    /* Each cell tracks its authoritative span in cell.__cur. Updates are
       interruptible: any span that is not __cur is a stale out-going digit
       and is purged before a new roll starts — rapid retargeting can never
       accumulate spans (the "conjoined digits" failure mode). */
    function animateRollTransition(cell, cur, inc, dirUp, blur) {
        const out = dirUp ? '-100%' : '100%';
        const from = dirUp ? '100%' : '-100%';
        cur.animate(
            [
                { transform: 'translateY(0)', opacity: 1, filter: 'blur(0)' },
                { transform: `translateY(${out})`, opacity: 0, filter: blur ? 'blur(4px)' : 'blur(0)' },
            ],
            { ...ROLL, fill: 'forwards' }).finished
            .then(() => cur.remove()).catch(() => cur.remove());
        inc.animate(
            [
                { transform: `translateY(${from})`, opacity: 0, filter: blur ? 'blur(4px)' : 'blur(0)' },
                { transform: 'translateY(0)', opacity: 1, filter: 'blur(0)' },
            ],
            ROLL).finished.then(() => {
                if (cell.__cur === inc) { inc.style.position = 'static'; inc.style.width = ''; }
            }).catch(() => {});
    }

    function updateRollerCell(cell, ch, dirUp, blur) {
        const cur = cell.__cur;
        for (const c of [...cell.children]) if (c !== cur) c.remove();
        if (!cur || !cur.isConnected) {
            cell.textContent = '';
            const s = document.createElement('span');
            s.textContent = ch;
            cell.appendChild(s);
            cell.__cur = s;
            return;
        }
        if (cur.textContent === ch) return;
        if (reduceMotion) { cur.textContent = ch; return; }
        const inc = document.createElement('span');
        inc.textContent = ch;
        inc.style.cssText = 'position:absolute;left:0;top:0;width:100%';
        cell.appendChild(inc);
        cell.__cur = inc;
        animateRollTransition(cell, cur, inc, dirUp, blur);
    }

    function rollerUpdate(container, text, dirUp = true) {
        const chars = [...String(text)];
        const blur = container.hasAttribute('data-roll-blur');
        let cells = container.__cells;
        if (!cells || cells.length !== chars.length) {
            // structure change: rebuild cells (no per-char roll, quick fade)
            container.textContent = '';
            cells = chars.map(ch => {
                const cell = document.createElement('span');
                cell.className = 'roll-cell';
                const inner = document.createElement('span');
                inner.textContent = ch;
                cell.appendChild(inner);
                cell.__cur = inner;
                container.appendChild(cell);
                return cell;
            });
            container.__cells = cells;
            if (!reduceMotion && container.isConnected) {
                container.animate(
                    [{ opacity: 0.25, transform: 'translateY(3px)' }, { opacity: 1, transform: 'none' }],
                    { duration: 200, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
            }
            return;
        }
        chars.forEach((ch, i) => updateRollerCell(cells[i], ch, dirUp, blur));
    }
    /* Bind a roller to an element; returns update(text) that infers direction
       from the numeric value when possible. */
    function roller(el, { alwaysUp = false } = {}) {
        let lastNum = null;
        return function update(text) {
            const num = parseFloat(String(text).replace(/[^0-9.\-]/g, ''));
            let dirUp = true;
            if (!alwaysUp && lastNum !== null && !isNaN(num)) dirUp = num >= lastNum;
            if (!isNaN(num)) lastNum = num;
            rollerUpdate(el, text, dirUp);
        };
    }

    /* ---------- freeroll shield wobble (underdamped kick) ---------- */
    function wobble(el) {
        if (reduceMotion || !el) return;
        const s = makeSpring('wobble');
        s.snap(0); s.vel = 18; // velocity kick, target stays 0
        const drv = addDriver([s], () => {
            el.style.transform = `rotate(${s.pos}deg) scale(${1 + Math.abs(s.pos) / 60})`;
        }, 0.02);
        drv.poke();
    }

    /* ---------- collapsible (height + blur) ---------- */
    function collapsible(section, contentEl, expanded) {
        contentEl.addEventListener('transitionend', (e) => {
            if (e.target !== contentEl || e.propertyName !== 'height') return;
            if (section.classList.contains('is-open')) contentEl.style.height = 'auto';
        });
        const set = (open, instant = false) => {
            section.classList.toggle('is-open', open);
            if (instant || reduceMotion) {
                contentEl.style.height = open ? 'auto' : '0px';
                return;
            }
            // Measure the inner row, not wrap.scrollHeight — blur/overflow on a
            // height:0 wrap inflates scrollHeight and the header divider snaps
            // when height later goes to auto. The first child can be a [hidden]
            // empty-state (risk scenarios), so measure the first visible one.
            const inner = [...contentEl.children].find((c) => !c.hidden) || contentEl.firstElementChild;
            const from = contentEl.getBoundingClientRect().height;
            const to = open ? (inner ? inner.getBoundingClientRect().height : contentEl.scrollHeight) : 0;
            contentEl.style.height = from + 'px';
            void contentEl.offsetHeight;
            contentEl.style.height = to + 'px';
        };
        set(expanded, true);
        return set;
    }

    /* ---------- toast + row enter helpers (one-shot WAAPI) ---------- */
    function toastEnter(el) {
        if (reduceMotion) return;
        const frames = springKeyframes('modal', { y: 18, s: 0.96 }, { y: 0, s: 1 }, 400)
            .map((f, i, a) => ({ transform: `translateY(${f.y}px) scale(${f.s})`, opacity: Math.min(1, i / (a.length * 0.25)) }));
        el.animate(frames, { duration: 400, easing: 'linear' });
    }
    function rowEnter(el, delay) {
        if (reduceMotion || !el) return;
        el.animate(
            [{ opacity: 0, transform: 'translateY(-5px)', filter: 'blur(3px)' },
             { opacity: 1, transform: 'none', filter: 'blur(0)' }],
            { duration: 300, delay: delay || 0, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'both' });
    }
    /* Collapse-remove: animate a row/card away, then call done(). */
    function collapseAway(el, done) {
        if (reduceMotion) { done(); return; }
        const h = el.offsetHeight;
        el.style.overflow = 'hidden';
        el.animate(
            [{ height: h + 'px', opacity: 1, filter: 'blur(0)' },
             { height: '0px', opacity: 0, filter: 'blur(4px)' }],
            { duration: 200, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' }
        ).finished.then(done).catch(done);
    }

    /* Per-letter headline blur-in (cap-motion recipe). Words stay nowrap. */
    function letterReveal(el) {
        if (!el) return;
        const raw = el.textContent.trim();
        el.setAttribute('aria-label', raw);
        if (reduceMotion) return;
        el.textContent = '';
        el.classList.add('is-reveal');
        let i = 0;
        raw.split(/\s+/).forEach((word) => {
            const wrap = document.createElement('span');
            wrap.className = 'ltr-word';
            [...word].forEach((ch) => {
                const s = document.createElement('span');
                s.className = 'ltr-ch';
                s.textContent = ch;
                s.style.setProperty('--i', String(i++));
                wrap.appendChild(s);
            });
            el.appendChild(wrap);
        });
    }

    /* Brief attention pulse (background flash handled in CSS via class). */
    function flash(el, cls = 'flash') {
        el.classList.remove(cls);
        void el.offsetWidth; // restart
        el.classList.add(cls);
        el.addEventListener('animationend', () => el.classList.remove(cls), { once: true });
    }

    /* Color tokens live on :root. Freeze color transitions, then (when the
       API exists) crossfade two snapshots so theme / OLED / accent swaps
       do not interpolate every painted surface. */
    function freezeColors() {
        document.documentElement.classList.add('theme-switching');
    }
    function thawColors() {
        const root = document.documentElement;
        requestAnimationFrame(() => requestAnimationFrame(() => {
            if (!root.dataset.viewTransition) root.classList.remove('theme-switching');
        }));
    }
    function themeSwap(mutate) {
        const root = document.documentElement;
        const swap = () => {
            freezeColors();
            mutate();
        };
        if (reduceMotion || typeof document.startViewTransition !== 'function') {
            swap();
            thawColors();
            return Promise.resolve();
        }
        root.dataset.viewTransition = 'theme';
        let transition;
        try {
            transition = document.startViewTransition(swap);
        } catch (_) {
            swap();
            delete root.dataset.viewTransition;
            thawColors();
            return Promise.resolve();
        }
        return transition.finished.then(() => {}, () => {}).finally(() => {
            if (root.dataset.viewTransition === 'theme') delete root.dataset.viewTransition;
            root.classList.remove('theme-switching');
        });
    }

    return {
        reduceMotion, Spring, SPRINGS, makeSpring, addDriver,
        flipPill, segmented, springKeyframes,
        modalEnter, modalExit, splashEnter, roller, rollerUpdate, wobble, letterReveal,
        collapsible, toastEnter, rowEnter, collapseAway, flash,
        freezeColors, thawColors, themeSwap,
    };
})();
