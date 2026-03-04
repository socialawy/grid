// ============================================================
// TESTS — Circuit Breaker (Task 5.5)
// ============================================================

import { createCircuitBreaker } from '../src/consumers/ai/circuit-breaker.js';

let passed = 0, failed = 0;

function assert(condition, msg) {
    if (condition) { passed++; console.log(`  ✅ ${msg}`); }
    else { failed++; console.error(`  ❌ ${msg}`); }
}

function mockStorage() {
    const mem = {};
    return {
        getItem: (k) => mem[k] ?? null,
        setItem: (k, v) => { mem[k] = String(v); },
        removeItem: (k) => { delete mem[k]; },
        _mem: mem
    };
}

// --- 1. Initial state ---
console.log('\n— Initial state —');
{
    const cb = createCircuitBreaker({ storage: mockStorage() });
    const s = cb.getStatus();
    assert(s.state === 'closed', 'starts closed');
    assert(s.requestsThisMinute === 0, 'zero requests this minute');
    assert(s.requestsToday === 0, 'zero requests today');
    assert(cb.canRequest() === true, 'canRequest true initially');
}

// --- 2. Recording requests ---
console.log('\n— Record requests —');
{
    const cb = createCircuitBreaker({ storage: mockStorage(), maxRPM: 5, maxRPD: 100 });
    cb.recordRequest();
    cb.recordRequest();
    assert(cb.getStatus().requestsThisMinute === 2, 'records 2 requests');
    assert(cb.getStatus().requestsToday === 2, 'daily count 2');
    assert(cb.canRequest() === true, 'still under limit');
}

// --- 3. RPM limit trips breaker ---
console.log('\n— RPM limit —');
{
    const cb = createCircuitBreaker({ storage: mockStorage(), maxRPM: 3, maxRPD: 100 });
    cb.recordRequest();
    cb.recordRequest();
    cb.recordRequest();
    // 3rd request hits the limit, 4th record should trip
    cb.recordRequest();
    assert(cb.getStatus().state === 'open', 'trips open after exceeding maxRPM');
    assert(cb.canRequest() === false, 'canRequest false when open');
}

// --- 4. RPD limit trips breaker ---
console.log('\n— RPD limit —');
{
    let t = Date.UTC(2026, 2, 3, 12, 0, 0); // noon
    const cb = createCircuitBreaker({
        storage: mockStorage(), maxRPM: 1000, maxRPD: 3,
        now: () => t
    });
    cb.recordRequest(); t += 61000; // advance past minute window
    cb.recordRequest(); t += 61000;
    cb.recordRequest(); t += 61000;
    cb.recordRequest(); // 4th exceeds daily
    assert(cb.getStatus().state === 'open', 'trips on daily limit');
}

// --- 5. Cooldown → half-open ---
console.log('\n— Cooldown to half-open —');
{
    let t = 1000000;
    const cb = createCircuitBreaker({
        storage: mockStorage(), maxRPM: 1, maxRPD: 100,
        cooldownMs: 5000, now: () => t
    });
    cb.recordRequest();
    cb.recordRequest(); // trips
    assert(cb.getStatus().state === 'open', 'open after trip');
    assert(cb.canRequest() === false, 'blocked while open');

    t += 5001; // past cooldown
    assert(cb.canRequest() === true, 'canRequest true after cooldown (half-open)');
    assert(cb.getStatus().state === 'half-open', 'state is half-open');
}

// --- 6. Half-open success → closed ---
console.log('\n— Half-open success → closed —');
{
    let t = 1000000;
    const cb = createCircuitBreaker({
        storage: mockStorage(), maxRPM: 1, maxRPD: 100,
        cooldownMs: 5000, now: () => t
    });
    cb.recordRequest();
    cb.recordRequest(); // trips
    t += 70000; // past cooldown + past minute window (old timestamps expire)
    cb.canRequest(); // transitions to half-open
    cb.recordRequest(); // success in half-open
    assert(cb.getStatus().state === 'closed', 'closed after half-open success');
    assert(cb.getStatus().consecutiveFailures === 0, 'failures reset');
}

// --- 7. Half-open failure → open again ---
console.log('\n— Half-open failure → reopen —');
{
    let t = 1000000;
    const cb = createCircuitBreaker({
        storage: mockStorage(), maxRPM: 1, maxRPD: 100,
        cooldownMs: 5000, now: () => t
    });
    cb.recordRequest();
    cb.recordRequest(); // trips
    t += 5001;
    cb.canRequest(); // half-open
    cb.recordFailure('rate_limit');
    assert(cb.getStatus().state === 'open', 'reopens on half-open failure');
}

// --- 8. recordFailure with rate_limit trips immediately ---
console.log('\n— recordFailure rate_limit —');
{
    const cb = createCircuitBreaker({ storage: mockStorage() });
    cb.recordFailure('rate_limit');
    assert(cb.getStatus().state === 'open', 'rate_limit trips immediately');
}

// --- 9. recordFailure quota_exceeded trips immediately ---
{
    const cb = createCircuitBreaker({ storage: mockStorage() });
    cb.recordFailure('quota_exceeded');
    assert(cb.getStatus().state === 'open', 'quota_exceeded trips immediately');
}

