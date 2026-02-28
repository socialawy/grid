/**
 * input-system.js — Unified Input System
 *
 * Abstracts raw DOM mouse, touch, and keyboard events into renderer-agnostic
 * grid-level events. The caller never touches clientX/clientY directly.
 *
 * Pixel → cell translation is delegated to renderer.eventToGrid(event),
 * which both canvas-renderer.js and webgl2-renderer.js already expose.
 *
 * Events emitted:
 *   'cellDown'  → { x, y, button }   mouse/touch start on a cell
 *   'cellMove'  → { x, y }           drag across cells (button held)
 *   'cellUp'    → { x, y }           mouse/touch release
 *   'cellHover' → { x, y }           passive hover (no button held)
 *   'action'    → { name, payload }  keyboard shortcut fired
 *
 * @module input-system
 */

import { createKeyBindings } from './key-bindings.js';

// ============================================================
// FACTORY
// ============================================================

/**
 * Create a unified input system for a canvas element.
 *
 * @param {HTMLCanvasElement} canvasEl - The canvas to listen on
 * @param {object} renderer - Must expose eventToGrid(event) → { gridX, gridY }
 * @param {object} [options={}]
 * @param {object} [options.keyBindings] - Custom binding overrides (passed to createKeyBindings)
 * @returns {{
 *   on:          (event: string, handler: Function) => void,
 *   off:         (event: string, handler: Function) => void,
 *   destroy:     () => void,
 *   keyBindings: ReturnType<typeof createKeyBindings>
 * }}
 */
function createInputSystem(canvasEl, renderer, options = {}) {
  const keyBindings = createKeyBindings(options.keyBindings ?? {});

  // eventName → Set of handler functions
  const listeners = new Map();

  let isDown    = false;
  let lastCell  = { x: -1, y: -1 };

  // ---- Internal helpers ----------------------------------------

  function emit(eventName, payload) {
    const handlers = listeners.get(eventName);
    if (!handlers) return;
    for (const h of handlers) {
      try {
        h(payload);
      } catch (err) {
        console.error(`[InputSystem] Handler error on "${eventName}":`, err);
      }
    }
  }

  /** Convert any event (mouse or touch) to grid coordinates. */
  function toGrid(e) {
    return renderer.eventToGrid(e);
  }

  // ---- Mouse ---------------------------------------------------

  function onMouseDown(e) {
    const { gridX: x, gridY: y } = toGrid(e);
    isDown   = true;
    lastCell = { x, y };
    emit('cellDown', { x, y, button: e.button ?? 0 });
  }

  function onMouseMove(e) {
    const { gridX: x, gridY: y } = toGrid(e);
    if (isDown) {
      // Throttle: only emit when cell changes
      if (x !== lastCell.x || y !== lastCell.y) {
        lastCell = { x, y };
        emit('cellMove', { x, y });
      }
    } else {
      emit('cellHover', { x, y });
    }
  }

  function onMouseUp(e) {
    if (!isDown) return;
    isDown = false;
    const { gridX: x, gridY: y } = toGrid(e);
    emit('cellUp', { x, y });
  }

  // ---- Touch ---------------------------------------------------
  // Pass the full TouchEvent to renderer.eventToGrid — the canvas-renderer
  // already reads e.touches[0] internally.  For cellUp (touchend), touches
  // may be empty, so we use changedTouches as a synthetic fallback.

  function syntheticFromTouch(touchEvent) {
    const touch = touchEvent.touches[0] ?? touchEvent.changedTouches[0];
    if (!touch) return null;
    // Build a minimal event-like object that eventToGrid can consume
    return { clientX: touch.clientX, clientY: touch.clientY };
  }

  function onTouchStart(e) {
    e.preventDefault();
    const synthetic = syntheticFromTouch(e);
    if (!synthetic) return;
    const { gridX: x, gridY: y } = toGrid(synthetic);
    isDown   = true;
    lastCell = { x, y };
    emit('cellDown', { x, y, button: 0 });
  }

  function onTouchMove(e) {
    e.preventDefault();
    if (!isDown) return;
    const synthetic = syntheticFromTouch(e);
    if (!synthetic) return;
    const { gridX: x, gridY: y } = toGrid(synthetic);
    if (x !== lastCell.x || y !== lastCell.y) {
      lastCell = { x, y };
      emit('cellMove', { x, y });
    }
  }

  function onTouchEnd(e) {
    if (!isDown) return;
    isDown = false;
    const synthetic = syntheticFromTouch(e);
    if (!synthetic) return;
    const { gridX: x, gridY: y } = toGrid(synthetic);
    emit('cellUp', { x, y });
  }

  // ---- Keyboard ------------------------------------------------

  function onKeyDown(e) {
    // Don't intercept while the user types in a form field
    const tag = e.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    const action = keyBindings.resolve(e);
    if (!action) return;

    e.preventDefault();

    // Support parameterized actions: 'selectChar:3' → name='selectChar', payload='3'
    const colonIdx = action.indexOf(':');
    const name     = colonIdx >= 0 ? action.slice(0, colonIdx) : action;
    const payload  = colonIdx >= 0 ? action.slice(colonIdx + 1) : null;

    emit('action', { name, payload });
  }

  // ---- Attach DOM listeners ------------------------------------

  canvasEl.addEventListener('mousedown',  onMouseDown);
  canvasEl.addEventListener('mousemove',  onMouseMove);
  window.addEventListener('mouseup',      onMouseUp);

  canvasEl.addEventListener('touchstart', onTouchStart, { passive: false });
  canvasEl.addEventListener('touchmove',  onTouchMove,  { passive: false });
  canvasEl.addEventListener('touchend',   onTouchEnd);

  document.addEventListener('keydown',    onKeyDown);

  // ---- Public API ----------------------------------------------

  return {
    /**
     * Subscribe to a grid-level event.
     * @param {'cellDown'|'cellMove'|'cellUp'|'cellHover'|'action'} eventName
     * @param {Function} handler
     */
    on(eventName, handler) {
      if (!listeners.has(eventName)) listeners.set(eventName, new Set());
      listeners.get(eventName).add(handler);
    },

    /**
     * Unsubscribe from a grid-level event.
     * @param {string} eventName
     * @param {Function} handler
     */
    off(eventName, handler) {
      listeners.get(eventName)?.delete(handler);
    },

    /**
     * Remove all DOM event listeners and clear internal state.
     * Call this when the canvas or renderer is replaced.
     */
    destroy() {
      canvasEl.removeEventListener('mousedown',  onMouseDown);
      canvasEl.removeEventListener('mousemove',  onMouseMove);
      window.removeEventListener('mouseup',      onMouseUp);
      canvasEl.removeEventListener('touchstart', onTouchStart);
      canvasEl.removeEventListener('touchmove',  onTouchMove);
      canvasEl.removeEventListener('touchend',   onTouchEnd);
      document.removeEventListener('keydown',    onKeyDown);
      listeners.clear();
      isDown = false;
    },

    /** Expose bindings for runtime reconfiguration. */
    keyBindings,
  };
}

// ============================================================
// EXPORTS — universal (ESM + CJS + global)
// ============================================================

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { createInputSystem };
}
if (typeof window !== 'undefined') {
  window.InputSystem = { createInputSystem };
}
export { createInputSystem };
