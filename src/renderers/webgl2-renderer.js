/**
 * webgl2-renderer.js — WebGL2 Instanced Grid Renderer
 * Drop-in replacement for canvas-renderer.js.
 * Same public API. One draw call. Font atlas texture.
 *
 * Returns null if WebGL2 context unavailable (caller falls back to Canvas2D).
 *
 * @module webgl2-renderer
 * @version 1.0.0
 */

import { buildFontAtlas } from '../rendering/font-atlas.js';
import { FLOATS_PER_INSTANCE, buildInstanceBuffer, parseHexColor } from '../rendering/instance-buffer.js';
import { VERTEX_SHADER, FRAGMENT_SHADER } from '../rendering/shaders.js';

/**
 * Create a WebGL2 instanced grid renderer.
 *
 * @param {HTMLCanvasElement} canvasEl - Target canvas element
 * @param {object} grid - A valid .grid object
 * @param {object} [options={}]
 * @param {number} [options.fontSize=16] - Font size in pixels
 * @param {boolean} [options.showGrid=false] - Show grid lines
 * @param {number} [options.fps=10] - Playback frames per second
 * @param {function} [options.onFrameChange] - Callback(frameIndex)
 * @returns {object|null} Renderer API or null if WebGL2 unavailable
 */
function createWebGL2Renderer(canvasEl, grid, options = {}) {
  // --- WebGL2 context ---
  const gl = canvasEl.getContext('webgl2', {
    alpha: false,
    antialias: false,
    preserveDrawingBuffer: false,
    powerPreference: 'high-performance'
  });

  if (!gl) return null;

  // --- State ---
  let fontSize = options.fontSize || 16;
  let showGrid = options.showGrid || false;
  let fps = options.fps || 10;
  let onFrameChange = options.onFrameChange || null;
  let currentFrameIndex = 0;
  let isPlaying = false;
  let animationTimer = null;

  // --- Font atlas ---
  let atlas = buildFontAtlas(grid.canvas.charset, {
    fontSize,
    fontFamily: grid.canvas.fontFamily || 'monospace',
    defaultChar: grid.canvas.defaultChar
  });

  // --- Cell size (from atlas measurements) ---
  let cellWidth = atlas.cellW;
  let cellHeight = atlas.cellH;

  // --- Shader compilation ---
  const program = _createProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER);
  if (!program) {
    console.error('GRID WebGL2: Shader compilation failed');
    return null;
  }

  // --- Attribute locations ---
  const loc = {
    a_quad: gl.getAttribLocation(program, 'a_quad'),
    a_charIndex: gl.getAttribLocation(program, 'a_charIndex'),
    a_fgR: gl.getAttribLocation(program, 'a_fgR'),
    a_fgG: gl.getAttribLocation(program, 'a_fgG'),
    a_fgB: gl.getAttribLocation(program, 'a_fgB'),
    a_density: gl.getAttribLocation(program, 'a_density')
  };

  // --- Uniform locations ---
  const uni = {
    u_gridSize: gl.getUniformLocation(program, 'u_gridSize'),
    u_cellSize: gl.getUniformLocation(program, 'u_cellSize'),
    u_resolution: gl.getUniformLocation(program, 'u_resolution'),
    u_atlasGrid: gl.getUniformLocation(program, 'u_atlasGrid'),
    u_cellUV: gl.getUniformLocation(program, 'u_cellUV'),
    u_atlas: gl.getUniformLocation(program, 'u_atlas'),
    u_bg: gl.getUniformLocation(program, 'u_bg'),
    u_showGrid: gl.getUniformLocation(program, 'u_showGrid'),
    u_gridColor: gl.getUniformLocation(program, 'u_gridColor')
  };

  // --- VAO setup ---
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  // Unit quad (triangle strip: 4 vertices)
  const quadVerts = new Float32Array([
    0, 0,
    1, 0,
    0, 1,
    1, 1
  ]);
  const quadBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
  gl.bufferData(gl.ARRAY_BUFFER, quadVerts, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(loc.a_quad);
  gl.vertexAttribPointer(loc.a_quad, 2, gl.FLOAT, false, 0, 0);
  // divisor 0 = per-vertex (default)

  // Instance buffer
  const instanceBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuf);

  // Allocate initial buffer
  const initialData = _buildCurrentBuffer();
  gl.bufferData(gl.ARRAY_BUFFER, initialData, gl.DYNAMIC_DRAW);

  // Per-instance attributes (divisor 1)
  const stride = FLOATS_PER_INSTANCE * 4; // 20 bytes

  // a_charIndex: float at offset 0
  gl.enableVertexAttribArray(loc.a_charIndex);
  gl.vertexAttribPointer(loc.a_charIndex, 1, gl.FLOAT, false, stride, 0);
  gl.vertexAttribDivisor(loc.a_charIndex, 1);

  // a_fgR: float at offset 4
  gl.enableVertexAttribArray(loc.a_fgR);
  gl.vertexAttribPointer(loc.a_fgR, 1, gl.FLOAT, false, stride, 4);
  gl.vertexAttribDivisor(loc.a_fgR, 1);

  // a_fgG: float at offset 8
  gl.enableVertexAttribArray(loc.a_fgG);
  gl.vertexAttribPointer(loc.a_fgG, 1, gl.FLOAT, false, stride, 8);
  gl.vertexAttribDivisor(loc.a_fgG, 1);

  // a_fgB: float at offset 12
  gl.enableVertexAttribArray(loc.a_fgB);
  gl.vertexAttribPointer(loc.a_fgB, 1, gl.FLOAT, false, stride, 12);
  gl.vertexAttribDivisor(loc.a_fgB, 1);

  // a_density: float at offset 16
  gl.enableVertexAttribArray(loc.a_density);
  gl.vertexAttribPointer(loc.a_density, 1, gl.FLOAT, false, stride, 16);
  gl.vertexAttribDivisor(loc.a_density, 1);

  gl.bindVertexArray(null);

  // --- Atlas texture ---
  const atlasTexture = gl.createTexture();
  _uploadAtlas();

  // --- Canvas sizing ---
  _fitCanvas();

  // ============================================================
  // INTERNAL HELPERS
  // ============================================================

  function _buildCurrentBuffer() {
    const frame = grid.frames[currentFrameIndex];
    if (!frame) return new Float32Array(0);
    return buildInstanceBuffer(
      frame,
      grid.canvas,
      atlas.charIndexMap,
      atlas.defaultIndex
    );
  }

  function _uploadAtlas() {
    gl.bindTexture(gl.TEXTURE_2D, atlasTexture);
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.RGBA,
      atlas.atlasWidth, atlas.atlasHeight, 0,
      gl.RGBA, gl.UNSIGNED_BYTE,
      atlas.imageData.data
    );
    // Nearest filtering — crisp pixel text
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  function _rebuildAtlas() {
    atlas = buildFontAtlas(grid.canvas.charset, {
      fontSize,
      fontFamily: grid.canvas.fontFamily || 'monospace',
      defaultChar: grid.canvas.defaultChar
    });
    cellWidth = atlas.cellW;
    cellHeight = atlas.cellH;
    _uploadAtlas();
  }

  function _fitCanvas() {
    const w = grid.canvas.width * cellWidth;
    const h = grid.canvas.height * cellHeight;
    canvasEl.width = w;
    canvasEl.height = h;
    gl.viewport(0, 0, w, h);
  }

  // ============================================================
  // RENDER
  // ============================================================

  function renderFrame() {
    const w = canvasEl.width;
    const h = canvasEl.height;
    const totalInstances = grid.canvas.width * grid.canvas.height;

    // Update instance buffer
    const data = _buildCurrentBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);

    // Clear
    const bg = parseHexColor(grid.canvas.background || '#000000');
    gl.clearColor(bg[0], bg[1], bg[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Draw
    gl.useProgram(program);
    gl.bindVertexArray(vao);

    // Uniforms
    gl.uniform2f(uni.u_gridSize, grid.canvas.width, grid.canvas.height);
    gl.uniform2f(uni.u_cellSize, cellWidth, cellHeight);
    gl.uniform2f(uni.u_resolution, w, h);
    gl.uniform2f(uni.u_atlasGrid, atlas.cols, atlas.rows);
    gl.uniform2f(uni.u_cellUV, atlas.cellW / atlas.atlasWidth, atlas.cellH / atlas.atlasHeight);
    gl.uniform3f(uni.u_bg, bg[0], bg[1], bg[2]);
    gl.uniform1f(uni.u_showGrid, showGrid ? 1 : 0);

    const gridColor = parseHexColor('#333333');
    gl.uniform3f(uni.u_gridColor, gridColor[0], gridColor[1], gridColor[2]);

    // Bind atlas
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, atlasTexture);
    gl.uniform1i(uni.u_atlas, 0);

    // One instanced draw call
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, totalInstances);

    gl.bindVertexArray(null);
  }

  // ============================================================
  // PLAYBACK (mirrors canvas-renderer API exactly)
  // ============================================================

  function nextFrame() {
    currentFrameIndex = (currentFrameIndex + 1) % grid.frames.length;
    renderFrame();
    if (onFrameChange) onFrameChange(currentFrameIndex);
  }

  function prevFrame() {
    currentFrameIndex = (currentFrameIndex - 1 + grid.frames.length) % grid.frames.length;
    renderFrame();
    if (onFrameChange) onFrameChange(currentFrameIndex);
  }

  function goTo(index) {
    if (index < 0 || index >= grid.frames.length) return;
    currentFrameIndex = index;
    renderFrame();
    if (onFrameChange) onFrameChange(currentFrameIndex);
  }

  function play() {
    if (isPlaying) return;
    isPlaying = true;
    animationTimer = setInterval(() => {
      nextFrame();
    }, 1000 / fps);
  }

  function pause() {
    isPlaying = false;
    if (animationTimer) {
      clearInterval(animationTimer);
      animationTimer = null;
    }
  }

  function stop() {
    pause();
    goTo(0);
  }

  function togglePlay() {
    if (isPlaying) pause();
    else play();
    return isPlaying;
  }

  function setGrid(newGrid) {
    const charsetChanged = newGrid.canvas.charset !== grid.canvas.charset;
    grid = newGrid;
    currentFrameIndex = Math.min(currentFrameIndex, grid.frames.length - 1);
    if (charsetChanged) _rebuildAtlas();
    _fitCanvas();
    renderFrame();
  }

  function setOptions(newOptions) {
    let needsAtlasRebuild = false;
    if (newOptions.fontSize && newOptions.fontSize !== fontSize) {
      fontSize = newOptions.fontSize;
      needsAtlasRebuild = true;
    }
    if (newOptions.showGrid !== undefined) showGrid = newOptions.showGrid;
    if (newOptions.fps) fps = newOptions.fps;
    if (newOptions.onFrameChange) onFrameChange = newOptions.onFrameChange;

    if (needsAtlasRebuild) {
      _rebuildAtlas();
      _fitCanvas();
    }
    renderFrame();
  }

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

  function destroy() {
    pause();
    gl.deleteTexture(atlasTexture);
    gl.deleteBuffer(quadBuf);
    gl.deleteBuffer(instanceBuf);
    gl.deleteVertexArray(vao);
    gl.deleteProgram(program);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  // --- Initial render ---
  renderFrame();

  // --- Public API (identical shape to canvas-renderer) ---
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
    get cellSize() { return { width: cellWidth, height: cellHeight }; },
    // WebGL2-specific (bonus, not in canvas-renderer)
    get gl() { return gl; },
    get atlas() { return atlas; }
  };
}

