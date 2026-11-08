#!/usr/bin/env python3
"""Local iOS provenance and export validation; never uploads or provisions accounts."""
from __future__ import annotations

import argparse
import datetime as dt
import fnmatch
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import plistlib
import re
import stat
import subprocess
import tempfile
import zipfile

IOS = Path("erp/apps/mobile-ios")
ROOT = Path(__file__).resolve().parents[4]
MAX_IPA_BYTES = 512 * 1024 * 1024


def require(condition, message):
    if not condition:
        raise ValueError(message)


def command(arguments, **kwargs):
    return subprocess.run(arguments, check=True, capture_output=True, timeout=60, **kwargs)


def metadata(root=ROOT):
    text = (root / IOS / "project.yml").read_text(encoding="utf-8")
    def setting(name):
        values = re.findall(r"^\s*" + re.escape(name) + r":\s*\"?([^\"\n]+)\"?\s*$", text, re.M)
        require(len(values) == 1, "Project setting must be unambiguous: " + name)
        return values[0].strip()
    version, build = setting("MARKETING_VERSION"), setting("CURRENT_PROJECT_VERSION")
    application = re.search(r"^  KNABADE:\n(.*?)(?=^  \S|\Z)", text, re.M | re.S)
    require(application is not None, "KNABADE application target missing")
    bundles = re.findall(r"^\s*PRODUCT_BUNDLE_IDENTIFIER:\s*([^\s]+)\s*$", application.group(1), re.M)
    require(len(bundles) == 1 and re.fullmatch(r"[A-Za-z0-9.-]+", bundles[0]), "Invalid application bundle identifier")
    require(re.fullmatch(r"\d+\.\d+\.\d+", version) and re.fullmatch(r"[1-9]\d*", build), "Invalid project version/build")
    return {"bundleId": bundles[0], "version": version, "build": build}


def source_paths(root=ROOT):
    """Allowlisted build inputs only; generated projects, logs and credentials stay out."""
    allowed = {"Sources": {".swift"}, "Resources": {".strings", ".json", ".png", ".jpg", ".jpeg", ".pdf", ".svg"},
               "Tests": {".swift", ".json"}, "scripts": {".sh", ".py"}}
    paths = []
    for folder, suffixes in allowed.items():
        directory = root / IOS / folder
        require(directory.is_dir() and not directory.is_symlink(), "Source folder unavailable: " + folder)
        for path in sorted(directory.rglob("*")):
            relative = path.relative_to(directory)
            if any(part == "__pycache__" for part in relative.parts) or path.name == ".DS_Store":
                continue
            require(not any(part.startswith(".") for part in relative.parts), "Unexpected hidden file in iOS build inputs")
            require(not path.is_symlink(), "Symlinks are not allowed in iOS build inputs")
            if path.is_file():
                require(path.suffix in suffixes, "Unexpected iOS source file type: " + str(path.relative_to(root)))
                paths.append(path)
    for name in ("project.yml", "Info.plist", "PrivacyInfo.xcprivacy"):
        paths.append(root / IOS / name)
    paths.extend([root / "erp/tests/native-vectors.json", root / "scripts/mobile/package-ios-source.py",
                  root / ".github/workflows/ios.yml"])
    require(all(path.is_file() and not path.is_symlink() for path in paths), "Missing or unsafe iOS source input")
    return sorted(set(paths))


def file_record(path, root=ROOT):
    data = path.read_bytes()
    return {"path": path.relative_to(root).as_posix(), "sha256": hashlib.sha256(data).hexdigest(),
            "bytes": len(data), "mode": "0755" if path.stat().st_mode & stat.S_IXUSR else "0644"}


