#!/usr/bin/env bash
# KNABA domain setup — 2026-10-29
# Run ON THE KNABA SERVER:
#   sudo bash knaba-domain-setup.sh --check
#   sudo bash knaba-domain-setup.sh --apply
# Restore web DNS after an interrupted/failed cutover:
#   sudo bash knaba-domain-setup.sh --rollback
#
# --apply prompts privately for the owner's Cloudflare Global API Key + email
# (default option 1), or an API Token (option 2). It pins active knaba.de with
# ed.ns.cloudflare.com/gloria.ns.cloudflare.com, saves verified credentials
# root-only, configures a separate customer tunnel and its systemd service,
# and changes only apex/www web DNS after the existing official release gate.
# One.com MX and all non-web DNS records are preserved and compared.
#
# Prerequisites: existing KNABA installation, sudo, Python 3, Docker,
# cloudflared >= 2025.4.0, systemd, outbound HTTPS and tunnel connectivity.
# Existing firewall/SSH, developer VSP/AVENQO, mail, databases and application
# releases are outside the mutations performed by this domain script.
# It does not invent customer acceptance or change the release controller.
# Current candidate releases will return exit code 2 after auth/tunnel setup,
# with a list of remaining release requirements; DNS remains unchanged.
# On a standalone installation, re-run --apply after the official release.
# If the canonical managed credential or customer units already exist, --apply
# and --rollback stop before authentication or API calls. Use --check for the
# local release and /usr/local/sbin/knaba-cloudflare status for existing access.
#
# Checkpoints/credentials: /etc/knaba-customer-cloudflare/ (root only).
# Secrets are never accepted in arguments, shell history or environment.
# API writes are not blindly retried. DNS propagation is not atomic.
# Do not run multiple independent DNS/release operators simultaneously.
#
# --apply and --rollback require a root-owned 0600 JSON object in the 0700
# /etc/knaba-customer-cloudflare directory, named excluded-developer-scope.json.
# Its account_id and zone_id are 32 lowercase hex digits, tunnel_id a lowercase
# hyphenated UUID. These must identify the separate developer infrastructure
# to reject. --check only inspects local release readiness.
#
# API references:
# https://developers.cloudflare.com/fundamentals/api/how-to/make-api-calls/
# https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/get-started/create-remote-tunnel-api/
# https://developers.cloudflare.com/api/resources/dns/subresources/records/methods/batch/
#
set +x
set -euo pipefail
umask 077
if [[ ${EUID} -ne 0 ]]; then
  exec sudo -- /bin/bash "$0" "$@"
fi
command -v python3 >/dev/null || { echo 'Потрібен Python 3.' >&2; exit 2; }
python3 - "$@" <<'KNABA_SETUP_PYTHON'
"""Credential and scoped API core; importing this module performs no I/O."""
import datetime
import getpass
import http.client
import json
import os
import re
import secrets
import ssl
import stat
import sys
import urllib.parse
import warnings
from pathlib import Path

DOMAIN = "knaba.de"
AUTH_PATH = "/etc/knaba-customer-cloudflare/owner-auth.json"
EXPECTED_NS = {"ed.ns.cloudflare.com", "gloria.ns.cloudflare.com"}
DEVELOPER_SCOPE_PATH = "/etc/knaba-customer-cloudflare/excluded-developer-scope.json"
MAX_JSON, MAX_RESPONSE = 4 * 1024 * 1024, 4 * 1024 * 1024


class Failure(Exception):
    """A safe, secret-free diagnostic suitable for display."""


def _private_stat(info, directory=False):
    good_type = stat.S_ISDIR(info.st_mode) if directory else stat.S_ISREG(info.st_mode)
    if (not good_type or info.st_uid != 0
            or stat.S_IMODE(info.st_mode) != (0o700 if directory else 0o600)
            or (not directory and info.st_nlink != 1)):
        raise Failure("PRIVATE_PATH_OWNERSHIP_OR_MODE")


def _parent_fd(path, create=False):
    if os.geteuid() != 0:
        raise Failure("ROOT_REQUIRED")
    path = os.fspath(path)
    if (not isinstance(path, str) or not path.startswith("/") or "\x00" in path
            or any(p in ("", ".", "..") for p in path.split("/")[1:])):
        raise Failure("PRIVATE_PATH_INVALID")
    parts, fd = path.split("/")[1:], None
    flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC
    try:
        fd = os.open("/", flags)
        for index, part in enumerate(parts[:-1]):
            try:
                child = os.open(part, flags, dir_fd=fd)
            except FileNotFoundError:
                if not create or index != len(parts) - 2:
                    raise
                os.mkdir(part, 0o700, dir_fd=fd)
                child = os.open(part, flags, dir_fd=fd)
            os.close(fd)
            fd = child
            if os.fstat(fd).st_uid != 0:
                raise Failure("PRIVATE_PATH_OWNER")
        _private_stat(os.fstat(fd), directory=True)
        return fd, parts[-1]
    except BaseException:
        if fd is not None:
            os.close(fd)
        raise


def read_private_json(path, *, object_pairs_hook=None):
    """Return None when absent; reject unsafe files and oversized JSON."""
    parent, descriptor = None, None
    try:
        parent, name = _parent_fd(path)
        descriptor = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC,
                             dir_fd=parent)
        info = os.fstat(descriptor)
        _private_stat(info)
        if info.st_size > MAX_JSON:
            raise Failure("PRIVATE_JSON_TOO_LARGE")
        with os.fdopen(descriptor, "rb") as stream:
            descriptor = None
            data = stream.read(MAX_JSON + 1)
        if len(data) > MAX_JSON:
            raise Failure("PRIVATE_JSON_TOO_LARGE")
        return json.loads(data, object_pairs_hook=object_pairs_hook)
    except FileNotFoundError:
        return None
    except Failure:
        raise
    except (OSError, ValueError, TypeError):
        raise Failure("PRIVATE_JSON_READ_FAILED") from None
    finally:
        if descriptor is not None:
            os.close(descriptor)
        if parent is not None:
            os.close(parent)


