#!/usr/bin/env node
/* ============================================================
   serve.mjs — local preview. Idempotent: safe to run if already up.
   Binds 0.0.0.0 so a phone on the same Wi-Fi can open the LAN URL.

     npm start   →  http://localhost:4173
                    http://<your-mac>.4173 on the LAN
   ============================================================ */
import http from 'node:http';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 4173);
const MIME = {
    '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
    '.mjs': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml',
    '.png': 'image/png', '.ico': 'image/x-icon',
};

function lanAddress() {
    for (const addrs of Object.values(os.networkInterfaces())) {
        for (const a of addrs || []) {
            if ((a.family === 'IPv4' || a.family === 4) && !a.internal) return a.address;
        }
    }
    return null;
}

async function fetchText(url) {
    try {
        const res = await fetch(url, { signal: AbortSignal.timeout(600) });
        return await res.text();
    } catch {
        return null;
    }
}

function isOurs(html) {
    return typeof html === 'string' && html.includes('Trader Tools Suite');
}

function printUrls(status) {
    const lan = lanAddress();
    console.log(`Trade Tracker 2.0 ${status}`);
    console.log(`  laptop  http://localhost:${PORT}`);
    if (lan) console.log(`  phone   http://${lan}:${PORT}   (same Wi-Fi)`);
}

function listenPids() {
    try {
        const out = execSync(`lsof -tiTCP:${PORT} -sTCP:LISTEN`, { encoding: 'utf8' }).trim();
        return out ? out.split(/\s+/).filter(Boolean) : [];
    } catch {
        return [];
    }
}

const localHtml = await fetchText(`http://127.0.0.1:${PORT}/`);
if (isOurs(localHtml)) {
    const lan = lanAddress();
    const lanHtml = lan ? await fetchText(`http://${lan}:${PORT}/`) : null;
    if (isOurs(lanHtml) || !lan) {
        printUrls('already running');
        process.exit(0);
    }
    const pids = listenPids();
    if (pids.length) {
        console.log(`Port ${PORT} is laptop-only — restarting so your phone can reach it.`);
        try { execSync(`kill ${pids.join(' ')}`); } catch { /* gone */ }
        await new Promise((r) => setTimeout(r, 250));
    }
}

const server = http.createServer(async (req, res) => {
    try {
        let file = new URL(req.url, `http://localhost:${PORT}`).pathname;
        if (file === '/') file = '/index.html';
        const full = join(ROOT, file.replace(/\.\./g, ''));
        const body = await readFile(full);
        res.writeHead(200, {
            'Content-Type': MIME[extname(full)] || 'application/octet-stream',
            'Cache-Control': 'no-store, max-age=0',
        });
        res.end(body);
    } catch (err) {
        res.writeHead(err.code === 'ENOENT' ? 404 : 500);
        res.end(err.code === 'ENOENT' ? 'not found' : 'server error');
    }
});

await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(PORT, '0.0.0.0', resolve);
}).catch((err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is in use by something else. Stop it, then npm start.`);
        process.exit(1);
    }
    throw err;
});

printUrls('→');
