#!/usr/bin/env python3
from __future__ import annotations
"""
music2grid.py — Convert MIDI, Audio, or Text descriptions to .grid JSON format.

Usage:
    python music2grid.py "C4:1 E4:1 G4:1" -o chord.grid
    python music2grid.py song.mid -o song.grid --bpm 120 --resolution 2
    python music2grid.py recording.mp3 -o track.grid

Requirements:
    uv pip install mido numpy          # always
    uv pip install basic-pitch         # optional, audio only (needs Python 3.9)
"""

# Fix for librosa pkg_resources compatibility in Python 3.9
import importlib.resources
import sys
import types

try:
    import pkg_resources  # type: ignore[import-untyped]
except ImportError:
    # Create a minimal pkg_resources replacement for librosa compatibility
    class _DummyPkgResources:
        def resource_filename(self, package_or_requirement: object, *args: object, **kwargs: object) -> object:
            return importlib.resources.files(str(package_or_requirement)).joinpath(*[str(a) for a in args])

        def resource_stream(self, package_or_requirement: object, *args: object, **kwargs: object) -> object:
            return importlib.resources.files(str(package_or_requirement)).joinpath(*[str(a) for a in args]).open("rb")

        def resource_string(self, package_or_requirement: object, *args: object, **kwargs: object) -> object:
            return importlib.resources.files(str(package_or_requirement)).joinpath(*[str(a) for a in args]).read_text()

        def resource_exists(self, package_or_requirement: object, *args: object, **kwargs: object) -> bool:
            return importlib.resources.files(str(package_or_requirement)).joinpath(*[str(a) for a in args]).is_file()

        def resource_listdir(self, package_or_requirement: object, *args: object, **kwargs: object) -> list[str]:
            return [
                p.name
                for p in importlib.resources.files(str(package_or_requirement))
                .joinpath(*[str(a) for a in args])
                .iterdir()
            ]

        def entry_points(self) -> list[object]:
            return []

        def get_distribution(self, *args: object, **kwargs: object) -> None:
            return None

        def require(self, *args: object, **kwargs: object) -> list[object]:
            return []

    _pkg_resources_module = types.ModuleType("pkg_resources")
    _dummy = _DummyPkgResources()
    for _attr in dir(_dummy):
        if not _attr.startswith("__"):
            setattr(_pkg_resources_module, _attr, getattr(_dummy, _attr))
    sys.modules["pkg_resources"] = _pkg_resources_module

# Patch librosa.util.files to use importlib.resources instead of pkg_resources
try:
    import librosa.util.files  # type: ignore[import-untyped]

    if hasattr(librosa.util.files, "pkg_resources"):
        librosa.util.files.pkg_resources = sys.modules["pkg_resources"]
except (ImportError, AttributeError):
    pass

import json
import argparse
import os
import math
import hashlib
from datetime import datetime, timezone
from collections import namedtuple
from typing import Any

# ── Configuration ─────────────────────────────────────────────────────────────

DEFAULT_CONFIG: dict[str, Any] = {
    "height": 24,
    "base_pitch": 60,       # MIDI 60 = C4
    "base_y": 19,           # Y row for C4 (matches Bach example)
    "default_color": "#ffff00",
    "default_char": "█",
    "background": "#050a05",
    "charset": "█▓▒░·+=-. ",
}

Note = namedtuple("Note", ["pitch", "velocity", "start_time", "duration"])

PITCH_MAP: dict[str, int] = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}

# ── Note → Grid Cell ──────────────────────────────────────────────────────────

def _density_to_char(density: float, charset: str) -> str:
    chars = charset.replace(" ", "")
    idx = int((1.0 - density) * (len(chars) - 1))
    return chars[min(idx, len(chars) - 1)]


def note_to_cell(note: Any, config: dict[str, Any], resolution: int) -> dict[str, Any]:
    """Maps a Note to a GRID cell dict."""
    x = int(round(note.start_time * resolution))
    pitch_diff = note.pitch - config["base_pitch"]
    y = max(0, min(config["height"] - 1, config["base_y"] - pitch_diff))
    _raw_density: float = max(0.1, min(1.0, note.velocity / 127.0))
    density = round(_raw_density, 2)  # type: ignore[no-matching-overload]  # Pyre2 bug: rejects round(float, int)
    grid_duration = max(1, int(round(note.duration * resolution)))

    return {
        "x": x,
        "y": y,
        "char": _density_to_char(density, config["charset"]),
        "color": config["default_color"],
        "density": density,
        "semantic": "solid" if density > 0.5 else "fluid",
        "channel": {
            "audio": {
                "note": note.pitch,
                "velocity": note.velocity,
                "duration": grid_duration,
                "time": note.start_time,
            },
            "spatial": {
                "height": density,
                "material": "emissive" if density > 0.8 else "solid",
            },
        },
    }

