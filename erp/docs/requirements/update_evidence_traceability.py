#!/usr/bin/env python3
"""Attach audited, bounded evidence without regenerating or weakening source criteria.

The baseline generator is intentionally separate. This updater preserves all source
IDs/text and only closes the explicitly reviewed whole criteria below. New handlers
are source pointers pending a subsequent CI run, never inherited historical passes.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent
SHA = "942b3b2fc575b34b565fff2f4a1cd4d417d5e06b"
RUN = "https://github.com/ziko1/knaba/actions/runs/37525960411"
NATIVE_RUN = "https://github.com/ziko1/knaba/actions/runs/37525960129"
INDEX = "docs/requirements/HISTORICAL_EXECUTION_INDEX.json"
SUMMARY = "docs/evidence/ci-run-37525960411-summary.json"
NATIVE = "docs/evidence/native-run-37525960129-summary.json"
PG_GROUPS = {
    "PostgreSQL command transaction and read authorization",
    "PostgreSQL GPS retention and immutable-history boundary",
    "PostgreSQL worker leasing, recovery and disabled integrations",
}

# Related files establish navigation, not automatic criterion-level coverage.
MODULES = {
    0: (["KNABA_DE_MASTER_SPEC.md"], [], "Full source preserved; product acceptance and handover remain open."),
    1: (["docs/HANDOVER.md", "MASTER_ROADMAP.md"], [], "Implemented modules require final candidate acceptance; no production readiness inferred."),
    2: (["AGENTS.md", "PROJECT_MEMORY.md", "MASTER_ROADMAP.md"], [], "Delivery records exist; the user's final deployment goal requires final live evidence."),
    3: (["packages/domain/commerce.ts", "packages/domain/governance.ts", "apps/worker/runner.ts"], ["commerce.test.ts", "governance.test.ts", "integrations.test.ts"], "Domain approval and scheduling invariants executed; current automation/provider effects need final acceptance."),
    4: (["apps/api/database.ts", "apps/api/engine.ts", "docs/adr/0001-architecture.md", "infra/001_init.sql"], ["engine.integration.test.ts", "integrations.test.ts"], "39 real PostgreSQL cases belong to exact historical source; new migrations/handlers need current CI."),
    5: (["apps/api/auth.ts", "packages/domain/identity.ts", "packages/domain/permissions.ts"], ["identity.test.ts", "engine.integration.test.ts", "governance.test.ts"], "Historical current-rights/MFA/tenant cases passed; AI bridge and all role UI paths are not thereby accepted."),
    6: (["packages/integrations/whatsapp-router.ts", "packages/integrations/whatsapp-router-text.ts", "apps/worker/runner.ts", "apps/api/assistant-runtime.ts"], ["commerce.test.ts", "communications.test.ts"], "New standalone WhatsApp router and guest assistant changes await final CI; no official provider session acceptance."),
    7: (["packages/integrations/whatsapp.ts", "packages/integrations/whatsapp-router.ts", "apps/worker/runner.ts"], ["integrations.test.ts", "communications.test.ts"], "Raw HMAC and channel policy executed with synthetic transport; Meta credentials/account/templates/live callbacks unverified."),
    8: (["packages/domain/communications.ts", "packages/integrations/deepseek.ts", "apps/worker/runner.ts"], ["communications.test.ts", "integrations.test.ts", "engine.integration.test.ts"], "Versioned ACL/cache and fact guards executed; real multilingual/provider quality and full WhatsApp UX remain open."),
    9: (["packages/domain/commerce.ts", "packages/integrations/assistant-tools.ts", "apps/api/assistant-runtime.ts", "packages/integrations/deepseek.ts"], ["commerce.test.ts", "integrations.test.ts"], "Config preview/publish and synthetic AI guards executed; newly added tool bridge/atomic approval paths require final CI and provider evaluation."),
    10: (["packages/domain/commerce.ts", "packages/integrations/assistant-tools.ts", "apps/api/assistant-runtime.ts"], ["commerce.test.ts", "communications.test.ts", "integrations.test.ts"], "Lead and human ownership domain checks executed; complete guest/router lead continuation remains candidate acceptance."),
    11: (["packages/domain/commerce.ts"], ["commerce.test.ts"], "Exact cents and narrow synthetic sales scenarios passed; report/UI/provider equivalence is separate."),
    12: (["packages/domain/commerce.ts", "packages/domain/operations.ts"], ["commerce.test.ts", "operations.test.ts"], "Canonical dispatch/task domain roundtrips executed; simultaneous independent dispatcher reservations not verified as that whole scenario."),
    13: (["packages/domain/commerce.ts", "packages/domain/resources.ts", "apps/api/engine.ts", "apps/web/src/App.tsx"], ["commerce.test.ts", "resources.test.ts", "engine.integration.test.ts"], "Historical customer ACL projections executed; report download/browser and new assistant paths need final live acceptance."),
    14: (["packages/domain/operations.ts", "packages/domain/imports.ts", "apps/web/src/App.tsx"], ["operations.test.ts", "imports.test.ts"], "Tree/import validation executed; full KNB-014 navigation and issued-report reparent fixture not accepted."),
    15: (["packages/domain/operations.ts", "packages/domain/task-calendar.ts", "apps/worker/runner.ts"], ["operations.test.ts", "task-calendar.test.ts"], "Historical pure calendar and task invariants passed; current atomic catchup handlers pending, accepted-template/rework-photo/time/report criteria partial."),
    16: (["packages/domain/operations.ts"], ["operations.test.ts", "engine.integration.test.ts"], "Two full source synthetic arithmetic paragraphs passed; legal rules, all boundary corrections and final role UI remain separate."),
    17: (["packages/domain/operations.ts", "packages/domain/gps.ts", "apps/mobile-android/app/src/main/java/de/knaba/mobile/TrackingService.kt", "apps/mobile-ios/Sources/LocationTracker.swift"], ["operations.test.ts", "gps-retention.test.ts"], "10 historical real PG GPS cases and native classifier tests passed; physical permissions/background/battery/offline tracking and legal activation remain open."),
    18: (["packages/domain/resources.ts", "apps/api/exporters.ts", "apps/web/src/App.tsx"], ["resources.test.ts", "operations.test.ts"], "Exact domain snapshots/export artifacts executed; complete analytics/role UI acceptance pending."),
    19: (["packages/domain/resources.ts", "apps/api/engine.ts"], ["resources.test.ts", "engine.integration.test.ts"], "Full synthetic 10-liter criterion passed; PG concurrent stock race passed, physical barcode/procurement and final browser paths remain separate."),
    20: (["packages/domain/communications.ts", "packages/domain/commerce.ts", "apps/worker/runner.ts"], ["communications.test.ts", "integrations.test.ts"], "Retries/quiet periods/domain rule matching executed; real delivery/receipt/escalation provider acceptance pending."),
    21: (["packages/domain/resources.ts", "packages/storage/index.ts", "packages/integrations/media-scanner.ts", "apps/api/http.ts"], ["resources.test.ts", "media-scanner.test.ts", "media-ingest.test.ts", "engine.integration.test.ts"], "Private storage/scanner boundaries executed and historical browser upload passed; real S3/scanner/provider operations and complete export/search leakage acceptance remain open."),
    22: (["packages/domain/resources.ts"], ["resources.test.ts", "engine.integration.test.ts"], "Synthetic payroll/partial payout/ACL executed; no real bank transfer, employee receipt or accountant legal approval claimed."),
    23: (["packages/domain/resources.ts", "apps/api/exporters.ts", "apps/api/http.ts"], ["resources.test.ts", "engine.integration.test.ts"], "Actual CPU PDF/CSV/XLSX artifacts executed; historical browser download failed before scenario at login throttling; final browser rerun required."),
    24: (["packages/domain/governance.ts", "packages/domain/identity.ts", "packages/domain/commerce.ts", "apps/web/src/App.tsx"], ["governance.test.ts", "identity.test.ts", "commerce.test.ts", "engine.integration.test.ts"], "Versioned configs/delegation/backend finance denial executed; full admin UX/AI denial path not accepted by backend tests alone."),
    25: (["apps/web/src/App.tsx", "apps/web/src/style.css", "apps/mobile-ios/project.yml", "apps/mobile-android/app/build.gradle.kts"], [], "Historical browser 6 passed / 7 failed; native simulator/debug build passed. Current browser fixes and physical/release-signed mobile remain unverified."),
    26: (["packages/domain/governance.ts", "packages/domain/privacy-erasure.ts", "apps/api/privacy-erasure.ts", "infra/001_init.sql"], ["governance.test.ts", "engine.integration.test.ts", "gps-retention.test.ts"], "Historical privacy export/hold/GPS boundaries executed; new transactional CHAT/MEDIA erasure and in-flight retention need real current PG CI. External backups/processors are not erased by a live-source purge."),
    27: (["packages/domain/governance.ts", "docs/legal/LEGAL_CHECKLIST_DE.md", "docs/legal/EXTERNAL_LEGAL_PREREQUISITES.md"], ["governance.test.ts", "operations.test.ts"], "Software policy gates tested; company-specific legal advice/agreements/DPIA/tax/payroll/Betriebsrat approval not obtained."),
    28: (["apps/api/auth.ts", "apps/api/engine.ts", "infra/001_init.sql", "scripts/backup-db.mjs", "scripts/restore-db.mjs", "scripts/restore-drill.mjs"], ["identity.test.ts", "engine.integration.test.ts", "backup-target.test.ts", "worker-retention.test.ts"], "Historical actual isolated encrypted backup/restore passed; restore transport CPU fixtures are not real PG restore. New erasure-aware restore reconciliation awaits current run."),
    29: (["docs/API_CONTRACTS.md", "packages/shared/index.ts", "apps/api/engine.ts", "infra/001_init.sql"], ["engine.integration.test.ts", "commerce.test.ts", "operations.test.ts", "resources.test.ts"], "Historical typed commands/transaction/precision invariants executed; full canonical model and new handler contracts remain source reviewed, not all accepted."),
    30: (["docs/requirements/requirements.json", "docs/TEST_EVIDENCE.md", "tests/browser.spec.ts"], [], "475 source acceptance criteria are tracked separately from 439 implementation test assertions; nine narrowly scoped criteria closed here."),
    31: (["AGENTS.md", "PROJECT_MEMORY.md", "MASTER_ROADMAP.md", "docs/HANDOVER.md"], [], "Required project records exist; final SHA/deployment evidence and handover audit still pending."),
    32: ([".github/workflows/ci.yml", ".github/workflows/native.yml", "infra/compose.yml", "scripts/live-isolated-check.sh", "docs/BACKUP_RESTORE.md"], [], "Historical hosted CI/local isolated runtime and native artifacts verified; current final CI and public staging acceptance are independent."),
    33: (["docs/HANDOVER.md", "docs/TEST_EVIDENCE.md", "docs/EXTERNAL_PREREQUISITES.md"], [], "Final per-module handover cannot be declared complete from the historical run or allocated cloud domain."),
}

CANDIDATE = {
    "router": {"implementation_paths": ["packages/integrations/whatsapp-router.ts", "packages/integrations/whatsapp-router-text.ts", "apps/worker/runner.ts"], "test_paths": ["tests/whatsapp-router.test.ts"], "sections": [6, 7, 8, 10, 12, 15, 16, 19, 20, 22, 26], "scope": "Authorized manual role/menu routing, bound invitations, canonical command effects and durable policy-checked replies. Current source only; historical run predates router."},
    "calendar_atomic_catchup": {"implementation_paths": ["packages/domain/task-calendar.ts", "packages/domain/operations.ts", "apps/worker/runner.ts"], "test_paths": ["tests/task-calendar.test.ts", "tests/operations.test.ts:101", "tests/engine-preconditions.integration.test.ts"], "sections": [15, 20, 29], "scope": "Historical 27 pure planner assertions do not cover newly added actual Engine catchup/cursor transactions. New guards and worker wiring require current hosted CI."},
    "assistant_tool_bridge": {"implementation_paths": ["packages/integrations/assistant-tools.ts", "apps/api/assistant-runtime.ts", "packages/integrations/deepseek.ts"], "test_paths": ["tests/assistant-tools.test.ts:135", "tests/assistant-runtime.integration.test.ts", "tests/engine-preconditions.integration.test.ts"], "sections": [6, 9, 10, 11, 13, 24, 26, 29], "scope": "Bounded server tools, human confirmation and source-bound private cache. CPU provider doubles are not live DeepSeek, model quality or actual SQL/provider acceptance."},
    "privacy_erasure": {"implementation_paths": ["packages/domain/privacy-erasure.ts", "apps/api/privacy-erasure.ts", "packages/domain/governance.ts", "infra/001_init.sql"], "test_paths": ["tests/privacy-erasure.test.ts", "tests/privacy-erasure.integration.test.ts", "tests/worker-retention.test.ts"], "sections": [6, 8, 9, 21, 26, 27, 28, 29, 32], "scope": "Current CHAT/MEDIA source/derivative erasure, exact revision permits, in-flight quiescence and fresh retry preview; current real PG execution pending. 92 pure-core and 2 storage-fencing local CPU cases passed, 19 PG skipped locally. External processor/backups and physical S3 deletion are separate pending evidence."},
}

# Each closure was reviewed against the complete source criterion, not a test title.
PASSED = {
    "T-REQ-11-004": ("commerce.test.ts", ["T-SALES-04 calculates 6 person hours"], "Full synthetic integer-cent calculator example, including explicitly synthetic tax; no company tariff/legal profile implied."),
    "T-REQ-30-002": ("operations.test.ts", ["acceptance day preserves eight hours"], "Full source-defined synthetic chronology and separately approved paid-travel arithmetic; no real payroll policy implied."),
    "T-REQ-30-013": ("operations.test.ts", ["full geo-day retains five unexplained minutes"], "Full synthetic 8:00/6:55/0:30/0:30/0:05 arithmetic, 7:25 explicitly approved payability and preserved pending interval."),
    "T-REQ-30-017": ("resources.test.ts", ["T-STOCK-01 receipt -> ship"], "Full synthetic physical/transit/use/return ledger quantities and duplicate callback rejection; physical stock not audited."),
    "T-SALES-01": ("commerce.test.ts", ["T-SALES-01 exact acceptance"], "Canonical server-price/approved-version acceptance yields exactly one dispatch/order under replay, tested through domain handlers with in-memory transaction fixture."),
    "T-SALES-02": ("commerce.test.ts", ["T-SALES-02 rejects stale", "superseded button cannot accept"], "Expired/stale and superseded exact quote versions rejected before dispatch effects, through domain handler fixture."),
    "T-SALES-05": ("commerce.test.ts", ["T-SALES-05 fixed contract remains"], "Fixed 1200 remains unchanged by raw time/draft extras; separately approved and accepted120 addition produces1320 exactly once, in domain fixture."),
    "T-REPORT-03": ("resources.test.ts", ["T-REPORT-03 delivery, document receipt"], "Delivery, document receipt, hours confirmation and legal work acceptance remain distinct domain actions; no actual customer receipt claimed."),
    "T-OPS-02": (None, [], "Actual historical hosted-CI isolated empty-database encrypted restore passed with database/media reference and byte-checksum checks. Current erasure-aware restore changes and public infrastructure are not covered."),
}

NOTES = {
    "T-ENTRY-01": "Historical browser private guest fallback failed to render first persisted input; new consultation/lead tool bridge requires final CI and end-to-end lead isolation acceptance.",
    "T-ENTRY-02": "Language policy/domain guards exist; new actual WhatsApp router locale flow needs final CI and real channel exchange. Quoted-DE locale clause not closed by generic translation tests.",
    "T-ENTRY-03": "Source-only router processes actual inbound input; real provider click/no-message behavior not executed. No fabricated consent or inbound event inferred from link open.",
    "T-ENTRY-04": "Historical revoked/wrong-site portal and PG membership checks passed; new existing-customer WhatsApp site routing not part of that run.",
    "T-ENTRY-05": "Historical repeat lead START test is not verified employee work-menu routing; new router tests pending current CI.",
    "T-ENTRY-06": "Invitation expiry/one-use identity cases executed; full cross-channel transfer token/number binding scenario not executed.",
    "T-ENTRY-07": "Historical no-name/contact lead merge domain check is partial; authenticated web-to-WhatsApp continuation with same versus other real contact remains open.",
    "T-CHAT-01": "ACL/recipient translation cache tested; full DE-to-UK/PL/LT original+own-button rendered/provider workflow remains open.",
    "T-CHAT-02": "Task-thread inherited scope and reply contracts tested; full UK reply/context and foreman DE rendered/provider translation not executed.",
    "T-CHAT-03": "Historical domain/real PG internal-channel and customer ACL tests passed; whole externally reachable channel/UI/provider scenario not closed.",
    "T-CHAT-04": "Historical exact callback, read/search/media and fresh-membership guards passed; entire tampered callback across all real delivery surfaces remains partial.",
    "T-CHAT-05": "Historical versioned translation cache and corrected-original guards passed; concurrent translation spend through independent real workers/provider not verified by sequential fixture.",
    "T-CHAT-06": "New router bound flow/context tests are candidate-only; historical generic reply test cannot establish lost-context no-random-site full behavior.",
    "T-CHAT-07": "Historical strict24h/template/consent policy fixture passed; approved real Meta template and allowed fallback delivery not executed.",
    "T-CHAT-08": "Synthetic facts/negation/address guard executed; human evaluation of required DE/UK/PL/LT/EN/RU job phrasing and ambiguous floors remains open.",
    "T-CHAT-09": "Historical real PG disabled-AI worker reboot preserves original; SHIFT/inventory/payroll full UI paths under outage not jointly executed.",
    "T-CHAT-10": "Historical human-owner suppression and explicit return domain/provider-double guard passed; full concurrent operator-versus-AI production reply race not verified.",
    "T-SALES-03": "Historical delegated discount threshold and untrusted provider input guards passed; actual malicious90% conversation through new tool bridge pending final CI/live evaluation.",
    "T-SALES-04": "Exact calculator cents and real PDF/CSV/XLSX CPU artifacts passed separately; complete same quote UI/database/PDF equivalence not executed; arithmetic paragraph alone is closed.",
    "T-DISPATCH-01": "Sequential reservation conflict fixture passed; real PG concurrent stock/shift tests are different business commands, not two independent dispatcher reservation proof.",
    "T-DISPATCH-02": "Domain fixture holds customer promise without acknowledged crew/materials; full client alternative-offer delivery not verified.",
    "T-DISPATCH-03": "Canonical dispatch-to-task actual handler roundtrip passed in-memory; full needs/notifications exactly once and real DB retry side effects not jointly executed.",
    "T-DISPATCH-04": "Domain reschedule cancels old reminder/resets acknowledgment; matching schedule/portal/chat rendered and actual provider version not verified together.",
    "T-TASK-01": "Explicit-floor/tree/import guards passed; whole KNB-014 A/B/EG/3OG/5OG/apartment/outside navigation fixture not executed.",
    "T-TASK-02": "Three-task draft confirm replay domain case passed; new chat/AI tool bridge exact natural-language scenario needs final acceptance.",
    "T-TASK-03": "100m² once and21600 person-seconds passed; fixture has no parent/child aggregate and does not establish no duplication through all parents.",
    "T-TASK-04": "Submit/defect/rework dedupe and source worklog/task preservation passed; defect fixture lacks required photo/time/material complete evidence.",
    "T-TASK-05": "Duplicate defect fixture passed; no rework timesheet execution or full client contractual charging fixture, so complete criterion remains open.",
    "T-TASK-06": "Historical task breadcrumb rename and cycle rejection passed; no issued-report reparent snapshot fixture.",
    "T-TASK-07": "Historical 27 pure calendar tests and stable occurrence domain dedupe passed; title says accepted results but task fixture remains ASSIGNED. Accepted-result rewrite protection and new atomic catchup handlers not yet closed.",
    "T-TASK-08": "Historical media scope/client-sanitized copy checks passed; ambiguous general photo binding and all export/search leak paths not jointly executed.",
    "T-REPORT-01": "Historical snapshot/customer PG ACL excludes payroll/GPS and unsafe scope; full customer hours/worker codes/materials/photos/price rendered workflow requires final browser acceptance.",
    "T-REPORT-02": "Historical CPU CSV/XLSX/PDF source SHA and immutable versions passed; browser download scenario failed before execution at login429, complete web artifact equality pending.",
    "T-ADMIN-01": "Historical real PG BOT_ADMIN payroll denial passed; new actual AI server tool bridge denial path not covered by that historical execution.",
    "T-ADMIN-02": "Historical config/price preview/regression/version lifecycle and old policy checks passed; complete UI rollback/new AI runtime/old QuoteVersion combined scenario remains partial.",
    "T-OPS-01": "Historical real PG outbox lease/reboot and commit rollback/idempotency plus actual worker restart passed; Redis restart and duplicate payout/receipt acceptance not all executed in one real scenario.",
    "T-OPS-03": "Historical isolated runtime exact SHA stage passed; precise AI-health no-ENV-positive criterion not established by that stage alone. Current final runtime needs fresh SHA evidence.",
    "T-OPS-04": "Historical live isolated browser 6 passed / 7 failed; no public staging acceptance or physical GPS evidence. Current browser fixes/new workflows pending final run.",
}


def dump(path: Path, value: object) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def source_fingerprint(data: dict) -> str:
    values = [{k: r[k] for k in ("id", "module", "source_section", "source_lines", "acceptance_criterion", "acceptance_test_ids")} for r in data["requirements"]]
    values += [{k: t[k] for k in ("id", "expected", "source_lines", "source_section", "class")} for t in data["tests"]]
    return hashlib.sha256(json.dumps(values, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def build_index(unit_path: Path, live_path: Path) -> dict:
    raw = unit_path.read_bytes()
    unit = json.loads(raw)
    entries = []
    duplicate_names: Counter[tuple[str, str]] = Counter()
    for result in unit["testResults"]:
        file = "tests/" + Path(result["name"]).name
        for case in result["assertionResults"]:
            duplicate_names[(file, case["fullName"])] += 1
            occurrence = duplicate_names[(file, case["fullName"])]
            key = hashlib.sha256((file + "\n" + case["fullName"] + "\n" + str(occurrence)).encode()).hexdigest()[:16]
            ancestors = case["ancestorTitles"]
            entries.append({"id": "H942B-" + key, "test_path": file, "test_title": case["title"], "full_name": case["fullName"], "duplicate_name_occurrence": occurrence, "ancestor_titles": ancestors, "result": case["status"].upper(), "execution_class": "REAL_POSTGRES" if any(a in PG_GROUPS for a in ancestors) else "CPU_IN_MEMORY_DOCUMENT_OR_TRANSPORT_DOUBLE"})
    assert len(entries) == 439 and all(e["result"] == "PASSED" for e in entries)
    assert len({e["id"] for e in entries}) == 439
    assert Counter(e["execution_class"] for e in entries) == {"REAL_POSTGRES": 39, "CPU_IN_MEMORY_DOCUMENT_OR_TRANSPORT_DOUBLE": 400}
    live_raw = live_path.read_bytes()
    live = json.loads(live_raw)
    assert live["gitSha"] == SHA and live["status"] == "FAILED"
    return {"schema_version": 1, "scope": "IMMUTABLE_HISTORICAL_EXECUTION_ONLY", "source_git_sha": SHA, "github_event_merge_sha": "a097dd2a90e23db66ea9aaa97e33cd700c11e3d3", "run_url": RUN, "artifact": json.loads((ROOT / SUMMARY).read_text())["artifact"], "unit_result_sha256": hashlib.sha256(raw).hexdigest(), "live_receipt_sha256": hashlib.sha256(live_raw).hexdigest(), "counts": {"total": 439, "passed": 439, "failed": 0, "skipped": 0, "cpu_in_memory_document_or_transport_double": 400, "real_postgres": 39}, "assertions": entries, "live_receipt": live, "native_evidence_summary": NATIVE, "native_run_url": NATIVE_RUN, "limitations": ["Implementation assertions are not the 475 source acceptance criteria.", "Subsequent source changes are not covered by942b3b2.", "Historical overall browser/live result is FAILED;6 browser cases passed and7 failed.", "PostgreSQL assertions are genuine only for the39 explicitly named database-group cases.", "CPU restore subprocess fixtures mock PostgreSQL and are not actual restore executions.", "Native builds/synthetic classifiers are not physical GPS/battery/device acceptance.", "No public staging, real Meta/DeepSeek/S3/accounting/legal approval is inferred."]}


def inline(value: object) -> str:
    return str(value).replace("|", "\\|").replace("\n", "<br>")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--hosted-unit-json", type=Path)
    parser.add_argument("--hosted-live-json", type=Path)
    args = parser.parse_args()
    if args.hosted_unit_json or args.hosted_live_json:
        assert args.hosted_unit_json and args.hosted_live_json
        dump(OUT / "HISTORICAL_EXECUTION_INDEX.json", build_index(args.hosted_unit_json, args.hosted_live_json))
    index = json.loads((OUT / "HISTORICAL_EXECUTION_INDEX.json").read_text())
    data_path = OUT / "requirements.json"
    data = json.loads(data_path.read_text())
    original = source_fingerprint(data)
    assert len(data["requirements"]) == 432 and len(data["tests"]) == 475
    by_file: dict[str, list[dict]] = {}
    for assertion in index["assertions"]:
        by_file.setdefault(Path(assertion["test_path"]).name, []).append(assertion)

    def related_files(files: list[str]) -> list[dict]:
        return [{"test_path": "tests/" + file, "index_path": INDEX, "assertion_ids": [a["id"] for a in by_file[file]], "counts_by_execution_class": dict(Counter(a["execution_class"] for a in by_file[file])), "source_git_sha": SHA, "scope": "MODULE_RELATED_NAVIGATION_ONLY_NOT_WHOLE_CRITERION_ACCEPTANCE"} for file in files]

    for requirement in data["requirements"]:
        section = int(requirement["id"].split("-")[2])
        paths, files, limit = MODULES[section]
        requirement["implementation_paths"] = [p for p in paths if (ROOT / p).exists()]
        requirement["implementation_status"] = "SOURCE_MAPPED_CRITERION_ACCEPTANCE_PENDING"
        requirement["supporting_module_evidence"] = related_files(files)
        requirement["candidate_verification"] = [{"id": key, **{k: v for k, v in info.items() if k != "sections"}, "status": "PENDING_FINAL_CI", "code_sha": None} for key, info in CANDIDATE.items() if section in info["sections"]]
        requirement["readiness_limit"] = limit
        requirement["coverage_status"] = "NOT_RUN"
        requirement["status"] = "NOT_RUN"

    for test in data["tests"]:
        test["status"] = "NOT_RUN"
        test["code_sha"] = None
        test["environment"] = None
        test["coverage_status"] = "NOT_RUN"
        # Preserve earlier concrete evidence as historical supplementary records.
        test["evidence"] = [e for e in test.get("evidence", []) if not isinstance(e, dict) or e.get("audit") != "2026-10-06-hosted942b"]
        if not test["id"].startswith("T-REQ-"):
            test["coverage_status"] = "PARTIAL" if test["id"] not in {"T-ENTRY-02", "T-ENTRY-03", "T-ENTRY-05", "T-ENTRY-06", "T-ENTRY-07", "T-CHAT-02", "T-CHAT-06", "T-TASK-01"} else "NOT_RUN"
            test["acceptance_limit"] = NOTES.get(test["id"], PASSED.get(test["id"], (None, [], ""))[2])
            test["evidence"].append({"audit": "2026-10-06-hosted942b", "type": "SCOPED_REVIEW", "historical_summary": SUMMARY, "historical_index": INDEX, "source_git_sha": SHA, "status": "PARTIAL" if test["coverage_status"] == "PARTIAL" else "NOT_RUN", "scope": test["acceptance_limit"]})
            categories = {"ENTRY": [6, 10], "CHAT": [7, 8], "SALES": [9, 11], "DISPATCH": [12], "TASK": [14, 15, 21], "REPORT": [13, 23], "ADMIN": [5, 9, 24], "OPS": [28, 32]}[test["id"].split("-")[1]]
            test["implementation_test_pointers"] = sorted({"tests/" + file for s in categories for file in MODULES[s][1]})
            test["candidate_test_pointers"] = sorted({p for info in CANDIDATE.values() if set(categories) & set(info["sections"]) for p in info["test_paths"]})
        if test["id"] in PASSED:
            file, prefixes, scope = PASSED[test["id"]]
            matches = [a for a in by_file.get(file, []) if any(prefix in a["test_title"] for prefix in prefixes)]
            if file:
                assert len(matches) == len(prefixes), (test["id"], matches)
                assert all(a["execution_class"] == "CPU_IN_MEMORY_DOCUMENT_OR_TRANSPORT_DOUBLE" for a in matches)
            else:
                assert any(s["stage"] == "empty-database-private-blob-restore" and s["status"] == "PASSED" for s in index["live_receipt"]["stages"])
            evidence = {"audit": "2026-10-06-hosted942b", "type": "WHOLE_CRITERION_EXECUTION", "index_path": INDEX, "assertion_ids": [a["id"] for a in matches], "run_url": RUN, "source_git_sha": SHA, "status": "PASSED", "scope": scope, "environment": "HOSTED_CI_CPU_DOMAIN_FIXTURE" if file else "HOSTED_CI_ACTUAL_ISOLATED_POSTGRES_ENCRYPTED_EMPTY_DB_RESTORE"}
            if not file:
                evidence["stage_names"] = ["encrypted-delivery-backup", "backup-tamper-rejection", "empty-database-private-blob-restore"]
            test["evidence"].append(evidence)
            test["status"] = "PASSED"
            test["coverage_status"] = "WHOLE_CRITERION_HISTORICAL_SOURCE_ONLY"
            test["acceptance_scope"] = "HISTORICAL_SOURCE_ONLY"
            test["acceptance_limit"] = scope
            test["code_sha"] = SHA
            test["environment"] = evidence["environment"]
            for requirement in data["requirements"]:
                if requirement["acceptance_test_ids"][0] == test["id"]:
                    requirement["status"] = "PASSED"
                    requirement["coverage_status"] = test["coverage_status"]
                    requirement["evidence"] = [evidence]
                    requirement["implementation_status"] = "NARROW_SYNTHETIC_CRITERION_EXECUTED_HISTORICAL_SOURCE_ONLY"

    data["verification_note"] = "Source acceptance and implementation assertions are distinct. Nine whole narrow criteria passed only for 942b3b2; compound requirements remain NOT_RUN, with explicitly scoped PARTIAL evidence where reviewed. Candidate router/assistant/calendar/CHAT-MEDIA erasure source pointers are PENDING_FINAL_CI; local CPU and skipped PG are not provider/database proof."
    data["evidence_audit"] = {"date": "2026-10-06", "source_content_fingerprint_sha256": original, "historical_source_git_sha": SHA, "historical_run_url": RUN, "historical_execution_index": INDEX, "native_summary": NATIVE, "source_requirement_status_counts": dict(Counter(r["status"] for r in data["requirements"])), "source_acceptance_status_counts": dict(Counter(t["status"] for t in data["tests"])), "current_candidate_status": "FINAL_CI_PENDING", "public_staging_status": "NOT_RUN_IN_THIS_AUDIT", "full_product_acceptance_status": "NOT_RUN"}
    data["additional_verification"] = {"status": "HISTORICAL_EXECUTION_SCOPED_CURRENT_ACCEPTANCE_PENDING", "evidence": SUMMARY, "details": "942b3b2: 439 implementation assertions passed (400 CPU/memory/document and 39 genuine PG), browser 6 passed / 7 failed, isolated encrypted restore/runtime/worker stages passed; native historical simulator4 XCTest and 16 host-JVM cases passed. No475-of475 claim; current source/privacy migration/browser/router/tool changes await final CI. Earlier 367 CPU / 37 PG-skipped evidence remains supplemental historical only."}
    for path in [SUMMARY, NATIVE, INDEX]:
        if path not in data["supplemental_evidence"]:
            data["supplemental_evidence"].append(path)
    assert source_fingerprint(data) == original
    assert sum(t["status"] == "PASSED" for t in data["tests"]) == 9
    assert sum(r["status"] == "PASSED" for r in data["requirements"]) == 4
    assert len({t["id"] for t in data["tests"]}) == 475
    for requirement in data["requirements"]:
        for path in requirement["implementation_paths"]:
            assert (ROOT / path).exists(), path
    for info in CANDIDATE.values():
        for path in info["implementation_paths"] + info["test_paths"]:
            assert (ROOT / path.split(":")[0]).exists(), path
    dump(data_path, data)
    header = "# Source-complete requirements traceability\n\nCanonical source: `KNABA_DE_MASTER_SPEC.md`, SHA256 `" + data["source_sha256"] + "`. All 432 requirement paragraphs and 475 acceptance IDs/text remain preserved.\n\n`PASSED` means a reviewed whole narrow criterion executed on the exact historical 942b3b2 source, with scope below. `NOT_RUN` remains the acceptance status for compound or unexecuted criteria; `PARTIAL` describes supporting coverage and does not close acceptance. Related module test files are navigation only. Current router/calendar/assistant/privacy additions await final CI. Historical browser result was 6 PASS / 7 FAIL; no public staging or physical/provider/legal acceptance is claimed.\n\nSee [evidence scope audit](EVIDENCE_SCOPE_AUDIT.md), [historical assertion index](HISTORICAL_EXECUTION_INDEX.json) and [all 475 acceptance criteria](ACCEPTANCE_TEST_CATALOG.md).\n\n"
    matrix = [header, "| Requirement | Module / source | Source acceptance IDs | Complete source criterion | Acceptance status / coverage | Implementation / candidate tests |\n|---|---|---|---|---|---|\n"]
    for r in data["requirements"]:
        pointers = r["implementation_paths"] + [p for c in r["candidate_verification"] for p in c["test_paths"]]
        row = [r["id"], r["module"] + "; source lines " + str(r["source_lines"]), ", ".join(r["acceptance_test_ids"]), r["acceptance_criterion"], r["status"] + " / " + r["coverage_status"], "; ".join(dict.fromkeys(pointers))]
        matrix.append("| " + " | ".join(inline(v) for v in row) + " |\n")
    (OUT / "REQUIREMENTS_TRACEABILITY.md").write_text("".join(matrix))
    catalog = ["# Complete source acceptance catalog\n\nAll 475 source tests:432 paragraph criteria plus43 explicitly named source scenarios. Implementation test counts do not replace this catalog. Only nine narrow whole criteria are PASSED, scoped to historical source 942b3b2; all other acceptance statuses remain NOT_RUN. Partial proofs and candidate pointers remain review evidence. The historical overall live/browser run FAILED.\n\n| Test | Source lines | Complete expected criterion | Acceptance / coverage | Evidence limit |\n|---|---|---|---|---|\n"]
    for t in data["tests"]:
        row = [t["id"], t["source_lines"], t["expected"], t["status"] + " / " + t["coverage_status"], t.get("acceptance_limit", "No whole-criterion execution established. See related module/source pointers in requirements.json; these do not count as a pass.")]
        catalog.append("| " + " | ".join(inline(v) for v in row) + " |\n")
    (OUT / "ACCEPTANCE_TEST_CATALOG.md").write_text("".join(catalog))
    audit = ["# Evidence scope and remaining acceptance\n\nThis audit preserves 432 requirements and 475 source acceptance tests. It records 4 PASSED paragraph criteria and 5 PASSED named scenarios for exact historical source `" + SHA + "`; 428 requirements and 466 acceptance tests remain NOT_RUN. A source PASSED row is not current-product acceptance.\n\n[Hosted CI37525960411](" + RUN + ") executed 439 implementation assertions: 400 CPU/in-memory/document/transport-double cases and 39 real PostgreSQL cases. All 439 passed. Actual rendered browser result was 6 passed / 7 failed, so the overall isolated live run FAILED. Browser discovery/listing files are not runtime evidence. The uploaded artifact is independently hash-verified, with PR merge SHA in its name but actual source 942b3b2 in runtime/stages.\n\n[Native CI37525960129](" + NATIVE_RUN + ") built Android debug APK and iOS unsigned simulator bundle, executing 16 host-JVM classifier cases and 4 simulator XCTest cases. Artifact/payload checksums were independently verified. Physical permissions/background/GPS/battery/offline/release signing/App Store acceptance is NOT_RUN.\n\nThe actual historical encrypted empty-database restore stage is evidence for narrow T-OPS-02. The mocked PostgreSQL subprocess transport tests in worker-retention.test.ts are CPU tests and cannot be substituted for that real restore. New erasure-aware migration/reconciliation behavior requires a subsequent actual restore run.\n\n## Narrow completed criteria\n\n| Source test | Environment | Scope |\n|---|---|---|\n"]
    for tid, (_, _, scope) in PASSED.items():
        test = next(t for t in data["tests"] if t["id"] == tid)
        audit.append("| " + " | ".join(inline(v) for v in [tid, test["environment"], scope]) + " |\n")
    audit.append("\n## Module readiness limits\n\nThis table describes available evidence, not a production-ready label. Source acceptance status remains open unless a narrow closure above applies.\n\n| Module | Historical implementation tests | Remaining acceptance limit |\n|---|---|---|\n")
    for section, (_, files, limit) in MODULES.items():
        module = next(r["module"] for r in data["requirements"] if int(r["id"].split("-")[2]) == section)
        audit.append("| " + " | ".join(inline(v) for v in [module, ", ".join(files) or "Document/source pointers; runtime acceptance separate", limit]) + " |\n")
    audit.append("\n## Candidate changes awaiting final CI\n\n| Area | Current test pointers | What remains unverified |\n|---|---|---|\n")
    for key, info in CANDIDATE.items():
        audit.append("| " + " | ".join(inline(v) for v in [key, "; ".join(info["test_paths"]), info["scope"]]) + " |\n")
    audit.append("\n## Updating this audit\n\n`build_traceability.py` regenerates only the original NOT_RUN baseline; it must not overwrite an evidence-enriched matrix. Run `python docs/requirements/update_evidence_traceability.py` to reproduce these audited attachments and renderings using the checked-in historical index. To independently reconstruct that index from the verified historical artifact, pass `--hosted-unit-json PATH --hosted-live-json PATH`. The updater checks all 432/475 IDs and original source criteria fingerprints before and after enrichment.\n\nA later CI source SHA needs a separately reviewed evidence mapping. Do not change this historical run's SHA/counts, reuse its passes for changed handlers, or mark external processor/backups deletion, legal approval, bank payouts or physical native checks complete from synthetic/local tests. Root-owned TEST_EVIDENCE.md, roadmap and handover carry later deployment evidence.\n")
    (OUT / "EVIDENCE_SCOPE_AUDIT.md").write_text("".join(audit))
    print(json.dumps(data["evidence_audit"], indent=2))


if __name__ == "__main__":
    main()
