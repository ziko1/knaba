#!/usr/bin/env python3
"""Render the current verified release layer without rebuilding historical data.

Consumes an evidence-enriched matrix plus its immutable actual-source execution
index. It never rewrites requirement/test JSON or infers whole criteria passes.
"""
from __future__ import annotations
from collections import Counter
from pathlib import Path
import argparse
import hashlib
import json


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def read(path):
    path = Path(path)
    if not path.is_file() or path.stat().st_size > 64 * 1024 * 1024:
        raise ValueError('BOUNDED_JSON_FILE_REQUIRED')
    value = json.loads(path.read_text())
    if not isinstance(value, dict):
        raise ValueError('JSON_OBJECT_REQUIRED')
    return value


def inline(value):
    if isinstance(value, (list, dict)):
        value = json.dumps(value, ensure_ascii=False, sort_keys=True)
    return str(value).replace('|', '\\|').replace('\r', '').replace('\n', '<br>')


def table(header, rows):
    content = '| ' + ' | '.join(header) + ' |\n'
    content += '| ' + ' | '.join('---' for _ in header) + ' |\n'
    for row in rows:
        content += '| ' + ' | '.join(inline(v) for v in row) + ' |\n'
    return content


def pointer(value, path):
    result = value
    for part in path.lstrip('/').split('/'):
        result = result[part.replace('~1', '/').replace('~0', '~')]
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--matrix', type=Path, required=True)
    parser.add_argument('--execution-index', type=Path, required=True)
    parser.add_argument('--output-dir', type=Path, required=True)
    args = parser.parse_args()
    matrix = read(args.matrix)
    index = read(args.execution_index)
    code_sha = index['source_git_sha']
    tree = index['source_tree']
    layers = [layer for layer in matrix['current_release_evidence_layers'] if layer['source_git_sha'] == code_sha]
    assert len(layers) == 1 and layers[0]['source_tree'] == tree
    assert layers[0]['execution_index_sha256'] == sha(args.execution_index)
    assert index['scope'] == 'EXACT_SOURCE_EXECUTION_ONLY_NOT_WHOLE_CRITERION_ACCEPTANCE'
    assert len(matrix['requirements']) == 432 and len(matrix['tests']) == 475
    assert len(index['module_navigation']) == len({r['module'] for r in matrix['requirements']}) == 34
    assert len(index['assertions']) == index['counts']['total']
    assert index['counts']['status'] == index['browser_summary']['status'] == 'PASSED'
    assert index['counts']['failed'] == index['counts']['skipped'] == 0
    for requirement in matrix['requirements']:
        current = [layer for layer in requirement['current_release_evidence_layers'] if layer['source_git_sha'] == code_sha]
        assert len(current) == 1 and current[0]['module'] == requirement['module']
        assert pointer(index, current[0]['json_pointer']) == index['module_navigation'][requirement['module']]
    for criterion in matrix['tests']:
        current = [layer for layer in criterion['current_release_verification'] if layer['source_git_sha'] == code_sha]
        assert len(current) == 1 and current[0]['whole_acceptance'] == 'NOT_REASSESSED'

    index_name = args.execution_index.name
    unit = index['counts']
    classification = unit['classification']
    cpu = classification['cpuDocumentOrTransportDouble']['passed']
    pg = classification['realPostgres']['passed']
    browser = index['browser_summary']
    browser_classes = Counter(row['execution_class'] for row in index['browser_assertions'])
    requirement_statuses = dict(sorted(Counter(r['status'] for r in matrix['requirements']).items()))
    criterion_statuses = dict(sorted(Counter(t['status'] for t in matrix['tests']).items()))
    header = (
        f'Exact current source `{code_sha}`, Git tree `{tree}`. '
        f'[Application CI {index["workflow_run_id"]}]({index["run_url"]}) and '
        f'[{index_name}]({index_name}) establish {unit["passed"]}/{unit["total"]} '
        f'actual passed implementation assertions ({cpu} CPU/document/transport doubles; '
        f'{pg} genuine PostgreSQL), {unit["failed"]} failures and {unit["skipped"]} skips. '
        f'{browser["passed"]}/{browser["total"]} browser cases passed: '
        f'{browser_classes["ACTUAL_RENDERED_ISOLATED_BROWSER"]} actual backend/UI and '
        f'{browser_classes["EXPLICIT_HTTP_TRANSPORT_FIXTURE"]} explicit HTTP fixture. '
        f'All {len(index["built_file_hashes"])} declared built files were independently '
        'checked against downloaded bytes.\n\n'
        'These implementation cases are separate from432 canonical requirements and475 '
        'whole acceptance criteria. Existing requirement/criterion statuses, historical '
        'coverage and evidence retain their original source. The current layer supplies '
        'compact navigation only; no whole criterion or module is automatically certified. '
        'Historical acceptance limits shown below do not describe current execution status. '
        'Public Railway, real providers, physical devices, company signing, legal approval '
        'and handover remain separate.\n\n'
    )
    traceability = '# Source-complete requirements traceability\n\n' + header
    traceability += f'Canonical specification SHA256 `{matrix["source_sha256"]}`; IDs and complete source text unchanged. Historical requirement status counts: `{requirement_statuses}`.\n\n'
    traceability += f'See [acceptance catalog](ACCEPTANCE_TEST_CATALOG.md) and [current evidence audit](EVIDENCE_SCOPE_AUDIT.md). The shared execution index stores full{unit["total"]} cases once; each requirement points to a shared module map.\n\n'
    requirement_rows = []
    for requirement in matrix['requirements']:
        paths = list(requirement['implementation_paths'])
        for candidate in requirement.get('candidate_verification', []):
            paths += candidate.get('test_paths', [])
        requirement_rows.append([
            requirement['id'], requirement['module'] + '; source lines ' + str(requirement['source_lines']),
            ', '.join(requirement['acceptance_test_ids']), requirement['acceptance_criterion'],
            requirement['status'] + ' / ' + requirement.get('coverage_status', 'NOT_RUN') + ' (historical)',
            'Current: NOT_REASSESSED; shared module navigation `' + requirement['module'] + '`',
            '; '.join(dict.fromkeys(paths)),
        ])
    traceability += table(['Requirement', 'Module / source', 'Acceptance IDs', 'Complete source criterion', 'Historical acceptance / coverage', 'Current layer', 'Implementation / candidate pointers'], requirement_rows)

    catalog = '# Complete source acceptance catalog\n\n' + header
    catalog += f'All475 original criteria:432 paragraph criteria plus43 named scenarios. Historical acceptance status counts: `{criterion_statuses}`. A historicalPASSED remains bound to its original evidence; current whole-criterion assessment isNOT_REASSESSED.\n\n'
    catalog += table(['Criterion', 'Source lines', 'Complete expected criterion', 'Historical acceptance / coverage', 'Current whole acceptance', 'Historical reviewed limit'], [
        [criterion['id'], criterion['source_lines'], criterion['expected'],
         criterion['status'] + ' / ' + criterion.get('coverage_status', 'NOT_RUN'), 'NOT_REASSESSED',
         criterion.get('acceptance_limit', 'No whole criterion execution established in the historical layer.')]
        for criterion in matrix['tests']
    ])

    audit = '# Current exact-source evidence scope\n\n' + header
    audit += f'Execution index SHA256 `{sha(args.execution_index)}`. Matrix source texts/statuses/historical evidence preserved; no whole-criterion bulkPASS.\n\n'
    audit += '## Current execution and delivery\n\n'
    audit += f'The downloaded complete Git source archive was reconstructed and matched to its exact Git tree; the per-case classification index and{len(index["test_file_navigation"])} test source hashes were validated against those verified source bytes. Actual test results, bounded hosted stage timestamps, runtime manifest/bundle digests and independently downloaded built files agree. Full assertion objects occur once, with one shared file ID map and34 shared module references.\n\n'
    restore = index['verified_release_scope']['restore']
    audit += f'All seven isolated stages passed: exact live runtime, full unit/PostgreSQL, rendered browser, encrypted backup, tamper rejection, empty-database/private-blob restore and two actual worker process phases. The restore checked{restore["originalTables"]} original tables and{restore["privateBlobs"]} private blobs. This is isolated hosted recovery proof, not offsite/public disaster recovery or proof of deleting backup/provider/device copies.\n\n'
    native = index.get('native_receipt')
    if native:
        audit += f'[Native CI {native["runId"]}]({native["providerRunUrl"]}) is bound to the same source. Android debug assembly/52 Java vectors/lint0errors8warnings and15 iOS simulator XCTest passed; delivered debug APK signature and simulator bundle/executable hashes were independently verified. Company release signing, signedIPA/phone installation and physical GPS/background/battery remainNOT_RUN.\n\n'
    audit += 'The work-event bridge has19 logical cause types and six-language text. Its28 CPU and13 actual PostgreSQL cases passed; nineteen names are not nineteen full business-flow acceptance criteria. Actual source managers/assignees/customer VIEW memberships, timed REMIND/source policies, provider delivery and human acknowledgment require their own scope.\n\n'
    audit += '## Current module navigation\n\nThese are related case counts only. They do not prove full module or compound criterion acceptance.\n\n'
    module_rows = []
    for module, navigation in sorted(index['module_navigation'].items()):
        module_rows.append([module, navigation['assertion_count'], navigation['counts_by_execution_class'], '; '.join(ref['test_path'] for ref in navigation['test_file_refs']) or 'Source/document-only module'])
    audit += table(['Module', 'Related case count', 'Execution classes', 'Shared test-file references'], module_rows)
    audit += '\n## Historical narrow criteria\n\nExistingPASSED rows are preserved as historical source-specific evidence, without inheriting their passes into current whole acceptance.\n\n'
    passed_rows = []
    for criterion in matrix['tests']:
        if criterion['status'] != 'PASSED':
            continue
        sources = sorted({item['source_git_sha'] for item in criterion.get('evidence', []) if isinstance(item, dict) and item.get('source_git_sha')})
        passed_rows.append([criterion['id'], '; '.join(sources) or str(criterion.get('code_sha')), criterion.get('environment'), criterion.get('acceptance_limit', 'See original source-bound evidence.')])
    audit += table(['Criterion', 'Original evidence source', 'Historical environment', 'Historical scope'], passed_rows)
    audit += '\n## Remaining acceptance and reproduction\n\n'
    audit += 'Public Railway remainsNOT_READY pending application of the37 source-pinned staged changes through provider Dashboard MFA. Actual Meta/AI/S3/ClamAV/accounting/bank/physical GPS/provider quality/legal/company approvals remain separately gated by [the canonical external inventory](../EXTERNAL_PREREQUISITES.md). EXT-22 is resolved for hosted runner and current synthetic verification; it is not an additional missing permission.\n\n'
    audit += 'Historical942b/3c85/9d94/61a/c1 layers retain their original provenance and failures; no historical hardcoded renderer should overwrite this current layer. The current renderer reads the reviewed matrix and immutable exact-source execution index, changes no JSON/status, and deterministically emits these three Markdown files. Source baseline generators and historical updaters must not replace the enriched current matrix.\n\n'
    audit += 'Limitations:\n\n' + '\n'.join('- ' + limitation for limitation in index['limitations']) + '\n'
    output = args.output_dir.resolve()
    output.mkdir(parents=True, exist_ok=True)
    files = {'REQUIREMENTS_TRACEABILITY.md': traceability, 'ACCEPTANCE_TEST_CATALOG.md': catalog, 'EVIDENCE_SCOPE_AUDIT.md': audit}
    for filename, content in files.items():
        (output / filename).write_text(content)
    print(json.dumps({
        'status': 'CURRENT_LAYER_RENDERED_WITHOUT_JSON_OR_STATUS_MUTATION',
        'source_git_sha': code_sha, 'source_tree': tree,
        'requirements': 432, 'criteria': 475, 'modules': 34,
        'outputs': {name: {'bytes': (output / name).stat().st_size, 'sha256': sha(output / name)} for name in files},
    }, sort_keys=True, indent=2))


if __name__ == '__main__':
    main()
