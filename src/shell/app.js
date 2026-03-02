// ================================================================
// APPLICATION STATE
// ================================================================
let grid = createGrid(40, 20, '@#$%&*+=-.~:;|/\\^░▒▓█ ', '#00ff88', { name: 'Untitled', defaultChar: ' ' });
let renderer = null;
let inputSystem = null;
let selectedChar = '@';
let selectedColor = '#00ff88';
let eraserMode = false;
let playbackMode = 'frames';
let audioCtx = null;
let synth = null;
let is3DMode = false;
let sceneBuilder = null;
let _autoSaveTimer = null;

const COLORS = ['#00ff88','#00aaff','#ff4466','#ffcc00','#ff44ff','#44ffff','#ffffff','#ff8800','#88ff00','#8844ff','#ff0000','#00ff00','#4488ff','#888888','#cccccc','#444444'];

// ================================================================
// INITIALIZATION
// ================================================================
window.addEventListener('DOMContentLoaded', async () => {
  if (isOpfsAvailable()) {
    try {
      const projects = await listProjects();
      if (projects.length > 0) {
        grid = await loadProject(projects[0].id);
        selectedChar = grid.canvas.charset[0] || '@';
        selectedColor = grid.canvas.defaultColor || '#00ff88';
      }
    } catch (_) { /* start fresh */ }
  }
  initRenderer();
  buildCharPalette();
  buildColorPalette();
  updateUI();
  setupInputSystem();
  setupMobileDetect();
  setupDensitySlider();
  setupAutoSave();

  const mode3dBtn = document.getElementById('mode3dBtn');
  if (mode3dBtn) mode3dBtn.addEventListener('click', toggle3DMode);

  ['camOrbit','camTop','camFlyover'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.addEventListener('click', () => {
      if (sceneBuilder) sceneBuilder.setCameraPreset(id.replace('cam','').toLowerCase());
      ['camOrbit','camTop','camFlyover'].forEach(pid => document.getElementById(pid).classList.remove('active'));
      btn.classList.add('active');
    });
  });

  if (window.launchQueue) {
    window.launchQueue.setConsumer(async (params) => {
      if (!params.files || !params.files.length) return;
      const handle = params.files[0];
      const file = await handle.getFile();
      const g = deserializeProject(await file.text());
      setCurrentHandle(handle);
      loadGridIntoApp(g);
    });
  }
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
});

function initRenderer() {
  const canvas = document.getElementById('gridCanvas');
  renderer = createRenderer(canvas, grid, {
    fps: 10,
    fontSize: 14,
    onFrameChange: (idx, frame) => {
      if (!renderer) return;
      document.getElementById('frameLabel').textContent = `Frame ${idx + 1}/${grid.frames.length}`;
      updateFrameStrip();
    }
  });
  updateUI();
}

// ================================================================
// 3D MODE LOGIC
// ================================================================
function enter3DMode() {
  if (typeof isThreeAvailable === 'undefined' || !isThreeAvailable()) return;
  stopMusicPlayback();
  playbackMode = '3d';
  document.getElementById('gridCanvas').style.display = 'none';
  document.getElementById('viewport3d').style.display = 'block';
  document.getElementById('cameraPresets').classList.add('visible');
  document.getElementById('mode3dBtn').classList.add('active');
  document.getElementById('modeToggleBtn').classList.remove('active');
  if (!sceneBuilder) {
    sceneBuilder = createSceneBuilder(document.getElementById('viewport3d'), {
      elevationScale: 5.0, background: '#0d1117', shadows: true, cameraPreset: 'orbit'
    });
  }
  _rebuild3DScene();
  const frameCount = grid?.frames?.length ?? 1;
  const btn = document.getElementById('mode3dBtn');
  if (frameCount > 1) {
    const cur = renderer ? renderer.current : 0;
    btn.title = `3D View — showing frame ${cur + 1}/${frameCount}. Exit and reenter to render a different frame.`;
  } else { btn.title = '3D View'; }
}

