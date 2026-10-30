"""Prepare the owner's dedicated synthetic developer login after accepted release.

No password is generated, no account is activated, and no invitation is sent to
another person. The single-use activation capability remains in a private file
for direct handoff to the requesting owner. Existing identities are not changed.
"""
from pathlib import Path
import argparse, datetime, fcntl, hashlib, json, os, re, signal, sqlite3, stat, subprocess
import urllib.request, urllib.error

ROOT = Path('/srv/knaba/vps')
ORIGIN = 'https://kneba.vsp.rest'
TEST_EMAIL = 'developer-test@workspace.knaba.invalid'
LIFETIME_MS = 2 * 60 * 60 * 1000

def require(condition, message):
    if not condition:
        raise RuntimeError(message)

def run(args, **kwargs):
    result = subprocess.run(args, capture_output=True, text=True, **kwargs)
    if result.returncode:
        # Compose errors can contain expanded private environment values.
        raise RuntimeError('Command failed: ' + args[0] + ' (exit ' + str(result.returncode) + ')')
    return result.stdout

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def running_attestation(accepted):
    value = json.loads(run(['docker', 'inspect', 'knaba-vps-internal'], timeout=10))[0]
    require(value['Image'] == accepted['image'] and value['Config']['User'] == accepted['runtimeUser']
            and value['State']['Running'] is True, 'Running image, UID/GID or state differs from accepted release')
    require(any(mount.get('Type') == 'bind' and mount.get('Destination') == '/var/lib/knaba'
                and mount.get('Source') == str(ROOT / 'state') and mount.get('RW') is True
                for mount in value.get('Mounts', [])), 'Runtime state mount differs from the reviewed database')
    code = """import fs from 'node:fs';import path from 'node:path';import{createHash}from'node:crypto';
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
function entries(root){const result={};function visit(p){const s=fs.lstatSync(p);if(s.isSymbolicLink())throw Error('Unexpected runtime symlink');if(s.isDirectory())for(const n of fs.readdirSync(p))visit(path.join(p,n));else if(s.isFile())result[path.relative(root,p)]=hash(p);else throw Error('Unexpected runtime file');}visit(root);return result;}
console.log(JSON.stringify(Object.fromEntries(['dist','vps','drizzle','package.json'].map(part=>{const p='/app/'+part;return[part,fs.lstatSync(p).isDirectory()?entries(p):hash(p)];}))));"""
    actual = json.loads(run(['docker', 'exec', 'knaba-vps-internal', 'node', '--input-type=module', '-e', code], timeout=30))
    require(actual == accepted['runtimeManifest'], 'Running bytes differ from the accepted release')
    return dict(line.split('=', 1) for line in value['Config']['Env'] if '=' in line)

def check_configuration(accepted, site_hash=None):
    names = {'docker-compose.yml', 'config/site.env', '.env'}
    expected = accepted['configSha256']
    require(isinstance(expected, dict) and {'docker-compose.yml', 'config/site.env'} <= set(expected)
            and set(expected) <= names, 'Accepted configuration hashes are incomplete')
    require({name for name in names if (ROOT / name).exists()} == set(expected), 'Configuration files changed since release')
    for name, value in expected.items():
        path = ROOT / name
        require(path.is_file() and path.resolve(strict=True) == path, 'Configuration must be a canonical regular file')
        require(digest(path) == (site_hash if name == 'config/site.env' and site_hash else value),
                'Configuration changed since accepted release: ' + name)

