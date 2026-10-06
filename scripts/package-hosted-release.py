#!/usr/bin/env python3
"""Package the exact hosted candidate using current execution evidence; no deployment claim."""
from __future__ import annotations
import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import platform
import re
import stat
import subprocess
import tempfile
import zipfile

MIB = 1024 * 1024
PREFIX = "knaba-de/"
REQUIRED = (
    "docs/evidence/release-live-unit.json",
    "docs/evidence/live-isolated-verification.json",
    "docs/evidence/browser-result.json",
    "docs/evidence/built-artifacts.json",
)
CLASSES = {"REAL_POSTGRES", "CPU_IN_MEMORY_DOCUMENT_OR_TRANSPORT_DOUBLE"}
SECRET_KEYS = {"authorization", "cookie", "set-cookie", "csrftoken", "devicetoken", "access_token",
               "refresh_token", "auth_encryption_key", "backup_encryption_key", "private_key", "client_secret"}
BLOCKED_PARTS = {"browser-artifacts", "browser-report", "test-results", "playwright-report",
                 "screenshots", "traces", "videos", ".local", ".git", "__pycache__"}
SAFE_DOC_EXTENSIONS = {".md", ".txt", ".json", ".jsonl", ".csv", ".yml", ".yaml", ".svg"}
MAX_JSON = 64 * MIB


class PackageError(Exception):
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


def require(condition, code):
    if not condition:
        raise PackageError(code)


def run(*args, cwd=None, timeout=60):
    try:
        result = subprocess.run(args, cwd=cwd, stdin=subprocess.DEVNULL, capture_output=True,
                                text=True, check=True, timeout=timeout)
        return result.stdout.rstrip("\n")
    except (subprocess.SubprocessError, OSError) as error:
        raise PackageError("COMMAND_FAILED_" + Path(args[0]).name.upper()) from error


def digest(path):
    value = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for block in iter(lambda: stream.read(MIB), b""):
            value.update(block)
    return value.hexdigest()


def record(path, root):
    return {"path": Path(path).relative_to(root).as_posix(),
            "bytes": Path(path).stat().st_size, "sha256": digest(path)}


def read_json(path):
    require(path.is_file() and path.stat().st_size <= MAX_JSON, "BOUNDED_EVIDENCE_FILE_REQUIRED")
    try:
        value = json.loads(path.read_text())
    except (UnicodeError, ValueError) as error:
        raise PackageError("INVALID_EVIDENCE_JSON") from error
    require(isinstance(value, dict), "EVIDENCE_OBJECT_REQUIRED")
    return value


def timestamp(value):
    try:
        if isinstance(value, (float, int)) and not isinstance(value, bool):
            return float(value) / 1000
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).timestamp()
    except (ValueError, TypeError, OverflowError) as error:
        raise PackageError("EVIDENCE_TIMESTAMP_INVALID") from error


def bounded_period(report_start, stage, duration_ms=0):
    start, end = timestamp(stage["startedAt"]), timestamp(stage["completedAt"])
    actual = timestamp(report_start)
    require(start - 2 <= actual <= end + 2 and actual + duration_ms / 1000 <= end + 2,
            "REPORT_NOT_BOUND_TO_CURRENT_EXECUTION_STAGE")


def safe_relative(value):
    require(isinstance(value, str) and value and "\\" not in value, "UNSAFE_ARCHIVE_PATH")
    path = PurePosixPath(value)
    require(not path.is_absolute() and ".." not in path.parts and "." not in path.parts,
            "UNSAFE_ARCHIVE_PATH")
    return path.as_posix()


def test_path(value):
    normalized = str(value).replace("\\", "/")
    if "/tests/" in normalized:
        normalized = "tests/" + normalized.rsplit("/tests/", 1)[1]
    elif "/apps/" in normalized:
        normalized = "apps/" + normalized.rsplit("/apps/", 1)[1]
    path = safe_relative(normalized)
    require(path.startswith(("tests/", "apps/")) and path.endswith((".test.ts", ".test.tsx", ".spec.ts", ".spec.tsx")), "UNEXPECTED_TEST_SOURCE_PATH")
    return path