function exit3DMode() {
  if (sceneBuilder) { sceneBuilder.destroy(); sceneBuilder = null; }
  document.getElementById('gridCanvas').style.display = '';
  document.getElementById('viewport3d').style.display = 'none';
  document.getElementById('cameraPresets').classList.remove('visible');
  document.getElementById('mode3dBtn').classList.remove('active');
}

function _rebuild3DScene() {
  if (!sceneBuilder || !grid) return;
  try {
    const fi = renderer ? renderer.current : 0;
    sceneBuilder.loadHeightmap(gridToHeightmap(grid, fi, { elevationScale: 1.0, invertY: false }));
  } catch (e) { console.error('[GRID] 3D scene build failed:', e); }
}

function toggle3DMode() {
  if (playbackMode === '3d') { exit3DMode(); playbackMode = 'frames'; }
  else { enter3DMode(); }
}

// ================================================================
// CHARACTER PALETTE
// ================================================================
function buildCharPalette() {
  const el = document.getElementById('charPalette'); el.innerHTML = '';
  const chars = [...new Set(grid.canvas.charset.split(''))];
  for (const ch of chars) {
    const btn = document.createElement('button');
    btn.className = 'char-btn' + (ch === selectedChar ? ' selected' : '');
    btn.textContent = ch === ' ' ? '␣' : ch;
    btn.title = ch === ' ' ? 'Space' : ch;
    btn.onclick = () => { selectedChar = ch; eraserMode = false; updateEraserBtn(); buildCharPalette(); };
    el.appendChild(btn);
  }
}

// ================================================================
// COLOR PALETTE
// ================================================================
function buildColorPalette() {
  const el = document.getElementById('colorPalette'); el.innerHTML = '';
  for (const c of COLORS) {
    const sw = document.createElement('div');
    sw.className = 'color-swatch' + (c === selectedColor ? ' selected' : '');
    sw.style.background = c;
    sw.onclick = () => selectColor(c);
    el.appendChild(sw);
  }
}

function selectColor(c) {
  if (!/^#[0-9a-fA-F]{6}$/.test(c)) return;
  selectedColor = c;
  document.getElementById('customColor').value = c;
  buildColorPalette();
}

// ================================================================
// ERASER + DENSITY
// ================================================================
function toggleEraser() { eraserMode = !eraserMode; updateEraserBtn(); }
function updateEraserBtn() {
  const btn = document.getElementById('eraserBtn');
  btn.textContent = eraserMode ? '🧹 Eraser ON' : '🧹 Eraser Off';
  btn.className = eraserMode ? 'small active' : 'small';
}

function setupDensitySlider() {
  const slider = document.getElementById('densitySlider');
  const val = document.getElementById('densityVal');
  slider.oninput = () => { val.textContent = (slider.value / 100).toFixed(2); };
}

function getBrushDensity(char) {
  if (document.getElementById('densityOverride').checked) return document.getElementById('densitySlider').value / 100;
  return calcDensity(char);
}

function getBrushSemantic(char) {
  const sel = document.getElementById('semSelect').value;
  return sel || inferSemantic(char);
}

// ================================================================
// INPUT SYSTEM SETUP
// ================================================================
function setupInputSystem() {
  const canvas = document.getElementById('gridCanvas');
  if (inputSystem) inputSystem.destroy();
  inputSystem = createInputSystem(canvas, renderer);

  function paintAt(x, y) {
    if (x < 0 || y < 0 || x >= grid.canvas.width || y >= grid.canvas.height) return;
    const fi = renderer.current;
    if (eraserMode) {
      grid.frames[fi] = removeCell(grid.frames[fi], x, y);
    } else {
      grid.frames[fi] = setCell(grid.frames[fi], x, y, {
        char: selectedChar, color: selectedColor,
        density: getBrushDensity(selectedChar),
        semantic: getBrushSemantic(selectedChar)
      });
    }
    grid.meta.modified = new Date().toISOString();
    renderer.render();
    scheduleAutoSave();
  }

  inputSystem.on('cellDown', ({ x, y }) => { paintAt(x, y); updateCellInfo(x, y); });
  inputSystem.on('cellMove', ({ x, y }) => { paintAt(x, y); updateCellInfo(x, y); });
  inputSystem.on('cellHover', ({ x, y }) => { updateCellInfo(x, y); });

  inputSystem.on('action', ({ name, payload }) => {
    switch (name) {
      case 'playToggle': togglePlayback(); break;
      case 'nextFrame': nextFrameAction(); break;
      case 'prevFrame': prevFrameAction(); break;
      case 'eraserToggle': toggleEraser(); break;
      case 'clearFrame': clearFrame(); break;
      case 'closeModal':
        document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('show'));
        break;
      case 'saveFile': handleSaveFile(); break;
      case 'export': exportGrid(); break;
      case 'import': importGrid(); break;
      case 'newProject': showNewProjectModal(); break;
      case 'projectSettings': showProjectSettings(); break;
      case 'selectChar': {
        const idx = parseInt(payload) - 1;
        const chars = [...new Set(grid.canvas.charset.split(''))];
        if (idx >= 0 && idx < chars.length) {
          selectedChar = chars[idx]; eraserMode = false;
          updateEraserBtn(); buildCharPalette();
        }
        break;
      }
    }
  });
}

