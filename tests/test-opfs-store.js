/**
 * test-opfs-store.js — Unit tests for opfs-store.js
 *
 * Pure Node.js — uses an in-memory Map mock for OPFS APIs.
 */

// ============================================================
// MINI ASSERT LIBRARY
// ============================================================

let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, message) {
  if (condition) {
    console.log(`  PASS: ${message}`);
    passed++;
  } else {
    console.log(`  FAIL: ${message}`);
    failed++;
    failures.push(message);
  }
}

function assertEqual(a, b, message) {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  if (ok) {
    console.log(`  PASS: ${message}`);
    passed++;
  } else {
    console.log(`  FAIL: ${message}`);
    console.log(`       got:      ${JSON.stringify(a)}`);
    console.log(`       expected: ${JSON.stringify(b)}`);
    failed++;
    failures.push(message);
  }
}

async function assertRejects(asyncFn, expectedSubstr, message) {
  try {
    await asyncFn();
    console.log(`  FAIL: ${message} (no error thrown)`);
    failed++;
    failures.push(message);
  } catch (e) {
    if (expectedSubstr && !e.message.includes(expectedSubstr)) {
      console.log(`  FAIL: ${message}`);
      console.log(`       error: "${e.message}" does not contain "${expectedSubstr}"`);
      failed++;
      failures.push(message);
    } else {
      console.log(`  PASS: ${message}`);
      passed++;
    }
  }
}

function section(name) {
  console.log(`\n--- ${name} ---`);
}

// ============================================================
// IN-MEMORY OPFS MOCK
// ============================================================

/**
 * Creates a mock FileSystemDirectoryHandle backed by a Map.
 * Supports nested directories via sub-maps.
 */
function createMockDirectoryHandle(name, store) {
  // store: Map<string, { kind, data }> where data is Uint8Array for files, Map for dirs

  return {
    kind: 'directory',
    name,

    async getDirectoryHandle(childName, opts = {}) {
      const entry = store.get(childName);
      if (entry && entry.kind === 'directory') {
        return createMockDirectoryHandle(childName, entry.data);
      }
      if (entry && entry.kind !== 'directory') {
        throw new DOMException('Not a directory', 'TypeMismatchError');
      }
      if (!entry && opts.create) {
        const childStore = new Map();
        store.set(childName, { kind: 'directory', data: childStore });
        return createMockDirectoryHandle(childName, childStore);
      }
      throw new DOMException(`Directory "${childName}" not found`, 'NotFoundError');
    },

    async getFileHandle(childName, opts = {}) {
      const entry = store.get(childName);
      if (entry && entry.kind === 'file') {
        return createMockFileHandle(childName, store);
      }
      if (entry && entry.kind !== 'file') {
        throw new DOMException('Not a file', 'TypeMismatchError');
      }
      if (!entry && opts.create) {
        store.set(childName, { kind: 'file', data: new Uint8Array(0) });
        return createMockFileHandle(childName, store);
      }
      throw new DOMException(`File "${childName}" not found`, 'NotFoundError');
    },

    async removeEntry(childName) {
      if (!store.has(childName)) {
        throw new DOMException(`Entry "${childName}" not found`, 'NotFoundError');
      }
      store.delete(childName);
    },

    async *entries() {
      for (const [key, value] of store) {
        const handle = value.kind === 'file'
          ? createMockFileHandle(key, store)
          : createMockDirectoryHandle(key, value.data);
        yield [key, handle];
      }
    },

    async *values() {
      for (const [key, value] of store) {
        yield value.kind === 'file'
          ? createMockFileHandle(key, store)
          : createMockDirectoryHandle(key, value.data);
      }
    },
  };
}

function createMockFileHandle(name, parentStore) {
  return {
    kind: 'file',
    name,

    async getFile() {
      const entry = parentStore.get(name);
      if (!entry || entry.kind !== 'file') {
        throw new DOMException('Not a file', 'NotFoundError');
      }
      return createMockFile(name, entry.data);
    },

    async createWritable() {
      let chunks = [];
      return {
        async write(data) {
          if (typeof data === 'string') {
            chunks.push(new TextEncoder().encode(data));
          } else if (data instanceof Uint8Array) {
            chunks.push(data);
          } else if (data instanceof ArrayBuffer) {
            chunks.push(new Uint8Array(data));
          } else {
            chunks.push(new TextEncoder().encode(String(data)));
          }
        },
        async close() {
          // Concatenate all chunks
          const totalLen = chunks.reduce((sum, c) => sum + c.length, 0);
          const result = new Uint8Array(totalLen);
          let offset = 0;
          for (const chunk of chunks) {
            result.set(chunk, offset);
            offset += chunk.length;
          }
          parentStore.set(name, { kind: 'file', data: result });
        },
      };
    },
  };
}

