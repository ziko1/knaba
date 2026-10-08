import { assert, type Data, type Entity } from './core.ts';
import { reportSnapshotHash } from './resources.ts';

/** Validate the immutable source shared by report and accounting exports. */
export function reportExportSnapshot(version: Entity): Data {
  const d = version.data, s = d.snapshot;
  assert(version.kind === 'report_version' && d.immutable === true && d.publishedAt && s && s.language === 'de', 'INVALID_STATE', { reason: 'PUBLISHED_REPORT_REQUIRED' });
  assert(d.sha256 === reportSnapshotHash(s), 'INVALID_STATE', { reason: 'REPORT_CHECKSUM_MISMATCH' });
  for (const key of ['baseNetCents', 'approvedChangesNetCents', 'totalNetCents', 'totalTaxCents', 'totalGrossCents', 'totalSeconds']) {
    assert(Number.isSafeInteger(s[key]), 'INVALID_STATE', { reason: 'REPORT_EXACT_NUMBERS_REQUIRED' });
  }
  assert(s.totalNetCents + s.totalTaxCents === s.totalGrossCents && s.baseNetCents + s.approvedChangesNetCents === s.totalNetCents, 'INVALID_STATE', { reason: 'REPORT_TOTAL_MISMATCH' });
  assert((s.hoursRows || []).reduce((n: number, row: Data) => n + row.seconds, 0) === s.totalSeconds, 'INVALID_STATE', { reason: 'REPORT_HOURS_MISMATCH' });
  return s;
}
