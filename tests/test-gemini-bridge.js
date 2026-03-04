// ============================================================
// TESTS — Gemini Bridge (Task 5.3)
// ============================================================

import { createGeminiBridge, _internals } from '../src/consumers/ai/gemini-bridge.js';

let passed = 0, failed = 0;

function assert(condition, msg) {
    if (condition) { passed++; console.log(`  ✅ ${msg}`); }
    else { failed++; console.error(`  ❌ ${msg}`); }
}

function mockStorage(initial) {
    const mem = Object.assign({}, initial || {});
    return {
        getItem: (k) => mem[k] ?? null,
        setItem: (k, v) => { mem[k] = String(v); },
        removeItem: (k) => { delete mem[k]; },
        _mem: mem
    };
}

function capturingFetch(status, body, shouldThrow) {
    const calls = [];
    const fn = async (url, opts) => {
        calls.push({ url, opts });
        if (shouldThrow) throw new Error('network failure');
        return {
            ok: status >= 200 && status < 300,
            status,
            json: async () => body
        };
    };
    fn.calls = calls;
    return fn;
}

function mockBreaker(canReq) {
    const log = [];
    return {
        canRequest: () => { log.push('canRequest'); return canReq !== false; },
        recordRequest: () => { log.push('recordRequest'); },
        recordFailure: (t) => { log.push('recordFailure:' + t); },
        log
    };
}

const IMAGEN_OK = {
    predictions: [{ bytesBase64Encoded: 'abc123base64', mimeType: 'image/png' }]
};

const FLASH_OK = {
    candidates: [{ content: { parts: [{ text: 'A beautiful landscape with mountains.' }] } }]
};

// --- 1. Availability ---
console.log('\n— Availability —');
{
    const gb = createGeminiBridge({ storage: mockStorage(), fetchFn: capturingFetch(200, {}) });
    assert(gb.isAvailable() === false, 'not available without key');
}
{
    const store = mockStorage({ grid_gemini_key: 'test-key' });
    const gb = createGeminiBridge({ storage: store, fetchFn: capturingFetch(200, {}) });
    assert(gb.isAvailable() === true, 'available with key + fetch');
}
{
    const store = mockStorage({ grid_gemini_key: 'test-key' });
    const gb = createGeminiBridge({ storage: store, fetchFn: null });
    assert(gb.isAvailable() === false, 'not available without fetch');
}

// --- 2. Key management ---
console.log('\n— Key management —');
{
    const store = mockStorage();
    const gb = createGeminiBridge({ storage: store, fetchFn: capturingFetch(200, {}) });
    assert(gb.getApiKey() === null, 'no key initially');
    gb.setApiKey('my-key-123');
    assert(gb.getApiKey() === 'my-key-123', 'key set and retrieved');
    assert(gb.isAvailable() === true, 'available after setting key');
    gb.setApiKey(null);
    assert(gb.getApiKey() === null, 'key cleared with null');
    gb.setApiKey('  spaced  ');
    assert(gb.getApiKey() === 'spaced', 'key trimmed');
    gb.setApiKey('');
    assert(gb.getApiKey() === null, 'empty string clears key');
}

// --- 3. testConnection ---
console.log('\n— testConnection —');
{
    const gb = createGeminiBridge({ storage: mockStorage(), fetchFn: capturingFetch(200, {}) });
    const r = await gb.testConnection();
    assert(r.ok === false && r.error === 'no_key', 'no key → no_key');
}
{
    const store = mockStorage({ grid_gemini_key: 'k' });
    const f = capturingFetch(200, {});
    const gb = createGeminiBridge({ storage: store, fetchFn: f });
    const r = await gb.testConnection();
    assert(r.ok === true, 'success on 200');
    assert(f.calls[0].url.includes('/models'), 'calls models endpoint');
}
{
    const store = mockStorage({ grid_gemini_key: 'k' });
    const gb = createGeminiBridge({ storage: store, fetchFn: capturingFetch(403, {}) });
    const r = await gb.testConnection();
    assert(r.ok === false && r.error === 'invalid_key', '403 → invalid_key');
}
{
    const store = mockStorage({ grid_gemini_key: 'k' });
    const gb = createGeminiBridge({ storage: store, fetchFn: capturingFetch(200, {}, true) });
    const r = await gb.testConnection();
    assert(r.ok === false && r.error === 'network', 'throw → network');
}

