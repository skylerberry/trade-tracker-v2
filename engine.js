/* ============================================================
   engine.js — Trade Tracker 2.0 pure math / data contracts
   Port of the binding contracts in docs/WIREFRAME_SPEC.md §10.
   v1-compatible trade shape (missing direction migrates to long):
     { id, ticker, direction, entryPrice, initialSL, currentSL, entryDate,
       shares, exits: [{id, shares, price, date, rMultiple, kind, estimated?}],
       sellPlan: { enabled, preset, initialShares, targets: [...] },
       snapshot, archived, archivedAt, journal: [...] }
   null = "unknown" — never NaN, never a guessed number.
   ============================================================ */
'use strict';

const ENGINE = (() => {

    const round4 = (n) => Math.round(n * 10000) / 10000;
    const round2 = (n) => Math.round(n * 100) / 100;
    const isNum = (n) => typeof n === 'number' && isFinite(n);
    const directionOf = (tradeOrDirection) =>
        (typeof tradeOrDirection === 'string' ? tradeOrDirection : tradeOrDirection?.direction) === 'short' ? 'short' : 'long';
    const directionSign = (tradeOrDirection) => directionOf(tradeOrDirection) === 'short' ? -1 : 1;
    const journalKinds = new Set(['thesis', 'update', 'review', 'lesson', 'note']);

    function validIso(value) {
        if (!value) return null;
        const date = new Date(value);
        return Number.isFinite(date.getTime()) ? date.toISOString() : null;
    }

    function normalizeJournal(trade) {
        const fallback = validIso(trade?.updatedAt)
            || validIso(trade?.createdAt)
            || validIso(trade?.entryDate ? `${trade.entryDate}T12:00:00Z` : null)
            || new Date().toISOString();
        const journal = (Array.isArray(trade?.journal) ? trade.journal : []).map((entry, index) => {
            const text = String(entry?.text ?? entry?.body ?? '').trim();
            if (!text) return null;
            return {
                id: String(entry?.id || `jn-${trade?.id || 'trade'}-${index}`),
                kind: journalKinds.has(entry?.kind) ? entry.kind : 'update',
                text,
                createdAt: validIso(entry?.createdAt) || fallback,
                updatedAt: validIso(entry?.updatedAt),
                ...(entry?.migrated ? { migrated: true } : {}),
            };
        }).filter(Boolean);

        const legacyText = String(trade?.notes || '').trim();
        const legacyId = `jn-legacy-${trade?.id || 'trade'}`;
        if (legacyText && !journal.some(entry => entry.id === legacyId)) {
            journal.push({
                id: legacyId,
                kind: 'note',
                text: legacyText,
                createdAt: fallback,
                updatedAt: null,
                migrated: true,
            });
        }
        return journal;
    }
    const directionalMove = (entry, price, tradeOrDirection = 'long') =>
        isNum(entry) && isNum(price) ? round4((price - entry) * directionSign(tradeOrDirection)) : null;

    /* ---------- dates: YYYY-MM-DD parsed AND written as LOCAL time ---------- */
    function todayLocalISO() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
    function parseLocalDate(iso) {
        if (!iso || typeof iso !== 'string') return null;
        const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (!m) return null;
        return new Date(+m[1], +m[2] - 1, +m[3]);
    }
    function fmtDateShort(iso) {
        const d = parseLocalDate(iso);
        if (!d) return '—';
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    /* ---------- risk per share (cents-normalized) ---------- */
    function riskPerShare(entry, initialStop, direction = 'long') {
        if (!isNum(entry) || !isNum(initialStop)) return null;
        const rps = round4((entry - initialStop) * directionSign(direction));
        return rps > 0 ? rps : null;
    }
    function tradeRiskPerShare(trade) {
        return riskPerShare(trade?.entryPrice, trade?.initialSL, trade);
    }
    function computeExitR(trade, price) {
        const rps = tradeRiskPerShare(trade);
        if (rps === null || !isNum(price)) return null;
        return round4(directionalMove(trade.entryPrice, price, trade) / rps);
    }

    /* ---------- share accounting ---------- */
    function getOriginalShares(trade) {
        if (isNum(trade?.shares) && trade.shares > 0) return trade.shares;
        if (isNum(trade?.snapshot?.shares) && trade.snapshot.shares > 0) return trade.snapshot.shares;
        if (isNum(trade?.sellPlan?.initialShares) && trade.sellPlan.initialShares > 0) return trade.sellPlan.initialShares;
        return null;
    }
    function soldShares(trade) {
        if (!Array.isArray(trade?.exits)) return 0;
        return trade.exits.reduce((s, x) => s + (isNum(x.shares) ? x.shares : 0), 0);
    }
    function getRemainingShares(trade) {
        const orig = getOriginalShares(trade);
        if (orig === null) return null;
        return Math.max(0, orig - soldShares(trade));
    }

    /* ---------- P&L / R ---------- */
    function getRealizedPnL(trade) {
        if (!isNum(trade?.entryPrice)) return null;
        if (!Array.isArray(trade?.exits) || trade.exits.length === 0) return 0; // known zero
        let pnl = 0;
        for (const x of trade.exits) {
            if (!isNum(x.shares) || !isNum(x.price)) return null;
            pnl += x.shares * directionalMove(trade.entryPrice, x.price, trade);
        }
        return round2(pnl);
    }
    /* Realized R relative to ORIGINAL risk (shares × rps). */
    function getRealizedR(trade) {
        const pnl = getRealizedPnL(trade);
        const rps = tradeRiskPerShare(trade);
        const orig = getOriginalShares(trade);
        if (pnl === null || rps === null || orig === null || orig === 0) return null;
        return round4(pnl / (rps * orig));
    }

    /* ---------- open risk / freeroll ---------- */
    function currentStop(trade) {
        if (isNum(trade?.currentSL) && trade.currentSL > 0) return trade.currentSL;
        if (isNum(trade?.initialSL) && trade.initialSL > 0) return trade.initialSL;
        return null;
    }
    /* Remaining open risk at current stop, net of realized P&L. Freeroll = ≤ 0. */
    function getOpenRiskDollars(trade) {
        const remaining = getRemainingShares(trade);
        const stop = currentStop(trade);
        if (remaining === null || remaining === 0 || stop === null || !isNum(trade?.entryPrice)) return null;
        const riskAtStop = remaining * -directionalMove(trade.entryPrice, stop, trade);
        const pnl = getRealizedPnL(trade);
        const net = riskAtStop - (pnl === null ? 0 : pnl);
        return round2(Math.max(0, net));
    }
    function isFreeRolled(trade) {
        const remaining = getRemainingShares(trade);
        if (remaining === null || remaining === 0) return false;
        const stop = currentStop(trade);
        if (stop !== null && isNum(trade?.entryPrice)) {
            const riskAtStop = remaining * -directionalMove(trade.entryPrice, stop, trade);
            const pnl = getRealizedPnL(trade);
            if (pnl !== null && pnl >= riskAtStop) return true;
            if (riskAtStop <= 0) return true; // stop at/beyond entry in the profitable direction
        }
        if (trade.sellPlan?.enabled && Array.isArray(trade.sellPlan.targets) &&
            trade.sellPlan.targets.some(t => t.status === 'executed' && t.rLevel !== 'exit')) return true;
        return false;
    }

    /* ---------- derived status (never user-set) ---------- */
    function deriveStatus(trade) {
        if (trade.archived) return 'archived';
        const remaining = getRemainingShares(trade);
        const hasExits = Array.isArray(trade.exits) && trade.exits.length > 0;
        if (remaining === 0 && hasExits) {
            const last = trade.exits[trade.exits.length - 1];
            if (last && isNum(last.price) && isNum(trade.initialSL) &&
                (last.price - trade.initialSL) * directionSign(trade) <= 0) return 'stopped';
            return 'closed';
        }
        if (hasExits) return 'partial';
        if (isFreeRolled(trade)) return 'freerolled';
        return 'open';
    }
    function statusLabel(s, trade) {
        if (s === 'open' && trade && isFreeRolled(trade)) return 'Freerolled';
        return { open: 'Open', freerolled: 'Freerolled', partial: 'Partial', closed: 'Closed', stopped: 'Stopped out', archived: 'Archived' }[s] || s;
    }

    /* ---------- calculator ---------- */
    function calcPosition({ account, riskPct, maxPct, entry, stop, target, direction = 'long' }) {
        const out = { valid: false };
        if (!isNum(account) || account <= 0 || !isNum(entry) || entry <= 0 || !isNum(stop) || stop <= 0) return out;
        direction = directionOf(direction);
        const sign = directionSign(direction);
        const rps = riskPerShare(entry, stop, direction);
        if (rps === null) return { valid: false, invalidStop: true, direction };
        const riskDollars = account * (riskPct / 100);
        const rawShares = Math.floor(riskDollars / rps);
        const maxShares = isNum(maxPct) ? Math.floor((account * maxPct / 100) / entry) : Infinity;
        const shares = Math.max(0, Math.min(rawShares, maxShares));
        const capped = rawShares > shares;
        const posSize = shares * entry;
        const totalRisk = shares * rps;
        const res = {
            valid: shares > 0, direction, rps, rawShares, shares, capped,
            posSize, totalRisk,
            totalRiskPct: account ? (totalRisk / account) * 100 : null,
            pctOfAccount: account ? (posSize / account) * 100 : null,
            stopDistPct: (rps / entry) * 100,
            rPrices: [1, 2, 3, 4, 5].map(r => round2(entry + sign * rps * r)),
        };
        if (isNum(target) && target > 0) {
            const targetMove = directionalMove(entry, target, direction);
            res.target = {
                price: target,
                perShare: targetMove,
                profit: round2(shares * targetMove),
                roi: posSize ? (shares * targetMove / posSize) * 100 : null,
                rr: round2(targetMove / rps),
            };
        }
        return res;
    }

    /* Purchased call/put sizing from a manually entered entry delta. This is
       deliberately a first-order estimate, capped by premium paid. */
    function calcOptionPosition({ account, riskPct, maxPct, entry, stop, delta, premium, direction = 'long', multiplier = 100 }) {
        const base = calcPosition({ account, riskPct, maxPct: 100, entry, stop, direction });
        if (!base.rps) return { valid: false, invalidStop: !!base.invalidStop, direction: directionOf(direction) };
        const absDelta = Math.abs(delta);
        if (!isNum(delta) || absDelta <= 0 || absDelta > 1) return { valid: false, invalidDelta: true, direction: directionOf(direction), rps: base.rps };
        if (!isNum(premium) || premium <= 0) return { valid: false, invalidPremium: true, direction: directionOf(direction), rps: base.rps };
        if (!isNum(multiplier) || multiplier <= 0) return { valid: false, invalidMultiplier: true, direction: directionOf(direction), rps: base.rps };

        const riskBudget = account * (riskPct / 100);
        const estimatedPremiumLoss = Math.min(premium, absDelta * base.rps);
        const riskPerContract = round2(estimatedPremiumLoss * multiplier);
        const premiumPerContract = round2(premium * multiplier);
        const rawContracts = riskPerContract > 0 ? Math.floor(riskBudget / riskPerContract) : 0;
        const maxAllocation = isNum(maxPct) ? account * maxPct / 100 : Infinity;
        const maxContracts = premiumPerContract > 0 ? Math.floor(maxAllocation / premiumPerContract) : 0;
        const contracts = Math.max(0, Math.min(rawContracts, maxContracts));
        const totalRisk = round2(contracts * riskPerContract);
        const premiumOutlay = round2(contracts * premiumPerContract);
        return {
            valid: contracts > 0,
            direction: directionOf(direction), optionType: directionOf(direction) === 'short' ? 'put' : 'call',
            multiplier, delta: absDelta, premium, rps: base.rps, stopDistPct: base.stopDistPct,
            riskBudget, estimatedPremiumLoss, riskPerContract, premiumPerContract,
            rawContracts, maxContracts, contracts,
            capped: rawContracts > contracts,
            limitedBy: maxContracts < rawContracts ? 'allocation' : 'risk',
            totalRisk, totalRiskPct: account ? totalRisk / account * 100 : null,
            premiumOutlay, maxLoss: premiumOutlay,
            pctOfAccount: account ? premiumOutlay / account * 100 : null,
            rPrices: base.rPrices,
        };
    }

    /* ---------- sell-plan presets ---------- */
    function buildSellPlan(preset, calc, entry, direction = calc?.direction || 'long') {
        if (!preset || preset === 'off' || !calc || !calc.valid) return { enabled: false, preset: 'off', targets: [] };
        direction = directionOf(direction);
        const sign = directionSign(direction);
        const exitAction = direction === 'short' ? 'cover' : 'sell';
        const t = [];
        if (preset === 'half-1r') {
            t.push({ id: 'sp1', rLevel: 1, price: round2(entry + sign * calc.rps), shares: Math.ceil(calc.shares / 2), action: exitAction, status: 'pending' });
        } else if (preset === 'third-2r') {
            t.push({ id: 'sp1', rLevel: 2, price: round2(entry + sign * calc.rps * 2), shares: Math.ceil(calc.shares / 3), action: exitAction, status: 'pending' });
        } else if (preset === 'backfill') {
            t.push({ id: 'sp1', rLevel: 1, price: round2(entry + sign * calc.rps), shares: 0, action: 'raise-stop', newStop: entry, status: 'pending' });
        }
        return { enabled: t.length > 0, preset, initialShares: calc.shares, targets: t };
    }
    /* Normalize any plan target (incl. v1 legacy) into a uniform pending-action view. */
    function pendingTargets(trade) {
        if (!trade.sellPlan?.enabled || !Array.isArray(trade.sellPlan.targets)) return [];
        return trade.sellPlan.targets
            .filter(t => t.status !== 'executed' && t.rLevel !== 'exit')
            .map(t => {
                const rps = tradeRiskPerShare(trade);
                const price = isNum(t.price) ? t.price
                    : (rps !== null && isNum(t.rLevel) ? round2(trade.entryPrice + directionSign(trade) * rps * t.rLevel) : null);
                const isStopRaise = t.action === 'raise-stop' || (isNum(t.shares) && t.shares === 0) || t.backfill === true;
                return {
                    ref: t, price,
                    shares: isNum(t.shares) ? t.shares : (isNum(t.sharesToSell) ? t.sharesToSell : null),
                    isStopRaise,
                    newStop: isNum(t.newStop) ? t.newStop : trade.entryPrice,
                };
            })
            .filter(t => t.price !== null);
    }

    /* Post-trim breakeven stop: solves remaining stop risk − realized = 0. */
    function breakevenStop(trade, extraShares = 0, extraPrice = null) {
        const remaining = getRemainingShares(trade);
        if (remaining === null || !isNum(trade.entryPrice)) return null;
        let pnl = getRealizedPnL(trade);
        if (pnl === null) return null;
        let rem = remaining;
        if (extraShares > 0 && isNum(extraPrice)) {
            pnl += extraShares * directionalMove(trade.entryPrice, extraPrice, trade);
            rem -= extraShares;
        }
        if (rem <= 0) return null;
        return round2(trade.entryPrice - directionSign(trade) * pnl / rem);
    }

    /* Minimum whole-share trim that leaves a runner with zero net open risk
       at the current stop. Returns 0 when the position is already freer rolled,
       and null when sizing is unknown or the price cannot preserve a runner. */
    function freerollSharesAtPrice(trade, price) {
        const remaining = getRemainingShares(trade);
        const stop = currentStop(trade);
        const realized = getRealizedPnL(trade);
        if (remaining === null || remaining <= 1 || stop === null || realized === null ||
            !isNum(trade?.entryPrice) || !isNum(price)) return null;

        const gainPerShare = directionalMove(trade.entryPrice, price, trade);
        if (gainPerShare <= 0) return null;
        const stopRiskPerShare = Math.max(0, -directionalMove(trade.entryPrice, stop, trade));
        const openRisk = remaining * stopRiskPerShare - realized;
        if (openRisk <= 0) return 0;

        const riskRemovedPerShare = gainPerShare + stopRiskPerShare;
        if (riskRemovedPerShare <= 0) return null;
        let shares = Math.ceil((openRisk - 1e-9) / riskRemovedPerShare);
        shares = Math.max(1, shares);

        // A freeroll trim must leave at least one share as the runner.
        if (shares >= remaining) return null;
        return shares;
    }

    /* ---------- stats (scoreboard, footer) ---------- */
    function lastExitDate(trade) {
        if (!Array.isArray(trade.exits) || !trade.exits.length) return null;
        return trade.exits.reduce((max, x) => (x.date && (!max || x.date > max)) ? x.date : max, null);
    }
    function computeStats(trades, scope /* 'month' | 'all' */) {
        const now = new Date();
        const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        // archived trades stay in the stats — archiving must not erase history (v1)
        const closed = trades.filter(t => {
            const s = deriveStatus(t.archived ? { ...t, archived: false } : t);
            if (s !== 'closed' && s !== 'stopped') return false;
            if (scope === 'month') {
                const d = lastExitDate(t);
                return d ? d.startsWith(monthKey) : false;
            }
            return true;
        });
        let wins = 0, losses = 0, be = 0, excluded = 0;
        let sumR = 0, sumPnl = 0, winRs = [], lossRs = [];
        for (const t of closed) {
            const pnl = getRealizedPnL(t);
            const r = getRealizedR(t);
            if (pnl === null) { excluded++; continue; }
            sumPnl += pnl;
            if (r !== null) sumR += r;
            if (r !== null && Math.abs(r) < 0.05) { be++; continue; }
            if (pnl > 0) { wins++; if (r !== null) winRs.push(r); }
            else if (pnl < 0) { losses++; if (r !== null) lossRs.push(Math.abs(r)); }
            else be++;
        }
        const decided = wins + losses;
        const winRate = decided ? wins / decided : null;
        const avgWinR = winRs.length ? winRs.reduce((a, b) => a + b, 0) / winRs.length : 0;
        const avgLossR = lossRs.length ? lossRs.reduce((a, b) => a + b, 0) / lossRs.length : 0;
        const expectancy = winRate === null ? null : avgWinR * winRate - avgLossR * (1 - winRate);
        return {
            n: closed.length, wins, losses, be, excluded,
            winRate, sumR: round2(sumR), sumPnl: round2(sumPnl),
            expectancy: expectancy === null ? null : round2(expectancy),
            monthName: now.toLocaleDateString('en-US', { month: 'long' }),
        };
    }

    /* ---------- account-level open risk ---------- */
    function accountRisk(trades, account) {
        let dollars = 0, anyOpen = false, anyRisk = false, unknown = 0;
        for (const t of trades) {
            const s = deriveStatus(t);
            if (s === 'closed' || s === 'stopped' || s === 'archived') continue;
            anyOpen = true;
            const r = getOpenRiskDollars(t);
            if (r === null) { if (getRemainingShares(t) !== 0) unknown++; continue; }
            if (r > 0) { anyRisk = true; dollars += r; }
        }
        dollars = round2(dollars);
        const pct = account > 0 ? (dollars / account) * 100 : null;
        // v1 thresholds: LOW < 1%, MED 1–4%, HIGH ≥ 4%
        let level = 'CASH';
        if (anyOpen && !anyRisk) level = 'FREEROLLED';
        else if (anyRisk) {
            if (pct === null) level = 'MED';
            else if (pct < 1) level = 'LOW';
            else if (pct < 4) level = 'MED';
            else level = 'HIGH';
        }
        return { dollars, pct, level, unknown };
    }

    /* ---------- stale positions ---------- */
    function staleTrades(trades, days = 5) {
        const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - days);
        return trades.filter(t => {
            const s = deriveStatus(t);
            if (s === 'closed' || s === 'stopped' || s === 'archived') return false;
            const dates = [t.entryDate, lastExitDate(t), t.updatedAt?.slice(0, 10)].filter(Boolean);
            if (!dates.length) return false;
            const latest = dates.sort().pop();
            const d = parseLocalDate(latest);
            return d && d < cutoff;
        });
    }

    /* ---------- watchlist paste: "GOOGL, AAPL" / "googl AAPL," / "$NVDA" ---- */
    function parseWatchlistTickers(text) {
        if (text == null || text === '') return [];
        const seen = new Set();
        const out = [];
        for (const raw of String(text).split(/[\s,;|]+/)) {
            const ticker = raw.replace(/^\$/, '').toUpperCase();
            if (!/^[A-Z]{1,5}$/.test(ticker) || seen.has(ticker)) continue;
            seen.add(ticker);
            out.push(ticker);
        }
        return out;
    }

    /* ---------- alert parser ($TICKER @ entry sl stop [risk X%]) ---------- */
    function parseAlert(text) {
        if (!text) return null;
        const t = text.replace(/\s+/g, ' ').trim();
        const ticker = (t.match(/\$([A-Za-z][A-Za-z0-9.-]{0,9})\b/) || [])[1];
        const stopMatch = /\b(?:sl|stop(?:\s*loss)?)\b[^\d]{0,24}([0-9][0-9,]*(?:\.[0-9]+)?)/i.exec(t);
        const stopLabelIndex = stopMatch?.index ?? -1;
        const entryMatch = [...t.matchAll(/@\s*\$?([0-9][0-9,]*(?:\.[0-9]+)?)/g)]
            .find(match => stopLabelIndex < 0 || match.index < stopLabelIndex);
        const risk = (t.match(/\brisk(?:ing)?\b[^\d]{0,24}([0-9]*\.?[0-9]+)\s*%/i) || [])[1];
        const toNumber = value => value ? parseFloat(value.replace(/,/g, '')) : null;
        const entry = entryMatch?.[1] ?? null;
        const stop = stopMatch?.[1] ?? null;
        if (!ticker && !entry && !stop) return null;
        return {
            ticker: ticker ? ticker.toUpperCase() : null,
            entry: toNumber(entry),
            stop: toNumber(stop),
            riskPct: risk ? parseFloat(risk) : null,
        };
    }

    /* ---------- formatting ---------- */
    const fmtMoney = (n, sign = false) => {
        if (!isNum(n)) return '—';
        const abs = Math.abs(n);
        const s = abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        if (sign) return (n < 0 ? '−$' : '+$') + s;
        return (n < 0 ? '−$' : '$') + s;
    };
    const fmtShares = (n) => isNum(n) ? n.toLocaleString('en-US') : '—';
    const fmtR = (n) => {
        if (!isNum(n)) return '—';
        if (Math.abs(n) < 0.05) return 'BE';
        return (n > 0 ? '+' : '−') + Math.abs(n).toFixed(1) + 'R';
    };
    const fmtPct = (n, dp = 2) => isNum(n) ? n.toFixed(dp) + '%' : '—';
    const fmtPrice = (n) => isNum(n) ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';

    function escapeHtml(s) {
        return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    /* ---------- compound table (year-end contribution, live-site parity) ---------- */
    const COMPOUND_RATES = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 150, 200, 250, 300];
    const FREQ_MULT = { monthly: 12, quarterly: 4, yearly: 1 };

    function compoundAnnualContribution(mode, deposits, withdrawals) {
        if (!mode) return 0;
        let annual = 0;
        if (mode === 'deposits' || mode === 'both') {
            annual += (Number(deposits?.amount) || 0) * (FREQ_MULT[deposits?.frequency] || 12);
        }
        if (mode === 'withdrawals' || mode === 'both') {
            annual -= (Number(withdrawals?.amount) || 0) * (FREQ_MULT[withdrawals?.frequency] || 12);
        }
        return annual;
    }

    function compoundValue(principal, rate, years, annualContribution = 0) {
        let value = Number(principal) || 0;
        const contrib = Number(annualContribution) || 0;
        for (let year = 1; year <= years; year++) {
            value = value * (1 + rate / 100);
            value += contrib;
        }
        return Math.max(0, value);
    }

    function compoundGlow(value) {
        if (value >= 5e6) return 'gold';
        if (value >= 1e6) return 'green';
        if (value >= 1e5) return 'white';
        return '';
    }

    function compoundPath(principal, rate, years, annualContribution = 0) {
        const path = [{ year: 0, value: Number(principal) || 0 }];
        for (let year = 1; year <= years; year++) {
            path.push({ year, value: compoundValue(principal, rate, year, annualContribution) });
        }
        return path;
    }

    function periodicRate(annualPct, periods) {
        if (!isNum(annualPct) || !isNum(periods) || periods <= 0) return null;
        return (Math.pow(1 + annualPct / 100, 1 / periods) - 1) * 100;
    }

    function yearsToTarget(principal, rate, target, annualContribution = 0, horizon = 40) {
        if (!isNum(target) || target <= 0) return null;
        if ((Number(principal) || 0) >= target) return 0;
        for (let year = 1; year <= horizon; year++) {
            if (compoundValue(principal, rate, year, annualContribution) >= target) return year;
        }
        return null;
    }

    function compoundWithYearShock(principal, rate, years, annualContribution, shockYear, shockReturnPct) {
        let value = Number(principal) || 0;
        const contrib = Number(annualContribution) || 0;
        for (let year = 1; year <= years; year++) {
            const applied = year === shockYear ? shockReturnPct : rate;
            value = value * (1 + applied / 100);
            value += contrib;
        }
        return Math.max(0, value);
    }

    function compoundPerspective(principal, rate, years = 10, annualContribution = 0) {
        const contrib = Number(annualContribution) || 0;
        const path = compoundPath(principal, rate, years, contrib);
        const start = path[0].value;
        const y5 = path[Math.min(5, years)]?.value ?? start;
        const yEnd = path[years].value;
        const yPrev = years > 1 ? path[years - 1].value : start;
        const yearEndGain = yEnd - yPrev;
        const stayCourse = yEnd - y5;
        const last3Start = path[Math.max(0, years - 3)].value;
        const totalGain = yEnd - start;
        const backload = totalGain > 0 ? (yEnd - last3Start) / totalGain : 0;
        const added = contrib * years;
        const contributed = start + added;
        const growth = yEnd - contributed;
        const baseline = rate === 10 ? null : compoundValue(principal, 10, years, contrib);
        const rateIndex = COMPOUND_RATES.indexOf(rate);
        const prevRate = rateIndex > 0 ? COMPOUND_RATES[rateIndex - 1] : null;
        const vsPrev = prevRate === null ? null
            : yEnd - compoundValue(principal, prevRate, years, contrib);
        const shocked = compoundWithYearShock(principal, rate, years, contrib, 3, -30);
        return {
            path, start, y5, yEnd, yearEndGain, stayCourse, backload,
            monthlyPct: periodicRate(rate, 12),
            weeklyPct: periodicRate(rate, 52),
            sessionPct: periodicRate(rate, 252),
            yearsToDouble: yearsToTarget(principal, rate, start * 2, contrib),
            yearsTo100k: yearsToTarget(principal, rate, 1e5, contrib),
            yearsTo1m: yearsToTarget(principal, rate, 1e6, contrib),
            contributed, added, growth,
            baseline, vsBaseline: baseline === null ? null : yEnd - baseline,
            prevRate, vsPrev,
            shocked, shockGap: yEnd - shocked,
        };
    }

    /* ---------- live skyler.tools → v2 trade mapper ---------- */
    function toFinite(v) {
        if (typeof v === 'number' && isFinite(v)) return v;
        if (typeof v === 'string' && v.trim()) {
            const n = parseFloat(v.replace(/[$,\s]/g, ''));
            return isFinite(n) ? n : null;
        }
        return null;
    }

    function dateFromUnknown(value) {
        if (!value) return null;
        if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
        const d = new Date(value);
        if (!Number.isFinite(d.getTime())) return null;
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    function migrateLiveSiteTrade(entry) {
        if (!entry || typeof entry !== 'object') return null;
        const entryPrice = toFinite(entry.entry);
        const initialSL = toFinite(entry.originalStop ?? entry.stop);
        const currentSL = toFinite(entry.currentStop ?? entry.stop) ?? initialSL;
        const shares = toFinite(entry.originalShares ?? entry.shares);
        const createdAt = validIso(entry.timestamp) || new Date().toISOString();
        const entryDate = dateFromUnknown(entry.timestamp) || createdAt.slice(0, 10);
        const exits = [];

        const history = Array.isArray(entry.trimHistory) ? entry.trimHistory : [];
        for (const trim of history) {
            const xShares = toFinite(trim.shares);
            const xPrice = toFinite(trim.exitPrice);
            if (!xShares || !xPrice) continue;
            const full = toFinite(trim.percentTrimmed) >= 100;
            exits.push({
                id: String(trim.id || `x-${entry.id}-${exits.length}`),
                shares: xShares,
                price: xPrice,
                date: dateFromUnknown(trim.date) || entryDate,
                rMultiple: toFinite(trim.rMultiple),
                kind: full ? 'close' : 'trim',
            });
        }

        if (entry.status === 'closed') {
            const sold = exits.reduce((s, x) => s + x.shares, 0);
            const remaining = (shares || 0) - sold;
            const exitPrice = toFinite(entry.exitPrice);
            if (remaining > 0 && exitPrice !== null) {
                const rps = entryPrice !== null && initialSL !== null
                    ? Math.abs(entryPrice - initialSL) : null;
                const r = rps ? round4((exitPrice - entryPrice) / rps) : null;
                const kind = initialSL !== null && exitPrice <= initialSL ? 'stop' : 'close';
                exits.push({
                    id: `x-close-${entry.id}`,
                    shares: remaining,
                    price: exitPrice,
                    date: dateFromUnknown(entry.exitDate) || entryDate,
                    rMultiple: r,
                    kind,
                });
            }
        }

        const journal = [];
        if (entry.thesis && typeof entry.thesis === 'object') {
            const parts = [];
            if (entry.thesis.setupType) parts.push(`Setup: ${entry.thesis.setupType}`);
            if (entry.thesis.theme) parts.push(`Theme: ${entry.thesis.theme}`);
            if (entry.thesis.conviction) parts.push(`Conviction: ${entry.thesis.conviction}/5`);
            if (entry.thesis.entryType) parts.push(`Entry: ${entry.thesis.entryType}`);
            if (entry.thesis.riskReasoning) parts.push(entry.thesis.riskReasoning);
            if (parts.length) {
                journal.push({
                    id: `jn-thesis-${entry.id}`,
                    kind: 'thesis',
                    text: parts.join('\n'),
                    createdAt,
                    updatedAt: null,
                });
            }
        }
        const notes = String(entry.notes || '').trim();
        if (notes) {
            journal.push({
                id: `jn-note-${entry.id}`,
                kind: 'note',
                text: notes,
                createdAt,
                updatedAt: null,
                migrated: true,
            });
        }

        return {
            id: String(entry.id || `t-import-${createdAt}`),
            ticker: String(entry.ticker || '').toUpperCase() || 'UNKNOWN',
            direction: 'long',
            entryPrice,
            initialSL,
            currentSL,
            entryDate,
            shares,
            exits,
            sellPlan: { enabled: false, preset: 'off', initialShares: shares, targets: [] },
            snapshot: {
                account: null,
                riskPct: toFinite(entry.riskPercent),
                maxPct: null,
                target: toFinite(entry.target),
                shares,
                direction: 'long',
                posSize: toFinite(entry.positionSize),
                totalRisk: toFinite(entry.riskDollars),
            },
            journal,
            notes: '',
            archived: false,
            createdAt,
            updatedAt: createdAt,
            importedFrom: 'skyler-tools',
        };
    }

    function migrateLiveSiteJournal(entries) {
        if (!Array.isArray(entries)) return [];
        return entries.map(migrateLiveSiteTrade).filter(Boolean);
    }

    /* ---------- NYSE session (America/New_York wall clock) ----------
       Regular 09:30–16:00 · pre 04:00–09:30 · post 16:00–20:00.
       Weekends and listed holidays are closed. Early-close dates go post
       at 13:00. Holiday table is 2025–2027 — extend when a new year starts. */
    const NYSE_HOLIDAYS = new Set([
        '2025-01-01', '2025-01-20', '2025-02-17', '2025-04-18', '2025-05-26',
        '2025-06-19', '2025-07-04', '2025-09-01', '2025-11-27', '2025-12-25',
        '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25',
        '2026-06-19', '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25',
        '2027-01-01', '2027-01-18', '2027-02-15', '2027-03-26', '2027-05-31',
        '2027-06-18', '2027-07-05', '2027-09-06', '2027-11-25', '2027-12-24',
    ]);
    const NYSE_EARLY_CLOSE = new Set([
        '2025-07-03', '2025-11-28', '2025-12-24',
        '2026-11-27', '2026-12-24',
        '2027-11-26',
    ]);
    const SESSION_META = {
        open: { label: 'Open', detail: 'Regular hours · 9:30–16:00 ET' },
        pre: { label: 'Pre-market', detail: 'Pre-market · 4:00–9:30 ET' },
        post: { label: 'Post-market', detail: 'After hours · 16:00–20:00 ET' },
        closed: { label: 'Closed', detail: 'US cash session is closed' },
    };

    function nyWall(date) {
        const values = {};
        new Intl.DateTimeFormat('en-US', {
            timeZone: 'America/New_York',
            weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
        }).formatToParts(date).forEach((part) => {
            if (part.type !== 'literal') values[part.type] = part.value;
        });
        const ymd = `${values.year}-${values.month}-${values.day}`;
        const minutes = Number(values.hour) * 60 + Number(values.minute);
        const weekend = values.weekday === 'Sat' || values.weekday === 'Sun';
        return { ymd, minutes, weekend };
    }

    function marketSession(when = new Date()) {
        const date = when instanceof Date ? when : new Date(when);
        if (!Number.isFinite(date.getTime())) {
            return { state: 'closed', ...SESSION_META.closed };
        }
        const { ymd, minutes, weekend } = nyWall(date);
        if (weekend || NYSE_HOLIDAYS.has(ymd)) return { state: 'closed', ...SESSION_META.closed };
        const close = NYSE_EARLY_CLOSE.has(ymd) ? 13 * 60 : 16 * 60;
        let state = 'closed';
        if (minutes >= 4 * 60 && minutes < 9 * 60 + 30) state = 'pre';
        else if (minutes >= 9 * 60 + 30 && minutes < close) state = 'open';
        else if (minutes >= close && minutes < 20 * 60) state = 'post';
        return { state, ...SESSION_META[state] };
    }

    /* ---------- CSV export ---------- */
    function toCSV(trades, sep = ',') {
        const esc = (v) => {
            const s = String(v ?? '');
            return /[",\n\t]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
        };
        const head = ['Ticker', 'Direction', 'Entry Date', 'Entry', 'Initial Stop', 'Current Stop', 'Shares', 'Remaining', 'Realized P&L', 'Realized R', 'Status', 'Exits', 'Journal'];
        const rows = trades.map(t => {
            const exits = (t.exits || []).map(x => `${x.shares}@${isNum(x.price) ? x.price.toFixed(2) : '?'} ${x.date || ''}`.trim()).join('; ');
            const journal = normalizeJournal(t).map(entry => `${entry.createdAt} [${entry.kind}] ${entry.text}`).join('; ');
            return [t.ticker, directionOf(t), t.entryDate || '', t.entryPrice ?? '', t.initialSL ?? '', t.currentSL ?? '',
                getOriginalShares(t) ?? '', getRemainingShares(t) ?? '',
                getRealizedPnL(t) ?? '', getRealizedR(t) ?? '', deriveStatus(t), exits, journal].map(esc).join(sep);
        });
        return [head.join(sep), ...rows].join('\n');
    }

    return {
        round2, round4, isNum, directionOf, directionSign, directionalMove, normalizeJournal,
        todayLocalISO, parseLocalDate, fmtDateShort,
        riskPerShare, tradeRiskPerShare, computeExitR,
        getOriginalShares, getRemainingShares, soldShares,
        getRealizedPnL, getRealizedR, currentStop, getOpenRiskDollars, isFreeRolled,
        deriveStatus, statusLabel,
        calcPosition, calcOptionPosition, buildSellPlan, pendingTargets, breakevenStop, freerollSharesAtPrice,
        computeStats, accountRisk, staleTrades, lastExitDate,
        parseAlert, parseWatchlistTickers, toCSV,
        marketSession,
        COMPOUND_RATES, compoundAnnualContribution, compoundValue, compoundGlow,
        compoundPath, periodicRate, yearsToTarget, compoundWithYearShock, compoundPerspective,
        migrateLiveSiteTrade, migrateLiveSiteJournal,
        fmtMoney, fmtShares, fmtR, fmtPct, fmtPrice, escapeHtml,
    };
})();
