#!/usr/bin/env python3
"""Rebuild the source-complete V3 requirement baseline; never infer passing tests."""
from __future__ import annotations

import argparse
import hashlib
import json
import re
from collections import Counter
from pathlib import Path

MODULES = {
    0: "delivery/specification", 1: "delivery/product", 2: "delivery/autonomy",
    3: "approvals/automations", 4: "architecture", 5: "identity/rbac",
    6: "channels/conversation-router", 7: "integrations/whatsapp",
    8: "messaging/translation", 9: "assistant-config/knowledge",
    10: "leads/handoff", 11: "pricing/quotations", 12: "dispatch/scheduling",
    13: "client-portal", 14: "sites/site-locations", 15: "tasks/quality/rework",
    16: "timekeeping", 17: "geolocation/geofences/travel/native",
    18: "reporting/statistics", 19: "inventory/procurement",
    20: "notifications/automations", 21: "media", 22: "payroll/payouts",
    23: "reporting/documents", 24: "bot-admin", 25: "web/pwa/widget/native",
    26: "privacy/ai", 27: "legal/policies", 28: "security/resilience",
    29: "domain/contracts", 30: "acceptance/quality", 31: "delivery/documentation",
    32: "infra/deployment", 33: "handover",
}
CLASS = {
    0: "document-review", 1: "document-review+e2e", 2: "document-review+operations",
    3: "unit+integration+e2e", 4: "contract+integration+operations",
    5: "security+integration+e2e", 6: "integration+e2e+provider-live",
    7: "contract+integration+provider-live", 8: "unit+integration+e2e+provider-live",
    9: "unit+integration+e2e+ai-evaluation", 10: "integration+e2e+ai-evaluation",
    11: "unit+integration+e2e", 12: "unit+integration+e2e",
    13: "security+integration+e2e", 14: "unit+integration+e2e",
    15: "unit+integration+e2e", 16: "unit+integration+e2e",
    17: "unit+contract+integration+physical-device", 18: "unit+integration+e2e",
    19: "unit+integration+e2e", 20: "unit+integration+provider-live",
    21: "security+integration+e2e", 22: "unit+security+integration+external-reconciliation",
    23: "unit+integration+artifact-validation", 24: "security+integration+e2e",
    25: "e2e+accessibility+physical-device", 26: "security+privacy-review",
    27: "legal-review+unit+integration", 28: "security+integration+restore",
    29: "unit+contract+integration", 30: "acceptance-execution",
    31: "document-review+reproducibility", 32: "build+deploy+live+physical-device",
    33: "handover-review",
}
EXPLICIT_SECTION = {
    "ENTRY": [6, 10, 13, 28], "CHAT": [5, 7, 8, 9, 10, 26, 28],
    "SALES": [9, 10, 11], "DISPATCH": [3, 12, 20],
    "TASK": [14, 15, 21], "REPORT": [5, 13, 21, 23],
    "ADMIN": [5, 9, 11, 24], "OPS": [4, 20, 28, 31, 32, 33],
}