def atomic_private_json(path, obj):
    """Atomic, durable replacement within a root-owned private directory."""
    parent, descriptor, temporary = None, None, None
    try:
        data = (json.dumps(obj, ensure_ascii=True, indent=2) + "\n").encode("utf-8")
        if len(data) > MAX_JSON:
            raise Failure("PRIVATE_JSON_TOO_LARGE")
        parent, name = _parent_fd(path, create=True)
        try:
            _private_stat(os.stat(name, dir_fd=parent, follow_symlinks=False))
        except FileNotFoundError:
            pass
        temporary = ".private-" + secrets.token_hex(16)
        descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL
                             | os.O_NOFOLLOW | os.O_CLOEXEC, 0o600, dir_fd=parent)
        os.fchmod(descriptor, 0o600)
        _private_stat(os.fstat(descriptor))
        with os.fdopen(descriptor, "wb") as stream:
            descriptor = None
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, name, src_dir_fd=parent, dst_dir_fd=parent)
        temporary = None
        os.fsync(parent)
    except Failure:
        raise
    except (OSError, ValueError, TypeError):
        raise Failure("PRIVATE_JSON_WRITE_FAILED") from None
    finally:
        if descriptor is not None:
            os.close(descriptor)
        if temporary is not None and parent is not None:
            try:
                os.unlink(temporary, dir_fd=parent)
            except OSError:
                pass
        if parent is not None:
            os.close(parent)


def _validate_credential(auth):
    if not isinstance(auth, dict) or auth.get("kind") not in ("global_key", "api_token"):
        raise Failure("AUTH_FORMAT_INVALID")
    secret = auth.get("secret")
    if (not isinstance(secret, str) or not 16 <= len(secret) <= 4096
            or any(not 33 <= ord(c) <= 126 for c in secret)):
        raise Failure("AUTH_SECRET_FORMAT_INVALID")
    if auth["kind"] == "global_key":
        email = auth.get("email")
        if (not isinstance(email, str) or len(email) > 254
                or not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email)
                or any(not 33 <= ord(c) <= 126 for c in email)):
            raise Failure("AUTH_EMAIL_INVALID")


def hidden_credential_input():
    """Require a real terminal; never fall back to echoed secret input."""
    try:
        # getpass opens its own input fd; this stream is only for prompts.
        # A buffered r+ stream requires seeking, which SSH terminals do not support.
        with open("/dev/tty", "w", encoding="utf-8", buffering=1) as tty:
            if not tty.isatty():
                raise Failure("AUTH_TTY_REQUIRED")
            with warnings.catch_warnings():
                warnings.simplefilter("error", getpass.GetPassWarning)
                mode = getpass.getpass("Тип доступу: 1 = Global API Key, 2 = API Token [1]: ", stream=tty).strip() or "1"
                if mode not in ("1", "2"):
                    raise Failure("AUTH_MODE_INVALID")
                auth = {"kind": "global_key" if mode == "1" else "api_token"}
                if mode == "1":
                    auth["email"] = getpass.getpass("Точний email Cloudflare акаунта власника (приховано): ", stream=tty).strip()
                auth["secret"] = getpass.getpass("Ключ або токен (введення приховане): ", stream=tty).strip()
        _validate_credential(auth)
        return auth
    except Failure:
        raise
    except (OSError, EOFError, KeyboardInterrupt, getpass.GetPassWarning):
        raise Failure("AUTH_TTY_INPUT_FAILED") from None