def restart(accepted, before, developer, site_hash=None):
    check_configuration(accepted, site_hash)
    compose = json.loads(run(['docker', 'compose', '-f', str(ROOT / 'docker-compose.yml'),
                              'config', '--format', 'json'], cwd=ROOT, timeout=20))
    web = compose['services']['web']
    reference = web.get('image')
    require(reference and run(['docker', 'image', 'inspect', '-f', '{{.Id}}', reference], timeout=10).strip() == accepted['image'],
            'Compose image differs from the accepted local image')
    environment = web.get('environment', {})
    if isinstance(environment, list):
        environment = dict(item.split('=', 1) for item in environment if '=' in item)
    expected = {**before, 'KNABA_DEVELOPER_EMAIL': developer}
    require(web.get('user') == accepted['runtimeUser'], 'Resolved Compose UID/GID differs from accepted runtime')
    require(isinstance(environment, dict)
            and all(value is not None and expected.get(key) == str(value) for key, value in environment.items())
            and environment.get('OWNER_EMAIL') == before['OWNER_EMAIL']
            and environment.get('KNABA_PUBLIC_ORIGIN') == ORIGIN
            and environment.get('KNABA_DB_PATH') == '/var/lib/knaba/site.sqlite'
            and environment.get('KNABA_DEVELOPER_EMAIL', '') == developer,
            'Resolved Compose environment differs from the intended configuration')
    run(['docker', 'compose', '-f', str(ROOT / 'docker-compose.yml'), 'up', '-d',
         '--force-recreate', '--no-deps', '--pull', 'never', '--wait', '--wait-timeout', '60', 'web'], cwd=ROOT, timeout=90)

def check_environment(before, after, developer):
    require(after.get('KNABA_PUBLIC_ORIGIN') == ORIGIN and after.get('KNABA_DB_PATH') == '/var/lib/knaba/site.sqlite',
            'Effective public origin or database changed')
    require(after.get('KNABA_DEVELOPER_EMAIL', '') == developer, 'Effective developer identity differs')
    require({key: value for key, value in before.items() if key != 'KNABA_DEVELOPER_EMAIL'}
            == {key: value for key, value in after.items() if key != 'KNABA_DEVELOPER_EMAIL'},
            'An unrelated effective environment value changed')

def canonical_private_file(path, mode=0o600):
    require(path.resolve(strict=True) == path and stat.S_ISREG(path.lstat().st_mode), 'Private file must be canonical and regular')
    if mode is not None:
        require(stat.S_IMODE(path.stat().st_mode) == mode, 'Private file permissions differ from the required mode')
    return path

def state_file(value):
    container = Path(value)
    require(container.is_absolute() and '..' not in container.parts, 'Invalid private state path')
    path = ROOT / 'state' / container.relative_to('/var/lib/knaba')
    return canonical_private_file(path)

def private_replace(path, data, metadata):
    temporary = path.with_name(path.name + '.developer-' + str(os.getpid()))
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(fd, 'wb') as stream:
            stream.write(data); stream.flush(); os.fsync(stream.fileno())
        os.chown(temporary, metadata.st_uid, metadata.st_gid)
        os.chmod(temporary, metadata.st_mode & 0o777)
        os.replace(temporary, path)
        directory = os.open(path.parent, os.O_DIRECTORY)
        try: os.fsync(directory)
        finally: os.close(directory)
    finally:
        if temporary.exists(): temporary.unlink()

def primary_digest():
    connection = sqlite3.connect('file:' + str(ROOT / 'state/site.sqlite') + '?mode=ro', uri=True)
    try:
        connection.execute('BEGIN')
        require(connection.execute('PRAGMA integrity_check').fetchone()[0] == 'ok', 'Database integrity check failed')
        require(not connection.execute('PRAGMA foreign_key_check').fetchall(), 'Database foreign key check failed')
        result = {}
        for (table,) in connection.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"):
            if table in ['vps_owner_invites', 'vps_sessions', 'vps_login_limits']:
                continue
            quoted = '"' + table.replace('"', '""') + '"'
            rows = sorted(repr(tuple(row)) for row in connection.execute('SELECT * FROM ' + quoted))
            result[table] = {'rows': len(rows), 'sha256': hashlib.sha256('\n'.join(rows).encode()).hexdigest()}
        return result
    finally:
        connection.close()

def invitation_rows():
    connection = sqlite3.connect('file:' + str(ROOT / 'state/site.sqlite') + '?mode=ro', uri=True)
    try:
        return connection.execute('SELECT token_hash,email,issued_at,expires_at,used_at FROM vps_owner_invites ORDER BY token_hash').fetchall()
    finally:
        connection.close()

