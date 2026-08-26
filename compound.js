/* ============================================================
   compound.js — 10-year table + path chart + perspective
   ============================================================ */
'use strict';

const COMPOUND = (() => {
    const E = ENGINE;
    const $ = (id) => document.getElementById(id);
    const YEARS = 10;
    const BASELINE_RATE = 10;
    /* Value size is ordinal, so it gets one sequential ramp (tier 1→3), not
       three unrelated hues. The engine still names the thresholds; the map
       turns those names into ordered steps for the cell tint. */
    const TIER = { white: 1, green: 2, gold: 3 };

    let startingCapital = 10000;
    let contributionMode = null;
    let deposits = { amount: 0, frequency: 'monthly' };
    let withdrawals = { amount: 0, frequency: 'monthly' };
    let selectedRate = 50;
    let userEdited = false;
    let inspectYear = 10;
    let lastChartKey = '';
    let lastPlot = null;
    let lastWidth = 0;
    let ratesWired = false;
    let chartWired = false;
    let fillFrame = 0;
    let parseNum = (v) => {
        const n = parseFloat(String(v ?? '').replace(/[$,\s]/g, ''));
        return isFinite(n) ? n : null;
    };

    function annualContribution() {
        return E.compoundAnnualContribution(contributionMode, deposits, withdrawals);
    }

    function perspective() {
        return E.compoundPerspective(startingCapital, selectedRate, YEARS, annualContribution());
    }

    function formatCompact(value) {
        if (!E.isNum(value)) return '—';
        const sign = value < 0 ? '−' : '';
        const abs = Math.abs(value);
        if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(1)}B`;
        if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
        if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}K`;
        return `${sign}$${abs.toFixed(0)}`;
    }

    function formatExact(value) {
        if (!E.isNum(value)) return '—';
        return `$${Math.round(value).toLocaleString('en-US')}`;
    }

    function formatMultiplier(value) {
        if (!startingCapital) return '—';
        const multiplier = value / startingCapital;
        if (multiplier >= 1e6) return `${(multiplier / 1e6).toFixed(1)}M×`;
        if (multiplier >= 1e3) return `${Math.round(multiplier / 1e3).toLocaleString('en-US')}K×`;
        if (multiplier >= 10) return `${Math.round(multiplier).toLocaleString('en-US')}×`;
        return `${multiplier.toFixed(1)}×`;
    }

    function formatPct(n, dp = 2) {
        if (!E.isNum(n)) return '—';
        return `${n.toFixed(dp)}%`;
    }

    function formatYearMark(n) {
        if (n === null) return 'Past 40 yrs';
        if (n === 0) return 'Already there';
        return `Year ${n}`;
    }

    /* A year mark only earns the "table stops at year 10" caveat when the
       answer actually lands past the table. */
    function yearMarkSub(n, within, beyond, already) {
        if (n === 0) return already;
        if (n === null) return 'not within 40 years at this rate';
        return n > YEARS ? beyond : within;
    }

    function reduceMotion() {
        return !!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    }

    function easeInOutCubic(t) {
        return t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2;
    }

    /* Width clip, not a scaled fill — scaleX would squash the area. */
    function playFill(el, fullWidth) {
        cancelAnimationFrame(fillFrame);
        if (!el) return;
        if (reduceMotion()) {
            el.setAttribute('width', fullWidth);
            return;
        }
        const start = performance.now();
        const tick = (now) => {
            const t = Math.min(1, Math.max(0, (now - start - 60) / 900));
            el.setAttribute('width', (fullWidth * easeInOutCubic(t)).toFixed(1));
            if (t < 1) fillFrame = requestAnimationFrame(tick);
        };
        el.setAttribute('width', '0');
        fillFrame = requestAnimationFrame(tick);
    }

    function token(name) {
        return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    }

    function updatePresetStates() {
        document.querySelectorAll('#compoundPresets [data-capital]').forEach((btn) => {
            btn.classList.toggle('is-active', Number(btn.dataset.capital) === startingCapital);
        });
    }

    function updateModeUI() {
        document.querySelectorAll('#contributionModeToggle [data-mode]').forEach((btn) => {
            btn.classList.toggle('is-active', btn.dataset.mode === contributionMode);
        });
        const showDeposits = contributionMode === 'deposits' || contributionMode === 'both';
        const showWithdrawals = contributionMode === 'withdrawals' || contributionMode === 'both';
        const wrap = $('contributionFieldsWrapper');
        if (wrap) wrap.hidden = !(showDeposits || showWithdrawals);
        if ($('depositFields')) $('depositFields').hidden = !showDeposits;
        if ($('withdrawalFields')) $('withdrawalFields').hidden = !showWithdrawals;
    }

    function setRate(rate) {
        if (!E.COMPOUND_RATES.includes(rate)) return;
        selectedRate = rate;
        render();
        /* Only an explicit rate pick reveals its column — re-rendering on a
           capital keystroke should not yank the table sideways. */
        scrollSelectedIntoView();
    }

    function setInspectYear(year) {
        const next = Math.max(0, Math.min(YEARS, year));
        if (next === inspectYear) return;
        inspectYear = next;
        renderChart(perspective());
    }

    function yearFromPointer(e) {
        const svg = $('compoundChart')?.querySelector('svg');
        if (!svg || !lastPlot) return null;
        const rect = svg.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const scale = rect.width / lastWidth;
        const year = Math.round(((x / scale) - lastPlot.l) / lastPlot.w * YEARS);
        return Math.max(0, Math.min(YEARS, year));
    }

    function renderRates() {
        const el = $('compoundRates');
        if (!el) return;
        if (!ratesWired) {
            el.innerHTML = E.COMPOUND_RATES.map((rate) =>
                `<button type="button" class="btn btn-ghost btn-sm" data-rate="${rate}">${rate}%</button>`
            ).join('');
            el.addEventListener('click', (e) => {
                const btn = e.target.closest('[data-rate]');
                if (btn) setRate(Number(btn.dataset.rate));
            });
            ratesWired = true;
        }
        el.querySelectorAll('[data-rate]').forEach((btn) => {
            btn.classList.toggle('is-active', Number(btn.dataset.rate) === selectedRate);
        });
    }

    function updateScrubChrome(p) {
        const pt = p.path[inspectYear] || p.path[p.path.length - 1];
        const title = $('compoundChartTitle');
        if (title) {
            title.textContent = inspectYear === 0
                ? `Today · ${formatExact(pt.value)}`
                : `Year ${inspectYear} · ${formatCompact(pt.value)}`;
        }
        const slider = $('compoundYearScrub');
        if (slider && Number(slider.value) !== inspectYear) slider.value = String(inspectYear);
        if ($('compoundYearRead')) $('compoundYearRead').textContent = inspectYear === 0 ? 'Now' : `Y${inspectYear}`;
        const rail = $('compoundYearRail');
        if (rail) rail.style.setProperty('--scrub', String(inspectYear / YEARS));
    }

    /* v1 ran the rate headers up a cool→hot ramp to say "left is plausible,
       right is fantasy". The cell wash now carries that, so a second ramp on
       the headers would double-encode the same variable — the headers stay
       neutral and let the heat in the body do the talking. */
    function renderHeader() {
        const row = document.querySelector('#compoundTable thead tr');
        if (!row) return;
        let html = '<th class="compound-th compound-th--year" scope="col">Year</th>';
        E.COMPOUND_RATES.forEach((rate) => {
            const selected = rate === selectedRate ? ' is-selected' : '';
            html += `<th class="compound-th${selected}" scope="col" data-rate="${rate}"`
                + ` aria-pressed="${rate === selectedRate}"`
                + ` title="Read the ${rate}% path below">${rate}%</th>`;
        });
        row.innerHTML = html;
    }

    /* ---------- table chrome: hover column, edge fades, keep the selected
       column reachable (14 rate columns never fit at once) ---------- */
    function setHotColumn(rate) {
        const table = $('compoundTable');
        if (!table) return;
        table.querySelectorAll('.is-hot').forEach((el) => el.classList.remove('is-hot'));
        if (rate === null || rate === undefined) return;
        table.querySelectorAll(`[data-rate="${rate}"]`).forEach((el) => el.classList.add('is-hot'));
    }

    function updateTableEdges() {
        const wrap = $('compoundTableScroll');
        const frame = wrap?.parentElement;
        if (!wrap || !frame) return;
        const maxScroll = wrap.scrollWidth - wrap.clientWidth;
        frame.dataset.edgeStart = wrap.scrollLeft > 2 ? 'on' : 'off';
        frame.dataset.edgeEnd = wrap.scrollLeft < maxScroll - 2 ? 'on' : 'off';
        const more = $('compoundTableMore');
        if (more) more.hidden = maxScroll <= 2;
    }

    function scrollSelectedIntoView() {
        const wrap = $('compoundTableScroll');
        const th = wrap?.querySelector('.compound-th.is-selected');
        /* clientWidth is 0 while the view is still hidden — measuring then
           would scroll the table off its natural start on first paint. */
        if (!wrap || !th || !wrap.clientWidth) return;
        const stickyW = wrap.querySelector('.compound-th--year')?.offsetWidth || 0;
        const pad = 12;
        const near = th.offsetLeft - stickyW - pad;
        const far = th.offsetLeft + th.offsetWidth + pad - wrap.clientWidth;
        let target = wrap.scrollLeft;
        if (near < wrap.scrollLeft) target = near;
        else if (far > wrap.scrollLeft) target = far;
        target = Math.max(0, Math.min(target, wrap.scrollWidth - wrap.clientWidth));
        if (Math.abs(target - wrap.scrollLeft) < 1) return updateTableEdges();
        wrap.scrollTo({ left: target, behavior: reduceMotion() ? 'auto' : 'smooth' });
    }

    function renderBody() {
        const body = $('compoundTableBody');
        if (!body) return;
        const contrib = annualContribution();
        let html = '';
        for (let year = 1; year <= YEARS; year++) {
            html += '<tr>';
            html += `<th class="compound-cell compound-cell--year" scope="row">${year}</th>`;
            E.COMPOUND_RATES.forEach((rate) => {
                const value = E.compoundValue(startingCapital, rate, year, contrib);
                const selected = rate === selectedRate ? ' is-selected' : '';
                html += `<td class="compound-cell${selected}" data-tier="${TIER[E.compoundGlow(value)] || 0}" data-rate="${rate}">${formatCompact(value)}</td>`;
            });
            html += '</tr>';
        }
        body.innerHTML = html;
    }

    function renderHero(p) {
        /* The outcome is the headline; the rate you picked is the caption. */
        if ($('compoundHeroEnd')) {
            $('compoundHeroEnd').innerHTML = `<span class="compound-hero-value">${formatCompact(p.yEnd)}</span><span class="compound-hero-meta">after 10 years</span>`;
        }
        if ($('compoundHeroRate')) {
            $('compoundHeroRate').innerHTML = `<span class="hi hi-accent">${selectedRate}% a year</span> on ${formatExact(startingCapital)} · ${formatMultiplier(p.yEnd)} your starting capital`;
        }
        if ($('compoundHeroPace')) {
            $('compoundHeroPace').textContent = `That pace is ${formatPct(p.monthlyPct)} a month, or ${formatPct(p.sessionPct)} a session across 252 sessions — every year, with no down years.`;
        }

        const split = $('compoundSplit');
        if (!split) return;
        const showSplit = Math.abs(p.added) > 0;
        split.hidden = !showSplit;
        if (!showSplit) return;
        const total = Math.abs(p.growth) + Math.abs(p.added);
        const growthShare = total ? Math.max(0, p.growth) / total : 0;
        const addedLabel = p.added >= 0 ? 'You add' : 'You withdraw';
        split.innerHTML = `
            <div class="compound-split-bar" aria-hidden="true">
                <span class="compound-split-growth" style="width:${Math.round(growthShare * 100)}%"></span>
            </div>
            <div class="compound-split-copy">
                ${addedLabel} ${formatCompact(Math.abs(p.added))} · growth creates <span class="hi hi-gain">${formatCompact(p.growth)}</span>
            </div>
        `;
    }

    function renderMetrics(p) {
        const el = $('compoundMetrics');
        if (!el) return;
        const items = [
            { label: 'Monthly pace', value: formatPct(p.monthlyPct), sub: `${formatPct(p.weeklyPct)} a week` },
            {
                label: 'Doubles your money', value: formatYearMark(p.yearsToDouble),
                sub: yearMarkSub(p.yearsToDouble, `from ${formatExact(p.start)}`, 'past year 10', 'already there'),
            },
            {
                label: 'Reaches $100K', value: formatYearMark(p.yearsTo100k),
                sub: yearMarkSub(p.yearsTo100k, 'inside the table', 'past year 10', 'already there'),
            },
            {
                label: 'Reaches $1M', value: formatYearMark(p.yearsTo1m),
                sub: yearMarkSub(p.yearsTo1m, 'inside the table', 'past year 10', 'already there'),
            },
            { label: 'Gain in year 10 alone', value: formatCompact(p.yearEndGain), sub: `${formatCompact(p.yearEndGain / 12)} a month that year`, tone: 'gain' },
            { label: 'Years 8–10', value: `${Math.round(p.backload * 100)}% of the gain`, sub: 'last 3 years carry the run', tone: 'accent' },
        ];
        el.innerHTML = items.map((item) => `
            <div class="compound-stat"${item.tone ? ` data-tone="${item.tone}"` : ''}>
                <span class="compound-stat-label">${item.label}</span>
                <span class="compound-stat-value">${item.value}</span>
                <span class="compound-stat-sub">${item.sub}</span>
            </div>
        `).join('');
    }

    function renderReads(p) {
        const el = $('compoundReads');
        if (!el) return;
        const reads = [
            {
                title: 'Stay the course',
                body: `Year 5 is ${formatCompact(p.y5)}. Year 10 is ${formatCompact(p.yEnd)} — <span class="hi hi-gain">${formatCompact(p.stayCourse)}</span> more if you stay.`,
            },
        ];
        if (p.vsBaseline !== null) {
            reads.push({
                title: `Versus ${BASELINE_RATE}%`,
                body: `A quiet ${BASELINE_RATE}% path finishes at ${formatCompact(p.baseline)}. ${selectedRate}% is <span class="hi hi-accent">${formatCompact(p.vsBaseline)}</span> more.`,
            });
        }
        if (p.vsPrev !== null) {
            reads.push({
                title: `${p.prevRate}% vs ${selectedRate}%`,
                body: `One column back, ${p.prevRate}% finishes at ${formatCompact(p.yEnd - p.vsPrev)} — <span class="hi hi-accent">${formatCompact(p.vsPrev)}</span> behind by year 10.`,
            });
        }
        reads.push({
            title: 'One blown year',
            body: `If year 3 is −30% instead of +${selectedRate}%, year 10 is ${formatCompact(p.shocked)} — <span class="hi hi-loss">${formatCompact(p.shockGap)}</span> left on the table.`,
            tone: 'loss',
        });
        el.innerHTML = reads.map((read) => `
            <div class="compound-read"${read.tone ? ` data-tone="${read.tone}"` : ''}>
                <span class="compound-stat-label">${read.title}</span>
                <p>${read.body}</p>
            </div>
        `).join('');
    }

    function polyline(points) {
        return points.map((pt, i) => `${i ? 'L' : 'M'}${pt.x.toFixed(1)},${pt.y.toFixed(1)}`).join(' ');
    }

    function areaPath(points, yBase) {
        if (!points.length) return '';
        const line = polyline(points);
        const last = points[points.length - 1];
        const first = points[0];
        return `${line} L${last.x.toFixed(1)},${yBase.toFixed(1)} L${first.x.toFixed(1)},${yBase.toFixed(1)} Z`;
    }

    /* Shared y-scale — mapping each path against its own max made the 10%
       baseline finish level with the selected rate, which is the opposite
       of the point. A mild power keeps that gap honest while giving the
       quiet path enough rise to read as a curve, not a floor. */
    const Y_LIFT = 0.7;

    function scaleY(value, max) {
        if (!(max > 0)) return 0;
        return Math.pow(Math.max(0, value) / max, Y_LIFT);
    }

    function mapPoints(path, plot, max) {
        return path.map((pt) => ({
            year: pt.year,
            value: pt.value,
            x: plot.l + (pt.year / YEARS) * plot.w,
            y: plot.t + (1 - scaleY(pt.value, max)) * plot.h,
        }));
    }

    function prepareChartData(p, plot) {
        const baselineRaw = p.baseline === null ? null
            : E.compoundPath(startingCapital, BASELINE_RATE, YEARS, annualContribution());
        const max = Math.max(
            ...p.path.map((pt) => pt.value),
            ...(baselineRaw ? baselineRaw.map((pt) => pt.value) : []),
            1,
        );
        const selected = mapPoints(p.path, plot, max);
        const baselinePath = baselineRaw ? mapPoints(baselineRaw, plot, max) : null;
        const yTicks = [0, 0.5, 1].map((t) => ({
            value: max * t,
            y: plot.t + (1 - scaleY(max * t, max)) * plot.h,
        }));
        return { selected, baselinePath, yTicks, max };
    }

    function getChartColors() {
        return {
            accent: token('--accent') || '#1a365d',
            muted: token('--text-2') || '#3f3f46',
            ink: token('--text-2') || '#3f3f46',
            grid: token('--border') || '#e4e4e7',
            soft: token('--accent-soft') || 'rgba(26, 54, 93, 0.08)',
            surface: token('--surface') || '#ffffff'
        };
    }

    function updateChartLegend(p) {
        if ($('compoundChartLegend')) {
            $('compoundChartLegend').innerHTML = p.baseline === null
                ? `<span class="lg lg-sel">${selectedRate}% a year</span>`
                : `<span class="lg lg-sel">${selectedRate}% a year</span><span class="lg lg-base">${BASELINE_RATE}% for comparison</span>`;
        }
    }

    function renderChart(p) {
        const host = $('compoundChart');
        if (!host) return;
        const width = Math.max(host.clientWidth || 560, 280);
        const height = 236;
        const plot = { l: 62, r: 14, t: 16, b: 32, w: width - 76, h: height - 48 };
        const { selected, baselinePath, yTicks } = prepareChartData(p, plot);
        const colors = getChartColors();
        lastPlot = plot;
        lastWidth = width;
        const chartKey = `${selectedRate}|${startingCapital}|${annualContribution()}`;
        const shouldDraw = chartKey !== lastChartKey;
        lastChartKey = chartKey;
        const activePt = selected.find((pt) => pt.year === inspectYear) || selected[selected.length - 1];
        const basePt = baselinePath?.find((pt) => pt.year === inspectYear) || null;
        updateScrubChrome(p);
        updateChartLegend(p);
        const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
        const draw = !reduce && shouldDraw ? ' is-draw' : '';
        const fillW = shouldDraw && !reduce ? 0 : plot.w;
        host.innerHTML = `
            <svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" role="img" aria-label="${selectedRate}% path versus ${BASELINE_RATE}%">
                <line x1="${plot.l}" x2="${plot.l + plot.w}" y1="${plot.t + plot.h}" y2="${plot.t + plot.h}" stroke="${colors.grid}" stroke-width="1"/>
                ${yTicks.map((tick) => `
                    ${tick.value ? `<line x1="${plot.l}" x2="${plot.l + plot.w}" y1="${tick.y}" y2="${tick.y}" stroke="${colors.grid}" stroke-width="1"/>` : ''}
                    <text class="compound-axis" x="${plot.l - 10}" y="${tick.y + 4}" text-anchor="end" fill="${colors.ink}">${tick.value ? formatCompact(tick.value) : '$0'}</text>
                `).join('')}
                ${[0, 5, 10].map((year) => {
                    const x = plot.l + (year / YEARS) * plot.w;
                    const anchor = year === 0 ? 'start' : year === 10 ? 'end' : 'middle';
                    return `<text class="compound-axis" x="${x}" y="${height - 8}" text-anchor="${anchor}" fill="${colors.ink}">${year === 0 ? 'Now' : `Y${year}`}</text>`;
                }).join('')}
                ${baselinePath ? `<path d="${polyline(baselinePath)}" fill="none" stroke="${colors.muted}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>` : ''}
                <svg class="compound-reveal-fill" x="${plot.l}" y="0" width="${fillW}" height="${height}" overflow="hidden">
                    <g transform="translate(${-plot.l}, 0)">
                        <path class="compound-area" d="${areaPath(selected, plot.t + plot.h)}" fill="${colors.soft}"/>
                    </g>
                </svg>
                <path class="compound-line${draw}" pathLength="1" d="${polyline(selected)}" fill="none" stroke="${colors.accent}" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"/>
                ${activePt ? `
                    <line class="compound-scrub-rule" x1="${activePt.x}" x2="${activePt.x}" y1="${plot.t}" y2="${plot.t + plot.h}" stroke="${colors.accent}" stroke-opacity="0.35"/>
                    ${basePt ? `
                        <g class="compound-handle compound-handle-base" transform="translate(${basePt.x}, ${basePt.y})">
                            <circle r="4.5" fill="${colors.surface}" stroke="${colors.muted}" stroke-width="1.75"/>
                        </g>
                    ` : ''}
                    <g class="compound-handle" transform="translate(${activePt.x}, ${activePt.y})">
                        <circle r="13" fill="${colors.accent}" fill-opacity="0.16"/>
                        <circle r="8" fill="${colors.surface}" stroke="${colors.accent}" stroke-width="2.5"/>
                        <circle r="3.2" fill="${colors.accent}"/>
                    </g>
                ` : ''}
            </svg>
        `;
        if (shouldDraw) playFill(host.querySelector('.compound-reveal-fill'), plot.w);
        renderTip(activePt, basePt, width);
    }

    function renderTip(activePt, basePt, width) {
        const host = $('compoundChart');
        if (!host || !activePt) return;
        let tip = $('compoundTip');
        if (!tip) {
            tip = document.createElement('div');
            tip.id = 'compoundTip';
            tip.className = 'compound-tip';
            tip.setAttribute('role', 'status');
            host.appendChild(tip);
        }
        const yearLabel = inspectYear === 0 ? 'Now' : `Year ${inspectYear}`;
        let rows = `<div class="compound-tip-row"><span class="lg lg-sel">${selectedRate}%</span><b>${formatExact(activePt.value)}</b></div>`;
        if (basePt) {
            const gap = activePt.value - basePt.value;
            const sign = gap >= 0 ? '+' : '−';
            rows += `<div class="compound-tip-row"><span class="lg lg-base">${BASELINE_RATE}%</span><b>${formatExact(basePt.value)}</b></div>`;
            rows += `<div class="compound-tip-gap">${sign}${formatExact(Math.abs(gap))} vs ${BASELINE_RATE}%</div>`;
        } else {
            rows += `<div class="compound-tip-gap">${formatMultiplier(activePt.value)} start</div>`;
        }
        tip.innerHTML = `<div class="compound-tip-year">${yearLabel}</div>${rows}`;
        tip.style.left = `${activePt.x}px`;
        tip.style.top = `${activePt.y}px`;
        tip.classList.toggle('is-left', activePt.x > width * 0.62);
        tip.classList.toggle('is-below', activePt.y < 78);
    }

    function render() {
        if (!$('compoundView')) return;
        const p = perspective();
        updatePresetStates();
        updateModeUI();
        renderRates();
        renderHero(p);
        renderChart(p);
        renderMetrics(p);
        renderReads(p);
        renderHeader();
        renderBody();
        updateTableEdges();
    }

    function setCapital(n, fromUser) {
        if (!n || n <= 0) return;
        startingCapital = n;
        if (fromUser) userEdited = true;
        const input = $('compoundStartingCapital');
        if (input) input.value = n.toLocaleString('en-US');
        render();
    }

    function syncAccount(n) {
        if (userEdited) return;
        if (n && n > 0) setCapital(n, false);
    }

    function init(opts = {}) {
        if (typeof opts.parseNum === 'function') parseNum = opts.parseNum;
        if (opts.account) startingCapital = opts.account;
        const input = $('compoundStartingCapital');
        if (input) input.value = startingCapital.toLocaleString('en-US');
        /* Same live k/m + comma pass as account size — expand while focused. */
        if (typeof opts.bindMoneyNotation === 'function') {
            opts.bindMoneyNotation(input);
            opts.bindMoneyNotation($('depositAmount'));
            opts.bindMoneyNotation($('withdrawalAmount'));
        }

        input?.addEventListener('input', () => {
            const n = parseNum(input.value);
            if (n && n > 0) { startingCapital = n; userEdited = true; render(); }
        });
        input?.addEventListener('blur', () => {
            const n = parseNum(input.value);
            if (n && n > 0) setCapital(n, true);
        });

        $('compoundPresets')?.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-capital]');
            if (!btn) return;
            setCapital(Number(btn.dataset.capital), true);
        });

        $('contributionModeToggle')?.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-mode]');
            if (!btn) return;
            contributionMode = contributionMode === btn.dataset.mode ? null : btn.dataset.mode;
            render();
        });

        $('depositAmount')?.addEventListener('input', () => {
            deposits.amount = parseNum($('depositAmount').value) || 0;
            render();
        });
        $('depositAmount')?.addEventListener('blur', () => {
            if (deposits.amount) $('depositAmount').value = deposits.amount.toLocaleString('en-US');
        });
        $('depositFrequency')?.addEventListener('change', () => {
            deposits.frequency = $('depositFrequency').value;
            render();
        });
        $('withdrawalAmount')?.addEventListener('input', () => {
            withdrawals.amount = parseNum($('withdrawalAmount').value) || 0;
            render();
        });
        $('withdrawalAmount')?.addEventListener('blur', () => {
            if (withdrawals.amount) $('withdrawalAmount').value = withdrawals.amount.toLocaleString('en-US');
        });
        $('withdrawalFrequency')?.addEventListener('change', () => {
            withdrawals.frequency = $('withdrawalFrequency').value;
            render();
        });

        $('compoundTable')?.addEventListener('click', (e) => {
            const cell = e.target.closest('[data-rate]');
            if (!cell) return;
            setRate(Number(cell.dataset.rate));
        });

        $('compoundTable')?.addEventListener('mouseover', (e) => {
            const cell = e.target.closest('[data-rate]');
            setHotColumn(cell ? cell.dataset.rate : null);
        });
        $('compoundTable')?.addEventListener('mouseleave', () => setHotColumn(null));
        $('compoundTableScroll')?.addEventListener('scroll', updateTableEdges, { passive: true });
        new ResizeObserver(updateTableEdges).observe($('compoundTableScroll') || document.body);

        const clearSelect = () => window.getSelection()?.removeAllRanges();
        const card = $('compoundChart')?.closest('.compound-chart-card');
        const setInspecting = (on) => card?.classList.toggle('is-inspecting', on);
        $('compoundYearScrub')?.addEventListener('pointerdown', () => {
            clearSelect();
            setInspecting(true);
        });
        $('compoundYearScrub')?.addEventListener('input', (e) => {
            clearSelect();
            setInspecting(true);
            setInspectYear(Number(e.target.value));
        });
        window.addEventListener('pointerup', () => setInspecting(false));

        if (!chartWired && $('compoundChart')) {
            const host = $('compoundChart');
            host.addEventListener('pointerdown', (e) => {
                if (e.target.closest('input')) return;
                window.getSelection()?.removeAllRanges();
                host.setPointerCapture(e.pointerId);
                host.closest('.compound-chart-card')?.classList.add('is-inspecting');
                host.classList.add('is-dragging');
                const year = yearFromPointer(e);
                if (year !== null) setInspectYear(year);
            });
            /* Scrub only while the pointer is held. Reacting to a bare mouse
               move meant the year readout changed as the cursor crossed the
               card on its way somewhere else. */
            host.addEventListener('pointermove', (e) => {
                if (!host.hasPointerCapture(e.pointerId)) return;
                const year = yearFromPointer(e);
                if (year !== null) setInspectYear(year);
            });
            host.addEventListener('pointerup', (e) => {
                if (host.hasPointerCapture(e.pointerId)) host.releasePointerCapture(e.pointerId);
                host.classList.remove('is-dragging');
                host.closest('.compound-chart-card')?.classList.remove('is-inspecting');
            });
            chartWired = true;
        }

        new ResizeObserver(() => { if (!$('compoundView')?.hidden) renderChart(perspective()); })
            .observe($('compoundChart') || document.body);

        new MutationObserver(() => { if (!$('compoundView')?.hidden) renderChart(perspective()); })
            .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'style'] });

        render();
    }

    return { init, render, syncAccount };
})();
