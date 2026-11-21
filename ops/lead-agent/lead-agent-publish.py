#!/usr/bin/env python3
"""Publish only the isolated KNABA Lead Agent TEST origin.

Operator artifact; no automatic execution. Run through the authorized SentinelX
sudo script_run mechanism, only after the exact candidate is approved.

Required root-owned 0600 /srv/knaba/lead-agent/private/release-gate.json:
{
  "schema": 1, "git_sha": "<40 hex>", "artifact_sha256": "<64 hex>",
  "artifact_path": "/srv/knaba/lead-agent/releases/<sha>/<source archive>",
  "api_image_id": "sha256:<64 hex>", "mode": "TEST",
  "origin": "https://bot.knaba.de", "company_id": "knaba-lead-agent-test",
  "verified_at": "<UTC ISO timestamp, at most 2h old>",
  "checks": {"source_review":"PASS", "ci":"PASS",
    "authenticated_loopback_smoke":"PASS", "default_credentials_absent":"PASS",
    "postgres_backup":"PASS", "backup_restore":"PASS"}
}

The gate records real evidence gathered by the release operator. This script
does not create a PASS or replace authenticated / PostgreSQL / CI validation.
stage creates a dedicated tunnel and starts its dedicated systemd connector.
publish creates only bot.knaba.de after the stage and all checks pass.
verify reads public, local and Cloudflare state. unpublish removes only the DNS
record created by this script and stops only this connector; it retains DB,
artifacts, tunnel, credentials and receipts for recovery.

Usage: python3 lead-agent-publish.py stage --sha <sha> --artifact-sha256 <hash>
Then invoke publish, then verify. A failed helper call is not retried as a write.
All credentials, full API receipts and helper output remain in private files.
Provision /srv/knaba/lead-agent/private/publish-cloudflare-scope.json as a
root-owned 0600 JSON object with account_id and zone_id (32 lowercase hex each).
Use the customer account and zone authorized for this TEST hostname.
"""

import argparse
import datetime as dt
import fcntl
import hashlib
import json
import os
import pathlib
import re
import socket
import stat
import subprocess
import sys
import urllib.error
import urllib.request
import uuid

ROOT = pathlib.Path('/srv/knaba/lead-agent')
PRIVATE = ROOT / 'private'
CFDIR = PRIVATE / 'cloudflare'
STATE = CFDIR / 'state.json'
GATE = PRIVATE / 'release-gate.json'
HELPER = '/opt/knaba/cloudflare-management/knaba_cf_token_manager.py'
RECEIPTS = pathlib.Path('/etc/knaba-customer-cloudflare/responses')
REQUEST_BODIES = pathlib.Path('/etc/knaba-customer-cloudflare/lead-agent-requests')
SCOPE_FILE = PRIVATE / 'publish-cloudflare-scope.json'
NAME = 'knaba-lead-agent'
PROJECT = 'knaba-lead-agent-test'
HOST = 'bot.knaba.de'
ORIGIN = 'https://' + HOST
LOCAL = 'http://127.0.0.1:19180'
UNIT_NAME = 'cloudflared-knaba-lead-agent.service'
UNIT_PATH = pathlib.Path('/etc/systemd/system') / UNIT_NAME
TOKEN = CFDIR / 'tunnel-token'
CONFIG = CFDIR / 'connector-empty.yml'
UUID = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
RECORD_ID = re.compile(r'^[0-9a-f]{32}$')
MAX_READ = 4 * 1024 * 1024
UNIT = f'''[Unit]
Description=KNABA Lead Agent isolated TEST Cloudflare Tunnel
Wants=network-online.target
After=network-online.target docker.service

[Service]
Type=simple
DynamicUser=yes
LoadCredential=tunnel-token:{TOKEN}
LoadCredential=cloudflared-config:{CONFIG}
ExecStart=/usr/local/bin/cloudflared --no-autoupdate tunnel --config %d/cloudflared-config --metrics 127.0.0.1:20253 --loglevel warn run --token-file %d/tunnel-token
Restart=on-failure
RestartSec=5s
TimeoutStopSec=30s
NoNewPrivileges=yes
PrivateTmp=yes
PrivateDevices=yes
ProtectSystem=strict
ProtectHome=yes
CapabilityBoundingSet=
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
RestrictSUIDSGID=yes
LockPersonality=yes
UMask=0077

[Install]
WantedBy=multi-user.target
'''