function updateCellInfo(x, y) {
  const el = document.getElementById('cellInfo');
  if (x < 0 || y < 0 || x >= grid.canvas.width || y >= grid.canvas.height) {
    el.textContent = 'Out of bounds'; return;
  }
  const frame = grid.frames[renderer.current];
  const cell = getCell(frame, x, y);
  if (cell) {
    el.innerHTML = `<b>(${x},${y})</b> char:"${cell.char}" den:${(cell.density||0).toFixed(2)}<br>` +
      `<span class="sem-dot sem-${cell.semantic||'solid'}"></span>${cell.semantic||'solid'} col:${cell.color||grid.canvas.defaultColor}`;
  } else {
    el.innerHTML = `<b>(${x},${y})</b> <i>default</i>`;
  }
}

// ================================================================
// FRAME MANAGEMENT
// ================================================================
function addNewFrame() {
  grid.frames.push(createFrame(grid, ''));
  grid.meta.modified = new Date().toISOString();
  renderer.setGridRef(grid);
  renderer.goTo(grid.frames.length - 1);
  updateUI(); scheduleAutoSave();
  setStatus(`Frame ${grid.frames.length} added`);
}

function duplicateFrame() {
  const src = grid.frames[renderer.current];
  const dup = { ...JSON.parse(JSON.stringify(src)),
    id: 'frame_' + String(grid.frames.length + 1).padStart(3, '0'),
    index: grid.frames.length, label: (src.label || '') + ' (copy)'
  };
  grid.frames.push(dup);
  grid.meta.modified = new Date().toISOString();
  renderer.setGridRef(grid);
  renderer.goTo(grid.frames.length - 1);
  updateUI(); scheduleAutoSave();
  setStatus('Frame duplicated');
}

function deleteCurrentFrame() {
  if (grid.frames.length <= 1) { setStatus('Cannot delete last frame', true); return; }
  const idx = renderer.current;
  grid.frames.splice(idx, 1);
  grid.frames.forEach((f, i) => { f.index = i; });
  grid.meta.modified = new Date().toISOString();
  renderer.setGridRef(grid);
  renderer.goTo(Math.min(idx, grid.frames.length - 1));
  updateUI(); scheduleAutoSave();
  setStatus('Frame deleted');
}

function clearFrame() {
  if (!renderer) return;
  grid.frames[renderer.current].cells = [];
  grid.meta.modified = new Date().toISOString();
  renderer.render();
  scheduleAutoSave();
  setStatus('Frame cleared');
}

