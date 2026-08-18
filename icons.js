/* ============================================================
   icons.js — inline Lucide icon set (stroke, 24×24, currentColor)
   No CDN, no dependency: the handful of icons the app uses,
   inlined. Hydration: any <span data-icon="name"> gets filled at
   init; JS templates use ICONS.name directly.

   Also owns accent seeds + the tab favicon (Lucide trending-up
   on a rounded tile, painted in the active theme/accent).
   ============================================================ */
'use strict';

const ICONS = (() => {
    const w = (inner, cls = '') =>
        `<svg class="lucide ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

    return {
        sun: w('<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>'),
        moon: w('<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>'),
        sparkles: w('<path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3Z"/><path d="M5 3v4"/><path d="M3 5h4"/><path d="M19 17v4"/><path d="M17 19h4"/>'),
        palette: w('<circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>'),
        plus: w('<path d="M5 12h14"/><path d="M12 5v14"/>'),
        pencil: w('<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>'),
        archive: w('<rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>'),
        'archive-restore': w('<rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h2"/><path d="M20 8v11a2 2 0 0 1-2 2h-2"/><path d="m9 15 3-3 3 3"/><path d="M12 12v9"/>'),
        trash: w('<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>'),
        download: w('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>'),
        'arrow-right': w('<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>'),
        'chevron-left': w('<path d="m15 18-6-6 6-6"/>'),
        'chevron-right': w('<path d="m9 18 6-6-6-6"/>'),
        clipboard: w('<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>'),
        'chevron-down': w('<path d="m6 9 6 6 6-6"/>'),
        'shield-check': w('<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4" class="ic-tick"/>'),
        'circle-check': w('<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4" class="ic-tick"/>'),
        'circle-x': w('<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>'),
        'chart-candlestick': w('<path d="M9 5v4"/><rect width="4" height="6" x="7" y="9" rx="1"/><path d="M9 15v2"/><path d="M17 3v2"/><rect width="4" height="8" x="15" y="5" rx="1"/><path d="M17 13v3"/><path d="M3 3v16a2 2 0 0 0 2 2h16"/>'),
        calculator: w('<rect width="16" height="20" x="4" y="2" rx="2"/><line x1="8" x2="16" y1="6" y2="6"/><line x1="16" x2="16" y1="14" y2="18"/><path d="M16 10h.01"/><path d="M12 10h.01"/><path d="M8 10h.01"/><path d="M12 14h.01"/><path d="M8 14h.01"/><path d="M12 18h.01"/><path d="M8 18h.01"/>'),
        eye: w('<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>'),
        'eye-off': w('<path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/><path d="m2 2 20 20"/>'),
        'square-pen': w('<path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z"/>'),
        x: w('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'),
        gauge: w('<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>'),
        'calendar-days': w('<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/><path d="M8 18h.01"/><path d="M12 18h.01"/>'),
        cloud: w('<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>'),
        'trending-up': w('<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>'),
        target: w('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>'),
        activity: w('<path d="M3 12h4l3-8 4 16 3-8h4"/>'),
        'clipboard-check': w('<rect width="8" height="4" x="8" y="2" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>'),
        lightbulb: w('<path d="M9 18h6"/><path d="M10 22h4"/><path d="M8.5 14.5A6 6 0 1 1 15.5 14.5c-.9.7-1.5 1.6-1.5 2.5h-4c0-.9-.6-1.8-1.5-2.5Z"/>'),
        'notebook-pen': w('<path d="M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4"/><path d="M8 2v20M15 6.5l3.5-3.5a1.4 1.4 0 0 1 2 2L17 8.5 14 9Z"/>'),
        clock: w('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
        'circle-dashed': w('<path d="M10.1 2.182a10 10 0 0 1 3.8 0"/><path d="M13.9 21.818a10 10 0 0 1-3.8 0"/><path d="M17.609 3.721a10 10 0 0 1 2.69 2.7"/><path d="M2.182 13.9a10 10 0 0 1 0-3.8"/><path d="M20.279 17.609a10 10 0 0 1-2.7 2.69"/><path d="M21.818 10.1a10 10 0 0 1 0 3.8"/><path d="M3.721 6.391a10 10 0 0 1 2.7-2.69"/><path d="M6.391 20.279a10 10 0 0 1-2.69-2.7"/>'),
        search: w('<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>'),
        'external-link': w('<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>'),
        'message-square': w('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>'),
    };
})();

/* Fill every <span data-icon="name"> with its svg (called from app init). */
function hydrateIcons(root = document) {
    root.querySelectorAll('[data-icon]').forEach(el => {
        const svg = ICONS[el.dataset.icon];
        if (svg && !el.firstElementChild) el.innerHTML = svg;
    });
}

/* Accent seeds — Tailwind 600 / 500 / 400. Shared by the picker and the tab icon. */
const ACCENT_SEEDS = {
    navy:     { light: '#1a365d', dark: '#3b82f6', oled: '#60a5fa' },
    violet:   { light: '#7c3aed', dark: '#8b5cf6', oled: '#a855f7' },
    cyan:     { light: '#0891b2', dark: '#06b6d4', oled: '#22d3ee' },
    emerald:  { light: '#059669', dark: '#10b981', oled: '#34d399' },
    amber:    { light: '#b45309', dark: '#f59e0b', oled: '#fbbf24' },
    orange:   { light: '#c2410c', dark: '#f97316', oled: '#fb923c' },
    rose:     { light: '#e11d48', dark: '#f43f5e', oled: '#fb7185' },
    graphite: { light: '#475569', dark: '#64748b', oled: '#e4e4e7' },
};

function accentSeedFor(name, mode) {
    const a = ACCENT_SEEDS[name] || ACCENT_SEEDS.navy;
    if (mode === 'oled') return a.oled || a.dark;
    if (mode === 'dark') return a.dark;
    return a.light;
}

function contrastInk(hex) {
    const h = String(hex).replace('#', '');
    const rgb = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
    const lin = rgb.map(v => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    const lum = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
    return 1.05 / (lum + 0.05) < 3.5 ? '#16181d' : '#ffffff';
}

function faviconSvg(fill, ink) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="9" fill="${fill}"/><g fill="none" stroke="${ink}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="7 20 13 14 17 18 25 10"/><polyline points="19 10 25 10 25 16"/></g></svg>`;
}

/* Discrete accent/theme changes paint immediately. Rainbow is queued so the
   tab icon steps instead of rewriting every animation frame. */
function paintFavicon(fill) {
    if (!fill) return;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (paintFavicon._lock && now - paintFavicon._at < 280) {
        paintFavicon._pending = fill;
        if (!paintFavicon._timer) {
            paintFavicon._timer = setTimeout(() => {
                paintFavicon._timer = 0;
                paintFavicon._lock = false;
                const next = paintFavicon._pending;
                paintFavicon._pending = '';
                if (next) paintFavicon(next);
            }, 280);
        }
        return;
    }
    const ink = contrastInk(fill);
    const href = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(faviconSvg(fill, ink));
    const link = document.getElementById('favicon') || document.querySelector('link[rel="icon"]');
    if (!link || link.getAttribute('href') === href) return;
    link.type = 'image/svg+xml';
    link.sizes = 'any';
    link.href = href;
    paintFavicon._lock = true;
    paintFavicon._at = now;
}

function paintFaviconFromStorage() {
    const mode = document.documentElement.getAttribute('data-theme') || 'light';
    let name = '';
    try { name = localStorage.getItem('tradeTracker_accent') || ''; } catch (_) { /* private mode */ }
    if (name === 'rainbow') name = 'violet';
    paintFavicon(accentSeedFor(name, mode));
}
