#!/usr/bin/env python3
"""Actual packaging gates on isolated clean Git fixtures with synthetic builds.

No real application build, browser/device acceptance, external provider or server
is exercised here. Package code, controller and iOS source helper are unmodified.
"""
import hashlib
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import tarfile
import tempfile
import unittest

REPO = Path(os.environ.get('KNABA_PACKAGE_SOURCE_ROOT', Path(__file__).resolve().parents[1]))


def write(root, name, content):
    path = root / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content)


def git(root, *arguments):
    return subprocess.check_output(['git', *arguments], cwd=root, text=True,
                                   stderr=subprocess.STDOUT, timeout=15).strip()


def build_fixture(root, repo):
    inputs = ['scripts/package-server-candidate.py', 'scripts/mobile/package-ios-source.py',
              'corporate-site/vps/customer-environments/knabactl.py']
    for name in inputs:
        target = root / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(repo / name, target)
    write(root, '.gitignore', 'corporate-site/dist/\nerp/dist/\n__pycache__/\n*.pyc\n')
    write(root, 'erp/.gitignore', '.env\n.env.*\n')
    client = 'fixture public page\n'
    client_hash = hashlib.sha256(b'index.html\0' + client.encode() + b'\0').hexdigest()
    write(root, 'corporate-site/docs/evidence/official-build-verification.json',
          json.dumps({'artifactSha256': client_hash, 'scope': 'synthetic static verifier coverage fixture'}))
    write(root, 'corporate-site/tests/verify-build.mjs', """
    import{readFileSync,writeFileSync}from'node:fs';
    import{createHash}from'node:crypto';
    const hash=createHash('sha256').update('index.html\\0').update(readFileSync('dist/client/index.html')).update('\\0').digest('hex');
    writeFileSync(process.env.KNABA_BUILD_REPORT_PATH,JSON.stringify({artifactSha256:hash,scope:'synthetic static verifier coverage fixture'}));
    """)
    write(root, 'corporate-site/build-fixture.mjs', """
    import{mkdirSync,writeFileSync,rmSync,symlinkSync}from'node:fs';
    const mode=process.env.KNABA_REVIEW_MODE;
    if(mode==='build_failure')process.exit(8);
    rmSync('dist',{recursive:true,force:true});
    for(const p of ['dist/client','dist/server','dist/vps'])mkdirSync(p,{recursive:true});
    writeFileSync('dist/client/index.html',mode==='receipt_mismatch'?'incorrect page\\n':'fixture public page\\n');
    writeFileSync('dist/server/index.js','// fresh site '+process.env.GIT_SHA+'\\n');
    for(const p of ['render-page','articles','erp-intake'])writeFileSync('dist/vps/'+p+'.mjs','// fresh '+p+'\\n');
    if(mode==='dirty_source')writeFileSync('worker/index.ts','// changed during build\\n');
    if(mode==='site_symlink'){rmSync('dist/server/index.js');symlinkSync('../../worker/index.ts','dist/server/index.js');}
    """)
    write(root, 'erp/build-fixture.mjs', """
    import{mkdirSync,writeFileSync,rmSync,symlinkSync}from'node:fs';
    const mode=process.env.KNABA_REVIEW_MODE;
    mkdirSync('dist/web',{recursive:true});
    writeFileSync('dist/web/index.html','fixture ERP page\\n');
    writeFileSync('dist/server.mjs','// fresh ERP '+process.env.GIT_SHA+'\\n');
    if(mode!=='missing_erp_worker')writeFileSync('dist/worker.mjs','// fresh worker '+process.env.GIT_SHA+'\\n');
    if(mode==='erp_symlink'){rmSync('dist/worker.mjs',{force:true});symlinkSync('../package.json','dist/worker.mjs');}
    writeFileSync('dist/release.json',JSON.stringify({code_sha:process.env.GIT_SHA,source_dirty:false,source_provenance:'GIT_WORKTREE'}));
    """)
    for project in ['corporate-site', 'erp']:
        write(root, project + '/package.json', json.dumps({'scripts': {'build': 'node build-fixture.mjs'}}))
    write(root, 'erp/package-lock.json', '{}')
    write(root, 'corporate-site/vps/server.mjs', '// current source server\n')
    write(root, 'corporate-site/vps/manage.mjs', '// current source manager\n')
    write(root, 'corporate-site/drizzle/meta/_journal.json', '{}')
    write(root, 'corporate-site/worker/index.ts', '// reviewed worker source\n')
    mobile = 'erp/apps/mobile-ios/'
    for name in ['Sources/Fixture.swift', 'Resources/fixture.json', 'Tests/fixture.swift', 'scripts/fixture.sh',
                 'Info.plist', 'PrivacyInfo.xcprivacy', 'README.md', 'README_RECOVERY_UK.md']:
        write(root, mobile + name, 'fixture\n')
    write(root, mobile + 'project.yml', 'MARKETING_VERSION: "0.6.0"\nCURRENT_PROJECT_VERSION: "10"\n')
    for name in ['erp/tests/native-vectors.json', 'erp/scripts/native-ios-simulator.py',
                 'docs/mobile/DISTRIBUTION_2026-10-28_UK.md', 'docs/mobile/TEST_CANDIDATE_0.5.0_UK.md',
                 'docs/mobile/IOS_CONTEXT_ACTIONS_0.5.1_UK.md', 'docs/mobile/BRAND_ASSETS.json',
                 'docs/mobile/MOBILE_BRAND_0.6.0_UK.md', 'docs/mobile/RELEASE_VERSIONS.json']:
        write(root, name, '{}\n')
    git(root, 'init', '-q')
    git(root, 'config', 'user.email', 'synthetic-review@example.invalid')
    git(root, 'config', 'user.name', 'Synthetic Review')
    git(root, 'add', '.')
    git(root, 'commit', '-qm', 'Synthetic independent package gates fixture')
    sha = git(root, 'rev-parse', 'HEAD')
    return sha


class PackageServerCandidateTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        for command in ('git', 'node', 'npm'):
            if shutil.which(command) is None:
                raise RuntimeError(command + ' is required for package boundary tests')
        cls.space = tempfile.TemporaryDirectory(prefix='knaba-package-tests-')
        cls.base = Path(cls.space.name) / 'base'
        cls.base.mkdir()
        cls.sha = build_fixture(cls.base, REPO)

    @classmethod
    def tearDownClass(cls):
        cls.space.cleanup()

    def setUp(self):
        self.case = Path(tempfile.mkdtemp(prefix='case-', dir=self.space.name))
        self.root = self.case / 'repo'
        self.output = self.case / 'output'
        shutil.copytree(self.base, self.root)
        write(self.root, 'erp/dist/worker.mjs', '// stale worker\n')
        write(self.root, 'erp/dist/unrelated-old-output.txt', 'must not enter the package\n')
        write(self.root, 'erp/apps/mobile-ios/Resources/.env', 'SYNTHETIC_TOKEN=NOT_A_REAL_SECRET\n')
        self.assertEqual(git(self.root, 'status', '--porcelain', '--untracked-files=all'), '')

    def run_candidate(self, mode='success', expected=None):
        return subprocess.run(
            ['python3', 'scripts/package-server-candidate.py', '--expected-sha', expected or self.sha,
             '--output', str(self.output)], cwd=self.root, text=True, capture_output=True,
            env={**os.environ, 'KNABA_REVIEW_MODE': mode}, timeout=45)

    def assert_refused(self, mode, expected=None, reason=None):
        run = self.run_candidate(mode, expected)
        self.assertNotEqual(run.returncode, 0, run.stdout)
        self.assertFalse((self.output / 'package-receipt.json').exists(), run.stdout)
        self.assertFalse(list(self.output.glob('knaba-server-*.tar.gz')), run.stdout)
        if reason is not None:
            self.assertIn(reason, run.stderr)
        return run

    def test_fresh_exact_source_is_packaged_without_ignored_inputs(self):
        run = self.run_candidate()
        self.assertEqual(run.returncode, 0, run.stderr)
        receipt = json.loads(run.stdout)
        archive = Path(receipt['archive'])
        self.assertEqual(hashlib.sha256(archive.read_bytes()).hexdigest(), receipt['sha256'])
        self.assertEqual(receipt['sourceGitSha'], self.sha)
        self.assertIs(receipt['activated'], False)
        with tarfile.open(archive) as tar:
            names = set(tar.getnames())
            self.assertNotIn('erp-runtime/dist/unrelated-old-output.txt', names)
            self.assertIn(b'fresh site', tar.extractfile('corporate-runtime/dist/server/index.js').read())
            self.assertIn(b'fresh worker', tar.extractfile('erp-runtime/dist/worker.mjs').read())
            manifest = json.loads(tar.extractfile('MANIFEST.json').read())
            self.assertEqual(manifest['sourceGitSha'], self.sha)
            self.assertEqual(manifest['sourceTreeSha'], git(self.root, 'rev-parse', 'HEAD^{tree}'))
            self.assertEqual(manifest['deployment'], 'NOT_ACTIVATED_BY_PACKAGER')
            self.assertEqual(manifest['signing'], 'NOT_PERFORMED')
            self.assertEqual(set(manifest['files']) | {'MANIFEST.json'}, names)
            for name, entry in manifest['files'].items():
                content = tar.extractfile(name).read()
                self.assertEqual(hashlib.sha256(content).hexdigest(), entry['sha256'], name)
                self.assertEqual(len(content), entry['bytes'], name)
                self.assertFalse(name.startswith('/'), name)
                self.assertNotIn('..', Path(name).parts)
            for name, entry in manifest['corporateRuntimeFiles'].items():
                content = tar.extractfile('corporate-runtime/' + name).read()
                self.assertEqual(hashlib.sha256(content).hexdigest(), entry['sha256'], name)
                self.assertEqual(len(content), entry['bytes'], name)
            with tarfile.open(fileobj=io.BytesIO(tar.extractfile('ios-source.tar.gz').read())) as ios:
                self.assertNotIn('erp/apps/mobile-ios/Resources/.env', ios.getnames())
                self.assertIn('docs/mobile/RELEASE_VERSIONS.json', ios.getnames())
                ios_manifest = json.loads(ios.extractfile('IOS_SOURCE_MANIFEST.json').read())
                self.assertEqual(ios_manifest['type'], 'XCODE_SOURCE_ONLY_NOT_IPA')
                self.assertEqual(ios_manifest['sourceGitSha'], self.sha)
                self.assertIs(ios_manifest['sourceWorkingTree'], False)
                self.assertEqual((ios_manifest['version'], ios_manifest['build']), ('0.6.0', 10))
                for entry in ios_manifest['files']:
                    self.assertEqual(hashlib.sha256(ios.extractfile(entry['path']).read()).hexdigest(), entry['sha256'])
            with tarfile.open(fileobj=io.BytesIO(tar.extractfile('source.tar.gz').read())) as source:
                self.assertNotIn('erp/apps/mobile-ios/Resources/.env', source.getnames())
                self.assertEqual(source.extractfile('corporate-site/worker/index.ts').read(), b'// reviewed worker source\n')

    def test_failed_build_cannot_reuse_stale_bundles(self):
        self.assert_refused('build_failure', reason='exit status 8')

    def test_source_changed_during_build_is_refused(self):
        self.assert_refused('dirty_source', reason='Clean expected source required')

    def test_static_receipt_mismatch_is_refused(self):
        self.assert_refused('receipt_mismatch', reason='Current site artifact does not match the committed build receipt')

    def test_missing_new_worker_cannot_reuse_old_output(self):
        self.assert_refused('missing_erp_worker', reason='Missing ERP artifact: dist/worker.mjs')

    def test_site_symlink_output_is_refused(self):
        self.assert_refused('site_symlink', reason='Non-regular artifact input')

    def test_erp_symlink_output_is_refused(self):
        self.assert_refused('erp_symlink', reason='Non-regular artifact input')

    def test_wrong_source_sha_is_refused(self):
        self.assert_refused('success', expected='0' * 40, reason='Clean expected source required')

    def test_tracked_ios_symlink_is_refused(self):
        source = self.root / 'erp/apps/mobile-ios/Sources/Fixture.swift'
        source.unlink()
        source.symlink_to('../Resources/fixture.json')
        git(self.root, 'add', 'erp/apps/mobile-ios/Sources/Fixture.swift')
        git(self.root, 'commit', '-qm', 'Synthetic tracked iOS source symlink')
        self.assert_refused('success', expected=git(self.root, 'rev-parse', 'HEAD'),
                            reason='Regular source files without symlink ancestors are required')


if __name__ == '__main__':
    unittest.main()
