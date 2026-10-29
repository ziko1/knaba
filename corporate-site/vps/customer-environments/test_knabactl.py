"""Meaningful offline checks of the destructive-operation boundaries.

No Docker daemon, host mutation, network, real credentials, or customer data.
SQLite backup tests use an actual live WAL database, not mocked database calls.
"""
import copy
import datetime as dt
import importlib.util
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('knabactl', Path(__file__).with_name('knabactl.py'))
ctl = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ctl)


class EnvironmentsTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)

    def tearDown(self):
        self.temp.cleanup()

    def release(self):
        p = self.root / 'release'
        for name in ('dist/client/index.html', 'dist/server/index.js', 'dist/vps/render-page.mjs',
                     'vps/server.mjs', 'vps/manage.mjs', 'drizzle/meta/_journal.json', 'package.json'):
            file = p / name
            file.parent.mkdir(parents=True, exist_ok=True)
            file.write_text('synthetic fixture ' + name)
        return p

    def approval(self):
        return {'environment': 'production', 'hostname': 'knaba.de',
                'artifact_sha256': 'a' * 64, 'expected_current_artifact': 'b' * 64,
                'configuration_sha256': 'c' * 64, 'user_approved': True, 'customer_approved': True,
                'user_approval_reference': 'synthetic:user-confirmation',
                'customer_approval_reference': 'synthetic:customer-confirmation',
                'issued_at': '2026-10-28T20:00:00Z', 'expires_at': '2026-10-29T20:00:00Z'}

    def validate(self, receipt):
        return ctl.validate_approval(receipt, artifact='a' * 64, previous='b' * 64,
            configuration='c' * 64, clock=dt.datetime(2026, 10, 28, 22, tzinfo=dt.timezone.utc))

    def test_approval_requires_both_real_boolean_fields(self):
        self.assertTrue(self.validate(self.approval()))
        for key in ('user_approved', 'customer_approved'):
            for value in (False, None, 1, 'true'):
                with self.subTest(key=key, value=value):
                    receipt = self.approval(); receipt[key] = value
                    with self.assertRaises(ctl.Refused): self.validate(receipt)

    def test_approval_is_bound_to_artifact_target_current_and_config(self):
        for key in ('artifact_sha256', 'expected_current_artifact', 'configuration_sha256', 'hostname', 'environment'):
            receipt = self.approval(); receipt[key] = 'wrong'
            with self.subTest(key=key), self.assertRaises(ctl.Refused): self.validate(receipt)

    def test_approval_expiry_future_and_long_lifetime_are_denied(self):
        for key, value in (('expires_at', '2026-10-28T21:00:00Z'),
                           ('issued_at', '2026-10-29T00:00:00Z'),
                           ('expires_at', '2027-01-01T00:00:00Z'),
                           ('expires_at', '2026-10-29T20:00:00')):
            receipt = self.approval(); receipt[key] = value
            with self.subTest(value=value), self.assertRaises(ctl.Refused): self.validate(receipt)

    def test_approval_missing_references_cannot_be_used(self):
        for value in ('', 'PENDING', 'REPLACE_ME', None):
            receipt = self.approval(); receipt['customer_approval_reference'] = value
            with self.assertRaises(ctl.Refused): self.validate(receipt)

    def test_full_runtime_manifest_detects_backend_not_only_static_mutations(self):
        path = self.release()
        before = ctl.manifest(path)
        (path / 'vps/server.mjs').write_text('changed backend')
        after = ctl.manifest(path)
        self.assertNotEqual(ctl.artifact_id(before), ctl.artifact_id(after))
        self.assertEqual(before['dist/client/index.html'], after['dist/client/index.html'])

    def test_release_with_state_or_symlinks_is_rejected(self):
        path = self.release()
        (path / 'state').mkdir()
        with self.assertRaises(ctl.Refused): ctl.manifest(path)
        (path / 'state').rmdir()
        (path / 'dist/client/private').symlink_to('/etc/passwd')
        with self.assertRaises(ctl.Refused): ctl.manifest(path)

    def test_provider_secrets_are_not_copied_with_operator_identity(self):
        source = self.root / 'site.env'
        source.write_text('OWNER_EMAIL="owner@example.invalid"\nKNABA_DEVELOPER_EMAIL=dev@example.invalid\n'
                          'TURNSTILE_SECRET_KEY=synthetic-do-not-copy\nKNABA_GOOGLE_CLIENT_SECRET=synthetic\n')
        result = ctl.read_env_identity(source)
        self.assertIn('owner@example.invalid', result)
        self.assertIn('dev@example.invalid', result)
        self.assertNotIn('SECRET', result)
        self.assertNotIn('synthetic', result)

    def test_separate_files_users_networks_and_loopback_bindings(self):
        image = 'sha256:' + 'd' * 64
        production = ctl.compose_document('production', image, 1101, 1101, self.root)
        testing = ctl.compose_document('testing', image, 1102, 1102, self.root)
        p, t = production['services']['web'], testing['services']['web']
        self.assertNotEqual(p['volumes'], t['volumes'])
        self.assertNotEqual(p['env_file'], t['env_file'])
        self.assertNotEqual(p['user'], t['user'])
        self.assertNotEqual(production['networks'], testing['networks'])
        for document in (production, testing):
            for service in document['services'].values():
                self.assertTrue(service['read_only'])
                self.assertEqual(service['cap_drop'], ['ALL'])
                self.assertTrue(all(port.startswith('127.0.0.1:') for port in service['ports']))
                self.assertNotIn('/var/run/docker.sock', json.dumps(service))
        self.assertEqual(t['environment']['KNABA_PUBLIC_ORIGIN'], 'https://testing.knaba.de')
        self.assertEqual(p['environment']['KNABA_PUBLIC_ORIGIN'], 'https://knaba.de')
        self.assertEqual(t['environment']['KNABA_LOCAL_TEST'], '0')
        self.assertEqual(p['environment']['KNABA_LOCAL_TEST'], '0')
        self.assertEqual(p['environment']['ASSISTANT_NOTIFICATIONS_ENABLED'], '0')
        self.assertNotIn('preview', production['services'])

    def test_no_root_runtime_or_unpinned_image(self):
        with self.assertRaises(ctl.Refused): ctl.compose_document('production', 'node:latest', 1000, 1000)
        with self.assertRaises(ctl.Refused): ctl.compose_document('testing', 'sha256:' + 'a' * 64, 0, 0)

    def test_source_inspection_rejects_mount_overrides_and_wrong_entrypoint(self):
        self.release()
        (self.root / 'state').mkdir()
        (self.root / 'config').mkdir()
        (self.root / 'config/site.env').write_text('OWNER_EMAIL=owner@example.invalid\n')
        container = {'Id': 'synthetic', 'Image': 'sha256:' + 'd' * 64,
            'State': {'Running': True, 'Health': {'Status': 'healthy'}},
            'HostConfig': {'ReadonlyRootfs': True},
            'Mounts': [{'Destination': '/app', 'Source': str(self.root / 'release'), 'RW': False},
                       {'Destination': '/var/lib/knaba', 'Source': str(self.root / 'state'), 'RW': True}],
            'Config': {'Cmd': ['node', '/app/vps/server.mjs'],
                       'Env': ['KNABA_DB_PATH=/var/lib/knaba/site.sqlite', 'KNABA_PUBLIC_ORIGIN=https://kneba.vsp.rest']}}
        variants = []
        writable = copy.deepcopy(container); writable['Mounts'][0]['RW'] = True; variants.append(writable)
        override = copy.deepcopy(container)
        override['Mounts'].append({'Destination': '/app/vps/server.mjs', 'Source': '/different/server.mjs', 'RW': False})
        variants.append(override)
        command = copy.deepcopy(container); command['Config']['Cmd'] = ['node', '/different/server.mjs']; variants.append(command)
        with patch.object(ctl, 'SOURCE', self.root), patch.object(ctl, 'probe', return_value={'status': 200}):
            with patch.object(ctl, 'run', return_value=json.dumps([container])):
                self.assertEqual(ctl.inspect_source()['ready_status'], 200)
            for value in variants:
                with patch.object(ctl, 'run', return_value=json.dumps([value])), self.assertRaises(ctl.Refused):
                    ctl.inspect_source()

    def test_real_online_backup_captures_committed_wal_and_preserves_source(self):
        source = self.root / 'live.sqlite'
        db = sqlite3.connect(source)
        try:
            db.execute('PRAGMA journal_mode=WAL')
            db.execute('CREATE TABLE sample(id INTEGER PRIMARY KEY, text TEXT)')
            db.execute('INSERT INTO sample VALUES(1, ?)', ('synthetic-before-backup',))
            db.commit()
            target = self.root / 'backup.sqlite'
            result = ctl.database_snapshot(source, target)
            self.assertEqual(result['integrity'], 'ok')
            with sqlite3.connect(target) as restored:
                self.assertEqual(restored.execute('SELECT text FROM sample').fetchone()[0], 'synthetic-before-backup')
            db.execute('INSERT INTO sample VALUES(2, ?)', ('synthetic-after-backup',)); db.commit()
            with sqlite3.connect(target) as restored:
                self.assertEqual(restored.execute('SELECT count(*) FROM sample').fetchone()[0], 1)
            self.assertEqual(db.execute('SELECT count(*) FROM sample').fetchone()[0], 2)
            self.assertEqual(target.stat().st_mode & 0o777, 0o600)
        finally:
            db.close()

    def test_no_overwrite_of_existing_backup_or_private_config(self):
        file = self.root / 'private.json'
        ctl.private_write(file, 'first')
        with self.assertRaises(ctl.Refused): ctl.private_write(file, 'second')
        self.assertEqual(file.read_text(), 'first')
        dbpath = self.root / 'db.sqlite'
        with sqlite3.connect(dbpath) as db: db.execute('CREATE TABLE sample(id INTEGER)')
        target = self.root / 'backup.sqlite'; target.write_text('preserve')
        with self.assertRaises(ctl.Refused): ctl.database_snapshot(dbpath, target)
        self.assertEqual(target.read_text(), 'preserve')


if __name__ == '__main__':
    unittest.main()
