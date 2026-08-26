/* ============================================================
   qr.js — minimal QR encoder for the sync pairing link.
   Byte mode, error-correction level L, versions 1–9 (≤230 chars),
   automatic mask selection. No dependencies, no CDN — same rule
   as icons.js. Algorithm follows the QR spec (ISO/IEC 18004);
   structure mirrors the well-known nayuki reference encoder.
   Exposes QR.matrix(text) → boolean[][] | null (too long), and
   QR.svg(text) → svg string on a white quiet-zone tile.
   ============================================================ */
'use strict';

const QR = (() => {
    /* ---- per-version tables, EC level L only ---- */
    const ECC_PER_BLOCK = [0, 7, 10, 15, 20, 26, 18, 20, 24, 30];
    const NUM_BLOCKS = [0, 1, 1, 1, 1, 1, 2, 2, 2, 2];
    const ALIGN = { 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46] };
    const MAX_VERSION = 9;

    function rawDataModules(v) {
        let r = (16 * v + 128) * v + 64;
        if (v >= 2) {
            const a = Math.floor(v / 7) + 2;
            r -= (25 * a - 10) * a - 55;
            if (v >= 7) r -= 36;
        }
        return r;
    }
    const dataCodewords = (v) => Math.floor(rawDataModules(v) / 8) - ECC_PER_BLOCK[v] * NUM_BLOCKS[v];

    /* ---- GF(256), reducing polynomial 0x11D ---- */
    const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
    (() => {
        let x = 1;
        for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11D; }
        for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
    })();
    const gmul = (a, b) => (a && b) ? EXP[LOG[a] + LOG[b]] : 0;

    /* Generator polynomial coefficients, highest degree first, leading 1 dropped. */
    function rsDivisor(degree) {
        const result = new Array(degree).fill(0);
        result[degree - 1] = 1;
        let root = 1;
        for (let i = 0; i < degree; i++) {
            for (let j = 0; j < result.length; j++) {
                result[j] = gmul(result[j], root);
                if (j + 1 < result.length) result[j] ^= result[j + 1];
            }
            root = gmul(root, 0x02);
        }
        return result;
    }
    function rsRemainder(data, divisor) {
        const result = divisor.map(() => 0);
        for (const b of data) {
            const factor = b ^ result.shift();
            result.push(0);
            divisor.forEach((coef, i) => { result[i] ^= gmul(coef, factor); });
        }
        return result;
    }

    /* ---- data codewords: byte mode, terminator, pad bytes ---- */
    function buildCodewords(bytes, version) {
        const capacity = dataCodewords(version) * 8;
        const bits = [];
        const push = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
        push(0b0100, 4);            // byte mode
        push(bytes.length, 8);      // char count is 8 bits for v1–9 byte mode
        for (const b of bytes) push(b, 8);
        push(0, Math.min(4, capacity - bits.length));   // terminator
        while (bits.length % 8) bits.push(0);
        for (let pad = 0xEC; bits.length < capacity; pad ^= 0xEC ^ 0x11) push(pad, 8);
        const out = new Uint8Array(capacity / 8);
        bits.forEach((bit, i) => { out[i >> 3] |= bit << (7 - (i & 7)); });
        return out;
    }

    /* Split into blocks, append ECC, interleave. All L blocks ≤ v9 are equal size. */
    function addEccAndInterleave(data, version) {
        const numBlocks = NUM_BLOCKS[version];
        const eccLen = ECC_PER_BLOCK[version];
        const blockLen = data.length / numBlocks;
        const divisor = rsDivisor(eccLen);
        const blocks = [];
        for (let i = 0; i < numBlocks; i++) {
            const chunk = [...data.slice(i * blockLen, (i + 1) * blockLen)];
            blocks.push({ data: chunk, ecc: rsRemainder(chunk, divisor) });
        }
        const out = [];
        for (let i = 0; i < blockLen; i++) for (const b of blocks) out.push(b.data[i]);
        for (let i = 0; i < eccLen; i++) for (const b of blocks) out.push(b.ecc[i]);
        return Uint8Array.from(out);
    }

    /* ---- matrix ---- */
    function drawTiming(size, set) {
        for (let i = 0; i < size; i++) {
            set(6, i, i % 2 === 0);
            set(i, 6, i % 2 === 0);
        }
    }

    function drawFinders(size, set) {
        const finder = (cx, cy) => {
            for (let dy = -4; dy <= 4; dy++) {
                for (let dx = -4; dx <= 4; dx++) {
                    const x = cx + dx, y = cy + dy;
                    if (x < 0 || x >= size || y < 0 || y >= size) continue;
                    const d = Math.max(Math.abs(dx), Math.abs(dy));
                    set(x, y, d !== 2 && d !== 4);
                }
            }
        };
        finder(3, 3);
        finder(size - 4, 3);
        finder(3, size - 4);
    }

    function drawAlignment(version, size, set) {
        const centers = ALIGN[version] || [];
        for (const cy of centers) {
            for (const cx of centers) {
                const corner = (cx === 6 && cy === 6) || (cx === 6 && cy === size - 7) || (cx === size - 7 && cy === 6);
                if (corner) continue;
                for (let dy = -2; dy <= 2; dy++) {
                    for (let dx = -2; dx <= 2; dx++) {
                        set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
                    }
                }
            }
        }
    }

    function reserveFormatAreas(size, set) {
        for (let i = 0; i <= 8; i++) {
            if (i !== 6) {
                set(8, i, false);
                set(i, 8, false);
            }
            if (i < 8) {
                set(size - 1 - i, 8, false);
                set(8, size - 1 - i, false);
            }
        }
        set(8, size - 8, true);
    }

    function drawVersionInfo(version, size, set) {
        if (version >= 7) {
            let rem = version;
            for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
            const bits = version << 12 | rem;
            for (let i = 0; i < 18; i++) {
                const bit = ((bits >>> i) & 1) === 1;
                const a = size - 11 + (i % 3), b = Math.floor(i / 3);
                set(a, b, bit);
                set(b, a, bit);
            }
        }
    }

    function placeDataZigzag(size, modules, isFunction, codewords) {
        let i = 0;
        for (let right = size - 1; right >= 1; right -= 2) {
            if (right === 6) right = 5;
            for (let vert = 0; vert < size; vert++) {
                for (let j = 0; j < 2; j++) {
                    const x = right - j;
                    const upward = ((right + 1) & 2) === 0;
                    const y = upward ? size - 1 - vert : vert;
                    if (!isFunction[y][x] && i < codewords.length * 8) {
                        modules[y][x] = ((codewords[i >> 3] >>> (7 - (i & 7))) & 1) === 1;
                        i++;
                    }
                }
            }
        }
    }

    function makeMatrix(version, codewords) {
        const size = version * 4 + 17;
        const modules = Array.from({ length: size }, () => new Array(size).fill(false));
        const isFunction = Array.from({ length: size }, () => new Array(size).fill(false));
        const set = (x, y, dark) => { modules[y][x] = dark; isFunction[y][x] = true; };
        drawTiming(size, set);
        drawFinders(size, set);
        drawAlignment(version, size, set);
        reserveFormatAreas(size, set);
        drawVersionInfo(version, size, set);
        placeDataZigzag(size, modules, isFunction, codewords);
        return { size, modules, isFunction };
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

    /* Format bits for EC level L (bits 01) + mask, BCH(15,5), then placement. */
    function drawFormat(modules, size, mask) {
        const data = (0b01 << 3) | mask;
        let rem = data;
        for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
        const bits = ((data << 10) | rem) ^ 0x5412;
        const bit = (i) => ((bits >>> i) & 1) === 1;
        for (let i = 0; i <= 5; i++) modules[i][8] = bit(i);
        modules[7][8] = bit(6);
        modules[8][8] = bit(7);
        modules[8][7] = bit(8);
        for (let i = 9; i < 15; i++) modules[8][14 - i] = bit(i);
        for (let i = 0; i < 8; i++) modules[8][size - 1 - i] = bit(i);
        for (let i = 8; i < 15; i++) modules[size - 15 + i][8] = bit(i);
        modules[size - 8][8] = true;
    }

    /* Penalty score per the spec's four rules. */
    function penalty(modules, size) {
        let score = 0;
        const runScore = (run) => (run >= 5 ? 3 + (run - 5) : 0);
        for (let y = 0; y < size; y++) {
            let runColor = modules[y][0], run = 1;
            for (let x = 1; x < size; x++) {
                if (modules[y][x] === runColor) run++;
                else { score += runScore(run); runColor = modules[y][x]; run = 1; }
            }
            score += runScore(run);
        }
        for (let x = 0; x < size; x++) {
            let runColor = modules[0][x], run = 1;
            for (let y = 1; y < size; y++) {
                if (modules[y][x] === runColor) run++;
                else { score += runScore(run); runColor = modules[y][x]; run = 1; }
            }
            score += runScore(run);
        }
        for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) {
            const c = modules[y][x];
            if (c === modules[y][x + 1] && c === modules[y + 1][x] && c === modules[y + 1][x + 1]) score += 3;
        }
        const P1 = [true, false, true, true, true, false, true, false, false, false, false];
        const P2 = [...P1].reverse();
        const windowAt = (get) => {
            for (let s = 0; s <= size - 11; s++) {
                let m1 = true, m2 = true;
                for (let k = 0; k < 11; k++) {
                    const v = get(s + k);
                    if (v !== P1[k]) m1 = false;
                    if (v !== P2[k]) m2 = false;
                }
                if (m1) score += 40;
                if (m2) score += 40;
            }
        };
        for (let y = 0; y < size; y++) windowAt((x) => modules[y][x]);
        for (let x = 0; x < size; x++) windowAt((y) => modules[y][x]);
        let dark = 0;
        for (const row of modules) for (const m of row) if (m) dark++;
        const total = size * size;
        score += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
        return score;
    }

    function matrix(text) {
        const bytes = typeof TextEncoder !== 'undefined'
            ? new TextEncoder().encode(text)
            : Uint8Array.from(String(text), (c) => c.charCodeAt(0) & 0xFF);
        let version = 0;
        for (let v = 1; v <= MAX_VERSION; v++) {
            if (bytes.length <= dataCodewords(v) - 2) { version = v; break; }
        }
        if (!version) return null;
        const codewords = addEccAndInterleave(buildCodewords(bytes, version), version);
        const { size, modules, isFunction } = makeMatrix(version, codewords);
        let best = null, bestScore = Infinity;
        for (let mask = 0; mask < 8; mask++) {
            const trial = modules.map((row) => row.slice());
            for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
                if (!isFunction[y][x] && MASKS[mask](x, y)) trial[y][x] = !trial[y][x];
            }
            drawFormat(trial, size, mask);
            const score = penalty(trial, size);
            if (score < bestScore) { bestScore = score; best = trial; }
        }
        return best;
    }

    /* White tile with a 4-module quiet zone — scanners need the contrast,
       so the tile stays white in dark mode too. */
    function svg(text) {
        const m = matrix(text);
        if (!m) return null;
        const size = m.length, quiet = 4, full = size + quiet * 2;
        let d = '';
        for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
            if (m[y][x]) d += `M${x + quiet} ${y + quiet}h1v1h-1z`;
        }
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${full} ${full}" shape-rendering="crispEdges" role="img" aria-label="Pairing QR code">`
            + `<rect width="${full}" height="${full}" fill="#ffffff"/>`
            + `<path d="${d}" fill="#000000"/></svg>`;
    }

    return { matrix, svg, _internals: { dataCodewords, rsDivisor, rsRemainder, buildCodewords, addEccAndInterleave, rawDataModules } };
})();
