# Audio to Grid Layout Converter

## Vision

- Decoupling the conversion logic from the main GRID Studio keeps the core lightweight (adhering to the "Offline Floor" principle) while allowing powerful conversion tools to exist in the ecosystem.

## The Architecture: music2grid

- This tool runs locally on machine. It takes an input file (or text description) and outputs a .grid JSON file, which can be loaded into GRID Studio.

```
┌──────────────────────────────────────────────────────────────┐
│                    MUSIC2GRID CLI                            │
│              "The Grid Music Compiler"                       │
├──────────────────────────────────────────────────────────────┤
│  Inputs:                                                     │
│  1. text  "C4 Major Chord at 0:00"                           │
│  2. midi  "song.mid"                                         │
│  3. audio "song.mp3" (requires basic-pitch/ML)               │
│  4. sheet "song.xml" (MusicXML)                              │
├──────────────────────────────────────────────────────────────┤
│  Process:                                                    │
│  ┌─────────────┐    ┌──────────────┐    ┌──────────────┐     │
│  │ Parse Input │ -> │ Normalize to │ -> │ Grid Mapper  │     │
│  │ (Libraries) │    │ Note Stream  │    │ (X=Time,Y=Hz)│     │
│  └─────────────┘    └──────────────┘    └──────────────┘     │
├──────────────────────────────────────────────────────────────┤
│  Output:                                                     │
│  -> song.grid (JSON)                                         │
└──────────────────────────────────────────────────────────────┘
```

## 1. The Universal "Note Stream" Intermediate

- Regardless of input, everything converts to a simple internal format before becoming a grid.
```json
[
  { "time": 0.0, "pitch": 60, "duration": 2.0, "velocity": 80 },
  { "time": 0.0, "pitch": 64, "duration": 2.0, "velocity": 80 },
  { "time": 0.0, "pitch": 67, "duration": 2.0, "velocity": 80 }
]
```
## 2. The Code (Python)

- Python is ideal here because of its robust audio/MIDI libraries (mido, basic-pitch, music21).

## 3. Handling MP3 (The "Magic" Part)

- To convert MP3 to Grid without manual transcription, use spotify/basic-pitch (a lightweight Python library).

## 4. Copyright & Personal Use

- Input: Converting a copyrighted MP3 to a generic data format (MIDI/Grid) for personal use generally falls under Format Shifting or Fair Use in many jurisdictions, provided you legally own the source file.
- Output: The .grid file itself contains no audio samples. It is purely mathematical metadata (pitch, time, velocity). It is akin to a text file containing guitar tablature.

---

### Working Features
- **Text input**: Convert note descriptions to grid
- **MIDI input**: Import MIDI files with multi-track support
- **Audio transcription**: 🚀 **Fully Functional** (via `basic-pitch` 0.4.0)
- **Grid output**: Full GRID Studio compatible JSON format

### Setup Instructions (Windows)
```bash
# Clone/enter the music2grid directory
cd music2grid

# Install Python 3.9 (required for audio transcription)
uv python install 3.9
uv venv --python 3.9
.venv\Scripts\activate.ps1

# Sync dependencies from pyproject.toml
uv sync
```

## 2. The Script: music2grid.py

### Features Implemented
- **Multi-track MIDI parsing** with proper tick accumulation
- **Text parsing** for chord and sequential note input
- **Audio transcription** with `basic-pitch` 0.4.0 (Windows compatibility fixed)
- **Grid mapping** with configurable resolution and height
- **Cell deduplication** (optional with `--no-dedup`)
- **Full GRID Studio schema compliance**

### Bug Fixes & Improvements
- **Windows Audio Compatibility** — Fixed `tensorflow-io-gcs-filesystem` missing wheels via `uv` overrides
- **`pkg_resources` Mocking** — Injected a virtual module to handle `librosa` legacy requirements
- **`basic-pitch` 0.4.0 API Sync** — Updated `predict_and_save` call signature for modern versions
- **MIDI tick accumulation** — proper absolute tick counter per track
- **Y bounds clamping** — notes stay within grid height limits
- **Schema compliance** — matches GRID Studio deserializer expectations
- **Cell deduplication** — highest velocity wins for overlapping notes
- **Character selection** — density-based visual representation (█▓▒░·+=-. )
- **Code quality** — addressed all SonarCloud complexity issues

### Code Quality Improvements
- S3776 ×3 — split complex functions into focused helpers
- S2836 — cleaned up chord parsing logic
- S1172 — removed unused parameters
- S6903 — proper timezone-aware datetime usage
- S3457 ×4 — proper f-string usage

### Pyre2 Type Checker Compatibility

Added full type annotations (dict[str, Any], list[Any], typed intermediates) throughout
Resolved 30 Pyre2 diagnostics: typed locals for build_grid_json return unpacking, # type: ignore[no-matching-overload] for confirmed Pyre2 bugs (str slicing, round(float, int) overload resolution)
Added assert midi_path is not None after sys.exit guard for correct flow narrowing
*type: ignore[import-untyped] on all optional/dynamic imports (mido, basic_pitch, librosa, pkg_resources)

- from __future__ import annotations makes Python treat all type annotations as strings that are never evaluated at runtime, so str | None, dict[str, Any], tuple[list[Any], float] etc. all work fine on Python 3.9. It's the cleanest single-line fix — no need to replace every annotation with Optional[...] from typing.

## 3. How to use it

### A. Text Description (Quickest)

```bash
uv run python music2grid.py "C4:1 E4:1 G4:1" -o chord.grid
# Creates a C major arpeggio, 1 beat per note
```

### B. MIDI File

```bash
uv run python music2grid.py my_song.mid -o song.grid --resolution 2
# Resolution 2 = 2 columns per beat (8th note precision)
```

### C. MP3/Audio (✅ WORKING!)
🎉 **SUCCESS**: Audio transcription is now fully functional!

**Final Working Setup:**
- ✅ Python 3.9.23 environment
- ✅ `basic-pitch` 0.4.0+ installed and working
- ✅ `tensorflow-io-gcs-filesystem` pinned to 0.31.0 for Windows
- ✅ `pkg_resources` mocked for `librosa` compatibility

**Run conversion:**
```bash
uv run python music2grid.py recording.mp3 -o track.grid --bpm 120
```

## Test Commands

```bash
# Test 1: Simple chord (Text)
uv run python music2grid.py "C4:1 E4:1 G4:1" -o test_chord.grid

# Test 2: Scale pattern (Text)
uv run python music2grid.py "C4 D4 E4 F4 G4 A4 B4 C5" -o test_scale.grid --bpm 120

# Test 3: Polyphony (Text)
uv run python music2grid.py "[C4 E4 G4]:2 [F4 A4 C5]:2" -o test_chord.grid

# Test 4: MIDI file
uv run python music2grid.py my_song.mid -o song.grid --resolution 2

# Test 5: Audio (successfully tested with tacos.mp3)
uv run python music2grid.py "tacos.mp3" -o test_audio.grid --bpm 120
```

## Output Format

Generated `.grid` files include:
- **Canvas settings**: width, height, charset, colors
- **Project metadata**: BPM, scale, key
- **Frame data**: cells with position, character, density, and channel info
- **Audio channel**: note, velocity, duration, time
- **Spatial channel**: height, material properties

Import into GRID Studio: `Import → select .grid file`