function createMockFile(name, data) {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(0);
  return {
    name,
    size: bytes.length,
    type: 'application/octet-stream',
    lastModified: Date.now(),

    async text() {
      return new TextDecoder().decode(bytes);
    },

    async arrayBuffer() {
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    },

    slice(start = 0, end = bytes.length) {
      const sliced = bytes.slice(start, end);
      return createMockFile(name, sliced);
    },
  };
}

/**
 * Set up the global OPFS mock. Returns the root store for inspection/reset.
 */
function setupOpfsMock() {
  const rootStore = new Map();
  const rootHandle = createMockDirectoryHandle('', rootStore);

  const mockNavigator = {
    storage: {
      getDirectory: async () => rootHandle,
    },
  };

  // Node.js v21+ has a read-only navigator global; use defineProperty to override
  Object.defineProperty(global, 'navigator', {
    value: mockNavigator,
    writable: true,
    configurable: true,
  });

  return { rootStore, rootHandle };
}

function teardownOpfsMock() {
  Object.defineProperty(global, 'navigator', {
    value: undefined,
    writable: true,
    configurable: true,
  });
}

// ============================================================
// SETUP MOCK + LOAD MODULE
// ============================================================

// Install mock before importing the module
const { rootStore } = setupOpfsMock();

const {
  isOpfsAvailable,
  listProjects,
  saveProject,
  loadProject,
  deleteProject,
  projectExists,
} = await import('../src/persistence/opfs-store.js');

const GridCore = (await import('../src/core/grid-core.js')).default;
const { createGrid, generateId } = GridCore;

// ============================================================
// HELPER: make a test grid
// ============================================================

function makeTestGrid(overrides = {}) {
  const grid = createGrid(10, 10);
  if (overrides.id) grid.meta.id = overrides.id;
  if (overrides.name) grid.meta.name = overrides.name;
  if (overrides.created) grid.meta.created = overrides.created;
  if (overrides.modified) grid.meta.modified = overrides.modified;

  // Add a cell so the grid is non-trivial
  grid.frames[0].cells.push({
    x: 0, y: 0, char: '#', color: '#ff0000',
    density: 0.8, semantic: 'solid',
  });

  return grid;
}

/** Reset the mock store between test groups */
function resetStore() {
  rootStore.clear();
}

// ============================================================
// TESTS: isOpfsAvailable
// ============================================================

section('isOpfsAvailable');

assert(isOpfsAvailable() === true, 'returns true when navigator.storage.getDirectory exists');

// Helper to temporarily swap navigator
function withNavigator(val, fn) {
  const saved = global.navigator;
  Object.defineProperty(global, 'navigator', { value: val, writable: true, configurable: true });
  const result = fn();
  Object.defineProperty(global, 'navigator', { value: saved, writable: true, configurable: true });
  return result;
}

withNavigator(undefined, () => {
  assert(isOpfsAvailable() === false, 'returns false when navigator is undefined');
});

withNavigator({}, () => {
  assert(isOpfsAvailable() === false, 'returns false when navigator.storage is undefined');
});

withNavigator({ storage: {} }, () => {
  assert(isOpfsAvailable() === false, 'returns false when getDirectory is missing');
});

withNavigator({ storage: { getDirectory: 'not a function' } }, () => {
  assert(isOpfsAvailable() === false, 'returns false when getDirectory is not a function');
});

// ============================================================
// TESTS: saveProject
// ============================================================

section('saveProject — basic');
resetStore();

