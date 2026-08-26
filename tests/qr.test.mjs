#!/usr/bin/env node
/* Tests for qr.js. Run: node tests/qr.test.mjs
   The decoder here is written independently from the encoder (own function-map,
   own zigzag reader, own GF math) so a placement bug can't cancel itself out. */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'qr.js'), 'utf8');
const QR = new Function(`${src}; return QR;`)();

let pass = 0, fail = 0;
function eq(actual, expected, label) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (ok) pass++;
    else { fail++; console.error(`✗ ${label}\n    expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
}
function ok(cond, label) { eq(!!cond, true, label); }

/* ---- capacity tables match the published byte-mode capacities (EC L) ---- */
const KNOWN_CAPACITY = [null, 17, 32, 53, 78, 106, 134, 154, 192, 230];
for (let v = 1; v <= 9; v++) {
    eq(QR._internals.dataCodewords(v) - 2, KNOWN_CAPACITY[v], `v${v}-L byte capacity`);
}
eq(QR._internals.rawDataModules(1), 208, 'raw data modules v1');
eq(QR._internals.rawDataModules(7), 1568, 'raw data modules v7');

/* ---- independent GF(256) for verification ---- */
const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
{
    let x = 1;
    for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x = x << 1; if (x & 0x100) x ^= 0x11D; }
    for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
}
const gmul = (a, b) => (a && b) ? EXP[LOG[a] + LOG[b]] : 0;

/* A valid RS codeword evaluates to zero at every generator root α^0..α^(ecc-1). */
function rsValid(codeword, eccLen) {
    for (let r = 0; r < eccLen; r++) {
        const root = EXP[r];
        let sum = 0;
        for (const b of codeword) sum = gmul(sum, root) ^ b;
        if (sum !== 0) return false;
    }
    return true;
}

/* ---- decoder ---- */
const ECC_PER_BLOCK = [0, 7, 10, 15, 20, 26, 18, 20, 24, 30];
const NUM_BLOCKS = [0, 1, 1, 1, 1, 1, 2, 2, 2, 2];
const ALIGN = { 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46] };

function functionMap(version) {
    const size = version * 4 + 17;
    const fn = Array.from({ length: size }, () => new Array(size).fill(false));
    const mark = (x, y) => { if (x >= 0 && x < size && y >= 0 && y < size) fn[y][x] = true; };
    for (let i = 0; i < size; i++) { mark(6, i); mark(i, 6); }
    for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
        for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) mark(cx + dx, cy + dy);
    }
    const centers = ALIGN[version] || [];
    for (const cy of centers) for (const cx of centers) {
        if ((cx === 6 && cy === 6) || (cx === 6 && cy === size - 7) || (cx === size - 7 && cy === 6)) continue;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) mark(cx + dx, cy + dy);
    }
    for (let i = 0; i <= 8; i++) {
        if (i !== 6) { mark(8, i); mark(i, 8); }
        if (i < 8) { mark(size - 1 - i, 8); mark(8, size - 1 - i); }
    }
    if (version >= 7) {
        for (let i = 0; i < 18; i++) {
            const a = size - 11 + (i % 3), b = Math.floor(i / 3);
            mark(a, b); mark(b, a);
        }
    }
    return fn;
}

const MASKS = [
    (x, y) => (x + y) % 2 === 0,
    (x, y) => y % 2 === 0,
    (x, y) => x % 3 === 0,
    (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
    (x, y) => (x * y % 2) + (x * y % 3) === 0,
    (x, y) => ((x * y % 2) + (x * y % 3)) % 2 === 0,
    (x, y) => (((x + y) % 2) + (x * y % 3)) % 2 === 0,
];

function verifyFormatCopy(m, size, bits) {
    let bits2 = 0;
    for (let i = 0; i < 8; i++) { if (m[8][size - 1 - i]) bits2 |= 1 << i; }
    for (let i = 8; i < 15; i++) { if (m[size - 15 + i][8]) bits2 |= 1 << i; }
    if ((bits2 ^ 0x5412) !== bits) throw new Error('format copies disagree');
    if (m[size - 8][8] !== true) throw new Error('dark module missing');
}

function decodeFormatBits(m, size) {
    let bits = 0;
    const put = (i, dark) => { if (dark) bits |= 1 << i; };
    for (let i = 0; i <= 5; i++) put(i, m[i][8]);
    put(6, m[7][8]); put(7, m[8][8]); put(8, m[8][7]);
    for (let i = 9; i < 15; i++) put(i, m[8][14 - i]);
    bits ^= 0x5412;
    const data5 = bits >>> 10;
    let rem = data5;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    if (((data5 << 10) | rem) !== bits) throw new Error('format BCH mismatch');
    const ecl = data5 >>> 3;
    if (ecl !== 0b01) throw new Error('expected EC level L');
    const mask = data5 & 7;
    verifyFormatCopy(m, size, bits);
    return mask;
}

function unmaskAndReadZigzag(m, size, mask, version) {
    const fn = functionMap(version);
    const stream = [];
    for (let right = size - 1; right >= 1; right -= 2) {
        if (right === 6) right = 5;
        for (let vert = 0; vert < size; vert++) {
            for (let j = 0; j < 2; j++) {
                const x = right - j;
                const upward = ((right + 1) & 2) === 0;
                const y = upward ? size - 1 - vert : vert;
                if (!fn[y][x]) stream.push((m[y][x] !== MASKS[mask](x, y)) ? 1 : 0);
            }
        }
    }
    const totalCW = Math.floor(stream.length / 8);
    const cw = new Uint8Array(totalCW);
    for (let i = 0; i < totalCW * 8; i++) cw[i >> 3] = (cw[i >> 3] << 1) | stream[i];
    return cw;
}

function deinterleaveAndVerifyRS(cw, version) {
    const numBlocks = NUM_BLOCKS[version];
    const eccLen = ECC_PER_BLOCK[version];
    const totalCW = cw.length;
    const dataLen = totalCW - eccLen * numBlocks;
    const blockLen = dataLen / numBlocks;
    const blocks = Array.from({ length: numBlocks }, () => ({ data: [], ecc: [] }));
    let p = 0;
    for (let i = 0; i < blockLen; i++) for (const b of blocks) b.data.push(cw[p++]);
    for (let i = 0; i < eccLen; i++) for (const b of blocks) b.ecc.push(cw[p++]);
    for (const b of blocks) {
        if (!rsValid([...b.data, ...b.ecc], eccLen)) throw new Error('RS check failed');
    }
    return blocks.flatMap((b) => b.data);
}

function parseByteModeData(dataCW) {
    const bit = (i) => (dataCW[i >> 3] >>> (7 - (i & 7))) & 1;
    let pos = 0;
    const read = (n) => { let v = 0; for (let i = 0; i < n; i++) v = (v << 1) | bit(pos++); return v; };
    if (read(4) !== 0b0100) throw new Error('not byte mode');
    const count = read(8);
    const bytes = [];
    for (let i = 0; i < count; i++) bytes.push(read(8));
    return Buffer.from(bytes).toString('utf8');
}

function decode(m) {
    const size = m.length;
    const version = (size - 17) / 4;
    if (!Number.isInteger(version) || version < 1 || version > 9) throw new Error('bad size');
    const mask = decodeFormatBits(m, size);
    const cw = unmaskAndReadZigzag(m, size, mask, version);
    const dataCW = deinterleaveAndVerifyRS(cw, version);
    const text = parseByteModeData(dataCW);
    return { version, mask, text };
}

/* ---- round trips across every version ---- */
const samples = [
    'HELLO',                                                              // v1
    'https://skyler.tools/#positions',                                    // v2
    'x'.repeat(53),                                                       // v3 boundary
    'https://skyler.tools/#pair=' + 'A'.repeat(80),                       // v5-ish
    'https://skyler.tools/#pair=' + 'Ab0_-'.repeat(26),                   // v6/7
    'https://skyler.tools/#pair=' + 'Q'.repeat(191),                      // v9-size pairing link (fine-grained PAT)
    'x'.repeat(230),                                                      // v9 boundary
];
for (const text of samples) {
    const m = QR.matrix(text);
    ok(m, `matrix built (${text.length} chars)`);
    if (!m) continue;
    try {
        const d = decode(m);
        eq(d.text, text, `round trip (${text.length} chars, v${d.version}, mask ${d.mask})`);
    } catch (err) {
        fail++; console.error(`✗ decode (${text.length} chars): ${err.message}`);
    }
}
eq(QR.matrix('x'.repeat(231)), null, 'over capacity → null');

/* ---- structure spot checks ---- */
{
    const m = QR.matrix('HELLO');
    eq(m.length, 21, 'v1 is 21×21');
    ok(m[0][0] && m[0][20] && m[20][0], 'finder corners dark');
    let timingOk = true;
    for (let i = 8; i < 13; i++) if (m[6][i] !== (i % 2 === 0) || m[i][6] !== (i % 2 === 0)) timingOk = false;
    ok(timingOk, 'timing pattern alternates');
}
{
    const svg = QR.svg('https://skyler.tools/#pair=test');
    ok(svg && svg.includes('viewBox') && svg.includes('#ffffff'), 'svg renders with white quiet zone');
}

console.log(`${pass + fail ? '' : ''}${pass}/${pass + fail} passed`);
if (fail) process.exit(1);
