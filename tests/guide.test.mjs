#!/usr/bin/env node
/* Pure tests for guide.js parse / view / rail. Run: node tests/guide.test.mjs */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'guide.js'), 'utf8');
const GUIDE = new Function(`${src}; return GUIDE;`)();

let pass = 0, fail = 0;
function eq(actual, expected, label) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (ok) pass++;
    else { fail++; console.error(`✗ ${label}\n    expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
}
function ok(cond, label) { eq(!!cond, true, label); }

const raw = {
    themes: [
        { id: 'semis', name: 'Semiconductors', blurb: 'Chips.', tickers: ['nvda', 'AVGO', 'NVDA', 'MISSING'] },
        { id: 'ai', name: 'AI infrastructure', blurb: 'Rented GPUs.', tickers: ['NVDA', 'CRWV'] },
        { id: 'empty', name: 'Empty', blurb: '', tickers: ['GONE'] },
    ],
    companies: {
        NVDA: { name: 'NVIDIA', does: 'Designs the graphics chips that train and run AI models.' },
        AVGO: { name: 'Broadcom', does: 'Sells chips that move data in phones, networks, and AI servers.' },
        CRWV: { name: 'CoreWeave', does: 'Rents out NVIDIA computers so companies can train AI models.' },
        SKIP: { name: 'No Does' },
    },
};

const data = GUIDE.parse(raw);

eq(Object.keys(data.companies).sort(), ['AVGO', 'CRWV', 'NVDA'], 'parse keeps companies that have a name and Does');
eq(data.themes.map(t => t.id), ['semis', 'ai', 'empty'], 'parse keeps theme order and empty themes');
eq(data.themes[0].companies.map(c => c.ticker), ['NVDA', 'AVGO'], 'theme tickers uppercase, de-duped, unknown dropped');
eq(data.themes[1].companies.map(c => c.ticker), ['NVDA', 'CRWV'], 'a name can sit in more than one theme');
eq(data.themes[2].companies.map(c => c.ticker), [], 'theme with no known tickers is empty, not dropped');

const all = GUIDE.view(data);
eq(all.themeCount, 2, 'view All hides themes with no matching names');
eq(all.nameCount, 3, 'nameCount is unique tickers, even if a name repeats across themes');
eq(all.themes.map(t => t.id), ['semis', 'ai'], 'All lists themes that still have names');
eq(all.empty, false, 'All with data is not empty');

const nvda = GUIDE.view(data, { query: 'nvda' });
eq(nvda.nameCount, 1, 'ticker query matches one unique name');
eq(nvda.themes.map(t => [t.id, t.companies.map(c => c.ticker)]), [['semis', ['NVDA']], ['ai', ['NVDA']]], 'ticker match still appears under every theme it belongs to');

const chips = GUIDE.view(data, { query: 'graphics chips' });
eq(chips.themes.map(t => t.companies.map(c => c.ticker)), [['NVDA'], ['NVDA']], 'Does text is searchable');

const themeName = GUIDE.view(data, { query: 'semiconductor' });
eq(themeName.themes.map(t => t.id), ['semis'], 'theme name match keeps the whole theme');
eq(themeName.themes[0].companies.map(c => c.ticker), ['NVDA', 'AVGO'], 'theme name match does not hide the other names in that theme');

const one = GUIDE.view(data, { themeId: 'ai' });
eq(one.themes.map(t => t.id), ['ai'], 'themeId shows only that theme');
eq(one.nameCount, 2, 'themeId nameCount is unique names in that theme');

const miss = GUIDE.view(data, { query: 'nope' });
eq(miss.empty, true, 'unmatched query is empty');
eq(miss.themes, [], 'unmatched query has no theme sections');

const rail = GUIDE.rail(data, '');
eq(rail.map(r => [r.id, r.count]), [['all', 3], ['semis', 2], ['ai', 2], ['empty', 0]], 'rail always lists All plus every theme, with match counts');

const railQ = GUIDE.rail(data, 'coreweave');
eq(railQ.map(r => [r.id, r.count]), [['all', 1], ['semis', 0], ['ai', 1], ['empty', 0]], 'rail counts follow the query');

const movers = {
    asOf: '2026-08-26',
    themes: [
        { id: 'gainers-1w', name: '1-week gainers', blurb: 'Scan.', tickers: ['NVDA', 'MOVR', 'GONE'] },
        { id: 'semis', name: 'Hijack attempt', tickers: ['MOVR'] },
    ],
    companies: {
        MOVR: { name: 'Mover Co', does: 'New name found by the scan.' },
        NVDA: { name: 'WRONG', does: 'Scanner tried to overwrite the curated line.' },
    },
};
const merged = GUIDE.combine(raw, movers);
eq(merged.asOf, '2026-08-26', 'combine carries asOf from movers');
eq(merged.themes.map(t => [t.id, t.source]),
    [['semis', 'curated'], ['ai', 'curated'], ['empty', 'curated'], ['gainers-1w', 'generated']],
    'curated themes first, scan themes after, duplicate theme ids dropped');
eq(merged.companies.NVDA.name, 'NVIDIA', 'curated company wins a ticker collision');
eq(merged.themes[3].companies.map(c => c.ticker), ['NVDA', 'MOVR'], 'scan theme resolves against curated and its own companies');
eq(GUIDE.combine(raw, null).themes.map(t => t.id), ['semis', 'ai', 'empty'], 'missing movers.json leaves curated untouched');
eq(GUIDE.combine(raw, null).asOf, '', 'no movers means no asOf');
eq(GUIDE.combine(null, movers).themes.map(t => [t.id, t.source]),
    [['gainers-1w', 'generated'], ['semis', 'generated']],
    'movers alone still renders (curated fetch failed)');

const live = JSON.parse(readFileSync(join(root, 'data/guide.json'), 'utf8'));
const parsedLive = GUIDE.parse(live);
ok(parsedLive.themes.length >= 1, 'live guide.json has at least one theme');
ok(Object.keys(parsedLive.companies).length >= 1, 'live guide.json has at least one company');
for (const theme of live.themes || []) {
    for (const tk of theme.tickers || []) {
        const ticker = String(tk).trim().toUpperCase();
        ok(parsedLive.companies[ticker], `${ticker} in ${theme.id} has a company record with a Does line`);
    }
}

const liveMovers = JSON.parse(readFileSync(join(root, 'data/movers.json'), 'utf8'));
const combinedLive = GUIDE.combine(live, liveMovers);
ok(/^\d{4}-\d{2}-\d{2}$/.test(liveMovers.asOf || ''), 'live movers.json asOf is YYYY-MM-DD');
for (const theme of liveMovers.themes || []) {
    for (const tk of theme.tickers || []) {
        const ticker = String(tk).trim().toUpperCase();
        ok(combinedLive.companies[ticker], `${ticker} in ${theme.id} has a Does line in the merged view`);
    }
}

eq(GUIDE.adjPct(20, 3, 8), 20 * 3 / 11, '3-name +20% shrinks to ~5.45 with k=8');
eq(Math.round(GUIDE.adjPct(2.4, 65, 8) * 100) / 100, 2.14, '65-name +2.4% barely shrinks');
eq(GUIDE.isRankable({ adr: 4, dv: 150_000_000 }), true, '4% ADR and $150M is rankable');
eq(GUIDE.isRankable({ adr: 2.6, dv: 200_000_000 }), false, '2.6% ADR is on the sheet, not in rank');
eq(GUIDE.isRankable({ adr: 5, dv: 40_000_000 }), false, '$40M is on the sheet, not in rank');
eq(GUIDE.passesBrowse({ adr: 2.6, dv: 25_000_000 }, { minAdr: 2.5, minDv: 20_000_000 }), true, 'wide net keeps 2.6% / $25M');
eq(GUIDE.passesBrowse({ adr: 2.1, dv: 80_000_000 }, { minAdr: 2.5, minDv: 20_000_000 }), false, 'below ADR floor drops from the sheet');

const catalog = GUIDE.parseCatalog({
    source: 'daily-scan', asOf: '2026-08-31', k: 8,
    rank: { minAdr: 3, minDv: 100_000_000 },
    browse: { minAdr: 2.5, minDv: 20_000_000 },
    themes: [
        { id: 'copper', name: 'Copper', tickers: ['FCX', 'TINY'] },
        { id: 'software', name: 'Software', tickers: ['NOW', 'CRM', 'ADBE'] },
    ],
    companies: {
        FCX: { name: 'Freeport', does: 'Mines copper.', ret: { d: 1 }, ext: 4, adr: 5, dv: 200_000_000 },
        TINY: { name: 'Tiny Co', does: 'Small copper name.', ret: { d: 20 }, ext: 2, adr: 6, dv: 30_000_000 },
        NOW: { name: 'ServiceNow', does: 'Sells workflow software.', ret: { d: 2 }, ext: 3, adr: 4, dv: 400_000_000 },
        CRM: { name: 'Salesforce', does: 'Sells CRM software.', ret: { d: 2 }, ext: 3, adr: 3.5, dv: 500_000_000 },
        ADBE: { name: 'Adobe', does: 'Sells creative software.', ret: { d: 2 }, ext: -1, adr: 2.6, dv: 300_000_000 },
    },
});
const ranked = GUIDE.rankThemes(catalog, { window: 'd' });
eq(ranked.themes[0].id, 'software', 'size-dampened rank puts the 2-name liquid software theme over 1-name copper lottery');
eq(ranked.themes.find(t => t.id === 'copper').nRet, 1, 'copper rank set is only the $100M name');
eq(ranked.themes.find(t => t.id === 'software').companies.map(c => c.ticker).sort(), ['ADBE', 'CRM', 'NOW'], 'sheet still shows the 2.6% ADR software name');
const tight = GUIDE.rankThemes(catalog, { window: 'd', minAdr: 3, minDv: 100_000_000 });
eq(tight.themes.find(t => t.id === 'software').companies.map(c => c.ticker).sort(), ['CRM', 'NOW'], 'user floor of 3% / $100M hides Adobe from the sheet');

console.log(`${pass} pass, ${fail} fail`);
if (fail) process.exit(1);
