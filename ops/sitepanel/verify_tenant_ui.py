#!/usr/bin/python3
"""Read-only package acceptance for a Cockpit 360 tenant session.

Run as the intended normal user. With --candidate DIR the JSON overrides are
merged in memory; this is preflight evidence, not installed/browser acceptance.
Without --candidate, verify the real installed package selection. No files,
credentials, services, account memberships or Cockpit configuration are changed.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import pwd


def verify(candidate=None):
    # Use the installed Cockpit implementation, not a second parser/model.
    from cockpit.jsonutil import json_merge_patch
    from cockpit.packages import Packages, PackagesLoader

    user = pwd.getpwuid(os.getuid()).pw_name
    if user not in {"knaba", "vsp"}:
        raise RuntimeError("Run this check as knaba or vsp, not as root")
    overrides = {}
    hashes = {}
    if candidate is not None:
        for name in ("users", "systemd", "metrics", "shell"):
            path = Path(candidate) / (name + ".override.json")
            data = path.read_bytes()
            overrides[name] = json.loads(data)
            hashes[path.name] = hashlib.sha256(data).hexdigest()

    class CandidateLoader(PackagesLoader):
        @classmethod
        def patch_manifest(cls, manifest, parent):
            installed = super().patch_manifest(manifest, parent)
            return json_merge_patch(installed, overrides.get(parent.name, {}))

    packages = Packages(loader=CandidateLoader() if candidate is not None else None)
    selected = set(packages.packages)
    expected = {"base1", "shell", "sitepanel", "static"}
    if selected != expected:
        raise RuntimeError("Unexpected packages: " + repr(sorted(selected)))

    # Native pages must not be served at direct URLs, even when absent in menus.
    blocked_paths = [
        "/users/index.html", "/system/index.html", "/system/services.html",
        "/system/logs.html", "/system/terminal.html", "/metrics/index.html",
    ]
    for path in blocked_paths:
        try:
            packages.load_path(path, {})
        except KeyError:
            continue
        raise RuntimeError("Native host page remains available: " + path)
    for path in ("/sitepanel/index.html", "/sitepanel/app.js",
                 "/shell/index.html", "/base1/cockpit.js"):
        document = packages.load_path(path, {})
        document.data.close()

    navigation = []
    for name, package in packages.packages.items():
        for section in ("dashboard", "menu", "tools"):
            for item in package.manifest.get(section, {}):
                navigation.append([name, section, item])
    if navigation != [["sitepanel", "menu", "index"]]:
        raise RuntimeError("Unexpected navigation: " + repr(navigation))
    if packages.get_bridge_configs():
        raise RuntimeError("Additional/elevation bridges remain registered")

    result = {
        "status": "PASS",
        "scope": "candidate-in-memory" if candidate is not None else "installed-packages",
        "user": user,
        "uid": os.getuid(),
        "packages": sorted(selected),
        "navigation": navigation,
        "unavailable_native_paths": blocked_paths,
        "registered_bridges": 0,
        "candidate_sha256": hashes,
        "browser_login": "NOT_RUN",
        "os_metadata_isolation": "NOT_CLAIMED",
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--candidate", type=Path,
                        help="Merge these overrides in memory; do not install them")
    args = parser.parse_args()
    verify(args.candidate)