// ================================================================
// PLAYBACK
// ================================================================
function togglePlayback() {
  if (playbackMode === 'music') { toggleMusicPlayback(); return; }
  const playing = renderer.toggle();
  document.getElementById('playBtn').textContent = playing ? '⏸ Pause' : '▶ Play';
  if (playing && is3DMode) {
    const _tick = () => { if (renderer.playing && is3DMode) { _rebuild3DScene(); requestAnimationFrame(_tick); } };
    _tick();
  }
}

function stopPlayback() {
  if (playbackMode === 'music') { stopMusicPlayback(); return; }
  renderer.stop();
  document.getElementById('playBtn').textContent = '▶ Play';
  updateUI();
}

function keyToMidi(key) {
  const map = {C:60,'C#':61,D:62,'D#':63,E:64,F:65,'F#':66,G:67,'G#':68,A:69,'A#':70,B:71};
  return map[key] ?? 60;
}

function toggleMusicPlayback() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    synth = createSynthEngine(audioCtx);
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  if (synth.isPlaying) {
    if (synth.isPaused) { synth.resume(); document.getElementById('playBtn').textContent = '⏸ Pause'; }
    else { synth.pause(); document.getElementById('playBtn').textContent = '▶ Play'; }
    return;
  }
  const bpm = grid.project.bpm || 120;
  const scale = grid.project.scale || 'chromatic';
  synth.play(grid, renderer.current, {
    bpm, scale, rootNote: keyToMidi(grid.project.key || 'C'), subdivision: 4, loop: true,
    onColumnChange(col) { renderer.setPlayheadColumn(col); }
  });
  document.getElementById('playBtn').textContent = '⏸ Pause';
  setStatus(`Playing — ${bpm} BPM, ${scale}`);
}

function stopMusicPlayback() {
  if (synth) synth.stop();
  if (renderer) renderer.setPlayheadColumn(-1);
  document.getElementById('playBtn').textContent = '▶ Play';
  setStatus('Stopped');
}

function togglePlaybackMode() {
  if (playbackMode === 'frames') {
    renderer.stop(); document.getElementById('playBtn').textContent = '▶ Play';
  } else { stopMusicPlayback(); }
  playbackMode = playbackMode === 'frames' ? 'music' : 'frames';
  const btn = document.getElementById('modeToggleBtn');
  btn.textContent = playbackMode === 'music' ? 'Music' : 'Frames';
  btn.className = playbackMode === 'music' ? 'small active' : 'small';
  setStatus(`Mode: ${playbackMode}`);
}

function nextFrameAction() { renderer.next(); updateUI(); }
function prevFrameAction() { renderer.prev(); updateUI(); }
function updateFps(v) { renderer.setFps(Math.max(1, Math.min(60, v))); }

// ================================================================
// FRAME STRIP
// ================================================================
function updateFrameStrip() {
  const strip = document.getElementById('frameStrip'); strip.innerHTML = '';
  const currentIdx = renderer ? renderer.current : 0;
  grid.frames.forEach((frame, i) => {
    const thumb = document.createElement('div');
    thumb.className = 'frame-thumb' + (i === currentIdx ? ' active' : '');
    const W = grid.canvas.width;
    let preview = '';
    const charMap = {};
    for (const c of frame.cells) charMap[c.x + ',' + c.y] = c.char;
    for (let y = 0; y < Math.min(5, grid.canvas.height); y++) {
      for (let x = 0; x < Math.min(10, W); x++) preview += charMap[x + ',' + y] || grid.canvas.defaultChar;
      preview += '\n';
    }
    thumb.textContent = preview;
    thumb.title = `Frame ${i + 1}: ${frame.id}${frame.label ? ' — ' + frame.label : ''} (${frame.cells.length} cells)`;
    thumb.onclick = () => { if (renderer) { renderer.goTo(i); updateUI(); } };
    strip.appendChild(thumb);
  });
}

