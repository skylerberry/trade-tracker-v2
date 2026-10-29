#!/usr/bin/env node
/**
 * verify-skyler-tools — one way for agents to launch, doctor, drive, and
 * clean up this checkout. See SKILL.md in this folder.
 */
import { spawn, execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const SKILL_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SKILL_DIR, '../../..');
const RUN_DIR = join(SKILL_DIR, '.run');
const STATE_PATH = join(RUN_DIR, 'state.json');
const EVIDENCE_ROOT = process.env.VERIFY_EVIDENCE
    ? resolve(process.env.VERIFY_EVIDENCE)
    : join(SKILL_DIR, 'evidence');
const PORT = Number(process.env.PORT || 4173);
const BASE = `http://127.0.0.1:${PORT}`;
const OURS = 'Trader Tools Suite';
const TIMEOUT = 20_000;

const FEATURES = [
    'calculator', 'journal', 'compound', 'themes', 'rs',
    'curate', 'feedback', 'appearance', 'sync',
];

const ROUTES = {
    positions: { hash: '#positions', nav: 'positions' },
    calc: { hash: '#positions', nav: 'positions' },
    calculator: { hash: '#positions', nav: 'positions' },
    journal: { hash: '#journal', nav: 'journal' },
    'journal/notes': { hash: '#journal/notes', nav: 'journal' },
    compound: { hash: '#compound', nav: 'compound' },
    themes: { hash: '#themes', nav: 'themes' },
    rs: { hash: '#rs', nav: 'rs' },
    'curate.html': { path: '/curate.html' },
    curate: { path: '/curate.html' },
    feedback: { hash: '#positions', nav: 'positions', extra: 'feedback' },
};

function fail(message, extra = {}) {
    console.log(JSON.stringify({ ok: false, error: message, ...extra }, null, 2));
    process.exitCode = 1;
}

function ok(payload) {
    console.log(JSON.stringify({ ok: true, ...payload }, null, 2));
}

function usage() {
    console.log(`verify-skyler-tools — drive this checkout the same way every time

  npm run verify -- launch
  npm run verify -- doctor
  npm run verify -- shot <route>
  npm run verify -- check <feature>
  npm run verify -- cleanup

Features: ${FEATURES.join(', ')}
Routes:   positions|journal|journal/notes|compound|themes|rs|curate.html
          plus #themes/<id> and #themes/lookup/<ticker>

See .cursor/skills/verify-skyler-tools/SKILL.md
`);
}

function isOurs(html) {
    return typeof html === 'string' && html.includes(OURS);
}

async function fetchText(url, ms = 800) {
    try {
        const res = await fetch(url, { signal: AbortSignal.timeout(ms), cache: 'no-store' });
        return { status: res.status, text: await res.text() };
    } catch {
        return { status: 0, text: null };
    }
}

function readState() {
    try { return JSON.parse(readFileSync(STATE_PATH, 'utf8')); }
    catch { return null; }
}

function writeState(state) {
    mkdirSync(RUN_DIR, { recursive: true });
    writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + '\n');
}

function stamp() {
    return new Date().toISOString().replace(/[:.]/g, '-').replace(/Z$/, 'Z');
}

function evidenceDir(name) {
    const dir = join(EVIDENCE_ROOT, `${stamp()}-${name}`);
    mkdirSync(dir, { recursive: true });
    return dir;
}

function writeReport(dir, report) {
    writeFileSync(join(dir, 'report.json'), JSON.stringify(report, null, 2) + '\n');
}

function findChrome() {
    const named = [
        process.env.CHROME_PATH,
        process.env.VERIFY_CHROME,
        '/usr/bin/google-chrome-stable',
        '/usr/bin/google-chrome',
        '/usr/local/bin/google-chrome',
        '/usr/bin/chromium-browser',
        '/usr/bin/chromium',
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
    ].filter(Boolean);
    for (const p of named) {
        if (existsSync(p)) return p;
    }
    for (const bin of ['google-chrome-stable', 'google-chrome', 'chromium-browser', 'chromium']) {
        try {
            const out = execSync(`command -v ${bin}`, { encoding: 'utf8' }).trim();
            if (out) return out;
        } catch { /* not on PATH */ }
    }
    return null;
}

