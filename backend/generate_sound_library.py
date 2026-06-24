"""Utility to (re)generate sound library group JSON files so filenames match disk.

Reads existing sounds/manifest.json for list of groups. For each group it scans
the folder, derives metadata, and writes groups_<tag>.json in sounds/.

Rules / Heuristics:
 - Accept extensions: .wav .mp3 .aiff .aif .flac (case-insensitive)
 - Skip hidden files, directories, and anything starting with '.' or containing 'DS_Store'.
 - ID: base filename without extension, non-alnum replaced with '_'.
 - Name: humanized from filename (remove extension, replace _ and - with space, collapse spaces, title case).
 - Type: 'loop' if folder tag contains 'loop' or 'loops' OR filename contains 'loop'; else 'one_shot'.
 - Duration seconds (len): Attempt via soundfile (sf.info). If that fails, try librosa.get_duration. If all fail, None omitted.
 - Tags: include the primary group tag plus simple descriptors discovered in filename (e.g. 'distorted','snap','rim','open','closed','riser','fill').

Invocation:
    python backend/generate_sound_library.py

Outputs:
    sounds/groups_<tag>.json for every group defined in manifest categories that has a path inside sounds/.

This script is safe to run repeatedly; it overwrites existing group JSON files.
"""

from __future__ import annotations
import json
import re
from pathlib import Path
import argparse
import hashlib
from typing import List, Dict, Any

SOUNDS_ROOT = Path(__file__).resolve().parent.parent / "sounds"
MANIFEST_PATH = SOUNDS_ROOT / "manifest.json"
OUTPUT_PREFIX = "groups_"  # groups_<tag>.json

VALID_EXTS = {".wav", ".mp3", ".aiff", ".aif", ".flac"}

DESCRIPTOR_KEYWORDS = [
    "distorted", "distort", "snap", "rim", "open", "closed", "riser", "fill", "boom", "deep", "punchy", "ch", "oh"
]

def humanize(name: str) -> str:
    name = re.sub(r"[._-]+", " ", name)
    name = re.sub(r"\s+", " ", name).strip()
    # collapse parentheses copy markers
    return name.title()

def make_id(stem: str) -> str:
    return re.sub(r"[^A-Za-z0-9]+", "_", stem).strip("_").lower()

def detect_type(group_tag: str, filename_stem: str) -> str:
    lowered = f"{group_tag} {filename_stem}".lower()
    if "loop" in lowered:
        return "loop"
    return "one_shot"

def extract_descriptors(stem: str) -> List[str]:
    s = stem.lower()
    found = []
    for kw in DESCRIPTOR_KEYWORDS:
        if kw in s:
            # normalize hi-hat open/closed abbreviations
            if kw == "ch":
                found.append("closed")
            elif kw == "oh":
                found.append("open")
            else:
                found.append(kw)
    # dedupe
    return list(dict.fromkeys(found))

def get_duration_seconds(path: Path) -> float | None:
    try:
        import soundfile as sf  # type: ignore
        try:
            info = sf.info(str(path))
            if info.samplerate and info.frames:
                return round(info.frames / float(info.samplerate), 4)
        except Exception:
            pass
    except Exception:
        pass
    try:
        import librosa  # type: ignore
        try:
            dur = librosa.get_duration(path=str(path))
            return float(round(dur, 4))
        except Exception:
            return None
    except Exception:
        return None
    return None

def analyze_bpm_key(path: Path) -> Dict[str, Any]:
    """Attempt to analyze BPM and key for loopable content.
    Returns dict with optional 'bpm' (float) and 'key' (string)."""
    result: Dict[str, Any] = {}
    try:
        import librosa  # type: ignore
        import numpy as np  # type: ignore
        y, sr = librosa.load(str(path), mono=True)
        if y.size == 0:
            return result
        # BPM
        try:
            tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
            if tempo:
                result['bpm'] = float(round(tempo, 2))
        except Exception:
            pass
        # Key estimation (basic): use chroma + argmax mapping
        try:
            chroma = librosa.feature.chroma_stft(y=y, sr=sr)
            chroma_mean = chroma.mean(axis=1)
            pitch_class = int(chroma_mean.argmax())
            PITCHES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
            key_guess = PITCHES[pitch_class]
            result['key'] = key_guess
        except Exception:
            pass
    except Exception:
        return result
    return result

def file_hash(path: Path) -> str:
    h = hashlib.sha1()
    try:
        with open(path, 'rb') as f:
            while True:
                chunk = f.read(8192)
                if not chunk:
                    break
                h.update(chunk)
    except Exception:
        return ''
    return h.hexdigest()

def build_items(group_path: Path, primary_tag: str, analyze_loops: bool=False) -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []
    if not group_path.exists() or not group_path.is_dir():
        return items
    for p in sorted(group_path.rglob('*')):
        if p.is_dir():
            continue
        if p.name.startswith('.') or 'DS_Store' in p.name:
            continue
        if p.suffix.lower() not in VALID_EXTS:
            continue
        rel = p.relative_to(SOUNDS_ROOT).as_posix()
        stem = p.stem
        item_id = make_id(stem)
        name = humanize(stem)
        item_type = detect_type(primary_tag, stem)
        descriptors = extract_descriptors(stem)
        tags = [primary_tag] + descriptors
        # dedupe tags preserving order
        tags = list(dict.fromkeys(tags))
        dur = get_duration_seconds(p)
        entry: Dict[str, Any] = {
            "id": item_id,
            "name": name,
            "file": f"sounds/{rel}",
            "tags": tags,
            "type": item_type,
        }
        if dur is not None:
            # Provide short/long distinction maybe future; for now always store len
            entry["len"] = dur
        if analyze_loops and item_type == 'loop':
            analysis = analyze_bpm_key(p)
            entry.update(analysis)
        items.append(entry)
    return items

def load_manifest() -> Dict[str, Any]:
    with open(MANIFEST_PATH, 'r', encoding='utf-8') as f:
        return json.load(f)

def main() -> None:
    parser = argparse.ArgumentParser(description='Generate sound library group JSON files.')
    parser.add_argument('--only-changed', action='store_true', help='Only rewrite group JSON if content differs.')
    parser.add_argument('--analyze-loops', action='store_true', help='Analyze BPM and key for loops.')
    args = parser.parse_args()

    manifest = load_manifest()
    categories = manifest.get('categories', {})
    generated = 0
    skipped = 0
    for cat_key, cat_val in categories.items():
        groups = cat_val.get('groups', []) or []
        for g in groups:
            tag = g.get('tag') or g.get('name')
            path = g.get('path')
            if not tag or not path:
                continue
            group_path = SOUNDS_ROOT / Path(path).name
            items = build_items(group_path, tag, analyze_loops=args.analyze_loops)
            out_obj = {"group": g.get('name', tag), "items": items}
            out_path = SOUNDS_ROOT / f"{OUTPUT_PREFIX}{tag}.json"
            new_json = json.dumps(out_obj, indent=2)
            if args.only_changed and out_path.exists():
                try:
                    old = out_path.read_text(encoding='utf-8')
                    if old == new_json:
                        print(f"Unchanged: {out_path.name} (skipped)")
                        skipped += 1
                        continue
                except Exception:
                    pass
            with open(out_path, 'w', encoding='utf-8') as f:
                f.write(new_json)
            print(f"Wrote {out_path.name} with {len(items)} items.")
            generated += 1
    print(f"Done. Generated {generated} files, skipped {skipped} unchanged.")

if __name__ == '__main__':
    main()
