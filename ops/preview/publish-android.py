#!/usr/bin/env python3
"""Publish verified Android prototype metadata on the already authorized KNABA preview."""
import argparse
import datetime
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import signal
import time
import urllib.request
import uuid

ROOT = Path('/srv/knaba/vps')
QA = Path('/srv/knaba/ops/knaba-customer-prototype-20261028/site-qa')
ORIGIN = 'https://kneba.vsp.rest'

def require(value, message):
    if not value:
        raise RuntimeError(message)

def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        for part in iter(lambda: f.read(1024 * 1024), b''):
            h.update(part)
    return h.hexdigest()

def atomic(path, data):
    temp = path.with_name('.' + path.name + '.knaba-release-' + uuid.uuid4().hex)
    created = False
    try:
        with temp.open('xb') as stream:
            created = True
            os.fchmod(stream.fileno(), 0o600)
            stream.write(data); stream.flush(); os.fsync(stream.fileno())
        os.replace(temp, path)
        fd = os.open(path.parent, os.O_DIRECTORY)
        try:
            os.fsync(fd)
        finally:
            os.close(fd)
    finally:
        if created:
            temp.unlink(missing_ok=True)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', required=True)
    parser.add_argument('--file', required=True)
    parser.add_argument('--sha256', required=True)
    parser.add_argument('--version', required=True)
    args = parser.parse_args()
    require(re.fullmatch(r'[a-f0-9]{40}', args.source), 'Exact source SHA required')
    require(re.fullmatch(r'[A-Za-z0-9._-]+\.apk', args.file), 'APK basename required')
    require(re.fullmatch(r'[a-f0-9]{64}', args.sha256), 'Exact APK SHA256 required')
    require(re.fullmatch(r'[0-9][A-Za-z0-9.+_-]{0,39}', args.version), 'Invalid version')
    module_path = Path(__file__).with_name('release-customer-prototype-20261028.py')
    spec = importlib.util.spec_from_file_location('knaba_preview_release', module_path)
    release = importlib.util.module_from_spec(spec); spec.loader.exec_module(release)
    handles = []
    report = {'source': args.source, 'apkSha256': args.sha256, 'version': args.version,
              'startedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'distribution': 'prototype', 'customerProductionMigration': 'NOT_RUN'}
    os.umask(0o077)
    require(QA.is_dir() and QA.resolve(strict=True) == QA, 'QA directory must be canonical')
    evidence = QA / ('android-publication-' + str(time.time_ns()))
    evidence.mkdir(mode=0o700)
    env = ROOT / 'config/site.env'
    before = after = image = None
    mutated = False
    def interrupted(number, _frame):
        raise RuntimeError('Android publication interrupted by signal ' + str(number))
    old_handlers = {number: signal.signal(number, interrupted) for number in [signal.SIGTERM, signal.SIGINT]}
    try:
        for name in ['.knaba-preview-deploy.lock', '.knaba-preview-release.lock', '.ui-visual-release.lock']:
            handle = (ROOT / name).open('a'); fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB); handles.append(handle)
        current = (ROOT / 'current').resolve(strict=True)
        require(current == ROOT / 'releases' / args.source, 'Current release changed')
        attestation = json.loads(release.qa_file(QA, 'qa-attestation.json').read_text())
        client_sha = attestation.get('clientArtifactSha256')
        require(isinstance(client_sha, str) and re.fullmatch('[a-f0-9]{64}', client_sha), 'Accepted client artifact required')
        accepted = release.verify_qa(QA, args.source, client_sha)
        require(release.runtime_manifest(current) == accepted['runtimeManifest'], 'Current runtime differs from accepted four-browser QA')
        report['clientArtifactSha256'] = client_sha
        report['qaAttestationSha256'] = accepted['attestationSha256']
        apk = current / 'dist/client/downloads' / args.file
        require(apk.is_file() and apk.resolve(strict=True) == apk and digest(apk) == args.sha256, 'Published APK bytes differ')
        require(release.storage()['cutoverAllowed'], 'Storage gate failed')
        before = env.read_bytes()
        require(env.resolve(strict=True) == env and env.stat().st_mode & 0o077 == 0, 'Private canonical configuration required')
        shutil.copyfile(env, evidence / 'site.env.before'); (evidence / 'site.env.before').chmod(0o600)
        before_status, _, before_body = release.read_public('/api/public/release')
        metadata_before = json.loads(before_body)
        require(before_status == 200 and isinstance(metadata_before, dict), 'Existing release metadata unavailable')
        values = {'KNABA_ANDROID_APK_URL': ORIGIN + '/downloads/' + args.file,
                  'KNABA_ANDROID_APK_SHA256': args.sha256, 'KNABA_ANDROID_VERSION': args.version,
                  'KNABA_ANDROID_DISTRIBUTION': 'prototype', 'KNABA_RELEASE_STAGE': 'prototype'}
        lines = before.decode().splitlines(keepends=True)
        for key, value in values.items():
            existing = [line.rstrip('\r\n').partition('=')[2].strip("'\"") for line in lines if line.startswith(key + '=')]
            require(len(existing) <= 1 and (not existing or existing == [value]), 'Existing release metadata conflicts: ' + key)
        retained = ''.join(line for line in lines if line.partition('=')[0] not in values)
        separator = '' if not retained or retained.endswith('\n') else '\n'
        # Keep unrelated private configuration bytes, including existing line
        # endings, intact. Only the allowlisted presentation keys are replaced.
        after = (retained + separator + '\n'.join(key + "='" + value + "'" for key, value in values.items()) + '\n').encode()
        require(env.read_bytes() == before, 'Configuration changed during preparation')
        image = release.run(['docker', 'inspect', '-f', '{{.Image}}', 'knaba-vps-internal'], timeout=15).strip()
        runtime_user = release.run(['docker', 'inspect', '-f', '{{.Config.User}}', 'knaba-vps-internal'], timeout=15).strip()
        require((ROOT / 'current').resolve(strict=True) == current and env.read_bytes() == before, 'Release/configuration changed before publication')
        # Arm recovery before atomic replacement: a directory fsync or signal
        # may fail after the new bytes have already replaced site.env.
        mutated = True
        atomic(env, after)
        release.restart(image)
        report['runningArtifact'] = release.running_attestation(image, runtime_user, accepted['runtimeManifest'], client_sha)
        status, headers, body = release.read_public('/api/public/release')
        metadata = json.loads(body)
        require(status == 200 and metadata.get('stage') == 'prototype' and metadata['android']['status'] == 'available' and
                metadata['android']['url'] == values['KNABA_ANDROID_APK_URL'] and metadata['android']['version'] == args.version and
                metadata['android']['sha256'] == args.sha256 and metadata['android']['distribution'] == 'prototype',
                'Public metadata readback mismatch')
        require({key: value for key, value in metadata.items() if key not in {'android', 'stage'}} ==
                {key: value for key, value in metadata_before.items() if key not in {'android', 'stage'}},
                'Unrelated release metadata changed')
        h = hashlib.sha256()
        opener = urllib.request.build_opener(release.NoRedirect)
        with opener.open(urllib.request.Request(values['KNABA_ANDROID_APK_URL'],
                headers={'Cache-Control': 'no-cache'}), timeout=30) as response:
            require(response.status == 200 and 'attachment' in response.headers.get('content-disposition', ''), 'APK response invalid')
            for chunk in iter(lambda: response.read(1024 * 1024), b''):
                h.update(chunk)
        require(h.hexdigest() == args.sha256, 'HTTPS download bytes differ')
        require((ROOT / 'current').resolve(strict=True) == current and env.read_bytes() == after, 'Concurrent release detected')
        report.update(status='PASS', httpsDownloadSha256=h.hexdigest(), bytes=apk.stat().st_size,
                      url=values['KNABA_ANDROID_APK_URL'])
    except Exception as error:
        report.update(status='FAIL', reason=str(error))
        if mutated:
            try:
                require((ROOT / 'current').resolve(strict=True) == current, 'Concurrent release; metadata rollback requires coordination')
                actual = env.read_bytes()
                if actual == before:
                    report['metadataRollback'] = 'NOT_NEEDED_ORIGINAL_CONFIGURATION_RETAINED'
                else:
                    require(actual == after, 'Concurrent configuration change; refusing to overwrite it')
                    atomic(env, before)
                    release.restart(image)
                    require(env.read_bytes() == before and (ROOT / 'current').resolve(strict=True) == current, 'Rollback configuration/source readback failed')
                    report['rollbackArtifact'] = release.running_attestation(image, runtime_user, accepted['runtimeManifest'], client_sha)
                    recovered_status, _, recovered_body = release.read_public('/api/public/release')
                    require(recovered_status == 200 and json.loads(recovered_body) == metadata_before and release.read_public('/readyz')[0] == 200,
                            'Restored release metadata or readiness mismatch')
                    report['metadataRollback'] = 'PASS'
            except Exception as recovery:
                report['metadataRollback'] = 'BLOCKED'
                report['rollbackError'] = str(recovery)
        raise
    finally:
        report['finishedAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
        try:
            atomic(evidence / 'receipt.json', (json.dumps(report, indent=2) + '\n').encode())
        finally:
            for handle in reversed(handles):
                handle.close()
            for number, handler in old_handlers.items():
                signal.signal(number, handler)
            print(json.dumps(report))

if __name__ == '__main__':
    main()