class Blocked(Exception):
    pass


def check(condition, code):
    if not condition:
        raise Blocked(code)


def utcnow():
    return dt.datetime.now(dt.timezone.utc)


def private_dir(path, create=False):
    """No symlink or group/world-writable ancestor; final directory root 0700."""
    check(path.is_absolute(), 'DIRECTORY_PATH_INVALID')
    for part in [*reversed(path.parents), path]:
        if not part.exists():
            check(create and part == path, 'DIRECTORY_MISSING')
            os.mkdir(part, 0o700)
        info = part.lstat()
        check(stat.S_ISDIR(info.st_mode) and not stat.S_ISLNK(info.st_mode), 'DIRECTORY_UNSAFE')
        check(info.st_uid == 0 and info.st_mode & 0o022 == 0, 'DIRECTORY_OWNER_OR_MODE_UNSAFE')
    check(path.stat().st_mode & 0o077 == 0, 'PRIVATE_DIRECTORY_REQUIRED')


def read_bytes(path, private=True, maximum=MAX_READ):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        before = os.fstat(fd)
        check(stat.S_ISREG(before.st_mode) and before.st_uid == 0, 'FILE_OWNER_OR_TYPE_UNSAFE')
        check(before.st_mode & (0o077 if private else 0o022) == 0, 'FILE_MODE_UNSAFE')
        check(before.st_size <= maximum, 'FILE_TOO_LARGE')
        with os.fdopen(fd, 'rb', closefd=False) as stream:
            raw = stream.read(maximum + 1)
        after = os.fstat(fd)
        check(len(raw) <= maximum and (before.st_size, before.st_mtime_ns, before.st_ctime_ns) ==
              (after.st_size, after.st_mtime_ns, after.st_ctime_ns), 'FILE_CHANGED_DURING_READ')
        return raw
    finally:
        os.close(fd)


def write_private(path, value, exclusive=False):
    raw = value if isinstance(value, bytes) else (json.dumps(value, sort_keys=True, indent=2) + '\n').encode()
    private_dir(path.parent)
    if exclusive:
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, 'wb') as stream:
            stream.write(raw)
            stream.flush()
            os.fsync(stream.fileno())
        return
    temporary = path.with_name(path.name + '.' + uuid.uuid4().hex + '.tmp')
    write_private(temporary, raw, exclusive=True)
    os.replace(temporary, path)


def command(args, code, timeout=40):
    result = subprocess.run(args, capture_output=True, timeout=timeout, check=False)
    check(result.returncode == 0, code)
    check(len(result.stdout) < MAX_READ and len(result.stderr) < MAX_READ, 'COMMAND_OUTPUT_TOO_LARGE')
    return result.stdout


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def http(base, path, method='GET', data=None):
    headers = {'Accept': 'application/json', 'User-Agent': 'KNABA-Lead-Agent-release-check/1'}
    if base == LOCAL:
        headers.update({'Host': HOST, 'X-Forwarded-Proto': 'https'})
    body = None
    if data is not None:
        body = json.dumps(data).encode()
        headers.update({'Content-Type': 'application/json', 'Origin': ORIGIN})
    request = urllib.request.Request(base + path, data=body, headers=headers, method=method)
    try:
        handlers = [NoRedirect()]
        if base == LOCAL:
            handlers.append(urllib.request.ProxyHandler({}))
        response = urllib.request.build_opener(*handlers).open(request, timeout=12)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        raw = response.read(1024 * 1024 + 1)
        check(len(raw) <= 1024 * 1024, 'HTTP_BODY_TOO_LARGE')
        try:
            value = json.loads(raw)
        except (ValueError, UnicodeError):
            value = None
        return response.status, response.headers, value


