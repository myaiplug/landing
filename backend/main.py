import os, time, json, uuid, threading, shutil, subprocess, base64, hmac, hashlib
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, HTTPException, Header, Request, UploadFile, File, Form
from fastapi.responses import FileResponse, JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import httpx
import random
from pathlib import Path
from collections import defaultdict, deque
import threading
import librosa, numpy as np, math, zipfile, io, importlib
# Optional soundfile import (silences static issues by avoiding direct unresolved import)
try:  # pragma: no cover - optional dependency
    sf = importlib.import_module('soundfile')  # type: ignore
except Exception:  # pragma: no cover
    sf = None  # type: ignore
from pydub import AudioSegment

# New Phase-2 auth module (RS256 JWTs + refresh tokens)
try:
    from . import auth as auth_mod
except Exception:
    # fallback import style when running as script
    import auth as auth_mod

# Load registry (robust with fallback)
REGISTRY_PATH = os.environ.get("MODEL_REGISTRY", "models.json")
MODELS: Dict[str, Dict[str, Any]] = {}
MODEL_REGISTRY_META: Dict[str, Any] = {
    'path': None,
    'last_loaded': None,
    'models': 0,
    'errors': [],
    'warnings': [],
    'version_hash': None,
    'last_diff': None
}
REQUIRED_MODEL_FIELDS = ['id','name','category','provider']

def _validate_models(raw: list[dict]) -> tuple[Dict[str, Dict[str, Any]], list[str], list[str]]:
    out: Dict[str, Dict[str, Any]] = {}
    errors: list[str] = []
    warnings: list[str] = []
    seen_ids: set[str] = set()
    for idx, m in enumerate(raw):
        if not isinstance(m, dict):
            errors.append(f"Entry {idx} not object; skipped")
            continue
        missing = [f for f in REQUIRED_MODEL_FIELDS if not m.get(f)]
        if missing:
            errors.append(f"Model entry {idx} missing fields: {','.join(missing)}")
            continue
        mid = str(m['id'])
        if mid in seen_ids:
            warnings.append(f"Duplicate model id '{mid}' encountered; last wins")
        seen_ids.add(mid)
        # Normalize some optional numeric fields
        if 'price_usd' in m:
            try:
                m['price_usd'] = float(m['price_usd'])
            except Exception:
                warnings.append(f"Model {mid} price_usd not numeric; set to 0")
                m['price_usd'] = 0.0
        out[mid] = m
    return out, errors, warnings

def _load_model_registry():
    global MODELS, MODEL_REGISTRY_META
    prev_models = MODELS.copy()
    candidates = []
    # 1. Explicit path / env override
    candidates.append(Path(REGISTRY_PATH))
    # 2. backend/ relative if not already there
    if not REGISTRY_PATH.lower().startswith('backend/'):
        candidates.append(Path('backend')/REGISTRY_PATH)
    # 3. Known default in backend/ if plain name
    candidates.append(Path('backend')/'models.json')
    for p in candidates:
        try:
            if p.exists():
                with p.open('r', encoding='utf-8') as f:
                    data = json.load(f)
                if not isinstance(data, list):
                    raise ValueError('Registry root should be a JSON array')
                models, errs, warns = _validate_models(data)
                MODELS = models
                # Compute diff vs previous
                added = [m for m in MODELS.keys() if m not in prev_models]
                removed = [m for m in prev_models.keys() if m not in MODELS]
                changed = []
                for mid in MODELS:
                    if mid in prev_models and json.dumps(prev_models[mid], sort_keys=True) != json.dumps(MODELS[mid], sort_keys=True):
                        changed.append(mid)
                # Version hash (stable by sorted json)
                try:
                    version_hash = hashlib.sha256(json.dumps({k: MODELS[k] for k in sorted(MODELS.keys())}, sort_keys=True).encode('utf-8')).hexdigest()[:16]
                except Exception:
                    version_hash = None
                MODEL_REGISTRY_META.update({
                    'path': str(p),
                    'last_loaded': time.time(),
                    'models': len(MODELS),
                    'errors': errs,
                    'warnings': warns,
                    'version_hash': version_hash,
                    'last_diff': {
                        'added': added,
                        'removed': removed,
                        'changed': changed,
                        'timestamp': time.time()
                    }
                })
                print(f"Loaded model registry from {p} ({len(MODELS)} models, +{len(added)} /-{len(removed)} ~{len(changed)}; {len(errs)} errors, {len(warns)} warnings)")
                return
        except Exception as e:
            print('Model registry load attempt failed for', p, e)
    # Fallback minimal stub so server still boots
    MODELS = {
        'retune432': {
            'id':'retune432','name':'ReTune 432Hz (Fallback)','category':'audio','provider':'internal','pricing_unit':'minute_audio','price_usd':0.0,'description':'Fallback stub model (registry file missing).'
        }
    }
    MODEL_REGISTRY_META.update({
        'path': None,
        'last_loaded': time.time(),
        'models': len(MODELS),
        'errors': ['models.json not found'],
        'warnings': [],
        'version_hash': None,
        'last_diff': None
    })
    print('WARNING: models.json not found; using fallback stub model set')

_load_model_registry()

# === Registry Hot Reload Watcher ===
_REGISTRY_WATCH_STOP = False
_REGISTRY_MTIME = None
def _registry_watch_loop(interval: float = 3.0):
    """Lightweight polling of the registry file mtime to auto-reload on change."""
    global _REGISTRY_MTIME
    last_reload_time = 0.0
    while not _REGISTRY_WATCH_STOP:
        try:
            reg_path = MODEL_REGISTRY_META.get('path')
            if reg_path:
                p = Path(reg_path)
                if p.exists():
                    mt = p.stat().st_mtime
                    if _REGISTRY_MTIME is None:
                        _REGISTRY_MTIME = mt
                    elif mt != _REGISTRY_MTIME:
                        # Debounce: require at least 1.5 * interval between reloads
                        now = time.time()
                        if now - last_reload_time >= interval * 1.5:
                            _REGISTRY_MTIME = mt
                            last_reload_time = now
                            print('[registry] Detected change; reloading models.json')
                            _load_model_registry()
                        else:
                            # Skip noisy rapid change
                            pass
        except Exception as e:
            print('[registry] watch error', e)
        time.sleep(interval)

threading.Thread(target=_registry_watch_loop, daemon=True).start()

# Simple key store (replace with DB in prod)
API_KEYS = {os.environ.get('DEMO_API_KEY', 'demo-key-123'): {"user_id": "user_demo", "quota": 1000000}}
USAGE: List[Dict[str, Any]] = []

class InvokeRequest(BaseModel):
    prompt: Optional[str] = None
    messages: Optional[List[Dict[str, str]]] = None
    max_tokens: Optional[int] = 256
    temperature: Optional[float] = 0.7
    # For internal audio/image tools we may accept simple params
    mode: Optional[str] = None
    intensity: Optional[float] = 0.5
    url: Optional[str] = None

app = FastAPI(title="MyAiPlug Unified API", version="0.1")
PROCESSED_DIR = Path(os.environ.get('PROCESSED_DIR', 'processed'))
PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
CLI_DIR = Path(os.environ.get('CLI_DIR','cli'))
CLI_DIR.mkdir(parents=True, exist_ok=True)
USER_UPLOADS_DIR = Path(os.environ.get('USER_UPLOADS_DIR','user_uploads'))
USER_UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
SONGS_DIR = Path(os.environ.get('SONGS_DIR','songs'))
SONGS_DIR.mkdir(parents=True, exist_ok=True)
BEATS_DIR = Path(os.environ.get('BEATS_DIR','beats'))
BEATS_DIR.mkdir(parents=True, exist_ok=True)

# === Simple Auth / User Management ===
USERS_PATH = Path(os.environ.get('USERS_PATH','users.jsonl'))
_USERS: dict[str, dict[str, Any]] = {}
_USERS_BY_ID: dict[str, dict[str, Any]] = {}
# --- Authentication secret (HMAC) ---
# Read raw env var and refuse to start if not set or left at the insecure dev default
AUTH_SECRET_RAW = os.environ.get('AUTH_SECRET')
DEFAULT_DEV_SECRET = 'dev-secret-key-change'
if not AUTH_SECRET_RAW or AUTH_SECRET_RAW == DEFAULT_DEV_SECRET:
    # Fail fast to avoid accidental deployment with a weak secret
    print('\nFATAL: AUTH_SECRET is not set or is the default development secret.')
    print('Please set a strong secret in the environment before starting the backend.')
    print('Example (PowerShell): $env:AUTH_SECRET = "$(New-Guid)$(Get-Random)"')
    print('Also see backend/SECURITY_AND_DEPLOYMENT_RUNBOOK.md for recovery and deployment instructions.\n')
    import sys
    sys.exit(1)