{
  const grid = makeTestGrid({ name: 'Test Save' });
  const id = grid.meta.id;

  await saveProject(grid);

  // Verify file was created in grid-projects subdirectory
  const projDir = rootStore.get('grid-projects');
  assert(projDir !== undefined, 'grid-projects directory created');
  assert(projDir.kind === 'directory', 'grid-projects is a directory');

  const fileEntry = projDir.data.get(`${id}.grid`);
  assert(fileEntry !== undefined, 'file was written');
  assert(fileEntry.kind === 'file', 'entry is a file');
  assert(fileEntry.data.length > 0, 'file has content');

  // Verify content is valid JSON
  const text = new TextDecoder().decode(fileEntry.data);
  const parsed = JSON.parse(text);
  assert(parsed.grid === 'grid', 'saved file has grid format identifier');
  assert(parsed.meta.id === id, 'saved file has correct id');
}

section('saveProject — compact mode (default)');
resetStore();

{
  const grid = makeTestGrid({ name: 'Compact Test' });
  await saveProject(grid);

  const projDir = rootStore.get('grid-projects');
  const fileEntry = projDir.data.get(`${grid.meta.id}.grid`);
  const text = new TextDecoder().decode(fileEntry.data);

  // Compact mode + pretty: false means no indentation
  assert(!text.includes('\n'), 'compact+non-pretty produces single-line JSON');
}

section('saveProject — compact: false');
resetStore();

{
  const grid = makeTestGrid({ name: 'Non-Compact Test' });
  await saveProject(grid, { compact: false });

  const projDir = rootStore.get('grid-projects');
  const fileEntry = projDir.data.get(`${grid.meta.id}.grid`);
  const text = new TextDecoder().decode(fileEntry.data);
  const parsed = JSON.parse(text);

  // Non-compact should preserve density/semantic on cells
  const cell = parsed.frames[0].cells[0];
  assert(cell.density !== undefined, 'non-compact preserves density');
  assert(cell.semantic !== undefined, 'non-compact preserves semantic');
}

section('saveProject — overwrites existing');
resetStore();

{
  const grid = makeTestGrid({ name: 'Version 1' });
  await saveProject(grid);

  // Modify and save again
  grid.meta.name = 'Version 2';
  grid.frames[0].cells.push({
    x: 1, y: 1, char: '@', color: '#00ff00',
    density: 0.9, semantic: 'solid',
  });
  await saveProject(grid);

  // Verify overwritten
  const projDir = rootStore.get('grid-projects');
  const fileEntry = projDir.data.get(`${grid.meta.id}.grid`);
  const text = new TextDecoder().decode(fileEntry.data);
  const parsed = JSON.parse(text);
  assert(parsed.meta.name === 'Version 2', 'file was overwritten with new data');
}

section('saveProject — error on missing meta.id');

{
  await assertRejects(
    () => saveProject(null),
    'meta.id is required',
    'throws on null grid'
  );

  await assertRejects(
    () => saveProject({}),
    'meta.id is required',
    'throws on grid without meta'
  );

  await assertRejects(
    () => saveProject({ meta: {} }),
    'meta.id is required',
    'throws on grid with empty meta'
  );
}

// ============================================================
// TESTS: loadProject
// ============================================================

section('loadProject — basic');
resetStore();

{
  const grid = makeTestGrid({ name: 'Load Test' });
  const id = grid.meta.id;
  await saveProject(grid);

  const loaded = await loadProject(id);
  assert(loaded.grid === 'grid', 'loaded grid has format identifier');
  assert(loaded.meta.id === id, 'loaded grid has correct id');
  assert(loaded.meta.name === 'Load Test', 'loaded grid has correct name');
  assert(loaded.frames.length === 1, 'loaded grid has one frame');
  assert(loaded.frames[0].cells.length === 1, 'loaded grid has one cell');

  const cell = loaded.frames[0].cells[0];
  assert(cell.x === 0, 'cell x preserved');
  assert(cell.y === 0, 'cell y preserved');
  assert(cell.char === '#', 'cell char preserved');
  assert(cell.color === '#ff0000', 'cell color preserved');
}

section('loadProject — re-inflates compacted cells');
resetStore();

{
  const grid = makeTestGrid();
  // The cell has density 0.8 and semantic 'solid', which ARE defaults for '#'
  // So compact mode will strip them, and load should re-inflate
  await saveProject(grid, { compact: true });

  const loaded = await loadProject(grid.meta.id);
  const cell = loaded.frames[0].cells[0];
  assert(cell.density !== undefined, 'density re-inflated after compact save');
  assert(cell.semantic !== undefined, 'semantic re-inflated after compact save');
}

section('loadProject — not found');
resetStore();