// ================================================================
// GENERATORS
// ================================================================
function generate(type) {
  if (!renderer) return;
  if (!GENERATORS[type]) return;
  const W = grid.canvas.width, H = grid.canvas.height;
  const fi = renderer.current;
  const colorMode = document.getElementById('genColorMode')?.value || 'fixed';
  const opts = {
    charset: grid.canvas.charset, color: selectedColor, colorMode,
    seed: Math.floor(Math.random() * 0xFFFFFF)
  };
  const cells = GENERATORS[type](W, H, opts);
  grid.frames[fi] = { ...grid.frames[fi], cells };
  grid.meta.modified = new Date().toISOString();
  renderer.render();
  updateUI(); scheduleAutoSave();
  setStatus(`Generated: ${type} (${cells.length} cells)`);
}

// ================================================================
// IMPORT / EXPORT
// ================================================================
function exportGrid() {
  document.getElementById('jsonModalTitle').textContent = 'Export .grid';
  document.getElementById('jsonArea').value = serializeGrid(grid);
  document.getElementById('jsonLoadBtn').style.display = 'none';
  document.getElementById('jsonDownloadBtn').style.display = '';
  document.getElementById('jsonCopyBtn').style.display = '';
  openModal('jsonModal');
}

function importGrid() {
  document.getElementById('jsonModalTitle').textContent = 'Import .grid';
  document.getElementById('jsonArea').value = '';
  document.getElementById('jsonLoadBtn').style.display = '';
  document.getElementById('jsonDownloadBtn').style.display = 'none';
  document.getElementById('jsonCopyBtn').style.display = 'none';
  openModal('jsonModal');
  const fi = document.getElementById('fileInput');
  fi.onchange = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => { document.getElementById('jsonArea').value = ev.target.result; loadJson(); };
    reader.readAsText(file); fi.value = '';
  };
  fi.click();
}

function loadJson() {
  try {
    const imported = deserializeGrid(document.getElementById('jsonArea').value);
    const v = validateGrid(imported);
    if (!v.valid) { setStatus('Invalid: ' + v.errors.join(', '), true); return; }
    grid = imported;
    clearCurrentHandle();
    renderer.setGridRef(grid);
    buildCharPalette(); updateUI();
    closeModal('jsonModal'); scheduleAutoSave();
    if (is3DMode) exit3DMode();
    setStatus('Project imported: ' + grid.meta.name);
  } catch (e) { setStatus('Import error: ' + e.message, true); }
}

function copyJson() {
  navigator.clipboard.writeText(document.getElementById('jsonArea').value)
    .then(() => setStatus('Copied to clipboard'));
}

function downloadJson() {
  const blob = new Blob([serializeGrid(grid)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = (grid.meta.name || 'project').replace(/[^a-zA-Z0-9_-]/g, '_') + '.grid';
  a.click(); URL.revokeObjectURL(url);
  setStatus('Downloaded: ' + a.download);
}

function exportPng() {
  const canvas = document.getElementById('gridCanvas');
  if (!canvas) return;
  canvas.toBlob(blob => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (grid.meta.name || 'grid').replace(/[^a-zA-Z0-9_-]/g, '_') + '.png';
    a.click();
    URL.revokeObjectURL(url);
    setStatus('PNG downloaded');
  }, 'image/png');
}

// ================================================================
// IMAGE IMPORT
// ================================================================
let _importedImageEl = null;

function importImage() {
  _importedImageEl = null;
  document.getElementById('imgPreview').textContent = 'Select an image to preview...';
  document.getElementById('imgApplyBtn').style.display = 'none';
  document.getElementById('imgNewBtn').style.display = 'none';
  openModal('imageImportModal');
  const fi = document.getElementById('imageFileInput');
  fi.onchange = (e) => {
    const file = e.target.files[0]; if (!file) return; fi.value = '';
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      _importedImageEl = img; URL.revokeObjectURL(url);
      renderImagePreview();
      document.getElementById('imgApplyBtn').style.display = '';
      document.getElementById('imgNewBtn').style.display = '';
    };
    img.onerror = () => { setStatus('Failed to load image', true); URL.revokeObjectURL(url); };
    img.src = url;
  };
  fi.click();
}

