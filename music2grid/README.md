# music2grid

Convert MIDI, Audio, or Text descriptions to GRID Studio format (.grid JSON).

## Features

- ✅ **Text input**: Convert note descriptions to grid
- ✅ **MIDI input**: Import MIDI files with multi-track support  
- ✅ **Grid output**: Full GRID Studio compatible JSON format
- ✅ **Audio transcription**: Fully functional (requires Python 3.9)

## Quick Start

```bash
# Setup
cd music2grid
uv init
uv add mido numpy

# Convert text to grid
uv run python music2grid.py "C4:1 E4:1 G4:1" -o chord.grid

# Convert MIDI to grid
uv run python music2grid.py song.mid -o song.grid --resolution 2
```

## Installation

### Requirements
- Python 3.9+ (3.13+ recommended for text/MIDI)
- `uv` package manager

### Setup
```bash
# Clone/enter the music2grid directory
cd music2grid

# Initialize project with uv
uv init

# Install core dependencies (works with Python 3.13+)
uv add mido numpy

# For audio transcription (requires Python 3.9):
uv python install 3.9
uv venv --python 3.9
# Windows:
.venv\Scripts\activate.ps1
# Then install dependencies via pyproject.toml
uv sync
```

## Usage

### Text Input
Convert note descriptions directly:

```bash
# Simple chord
uv run python music2grid.py "C4:1 E4:1 G4:1" -o chord.grid

# Scale pattern
uv run python music2grid.py "C4 D4 E4 F4 G4 A4 B4 C5" -o scale.grid --bpm 120

# Polyphony
uv run python music2grid.py "[C4 E4 G4]:2 [F4 A4 C5]:2" -o progression.grid
```

**Text Format:**
- `C4:1` = Note C4, duration 1 beat
- `[C4 E4 G4]:2` = Chord, all notes at same time, duration 2 beats
- Default duration = 1 beat if not specified

### MIDI Input
Import MIDI files with full multi-track support:

```bash
uv run python music2grid.py my_song.mid -o song.grid --resolution 2
```

**Options:**
- `--resolution 2` = 2 columns per beat (8th note precision)
- `--bpm 120` = BPM for metadata
- `--height 24` = Grid height in rows

### Audio Input (Now Working!)
**Audio transcription is now fully functional:**
```bash
uv run python music2grid.py recording.mp3 -o track.grid --bpm 120
```

## Command Line Options

```
usage: music2grid.py [-h] [-o OUTPUT] [--bpm BPM] [--resolution RESOLUTION] 
                     [--height HEIGHT] [--color COLOR] [--no-dedup] input

Convert MIDI / Audio / Text to GRID Studio format (.grid JSON)

positional arguments:
  input                 MIDI file, audio file (.mp3/.wav), or text note string

optional arguments:
  -h, --help            show this help message and exit
  -o OUTPUT, --output OUTPUT
                        Output .grid file path (default: output.grid)
  --bpm BPM             BPM for playback metadata (default 120)
  --resolution RESOLUTION
                        Columns per beat: 1=quarter, 2=8th, 4=16th (default 2)
  --height HEIGHT       Grid height in rows (default 24)
  --color COLOR         Note color hex (default #ffff00)
  --no-dedup            Keep overlapping notes (default: highest velocity wins per cell)
```

## Output Format

Generated `.grid` files include:

- **Canvas settings**: width, height, charset, colors
- **Project metadata**: BPM, scale, key  
- **Frame data**: cells with position, character, density, and channel info
- **Audio channel**: note, velocity, duration, time
- **Spatial channel**: height, material properties

### Example Output Structure
```json
{
  "grid": "grid",
  "version": "0.1.0",
  "meta": {
    "id": "music2grid-d267988b",
    "name": "C4:1 E4:1 G4:1",
    "author": "music2grid",
    "created": "2026-03-03T23:19:45.721128+00:00",
    "tags": ["music2grid", "generated"]
  },
  "canvas": {
    "width": 40,
    "height": 24,
    "charset": "█▓▒░·+=-. ",
    "defaultColor": "#ffff00",
    "background": "#050a05"
  },
  "project": {
    "bpm": 120,
    "scale": "chromatic",
    "key": "C"
  },
  "frames": [{
    "id": "frame_001",
    "cells": [...]
  }]
}
```

## Limitations

### Audio Transcription
- **Supported**: Works out of the box with Python 3.9+ environments.
- **Windows**: Requires specific dependency overrides (handled automatically in `pyproject.toml`) for `tensorflow-io-gcs-filesystem`.

### File Formats
- **Supported**: `.mid`, `.midi`, `.mp3`, `.wav`, `.flac`, `.ogg`
- **Planned**: MusicXML (`.xml`, `.musicxml`)

## Development

### Code Quality
- Addressed all SonarCloud complexity issues
- Modular architecture with focused helper functions
- Full type hints and documentation

### Architecture
```
Input Parser → Note Stream → Grid Mapper → GRID JSON
```

## Import into GRID Studio

1. Generate `.grid` file with music2grid
2. Open GRID Studio
3. `Import → select .grid file`
4. The grid appears with all notes positioned correctly

## License

Personal use permitted. Converting copyrighted audio to grid format for personal use generally falls under format shifting fair use, provided you own the source material.

## Contributing

Contributions welcome! Areas for improvement:
- MusicXML support
- Additional audio transcription backends
- Advanced grid visualization options


uv run python music2grid.py tacos.mp3 -o track.grid --bpm 120