class API:
    def __init__(self, auth):
        _validate_credential(auth)
        self._auth = dict(auth)
        self.zone_id = self.account_id = None

    def _allow(self, method, path, query):
        if (method not in {"GET", "POST", "PUT", "PATCH", "DELETE"}
                or not isinstance(path, str) or not re.fullmatch(r"/[A-Za-z0-9_/-]+", path)
                or "//" in path):
            raise Failure("API_SCOPE_REJECTED")
        if self.zone_id is None:
            if method != "GET" or path != "/zones" or query.get("name") != DOMAIN:
                raise Failure("API_SCOPE_NOT_PINNED")
            return
        zone = "/zones/" + self.zone_id
        tunnel = "/accounts/" + self.account_id + "/cfd_tunnel"
        if not (path.startswith(zone + "/") or path == zone and method == "GET"
                or path == tunnel or path.startswith(tunnel + "/")):
            raise Failure("API_SCOPE_REJECTED")

    def _envelope(self, method, path, body=None, query=None):
        """Fetch a bounded envelope. Never follow redirects or retry writes."""
        query = dict(query or {})
        self._allow(method, path, query)
        headers = {"Accept": "application/json", "User-Agent": "knaba-owner-setup/1"}
        if self._auth["kind"] == "global_key":
            headers.update({"X-Auth-Key": self._auth["secret"], "X-Auth-Email": self._auth["email"]})
        else:
            headers["Authorization"] = "Bearer " + self._auth["secret"]
        connection = None
        try:
            payload = None if body is None else json.dumps(body).encode("utf-8")
            if payload is not None:
                headers["Content-Type"] = "application/json"
            url = "/client/v4" + path + (("?" + urllib.parse.urlencode(query)) if query else "")
            connection = http.client.HTTPSConnection("api.cloudflare.com", timeout=20,
                                                    context=ssl.create_default_context())
            connection.request(method, url, body=payload, headers=headers)
            response = connection.getresponse()
            if not 200 <= response.status < 300:
                raise Failure("API_HTTP_" + str(response.status))
            raw = response.read(MAX_RESPONSE + 1)
            if len(raw) > MAX_RESPONSE:
                raise Failure("API_RESPONSE_TOO_LARGE")
            data = json.loads(raw)
            if not isinstance(data, dict) or data.get("success") is not True:
                raise Failure("API_REPORTED_FAILURE")
            return data
        except Failure:
            raise
        except (OSError, ValueError, TypeError, http.client.HTTPException):
            raise Failure("API_NETWORK_TLS_OR_FORMAT_FAILED") from None
        finally:
            if connection is not None:
                connection.close()

    def request(self, method, path, body=None, query=None):
        """Return only result; envelope metadata is internal to pagination."""
        envelope = self._envelope(method, path, body=body, query=query)
        if "result" not in envelope:
            raise Failure("API_RESULT_MISSING")
        return envelope["result"]

    def list(self, path, query=None):
        """Retrieve bounded pages, rejecting inconsistent or repeated results."""
        output, seen = [], set()
        for page in range(1, 101):
            params = dict(query or {}, page=page, per_page=50)
            data = self._envelope("GET", path, query=params)
            rows, info = data.get("result"), data.get("result_info", {})
            if not isinstance(rows, list) or not isinstance(info, dict):
                raise Failure("API_LIST_FORMAT_INVALID")
            for row in rows:
                if not isinstance(row, dict) or not isinstance(row.get("id"), str) or row["id"] in seen:
                    raise Failure("API_LIST_REPEATED_OR_INVALID")
                seen.add(row["id"])
            output.extend(rows)
            pages = info.get("total_pages")
            if pages is not None:
                if type(pages) is not int or not 0 <= pages <= 100:
                    raise Failure("API_LIST_PAGE_LIMIT")
                if page >= pages:
                    return output
            elif len(rows) < 50:
                return output
        raise Failure("API_LIST_PAGE_LIMIT")


def read_excluded_scope():
    def unique_fields(pairs):
        fields = dict(pairs)
        if len(fields) != len(pairs):
            raise Failure("EXCLUDED_DEVELOPER_SCOPE_REQUIRED_OR_INVALID")
        return fields
    scope = read_private_json(DEVELOPER_SCOPE_PATH, object_pairs_hook=unique_fields)
    if (not isinstance(scope, dict) or set(scope) != {"account_id", "zone_id", "tunnel_id"}
            or any(not isinstance(scope[key], str) or not re.fullmatch(r"[0-9a-f]{32}", scope[key])
                   or scope[key] == "0"*32 for key in ("account_id", "zone_id"))
            or scope["account_id"] == scope["zone_id"]
            or not isinstance(scope["tunnel_id"], str)
            or not re.fullmatch(r"[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}", scope["tunnel_id"])
            or scope["tunnel_id"] == "00000000-0000-0000-0000-000000000000"):
        raise Failure("EXCLUDED_DEVELOPER_SCOPE_REQUIRED_OR_INVALID")
    return scope


def initialize_auth(path=AUTH_PATH, force_prompt=False, *, excluded):
    """Pin the verified customer scope before persisting or allowing writes."""
    saved = None if force_prompt else read_private_json(path)
    auth = saved if saved is not None else hidden_credential_input()
    api = API(auth)
    zones = api.list("/zones", {"name": DOMAIN})
    matches = [z for z in zones if z.get("name") == DOMAIN and z.get("status") == "active"]
    if len(matches) != 1:
        raise Failure("CUSTOMER_ZONE_NOT_UNIQUE_ACTIVE")
    zone = matches[0]
    account = zone.get("account")
    if not isinstance(account, dict):
        raise Failure("CUSTOMER_ZONE_ACCOUNT_INVALID")
    zone_id, account_id = zone.get("id"), account.get("id")
    nameservers = zone.get("name_servers")
    if (not isinstance(zone_id, str) or not re.fullmatch(r"[0-9a-f]{32}", zone_id)
            or not isinstance(account_id, str) or not re.fullmatch(r"[0-9a-f]{32}", account_id)
            or zone_id == excluded["zone_id"] or account_id == excluded["account_id"]
            or not isinstance(nameservers, list) or any(not isinstance(n, str) for n in nameservers)
            or {n.lower().rstrip(".") for n in nameservers} != EXPECTED_NS
            or zone.get("paused") is not False):
        raise Failure("CUSTOMER_ZONE_IDENTITY_REJECTED")
    if saved is not None and (saved.get("zone_id") != zone_id or saved.get("account_id") != account_id):
        raise Failure("SAVED_AUTH_SCOPE_CHANGED")
    api.zone_id, api.account_id = zone_id, account_id
    verified = {k: auth[k] for k in ("kind", "secret", "email") if k in auth}
    verified.update(version=1, zone_id=zone_id, account_id=account_id,
                    verified_at=datetime.datetime.now(datetime.timezone.utc).isoformat())
    atomic_private_json(path, verified)
    return api, zone


import argparse
import datetime as dt
import fcntl
import hashlib
import html.parser
import shutil
import socket
import subprocess
import time

