/* ============================================================
   gist-sync.js — GitHub gist request policy + trade merge.
   Used by app.js. GitHub GETs are Cache-Control: max-age=60;
   devices must opt out or a reload reuses a stale gist.
   ============================================================ */
'use strict';

const GIST_SYNC = (() => {
    function fetchInit(token, { method = 'GET', body, keepalive = false } = {}) {
        const headers = {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
        };
        if (body != null) headers['Content-Type'] = 'application/json';
        const init = { method, headers, cache: 'no-store', keepalive: !!keepalive };
        if (body != null) init.body = body;
        return init;
    }

    function isConflict(baseline, updatedAt) {
        return Boolean(baseline && updatedAt && baseline !== updatedAt);
    }

    /* 'hidden' = tab still alive (iOS drops keepalive PATCH).
       'unload' = tab dying, keepalive is the only shot. */
    function keepaliveFor(reason) {
        return reason === 'unload';
    }

    function stamp(t) {
        return Date.parse(t?.updatedAt || t?.createdAt || 0) || 0;
    }

    function mergeLocalTrades(local, cloudById, seen, out) {
        for (const t of local) {
            if (!t || !t.id) continue;
            seen.add(t.id);
            const c = cloudById.get(t.id);
            out.push(!c || stamp(t) >= stamp(c) ? t : c);
        }
    }

    function addNewCloudTrades(cloud, seen, out) {
        for (const t of cloud) {
            if (!t || !t.id || seen.has(t.id)) continue;
            out.push(t);
        }
    }

    function mergeTrades(local, cloud) {
        if (!Array.isArray(local)) return Array.isArray(cloud) ? cloud.slice() : [];
        if (!Array.isArray(cloud)) return local.slice();
        const cloudById = new Map();
        for (const t of cloud) {
            if (t && t.id) cloudById.set(t.id, t);
        }
        const seen = new Set();
        const out = [];
        mergeLocalTrades(local, cloudById, seen, out);
        addNewCloudTrades(cloud, seen, out);
        return out;
    }

    return { fetchInit, isConflict, keepaliveFor, mergeTrades };
})();