// --- 10. 3 consecutive generic failures trip ---
console.log('\n— Consecutive failures —');
{
    const cb = createCircuitBreaker({ storage: mockStorage() });
    cb.recordFailure('network');
    assert(cb.getStatus().state === 'closed', 'still closed after 1 failure');
    cb.recordFailure('network');
    assert(cb.getStatus().state === 'closed', 'still closed after 2 failures');
    cb.recordFailure('network');
    assert(cb.getStatus().state === 'open', 'open after 3 consecutive failures');
}

// --- 11. reset() clears everything ---
console.log('\n— Reset —');
{
    const cb = createCircuitBreaker({ storage: mockStorage() });
    cb.recordRequest();
    cb.recordFailure('rate_limit');
    assert(cb.getStatus().state === 'open', 'open before reset');
    cb.reset();
    const s = cb.getStatus();
    assert(s.state === 'closed', 'closed after reset');
    assert(s.requestsThisMinute === 0, 'minute counter reset');
    assert(s.requestsToday === 0, 'daily counter reset');
    assert(s.consecutiveFailures === 0, 'failures reset');
}

// --- 12. getStatus shape ---
console.log('\n— getStatus shape —');
{
    const cb = createCircuitBreaker({ storage: mockStorage(), maxRPM: 10, maxRPD: 250 });
    const s = cb.getStatus();
    assert(typeof s.state === 'string', 'state is string');
    assert(typeof s.requestsThisMinute === 'number', 'requestsThisMinute is number');
    assert(typeof s.requestsToday === 'number', 'requestsToday is number');
    assert(s.maxRPM === 10, 'maxRPM exposed');
    assert(s.maxRPD === 250, 'maxRPD exposed');
    assert(typeof s.consecutiveFailures === 'number', 'consecutiveFailures is number');
}

// --- 13. Sliding window prunes old timestamps ---
console.log('\n— Sliding window —');
{
    let t = 1000000;
    const cb = createCircuitBreaker({
        storage: mockStorage(), maxRPM: 3, maxRPD: 100,
        now: () => t
    });
    cb.recordRequest();
    cb.recordRequest();
    assert(cb.getStatus().requestsThisMinute === 2, '2 in window');

    t += 61000; // 61s later — old ones should prune
    assert(cb.getStatus().requestsThisMinute === 0, 'pruned after 61s');
    assert(cb.canRequest() === true, 'can request after prune');
}

// --- 14. Day boundary resets daily count ---
console.log('\n— Day boundary —');
{
    // Start at 23:59 UTC
    let t = Date.UTC(2026, 2, 3, 23, 59, 0);
    const cb = createCircuitBreaker({
        storage: mockStorage(), maxRPM: 100, maxRPD: 2,
        now: () => t
    });
    cb.recordRequest();
    cb.recordRequest();
    assert(cb.getStatus().requestsToday === 2, '2 requests today');

    t = Date.UTC(2026, 2, 4, 0, 1, 0); // next day
    assert(cb.getStatus().requestsToday === 0, 'daily count reset on new day');
    assert(cb.canRequest() === true, 'can request on new day');
}

// --- 15. Storage persistence ---
console.log('\n— Storage persistence —');
{
    const store = mockStorage();
    let t = 1000000;
    const cb1 = createCircuitBreaker({
        storage: store, maxRPM: 10, maxRPD: 100, now: () => t
    });
    cb1.recordRequest();
    cb1.recordRequest();
    cb1.recordFailure('rate_limit');

    // Create new breaker with same storage — should hydrate
    const cb2 = createCircuitBreaker({
        storage: store, maxRPM: 10, maxRPD: 100, now: () => t
    });
    const s = cb2.getStatus();
    assert(s.state === 'open', 'hydrated state from storage');
    assert(s.requestsToday === 2, 'hydrated daily count');
}

// --- 16. Corrupted storage handled gracefully ---
console.log('\n— Corrupted storage —');
{
    const store = mockStorage();
    store.setItem('grid_cb', '{invalid json!!!');
    const cb = createCircuitBreaker({ storage: store });
    assert(cb.getStatus().state === 'closed', 'starts fresh on corrupt data');
    assert(cb.canRequest() === true, 'works despite corrupt storage');
}

// --- 17. Provider-scoped keys ---
console.log('\n— Scoped storage keys —');
{
    const store = mockStorage();
    const gemini = createCircuitBreaker({ storage: store, storageKey: 'grid_cb_gemini' });
    const openai = createCircuitBreaker({ storage: store, storageKey: 'grid_cb_openai' });
    gemini.recordRequest();
    gemini.recordFailure('rate_limit');
    assert(gemini.getStatus().state === 'open', 'gemini tripped');
    assert(openai.getStatus().state === 'closed', 'openai unaffected');
}

// --- 18. nextResetMs in open state ---
console.log('\n— nextResetMs —');
{
    let t = 1000000;
    const cb = createCircuitBreaker({
        storage: mockStorage(), cooldownMs: 10000, now: () => t
    });
    cb.recordFailure('rate_limit');
    t += 3000;
    const s = cb.getStatus();
    assert(s.nextResetMs === 7000, 'nextResetMs = cooldown - elapsed');
}

// --- 19. nextResetMs null when closed ---
{
    const cb = createCircuitBreaker({ storage: mockStorage() });
    assert(cb.getStatus().nextResetMs === null, 'nextResetMs null when closed');
}

// --- Summary ---
console.log(`\nCircuit Breaker: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

// Export for run-all.js
// Export results for unified runner
export const results = {
    passed,
    failed,
    skipped: 0,
    summary: `Circuit Breaker: ${passed} passed, ${failed} failed`
};
