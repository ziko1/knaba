#!/usr/bin/env python3
"""Reproduce the reviewed 3c85 release evidence without changing source criteria.

The earlier 942b audit/index remains an independent historical receipt. This
updater first reproduces that baseline, then adds exact-source 3c85 evidence.
Later working-tree additions are explicitly pending their own execution.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from collections import Counter
from pathlib import Path

import update_evidence_traceability as old

ROOT, OUT = old.ROOT, old.OUT
SHA = "3c85adc228ddd5c6078e7bbc05e4d5570625c978"
RUN = "https://github.com/ziko1/knaba/actions/runs/37529346179"
SUMMARY = "docs/evidence/ci-run-37529346179-summary.json"
NATIVE = "docs/evidence/native-run-37529346218-summary.json"
INDEX = "docs/requirements/EXECUTION_INDEX_3C85ADC.json"
AUDIT = "2026-10-06-hosted3c85"
PG_GROUPS = old.PG_GROUPS | {
    "assistant runtime: PostgreSQL/Engine/worker/controller with explicitly mocked external AI",
    "PostgreSQL claimed WhatsApp authority and bounded company serialization",
    "transactional bounded privacy erasure (real PostgreSQL)",
}
CPU = "CPU_IN_MEMORY_DOCUMENT_OR_TRANSPORT_DOUBLE"

LIMITS = {
    4: "94 genuine PostgreSQL assertions passed on exact 3c85; subsequent handlers/migrations require a new run.",
    6: "48 router CPU assertions and 30 genuine assistant-runtime PG cases passed on 3c85. Meta/DeepSeek I/O is mocked; new operator inbox/claim changes await final CI.",
    8: "ACL/cache/original/fact guards executed on 3c85; multilingual human evaluation and real channel delivery remain open. New operator claim path awaits CI.",
    9: "82 assistant-tool CPU cases plus 30 actual runtime PG cases passed on 3c85 with mocked AI. New internal assistant, playground and category budgets await final CI; real model quality remains open.",
    10: "Actual guest draft/current-human-confirmation and persisted lead guards executed on PG with mocked AI. New discoverable operator claim/reclaim is FINAL_CI_PENDING.",
    13: "Customer ACL and report download browser scenario passed on 3c85; client issue-photo scenario failed. Full source portal criterion remains partial.",
    15: "37 operations CPU cases include actual Engine catchup/cursor transactions with in-memory SQL transport. T-TASK-07 accepted historical task protection is complete in that harness; parent aggregation, full defect evidence and rework payroll criteria remain partial.",
    16: "Chronology/payability synthetic examples and persisted browser shift lifecycle passed. New ArbZG advisory is FINAL_CI_PENDING; company legal policy and physical tracking remain external acceptance.",
    17: "10 actual PG GPS cases and 16 JVM/4 simulator classifier cases passed on exact 3c85. New scoped map/travel UI awaits CI; physical permissions/background/battery/offline/signing and legal activation remain open.",
    18: "Actual CPU snapshot/export artifacts and narrow browser download passed on 3c85; complete analytical totals/role UI acceptance remains partial.",
    19: "Full synthetic stock criterion, actual PG concurrency and manual SKU browser lookup passed. Physical barcode/procurement and complete stock workflow remain separate.",
    21: "Actual browser private-photo bytes/context/download passed; new client issue-photo browser scenario failed. S3/scanner integrations use explicit doubles or local storage; physical provider operation unverified.",
    23: "Actual CPU PDF/CSV/XLSX reader checks and browser download passed. Browser checks PDF/ZIP headers and CSV total/source SHA, not full web/PDF/XLSX content equality; T-REPORT-02 remains PARTIAL.",
    25: "3c85 rendered browser 11 PASS / 3 FAIL: task/import 360px overflow and client photo selection. Native unsigned/debug synthetic builds passed; new UI/PWA fixes await final CI and physical release acceptance remains open.",
    26: "19 genuine PG transactional CHAT/MEDIA erasure cases plus 92 core and 2 storage-fencing CPU cases passed on 3c85. In-flight/held data remains retained with fresh retry required; external backup/processor/S3 deletion is not certified by mocked I/O.",
    28: "Actual isolated encrypted empty-DB restore passed for 17 table counts and 7 blob checksums; tamper rejection and real bundled-worker restart passed. This restore had no privacy history, so later-erasure replay/reconciliation is not proven.",
    29: "Typed handlers and actual PG transactions passed on exact 3c85; whole source model and subsequent handoff/governance/internal-assistant/map contracts still require independent acceptance.",
    30: "475 source acceptance criteria remain distinct from 802 assertions. Ten narrowly reviewed whole criteria passed only on exact historical 3c85; full-product acceptance remains open.",
    32: "Exact 3c85 hosted CI/runtime and independently verified artifacts exist; overall run FAILED three browser cases. Public staging/current final candidate require separate live evidence.",
}

PENDING = {
    "operator_handoff": ([6, 8, 10, 25, 26], ["packages/domain/communications.ts", "apps/api/http.ts", "apps/api/engine.ts", "apps/web/src/OperatorInbox.tsx"], ["tests/communications.test.ts", "tests/handoff.integration.test.ts"], "New private pending-inbox discovery, expected-version atomic operator claim, business-bound history, AI-resume membership revocation and repeat claim. Local CPU is not execution of the 13 new genuine-PG fixtures."),
    "pwa_and_browser_fixes": ([14, 21, 25, 32], ["apps/web/src/App.tsx", "apps/web/src/style.css"], ["tests/browser.spec.ts"], "Fixes after 3c85 for task/import narrow-screen overflow, client issue photo context, PWA and reviewed guest UI require new rendered-browser execution."),
    "working_time_advisory": ([16, 27], ["packages/domain/working-time-advisory.ts", "packages/domain/operations.ts"], ["tests/working-time-advisory.test.ts", "tests/operations.test.ts"], "New bounded chronology/break/rest/average advisory awaits final CI; always REQUIRES_LEGAL_REVIEW, no legal certification or changes to raw GPS/pay."),
    "category_ai_budgets": ([9, 24, 26], ["packages/domain/commerce.ts", "packages/integrations/deepseek.ts"], ["tests/assistant-governance.test.ts", "tests/assistant-governance.integration.test.ts"], "New category-specific reservations/limits/current policy and owner usage controls are SOURCE_PENDING/FINAL_CI_PENDING."),
    "assistant_playground": ([9, 24, 26], ["packages/integrations/assistant-playground.ts"], ["tests/assistant-governance.test.ts", "tests/assistant-governance.integration.test.ts"], "New side-effect-free draft-config playground, current authorizations and audit/budget boundaries await final CI; no provider-quality proof inferred."),
    "internal_assistant_drafts": ([8, 9, 15, 18, 19, 26], ["packages/integrations/internal-assistant.ts", "packages/integrations/internal-assistant-provider.ts", "apps/api/internal-assistant.ts"], ["tests/assistant-governance.test.ts", "tests/assistant-governance.integration.test.ts"], "New internal task/report/material drafts and current human confirmation are source pointers awaiting final execution; 3c85 customer-only tools do not cover them."),
    "scoped_map_and_travel": ([7, 17, 25, 26], ["packages/integrations/maps.ts", "apps/web/src/routeMapModel.ts", "apps/web/src/RouteMapView.tsx"], ["tests/route-map-model.test.ts"], "New scoped address/circle/pending-travel map and secure authenticated link await final CI. Map-source/provider/legal/physical GPS acceptance remains separate."),
}

NOTES = {
    "T-ENTRY-01": "3c85 actual PG guest draft/lead confirmation and private browser fallback passed; the browser draft-confirmation case mocks HTTP. Full combined DE consultation/widget/lead isolation criterion remains PARTIAL; new handoff UI awaits CI.",
    "T-ENTRY-02": "3c85 router locale/menu tests executed with synthetic host/transport. Full quoted-DE and real WhatsApp locale exchange is unexecuted.",
    "T-ENTRY-03": "No fabricated consent/inbound from link open is a source invariant; no whole browser-to-live-WhatsApp no-message scenario executed.",
    "T-ENTRY-04": "Current-role/site/tenant PG checks and router context tests passed separately. Whole existing-customer WhatsApp site-routing exchange remains PARTIAL.",
    "T-ENTRY-05": "3c85 router verified-staff menu/repeat routing passed with a synthetic host. Full actual persisted employee identification through official WhatsApp is not accepted.",
    "T-ENTRY-06": "3c85 bound invitation/expiry/cancel/current-identity guards executed. Full cross-channel transfer token binding/reuse/other-number flow remains PARTIAL.",
    "T-ENTRY-07": "Lead contact/name merge denial and actual PG confirmation passed; same-versus-other contact web-to-WhatsApp continuation is not a whole executed scenario.",
    "T-CHAT-02": "Scoped task reply/translation handlers executed; full UK reply and foreman DE rendered/provider exchange remains unexecuted.",
    "T-CHAT-06": "3c85 router lost-context/explicit target guard passed with host double. Complete real delivery surface wrong-site context flow remains PARTIAL.",
    "T-CHAT-09": "Actual PG disabled integrations/restart and browser shift/manual SKU paths passed separately; complete payroll/UI lifecycle under provider outage is not jointly executed.",
    "T-CHAT-10": "Actual PG AI handoff/provider-prepublication race guards passed on 3c85 with mocked AI. Discoverable concurrent operator claim/reply/resume/reclaim was added later and awaits final CI.",
    "T-SALES-03": "3c85 actual PG tool malicious-money/current-policy denials executed with mocked AI; complete malicious 90% conversation/model evaluation remains PARTIAL.",
    "T-TASK-02": "Three-task human-confirmation domain case passed; new internal natural-language draft tool is after 3c85 and FINAL_CI_PENDING.",
    "T-REPORT-01": "Actual PG sanitized customer ACL and browser report-download scenario passed. Required full worker-code/hour/material/photo/price rendering is not exhaustively verified.",
    "T-REPORT-02": LIMITS[23],
    "T-ADMIN-01": "Actual PG BOT_ADMIN payroll denial and server-tool authority limits passed on 3c85. Complete combined administrator-to-AI payroll prompt remains PARTIAL; new governance tools await CI.",
    "T-ADMIN-02": "Config/version/current-source guards and old-price quote fixtures passed. New playground/budgets/rollback UI require final CI; combined full scenario remains PARTIAL.",
    "T-OPS-01": "Actual PG lease/idempotency/rollback and bundled worker restart passed. Redis restart and duplicate real payout/receipt acceptance are not all executed as the full criterion.",
    "T-OPS-03": "Exact /version bundled-runtime stage passed on 3c85. The full AI-health no-ENV-positive clause is not established by that stage; criterion remains PARTIAL.",
    "T-OPS-04": "3c85 isolated browser 11 PASS / 3 FAIL, overall FAILED. No public staging or physical GPS acceptance; all later source/UI fixes await final CI.",
}


def build_index(unit_path: Path, live_path: Path, browser_path: Path) -> dict:
    raw, live_raw, browser_raw = unit_path.read_bytes(), live_path.read_bytes(), browser_path.read_bytes()
    unit, live, browser = json.loads(raw), json.loads(live_raw), json.loads(browser_raw)
    entries, names = [], Counter()
    for result in unit["testResults"]:
        file = "tests/" + Path(result["name"]).name
        for case in result["assertionResults"]:
            names[(file, case["fullName"])] += 1
            occurrence = names[(file, case["fullName"])]
            key = hashlib.sha256((file + "\n" + case["fullName"] + "\n" + str(occurrence)).encode()).hexdigest()[:16]
            entries.append({"id": "R3C85-" + key, "test_path": file, "test_title": case["title"], "full_name": case["fullName"], "duplicate_name_occurrence": occurrence, "ancestor_titles": case["ancestorTitles"], "result": case["status"].upper(), "execution_class": "REAL_POSTGRES" if any(a in PG_GROUPS for a in case["ancestorTitles"]) else CPU})
    assert len(entries) == len({e["id"] for e in entries}) == 802
    assert all(e["result"] == "PASSED" for e in entries)
    assert Counter(e["execution_class"] for e in entries) == {CPU: 708, "REAL_POSTGRES": 94}
    assert live["gitSha"] == SHA and live["status"] == "FAILED"
    def specs(suite: dict):
        for child in suite.get("suites", []):
            yield from specs(child)
        for spec in suite.get("specs", []):
            yield {"test_path": "tests/" + Path(spec["file"]).name, "title": spec["title"], "result": "PASSED" if spec["ok"] else "FAILED", "scope": "EXPLICIT_HTTP_TRANSPORT_FIXTURE_NOT_SERVER_LEAD_PROOF" if spec["title"].startswith("transport fixture:") else "ACTUAL_RENDERED_ISOLATED_BROWSER"}
    browser_cases = list(specs(browser))
    assert Counter(c["result"] for c in browser_cases) == {"PASSED": 11, "FAILED": 3}
    return {"schema_version": 1, "scope": "IMMUTABLE_EXACT_SOURCE_EXECUTION_ONLY", "source_git_sha": SHA, "run_url": RUN, "summary_path": SUMMARY, "unit_result_sha256": hashlib.sha256(raw).hexdigest(), "live_receipt_sha256": hashlib.sha256(live_raw).hexdigest(), "browser_result_sha256": hashlib.sha256(browser_raw).hexdigest(), "counts": {"total": 802, "passed": 802, "failed": 0, "skipped": 0, "cpu_in_memory_document_or_transport_double": 708, "real_postgres": 94}, "assertions": entries, "browser_assertions": browser_cases, "live_receipt": live, "verified_artifact": json.loads((ROOT / SUMMARY).read_text())["artifact"], "native_evidence_summary": NATIVE, "limitations": ["802 implementation assertions are separate from the 475 source acceptance criteria.", "Overall isolated release status is FAILED: three actual browser cases failed.", "AI and S3 provider I/O is explicitly mocked; genuine PG refers to the database/runtime, not real providers.", "Restore executed 17 tables/7 blobs in synthetic isolated storage without privacy history; no later-erasure replay proof.", "Subsequent source changes are FINAL_CI_PENDING and do not inherit this source's passes.", "Native JVM/simulator/debug artifacts do not prove physical GPS/background/battery/offline/release signing.", "No public staging, official Meta session, DeepSeek quality, live S3, bank payment or company legal approval is inferred."]}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--hosted-unit-json", type=Path)
    parser.add_argument("--hosted-live-json", type=Path)
    parser.add_argument("--hosted-browser-json", type=Path)
    args = parser.parse_args()
    if any((args.hosted_unit_json, args.hosted_live_json, args.hosted_browser_json)):
        assert all((args.hosted_unit_json, args.hosted_live_json, args.hosted_browser_json))
        old.dump(OUT / Path(INDEX).name, build_index(args.hosted_unit_json, args.hosted_live_json, args.hosted_browser_json))
    saved_argv = sys.argv
    try:
        sys.argv = [str(OUT / "update_evidence_traceability.py")]
        old.main()
    finally:
        sys.argv = saved_argv
    data = json.loads((OUT / "requirements.json").read_text())
    fingerprint = old.source_fingerprint(data)
    index = json.loads((ROOT / INDEX).read_text())
    assert index["source_git_sha"] == SHA
    by_file: dict[str, list[dict]] = {}
    for case in index["assertions"]:
        by_file.setdefault(Path(case["test_path"]).name, []).append(case)
    for requirement in data["requirements"]:
        section = int(requirement["id"].split("-")[2])
        files = list(old.MODULES[section][1])
        for candidate in old.CANDIDATE.values():
            if section in candidate["sections"]:
                files += [Path(p.split(":")[0]).name for p in candidate["test_paths"]]
        requirement["supporting_release_module_evidence"] = [{"test_path": "tests/" + file, "index_path": INDEX, "assertion_ids": [a["id"] for a in by_file[file]], "counts_by_execution_class": dict(Counter(a["execution_class"] for a in by_file[file])), "source_git_sha": SHA, "scope": "MODULE_RELATED_NAVIGATION_ONLY_NOT_WHOLE_CRITERION_ACCEPTANCE"} for file in dict.fromkeys(files) if file in by_file]
        requirement["readiness_limit"] = LIMITS.get(section, old.MODULES[section][2])
        requirement["candidate_verification"] = [{**c, "status": "EXACT_3C85_SCOPED_EXECUTION_ONLY", "code_sha": SHA, "evidence_index": INDEX, "scope": "Executed related assertions on exact 3c85; navigation only. Real DB classification is per assertion, provider I/O mocked; whole source criterion remains separately assessed."} for c in requirement["candidate_verification"]]
        for key, (sections, paths, tests, scope) in PENDING.items():
            if section in sections:
                requirement["candidate_verification"].append({"id": key, "status": "FINAL_CI_PENDING", "code_sha": None, "implementation_paths": paths, "test_paths": tests, "scope": scope})
    passed = dict(old.PASSED)
    passed["T-TASK-07"] = ("operations.test.ts", ["T-TASK-07 catchup commits capped", "template edits preserve accepted historical task"], "Whole synthetic repeat-occurrence/accepted-result criterion: actual Engine generation replay/current ticks dedupe; accepted historical task and occurrence snapshots remain unchanged after template edit. In-memory SQL transport, not a PostgreSQL catchup execution.")
    passed["T-OPS-02"] = (None, [], "Actual exact-3c85 hosted isolated encrypted empty-database/private-blob restore: all 17 table counts and 7 blob checksums, tamper rejection and bundled-worker restart PASS. Synthetic local storage without privacy history; no cloud or later-erasure replay acceptance.")
    for test in data["tests"]:
        test["evidence"] = [e for e in test.get("evidence", []) if not isinstance(e, dict) or e.get("audit") != AUDIT]
        if not test["id"].startswith("T-REQ-"):
            test["acceptance_limit"] = NOTES.get(test["id"], old.NOTES.get(test["id"], ""))
            if test["id"] in {"T-ENTRY-02", "T-ENTRY-05", "T-ENTRY-06", "T-ENTRY-07", "T-CHAT-06", "T-TASK-01"}:
                test["coverage_status"] = "PARTIAL"
            test["evidence"].append({"audit": AUDIT, "type": "SCOPED_REVIEW", "source_git_sha": SHA, "index_path": INDEX, "summary_path": SUMMARY, "status": test["coverage_status"], "scope": test["acceptance_limit"]})
            categories = {"ENTRY": [6, 10], "CHAT": [7, 8], "SALES": [9, 11], "DISPATCH": [12], "TASK": [14, 15, 21], "REPORT": [13, 23], "ADMIN": [5, 9, 24], "OPS": [28, 32]}[test["id"].split("-")[1]]
            test["candidate_test_pointers"] = sorted({p for sections, _, pointers, _ in PENDING.values() if set(categories) & set(sections) for p in pointers})
        if test["id"] not in passed:
            continue
        file, prefixes, scope = passed[test["id"]]
        matches = [a for a in by_file.get(file, []) if any(prefix in a["test_title"] for prefix in prefixes)]
        assert not file or len(matches) == len(prefixes), (test["id"], matches)
        if not file:
            assert all(any(s["stage"] == name and s["status"] == "PASSED" for s in index["live_receipt"]["stages"]) for name in ["encrypted-delivery-backup", "backup-tamper-rejection", "empty-database-private-blob-restore"])
        evidence = {"audit": AUDIT, "type": "WHOLE_CRITERION_EXECUTION", "source_git_sha": SHA, "index_path": INDEX, "assertion_ids": [a["id"] for a in matches], "run_url": RUN, "summary_path": SUMMARY, "status": "PASSED", "scope": scope, "environment": "HOSTED_CI_CPU_DOMAIN_OR_ENGINE_IN_MEMORY_SQL_FIXTURE" if file else "HOSTED_CI_ACTUAL_ISOLATED_POSTGRES_ENCRYPTED_EMPTY_DB_RESTORE"}
        test.update(status="PASSED", coverage_status="WHOLE_CRITERION_EXACT_3C85_SOURCE_ONLY", acceptance_scope="HISTORICAL_EXACT_SOURCE_ONLY", acceptance_limit=scope, code_sha=SHA, environment=evidence["environment"])
        test["evidence"].append(evidence)
        for requirement in data["requirements"]:
            if requirement["acceptance_test_ids"][0] == test["id"]:
                requirement.update(status="PASSED", coverage_status=test["coverage_status"], implementation_status="NARROW_SYNTHETIC_CRITERION_EXECUTED_EXACT_3C85_SOURCE_ONLY")
                requirement["evidence"] = [e for e in requirement.get("evidence", []) if not isinstance(e, dict) or e.get("audit") != AUDIT] + [evidence]
    assert old.source_fingerprint(data) == fingerprint == "103018905e9ee8b3341b19b3f6587557c6ea2d7e4f9e9b93f87c7f3857bcd44c"
    assert len(data["requirements"]) == 432 and len(data["tests"]) == 475
    assert Counter(t["status"] for t in data["tests"]) == {"PASSED": 10, "NOT_RUN": 465}
    assert Counter(r["status"] for r in data["requirements"]) == {"PASSED": 4, "NOT_RUN": 428}
    for sections, paths, pointers, scope in PENDING.values():
        assert all((ROOT / p).exists() for p in paths + pointers), (paths, pointers)
    data["verification_note"] = "Exact 3c85:802/802 implementation assertions passed (708 CPU/94 genuine PG; no skips), browser 11/14 passed / 3 failed. Ten narrow whole source criteria passed on that exact source only; all compound/unexecuted criteria remain NOT_RUN with reviewed PARTIAL coverage. Later operator/PWA/ArbZG/category-budget/playground/internal-draft/map source is FINAL_CI_PENDING. No provider/physical/legal/public staging acceptance inferred."
    data["evidence_audit"].update(latest_reviewed_source_git_sha=SHA, latest_run_url=RUN, latest_execution_index=INDEX, latest_summary=SUMMARY, native_summary=NATIVE, source_requirement_status_counts=dict(Counter(r["status"] for r in data["requirements"])), source_acceptance_status_counts=dict(Counter(t["status"] for t in data["tests"])), latest_reviewed_run_status="FAILED_BROWSER_3", current_candidate_status="FINAL_CI_PENDING")
    data["additional_verification"] = {"status": "EXACT_3C85_EXECUTION_SCOPED_LATER_SOURCE_PENDING", "evidence": SUMMARY, "details": data["verification_note"]}
    for path in [INDEX, SUMMARY, NATIVE]:
        if path not in data["supplemental_evidence"]:
            data["supplemental_evidence"].append(path)
    old.dump(OUT / "requirements.json", data)
    header = "# Source-complete requirements traceability\n\nAll 432 requirement paragraphs and 475 source acceptance IDs/text remain unchanged. Canonical source SHA256: `" + data["source_sha256"] + "`.\n\nTen narrowly reviewed whole criteria are PASSED only for exact historical `3c85adc228ddd5c6078e7bbc05e4d5570625c978`; compound/unexecuted acceptance remains NOT_RUN, even with PARTIAL supporting proof. CI 802/802 implementation assertions (708 CPU/94 genuine PG) are separate from 475 criteria. Browser11 PASS / 3 FAIL: overall run FAILED. New handoff/PWA/ArbZG/budget/playground/internal-draft/map source awaits final CI; no public/provider/physical/legal acceptance inferred.\n\nSee [evidence audit](EVIDENCE_SCOPE_AUDIT.md), [3c85 assertion index](EXECUTION_INDEX_3C85ADC.json), [earlier 942b index](HISTORICAL_EXECUTION_INDEX.json), and [all475 acceptance criteria](ACCEPTANCE_TEST_CATALOG.md).\n\n"
    matrix = [header, "| Requirement | Module / source | Source acceptance IDs | Complete source criterion | Acceptance status / coverage | Implementation / candidate tests |\n|---|---|---|---|---|---|\n"]
    for r in data["requirements"]:
        pointers = r["implementation_paths"] + [p for c in r["candidate_verification"] for p in c["test_paths"]]
        matrix.append("| " + " | ".join(old.inline(v) for v in [r["id"], r["module"] + "; source lines " + str(r["source_lines"]), ", ".join(r["acceptance_test_ids"]), r["acceptance_criterion"], r["status"] + " / " + r["coverage_status"], "; ".join(dict.fromkeys(pointers))]) + " |\n")
    (OUT / "REQUIREMENTS_TRACEABILITY.md").write_text("".join(matrix))
    catalog = ["# Complete source acceptance catalog\n\nAll 475 criteria:432 paragraph criteria plus43 named scenarios. Ten narrow whole criteria PASSED on exact 3c85;465 remain NOT_RUN. PARTIAL supporting coverage does not close acceptance. 802 implementation assertions passed; browser 11/14 passed and overall run FAILED. Later source awaits final CI.\n\n| Test | Source lines | Complete expected criterion | Acceptance / coverage | Evidence limit |\n|---|---|---|---|---|\n"]
    for t in data["tests"]:
        catalog.append("| " + " | ".join(old.inline(v) for v in [t["id"], t["source_lines"], t["expected"], t["status"] + " / " + t["coverage_status"], t.get("acceptance_limit", "No whole-criterion execution established; related module evidence is navigation only.")]) + " |\n")
    (OUT / "ACCEPTANCE_TEST_CATALOG.md").write_text("".join(catalog))
    audit = ["# Evidence scope and remaining acceptance\n\nAll 432 requirements/475 source criteria retain canonical text and IDs. Four paragraph criteria and six named scenarios PASSED narrowly on exact historical `" + SHA + "`;428 requirements/465 criteria remain NOT_RUN. PARTIAL evidence does not close compound acceptance.\n\n[Hosted CI 37529346179](" + RUN + ") executed802/802 assertions without skips:708 CPU/memory/document/transport fixtures and 94 genuine PostgreSQL cases. Database classes are assigned per assertion: engine 27, GPS 10, worker 2, preconditions 6, privacy 19, assistant-runtime 30. File totals include CPU cases and are not PG counts. External AI/S3 I/O is mocked. [Exact index](EXECUTION_INDEX_3C85ADC.json) preserves all 802 assertion IDs and raw-input digests.\n\nActual rendered browser 11 PASS / 3 FAIL, overall release FAILED. Failed:task/import360px overflow and client issue photo selection. Guest-draft browser confirmation uses mocked HTTP and is not actual server lead proof; report browser checks headers/CSV total and SHA, not exhaustive full-content equivalence. The17-table / 7-blob encrypted isolated empty-DB restore, tamper rejection, exact runtime and bundled-worker restart passed; this restore contained no privacy history and proves no later-erasure reconciliation.\n\nArtifact 11444470113 outer SHA256 `d689dac36fb506745f4181bc2bdabc0b87ca07efb60f377bdaf1a6285c62d68b`, ZIP CRC verified; all 14 built files independently hashed. [Root-owned receipt](../evidence/ci-run-37529346179-summary.json) carries exact file digests. This is historical source proof, not current public deployment acceptance.\n\n[Native CI 37529346218](https://github.com/ziko1/knaba/actions/runs/37529346218) passed Android compile/lint/16 JVM cases and iOS unsigned simulator compile/4 XCTest cases; artifact/payload checksums independently verified in [native receipt](../evidence/native-run-37529346218-summary.json). Android lint 12 warnings remain recorded there. Physical GPS/background/battery/offline, production signing and store acceptance are NOT_RUN. Earlier [942b index](HISTORICAL_EXECUTION_INDEX.json) remains immutable and independently scoped.\n\n## Narrow whole criteria executed\n\n| Criterion | Environment | Exact scope |\n|---|---|---|\n"]
    for tid, (_, _, scope) in passed.items():
        test = next(t for t in data["tests"] if t["id"] == tid)
        audit.append("| " + " | ".join(old.inline(v) for v in [tid, test["environment"], scope]) + " |\n")
    audit.append("\n## Module readiness limits\n\nRelated test pointers establish navigation only; no broad module-ready label is inferred.\n\n| Module | Related exact-source test files | Remaining limit |\n|---|---|---|\n")
    for section in old.MODULES:
        r = next(r for r in data["requirements"] if int(r["id"].split("-")[2]) == section)
        audit.append("| " + " | ".join(old.inline(v) for v in [r["module"], "; ".join(e["test_path"] for e in r["supporting_release_module_evidence"]) or "Source/documents only", r["readiness_limit"]]) + " |\n")
    audit.append("\n## Later source requiring final CI\n\nAll following changes are SOURCE_PENDING/FINAL_CI_PENDING, with no inherited 3c85 passes.\n\n| Area | Test pointers | Scope |\n|---|---|---|\n")
    for key, (_, _, pointers, scope) in PENDING.items():
        audit.append("| " + " | ".join(old.inline(v) for v in [key, "; ".join(pointers), scope]) + " |\n")
    audit.append("\n## Reproduction and authority\n\nRun `python docs/requirements/update_release_evidence_traceability.py` to reproduce both historical attachment layers and final renderings from checked-in indices. To rebuild 3c85 index independently, pass `--hosted-unit-json PATH --hosted-live-json PATH --hosted-browser-json PATH` from the verified artifact. Both updaters verify unchanged 432/475 source fingerprints; `build_traceability.py` produces only a NOT_RUN baseline and must not overwrite enriched evidence.\n\nDo not retag historical evidence with a new source SHA, equate 802 assertions with 475 source acceptance, or claim public staging/provider/physical/legal/bank/backup erasure from synthetic or isolated runs. Root-owned TEST_EVIDENCE, roadmap and handover carry later final-candidate/deployment proof.\n")
    (OUT / "EVIDENCE_SCOPE_AUDIT.md").write_text("".join(audit))
    print(json.dumps(data["evidence_audit"], indent=2))


if __name__ == "__main__":
    main()
