#!/usr/bin/env node
/* Pure-math tests for engine.js (v2). Run: node tests/engine.test.mjs */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'engine.js'), 'utf8');
const E = new Function(`${src}; return ENGINE;`)();

let pass = 0, fail = 0;
function eq(actual, expected, label) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (ok) pass++;
    else { fail++; console.error(`✗ ${label}\n    expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
}

/* ---- riskPerShare: cents-normalized so float noise never changes shares ---- */
eq(E.riskPerShare(4.10, 4.00), 0.1, 'riskPerShare float-safe (4.10 − 4.00)');
eq(Math.floor(100 / E.riskPerShare(4.10, 4.00)), 1000, '$100 risk at 0.10 rps = exactly 1,000 shares');
eq(E.riskPerShare(10, 11), null, 'stop above entry → null');
eq(E.riskPerShare(10, 11, 'short'), 1, 'short risk uses stop above entry');
eq(E.riskPerShare(10, 9, 'short'), null, 'short stop below entry → null');
eq(E.riskPerShare(null, 4), null, 'unknown entry → null');

/* ---- calculator: cap floors the dollar cap, everything downstream capped ---- */
const calc = E.calcPosition({ account: 25000, riskPct: 0.5, maxPct: 20, entry: 104.20, stop: 101.60, target: 112 });
eq(calc.rawShares, 48, 'raw shares floor(risk/rps)');
eq(calc.shares, 47, 'max-% cap floors dollar cap / entry');
eq(calc.capped, true, 'capped flag');
eq(calc.target.rr, 3, 'R/R at target');
eq(E.calcPosition({ account: 25000, riskPct: 0.5, maxPct: 20, entry: 100, stop: 105 }).invalidStop, true, 'stop ≥ entry flagged');

const shortCalc = E.calcPosition({ account: 25000, riskPct: 0.5, maxPct: 20, entry: 100, stop: 102, target: 94, direction: 'short' });
eq(shortCalc.shares, 50, 'short calculator sizes from stop above entry');
eq(shortCalc.rPrices, [98, 96, 94, 92, 90], 'short R targets descend');
eq(shortCalc.target.rr, 3, 'short target R is positive below entry');
eq(shortCalc.target.profit, 300, 'short target profit uses bearish direction');
eq(E.calcPosition({ account: 25000, riskPct: 0.5, maxPct: 20, entry: 100, stop: 98, direction: 'short' }).invalidStop, true, 'short stop ≤ entry flagged');

/* ---- purchased option sizing: stop risk and premium allocation both constrain ---- */
const opt = E.calcOptionPosition({ account: 50000, riskPct: 0.25, maxPct: 20, entry: 263, stop: 262.15, delta: 0.72, premium: 2.63, direction: 'long' });
eq(opt.riskPerContract, 61.2, 'delta stop estimate per contract');
eq(opt.contracts, 2, 'option contracts floor to risk budget');
eq(opt.premiumOutlay, 526, 'premium outlay at sized contracts');
eq(opt.maxLoss, 526, 'purchased option max loss is premium outlay');
eq(opt.optionType, 'call', 'long direction maps to purchased call');
const put = E.calcOptionPosition({ account: 50000, riskPct: 0.25, maxPct: 20, entry: 263, stop: 263.85, delta: -0.72, premium: 2.63, direction: 'short' });
eq(put.contracts, 2, 'put sizing accepts negative quoted delta by magnitude');
eq(put.optionType, 'put', 'short direction maps to purchased put');
eq(E.calcOptionPosition({ account: 50000, riskPct: 0.25, maxPct: 20, entry: 263, stop: 264, delta: 0.72, premium: 2.63, direction: 'long' }).invalidStop, true, 'call setup rejects stop above entry');
eq(E.calcOptionPosition({ account: 50000, riskPct: 0.25, maxPct: 20, entry: 263, stop: 262, delta: 0.72, premium: 2.63, direction: 'short' }).invalidStop, true, 'put setup rejects stop below entry');
const costCapped = E.calcOptionPosition({ account: 10000, riskPct: 1, maxPct: 5, entry: 100, stop: 99.9, delta: 0.5, premium: 4 });
eq(costCapped.contracts, 1, 'premium allocation cap constrains contracts');
eq(costCapped.limitedBy, 'allocation', 'allocation constraint is identified');

/* ---- exits model / derived status ---- */
const t = {
    id: 't1', ticker: 'NVDA', entryPrice: 100, initialSL: 98, currentSL: 98,
    entryDate: '2026-08-01', shares: 1000, exits: [], sellPlan: { enabled: false, targets: [] }, archived: false,
};
eq(E.deriveStatus(t), 'open', 'no exits → open');
eq(E.getRealizedPnL(t), 0, 'no exits → known zero P&L');
t.exits.push({ id: 'x1', shares: 500, price: 102, date: '2026-08-02', rMultiple: 1, kind: 'trim' });
eq(E.getRemainingShares(t), 500, 'remaining after trim');
eq(E.getRealizedPnL(t), 1000, 'realized P&L');
eq(E.getRealizedR(t), 0.5, 'realized R vs original risk');
eq(E.deriveStatus(t), 'partial', 'exit → partial');
eq(E.isFreeRolled(t), true, 'realized ≥ remaining risk → freerolled');
t.exits.push({ id: 'x2', shares: 500, price: 97.5, date: '2026-08-03', rMultiple: -1.25, kind: 'stop' });
eq(E.deriveStatus(t), 'stopped', 'closed at/below initial stop → stopped');

const shortTrade = {
    id: 's1', ticker: 'TSLA', direction: 'short', entryPrice: 100, initialSL: 102, currentSL: 102,
    entryDate: '2026-08-01', shares: 100, exits: [], sellPlan: { enabled: false, targets: [] }, archived: false,
};
shortTrade.exits.push({ id: 'sx1', shares: 50, price: 96, date: '2026-08-02', rMultiple: 2, kind: 'trim' });
eq(E.getRealizedPnL(shortTrade), 200, 'short realized P&L profits below entry');
eq(E.computeExitR(shortTrade, 96), 2, 'short exit R uses descending prices');
eq(E.isFreeRolled(shortTrade), true, 'short realized profit can freeroll remaining shares');
shortTrade.exits.push({ id: 'sx2', shares: 50, price: 102.5, date: '2026-08-03', rMultiple: -1.25, kind: 'stop' });
eq(E.deriveStatus(shortTrade), 'stopped', 'short closes stopped at/above initial stop');

/* unknown size stays unknown, never guessed */
const u = { ticker: 'Q', entryPrice: 50, initialSL: 49, exits: [{ id: 'x', shares: 10, price: 52, date: '2026-08-01', rMultiple: 2, kind: 'trim' }] };
eq(E.getOriginalShares(u), null, 'unknown original shares → null');
eq(E.getRemainingShares(u), null, 'unknown remaining → null');
eq(E.getRealizedR(u), null, 'unknown R → null (never a guessed number)');

/* ---- breakeven stop: entry − realized/remaining ---- */
const b = { entryPrice: 100, initialSL: 98, currentSL: 98, shares: 1000, exits: [{ id: 'x', shares: 500, price: 102, date: '2026-08-02', rMultiple: 1, kind: 'trim' }] };
eq(E.breakevenStop(b), 98, 'BE stop = entry − realized/remaining');
const shortB = { direction: 'short', entryPrice: 100, initialSL: 102, currentSL: 102, shares: 1000, exits: [{ id: 'x', shares: 500, price: 98, date: '2026-08-02', rMultiple: 1, kind: 'trim' }] };
eq(E.breakevenStop(shortB), 102, 'short BE stop = entry + realized/remaining');

/* ---- freeroll risk manager: exact whole-share sizing at any profitable price ---- */
const frLong = { entryPrice: 100, initialSL: 98, currentSL: 98, shares: 100, exits: [] };
eq(E.freerollSharesAtPrice(frLong, 102), 50, '1R auto-trim sells half to freeroll');
eq(E.freerollSharesAtPrice(frLong, 104), 34, '2R auto-trim rounds one third up');
eq(E.freerollSharesAtPrice(frLong, 106), 25, '3R auto-trim sells one quarter');
eq(E.freerollSharesAtPrice(frLong, 110), 17, '5R auto-trim sells one sixth rounded up');
eq(E.freerollSharesAtPrice({ ...frLong, shares: 101 }, 102), 51, 'odd share count rounds up to fully remove risk');
const frShort = { direction: 'short', entryPrice: 100, initialSL: 102, currentSL: 102, shares: 100, exits: [] };
eq(E.freerollSharesAtPrice(frShort, 98), 50, 'short 1R auto-cover sells half to freeroll');
eq(E.freerollSharesAtPrice(frShort, 96), 34, 'short 2R auto-cover rounds one third up');
const frPartial = { ...frLong, exits: [{ id: 'x', shares: 20, price: 104, date: '2026-08-02', rMultiple: 2, kind: 'trim' }] };
eq(E.freerollSharesAtPrice(frPartial, 102), 20, 'auto-trim accounts for realized P&L and remaining shares');
eq(E.freerollSharesAtPrice({ ...frLong, currentSL: 100 }, 102), 0, 'position with stop at entry is already freer rolled');
eq(E.freerollSharesAtPrice(frLong, 99), null, 'loss-side exit cannot preserve a freeroll runner');
eq(E.freerollSharesAtPrice({ ...frLong, shares: null }, 102), null, 'unknown size cannot be auto-sized');

/* ---- timestamped trade journal normalization + legacy migration ---- */
const migratedJournal = E.normalizeJournal({ id: 'legacy-1', notes: '  Original thesis note.  ', updatedAt: '2026-08-06T20:15:00Z' });
eq(migratedJournal, [{ id: 'jn-legacy-legacy-1', kind: 'note', text: 'Original thesis note.', createdAt: '2026-08-06T20:15:00.000Z', updatedAt: null, migrated: true }], 'legacy note migrates to timestamped journal entry');
const cleanedJournal = E.normalizeJournal({ id: 'j1', createdAt: '2026-08-01T14:00:00Z', journal: [{ id: 'a', kind: 'unknown', body: '  Tape improved. ' }, { id: 'b', kind: 'lesson', text: '   ' }] });
eq(cleanedJournal, [{ id: 'a', kind: 'update', text: 'Tape improved.', createdAt: '2026-08-01T14:00:00.000Z', updatedAt: null }], 'journal drops blank entries and normalizes unknown types');
const noDuplicateLegacy = E.normalizeJournal({ id: 'j2', notes: 'Old note', journal: [{ id: 'jn-legacy-j2', kind: 'note', text: 'Old note', createdAt: '2026-08-01T14:00:00Z' }] });
eq(noDuplicateLegacy.length, 1, 'legacy note migration is idempotent');
eq(E.toCSV([{ ticker: 'J', entryDate: '2026-08-01', journal: migratedJournal, exits: [] }]).includes('[note] Original thesis note.'), true, 'CSV export includes journal timestamps and content');

/* ---- account risk levels: v1 thresholds ---- */
const mk = (riskDollars) => [{ ticker: 'A', entryPrice: 100, initialSL: 100 - riskDollars / 100, currentSL: 100 - riskDollars / 100, entryDate: '2026-08-01', shares: 100, exits: [], archived: false }];
eq(E.accountRisk(mk(50), 10000).level, 'LOW', '<1% → LOW');
eq(E.accountRisk(mk(200), 10000).level, 'MED', '1–4% → MED');
eq(E.accountRisk(mk(500), 10000).level, 'HIGH', '≥4% → HIGH');
eq(E.accountRisk([], 10000).level, 'CASH', 'no positions → CASH');

/* ---- stats: BE band excluded from W/L, archived still counted ---- */
const closedWin = { ticker: 'W', entryPrice: 10, initialSL: 9, shares: 100, entryDate: '2026-08-01', exits: [{ id: 'a', shares: 100, price: 12, date: '2026-08-02', rMultiple: 2, kind: 'close' }], archived: true };
const closedBE = { ticker: 'B', entryPrice: 10, initialSL: 9, shares: 100, entryDate: '2026-08-01', exits: [{ id: 'b', shares: 100, price: 10.01, date: '2026-08-02', rMultiple: 0.01, kind: 'close' }], archived: false };
const s = E.computeStats([closedWin, closedBE], 'all');
eq(s.n, 2, 'archived closed trade included in stats');
eq(s.wins, 1, 'one win');
eq(s.be, 1, '|R| < 0.05 lands in BE band');
eq(s.losses, 0, 'BE excluded from losses');

/* ---- alert parser ---- */
eq(E.parseAlert('$NVDA @ 101.20 sl 99.80 risk 0.5%'), { ticker: 'NVDA', entry: 101.2, stop: 99.8, riskPct: 0.5 }, 'alert parse');
eq(E.parseAlert('Starter $AAPL @ $10.93\nStop loss @ $10.33\nRisking 0.25%'), { ticker: 'AAPL', entry: 10.93, stop: 10.33, riskPct: 0.25 }, 'multiline alert parses stop-loss @ format');
eq(E.parseAlert('Adding $BRK.B @ $412.50 · SL: $409.25'), { ticker: 'BRK.B', entry: 412.5, stop: 409.25, riskPct: null }, 'alert parser accepts dotted ticker and colon stop');
eq(E.parseAlert('nothing tradable here'), null, 'garbage → null');

/* ---- watchlist ticker paste: any separators, skip junk, keep order ---- */
eq(E.parseWatchlistTickers('GOOGL, AAPL'), ['GOOGL', 'AAPL'], 'comma list');
eq(E.parseWatchlistTickers('googl, AAPL,'), ['GOOGL', 'AAPL'], 'lowercase and trailing comma');
eq(E.parseWatchlistTickers('GOOGL AAPL'), ['GOOGL', 'AAPL'], 'space-separated');
eq(E.parseWatchlistTickers('GOOGL,AAPL'), ['GOOGL', 'AAPL'], 'commas without spaces');
eq(E.parseWatchlistTickers('$NVDA $AAPL'), ['NVDA', 'AAPL'], 'dollar prefixes');
eq(E.parseWatchlistTickers('GOOGL\nAAPL\tTSLA'), ['GOOGL', 'AAPL', 'TSLA'], 'newlines and tabs');
eq(E.parseWatchlistTickers('GOOGL; AAPL | META'), ['GOOGL', 'AAPL', 'META'], 'semicolons and pipes');
eq(E.parseWatchlistTickers('NVDA'), ['NVDA'], 'single ticker');
eq(E.parseWatchlistTickers('NVDA, NVDA, AAPL'), ['NVDA', 'AAPL'], 'dedupes, first wins');
eq(E.parseWatchlistTickers('TOOOLONG, AAPL, 123'), ['AAPL'], 'drops invalid tokens');
eq(E.parseWatchlistTickers('BRK.B, AAPL'), ['AAPL'], 'dotted class share is not a 1–5 letter ticker');
eq(E.parseWatchlistTickers('  , , '), [], 'separators only');
eq(E.parseWatchlistTickers(''), [], 'empty string');
eq(E.parseWatchlistTickers(null), [], 'null');

/* ---- formatting: real minus U+2212, BE band, null → dash ---- */
eq(E.fmtMoney(-1020, true), '−$1,020.00', 'signed currency uses U+2212');
eq(E.fmtR(0.02), 'BE', '|R|<0.05 renders BE');
eq(E.fmtR(null), '—', 'null renders em dash');

/* ---- compound: year-end contribution, live-site formula ---- */
eq(Math.round(E.compoundValue(10000, 50, 10)), 576650, '$10k @ 50% for 10 years');
eq(E.compoundValue(10000, 50, 5), 75937.5, '$10k @ 50% for 5 years');
eq(E.compoundAnnualContribution('deposits', { amount: 100, frequency: 'monthly' }), 1200, 'monthly deposits annualize');
eq(E.compoundAnnualContribution('both', { amount: 100, frequency: 'monthly' }, { amount: 50, frequency: 'monthly' }), 600, 'net contribution');
eq(E.compoundValue(10000, 0, 2, 1000), 12000, '0% return still adds year-end contributions');
eq(E.compoundGlow(99999), '', 'under $100k has no glow');
eq(E.compoundGlow(100000), 'white', '$100k glow');
eq(E.compoundGlow(1000000), 'green', '$1M glow');
eq(E.compoundGlow(5000000), 'gold', '$5M glow');
eq(Number(E.periodicRate(50, 12).toFixed(2)), 3.44, '50% annual is 3.44% a month');
eq(E.yearsToTarget(10000, 50, 20000, 0), 2, '$10k doubles by year 2 at 50%');
eq(E.yearsToTarget(10000, 50, 1000000, 0), 12, '$10k reaches $1M in year 12 at 50%');
eq(Math.round(E.compoundPerspective(10000, 50, 10).backload * 100), 72, '72% of 50% gains land in the last 3 years');
eq(E.compoundPerspective(10000, 50, 10).yearsTo1m, 12, 'perspective $1M year');
eq(E.compoundWithYearShock(10000, 50, 10, 0, 3, -30) < E.compoundValue(10000, 50, 10), true, 'a −30% year 3 finishes below the clean path');

/* ---- NYSE session: pre / open / post / closed from an instant ---- */
eq(E.marketSession(new Date('2026-08-19T13:45:00.000Z')).state, 'open', 'Wed 9:45 ET is regular hours');
eq(E.marketSession(new Date('2026-08-19T13:45:00.000Z')).label, 'Open', 'open label');
eq(E.marketSession(new Date('2026-08-19T12:00:00.000Z')).state, 'pre', 'Wed 8:00 ET is pre-market');
eq(E.marketSession(new Date('2026-08-19T21:00:00.000Z')).state, 'post', 'Wed 17:00 ET is post-market');
eq(E.marketSession(new Date('2026-08-19T03:00:00.000Z')).state, 'closed', 'Tue 23:00 ET is closed');
eq(E.marketSession(new Date('2026-08-22T15:00:00.000Z')).state, 'closed', 'Saturday is closed');
eq(E.marketSession(new Date('2026-12-25T15:00:00.000Z')).state, 'closed', 'Christmas 2026 is closed');
eq(E.marketSession(new Date('2026-11-27T18:30:00.000Z')).state, 'post', 'day after Thanksgiving 13:30 ET is post (early close)');
eq(E.marketSession(new Date('2026-08-19T19:00:00.000Z')).minutesLeft, 60, 'Wed 15:00 ET → 60m left in regular session');
eq(E.marketSession(new Date('2026-08-19T12:00:00.000Z')).minutesLeft, 90, 'Wed 8:00 ET → 90m of pre-market left');
eq(E.marketSession(new Date('2026-08-19T23:30:00.000Z')).minutesLeft, 30, 'Wed 19:30 ET → 30m of after hours left');
eq(E.marketSession(new Date('2026-08-22T15:00:00.000Z')).minutesLeft, null, 'closed session has no countdown');

/* ---- equity curve: cumulative realized P&L + drawdown ---- */
const eqTrades = [
    { ticker: 'AAA', entryPrice: 10, initialSL: 9, exits: [
        { shares: 100, price: 12, date: '2026-01-02', rMultiple: 2 },
        { shares: 100, price: 9, date: '2026-01-05', rMultiple: -1 },
    ] },
    { ticker: 'BBB', entryPrice: 20, direction: 'short', initialSL: 21, exits: [
        { shares: 50, price: 18, date: '2026-01-03', rMultiple: 2 },
    ] },
    { ticker: 'ZZZ', entryPrice: 5, initialSL: 4, archived: true, exits: [
        { shares: 999, price: 50, date: '2026-01-01', rMultiple: 45 },
    ] },
];
const eqc = E.equityCurve(eqTrades);
eq(eqc.points.map(p => p.value), [200, 300, 200], 'cumulative P&L sorted by date, archived excluded');
eq(eqc.peak, 300, 'peak equity');
eq(eqc.peakIndex, 1, 'peak index');
eq(eqc.current, 200, 'current equity');
eq(eqc.drawdown, 100, 'drawdown $ from peak');
eq(eqc.drawdownR, 1, 'drawdown in R');
eq(E.equityCurve([]).points.length, 0, 'no trades → empty curve');
eq(E.equityCurve([]).drawdown, 0, 'no trades → zero drawdown');

/* ---- live-site journal → v2 trades ---- */
const liveOpen = E.migrateLiveSiteTrade({
    id: 1001, timestamp: '2026-06-01T15:00:00.000Z', ticker: 'nvda',
    entry: 100, stop: 98, originalStop: 98, currentStop: 98,
    shares: 200, originalShares: 200, riskPercent: 0.5, riskDollars: 400,
    notes: 'first cut', status: 'open', thesis: { setupType: 'EP', conviction: 4 },
});
eq(liveOpen.ticker, 'NVDA', 'import uppercases ticker');
eq(liveOpen.entryPrice, 100, 'import maps entry');
eq(liveOpen.shares, 200, 'import maps shares');
eq(liveOpen.exits.length, 0, 'open import has no exits');
eq(liveOpen.journal[0].kind, 'thesis', 'thesis becomes a journal entry');
eq(liveOpen.journal[1].kind, 'note', 'legacy notes migrate');
eq(E.deriveStatus(liveOpen), 'open', 'imported open stays open');

const liveClosed = E.migrateLiveSiteTrade({
    id: 1002, timestamp: '2026-05-01T15:00:00.000Z', ticker: 'AAPL',
    entry: 200, stop: 190, originalStop: 190, currentStop: 200,
    shares: 50, originalShares: 100, remainingShares: 0, status: 'closed',
    exitPrice: 220, exitDate: '2026-05-10',
    trimHistory: [
        { id: 1, shares: 50, exitPrice: 210, date: '2026-05-08', rMultiple: 1, percentTrimmed: 50 },
        { id: 2, shares: 50, exitPrice: 220, date: '2026-05-10', rMultiple: 2, percentTrimmed: 100 },
    ],
});
eq(liveClosed.exits.length, 2, 'trim history becomes exits');
eq(E.deriveStatus(liveClosed), 'closed', 'fully trimmed import is closed');
eq(E.getRealizedPnL(liveClosed), 1500, 'imported realized P&L');

const liveStop = E.migrateLiveSiteTrade({
    id: 1003, timestamp: '2026-04-01T15:00:00.000Z', ticker: 'XYZ',
    entry: 10, stop: 9, originalStop: 9, currentStop: 9,
    shares: 100, originalShares: 100, status: 'closed',
    exitPrice: 9, exitDate: '2026-04-02',
});
eq(liveStop.exits[0].kind, 'stop', 'full exit at/under stop is a stop');
eq(E.deriveStatus(liveStop), 'stopped', 'imported stop-out derives stopped');

/* ---- pendingTargets: half/third follow the actual size, not the calc snapshot ---- */
const bflyPlan = E.buildSellPlan('half-1r', { valid: true, shares: 1607, rps: 0.07 }, 8.87);
eq(bflyPlan.targets[0].shares, 804, '½ @ 1R snapshots ceil(1607 / 2) at log');
const bflyLogged = {
    ticker: 'BFLY', entryPrice: 8.87, initialSL: 8.80, shares: 1600, exits: [],
    sellPlan: bflyPlan,
};
eq(E.pendingTargets(bflyLogged)[0].shares, 800, 'editing size 1607 → 1600 updates pending half from 804 to 800');
eq(E.pendingTargets({
    shares: 1600, exits: [],
    sellPlan: E.buildSellPlan('third-2r', { valid: true, shares: 1607, rps: 0.07 }, 8.87),
})[0].shares, 534, '⅓ @ 2R pending shares follow the edited size');
eq(E.pendingTargets({
    shares: 1600, exits: [],
    sellPlan: E.buildSellPlan('backfill', { valid: true, shares: 1607, rps: 0.07 }, 8.87),
})[0].shares, 0, 'back-fill stays a stop raise after a size edit');
eq(E.pendingTargets({
    shares: 1600, exits: [],
    sellPlan: {
        enabled: true, preset: 'custom', initialShares: 1607,
        targets: [{ id: 'sp1', rLevel: 1, price: 8.94, shares: 500, action: 'sell', status: 'pending' }],
    },
})[0].shares, 500, 'legacy/custom targets keep their stored share count');

/* ---- fill edits rebase pending 1R from planned R, not the frozen log price ---- */
const dxcmPlan = E.buildSellPlan('half-1r', { valid: true, shares: 146, rps: 0.68 }, 90.31);
eq(dxcmPlan.targets[0].price, 90.99, 'DXCM ½ @ 1R logs 90.31 + 0.68');
eq(dxcmPlan.targets[0].shares, 73, 'DXCM ½ @ 1R sells 73');
const dxcmFilled = {
    ticker: 'DXCM', entryPrice: 90.13, initialSL: 89.63, currentSL: 89.63,
    shares: 146, exits: [],
    sellPlan: dxcmPlan,
    snapshot: { shares: 146, totalRisk: 99.28, rps: 0.68 },
};
eq(E.pendingTargets(dxcmFilled)[0].price, 90.81, 'fill 90.13 keeps planned $0.68 R → 1R at 90.81, not the frozen 90.99');
eq(E.planRiskPerShare(dxcmFilled), 0.68, 'planned R stays the logged risk-per-share after a fill edit');
eq(E.tradeRiskPerShare(dxcmFilled), 0.5, 'live entry−stop rps can differ from planned R after a better fill');

const dxcmNoSnap = { ...dxcmFilled, snapshot: undefined };
eq(E.pendingTargets(dxcmNoSnap)[0].price, 90.63, 'without a calc snapshot, pending 1R uses live entry−stop rps');

const shortPlan = E.buildSellPlan('half-1r', { valid: true, shares: 100, rps: 2, direction: 'short' }, 100, 'short');
eq(shortPlan.targets[0].price, 98, 'short 1R is entry − rps');
const shortFilled = {
    direction: 'short', entryPrice: 99.5, initialSL: 102, currentSL: 102,
    shares: 100, exits: [], sellPlan: shortPlan, snapshot: { rps: 2, shares: 100, totalRisk: 200 },
};
eq(E.pendingTargets(shortFilled)[0].price, 97.5, 'short fill edit rebases 1R: 99.5 − 2');

const backfillPlan = E.buildSellPlan('backfill', { valid: true, shares: 146, rps: 0.68 }, 90.31);
const backfillFilled = {
    entryPrice: 90.13, initialSL: 89.63, shares: 146, exits: [],
    sellPlan: backfillPlan, snapshot: { rps: 0.68 },
};
eq(E.pendingTargets(backfillFilled)[0].price, 90.81, 'back-fill 1R price follows the fill');
eq(E.pendingTargets(backfillFilled)[0].newStop, 90.13, 'back-fill breakeven is the actual fill, not the planned entry');

/* ---- audit log: entry/stop diffs, and initial-stop corrections rebuild planned R ---- */
const dxcmBefore = {
    id: 'dxcm-1', ticker: 'DXCM', entryPrice: 90.31, initialSL: 89.63, currentSL: 89.63,
    shares: 146, exits: [],
    sellPlan: E.buildSellPlan('half-1r', { valid: true, shares: 146, rps: 0.68 }, 90.31),
    snapshot: { shares: 146, totalRisk: 99.28, rps: 0.68 },
    audit: [],
};
const dxcmAfterFill = { ...dxcmBefore, sellPlan: JSON.parse(JSON.stringify(dxcmBefore.sellPlan)), snapshot: { ...dxcmBefore.snapshot } };
dxcmAfterFill.entryPrice = 90.13;
E.applyAdjustmentDiff(dxcmAfterFill, dxcmBefore, '2026-08-31T15:04:00Z');
eq(dxcmAfterFill.audit, [{
    id: 'adj-dxcm-1-0', at: '2026-08-31T15:04:00.000Z', field: 'entry', from: 90.31, to: 90.13,
}], 'fill edit records an entry adjustment');
eq(dxcmAfterFill.sellPlan.targets[0].price, 90.81, 'fill edit writes the rebased 1R onto the pending target');

const stopBefore = JSON.parse(JSON.stringify(dxcmAfterFill));
dxcmAfterFill.currentSL = 90.13;
E.applyAdjustmentDiff(dxcmAfterFill, stopBefore, '2026-08-31T16:00:00Z');
eq(dxcmAfterFill.audit[1], {
    id: 'adj-dxcm-1-1', at: '2026-08-31T16:00:00.000Z', field: 'stop', from: 89.63, to: 90.13,
}, 'current-stop move records a stop adjustment');
eq(dxcmAfterFill.snapshot.rps, 0.68, 'managing current stop does not rewrite planned R');
eq(dxcmAfterFill.sellPlan.targets[0].price, 90.81, 'current-stop move leaves the 1R target alone');

const initialBefore = JSON.parse(JSON.stringify(dxcmAfterFill));
dxcmAfterFill.initialSL = 89.45;
E.applyAdjustmentDiff(dxcmAfterFill, initialBefore, '2026-08-31T16:30:00Z');
eq(dxcmAfterFill.audit[2].field, 'initialStop', 'initial-stop correction is its own audit field');
eq(dxcmAfterFill.snapshot.rps, 0.68, 'initial stop 89.45 vs fill 90.13 keeps $0.68 planned R');
eq(dxcmAfterFill.sellPlan.targets[0].price, 90.81, 'matching-distance stop correction keeps 1R at 90.81');

const tighter = JSON.parse(JSON.stringify(dxcmAfterFill));
const tighterBefore = JSON.parse(JSON.stringify(tighter));
tighter.initialSL = 89.80;
E.applyAdjustmentDiff(tighter, tighterBefore, '2026-08-31T17:00:00Z');
eq(tighter.snapshot.rps, 0.33, 'tighter initial stop rebuilds planned R from the new setup');
eq(tighter.sellPlan.targets[0].price, 90.46, 'tighter initial stop rebases 1R to fill + new rps');

const noop = JSON.parse(JSON.stringify(dxcmAfterFill));
E.applyAdjustmentDiff(noop, JSON.parse(JSON.stringify(noop)), '2026-08-31T18:00:00Z');
eq(noop.audit.length, dxcmAfterFill.audit.length, 'identical values do not append audit rows');

eq(E.normalizeAudit({
    id: 'n1',
    audit: [
        { field: 'entry', from: 1, to: 2, at: '2026-08-31T12:00:00Z' },
        { field: 'nope', from: 1, to: 2, at: '2026-08-31T12:00:00Z' },
        { field: 'stop', from: 1, to: 1, at: '2026-08-31T12:00:00Z' },
        { field: 'stop', from: 'x', to: 2, at: '2026-08-31T12:00:00Z' },
    ],
}).map(x => x.field), ['entry'], 'normalizeAudit keeps only real from→to price changes');

console.log(fail ? `\n${pass} passed, ${fail} FAILED` : `${pass}/${pass} passed`);
process.exit(fail ? 1 : 0);
