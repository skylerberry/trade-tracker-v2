#!/usr/bin/env node
/* ============================================================
   serve.mjs — tiny static server for local preview only.
   Production is plain static hosting (lite.skyler.tools/Netlify).

     node serve.mjs   → http://localhost:4173
   ============================================================ */
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 4173;
const MIME = {
    '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
    '.mjs': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml',
    '.png': 'image/png', '.ico': 'image/x-icon',
};

http.createServer(async (req, res) => {
    try {
        let file = new URL(req.url, `http://localhost:${PORT}`).pathname;
        if (file === '/') file = '/index.html';
        const full = join(ROOT, file.replace(/\.\./g, ''));
        const body = await readFile(full);
        res.writeHead(200, {
            'Content-Type': MIME[extname(full)] || 'application/octet-stream',
            // preview server: never let the browser serve a stale edit
            'Cache-Control': 'no-store, max-age=0',
        });
        res.end(body);
    } catch (err) {
        res.writeHead(err.code === 'ENOENT' ? 404 : 500);
        res.end(err.code === 'ENOENT' ? 'not found' : 'server error');
    }
}).listen(PORT, () => console.log(`Trade Tracker 2.0 → http://localhost:${PORT}`));