// --- 4. generateImage — success ---
console.log('\n— generateImage success —');
{
    const store = mockStorage({ grid_gemini_key: 'k' });
    const f = capturingFetch(200, IMAGEN_OK);
    const gb = createGeminiBridge({ storage: store, fetchFn: f });
    const r = await gb.generateImage('A mountain landscape');
    assert(r.ok === true, 'ok true');
    assert(r.base64 === 'abc123base64', 'returns base64');
    assert(r.mimeType === 'image/png', 'returns mimeType');
    assert(f.calls[0].url.includes('imagen-4.0-generate-001:predict'), 'correct endpoint');
    const body = JSON.parse(f.calls[0].opts.body);
    assert(body.instances[0].prompt === 'A mountain landscape', 'sends prompt');
    assert(body.parameters.sampleCount === 1, 'default sampleCount 1');
    assert(f.calls[0].opts.headers['x-goog-api-key'] === 'k', 'sends API key header');
}

// --- 5. generateImage — errors ---
console.log('\n— generateImage errors —');
{
    const gb = createGeminiBridge({ storage: mockStorage(), fetchFn: capturingFetch(200, IMAGEN_OK) });
    const r = await gb.generateImage('test');
    assert(r.ok === false && r.error === 'no_key', 'no key → no_key');
}
{
    const store = mockStorage({ grid_gemini_key: 'k' });
    const gb = createGeminiBridge({ storage: store, fetchFn: capturingFetch(200, IMAGEN_OK) });
    const r = await gb.generateImage('');
    assert(r.ok === false && r.error === 'empty_prompt', 'empty prompt');
}
{
    const store = mockStorage({ grid_gemini_key: 'k' });
    const gb = createGeminiBridge({ storage: store, fetchFn: capturingFetch(200, IMAGEN_OK) });
    const r = await gb.generateImage(null);
    assert(r.ok === false && r.error === 'empty_prompt', 'null prompt');
}
{
    const store = mockStorage({ grid_gemini_key: 'k' });
    const gb = createGeminiBridge({ storage: store, fetchFn: capturingFetch(429, {}) });
    const r = await gb.generateImage('test');
    assert(r.ok === false && r.error === 'rate_limit', '429 → rate_limit');
}
{
    const store = mockStorage({ grid_gemini_key: 'k' });
    const gb = createGeminiBridge({ storage: store, fetchFn: capturingFetch(403, {}) });
    const r = await gb.generateImage('test');
    assert(r.ok === false && r.error === 'auth', '403 → auth');
}
{
    const store = mockStorage({ grid_gemini_key: 'k' });
    const gb = createGeminiBridge({ storage: store, fetchFn: capturingFetch(500, {}) });
    const r = await gb.generateImage('test');
    assert(r.ok === false && r.error === 'server', '500 → server');
}
{
    const store = mockStorage({ grid_gemini_key: 'k' });
    const gb = createGeminiBridge({ storage: store, fetchFn: capturingFetch(200, {}, true) });
    const r = await gb.generateImage('test');
    assert(r.ok === false && r.error === 'network', 'network throw → network');
}
{
    const store = mockStorage({ grid_gemini_key: 'k' });
    const gb = createGeminiBridge({ storage: store, fetchFn: capturingFetch(200, { predictions: [] }) });
    const r = await gb.generateImage('test');
    assert(r.ok === false && r.error === 'no_predictions', 'empty predictions');
}

// --- 6. generateImage with breaker ---
console.log('\n— generateImage + breaker —');
{
    const store = mockStorage({ grid_gemini_key: 'k' });
    const br = mockBreaker(false);
    const gb = createGeminiBridge({ storage: store, fetchFn: capturingFetch(200, IMAGEN_OK), breaker: br });
    const r = await gb.generateImage('test');
    assert(r.ok === false && r.error === 'breaker_open', 'breaker open blocks request');
}
{
    const store = mockStorage({ grid_gemini_key: 'k' });
    const br = mockBreaker(true);
    const f = capturingFetch(200, IMAGEN_OK);
    const gb = createGeminiBridge({ storage: store, fetchFn: f, breaker: br });
    const r = await gb.generateImage('test');
    assert(r.ok === true, 'breaker allows request');
    assert(br.log.includes('recordRequest'), 'records success with breaker');
}
{
    const store = mockStorage({ grid_gemini_key: 'k' });
    const br = mockBreaker(true);
    const gb = createGeminiBridge({ storage: store, fetchFn: capturingFetch(429, {}), breaker: br });
    await gb.generateImage('test');
    assert(br.log.includes('recordFailure:rate_limit'), 'records rate_limit failure');
}