# ── Text Parser ───────────────────────────────────────────────────────────────

def parse_note_name(s: str) -> int:
    """Parse 'C4', 'F#3', 'Bb5' → MIDI pitch integer."""
    s_str: str = s.strip()
    if not s_str:
        return 60
    base = PITCH_MAP.get(s_str[0].upper(), 0)
    rest: str = s_str[1:]  # type: ignore[no-matching-overload]  # Pyre2 bug: rejects str slice
    modifier = 0
    if rest and rest[0] == "#":
        modifier, rest = 1, rest[1:]
    elif rest and rest[0] in ("b", "B") and len(rest) > 1:
        modifier, rest = -1, rest[1:]
    octave = int(rest) if rest.isdigit() else 4
    return 12 * (octave + 1) + base + modifier


def _parse_chord_token(token: str, time_cursor: float) -> tuple[list[Any], float]:
    """Parse '[C4 E4 G4]:2' → list of Notes at time_cursor."""
    content: str = token[1:]  # type: ignore[no-matching-overload]  # Pyre2 bug: rejects str slice
    duration = 1.0

    if content.endswith("]"):
        content = content[:-1]
    if ":" in content:
        parts = content.rsplit(":", 1)
        content, duration = parts[0], float(parts[1])

    note_names = [n for n in content.split() if n]
    return [Note(parse_note_name(n), 80, time_cursor, duration) for n in note_names], duration


def _parse_sequential_token(token: str, time_cursor: float) -> tuple[Any, float]:
    """Parse 'C4:1' or 'C4' → single Note at time_cursor."""
    parts = token.split(":")
    duration = float(parts[1]) if len(parts) > 1 else 1.0
    pitch = parse_note_name(parts[0])
    return Note(pitch=pitch, velocity=80, start_time=time_cursor, duration=duration), duration


def parse_text_input(text_str: str) -> list[Any]:
    """
    Parse text note descriptions into a list of Notes.
    Formats:
      Sequential:  "C4:1 E4:1 G4:1"    (note:duration_in_beats)
      Simple list: "C4 E4 G4"           (quarter notes assumed)
      Chord:       "[C4 E4 G4]:2"       (all notes at same time)
    """
    notes: list[Any] = []
    time_cursor = 0.0

    for token in text_str.strip().split():
        if token.startswith("["):
            chord_notes, duration = _parse_chord_token(token, time_cursor)
            notes.extend(chord_notes)
            time_cursor += duration
        else:
            try:
                note, duration = _parse_sequential_token(token, time_cursor)
                notes.append(note)
                time_cursor += duration
            except (ValueError, KeyError):
                print(f"  Warning: skipping unrecognized token '{token}'")

    return notes

# ── MIDI Parser ───────────────────────────────────────────────────────────────

def _close_orphaned_notes(active: dict[Any, Any], notes: list[Any]) -> None:
    """Append notes for any MIDI note_on events with no matching note_off."""
    for (_, _, pitch), (start_tick, velocity, ticks_per_beat) in active.items():
        notes.append(Note(
            pitch=pitch,
            velocity=velocity,
            start_time=start_tick / ticks_per_beat,
            duration=0.25,
        ))


def _process_track(
    track: Any,
    track_idx: int,
    ticks_per_beat: int,
    active: dict[Any, Any],
    notes: list[Any],
) -> None:
    """Walk one MIDI track, updating active and notes in place."""
    abs_tick = 0
    for msg in track:
        abs_tick += msg.time
        key = (track_idx, msg.channel, msg.note) if hasattr(msg, "note") else None

        if msg.type == "note_on" and msg.velocity > 0:
            active[key] = (abs_tick, msg.velocity, ticks_per_beat)

        elif key and (msg.type == "note_off" or (msg.type == "note_on" and msg.velocity == 0)):
            if key in active:
                start_tick, velocity, tpb = active.pop(key)
                dur = max(0.25, (abs_tick - start_tick) / tpb)
                notes.append(Note(
                    pitch=msg.note,
                    velocity=velocity,
                    start_time=start_tick / tpb,
                    duration=dur,
                ))


