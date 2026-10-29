'use strict';

/**
 * Relays verified Netlify `feedback` submissions to the Grok Bot inbox webhook.
 *
 * Netlify's HTTP POST form notification cannot send an Authorization header.
 * Grok Bot routines require one (`Authorization: Bearer <key>`), so that
 * notification never wakes the bot. This event function can.
 *
 * Env (set in the Netlify UI; never commit values):
 *   INBOX_WEBHOOK_URL   routine "POST to" URL
 *   INBOX_WEBHOOK_AUTH  routine "header" field — the full Authorization value
 *   INBOX_WEBHOOK_KEY   routine "key" field — sent as X-Automation-Key, and as
 *                       Authorization: Bearer <key> when AUTH is unset
 */

const FORM_NAME = 'feedback';
const FIELD_NAMES = Object.freeze(['message', 'email', 'view', 'theme', 'accent']);
const HONEYPOT_FIELD = 'bot-field';
const TIMEOUT_MS = 8000;

function text(value) {
    if (value == null) return '';
    return String(value).trim();
}

function decodeBody(event) {
    if (!event || event.body == null || event.body === '') return null;
    let raw = event.body;
    if (event.isBase64Encoded && typeof raw === 'string') {
        raw = Buffer.from(raw, 'base64').toString('utf8');
    }
    if (typeof raw === 'string') {
        try { raw = JSON.parse(raw); }
        catch { return null; }
    }
    if (!raw || typeof raw !== 'object') return null;
    return raw;
}

function parseSubmission(event) {
    const body = decodeBody(event);
    if (!body) return null;
    const payload = body.payload && typeof body.payload === 'object' ? body.payload : body;
    const data = payload.data && typeof payload.data === 'object' ? payload.data : {};
    return {
        formName: text(payload.form_name || payload.formName || data['form-name']),
        honeypot: text(data[HONEYPOT_FIELD] ?? payload[HONEYPOT_FIELD]),
        data,
    };
}

function shapePayload(data) {
    const payload = {};
    for (const name of FIELD_NAMES) payload[name] = text(data && data[name]);
    return payload;
}

function authHeaders(env) {
    const headers = { 'Content-Type': 'application/json' };
    const auth = text(env && env.INBOX_WEBHOOK_AUTH);
    const key = text(env && env.INBOX_WEBHOOK_KEY);
    if (auth) headers.Authorization = auth;
    else if (key) headers.Authorization = `Bearer ${key}`;
    if (key) headers['X-Automation-Key'] = key;
    return headers;
}

function plan(event, env) {
    const parsed = parseSubmission(event);
    if (!parsed || parsed.formName !== FORM_NAME) {
        return { action: 'skip', reason: 'form' };
    }
    if (parsed.honeypot) {
        return { action: 'skip', reason: 'honeypot' };
    }
    const payload = shapePayload(parsed.data);
    const url = text(env && env.INBOX_WEBHOOK_URL);
    const auth = text(env && env.INBOX_WEBHOOK_AUTH);
    const key = text(env && env.INBOX_WEBHOOK_KEY);
    if (!url) {
        return {
            action: 'unconfigured',
            reason: 'INBOX_WEBHOOK_URL is not set; skipping inbox forward',
            payload,
        };
    }
    if (!auth && !key) {
        return {
            action: 'unconfigured',
            reason: 'INBOX_WEBHOOK_AUTH and INBOX_WEBHOOK_KEY are not set; skipping inbox forward',
            payload,
        };
    }
    return {
        action: 'forward',
        url,
        headers: authHeaders(env),
        payload,
    };
}

async function run(event, env, fetcher) {
    const planned = plan(event, env);
    if (planned.action === 'skip') {
        return { statusCode: 200, body: planned.reason };
    }
    if (planned.action === 'unconfigured') {
        console.warn(planned.reason);
        return { statusCode: 200, body: 'unconfigured' };
    }
    const post = fetcher || fetch;
    try {
        const res = await post(planned.url, {
            method: 'POST',
            headers: planned.headers,
            body: JSON.stringify(planned.payload),
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!res || !res.ok) {
            console.warn(`inbox webhook returned ${res && res.status}`);
        }
    } catch (err) {
        const timedOut = err && (err.name === 'TimeoutError' || err.name === 'AbortError');
        console.warn(timedOut ? 'inbox webhook timeout' : 'inbox webhook error');
    }
    return { statusCode: 200, body: 'ok' };
}

exports.handler = async (event) => run(event, process.env);

exports.FORM_NAME = FORM_NAME;
exports.FIELD_NAMES = FIELD_NAMES;
exports.HONEYPOT_FIELD = HONEYPOT_FIELD;
exports.TIMEOUT_MS = TIMEOUT_MS;
exports.parseSubmission = parseSubmission;
exports.shapePayload = shapePayload;
exports.authHeaders = authHeaders;
exports.plan = plan;
exports.run = run;
