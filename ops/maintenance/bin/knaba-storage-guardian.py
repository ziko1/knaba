#!/usr/bin/env python3
"""KNABA host storage guardian.

Automatic mode is deliberately narrow:
- never deletes project/application/NAS/Docker data;
- below storage pressure it is audit-only;
- at >=80% root usage/inodes it may clean only the APT download cache;
- at >=85% it may also vacuum archived systemd journals older than 30 days;
- if maintenance state is uncertain or protected paths are unsafe, it fails closed.
"""
from __future__ import annotations

import argparse
import datetime as dt
import fcntl
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
import tempfile
import time
from typing import Any

BASE = Path("/srv/knaba/maintenance")
REPORTS = BASE / "reports"
LOCK = Path("/run/lock/knaba-storage-guardian.lock")

PROTECTED_PATHS = (
    "/srv/knaba-nas",
    "/srv/knaba/customer",
    "/srv/knaba/lead-agent",
    "/srv/vsp",
    "/srv/avenqo",
    "/srv/vsp-studio",
    "/srv/vsp-domainfree",
    "/opt/knaba",
    "/var/lib/docker",
    "/var/lib/containerd",
)

PROTECTED = (
    "KNABA NAS data/config/database and all files below /srv/knaba-nas",
    "all KNABA customer/lead-agent application code, state, backups and secrets",
    "all VSP and AVENQO code, releases, workspaces, build evidence and artifacts",
    "all Docker/containerd images, containers, writable layers, networks and volumes",
    "signing keys, certificates, .env files, databases and audit evidence",
    "all paths not explicitly allowlisted for system-cache maintenance",
)

BUSY_UNITS = (
    "apt-daily.service",
    "apt-daily-upgrade.service",
    "knaba-customer-backup.service",
    "knaba-lead-agent-backup.service",
)

INVENTORY_PATHS = (
    "/srv/knaba-nas",
    "/srv/knaba",
    "/srv/vsp",
    "/srv/avenqo",
    "/opt/knaba",
    "/var/lib/docker",
    "/var/lib/containerd",
    "/var/log",
    "/var/cache/apt",
)

def command(argv: list[str], timeout: int = 30) -> dict[str, Any]:
    try:
        proc = subprocess.run(
            argv,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=timeout,
            check=False,
            env={**os.environ, "LC_ALL": "C"},
        )
        return {
            "returncode": proc.returncode,
            "stdout": proc.stdout[:20000],
            "stderr": proc.stderr[:2000],
        }
    except (OSError, subprocess.TimeoutExpired) as exc:
        return {"returncode": None, "stdout": "", "stderr": f"{type(exc).__name__}: {exc}"}

