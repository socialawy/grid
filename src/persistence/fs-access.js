/**
 * fs-access.js — File System Access API integration
 *
 * Provides native file open/save dialogs via the File System Access API,
 * with a blob-download fallback for browsers that lack support.
 *
 * Ctrl+S cascade:
 *   1. If _currentFileHandle exists -> saveToHandle (silent save)
 *   2. Else if FSAPI available -> saveAs (native dialog)
 *   3. Else -> downloadFallback (blob download)
 *
 * @module fs-access
 */

import { serializeProject, deserializeProject } from './serializer.js';

// ============================================================
// MODULE STATE
// ============================================================

let _currentFileHandle = null;

// ============================================================
// DETECTION
// ============================================================

/**
 * Check whether the File System Access API is available.
 * @returns {boolean}
 */
function isFsAccessAvailable() {
  return typeof window !== 'undefined' && 'showSaveFilePicker' in window;
}

// ============================================================
// FILE TYPE OPTIONS
// ============================================================

const GRID_FILE_TYPES = [
  {
    description: 'GRID files',
    accept: { 'application/json': ['.grid'] },
  },
];

// ============================================================
// SAVE
// ============================================================

/**
 * Show a native "Save As" dialog and write the grid to a new file.
 *
 * @param {object} grid - Grid project object
 * @param {object} [opts={}]
 * @param {boolean} [opts.compact=false] - Strip default-value fields
 * @param {boolean} [opts.pretty=true]  - Pretty-print JSON
 * @returns {Promise<FileSystemFileHandle|null>} The handle, or null if cancelled
 */
async function saveAs(grid, opts = {}) {
  const suggestedName = `${(grid.meta && grid.meta.name) || 'untitled'}.grid`;

  let handle;
  try {
    handle = await window.showSaveFilePicker({
      suggestedName,
      types: GRID_FILE_TYPES,
    });
  } catch (err) {
    // User pressed Cancel -> AbortError
    if (err.name === 'AbortError') return null;
    throw err;
  }

  const json = serializeProject(grid, { compact: opts.compact, pretty: opts.pretty !== false });
  const writable = await handle.createWritable();
  await writable.write(json);
  await writable.close();

  _currentFileHandle = handle;
  return handle;
}

/**
 * Silently save to an existing file handle (no dialog).
 *
 * @param {object} grid - Grid project object
 * @param {FileSystemFileHandle} handle
 * @param {object} [opts={}]
 */
async function saveToHandle(grid, handle, opts = {}) {
  if (!handle) throw new Error('saveToHandle requires a valid file handle');

  const json = serializeProject(grid, { compact: opts.compact, pretty: opts.pretty !== false });
  const writable = await handle.createWritable();
  await writable.write(json);
  await writable.close();
}

// ============================================================
// OPEN
// ============================================================

/**
 * Show a native "Open" dialog and read a .grid file.
 *
 * @returns {Promise<object|null>} Deserialized grid, or null if cancelled
 */
async function openFile() {
  let handles;
  try {
    handles = await window.showOpenFilePicker({
      types: GRID_FILE_TYPES,
      multiple: false,
    });
  } catch (err) {
    if (err.name === 'AbortError') return null;
    throw err;
  }

  const handle = handles[0];
  const file = await handle.getFile();
  const text = await file.text();
  const grid = deserializeProject(text);

  _currentFileHandle = handle;
  return grid;
}

// ============================================================
// FILE HANDLER (PWA launch queue)
// ============================================================

/**
 * Register a handler for files opened from the OS (via launchQueue).
 *
 * @param {function} onFileOpen - Called with the deserialized grid
 */
function registerFileHandler(onFileOpen) {
  if (typeof window === 'undefined' || !window.launchQueue) return;

  window.launchQueue.setConsumer(async (launchParams) => {
    if (!launchParams.files || launchParams.files.length === 0) return;

    for (const handle of launchParams.files) {
      const file = await handle.getFile();
      const text = await file.text();
      const grid = deserializeProject(text);
      _currentFileHandle = handle;
      onFileOpen(grid);
    }
  });
}

// ============================================================
// DOWNLOAD FALLBACK
// ============================================================

/**
 * Blob-download fallback for browsers without FSAPI.
 *
 * @param {object} grid - Grid project object
 * @param {object} [opts={}]
 */
function downloadFallback(grid, opts = {}) {
  const json = serializeProject(grid, { compact: opts.compact, pretty: opts.pretty !== false });
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `${(grid.meta && grid.meta.name) || 'untitled'}.grid`;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();

  // Cleanup (defensive — document.body may be gone in edge cases)
  setTimeout(() => {
    try {
      document.body.removeChild(a);
    } catch (_) { /* ignore */ }
    try {
      URL.revokeObjectURL(url);
    } catch (_) { /* ignore */ }
  }, 100);
}

// ============================================================
// SAVE CASCADE
// ============================================================

/**
 * Ctrl+S cascade: silent save -> native dialog -> blob download.
 *
 * @param {object} grid - Grid project object
 * @param {object} [opts={}]
 * @returns {Promise<void>}
 */
async function saveCascade(grid, opts = {}) {
  if (_currentFileHandle) {
    await saveToHandle(grid, _currentFileHandle, opts);
  } else if (isFsAccessAvailable()) {
    await saveAs(grid, opts);
  } else {
    downloadFallback(grid, opts);
  }
}

// ============================================================
// HANDLE ACCESSORS
// ============================================================

/**
 * Get the current file handle (if any).
 * @returns {FileSystemFileHandle|null}
 */
function getCurrentHandle() {
  return _currentFileHandle;
}

/**
 * Clear the current file handle (e.g. when creating a new project).
 */
function clearCurrentHandle() {
  _currentFileHandle = null;
}

// ============================================================
// EXPORTS
// ============================================================

const FsAccess = {
  isFsAccessAvailable,
  saveAs,
  saveToHandle,
  openFile,
  registerFileHandler,
  downloadFallback,
  saveCascade,
  getCurrentHandle,
  clearCurrentHandle,
};

// Universal export (ESM + CJS + global)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = FsAccess;
}
if (typeof window !== 'undefined') {
  window.FsAccess = FsAccess;
}

export {
  isFsAccessAvailable,
  saveAs,
  saveToHandle,
  openFile,
  registerFileHandler,
  downloadFallback,
  saveCascade,
  getCurrentHandle,
  clearCurrentHandle,
};
export default FsAccess;
