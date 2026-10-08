import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { DomainError, type Entity } from '../packages/domain/core.ts';
import { reportSnapshotHash } from '../packages/domain/resources.ts';
import { accountingExportSnapshot, renderAccountingExport } from '../packages/integrations/accounting-export.ts';

// These are explicit synthetic published-report facts, never company rates or
// evidence of invoice/accountant/provider acceptance.
function publishedReport(): Entity {
  const snapshot = {
    language: 'de', templateVersion: 'knaba-de-report-v1', documentType: 'Leistungsnachweis',
    number: 'KNB-synthetic-report-02', version: 2,
    company: { legalName: 'SYNTHETIC TEST COMPANY', address: 'Synthetic company address', registration: 'TEST-REG', taxId: 'TEST-TAX' },
    customer: { name: 'SYNTHETIC TEST CUSTOMER', address: 'Synthetic customer address' },
    site: { id: 'site-test', code: 'TEST-SITE', name: 'Synthetic site', address: 'Synthetic site address' },
    order: { id: 'order-test', pricingModel: 'FIXED', quoteId: 'quote-test', quoteVersion: 1 },
    periodStart: '2026-10-01T00:00:00.000Z', periodEnd: '2026-10-02T00:00:00.000Z',
    descriptionDe: 'Synthetischer geprüfter Leistungsnachweis.',
    taskRows: [{ taskId: 'task-test', descriptionDe: 'Synthetische Reinigung', quantityMilli: 12_500, unit: 'M2', state: 'ACCEPTED' }],
    hoursRows: [{ workerCode: 'TEST-WORKER', sourceTimesheetId: 'timesheet-test', seconds: 3661 }, { workerCode: 'TEST-WORKER-2', seconds: 59 }],
    materialRows: [{ usageId: 'usage-test', sku: 'TEST-MATERIAL', name: 'Synthetisches Material', quantityBase: 500, unit: 'ml', taskId: 'task-test', chargedSeparately: false }],
    mediaRows: [{ mediaId: 'media-test', clientBlobKey: 'private-blob-test', caption: 'TEST' }],
    totalSeconds: 3720, currency: 'EUR', baseNetCents: 120_000, approvedChangesNetCents: 12_000,
    totalNetCents: 132_000, totalTaxCents: 25_080, totalGrossCents: 157_080,
    taxPresentation: 'NET', priceStatus: 'FINAL', legalNotice: 'TEST',
  };
  return {
    id: 'version-test-2', companyId: 'company-test', kind: 'report_version', version: 1,
    createdAt: '2026-10-03T10:00:00.000Z', updatedAt: '2026-10-03T10:00:00.000Z',
    data: {
      reportId: 'report-test', siteId: 'site-test', customerId: 'customer-test', version: 2,
      previousVersionId: 'version-test-1', templateVersion: snapshot.templateVersion,
      publishedAt: '2026-10-03T10:00:00.000Z', immutable: true,
      snapshot, sha256: reportSnapshotHash(snapshot),
    },
  };
}

function amend(report: Entity, change: (snapshot: Entity['data']) => void): Entity {
  change(report.data.snapshot);
  report.data.sha256 = reportSnapshotHash(report.data.snapshot);
  return report;
}

function reverseObjectKeys(value: any): any {
  if (Array.isArray(value)) return value.map(reverseObjectKeys);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).reverse().map(([key, item]) => [key, reverseObjectKeys(item)]));
  return value;
}

function reasonFor(run: () => unknown): string {
  try { run(); } catch (error) {
    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).code).toBe('INVALID_STATE');
    return (error as DomainError).details.reason;
  }
  throw new Error('Expected invalid source to be rejected');
}

