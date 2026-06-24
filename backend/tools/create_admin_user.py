#!/usr/bin/env python3
"""
Small helper to create a compatible admin user JSON record for `backend/users.jsonl`.
Usage:
  python backend/tools/create_admin_user.py --username admin@example.com --password "StrongPass123!" --output users.jsonl

This script will print a JSON record you can append to your `users.jsonl` safely.
Do not commit the output containing passwords to source control.
"""
import argparse
import json
import uuid
import time
import os
import base64
import hashlib


def hash_password(pw: str) -> str:
    salt = os.urandom(16)
    dk = hashlib.pbkdf2_hmac('sha256', pw.encode('utf-8'), salt, 100_000)
    return base64.b64encode(salt + dk).decode('utf-8')


def make_user_record(username: str, password: str, is_admin: bool = True) -> dict:
    uid = uuid.uuid4().hex
    rec = {
        'id': uid,
        'username': username.lower(),
        'email': username.lower(),
        'password_hash': hash_password(password),
        'created': time.time(),
        'admin': bool(is_admin)
    }
    return rec


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('--username', required=True, help='admin username or email')
    p.add_argument('--password', required=True, help='plaintext password to hash')
    p.add_argument('--output', default=None, help='file to append to (users.jsonl). If omitted, prints to stdout')
    args = p.parse_args()

    rec = make_user_record(args.username, args.password)
    s = json.dumps(rec)
    if args.output:
        with open(args.output, 'a', encoding='utf-8') as f:
            f.write(s + '\n')
        print(f'Appended admin user to {args.output}. id={rec["id"]}')
    else:
        print(s)
