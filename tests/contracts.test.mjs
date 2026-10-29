#!/usr/bin/env node
/**
 * Fast publish/catalog contracts. Offline, no Alpaca/Yahoo.
 * The weekday Themes job runs `npm test` then commits only daily-scan.json —
 * these fail only on a genuinely broken file or a dropped publish path.
 *
 *   node tests/contracts.test.mjs           # all five
 *   node tests/contracts.test.mjs scan|nav|serve|ranks|publish
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(process.env.CONTRACT_ROOT || join(dirname(fileURLToPath(import.meta.url)), '..'));
const SCAN = process.env.DAILY_SCAN_JSON || join(ROOT, 'data/daily-scan.json');
const RANKS = process.env.THEME_RANKS_JSON || join(ROOT, 'data/theme-ranks.json');
const INDEX = process.env.INDEX_HTML || join(ROOT, 'index.html');
const APP = process.env.APP_JS || join(ROOT, 'app.js');
const PKG = process.env.PACKAGE_JSON || join(ROOT, 'package.json');
const NETLIFY = process.env.NETLIFY_TOML || join(ROOT, 'netlify.toml');
const WINDOWS = ['d', 'w', 'm', 'q', 'h', 'y'];
const RS_DEFAULT = 'm';
const AS_OF = /^\d{4}-\d{2}-\d{2}$/;

function read(path) {
    try { return readFileSync(path, 'utf8'); }
    catch (err) {
        assert.fail(`${path} is unreadable (${err.code || err.message})`);
    }
}

function checkScan(path = SCAN) {
    let data;
    try { data = JSON.parse(read(path)); }
    catch (err) { assert.fail(`${path} is not JSON: ${err.message}`); }
    assert.equal(typeof data, 'object', `${path} must be a JSON object`);
    assert.ok(data && !Array.isArray(data), `${path} must be a JSON object`);
    assert.ok(AS_OF.test(String(data.asOf || '')), `${path} asOf must be YYYY-MM-DD, got ${JSON.stringify(data.asOf)}`);
    assert.equal(typeof data.companies, 'object', `${path} companies must be an object`);
    assert.ok(data.companies && !Array.isArray(data.companies), `${path} companies must be an object`);
    const companyCount = Object.keys(data.companies).length;
    assert.ok(companyCount > 0, `${path} companies is empty`);
    assert.ok(Array.isArray(data.themes), `${path} themes must be an array`);
    assert.ok(data.themes.length > 0, `${path} themes is empty`);
    data.themes.forEach((theme, i) => {
        const where = `${path} themes[${i}]`;
        assert.equal(typeof theme, 'object', `${where} must be an object`);
        assert.ok(typeof theme?.id === 'string' && theme.id.trim(), `${where} is missing id`);
        assert.ok(typeof theme?.name === 'string' && theme.name.trim(), `${where} (${theme.id}) is missing name`);
        assert.ok(Array.isArray(theme.tickers), `${where} (${theme.id}) tickers must be an array`);
    });
    return { asOf: data.asOf, themes: data.themes.length, companies: companyCount };
}

function viewSegValues(html) {
    const block = html.match(/id="viewSeg"[^>]*>([\s\S]*?)<\/div>/);
    assert.ok(block, `${INDEX} is missing #viewSeg`);
    return [...block[1].matchAll(/\bdata-seg="([^"]+)"/g)].map((m) => m[1]);
}

function viewsFromApp(src) {
    const m = src.match(/const VIEWS = \[([^\]]+)\]/);
    assert.ok(m, `${APP} is missing const VIEWS`);
    return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

function checkNav(indexPath = INDEX, appPath = APP) {
    const nav = viewSegValues(read(indexPath));
    const views = viewsFromApp(read(appPath));
    assert.ok(views.length > 0, `${appPath} VIEWS is empty`);
    assert.deepEqual(nav, views, `#viewSeg data-seg ${JSON.stringify(nav)} must equal app.js VIEWS ${JSON.stringify(views)}`);
    return { views };
}

function checkRanks(path = RANKS) {
    let data;
    try { data = JSON.parse(read(path)); }
    catch (err) { assert.fail(`${path} is not JSON: ${err.message}`); }
    assert.equal(data?.schemaVersion, 1, `${path} schemaVersion must be 1 (rs.js rejects anything else)`);
    assert.ok(Array.isArray(data.windows), `${path} windows must be an array`);
    const missing = WINDOWS.filter((w) => !data.windows.includes(w));
    assert.equal(missing.length, 0, `${path} windows missing ${missing.join(', ')} (need ${WINDOWS.join(',')}, including default RS "${RS_DEFAULT}")`);
    assert.ok(data.windows.includes(RS_DEFAULT), `${path} windows must include default RS window "${RS_DEFAULT}"`);
    assert.ok(Array.isArray(data.sessions) && data.sessions.length > 0, `${path} sessions must be a non-empty array`);
    const latest = data.sessions[data.sessions.length - 1];
    assert.ok(latest?.ranks && typeof latest.ranks === 'object', `${path} latest session is missing ranks`);
    const month = latest.ranks[RS_DEFAULT];
    assert.equal(typeof month, 'object', `${path} latest session (${latest.asOf}) has no ranks.${RS_DEFAULT} — RS defaults to 1M`);
    assert.ok(month && !Array.isArray(month) && Object.keys(month).length > 0, `${path} latest session ranks.${RS_DEFAULT} is empty`);
    return { sessions: data.sessions.length, asOf: latest.asOf, windows: data.windows };
}

function checkPublish(pkgPath = PKG, netlifyPath = NETLIFY) {
    const pkg = JSON.parse(read(pkgPath));
    const build = String(pkg.scripts?.build || '');
    assert.ok(build, `${pkgPath} is missing scripts.build`);
    assert.match(build, /(?:^|[\s/])themes\.js(?:\s|$)/, `${pkgPath} build no longer copies themes.js`);
    assert.match(build, /(?:^|[\s/])rs\.js(?:\s|$)/, `${pkgPath} build no longer copies rs.js`);
    assert.match(build, /daily-scan\.json/, `${pkgPath} build no longer copies data/daily-scan.json`);
    const netlify = read(netlifyPath);
    assert.match(netlify, /command\s*=\s*"npm run build"/, `${netlifyPath} must still run npm run build`);
    assert.match(netlify, /publish\s*=\s*"dist"/, `${netlifyPath} must still publish dist`);
    return { build: 'npm run build', publish: 'dist' };
}

async function waitCatalog(port, ms = 5000) {
    const url = `http://127.0.0.1:${port}/data/daily-scan.json`;
    const home = `http://127.0.0.1:${port}/`;
    const start = Date.now();
    let last = 0;
    while (Date.now() - start < ms) {
        try {
            const res = await fetch(url, { signal: AbortSignal.timeout(400) });
            last = res.status;
            if (!res.ok) return { status: res.status, home: 0, ours: false };
            const page = await fetch(home, { signal: AbortSignal.timeout(400) });
            const html = await page.text();
            return { status: res.status, home: page.status, ours: html.includes('Trader Tools Suite') };
        } catch { /* not up yet */ }
        await new Promise((r) => setTimeout(r, 40));
    }
    return { status: last, home: 0, ours: false };
}

