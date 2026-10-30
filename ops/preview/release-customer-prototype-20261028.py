"""Authorized kneba.vsp.rest release, with exact artifact and reversible rollback.

Run on the existing host only. No production domain, source publication,
credential values, customer rows, or provider activation are involved.
The private receipt and restore copy stay on the host.
"""
from pathlib import Path
import argparse, datetime, fcntl, hashlib, json, os, re, shutil, signal, sqlite3, stat, subprocess, uuid
import urllib.request, urllib.error

ROOT = Path('/srv/knaba/vps')
ORIGIN = 'https://kneba.vsp.rest'
PARTS = ['dist', 'vps', 'drizzle', 'package.json']
EXPECTED_PREVIOUS = '76f96f6f83d22403a1aa255e8bf2b98311807985'
PREVIOUS_QA = Path('/srv/knaba/ops/knaba-role-workspaces-20261028-76f96f6')
RECEIPTS = ['evidence-role/browser-receipt.json', 'evidence-developer/developer-browser-receipt.json', 'evidence-release/release-browser-receipt.json', 'evidence-languages/portal-languages-browser-receipt.json']
VOLATILE_TABLES = {'vps_sessions', 'vps_login_limits', 'vps_oidc_states', 'portal_rate_limits'}

def require(condition, message):
    # Release gates must still execute when Python is invoked with -O.
    if not condition:
        raise RuntimeError(message)

def run(args, **kwargs):
    result = subprocess.run(args, capture_output=True, text=True, **kwargs)
    if result.returncode:
        raise RuntimeError('Command failed: ' + args[0] + '; ' + result.stderr[-700:])
    return result.stdout

def digest(path):
    result = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            result.update(chunk)
    return result.hexdigest()

def artifact_files(root):
    require(root.is_dir() and root.resolve(strict=True) == root, 'Artifact directory must be canonical')
    files = []
    for path in sorted(root.rglob('*')):
        info = path.lstat()
        require(not stat.S_ISLNK(info.st_mode), 'Artifact symlinks are not accepted')
        require(stat.S_ISDIR(info.st_mode) or stat.S_ISREG(info.st_mode), 'Unexpected artifact file type')
        if stat.S_ISREG(info.st_mode):
            files.append(path)
    # Match JavaScript Array.sort on full relative path strings, not pathlib's
    # component ordering ("a-b.js" precedes "a/file.js" in the build verifier).
    return sorted(files, key=lambda path: path.relative_to(root).as_posix().encode('utf-16-be', 'surrogatepass'))

def client_digest(root):
    result = hashlib.sha256()
    for file in artifact_files(root):
        result.update(str(file.relative_to(root)).encode() + b'\0')
        with file.open('rb') as stream:
            for chunk in iter(lambda: stream.read(1024 * 1024), b''):
                result.update(chunk)
        result.update(b'\0')
    return result.hexdigest()

def manifest(root):
    return {str(path.relative_to(root)): digest(path) for path in artifact_files(root)}

def runtime_manifest(root):
    require(root.is_dir() and root.resolve(strict=True) == root, 'Runtime directory must be canonical')
    result = {}
    for part in PARTS:
        path = root / part
        require(path.exists() and not path.is_symlink(), 'Missing or linked runtime part: ' + part)
        result[part] = manifest(path) if path.is_dir() else digest(path)
    return result

def qa_file(qa, relative):
    require(isinstance(relative, str) and not Path(relative).is_absolute() and '..' not in Path(relative).parts,
            'QA evidence path must be relative')
    path = qa / relative
    require(path.is_file() and path.resolve(strict=True) == path and path.is_relative_to(qa), 'Invalid QA evidence file')
    return path