AUTH_SECRET = AUTH_SECRET_RAW.encode('utf-8')

def _load_users():
    if not USERS_PATH.exists():
        return
    try:
        with USERS_PATH.open('r', encoding='utf-8') as f:
            for line in f:
                line=line.strip()
                if not line: continue
                try:
                    rec=json.loads(line)
                    uname = rec.get('username')
                    uid = rec.get('id') or uuid.uuid4().hex
                    rec['id']=uid
                    if uname:
                        _USERS[uname]=rec
                        _USERS_BY_ID[uid]=rec
                except Exception:
                    continue
    except Exception as e:
        print('User load error', e)

def _persist_user(rec: dict):
    try:
        with USERS_PATH.open('a', encoding='utf-8') as f:
            f.write(json.dumps(rec)+'\n')
    except Exception as e:
        print('Persist user failed', e)

def _hash_password(pw: str) -> str:
    salt = os.urandom(16)
    dk = hashlib.pbkdf2_hmac('sha256', pw.encode('utf-8'), salt, 100_000)
    return base64.b64encode(salt+dk).decode('utf-8')

def _verify_password(pw: str, stored: str) -> bool:
    try:
        raw = base64.b64decode(stored.encode('utf-8'))
        salt, dk = raw[:16], raw[16:]
        test = hashlib.pbkdf2_hmac('sha256', pw.encode('utf-8'), salt, 100_000)
        return hmac.compare_digest(test, dk)
    except Exception:
        return False

def _create_token(user_id: str, ttl_sec: int = 86400*7) -> str:
    exp = int(time.time()) + ttl_sec
    payload = f"{user_id}.{exp}"
    sig = hmac.new(AUTH_SECRET, payload.encode('utf-8'), hashlib.sha256).hexdigest()
    return base64.urlsafe_b64encode(f"{payload}.{sig}".encode('utf-8')).decode('utf-8')

def _decode_token(token: str) -> dict|None:
    # Try RS256 JWT (Phase-2) first via auth module
    try:
        try:
            dec = auth_mod.decode_access_token(token)
            if dec and 'sub' in dec:
                uid = dec.get('sub')
                rec = _USERS_BY_ID.get(uid)
                if not rec:
                    return None
                return {'user': rec, 'exp': dec.get('exp')}
        except Exception:
            # Not a JWT or invalid for RS256 path; fall back to legacy HMAC
            pass
        # Legacy HMAC token (base64.urlsafe encoded payload.sig)
        raw = base64.urlsafe_b64decode(token.encode('utf-8')).decode('utf-8')
        parts = raw.split('.')
        if len(parts) != 3:
            return None
        user_id, exp_s, sig = parts
        payload = f"{user_id}.{exp_s}"
        expected = hmac.new(AUTH_SECRET, payload.encode('utf-8'), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, expected):
            return None
        if int(exp_s) < int(time.time()):
            return None
        rec = _USERS_BY_ID.get(user_id)
        if not rec:
            return None
        return {'user': rec, 'exp': int(exp_s)}
    except Exception:
        return None


# --- Phase-2: New JWT based auth endpoints (RS256) ---
class LoginRequest(BaseModel):
    username: str
    password: str


@app.post('/v1/auth/login')
async def v1_auth_login(req: LoginRequest):
    # Authenticate user by username/password
    rec = _USERS.get(req.username)
    if not rec or not _verify_password(req.password, rec.get('password_hash','')):
        raise HTTPException(401, 'Invalid credentials')
    user_id = rec.get('id')
    access_token = auth_mod.create_access_token(user_id)
    refresh = auth_mod.create_refresh_token(user_id)
    return {'access_token': access_token, 'refresh_token_id': refresh['id'], 'refresh_token': refresh['token'], 'token_type': 'bearer'}


class RefreshRequest(BaseModel):
    refresh_token_id: str
    refresh_token: str


@app.post('/v1/auth/refresh')
async def v1_auth_refresh(req: RefreshRequest):
    valid = auth_mod.validate_refresh_token(req.refresh_token_id, req.refresh_token)
    if not valid:
        raise HTTPException(401, 'Invalid refresh token')
    user_id = valid['user_id']
    # Issue new access token (and optionally rotate refresh token)
    new_access = auth_mod.create_access_token(user_id)
    return {'access_token': new_access, 'token_type': 'bearer'}


class RevokeRequest(BaseModel):
    refresh_token_id: str


@app.post('/v1/auth/revoke')
async def v1_auth_revoke(req: RevokeRequest):
    # Revoke by id (no auth required because caller must hold refresh token id)
    auth_mod.revoke_refresh_token(req.refresh_token_id)
    return {'status': 'ok'}

# === Simple in-memory rate limiter (Phase 1)
# This is a basic thread-safe sliding window limiter intended as a near-term
# protection against brute-force login attempts. For production multi-instance
# deployments use Redis or another central store (see runbook).
RATE_LIMIT_WINDOW_SEC = int(os.environ.get('RATE_LIMIT_WINDOW_SEC', '60'))
RATE_LIMIT_MAX_ATTEMPTS = int(os.environ.get('RATE_LIMIT_MAX_ATTEMPTS', '8'))
# Per-IP attempt map: ip -> deque[timestamps]
_RATE_LOCK = threading.Lock()
_RATE_MAP: dict[str, deque] = defaultdict(deque)

def _rate_exceeded(key: str) -> bool:
    """Return True if the key exceeded RATE_LIMIT_MAX_ATTEMPTS within the window."""
    now = time.time()
    window = RATE_LIMIT_WINDOW_SEC
    with _RATE_LOCK:
        dq = _RATE_MAP[key]
        # Pop old timestamps
        while dq and dq[0] < now - window:
            dq.popleft()
        if len(dq) >= RATE_LIMIT_MAX_ATTEMPTS:
            return True
        dq.append(now)
        return False


_load_users()

# Credits/Token pricing
# Requested: 100 credits = $1.00 (i.e., 1 credit = $0.01 = 1 cent)
CREDITS_PER_DOLLAR = int(os.environ.get('CREDITS_PER_DOLLAR', 100))
CENTS_PER_CREDIT = max(1, int(round(100 / CREDITS_PER_DOLLAR)))

# Path to micro products seed file (JSON)
MICRO_PRODUCTS_PATH = Path(os.environ.get('MICRO_PRODUCTS_PATH', 'micro_products.json'))

# In-memory stores (replace with persistent DB in production)
JOBS: Dict[str, Dict[str, Any]] = {}
ACCESS_TOKENS: Dict[str, Dict[str, Any]] = {}
EPK_PROJECTS: Dict[str, Dict[str, Any]] = {}
IMPORT_SESSIONS: Dict[str, Dict[str, Any]] = {}
PRODUCTS: Dict[str, Dict[str, Any]] = {}
CHECKOUT_SESSIONS: Dict[str, Dict[str, Any]] = {}
MICRO_PRODUCTS: Dict[str, Dict[str, Any]] = {}
MICRO_SKU_TO_PID: Dict[str, str] = {}

# Ingest manifest in-memory (replace with DB/persistence later)
INGEST_SESSIONS: Dict[str, Dict[str, Any]] = {}

def _infer_subtype(name: str) -> str:
    low = name.lower()
    mapping = [
        ('808','808'),('kick','kick'),('clap','clap'),('snare','snare'),('rim','snare'),('snap','snap'),('hat','hihat'),
        ('perc','perc'),('crash','crash'),('vox','vocal'),('vocal','vocal'),('chant','chant'),('sfx','sfx'),('fx','sfx'),
        ('bass','bass'),('counter','counter_melody'),('melody','melody'),('lead','melody')]
    for k,v in mapping:
        if k in low: return v
    return 'misc'

def _classify_category(duration: float) -> str:
    if duration <= 2.0: return 'oneshot'
    if duration <= 32.0: return 'loop'
    return 'stem'

def _estimate_bpm(y, sr) -> int|None:
    try:
        tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
        if tempo and tempo>0: return int(round(float(tempo)))
    except Exception as e:
        print('bpm err', e)
    return None

def _estimate_key(y, sr) -> str|None:
    try:
        chroma = librosa.feature.chroma_stft(y=y, sr=sr)
        mean_c = chroma.mean(axis=1)
        idx = int(np.argmax(mean_c))
        km = ['C','C#','D','Eb','E','F','F#','G','Ab','A','Bb','B']
        return km[idx]
    except Exception as e:
        print('key err', e)
    return None