// ============================================================
// GL HELPERS (private to module)
// ============================================================

/**
 * Compile a shader from source.
 * @param {WebGL2RenderingContext} gl
 * @param {number} type - gl.VERTEX_SHADER or gl.FRAGMENT_SHADER
 * @param {string} source - GLSL source
 * @returns {WebGLShader|null}
 */
function _compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('GRID shader error:', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

/**
 * Create and link a shader program.
 * @param {WebGL2RenderingContext} gl
 * @param {string} vertSrc
 * @param {string} fragSrc
 * @returns {WebGLProgram|null}
 */
function _createProgram(gl, vertSrc, fragSrc) {
  const vert = _compileShader(gl, gl.VERTEX_SHADER, vertSrc);
  const frag = _compileShader(gl, gl.FRAGMENT_SHADER, fragSrc);
  if (!vert || !frag) return null;

  const program = gl.createProgram();
  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.linkProgram(program);

  // Shaders can be deleted after linking
  gl.deleteShader(vert);
  gl.deleteShader(frag);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('GRID program link error:', gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }
  return program;
}

// --- Exports ---
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { createWebGL2Renderer };
}
if (globalThis?.window) {
  globalThis.WebGL2Renderer = { createWebGL2Renderer };
}
export { createWebGL2Renderer };
