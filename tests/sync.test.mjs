#!/usr/bin/env node
/* Two-device gist sync seams. Run: node tests/sync.test.mjs */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'gist-sync.js'), 'utf8');
const app = readFileSync(join(root, 'app.js'), 'utf8');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const pkg = readFileSync(join(root, 'package.json'), 'utf8');
const GIST_SYNC = new Function(`${src}; return GIST_SYNC;`)();

let pass = 0, fail = 0;
function eq(actual, expected, label) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (ok) pass++;
    else { fail++; console.error(`✗ ${label}\n    expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
}

/* GitHub's gist GET is Cache-Control: private, max-age=60. A Mac reload
   after a phone write must not reuse that cached GET. */
eq(GIST_SYNC.fetchInit('tok').cache, 'no-store', 'gist GET uses cache: no-store');
eq(GIST_SYNC.fetchInit('tok', { method: 'PATCH', body: '{}' }).cache, 'no-store', 'gist PATCH uses cache: no-store');
eq(GIST_SYNC.fetchInit('tok', { method: 'PATCH', body: '{}' }).headers['Content-Type'], 'application/json', 'PATCH sends JSON content-type');
eq('Content-Type' in GIST_SYNC.fetchInit('tok').headers, false, 'GET does not send content-type');

/* iOS Safari drops fetch keepalive when the tab is only backgrounded.
   Hide-flush must use a normal fetch; unload may still keepalive. */
eq(GIST_SYNC.keepaliveFor('hidden'), false, 'visibility hide does not use keepalive');
eq(GIST_SYNC.keepaliveFor('unload'), true, 'tab close may use keepalive');

eq(GIST_SYNC.isConflict('T1', 'T1'), false, 'same updated_at is not a conflict');
eq(GIST_SYNC.isConflict('T1', 'T2'), true, 'newer cloud updated_at is a conflict');
eq(GIST_SYNC.isConflict(null, 'T2'), false, 'first push has no baseline');

const open = { id: 't1', ticker: 'TEST', exits: [], updatedAt: '2026-08-23T17:00:00.000Z' };
const closed = { id: 't1', ticker: 'TEST', exits: [{ id: 'x1', kind: 'close', shares: 100, price: 10 }], updatedAt: '2026-08-23T17:05:00.000Z' };

eq(
    GIST_SYNC.mergeTrades([closed], [open])[0].exits[0].kind,
    'close',
    'phone close (newer updatedAt) wins over desktop open',
);
eq(
    GIST_SYNC.mergeTrades([open], [closed])[0].exits[0].kind,
    'close',
    'cloud close (newer updatedAt) wins over stale local open',
);
eq(
    GIST_SYNC.mergeTrades([closed], [open, { id: 't2', ticker: 'OTHER', exits: [], updatedAt: '2026-08-23T17:01:00.000Z' }]).map(t => t.id),
    ['t1', 't2'],
    'cloud-only trade is kept when merging a close',
);

/* The exact report: desktop logs a trade, both devices pull, phone closes,
   Mac reloads. With HTTP caching the Mac GET is still the open trade. */
function roundTrip(cacheMode) {
    const gist = { updated_at: 'T0', trades: [] };
    const httpCache = new Map();
    const get = (device) => {
        if (cacheMode !== 'no-store' && httpCache.has(device)) return httpCache.get(device);
        const body = { updated_at: gist.updated_at, trades: JSON.parse(JSON.stringify(gist.trades)) };
        httpCache.set(device, body);
        return body;
    };
    const patch = (trades) => {
        gist.trades = JSON.parse(JSON.stringify(trades));
        gist.updated_at = 'T' + (Number(String(gist.updated_at).slice(1)) + 1);
    };

    patch([open]);                 // desktop creates the test trade
    eq(get('mac').trades[0].exits.length, 0, `${cacheMode}: mac sees the new trade`);
    eq(get('phone').trades[0].exits.length, 0, `${cacheMode}: phone sees the new trade`);
    patch([closed]);               // phone closes it
    return get('mac').trades[0].exits.length;
}

eq(roundTrip('default'), 0, 'cached GET (today\'s GitHub max-age=60) hides the phone close on mac reload');
eq(roundTrip(GIST_SYNC.fetchInit('tok').cache), 1, 'no-store GET on mac reload sees the phone close');

/* The qr.js deploy miss: index referenced a file the build copy list omitted.
   Lock the wiring so gist-sync.js cannot ship the same way. */
eq(html.includes('src="gist-sync.js"') && html.indexOf('gist-sync.js') < html.indexOf('src="app.js"'), true, 'index.html loads gist-sync.js before app.js');
eq(pkg.includes('gist-sync.js'), true, 'build copy list includes gist-sync.js');
eq(app.includes('GIST_SYNC.fetchInit'), true, 'app.js uses gist request policy');
eq(app.includes('GIST_SYNC.mergeTrades'), true, 'app.js merges trades on conflict instead of pausing');
eq(/keepalive:\s*flush/.test(app), false, 'hide-flush does not pass keepalive: flush');

const nLocal = { id: 'n1', text: 'local', createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-11T12:00:00.000Z', pinned: true };
const nCloud = { id: 'n1', text: 'cloud', createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-11T11:00:00.000Z', pinned: false };
eq(GIST_SYNC.mergeNotes([nLocal], [nCloud])[0].text, 'local', 'later updatedAt wins for notes');
eq(GIST_SYNC.mergeNotes([nLocal], [nCloud])[0].pinned, true, 'pinned follows the winning note');
eq(GIST_SYNC.mergeNotes([nCloud], [nLocal])[0].text, 'local', 'cloud later updatedAt wins over stale local');
eq(
    GIST_SYNC.mergeNotes(
        [nLocal],
        [nCloud, { id: 'n2', text: 'only cloud', createdAt: '2026-09-02T00:00:00.000Z', updatedAt: null, pinned: false }],
    ).map(n => n.id),
    ['n1', 'n2'],
    'cloud-only note is kept (union by id)',
);
eq(
    GIST_SYNC.mergeNotes(
        [nLocal, { id: 'n3', text: 'only local', createdAt: '2026-09-03T00:00:00.000Z', updatedAt: null, pinned: false }],
        [nCloud],
    ).map(n => n.id),
    ['n1', 'n3'],
    'local-only note is kept (union by id)',
);
eq(GIST_SYNC.mergeNotes(null, [nCloud]).map(n => n.id), ['n1'], 'non-array local yields cloud notes');
const localPin = { id: 'n1', text: 'old', createdAt: '2026-09-11T10:00:00.000Z', updatedAt: '2026-09-11T11:00:00.000Z', changedAt: '2026-09-11T13:00:00.000Z', pinned: true };
const cloudEdit = { id: 'n1', text: 'new', createdAt: '2026-09-11T10:00:00.000Z', updatedAt: '2026-09-11T12:00:00.000Z', changedAt: '2026-09-11T12:00:00.000Z', pinned: false };
eq(GIST_SYNC.mergeNotes([localPin], [cloudEdit])[0].pinned, true, 'later pin changedAt wins over earlier text edit');
eq(GIST_SYNC.mergeNotes([localPin], [cloudEdit])[0].text, 'old', 'winning pin keeps its text');
eq(GIST_SYNC.mergeNotes([cloudEdit], [localPin])[0].pinned, true, 'cloud pin with later changedAt wins');
eq(app.includes("'notes.json'"), true, 'app.js names notes.json in gist files');
eq(app.includes("gistFileContent(json, 'notes.json')") || app.includes('gistFileContent(json, "notes.json")') || /gistFileContent\([^,]+,\s*'notes.json'\)/.test(app), true, 'app.js pulls notes.json');
eq(app.includes("kind === 'notes'") || app.includes('kind === "notes"'), true, 'app.js pushes notes as their own gist file');

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