function renderImagePreview() {
  if (!_importedImageEl) return;
  const ramp = document.getElementById('imgCharRamp').value || '@%#*+=-:. ';
  const cellSize = Math.max(2, +document.getElementById('imgCellSize').value || 10);
  const contrast = +document.getElementById('imgContrast').value || 0;
  const maxW = 60, maxH = 15;
  const previewGrid = imageToGrid(_importedImageEl, {
    charRamp: ramp, cellSize, contrast,
    gridWidth: Math.min(maxW, Math.max(1, Math.floor(_importedImageEl.naturalWidth / cellSize))),
    gridHeight: Math.min(maxH, Math.max(1, Math.floor(_importedImageEl.naturalHeight / cellSize)))
  });
  const frame = previewGrid.frames[0];
  const W = previewGrid.canvas.width, H = previewGrid.canvas.height;
  const charMap = {};
  for (const c of frame.cells) charMap[c.x + ',' + c.y] = c.char;
  let text = '';
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) text += charMap[x + ',' + y] || ' ';
    text += '\n';
  }
  document.getElementById('imgPreview').textContent = text;
}

function applyImageImport(asNewProject = false) {
  if (!_importedImageEl) { setStatus('No image loaded', true); return; }
  const ramp = document.getElementById('imgCharRamp').value || '@%#*+=-:. ';
  const cellSize = Math.max(2, +document.getElementById('imgCellSize').value || 10);
  const contrast = +document.getElementById('imgContrast').value || 0;
  try {
    const imported = imageToGrid(_importedImageEl, {
      charRamp: ramp, cellSize, contrast, projectName: 'Imported Image'
    });
    if (asNewProject) { grid = imported; }
    else { grid.frames[0] = imported.frames[0]; grid.meta.modified = new Date().toISOString(); }
    renderer.setGridRef(grid);
    setupInputSystem(); buildCharPalette(); updateUI();
    closeModal('imageImportModal'); scheduleAutoSave();
    setStatus(`Image imported: ${grid.canvas.width}×${grid.canvas.height} cells`);
  } catch (e) { setStatus('Image import error: ' + e.message, true); }
}

// ================================================================
// SAVE FILE (Ctrl+S cascade)
// ================================================================
async function handleSaveFile() {
  try {
    const method = await saveCascade(grid);
    if (method === 'handle') setStatus('Saved');
    else if (method === 'saveAs') setStatus('Saved to file');
    else if (method === 'download') setStatus('Downloaded');
  } catch (e) { setStatus('Save error: ' + e.message, true); }
}

// ================================================================
// LOAD GRID INTO APP (shared helper)
// ================================================================
function loadGridIntoApp(g) {
  if (synth) { synth.stop(); synth = null; }
  if (audioCtx) { audioCtx.close(); audioCtx = null; }
  if (renderer) renderer.setPlayheadColumn(-1);
  if (playbackMode === '3d') exit3DMode();
  playbackMode = 'frames';
  const _modeBtn = document.getElementById('modeToggleBtn');
  if (_modeBtn) { _modeBtn.textContent = 'Frames'; _modeBtn.className = 'small'; }
  grid = g;
  selectedChar = grid.canvas.charset[0] || '@';
  selectedColor = grid.canvas.defaultColor || '#00ff88';
  renderer.setGridRef(grid);
  setupInputSystem(); buildCharPalette(); buildColorPalette(); updateUI();
}

// ================================================================
// NEW PROJECT
// ================================================================
function showNewProjectModal() { openModal('newProjectModal'); }