def _detect_bars(duration: float, bpm: int|None) -> int|None:
    if not bpm: return None
    sec_per_bar = 60.0 / bpm * 4.0
    est = duration / sec_per_bar
    candidates = [1,2,4,8,16,32,64]
    best = min(candidates, key=lambda c: abs(c-est))
    return best

def _slice_audio(y, sr, bpm: int, target_bars: int) -> list[tuple[int,int]]:
    sec_per_bar = 60.0 / bpm * 4.0
    seg_sec = sec_per_bar * target_bars
    total_sec = len(y)/sr
    out=[]; start=0.0
    while start + seg_sec <= total_sec - 0.25:
        end = start + seg_sec
        out.append((int(start*sr), int(end*sr)))
        start += seg_sec
    return out

def _producer_tag_detect(y, sr) -> dict:
    # Heuristic: find repeated short voiced-like segments (energy + spectral centroid window)
    try:
        frame_length=2048; hop=512
        S = np.abs(librosa.stft(y, n_fft=2048, hop_length=hop))
        energy = (S**2).mean(axis=0)
        cent = librosa.feature.spectral_centroid(S=S, sr=sr)[0]
        norm_e = (energy - energy.min())/(energy.ptp()+1e-9)
        norm_c = (cent - cent.min())/(cent.ptp()+1e-9)
        voiced = (norm_e>0.55) & (norm_c>0.35) & (norm_c<0.85)
        # Group contiguous frames
        segments=[]; on=None
        for i,v in enumerate(voiced):
            if v and on is None: on=i
            if not v and on is not None:
                segments.append((on,i))
                on=None
        if on is not None: segments.append((on,len(voiced)))
        # Filter length 0.2 - 2.0s
        seg_times=[]
        for s,e in segments:
            dur = (e-s)*hop/sr
            if 0.2<=dur<=2.0: seg_times.append((s,e,dur))
        # Similarity via coarse MFCC mean
        mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13, hop_length=hop)
        feat=[]
        for s,e,_ in seg_times:
            sl = mfcc[:,s:e]
            feat.append(sl.mean(axis=1))
        repeats=0
        for i in range(len(feat)):
            for j in range(i+1,len(feat)):
                a=feat[i]; b=feat[j]
                sim = np.dot(a,b)/(np.linalg.norm(a)*np.linalg.norm(b)+1e-9)
                if sim>0.93: repeats+=1
        if repeats>=1:
            return {'status':'present','confidence':min(0.95,0.6+0.15*repeats),'repeats':repeats,'segments':len(seg_times)}
        return {'status':'missing','confidence':0.25,'repeats':0,'segments':len(seg_times)}
    except Exception as e:
        return {'status':'unknown','error':str(e)}

@app.post('/v1/ingest/upload')
async def ingest_upload(
    request: Request,
    pack: str = Form(...),
    move: int = Form(0),
    slice: int = Form(1),
    slice_bars: int = Form(8),
    detect_bpm: int = Form(1),
    detect_key: int = Form(1),
    detect_tag: int = Form(1),
    files: List[UploadFile] = File(...)
):
    pack_clean = ''.join(c for c in pack if c.isalnum() or c in ('_','-')) or 'Pack'
    base_out = Path('sounds')
    base_out.mkdir(parents=True, exist_ok=True)
    session_id = uuid.uuid4().hex[:12]
    records=[]
    for f in files:
        raw = await f.read()
        tmp_path = Path('tmp_ingest')/session_id
        tmp_path.mkdir(parents=True, exist_ok=True)
        safe_name = f.filename or f"upload_{uuid.uuid4().hex[:8]}.wav"
        src_file = tmp_path / safe_name
        with open(src_file,'wb') as fh:
            fh.write(raw)
        try:
            y, sr = librosa.load(src_file, sr=None, mono=True)
        except Exception:
            continue
        duration = librosa.get_duration(y=y, sr=sr)
        bpm = _estimate_bpm(y,sr) if detect_bpm else None
        key = _estimate_key(y,sr) if detect_key else None
        cat = _classify_category(duration)
        subtype = _infer_subtype(safe_name)
        bars = _detect_bars(duration, bpm) if cat!='oneshot' else None
        descriptor = Path(safe_name).stem.lower().replace(' ','-')
        parts=[pack_clean,cat,subtype,descriptor]
        if key: parts.append(key)
        if bpm: parts.append(str(bpm))
        if bars: parts.append(f"{bars}b")
        parts.append('v1')
        new_name='__'.join(parts)+Path(safe_name).suffix.lower()
        target_dir = base_out / cat / subtype
        target_dir.mkdir(parents=True, exist_ok=True)
        target_path = target_dir / new_name
        if move:
            shutil.move(str(src_file), target_path)
        else:
            shutil.copy2(src_file, target_path)
        tag_info = _producer_tag_detect(y,sr) if detect_tag else {'status':'skipped'}
        rec = {
            'original_name': f.filename,
            'new_name': new_name,
            'category': cat,
            'subtype': subtype,
            'bpm': bpm,
            'key': key,
            'bars': bars,
            'duration_sec': duration,
            'sample_rate': sr,
            'tag': tag_info
        }
        records.append(rec)
        if slice and cat in ('loop','stem') and bpm and bars and bars>=slice_bars:
            segs = _slice_audio(y,sr,bpm,slice_bars)
            for idx,(s,e) in enumerate(segs, start=1):
                seg_y = y[s:e]
                slice_parts=[pack_clean,'loop',subtype,descriptor]
                if key: slice_parts.append(key)
                slice_parts.append(str(bpm))
                slice_parts.append(f"{slice_bars}b-part{idx}of{len(segs)}")
                slice_parts.append('v1')
                slice_name='__'.join(slice_parts)+Path(safe_name).suffix.lower()
                slice_dir = base_out / 'loops' / subtype
                slice_dir.mkdir(parents=True, exist_ok=True)
                slice_path = slice_dir / slice_name
                try:
                    if sf:
                        sf.write(slice_path, seg_y, sr)
                    records.append({
                        'original_name': f.filename,
                        'new_name': slice_name,
                        'category': 'loop',
                        'subtype': subtype,
                        'bpm': bpm,
                        'key': key,
                        'bars': slice_bars,
                        'duration_sec': len(seg_y)/sr,
                        'sample_rate': sr,
                        'tag': {'status':'derived'}
                    })
                except Exception as e:
                    print('slice write err', e)
    INGEST_SESSIONS[session_id] = {'id':session_id,'records':records,'created':time.time()}
    return {'session_id':session_id,'count':len(records),'records':records[:50]}  # send first 50 for brevity

class TagInsertRequest(BaseModel):
    target_path: str  # path to already uploaded/ingested audio (relative under sounds/)
    positions_sec: List[float]
    gain_db: float = -6.0
    tag_id: Optional[str] = None
    # If no tag_id provided, expect multipart with file 'tag_file'

@app.post('/v1/tag/insert')
async def insert_tag(
    request: Request,
    target_path: str = Form(...),
    positions_sec: str = Form(...),  # JSON list or comma separated
    gain_db: float = Form(-6.0),
    tag_id: Optional[str] = Form(None),
    tag_file: Optional[UploadFile] = File(None)
):
    # Resolve target file
    safe_rel = target_path.replace('..','').lstrip('/')
    src = Path('sounds')/safe_rel
    if not src.exists():
        raise HTTPException(404, 'Target audio not found')
    try:
        if positions_sec.strip().startswith('['):
            pos_list = json.loads(positions_sec)
        else:
            pos_list = [float(p.strip()) for p in positions_sec.split(',') if p.strip()]
    except Exception:
        raise HTTPException(400,'Invalid positions_sec format')
    if not pos_list:
        raise HTTPException(400,'No positions provided')
    # Load target
    try:
        base_audio = AudioSegment.from_file(src)
    except Exception as e:
        raise HTTPException(500, f'Load target failed: {e}')
    # Load or resolve tag asset
    if tag_file is not None:
        tag_bytes = await tag_file.read()
        try:
            tag_ext = (tag_file.filename.split('.')[-1] if tag_file and tag_file.filename and '.' in tag_file.filename else 'wav')
            tag_audio = AudioSegment.from_file(io.BytesIO(tag_bytes), format=tag_ext)
        except Exception as e:
            raise HTTPException(400, f'Bad tag file: {e}')
    else:
        # Look up tag_id under a hypothetical tags/ directory
        if not tag_id:
            raise HTTPException(400,'tag_id or tag_file required')
        tag_path = Path('tags')/ (tag_id + '.wav')
        if not tag_path.exists():
            raise HTTPException(404,'tag asset not found')
        tag_audio = AudioSegment.from_file(tag_path)
    # Normalize tag gain
    tag_audio = tag_audio + gain_db  # apply user gain (negative reduces level)
    # Insert at positions
    overlay = base_audio
    for pos in pos_list:
        ms = int(pos*1000)
        if ms < 0 or ms > len(overlay):
            continue
        overlay = overlay.overlay(tag_audio, position=ms)
    out_dir = src.parent
    out_name = src.stem + '_tagged' + src.suffix
    out_path = out_dir / out_name
    try:
        overlay.export(out_path, format=src.suffix.replace('.',''))
    except Exception as e:
        raise HTTPException(500, f'Export failed: {e}')
    return {'status':'ok','tagged_path': str(out_path.relative_to(Path("sounds"))), 'positions': pos_list}