def case_rows(report):
    cases = []
    duplicates = Counter()
    for suite in report.get("testResults", []):
        path = test_path(suite.get("name", ""))
        for assertion in suite.get("assertionResults", []):
            name = assertion.get("fullName")
            require(isinstance(name, str), "TEST_FULL_NAME_REQUIRED")
            identity = (path, name)
            occurrence = duplicates[identity]
            duplicates[identity] += 1
            cases.append({"test_path": path, "full_name": name,
                          "duplicate_name_occurrence": occurrence, "status": assertion.get("status")})
    return cases


def counts(rows):
    result = Counter(row["status"] for row in rows)
    require(set(result).issubset({"passed", "failed", "pending", "skipped", "todo", "disabled"}),
            "UNRECOGNIZED_ASSERTION_STATUS")
    return {"total": len(rows), "passed": result["passed"], "failed": result["failed"],
            "skipped": result["pending"] + result["skipped"] + result["disabled"], "todo": result["todo"]}


def unit_evidence(report, root):
    cases = case_rows(report)
    actual = counts(cases)
    for actual_key, reported_key in (("total", "numTotalTests"), ("passed", "numPassedTests"),
                                    ("failed", "numFailedTests"), ("skipped", "numPendingTests"),
                                    ("todo", "numTodoTests")):
        require(actual[actual_key] == report.get(reported_key, 0), "UNIT_REPORT_COUNT_MISMATCH")
    passed = report.get("success") is True and actual["failed"] == 0 and actual["skipped"] == 0 and actual["todo"] == 0
    index_path = root / "docs/evidence/offline-execution-scope.json"
    classification = {"status": "UNKNOWN", "reason": "EXACT_EXECUTION_CLASSIFICATION_INDEX_MISSING",
                      "realPostgres": None, "cpuDocumentOrTransportDouble": None}
    if index_path.exists():
        index = read_json(index_path)
        definitions = index.get("cases", index.get("caseDefinitions"))
        files = index.get("test_files", index.get("testFiles"))
        require(isinstance(definitions, list) and isinstance(files, list), "EXECUTION_SCOPE_SCHEMA_REQUIRED")
        indexed = {}
        for item in definitions:
            identity = (test_path(item["test_path"]), item["full_name"], item["duplicate_name_occurrence"])
            require(identity not in indexed and item["execution_class"] in CLASSES,
                    "EXECUTION_SCOPE_DUPLICATE_OR_UNKNOWN_CLASS")
            indexed[identity] = item["execution_class"]
        observed = {(row["test_path"], row["full_name"], row["duplicate_name_occurrence"]) for row in cases}
        require(observed == set(indexed), "EXECUTION_SCOPE_EXACT_CASE_SET_MISMATCH")
        source_files = {}
        for item in files:
            path = test_path(item.get("test_path", item.get("path")))
            require(path not in source_files and re.fullmatch(r"[a-f0-9]{64}", str(item.get("sha256", ""))),
                    "EXECUTION_SCOPE_SOURCE_HASH_REQUIRED")
            source_files[path] = item["sha256"]
        require(set(source_files) == {row["test_path"] for row in cases}, "EXECUTION_SCOPE_SOURCE_SET_MISMATCH")
        for path, sha in source_files.items():
            require((root/path).is_file() and digest(root/path) == sha, "EXECUTION_SCOPE_SOURCE_BYTES_MISMATCH")
        grouped = {kind: [] for kind in CLASSES}
        for row in cases:
            identity = (row["test_path"], row["full_name"], row["duplicate_name_occurrence"])
            grouped[indexed[identity]].append(row)
        classification = {"status": "EXACT_INDEX_VALIDATED", "evidence": record(index_path, root),
                          "indexIsExecutionProof": False,
                          "realPostgres": counts(grouped["REAL_POSTGRES"]),
                          "cpuDocumentOrTransportDouble": counts(grouped["CPU_IN_MEMORY_DOCUMENT_OR_TRANSPORT_DOUBLE"])}
    return {"status": "PASSED" if passed else "FAILED_OR_INCOMPLETE", **actual,
            "classification": classification}, cases


def browser_evidence(report):
    stats = report.get("stats")
    require(isinstance(stats, dict), "ACTUAL_BROWSER_STATS_REQUIRED")
    fields = ("expected", "unexpected", "flaky", "skipped")
    require(all(isinstance(stats.get(key), int) and not isinstance(stats[key], bool) and stats[key] >= 0
                for key in fields), "BROWSER_COUNTS_INVALID")
    # Flaky/retried cases remain visibly separate; expected counts are not invented.
    return {"status": "PASSED" if stats["unexpected"] == 0 and stats["skipped"] == 0 and not report.get("errors") else "FAILED_OR_INCOMPLETE",
            "passed": stats["expected"], "failed": stats["unexpected"], "flaky": stats["flaky"],
            "skipped": stats["skipped"], "total": sum(stats[key] for key in fields)}


