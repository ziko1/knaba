#!/usr/bin/python3
"""Account-scoped Cockpit site operations; Linux peer credentials are authoritative."""
from __future__ import annotations

import argparse
import concurrent.futures
import datetime as dt
import hashlib
import http.client
import json
import os
from pathlib import Path
import pwd
import re
import shutil
import signal
import socket
import socketserver
import sqlite3
import stat
import struct
import subprocess
import sys
import threading
import time
import uuid

SOCKET = "/run/sitepanel/control.sock"
CONFIG = "/etc/sitepanel/sites.json"
STATE = "/var/lib/sitepanel/requests.sqlite"
MAX_REQUEST = 4096
MAX_RESPONSE = 512 * 1024
IDENT = re.compile(r"^[a-z][a-z0-9_-]{0,63}$")
TARGET = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_.@-]{0,127}$")
# Only the ordinary boot/mount edges used by these independent services are
# accepted. Unknown targets may lead transitively to another tenant's service;
# do not infer safety merely from a .target/.mount suffix or from file ownership.
SERVICE_EDGES = {
    "Requires": {"sysinit.target", "system.slice", "-.mount", "tmp.mount"},
    "Wants": {"network-online.target", "-.mount", "tmp.mount"},
    "Conflicts": {"shutdown.target"},
    "WantedBy": {"multi-user.target"},
    **{key: set() for key in (
        "Requisite", "BindsTo", "PartOf", "ConflictedBy", "RequiredBy",
        "RequisiteOf", "BoundBy", "ConsistsOf", "Upholds", "UpheldBy",
        "PropagatesStopTo", "StopPropagatedFrom", "PropagatesReloadTo",
        "ReloadPropagatedFrom", "OnFailure", "OnSuccess", "Triggers",
        "TriggeredBy", "JoinsNamespaceOf",
    )},
}
SERVICE_ACTIONS = ("FailureAction", "SuccessAction", "StartLimitAction", "JobTimeoutAction")


class Refused(Exception):
    def __init__(self, code: str, message: str):
        self.code, self.message = code, message
        super().__init__(code)