def parse_midi_file(filepath: str) -> list[Any]:
    """Parse MIDI file → list of Notes (times in beats)."""
    try:
        import mido  # type: ignore[import-untyped]
    except ImportError:
        print("Error: 'mido' not installed. Run: uv pip install mido")
        sys.exit(1)

    mid = mido.MidiFile(filepath)
    notes: list[Any] = []
    active: dict[Any, Any] = {}

    for track_idx, track in enumerate(mid.tracks):
        _process_track(track, track_idx, mid.ticks_per_beat, active, notes)

    _close_orphaned_notes(active, notes)
    notes.sort(key=lambda n: n.start_time)
    print(f"  MIDI parsed: {len(notes)} notes across {len(mid.tracks)} tracks")
    return notes

# ── Audio Parser ──────────────────────────────────────────────────────────────

def _find_transcribed_midi(output_dir: str, base_name: str) -> str | None:
    """Locate the MIDI file basic-pitch created."""
    candidate = os.path.join(output_dir, f"{base_name}_basic_pitch.mid")
    if os.path.exists(candidate):
        return candidate
    for f in os.listdir(output_dir):
        if f.endswith(".mid"):
            return os.path.join(output_dir, f)
    return None


def parse_audio_file(filepath: str) -> list[Any]:
    """Transcribe audio → Notes via basic-pitch (requires Python 3.9 + TF)."""
    print(f"Debug: Python version = {sys.version}")
    print(f"Debug: Python executable = {sys.executable}")
    try:
        from basic_pitch.inference import predict_and_save  # type: ignore[import-untyped]
        from basic_pitch import ICASSP_2022_MODEL_PATH  # type: ignore[import-untyped]
        print("Debug: basic-pitch imports successful")
    except ImportError as e:
        print(f"Debug: ImportError: {e}")
        print("Error: 'basic-pitch' not installed.")
        print("  Run: uv pip install basic-pitch  (requires Python 3.9)")
        sys.exit(1)

    print(f"  Transcribing {filepath} (this may take 30–60 s)...")
    output_dir = "./music2grid_tmp"
    os.makedirs(output_dir, exist_ok=True)

    predict_and_save(
        audio_path_list=[filepath],
        output_directory=output_dir,
        save_midi=True,
        sonify_midi=False,
        save_model_outputs=False,
        save_notes=False,
        model_or_model_path=ICASSP_2022_MODEL_PATH,
    )

    base = os.path.splitext(os.path.basename(filepath))[0]
    midi_path = _find_transcribed_midi(output_dir, base)
    if not midi_path:
        print("Error: Transcription produced no MIDI file.")
        sys.exit(1)
    assert midi_path is not None  # narrow str | None → str for Pyre2

    notes = parse_midi_file(midi_path)

    try:
        os.remove(midi_path)  # midi_path is guaranteed non-None here
        os.rmdir(output_dir)
    except OSError:
        pass

    return notes

# ── Grid Assembly ─────────────────────────────────────────────────────────────