def snapshot(root=ROOT, require_clean=False):
    records = [file_record(path, root) for path in source_paths(root)]
    canonical = json.dumps(records, sort_keys=True, separators=(",", ":")).encode()
    value = {**metadata(root), "inputSha256": hashlib.sha256(canonical).hexdigest(), "buildInputs": records}
    try:
        actual_root = Path(command(["git", "-C", str(root), "rev-parse", "--show-toplevel"], text=True).stdout.strip()).resolve()
        require(actual_root == root.resolve(), "Source archive must not inherit a parent Git repository")
        sha = command(["git", "-C", str(root), "rev-parse", "HEAD"], text=True).stdout.strip()
        tree = command(["git", "-C", str(root), "rev-parse", "HEAD^{tree}"], text=True).stdout.strip()
        entries = command(["git", "-C", str(root), "ls-tree", "-rz", "HEAD"]).stdout
        blobs = {}
        for entry in entries.split(b"\0"):
            if entry:
                info, name = entry.split(b"\t", 1)
                mode, kind, digest = info.decode().split()
                if kind == "blob":
                    blobs[name.decode()] = (mode, digest)
        dirty = bool(command(["git", "-C", str(root), "diff", "HEAD", "--name-only"], text=True).stdout.strip())
        for record in records:
            data = (root / record["path"]).read_bytes()
            digest = hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()
            expected_mode = "100755" if record["mode"] == "0755" else "100644"
            dirty = dirty or blobs.get(record["path"]) != (expected_mode, digest)
        value.update(sourceGitSha=sha, sourceGitTree=tree, sourceWorkingTree=dirty, provenance="GIT_WORKTREE")
    except (subprocess.CalledProcessError, FileNotFoundError):
        manifest_path = root / "IOS_SOURCE_MANIFEST.json"
        require(manifest_path.is_file(), "Git checkout or verified IOS_SOURCE_MANIFEST.json is required")
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        require(manifest.get("type") == "XCODE_SOURCE_ONLY_NOT_IPA", "Unsupported source manifest")
        require(manifest.get("buildInputs") == records and manifest.get("inputSha256") == value["inputSha256"], "Source archive inputs changed or incomplete")
        for key in ("sourceGitSha", "sourceGitTree", "sourceWorkingTree"):
            require(key in manifest, "Missing source archive provenance: " + key)
            value[key] = manifest[key]
        value["provenance"] = "VERIFIED_SOURCE_ARCHIVE"
    require(re.fullmatch(r"[0-9a-f]{40}", value["sourceGitSha"]), "Invalid source commit")
    if os.environ.get("NATIVE_SOURCE_SHA"):
        require(value["sourceGitSha"] == os.environ["NATIVE_SOURCE_SHA"], "Native source SHA differs from checkout")
    if require_clean:
        require(value["sourceWorkingTree"] is False, "Commit iOS inputs before building a distribution candidate")
    return value


def validate_export_options(options, team, bundle):
    require(isinstance(options, dict), "Export options must be a dictionary")
    require(re.fullmatch(r"[A-Z0-9]{10}", team), "Owner team identifier is invalid")
    require(options.get("teamID") == team, "Export team differs from owner team")
    require(options.get("destination") == "export", "Only explicit local destination=export is allowed; upload is separate")
    require(options.get("method") in {"debugging", "release-testing", "app-store-connect"}, "Use a reviewed current Xcode export method")
    require(options.get("signingStyle") == "manual", "Use already installed owner signing assets with signingStyle=manual")
    require(options.get("manageAppVersionAndBuildNumber") is False, "Export must preserve the reviewed version and build")
    require(options.get("thinning", "<none>") == "<none>", "One unthinned IPA is required")
    require(not options.get("uploadSymbols") and not options.get("uploadBitcode"), "Export must not upload symbols or bitcode")
    require(options.get("distributionBundleIdentifier", bundle) == bundle, "Export bundle differs from KNABA")
    profiles = options.get("provisioningProfiles")
    require(isinstance(profiles, dict) and set(profiles) == {bundle}, "Provide the reviewed profile for exactly the KNABA application")
    require(isinstance(profiles[bundle], str) and 0 < len(profiles[bundle]) <= 256 and not any(ord(c) < 32 for c in profiles[bundle]), "Invalid provisioning profile specifier")
    certificate = options.get("signingCertificate", "Apple Development" if options["method"] == "debugging" else "Apple Distribution")
    require(isinstance(certificate, str) and 0 < len(certificate) <= 256 and not any(ord(c) < 32 for c in certificate), "Invalid signing certificate selector")
    return options["method"], profiles[bundle], certificate


