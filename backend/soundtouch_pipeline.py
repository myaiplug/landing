"""SoundTouch (soundstretch) external pipeline helper.

If user has `soundstretch` (part of SoundTouch) installed, we can perform
high quality tempo and pitch modifications, then optionally pass through
an FFmpeg sweetening chain.

Detected by searching PATH for 'soundstretch'.
"""
from __future__ import annotations
import shutil, subprocess, tempfile, os
from typing import Dict, Tuple

def soundstretch_available() -> bool:
    return bool(shutil.which('soundstretch'))

def build_command(infile: str, outfile: str, speed: float = 1.0, semitones: float = 0.0) -> Tuple[list[str], Dict]:
    """Return (cmd, meta). soundstretch uses -tempo (percent) and -pitch (semitones)."""
    # Tempo percent: (speed - 1)*100
    tempo_pct = (speed - 1.0) * 100.0
    pitch_st = semitones
    tmp_out = outfile  # soundstretch writes new file; ensure .wav extension suggested
    cmd = [
        'soundstretch', infile, tmp_out,
        f"-tempo={tempo_pct:.4f}", f"-pitch={pitch_st:.4f}", '-quick'
    ]
    meta = {
        'tempo_percent': tempo_pct,
        'pitch_semitones': pitch_st,
        'strategy': 'soundtouch'
    }
    return cmd, meta

__all__ = ['soundstretch_available','build_command']
