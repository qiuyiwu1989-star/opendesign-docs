#!/usr/bin/env python3
"""Root-run, local PostgreSQL backup. No environment credentials or live restore."""
import argparse
import datetime as dt
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import tempfile

ROOT = Path('/var/backups/opendesign-docs/studio-daily')
KEY = Path('/var/lib/opendesign-docs-studio/session-signing-key')
ROLE = 'opendesign-docs-studio'
DATABASE = 'opendesign_docs_studio'
FILES = {'database.dump', 'session-signing-key', 'manifest.json'}
NAME = re.compile(r'^backup-\d{8}T\d{6}Z-[a-z0-9_]{8}$')


def private_directory(path):
    # Refuse symlinks in any existing ancestor, including the final component.
    for parent in reversed((path, *path.parents)):
        if parent.is_symlink():
            raise RuntimeError('Backup directory cannot contain symlinks')
    path.mkdir(mode=0o700, parents=True, exist_ok=True)
    info = path.stat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.geteuid() or info.st_mode & 0o077:
        raise RuntimeError('Backup directory must be owned by root and private (0700)')


def read_key(path):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd, 'rb') as stream:
        info = os.fstat(stream.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or info.st_mode & 0o077:
            raise RuntimeError('Session signing key must be a private regular file')
        value = stream.read(33)
    if len(value) != 32:
        raise RuntimeError('Invalid signing key length')
    return value


def digest(path):
    with path.open('rb') as stream:
        hasher = hashlib.sha256()
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            hasher.update(chunk)
        return hasher.hexdigest()


def prune(root, days, now):
    """Remove only old complete backups with exact inventory and valid checksums."""
    for path in root.iterdir():
        if not NAME.fullmatch(path.name) or path.is_symlink() or not path.is_dir():
            continue
        try:
            if {p.name for p in path.iterdir()} != FILES:
                continue
            if any(p.is_symlink() or not p.is_file() or p.stat().st_nlink != 1 for p in path.iterdir()):
                continue
            manifest = json.loads((path / 'manifest.json').read_text())
            if manifest.get('format') != 'opendesign-studio-pgdump-v1' or manifest.get('database') != DATABASE:
                continue
            created = dt.datetime.fromisoformat(manifest['created_at'])
            if created.tzinfo is None or created > now - dt.timedelta(days=days):
                continue
            if manifest.get('sha256') != {name: digest(path / name) for name in ('database.dump', 'session-signing-key')}:
                continue
            # No recursive removal of unknown content.
            for name in FILES:
                (path / name).unlink()
            path.rmdir()
        except (OSError, ValueError, KeyError, TypeError):
            # A malformed or changed backup is retained for operator review.
            continue


def backup(root=ROOT, key=KEY, days=14):
    os.umask(0o077)
    private_directory(root)
    lock_fd = os.open(root / '.lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    with os.fdopen(lock_fd, 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        original_key = read_key(key)
        now = dt.datetime.now(dt.timezone.utc)
        stage = Path(tempfile.mkdtemp(prefix='.pending-', dir=root))
        try:
            (stage / 'session-signing-key').write_bytes(original_key)
            # pg_dump uses a transactionally consistent snapshot and includes daily_usage.
            # Only the existing dedicated role accesses the dedicated database.
            command = ['/usr/sbin/runuser', '-u', ROLE, '--', '/usr/bin/pg_dump',
                       '--host=/var/run/postgresql', '--no-password', '--format=custom',
                       '--no-owner', '--no-privileges', '--dbname=' + DATABASE]
            with (stage / 'database.dump').open('xb') as dump:
                subprocess.run(command, stdout=dump, stderr=subprocess.PIPE, check=True,
                               timeout=600, env={'PATH': '/usr/bin:/bin', 'LANG': 'C'})
                dump.flush()
                os.fsync(dump.fileno())
            if not (stage / 'database.dump').stat().st_size:
                raise RuntimeError('Empty database dump')
            subprocess.run(['/usr/bin/pg_restore', '--list', str(stage / 'database.dump')],
                           stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, check=True, timeout=60)
            if read_key(key) != original_key:
                raise RuntimeError('Signing key changed during backup; retry after rotation completes')
            manifest = {'format': 'opendesign-studio-pgdump-v1', 'database': DATABASE,
                        'created_at': now.isoformat(), 'sha256': {
                            name: digest(stage / name) for name in ('database.dump', 'session-signing-key')}}
            (stage / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
            for path in stage.iterdir():
                with path.open('rb') as stream:
                    os.fsync(stream.fileno())
            final = root / ('backup-' + now.strftime('%Y%m%dT%H%M%SZ') + '-' + stage.name.removeprefix('.pending-'))
            stage.rename(final)
            directory_fd = os.open(root, os.O_RDONLY | os.O_DIRECTORY)
            try:
                os.fsync(directory_fd)
            finally:
                os.close(directory_fd)
        except BaseException:
            if stage.exists():
                shutil.rmtree(stage)  # Only our mkdtemp directory, never existing backups.
            raise
        prune(root, days, now)
        print('Studio backup completed: ' + final.name)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--retention-days', type=int, default=14)
    args = parser.parse_args()
    if os.geteuid() != 0:
        parser.error('Run as root through the provided service')
    if args.retention_days < 2:
        parser.error('Retention must be at least 2 days')
    try:
        backup(days=args.retention_days)
    except Exception as error:
        # No raw subprocess output, credentials, signing key or document content in journal.
        print('Studio backup failed (' + type(error).__name__ + '); existing backups retained.', file=__import__('sys').stderr)
        raise SystemExit(1)
