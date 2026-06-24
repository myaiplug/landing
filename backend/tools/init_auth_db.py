"""Initialize auth DB and JWT keys for local/dev use.

Usage:
    python backend/tools/init_auth_db.py --create-admin <username> <password>
    python backend/tools/init_auth_db.py --print-keys
"""
import argparse
import os
import sys
import time

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
sys.path.insert(0, ROOT)

from backend import auth


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--print-keys', action='store_true', help='Print public/private key paths and contents')
    p.add_argument('--create-admin', nargs=2, metavar=('USERNAME','PASSWORD'), help='Create admin user and output refresh token id/token')
    args = p.parse_args()

    if args.print_keys:
        print('Private key path:', os.environ.get('JWT_PRIVATE_KEY_PATH', 'backend/jwt_keys/jwt_private.pem'))
        print('Public key path :', os.environ.get('JWT_PUBLIC_KEY_PATH', 'backend/jwt_keys/jwt_public.pem'))
        try:
            print('--- PUBLIC KEY ---')
            print(auth.public_key_pem().decode('utf-8'))
        except Exception as e:
            print('Failed to read public key:', e)

    if args.create_admin:
        uname, pw = args.create_admin
        # Create user record in users.jsonl (append)
        from main import _USERS, _USERS_BY_ID, _persist_user, _hash_password
        if uname in _USERS:
            print('User already exists:', uname)
            return
        uid = __import__('uuid').uuid4().hex
        rec = {'id': uid, 'username': uname, 'password_hash': _hash_password(pw), 'created': time.time()}
        _USERS[uname] = rec
        _USERS_BY_ID[uid] = rec
        _persist_user(rec)
        refresh = auth.create_refresh_token(uid)
        print('Created admin user', uname)
        print('Refresh token id:', refresh['id'])
        print('Refresh token value:', refresh['token'])


if __name__ == '__main__':
    main()
#!/usr/bin/env python3
"""Init auth DB and keys for Phase-2 JWTs.
Usage: python init_auth_db.py [--print-keys] [--create-refresh <user_id>]
"""
import argparse
from pathlib import Path
import backend.auth as auth


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--print-keys', action='store_true')
    parser.add_argument('--create-refresh', help='user_id to create refresh token for')
    args = parser.parse_args()
    # init_db already called on import
    if args.print_keys:
        print('Private key path:', auth.PRIVATE_KEY_PATH)
        print('Public key path:', auth.PUBLIC_KEY_PATH)
    if args.create_refresh:
        t = auth.create_refresh_token(args.create_refresh)
        print('Created refresh token:', t)


if __name__ == '__main__':
    main()
