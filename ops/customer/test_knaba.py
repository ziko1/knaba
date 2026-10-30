"""Operator safety tests. Docker commands are explicit doubles, never runtime proof."""
import contextlib
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import sqlite3
import tarfile
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('knaba_operator', Path(__file__).with_name('knaba.py'))
k = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(k)

NEEDED = ['corporate-site/dist/client/index.html', 'corporate-site/dist/server/index.js',
          'corporate-site/dist/vps/render-page.mjs',
          'corporate-site/vps/server.mjs', 'corporate-site/vps/manage.mjs',
          'corporate-site/drizzle/meta/_journal.json', 'erp/package-lock.json',
          'erp/infra/Dockerfile', 'ops/customer/compose.yaml', 'ops/customer/knaba.py', 'ops/customer/prototype-seed.mts']
TEST_SHA = '1' * 40

def settings(mode='production'):
    return k.normalize_settings({'siteDomain': 'site.example.test', 'erpDomain': 'erp.example.test',
        'ownerEmail': 'owner@example.test', 'developerEmail': 'developer@example.test',
        'companyId': 'knaba-prototype-test' if mode == 'prototype' else 'verified-company', 'mode': mode})

def make_archive(path, *, extra=None, corrupt=False, contents=None):
    files = {name: ('synthetic fixture: ' + name).encode() for name in NEEDED}
    files.update(contents or {})
    manifest = {'schemaVersion': 1, 'artifactScope': 'customer-prototype', 'sourceSha': TEST_SHA,
                'files': {name: {'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data)} for name, data in files.items()}}
    with tarfile.open(path, 'w:gz') as tf:
        data = json.dumps(manifest).encode()
        info = tarfile.TarInfo('release.json'); info.size = len(data); info.mode = 0o644
        tf.addfile(info, io.BytesIO(data))
        for name, data in files.items():
            if corrupt and name == NEEDED[0]:
                data = data.replace(b'synthetic', b'wrongcode')
            info = tarfile.TarInfo(name); info.size = len(data); info.mode = 0o644
            tf.addfile(info, io.BytesIO(data))
        if extra:
            info, data = extra
            tf.addfile(info, io.BytesIO(data))
    return k.digest_file(path)

class OperatorTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='knaba-operator-test-')
        self.base = Path(self.temp.name)
        self.addCleanup(self.temp.cleanup)

    def configured(self, mode='production'):
        root = self.base / 'install'
        with patch.object(k.os, 'chown'):
            k.configure(root, settings(mode), os.getuid(), os.getgid())
        return root

    def test_configuration_preserves_secrets_on_repeat(self):
        root = self.configured()
        before = {x.name: x.read_bytes() for x in (root / 'config').iterdir()}
        with patch.object(k.os, 'chown'):
            self.assertEqual(k.configure(root, settings(), os.getuid(), os.getgid())['status'], 'UNCHANGED')
        self.assertEqual(before, {x.name: x.read_bytes() for x in (root / 'config').iterdir()})
        self.assertEqual(k.read_env(root / 'config/erp.env')['APP_MODE'], 'PRODUCTION')
        self.assertEqual(k.read_env(root / 'config/erp.env')['LIVE_SEND_ALLOWED'], 'false')
        self.assertEqual(k.read_env(root / 'config/erp.env')['PUBLIC_ORIGIN'], 'https://erp.example.test')
        self.assertEqual(k.read_env(root / 'config/erp.env')['BOT_WEBSITE_ORIGIN'], 'https://site.example.test')
        for file in (root / 'config').iterdir():
            self.assertEqual(file.stat().st_mode & 0o777, 0o600)

    def test_unmarked_customer_directory_never_overwritten(self):
        root = self.base / 'existing'; root.mkdir()
        marker = root / 'customer-data'; marker.write_text('retain')
        with self.assertRaises(k.OperatorError), patch.object(k.os, 'chown'):
            k.configure(root, settings(), os.getuid(), os.getgid())
        self.assertEqual(marker.read_text(), 'retain')
        self.assertEqual(list(root.iterdir()), [marker])

    def test_marker_mismatch_and_config_change_fail_closed(self):
        root = self.configured()
        edited = settings(); edited['ownerEmail'] = 'other@example.test'
        with self.assertRaises(k.OperatorError):
            k.configure(root, edited, os.getuid(), os.getgid())
        m = k.private_json(root / k.MARKER); m['root'] = '/different'; k.write_json(root / k.MARKER, m)
        with self.assertRaises(k.OperatorError):
            k.load_install(root)

    def test_prototype_is_explicit_and_separate_from_real_company(self):
        root = self.configured('prototype')
        self.assertEqual(k.read_env(root / 'config/erp.env')['APP_MODE'], 'TEST')
        self.assertFalse(k.load_install(root)['realDataAllowed'])
        self.assertEqual(k.read_env(root / 'config/site.env')['KNABA_RELEASE_STAGE'], 'prototype')
        raw = settings(); raw['mode'] = 'prototype'
        with self.assertRaises(k.OperatorError):
            k.normalize_settings(raw)

    def test_private_input_refuses_readable_and_symlink_files(self):
        file = self.base / 'input.json'; file.write_text('{}'); file.chmod(0o644)
        with self.assertRaises(k.OperatorError):
            k.private_json(file)
        file.chmod(0o600); self.assertEqual(k.private_json(file), {})
        link = self.base / 'link.json'; link.symlink_to(file)
        with self.assertRaises(k.OperatorError):
            k.private_json(link)

    def test_environment_and_domains_reject_injection(self):
        for bad in ['good.example.test\nother.example.test', 'https://site.example.test', '$(touch /tmp/no)', 'example.test:443']:
            raw = settings(); raw['siteDomain'] = bad
            with self.assertRaises(k.OperatorError):
                k.normalize_settings(raw)
        for value in ["x'\nEVIL='y", 'x\x00y']:
            with self.assertRaises(k.OperatorError):
                k.env_text({'VALUE': value})

    def test_archive_roundtrip_and_stage_are_idempotent(self):
        root = self.configured(); archive = self.base / 'release.tar.gz'
        digest = make_archive(archive)
        m = k.archive_manifest(archive, digest)
        self.assertEqual(m['sourceSha'], TEST_SHA)
        k.stage(root, archive, digest)
        original = (root / 'releases' / TEST_SHA / NEEDED[0]).stat().st_mtime_ns
        k.stage(root, archive, digest)
        self.assertEqual((root / 'releases' / TEST_SHA / NEEDED[0]).stat().st_mtime_ns, original)
        self.assertEqual(k.verify_release(root / 'releases' / TEST_SHA), m)

    def test_handoff_includes_scoped_mobile_instructions_without_widening_archive_paths(self):
        root = self.configured(); archive = self.base / 'handoff.tar.gz'
        contents = {'docs/mobile/DISTRIBUTION_2026-10-28_UK.md': b'synthetic mobile instructions',
                    'scripts/mobile/check-localizations.py': b'# synthetic source checker',
                    'erp/docs/BACKUP_RESTORE.md': b'synthetic recovery instructions',
                    'erp/.env.example': b'LIVE_SEND_ALLOWED=false\n'}
        digest = make_archive(archive, contents=contents)
        k.stage(root, archive, digest)
        for name, expected in contents.items():
            self.assertEqual((root / 'releases' / TEST_SHA / name).read_bytes(), expected)
        for name in ['scripts/unrelated.py', 'docs/other-project.md', 'docs/mobile/../escape.md']:
            digest = make_archive(archive, contents={name: b'refused'})
            with self.assertRaises(k.OperatorError):
                k.archive_manifest(archive, digest)

    def test_archive_rejects_wrong_checksum_and_internal_tampering(self):
        archive = self.base / 'release.tar.gz'; digest = make_archive(archive)
        with self.assertRaises(k.OperatorError):
            k.archive_manifest(archive, '0' * 64)
        digest = make_archive(archive, corrupt=True)
        with self.assertRaises(k.OperatorError):
            k.archive_manifest(archive, digest)

    def test_archive_rejects_path_escape_links_duplicates_special_permissions(self):
        entries = []
        for name in ['/tmp/outside', '../outside', 'ops/../../outside']:
            info = tarfile.TarInfo(name); info.size = 1; entries.append((info, b'x'))
        info = tarfile.TarInfo('ops/link'); info.type = tarfile.SYMTYPE; info.linkname = '/etc/passwd'; entries.append((info, b''))
        info = tarfile.TarInfo(NEEDED[0]); info.size = 1; entries.append((info, b'x'))
        info = tarfile.TarInfo('ops/suid'); info.size = 1; info.mode = 0o4755; entries.append((info, b'x'))
        for index, entry in enumerate(entries):
            archive = self.base / ('bad-%s.tar.gz' % index); digest = make_archive(archive, extra=entry)
            with self.subTest(index=index), self.assertRaises(k.OperatorError):
                k.archive_manifest(archive, digest)

    def test_staged_artifact_tampering_blocks_reuse(self):
        root = self.configured(); archive = self.base / 'release.tar.gz'; digest = make_archive(archive)
        k.stage(root, archive, digest)
        (root / 'releases' / TEST_SHA / NEEDED[0]).write_text('unreviewed')
        with self.assertRaises(k.OperatorError):
            k.stage(root, archive, digest)

    def test_exclusive_lock_refuses_concurrent_operator(self):
        root = self.configured()
        with k.lock(root):
            with self.assertRaises(k.OperatorError):
                with k.lock(root):
                    pass

    def test_existing_vps_and_non_knaba_paths_are_protected(self):
        with patch.object(k.os, 'geteuid', return_value=0):
            for value in ['/srv/knaba/vps', '/srv', '/srv/other', '/srv/knaba/customer/nested']:
                with self.subTest(path=value), self.assertRaises(k.OperatorError):
                    k.root_for_write(value)

    def test_inventory_reads_only_scoped_copies_without_following_symlinks(self):
        root = self.base / 'knaba'; root.mkdir()
        (root / 'package.json').write_text('{"name":"knaba-test"}')
        secret = self.base / 'outside'; secret.mkdir(); (secret / 'package.json').write_text('{"name":"knaba-secret"}')
        (root / 'escape').symlink_to(secret, target_is_directory=True)
        result = k.inventory([root])
        self.assertEqual([x['path'] for x in result['copies']], [str(root)])
        self.assertEqual(result['deleted'], 0)

    def test_sqlite_online_backup_and_hashes_are_real(self):
        root = self.configured()
        db_path = root / 'state/site/site.sqlite'
        with sqlite3.connect(db_path) as db:
            db.execute('CREATE TABLE test_data (id INTEGER PRIMARY KEY,value TEXT)')
            db.execute('INSERT INTO test_data VALUES (1,?)', ['must survive'])
        app = k.Installation(root)
        folder = app.backup()
        report = k.private_json(folder / 'backup.json')
        self.assertEqual(k.digest_file(folder / 'site.sqlite'), report['files']['site.sqlite'])
        with sqlite3.connect(folder / 'site.sqlite') as db:
            self.assertEqual(db.execute('SELECT value FROM test_data').fetchone()[0], 'must survive')
            self.assertEqual(db.execute('PRAGMA integrity_check').fetchone()[0], 'ok')
        self.assertFalse((folder / 'postgres.dump').exists())

    def test_failed_owner_update_restores_private_settings_and_sqlite(self):
        root = self.configured()
        db_path = root / 'state/site/site.sqlite'
        with sqlite3.connect(db_path) as db:
            db.execute('CREATE TABLE test_data (value TEXT)'); db.execute("INSERT INTO test_data VALUES ('original')")
        app = k.Installation(root)
        input_file = self.base / 'owner.json'
        k.write_json(input_file, {'currentEmail': 'owner@example.test', 'newEmail': 'changed@example.test', 'identityVerified': True})
        def failed_command(*args, **kwargs):
            with sqlite3.connect(db_path) as db:
                db.execute("UPDATE test_data SET value='modified'")
            raise k.OperatorError('synthetic failure after database mutation')
        with patch.object(app, 'compose', return_value=b''), patch.object(app, 'site_command', side_effect=failed_command), patch.object(k.os, 'chown'):
            with self.assertRaises(k.OperatorError):
                app.owner_update(input_file)
        self.assertEqual(k.private_json(root / 'config/settings.json')['ownerEmail'], 'owner@example.test')
        with sqlite3.connect(db_path) as db:
            self.assertEqual(db.execute('SELECT value FROM test_data').fetchone()[0], 'original')
        self.assertFalse((root / 'owner-maintenance.pending.json').exists())
        self.assertTrue(list((root / 'state/site').glob('failed-owner-*.sqlite')))

    def test_preflight_reports_missing_docker_without_writing(self):
        root = self.base / 'not-created'
        with patch.object(k.shutil, 'which', return_value=None), patch.object(k, 'storage_report', return_value={'cutoverAllowed': True}):
            with self.assertRaisesRegex(k.OperatorError, 'Docker Engine'):
                k.preflight(root)
        self.assertFalse(root.exists())

    def test_provider_configuration_never_overrides_identity_database_or_activates_sends_implicitly(self):
        for key in ['DATABASE_URL', 'OWNER_EMAIL', 'APP_MODE', 'COMPANY_ID', 'AUTH_ENCRYPTION_KEY']:
            with self.subTest(key=key), self.assertRaises(k.OperatorError):
                k.validate_provider_input({'erp': {key: 'injected'}}, 'production')
        site, erp, approval = k.validate_provider_input({'erp': {'WHATSAPP_ACCESS_TOKEN': 'private-synthetic-token'}}, 'production')
        self.assertEqual(erp['LIVE_SEND_ALLOWED'], 'false')
        self.assertEqual(erp['TELEGRAM_LIVE_SEND_ALLOWED'], 'false')
        with self.assertRaises(k.OperatorError):
            k.validate_provider_input({'erp': {'LIVE_SEND_ALLOWED': 'true'}}, 'production')
        approved = {'erp': {'LIVE_SEND_ALLOWED': 'true'}, 'approval': {'reference': 'operator-provider-approval', 'liveSendingApproved': True}}
        with self.assertRaises(k.OperatorError):
            k.validate_provider_input(approved, 'prototype', enable_live_send=True)
        self.assertEqual(k.validate_provider_input(approved, 'production', enable_live_send=True)[1]['LIVE_SEND_ALLOWED'], 'true')

    def test_paid_ai_requires_separate_explicit_operator_approval_and_budget(self):
        raw = {'erp': {'DEEPSEEK_API_KEY': 'private-synthetic-key'}}
        with self.assertRaises(k.OperatorError):
            k.validate_provider_input(raw, 'production')
        with self.assertRaises(k.OperatorError):
            k.validate_provider_input(raw, 'production', enable_paid_ai=True)
        raw['approval'] = {'reference': 'operator-budget-evidence', 'paidAiApproved': True, 'budgetCents': 1000}
        self.assertEqual(k.validate_provider_input(raw, 'production', enable_paid_ai=True)[1]['DEEPSEEK_API_KEY'], 'private-synthetic-key')
        with self.assertRaises(k.OperatorError):
            k.validate_provider_input(raw, 'prototype', enable_paid_ai=True)

    def test_release_configuration_keeps_owner_and_secrets_and_is_recoverable(self):
        root = self.configured(); archive = self.base / 'release.tar.gz'; digest = make_archive(archive)
        k.stage(root, archive, digest)
        app = k.Installation(root); app.set_current(TEST_SHA)
        before = k.read_env(root / 'config/site.env')
        path = self.base / 'release.json'; k.write_json(path, {'KNABA_VERIFIED_TELEGRAM_BOT': 'SyntheticCompanyBot'})
        with patch.object(app, 'compose', return_value=b''):
            result = app.release_config(path)
        self.assertEqual(result['liveProviderDelivery'], 'NOT_RUN')
        after = k.read_env(root / 'config/site.env')
        self.assertEqual(after['OWNER_EMAIL'], before['OWNER_EMAIL'])
        self.assertEqual(after['KNABA_VERIFIED_TELEGRAM_BOT'], 'SyntheticCompanyBot')
        self.assertFalse((root / 'configuration.pending.json').exists())
        self.assertTrue(list((root / 'config-history').glob('*/site.env')))

    def test_failed_configuration_restart_restores_only_config_without_replacing_customer_database(self):
        root = self.configured(); archive = self.base / 'release.tar.gz'; digest = make_archive(archive)
        k.stage(root, archive, digest)
        app = k.Installation(root); app.set_current(TEST_SHA)
        before = (root / 'config/site.env').read_bytes()
        database = root / 'state/site/customer-marker'; database.write_bytes(b'preserve-customer-data')
        path = self.base / 'release.json'; k.write_json(path, {'KNABA_VERIFIED_TELEGRAM_BOT': 'SyntheticCompanyBot'})
        with patch.object(app, 'compose', return_value=b''), patch.object(app, 'restart', side_effect=[k.OperatorError('synthetic restart failure'), None]):
            with self.assertRaises(k.OperatorError):
                app.release_config(path)
        self.assertEqual((root / 'config/site.env').read_bytes(), before)
        self.assertEqual(database.read_bytes(), b'preserve-customer-data')
        self.assertFalse((root / 'configuration.pending.json').exists())

    def test_missing_captcha_pair_refuses_before_stopping_services(self):
        root = self.configured(); app = k.Installation(root)
        path = self.base / 'provider.json'; k.write_json(path, {'site': {'TURNSTILE_SITE_KEY': 'synthetic-only'}})
        args = SimpleNamespace(input=path, enable_live_send=False, enable_paid_ai=False)
        with patch.object(app, 'compose') as execute:
            with self.assertRaises(k.OperatorError):
                app.provider_config(args)
            execute.assert_not_called()

    def test_prototype_install_and_repeat_orchestration_uses_explicit_docker_doubles(self):
        root = self.base / 'fresh-install'; archive = self.base / 'release.tar.gz'; digest = make_archive(archive)
        config = self.base / 'settings.json'; k.write_json(config, settings('prototype'))
        args = SimpleNamespace(root=root, archive=archive, sha256=digest, settings=config, command='install',
            mode='prototype', synthetic_only=True, prepare_erp=False, expect_current=None)
        calls = []
        def docker_double(app, command, **kwargs):
            calls.append(list(command)); return b''
        with patch.object(k, 'root_for_write', return_value=root), patch.object(k, 'preflight', return_value={}), \
             patch.object(k, 'runtime_user', return_value=(os.getuid(), os.getgid())), patch.object(k.os, 'chown'), \
             patch.object(k.Installation, 'compose', docker_double), \
             patch.object(k.Installation, 'verify', return_value={'status': 'PASS_IN_SCOPE'}):
            result = k.install_or_update(args)
            self.assertEqual(result['status'], 'DEPLOYED_PROTOTYPE')
            self.assertTrue(k.load_install(root)['prototypeSeeded'])
            self.assertTrue(any('scripts/customer-prototype.mts' in command for command in calls))
            credentials = k.private_json(root / 'config/prototype-credentials.json')
            self.assertEqual(len(credentials['password']), 64)
            calls.clear()
            self.assertEqual(k.install_or_update(args)['status'], 'UNCHANGED')
            self.assertEqual(calls, [])
            self.assertEqual(k.private_json(root / 'config/prototype-credentials.json'), credentials)

if __name__ == '__main__':
    unittest.main(verbosity=2)
