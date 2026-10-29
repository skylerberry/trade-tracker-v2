#!/usr/bin/env node
/* Filtering and payload shaping for the feedback inbox relay. */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const relay = require(join(dirname(fileURLToPath(import.meta.url)), '..', 'netlify/functions/submission-created.js'));

let pass = 0, fail = 0;
function eq(actual, expected, label) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (ok) pass++;
    else { fail++; console.error(`✗ ${label}\n    expected ${JSON.stringify(expected)}\n    got      ${JSON.stringify(actual)}`); }
}
function ok(cond, label) { eq(!!cond, true, label); }

const ENV = {
    INBOX_WEBHOOK_URL: 'https://example.test/inbox',
    INBOX_WEBHOOK_AUTH: 'Bearer test-token',
};

function eventFor(payload, extra = {}) {
    return { body: JSON.stringify({ payload }), ...extra };
}

const feedbackData = {
    message: '  Ship it.  ',
    email: 'skyler@example.test',
    view: 'themes',
    theme: 'dark',
    accent: 'blue',
    'bot-field': '',
    'form-name': 'feedback',
    ip: '203.0.113.9',
    user_agent: 'Test',
};

eq(relay.FORM_NAME, 'feedback', 'relays the Netlify form named feedback');
eq(relay.FIELD_NAMES, ['message', 'email', 'view', 'theme', 'accent'], 'forwards the five form fields');

const shaped = relay.shapePayload(feedbackData);
eq(shaped, {
    message: 'Ship it.',
    email: 'skyler@example.test',
    view: 'themes',
    theme: 'dark',
    accent: 'blue',
}, 'shapePayload trims the five fields and drops extras');
ok(!('bot-field' in shaped), 'shaped payload has no honeypot field');
ok(!('ip' in shaped), 'shaped payload has no ip');
eq(relay.shapePayload({}), {
    message: '', email: '', view: '', theme: '', accent: '',
}, 'missing fields become empty strings');

const parsed = relay.parseSubmission(eventFor({
    form_name: 'feedback',
    data: feedbackData,
}));
eq(parsed.formName, 'feedback', 'parseSubmission reads payload.form_name');
eq(parsed.honeypot, '', 'empty bot-field is not a honeypot hit');

const unwrapped = relay.parseSubmission({
    body: JSON.stringify({ form_name: 'feedback', data: { message: 'hi' } }),
});
eq(unwrapped.formName, 'feedback', 'parseSubmission accepts an unwrapped body');

const fromHidden = relay.parseSubmission(eventFor({
    data: { 'form-name': 'feedback', message: 'hi' },
}));
eq(fromHidden.formName, 'feedback', 'form-name field fills in when form_name is missing');

const b64 = relay.parseSubmission({
    isBase64Encoded: true,
    body: Buffer.from(JSON.stringify({
        payload: { form_name: 'feedback', data: { message: 'encoded' } },
    })).toString('base64'),
});
eq(b64 && b64.data.message, 'encoded', 'parseSubmission decodes base64 bodies');

eq(relay.parseSubmission({ body: '{' }), null, 'invalid JSON is not a submission');

eq(relay.plan(eventFor({
    form_name: 'feedback',
    data: feedbackData,
}), ENV), {
    action: 'forward',
    url: ENV.INBOX_WEBHOOK_URL,
    headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-token',
    },
    payload: {
        message: 'Ship it.',
        email: 'skyler@example.test',
        view: 'themes',
        theme: 'dark',
        accent: 'blue',
    },
}, 'verified feedback is forwarded as JSON with Authorization');

eq(relay.plan(eventFor({
    form_name: 'contact',
    data: feedbackData,
}), ENV).action, 'skip', 'other form names are not forwarded');
eq(relay.plan(eventFor({
    form_name: 'contact',
    data: feedbackData,
}), ENV).reason, 'form', 'other form names skip as form');

eq(relay.plan(eventFor({
    form_name: 'feedback',
    data: { ...feedbackData, 'bot-field': 'http://spam.test' },
}), ENV), { action: 'skip', reason: 'honeypot' }, 'filled honeypot is not forwarded');

eq(relay.plan({ body: 'not-json' }, ENV), { action: 'skip', reason: 'form' }, 'garbage body is skipped');