function loadPlaywright() {
    const require = createRequire(join(REPO_ROOT, 'package.json'));
    try {
        return require('playwright-core');
    } catch {
        fail('playwright-core is not installed. Run npm install (it is a devDependency).');
        return null;
    }
}

async function waitOurs(ms = 8000) {
    const start = Date.now();
    while (Date.now() - start < ms) {
        const { status, text } = await fetchText(`${BASE}/`, 600);
        if (status === 200 && isOurs(text)) return true;
        await new Promise((r) => setTimeout(r, 150));
    }
    return false;
}

async function cmdLaunch() {
    const existing = await fetchText(`${BASE}/`);
    if (existing.status === 200 && isOurs(existing.text)) {
        const state = { port: PORT, base: BASE, pid: null, startedByUs: false, startedAt: new Date().toISOString() };
        writeState(state);
        ok({ ready: true, ours: true, alreadyRunning: true, startedByUs: false, base: BASE, port: PORT });
        return;
    }
    if (existing.status === 200 && existing.text) {
        fail(`Port ${PORT} is in use by something that is not skyler.tools. Stop it, then retry.`);
        return;
    }
    const child = spawn(process.execPath, ['serve.mjs'], {
        cwd: REPO_ROOT,
        detached: true,
        stdio: 'ignore',
        env: { ...process.env, PORT: String(PORT) },
    });
    child.unref();
    const ready = await waitOurs(10000);
    if (!ready) {
        try { process.kill(child.pid); } catch { /* already gone */ }
        fail('serve.mjs did not become ready with Trader Tools Suite on GET /.');
        return;
    }
    writeState({
        port: PORT, base: BASE, pid: child.pid, startedByUs: true,
        startedAt: new Date().toISOString(),
    });
    ok({ ready: true, ours: true, alreadyRunning: false, startedByUs: true, pid: child.pid, base: BASE, port: PORT });
}

async function cmdDoctor() {
    const home = await fetchText(`${BASE}/`, 2000);
    if (home.status !== 200) {
        fail(`GET / returned ${home.status || 'no response'}. Run verify launch first.`, { base: BASE });
        return;
    }
    if (!isOurs(home.text)) {
        fail(`GET / is not this app (missing “${OURS}”).`, { base: BASE });
        return;
    }
    const scan = await fetchText(`${BASE}/data/daily-scan.json`, 4000);
    let asOf = null;
    let themes = 0;
    if (scan.status !== 200) {
        fail('GET /data/daily-scan.json failed.', { status: scan.status, base: BASE });
        return;
    }
    try {
        const json = JSON.parse(scan.text);
        asOf = json.asOf || null;
        themes = Array.isArray(json.themes) ? json.themes.length : 0;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(asOf || ''))) {
            fail('daily-scan.json asOf is missing or not YYYY-MM-DD.', { asOf });
            return;
        }
        if (!themes) {
            fail('daily-scan.json has no themes array.');
            return;
        }
    } catch {
        fail('daily-scan.json is not JSON.');
        return;
    }
    const curate = await fetchText(`${BASE}/curate.html`, 2000);
    if (curate.status !== 200 || !String(curate.text || '').includes('Curate Themes')) {
        fail('GET /curate.html is not the Curate Themes page.', { status: curate.status });
        return;
    }
    ok({
        ours: true,
        healthy: true,
        base: BASE,
        fingerprint: OURS,
        themesAsOf: asOf,
        themeCount: themes,
        curate: true,
    });
}