## (Removed earlier duplicate /health endpoint; consolidated later in file.)

def _seed_micro_products(refresh: bool = False):
    """Seed or refresh micro products and credit packs from JSON.
    Supports fields: sku, title, type, price_cents, price_credits, anchor_credits,
    pack_credits (for credit packs), badges, tags, category, order, active.
    """
    cfg_path = MICRO_PRODUCTS_PATH
    if not cfg_path.exists():
        return
    try:
        data = json.loads(cfg_path.read_text(encoding='utf-8'))
    except Exception as e:
        print('Failed to read micro_products.json:', e)
        return

    if refresh:
        # Remove previously seeded micro products and credit packs from PRODUCTS
        for pid, prod in list(PRODUCTS.items()):
            tid = str(prod.get('track_id') or '')
            if tid.startswith('micro:') or tid.startswith('credits-pack:'):
                PRODUCTS.pop(pid, None)
        MICRO_PRODUCTS.clear()
        MICRO_SKU_TO_PID.clear()

    for item in data:
        sku = (item.get('sku') or '').strip()
        if not sku:
            continue
        ptype = (item.get('type') or 'micro').strip()
        # Derive prices
        price_credits = item.get('price_credits')
        price_cents = item.get('price_cents')
        if price_cents is None and price_credits is not None:
            price_cents = int(price_credits) * CENTS_PER_CREDIT
        if price_credits is None and price_cents is not None:
            price_credits = int(round(int(price_cents) / CENTS_PER_CREDIT))
        price_credits = int(price_credits or 0)
        price_cents = int(price_cents or 0)

        # Resolve product id (create or update)
        pid = MICRO_SKU_TO_PID.get(sku) or uuid.uuid4().hex[:14]

        if ptype == 'credit_pack':
            track_id = f"credits-pack:{sku}"
            license_code = 'credits-pack'
            # Ensure pack_credits present for credit packs
            pack_credits = int(item.get('pack_credits') or item.get('credits') or 0)
            # For credit packs, allow price_cents to be explicit to offer discounts
            # price_credits remains a derived info for display
        else:
            track_id = f"micro:{sku}"
            license_code = ptype or 'micro'
            pack_credits = None

        # Upsert into PRODUCTS
        PRODUCTS[pid] = {
            'id': pid,
            'track_id': track_id,
            'license_code': license_code,
            'price_cents': price_cents,
            'price_credits': price_credits,
            'currency': 'usd',
            'title': item.get('title') or sku,
            'exclusive': False,
            'active': bool(item.get('active', True)),
            'created': PRODUCTS.get(pid, {}).get('created') or time.time()
        }

        meta = dict(item)
        meta.update({
            'product_id': pid,
            'price_cents': price_cents,
            'price_credits': price_credits,
            'type': ptype,
            'pack_credits': pack_credits
        })
        MICRO_PRODUCTS[sku] = meta
        MICRO_SKU_TO_PID[sku] = pid

# Initial seed at startup
_seed_micro_products(refresh=False)

def _simulate_processing(job_id: str):
    job = JOBS[job_id]
    model_id = job['model_id']
    infile = job['input_path']
    outfile = job['output_path']
    # crude progress simulation + optional backend transform
    for step in range(1, 21):
        time.sleep(0.15)
        job['progress'] = step * 5
    try:
        if model_id == 'stemsplit':
            pro_enabled = bool(os.environ.get('STEMSPLIT_PRO') == '1' or job.get('params', {}).get('pro_user'))
            vocals_path = outfile.parent / f"{job['job_id']}_vocals.wav"
            instrumental_path = outfile.parent / f"{job['job_id']}_instrumental.wav"
            shutil.copy2(infile, vocals_path)
            shutil.copy2(infile, instrumental_path)
            stems = {
                'vocals_url': f"/processed/{vocals_path.name}",
                'instrumental_url': f"/processed/{instrumental_path.name}",
                'tier': 'free'
            }
            if pro_enabled:
                for stem_name in ('drums','bass','other'):
                    p = outfile.parent / f"{job['job_id']}_{stem_name}.wav"
                    shutil.copy2(infile, p)
                    stems[f"{stem_name}_url"] = f"/processed/{p.name}"
                stems['tier'] = 'pro'
            job['stems'] = stems
        elif model_id in ('retune432','halfscrew','halfscrew-lite'):
            params = job.get('params', {})
            speed = float(params.get('speed', 0.5 if model_id.startswith('halfscrew') else 1.0))
            quality = params.get('quality','standard')
            backend_engine = params.get('backend_engine','auto').lower()
            semitones = 12 * math.log2(432.0/440.0) if model_id=='retune432' else float(params.get('pitch', -2.0))
            try: from . import ffmpeg_pipeline
            except Exception: ffmpeg_pipeline = None
            try: from . import soundtouch_pipeline
            except Exception: soundtouch_pipeline = None
            ffmpeg_ok = bool(shutil.which('ffmpeg') and ffmpeg_pipeline is not None)
            soundtouch_ok = bool(soundtouch_pipeline is not None and soundtouch_pipeline.soundstretch_available())
            chosen = backend_engine
            if backend_engine == 'auto':
                chosen = 'rubberband' if ffmpeg_ok else ('soundtouch' if soundtouch_ok else 'copy')
            try:
                if chosen == 'soundtouch' and soundtouch_ok and soundtouch_pipeline is not None:
                    cmd, meta = soundtouch_pipeline.build_command(str(infile), str(outfile), speed=speed, semitones=semitones)
                    subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
                    if outfile.exists():
                        job['backend_meta'] = meta
                    else:
                        shutil.copy2(infile, outfile)
                elif chosen in ('rubberband','native') and ffmpeg_ok and ffmpeg_pipeline is not None:
                    cmd, meta = ffmpeg_pipeline.build_ffmpeg_command(
                        str(infile), str(outfile), speed=speed, semitones=semitones,
                        quality=quality, pipeline=('native' if chosen=='native' else 'rubberband'),
                        echo=False, saturation=False, limiter=True,
                        low_shelf_gain=2.5 if model_id.startswith('halfscrew') else None
                    )
                    subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
                    if outfile.exists():
                        job['backend_meta'] = meta
                    else:
                        shutil.copy2(infile, outfile)
                elif ffmpeg_ok and ffmpeg_pipeline is not None:
                    cmd, meta = ffmpeg_pipeline.build_ffmpeg_command(
                        str(infile), str(outfile), speed=speed, semitones=semitones,
                        quality=quality, pipeline=None,
                        echo=False, saturation=False, limiter=True,
                        low_shelf_gain=2.5 if model_id.startswith('halfscrew') else None
                    )
                    subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
                    if outfile.exists():
                        job['backend_meta'] = meta
                    else:
                        shutil.copy2(infile, outfile)
                else:
                    shutil.copy2(infile, outfile)
                job['backend_engine_used'] = chosen
            except Exception as proc_err:  # capture pipeline failure
                job['backend_error'] = str(proc_err)
                if not outfile.exists():
                    shutil.copy2(infile, outfile)
        elif model_id == 'aesthetic-lab':
            shutil.copy2(infile, outfile)
        elif model_id == 'echosharp-transcribe':
            shutil.copy2(infile, outfile)
            duration_guess = 42
            segs = []
            for i in range(0, duration_guess, 6):
                segs.append({'index': len(segs), 'start': i, 'end': min(i+6,duration_guess), 'text': f"Segment {len(segs)} placeholder transcript {i}-{min(i+6,duration_guess)}s"})
            job['transcript'] = {'model':'echosharp-transcribe-stub','segments':segs,'detected_language':'en'}
        else:
            shutil.copy2(infile, outfile)
        job['status'] = 'completed'
    except Exception as e:
        job['status'] = 'error'
        job['error'] = str(e)