def check_origin(base, sha):
    code, headers, version = http(base, '/api/v1/version')
    check(code == 200 and isinstance(version, dict) and version.get('sha') == sha and
          version.get('gitSha') == sha and version.get('mode') == 'TEST', 'ORIGIN_VERSION_MISMATCH')
    check('noindex' in headers.get('X-Robots-Tag', '').lower(), 'ORIGIN_NOINDEX_MISSING')
    code, _, ready = http(base, '/api/v1/ready')
    check(code == 200 and ready and ready.get('ready') is True and ready.get('mode') == 'TEST', 'ORIGIN_NOT_READY')
    code, _, config = http(base, '/api/v1/public/config')
    check(code == 200 and config and config.get('mode') == 'TEST' and config.get('demoEnabled') is False,
          'PUBLIC_DEMO_NOT_DISABLED')
    check(http(base, '/api/v1/me')[0] in (401, 403), 'ANONYMOUS_SESSION_NOT_DENIED')
    check(http(base, '/api/v1/auth/demo', 'POST', {'role': 'OWNER'})[0] in (401, 403, 404), 'DEMO_LOGIN_NOT_DENIED')
    code, headers, _ = http(base, '/')
    check(code == 302 and headers.get('Location') == '/app/lead-agent?language=UK', 'MODULE_LANDING_MISMATCH')


def release_gate(args):
    check(os.geteuid() == 0 and socket.gethostname() == 'knaba', 'TARGET_HOST_OR_ROOT_REQUIRED')
    private_dir(PRIVATE)
    gate = json.loads(read_bytes(GATE))
    check(gate.get('schema') == 1 and gate.get('git_sha') == args.sha and
          gate.get('artifact_sha256') == args.artifact_sha256 and gate.get('mode') == 'TEST' and
          gate.get('origin') == ORIGIN and gate.get('company_id') == 'knaba-lead-agent-test', 'RELEASE_GATE_MISMATCH')
    for key in ('source_review', 'ci', 'authenticated_loopback_smoke', 'default_credentials_absent', 'postgres_backup', 'backup_restore'):
        check(gate.get('checks', {}).get(key) == 'PASS', 'RELEASE_GATE_CHECK_' + key.upper())
    # Removal must remain possible when the application is down or evidence is old.
    # The immutable ownership state below still binds DNS and unit to this release.
    if args.phase == 'unpublish':
        return gate
    verified = dt.datetime.fromisoformat(gate['verified_at'].replace('Z', '+00:00'))
    check(verified.tzinfo is not None and 0 <= (utcnow() - verified).total_seconds() <= 7200, 'RELEASE_GATE_STALE')
    artifact = pathlib.Path(gate['artifact_path'])
    check(artifact.is_absolute() and artifact.resolve() == artifact and
          artifact.is_relative_to(ROOT / 'releases' / args.sha), 'ARTIFACT_PATH_INVALID')
    check(hashlib.sha256(read_bytes(artifact, private=False, maximum=64 * 1024 * 1024)).hexdigest() == args.artifact_sha256,
          'ARTIFACT_HASH_MISMATCH')
    api = command(['docker', 'ps', '--filter', 'label=com.docker.compose.project=' + PROJECT,
                   '--filter', 'label=com.docker.compose.service=api', '--format', '{{.ID}}'], 'API_CONTAINER_QUERY_FAILED').decode().split()
    check(len(api) == 1 and re.fullmatch('[0-9a-f]{12,64}', api[0]), 'EXACTLY_ONE_API_REQUIRED')
    actual_image = command(['docker', 'inspect', api[0], '--format', '{{.Image}}'], 'API_IMAGE_QUERY_FAILED').decode().strip()
    check(re.fullmatch('sha256:[0-9a-f]{64}', gate.get('api_image_id', '')) and actual_image == gate['api_image_id'], 'API_IMAGE_MISMATCH')
    image_sha = command(['docker', 'image', 'inspect', actual_image, '--format', '{{index .Config.Labels "org.opencontainers.image.revision"}}'],
                        'API_IMAGE_REVISION_QUERY_FAILED').decode().strip()
    check(image_sha == args.sha, 'API_IMAGE_REVISION_MISMATCH')
    return gate


