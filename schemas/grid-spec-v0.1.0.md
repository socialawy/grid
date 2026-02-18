# .grid Format Specification v0.1.0

## Overview
.grid is a JSON-based creative intermediate representation format.
A single .grid file describes a multi-frame, multi-channel character grid
that can be consumed by visual, musical, spatial, AI, and narrative systems.

## Design Principles
- Human-readable: editable in any text editor
- Self-contained: no external references required (assets optional)
- Versionable: diffable in git, mergeable
- Channel-agnostic: consumers read only the channels they need
- Backward-compatible: older readers ignore unknown fields

## MIME Type
application/vnd.grid+json

## File Extension
.grid

## Encoding
UTF-8. Always.

---

## Top-Level Structure

| Field       | Type     | Required | Description |
|-------------|----------|----------|-------------|
| `$schema`   | string   | No       | URL to JSON Schema for validation |
| `grid`      | string   | Yes      | Always `"grid"` — format identifier |
| `version`   | string   | Yes      | Semver. Current: `"0.1.0"` |
| `meta`      | object   | Yes      | Project metadata |
| `canvas`    | object   | Yes      | Grid dimensions and defaults |
| `frames`    | array    | Yes      | Ordered array of Frame objects (min: 1) |
| `sequences` | array    | No       | Named playback sequences |
| `project`   | object   | No       | Production settings (BPM, scale, etc.) |

---

## meta Object

| Field       | Type     | Required | Description |
|-------------|----------|----------|-------------|
| `id`        | string   | Yes      | UUID v4 |
| `name`      | string   | Yes      | Human-readable project name |
| `created`   | string   | Yes      | ISO 8601 datetime |
| `modified`  | string   | Yes      | ISO 8601 datetime |
| `author`    | string   | No       | Creator name or handle |
| `tags`      | string[] | No       | Freeform tags for organization |
| `notes`     | string   | No       | Freeform project notes |

---

## canvas Object

| Field          | Type     | Required | Description |
|----------------|----------|----------|-------------|
| `width`        | integer  | Yes      | Grid columns (1–1000) |
| `height`       | integer  | Yes      | Grid rows (1–1000) |
| `charset`      | string   | Yes      | Available characters for this project |
| `defaultChar`  | string   | Yes      | Single character. Fill character for empty cells |
| `defaultColor` | string   | Yes      | Hex color string (e.g., `"#00ff00"`) |
| `background`   | string   | No       | Hex color for canvas background. Default: `"#000000"` |
| `fontFamily`   | string   | No       | Preferred monospace font. Default: `"monospace"` |

---

## Frame Object

| Field       | Type     | Required | Description |
|-------------|----------|----------|-------------|
| `id`        | string   | Yes      | Unique frame identifier (e.g., `"frame_001"`) |
| `index`     | integer  | Yes      | Playback order position (0-based) |
| `label`     | string   | No       | Human-readable frame name |
| `duration`  | number   | No       | Frame duration in ms. Overrides sequence timing |
| `cells`     | array    | Yes      | Array of Cell objects. Sparse: only non-default cells |
| `layers`    | string[] | No       | Active consumer layers: `"visual"`, `"audio"`, `"spatial"`, `"narrative"`, `"ai"` |

### Sparse Cell Strategy
Frames store ONLY cells that differ from the default (canvas.defaultChar + canvas.defaultColor).
A 200x100 grid with 50 active cells stores 50 cell objects, not 20,000.
Consumers fill missing cells from canvas defaults.

---

## Cell Object

| Field      | Type    | Required | Description |
|------------|---------|----------|-------------|
| `x`        | integer | Yes      | Column position (0-based, 0 = left) |
| `y`        | integer | Yes      | Row position (0-based, 0 = top) |
| `char`     | string  | Yes      | Single character (any Unicode) |
| `color`    | string  | No       | Hex color. Default: canvas.defaultColor |
| `density`  | number  | No       | 0.0–1.0. Visual weight / loudness / height. Default: calculated from char |
| `semantic` | string  | No       | Meaning hint. Enum: see Semantic Types below |
| `channel`  | object  | No       | Consumer-specific overrides (see Channel Object) |

### Density Auto-Calculation
If `density` is omitted, consumers SHOULD calculate it from character visual weight:
- Space/dot (`. `) → 0.0–0.1
- Light chars (`-:;`) → 0.2–0.4
- Medium chars (`+*=~`) → 0.5–0.6
- Heavy chars (`#@$%&`) → 0.7–0.9
- Full block (`█`) → 1.0

This mapping is ADVISORY. Consumers may override.

---

## Semantic Types (Enum)

| Value         | Visual        | Music       | 3D          | Narrative     |
|---------------|---------------|-------------|-------------|---------------|
| `"solid"`     | Opaque        | Note ON     | Solid mesh  | Wall/obstacle |
| `"void"`      | Transparent   | Rest/silence| Empty space | Passable      |
| `"fluid"`     | Animated      | Sustain     | Water/flow  | Hazard        |
| `"emissive"`  | Glowing       | Accent/hit  | Light source| Interactable  |
| `"entity"`    | Highlighted   | Trigger     | Dynamic obj | Character/NPC |
| `"control"`   | Hidden/dim    | CC/param    | Camera hint | Trigger zone  |
| `"boundary"`  | Border render | Loop point  | Collision   | Level edge    |

Consumers MUST handle unknown semantic values gracefully (treat as `"solid"`).

---

## Channel Object (per-cell consumer overrides)

| Field      | Type   | Required | Description |
|------------|--------|----------|-------------|
| `audio`    | object | No       | `{ note, octave, instrument, velocity }` |
| `spatial`  | object | No       | `{ height, material, collision }` |
| `narrative`| object | No       | `{ entityId, state, trigger }` |
| `ai`       | object | No       | `{ prompt, style, priority }` |

These are OPTIONAL per-cell overrides. Most cells rely on the automatic
mapping (density→velocity, semantic→material, etc.).
Only cells that need special behavior carry channel data.

---

## Sequence Object

| Field       | Type     | Required | Description |
|-------------|----------|----------|-------------|
| `id`        | string   | Yes      | Unique sequence identifier |
| `name`      | string   | Yes      | Human-readable name |
| `frameIds`  | string[] | Yes      | Ordered list of frame IDs to play |
| `fps`       | number   | No       | Frames per second. Default: 10 |
| `loop`      | boolean  | No       | Loop playback. Default: false |
| `consumers` | string[] | No       | Which consumers activate: `["visual","audio"]` |

---

## project Object

| Field      | Type    | Required | Description |
|------------|---------|----------|-------------|
| `bpm`      | number  | No       | Beats per minute for music consumer. Default: 120 |
| `scale`    | string  | No       | Musical scale. Default: `"chromatic"` |
| `key`      | string  | No       | Musical key. Default: `"C"` |
| `palette`  | object  | No       | Named color palette `{ "name": "#hex" }` |
| `tier`     | integer | No       | Target device tier: 0, 1, or 2 |

---

## Versioning Rules
- PATCH (0.1.x): new optional fields, documentation fixes
- MINOR (0.x.0): new required fields (with migration path), new object types
- MAJOR (x.0.0): breaking changes to existing fields

Readers MUST check `version` and handle unknown fields gracefully.
Unknown fields at any level MUST be preserved on round-trip (no data loss).