async function checkServe() {
    const port = Number(process.env.CONTRACT_PORT || 41473);
    const child = spawn(process.execPath, ['serve.mjs'], {
        cwd: ROOT,
        env: { ...process.env, PORT: String(port) },
        stdio: 'ignore',
    });
    let exitCode = null;
    child.on('exit', (code) => { exitCode = code; });
    try {
        const got = await waitCatalog(port);
        assert.equal(got.status, 200, `GET /data/daily-scan.json returned ${got.status || 'no response'} on port ${port}${exitCode !== null ? ` (serve.mjs exited ${exitCode})` : ''}`);
        assert.equal(got.home, 200, `GET / returned ${got.home} on port ${port}`);
        assert.ok(got.ours, `GET / on port ${port} is not this app (missing “Trader Tools Suite”)`);
        return { port, catalog: 200 };
    } finally {
        if (exitCode === null) {
            try { child.kill('SIGTERM'); } catch { /* gone */ }
            await new Promise((r) => setTimeout(r, 80));
            try { child.kill('SIGKILL'); } catch { /* gone */ }
        }
    }
}

const CHECKS = {
    scan: () => checkScan(),
    nav: () => checkNav(),
    ranks: () => checkRanks(),
    publish: () => checkPublish(),
    serve: () => checkServe(),
};

const want = process.argv[2];
const names = want ? [want] : Object.keys(CHECKS);
if (want && !CHECKS[want]) {
    console.error(`unknown check “${want}”. one of: ${Object.keys(CHECKS).join(', ')}`);
    process.exit(2);
}

let failed = 0;
for (const name of names) {
    try {
        const result = await CHECKS[name]();
        console.log(`ok  ${name}`, result ? JSON.stringify(result) : '');
    } catch (err) {
        failed++;
        console.error(`fail  ${name}: ${err.message}`);
        if (!want) process.exitCode = 1;
        else { process.exitCode = 1; break; }
    }
}
if (failed) process.exit(1);
console.log(`contracts: ${names.length} passed`);