function createNewProject() {
  if (synth) { synth.stop(); synth = null; }
  if (audioCtx) { audioCtx.close(); audioCtx = null; }
  if (renderer) renderer.setPlayheadColumn(-1);
  playbackMode = 'frames';
  const _modeBtn = document.getElementById('modeToggleBtn');
  if (_modeBtn) { _modeBtn.textContent = 'Frames'; _modeBtn.className = 'small'; }
  const name = document.getElementById('npName').value || 'Untitled';
  const w = Math.max(1, Math.min(1000, +document.getElementById('npWidth').value || 40));
  const h = Math.max(1, Math.min(1000, +document.getElementById('npHeight').value || 20));
  const charset = document.getElementById('npCharset').value || '@#$%&*+=-.~ ';
  const dc = document.getElementById('npDefaultChar').value || ' ';
  grid = createGrid(w, h, charset, selectedColor, { name, defaultChar: dc });
  clearCurrentHandle();
  renderer.setGridRef(grid);
  buildCharPalette(); updateUI();
  closeModal('newProjectModal'); scheduleAutoSave();
  if (is3DMode) exit3DMode();
  setStatus(`New project: ${name} (${w}×${h})`);
}

// ================================================================
// PROJECT BROWSER
// ================================================================
async function showProjectBrowser() {
  openModal('projectBrowserModal');
  const container = document.getElementById('projectListContainer');
  container.innerHTML = '<div class="project-empty">Loading...</div>';
  if (!isOpfsAvailable()) {
    container.innerHTML = '<div class="project-empty">OPFS not available in this browser</div>';
    return;
  }
  try {
    const projects = await listProjects();
    if (projects.length === 0) {
      container.innerHTML = '<div class="project-empty">No saved projects yet</div>';
      return;
    }
    const ul = document.createElement('ul'); ul.className = 'project-list';
    for (const p of projects) {
      const li = document.createElement('li');
      if (grid.meta.id === p.id) li.className = 'active';
      const nameSpan = document.createElement('span'); nameSpan.className = 'pname';
      nameSpan.textContent = p.name || 'Untitled';
      const metaSpan = document.createElement('span'); metaSpan.className = 'pmeta';
      const date = p.modified ? new Date(p.modified).toLocaleDateString() : '';
      const sizeKb = p.size ? (p.size / 1024).toFixed(1) + ' KB' : '';
      metaSpan.textContent = [date, sizeKb].filter(Boolean).join(' | ');
      const actions = document.createElement('span'); actions.className = 'pactions';
      const loadBtn = document.createElement('button'); loadBtn.className = 'small';
      loadBtn.textContent = 'Load';
      loadBtn.onclick = async (e) => {
        e.stopPropagation();
        try {
          const g = await loadProject(p.id);
          clearCurrentHandle();
          loadGridIntoApp(g);
          closeModal('projectBrowserModal');
          setStatus('Loaded: ' + (g.meta.name || 'Untitled'));
        } catch (err) { setStatus('Load error: ' + err.message, true); }
      };
      const delBtn = document.createElement('button'); delBtn.className = 'small';
      delBtn.style.color = 'var(--warn)'; delBtn.textContent = 'Del';
      delBtn.onclick = async (e) => {
        e.stopPropagation();
        if (!confirm('Delete "' + (p.name || 'Untitled') + '"?')) return;
        try {
          await deleteProject(p.id);
          showProjectBrowser();
          setStatus('Deleted: ' + (p.name || 'Untitled'));
        } catch (err) { setStatus('Delete error: ' + err.message, true); }
      };
      actions.appendChild(loadBtn); actions.appendChild(delBtn);
      li.appendChild(nameSpan); li.appendChild(metaSpan); li.appendChild(actions);
      ul.appendChild(li);
    }
    container.innerHTML = ''; container.appendChild(ul);
  } catch (e) {
    container.innerHTML = '<div class="project-empty">Error: ' + e.message + '</div>';
  }
}

