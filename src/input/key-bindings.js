/**
 * key-bindings.js — Configurable keyboard shortcut map
 * Maps KeyboardEvent.code → named action strings.
 *
 * Key format: [ctrl+][shift+][alt+]<KeyboardEvent.code>
 * Example: 'ctrl+KeyS', 'shift+ArrowRight', 'Space'
 *
 * @module key-bindings
 */

// ============================================================
// DEFAULT BINDINGS
// ============================================================

/**
 * Default shortcut map. Keys are normalized key strings,
 * values are action names (optionally with ':payload' suffix).
 */
const DEFAULT_BINDINGS = {
  'Space':        'playToggle',
  'ArrowRight':   'nextFrame',
  'ArrowLeft':    'prevFrame',
  'KeyE':         'eraserToggle',
  'Delete':       'clearFrame',
  'Escape':       'closeModal',
  'ctrl+KeyS':    'saveFile',
  'shift+ctrl+KeyS': 'export',
  'ctrl+KeyO':    'import',
  'ctrl+KeyN':    'newProject',
  'ctrl+Comma':   'projectSettings',
  // Digit keys select char by 1-based palette index
  'Digit1':       'selectChar:1',
  'Digit2':       'selectChar:2',
  'Digit3':       'selectChar:3',
  'Digit4':       'selectChar:4',
  'Digit5':       'selectChar:5',
  'Digit6':       'selectChar:6',
  'Digit7':       'selectChar:7',
  'Digit8':       'selectChar:8',
  'Digit9':       'selectChar:9',
};

// ============================================================
// KEY NORMALIZATION
// ============================================================

/**
 * Build a normalized key string from a KeyboardEvent.
 * Uses KeyboardEvent.code (layout-independent) not .key.
 * Modifier prefix order: ctrl → shift → alt.
 * @param {KeyboardEvent} e
 * @returns {string}
 */
function normalizeKey(e) {
  const parts = [];
  if (e.ctrlKey || e.metaKey) parts.push('ctrl');
  if (e.shiftKey) parts.push('shift');
  if (e.altKey) parts.push('alt');
  parts.push(e.code);
  return parts.join('+');
}

// ============================================================
// FACTORY
// ============================================================

/**
 * Create a configurable key binding map.
 *
 * @param {Object} [customBindings={}] - Override or extend DEFAULT_BINDINGS.
 *   Keys are normalized key strings (e.g., 'ctrl+KeyS').
 *   Values are action names (e.g., 'export' or 'selectChar:3').
 * @returns {{
 *   resolve: (e: KeyboardEvent) => string|null,
 *   bind: (key: string, action: string) => void,
 *   unbind: (key: string) => void,
 *   getAll: () => Object
 * }}
 */
function createKeyBindings(customBindings = {}) {
  const bindings = { ...DEFAULT_BINDINGS, ...customBindings };

  return {
    /**
     * Resolve a KeyboardEvent to an action name.
     * Returns null if the key is not bound.
     * @param {KeyboardEvent} e
     * @returns {string|null}
     */
    resolve(e) {
      const key = normalizeKey(e);
      return bindings[key] ?? null;
    },

    /**
     * Add or override a binding at runtime.
     * @param {string} key - Normalized key string (e.g., 'ctrl+KeyZ')
     * @param {string} action - Action name (e.g., 'undo')
     */
    bind(key, action) {
      bindings[key] = action;
    },

    /**
     * Remove a binding.
     * @param {string} key - Normalized key string
     */
    unbind(key) {
      delete bindings[key];
    },

    /**
     * Return a shallow copy of all current bindings.
     * @returns {Object}
     */
    getAll() {
      return { ...bindings };
    },
  };
}

// ============================================================
// EXPORTS — universal (ESM + CJS + global)
// ============================================================

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { createKeyBindings, DEFAULT_BINDINGS, normalizeKey };
}
if (typeof window !== 'undefined') {
  window.KeyBindings = { createKeyBindings, DEFAULT_BINDINGS, normalizeKey };
}
export { createKeyBindings, DEFAULT_BINDINGS, normalizeKey };
