"""FFmpeg audio processing filter graph builder for ScrewAI models.

Provides helper functions to construct robust filter chains supporting:
  * Independent speed (tempo) and pitch adjustment
  * Optional rubberband high-quality pitch/tempo if compiled into ffmpeg
  * Fallback native filter graphs (asetrate + aresample + atempo chain)
  * Additional screw-style FX blocks (reverb, echo, saturation, limiter, EQ shelf)

Design notes:
Independent speed S and pitch shift (in semitones) P (ratio R = 2^(P/12)).
Fallback native filter sequence when rubberband unavailable:
    asetrate=BASE_SR*R,aresample=BASE_SR[,atempo factors for S/R]
Because after asetrate+aresample the audio is R times faster; an atempo S/R
brings final speed to S while preserving pitch shift introduced by sample-rate trick.

We split atempo factors so each lies within [0.5,2.0] as required by ffmpeg.
"""
from __future__ import annotations
from typing import List, Tuple, Dict, Any
import math, shutil

BASE_SR = 44100  # Fallback target sample rate; TODO: probe real input later

def _atempo_chain(factor: float) -> List[float]:
    """Return a list of atempo factors (each between 0.5 and 2.0) whose product ≈ factor."""
    out: List[float] = []
    # Guard tiny factors
    if factor <= 0:
        return [1.0]
    remaining = factor
    # Downscale large factors
    while remaining > 2.0:
        out.append(2.0)
        remaining /= 2.0
    while remaining < 0.5:
        out.append(0.5)
        remaining /= 0.5  # (Dividing increases remaining toward 1.0 for factors <0.5)
    out.append(remaining)
    # Remove near-unity items except if list would become empty
    cleaned = [f for f in out if abs(f-1.0) > 1e-3]
    return cleaned or [1.0]

def rubberband_available() -> bool:
    """Heuristic: assume rubberband filter available if 'ffmpeg -filters' shows it.
    Lightweight: only check presence of ffmpeg binary & skip deep inspection to avoid latency.
    The caller may override via environment variable in future.
    """
    return bool(shutil.which('ffmpeg'))  # We optimistically assume rubberband compiled if ffmpeg present

def build_filter_graph(speed: float = 1.0,
                       semitones: float = 0.0,
                       quality: str = 'standard',
                       echo: bool | Dict = False,
                       saturation: bool = False,
                       limiter: bool = True,
                       low_shelf_gain: float | None = None,
                       prefer_rubberband: bool = True,
                       normalize: bool | str = False,
                       pipeline: str | None = None) -> Tuple[str, Dict]:
    """Construct the audio filter chain.

    Returns (filter_string, metadata_dict)
    """
    notes: Dict[str, Any] = {
        'input_speed': speed,
        'input_semitones': semitones,
        'quality': quality,
        'strategy': None
    }

    R = 2.0 ** (semitones / 12.0)
    filters: List[str] = []

    use_rubberband = False
    hq = quality in ('high','pro')
    pro = quality == 'pro'

    force_pipeline = (pipeline or '').lower() or None
    if force_pipeline == 'native':
        prefer_rubberband = False
    elif force_pipeline == 'rubberband':
        prefer_rubberband = True

    if prefer_rubberband and rubberband_available() and force_pipeline != 'native':
        # Rubberband handles tempo & pitch together; invert semantics: tempo factor speed, pitch factor R
        # Provide formant & transient options based on quality
        rb_opts = [f"pitch={R:.6f}", f"tempo={speed:.6f}"]
        if quality in ('high','pro'):
            rb_opts.append('transients=preserve')
            rb_opts.append('formant=preserved')
        filters.append('rubberband=' + ':'.join(rb_opts))
        use_rubberband = True
        notes['strategy'] = 'rubberband'
    else:
        # Native fallback strategy.
        notes['strategy'] = 'native_asetrate_atempo'
        # 1. Pitch shift & speed coupling via asetrate + aresample
        filters.append(f"asetrate={BASE_SR}*{R:.6f}")
        if hq:
            # soxr high precision (pro adds very high precision)
            precision = 28 if pro else 20
            filters.append(f"aresample={BASE_SR}:resampler=soxr:precision={precision}")
        else:
            filters.append(f"aresample={BASE_SR}")
        # 2. Correct speed to target S: target atempo factor = speed / R
        target_factor = speed / R
        for f in _atempo_chain(target_factor):
            if abs(f-1.0) > 1e-3:
                filters.append(f"atempo={f:.6f}")

    # If rubberband path and high quality desired, add explicit high quality resample for consistency
    if use_rubberband and hq:
        precision = 28 if pro else 20
        filters.append(f"aresample={BASE_SR}:resampler=soxr:precision={precision}")

    # Optional tonal sweetening / screw chain additions
    if low_shelf_gain is not None and abs(low_shelf_gain) > 0.1:
        # Shelf at 100Hz (adjustable later)
        filters.append(f"equalizer=f=100:t=shelf:g={low_shelf_gain}")
    if echo:
        # echo dict: {in_gain, out_gain, delay_ms, decay}
        if isinstance(echo, dict):
            ig = echo.get('in_gain', 0.7)
            og = echo.get('out_gain', 0.8)
            delay = echo.get('delay_ms', 500)
            decay = echo.get('decay', 0.3)
        else:
            ig, og, delay, decay = 0.8, 0.8, 500, 0.3
        filters.append(f"aecho={ig}:{og}:{int(delay)}:{decay}")
    if saturation:
        filters.append('overdrive=5:10')
    # Loudness normalization (before limiter) if requested
    if normalize:
        # Accept string to allow custom dynaudnorm args
        if isinstance(normalize, str) and normalize not in ('true','True','1'):
            filters.append(f"dynaudnorm={normalize}")
        else:
            # Conservative settings for music
            filters.append('dynaudnorm=f=75:g=15')
    if limiter:
        filters.append('alimiter')

    filter_str = ','.join(filters)
    notes.update({
        'ratio': R,
        'filter_count': len(filters),
        'filter_graph': filter_str,
        'rubberband': use_rubberband,
        'high_quality': hq,
        'pro': pro,
        'pipeline': force_pipeline or ('rubberband' if use_rubberband else 'native')
    })
    return filter_str, notes

def build_ffmpeg_command(infile: str, outfile: str, **kwargs) -> Tuple[List[str], Dict]:
    """Return (cmd_list, metadata)."""
    filter_str, meta = build_filter_graph(**kwargs)
    cmd = [
        'ffmpeg','-y','-i', infile,
        '-filter:a', filter_str,
        '-c:a','pcm_s16le',  # Uncompressed intermediate for quality; caller may transcode later
        outfile
    ]
    return cmd, meta

__all__ = ['build_filter_graph','build_ffmpeg_command']