def verify_qa(qa, source, client_sha, receipts=RECEIPTS, extra_tests=True):
    attestation_path = qa_file(qa, 'qa-attestation.json')
    attestation = json.loads(attestation_path.read_text())
    require(attestation.get('source') == source and attestation.get('clientArtifactSha256') == client_sha, 'QA attestation version mismatch')
    actual = runtime_manifest(qa / 'runtime')
    require(attestation.get('runtimeManifest') == actual, 'QA runtime differs from tested artifact')
    require(client_digest(qa / 'runtime/dist/client') == client_sha, 'Client artifact digest mismatch')
    tests = attestation.get('tests')
    require(isinstance(tests, dict) and tests, 'QA attestation must bind the actual test files')
    for suffix in ['tests/role-cabinets-browser.mjs', 'tests/developer-workspaces-browser.mjs', 'tests/fixtures/role-ux-server.mjs']:
        require(any(path == suffix or path.endswith('/' + suffix) for path in tests), 'QA test is not attested: ' + suffix)
    for relative, expected in tests.items():
        require(isinstance(expected, str) and re.fullmatch('[0-9a-f]{64}', expected) and digest(qa_file(qa, relative)) == expected,
                'QA test source changed: ' + relative)
    if extra_tests:
        for suffix in ['tests/release-channels-browser.mjs', 'tests/portal-languages-browser.mjs']:
            require(any(path == suffix or path.endswith('/' + suffix) for path in tests), 'Release browser test is not attested: ' + suffix)
    receipt_hashes = attestation.get('receipts')
    require(isinstance(receipt_hashes, dict) and set(receipt_hashes) == set(receipts), 'Both browser receipts must be attested')
    summary = {}
    for relative in receipts:
        file = qa_file(qa, relative)
        require(digest(file) == receipt_hashes[relative], 'Browser receipt differs from QA attestation')
        value = json.loads(file.read_text())
        checks = value.get('checks')
        require(value.get('status') == 'PASS' and isinstance(checks, list) and checks and value.get('errors') == [], 'Browser gate incomplete')
        require(all(isinstance(check, dict) and check.get('status') == 'PASS' and check.get('name') for check in checks), 'A browser check was not accepted')
        require(value.get('browserVersion') and value.get('startedAt') and value.get('finishedAt'), 'Browser execution metadata missing')
        started = datetime.datetime.fromisoformat(value['startedAt'].replace('Z', '+00:00'))
        finished = datetime.datetime.fromisoformat(value['finishedAt'].replace('Z', '+00:00'))
        require(started.tzinfo is not None and finished.tzinfo is not None and finished >= started, 'Invalid browser receipt timestamps')
        for key, expected in [('source', source), ('operatorReportedSourceSha', source), ('clientArtifactSha256', client_sha)]:
            if key in value:
                require(value[key] == expected, 'Browser receipt version mismatch')
        if relative == RECEIPTS[3]:
            require(value.get('clientArtifact', {}).get('sha256') == client_sha,
                    'Portal language browser receipt tested a different client artifact')
        if relative == RECEIPTS[1]:
            require(value.get('primaryData', {}).get('unchanged') is True and value.get('primaryData', {}).get('tables'),
                    'Developer primary-data isolation was not accepted')
        summary[relative] = {'sha256': digest(file), 'checks': len(checks), 'browser': value['browserVersion']}
    return {'attestationSha256': digest(attestation_path), 'runtimeManifest': actual, 'browser': summary}

def migration_sources(artifact):
    directory = artifact / 'drizzle'
    names = sorted(path.name for path in directory.glob('*.sql'))
    require(names and all(re.fullmatch(r'\d{4}_[A-Za-z0-9_]+\.sql', name) for name in names), 'Invalid migration filenames')
    require(len({name[:4] for name in names}) == len(names), 'Duplicate migration ordinal')
    journal = json.loads((directory / 'meta/_journal.json').read_text())
    entries = journal.get('entries', [])
    require(journal.get('dialect') == 'sqlite' and isinstance(entries, list) and len(entries) == len(names), 'Invalid migration journal')
    require([entry.get('tag', '') + '.sql' for entry in entries] == names and all(entry.get('idx') == index for index, entry in enumerate(entries)), 'Migration journal order mismatch')
    return {name: digest(directory / name) for name in names}

def migration_ledger(path):
    db = sqlite3.connect(path.as_uri() + '?mode=ro', uri=True, timeout=15)
    try:
        db.execute('PRAGMA query_only=ON')
        return dict(db.execute('SELECT filename,sha256 FROM vps_schema_migrations ORDER BY filename'))
    finally:
        db.close()