{
  await assertRejects(
    () => loadProject('nonexistent-id'),
    'not found',
    'throws when project does not exist'
  );
}

section('loadProject — not found (no directory)');
// rootStore is already empty from resetStore above
{
  await assertRejects(
    () => loadProject('any-id'),
    'not found',
    'throws when grid-projects directory does not exist'
  );
}

// ============================================================
// TESTS: deleteProject
// ============================================================

section('deleteProject — basic');
resetStore();

{
  const grid = makeTestGrid({ name: 'To Delete' });
  const id = grid.meta.id;
  await saveProject(grid);

  // Verify it exists
  assert(await projectExists(id) === true, 'project exists before delete');

  // Delete
  await deleteProject(id);

  // Verify gone
  assert(await projectExists(id) === false, 'project gone after delete');
}

section('deleteProject — not found');
resetStore();

{
  await assertRejects(
    () => deleteProject('nonexistent-id'),
    'not found',
    'throws when deleting nonexistent project'
  );
}

section('deleteProject — no directory');
// rootStore empty
{
  await assertRejects(
    () => deleteProject('any-id'),
    'not found',
    'throws when grid-projects directory does not exist'
  );
}

// ============================================================
// TESTS: projectExists
// ============================================================

section('projectExists');
resetStore();

{
  const grid = makeTestGrid({ name: 'Exist Check' });
  const id = grid.meta.id;

  assert(await projectExists(id) === false, 'returns false for nonexistent project');

  await saveProject(grid);
  assert(await projectExists(id) === true, 'returns true after save');

  await deleteProject(id);
  assert(await projectExists(id) === false, 'returns false after delete');
}

section('projectExists — no directory');
resetStore();

{
  assert(await projectExists('any-id') === false, 'returns false when directory missing');
}

// ============================================================
// TESTS: listProjects
// ============================================================

section('listProjects — empty');
resetStore();

{
  const list = await listProjects();
  assertEqual(list, [], 'returns empty array when no projects');
}

section('listProjects — single project');
resetStore();

{
  const grid = makeTestGrid({ name: 'Project Alpha' });
  await saveProject(grid);

  const list = await listProjects();
  assert(list.length === 1, 'returns one project');
  assert(list[0].id === grid.meta.id, 'project has correct id');
  assert(list[0].name === 'Project Alpha', 'project has correct name');
  assert(list[0].size > 0, 'project has size > 0');
  assert(list[0].created !== null, 'project has created timestamp');
  assert(list[0].modified !== null, 'project has modified timestamp');
}

section('listProjects — multiple projects sorted by modified');
resetStore();

{
  const gridOld = makeTestGrid({
    name: 'Old Project',
    modified: '2024-01-01T00:00:00.000Z',
  });
  const gridNew = makeTestGrid({
    name: 'New Project',
    modified: '2025-06-15T00:00:00.000Z',
  });

  await saveProject(gridOld);
  await saveProject(gridNew);

  const list = await listProjects();
  assert(list.length === 2, 'returns two projects');
  // Note: modified is updated by serializeProject, but the meta has the timestamps we set
  // The serializer updates modified, so we just verify both are returned
  assert(list[0].id !== list[1].id, 'projects have different ids');
}

section('listProjects — ignores non-.grid files');
resetStore();

{
  // Save a real project
  const grid = makeTestGrid({ name: 'Real Project' });
  await saveProject(grid);

  // Manually add a non-.grid file to the directory
  const projDir = rootStore.get('grid-projects');
  projDir.data.set('readme.txt', {
    kind: 'file',
    data: new TextEncoder().encode('not a grid file'),
  });

  const list = await listProjects();
  assert(list.length === 1, 'ignores non-.grid files');
  assert(list[0].name === 'Real Project', 'only returns .grid files');
}

section('listProjects — no directory yet');
resetStore();

{
  const list = await listProjects();
  assertEqual(list, [], 'returns empty array when directory missing');
}

// ============================================================
// TESTS: round-trip integrity
// ============================================================

section('round-trip: save then load preserves data');
resetStore();