ROOT = Path('/srv/knaba/customer')
AUTH_PATH = Path('/etc/knaba-customer-cloudflare/owner-auth.json')
WORK = Path('/etc/knaba-customer-cloudflare/domain-setup')
STATE_PATH = WORK / 'state.json'
JOURNAL = WORK / 'last-dns-change.json'
CONTROLLER = ROOT / 'ops/knabactl.py'
CONTROLLER_SHA = '0c08f9e3a426adb15fd8fce9504d8128ffa7cbaec29ef9e10260f074672c7202'
WEB_NAMES = ('knaba.de', 'www.knaba.de')
TUNNEL_NAME = 'knaba-customer-web'
UNIT = 'cloudflared-knaba-customer.service'
UNIT_PATH = Path('/etc/systemd/system') / UNIT
TOKEN_PATH = WORK / 'tunnel.token'
MANAGED = '# Managed by knaba-domain-setup v1'
CANONICAL_MANAGED_MARKERS = (
    Path('/etc/knaba-customer-cloudflare/credential.json'),
    Path('/etc/systemd/system/cloudflared-knaba-customer-production.service'),
    Path('/etc/systemd/system/cloudflared-knaba-customer-testing.service'),
)


def say(message):
    print(message, flush=True)


def require(condition, message):
    if not condition:
        raise Failure(message)


def run(argv, timeout=45):
    try:
        p = subprocess.run(argv, capture_output=True, text=True, timeout=timeout,
                           env={'PATH': '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
                                'LANG': 'C.UTF-8'})
    except (OSError, subprocess.TimeoutExpired):
        raise Failure('Команда не завершилась: ' + argv[0]) from None
    require(p.returncode == 0, 'Команда завершилась помилкою: ' + argv[0] + ' ' + ' '.join(argv[1:2]))
    return p.stdout


def check_host():
    require(os.geteuid() == 0, 'Запусти через sudo на сервері KNABA.')
    require(socket.gethostname().split('.')[0] == 'knaba', 'Цей скрипт призначений тільки для сервера knaba.')
    for path in (ROOT, CONTROLLER, ROOT / 'production/compose.json'):
        require(path.exists(), 'Відсутня встановлена структура KNABA: ' + str(path))
        for ancestor in (path, *path.parents):
            require(not ancestor.is_symlink(), 'Неочікуване символічне посилання: ' + str(ancestor))
    require(hashlib.sha256(CONTROLLER.read_bytes()).hexdigest() == CONTROLLER_SHA,
            'Контролер релізів змінився. Спочатку звір його нову версію зі скриптом.')
    for executable in ('docker', 'cloudflared', 'systemctl'):
        require(shutil.which(executable), 'Не знайдено залежність: ' + executable)
    require('--token-file' in run(['cloudflared', 'tunnel', 'run', '--help']),
            'Потрібен cloudflared з підтримкою --token-file.')


def request_site(host, path='/', *, public=False, secure=True):
    connection = None
    try:
        if public:
            cls = http.client.HTTPSConnection if secure else http.client.HTTPConnection
            connection = cls(host, timeout=12)
        else:
            connection = http.client.HTTPConnection('127.0.0.1', 19120, timeout=10)
        headers = {'Host': host, 'Cache-Control': 'no-cache', 'Accept-Encoding': 'identity',
                   'User-Agent': 'KNABA-domain-setup/1'}
        if not public:
            headers['X-Forwarded-Proto'] = 'https' if secure else 'http'
        suffix = ('&' if '?' in path else '?') + '__knaba_check=' + str(time.time_ns())
        connection.request('GET', path + suffix, headers=headers)
        response = connection.getresponse()
        content = response.read(2 * 1024 * 1024 + 1)
        require(len(content) <= 2 * 1024 * 1024, 'Завелика відповідь сайту.')
        return response.status, {k.lower(): v for k, v in response.getheaders()}, content.decode('utf-8', 'replace')
    except (OSError, http.client.HTTPException):
        return 0, {}, ''
    finally:
        if connection:
            connection.close()


class HeadParser(html.parser.HTMLParser):
    def __init__(self):
        super().__init__()
        self.canonical = []
        self.noindex = False

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'link' and 'canonical' in attrs.get('rel', '').lower().split():
            self.canonical.append(attrs.get('href', ''))
        if tag == 'meta' and attrs.get('name', '').lower() in ('robots', 'googlebot'):
            self.noindex |= 'noindex' in attrs.get('content', '').lower()


def home_is_official(response):
    code, headers, body = response
    p = HeadParser()
    p.feed(body)
    return (code == 200 and p.canonical == ['https://knaba.de/'] and not p.noindex
            and 'noindex' not in headers.get('x-robots-tag', '').lower())


def approval_exists(production):
    # Read the actual receipt emitted by the existing controller. Never manufacture one.
    approvals = {}
    for path in (ROOT / 'approvals').glob('*.json'):
        if path.is_symlink() or path.stat().st_uid != 0 or path.stat().st_mode & 0o077:
            continue
        if path.stat().st_size > 128 * 1024:
            continue
        raw = path.read_bytes()
        try:
            approvals[hashlib.sha256(raw).hexdigest()] = json.loads(raw)
        except (ValueError, TypeError):
            continue
    for path in (ROOT / 'receipts').glob('approval-used-*.json'):
        try:
            receipt = read_private_json(path)
            approval = approvals.get(path.stem.removeprefix('approval-used-'))
            if not approval:
                continue
            started = dt.datetime.fromisoformat(receipt['started_at'].replace('Z', '+00:00'))
            issued = dt.datetime.fromisoformat(approval['issued_at'].replace('Z', '+00:00'))
            expires = dt.datetime.fromisoformat(approval['expires_at'].replace('Z', '+00:00'))
            if (receipt.get('result') == 'ACTIVATED_CODE_ONLY'
                    and receipt.get('environment') == approval.get('environment') == 'production'
                    and receipt.get('artifact') == approval.get('artifact_sha256') == production['artifact']
                    and receipt.get('previous') == approval.get('expected_current_artifact')
                    and approval.get('hostname') == 'knaba.de'
                    and approval.get('configuration_sha256') == production['configuration_sha256']
                    and approval.get('user_approved') is True and approval.get('customer_approved') is True
                    and issued <= started < expires and expires - issued <= dt.timedelta(hours=48)
                    and all(isinstance(approval.get(k), str) and len(approval[k].strip()) >= 8
                            and approval[k] not in ('PENDING', 'NOT_PROVIDED', 'REPLACE_ME')
                            for k in ('user_approval_reference', 'customer_approval_reference'))):
                return True
        except (Failure, ValueError, KeyError, TypeError, OSError):
            continue
    return False