def storage():
    info = os.statvfs(ROOT)
    total = info.f_blocks * info.f_frsize; available = info.f_bavail * info.f_frsize
    used = 100 * (total - available) / total
    return {'availableBytes': available, 'totalBytes': total, 'usedPercent': round(used, 2),
            'cutoverAllowed': available >= 10 * 1024**3 and used < 90}

def snapshot(path, columns=None):
    db = sqlite3.connect(path.as_uri() + '?mode=ro', uri=True, timeout=15)
    try:
        db.execute('PRAGMA query_only=ON')
        # Every table, integrity check and fingerprint belongs to one SQLite
        # read snapshot, even while the existing site serves other requests.
        db.execute('BEGIN')
        tables = [row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")]
        if columns is not None:
            require(set(columns).issubset(tables), 'A pre-existing table disappeared during migration')
        checks = [row[0] for row in db.execute('PRAGMA integrity_check')]
        result = {'integrity': 'ok' if checks == ['ok'] else 'failed',
                  'foreignKeyErrors': len(db.execute('PRAGMA foreign_key_check').fetchall()), 'tables': {}}
        quote = lambda value: '"' + value.replace('"', '""') + '"'
        def encode(value):
            if isinstance(value, bytes):
                return ['blob', len(value), hashlib.sha256(value).hexdigest()]
            return [type(value).__name__, value]
        for table in tables:
            if columns is not None and table not in columns:
                continue
            present = [row[1] for row in db.execute('PRAGMA table_info(' + quote(table) + ')')]
            names = columns[table] if columns is not None else present
            require(names and set(names).issubset(present), 'A pre-existing column disappeared during migration')
            selection = ','.join(quote(name) for name in names)
            rows = [json.dumps([encode(value) for value in row], ensure_ascii=False, separators=(',', ':'), allow_nan=False)
                    for row in db.execute('SELECT ' + selection + ' FROM ' + quote(table))]
            result['tables'][table] = {'columns': names, 'count': len(rows), 'rowsSha256': hashlib.sha256('\n'.join(sorted(rows)).encode()).hexdigest()}
        return result
    finally:
        db.close()

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None

def read_public(path):
    opener = urllib.request.build_opener(NoRedirect)
    request = urllib.request.Request(ORIGIN + path, headers={'Cache-Control': 'no-cache', 'User-Agent': 'KNABA-authorized-workspace-release/1.0'})
    try:
        result = opener.open(request, timeout=12)
    except urllib.error.HTTPError as error:
        result = error
    with result:
        return result.status, {k.lower(): v for k, v in result.headers.items()}, result.read()

def switch(target):
    temporary = ROOT / ('.current-workspaces-' + str(os.getpid()))
    try:
        os.symlink(str(target), temporary); os.replace(temporary, ROOT / 'current')
        handle = os.open(ROOT, os.O_DIRECTORY)
        try:
            os.fsync(handle)
        finally:
            os.close(handle)
    finally:
        if temporary.is_symlink():
            temporary.unlink()

def compose_web():
    config = json.loads(run(['docker', 'compose', '-f', str(ROOT / 'docker-compose.yml'), 'config', '--format', 'json'], cwd=ROOT, timeout=20))
    return config['services']['web']

def restart(expected_image):
    reference = compose_web().get('image')
    require(reference and run(['docker', 'image', 'inspect', '-f', '{{.Id}}', reference], timeout=10).strip() == expected_image,
            'Compose image differs from the rehearsed local image; no restart')
    run(['docker', 'compose', '-f', str(ROOT / 'docker-compose.yml'), 'up', '-d', '--force-recreate', '--no-deps', '--pull', 'never', '--wait', '--wait-timeout', '60', 'web'], cwd=ROOT, timeout=90)

def running_attestation(expected_image, expected_user, expected_manifest, expected_client):
    metadata = json.loads(run(['docker', 'inspect', '-f', '[{{json .Image}},{{json .Config.User}},{{json .State.Running}}]', 'knaba-vps-internal'], timeout=10))
    require(metadata == [expected_image, expected_user, True], 'Running image, UID/GID or state differs from accepted runtime')
    code = """import fs from 'node:fs';import path from 'node:path';import{createHash}from'node:crypto';
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
function entries(root){const result={};function visit(p){const s=fs.lstatSync(p);if(s.isSymbolicLink())throw Error('Unexpected runtime symlink');if(s.isDirectory())for(const n of fs.readdirSync(p))visit(path.join(p,n));else if(s.isFile())result[path.relative(root,p)]=hash(p);else throw Error('Unexpected runtime file');}visit(root);return result;}
const runtimeManifest=Object.fromEntries(['dist','vps','drizzle','package.json'].map(part=>{const p='/app/'+part;return[part,fs.lstatSync(p).isDirectory()?entries(p):hash(p)];}));
const client=createHash('sha256');for(const relative of Object.keys(entries('/app/dist/client')).sort()){client.update(relative+'\\0');client.update(fs.readFileSync('/app/dist/client/'+relative));client.update('\\0');}
console.log(JSON.stringify({runtimeManifest,clientArtifactSha256:client.digest('hex')}));"""
    actual = json.loads(run(['docker', 'exec', 'knaba-vps-internal', 'node', '--input-type=module', '-e', code], timeout=30))
    require(actual.get('runtimeManifest') == expected_manifest and actual.get('clientArtifactSha256') == expected_client,
            'Running container bytes differ from the accepted runtime')
    return {'image': expected_image, 'user': expected_user, 'exactRuntimeFiles': True, 'clientArtifactSha256': expected_client,
            'filesVerified': sum(len(value) if isinstance(value, dict) else 1 for value in expected_manifest.values())}

def developer_configured():
    # Inspect only the effective web service setting; never print its value or
    # the expanded Compose environment into a receipt or exception.
    environment = compose_web().get('environment', {})
    if isinstance(environment, list):
        environment = dict(item.split('=', 1) for item in environment if '=' in item)
    return bool(str(environment.get('KNABA_DEVELOPER_EMAIL') or '').strip())

def checkpoint(evidence, report):
    temporary = evidence / ('.receipt-private-' + uuid.uuid4().hex + '.tmp')
    created = False
    try:
        # Preserve the accepted private/exclusive checkpoint contract, including
        # inherited ACLs and interruption cleanup.
        with open(temporary, 'x', encoding='utf-8', opener=lambda path, flags: os.open(path, flags, 0o600)) as stream:
            created = True
            os.fchmod(stream.fileno(), 0o600)
            json.dump(report, stream, indent=2); stream.write('\n'); stream.flush(); os.fsync(stream.fileno())
        os.replace(temporary, evidence / 'receipt-private.json')
        handle = os.open(evidence, os.O_DIRECTORY)
        try:
            os.fsync(handle)
        finally:
            os.close(handle)
    finally:
        if created:
            temporary.unlink(missing_ok=True)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', required=True)
    parser.add_argument('--client-sha', required=True, help='Exact accepted client artifact SHA256')
    parser.add_argument('--qa-root', required=True)
    parser.add_argument('--activate', action='store_true')
    args = parser.parse_args()
    require(re.fullmatch('[0-9a-f]{40}', args.source), 'A full source SHA is required')
    require(re.fullmatch('[0-9a-f]{64}', args.client_sha), 'A full client artifact SHA256 is required')
    qa = Path(args.qa_root)
    require(qa == Path('/srv/knaba/ops/knaba-customer-prototype-20261028/site-qa'), 'Unexpected QA directory')
    require(qa.resolve(strict=True) == qa and qa.is_dir(), 'QA directory must be canonical')
    candidate = qa / 'runtime'
    report = {'source': args.source, 'environment': ORIGIN, 'startedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'clientArtifactSha256': args.client_sha, 'activated': False, 'mode': 'activate' if args.activate else 'rehearse'}
    locks = []
    evidence = qa / ('release-' + args.source[:12] + ('-activate' if args.activate else '-rehearse'))
    previous = None; rollback = None
    os.umask(0o077); evidence.mkdir(mode=0o700, exist_ok=False)
    def interrupted(number, _frame):
        raise RuntimeError('Release interrupted by signal ' + str(number))
    old_handlers = {number: signal.signal(number, interrupted) for number in [signal.SIGTERM, signal.SIGINT]}
    try:
        for name in ['.knaba-preview-deploy.lock', '.knaba-preview-release.lock', '.ui-visual-release.lock']:
            handle = (ROOT / name).open('a'); fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB); locks.append(handle)
        previous = (ROOT / 'current').resolve(strict=True)
        require(previous.parent == ROOT / 'releases' and previous.name == EXPECTED_PREVIOUS, 'Current source changed; coordinate before rollout')
        report['previousSource'] = previous.name
        report['storage'] = storage(); require(report['storage']['cutoverAllowed'], 'Original storage gate is not satisfied')
        accepted_qa = verify_qa(qa, args.source, args.client_sha)
        report.update(accepted_qa)
        old_migrations = migration_sources(previous); expected_migrations = migration_sources(candidate)
        require(all(expected_migrations.get(name) == value for name, value in old_migrations.items()), 'Historical SQL drift')
        require(old_migrations == expected_migrations, 'This presentation release must not change the database schema')
        rollback_qa = verify_qa(PREVIOUS_QA, EXPECTED_PREVIOUS, client_digest(previous / 'dist/client'), receipts=RECEIPTS[:2], extra_tests=False)
        require(rollback_qa['runtimeManifest'] == runtime_manifest(previous), 'Previous runtime no longer matches its accepted isolated developer QA')
        report['previousRuntimeQa'] = rollback_qa
        report['expectedMigrations'] = expected_migrations
        config_hashes = {name: digest(ROOT / name) for name in ['docker-compose.yml', 'config/site.env', '.env'] if (ROOT / name).is_file()}
        report['configSha256'] = config_hashes
        for name in config_hashes:
            target = evidence / 'config-private' / name; target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            shutil.copy2(ROOT / name, target); os.chmod(target, 0o600)
        image = run(['docker', 'inspect', '-f', '{{.Image}}', 'knaba-vps-internal'], timeout=10).strip()
        runtime_user = run(['docker', 'inspect', '-f', '{{.Config.User}}', 'knaba-vps-internal'], timeout=10).strip()
        uid, gid = map(int, runtime_user.split(':')); require(uid > 0 and gid > 0, 'Runtime must use an explicit unprivileged UID/GID')
        require(re.fullmatch('sha256:[0-9a-f]{64}', image), 'Runtime image must be pinned')
        report['image'] = image; report['runtimeUser'] = runtime_user
        info = json.loads(run(['docker', 'exec', 'knaba-vps-internal', 'node', '/app/vps/manage.mjs', 'backup'], timeout=40))
        backup = ROOT / 'state' / Path(info['path']).relative_to('/var/lib/knaba')
        require(backup.is_file() and backup.resolve(strict=True) == backup and backup.is_relative_to(ROOT / 'state'), 'Backup must be a private state file')
        require(digest(backup) == info['sha256'] and backup.stat().st_size == info['bytes'], 'Backup checksum or size mismatch')
        require(migration_ledger(backup) == old_migrations, 'Backup migration ledger differs from the active release')
        report['backup'] = {'sha256': info['sha256'], 'bytes': info['bytes'], 'pathExported': False}
        before = snapshot(backup); require(before['integrity'] == 'ok' and before['foreignKeyErrors'] == 0, 'Backup integrity failed')
        report['before'] = before
        checkpoint(evidence, report)
        restore = evidence / 'restore'; restore.mkdir(mode=0o700); os.chown(restore, uid, gid)
        shutil.copy2(backup, restore / 'site.sqlite'); os.chmod(restore / 'site.sqlite', 0o600); os.chown(restore / 'site.sqlite', uid, gid)
        require(digest(restore / 'site.sqlite') == info['sha256'], 'Restore copy differs from backup')
        dest = ROOT / 'releases' / args.source
        if not dest.exists():
            dest.mkdir(mode=0o750); os.chown(dest, uid, gid)
            for part in PARTS:
                source = candidate / part; target = dest / part
                if source.is_dir(): shutil.copytree(source, target)
                else: shutil.copy2(source, target)
            for path in dest.rglob('*'): os.chown(path, uid, gid)
        require(runtime_manifest(dest) == report['runtimeManifest'], 'Staged source differs')

        def isolated(artifact, state, command, env=True):
            name = 'knaba-workspace-release-' + uuid.uuid4().hex
            command_line = ['docker', 'run', '--name', name, '--rm', '--pull=never', '--network=none', '--read-only', '--user', runtime_user,
                '--cap-drop=ALL', '--security-opt=no-new-privileges:true', '--memory=512m', '--cpus=1', '--pids-limit=96']
            if env: command_line += ['--env-file', str(ROOT / 'config/site.env')]
            for part in PARTS: command_line += ['-v', str(artifact / part) + ':/app/' + part + ':ro']
            command_line += ['-v', str(state) + ':/restore', '-e', 'KNABA_DB_PATH=/restore/site.sqlite', '-e', 'KNABA_BACKUP_DIR=/restore/backups', '-w', '/app', image, *command]
            try:
                return run(command_line, timeout=60)
            except BaseException:
                # Killing a timed-out Docker client alone can leave its container
                # migrating in the background. Stop only this invocation's UUID
                # container before attempting a checked forward recovery.
                subprocess.run(['docker', 'rm', '-f', name], capture_output=True, text=True, timeout=15)
                raise

        isolated(dest, restore, ['node', '/app/vps/manage.mjs', 'migrate'], env=False)
        restored_migrations = migration_ledger(restore / 'site.sqlite')
        require(restored_migrations == expected_migrations, 'Restored migration ledger is incomplete or drifted')
        columns = {name: item['columns'] for name, item in before['tables'].items() if name != 'vps_schema_migrations'}
        restored = snapshot(restore / 'site.sqlite', columns)
        require(restored['integrity'] == 'ok' and restored['foreignKeyErrors'] == 0, 'Restored database integrity failed')
        require(restored['tables'] == {name: item for name, item in before['tables'].items() if name != 'vps_schema_migrations'}, 'Migration changed existing records')
        report['isolatedMigration'] = {'existingRowsPreserved': True, 'integrity': 'ok', 'foreignKeyErrors': 0,
                                       'migrationCount': len(restored_migrations), 'ledger': restored_migrations}
        probe = """import {createKnabaVpsServer} from '/app/vps/server.mjs';import {request} from 'node:http';
const app=await createKnabaVpsServer({dbPath:'/restore/site.sqlite',staticRoot:'/app/dist/client',workerPath:'file:///app/dist/server/index.js',ownerEmail:process.env.OWNER_EMAIL||'',developerEmail:process.env.KNABA_DEVELOPER_EMAIL||'',host:'127.0.0.1',port:0,origin:'https://kneba.vsp.rest',localTest:false,oidcConfig:{}});
const at=path=>new Promise((resolve,reject)=>{const r=request({host:'127.0.0.1',port:app.port,path,headers:{Host:'kneba.vsp.rest','X-Forwarded-Proto':'https'}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});r.on('error',reject);r.end();});
try{const results=[];for(const [path,want] of [['/readyz',200],['/',200],['/admin/',200],['/konto/',200],['/api/portal/dashboard',401],['/api/crm/contacts',401]]){const status=await at(path);if(status!==want)throw Error('Restore HTTP mismatch '+path);results.push({path,status});}console.log(JSON.stringify({result:'PASS',results}));}finally{await app.close();}"""
        report['restoredRuntime'] = json.loads(isolated(dest, restore, ['node', '--input-type=module', '-e', probe]))
        rollback = ROOT / 'releases' / ('rollback-' + args.source[:12] + '-runtime-' + previous.name[:12])
        if not rollback.exists():
            rollback.mkdir(mode=0o750); os.chown(rollback, uid, gid)
            for part in PARTS:
                source = (dest if part == 'drizzle' else previous) / part; target = rollback / part
                if source.is_dir(): shutil.copytree(source, target)
                else: shutil.copy2(source, target)
            for path in rollback.rglob('*'): os.chown(path, uid, gid)
        # Expected rollback bytes come from the accepted evidence, never from
        # a directory that may have changed while preparation was running.
        rollback_expected = dict(rollback_qa['runtimeManifest'])
        rollback_expected['drizzle'] = report['runtimeManifest']['drizzle']
        require(runtime_manifest(rollback) == rollback_expected, 'Rollback artifact drift')
        report['rollbackRuntime'] = json.loads(isolated(rollback, restore, ['node', '--input-type=module', '-e', probe]))
        require(report['restoredRuntime'].get('result') == 'PASS' and report['rollbackRuntime'].get('result') == 'PASS', 'Runtime restoration was not accepted')
        report['rollback'] = {'path': str(rollback), 'runtimeSource': previous.name, 'schemaRetained': len(restored_migrations),
                              'restoredRuntime': 'PASS', 'developerIsolation': 'Exact previous runtime and unchanged schema independently accepted'}
        require((ROOT / 'current').resolve(strict=True) == previous, 'Current source changed during preparation')
        require(all(digest(ROOT / name) == value for name, value in config_hashes.items()), 'Configuration changed during preparation')
        require(storage()['cutoverAllowed'], 'Storage changed during preparation')
        require(verify_qa(qa, args.source, args.client_sha) == accepted_qa, 'Accepted QA evidence changed during preparation')
        require(runtime_manifest(dest) == report['runtimeManifest'], 'Staged runtime changed during preparation')
        report['prepared'] = True; checkpoint(evidence, report)
        if args.activate:
            # The isolated copy already proved the exact migration is non-destructive.
            # Mark the attempt BEFORE the CLI: migrations commit individually and
            # a failure/timeout can leave a partially applied new ledger.
            require(verify_qa(PREVIOUS_QA, EXPECTED_PREVIOUS, client_digest(previous / 'dist/client'), receipts=RECEIPTS[:2], extra_tests=False) == rollback_qa, 'Accepted previous developer isolation evidence changed')
            require(runtime_manifest(previous) == rollback_qa['runtimeManifest'], 'Previous runtime changed before activation')
            require(migration_ledger(ROOT / 'state/site.sqlite') == old_migrations, 'Live schema changed before migration')
            require((ROOT / 'current').resolve(strict=True) == previous, 'Current source changed before migration')
            report['liveMigrationAttempted'] = True; checkpoint(evidence, report)
            isolated(dest, ROOT / 'state', ['node', '/app/vps/manage.mjs', 'migrate'], env=False)
            require(migration_ledger(ROOT / 'state/site.sqlite') == expected_migrations, 'Live migration ledger is incomplete or drifted')
            report['liveMigrationApplied'] = True
            checkpoint(evidence, report)
            require((ROOT / 'current').resolve(strict=True) == previous, 'Current source changed before activation')
            require(all(digest(ROOT / name) == value for name, value in config_hashes.items()), 'Configuration changed before activation')
            require(storage()['cutoverAllowed'], 'Storage gate changed after migration')
            switch(dest); report['activated'] = True; report['candidateWasActivated'] = True; checkpoint(evidence, report)
            restart(image)
            report['runningArtifact'] = running_attestation(image, runtime_user, report['runtimeManifest'], args.client_sha)
            results = []
            for path, expected in [('/readyz',200),('/',200),('/en/',200),('/pl/',200),('/lt/',200),('/ru/',200),('/uk/',200),('/app/',200),('/bots/whatsapp/',200),('/bots/telegram/',200),('/api/public/release',200),('/konto/?lang=uk',200),('/admin/?lang=uk',200),('/login/',200),('/api/portal/dashboard',401),('/api/portal/conversations',401),('/api/developer/workspace',404),('/state/site.sqlite',404),('/.env',404)]:
                status, headers, body = read_public(path)
                require(status == expected, 'Live HTTP mismatch ' + path + ': ' + str(status))
                if status == 200 and path not in ['/readyz','/api/public/release']: require('noindex' in headers.get('x-robots-tag','').lower(), 'Staging indexing guard missing')
                results.append({'path': path, 'status': status, 'bytes': len(body)})
            report['publicSmoke'] = results
            after = snapshot(ROOT / 'state/site.sqlite'); require(after['integrity'] == 'ok' and after['foreignKeyErrors'] == 0, 'Live database integrity failed')
            require(set(before['tables']).issubset(after['tables']), 'Live database lost an existing table')
            for name, table in before['tables'].items():
                if name not in VOLATILE_TABLES:
                    require(after['tables'][name]['count'] >= table['count'], 'Live table lost rows: ' + name)
            require(migration_ledger(ROOT / 'state/site.sqlite') == expected_migrations, 'Final live migration ledger mismatch')
            require((ROOT / 'current').resolve(strict=True) == dest, 'Live release changed during smoke tests')
            require(runtime_manifest(dest) == report['runtimeManifest'], 'Live release files changed during smoke tests')
            report['liveDataChecks'] = {'integrity': 'ok', 'preexistingBusinessTableCountsRetained': True,
                                       'volatileTableCountExclusions': sorted(VOLATILE_TABLES),
                                       'fullExistingRowPreservation': 'verified on isolated migrated backup; live concurrent writes remain possible'}
            report['after'] = after; report['result'] = 'PASS_AUTHORIZED_KNEBA_VSP_RELEASE'
        else:
            report['result'] = 'PASS_REHEARSAL_NOT_DEPLOYED'
    except Exception as error:
        report['result'] = 'FAILED'; report['error'] = str(error)
        if report.get('liveMigrationAttempted'):
            try:
                current = (ROOT / 'current').resolve(strict=True)
                require(current in [previous, dest], 'Concurrent switch; no overwrite')
                require(all(digest(ROOT / name) == value for name, value in config_hashes.items()), 'Configuration changed; automatic recovery requires coordination')
                # The exact previous runtime has accepted developer isolation evidence.
                # Configuration and schema remain unchanged during rollback.
                require(verify_qa(PREVIOUS_QA, EXPECTED_PREVIOUS, client_digest(previous / 'dist/client'), receipts=RECEIPTS[:2], extra_tests=False) == rollback_qa, 'Rollback developer isolation evidence changed')
                applied = migration_ledger(ROOT / 'state/site.sqlite')
                if applied == old_migrations and current == previous and not report.get('candidateWasActivated'):
                    # No new SQL committed and no pointer changed: leave the
                    # healthy original runtime alone, without a gratuitous restart.
                    require(read_public('/readyz')[0] == 200, 'Original runtime readiness could not be confirmed')
                    report['automaticRollback'] = 'NOT_NEEDED_ORIGINAL_SCHEMA_AND_RUNTIME_RETAINED'
                else:
                    require(all(expected_migrations.get(name) == value for name, value in applied.items()), 'Unexpected live migration drift; no recovery write')
                    require(runtime_manifest(dest) == report['runtimeManifest'] and runtime_manifest(rollback) == rollback_expected,
                            'Recovery runtime drift')
                    if applied != expected_migrations:
                        # Do not restore an old backup over newer user activity.
                        # Finish only the already rehearsed forward migrations,
                        # then run the verified old code with the current ledger.
                        isolated(dest, ROOT / 'state', ['node', '/app/vps/manage.mjs', 'migrate'], env=False)
                    require(migration_ledger(ROOT / 'state/site.sqlite') == expected_migrations, 'Recovery migrations remain incomplete')
                    require((ROOT / 'current').resolve(strict=True) == current, 'Concurrent switch during recovery; no overwrite')
                    switch(rollback); restart(image)
                    report['rollbackArtifact'] = running_attestation(image, runtime_user, rollback_expected, client_digest(rollback / 'dist/client'))
                    require((ROOT / 'current').resolve(strict=True) == rollback and read_public('/readyz')[0] == 200,
                            'Rollback runtime readiness could not be confirmed')
                    status, headers, _ = read_public('/')
                    require(status == 200 and 'noindex' in headers.get('x-robots-tag', '').lower(), 'Rollback public smoke failed')
                    report['automaticRollback'] = 'PASS_PREVIOUS_RUNTIME_CURRENT_SCHEMA'
                    report['activated'] = False; report['rollbackActivated'] = True
            except Exception as recovery:
                report['automaticRollback'] = 'BLOCKED'; report['rollbackError'] = str(recovery)
        raise
    finally:
        report['finishedAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
        try:
            checkpoint(evidence, report)
        finally:
            for handle in reversed(locks): handle.close()
            for number, handler in old_handlers.items(): signal.signal(number, handler)
            print(json.dumps({'result': report.get('result'), 'source': args.source, 'activated': report['activated'],
                              'automaticRollback': report.get('automaticRollback'), 'error': report.get('error'), 'evidence': str(evidence)}), flush=True)

if __name__ == '__main__':
    main()