def entitlement_allowed(actual, permitted):
    if isinstance(actual, bool):
        return isinstance(permitted, bool) and actual == permitted
    if isinstance(actual, str):
        return isinstance(permitted, str) and fnmatch.fnmatchcase(actual, permitted)
    if isinstance(actual, list):
        return isinstance(permitted, list) and all(any(entitlement_allowed(item, candidate) for candidate in permitted) for item in actual)
    if isinstance(actual, dict):
        return isinstance(permitted, dict) and all(key in permitted and entitlement_allowed(item, permitted[key]) for key, item in actual.items())
    return type(actual) is type(permitted) and actual == permitted


def validate_profile(profile, entitlements, team, bundle, method, now=None):
    now = now or dt.datetime.now(dt.timezone.utc)
    expires = profile.get("ExpirationDate")
    require(isinstance(expires, dt.datetime), "Provisioning expiration is missing")
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=dt.timezone.utc)
    require(expires > now, "Exported provisioning profile has expired")
    require(profile.get("TeamIdentifier") == [team], "Provisioning team differs from owner team")
    require("iOS" in profile.get("Platform", []), "Provisioning profile is not for iOS")
    permitted = profile.get("Entitlements", {})
    require(isinstance(permitted, dict) and isinstance(entitlements, dict), "Invalid signing entitlements")
    prefixes = profile.get("ApplicationIdentifierPrefix", [])
    require(isinstance(prefixes, list) and len(prefixes) == 1 and isinstance(prefixes[0], str), "Ambiguous application prefix")
    require(entitlements.get("application-identifier") == prefixes[0] + "." + bundle, "Signed application identifier mismatch")
    require(entitlements.get("com.apple.developer.team-identifier") == team, "Signed entitlements team mismatch")
    require(all(key in permitted and entitlement_allowed(value, permitted[key]) for key, value in entitlements.items()), "Signed entitlements exceed provisioning profile")
    debug = entitlements.get("get-task-allow", False)
    require(debug is (method == "debugging"), "Debug entitlement differs from export method")
    devices = profile.get("ProvisionedDevices", [])
    require(isinstance(devices, list) and not profile.get("ProvisionsAllDevices", False), "Enterprise/unbounded device profile is outside this delivery scope")
    if method in {"debugging", "release-testing"}:
        require(len(devices) > 0 and all(isinstance(device, str) and len(device) > 0 for device in devices), "Device testing requires registered devices in the owner profile")
    else:
        require(not devices, "App Store export must use a distribution profile")
    return {"profileExpiresAt": expires.isoformat(), "registeredDeviceCount": len(devices), "entitlementsWithinProfile": True}


def inspect_ipa_members(archive):
    members = archive.infolist()
    require(len(members) < 20000 and sum(member.file_size for member in members) <= MAX_IPA_BYTES, "IPA exceeds unpacking limits")
    seen = set()
    for member in members:
        path = PurePosixPath(member.filename)
        require(not path.is_absolute() and ".." not in path.parts and "\\" not in member.filename and "\x00" not in member.filename, "Unsafe IPA archive path")
        require(member.filename not in seen, "Duplicate IPA entry")
        seen.add(member.filename)
        require(not stat.S_ISLNK(member.external_attr >> 16), "Unexpected IPA symlink")
    plists = [name for name in seen if re.fullmatch(r"Payload/[^/]+\.app/Info\.plist", name)]
    require(len(plists) == 1, "Expected one application in IPA")
    return PurePosixPath(plists[0]).parent