def disk() -> dict[str, int]:
    st = os.statvfs("/")
    total = st.f_blocks * st.f_frsize
    used = (st.f_blocks - st.f_bfree) * st.f_frsize
    available = st.f_bavail * st.f_frsize
    pct = ((100 * used + used + available - 1) // (used + available)) if used + available else 100
    inode_pct = ((100 * (st.f_files - st.f_ffree) + st.f_files - 1) // st.f_files) if st.f_files else 100
    return {
        "size_bytes": total,
        "used_bytes": used,
        "available_bytes": available,
        "used_percent": pct,
        "inode_percent": inode_pct,
    }

def validate_protected_paths() -> list[str]:
    problems: list[str] = []
    for raw in PROTECTED_PATHS:
        p = Path(raw)
        if not p.exists():
            problems.append(f"missing:{raw}")
            continue
        try:
            if p.is_symlink():
                problems.append(f"symlink:{raw}")
            if p.resolve() != p:
                problems.append(f"noncanonical:{raw}->{p.resolve()}")
        except OSError as exc:
            problems.append(f"unreadable:{raw}:{exc.errno}")
    return problems

def workload_state() -> dict[str, Any]:
    safe = True
    units: dict[str, str] = {}
    for name in BUSY_UNITS:
        r = command(["systemctl", "is-active", name], timeout=4)
        state = r["stdout"].strip() or "unknown"
        units[name] = state
        if state not in ("inactive", "failed"):
            safe = False

    locks: dict[str, str] = {}
    apt_locks = command(
        ["lsof", "-t", "/var/cache/apt/archives/lock", "/var/lib/dpkg/lock", "/var/lib/dpkg/lock-frontend"],
        timeout=5,
    )
    if apt_locks["returncode"] == 0 and apt_locks["stdout"].strip():
        safe = False
        locks["apt"] = "busy"
    elif apt_locks["returncode"] == 1:
        locks["apt"] = "free"
    else:
        safe = False
        locks["apt"] = "unknown-fail-closed"
    return {"idle": safe, "services": units, "locks": locks}

def allow_actions(mode: str, used_percent: int, inode_percent: int, idle: bool) -> list[tuple[str, list[str], int]]:
    if mode == "audit" or not idle:
        return []
    pressure = max(used_percent, inode_percent)
    if mode == "auto" and pressure < 80:
        return []
    actions: list[tuple[str, list[str], int]] = [
        ("apt_cache", ["/usr/bin/apt-get", "clean"], 120)
    ]
    if mode == "clean-safe" or pressure >= 85:
        actions.append(
            ("archived_journal_30d", ["/usr/bin/journalctl", "--vacuum-time=30d"], 120)
        )
    return actions

def allowed_actions_for_state(mode: str, used_percent: int, inode_percent: int, idle: bool):
    return allow_actions(mode, used_percent, inode_percent, idle)

def protected_action_check(actions: list[tuple[str, list[str], int]]) -> list[str]:
    violations: list[str] = []
    for name, argv, _ in actions:
        joined = " ".join(argv)
        lower = joined.lower()
        if "docker" in lower or "containerd" in lower or "rm " in lower or "find " in lower:
            violations.append(f"unsafe-command:{name}:{joined}")
        for root in PROTECTED_PATHS:
            if root in joined:
                violations.append(f"protected-path:{name}:{root}")
    return violations

def safe_du(path: str) -> dict[str, Any]:
    if not os.path.exists(path):
        return {"path": path, "status": "missing"}
    r = command(["/usr/bin/du", "-sxk", "--", path], timeout=20)
    if r["returncode"] != 0:
        return {"path": path, "status": "error", "error": r["stderr"][:200]}
    try:
        kib = int(r["stdout"].split()[0])
    except (IndexError, ValueError):
        return {"path": path, "status": "parse-error"}
    return {"path": path, "bytes_approx": kib * 1024}

def nas_health() -> dict[str, Any]:
    items = {}
    for name in ("knaba-nas-app", "knaba-nas-db", "knaba-nas-redis"):
        r = command(
            ["/usr/bin/docker", "inspect", "--format",
             "{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}|{{.RestartCount}}",
             name],
            timeout=8,
        )
        if r["returncode"] == 0:
            parts = r["stdout"].strip().split("|")
            items[name] = {
                "status": parts[0] if len(parts) > 0 else "unknown",
                "health": parts[1] if len(parts) > 1 else "unknown",
                "restarts": int(parts[2]) if len(parts) > 2 and parts[2].isdigit() else None,
            }
        else:
            items[name] = {"status": "inspect-failed"}
    ok = all(v.get("status") == "running" and v.get("health") in ("healthy", "none") for v in items.values())
    return {"ok": ok, "containers": items}

def inventory() -> dict[str, Any]:
    sizes = [safe_du(path) for path in INVENTORY_PATHS]
    docker_df = command(["/usr/bin/docker", "system", "df"], timeout=25)
    exited = command(
        ["/usr/bin/docker", "ps", "-a", "--filter", "status=exited", "--format", "{{.Names}}\t{{.Image}}\t{{.Status}}"],
        timeout=20,
    )
    return {
        "disk_breakdown": sorted(sizes, key=lambda x: x.get("bytes_approx") or 0, reverse=True),
        "docker_space_readonly": docker_df["stdout"][:5000] if docker_df["returncode"] == 0 else docker_df["stderr"][:500],
        "stopped_containers_manual_review_only": exited["stdout"].splitlines()[:80] if exited["returncode"] == 0 else [],
        "docker_auto_prune": False,
    }

def atomic_json(path: Path, payload: dict[str, Any]) -> None:
    fd, tmp = tempfile.mkstemp(prefix=".knaba-storage-", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            os.fchmod(f.fileno(), 0o640)
            json.dump(payload, f, ensure_ascii=False, indent=2)
            f.write("\n")
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)
    finally:
        if os.path.lexists(tmp):
            os.unlink(tmp)

def trim_own_reports(keep: int = 90) -> int:
    reports = sorted(
        [p for p in REPORTS.glob("storage-*.json") if p.is_file() and not p.is_symlink()],
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    removed = 0
    for p in reports[keep:]:
        try:
            if p.parent == REPORTS and p.name.startswith("storage-") and p.suffix == ".json":
                p.unlink()
                removed += 1
        except OSError:
            pass
    return removed

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", nargs="?", default="audit", choices=("audit", "auto", "clean-safe"))
    args = parser.parse_args()

    if os.geteuid() != 0:
        print("ERROR: root required through systemd maintenance unit", file=sys.stderr)
        return 77

    os.umask(0o027)
    BASE.mkdir(mode=0o750, parents=True, exist_ok=True)
    REPORTS.mkdir(mode=0o750, exist_ok=True)
    if BASE.is_symlink() or REPORTS.is_symlink():
        print("ERROR: unsafe maintenance/report path", file=sys.stderr)
        return 78
    if REPORTS.stat().st_uid != 0 or (REPORTS.stat().st_mode & 0o022):
        print("ERROR: reports must be root-owned and not group/world writable", file=sys.stderr)
        return 78

    fd = os.open(LOCK, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW | os.O_CLOEXEC, 0o640)
    st = os.fstat(fd)
    if not stat.S_ISREG(st.st_mode) or st.st_uid != 0 or (st.st_mode & 0o022):
        os.close(fd)
        print("ERROR: unsafe lock file", file=sys.stderr)
        return 78

    with os.fdopen(fd, "a+", encoding="utf-8") as lock:
        try:
            fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print("SKIP: guardian already running")
            return 0

        before = disk()
        protected_problems = validate_protected_paths()
        busy = workload_state()
        nh = nas_health()

        idle = busy["idle"] and not protected_problems and nh["ok"]
        actions = allow_actions(args.mode, before["used_percent"], before["inode_percent"], idle)
        violations = protected_action_check(actions)
        if violations:
            actions = []

        skip_reason = None
        if protected_problems:
            skip_reason = "protected-path-validation-failed"
        elif not nh["ok"]:
            skip_reason = "nas-health-not-green"
        elif not busy["idle"]:
            skip_reason = "active-or-unverifiable-workload"
        elif violations:
            skip_reason = "action-policy-violation"
        elif args.mode == "auto" and max(before["used_percent"], before["inode_percent"]) < 80:
            skip_reason = "below-auto-clean-threshold"

        events: list[dict[str, Any]] = []
        for key, argv, timeout in actions:
            started = time.monotonic()
            r = command(argv, timeout=timeout)
            events.append({
                "action": key,
                "argv": argv,
                "returncode": r["returncode"],
                "duration_s": round(time.monotonic() - started, 2),
                "stderr_tail": r["stderr"][-500:],
            })
            if r["returncode"] != 0:
                skip_reason = f"cleanup-failed:{key}"
                break

        after = disk()
        nh_after = nas_health()
        now = dt.datetime.now(dt.timezone.utc)
        report = {
            "schema": 1,
            "host": "knaba",
            "created_at": now.isoformat(),
            "mode": args.mode,
            "disk_before": before,
            "disk_after": after,
            "net_bytes_reclaimed_observed": before["used_bytes"] - after["used_bytes"],
            "thresholds": {
                "apt_cache_auto_min_percent": 80,
                "journal_auto_min_percent": 85,
                "journal_retention": "30d under pressure only",
                "docker_auto_prune": False,
                "project_auto_prune": False,
                "nas_auto_prune": False,
            },
            "protected_paths": PROTECTED_PATHS,
            "protected_policy": PROTECTED,
            "protected_validation_problems": protected_problems,
            "workloads": busy,
            "nas_before": nh,
            "nas_after": nh_after,
            "skip_reason": skip_reason,
            "policy_violations": violations,
            "actions": events,
            "inventory": inventory(),
            "note": "Automatic deletion is restricted to APT download cache and old archived journald data under pressure. No NAS, project, Docker image/container/volume, database, backup or release pruning is implemented.",
        }
        filename = REPORTS / f"storage-{now:%Y%m%dT%H%M%SZ}-{os.getpid()}.json"
        atomic_json(filename, report)
        atomic_json(REPORTS / "latest.json", report)
        trimmed = trim_own_reports(90)

        failed = any(e["returncode"] != 0 for e in events)
        print(
            f"knaba_storage_guard mode={args.mode} disk={before['used_percent']}%->{after['used_percent']}% "
            f"inode={after['inode_percent']}% actions={len(events)} failed={int(failed)} "
            f"nas_ok={int(nh_after['ok'])} report={filename} reports_trimmed={trimmed}"
        )
        return 1 if failed or protected_problems or violations or not nh_after["ok"] else 0

if __name__ == "__main__":
    sys.exit(main())