def sensitive_json(value):
    if isinstance(value, list):
        return any(sensitive_json(item) for item in value)
    if isinstance(value, dict):
        for key, item in value.items():
            if str(key).lower() in SECRET_KEYS and item not in (None, "", False, [], {}):
                return True
            if sensitive_json(item):
                return True
    if isinstance(value, str):
        return bool(re.search(r'(?im)\b(?:authorization|set-cookie|cookie|csrfToken|deviceToken)\s*[:=]\s*(?:Bearer\s+)?[A-Za-z0-9_./+=-]{12,}', value))
    return False


def sensitive_text(path):
    data = path.read_text(errors="strict")
    if re.search(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----", data):
        return True
    if re.search(r"postgres(?:ql)?://[^\s\"<>]+:[^\s\"<>]+@", data):
        return True
    if path.suffix == ".json":
        try:
            return sensitive_json(json.loads(data))
        except ValueError:
            return True
    return bool(re.search(r'(?im)^\s*(?:authorization|set-cookie|cookie)\s*:\s*\S+', data))


def verify_zip(path, critical):
    with zipfile.ZipFile(path) as archive:
        require(archive.testzip() is None, "ARCHIVE_CRC_FAILED")
        require(len(archive.namelist()) == len(set(archive.namelist())), "ARCHIVE_DUPLICATE_PATH")
        for name, expected in critical.items():
            require(archive.read(PREFIX + name) == expected, "ARCHIVE_CRITICAL_BYTES_MISMATCH")


def add_tree(archive, path, root, seen):
    path = Path(path)
    if not path.exists() and not path.is_symlink():
        raise PackageError("RUNTIME_REQUIRED_PATH_MISSING")
    name = PREFIX + safe_relative(path.relative_to(root).as_posix())
    if name in seen:
        return
    if path.is_symlink():
        target = os.readlink(path)
        require(not os.path.isabs(target), "ARCHIVE_ABSOLUTE_SYMLINK_DENIED")
        require(path.resolve().is_relative_to(root), "ARCHIVE_ESCAPING_SYMLINK_DENIED")
        info = zipfile.ZipInfo(name)
        info.create_system = 3
        info.external_attr = (stat.S_IFLNK | 0o777) << 16
        archive.writestr(info, target)
        seen.add(name)
    elif path.is_file():
        archive.write(path, name)
        seen.add(name)
    elif path.is_dir():
        for child in sorted(path.iterdir()):
            add_tree(archive, child, root, seen)


def split_runtime(path, part_bytes=24*MIB):
    require(0 < part_bytes <= 24*MIB, "PART_SIZE_EXCEEDS_DOWNLOAD_BOUND")
    parts = []
    reconstructed = hashlib.sha256()
    total = 0
    with path.open("rb") as stream:
        sequence = 1
        while True:
            block = stream.read(part_bytes)
            if not block:
                break
            part = Path(str(path) + f".part{sequence:03d}")
            part.write_bytes(block)
            with part.open("rb") as check:
                verified = check.read()
            require(verified == block, "RUNTIME_PART_BYTES_MISMATCH")
            reconstructed.update(verified)
            total += len(verified)
            parts.append((sequence, part))
            sequence += 1
    require(total == path.stat().st_size and reconstructed.hexdigest() == digest(path),
            "RUNTIME_PART_RECONSTRUCTION_MISMATCH")
    return parts


def package(root, output, expected):
    sha = run("git", "rev-parse", "HEAD", cwd=root)
    require(re.fullmatch(r"[a-f0-9]{40}", str(expected)) and expected != "0"*40 and sha == expected,
            "EXACT_EXPECTED_HEAD_REQUIRED")
    for name in ("GIT_SHA", "EXPECTED_GIT_SHA"):
        if os.environ.get(name):
            require(os.environ[name] == sha, "ENVIRONMENT_SOURCE_SHA_MISMATCH")
    tree = run("git", "rev-parse", "HEAD^{tree}", cwd=root)
    changed = run("git", "status", "--porcelain", "--untracked-files=all", cwd=root)
    for line in changed.splitlines():
        require(line[3:].startswith("docs/evidence/"), "CLEAN_COMMITTED_SOURCE_REQUIRED")
    release = read_json(root/"dist/release.json")
    require(release.get("code_sha") == sha and release.get("source_dirty") is False,
            "EXACT_CLEAN_BUILT_RELEASE_REQUIRED")
    reports = {path: read_json(root/path) for path in REQUIRED}
    built = reports[REQUIRED[3]]
    require(built.get("status") == "PASSED" and built.get("code_sha") == sha and built.get("source_tree") == tree,
            "BUILT_ARTIFACT_ATTESTATION_SOURCE_MISMATCH")
    files = built.get("files")
    require(isinstance(files, list), "ACTUAL_BUILT_FILE_ATTESTATION_REQUIRED")
    seen_files = set()
    for item in files:
        path = safe_relative(item["path"])
        require(path not in seen_files, "DUPLICATE_BUILT_FILE_ATTESTATION")
        seen_files.add(path)
        require((root/path).is_file() and (root/path).stat().st_size == item["bytes"] and digest(root/path) == item["sha256"],
                "BUILT_ARTIFACT_BYTES_MISMATCH")
    actual_files = {path.relative_to(root).as_posix() for path in (root/"dist").rglob("*") if path.is_file()}
    require(seen_files == actual_files | {"package.json", "package-lock.json"}, "BUILT_ARTIFACT_FILE_SET_MISMATCH")
    live = reports[REQUIRED[1]]
    require(live.get("gitSha") == sha and live.get("runtime", {}).get("gitSha") == sha
            and live.get("exposure") == "LOCAL_VERIFICATION_ONLY", "LIVE_EXECUTION_SOURCE_MISMATCH")
    require(live.get("bundle", {}).get("manifest") == release
            and live["bundle"].get("serverSha256") == digest(root/"dist/server.mjs")
            and live["bundle"].get("workerSha256") == digest(root/"dist/worker.mjs"), "LIVE_BUNDLE_BYTES_MISMATCH")
    stages = {}
    for stage in live.get("stages", []):
        require(stage.get("gitSha") == sha and stage.get("stage") not in stages, "LIVE_STAGE_IDENTITY_MISMATCH")
        stages[stage["stage"]] = stage
    required_stages = {"exact-live-runtime", "full-unit-and-postgres", "rendered-browser-scenarios",
                       "encrypted-delivery-backup", "backup-tamper-rejection",
                       "empty-database-private-blob-restore", "bundled-worker-heartbeat-and-restart"}
    require(required_stages.issubset(stages), "COMPLETE_LIVE_STAGE_RECEIPTS_REQUIRED")
    unit, _ = unit_evidence(reports[REQUIRED[0]], root)
    browser = browser_evidence(reports[REQUIRED[2]])
    bounded_period(reports[REQUIRED[0]]["startTime"], stages["full-unit-and-postgres"])
    stats = reports[REQUIRED[2]]["stats"]
    bounded_period(stats["startTime"], stages["rendered-browser-scenarios"], stats.get("duration", 0))
    passed = live.get("status") == "PASSED" and all(stage["status"] == "PASSED" for stage in stages.values()) and unit["status"] == browser["status"] == "PASSED"
    require(platform.system() == "Linux" and platform.machine() in {"x86_64", "AMD64"}, "LINUX_X64_RUNTIME_PACKAGING_HOST_REQUIRED")
    node = json.loads(run("node", "-p", "JSON.stringify({version:process.version,platform:process.platform,arch:process.arch})", cwd=root))
    require(node["version"].startswith("v24.") and node["platform"] == "linux" and node["arch"] == "x64",
            "NODE24_LINUX_X64_REQUIRED")
    output.mkdir(parents=True, exist_ok=True)
    require(output.is_relative_to(root), "OUTPUT_MUST_BE_INSIDE_REPOSITORY")
    source = output/f"KNABA_DE_SOURCE_{sha}.zip"
    run("git", "archive", "--format=zip", f"--prefix={PREFIX}", f"--output={source}", sha, cwd=root)
    critical_source = ["package.json", "package-lock.json", "infra/001_init.sql",
                       "KNABA_DE_MASTER_SPEC.md", "scripts/package-hosted-release.py"]
    verify_zip(source, {name: (root/name).read_bytes() for name in critical_source})
    with zipfile.ZipFile(source) as archive:
        for name in archive.namelist():
            filename = PurePosixPath(name).name
            require(not (filename.startswith(".env") and filename != ".env.example")
                    and filename not in {"id_rsa", "cookies.json", "storageState.json"}
                    and not filename.endswith((".p12", ".pfx", ".key")), "COMMITTED_SECRET_PATH_BLOCKED")
    bundle_path = output/f"KNABA_DE_GIT_{sha}.bundle"
    bundle_path.unlink(missing_ok=True)
    bundle = {"status": "NOT_CREATED", "reason": "SHALLOW_HISTORY_IS_NOT_A_SELF_CONTAINED_BUNDLE"}
    if run("git", "rev-parse", "--is-shallow-repository", cwd=root) == "false":
        try:
            run("git", "bundle", "create", str(bundle_path), "--all", "HEAD", cwd=root)
            with tempfile.TemporaryDirectory(prefix="knaba-bundle-") as temporary:
                run("git", "init", "--bare", temporary)
                run("git", "-C", temporary, "bundle", "verify", str(bundle_path))
            require(any(line.split()[0] == sha for line in run("git", "bundle", "list-heads", str(bundle_path), cwd=root).splitlines()),
                    "BUNDLE_EXACT_HEAD_MISSING")
            if bundle_path.stat().st_size <= 32*MIB:
                bundle = {"status": "PASSED_SELF_CONTAINED", **record(bundle_path, root)}
            else:
                bundle_path.unlink(); bundle = {"status": "NOT_CREATED", "reason": "BUNDLE_EXCEEDS_DOWNLOAD_BOUND"}
        except PackageError as error:
            bundle_path.unlink(missing_ok=True); bundle = {"status": "NOT_CREATED", "reason": error.code}
    raw_modules = run("npm", "ls", "--omit=dev", "--all", "--parseable", cwd=root).splitlines()[1:]
    modules = {Path(path).resolve() for path in raw_modules if Path(path).is_dir()}
    modules.update((root/"node_modules"/name).resolve() for name in
                   ("tsx", "esbuild", "@esbuild/linux-x64", "get-tsconfig", "resolve-pkg-maps"))
    require(all(path.is_dir() and path.is_relative_to(root/"node_modules") for path in modules), "RUNTIME_DEPENDENCY_PATH_INVALID")
    runtime = output/f"KNABA_DE_RUNTIME_LINUX_X64_{sha}.zip"
    with zipfile.ZipFile(runtime, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        seen = set()
        for name in ("dist", "packages", "infra", "scripts", "apps/api", "package.json", "package-lock.json",
                     "tsconfig.json", ".env.example", "README.md", "KNABA_DE_MASTER_SPEC.md"):
            add_tree(archive, root/name, root, seen)
        for module in sorted(modules):
            add_tree(archive, module, root, seen)
        for name in ("tsx", "esbuild"):
            add_tree(archive, root/"node_modules/.bin"/name, root, seen)
        archive.writestr(PREFIX+"RUNTIME_README.txt",
            f"KNABA DE exact source {sha}\nLinux x64 glibc, Node24 and separately configured PostgreSQL17 required.\n"
            "API/web/worker, production dependencies and tsx migration runner included.\n"
            "ZIP stores POSIX file modes and relative symlinks; use a POSIX-aware extractor.\n"
            "Concatenate numbered parts in manifest order and verify full bytes/SHA256 before extraction.\n"
            "No production environment secrets, native APK/IPA, provider/device/legal acceptance or public deployment included.\n")
    critical_runtime = ["dist/server.mjs", "dist/worker.mjs", "dist/release.json", "infra/001_init.sql",
                        "package-lock.json", "KNABA_DE_MASTER_SPEC.md", "node_modules/tsx/dist/cli.mjs",
                        "node_modules/@esbuild/linux-x64/bin/esbuild"]
    verify_zip(runtime, {name: (root/name).read_bytes() for name in critical_runtime})
    parts = split_runtime(runtime)
    docs = output/f"KNABA_DE_DELIVERY_DOCS_{sha}.zip"
    candidates = []
    for name in ("AGENTS.md", "PROJECT_MEMORY.md", "MASTER_ROADMAP.md", "ROADMAP.md", "CHANGELOG.md",
                 "README.md", "KNABA_DE_MASTER_SPEC.md"):
        if (root/name).is_file(): candidates.append(root/name)
    candidates.extend(path for path in (root/"docs").rglob("*") if path.is_file())
    excluded = []
    with zipfile.ZipFile(docs, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        seen = set()
        for path in sorted(set(candidates)):
            relative = path.relative_to(root)
            if any(part in BLOCKED_PARTS for part in relative.parts) or path.suffix.lower() not in SAFE_DOC_EXTENSIONS or re.search(r"(?:cookies|storage[-_]?state|runtime\.env|\.pem$|\.p12$|\.pfx$)", path.name, re.I):
                excluded.append({"path":relative.as_posix(), "reason":"PRIVATE_TRACE_BINARY_OR_STATE_EXCLUDED"}); continue
            try: sensitive = sensitive_text(path)
            except UnicodeError: sensitive = True
            if sensitive:
                require(relative.as_posix() not in REQUIRED, "CURRENT_EVIDENCE_CONTAINS_SENSITIVE_STATE")
                excluded.append({"path":relative.as_posix(), "reason":"SENSITIVE_REFERENCE_EXCLUDED"}); continue
            add_tree(archive, path, root, seen)
    verify_zip(docs, {name: (root/name).read_bytes() for name in REQUIRED+("KNABA_DE_MASTER_SPEC.md",)})
    require(source.stat().st_size <= 32*MIB and docs.stat().st_size <= 32*MIB, "SOURCE_OR_DOCS_EXCEED_DOWNLOAD_BOUND")
    require(run("git", "rev-parse", "HEAD", cwd=root) == sha and run("git", "rev-parse", "HEAD^{tree}", cwd=root) == tree,
            "SOURCE_CHANGED_DURING_PACKAGING")
    manifest = {
        "schemaVersion":1, "createdAt":datetime.now(timezone.utc).isoformat(), "codeSha":sha, "sourceTree":tree,
        "status":"HOSTED_ACCEPTANCE_VERIFIED" if passed else "PACKAGED_WITH_FAILED_OR_INCOMPLETE_ACCEPTANCE",
        "packagingIntegrity":"PASSED", "build":release, "builtArtifactsEvidence":record(root/REQUIRED[3],root),
        "evidence":[record(root/path,root) for path in REQUIRED], "tests":unit, "browser":browser,
        "isolatedRuntime":{"status":live["status"],"exposure":"LOCAL_VERIFICATION_ONLY","stages":list(stages.values())},
        "publicDeployment":{"status":"NOT_RUN","verifiedApplicationUrl":None,"reason":"Separate final public deployment/readiness receipt required."},
        "externalProviders":{"status":"NOT_RUN","scope":"Synthetic acceptance; declared transport/provider doubles do not prove real AI/WhatsApp/S3/maps/bank/legal/GPS-provider approval."},
        "nativeArtifacts":{"status":"SEPARATE_WORKFLOW","reason":"Native APK/simulator outputs and physical-device acceptance are not included or inferred."},
        "runtimePrerequisites":["Linux x64 glibc","Node24","PostgreSQL17","Actual private environment configuration","POSIX-aware ZIP extraction"],
        "sourceArchive":record(source,root), "gitBundle":bundle, "documentationArchive":record(docs,root),
        "documentationExclusions":excluded,
        "runtimeArchive":{**record(runtime,root),"uploadFullArchive":False,"partSizeLimitBytes":24*MIB,
                          "reconstructionVerified":True,"parts":[{"sequence":sequence,**record(part,root)} for sequence,part in parts],
                          "posixFileModesAndRelativeBinLinksPreserved":True},
    }
    target = output/"HOSTED_RELEASE_MANIFEST.json"
    target.write_text(json.dumps(manifest, indent=2)+"\n")
    return {"status":manifest["status"],"codeSha":sha,"sourceTree":tree,
            "manifest":target.relative_to(root).as_posix(),"runtimeParts":len(parts),
            "runtimeBytes":runtime.stat().st_size,"gitBundle":bundle["status"],
            "unit":{key:unit[key] for key in ("passed","failed","skipped","total")},
            "browser":browser}


def self_test():
    with tempfile.TemporaryDirectory(prefix="knaba-hosted-package-test-") as temporary:
        root = Path(temporary)
        require(test_path("/runner/repository/apps/web/src/api.test.ts") == "apps/web/src/api.test.ts", "SELF_TEST_WEB_CASE_PATH")
        (root/"tests").mkdir(); (root/"tests/example.test.ts").write_text("synthetic source")
        (root/"docs/evidence").mkdir(parents=True)
        report = {"success":True,"numTotalTests":2,"numPassedTests":2,"numFailedTests":0,"numPendingTests":0,
                  "numTodoTests":0,"testResults":[{"name":"/runner/repo/tests/example.test.ts","assertionResults":[
                      {"fullName":"same case","status":"passed"},{"fullName":"same case","status":"passed"}]}]}
        unknown, _ = unit_evidence(report,root)
        require(unknown["classification"]["status"] == "UNKNOWN", "SELF_TEST_UNKNOWN_CLASS")
        definitions = [{"test_path":"tests/example.test.ts","full_name":"same case","duplicate_name_occurrence":index,
                        "execution_class":kind} for index,kind in enumerate(sorted(CLASSES))]
        index = {"cases":definitions,"test_files":[{"test_path":"tests/example.test.ts","sha256":digest(root/"tests/example.test.ts")}]}
        (root/"docs/evidence/offline-execution-scope.json").write_text(json.dumps(index))
        classified,_ = unit_evidence(report,root)
        require(classified["classification"]["realPostgres"]["passed"] == 1, "SELF_TEST_INDEX_CLASS")
        report["testResults"][0]["assertionResults"][1]["status"]="pending"
        report.update(success=False,numPassedTests=1,numPendingTests=1)
        require(unit_evidence(report,root)[0]["skipped"] == 1, "SELF_TEST_NO_FAKE_ZERO_SKIP")
        (root/"tests/example.test.ts").write_text("changed source")
        try: unit_evidence(report,root); raise AssertionError("Changed test source accepted")
        except PackageError as error: require(error.code=="EXECUTION_SCOPE_SOURCE_BYTES_MISMATCH","SELF_TEST_SCOPE_HASH")
        (root/"file").write_bytes(b"exact bytes"); (root/"bin").symlink_to("file")
        archive=root/"check.zip"
        with zipfile.ZipFile(archive,"w") as item: add_tree(item,root/"file",root,set());add_tree(item,root/"bin",root,set())
        verify_zip(archive,{"file":b"exact bytes"})
        with zipfile.ZipFile(archive) as item:
            require(stat.S_ISLNK(item.getinfo(PREFIX+"bin").external_attr>>16),"SELF_TEST_POSIX_LINK")
        try: verify_zip(archive,{"file":b"incorrect bytes"}); raise AssertionError("Wrong archive bytes accepted")
        except PackageError as error: require(error.code=="ARCHIVE_CRITICAL_BYTES_MISMATCH","SELF_TEST_ARCHIVE_BYTES")
        payload=root/"runtime.zip";payload.write_bytes(bytes(range(256))*10000)
        parts=split_runtime(payload,256*1024)
        require(len(parts)==10 and b"".join(path.read_bytes() for _,path in parts)==payload.read_bytes(),"SELF_TEST_RECONSTRUCT")
        require(sensitive_json({"authorization":"Bearer synthetic-sensitive-cookie"}),"SELF_TEST_SECRET")
        require(browser_evidence({"stats":{"expected":0,"unexpected":0,"flaky":0,"skipped":19}})["status"]!="PASSED","SELF_TEST_BROWSER_SKIPS")
    print(json.dumps({"status":"PASSED","scope":"Packaging helper fixtures only; no actual Git/hosted/runtime release produced.","checks":11}))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", default="artifacts/hosted-release")
    parser.add_argument("--expected-sha", default=os.environ.get("EXPECTED_GIT_SHA") or os.environ.get("GIT_SHA"))
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test(); return
    root = Path(__file__).resolve().parents[1]
    output = (root/args.output).resolve()
    require(output.is_relative_to(root), "OUTPUT_MUST_BE_INSIDE_REPOSITORY")
    print(json.dumps(package(root,output,args.expected_sha)))


if __name__ == "__main__":
    try: main()
    except (PackageError, KeyError, TypeError) as error:
        code = error.code if isinstance(error,PackageError) else "EVIDENCE_SCHEMA_INVALID"
        print(json.dumps({"status":"FAILED","reason":code}))
        raise SystemExit(1)
