// ============================================================
// CIRCUIT BREAKER — Tier 2 API quota protection
// Task 5.5 — Pure logic, zero DOM
//
// States: closed (normal) → open (tripped) → half-open (testing)
// Tracks RPM (sliding window) and RPD (midnight UTC reset).
// Storage: injectable (localStorage in browser, mock in tests).
// ============================================================

/**
 * createCircuitBreaker(options?) → CircuitBreaker
 *
 * @param {object} [options]
 * @param {number} [options.maxRPM=10]             Requests per minute (sliding window)
 * @param {number} [options.maxRPD=250]            Requests per day (UTC reset)
 * @param {number} [options.cooldownMs=60000]      Pause duration after trip (ms)
 * @param {string} [options.storageKey='grid_cb']  localStorage key prefix
 * @param {object} [options.storage]               Injectable storage ({getItem, setItem, removeItem})
 * @param {function} [options.now]                 Injectable clock (returns ms timestamp)
 * @returns {CircuitBreaker}
 */
function createCircuitBreaker(options) {
    const opts = Object.assign({
        maxRPM: 10,
        maxRPD: 250,
        cooldownMs: 60000,
        storageKey: 'grid_cb',
        storage: null,
        now: null
    }, options || {});

    const storage = opts.storage || _defaultStorage();
    const now = opts.now || (() => Date.now());

    // --- Internal state (hydrated from storage) ---
    let state = 'closed';              // 'closed' | 'open' | 'half-open'
    let requestTimestamps = [];        // sliding window (ms timestamps)
    let dailyCount = 0;
    let dailyResetDate = '';           // 'YYYY-MM-DD' UTC
    let lastTrippedAt = null;          // ms timestamp
    let consecutiveFailures = 0;

    // Hydrate from storage on creation
    _load();

    // --- Public API ---

    function canRequest() {
        _pruneAndReset();

        if (state === 'open') {
            // Check if cooldown has elapsed → transition to half-open
            if (lastTrippedAt && (now() - lastTrippedAt) >= opts.cooldownMs) {
                state = 'half-open';
                _save();
                return true;
            }
            return false;
        }

        if (state === 'half-open') {
            return true; // allow one test request
        }

        // state === 'closed'
        if (requestTimestamps.length >= opts.maxRPM) return false;
        if (dailyCount >= opts.maxRPD) return false;
        return true;
    }

    function recordRequest() {
        _pruneAndReset();
        const t = now();
        requestTimestamps.push(t);
        dailyCount++;

        // Check limits after recording
        if (requestTimestamps.length > opts.maxRPM || dailyCount > opts.maxRPD) {
            _trip();
        } else if (state === 'half-open') {
            // Successful request in half-open → close
            state = 'closed';
            consecutiveFailures = 0;
        }

        _save();
    }

    function recordFailure(errorType) {
        consecutiveFailures++;

        if (errorType === 'rate_limit' || errorType === 'quota_exceeded') {
            _trip();
        } else if (consecutiveFailures >= 3) {
            _trip();
        }

        // half-open failure → reopen
        if (state === 'half-open') {
            _trip();
        }

        _save();
    }

    function getStatus() {
        _pruneAndReset();
        const t = now();
        let nextResetMs = null;

        if (state === 'open' && lastTrippedAt) {
            const remaining = opts.cooldownMs - (t - lastTrippedAt);
            nextResetMs = Math.max(0, remaining);
        }

        return {
            state,
            requestsThisMinute: requestTimestamps.length,
            requestsToday: dailyCount,
            maxRPM: opts.maxRPM,
            maxRPD: opts.maxRPD,
            consecutiveFailures,
            nextResetMs
        };
    }

    function reset() {
        state = 'closed';
        requestTimestamps = [];
        dailyCount = 0;
        dailyResetDate = _todayUTC();
        lastTrippedAt = null;
        consecutiveFailures = 0;
        _save();
    }

    // --- Internal helpers ---

    function _trip() {
        state = 'open';
        lastTrippedAt = now();
        _save();
    }

    function _todayUTC() {
        const d = new Date(now());
        return d.getUTCFullYear() + '-' +
            String(d.getUTCMonth() + 1).padStart(2, '0') + '-' +
            String(d.getUTCDate()).padStart(2, '0');
    }

    function _pruneAndReset() {
        const t = now();
        const oneMinuteAgo = t - 60000;

        // Prune sliding window — keep only last 60s
        requestTimestamps = requestTimestamps.filter(ts => ts > oneMinuteAgo);

        // Day boundary reset
        const today = _todayUTC();
        if (dailyResetDate !== today) {
            dailyCount = 0;
            dailyResetDate = today;
        }
    }

    function _save() {
        try {
            storage.setItem(opts.storageKey, JSON.stringify({
                state,
                requestTimestamps,
                dailyCount,
                dailyResetDate,
                lastTrippedAt,
                consecutiveFailures
            }));
        } catch (e) { /* storage full or unavailable — degrade silently */ }
    }

    function _load() {
        try {
            const raw = storage.getItem(opts.storageKey);
            if (!raw) { dailyResetDate = _todayUTC(); return; }
            const data = JSON.parse(raw);
            state = data.state || 'closed';
            requestTimestamps = Array.isArray(data.requestTimestamps) ? data.requestTimestamps : [];
            dailyCount = typeof data.dailyCount === 'number' ? data.dailyCount : 0;
            dailyResetDate = data.dailyResetDate || _todayUTC();
            lastTrippedAt = data.lastTrippedAt || null;
            consecutiveFailures = typeof data.consecutiveFailures === 'number' ? data.consecutiveFailures : 0;
        } catch (e) {
            // Corrupted storage — start fresh
            dailyResetDate = _todayUTC();
        }
    }

    return {
        canRequest,
        recordRequest,
        recordFailure,
        getStatus,
        reset
    };
}

function _defaultStorage() {
    if (typeof localStorage !== 'undefined') return localStorage;
    // Fallback: in-memory (Node tests without injection)
    const mem = {};
    return {
        getItem: (k) => mem[k] ?? null,
        setItem: (k, v) => { mem[k] = v; },
        removeItem: (k) => { delete mem[k]; }
    };
}

// ============================================================
// EXPORTS
// ============================================================

const _circuitBreakerInternals = {
    _defaultStorage
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { createCircuitBreaker, _internals: _circuitBreakerInternals };
}
if (typeof window !== 'undefined') {
    window.CircuitBreaker = { createCircuitBreaker, _internals: _circuitBreakerInternals };
}
export { createCircuitBreaker, _circuitBreakerInternals as _internals };