// ================================================================
// PROJECT SETTINGS
// ================================================================
function showProjectSettings() {
  document.getElementById('psName').value = grid.meta.name || '';
  document.getElementById('psBpm').value = grid.project.bpm || 120;
  document.getElementById('psKey').value = grid.project.key || 'C';
  document.getElementById('psScale').value = grid.project.scale || 'chromatic';
  document.getElementById('psCharset').value = grid.canvas.charset || '';
  const paletteObj = grid.project.palette || {};
  document.getElementById('psPalette').value = Object.values(paletteObj).join(',');
  openModal('projectSettingsModal');
}

function applyProjectSettings() {
  const name = document.getElementById('psName').value.trim() || 'Untitled';
  const bpm = Math.max(1, Math.min(999, +document.getElementById('psBpm').value || 120));
  const key = document.getElementById('psKey').value || 'C';
  const scale = document.getElementById('psScale').value || 'chromatic';
  const charset = document.getElementById('psCharset').value || grid.canvas.charset;
  const paletteStr = document.getElementById('psPalette').value.trim();
  grid.meta.name = name; grid.project.bpm = bpm;
  grid.project.key = key; grid.project.scale = scale;
  grid.canvas.charset = charset;
  if (paletteStr) {
    const colors = paletteStr.split(',').map(c => c.trim()).filter(c => /^#[0-9a-fA-F]{6}$/.test(c));
    const palette = {}; colors.forEach((c, i) => { palette[i] = c; });
    grid.project.palette = palette;
  } else { grid.project.palette = {}; }
  grid.meta.modified = new Date().toISOString();
  buildCharPalette(); updateUI();
  closeModal('projectSettingsModal'); scheduleAutoSave();
  setStatus('Settings updated');
}

// ================================================================
// DISPLAY OPTIONS
// ================================================================
function updateFontSize(v) {
  document.getElementById('fontSizeVal').textContent = v;
  renderer.setFontSize(v);
}

function toggleGridLines() {
  renderer.setShowGrid(document.getElementById('showGridCheck').checked);
}

// ================================================================
// MODALS
// ================================================================
function openModal(id) { document.getElementById(id).classList.add('show'); }
function closeModal(id) { document.getElementById(id).classList.remove('show'); }

document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-overlay')) e.target.classList.remove('show');
});

// ================================================================
// MOBILE
// ================================================================
function setupMobileDetect() {
  const check = () => { document.getElementById('menuBtn').style.display = window.innerWidth <= 768 ? '' : 'none'; };
  check(); window.addEventListener('resize', check);
}

function toggleMobileSidebar() {
  document.getElementById('sidebar').classList.toggle('mobile-show');
}

// ================================================================
// UI UPDATE
// ================================================================
function updateUI() {
  document.getElementById('projectMeta').textContent =
    `${grid.meta.name} — ${grid.canvas.width}×${grid.canvas.height}`;
  document.getElementById('frameLabel').textContent =
    `Frame ${(renderer ? renderer.current : 0) + 1}/${grid.frames.length}`;
  updateFrameStrip();
  const frame = grid.frames[renderer ? renderer.current : 0];
  document.getElementById('statusCenter').textContent =
    `${frame.cells.length} cells | ${frame.id}`;
}

function setStatus(msg, isError = false) {
  const el = document.getElementById('statusLeft');
  el.textContent = msg;
  el.style.color = isError ? 'var(--warn)' : 'var(--accent)';
  setTimeout(() => { el.style.color = ''; el.textContent = 'Ready'; }, 3000);
}

// ================================================================
// AUTO-SAVE (2s debounce, OPFS)
// ================================================================
function setupAutoSave() { /* scheduleAutoSave called on each mutation */ }

function scheduleAutoSave() {
  if (_autoSaveTimer) clearTimeout(_autoSaveTimer);
  _autoSaveTimer = setTimeout(async () => {
    if (!isOpfsAvailable()) return;
    try { await saveProject(grid); }
    catch (e) { setStatus('Auto-save failed: ' + e.message, true); }
  }, 2000);
}