@app.post('/v1/models/{model_id}/process')
async def process_audio(
    model_id: str,
    x_api_key: Optional[str] = Header(None),
    file: UploadFile = File(...),
    pitch: float = Form(0.0),
    speed: float = Form(1.0),
    target_hz: float = Form(432.0),
    quality: str = Form('standard'),
    backend_engine: str = Form('auto'),  # auto|rubberband|native|soundtouch
    # StemSplit / extended params (ignored by other models)
    engine: str = Form('demucs'),
    format: str = Form('wav'),
    normalize: int = Form(0),
    dereverb: int = Form(0),
    pro_user: int = Form(0)
):
    if x_api_key not in API_KEYS:
        raise HTTPException(401, 'Invalid or missing API key')
    model_cfg = MODELS.get(model_id)
    if not model_cfg:
        raise HTTPException(404, 'Model not found')
    if model_cfg.get('access') == 'gated' and model_id == 'halfscrew':
        # Require X-Access-Token header referencing issued token
        access_token = x_api_key  # default
        # Accept optional separate header to avoid confusion with API key
        # (Front-end will pass API key via X-API-Key and token via X-Access-Token)
        # FastAPI merges duplicate header names; we'll read manually if needed from Request in future.
        # For now use provided form field? We'll just check an environment-sent header in separate endpoint.
        # Simpler: expect client to append token as query param token= or header X-Access-Token
        # We'll look at os.environ for pointer; leaving minimal for demo.
        pass
    # Save upload
    raw_bytes = await file.read()
    job_id = uuid.uuid4().hex
    # Defensive filename handling (UploadFile.filename may be None or contain path separators)
    original_name = (file.filename or 'input').split('/')[-1].split('\\')[-1]
    base_no_ext = original_name.rsplit('.', 1)[0][:40] or 'audio'
    safe_base = ''.join(c for c in base_no_ext if c.isalnum() or c in ('-','_')) or 'audio'
    input_path = PROCESSED_DIR / f"{job_id}_in_{safe_base}.wav"
    output_path = PROCESSED_DIR / f"{job_id}_out_{safe_base}_{model_id}.wav"
    with open(input_path, 'wb') as f:
        f.write(raw_bytes)
    job = {
        'job_id': job_id,
        'model_id': model_id,
        'progress': 0,
        'status': 'processing',
        'input_path': input_path,
        'output_path': output_path,
        'params': {
            'pitch': pitch,
            'speed': speed,
            'target_hz': target_hz,
            'quality': quality,
            'backend_engine': backend_engine,
            'engine': engine,
            'format': format,
            'normalize': bool(normalize),
            'dereverb': bool(dereverb),
            'pro_user': bool(pro_user)
        }
    }
    JOBS[job_id] = job
    threading.Thread(target=_simulate_processing, args=(job_id,), daemon=True).start()
    return {'job_id': job_id, 'status': job['status'], 'progress': job['progress']}

@app.get('/v1/jobs/{job_id}')
async def get_job(job_id: str):
    job = JOBS.get(job_id)
    if not job:
        raise HTTPException(404, 'Job not found')
    resp = {k: job[k] for k in ('job_id','model_id','progress','status')}
    if job['status'] == 'completed':
        rel = job['output_path'].as_posix()
        resp['output_url'] = f"/processed/{os.path.basename(rel)}"
        # Include stems if present (StemSplit simulation)
        if job.get('stems'):
            resp.update(job['stems'])
        if job.get('transcript'):
            resp['transcript'] = job['transcript']
        if job.get('backend_meta'):
            resp['backend_meta'] = job['backend_meta']
        if job.get('backend_engine_used'):
            resp['backend_engine_used'] = job['backend_engine_used']
    if job.get('error'):
        resp['error'] = job['error']
    if job.get('backend_error'):
        resp['backend_error'] = job['backend_error']
    return resp

# Serve processed files
app.mount('/processed', StaticFiles(directory=PROCESSED_DIR), name='processed')
app.mount('/cli', StaticFiles(directory=CLI_DIR), name='cli')
app.mount('/user_uploads', StaticFiles(directory=USER_UPLOADS_DIR), name='user_uploads')
app.mount('/songs', StaticFiles(directory=SONGS_DIR), name='songs')
app.mount('/beats', StaticFiles(directory=BEATS_DIR), name='beats')

@app.post('/v1/access/{model_id}/request')
async def request_access(model_id: str, x_api_key: Optional[str] = Header(None)):
    if x_api_key not in API_KEYS:
        raise HTTPException(401,'Invalid or missing API key')
    model_cfg = MODELS.get(model_id)
    if not model_cfg:
        raise HTTPException(404,'Model not found')
    if model_cfg.get('access') != 'gated':
        return {'model_id': model_id, 'status':'not_gated'}
    # Issue token scoped to user + model
    token = uuid.uuid4().hex[:16]
    ACCESS_TOKENS.setdefault(model_id,{})[token] = {
        'user_id': API_KEYS[x_api_key]['user_id'],
        'issued': time.time(),
        'ttl': 3600
    }
    return {'model_id': model_id, 'access_token': token, 'expires_in': 3600}

# Allow all origins for local dev (tighten in production)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# === Unified JSON error handlers ===
@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    # Ensure 405, 404, etc. always JSON
    return JSONResponse(
        status_code=exc.status_code,
        content={
            'error': exc.detail or 'HTTP error',
            'status': exc.status_code,
            'path': request.url.path
        }
    )

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={
            'error': 'Validation failed',
            'details': exc.errors(),
            'path': request.url.path
        }
    )

@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    # Log server-side
    print('Unhandled exception:', repr(exc))
    return JSONResponse(
        status_code=500,
        content={
            'error': 'Internal server error',
            'path': request.url.path,
            'type': exc.__class__.__name__
        }
    )

@app.get("/v1/models")
async def list_models(include_disabled: bool = False):
    if include_disabled:
        return list(MODELS.values())
    return [m for m in MODELS.values() if not m.get('_disabled')]

class ModelToggleRequest(BaseModel):
    reason: Optional[str] = None

@app.post('/v1/models/{model_id}/disable')
async def disable_model(model_id: str, body: ModelToggleRequest, x_api_key: Optional[str] = Header(None)):
    if x_api_key not in API_KEYS:
        raise HTTPException(401,'Invalid or missing API key')
    m = MODELS.get(model_id)
    if not m:
        raise HTTPException(404,'Model not found')
    if m.get('_disabled'):
        return {'status':'already_disabled','model_id':model_id}
    m['_disabled'] = True
    m['_disabled_reason'] = body.reason or 'unspecified'
    m['_disabled_at'] = time.time()
    return {'status':'disabled','model_id':model_id,'reason':m['_disabled_reason']}

@app.post('/v1/models/{model_id}/enable')
async def enable_model(model_id: str, x_api_key: Optional[str] = Header(None)):
    if x_api_key not in API_KEYS:
        raise HTTPException(401,'Invalid or missing API key')
    m = MODELS.get(model_id)
    if not m:
        raise HTTPException(404,'Model not found')
    if not m.get('_disabled'):
        return {'status':'already_enabled','model_id':model_id}
    m.pop('_disabled', None)
    m.pop('_disabled_reason', None)
    m.pop('_disabled_at', None)
    return {'status':'enabled','model_id':model_id}

# === Auth Endpoints ===
class RegisterRequest(BaseModel):
    username: str
    password: str

class LoginRequest(BaseModel):
    username: str
    password: str

@app.post('/v1/auth/register')
async def auth_register(req: RegisterRequest):
    uname = req.username.strip().lower()
    if not uname or len(uname) < 3:
        raise HTTPException(400, 'Username too short')
    if uname in _USERS:
        raise HTTPException(400, 'Username already exists')
    if len(req.password) < 6:
        raise HTTPException(400, 'Password too short')
    uid = uuid.uuid4().hex
    rec = {
        'id': uid,
        'username': uname,
        'password_hash': _hash_password(req.password),
        'created': time.time()
    }
    _USERS[uname]=rec
    _USERS_BY_ID[uid]=rec
    _persist_user(rec)
    token = _create_token(uid)
    return {'token': token, 'user': {'id': uid, 'username': uname}}

@app.post('/v1/auth/login')
async def auth_login(req: LoginRequest):
    uname = req.username.strip().lower()
    # Rate limit by remote username (and could be extended to IP header)
    try:
        remote = 'user:' + uname
        if _rate_exceeded(remote):
            raise HTTPException(429, 'Too many login attempts; try again later')
    except HTTPException:
        raise
    except Exception:
        # on any rate-limiter error, fail open (do not block logins)
        pass
    rec = _USERS.get(uname)
    if not rec or not _verify_password(req.password, rec['password_hash']):
        raise HTTPException(401, 'Invalid credentials')
    token = _create_token(rec['id'])
    return {'token': token, 'user': {'id': rec['id'], 'username': rec['username']}}