def verify_ipa(ipa, source, options, team):
    method, _, _ = validate_export_options(options, team, source["bundleId"])
    require(ipa.is_file() and 0 < ipa.stat().st_size <= MAX_IPA_BYTES, "IPA file missing or exceeds size limit")
    with tempfile.TemporaryDirectory(prefix="knaba-ios-verify-") as directory:
        target = Path(directory)
        with zipfile.ZipFile(ipa) as archive:
            app_path = inspect_ipa_members(archive)
            archive.extractall(target)
        app = target / app_path
        meta = plistlib.loads((app / "Info.plist").read_bytes())
        require(meta.get("CFBundleIdentifier") == source["bundleId"] and meta.get("CFBundleShortVersionString") == source["version"] and str(meta.get("CFBundleVersion")) == source["build"], "Exported IPA version or bundle differs from reviewed source")
        require("iPhoneOS" in meta.get("CFBundleSupportedPlatforms", []), "Simulator application is not a device IPA")
        command(["codesign", "--verify", "--deep", "--strict", str(app)])
        entitlements = plistlib.loads(command(["codesign", "--display", "--entitlements", ":-", str(app)]).stdout)
        profile = plistlib.loads(command(["security", "cms", "-D", "-i", str(app / "embedded.mobileprovision")]).stdout)
        profile_summary = validate_profile(profile, entitlements, team, source["bundleId"], method)
        certificate_prefix = str(target / "signer-")
        command(["codesign", "--display", "--extract-certificates", certificate_prefix, str(app)])
        certificate = (target / "signer-0").read_bytes()
        require(certificate in profile.get("DeveloperCertificates", []), "Final IPA signing certificate is not authorized by profile")
        command(["openssl", "x509", "-inform", "DER", "-noout", "-checkend", "0"], input=certificate)
    digest = hashlib.sha256(ipa.read_bytes()).hexdigest()
    return {"builtAt": dt.datetime.now(dt.timezone.utc).isoformat(), **source,
            "artifact": ipa.name, "sha256": digest, "bytes": ipa.stat().st_size,
            "exportMethod": method, "teamId": team, "destination": "LOCAL_EXPORT_ONLY",
            "signing": "EXPORTED_IPA_SIGNATURE_AND_PROFILE_VERIFIED", **profile_summary,
            "signingCertificateSha256": hashlib.sha256(certificate).hexdigest(),
            "certificateRevocation": "NOT_CHECKED", "physicalDeviceInstall": "NOT_RUN",
            "upgradeAndDataRetention": "NOT_RUN", "storePublication": "NOT_RUN"}


def validate_xctest(summary, preparation):
    total = summary.get("totalTestCount")
    require(type(total) is int and total > 0 and summary.get("passedTests") == total, "XCTest must execute and pass all discovered tests")
    require(summary.get("result") == "Passed" and all(summary.get(key) == 0 for key in ("failedTests", "skippedTests", "expectedFailures")) and not summary.get("testFailures"), "XCTest failure, skip or expected failure cannot pass the native gate")
    require(preparation.get("status") == "SIMULATOR_READY_XCTEST_NOT_RUN", "Simulator preparation did not succeed")
    configurations = summary.get("devicesAndConfigurations", [])
    require(len(configurations) == 1, "Expected one exact simulator test destination")
    device = configurations[0].get("device", {})
    require(device.get("deviceId") == preparation.get("deviceUdid") and device.get("osVersion") == preparation.get("requestedOS") and device.get("platform") == "iOS Simulator", "XCTest ran on a different destination")
    return {"total": total, "passed": total, "failed": 0, "skipped": 0, "expectedFailures": 0}