describe('accountant published-report handoff', () => {
  it('preserves agreed fixed-price cents and performance facts without treating work/materials as extra charges', () => {
    const report = amend(publishedReport(), snapshot => {
      snapshot.materialRows[0].chargedSeparately = true;
      snapshot.tax = { mode: 'VAT', rateBps: 1900, privateApprovalNotes: 'NOT AN INVOICE PROFILE' };
    });
    const result = accountingExportSnapshot(report);
    expect(result.amounts).toEqual({
      currency: 'EUR', unit: 'EUR_CENT', initialAgreedNetCents: 120_000,
      approvedChangesNetCents: 12_000, reportedNetCents: 132_000,
      reportedTaxCents: 25_080, reportedGrossCents: 157_080,
      reportPriceStatus: 'FINAL', sourceTaxPresentation: 'NET',
    });
    expect(result.performance.totalSeconds).toBe(3720);
    expect(result.performance.acceptedTasks[0].quantityMilli).toBe(12_500);
    expect(result.performance.materials[0].chargedSeparately).toBe(true);
    expect(result).toMatchObject({ format: 'KNABA_ACCOUNTING_HANDOFF_V1', documentType: 'ACCOUNTANT_REVIEW_DATA', legalInvoiceIssued: false, structuredInvoiceValidated: false });
    expect(result.readiness).toMatchObject({ structuredInvoice: 'NOT_READY', profileValidation: 'NOT_RUN', accountantAcceptance: 'NOT_RECORDED_BY_THIS_EXPORT' });
    expect(JSON.stringify(result)).not.toContain('rateBps');
    expect(JSON.stringify(result)).not.toContain('invoiceNumber');
  });

  it('returns identical bytes across source key order and distinguishes download hash from full source hash', () => {
    const report = publishedReport();
    const original = structuredClone(report);
    const first = renderAccountingExport(report);
    const second = renderAccountingExport(reverseObjectKeys(report));
    expect(second.bytes.equals(first.bytes)).toBe(true);
    expect(second.sha256).toBe(first.sha256);
    expect(first.sourceSha256).toBe(report.data.sha256);
    expect(first.sha256).toBe(createHash('sha256').update(first.bytes).digest('hex'));
    expect(first.sha256).not.toBe(first.sourceSha256);
    expect(first.bytes.toString('utf8').endsWith('\n')).toBe(true);
    expect(report).toEqual(original);
  });

  it('checks integrity of the complete source even when the changed field would not be disclosed', () => {
    const report = publishedReport();
    report.data.snapshot.mediaRows[0].clientBlobKey = 'changed-private-key';
    expect(reasonFor(() => renderAccountingExport(report))).toBe('REPORT_CHECKSUM_MISMATCH');
  });

  it('excludes injected private fields throughout nested records and aggregates hours without worker identities', () => {
    const secret = 'PRIVATE_SENTINEL_DO_NOT_EXPORT';
    const report = amend(publishedReport(), snapshot => {
      snapshot.company.bank = secret;
      snapshot.customer.comments = secret;
      snapshot.site.gps = { latitude: secret };
      snapshot.order.payroll = secret;
      snapshot.taskRows[0].notesInternal = secret;
      snapshot.taskRows[0].employeeIds = [secret];
      snapshot.hoursRows[0].workerCode = secret;
      snapshot.hoursRows[0].sourceTimesheetId = secret;
      snapshot.materialRows[0].supplierBank = secret;
      snapshot.mediaRows[0].clientBlobKey = secret;
      snapshot.mediaRows[0].mediaId = secret;
      snapshot.approval = { approvedBy: secret };
      snapshot.privateNotes = secret;
    });
    report.data.bank = secret;
    report.data.createdBy = secret;
    const bytes = renderAccountingExport(report).bytes.toString('utf8');
    expect(bytes).not.toContain(secret);
    for (const excluded of ['mediaRows', 'blobKey', 'clientBlobKey', 'workerCode', 'sourceTimesheetId', 'payroll', 'employeeIds', 'approvedBy', 'notesInternal', 'usageId']) expect(bytes).not.toContain(`"${excluded}"`);
    expect(JSON.parse(bytes).performance.totalSeconds).toBe(3720);
  });

  it('does not serialize arbitrary address objects and reports absent text explicitly', () => {
    const report = amend(publishedReport(), snapshot => {
      snapshot.company.address = { street: 'UNCONFIRMED', bank: 'PRIVATE_ADDRESS_SENTINEL' };
      snapshot.customer.address = '';
      snapshot.site.address = null;
    });
    const result = accountingExportSnapshot(report);
    expect(result.parties.company.addressText).toBeNull();
    expect(result.parties.customer.addressText).toBeNull();
    expect(result.site.addressText).toBeNull();
    expect(result.readiness.findings.filter(finding => finding.code === 'ADDRESS_TEXT_UNAVAILABLE').map(finding => finding.field)).toEqual(['company.addressText', 'customer.addressText', 'site.addressText']);
    expect(JSON.stringify(result)).not.toContain('PRIVATE_ADDRESS_SENTINEL');
    expect(JSON.stringify(result)).not.toContain('UNCONFIRMED');
  });

  it('keeps provisional amounts visibly provisional and cannot turn a final report into a validated invoice', () => {
    const provisional = accountingExportSnapshot(amend(publishedReport(), snapshot => { snapshot.priceStatus = 'PROVISIONAL'; }));
    expect(provisional.amounts.reportPriceStatus).toBe('PROVISIONAL');
    expect(provisional.readiness.findings.some(finding => finding.code === 'REPORT_PRICE_IS_PROVISIONAL')).toBe(true);
    const final = accountingExportSnapshot(publishedReport());
    expect(final.readiness.findings.some(finding => finding.code === 'REPORT_PRICE_IS_PROVISIONAL')).toBe(false);
    expect(final.readiness.structuredInvoice).toBe('NOT_READY');
  });

  it('preserves exact cents at the safe-integer boundary without decimal formatting or tax inference', () => {
    const report = amend(publishedReport(), snapshot => {
      snapshot.baseNetCents = Number.MAX_SAFE_INTEGER - 2;
      snapshot.approvedChangesNetCents = 1;
      snapshot.totalNetCents = Number.MAX_SAFE_INTEGER - 1;
      snapshot.totalTaxCents = 1;
      snapshot.totalGrossCents = Number.MAX_SAFE_INTEGER;
    });
    const result = JSON.parse(renderAccountingExport(report).bytes.toString('utf8'));
    expect(result.amounts.reportedGrossCents).toBe(9_007_199_254_740_991);
    expect(result.amounts.reportedNetCents).toBe(9_007_199_254_740_990);
    expect(result.amounts.reportedTaxCents).toBe(1);
    expect(result.structuredInvoiceValidated).toBe(false);
  });

  it('returns field-only diagnostics for invalid private-looking source values', () => {
    const secret = 'PRIVATE_INVALID_VALUE_SENTINEL';
    const report = amend(publishedReport(), snapshot => { snapshot.order.quoteVersion = secret; });
    try {
      accountingExportSnapshot(report);
      throw new Error('Expected invalid source to be rejected');
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).details.fields).toContain('order.quoteVersion');
      expect(JSON.stringify((error as DomainError).details)).not.toContain(secret);
    }
  });

  it.each([
    ['foreign currency', (snapshot: any) => { snapshot.currency = 'USD'; }],
    ['negative tax', (snapshot: any) => { snapshot.totalTaxCents = -1; snapshot.totalGrossCents = snapshot.totalNetCents - 1; }],
    ['unsafe money', (snapshot: any) => { snapshot.baseNetCents = Number.MAX_SAFE_INTEGER + 1; }],
    ['fractional task quantity', (snapshot: any) => { snapshot.taskRows[0].quantityMilli = 1.5; }],
    ['fractional hours hidden by an integer sum', (snapshot: any) => { snapshot.hoursRows = [{ seconds: 0.5 }, { seconds: 0.5 }]; snapshot.totalSeconds = 1; }],
    ['negative material quantity', (snapshot: any) => { snapshot.materialRows[0].quantityBase = -1; }],
    ['unaccepted task', (snapshot: any) => { snapshot.taskRows[0].state = 'SUBMITTED'; }],
  ] as const)('rejects %s without including source field values in error details', (_, mutation) => {
    const report = amend(publishedReport(), mutation);
    expect(reasonFor(() => accountingExportSnapshot(report))).toBe('ACCOUNTING_REPORT_DATA_INVALID');
  });

  it('rejects inconsistent cents and hours rather than correcting the published financial source', () => {
    expect(reasonFor(() => accountingExportSnapshot(amend(publishedReport(), snapshot => { snapshot.totalGrossCents += 1; })))).toBe('REPORT_TOTAL_MISMATCH');
    expect(reasonFor(() => accountingExportSnapshot(amend(publishedReport(), snapshot => { snapshot.hoursRows[0].seconds += 1; })))).toBe('REPORT_HOURS_MISMATCH');
  });

  it.each([
    ['site', (report: Entity) => { report.data.siteId = 'different-site'; }],
    ['template', (report: Entity) => { report.data.templateVersion = 'different-template'; }],
    ['document version', (report: Entity) => { report.data.version = 3; }],
  ] as const)('rejects a mismatched %s envelope around an otherwise valid hashed snapshot', (_, mutation) => {
    const report = publishedReport();
    mutation(report);
    expect(reasonFor(() => accountingExportSnapshot(report))).toBe('ACCOUNTING_REPORT_SOURCE_MISMATCH');
  });

  it('rejects duplicated accepted tasks instead of exporting ambiguous repeated work', () => {
    const report = amend(publishedReport(), snapshot => { snapshot.taskRows.push({ ...snapshot.taskRows[0] }); });
    expect(reasonFor(() => accountingExportSnapshot(report))).toBe('ACCOUNTING_REPORT_DUPLICATE_TASK');
  });

  it('rejects a zero or reversed performance period', () => {
    const report = amend(publishedReport(), snapshot => { snapshot.periodEnd = snapshot.periodStart; });
    expect(reasonFor(() => accountingExportSnapshot(report))).toBe('ACCOUNTING_REPORT_PERIOD_INVALID');
  });

  it('rejects a draft entity or unpublished/mutable source even if it has matching report amounts', () => {
    const report = publishedReport();
    report.kind = 'report';
    expect(reasonFor(() => accountingExportSnapshot(report))).toBe('PUBLISHED_REPORT_REQUIRED');
    report.kind = 'report_version';
    report.data.immutable = false;
    expect(reasonFor(() => accountingExportSnapshot(report))).toBe('ACCOUNTING_REPORT_DATA_INVALID');
    report.data.immutable = true;
    delete report.data.publishedAt;
    expect(reasonFor(() => accountingExportSnapshot(report))).toBe('ACCOUNTING_REPORT_DATA_INVALID');
  });

  it('does not invent a report number when absent in an older immutable snapshot', () => {
    const report = amend(publishedReport(), snapshot => { delete snapshot.number; delete snapshot.version; });
    expect(accountingExportSnapshot(report).source).toMatchObject({ reportNumber: null, reportVersionId: 'version-test-2', documentVersion: 2 });
  });
});