eq(relay.plan(eventFor({
    form_name: 'feedback',
    data: feedbackData,
}), { INBOX_WEBHOOK_AUTH: 'Bearer test-token' }).reason,
    'INBOX_WEBHOOK_URL is not set; skipping inbox forward',
    'missing URL warns by variable name');

eq(relay.plan(eventFor({
    form_name: 'feedback',
    data: feedbackData,
}), { INBOX_WEBHOOK_URL: ENV.INBOX_WEBHOOK_URL }).reason,
    'INBOX_WEBHOOK_AUTH and INBOX_WEBHOOK_KEY are not set; skipping inbox forward',
    'missing auth warns by variable name');

eq(relay.authHeaders({ INBOX_WEBHOOK_KEY: 'routine-key' }), {
    'Content-Type': 'application/json',
    Authorization: 'Bearer routine-key',
    'X-Automation-Key': 'routine-key',
}, 'key-only env sets Bearer and X-Automation-Key');

eq(relay.authHeaders({
    INBOX_WEBHOOK_AUTH: 'Bearer from-header',
    INBOX_WEBHOOK_KEY: 'routine-key',
}), {
    'Content-Type': 'application/json',
    Authorization: 'Bearer from-header',
    'X-Automation-Key': 'routine-key',
}, 'AUTH wins Authorization; KEY still sets X-Automation-Key');

const keyPlan = relay.plan(eventFor({
    form_name: 'feedback',
    data: { message: 'via key' },
}), {
    INBOX_WEBHOOK_URL: ENV.INBOX_WEBHOOK_URL,
    INBOX_WEBHOOK_KEY: 'routine-key',
});
eq(keyPlan.action, 'forward', 'KEY without AUTH is enough to forward');
eq(keyPlan.headers.Authorization, 'Bearer routine-key', 'KEY builds Authorization when AUTH is unset');
eq(keyPlan.headers['X-Automation-Key'], 'routine-key', 'KEY is sent as X-Automation-Key');

const calls = [];
const fakeFetch = async (url, init) => {
    calls.push({ url, init });
    return { ok: true, status: 200 };
};

const forwarded = await relay.run(eventFor({
    form_name: 'feedback',
    data: feedbackData,
}), ENV, fakeFetch);
eq(forwarded, { statusCode: 200, body: 'ok' }, 'successful forward returns 200');
eq(calls.length, 1, 'successful forward POSTs once');
eq(calls[0].url, ENV.INBOX_WEBHOOK_URL, 'POST uses INBOX_WEBHOOK_URL');
eq(calls[0].init.method, 'POST', 'forward is POST');
eq(calls[0].init.headers.Authorization, 'Bearer test-token', 'POST sends Authorization');
eq(JSON.parse(calls[0].init.body), {
    message: 'Ship it.',
    email: 'skyler@example.test',
    view: 'themes',
    theme: 'dark',
    accent: 'blue',
}, 'POST body is the shaped JSON fields');
ok(calls[0].init.signal instanceof AbortSignal, 'forward uses a short abort timeout');

calls.length = 0;
const skippedHoneypot = await relay.run(eventFor({
    form_name: 'feedback',
    data: { ...feedbackData, 'bot-field': 'bot' },
}), ENV, fakeFetch);
eq(skippedHoneypot, { statusCode: 200, body: 'honeypot' }, 'honeypot skip returns 200');
eq(calls.length, 0, 'honeypot skip does not POST');

const skippedForm = await relay.run(eventFor({
    form_name: 'other',
    data: feedbackData,
}), ENV, fakeFetch);
eq(skippedForm, { statusCode: 200, body: 'form' }, 'non-feedback skip returns 200');
eq(calls.length, 0, 'non-feedback skip does not POST');

const missing = await relay.run(eventFor({
    form_name: 'feedback',
    data: feedbackData,
}), {}, fakeFetch);
eq(missing, { statusCode: 200, body: 'unconfigured' }, 'missing env returns 200');
eq(calls.length, 0, 'missing env does not POST');

const failed = await relay.run(eventFor({
    form_name: 'feedback',
    data: feedbackData,
}), ENV, async () => { throw new Error('connect https://example.test/inbox'); });
eq(failed, { statusCode: 200, body: 'ok' }, 'webhook throw still returns 200');

console.log(fail ? `\n${pass} passed, ${fail} FAILED` : `${pass}/${pass} passed`);
process.exit(fail ? 1 : 0);