def inline(value: str) -> str:
    return value.replace("|", "\\|").replace("\n", "<br>")

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("--out", type=Path, default=Path(__file__).parent)
    args = parser.parse_args()
    raw = args.source.read_bytes()
    lines = raw.decode("utf-8").splitlines()
    counts: Counter[int] = Counter()
    requirements = []
    tests = []
    source_sections = []
    block = []
    start = 0
    section = 0
    heading = "Introductory authority and scope"
    in_toc = False
    annex = False
    in_fence = False

    def flush(end: int) -> None:
        nonlocal block, start
        if not block:
            return
        value = "\n".join(block)
        block = []
        if in_toc or annex:
            return
        named = re.match(r"^(T-[A-Z]+-\d+):\s*(.*)", value, re.S)
        if named:
            tests.append({"id": named[1], "expected": named[2],
                          "source_lines": [start, end], "source_section": heading,
                          "class": "acceptance", "status": "NOT_RUN", "evidence": [],
                          "code_sha": None, "environment": None})
            return
        counts[section] += 1
        rid = f"KNABA-R-{section:02d}-{counts[section]:03d}"
        tid = f"T-REQ-{section:02d}-{counts[section]:03d}"
        requirements.append({"id": rid, "module": MODULES[section],
                             "source_section": heading, "source_lines": [start, end],
                             "acceptance_criterion": value,
                             "contract": f"{MODULES[section]}: source-defined behavior; implementation link pending",
                             "acceptance_test_ids": [tid], "implementation_paths": [],
                             "status": "NOT_RUN", "evidence": []})
        tests.append({"id": tid, "requirement_ids": [rid], "expected": value,
                      "source_lines": [start, end], "source_section": heading,
                      "class": CLASS[section], "status": "NOT_RUN", "evidence": [],
                      "code_sha": None, "environment": None})

    for number, line in enumerate(lines, 1):
        if line.startswith("```"):
            if not block:
                start = number
            block.append(line)
            in_fence = not in_fence
            continue
        if not in_fence and line.startswith("#"):
            flush(number - 1)
            in_toc = line == "## Зміст"
            m = re.match(r"^#{2,3} (\d+)(?:\.(\d+))?\.", line)
            if m:
                section = int(m[1])
                heading = line.lstrip("# ")
                source_sections.append({"section": heading, "line": number})
                in_toc = False
            if line.startswith("## Першоджерела"):
                annex = True
            continue
        if not in_fence and (not line.strip() or line.strip() == "---"):
            flush(number - 1)
            continue
        if not block:
            start = number
        block.append(line)
    flush(len(lines))
    explicit = [test for test in tests if not test["id"].startswith("T-REQ")]
    for req in requirements:
        number = int(req["id"].split("-")[2])
        req["acceptance_test_ids"] += [
            test["id"] for test in explicit
            if number in EXPLICIT_SECTION.get(test["id"].split("-")[1], [])
        ]

    args.out.mkdir(parents=True, exist_ok=True)
    baseline = {
        "schema_version": 1, "specification": "KNABA_DE_MASTER_SPEC.md",
        "source_sha256": hashlib.sha256(raw).hexdigest(), "source_bytes": len(raw),
        "source_line_count": len(lines), "specification_date": "2026-10-06",
        "inspection_date": "2026-10-05", "date_note": "Specification date is one day ahead of execution environment; not evidence of future legal/API verification.",
        "baseline_status": "NOT_RUN", "requirements": requirements, "tests": tests,
        "source_sections": source_sections,
    }
    (args.out / "requirements.json").write_text(json.dumps(baseline, ensure_ascii=False, indent=2) + "\n")
    top = [
        "# Requirements traceability — KNABA DE V3",
        "",
        "This is a source-complete acceptance baseline, not a claim that these tests exist or passed. Each substantive source paragraph has an immutable requirement ID and its own acceptance case; the complete wording is retained so compound obligations are not silently dropped. Named acceptance tests from §30 are also retained unchanged. Source headings, table of contents and bibliography are metadata, not executable acceptance cases.",
        "",
        f"Canonical source: `KNABA_DE_MASTER_SPEC.md`; {len(raw):,} bytes / {len(lines):,} lines; SHA-256 `{baseline['source_sha256']}`. Source was read in full in nontruncated chunks. {len(requirements)} requirement records; {len(tests)} acceptance records, including {len(explicit)} explicitly named source scenarios. The file's stated 2026-10-06 edition is later than the execution date 2026-10-05; API/legal references are not treated as newly verified here.",
        "",
        "All baseline results are `NOT_RUN`. `PASSED` requires an executed case, exact code SHA, environment, actual result and retained evidence. `BLOCKED_EXTERNAL` requires a concrete missing dependency; it never counts as passing. A synthetic adapter test, native source file or public health response cannot prove provider-live, physical-device or full product readiness. Implementation links and API operation links remain pending until code is independently inspected.",
        "",
        "The machine-readable [requirements.json](requirements.json) is authoritative for complete criteria, source line ranges, test classes, implementation links and evidence. [ACCEPTANCE_TEST_CATALOG.md](ACCEPTANCE_TEST_CATALOG.md) preserves the explicit source cases. [RISK_INVARIANTS.md](RISK_INVARIANTS.md) highlights cross-module safety gates. New cases supplement the baseline; do not delete a requirement to obtain a green summary.",
        "",
        "## Module coverage",
        "",
        "| Source section | Module | Requirement records | Acceptance status |",
        "| --- | --- | ---: | --- |",
    ]
    for number, count in sorted(counts.items()):
        top.append(f"| {number:02d} | {MODULES[number]} | {count} | NOT_RUN |")
    top += ["", "## Exhaustive source-backed matrix", "",
            "| Requirement | Module / contract boundary | Source lines | Acceptance case / relevant source cases | Acceptance criterion | Status |",
            "| --- | --- | --- | --- | --- | --- |"]
    for req in requirements:
        ids = ", ".join(req["acceptance_test_ids"])
        top.append(f"| {req['id']} | {req['module']} | {req['source_lines'][0]}–{req['source_lines'][1]} | {ids} | {inline(req['acceptance_criterion'])} | NOT_RUN |")
    (args.out / "REQUIREMENTS_TRACEABILITY.md").write_text("\n".join(top) + "\n")

    catalog = ["# Acceptance catalog", "",
               "Cases below reproduce the 43 named source scenarios. Their status is initially NOT_RUN. The additional per-requirement cases, source criteria and required test classes are in requirements.json; these are an acceptance design, not generated test evidence.", "",
               "| Test ID | Source lines | Expected result / acceptance scenario | Status | Evidence |",
               "| --- | --- | --- | --- | --- |"]
    for test in explicit:
        catalog.append(f"| {test['id']} | {test['source_lines'][0]}–{test['source_lines'][1]} | {inline(test['expected'])} | NOT_RUN | — |")
    (args.out / "ACCEPTANCE_TEST_CATALOG.md").write_text("\n".join(catalog) + "\n")
    print(json.dumps({"requirements": len(requirements), "tests": len(tests), "named_tests": len(explicit), "source_sha256": baseline["source_sha256"]}))

if __name__ == "__main__":
    main()
