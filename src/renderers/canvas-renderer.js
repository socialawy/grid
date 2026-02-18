/**
 * canvas-renderer.js — Minimal Canvas2D renderer for .grid files
 * Takes any valid Grid object and draws it. 
 * Knows nothing about music, 3D, AI, or narratives.
 *
 * @module canvas-renderer
 * @version 0.1.0
 */

/**
 * Create a grid renderer bound to a canvas element.
 * @param {HTMLCanvasElement} canvasEl - Target canvas
 * @param {object} grid - Valid .grid object
 * @param {object} [options={}] - Renderer options
 * @returns {object} Renderer API
 */
function createRenderer(canvasEl, grid, options = {}) {
  const ctx = canvasEl.getContext('2d');
  if (!ctx) throw new Error('Cannot get 2d context from canvas');

  // State
  let currentFrameIndex = 0;
  let isPlaying = false;
  let animationTimer = null;
  let fps = options.fps || 10;
  let cellWidth = 0;
  let cellHeight = 0;
  let fontSize = options.fontSize || 14;
  let fontFamily = grid.canvas.fontFamily || 'monospace';
  let showGrid = options.showGrid || false;
  let onFrameChange = options.onFrameChange || null;

  /**
   * Measure and cache cell dimensions based on font.
   */
  function measureFont() {
    ctx.font = `${fontSize}px ${fontFamily}`;
    const metrics = ctx.measureText('@');
    cellWidth = Math.ceil(metrics.width);
    cellHeight = Math.ceil(fontSize * 1.2);
  }

  /**
   * Resize canvas to fit the grid.
   */
  function fitCanvas() {
    measureFont();
    canvasEl.width = grid.canvas.width * cellWidth;
    canvasEl.height = grid.canvas.height * cellHeight;
  }

  /**
   * Convert hex color + density to an rgba string.
   * Density modulates brightness, not opacity.
   * @param {string} hex - Hex color (#RRGGBB)
   * @param {number} density - 0.0–1.0
   * @returns {string} CSS color string
   */
  function colorWithDensity(hex, density) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    // Density scales brightness: 0 = very dim, 1 = full color
    const minBrightness = 0.15;
    const scale = minBrightness + (1 - minBrightness) * density;
    return `rgb(${Math.round(r * scale)}, ${Math.round(g * scale)}, ${Math.round(b * scale)})`;
  }

  /**
   * Render a single frame to the canvas.
   * @param {number} [frameIndex] - Frame index to render (defaults to current)
   */
  function renderFrame(frameIndex) {
    if (frameIndex !== undefined) currentFrameIndex = frameIndex;
    const frame = grid.frames[currentFrameIndex];
    if (!frame) return;

    const { width, height, defaultChar, defaultColor, background } = grid.canvas;

    // Clear with background
    ctx.fillStyle = background || '#000000';
    ctx.fillRect(0, 0, canvasEl.width, canvasEl.height);

    // Draw grid lines if enabled
    if (showGrid) {
      ctx.strokeStyle = '#ffffff10';
      ctx.lineWidth = 0.5;
      for (let x = 0; x <= width; x++) {
        ctx.beginPath();
        ctx.moveTo(x * cellWidth, 0);
        ctx.lineTo(x * cellWidth, canvasEl.height);
        ctx.stroke();
      }
      for (let y = 0; y <= height; y++) {
        ctx.beginPath();
        ctx.moveTo(0, y * cellHeight);
        ctx.lineTo(canvasEl.width, y * cellHeight);
        ctx.stroke();
      }
    }

    // Build cell lookup for fast access
    const cellMap = new Map();
    for (const cell of frame.cells) {
      cellMap.set(`${cell.x},${cell.y}`, cell);
    }

    // Render every cell position
    ctx.font = `${fontSize}px ${fontFamily}`;
    ctx.textBaseline = 'top';

    const defaultDensity = typeof GridCore !== 'undefined'
      ? GridCore.calcDensity(defaultChar)
      : 0.0;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const key = `${x},${y}`;
        const cell = cellMap.get(key);

        const char = cell ? cell.char : defaultChar;
        const color = cell ? (cell.color || defaultColor) : defaultColor;
        const density = cell
          ? (cell.density !== undefined ? cell.density : defaultDensity)
          : defaultDensity;

        // Skip rendering spaces with zero density (optimization)
        if (char === ' ' && density < 0.01) continue;

        ctx.fillStyle = colorWithDensity(color, density);
        ctx.fillText(char, x * cellWidth, y * cellHeight);
      }
    }

    if (onFrameChange) onFrameChange(currentFrameIndex, frame);
  }

  /**
   * Navigate to next frame.
   * @param {boolean} [loop=true] - Wrap around to first frame
   * @returns {number} New frame index
   */
  function nextFrame(loop = true) {
    currentFrameIndex++;
    if (currentFrameIndex >= grid.frames.length) {
      currentFrameIndex = loop ? 0 : grid.frames.length - 1;
    }
    renderFrame();
    return currentFrameIndex;
  }

  /**
   * Navigate to previous frame.
   * @param {boolean} [loop=true] - Wrap around to last frame
   * @returns {number} New frame index
   */
  function prevFrame(loop = true) {
    currentFrameIndex--;
    if (currentFrameIndex < 0) {
      currentFrameIndex = loop ? grid.frames.length - 1 : 0;
    }
    renderFrame();
    return currentFrameIndex;
  }

  /**
   * Jump to a specific frame.
   * @param {number} index - Target frame index
   * @returns {number} Actual frame index (clamped)
   */
  function goTo(index) {
    currentFrameIndex = Math.max(0, Math.min(index, grid.frames.length - 1));
    renderFrame();
    return currentFrameIndex;
  }

  /**
   * Start playback animation.
   * @param {number} [newFps] - Override FPS
   */
  function play(newFps) {
    if (newFps) fps = newFps;
    if (isPlaying) return;
    isPlaying = true;
    const interval = 1000 / fps;
    animationTimer = setInterval(() => nextFrame(true), interval);
  }

  /**
   * Pause playback.
   */
  function pause() {
    isPlaying = false;
    if (animationTimer) {
      clearInterval(animationTimer);
      animationTimer = null;
    }
  }

  /**
   * Stop playback and reset to frame 0.
   */
  function stop() {
    pause();
    goTo(0);
  }

  /**
   * Toggle play/pause.
   * @returns {boolean} New isPlaying state
   */
  function togglePlay() {
    if (isPlaying) pause();
    else play();
    return isPlaying;
  }

  /**
   * Update the grid reference (e.g., after editing).
   * @param {object} newGrid - Updated grid object
   */
  function setGrid(newGrid) {
    grid = newGrid;
    fitCanvas();
    renderFrame();
  }

  /**
   * Update renderer options.
   * @param {object} newOptions - { fontSize?, showGrid?, fps?, onFrameChange? }
   */
  function setOptions(newOptions) {
    if (newOptions.fontSize) { fontSize = newOptions.fontSize; fitCanvas(); }
    if (newOptions.showGrid !== undefined) showGrid = newOptions.showGrid;
    if (newOptions.fps) fps = newOptions.fps;
    if (newOptions.onFrameChange) onFrameChange = newOptions.onFrameChange;
    renderFrame();
  }

  /**
   * Get canvas coordinates from a mouse/touch event.
   * @param {Event} event - Mouse or touch event
   * @returns {{ gridX: number, gridY: number, cellX: number, cellY: number }}
   */
  function eventToGrid(event) {
    const rect = canvasEl.getBoundingClientRect();
    const scaleX = canvasEl.width / rect.width;
    const scaleY = canvasEl.height / rect.height;
    const clientX = event.touches ? event.touches[0].clientX : event.clientX;
    const clientY = event.touches ? event.touches[0].clientY : event.clientY;
    const pixelX = (clientX - rect.left) * scaleX;
    const pixelY = (clientY - rect.top) * scaleY;
    return {
      gridX: Math.floor(pixelX / cellWidth),
      gridY: Math.floor(pixelY / cellHeight),
      pixelX,
      pixelY
    };
  }

  /**
   * Destroy the renderer and clean up.
   */
  function destroy() {
    pause();
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
  }

  // Initialize
  fitCanvas();
  renderFrame();

  // Public API
  return {
    renderFrame,
    nextFrame,
    prevFrame,
    goTo,
    play,
    pause,
    stop,
    togglePlay,
    setGrid,
    setOptions,
    eventToGrid,
    destroy,
    get currentFrame() { return currentFrameIndex; },
    get frameCount() { return grid.frames.length; },
    get playing() { return isPlaying; },
    get cellSize() { return { width: cellWidth, height: cellHeight }; }
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