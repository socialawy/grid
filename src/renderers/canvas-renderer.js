/**
 * canvas-renderer.js — Battle-tested Canvas2D renderer from dist/index.html
 * This is the working inline implementation with setPlayheadColumn and all getters.
 * Replaces the separately developed src version with the proven implementation.
 *
 * @module canvas-renderer
 * @version 0.1.0
 */

function createRenderer(canvasEl, grid, options = {}) {
  const ctx = canvasEl.getContext('2d');
  let currentFrame = 0, isPlaying = false, timer = null, fps = options.fps || 10;
  let cellW = 0, cellH = 0, fontSize = options.fontSize || 14;
  let showGridLines = false, onFrameChange = options.onFrameChange || null;
  let _playheadCol = -1;

  function measure() { ctx.font = fontSize + 'px monospace'; const m = ctx.measureText('@'); cellW = Math.ceil(m.width); cellH = Math.ceil(fontSize * 1.2) }
  function fit() { measure(); canvasEl.width = grid.canvas.width * cellW; canvasEl.height = grid.canvas.height * cellH }

  function colorDensity(hex, d) {
    const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    const s = 0.15 + (1 - 0.15) * d;
    return `rgb(${Math.round(r * s)},${Math.round(g * s)},${Math.round(b * s)})`;
  }

  function renderPlayhead() {
    if (_playheadCol < 0) return;
    ctx.fillStyle = 'rgba(0,255,136,0.18)';
    ctx.fillRect(_playheadCol * cellW, 0, cellW, canvasEl.height);
  }

  function render(fi) {
    if (fi !== undefined) currentFrame = fi;
    const frame = grid.frames[currentFrame]; if (!frame) return;
    const { width: W, height: H, defaultChar: dc, defaultColor: dCol, background: bg } = grid.canvas;
    ctx.fillStyle = bg || '#000'; ctx.fillRect(0, 0, canvasEl.width, canvasEl.height);

    if (showGridLines) {
      ctx.strokeStyle = '#ffffff10'; ctx.lineWidth = 0.5;
      for (let x = 0; x <= W; x++) { ctx.beginPath(); ctx.moveTo(x * cellW, 0); ctx.lineTo(x * cellW, canvasEl.height); ctx.stroke() }
      for (let y = 0; y <= H; y++) { ctx.beginPath(); ctx.moveTo(0, y * cellH); ctx.lineTo(canvasEl.width, y * cellH); ctx.stroke() }
    }

    const map = new Map();
    for (const c of frame.cells) map.set(c.x + ',' + c.y, c);
    ctx.font = fontSize + 'px monospace'; ctx.textBaseline = 'top';
    const dd = calcDensity(dc);

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const c = map.get(x + ',' + y);
        const ch = c ? c.char : dc;
        const col = c ? (c.color || dCol) : dCol;
        const den = c ? (c.density !== undefined ? c.density : dd) : dd;
        if (ch === ' ' && den < 0.01) continue;
        ctx.fillStyle = colorDensity(col, den);
        ctx.fillText(ch, x * cellW, y * cellH);
      }
    }
    renderPlayhead();
    if (onFrameChange) onFrameChange(currentFrame, frame);
  }

  function next(loop = true) { currentFrame++; if (currentFrame >= grid.frames.length) currentFrame = loop ? 0 : grid.frames.length - 1; render(); return currentFrame }
  function prev(loop = true) { currentFrame--; if (currentFrame < 0) currentFrame = loop ? grid.frames.length - 1 : 0; render(); return currentFrame }
  function goTo(i) { currentFrame = Math.max(0, Math.min(i, grid.frames.length - 1)); render(); return currentFrame }
  function play(f) { if (f) fps = f; if (isPlaying) return; isPlaying = true; timer = setInterval(() => next(true), 1000 / fps) }
  function pause() { isPlaying = false; if (timer) { clearInterval(timer); timer = null } }
  function stop() { pause(); goTo(0) }
  function toggle() { if (isPlaying) pause(); else play(); return isPlaying }

  function eventToGrid(e) {
    const rect = canvasEl.getBoundingClientRect();
    const sx = canvasEl.width / rect.width, sy = canvasEl.height / rect.height;
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    const cy = e.touches ? e.touches[0].clientY : e.clientY;
    return { gridX: Math.floor((cx - rect.left) * sx / cellW), gridY: Math.floor((cy - rect.top) * sy / cellH) };
  }

  function setGridRef(g) { grid = g; fit(); render() }
  function setFontSize(s) { fontSize = s; fit(); render() }
  function setShowGrid(v) { showGridLines = v; render() }
  function setFps(f) { fps = f; if (isPlaying) { pause(); play() } }

  fit(); render();

  function setPlayheadColumn(col) { _playheadCol = col; render(); }

  return {
    render, next, prev, goTo, play, pause, stop, toggle, eventToGrid, setGridRef, setFontSize, setShowGrid, setFps,
    get current() { return currentFrame }, get count() { return grid.frames.length }, get playing() { return isPlaying }, get cellSize() { return { w: cellW, h: cellH } }, setPlayheadColumn
  };
}

// Universal export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { createRenderer };
}
if (typeof window !== 'undefined') {
  window.GridRenderer = { createRenderer };
}
export { createRenderer };