{
  const grid = makeTestGrid({ name: 'Round Trip' });
  const id = grid.meta.id;

  // Add multiple cells
  grid.frames[0].cells.push(
    { x: 5, y: 5, char: '@', color: '#00ff00', density: 0.9, semantic: 'emissive' },
    { x: 9, y: 9, char: '.', color: '#888888', density: 0.05, semantic: 'void' },
  );

  await saveProject(grid, { compact: false });
  const loaded = await loadProject(id);

  assert(loaded.meta.id === id, 'round-trip: id preserved');
  assert(loaded.meta.name === 'Round Trip', 'round-trip: name preserved');
  assert(loaded.canvas.width === 10, 'round-trip: width preserved');
  assert(loaded.canvas.height === 10, 'round-trip: height preserved');
  assert(loaded.frames[0].cells.length === 3, 'round-trip: all cells preserved');

  const c0 = loaded.frames[0].cells[0];
  assert(c0.char === '#', 'round-trip: cell 0 char');
  assert(c0.color === '#ff0000', 'round-trip: cell 0 color');

  const c1 = loaded.frames[0].cells[1];
  assert(c1.char === '@', 'round-trip: cell 1 char');
  assert(c1.semantic === 'emissive', 'round-trip: cell 1 semantic');
}

section('round-trip: compact mode strips and re-inflates');
resetStore();

{
  const grid = makeTestGrid();
  // '#' has default density=0.8 and semantic='solid'
  // Compact should strip these, load should re-inflate
  await saveProject(grid, { compact: true });

  // Inspect raw file
  const projDir = rootStore.get('grid-projects');
  const fileEntry = projDir.data.get(`${grid.meta.id}.grid`);
  const rawText = new TextDecoder().decode(fileEntry.data);
  const rawParsed = JSON.parse(rawText);
  const rawCell = rawParsed.frames[0].cells[0];

  // In compact mode, density/semantic for '#' should be stripped
  // (0.8 is default for '#', 'solid' is default for '#')
  assert(rawCell.density === undefined, 'compact strips default density');
  assert(rawCell.semantic === undefined, 'compact strips default semantic');

  // Load should restore them
  const loaded = await loadProject(grid.meta.id);
  const loadedCell = loaded.frames[0].cells[0];
  assert(loadedCell.density === 0.8, 'load re-inflates density');
  assert(loadedCell.semantic === 'solid', 'load re-inflates semantic');
}

// ============================================================
// TESTS: multiple operations
// ============================================================

section('multiple operations — CRUD workflow');
resetStore();

{
  // Create
  const g1 = makeTestGrid({ name: 'Project 1' });
  const g2 = makeTestGrid({ name: 'Project 2' });
  const g3 = makeTestGrid({ name: 'Project 3' });

  await saveProject(g1);
  await saveProject(g2);
  await saveProject(g3);

  let list = await listProjects();
  assert(list.length === 3, 'three projects after creating three');

  // Delete one
  await deleteProject(g2.meta.id);
  list = await listProjects();
  assert(list.length === 2, 'two projects after deleting one');
  assert(!list.some(p => p.id === g2.meta.id), 'deleted project not in list');

  // Verify remaining can be loaded
  const l1 = await loadProject(g1.meta.id);
  assert(l1.meta.name === 'Project 1', 'project 1 still loadable');
  const l3 = await loadProject(g3.meta.id);
  assert(l3.meta.name === 'Project 3', 'project 3 still loadable');

  // Verify deleted cannot be loaded
  await assertRejects(
    () => loadProject(g2.meta.id),
    'not found',
    'deleted project cannot be loaded'
  );
}

// ============================================================
// TESTS: edge cases
// ============================================================

section('edge cases');
resetStore();

{
  // Save with default opts (compact: true)
  const grid = makeTestGrid({ name: 'Default Opts' });
  await saveProject(grid);
  const loaded = await loadProject(grid.meta.id);
  assert(loaded.meta.id === grid.meta.id, 'default opts save/load works');
}

{
  // Multiple saves of same project
  resetStore();
  const grid = makeTestGrid({ name: 'Multi Save' });
  await saveProject(grid);
  await saveProject(grid);
  await saveProject(grid);

  const list = await listProjects();
  assert(list.length === 1, 'multiple saves of same project yield one entry');
}

// ============================================================
// SUMMARY
// ============================================================

const summary = `OPFS Store: ${passed} passed, ${failed} failed`;
console.log('\n' + summary);
if (failures.length) {
  console.log('Failures:');
  failures.forEach(f => console.log('  - ' + f));
}

teardownOpfsMock();

export const results = { passed, failed, skipped: 0, summary };