def _dedup_cells(cells: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Keep highest-density cell per (x, y) position."""
    best: dict[tuple[int, int], dict[str, Any]] = {}
    for cell in cells:
        key = (cell["x"], cell["y"])
        if key not in best or cell["density"] > best[key]["density"]:
            best[key] = cell
    return list(best.values())


def _build_cells(
    notes: list[Any],
    width: int,
    config: dict[str, Any],
    resolution: int,
) -> list[dict[str, Any]]:
    """Convert Notes to grid cells, filtering out-of-bounds."""
    cells: list[dict[str, Any]] = []
    for n in notes:
        cell = note_to_cell(n, config, resolution)
        if 0 <= cell["x"] < width:
            cells.append(cell)
    return cells


def build_grid_json(notes: list[Any], args: argparse.Namespace, config: dict[str, Any]) -> dict[str, Any]:
    """Assemble GRID-compatible JSON from a list of Notes."""
    if not notes:
        print("Warning: no notes to write.")

    max_time = max((n.start_time + n.duration for n in notes), default=4.0)
    width = max(40, int(math.ceil(max_time * args.resolution)) + 4)

    cells = _build_cells(notes, width, config, args.resolution)
    if not args.no_dedup:
        cells = _dedup_cells(cells)

    _hexdigest: str = hashlib.md5(args.input.encode()).hexdigest()
    input_id: str = _hexdigest[:8]  # type: ignore[no-matching-overload]  # Pyre2 bug: rejects str slice
    now = datetime.now(timezone.utc).isoformat()
    _input_str: str = args.input
    display_name = os.path.basename(_input_str) if os.path.exists(_input_str) else _input_str[:40]

    return {
        "grid": "grid",
        "version": "0.1.0",
        "meta": {
            "id": f"music2grid-{input_id}",
            "name": display_name,
            "author": "music2grid",
            "created": now,
            "modified": now,
            "tags": ["music2grid", "generated"],
            "notes": (
                f"Generated by music2grid. {len(notes)} notes, "
                f"resolution {args.resolution} col/beat, BPM {args.bpm}."
            ),
        },
        "canvas": {
            "width": width,
            "height": config["height"],
            "charset": config["charset"],
            "defaultChar": " ",
            "defaultColor": config["default_color"],
            "background": config["background"],
        },
        "project": {
            "bpm": args.bpm,
            "scale": "chromatic",
            "key": "C",
            "palette": {},
        },
        "frames": [{
            "id": "frame_001",
            "index": 0,
            "label": display_name,
            "cells": cells,
        }],
    }

# ── Input Dispatch ────────────────────────────────────────────────────────────

AUDIO_EXTENSIONS: frozenset[str] = frozenset({".mp3", ".wav", ".flac", ".ogg"})
MIDI_EXTENSIONS: frozenset[str] = frozenset({".mid", ".midi"})


def parse_input(args: argparse.Namespace) -> list[Any]:
    """Route args.input to the appropriate parser, return list of Notes."""
    if not os.path.exists(args.input):
        print("  Mode: text")
        return parse_text_input(args.input)

    ext = os.path.splitext(args.input)[1].lower()
    if ext in MIDI_EXTENSIONS:
        print("  Mode: MIDI")
        return parse_midi_file(args.input)
    if ext in AUDIO_EXTENSIONS:
        print("  Mode: audio transcription (basic-pitch)")
        return parse_audio_file(args.input)

    print(f"  Error: unsupported file type '{ext}'")
    sys.exit(1)

# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Convert MIDI / Audio / Text to GRID Studio format (.grid JSON)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Examples:\n"
            '  python music2grid.py "C4:1 E4:1 G4:1" -o chord.grid\n'
            '  python music2grid.py "C4 D4 E4 F4 G4" -o scale.grid --bpm 120\n'
            "  python music2grid.py song.mid -o song.grid --resolution 2\n"
            "  python music2grid.py recording.mp3 -o track.grid --bpm 140\n"
        ),
    )
    parser.add_argument("input", help="MIDI file, audio file (.mp3/.wav), or text note string")
    parser.add_argument("-o", "--output", default="output.grid", help="Output .grid file path")
    parser.add_argument("--bpm", type=int, default=120, help="BPM for playback metadata (default 120)")
    parser.add_argument("--resolution", type=int, default=2,
                        help="Columns per beat: 1=quarter, 2=8th, 4=16th (default 2)")
    parser.add_argument("--height", type=int, default=24, help="Grid height in rows (default 24)")
    parser.add_argument("--color", default="#ffff00", help="Note color hex (default #ffff00)")
    parser.add_argument("--no-dedup", action="store_true",
                        help="Keep overlapping notes (default: highest velocity wins per cell)")
    args = parser.parse_args()

    config: dict[str, Any] = {
        **DEFAULT_CONFIG,
        "height": args.height,
        "default_color": args.color,
        "base_y": int(args.height * 0.75),
    }

    print(f"music2grid → {args.output}")
    notes = parse_input(args)
    print(f"  {len(notes)} notes parsed")

    grid_data: dict[str, Any] = build_grid_json(notes, args, config)
    frames: list[dict[str, Any]] = grid_data["frames"]
    cell_count: int = len(frames[0]["cells"])
    canvas: dict[str, Any] = grid_data["canvas"]
    w: int = canvas["width"]
    h: int = canvas["height"]

    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(grid_data, f, indent=2, ensure_ascii=False)

    print(f"  ✓ {args.output}  ({w}×{h}, {cell_count} cells)")
    print("  Import into GRID Studio: Import → select .grid file")


if __name__ == "__main__":
    main()