# === Simplified Frontend-Friendly Alias Auth Routes ===
class EmailRegisterRequest(BaseModel):
    email: str
    password: str

class EmailLoginRequest(BaseModel):
    email: str
    password: str

@app.post('/auth/register')
async def fe_register(req: EmailRegisterRequest):
    # map email -> username lower
    uname = req.email.strip().lower()
    if not uname or '@' not in uname:
        raise HTTPException(400,'Invalid email')
    if uname in _USERS:
        raise HTTPException(400,'Email already registered')
    if len(req.password)<6:
        raise HTTPException(400,'Password too short')
    uid = uuid.uuid4().hex
    rec={ 'id':uid,'username':uname,'email':uname,'password_hash':_hash_password(req.password),'created':time.time() }
    _USERS[uname]=rec; _USERS_BY_ID[uid]=rec; _persist_user(rec)
    token=_create_token(uid)
    return {'token':token,'email':uname}

@app.post('/auth/login')
async def fe_login(req: EmailLoginRequest):
    uname=req.email.strip().lower()
    try:
        remote = 'user:' + uname
        if _rate_exceeded(remote):
            raise HTTPException(429, 'Too many login attempts; try again later')
    except HTTPException:
        raise
    except Exception:
        pass
    rec=_USERS.get(uname)
    if not rec or not _verify_password(req.password, rec['password_hash']):
        raise HTTPException(401,'Invalid credentials')
    token=_create_token(rec['id'])
    return {'token':token,'email':uname}

@app.get('/auth/me')
async def fe_me(authorization: str | None = Header(None)):
    user=_require_user(authorization)
    return {'email': user.get('email') or user.get('username'), 'id': user['id']}

# === Google OAuth (simplified placeholder) ===
GOOGLE_CLIENT_ID=os.environ.get('GOOGLE_CLIENT_ID')
GOOGLE_CLIENT_SECRET=os.environ.get('GOOGLE_CLIENT_SECRET')
GOOGLE_REDIRECT_URI=os.environ.get('GOOGLE_REDIRECT_URI','http://localhost:8000/auth/google/callback')

@app.get('/auth/google/start')
async def google_start():
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(500,'GOOGLE_CLIENT_ID not set')
    scope='email%20profile'
    state=uuid.uuid4().hex
    auth_url=("https://accounts.google.com/o/oauth2/v2/auth?response_type=code"\
        f"&client_id={GOOGLE_CLIENT_ID}&redirect_uri={GOOGLE_REDIRECT_URI}"\
        f"&scope={scope}&state={state}&access_type=online&prompt=select_account")
    return JSONResponse({'redirect':auth_url})

@app.get('/auth/google/callback')
async def google_callback(code: str | None = None):
    if not code:
        raise HTTPException(400,'Missing code')
    if not (GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET):
        raise HTTPException(500,'Google OAuth env not configured')
    # exchange code for token
    token_url='https://oauth2.googleapis.com/token'
    data={
        'code':code,
        'client_id':GOOGLE_CLIENT_ID,
        'client_secret':GOOGLE_CLIENT_SECRET,
        'redirect_uri':GOOGLE_REDIRECT_URI,
        'grant_type':'authorization_code'
    }
    async with httpx.AsyncClient(timeout=20) as client:
        r=await client.post(token_url,data=data)
    if r.status_code>=400:
        raise HTTPException(r.status_code,'Token exchange failed')
    tokens=r.json()
    id_token=tokens.get('id_token')
    access=tokens.get('access_token')
    if not access:
        raise HTTPException(400,'No access token')
    # get userinfo
    async with httpx.AsyncClient(timeout=20) as client:
        ui=await client.get('https://openidconnect.googleapis.com/v1/userinfo', headers={'Authorization':'Bearer '+access})
    if ui.status_code>=400:
        raise HTTPException(ui.status_code,'userinfo failed')
    info=ui.json()
    email=(info.get('email') or '').lower()
    if not email:
        raise HTTPException(400,'No email in profile')
    rec=_USERS.get(email)
    if not rec:
        uid=uuid.uuid4().hex
        rec={'id':uid,'username':email,'email':email,'password_hash':_hash_password(uuid.uuid4().hex),'created':time.time(),'oauth':'google'}
        _USERS[email]=rec; _USERS_BY_ID[uid]=rec; _persist_user(rec)
    token=_create_token(rec['id'])
    # redirect back to root with token param for frontend to capture
    return JSONResponse({'token':token,'email':email})

def _require_user(authorization: Optional[str]) -> dict:
    if not authorization or not authorization.lower().startswith('bearer '):
        raise HTTPException(401, 'Missing bearer token')
    token = authorization.split(' ',1)[1].strip()
    dec = _decode_token(token)
    if not dec:
        raise HTTPException(401, 'Invalid token')
    return dec['user']

@app.post('/v1/tracks/upload')
async def upload_track(authorization: Optional[str] = Header(None), file: UploadFile = File(...)):
    user = _require_user(authorization)
    uid = user['id']
    user_dir = USER_UPLOADS_DIR / uid
    user_dir.mkdir(parents=True, exist_ok=True)
    raw = await file.read()
    base = (file.filename or 'track').split('/')[-1].split('\\')[-1]
    if '.' in base:
        name_part, ext = base.rsplit('.',1)
    else:
        name_part, ext = base, 'wav'
    safe_base = ''.join(c for c in name_part if c.isalnum() or c in ('-','_'))[:60] or 'track'
    final_name = f"{int(time.time())}_{safe_base}.{ext.lower()}"
    out_path = user_dir / final_name
    with open(out_path,'wb') as f:
        f.write(raw)
    rel_url = f"/user_uploads/{uid}/{final_name}"
    return {'status':'ok','track': {'url': rel_url, 'filename': final_name, 'original_name': file.filename, 'id': final_name}}

@app.get('/v1/tracks')
async def list_tracks(authorization: Optional[str] = Header(None)):
    user = _require_user(authorization)
    uid = user['id']
    user_dir = USER_UPLOADS_DIR / uid
    tracks = []
    if user_dir.exists():
        for f in sorted(user_dir.iterdir(), key=lambda p: p.stat().st_mtime, reverse=True):
            if f.suffix.lower() not in {'.wav','.mp3','.aif','.aiff','.ogg','.flac','.m4a'}: continue
            tracks.append({'id': f.name, 'url': f"/user_uploads/{uid}/{f.name}", 'filename': f.name, 'original_name': f.name})
    return {'tracks': tracks}

@app.get("/v1/models/{model_id}/metrics")
async def model_metrics(model_id: str):
    model = MODELS.get(model_id)
    if not model:
        raise HTTPException(404, 'Model not found')
    calls = sum(1 for u in USAGE if u['model_id'] == model_id)
    return {
        "model_id": model_id,
        "calls": calls,
        "rating": model.get('rating', 4.8),
        "users": model.get('users', 12000)
    }

async def call_openai(model_cfg: Dict[str, Any], payload: InvokeRequest):
    api_key = os.environ.get('OPENAI_API_KEY')
    if not api_key:
        raise HTTPException(500, 'OPENAI_API_KEY not set')
    body = {}
    if payload.messages:
        body = {"model": model_cfg['provider_model'], "messages": payload.messages, "max_tokens": payload.max_tokens, "temperature": payload.temperature}
    else:
        # Wrap plain prompt as chat
        body = {"model": model_cfg['provider_model'], "messages": [{"role": "user", "content": payload.prompt or ''}], "max_tokens": payload.max_tokens, "temperature": payload.temperature}
    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.post("https://api.openai.com/v1/chat/completions", headers={"Authorization": f"Bearer {api_key}"}, json=body)
    if r.status_code >= 400:
        raise HTTPException(r.status_code, f"OpenAI error: {r.text}")
    data = r.json()
    return {
        "output": data['choices'][0]['message']['content'],
        "raw": {"id": data.get('id'), "usage": data.get('usage')},
        "input_tokens": (data.get('usage') or {}).get('prompt_tokens'),
        "output_tokens": (data.get('usage') or {}).get('completion_tokens')
    }

PROVIDERS = {
    'openai': call_openai
}

