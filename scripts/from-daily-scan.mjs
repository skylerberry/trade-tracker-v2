#!/usr/bin/env node
/* Compile a daily-scan markdown post + CSV into data/daily-scan.json. */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GUIDE = new Function(`${readFileSync(join(ROOT, 'guide.js'), 'utf8')}; return GUIDE;`)();
const SCAN_DIR = process.env.DAILY_SCAN_DIR || '/Users/skylerberry/Projects/magic-scan/out';
const DOES_PATH = process.env.RS_DOES || '/Users/skylerberry/Projects/RS Tape/rs/data/does.csv';
const IDENT_PATH = process.env.RS_IDENTITY || '/Users/skylerberry/Projects/RS Tape/rs/data/identity.csv';
const OUT_PATH = join(ROOT, 'data', 'daily-scan.json');
const ROSTER_PATH = join(ROOT, 'data', 'theme-roster.json');
const CSV_PATH = process.env.DAILY_SCAN_CSV || join(SCAN_DIR, 'daily-scan.csv');

function parseCsv(text) {
    const rows = [];
    let row = [], field = '', i = 0, inQuotes = false;
    const s = String(text || '').replace(/^\uFEFF/, '');
    const pushField = () => { row.push(field); field = ''; };
    const pushRow = () => {
        if (row.length > 1 || (row.length === 1 && row[0] !== '')) rows.push(row);
        row = [];
    };
    while (i < s.length) {
        const c = s[i];
        if (inQuotes) {
            if (c === '"' && s[i + 1] === '"') { field += '"'; i += 2; continue; }
            if (c === '"') { inQuotes = false; i += 1; continue; }
            field += c; i += 1; continue;
        }
        if (c === '"') { inQuotes = true; i += 1; continue; }
        if (c === ',') { pushField(); i += 1; continue; }
        if (c === '\n' || c === '\r') {
            if (c === '\r' && s[i + 1] === '\n') i += 1;
            pushField(); pushRow(); i += 1; continue;
        }
        field += c; i += 1;
    }
    if (field.length || row.length) { pushField(); pushRow(); }
    if (!rows.length) return [];
    const header = rows[0].map((h) => String(h || '').trim());
    return rows.slice(1).map((r) => {
        const o = {};
        header.forEach((h, idx) => { o[h] = r[idx] || ''; });
        return o;
    });
}

function latestScan(dir) {
    if (!existsSync(dir)) return '';
    const files = readdirSync(dir).filter((name) => /^daily-scan-\d{4}-\d{2}-\d{2}(?:-\d+)?\.md$/.test(name));
    files.sort((a, b) => a.localeCompare(b));
    return files.length ? join(dir, files[files.length - 1]) : '';
}

function loadCompanies() {
    const companies = {};
    const guidePath = join(ROOT, 'data/guide.json');
    if (existsSync(guidePath)) {
        const guide = JSON.parse(readFileSync(guidePath, 'utf8'));
        for (const [key, val] of Object.entries(guide.companies || {})) {
            const ticker = String(key || '').trim().toUpperCase();
            if (!ticker) continue;
            companies[ticker] = {
                name: String(val?.name || '').trim(),
                does: String(val?.does || '').trim(),
            };
        }
    }
    if (existsSync(IDENT_PATH)) {
        for (const row of parseCsv(readFileSync(IDENT_PATH, 'utf8'))) {
            const ticker = String(row.Symbol || '').trim().toUpperCase();
            const name = String(row.CompanyName || '').trim();
            if (!ticker || !name) continue;
            const prev = companies[ticker] || { name: '', does: '' };
            companies[ticker] = { ...prev, name: prev.name || name };
        }
    }
    if (existsSync(DOES_PATH)) {
        for (const row of parseCsv(readFileSync(DOES_PATH, 'utf8'))) {
            const ticker = String(row.Symbol || '').trim().toUpperCase();
            const does = String(row.Does || '').trim();
            if (!ticker || !does) continue;
            const prev = companies[ticker] || { name: '', does: '' };
            companies[ticker] = { ...prev, does: prev.does || does };
        }
    }
    return companies;
}

function loadRoster() {
    if (!existsSync(ROSTER_PATH)) return [];
    try {
        const raw = JSON.parse(readFileSync(ROSTER_PATH, 'utf8'));
        return Array.isArray(raw.themes) ? raw.themes : [];
    } catch {
        return [];
    }
}

function loadQuotes(path) {
    if (!path || !existsSync(path)) return {};
    const quotes = {};
    const num = (v) => {
        if (v === '' || v == null) return null;
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
    };
    for (const row of parseCsv(readFileSync(path, 'utf8'))) {
        const ticker = String(row.symbol || row.Symbol || '').trim().toUpperCase();
        if (!ticker) continue;
        quotes[ticker] = {
            d: num(row.chg_pct),
            w: num(row.return_pct_1w),
            m: num(row.return_pct_1m),
            q: num(row.return_pct_3m),
            ext: num(row.ext_pct_from_ma),
            adr: num(row.adr20_pct),
            dv: num(row.dollar_vol_30d),
        };
    }
    return quotes;
}

const input = process.argv[2] || latestScan(SCAN_DIR);
if (!input || !existsSync(input)) {
    console.error('No daily-scan markdown found. Pass a path or drop one in magic-scan/out.');
    process.exit(1);
}

const csvPath = process.argv[3] || CSV_PATH;
const scan = { ...GUIDE.parseScanPost(readFileSync(input, 'utf8')), asOf: GUIDE.scanAsOf(input) };
const catalog = GUIDE.catalogFromScan(scan, loadCompanies(), {
    roster: loadRoster(),
    quotes: loadQuotes(csvPath),
});
writeFileSync(OUT_PATH, `${JSON.stringify(catalog, null, 2)}\n`);
writeFileSync(ROSTER_PATH, `${JSON.stringify({
    asOf: catalog.asOf,
    themes: catalog.themes.map((t) => ({ id: t.id, name: t.name, tickers: t.tickers })),
}, null, 2)}\n`);

const parsed = GUIDE.parseCatalog(catalog);
const names = Object.keys(parsed.companies).length;
const missing = Object.values(parsed.companies).filter((c) => !c.does).length;
const rankable = Object.values(parsed.companies).filter((c) => GUIDE.isRankable(c, parsed.rank)).length;
console.log(`Themes catalog ← ${input}`);
console.log(`  ${parsed.themes.length} themes · ${names} names · ${scan.asOf || 'no date'}`);
console.log(`  ${rankable} rankable ($100M+ · 3%+ ADR) · ${missing} without a Does line`);
if (csvPath && existsSync(csvPath)) console.log(`  quotes ← ${csvPath}`);
console.log(`  wrote ${OUT_PATH}`);
console.log(`  wrote ${ROSTER_PATH}`);