def stamp():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def trusted_file(filename: str):
    """No symlink, tenant-writable ancestor or tenant-owned root execution input."""
    path = Path(filename)
    if not path.is_absolute():
        raise Refused("unsafe_configuration", "The operation configuration is unavailable.")
    for item in [path, *path.parents]:
        info = item.lstat()
        if stat.S_ISLNK(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022:
            raise Refused("unsafe_configuration", "The operation configuration is unavailable.")
    if not path.is_file():
        raise Refused("unsafe_configuration", "The operation configuration is unavailable.")


def validate_config(config: dict):
    if config.get("version") != 1 or not isinstance(config.get("accounts"), dict):
        raise ValueError("Invalid registry version/accounts")
    if not isinstance(config.get("resources"), dict):
        raise ValueError("Invalid resources")
    site_ids = set()
    for uid, account in config["accounts"].items():
        if not uid.isdecimal() or int(uid) < 1000 or not IDENT.fullmatch(account["name"]):
            raise ValueError("Invalid account identity")
        if len(account.get("sites", [])) > 40:
            raise ValueError("Too many sites")
        for site in account["sites"]:
            if not IDENT.fullmatch(site["id"]) or site["id"] in site_ids:
                raise ValueError("Invalid or duplicate site ID")
            site_ids.add(site["id"])
            resource = config["resources"].get(site.get("resource"))
            if site.get("resource") and (not resource or resource["owner_uid"] != int(uid)):
                raise ValueError("Cross-account resource")
            if not set(site.get("actions", [])) <= {"start", "stop", "restart", "backup"}:
                raise ValueError("Unsupported action")
            if site.get("actions") and not resource:
                raise ValueError("Action without local resource")
            probe = site.get("probe")
            if probe and (not 1024 <= probe["port"] <= 65535 or not probe["path"].startswith("/")):
                raise ValueError("Invalid fixed probe")
    targets = set()
    for name, resource in config["resources"].items():
        if not IDENT.fullmatch(name) or not TARGET.fullmatch(resource["target"]):
            raise ValueError("Invalid resource target")
        if str(resource["owner_uid"]) not in config["accounts"]:
            raise ValueError("Unknown resource owner")
        if resource["kind"] not in {"docker", "systemd"}:
            raise ValueError("Unsupported resource kind")
        identity = (resource["kind"], resource["target"])
        if identity in targets:
            # Duplicates within one owner also break resource locks/receipts.
            raise ValueError("Duplicate resource target")
        targets.add(identity)
        if resource["kind"] == "systemd":
            if not resource["target"].endswith(".service"):
                raise ValueError("Only fixed services are supported")
            owner = config["accounts"][str(resource["owner_uid"])]["name"]
            if resource.get("user") != owner or resource.get("user") in {"root", "0", ""}:
                raise ValueError("Services must run as their owning non-root account")
    return config


class Runtime:
    def __init__(self, resources=()):
        self.resources = tuple(resources)

    def unique_identity(self, resource, aliases, container_id=None):
        for other in self.resources:
            if other["kind"] != resource["kind"] or other["target"] == resource["target"]:
                continue
            target = other["target"]
            if target in aliases or (container_id and container_id.startswith(target)):
                raise Refused("unsafe_resource", "The resource needs administrator review.")

    def command(self, argv, timeout=8):
        env = {"PATH": "/usr/sbin:/usr/bin:/sbin:/bin", "LC_ALL": "C", "HOME": "/root"}
        proc = subprocess.Popen(argv, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                text=True, env=env, start_new_session=True)
        try:
            output, _errors = proc.communicate(timeout=timeout)
        except subprocess.TimeoutExpired:
            # A backup controller can spawn children. Terminate its complete group;
            # the durable pending receipt still forbids automatic operation replay.
            try:
                os.killpg(proc.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            proc.communicate(timeout=3)
            raise subprocess.TimeoutExpired(argv[0], timeout) from None
        if proc.returncode:
            raise Refused("operation_failed", "The operation did not complete. Refresh the site status.")
        if len(output) > MAX_RESPONSE:
            raise Refused("invalid_result", "The service returned an unexpected response.")
        return output

    def docker_info(self, resource):
        raw = self.command(["/usr/bin/docker", "--host", "unix:///run/docker.sock", "inspect", "--type", "container", resource["target"]], 4)
        info = json.loads(raw)[0]
        host = info["HostConfig"]
        network = host.get("NetworkMode", "")
        namespace_modes = {"PidMode": {"", "private"}, "IpcMode": {"", "private", "none"},
                           "UTSMode": {"", "private"}, "UsernsMode": {""},
                           "CgroupnsMode": {"", "private"}}
        if (host.get("Privileged") or network == "host" or network.startswith("container:") or
                any(host.get(key, "") not in allowed for key, allowed in namespace_modes.items()) or
                host.get("Devices") or host.get("CapAdd")):
            raise Refused("unsafe_resource", "The resource needs administrator review.")
        if not re.fullmatch(r"[0-9a-f]{64}", info["Id"]) or not info["Name"].startswith("/"):
            raise Refused("unsafe_resource", "The resource needs administrator review.")
        self.unique_identity(resource, {info["Name"][1:], info["Id"]}, info["Id"])
        roots = [Path(x).resolve(strict=True) for x in resource.get("mount_roots", [])]
        for mount in info.get("Mounts", []):
            if mount["Type"] != "bind":
                raise Refused("unsafe_resource", "The resource needs administrator review.")
            source = Path(mount["Source"]).resolve(strict=True)
            if not any(source == root or root in source.parents for root in roots):
                raise Refused("unsafe_resource", "The resource needs administrator review.")
        labels = info["Config"].get("Labels") or {}
        for key, value in resource.get("required_labels", {}).items():
            if labels.get(key) != value:
                raise Refused("unsafe_resource", "The resource needs administrator review.")
        return info

    def service_info(self, resource):
        properties = ["Id", "Names", "ActiveState", "User", "FragmentPath", "DropInPaths",
                      *SERVICE_EDGES, *SERVICE_ACTIONS]
        raw = self.command(["/usr/bin/systemctl", "show", "--all", resource["target"],
                            *[item for key in properties for item in ("-p", key)]], 4)
        info = dict(line.split("=", 1) for line in raw.splitlines() if "=" in line)
        if (set(properties) - info.keys() or info.get("User") != resource["user"] or
                not TARGET.fullmatch(info.get("Id", "")) or not info["Id"].endswith(".service")):
            raise Refused("unsafe_resource", "The resource needs administrator review.")
        aliases = set(info["Names"].split())
        if info["Id"] not in aliases or resource["target"] not in aliases:
            raise Refused("unsafe_resource", "The resource needs administrator review.")
        self.unique_identity(resource, aliases)
        for key, allowed in SERVICE_EDGES.items():
            if not set(info[key].split()) <= allowed:
                raise Refused("unsafe_resource", "The resource needs administrator review.")
        # These manager actions execute with host authority even when User= is
        # unprivileged. A tenant must not reboot the host by stopping a service.
        if any(info[key] != "none" for key in SERVICE_ACTIONS):
            raise Refused("unsafe_resource", "The resource needs administrator review.")
        trusted_file(info["FragmentPath"])
        paths = [info["FragmentPath"], *info.get("DropInPaths", "").split()]
        for path in paths:
            trusted_file(path)
            unit = Path(path).read_text().replace("\\\n", "")
            for line in unit.splitlines():
                key, separator, value = line.strip().partition("=")
                key = key.strip()
                if not separator:
                    continue
                if key == "PermissionsStartOnly" and value.strip().lower() in {"yes", "true", "1"}:
                    raise Refused("unsafe_resource", "The resource needs administrator review.")
                if key.startswith("Exec") and re.match(r"^[-@:+!]*[+!]", value.lstrip()):
                    raise Refused("unsafe_resource", "The resource needs administrator review.")
        return info

    def status(self, resource):
        if resource["kind"] == "docker":
            info = self.docker_info(resource)
            return "running" if info["State"]["Running"] else "stopped"
        return "running" if self.service_info(resource)["ActiveState"] == "active" else "stopped"

    def probe(self, spec):
        connection = http.client.HTTPConnection("127.0.0.1", spec["port"], timeout=2)
        try:
            connection.request("GET", spec["path"], headers={"Host": spec["host"], "X-Forwarded-Proto": "https"})
            response = connection.getresponse()
            # Do not expose bodies, cookies, headers or secrets from applications.
            return {"status": response.status}
        except (OSError, http.client.HTTPException):
            return {"status": None}
        finally:
            connection.close()

    def perform(self, resource, action):
        if action == "backup":
            backup = resource.get("backup")
            if not backup or backup.get("environment") not in {"production", "testing"}:
                raise Refused("action_not_allowed", "This operation is unavailable for this site.")
            trusted_file(backup["controller"])
            if shutil.disk_usage(backup["storage"]).free < 10 * 1024 ** 3:
                raise Refused("storage_low", "There is not enough free space for a backup.")
            self.command(["/usr/bin/python3", "-I", backup["controller"], "backup", backup["environment"]], 60)
            return {"state": "completed", "message": "Backup created."}
        if resource["kind"] == "docker":
            info = self.docker_info(resource)
            command = ["/usr/bin/docker", "--host", "unix:///run/docker.sock", action]
            if action in {"stop", "restart"}:
                command += ["--time", "10"]
            # Act on the inspected immutable ID, never a client supplied target.
            self.command(command + [info["Id"]], 30)
        else:
            info = self.service_info(resource)
            self.command(["/usr/bin/systemctl", action, info["Id"]], 30)
        return {"state": "completed", "message": "Operation completed. Refresh the site status."}


class API:
    def __init__(self, config, ledger, runtime=None, clock=time.time):
        self.config = validate_config(config)
        self.ledger = str(ledger)
        self.runtime = runtime or Runtime(config["resources"].values())
        if isinstance(self.runtime, Runtime):
            self.runtime.resources = tuple(config["resources"].values())
        self.clock = clock
        self.resource_locks = {name: threading.Lock() for name in config["resources"]}
        with self.db() as db:
            db.execute("CREATE TABLE IF NOT EXISTS requests(uid INTEGER, request_id TEXT, digest TEXT, resource TEXT, action TEXT, created REAL, response TEXT, PRIMARY KEY(uid,request_id))")

    def db(self):
        return sqlite3.connect(self.ledger, timeout=2)

    def account(self, uid):
        account = self.config["accounts"].get(str(uid))
        if account is None:
            raise Refused("access_denied", "This account does not have a site workspace.")
        return account

    def site(self, account, site_id):
        if not isinstance(site_id, str):
            raise Refused("invalid_request", "Invalid request.")
        for site in account["sites"]:
            if site["id"] == site_id:
                return site
        raise Refused("not_found", "Site not found.")

    def public_site(self, site):
        result = {key: site.get(key) for key in ("id", "label", "domains", "url", "admin_url", "location", "note")}
        result.update(actions=site.get("actions", []), state="unknown", health={"status": None})
        resource = self.config["resources"].get(site.get("resource"))
        if resource:
            try:
                result["state"] = self.runtime.status(resource)
            except (Refused, OSError, ValueError, subprocess.TimeoutExpired, KeyError):
                result["state"] = "unknown"
        if site.get("probe"):
            result["health"] = self.runtime.probe(site["probe"])
        return result

    def dispatch(self, uid, request):
        # Resolve trusted identity and scope before any cache/ledger lookup.
        account = self.account(uid)
        if not isinstance(request, dict):
            raise Refused("invalid_request", "Invalid request.")
        if request.get("op") == "catalog" and set(request) == {"op"}:
            with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
                sites = list(pool.map(self.public_site, account["sites"]))
            return {"ok": True, "scope": "own-sites", "checked_at": stamp(),
                    "account": {key: account[key] for key in ("name", "display_name", "home")}, "sites": sites}
        if request.get("op") != "action" or set(request) != {"op", "site_id", "action", "request_id"}:
            raise Refused("invalid_request", "Invalid request.")
        site = self.site(account, request["site_id"])
        action = request["action"]
        if not isinstance(action, str) or action not in site.get("actions", []):
            raise Refused("action_not_allowed", "This operation is unavailable for this site.")
        try:
            identifier = str(uuid.UUID(request["request_id"]))
            if identifier != request["request_id"]:
                raise ValueError()
        except (ValueError, TypeError, AttributeError):
            raise Refused("invalid_request", "Invalid request identifier.")
        resource_id = site["resource"]
        resource = self.config["resources"][resource_id]
        digest = hashlib.sha256(json.dumps(request, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
        lock = self.resource_locks[resource_id]
        if not lock.acquire(blocking=False):
            raise Refused("busy", "An operation is already running for this site.")
        try:
            with self.db() as db:
                db.execute("BEGIN IMMEDIATE")
                row = db.execute("SELECT digest,response FROM requests WHERE uid=? AND request_id=?", (uid, identifier)).fetchone()
                if row:
                    if row[0] != digest:
                        raise Refused("request_conflict", "This request identifier was already used.")
                    if row[1] is None:
                        raise Refused("result_unknown", "The previous result is unknown. Refresh status before another operation.")
                    return json.loads(row[1])
                pending = db.execute("SELECT 1 FROM requests WHERE resource=? AND response IS NULL LIMIT 1", (resource_id,)).fetchone()
                if pending:
                    raise Refused("result_unknown", "An earlier operation needs administrator review before another operation can start.")
                cooldown = 600 if action == "backup" else 5
                latest = db.execute("SELECT MAX(created) FROM requests WHERE uid=? AND action=?", (uid, action)).fetchone()[0]
                if latest is not None and self.clock() - latest < cooldown:
                    raise Refused("rate_limited", "Please wait before repeating this operation.")
                db.execute("INSERT INTO requests VALUES(?,?,?,?,?,?,NULL)", (uid, identifier, digest, resource_id, action, self.clock()))
            # Pending is durable before the only side effect. Never automatically retry it.
            try:
                response = {"ok": True, "result": self.runtime.perform(resource, action)}
            except subprocess.TimeoutExpired:
                raise Refused("result_unknown", "The operation timed out. Refresh status; it will not be retried automatically.")
            except Refused as exc:
                response = {"ok": False, "error": {"code": exc.code, "message": exc.message}}
            with self.db() as db:
                db.execute("UPDATE requests SET response=? WHERE uid=? AND request_id=?", (json.dumps(response), uid, identifier))
            return response
        finally:
            lock.release()


def handle(api, uid, request):
    try:
        return api.dispatch(uid, request)
    except Refused as exc:
        return {"ok": False, "error": {"code": exc.code, "message": exc.message}}
    except Exception:
        # Root-side exception text may contain paths or application output.
        return {"ok": False, "error": {"code": "unavailable", "message": "The service is temporarily unavailable. Refresh its status."}}


class Handler(socketserver.StreamRequestHandler):
    def handle(self):
        self.connection.settimeout(8)
        _pid, uid, _gid = struct.unpack("3i", self.connection.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, struct.calcsize("3i")))
        try:
            line = self.rfile.readline(MAX_REQUEST + 1)
            if len(line) > MAX_REQUEST or not line.endswith(b"\n"):
                response = {"ok": False, "error": {"code": "invalid_request", "message": "Invalid request."}}
            else:
                request = json.loads(line)
                if request == {"op": "catalog"} and not self.server.catalog_allowed(uid):
                    response = {"ok": False, "error": {"code": "rate_limited", "message": "Please wait before refreshing again."}}
                else:
                    response = handle(self.server.api, uid, request)
        except (ValueError, OSError):
            response = {"ok": False, "error": {"code": "invalid_request", "message": "Invalid request."}}
        try:
            self.wfile.write(json.dumps(response, ensure_ascii=False).encode() + b"\n")
        except (BrokenPipeError, ConnectionResetError):
            pass


class Server(socketserver.ThreadingMixIn, socketserver.UnixStreamServer):
    daemon_threads = True
    request_queue_size = 16

    def __init__(self, address, api):
        self.api = api
        self.slots = threading.BoundedSemaphore(8)
        self.user_slots = {int(uid): threading.BoundedSemaphore(3) for uid in api.config["accounts"]}
        self.unknown_slots = threading.BoundedSemaphore(1)
        self.refresh_lock = threading.Lock()
        self.last_refresh = {}
        super().__init__(address, Handler)

    def peer_slot(self, request):
        _pid, uid, _gid = struct.unpack("3i", request.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, struct.calcsize("3i")))
        return self.user_slots.get(uid, self.unknown_slots)

    def catalog_allowed(self, uid):
        with self.refresh_lock:
            now = time.monotonic()
            if now - self.last_refresh.get(uid, -10) < 1:
                return False
            self.last_refresh[uid] = now
            return True

    def process_request(self, request, client_address):
        if not self.slots.acquire(blocking=False):
            request.close()
            return
        slot = self.peer_slot(request)
        if not slot.acquire(blocking=False):
            self.slots.release()
            request.close()
            return
        try:
            super().process_request(request, client_address)
        except Exception:
            slot.release()
            self.slots.release()
            raise

    def process_request_thread(self, request, client_address):
        slot = self.peer_slot(request)
        try:
            super().process_request_thread(request, client_address)
        finally:
            slot.release()
            self.slots.release()


def serve(config_path=CONFIG, socket_path=SOCKET, ledger=STATE):
    if os.getuid() != 0:
        raise Refused("access_denied", "Only the system service can start the broker.")
    os.umask(0o077)
    trusted_file(config_path)
    config = validate_config(json.loads(Path(config_path).read_text()))
    for uid, account in config["accounts"].items():
        if pwd.getpwnam(account["name"]).pw_uid != int(uid):
            raise ValueError("Registry account identity changed")
    target = Path(socket_path)
    if target.exists():
        if not stat.S_ISSOCK(target.lstat().st_mode):
            raise ValueError("Socket path is occupied")
        target.unlink()
    api = API(config, ledger)
    with Server(socket_path, api) as server:
        target.chmod(0o660)
        server.serve_forever(poll_interval=0.5)


def client(request, socket_path=SOCKET):
    with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as sock:
        sock.settimeout(75)
        sock.connect(socket_path)
        sock.sendall(json.dumps(request).encode() + b"\n")
        with sock.makefile("rb") as stream:
            line = stream.readline(MAX_RESPONSE + 1)
            if len(line) > MAX_RESPONSE:
                raise ValueError("Oversized response")
            return json.loads(line)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("catalog")
    action = commands.add_parser("action")
    action.add_argument("site_id")
    action.add_argument("action")
    action.add_argument("request_id")
    commands.add_parser("serve")
    args = parser.parse_args()
    if args.command == "serve":
        serve()
        return
    request = {"op": "catalog"} if args.command == "catalog" else {
        "op": "action", "site_id": args.site_id, "action": args.action, "request_id": args.request_id}
    try:
        response = client(request)
    except (OSError, ValueError):
        response = {"ok": False, "error": {"code": "unavailable", "message": "The site service is unavailable. Try again later."}}
    print(json.dumps(response, ensure_ascii=False))


if __name__ == "__main__":
    main()
