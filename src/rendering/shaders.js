/**
 * shaders.js — GLSL source strings for WebGL2 instanced grid renderer
 * No file loading. No compilation. Just source strings.
 *
 * @module shaders
 * @version 1.0.0
 */

const VERTEX_SHADER = `#version 300 es
// Instanced grid vertex shader
// Position derived from gl_InstanceID — no per-instance position attribute needed.

// Per-vertex (unit quad: 4 vertices)
in vec2 a_quad;

// Per-instance (divisor 1)
in float a_charIndex;
in float a_fgR;
in float a_fgG;
in float a_fgB;
in float a_density;

// Uniforms
uniform vec2 u_gridSize;     // grid (width, height) in cells
uniform vec2 u_cellSize;     // cell size in pixels
uniform vec2 u_resolution;   // canvas size in pixels
uniform vec2 u_atlasGrid;    // atlas layout (cols, rows)

// Varyings
out vec2 v_uv;
out vec3 v_fg;
out vec2 v_cellLocal;
out float v_density;

void main() {
  // Cell position from instance ID (row-major)
  float cellX = float(gl_InstanceID % int(u_gridSize.x));
  float cellY = float(gl_InstanceID / int(u_gridSize.x));

  // Pixel position of this vertex
  vec2 pos = (vec2(cellX, cellY) + a_quad) * u_cellSize;

  // NDC: [0, resolution] → [-1, 1], flip Y
  vec2 ndc = (pos / u_resolution) * 2.0 - 1.0;
  ndc.y *= -1.0;
  gl_Position = vec4(ndc, 0.0, 1.0);

  // Atlas UV for this character
  int idx = int(a_charIndex);
  float atlasCol = float(idx % int(u_atlasGrid.x));
  float atlasRow = float(idx / int(u_atlasGrid.x));
  vec2 atlasBase = vec2(atlasCol / u_atlasGrid.x, atlasRow / u_atlasGrid.y);
  v_uv = atlasBase + a_quad / u_atlasGrid;

  // Pass-through
  v_fg = vec3(a_fgR, a_fgG, a_fgB);
  v_cellLocal = a_quad;
  v_density = a_density;
}
`;

const FRAGMENT_SHADER = `#version 300 es
precision mediump float;

in vec2 v_uv;
in vec3 v_fg;
in vec2 v_cellLocal;
in float v_density;

uniform sampler2D u_atlas;
uniform vec3 u_bg;
uniform float u_showGrid;
uniform vec3 u_gridColor;

out vec4 outColor;

void main() {
  // Grid lines (thin lines at cell edges)
  if (u_showGrid > 0.5) {
    float edgeX = min(v_cellLocal.x, 1.0 - v_cellLocal.x);
    float edgeY = min(v_cellLocal.y, 1.0 - v_cellLocal.y);
    float edge = min(edgeX, edgeY);
    if (edge < 0.03) {
      outColor = vec4(u_gridColor, 1.0);
      return;
    }
  }

  // Sample atlas (alpha channel holds glyph shape)
  float alpha = texture(u_atlas, v_uv).a;

  // Composite: bg where no glyph, fg where glyph exists
  vec3 color = mix(u_bg, v_fg, alpha);
  outColor = vec4(color, 1.0);
}
`;

// --- Exports ---
const Shaders = { VERTEX_SHADER, FRAGMENT_SHADER };

if (module !== undefined && module.exports) {
  module.exports = Shaders;
}
if (globalThis.window !== undefined) {
  globalThis.GridShaders = Shaders;
}
export { VERTEX_SHADER, FRAGMENT_SHADER };