def invalidate_new_invitation(previous, token_hash, issued_after):
    # Never revert a snapshot or touch an older/other address's capability.
    connection = sqlite3.connect('file:' + str(ROOT / 'state/site.sqlite') + '?mode=rw', uri=True, timeout=10)
    try:
        connection.execute('BEGIN IMMEDIATE')
        existing = {row[0] for row in previous}
        rows = [row for row in connection.execute('SELECT token_hash,issued_at,used_at FROM vps_owner_invites WHERE email=?', (TEST_EMAIL,))
                if row[0] not in existing and (token_hash is None or row[0] == token_hash)]
        require(len(rows) <= 1, 'Ambiguous new invitation; preserve rows and review privately')
        if rows:
            row = rows[0]
            require(row[1] >= issued_after and row[2] is None, 'New invitation changed or was consumed; manual review required')
            count = connection.execute('UPDATE vps_owner_invites SET used_at=? WHERE token_hash=? AND email=? AND issued_at=? AND used_at IS NULL',
                                       (int(datetime.datetime.now(datetime.timezone.utc).timestamp() * 1000), row[0], TEST_EMAIL, row[1])).rowcount
            require(count == 1, 'New invitation invalidation failed')
        connection.commit()
        return bool(rows)
    except Exception:
        connection.rollback(); raise
    finally:
        connection.close()

