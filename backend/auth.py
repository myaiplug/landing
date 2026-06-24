"""Phase-2 authentication helpers: RS256 JWT access tokens and server-side refresh tokens.

This module provides:
 - create_access_token(user_id)
 - decode_access_token(token) -> payload or None
 - create_refresh_token(user_id) -> {id, token, expires_at}
 - validate_refresh_token(id, token) -> {'user_id', ...} or None
 - revoke_refresh_token(id)
 - public_key_pem(), private_key_pem()

The refresh token values are stored as HMAC hashes using AUTH_SECRET to avoid storing plaintext tokens.
"""
import os
import time
import sqlite3
import uuid
import hmac
import hashlib
import base64
from pathlib import Path
from typing import Optional, Dict, Any

import jwt  # PyJWT
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.backends import default_backend

# Config
KEY_DIR = Path(os.environ.get('JWT_KEY_DIR', 'backend/jwt_keys'))
KEY_DIR.mkdir(parents=True, exist_ok=True)
PRIV_PATH = Path(os.environ.get('JWT_PRIVATE_KEY_PATH', KEY_DIR / 'jwt_private.pem'))
PUB_PATH = Path(os.environ.get('JWT_PUBLIC_KEY_PATH', KEY_DIR / 'jwt_public.pem'))
DB_PATH = Path(os.environ.get('AUTH_DB_PATH', 'backend/auth.db'))

ACCESS_TTL = int(os.environ.get('ACCESS_TTL_SEC', str(60 * 15)))  # 15 minutes default
REFRESH_TTL = int(os.environ.get('REFRESH_TTL_SEC', str(60 * 60 * 24 * 30)))  # 30 days

AUTH_SECRET_RAW = os.environ.get('AUTH_SECRET', '')
if not AUTH_SECRET_RAW:
    raise RuntimeError('AUTH_SECRET must be set for auth module')
AUTH_SECRET = AUTH_SECRET_RAW.encode('utf-8')


def _generate_rsa_keypair(bits: int = 2048) -> tuple[bytes, bytes]:
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=bits, backend=default_backend())
    priv = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.TraditionalOpenSSL,
        encryption_algorithm=serialization.NoEncryption()
    )
    pub = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo
    )
    return priv, pub


def _ensure_keys() -> tuple[bytes, bytes]:
    if PRIV_PATH.exists() and PUB_PATH.exists():
        return PRIV_PATH.read_bytes(), PUB_PATH.read_bytes()
    priv, pub = _generate_rsa_keypair()
    PRIV_PATH.write_bytes(priv)
    PUB_PATH.write_bytes(pub)
    return priv, pub


_PRIV_PEM, _PUB_PEM = _ensure_keys()


def _get_db_conn():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH), timeout=5, check_same_thread=False)
    conn.execute('PRAGMA journal_mode=WAL')
    conn.execute('PRAGMA foreign_keys=ON')
    return conn


def _init_db():
    conn = _get_db_conn()
    cur = conn.cursor()
    cur.execute('''
    CREATE TABLE IF NOT EXISTS refresh_tokens (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        token_hash TEXT NOT NULL,
        issued_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        revoked INTEGER NOT NULL DEFAULT 0
    )
    ''')
    conn.commit()
    conn.close()


_init_db()


def create_access_token(user_id: str, ttl_sec: Optional[int] = None) -> str:
    now = int(time.time())
    exp = now + (ttl_sec or ACCESS_TTL)
    payload = {'sub': str(user_id), 'iat': now, 'exp': exp, 'typ': 'access'}
    token = jwt.encode(payload, _PRIV_PEM, algorithm='RS256')
    return token


def decode_access_token(token: str) -> Optional[Dict[str, Any]]:
    try:
        payload = jwt.decode(token, _PUB_PEM, algorithms=['RS256'])
        return payload
    except Exception:
        return None


def create_refresh_token(user_id: str, ttl_sec: Optional[int] = None) -> Dict[str, Any]:
    rid = uuid.uuid4().hex
    raw = base64.urlsafe_b64encode(os.urandom(32)).decode('utf-8').rstrip('=')
    now = int(time.time())
    exp = now + (ttl_sec or REFRESH_TTL)
    token_hash = hmac.new(AUTH_SECRET, raw.encode('utf-8'), hashlib.sha256).hexdigest()
    conn = _get_db_conn()
    cur = conn.cursor()
    cur.execute('INSERT OR REPLACE INTO refresh_tokens (id, user_id, token_hash, issued_at, expires_at, revoked) VALUES (?,?,?,?,?,0)',
                (rid, str(user_id), token_hash, now, exp))
    conn.commit()
    conn.close()
    return {'id': rid, 'token': raw, 'expires_at': exp}


def validate_refresh_token(token_id: str, raw_token: str) -> Optional[Dict[str, Any]]:
    try:
        conn = _get_db_conn()
        cur = conn.cursor()
        cur.execute('SELECT user_id, token_hash, issued_at, expires_at, revoked FROM refresh_tokens WHERE id=?', (token_id,))
        row = cur.fetchone()
        conn.close()
        if not row:
            return None
        user_id, token_hash, issued_at, expires_at, revoked = row
        if revoked:
            return None
        if int(expires_at) < int(time.time()):
            return None
        got = hmac.new(AUTH_SECRET, raw_token.encode('utf-8'), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(token_hash, got):
            return None
        return {'user_id': user_id, 'issued_at': issued_at, 'expires_at': expires_at}
    except Exception:
        return None


def revoke_refresh_token(token_id: str) -> None:
    try:
        conn = _get_db_conn()
        cur = conn.cursor()
        cur.execute('UPDATE refresh_tokens SET revoked=1 WHERE id=?', (token_id,))
        conn.commit()
        conn.close()
    except Exception:
        pass


def public_key_pem() -> bytes:
    return _PUB_PEM


def private_key_pem() -> bytes:
    return _PRIV_PEM


def rotate_keys(new_priv_pem: bytes, new_pub_pem: bytes) -> None:
    PRIV_PATH.write_bytes(new_priv_pem)
    PUB_PATH.write_bytes(new_pub_pem)
    global _PRIV_PEM, _PUB_PEM
    _PRIV_PEM = new_priv_pem
    _PUB_PEM = new_pub_pem