def cf(method, path, body=None):
    check(path.startswith('/accounts/' + ACCOUNT + '/cfd_tunnel') or path.startswith('/zones/' + ZONE + '/dns_records'), 'CF_SCOPE_INVALID')
    args = ['python3', HELPER, 'request', method, path]
    request_id = uuid.uuid4().hex
    if body is not None:
        # The existing owner helper requires root:root on every path ancestor.
        # /srv/knaba intentionally has a non-root group; preserve that directory
        # and use a dedicated root-private request directory beside the helper receipts.
        private_dir(REQUEST_BODIES, create=True)
        for parent in [*reversed(REQUEST_BODIES.parents), REQUEST_BODIES]:
            check(parent.lstat().st_gid == 0, 'CF_REQUEST_ANCESTOR_GROUP_UNSAFE')
        body_path = REQUEST_BODIES / ('request-' + request_id + '.json')
        write_private(body_path, body, exclusive=True)
        args += ['--body-file', str(body_path)]
    result = subprocess.run(args, capture_output=True, timeout=45, check=False)
    write_private(CFDIR / ('helper-' + request_id + '.json'), {
        'returncode': result.returncode, 'stdout': result.stdout.decode(errors='replace'),
        'stderr': result.stderr.decode(errors='replace')}, exclusive=True)
    check(result.returncode == 0, 'CF_HELPER_FAILED_PRIVATE_RECEIPT_' + request_id)
    meta = json.loads(result.stdout)
    check(meta.get('success') is True and meta.get('http_status') in (200, 201), 'CF_API_FAILED_PRIVATE_RECEIPT_' + request_id)
    receipt = pathlib.Path(meta['response_file'])
    check(receipt.parent == RECEIPTS and re.fullmatch(r'[0-9a-f]{32}\.json', receipt.name), 'CF_RECEIPT_PATH_INVALID')
    outer = json.loads(read_bytes(receipt))
    body = outer.get('body')
    if isinstance(body, str):
        body = json.loads(body)
    check(isinstance(body, dict) and body.get('success') is True, 'CF_RECEIPT_INVALID')
    return body


def all_records(path):
    records = []
    for page in range(1, 11):
        body = cf('GET', path + '?page=' + str(page) + '&per_page=100')
        chunk = body.get('result')
        check(isinstance(chunk, list), 'CF_LIST_INVALID')
        records += chunk
        info = body.get('result_info') or {}
        if info.get('total_pages') is not None:
            check(isinstance(info['total_pages'], int) and 0 <= info['total_pages'] <= 10, 'CF_PAGINATION_BOUND')
            if page >= info['total_pages']:
                return records
        elif len(chunk) < 100:
            return records
    raise Blocked('CF_PAGINATION_INCOMPLETE')


def save_state(state):
    state['updated_at'] = utcnow().isoformat()
    write_private(STATE, state)


def owned_tunnel(state, require_healthy=False):
    tunnel_id = state.get('tunnel_id', '')
    check(UUID.fullmatch(tunnel_id), 'OWNED_TUNNEL_ID_REQUIRED')
    tunnel = cf('GET', '/accounts/' + ACCOUNT + '/cfd_tunnel/' + tunnel_id).get('result')
    check(isinstance(tunnel, dict) and tunnel.get('id') == tunnel_id and tunnel.get('name') == NAME and
          not tunnel.get('deleted_at') and tunnel.get('remote_config') is True, 'OWNED_TUNNEL_MISMATCH')
    if require_healthy:
        check(tunnel.get('status') == 'healthy', 'TUNNEL_NOT_HEALTHY_YET')
    return tunnel_id


def dns_conflicts(state):
    records = all_records('/zones/' + ZONE + '/dns_records')
    check(not any(r.get('name') == '*.knaba.de' for r in records), 'WILDCARD_DNS_REVIEW_REQUIRED')
    exact = [r for r in records if r.get('name') == HOST]
    check(len(exact) <= 1, 'MULTIPLE_TARGET_DNS_RECORDS')
    if exact:
        record = exact[0]
        check(record.get('id') == state.get('dns_record_id') and record.get('type') == 'CNAME' and
              record.get('content') == state.get('tunnel_id', '') + '.cfargotunnel.com' and record.get('proxied') is True,
              'EXISTING_DNS_NOT_OWNED')
    return exact


def connector_ready(state):
    tunnel_id = owned_tunnel(state, require_healthy=True)
    check(read_bytes(UNIT_PATH, private=False).decode() == UNIT, 'UNIT_CONTENT_MISMATCH')
    active = command(['systemctl', 'is-active', UNIT_NAME], 'CONNECTOR_NOT_ACTIVE').decode().strip()
    check(active == 'active', 'CONNECTOR_NOT_ACTIVE')
    connections = cf('GET', '/accounts/' + ACCOUNT + '/cfd_tunnel/' + tunnel_id + '/connections').get('result')
    check(isinstance(connections, list) and len(connections) > 0, 'CONNECTOR_CONNECTION_PENDING')