def local_readiness():
    report = json.loads(run(['python3', str(CONTROLLER), 'status'], timeout=75))
    production = report['environments']['production']
    inspect = json.loads(run(['docker', 'inspect', 'knaba-customer-prod']))[0]
    env = dict(item.split('=', 1) for item in inspect['Config'].get('Env', []) if '=' in item)
    issues = []
    if not production.get('artifact_verified'):
        issues.append('Контрольна сума production-артефакту не підтверджена.')
    if env.get('KNABA_RELEASE_MODE') != 'official':
        issues.append('Production ще не в режимі official.')
    if env.get('KNABA_PUBLIC_ORIGIN') != 'https://knaba.de' or env.get('KNABA_PUBLIC_HOST') != 'knaba.de':
        issues.append('Production має інший public origin/host.')
    if not approval_exists(production):
        issues.append('Немає чинного запису застосованого клієнтського релізу для цього артефакту й конфігурації.')
    bindings = inspect.get('HostConfig', {}).get('PortBindings') or {}
    expected = [{'HostIp': '127.0.0.1', 'HostPort': '19120'}]
    if bindings != {'8080/tcp': expected}:
        issues.append('Прив’язка production-порту відрізняється від 127.0.0.1:19120.')
    try:
        mounts = [mount for mount in inspect.get('Mounts', []) if mount.get('Destination') == '/app']
        release_path = ROOT / 'releases' / production['artifact']
        pid = inspect.get('State', {}).get('Pid', 0)
        expected_stat = release_path.stat()
        runtime_stat = Path('/proc/' + str(pid) + '/root/app').stat() if pid > 0 else None
        compose = json.loads((ROOT / 'production/compose.json').read_text())
        if (len(mounts) != 1 or mounts[0].get('Type') != 'bind' or mounts[0].get('RW') is not False
                or Path(mounts[0]['Source']).resolve() != release_path.resolve()
                or runtime_stat is None
                or (runtime_stat.st_dev, runtime_stat.st_ino) != (expected_stat.st_dev, expected_stat.st_ino)
                or inspect['Config'].get('Image') != compose['services']['web']['image']
                or not inspect.get('State', {}).get('Running')):
            issues.append('Запущений контейнер не відповідає затвердженому артефакту та образу.')
    except (OSError, KeyError, ValueError, TypeError):
        issues.append('Не вдалося звірити фактичний /app запущеного контейнера з артефактом.')
    if not home_is_official(request_site('knaba.de')):
        issues.append('Головна сторінка ще не має офіційного canonical/indexing для knaba.de.')
    for route in ('/healthz', '/readyz', '/login/'):
        if request_site('knaba.de', route)[0] != 200:
            issues.append('Не пройшла локальна перевірка ' + route)
    if request_site('knaba.de', '/api/crm/contacts')[0] not in (401, 403):
        issues.append('Не підтверджений захист CRM від анонімного доступу.')
    # A real release acceptance, owner enrollment and provider setup are prerequisites.
    # No edits to compose/site.env, no owner bypass, and no synthetic approval.
    return issues, {'artifact': production['artifact'], 'configuration_sha256': production['configuration_sha256']}


def normalize_record(record, include_id=True):
    keys = ('type', 'name', 'content', 'ttl', 'proxied', 'private_routing', 'priority', 'data', 'settings', 'comment', 'tags')
    result = {k: record[k] for k in keys if k in record and record[k] not in (None, [], {}, '')}
    if include_id:
        result['id'] = record['id']
    return result


def records_equal(left, right, include_id=True):
    return sorted(json.dumps(normalize_record(r, include_id), sort_keys=True) for r in left) == sorted(
        json.dumps(normalize_record(r, include_id), sort_keys=True) for r in right)


def web_record(record):
    return record.get('name', '').lower().rstrip('.') in WEB_NAMES and record.get('type') in ('A', 'AAAA', 'CNAME')


def check_mail_and_dependencies(records):
    expected_mx = {(10, 'mx%d.pub.mailpod10-cph3.one.com' % n) for n in range(1, 5)}
    actual_mx = {(r.get('priority'), r.get('content', '').lower().rstrip('.')) for r in records
                 if r.get('type') == 'MX' and r.get('name', '').lower().rstrip('.') == 'knaba.de'}
    require(actual_mx == expected_mx, 'Поштові MX відрізняються від перевірених One.com. DNS не змінено.')
    for r in records:
        name = r.get('name', '').lower().rstrip('.')
        value = r.get('content', '').lower().strip().strip('"').rstrip('.')
        if not web_record(r) and r.get('type') in ('CNAME', 'MX') and value in WEB_NAMES:
            raise Failure('Інший DNS-запис залежить від apex/www; потрібна окрема перевірка перед перенесенням.')
        if name in WEB_NAMES and r.get('type') in ('HTTPS', 'SVCB', 'NS'):
            raise Failure('На вебімені є додатковий маршрут HTTPS/SVCB/NS. Потрібне узгодження маршрутизації.')
        if r.get('type') == 'SRV' and r.get('data', {}).get('target', '').lower().rstrip('.') in WEB_NAMES:
            raise Failure('SRV залежить від вебімені; DNS не змінено.')
        if r.get('type') == 'TXT' and value.startswith('v=spf1'):
            for mechanism in value.split():
                mechanism = mechanism.lstrip('+-~?')
                target = mechanism.split('/')[0]
                if (target == 'a' and name in WEB_NAMES) or target in ('a:knaba.de', 'a:www.knaba.de'):
                    raise Failure('SPF використовує адресу вебсервера; спочатку потрібен окремий план збереження пошти.')