def simulator_receipt(build, source):
    preparation = json.loads((build / "evidence/simulator-preparation.json").read_text(encoding="utf-8"))
    require(preparation.get("sourceGitSha") == source["sourceGitSha"], "Simulator source differs from checkout")
    counts = validate_xctest(json.loads((build / "evidence/xctest-summary.json").read_text(encoding="utf-8")), preparation)
    app = build / "Build/Products/Debug-iphonesimulator/KNABADE.app"
    meta = plistlib.loads((app / "Info.plist").read_bytes())
    require(meta.get("CFBundleIdentifier") == source["bundleId"] and meta.get("CFBundleShortVersionString") == source["version"] and str(meta.get("CFBundleVersion")) == source["build"] and "iPhoneSimulator" in meta.get("CFBundleSupportedPlatforms", []), "Simulator artifact identity mismatch")
    artifacts = []
    for name in ("KNABADE-simulator.app.zip", "NativeTests.xcresult.zip"):
        path = build / name
        require(path.is_file() and path.stat().st_size > 0, "Missing native artifact: " + name)
        with zipfile.ZipFile(path) as archive:
            require(archive.testzip() is None and len(archive.infolist()) > 0, "Damaged native artifact")
        artifacts.append({"path": name, "bytes": path.stat().st_size, "sha256": hashlib.sha256(path.read_bytes()).hexdigest()})
    launch = (build / "evidence/simulator-launch.txt").read_text(encoding="utf-8").strip()
    require(re.fullmatch(re.escape(source["bundleId"]) + r": [1-9]\d*", launch), "Simulator launch receipt missing")
    return {"recordedAt": dt.datetime.now(dt.timezone.utc).isoformat(), **source,
            "type": "IOS_SIMULATOR_ONLY_NOT_IPA", "xctest": counts, "simulator": preparation,
            "simulatorInstallLaunch": "PASS", "artifacts": artifacts,
            "signing": "CODE_SIGNING_ALLOWED=NO", "physicalDeviceInstall": "NOT_RUN",
            "realBackendUAT": "NOT_RUN", "appStoreOrTestFlight": "NOT_RUN"}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="action", required=True)
    snap = sub.add_parser("snapshot")
    snap.add_argument("output", type=Path)
    snap.add_argument("--require-clean", action="store_true")
    compare = sub.add_parser("compare")
    compare.add_argument("before", type=Path)
    export = sub.add_parser("export-options")
    export.add_argument("plist", type=Path)
    export.add_argument("team")
    export.add_argument("--field", choices=["method", "profile", "certificate"])
    ipa = sub.add_parser("verify-ipa")
    ipa.add_argument("path", type=Path)
    ipa.add_argument("source", type=Path)
    ipa.add_argument("options", type=Path)
    ipa.add_argument("team")
    ipa.add_argument("output", type=Path)
    simulator = sub.add_parser("simulator-receipt")
    simulator.add_argument("build", type=Path)
    args = parser.parse_args()
    if args.action == "snapshot":
        value = snapshot(require_clean=args.require_clean)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")
        print("Recorded native source:", value["sourceGitSha"], value["inputSha256"])
    elif args.action == "compare":
        before = json.loads(args.before.read_text(encoding="utf-8"))
        require(before == snapshot(require_clean=True), "iOS build inputs changed during build/export")
        print("Native inputs unchanged")
    elif args.action == "export-options":
        values = validate_export_options(plistlib.loads(args.plist.read_bytes()), args.team, metadata()["bundleId"])
        print(values[["method", "profile", "certificate"].index(args.field)] if args.field else "Local manual export options verified")
    elif args.action == "verify-ipa":
        source = json.loads(args.source.read_text(encoding="utf-8"))
        require(source == snapshot(require_clean=True), "iOS source differs from build receipt")
        value = verify_ipa(args.path, source, plistlib.loads(args.options.read_bytes()), args.team)
        args.output.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")
        print("Exported IPA verified:", value["artifact"], value["sha256"])
    else:
        source = json.loads((args.build / "evidence/source.json").read_text(encoding="utf-8"))
        require(source == snapshot(require_clean=True), "iOS source changed during simulator verification")
        value = simulator_receipt(args.build, source)
        (args.build / "evidence/native-receipt.json").write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")
        print("Actual simulator tests passed:", value["xctest"]["passed"], "source:", value["sourceGitSha"])


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, subprocess.SubprocessError, plistlib.InvalidFileException, zipfile.BadZipFile) as error:
        # Tool stderr may contain signing/profile metadata; do not publish it.
        print("iOS distribution blocked:", str(error) if isinstance(error, ValueError) else type(error).__name__, file=__import__("sys").stderr)
        raise SystemExit(1)