async function cmdCleanup() {
    const state = readState();
    if (!state) {
        ok({ cleaned: false, reason: 'no state file — nothing for this skill to kill', evidence: EVIDENCE_ROOT });
        return;
    }
    let killed = false;
    if (state.startedByUs && state.pid) {
        try {
            process.kill(state.pid);
            killed = true;
        } catch {
            killed = false;
        }
        await new Promise((r) => setTimeout(r, 200));
        try { process.kill(state.pid, 0); process.kill(state.pid, 'SIGKILL'); } catch { /* gone */ }
    }
    rmSync(STATE_PATH, { force: true });
    ok({
        cleaned: true,
        killed,
        startedByUs: Boolean(state.startedByUs),
        pid: state.pid || null,
        evidenceSurvives: EVIDENCE_ROOT,
        evidenceExists: existsSync(EVIDENCE_ROOT),
    });
}

function collectConsole(page) {
    const consoleErrors = [];
    const pageErrors = [];
    page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => { pageErrors.push(String(err?.message || err)); });
    return { consoleErrors, pageErrors };
}

async function withPage(fn) {
    const pw = loadPlaywright();
    if (!pw) return null;
    const executablePath = findChrome();
    if (!executablePath) {
        fail('No Chrome/Chromium found. Install Chrome or set CHROME_PATH.');
        return null;
    }
    const browser = await pw.chromium.launch({
        executablePath,
        headless: process.env.VERIFY_HEADED !== '1',
        args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
    const context = await browser.newContext({
        viewport: { width: 1280, height: 900 },
        colorScheme: 'light',
        reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    const logs = collectConsole(page);
    try {
        return await fn(page, logs);
    } finally {
        await browser.close();
    }
}

async function dismissWelcome(page, { sample = false } = {}) {
    await page.locator('#viewSeg').waitFor({ state: 'visible', timeout: TIMEOUT });
    const welcome = page.locator('#modalRoot .welcome-card');
    try {
        await welcome.waitFor({ state: 'visible', timeout: 2500 });
    } catch {
        return { welcomed: false };
    }
    const btn = sample ? welcome.locator('.wc-sample') : welcome.locator('.wc-fresh');
    await btn.click();
    await welcome.waitFor({ state: 'detached', timeout: TIMEOUT });
    return { welcomed: true, sample };
}

async function openApp(page, { sample = false, path = '/', hash = '' } = {}) {
    const url = `${BASE}${path}${hash || ''}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
    const onboard = await dismissWelcome(page, { sample });
    return { url, ...onboard };
}

async function clickNav(page, seg) {
    const tab = page.locator(`#viewSeg button[data-seg="${seg}"]`);
    await tab.click();
    await page.waitForFunction((name) => document.body.dataset.view === name, seg, { timeout: TIMEOUT });
}

async function shot(page, file) {
    await page.screenshot({ path: file, fullPage: false });
}

function resolveRoute(raw) {
    const key = String(raw || '').replace(/^#/, '').replace(/^\//, '');
    if (ROUTES[key]) return { key, ...ROUTES[key] };
    if (key.startsWith('themes/')) return { key, hash: `#${key}`, nav: 'themes' };
    if (key === 'feedback') return ROUTES.feedback;
    return null;
}

async function gotoRoute(page, spec) {
    if (spec.path) {
        await page.goto(`${BASE}${spec.path}`, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
        await page.locator('h1').waitFor({ state: 'visible', timeout: TIMEOUT });
        return;
    }
    if (spec.nav) await clickNav(page, spec.nav);
    if (spec.hash && spec.hash !== `#${spec.nav}` && spec.hash !== '#positions') {
        await page.evaluate((h) => { location.hash = h; }, spec.hash);
        await page.waitForFunction((h) => location.hash === h || location.hash.startsWith(h), spec.hash, { timeout: TIMEOUT });
    }
    if (spec.hash === '#journal/notes') {
        await page.locator('#journalTabSeg button[data-seg="notes"]').click();
        await page.locator('#notesPanel').waitFor({ state: 'visible', timeout: TIMEOUT });
    }
}

async function cmdShot(routeArg) {
    const spec = resolveRoute(routeArg);
    if (!spec) {
        fail(`Unknown route “${routeArg}”. See SKILL.md Drive.`);
        return;
    }
    const home = await fetchText(`${BASE}/`);
    if (!(home.status === 200 && isOurs(home.text))) {
        fail('App is not up. Run verify launch, then doctor.');
        return;
    }
    const dir = evidenceDir(`shot-${spec.key.replace(/\W+/g, '-')}`);
    const report = await withPage(async (page, logs) => {
        const opened = await openApp(page, {
            path: spec.path || '/',
            hash: spec.path ? '' : (spec.hash && spec.hash.startsWith('#themes/') ? spec.hash : ''),
        });
        if (!spec.path) await gotoRoute(page, spec);
        if (spec.extra === 'feedback') {
            await page.locator('#footerFeedback').click();
            await page.locator('#modalRoot .feedback-card').waitFor({ state: 'visible', timeout: TIMEOUT });
        }
        const after = join(dir, 'after.png');
        await shot(page, after);
        const values = await page.evaluate(() => ({
            hash: location.hash,
            path: location.pathname,
            title: document.title,
            view: document.body.dataset.view || null,
            themesAsOf: document.getElementById('themes-asof')?.textContent || null,
            rsAsOf: document.getElementById('rs-asof')?.textContent || null,
            calcTitle: document.getElementById('calcTitle')?.textContent || null,
            journalTitle: document.getElementById('journalTitle')?.textContent || null,
            compoundTitle: document.getElementById('compoundTitle')?.textContent || null,
        }));
        const report = {
            ok: true, command: 'shot', route: spec.key, base: BASE,
            evidence: dir, files: { after: 'after.png' },
            values, consoleErrors: logs.consoleErrors, pageErrors: logs.pageErrors,
            opened,
        };
        writeReport(dir, report);
        return report;
    });
    if (report) ok(report);
}

async function textOf(page, sel) {
    const el = page.locator(sel).first();
    if (!(await el.count())) return null;
    try { return (await el.textContent({ timeout: 2000 }))?.trim() || null; }
    catch { return null; }
}

const CHECKS = {
    async calculator(page, dir) {
        await clickNav(page, 'positions');
        await page.locator('#calcSection').waitFor({ state: 'visible', timeout: TIMEOUT });
        await shot(page, join(dir, 'before.png'));
        await page.locator('#entryPrice').fill('100');
        await page.locator('#stopLoss').fill('95');
        await page.locator('#tickerInput').fill('NVDA');
        await page.waitForFunction(() => {
            const n = document.getElementById('sharesHero')?.textContent?.replace(/,/g, '').trim();
            return n && n !== '0' && n !== '—';
        }, { timeout: TIMEOUT });
        const shares = await textOf(page, '#sharesHero');
        const totalRisk = await textOf(page, '#rTotalRisk');
        const posSize = await textOf(page, '#rPosSize');
        const mode = await textOf(page, '#calcModeContextText');
        await shot(page, join(dir, 'after.png'));
        const expectedShares = '25';
        if (shares !== expectedShares) {
            return {
                ok: false,
                error: `Expected #sharesHero “${expectedShares}” for $25k · 0.5% · entry 100 · stop 95 (uncapped). Got “${shares}”.`,
                values: { shares, totalRisk, posSize, mode },
            };
        }
        return {
            ok: true,
            values: {
                shares, totalRisk, posSize, mode,
                setup: 'account $25,000 · risk 0.5% · long shares · NVDA 100 / 95',
                endState: `${shares} shares sized from the calculator inputs (not an internal setter)`,
            },
        };
    },

    async journal(page, dir) {
        const empty = page.locator('#seedDemo');
        if (await empty.isVisible().catch(() => false)) await empty.click();
        await clickNav(page, 'journal');
        await page.locator('#journalTitleline').waitFor({ state: 'visible', timeout: TIMEOUT });
        await shot(page, join(dir, 'before.png'));
        await page.locator('#tradesBody tr, #emptyState').first().waitFor({ timeout: TIMEOUT });
        const pnl = await textOf(page, '#jsPnl');
        const title = await textOf(page, '#journalTitle');
        await page.locator('#journalTabSeg button[data-seg="notes"]').click();
        await page.locator('#notesPanel').waitFor({ state: 'visible', timeout: TIMEOUT });
        await page.locator('#notesNew').waitFor({ state: 'visible', timeout: TIMEOUT });
        const notesHash = await page.evaluate(() => location.hash);
        await shot(page, join(dir, 'after.png'));
        if (title !== 'Trade journal') {
            return { ok: false, error: `Journal title was “${title}”.`, values: { title, pnl, notesHash } };
        }
        if (notesHash !== '#journal/notes') {
            return { ok: false, error: `Notes tab did not set #journal/notes (got ${notesHash}).`, values: { title, pnl, notesHash } };
        }
        return {
            ok: true,
            values: {
                title, pnl, notesHash,
                endState: 'Journal title visible, Notes tab shows #notesPanel and #notesNew, hash is #journal/notes',
            },
        };
    },

    async compound(page, dir) {
        await clickNav(page, 'compound');
        await page.locator('#compoundView').waitFor({ state: 'visible', timeout: TIMEOUT });
        await page.locator('#compoundHeroEnd').waitFor({ state: 'visible', timeout: TIMEOUT });
        await shot(page, join(dir, 'before.png'));
        await page.locator('#compoundPresets [data-capital="25000"]').click();
        await page.locator('#compoundRates [data-rate="20"]').click();
        await page.waitForFunction(() => {
            const t = document.getElementById('compoundHeroEnd')?.textContent || '';
            return t.includes('after 10 years') && /\d/.test(t);
        }, { timeout: TIMEOUT });
        const hero = await textOf(page, '#compoundHeroEnd');
        const rate = await textOf(page, '#compoundHeroRate');
        const title = await textOf(page, '#compoundTitle');
        await shot(page, join(dir, 'after.png'));
        if (!hero || !/\d/.test(hero)) {
            return { ok: false, error: 'Compound hero did not show a 10-year value.', values: { hero, rate, title } };
        }
        return {
            ok: true,
            values: {
                title, hero, rate,
                setup: '$25K starting · 20% annual',
                endState: `#compoundHeroEnd reads a 10-year projection (${hero})`,
            },
        };
    },

    async themes(page, dir) {
        await clickNav(page, 'themes');
        await page.locator('#themesView').waitFor({ state: 'visible', timeout: TIMEOUT });
        await page.waitForFunction(() => /Updated after the close/.test(document.getElementById('themes-asof')?.textContent || ''), { timeout: TIMEOUT });
        await page.locator('#themes-workspace button.tracker-row[data-theme]').first().waitFor({ timeout: TIMEOUT });
        const asOf = await textOf(page, '#themes-asof');
        const asOfTitle = await page.locator('#themes-asof').getAttribute('title');
        const counts = await textOf(page, '#themes-counts');
        await shot(page, join(dir, 'before.png'));
        const first = page.locator('#themes-workspace button.tracker-row[data-theme]').first();
        const themeId = await first.getAttribute('data-theme');
        const themeLabel = await first.locator('.tracker-label').textContent();
        await first.click();
        await page.locator('#themes-workspace .tracker-back').waitFor({ state: 'visible', timeout: TIMEOUT });
        const heading = await textOf(page, '#themes-workspace h2');
        const hash = await page.evaluate(() => location.hash);
        await shot(page, join(dir, 'after.png'));
        if (!asOf || !asOf.includes('Updated after the close')) {
            return { ok: false, error: 'Themes asOf chip never showed “Updated after the close”.', values: { asOf, asOfTitle, counts } };
        }
        if (hash !== `#themes/${themeId}`) {
            return { ok: false, error: `Opening a theme should set #themes/${themeId}. Got ${hash}.`, values: { asOf, heading, hash, themeId } };
        }
        if (!heading || heading.trim() !== (themeLabel || '').trim()) {
            return { ok: false, error: `Opened heading “${heading}” did not match row “${themeLabel}”.`, values: { asOf, heading, themeLabel } };
        }
        return {
            ok: true,
            values: {
                asOf, asOfTitle, counts, themeId, heading, hash,
                endState: `Themes list with asOf “${asOf}”; opened ${heading} at ${hash}`,
            },
        };
    },

    async rs(page, dir) {
        await clickNav(page, 'rs');
        await page.locator('#rsView').waitFor({ state: 'visible', timeout: TIMEOUT });
        await page.waitForFunction(() => /Updated after the close/.test(document.getElementById('rs-asof')?.textContent || ''), { timeout: TIMEOUT });
        await page.locator('#rs-board .rs-row').first().waitFor({ timeout: TIMEOUT });
        const asOf = await textOf(page, '#rs-asof');
        const period = await textOf(page, '#rs-period');
        const count = await textOf(page, '#rs-count');
        await shot(page, join(dir, 'before.png'));
        const row = page.locator('#rs-board .rs-row').first();
        const themeId = await row.getAttribute('data-id');
        await row.click();
        await page.locator('#themesView').waitFor({ state: 'visible', timeout: TIMEOUT });
        await page.locator('#themes-workspace .tracker-back, #themes-workspace h2').first().waitFor({ timeout: TIMEOUT });
        const hash = await page.evaluate(() => location.hash);
        const heading = await textOf(page, '#themes-workspace h2');
        await shot(page, join(dir, 'after.png'));
        if (hash !== `#themes/${themeId}`) {
            return { ok: false, error: `RS row should open #themes/${themeId}. Got ${hash}.`, values: { asOf, period, count, hash, themeId } };
        }
        return {
            ok: true,
            values: {
                asOf, period, count, themeId, heading, hash,
                endState: `RS board with asOf “${asOf}”; row opened Themes ${heading} at ${hash}`,
            },
        };
    },

    async curate(page, dir) {
        await page.goto(`${BASE}/curate.html`, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
        await page.locator('.curate-main').waitFor({ state: 'visible', timeout: TIMEOUT });
        await shot(page, join(dir, 'before.png'));
        await page.waitForFunction(() => {
            const s = document.getElementById('statusLine')?.textContent || '';
            return s && s !== 'Loading…';
        }, { timeout: TIMEOUT });
        const status = await textOf(page, '#statusLine');
        const title = await textOf(page, 'h1');
        await page.locator('#themesHost .theme-card, #themesHost').first().waitFor({ timeout: TIMEOUT });
        const themeCards = await page.locator('#themesHost .theme-card').count();
        await shot(page, join(dir, 'after.png'));
        if (title !== 'Curate Themes') {
            return { ok: false, error: `Expected h1 “Curate Themes”, got “${title}”.`, values: { title, status } };
        }
        if (!status || !/Read-only/i.test(status)) {
            return {
                ok: false,
                error: 'Without a token, Curate should land in read-only (status mentions Read-only).',
                values: { title, status, themeCards },
            };
        }
        return {
            ok: true,
            values: {
                title, status, themeCards,
                endState: `Curate Themes loaded read-only (“${status}”) with ${themeCards} theme cards`,
            },
        };
    },

    async feedback(page, dir) {
        await clickNav(page, 'positions');
        await shot(page, join(dir, 'before.png'));
        await page.locator('#footerFeedback').click();
        const card = page.locator('#modalRoot .feedback-card');
        await card.waitFor({ state: 'visible', timeout: TIMEOUT });
        await card.locator('.feedback-message').fill('verify-skyler-tools proof run — ignore.');
        await card.locator('.feedback-send').click();
        await card.locator('.feedback-sent-copy').waitFor({ state: 'visible', timeout: TIMEOUT });
        const sent = await textOf(page, '#modalRoot .feedback-sent-copy');
        const isSent = await card.evaluate((el) => el.classList.contains('is-sent'));
        await shot(page, join(dir, 'after.png'));
        if (!isSent || !/Sent/i.test(sent || '')) {
            return { ok: false, error: 'Feedback modal did not reach the Sent state.', values: { sent, isSent } };
        }
        return {
            ok: true,
            values: {
                sent, isSent,
                endState: 'Footer feedback modal shows Sent (localhost short-circuits the Netlify POST)',
            },
        };
    },

    async appearance(page, dir) {
        await page.locator('#themeSeg').waitFor({ state: 'visible', timeout: TIMEOUT });
        const before = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
        await shot(page, join(dir, 'before.png'));
        await page.locator('#themeSeg button[data-seg="dark"]').click();
        await page.waitForFunction(() => document.documentElement.getAttribute('data-theme') === 'dark', { timeout: TIMEOUT });
        const after = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
        await shot(page, join(dir, 'after.png'));
        if (after !== 'dark') {
            return { ok: false, error: `Color mode did not switch to dark (was ${before}, now ${after}).` };
        }
        await page.locator('#themeSeg button[data-seg="light"]').click();
        return {
            ok: true,
            values: {
                before, after,
                endState: `Color mode control set data-theme from ${before} to dark`,
            },
        };
    },

    async sync(page, dir) {
        await shot(page, join(dir, 'before.png'));
        await page.locator('#syncBtn').click();
        const card = page.locator('#modalRoot .sync-card');
        await card.waitFor({ state: 'visible', timeout: TIMEOUT });
        await card.locator('.sy-have').waitFor({ state: 'visible', timeout: TIMEOUT });
        const title = await textOf(page, '#modalRoot .sync-card .modal-title');
        const lead = await textOf(page, '#modalRoot .sync-card .sync-lead');
        await shot(page, join(dir, 'after.png'));
        if (title !== 'Cloud sync') {
            return { ok: false, error: `Sync modal title was “${title}”.`, values: { title, lead } };
        }
        return {
            ok: true,
            values: {
                title, lead,
                endState: 'Cloud sync modal open with GitHub choice (no token entered)',
            },
        };
    },
};

async function cmdCheck(feature) {
    const name = String(feature || '').toLowerCase();
    if (!CHECKS[name]) {
        fail(`Unknown feature “${feature}”. One of: ${FEATURES.join(', ')}`);
        return;
    }
    const home = await fetchText(`${BASE}/`);
    if (!(home.status === 200 && isOurs(home.text))) {
        fail('App is not up. Run verify launch, then doctor.');
        return;
    }
    const dir = evidenceDir(name);
    const report = await withPage(async (page, logs) => {
        const sample = name === 'journal';
        const opened = name === 'curate'
            ? { url: `${BASE}/curate.html`, welcomed: false }
            : await openApp(page, { sample });
        const result = await CHECKS[name](page, dir);
        const report = {
            command: 'check',
            feature: name,
            base: BASE,
            evidence: dir,
            files: {
                before: existsSync(join(dir, 'before.png')) ? 'before.png' : null,
                after: existsSync(join(dir, 'after.png')) ? 'after.png' : null,
            },
            consoleErrors: logs.consoleErrors,
            pageErrors: logs.pageErrors,
            opened,
            ...result,
        };
        writeReport(dir, report);
        return report;
    });
    if (!report) return;
    if (!report.ok) {
        fail(report.error || `${name} check failed`, report);
        return;
    }
    ok(report);
}

const argv = process.argv.slice(2);
const cmd = argv[0];
const arg = argv.slice(1).join(' ').trim();

if (!cmd || cmd === 'help' || cmd === '-h' || cmd === '--help') {
    usage();
    process.exit(0);
}

try {
    if (cmd === 'launch') await cmdLaunch();
    else if (cmd === 'doctor') await cmdDoctor();
    else if (cmd === 'cleanup') await cmdCleanup();
    else if (cmd === 'shot') {
        if (!arg) { fail('shot needs a route, e.g. verify shot themes'); }
        else await cmdShot(arg);
    } else if (cmd === 'check') {
        if (!arg) { fail(`check needs a feature: ${FEATURES.join(', ')}`); }
        else await cmdCheck(arg);
    } else {
        fail(`Unknown command “${cmd}”. Try launch|doctor|shot|check|cleanup.`);
    }
} catch (err) {
    fail(err?.message || String(err), { stack: err?.stack });
}
process.exit(process.exitCode || 0);
