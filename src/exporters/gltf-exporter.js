/**
 * gltf-exporter.js — Task 6.4: THREE.Scene → glTF/glb
 *
 * Thin wrapper around THREE.GLTFExporter.
 * Browser-only (requires THREE.js CDN). Promisified parse.
 *
 * @module gltf-exporter
 */

function gltfExportDefaults() {
  return { binary: true, onlyVisible: true };
}

function _getGLTFExporter() {
  if (typeof THREE !== 'undefined' && THREE.GLTFExporter) return THREE.GLTFExporter;
  if (typeof window !== 'undefined' && window.THREE && window.THREE.GLTFExporter) return window.THREE.GLTFExporter;
  if (typeof global !== 'undefined' && global.THREE && global.THREE.GLTFExporter) return global.THREE.GLTFExporter;
  return null;
}

function isGltfExportAvailable() {
  return _getGLTFExporter() !== null;
}

/**
 * Export a THREE.Scene to glTF or glb.
 *
 * @param {Object} scene - THREE.Scene
 * @param {Object} [opts] - { binary: true, onlyVisible: true }
 * @returns {Promise<{ok: boolean, data?: ArrayBuffer|Object, error?: string}>}
 */
function sceneToGltf(scene, opts = {}) {
  const o = { ...gltfExportDefaults(), ...opts };
  const Exporter = _getGLTFExporter();
  if (!Exporter) {
    return Promise.resolve({ ok: false, error: 'THREE.GLTFExporter not available' });
  }
  return new Promise(resolve => {
    const exporter = new Exporter();
    exporter.parse(
      scene,
      data => resolve({ ok: true, data }),
      err => resolve({ ok: false, error: err.message || String(err) }),
      { binary: o.binary, onlyVisible: o.onlyVisible }
    );
  });
}

// Universal export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { sceneToGltf, isGltfExportAvailable, gltfExportDefaults };
}
if (typeof window !== 'undefined') {
  window.GltfExporter = { sceneToGltf, isGltfExportAvailable, gltfExportDefaults };
}
export { sceneToGltf, isGltfExportAvailable, gltfExportDefaults };