def write_private_text(path, value, mode=0o600):
    path = Path(path)
    for p in (path.parent, *path.parent.parents):
        require(not p.is_symlink(), 'Неочікуване символічне посилання.')
    if path.exists() or path.is_symlink():
        require(not path.is_symlink() and path.is_file() and path.stat().st_uid == 0,
                'Небезпечний існуючий файл: ' + str(path))
    temporary = path.with_name(path.name + '.new-' + str(os.getpid()))
    fd = os.open(temporary, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, mode)
    try:
        with os.fdopen(fd, 'w') as f:
            f.write(value)
            f.flush()
            os.fsync(f.fileno())
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def prepare_tunnel(api, zone, records, excluded_tunnel_id):
    account = zone['account']['id']
    base = '/accounts/' + account + '/cfd_tunnel'
    tunnels = api.list(base, {'is_deleted': 'false'})
    candidates = [t for t in tunnels if t.get('name') == TUNNEL_NAME and not t.get('deleted_at')]
    require(len(candidates) <= 1, 'Знайдено декілька клієнтських тунелів з однаковим іменем.')
    state = read_private_json(STATE_PATH) if STATE_PATH.exists() else {}
    if state:
        require(state.get('zone_id') == zone['id'] and state.get('account_id') == account,
                'Збережений стан належить іншій зоні чи акаунту.')
    desired = {'ingress': [
        {'hostname': name, 'service': 'http://127.0.0.1:19120',
         'originRequest': {'httpHostHeader': 'knaba.de'}} for name in WEB_NAMES
    ] + [{'service': 'http_status:404'}]}
    # Refuse to attach a new replica to someone else's active tunnel.
    if candidates:
        tunnel = candidates[0]
        require(state.get('tunnel_id') == tunnel['id'],
                'Клієнтський тунель уже існує без локального checkpoint; потрібна перевірка перед його повторним використанням.')
        require(tunnel.get('remote_config') is True, 'Існуючий тунель не керується через API.')
    else:
        require(not state.get('tunnel_id'), 'Збережений тунель більше не знайдено; новий автоматично не створено.')
        require(not any(r.get('type') == 'CNAME' and web_record(r)
                        and r.get('content', '').endswith('.cfargotunnel.com') for r in records),
                'Домен уже використовує інший тунель; потрібна перевірка існуючої маршрутизації.')
        state = {'account_id': account, 'zone_id': zone['id'], 'phase': 'creating_tunnel', 'name': TUNNEL_NAME}
        atomic_private_json(STATE_PATH, state)
        # One POST only. On ambiguity a rerun inventories the account and stops for review.
        tunnel = api.request('POST', base, {'name': TUNNEL_NAME, 'config_src': 'cloudflare'})
        require(re.fullmatch(r'[0-9a-f-]{36}', tunnel.get('id', '')) is not None, 'API не повернув ID тунелю.')
        state.update(tunnel_id=tunnel['id'], phase='tunnel_created')
        atomic_private_json(STATE_PATH, state)
    tunnel_id = tunnel['id']
    require(tunnel_id != excluded_tunnel_id, 'Відхилено developer tunnel.')
    endpoint = base + '/' + tunnel_id
    existing = (api.request('GET', endpoint + '/configurations') or {}).get('config') or {}
    if existing and existing != desired:
        require(existing.get('ingress') in (None, [], [{'service': 'http_status:404'}]),
                'У клієнтського тунелю вже є інша конфігурація; автоматично не перезаписую її.')
        require(set(existing) <= {'ingress'}, 'Існуючий тунель має додаткові налаштування.')
    if existing != desired:
        atomic_private_json(WORK / 'tunnel-config-before.json', existing)
        require(((api.request('GET', endpoint + '/configurations') or {}).get('config') or {}) == existing,
                'Конфігурація тунелю змінилась паралельно.')
        api.request('PUT', endpoint + '/configurations', {'config': desired})
    require(api.request('GET', endpoint + '/configurations').get('config') == desired,
            'Конфігурація тунелю не підтверджена.')
    token = api.request('GET', endpoint + '/token')
    require(isinstance(token, str) and re.fullmatch(r'[A-Za-z0-9_+/.=-]{40,4096}', token), 'Некоректна відповідь з token тунелю.')
    token_digest = hashlib.sha256(token.encode()).hexdigest()
    token_changed = state.get('token_sha256') != token_digest or not TOKEN_PATH.exists()
    write_private_text(TOKEN_PATH, token + '\n')
    del token
    state['token_sha256'] = token_digest
    atomic_private_json(STATE_PATH, state)
    # Explicit empty config prevents discovery of an unrelated developer config.yml.
    config_path = WORK / 'cloudflared.yml'
    write_private_text(config_path, '{}\n')
    executable = shutil.which('cloudflared')
    require(re.fullmatch(r'/[A-Za-z0-9_./-]+', executable) is not None, 'Неочікуваний шлях cloudflared.')
    unit = MANAGED + '\n' + f'''[Unit]
Description=KNABA customer web tunnel
Wants=network-online.target
After=network-online.target

[Service]
Type=simple
User=root
ExecStart={executable} tunnel --config {config_path} --no-autoupdate run --token-file {TOKEN_PATH}
Restart=on-failure
RestartSec=5
TimeoutStopSec=30
UMask=0077
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
'''
    require(not UNIT_PATH.is_symlink(), 'Systemd unit є символічним посиланням.')
    if UNIT_PATH.exists():
        require(UNIT_PATH.read_text().startswith(MANAGED + '\n'), 'Назва systemd unit вже зайнята іншим сервісом.')
    changed = not UNIT_PATH.exists() or UNIT_PATH.read_text() != unit
    if changed:
        write_private_text(UNIT_PATH, unit, 0o644)
        run(['systemctl', 'daemon-reload'])
    run(['systemctl', 'enable', UNIT])
    run(['systemctl', 'restart' if changed or token_changed else 'start', UNIT])
    for attempt in range(12):
        remote = api.request('GET', endpoint)
        if remote.get('status') == 'healthy' and remote.get('connections'):
            run(['systemctl', 'is-active', '--quiet', UNIT])
            state['phase'] = 'tunnel_healthy'
            atomic_private_json(STATE_PATH, state)
            return tunnel_id
        time.sleep(5)
    raise Failure('Тунель ще не підключився. DNS залишено без змін; перевір вихідний доступ 7844 TCP/UDP.')


