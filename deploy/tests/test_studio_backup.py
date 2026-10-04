import datetime as dt
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('studio_backup', Path(__file__).parents[1] / 'studio-backup.py')
b = importlib.util.module_from_spec(spec)
spec.loader.exec_module(b)


class BackupTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name).resolve() / 'backups'
        self.key = Path(self.tmp.name).resolve() / 'key'
        self.key.write_bytes(b'x' * 32)
        self.key.chmod(0o600)

    def fake_run(self, command, **kwargs):
        if '/usr/bin/pg_dump' in command:
            kwargs['stdout'].write(b'fake dump')
        return subprocess.CompletedProcess(command, 0)

    def test_success_private_and_original_key_unchanged(self):
        with patch.object(b.subprocess, 'run', self.fake_run):
            b.backup(self.root, self.key)
        result = next(self.root.glob('backup-*'))
        self.assertEqual({p.name for p in result.iterdir()}, b.FILES)
        self.assertEqual(self.key.read_bytes(), b'x' * 32)
        self.assertTrue(all(p.stat().st_mode & 0o077 == 0 for p in result.iterdir()))
        self.assertEqual(result.stat().st_mode & 0o077, 0)

    def test_failure_keeps_existing_and_cleans_partial(self):
        self.root.mkdir(mode=0o700)
        sentinel = self.root / 'initial-release.dump'
        sentinel.write_bytes(b'keep')
        with patch.object(b.subprocess, 'run', side_effect=subprocess.CalledProcessError(1, ['pg_dump'])):
            with self.assertRaises(subprocess.CalledProcessError):
                b.backup(self.root, self.key)
        self.assertEqual(sentinel.read_bytes(), b'keep')
        self.assertEqual(list(self.root.glob('.pending-*')), [])
        self.assertEqual(list(self.root.glob('backup-*')), [])

    def test_reject_symlink_and_public_key(self):
        link = Path(self.tmp.name).resolve() / 'link'
        link.symlink_to(self.key)
        with self.assertRaises(OSError):
            b.read_key(link)
        self.key.chmod(0o644)
        with self.assertRaises(RuntimeError):
            b.read_key(self.key)

    def test_rotation_during_dump_rejected(self):
        def rotate(command, **kwargs):
            self.fake_run(command, **kwargs)
            self.key.write_bytes(b'y' * 32)
        with patch.object(b.subprocess, 'run', rotate):
            with self.assertRaises(RuntimeError):
                b.backup(self.root, self.key)
        self.assertEqual(list(self.root.glob('backup-*')), [])

    def test_retention_removes_only_verified_complete_old_backup(self):
        with patch.object(b.subprocess, 'run', self.fake_run):
            b.backup(self.root, self.key)
        result = next(self.root.glob('backup-*'))
        future = dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=15)
        (result / 'unknown.txt').write_text('keep')
        b.prune(self.root, 14, future)
        self.assertTrue(result.exists())
        (result / 'unknown.txt').unlink()
        original = (result / 'database.dump').read_bytes()
        (result / 'database.dump').write_bytes(b'changed')
        b.prune(self.root, 14, future)
        self.assertTrue(result.exists())
        (result / 'database.dump').write_bytes(original)
        b.prune(self.root, 14, future)
        self.assertFalse(result.exists())


if __name__ == '__main__':
    unittest.main()
