"""Migrate `backend/users.jsonl` into the `users` table inside `backend/auth.db`.

Usage:
  python backend/tools/migrate_users_to_db.py --dry-run
  python backend/tools/migrate_users_to_db.py --migrate

This script is idempotent: it will create the `users` table if missing and skip users that already exist by id or username.
"""
import json
import argparse
import os
from pathlib import Path
import sqlite3

ROOT = Path(__file__).resolve().parents[1]
USERS_PATH = Path(os.environ.get('USERS_PATH', ROOT / 'users.jsonl'))
DB_PATH = Path(os.environ.get('AUTH_DB_PATH', ROOT / 'auth.db'))


def _get_conn():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_users_table():
    conn = _get_conn()
    cur = conn.cursor()
    cur.execute('''
    CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE,
        email TEXT,
        password_hash TEXT,
        created_at INTEGER
    )
    ''')
    conn.commit()
    conn.close()


def migrate(dry_run: bool = True):
    if not USERS_PATH.exists():
        print('No users.jsonl found at', USERS_PATH)
        return
    init_users_table()
    conn = _get_conn()
    cur = conn.cursor()
    added = 0
    skipped = 0
    for line in USERS_PATH.read_text(encoding='utf-8').splitlines():
        line=line.strip()
        if not line: continue
        try:
            rec = json.loads(line)
        except Exception:
            continue
        uid = rec.get('id') or rec.get('user_id') or None
        uname = (rec.get('username') or rec.get('email') or '').lower()
        pw = rec.get('password_hash') or rec.get('password') or None
        created = int(rec.get('created') or rec.get('created_at') or 0)
        if not uid or not uname:
            skipped += 1
            continue
        # Check existing
        cur.execute('SELECT id FROM users WHERE id=? OR username=?', (uid, uname))
        if cur.fetchone():
            skipped += 1
            continue
        print(('DRY:' if dry_run else 'MIGRATING:'), uid, uname)
        if not dry_run:
            cur.execute('INSERT INTO users (id, username, email, password_hash, created_at) VALUES (?,?,?,?,?)',
                        (uid, uname if '@' not in uname else uname, (uname if '@' in uname else None), pw, created))
            conn.commit()
            added += 1
    conn.close()
    print(f'Migration complete. Added: {added}, Skipped: {skipped}')


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--dry-run', action='store_true', help='Show what would be migrated')
    p.add_argument('--migrate', action='store_true', help='Perform the migration')
    args = p.parse_args()
    if args.migrate:
        migrate(dry_run=False)
    else:
        migrate(dry_run=True)


if __name__ == '__main__':
    main()