def target_records(tunnel_id):
    return [{'type': 'CNAME', 'name': name, 'content': tunnel_id + '.cfargotunnel.com',
             'proxied': True, 'ttl': 1} for name in WEB_NAMES]


def target_matches(records, expected):
    keys = ('type', 'name', 'content', 'proxied', 'ttl')
    actual = [{k: r.get(k) for k in keys} for r in records if web_record(r)]
    return sorted(actual, key=lambda r: r['name']) == sorted(expected, key=lambda r: r['name'])


def public_checks():
    for host in WEB_NAMES:
        if not home_is_official(request_site(host, public=True)):
            return False
        for path in ('/healthz', '/readyz', '/login/'):
            if request_site(host, path, public=True)[0] != 200:
                return False
        if request_site(host, '/api/crm/contacts', public=True)[0] not in (401, 403):
            return False
        status, headers, _ = request_site(host, public=True, secure=False)
        if status not in (301, 302, 307, 308) or not headers.get('location', '').startswith(('https://knaba.de/', 'https://www.knaba.de/')):
            return False
    return True


def rollback_dns(api, zone):
    require(JOURNAL.exists(), 'Немає збереженої DNS-транзакції для відновлення.')
    journal = read_private_json(JOURNAL)
    require(journal.get('zone_id') == zone['id'], 'Checkpoint належить іншій зоні.')
    path = '/zones/' + zone['id'] + '/dns_records'
    current = api.list(path)
    before = journal['before']
    if records_equal([r for r in current if web_record(r)], [r for r in before if web_record(r)], False):
        journal['phase'] = 'rolled_back'
        atomic_private_json(JOURNAL, journal)
        say('Попередні вебзаписи вже відновлені.')
        return
    require(target_matches(current, journal['expected']),
            'Після перемикання вебзаписи змінились. Автовідкат зупинено, щоб зберегти паралельні зміни.')
    payload = {'deletes': [{'id': r['id']} for r in current if web_record(r)],
               'posts': [normalize_record(r, False) for r in before if web_record(r)]}
    api.request('POST', path + '/batch', payload)
    after = api.list(path)
    require(records_equal([r for r in after if web_record(r)], [r for r in before if web_record(r)], False),
            'Відновлення вебзаписів не підтверджене; потрібна перевірка checkpoint.')
    require(records_equal([r for r in after if not web_record(r)], [r for r in current if not web_record(r)]),
            'Паралельно змінилися інші DNS-записи; перевір їх окремо.')
    journal['phase'] = 'rolled_back'
    atomic_private_json(JOURNAL, journal)
    say('Попередні вебзаписи DNS відновлено. Поштові записи збережені.')


def cutover(api, zone, tunnel_id, initial_records, release):
    path = '/zones/' + zone['id'] + '/dns_records'
    records = api.list(path)
    require(records_equal(records, initial_records), 'DNS змінився під час підготовки. Повтори запуск для нового snapshot.')
    expected = target_records(tunnel_id)
    if target_matches(records, expected):
        require(public_checks(), 'DNS вже спрямований на тунель, але публічні перевірки не пройдено.')
        if JOURNAL.exists():
            journal = read_private_json(JOURNAL)
            if journal.get('zone_id') == zone['id'] and journal.get('expected') == expected:
                journal['phase'] = 'verified'
                atomic_private_json(JOURNAL, journal)
        say('ГОТОВО: DNS і HTTPS уже налаштовані; перевірки успішні.')
        return
    if JOURNAL.exists():
        old = read_private_json(JOURNAL)
        require(old.get('phase') in ('rolled_back', 'verified'), 'Є незавершена DNS-транзакція. Спочатку виконай --rollback або перевір її стан.')
        atomic_private_json(WORK / ('dns-history-' + str(time.time_ns()) + '.json'), old)
    journal = {'zone_id': zone['id'], 'before': records, 'expected': expected,
               'release': release, 'phase': 'prepared', 'created_at': dt.datetime.now(dt.timezone.utc).isoformat()}
    atomic_private_json(JOURNAL, journal)
    require(records_equal(api.list(path), records), 'DNS змінився перед перемиканням.')
    payload = {'deletes': [{'id': r['id']} for r in records if web_record(r)], 'posts': expected}
    try:
        api.request('POST', path + '/batch', payload)
    except Failure:
        # Do not blindly repeat a mutation after a network timeout.
        actual = api.list(path)
        if not target_matches(actual, expected):
            if records_equal(actual, records):
                journal['phase'] = 'rolled_back'
                atomic_private_json(JOURNAL, journal)
            raise
    journal['phase'] = 'applied'
    atomic_private_json(JOURNAL, journal)
    try:
        after = api.list(path)
        require(target_matches(after, expected), 'Не підтверджено нові CNAME.')
        require(records_equal([r for r in after if not web_record(r)], [r for r in records if not web_record(r)]),
                'Під час перемикання змінилися інші DNS-записи.')
        for attempt in range(6):
            if public_checks():
                journal['phase'] = 'verified'
                atomic_private_json(JOURNAL, journal)
                say('ГОТОВО: knaba.de та www.knaba.de працюють через клієнтський тунель; HTTPS, login, ready та захист CRM перевірені.')
                return
            time.sleep(5)
        raise Failure('Публічні HTTPS/HTTP/login/ready перевірки не завершились успішно.')
    except (Failure, KeyboardInterrupt):
        say('Публічні перевірки не пройшли. Відновлюю попередні вебзаписи.')
        rollback_dns(api, zone)
        raise


