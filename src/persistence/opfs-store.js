/**
 * opfs-store.js — OPFS (Origin Private File System) storage layer
 *
 * Provides project persistence via the browser's OPFS API.
 * All projects stored in `grid-projects/` subdirectory as `${id}.grid` files.
 *
 * @module opfs-store
 */

import Serializer from './serializer.js';

const { serializeProject, deserializeProject } = Serializer;

const DIR_NAME = 'grid-projects';

// ============================================================
// HELPERS
// ============================================================

/**
 * Get the grid-projects subdirectory handle from OPFS root.
 * @param {boolean} [create=true] - Create directory if missing
 * @returns {Promise<FileSystemDirectoryHandle>}
 */
async function getProjectsDir(create = true) {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(DIR_NAME, { create });
}

/**
 * Extract meta from the first ~1KB of a .grid JSON file.
 * Parses just enough to get { id, name, created, modified }.
 * Falls back to full parse if partial parse fails.
 *
 * @param {string} text - First chunk of the file (or full file)
 * @returns {object|null} { id, name, created, modified } or null
 */
function extractMeta(text) {
  // Try to extract meta fields with regex for speed
  const getId = /"id"\s*:\s*"([^"]+)"/.exec(text);
  const getName = /"name"\s*:\s*"([^"]*)"/.exec(text);
  const getCreated = /"created"\s*:\s*"([^"]*)"/.exec(text);
  const getModified = /"modified"\s*:\s*"([^"]*)"/.exec(text);

  if (getId) {
    return {
      id: getId[1],
      name: getName ? getName[1] : 'Untitled',
      created: getCreated ? getCreated[1] : null,
      modified: getModified ? getModified[1] : null,
    };
  }

  // Fallback: try JSON.parse if text is complete
  try {
    const obj = JSON.parse(text);
    if (obj && obj.meta) {
      return {
        id: obj.meta.id,
        name: obj.meta.name || 'Untitled',
        created: obj.meta.created || null,
        modified: obj.meta.modified || null,
      };
    }
  } catch (_) {
    // Ignore parse errors on partial text
  }

  return null;
}

// ============================================================
// PUBLIC API
// ============================================================

/**
 * Check whether OPFS is available in the current environment.
 * @returns {boolean}
 */
function isOpfsAvailable() {
  return (
    typeof navigator !== 'undefined' &&
    navigator.storage != null &&
    typeof navigator.storage.getDirectory === 'function'
  );
}

/**
 * List all projects stored in OPFS.
 * Reads only the first 1KB of each file for speed.
 *
 * @returns {Promise<Array<{ id: string, name: string, created: string|null, modified: string|null, size: number }>>}
 *   Sorted by modified date descending (most recent first).
 */
async function listProjects() {
  let dir;
  try {
    dir = await getProjectsDir(false);
  } catch (_) {
    // Directory doesn't exist yet — no projects
    return [];
  }

  const results = [];

  for await (const [name, handle] of dir.entries()) {
    if (!name.endsWith('.grid') || handle.kind !== 'file') continue;

    try {
      const file = await handle.getFile();
      const size = file.size;

      // Read first 1KB for meta extraction
      const slice = file.slice(0, 1024);
      const text = await slice.text();
      const meta = extractMeta(text);

      if (meta) {
        results.push({
          id: meta.id,
          name: meta.name,
          created: meta.created,
          modified: meta.modified,
          size,
        });
      }
    } catch (_) {
      // Skip unreadable files
    }
  }

  // Sort by modified descending (most recent first)
  results.sort((a, b) => {
    if (!a.modified && !b.modified) return 0;
    if (!a.modified) return 1;
    if (!b.modified) return -1;
    return b.modified.localeCompare(a.modified);
  });

  return results;
}

/**
 * Save a grid project to OPFS.
 *
 * @param {object} grid - Grid object (must have meta.id)
 * @param {object} [opts={}]
 * @param {boolean} [opts.compact=true] - Use compact serialization
 * @returns {Promise<void>}
 * @throws {Error} If grid has no meta.id
 */
async function saveProject(grid, opts = {}) {
  if (!grid || !grid.meta || !grid.meta.id) {
    throw new Error('Cannot save project: grid.meta.id is required');
  }

  const compact = opts.compact !== undefined ? opts.compact : true;
  const json = serializeProject(grid, { compact, pretty: false });

  const dir = await getProjectsDir(true);
  const fileHandle = await dir.getFileHandle(`${grid.meta.id}.grid`, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(json);
  await writable.close();
}

/**
 * Load a grid project from OPFS by ID.
 *
 * @param {string} projectId - Project UUID
 * @returns {Promise<object>} Deserialized grid object
 * @throws {Error} If project not found
 */
async function loadProject(projectId) {
  let dir;
  try {
    dir = await getProjectsDir(false);
  } catch (_) {
    throw new Error(`Project not found: ${projectId}`);
  }

  let fileHandle;
  try {
    fileHandle = await dir.getFileHandle(`${projectId}.grid`, { create: false });
  } catch (_) {
    throw new Error(`Project not found: ${projectId}`);
  }

  const file = await fileHandle.getFile();
  const text = await file.text();
  return deserializeProject(text);
}

/**
 * Delete a project from OPFS by ID.
 *
 * @param {string} projectId - Project UUID
 * @returns {Promise<void>}
 * @throws {Error} If project not found
 */
async function deleteProject(projectId) {
  let dir;
  try {
    dir = await getProjectsDir(false);
  } catch (_) {
    throw new Error(`Project not found: ${projectId}`);
  }

  try {
    // Verify it exists first
    await dir.getFileHandle(`${projectId}.grid`, { create: false });
  } catch (_) {
    throw new Error(`Project not found: ${projectId}`);
  }

  await dir.removeEntry(`${projectId}.grid`);
}

/**
 * Check whether a project exists in OPFS.
 *
 * @param {string} projectId - Project UUID
 * @returns {Promise<boolean>}
 */
async function projectExists(projectId) {
  let dir;
  try {
    dir = await getProjectsDir(false);
  } catch (_) {
    return false;
  }

  try {
    await dir.getFileHandle(`${projectId}.grid`, { create: false });
    return true;
  } catch (_) {
    return false;
  }
}

// ============================================================
// EXPORTS
// ============================================================

const OpfsStore = {
  isOpfsAvailable,
  listProjects,
  saveProject,
  loadProject,
  deleteProject,
  projectExists,
};

// Universal export (ESM + CJS + global)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = OpfsStore;
}
if (typeof window !== 'undefined') {
  window.OpfsStore = OpfsStore;
}
export { isOpfsAvailable, listProjects, saveProject, loadProject, deleteProject, projectExists };
export default OpfsStore;
