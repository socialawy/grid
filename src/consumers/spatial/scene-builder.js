/**
 * scene-builder.js — Three.js Scene Generator
 * Phase 4, Task 4.2
 *
 * Browser-only. Requires Three.js r171+ loaded before this module.
 * Consumes HeightmapData from heightmap.js → produces a live Three.js scene.
 *
 * Feature-detect pattern:
 *   if (!window.THREE) { // CDN failed, 3D tab stays hidden }
 *
 * Architecture:
 *   createSceneBuilder(container, opts) → SceneBuilder instance
 *   SceneBuilder.loadHeightmap(heightmapData) → builds/rebuilds scene
 *   SceneBuilder.destroy() → full teardown, no leaks
 *
 * Design decisions:
 *   - Instanced mesh for solid cells → single draw call per material type
 *   - Emissive cells rendered as PointLight sources (up to MAX_LIGHTS)
 *   - Fluid cells rendered flat (elevation pinned to 0) with transparency
 *   - Void/control cells → no geometry
 *   - Camera: OrbitControls-style manual implementation (no Three.js add-ons needed)
 *   - glTF export stub: scene-builder builds a THREE.Scene consumable by GLTFExporter
 */

// ─── CONSTANTS ───────────────────────────────────────────────────────────────

const MAX_LIGHTS          = 8;    // max PointLights from emissive cells (GPU budget)
const CELL_SIZE           = 1.0;  // world units per grid cell
const MAX_ELEVATION_WORLD = 5.0;  // max world-unit height (elevation 1.0 → this)
const FLUID_WORLD_HEIGHT  = 0.05; // fluid cells sit just above 0
const CAMERA_DISTANCE     = 40;   // initial orbit distance
const AMBIENT_INTENSITY   = 0.4;
const DIR_LIGHT_INTENSITY = 0.8;

// ─── AVAILABILITY CHECK ───────────────────────────────────────────────────────

/**
 * Returns true if Three.js is available in the current environment.
 * Call this before createSceneBuilder() to guard against CDN failure.
 * @returns {boolean}
 */
function isThreeAvailable() {
  return typeof window !== 'undefined' && typeof window.THREE !== 'undefined';
}

// ─── MATERIAL CACHE ──────────────────────────────────────────────────────────

/**
 * Build a Three.js material from a HeightmapCell.
 * Materials are cached by "semantic:color" key to avoid redundant GPU objects.
 *
 * @param {THREE} THREE
 * @param {string} material — semantic name
 * @param {string} color    — hex color string
 * @param {Map}    cache    — mutable material cache
 * @returns {THREE.Material}
 */
function resolveMaterial(THREE, material, color, cache) {
  const key = `${material}:${color}`;
  if (cache.has(key)) return cache.get(key);

  let mat;
  const hexColor = parseInt(color.replace('#', ''), 16);

  switch (material) {
    case 'fluid':
      mat = new THREE.MeshStandardMaterial({
        color: hexColor,
        roughness: 0.1,
        metalness: 0.0,
        transparent: true,
        opacity: 0.75,
      });
      break;

    case 'emissive':
      mat = new THREE.MeshStandardMaterial({
        color: hexColor,
        emissive: hexColor,
        emissiveIntensity: 0.8,
        roughness: 0.5,
        metalness: 0.2,
      });
      break;

    case 'entity':
      mat = new THREE.MeshStandardMaterial({
        color: hexColor,
        roughness: 0.4,
        metalness: 0.6,
      });
      break;

    case 'boundary':
      mat = new THREE.MeshStandardMaterial({
        color: hexColor,
        roughness: 0.9,
        metalness: 0.1,
      });
      break;

    case 'solid':
    default:
      mat = new THREE.MeshStandardMaterial({
        color: hexColor,
        roughness: 0.8,
        metalness: 0.0,
      });
      break;
  }

  cache.set(key, mat);
  return mat;
}

// ─── SCENE BUILDER ───────────────────────────────────────────────────────────

/**
 * Create a SceneBuilder instance.
 *
 * @param {HTMLElement} container  — DOM element for the Three.js canvas
 * @param {object}      opts
 * @param {number}   opts.elevationScale  — world-unit multiplier (default MAX_ELEVATION_WORLD)
 * @param {string}   opts.background      — scene background color hex (default '#111111')
 * @param {boolean}  opts.shadows         — enable shadows (default true, may reduce on low-end)
 * @param {'orbit'|'flyover'|'top'} opts.cameraPreset — initial camera mode (default 'orbit')
 * @returns {SceneBuilder}
 */