def refuse_managed_bootstrap():
    """Never initialize a second control path over an existing managed install."""
    for marker in CANONICAL_MANAGED_MARKERS:
        try:
            # lstat also detects dangling symlinks without reading credentials.
            marker.lstat()
        except FileNotFoundError:
            continue
        except OSError:
            raise Failure('MANAGED_SETUP_INSPECTION_FAILED: не вдалося перевірити чинну конфігурацію.') from None
        raise Failure(
            'MANAGED_SETUP_EXISTS: виявлено конфігурацію керованої установки KNABA. '
            'Повторна ініціалізація або відкат цим автономним скриптом зупинені до введення ключа і API-запитів. '
            'Перевірка релізу: --check. Статус чинного доступу: sudo /usr/local/sbin/knaba-cloudflare status. '
            'Продовжуйте через чинний керований процес розгортання.'
        )


def main():
    parser = argparse.ArgumentParser(description='KNABA: owner Cloudflare API, dedicated tunnel and guarded web DNS cutover.')
    modes = parser.add_mutually_exclusive_group(required=True)
    modes.add_argument('--check', action='store_true', help='Local read-only release check; no secret or API call.')
    modes.add_argument('--apply', action='store_true', help='Authenticate, prepare customer tunnel and switch DNS when release is ready.')
    modes.add_argument('--rollback', action='store_true', help='Restore web DNS from the saved transaction after concurrency checks.')
    args = parser.parse_args()
    os.umask(0o077)
    check_host()
    if args.check:
        issues, release = local_readiness()
        say(json.dumps({'status': 'BLOCKED' if issues else 'LOCAL_READY', 'reasons': issues, 'release': release}, ensure_ascii=False, indent=2))
        return 2 if issues else 0
    refuse_managed_bootstrap()
    # The API auth initializer creates and verifies its own root-private directory.
    excluded = read_excluded_scope()
    api, zone = initialize_auth(AUTH_PATH, excluded=excluded)
    WORK.mkdir(mode=0o700, exist_ok=True)
    require(not WORK.is_symlink() and WORK.stat().st_uid == 0 and not WORK.stat().st_mode & 0o077,
            'Каталог checkpoint має бути root-owned 0700.')
    fd = os.open(WORK / 'setup.lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'w') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise Failure('Інше налаштування KNABA вже працює.') from None
        if args.rollback:
            rollback_dns(api, zone)
            return 0
        say('API власника перевірений і збережений на сервері; клієнтську зону knaba.de підтверджено.')
        dns = api.list('/zones/' + zone['id'] + '/dns_records')
        check_mail_and_dependencies(dns)
        atomic_private_json(WORK / ('dns-snapshot-' + str(time.time_ns()) + '.json'), dns)
        issues, release = local_readiness()
        tunnel_id = prepare_tunnel(api, zone, dns, excluded["tunnel_id"])
        say('Клієнтський Cloudflare Tunnel підключений; служба додана до автозапуску.')
        if issues:
            say('ПІДГОТОВЛЕНО; DNS ЩЕ НЕ ПЕРЕМИКНУТО. Потрібно завершити офіційний реліз сайту:')
            for issue in issues:
                say('  - ' + issue)
            say('Після завершення релізу повтори ту саму команду --apply; ключ повторно вводити не потрібно.')
            return 2
        operation_fd = os.open(ROOT / 'operation.lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
        with os.fdopen(operation_fd, 'w') as operation_lock:
            try:
                fcntl.flock(operation_lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                raise Failure('Операція релізу KNABA вже працює; DNS не змінено.') from None
            latest_issues, latest_release = local_readiness()
            require(not latest_issues and latest_release == release, 'Реліз змінився під час підготовки; DNS не змінено.')
            cutover(api, zone, tunnel_id, dns, release)
        return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except Failure as error:
        print('ЗУПИНЕНО: ' + str(error), file=sys.stderr)
        sys.exit(2)
    except KeyboardInterrupt:
        print('Зупинено користувачем. Повтори запуск для перевірки стану; доступний --rollback.', file=sys.stderr)
        sys.exit(130)
    except Exception as error:
        # Never print arbitrary provider responses, raw Docker env or secret-bearing exceptions.
        print('ЗУПИНЕНО: ' + type(error).__name__ + '. Секретні дані не виведені.', file=sys.stderr)
        sys.exit(2)

KNABA_SETUP_PYTHON
