// ============================================================
// GEMINI BRIDGE — Tier 2 cloud AI integration
// Task 5.3 — Imagen 4 image gen + Gemini Flash vision
//
// All calls go through circuit breaker (if provided).
// All functions return { ok, ...data } or { ok: false, error }.
// Injectable fetch + storage for testing.
// ============================================================

function _classifyHttpError(status) {
    if (status === 429) return 'rate_limit';
    if (status === 401 || status === 403) return 'auth';
    if (status >= 500) return 'server';
    return 'http_' + status;
}

function _gDefaultStorage() {
    if (typeof localStorage !== 'undefined') return localStorage;
    const mem = {};
    return {
        getItem: (k) => mem[k] ?? null,
        setItem: (k, v) => { mem[k] = v; },
        removeItem: (k) => { delete mem[k]; }
    };
}

/**
 * createGeminiBridge(options?) → GeminiBridge
 *
 * @param {object} [options]
 * @param {object} [options.storage]       Injectable storage (default: localStorage)
 * @param {function} [options.fetchFn]     Injectable fetch (default: globalThis.fetch)
 * @param {object} [options.breaker]       CircuitBreaker instance (optional)
 * @param {string} [options.imagenModel]   Imagen model ID
 * @param {string} [options.flashModel]    Gemini Flash model ID
 * @param {string} [options.baseUrl]       API base URL
 * @param {string} [options.storageKey]    localStorage key for API key
 */
function createGeminiBridge(options) {
    const opts = Object.assign({
        storage: null,
        fetchFn: undefined,
        breaker: null,
        imagenModel: 'imagen-4.0-generate-001',
        flashModel: 'gemini-2.5-flash',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
        storageKey: 'grid_gemini_key'
    }, options || {});

    const storage = opts.storage || _gDefaultStorage();
    const fetchFn = opts.fetchFn !== undefined ? opts.fetchFn : (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null);
    const breaker = opts.breaker || null;
    const BASE = opts.baseUrl;
    const KEY = opts.storageKey;

    // ---- Key management ----

    function getApiKey() {
        try { return storage.getItem(KEY) || null; }
        catch (e) { return null; }
    }

    function setApiKey(key) {
        try {
            if (key && typeof key === 'string' && key.trim()) {
                storage.setItem(KEY, key.trim());
            } else {
                storage.removeItem(KEY);
            }
        } catch (e) { /* silent */ }
    }

    function isAvailable() {
        return !!getApiKey() && !!fetchFn;
    }

    // ---- Connection test ----

    async function testConnection() {
        const key = getApiKey();
        if (!key) return { ok: false, error: 'no_key' };
        if (!fetchFn) return { ok: false, error: 'no_fetch' };
        try {
            const res = await fetchFn(BASE + '/models', {
                headers: { 'x-goog-api-key': key }
            });
            if (res.ok) return { ok: true };
            if (res.status === 401 || res.status === 403) return { ok: false, error: 'invalid_key' };
            return { ok: false, error: 'http_' + res.status };
        } catch (e) {
            return { ok: false, error: 'network' };
        }
    }

    // ---- Image generation (Imagen 4) ----

    async function generateImage(prompt, imageOpts) {
        if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
            return { ok: false, error: 'empty_prompt' };
        }
        const key = getApiKey();
        if (!key) return { ok: false, error: 'no_key' };
        if (!fetchFn) return { ok: false, error: 'no_fetch' };

        if (breaker && !breaker.canRequest()) {
            return { ok: false, error: 'breaker_open' };
        }

        const url = BASE + '/models/' + opts.imagenModel + ':predict';
        const body = {
            instances: [{ prompt: prompt.trim() }],
            parameters: Object.assign({ sampleCount: 1 }, imageOpts || {})
        };

        try {
            const res = await fetchFn(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-goog-api-key': key
                },
                body: JSON.stringify(body)
            });

            if (!res.ok) {
                const errType = _classifyHttpError(res.status);
                if (breaker) breaker.recordFailure(errType);
                return { ok: false, error: errType, status: res.status };
            }

            if (breaker) breaker.recordRequest();

            const data = await res.json();
            if (!data.predictions || !data.predictions.length) {
                return { ok: false, error: 'no_predictions' };
            }

            const pred = data.predictions[0];
            return {
                ok: true,
                base64: pred.bytesBase64Encoded,
                mimeType: pred.mimeType || 'image/png'
            };
        } catch (e) {
            if (breaker) breaker.recordFailure('network');
            return { ok: false, error: 'network', message: e.message };
        }
    }

    // ---- Image description (Gemini Flash vision) ----

    async function describeImage(base64, mimeType, textPrompt) {
        if (!base64) return { ok: false, error: 'no_image' };
        const key = getApiKey();
        if (!key) return { ok: false, error: 'no_key' };
        if (!fetchFn) return { ok: false, error: 'no_fetch' };

        if (breaker && !breaker.canRequest()) {
            return { ok: false, error: 'breaker_open' };
        }

        const url = BASE + '/models/' + opts.flashModel + ':generateContent';
        const parts = [
            { inlineData: { mimeType: mimeType || 'image/png', data: base64 } },
            { text: textPrompt || 'Describe this image in detail. Include composition, colors, mood, and any text or symbols visible.' }
        ];

        try {
            const res = await fetchFn(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-goog-api-key': key
                },
                body: JSON.stringify({ contents: [{ parts }] })
            });

            if (!res.ok) {
                const errType = _classifyHttpError(res.status);
                if (breaker) breaker.recordFailure(errType);
                return { ok: false, error: errType, status: res.status };
            }

            if (breaker) breaker.recordRequest();

            const data = await res.json();
            const text = data && data.candidates && data.candidates[0] &&
                data.candidates[0].content && data.candidates[0].content.parts &&
                data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text;

            if (!text) return { ok: false, error: 'no_content' };
            return { ok: true, text };
        } catch (e) {
            if (breaker) breaker.recordFailure('network');
            return { ok: false, error: 'network', message: e.message };
        }
    }

    // ---- Video generation (Veo — stub) ----

    async function generateVideo() {
        return { ok: false, error: 'unavailable' };
    }

    return {
        isAvailable,
        setApiKey,
        getApiKey,
        testConnection,
        generateImage,
        describeImage,
        generateVideo
    };
}

// ============================================================
// EXPORTS
// ============================================================

const _geminiBridgeInternals = { _gDefaultStorage, _classifyHttpError };

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { createGeminiBridge, _internals: _geminiBridgeInternals };
}
if (typeof window !== 'undefined') {
    window.GeminiBridge = { createGeminiBridge, _internals: _geminiBridgeInternals };
}
export { createGeminiBridge, _geminiBridgeInternals as _internals };