def stage(state):
    if UNIT_PATH.exists():
        check(read_bytes(UNIT_PATH, private=False).decode() == UNIT, 'UNIT_ALREADY_EXISTS_DIFFERENT')
    active = subprocess.run(['systemctl', 'is-active', UNIT_NAME], capture_output=True, timeout=10, check=False)
    if active.returncode != 0 or active.stdout.strip() != b'active':
        with socket.socket() as probe:
            try:
                probe.bind(('127.0.0.1', 20253))
            except OSError:
                raise Blocked('METRICS_PORT_OCCUPIED') from None
    dns_conflicts(state)
    if not state.get('tunnel_id'):
        existing = all_records('/accounts/' + ACCOUNT + '/cfd_tunnel')
        check(not any(t.get('name') == NAME and not t.get('deleted_at') for t in existing), 'TUNNEL_NAME_EXISTS_REVIEW_PRIVATE_RECEIPTS')
        state['creation_intent'] = utcnow().isoformat()
        save_state(state)
        result = cf('POST', '/accounts/' + ACCOUNT + '/cfd_tunnel', {'name': NAME, 'config_src': 'cloudflare'}).get('result')
        check(isinstance(result, dict) and UUID.fullmatch(result.get('id', '')) and result.get('name') == NAME, 'NEW_TUNNEL_RESPONSE_INVALID')
        state['tunnel_id'] = result['id']
        save_state(state)
    tunnel_id = owned_tunnel(state)
    config = {'config': {'ingress': [{'hostname': HOST, 'service': LOCAL}, {'service': 'http_status:404'}]}}
    cf('PUT', '/accounts/' + ACCOUNT + '/cfd_tunnel/' + tunnel_id + '/configurations', config)
    if not TOKEN.exists():
        token = cf('GET', '/accounts/' + ACCOUNT + '/cfd_tunnel/' + tunnel_id + '/token').get('result')
        check(isinstance(token, str) and 50 <= len(token) <= 16384 and not any(c.isspace() for c in token), 'TOKEN_RESPONSE_INVALID')
        write_private(TOKEN, token.encode(), exclusive=True)
    else:
        check(50 <= len(read_bytes(TOKEN)) <= 16384, 'TOKEN_FILE_INVALID')
    if not CONFIG.exists():
        write_private(CONFIG, b'{}\n', exclusive=True)
    check(read_bytes(CONFIG) == b'{}\n', 'CONNECTOR_CONFIG_MISMATCH')
    check(pathlib.Path('/usr/local/bin/cloudflared').is_file(), 'CLOUDFLARED_BINARY_MISSING')
    if UNIT_PATH.exists():
        check(read_bytes(UNIT_PATH, private=False).decode() == UNIT, 'UNIT_ALREADY_EXISTS_DIFFERENT')
    else:
        # /etc/systemd/system is operator controlled. O_EXCL prevents replacing an existing unit.
        fd = os.open(UNIT_PATH, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o644)
        with os.fdopen(fd, 'w') as stream:
            stream.write(UNIT)
            stream.flush()
            os.fsync(stream.fileno())
    command(['systemctl', 'daemon-reload'], 'SYSTEMD_RELOAD_FAILED')
    command(['systemctl', 'enable', '--now', UNIT_NAME], 'CONNECTOR_START_FAILED')
    state['stage'] = 'CONNECTOR_STARTED'
    save_state(state)


def publish(state):
    connector_ready(state)
    records = dns_conflicts(state)
    if not records:
        value = {'type': 'CNAME', 'name': HOST, 'content': state['tunnel_id'] + '.cfargotunnel.com', 'proxied': True, 'ttl': 1}
        result = cf('POST', '/zones/' + ZONE + '/dns_records', value).get('result')
        check(isinstance(result, dict) and RECORD_ID.fullmatch(result.get('id', '')) and result.get('name') == HOST and
              result.get('content') == value['content'] and result.get('proxied') is True, 'NEW_DNS_RESPONSE_INVALID')
        state['dns_record_id'] = result['id']
        save_state(state)
    state['stage'] = 'DNS_PUBLISHED'
    save_state(state)