async def call_internal(model_cfg: Dict[str, Any], payload: InvokeRequest):
    """Placeholder internal adapter. Replace with real processing (FFmpeg, demucs, diffusion, etc.)."""
    # Simulate latency
    time.sleep(0.25)
    tool = model_cfg['id']
    base_output: str

    sounds_root = Path('sounds')
    audio_toolz_root = Path('audio_toolz')

    def sound_stats():
        stats = {}
        if sounds_root.exists():
            for d in sounds_root.iterdir():
                if d.is_dir():
                    count = sum(1 for f in d.iterdir() if f.suffix.lower() in {'.wav', '.mp3', '.aiff', '.aif'})
                    stats[d.name] = count
        return stats

    if tool == 'ai-drum-machine':
        stats = sound_stats()
        base_output = 'Drum machine ready. Sample categories: ' + ', '.join(f"{k}:{v}" for k,v in stats.items())
    elif tool == 'beat-lab':
        tempo = random.choice([90,100,110,120,128,140])
        mood = (payload.prompt or 'default').split(' ')[0][:14]
        pattern = random.choice(['K---S---K-K-S---','K---S-K- K---S-K-','K-S- K-S- K-S- K-S-']).replace(' ','')
        base_output = f"Generated loop: tempo {tempo} BPM, mood '{mood}'. Pattern (16 steps): {pattern}"
    elif tool == 'retune432':
        base_output = 'Simulated pitch shift: A4=440Hz -> 432Hz (Δ≈ -31.77 cents)'
    elif tool == 'stemsplit':
        base_output = 'Simulated stem separation -> vocals.wav / drums.wav / bass.wav / other.wav'
    elif tool == 'clipmate':
        clips = 0
        if audio_toolz_root.exists():
            for root, _, files in os.walk(audio_toolz_root):
                clips += sum(1 for f in files if f.lower().endswith(('.wav','.mp3','.mp4')))
        base_output = f'ClipMate scan: {clips} media file(s) discovered (simulated processing pipeline ready)'
    elif tool == 'audiosnag':
        base_output = 'AudioSnag placeholder: would start system capture (requires desktop + ffmpeg + Stereo Mix).'
    elif tool in ('halfscrew','halfscrew-lite'):
        qual = 'full fidelity' if tool=='halfscrew' else 'lite preview'
        base_output = f'Applied half-speed transform ({qual}).'
    elif tool == 'codeine-processor':
        base_output = 'Applied spectral polish: EQ->de-noise->exciter->limiter chain (simulated).'
    elif tool == 'aesthetic-lab':
        base_output = f"Applied aesthetic style '{payload.mode or 'cinematic'}' at intensity {payload.intensity}."
    elif tool == 'image-daw':
        base_output = 'Initialized image synth session (interactive client canvas).'
    else:
        base_output = 'Internal tool executed.'

    return {
        'output': base_output,
        'raw': {'tool': tool},
        'input_tokens': None,
        'output_tokens': None
    }

PROVIDERS['internal'] = call_internal

@app.post("/v1/models/{model_id}/invoke")
async def invoke(model_id: str, req: InvokeRequest, x_api_key: Optional[str] = Header(None)):
    if x_api_key not in API_KEYS:
        raise HTTPException(401, 'Invalid or missing API key')
    model_cfg = MODELS.get(model_id)
    if not model_cfg:
        raise HTTPException(404, 'Model not found')
    provider = model_cfg.get('provider') or 'internal'
    # Gating check
    if model_cfg.get('access') == 'gated' and API_KEYS[x_api_key]['user_id'] != 'user_demo':
        # For now allow demo user only; extend with roles later
        raise HTTPException(403, 'Access to this model is gated. Contact support for access.')
    adapter = PROVIDERS.get(provider)
    if not adapter:
        raise HTTPException(500, f'No adapter for provider {provider}')
    start = time.time()
    result = await adapter(model_cfg, req)
    latency = int((time.time() - start) * 1000)
    USAGE.append({
        'model_id': model_id,
        'user_id': API_KEYS[x_api_key]['user_id'],
        'latency_ms': latency,
        'ts': time.time(),
        'input_tokens': result.get('input_tokens'),
        'output_tokens': result.get('output_tokens')
    })
    return {
        'model_id': model_id,
        'latency_ms': latency,
        'output': result['output'],
        'usage': {
            'input_tokens': result.get('input_tokens'),
            'output_tokens': result.get('output_tokens')
        }
    }

@app.get('/health')
async def health():
    """Unified health probe returning service status, model registry meta and basic runtime stats."""
    return {
        'status': 'ok',
        'models': len(MODELS),
        'time': time.time(),
        'registry': {
            'path': MODEL_REGISTRY_META.get('path'),
            'last_loaded': MODEL_REGISTRY_META.get('last_loaded'),
            'models': MODEL_REGISTRY_META.get('models'),
            'errors': MODEL_REGISTRY_META.get('errors'),
            'warnings': MODEL_REGISTRY_META.get('warnings'),
            'version_hash': MODEL_REGISTRY_META.get('version_hash')
        }
    }

@app.post('/v1/models/reload')
async def reload_models(x_api_key: Optional[str] = Header(None)):
    if x_api_key not in API_KEYS:
        raise HTTPException(401,'Invalid or missing API key')
    before = MODEL_REGISTRY_META.get('models')
    _load_model_registry()
    return {
        'reloaded': True,
        'models_before': before,
        'models_after': MODEL_REGISTRY_META.get('models'),
        'errors': MODEL_REGISTRY_META.get('errors'),
        'warnings': MODEL_REGISTRY_META.get('warnings'),
        'timestamp': MODEL_REGISTRY_META.get('last_loaded')
    }

@app.get('/v1/models/registry/status')
async def registry_status():
    return {
        'path': MODEL_REGISTRY_META.get('path'),
        'models': MODEL_REGISTRY_META.get('models'),
        'last_loaded': MODEL_REGISTRY_META.get('last_loaded'),
        'errors': MODEL_REGISTRY_META.get('errors'),
        'warnings': MODEL_REGISTRY_META.get('warnings'),
        'version_hash': MODEL_REGISTRY_META.get('version_hash')
    }

@app.get('/v1/models/registry/diff')
async def registry_diff():
    return MODEL_REGISTRY_META.get('last_diff') or {'added': [], 'removed': [], 'changed': [], 'timestamp': None}

# ===== EPK & Library Import Stubs =====
class CreateEPKRequest(BaseModel):
    title: str
    artist: Optional[str] = None
    influences: Optional[List[str]] = None
    tone: Optional[str] = None

@app.post('/v1/epk')
async def create_epk(req: CreateEPKRequest, x_api_key: Optional[str] = Header(None)):
    if x_api_key not in API_KEYS:
        raise HTTPException(401,'Invalid or missing API key')
    epk_id = uuid.uuid4().hex[:12]
    EPK_PROJECTS[epk_id] = {
        'id': epk_id,
        'title': req.title,
        'artist': req.artist,
        'influences': req.influences or [],
        'tone': req.tone or 'energetic',
        'status': 'draft',
        'created': time.time()
    }
    return EPK_PROJECTS[epk_id]

@app.post('/v1/epk/{epk_id}/generate')
async def generate_epk(epk_id: str, x_api_key: Optional[str] = Header(None)):
    if x_api_key not in API_KEYS:
        raise HTTPException(401,'Invalid or missing API key')
    epk = EPK_PROJECTS.get(epk_id)
    if not epk:
        raise HTTPException(404,'EPK not found')
    # Simulated generation (would call internal invoke or LLM chain)
    epk['status'] = 'generated'
    epk['bio'] = f"{epk.get('artist') or 'Artist'} fuses {', '.join(epk.get('influences') or ['diverse inspirations'])} into a {epk.get('tone')} sonic narrative." 
    epk['tagline'] = 'Sound in forward motion.'
    epk['palette'] = ['#0a0f14','#00aaff','#ff3b30','#ffd166']
    epk['sections'] = [
        {'title':'Story','body': 'Born from late-night sessions and boundary pushing experimentation.'},
        {'title':'Highlights','body':'Opened for X, playlisted on Y, independent streams 250K+'}
    ]
    return epk

class ImportLibraryRequest(BaseModel):
    tracks: List[Dict[str, Any]]
    source: Optional[str] = None

@app.post('/v1/import/library')
async def import_library(req: ImportLibraryRequest, x_api_key: Optional[str] = Header(None)):
    if x_api_key not in API_KEYS:
        raise HTTPException(401,'Invalid or missing API key')
    normalized = []
    for t in req.tracks:
        normalized.append({
            'id': t.get('id') or uuid.uuid4().hex[:10],
            'title': t.get('title') or t.get('name') or 'Untitled',
            'bpm': t.get('bpm') or t.get('tempo'),
            'key': t.get('key') or t.get('scale'),
            'duration': t.get('duration') or t.get('length'),
            'purchasable': bool(t.get('purchasable', True)),
            'priceCents': int(t.get('priceCents') or t.get('price_cents') or 1999)
        })
    session_id = uuid.uuid4().hex[:12]
    IMPORT_SESSIONS[session_id] = {'id': session_id, 'count': len(normalized), 'tracks': normalized, 'source': req.source, 'ts': time.time()}
    return {'session_id': session_id, 'imported': len(normalized)}