// --- 7. describeImage — success ---
console.log('\n— describeImage success —');
{
    const store = mockStorage({ grid_gemini_key: 'k' });
    const f = capturingFetch(200, FLASH_OK);
    const gb = createGeminiBridge({ storage: store, fetchFn: f });
    const r = await gb.describeImage('base64data', 'image/jpeg');
    assert(r.ok === true, 'ok true');
    assert(r.text === 'A beautiful landscape with mountains.', 'returns text');
    assert(f.calls[0].url.includes('gemini-2.5-flash:generateContent'), 'flash endpoint');
    const body = JSON.parse(f.calls[0].opts.body);
    assert(body.contents[0].parts[0].inlineData.data === 'base64data', 'sends image data');
    assert(body.contents[0].parts[0].inlineData.mimeType === 'image/jpeg', 'sends mimeType');
}

// --- 8. describeImage — custom prompt ---
{
    const store = mockStorage({ grid_gemini_key: 'k' });
    const f = capturingFetch(200, FLASH_OK);
    const gb = createGeminiBridge({ storage: store, fetchFn: f });
    await gb.describeImage('d', 'image/png', 'What colors do you see?');
    const body = JSON.parse(f.calls[0].opts.body);
    assert(body.contents[0].parts[1].text === 'What colors do you see?', 'custom text prompt sent');
}

// --- 9. describeImage — errors ---
console.log('\n— describeImage errors —');
{
    const store = mockStorage({ grid_gemini_key: 'k' });
    const gb = createGeminiBridge({ storage: store, fetchFn: capturingFetch(200, FLASH_OK) });
    const r = await gb.describeImage(null);
    assert(r.ok === false && r.error === 'no_image', 'null image → no_image');
}
{
    const gb = createGeminiBridge({ storage: mockStorage(), fetchFn: capturingFetch(200, FLASH_OK) });
    const r = await gb.describeImage('data');
    assert(r.ok === false && r.error === 'no_key', 'no key → no_key');
}
{
    const store = mockStorage({ grid_gemini_key: 'k' });
    const gb = createGeminiBridge({ storage: store, fetchFn: capturingFetch(200, { candidates: [] }) });
    const r = await gb.describeImage('data');
    assert(r.ok === false && r.error === 'no_content', 'empty candidates → no_content');
}

// --- 10. describeImage + breaker ---
{
    const store = mockStorage({ grid_gemini_key: 'k' });
    const br = mockBreaker(true);
    const gb = createGeminiBridge({ storage: store, fetchFn: capturingFetch(200, FLASH_OK), breaker: br });
    await gb.describeImage('data');
    assert(br.log.includes('recordRequest'), 'breaker records describe success');
}

// --- 11. generateVideo stub ---
console.log('\n— generateVideo —');
{
    const gb = createGeminiBridge({ storage: mockStorage(), fetchFn: capturingFetch(200, {}) });
    const r = await gb.generateVideo();
    assert(r.ok === false && r.error === 'unavailable', 'video stub returns unavailable');
}

// --- 12. Custom model IDs ---
console.log('\n— Custom models —');
{
    const store = mockStorage({ grid_gemini_key: 'k' });
    const f = capturingFetch(200, IMAGEN_OK);
    const gb = createGeminiBridge({ storage: store, fetchFn: f, imagenModel: 'imagen-5.0' });
    await gb.generateImage('test');
    assert(f.calls[0].url.includes('imagen-5.0:predict'), 'custom imagen model in URL');
}

// --- 13. Error classifier ---
console.log('\n— Error classifier —');
{
    const { _classifyHttpError } = _internals;
    assert(_classifyHttpError(429) === 'rate_limit', '429 → rate_limit');
    assert(_classifyHttpError(401) === 'auth', '401 → auth');
    assert(_classifyHttpError(403) === 'auth', '403 → auth');
    assert(_classifyHttpError(500) === 'server', '500 → server');
    assert(_classifyHttpError(502) === 'server', '502 → server');
    assert(_classifyHttpError(404) === 'http_404', '404 → http_404');
}

// --- Summary ---
console.log(`\nGemini Bridge: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { results: { passed, failed } };
}