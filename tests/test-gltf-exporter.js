// tests/test-gltf-exporter.js
/**
 * glTF Exporter tests — Task 6.4
 * Uses mock THREE objects. Tests wrapper logic, not THREE internals.
 */

let passed = 0, failed = 0;
const testOutputs = [];

function assert(cond, msg) {
  if (cond) { passed++; testOutputs.push({ status: 'pass', name: msg }); }
  else { failed++; testOutputs.push({ status: 'fail', name: msg }); console.error('  FAIL:', msg); }
}

// ── Mock THREE.GLTFExporter ──────────────────────
class MockGLTFExporter {
  parse(scene, onDone, onError, opts) {
    if (scene._fail) { onError(new Error('mock fail')); return; }
    if (opts && opts.binary) {
      onDone(new ArrayBuffer(8));  // mock .glb
    } else {
      onDone({ asset: { version: '2.0' } });  // mock .gltf JSON
    }
  }
}

// Setup global mocks
global.window = global.window || {};
global.THREE = global.THREE || {};
global.THREE.GLTFExporter = MockGLTFExporter;

import { sceneToGltf, isGltfExportAvailable, gltfExportDefaults } from '../src/exporters/gltf-exporter.js';

console.log('\n🧪 glTF Exporter (Task 6.4)\n' + '='.repeat(50));

// ── availability ──────────────────────────────────
{
  assert(isGltfExportAvailable() === true, 'available when THREE.GLTFExporter exists');
}

// ── defaults ──────────────────────────────────────
{
  const d = gltfExportDefaults();
  assert(d.binary === true, 'default binary = true (.glb)');
  assert(d.onlyVisible === true, 'default onlyVisible = true');
}

// ── binary export → ArrayBuffer ───────────────────
{
  const scene = { type: 'Scene' };
  const result = await sceneToGltf(scene, { binary: true });
  assert(result.ok === true, 'binary export succeeds');
  assert(result.data instanceof ArrayBuffer, 'binary export returns ArrayBuffer');
}

// ── JSON export → object ──────────────────────────
{
  const scene = { type: 'Scene' };
  const result = await sceneToGltf(scene, { binary: false });
  assert(result.ok === true, 'JSON export succeeds');
  assert(typeof result.data === 'object', 'JSON export returns object');
  assert(result.data.asset.version === '2.0', 'glTF version 2.0');
}

// ── error handling ────────────────────────────────
{
  const scene = { type: 'Scene', _fail: true };
  const result = await sceneToGltf(scene);
  assert(result.ok === false, 'failed export returns ok:false');
  assert(typeof result.error === 'string', 'error message present');
}

// ── unavailable when no GLTFExporter ──────────────
{
  const saved = global.THREE.GLTFExporter;
  delete global.THREE.GLTFExporter;
  // Re-check availability (function reads global at call time)
  // Note: isGltfExportAvailable checks window.THREE or global.THREE
  assert(isGltfExportAvailable() === false, 'unavailable when GLTFExporter missing');
  global.THREE.GLTFExporter = saved;
}

console.log(`\ntest-gltf-exporter.js: ${passed} passed, ${failed} failed\n`);
export const results = {
  passed,
  failed,
  skipped: 0,
  summary: `glTF Exporter: ${passed} passed, ${failed} failed`
};