@app.get('/v1/import/library/{session_id}')
async def get_import_session(session_id: str, x_api_key: Optional[str] = Header(None)):
    if x_api_key not in API_KEYS:
        raise HTTPException(401,'Invalid or missing API key')
    sess = IMPORT_SESSIONS.get(session_id)
    if not sess:
        raise HTTPException(404,'Import session not found')
    return sess

# ===== Lead Capture =====
class LeadCapture(BaseModel):
    email: str
    ts: Optional[int] = None
    source: Optional[str] = None
    intent: Optional[str] = None
    meta: Optional[Dict[str, Any]] = None

LEADS_PATH = Path(os.environ.get('LEADS_PATH','leads.jsonl'))

@app.post('/v1/leads')
async def capture_lead(lead: LeadCapture, request: Request):
    email = (lead.email or '').strip().lower()
    if not email or '@' not in email or '.' not in email.split('@')[-1]:
        raise HTTPException(400, 'Invalid email')
    record = {
        'email': email,
        'ts': int(lead.ts or time.time()*1000),
        'source': lead.source or 'unknown',
        'intent': lead.intent or 'general',
        'ip': request.client.host if request.client else None,
        'ua': request.headers.get('user-agent'),
        'meta': lead.meta or {}
    }
    try:
        with LEADS_PATH.open('a', encoding='utf-8') as f:
            f.write(json.dumps(record)+'\n')
    except Exception as e:
        print('Lead write failed:', e)
        raise HTTPException(500,'Failed to persist lead')
    return {'status':'ok','stored':True}

# ===== Commerce (In-memory Stub) =====
class CreateProductRequest(BaseModel):
    track_id: str
    license_code: str
    price_cents: Optional[int] = None
    price_credits: Optional[int] = None
    currency: str = 'usd'
    title: Optional[str] = None
    exclusive: bool = False

@app.post('/v1/products')
async def create_product(req: CreateProductRequest, x_api_key: Optional[str] = Header(None)):
    if x_api_key not in API_KEYS: raise HTTPException(401,'Invalid or missing API key')
    pid = uuid.uuid4().hex[:14]
    # Derive price in cents from credits if provided
    price_cents: Optional[int] = req.price_cents
    if price_cents is None and req.price_credits is not None:
        price_cents = int(req.price_credits) * CENTS_PER_CREDIT
    if price_cents is None:
        raise HTTPException(400, 'Must provide price_cents or price_credits')
    PRODUCTS[pid] = {
        'id': pid,
        'track_id': req.track_id,
        'license_code': req.license_code,
        'price_cents': price_cents,
        'price_credits': (None if price_cents is None else int(round(price_cents / CENTS_PER_CREDIT))),
        'currency': req.currency,
        'title': req.title or f"{req.license_code} license",
        'exclusive': req.exclusive,
        'active': True,
        'created': time.time()
    }
    return PRODUCTS[pid]

@app.get('/v1/products')
async def list_products(track_id: Optional[str] = None):
    vals = list(PRODUCTS.values())
    if track_id:
        vals = [p for p in vals if p['track_id']==track_id]
    return vals

@app.get('/v1/pricing')
async def pricing_info():
    return {
        'credits_per_dollar': CREDITS_PER_DOLLAR,
        'cents_per_credit': CENTS_PER_CREDIT,
        'note': '1 credit = $0.01 when credits_per_dollar=100'
    }

@app.get('/v1/micro-products')
async def get_micro_products():
    out = []
    for sku, mp in MICRO_PRODUCTS.items():
        m = dict(mp)
        anc = mp.get('anchor_credits')
        pc = mp.get('price_credits') or 0
        if isinstance(anc, int) and anc > 0 and pc > 0:
            save = max(0, anc - pc)
            m['savings_credits'] = save
            try:
                m['savings_pct'] = round((save / anc) * 100)
            except ZeroDivisionError:
                m['savings_pct'] = 0
        out.append(m)
    return out

@app.get('/v1/micro-products/categories')
async def micro_product_categories():
    cats: Dict[str, int] = {}
    for mp in MICRO_PRODUCTS.values():
        cat = (mp.get('category') or 'misc').strip()
        cats[cat] = cats.get(cat, 0) + 1
    return [{'id': k, 'count': v} for k,v in sorted(cats.items(), key=lambda kv: (-kv[1], kv[0]))]

@app.get('/v1/credit-packs')
async def list_credit_packs():
    packs = []
    for mp in MICRO_PRODUCTS.values():
        if (mp.get('type') or '') == 'credit_pack':
            packs.append(mp)
    # Optional: sort by pack_credits ascending
    packs.sort(key=lambda x: int(x.get('pack_credits') or 0))
    return packs

@app.post('/v1/admin/micro-products/refresh')
async def admin_refresh_micro_products(x_api_key: Optional[str] = Header(None)):
    # Simple guard: require the known demo key (replace with proper auth later)
    if x_api_key not in API_KEYS:
        raise HTTPException(401, 'Invalid or missing API key')
    _seed_micro_products(refresh=True)
    return {
        'status': 'refreshed',
        'micro_products': len(MICRO_PRODUCTS),
        'products': len(PRODUCTS)
    }

class CheckoutRequest(BaseModel):
    items: List[Dict[str, Any]]  # [{product_id}]

@app.post('/v1/checkout/session')
async def create_checkout_session(req: CheckoutRequest, x_api_key: Optional[str] = Header(None)):
    if not req.items: raise HTTPException(400,'No items')
    # Sum total
    total = 0
    for it in req.items:
        pid = it.get('product_id')
        if not isinstance(pid, str) or not pid:
            raise HTTPException(400, 'Invalid product_id')
        prod = PRODUCTS.get(pid)
        if not prod or not prod['active']:
            raise HTTPException(400,'Invalid product in cart')
        total += prod['price_cents']
    sid = 'cs_test_'+uuid.uuid4().hex[:18]
    CHECKOUT_SESSIONS[sid] = {'id': sid, 'amount_cents': total, 'items': req.items, 'created': time.time(), 'status':'pending'}
    # In real Stripe integration: create session and return real id + publishable key
    return {'id': sid, 'amount_cents': total, 'publicKey': 'pk_test_placeholder'}

# === Public Songs / Beats Library Listing ===
def _list_audio_dir(root: Path) -> list[dict]:
    items=[]
    if not root.exists():
        return items
    for p in sorted(root.rglob('*')):
        if p.is_dir():
            continue
        if p.suffix.lower() not in {'.wav','.mp3','.aiff','.aif','.flac','.ogg','.m4a'}:
            continue
        rel = p.relative_to(root)
        url_base = '/songs' if root == SONGS_DIR else '/beats'
        url = f"{url_base}/{rel.as_posix()}"
        stem = p.stem
        # Derive basic title (replace separators)
        title = stem.replace('_',' ').replace('-',' ').title()
        size = p.stat().st_size
        # Optionally capture parent folder as category
        category = None
        parts = rel.parts
        if len(parts) > 1:
            category = parts[0]
        items.append({
            'id': stem + '_' + hashlib.md5(str(rel).encode('utf-8')).hexdigest()[:6],
            'title': title,
            'url': url,
            'filename': p.name,
            'filesize': size,
            'category': category
        })
    return items

@app.get('/v1/library/songs')
async def list_songs():
    return {'songs': _list_audio_dir(SONGS_DIR)}

@app.get('/v1/library/beats')
async def list_beats(category: Optional[str] = None):
    items = _list_audio_dir(BEATS_DIR)
    if category:
        items = [i for i in items if (i.get('category') or '').lower() == category.lower()]
    # Derive basic pricing heuristics if category signals licensing tiers
    for it in items:
        cat = (it.get('category') or '').lower()
        if cat == 'exclusive':
            it['priceCents'] = 49900
            it['license'] = 'exclusive'
        elif cat == 'lease':
            it['priceCents'] = 1999
            it['license'] = 'lease'
        elif cat == 'free':
            it['priceCents'] = 0
            it['license'] = 'free'
        else:
            it['priceCents'] = 0
            it['license'] = 'unknown'
    return {'beats': items}


if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host='0.0.0.0', port=int(os.environ.get('PORT', 8080)))
