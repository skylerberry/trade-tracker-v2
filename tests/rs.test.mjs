import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../rs.js', import.meta.url), 'utf8');
const { denseRanks, rankColor, rankVsBenchmark, visibleIds, monthMarks } = new Function(`${src}; return RANK_HISTORY`)();

const ids = ['oil-gas', 'semiconductors', 'cybersecurity'];
const session = { 'oil-gas': 4, 'semiconductors': 1, 'cybersecurity': 9, 'retail': 2 };
assert.deepEqual(denseRanks(session, ids), { semiconductors: 1, 'oil-gas': 2, cybersecurity: 3 });
assert.equal(denseRanks({}, ids)['oil-gas'], undefined);

const top = rankColor(1, 10);
const bottom = rankColor(10, 10);
assert.match(top, /^rgb\(/);
assert.notEqual(top, bottom);

const history = { sessions: [{ ranks: { m: session } }] };
const names = { 'oil-gas': 'Oil & Gas', semiconductors: 'Semis', cybersecurity: 'Cyber', retail: 'Retail' };
const focused = visibleIds(history, names, { scope: 'all', query: '', window: 'm' });
assert.ok(focused.includes('retail'));
assert.deepEqual(visibleIds(history, names, { scope: 'all', query: 'oil', window: 'm' }), ['oil-gas']);

const marks = monthMarks(['2026-08-31', '2026-09-01', '2026-09-16']);
assert.equal(marks[0].label, 'AUG');
assert.equal(marks[1].label, 'SEP');
assert.equal(marks[1].i, 1);
assert.deepEqual(rankVsBenchmark({ a: 3, b: 1 }, 2), { a: 1, b: 2 });

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
assert.match(html, /data-seg="rs"/);
assert.match(html, /id="rsView"/);
assert.match(html, /Relative strength/);
assert.doesNotMatch(html, /Relative Strength/);
assert.match(html, /data-seg="SPY"/);
assert.match(html, /data-seg="QQQ"/);
assert.match(html, /<dt>Index<\/dt>/);
assert.match(src, /MOTION\.collapsible/);
assert.match(readFileSync(new URL('../rs.css', import.meta.url), 'utf8'), /#rsView \.rs-row\{border:0/);
assert.match(readFileSync(new URL('../package.json', import.meta.url), 'utf8'), /rs\.js/);

console.log('RS: assertions passed');