def checkpoint(evidence, report):
    temporary = evidence / '.receipt-private.tmp'
    created = False
    try:
        with temporary.open('x') as stream:
            created = True
            json.dump(report, stream, indent=2); stream.write('\n'); stream.flush(); os.fsync(stream.fileno())
        os.replace(temporary, evidence / 'receipt-private.json')
        directory = os.open(evidence, os.O_DIRECTORY)
        try: os.fsync(directory)
        finally: os.close(directory)
    finally:
        if created and temporary.exists(): temporary.unlink()

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', required=True)
    parser.add_argument('--qa-root', required=True)
    args = parser.parse_args()
    require(re.fullmatch('[0-9a-f]{40}', args.source), 'A full source SHA is required')
    qa = Path(args.qa_root)
    require(qa.name.startswith('knaba-role-workspaces-20261028-') and qa.parent == ROOT.parent / 'ops'
            and qa.resolve(strict=True) == qa and qa.is_dir(), 'Unexpected QA directory')
    release_receipt = qa / ('release-' + args.source[:12] + '-activate') / 'receipt-private.json'
    canonical_private_file(release_receipt)
    accepted = json.loads(release_receipt.read_text())
    require(accepted['source'] == args.source and accepted['result'] == 'PASS_AUTHORIZED_KNEBA_VSP_RELEASE'
            and accepted['activated'] is True and accepted['environment'] == ORIGIN, 'Matching accepted release is required')
    require(re.fullmatch('sha256:[0-9a-f]{64}', accepted['image'])
            and re.fullmatch('[1-9][0-9]*:[1-9][0-9]*', accepted['runtimeUser'])
            and isinstance(accepted['runtimeManifest'], dict) and accepted['runtimeManifest'], 'Accepted runtime attestation is missing')
    release_hash = digest(release_receipt)
    os.umask(0o077)
    evidence = qa / 'developer-invitation'
    evidence.mkdir(mode=0o700, exist_ok=False)
    config = ROOT / 'config/site.env'
    locks = []
    report = {'source': args.source, 'environment': ORIGIN, 'testLogin': TEST_EMAIL,
              'startedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'activationRequired': True, 'emailSent': False, 'passwordGenerated': False}
    original = None; replacement_hash = None; changed = False
    issue_attempted = False; token_hash = None; previous_invites = None; issued_after = None
    def interrupted(number, _frame):
        raise RuntimeError('Preparation interrupted by signal ' + str(number))
    old_handlers = {number: signal.signal(number, interrupted) for number in [signal.SIGTERM, signal.SIGINT]}
    try:
        for name in ['.knaba-preview-deploy.lock', '.knaba-preview-release.lock', '.ui-visual-release.lock']:
            handle = (ROOT / name).open('a'); fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB); locks.append(handle)
        require((ROOT / 'current').resolve(strict=True) == ROOT / 'releases' / args.source, 'Current release changed')
        require(digest(release_receipt) == release_hash, 'Accepted release receipt changed')
        check_configuration(accepted)
        env = running_attestation(accepted)
        require(env.get('KNABA_PUBLIC_ORIGIN') == ORIGIN and env.get('KNABA_DB_PATH') == '/var/lib/knaba/site.sqlite', 'Unexpected effective origin or database')
        require(env.get('OWNER_EMAIL') and env['OWNER_EMAIL'].strip().lower() != TEST_EMAIL, 'A separate real owner must be configured')
        require(not env.get('KNABA_DEVELOPER_EMAIL'), 'Existing configured developer requires separate reconciliation')
        canonical_private_file(ROOT / 'state/site.sqlite', mode=None)
        database = sqlite3.connect('file:' + str(ROOT / 'state/site.sqlite') + '?mode=ro', uri=True)
        try:
            require(database.execute('SELECT count(*) FROM vps_users WHERE lower(email)=?', (TEST_EMAIL,)).fetchone()[0] == 0, 'Do not replace an existing account')
            require(database.execute("SELECT count(*) FROM vps_staff_grants WHERE purpose='developer' AND active=1").fetchone()[0] == 0, 'Do not replace another developer grant')
            require(database.execute('SELECT count(*) FROM vps_users WHERE email=? AND disabled=0', (env['OWNER_EMAIL'].strip().lower(),)).fetchone()[0] == 1,
                    'A currently enabled real owner is required')
            require(database.execute('SELECT count(*) FROM vps_owner_invites WHERE email=? AND used_at IS NULL', (TEST_EMAIL,)).fetchone()[0] == 0,
                    'An existing unconsumed invitation requires separate reconciliation')
        finally:
            database.close()
        canonical_private_file(config)
        metadata = config.stat(); original = config.read_bytes()
        require(not re.search(rb'^\s*(?:export\s+)?KNABA_DEVELOPER_EMAIL\s*=', original, re.M), 'Reconcile an existing configuration entry explicitly')
        (evidence / 'site.env.before-private').write_bytes(original)
        before = primary_digest()
        backup = json.loads(run(['docker', 'exec', 'knaba-vps-internal', 'node', '/app/vps/manage.mjs', 'backup'], timeout=40))
        backup_path = state_file(backup['path'])
        require(backup_path.parent == ROOT / 'state/backups' and digest(backup_path) == backup['sha256']
                and backup_path.stat().st_size == backup['bytes'], 'Backup path, checksum or size mismatch')
        report['backupSha256'] = backup['sha256']
        replacement = original + (b'' if original.endswith(b'\n') else b'\n') + b'KNABA_DEVELOPER_EMAIL=' + TEST_EMAIL.encode() + b'\n'
        require(config.read_bytes() == original, 'Configuration changed before preparation')
        replacement_hash = hashlib.sha256(replacement).hexdigest()
        changed = True  # Recovery also covers an error after the atomic rename.
        private_replace(config, replacement, metadata)
        restart(accepted, env, TEST_EMAIL, replacement_hash)
        check_environment(env, running_attestation(accepted), TEST_EMAIL)
        require((ROOT / 'current').resolve(strict=True) == ROOT / 'releases' / args.source, 'Current release changed')
        checks = []
        for path in ['/readyz', '/activate-developer/', '/login/?lang=uk']:
            with urllib.request.urlopen(ORIGIN + path, timeout=12) as response:
                require(response.status == 200 and response.geturl() == ORIGIN + path, 'Public readiness response or destination differs')
                checks.append({'path': path, 'status': response.status})
        previous_invites = invitation_rows()
        require(not any(row[1].lower() == TEST_EMAIL and row[4] is None for row in previous_invites), 'Invitation state changed before issuance')
        issued_after = int(datetime.datetime.now(datetime.timezone.utc).timestamp() * 1000)
        issue_attempted = True
        result = json.loads(run(['docker', 'exec', 'knaba-vps-internal', 'node', '/app/vps/manage.mjs', 'invite-developer'], timeout=30))
        require(result['issued'] is True, 'Invitation was not issued')
        private_file = state_file(result['secretFile'])
        require(private_file.parent == ROOT / 'state/owner-invites'
                and stat.S_IMODE(private_file.parent.stat().st_mode) == 0o700, 'Invitation must be in the private handoff directory')
        invitation = json.loads(private_file.read_text())
        require(invitation['to'] == TEST_EMAIL, 'Invitation recipient differs')
        match = re.fullmatch(re.escape(ORIGIN) + r'/activate-developer/#token=([A-Za-z0-9_-]{43})', invitation['activationUrl'])
        require(match, 'Invitation activation destination or token format differs')
        token_hash = hashlib.sha256(match.group(1).encode()).hexdigest()
        expires_at = datetime.datetime.fromisoformat(invitation['expiresAt'].replace('Z', '+00:00'))
        require(expires_at.tzinfo is not None and expires_at > datetime.datetime.now(datetime.timezone.utc)
                and invitation['expiresAt'] == result['expiresAt'], 'Invitation expiry differs')
        after_invites = invitation_rows()
        new_rows = [row for row in after_invites if row[0] == token_hash]
        require(len(new_rows) == 1, 'Issued invitation was not persisted')
        row = new_rows[0]
        require(row[1] == TEST_EMAIL and row[4] is None and row[2] >= issued_after
                and row[2] <= int(datetime.datetime.now(datetime.timezone.utc).timestamp() * 1000)
                and row[3] - row[2] == LIFETIME_MS and row[3] == round(expires_at.timestamp() * 1000),
                'Persisted invitation recipient, state or two-hour lifetime differs')
        require([value for value in after_invites if value[0] != token_hash] == previous_invites, 'A pre-existing invitation changed; no rows reverted')
        check_configuration(accepted, replacement_hash)
        require(digest(release_receipt) == release_hash, 'Accepted release receipt changed before handoff')
        require((ROOT / 'current').resolve(strict=True) == ROOT / 'releases' / args.source, 'Current release changed before handoff')
        require(primary_digest() == before, 'Concurrent primary change requires review; no rows reverted')
        report.update({'result': 'READY_FOR_OWNER_HANDOFF', 'expiresAt': result['expiresAt'],
                       'secretFile': str(private_file), 'primaryApplicationDataUnchanged': True, 'http': checks,
                       'preexistingInvitationsUnchanged': True, 'invitationLifetimeMs': LIFETIME_MS,
                       'acceptedRuntimeVerified': True, 'finishedAt': datetime.datetime.now(datetime.timezone.utc).isoformat()})
        # Receipt failures are preparation failures and must revoke the capability.
        checkpoint(evidence, report)
    except Exception as error:
        report['result'] = 'FAILED'; report['error'] = str(error)
        for number in old_handlers: signal.signal(number, signal.SIG_IGN)
        if issue_attempted:
            try:
                report['newInvitationInvalidated'] = invalidate_new_invitation(previous_invites, token_hash, issued_after)
            except Exception as recovery:
                report['invitationRecoveryError'] = str(recovery)
        if changed:
            try:
                require((ROOT / 'current').resolve() == ROOT / 'releases' / args.source, 'Current release changed; do not recreate another release')
                actual = digest(config)
                require(actual in {replacement_hash, hashlib.sha256(original).hexdigest()}, 'Configuration changed; do not overwrite it')
                if actual == replacement_hash: private_replace(config, original, metadata)
                restart(accepted, env, env.get('KNABA_DEVELOPER_EMAIL', ''))
                check_environment(env, running_attestation(accepted), env.get('KNABA_DEVELOPER_EMAIL', ''))
                report['configurationRestored'] = True
            except Exception as recovery:
                report['recoveryError'] = str(recovery)
        report['finishedAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
        try: checkpoint(evidence, report)
        except Exception: report['receiptWriteFailed'] = True
        raise
    finally:
        for handle in reversed(locks): handle.close()
        for number, handler in old_handlers.items(): signal.signal(number, handler)
        print(json.dumps({key: report.get(key) for key in ['result', 'source', 'expiresAt', 'error', 'configurationRestored',
                                                         'newInvitationInvalidated', 'invitationRecoveryError', 'recoveryError', 'receiptWriteFailed']}), flush=True)

if __name__ == '__main__':
    main()