function createSceneBuilder(container, opts = {}) {
  if (!isThreeAvailable()) {
    throw new Error('scene-builder: THREE.js is not available. Check CDN load.');
  }
  if (!container) {
    throw new Error('scene-builder: container element is required');
  }

  const THREE = window.THREE;

  const {
    elevationScale = MAX_ELEVATION_WORLD,
    background     = '#111111',
    shadows        = true,
    cameraPreset   = 'orbit',
  } = opts;

  // ── THREE objects ──────────────────────────────────────────────────────────
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.shadowMap.enabled = shadows;
  renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(parseInt(background.replace('#', ''), 16), 1);
  container.appendChild(renderer.domElement);

  const scene  = new THREE.Scene();
  scene.background = new THREE.Color(background);

  const camera = new THREE.PerspectiveCamera(
    45,
    container.clientWidth / container.clientHeight,
    0.1,
    1000
  );

  // ── Lighting base (always present) ────────────────────────────────────────
  const ambientLight = new THREE.AmbientLight(0xffffff, AMBIENT_INTENSITY);
  scene.add(ambientLight);

  const dirLight = new THREE.DirectionalLight(0xffffff, DIR_LIGHT_INTENSITY);
  dirLight.position.set(10, 20, 10);
  if (shadows) {
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(1024, 1024);
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far  = 200;
    dirLight.shadow.camera.left = dirLight.shadow.camera.bottom = -50;
    dirLight.shadow.camera.right = dirLight.shadow.camera.top   =  50;
  }
  scene.add(dirLight);

  // ── Orbit state (manual, no OrbitControls addon) ──────────────────────────
  const orbit = {
    theta:    Math.PI / 6,     // horizontal angle
    phi:      Math.PI / 4,     // vertical angle (from Y axis)
    distance: CAMERA_DISTANCE,
    target:   new THREE.Vector3(0, 0, 0),
    dragging: false,
    lastX: 0,
    lastY: 0,
  };

  function updateCamera() {
    const sinPhi = Math.sin(orbit.phi);
    const cosPhi = Math.cos(orbit.phi);
    camera.position.set(
      orbit.target.x + orbit.distance * sinPhi * Math.sin(orbit.theta),
      orbit.target.y + orbit.distance * cosPhi,
      orbit.target.z + orbit.distance * sinPhi * Math.cos(orbit.theta)
    );
    camera.lookAt(orbit.target);
  }

  // ── Preset camera positions ────────────────────────────────────────────────
  function applyCameraPreset(preset) {
    switch (preset) {
      case 'top':
        orbit.phi      = 0.01;
        orbit.theta    = 0;
        orbit.distance = CAMERA_DISTANCE;
        break;
      case 'flyover':
        orbit.phi      = Math.PI / 8;
        orbit.theta    = Math.PI / 4;
        orbit.distance = CAMERA_DISTANCE * 1.5;
        break;
      case 'orbit':
      default:
        orbit.phi      = Math.PI / 4;
        orbit.theta    = Math.PI / 6;
        orbit.distance = CAMERA_DISTANCE;
        break;
    }
    updateCamera();
  }
  applyCameraPreset(cameraPreset);

  // ── Mouse / Touch orbit controls ──────────────────────────────────────────
  const domEl = renderer.domElement;

  function onPointerDown(e) {
    orbit.dragging = true;
    orbit.lastX    = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
    orbit.lastY    = e.clientY ?? e.touches?.[0]?.clientY ?? 0;
  }

  function onPointerMove(e) {
    if (!orbit.dragging) return;
    const x = e.clientX ?? e.touches?.[0]?.clientX ?? orbit.lastX;
    const y = e.clientY ?? e.touches?.[0]?.clientY ?? orbit.lastY;
    const dx = x - orbit.lastX;
    const dy = y - orbit.lastY;
    orbit.theta -= dx * 0.005;
    orbit.phi    = Math.max(0.05, Math.min(Math.PI / 2 - 0.05, orbit.phi + dy * 0.005));
    orbit.lastX  = x;
    orbit.lastY  = y;
    updateCamera();
  }

  function onPointerUp() { orbit.dragging = false; }

  function onWheel(e) {
    orbit.distance = Math.max(5, Math.min(200, orbit.distance + e.deltaY * 0.05));
    updateCamera();
    e.preventDefault();
  }

  domEl.addEventListener('mousedown',  onPointerDown);
  domEl.addEventListener('mousemove',  onPointerMove);
  domEl.addEventListener('mouseup',    onPointerUp);
  domEl.addEventListener('mouseleave', onPointerUp);
  domEl.addEventListener('touchstart', onPointerDown, { passive: true });
  domEl.addEventListener('touchmove',  onPointerMove, { passive: true });
  domEl.addEventListener('touchend',   onPointerUp);
  domEl.addEventListener('wheel',      onWheel, { passive: false });

  // ── ResizeObserver ────────────────────────────────────────────────────────
  const resizeObserver = new ResizeObserver(() => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  });
  resizeObserver.observe(container);
  renderer.setSize(container.clientWidth, container.clientHeight);

  // ── Animation loop ────────────────────────────────────────────────────────
  let rafId = null;
  function animate() {
    rafId = requestAnimationFrame(animate);
    renderer.render(scene, camera);
  }
  animate();

  // ── Scene object tracking (for clean rebuild) ─────────────────────────────
  let sceneObjects   = [];   // THREE.Object3D instances added per loadHeightmap
  let materialCache  = new Map();
  let dynamicLights  = [];   // PointLights from emissive cells

  /**
   * Clear all geometry and lights added by the last loadHeightmap call.
   */
  function clearScene() {
    for (const obj of sceneObjects) scene.remove(obj);
    for (const light of dynamicLights) scene.remove(light);
    sceneObjects  = [];
    dynamicLights = [];
    // Dispose old geometry (but keep cached materials — they survive rebuilds)
    // Material cache is cleared only on destroy()
  }

  // ─── LOAD HEIGHTMAP ────────────────────────────────────────────────────────

  /**
   * Build (or rebuild) the 3D scene from a HeightmapData object.
   * Clears the previous scene first — safe to call multiple times.
   *
   * Strategy:
   *   1. Group cells by material type
   *   2. For each material group: create InstancedMesh (one draw call)
   *   3. Emissive cells: add PointLights (capped at MAX_LIGHTS, brightest first)
   *   4. Fluid cells: flat plane at FLUID_WORLD_HEIGHT
   *   5. Center the scene on the grid midpoint
   *
   * @param {HeightmapData} heightmap — output of gridToHeightmap()
   */
  function loadHeightmap(heightmap) {
    clearScene();

    const W = heightmap.width;
    const H = heightmap.height;

    // Center offset so grid is centered at world origin
    const offsetX = -(W * CELL_SIZE) / 2 + CELL_SIZE / 2;
    const offsetZ = -(H * CELL_SIZE) / 2 + CELL_SIZE / 2;

    // Aim camera target at grid center, height = half max elevation
    orbit.target.set(0, heightmap.stats.maxElevation * elevationScale * 0.3, 0);
    updateCamera();

    // Group non-empty cells by material type
    const groups = new Map(); // material → HeightmapCell[]
    for (const cell of heightmap.cells) {
      if (cell.isEmpty) continue;
      if (!groups.has(cell.material)) groups.set(cell.material, []);
      groups.get(cell.material).push(cell);
    }

    // Shared geometry: box with slightly beveled look
    const boxGeo = new THREE.BoxGeometry(CELL_SIZE * 0.96, 1, CELL_SIZE * 0.96);

    // Build InstancedMesh per (material, color) pair
    // Sub-group by color within each material type
    for (const [matType, cells] of groups) {
      if (matType === 'fluid') {
        // Fluid: flat plane per cell at FLUID_WORLD_HEIGHT
        _buildFluidLayer(THREE, cells, offsetX, offsetZ, materialCache, sceneObjects, scene);
        continue;
      }

      // Sub-group by color for instancing
      const colorGroups = new Map();
      for (const cell of cells) {
        if (!colorGroups.has(cell.color)) colorGroups.set(cell.color, []);
        colorGroups.get(cell.color).push(cell);
      }

      for (const [color, colorCells] of colorGroups) {
        const mat   = resolveMaterial(THREE, matType, color, materialCache);
        const mesh  = new THREE.InstancedMesh(boxGeo, mat, colorCells.length);
        mesh.castShadow    = true;
        mesh.receiveShadow = true;

        const dummy = new THREE.Object3D();
        for (let i = 0; i < colorCells.length; i++) {
          const cell      = colorCells[i];
          const worldH    = cell.elevation * elevationScale;
          const posX      = cell.x * CELL_SIZE + offsetX;
          const posY      = worldH / 2;  // box is centered, so half-height
          const posZ      = cell.y * CELL_SIZE + offsetZ;

          dummy.position.set(posX, posY, posZ);
          dummy.scale.set(1, Math.max(worldH, 0.05), 1); // min height so flat cells are visible
          dummy.updateMatrix();
          mesh.setMatrixAt(i, dummy.matrix);
        }
        mesh.instanceMatrix.needsUpdate = true;
        scene.add(mesh);
        sceneObjects.push(mesh);
      }

      // Emissive cells → add PointLights (cap at MAX_LIGHTS, sorted by density desc)
      if (matType === 'emissive') {
        const sorted = [...cells].sort((a, b) => b.elevation - a.elevation);
        const lightCells = sorted.slice(0, MAX_LIGHTS);
        for (const cell of lightCells) {
          const color    = parseInt(cell.color.replace('#', ''), 16);
          const worldH   = cell.elevation * elevationScale + 1.5;
          const light    = new THREE.PointLight(color, 1.5, CELL_SIZE * 12);
          light.position.set(
            cell.x * CELL_SIZE + offsetX,
            worldH,
            cell.y * CELL_SIZE + offsetZ
          );
          if (shadows) light.castShadow = true;
          scene.add(light);
          dynamicLights.push(light);
        }
      }
    }
  }

  /**
   * Build flat fluid plane from fluid cells (internal helper).
   */
  function _buildFluidLayer(THREE, cells, offsetX, offsetZ, matCache, objects, scene) {
    // Group fluid cells by color
    const colorGroups = new Map();
    for (const cell of cells) {
      if (!colorGroups.has(cell.color)) colorGroups.set(cell.color, []);
      colorGroups.get(cell.color).push(cell);
    }
    const planeGeo = new THREE.PlaneGeometry(CELL_SIZE * 0.98, CELL_SIZE * 0.98);
    planeGeo.rotateX(-Math.PI / 2);

    for (const [color, colorCells] of colorGroups) {
      const mat  = resolveMaterial(THREE, 'fluid', color, matCache);
      const mesh = new THREE.InstancedMesh(planeGeo, mat, colorCells.length);
      mesh.receiveShadow = true;

      const dummy = new THREE.Object3D();
      for (let i = 0; i < colorCells.length; i++) {
        const cell = colorCells[i];
        dummy.position.set(
          cell.x * CELL_SIZE + offsetX,
          FLUID_WORLD_HEIGHT,
          cell.y * CELL_SIZE + offsetZ
        );
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      scene.add(mesh);
      objects.push(mesh);
    }
  }

  // ─── CAMERA PRESET API ────────────────────────────────────────────────────

  /**
   * Switch camera to a named preset.
   * @param {'orbit'|'flyover'|'top'} preset
   */
  function setCameraPreset(preset) {
    applyCameraPreset(preset);
  }

  // ─── EXPORT HELPERS ───────────────────────────────────────────────────────

  /**
   * Return the raw THREE.Scene for external consumption (e.g. GLTFExporter).
   * @returns {THREE.Scene}
   */
  function getScene() {
    return scene;
  }

  /**
   * Return the raw THREE.WebGLRenderer.
   * @returns {THREE.WebGLRenderer}
   */
  function getRenderer() {
    return renderer;
  }

  // ─── DESTROY ──────────────────────────────────────────────────────────────

  /**
   * Full teardown. Removes DOM element, cancels animation, disposes all GPU resources.
   * Call this when switching away from 3D mode.
   */
  function destroy() {
    if (rafId !== null) cancelAnimationFrame(rafId);

    resizeObserver.disconnect();

    domEl.removeEventListener('mousedown',  onPointerDown);
    domEl.removeEventListener('mousemove',  onPointerMove);
    domEl.removeEventListener('mouseup',    onPointerUp);
    domEl.removeEventListener('mouseleave', onPointerUp);
    domEl.removeEventListener('touchstart', onPointerDown);
    domEl.removeEventListener('touchmove',  onPointerMove);
    domEl.removeEventListener('touchend',   onPointerUp);
    domEl.removeEventListener('wheel',      onWheel);

    clearScene();

    // Dispose cached materials
    for (const mat of materialCache.values()) mat.dispose();
    materialCache.clear();

    renderer.dispose();
    if (domEl.parentNode) domEl.parentNode.removeChild(domEl);
  }

  // ─── PUBLIC API ───────────────────────────────────────────────────────────
  return {
    loadHeightmap,
    setCameraPreset,
    getScene,
    getRenderer,
    destroy,
    // Orbit state exposed for external UI (BPM sync, etc.)
    orbit,
    camera,
  };
}

// ─── MODULE EXPORT ───────────────────────────────────────────────────────────

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { createSceneBuilder, isThreeAvailable };
}

if (typeof window !== 'undefined') {
  window.SceneBuilder = { createSceneBuilder, isThreeAvailable };
}

export { createSceneBuilder, isThreeAvailable };