def unpublish(state):
    # Removal is confined to the previously recorded exact DNS id + content + unit.
    # A Cloudflare API outage must not prevent stopping this local connector.
    if UNIT_PATH.exists():
        check(read_bytes(UNIT_PATH, private=False).decode() == UNIT, 'UNPUBLISH_UNIT_MISMATCH')
        command(['systemctl', 'disable', '--now', UNIT_NAME], 'CONNECTOR_STOP_FAILED')
    state['stage'] = 'CONNECTOR_STOPPED_PENDING_DNS'
    save_state(state)
    records = dns_conflicts(state)
    if records:
        cf('DELETE', '/zones/' + ZONE + '/dns_records/' + records[0]['id'])
        state.pop('dns_record_id', None)
        save_state(state)
    state['stage'] = 'UNPUBLISHED_DATA_RETAINED'
    save_state(state)


def unique_scope_fields(pairs):
    fields=dict(pairs)
    check(len(fields)==len(pairs), 'PUBLISH_SCOPE_REQUIRED_OR_INVALID')
    return fields


def read_publish_scope():
    private_dir(PRIVATE)
    try:
        scope = json.loads(read_bytes(SCOPE_FILE, maximum=1024), object_pairs_hook=unique_scope_fields)
    except (FileNotFoundError, ValueError, UnicodeError):
        raise Blocked('PUBLISH_SCOPE_REQUIRED_OR_INVALID') from None
    check(isinstance(scope, dict) and set(scope) == {'account_id','zone_id'} and
          all(isinstance(value,str) and RECORD_ID.fullmatch(value) and value != '0'*32 for value in scope.values()) and
          scope['account_id'] != scope['zone_id'], 'PUBLISH_SCOPE_REQUIRED_OR_INVALID')
    return scope['account_id'],scope['zone_id']


def main():
    global ACCOUNT, ZONE
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('phase', choices=['stage', 'publish', 'verify', 'unpublish'])
    parser.add_argument('--sha', required=True)
    parser.add_argument('--artifact-sha256', required=True)
    args = parser.parse_args()
    check(re.fullmatch('[0-9a-f]{40}', args.sha) and re.fullmatch('[0-9a-f]{64}', args.artifact_sha256), 'HASH_ARGUMENT_INVALID')
    ACCOUNT, ZONE = read_publish_scope()
    release_gate(args)
    private_dir(CFDIR, create=args.phase != 'verify')
    lock = os.open(CFDIR / 'operator.lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        check(STATE.exists() or args.phase == 'stage', 'EXISTING_OWNERSHIP_STATE_REQUIRED')
        state = json.loads(read_bytes(STATE)) if STATE.exists() else {
            'schema': 1, 'hostname': HOST, 'account_id': ACCOUNT, 'zone_id': ZONE, 'name': NAME,
            'git_sha': args.sha, 'artifact_sha256': args.artifact_sha256}
        check(state.get('schema') == 1 and state.get('hostname') == HOST and state.get('account_id') == ACCOUNT and
              state.get('zone_id') == ZONE and state.get('name') == NAME and state.get('git_sha') == args.sha and
              state.get('artifact_sha256') == args.artifact_sha256, 'STATE_SCOPE_MISMATCH')
        if args.phase != 'unpublish':
            check_origin(LOCAL, args.sha)
        if args.phase == 'stage':
            stage(state)
        elif args.phase == 'publish':
            publish(state)
        elif args.phase == 'unpublish':
            unpublish(state)
        else:
            connector_ready(state)
            check(dns_conflicts(state), 'PUBLIC_DNS_MISSING')
            check_origin(ORIGIN, args.sha)
        print(json.dumps({'status': 'PASS', 'phase': args.phase, 'mode': 'TEST', 'hostname': HOST,
                          'git_sha': args.sha, 'artifact_sha256': args.artifact_sha256,
                          'private_state': str(STATE), 'public_url': ORIGIN if args.phase in ('publish', 'verify') else None}))
    finally:
        os.close(lock)


if __name__ == '__main__':
    try:
        main()
    except Blocked as error:
        print(json.dumps({'status': 'BLOCKED', 'code': str(error), 'secret_values_printed': False}), file=sys.stderr)
        sys.exit(2)
    except Exception as error:
        # Neither a helper diagnostic, exception string nor HTTP response may leak a token.
        print(json.dumps({'status': 'BLOCKED', 'code': 'OPERATOR_EXCEPTION', 'exception_type': type(error).__name__,
                          'secret_values_printed': False}), file=sys.stderr)
        sys.exit(2)
