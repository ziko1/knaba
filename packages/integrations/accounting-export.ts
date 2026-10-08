import { createHash } from 'node:crypto';
import { z } from 'zod';
import { reportExportSnapshot } from '../domain/report-export.ts';
import { assert, type Entity } from '../domain/core.ts';
import { canonicalReportJson } from '../domain/resources.ts';

export const ACCOUNTING_EXPORT_FORMAT = 'KNABA_ACCOUNTING_HANDOFF_V1' as const;
export const ACCOUNTING_EXPORT_MIME_TYPE = 'application/json; charset=utf-8' as const;
const MAX_ROWS = 10_000;
const identifier = z.string().min(1).max(100);
const exactInteger = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const signedExactInteger = z.number().int().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER);
const nonblank = z.string().min(1).max(10_000).refine(value => value.trim().length > 0);
const optionalText = z.string().max(10_000).optional();
const instant = z.string().datetime({ offset: true });

// Zod strips unknown keys at every projected object. Free-text addresses are
// handled separately; an arbitrary object is never stringified into the export.
const sourceSchema = z.object({
  reportId: identifier,
  siteId: identifier,
  customerId: identifier,
  version: exactInteger.min(1),
  previousVersionId: identifier.nullable().optional(),
  templateVersion: nonblank,
  publishedAt: instant,
  immutable: z.literal(true),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
const snapshotSchema = z.object({
  language: z.literal('de'),
  templateVersion: nonblank,
  documentType: nonblank,
  number: optionalText,
  version: exactInteger.min(1).optional(),
  company: z.object({ legalName: nonblank, address: z.unknown(), registration: optionalText, taxId: optionalText }),
  customer: z.object({ name: nonblank, address: z.unknown() }),
  site: z.object({ id: identifier, code: optionalText, name: nonblank, address: z.unknown() }),
  order: z.object({ id: identifier, pricingModel: z.enum(['FIXED', 'TIME_MATERIAL']), quoteId: identifier, quoteVersion: exactInteger.min(1) }),
  periodStart: instant,
  periodEnd: instant,
  descriptionDe: nonblank,
  currency: z.literal('EUR'),
  baseNetCents: exactInteger,
  approvedChangesNetCents: signedExactInteger,
  totalNetCents: exactInteger,
  totalTaxCents: exactInteger,
  totalGrossCents: exactInteger,
  totalSeconds: exactInteger,
  taxPresentation: z.enum(['NET', 'GROSS', '']),
  priceStatus: z.enum(['FINAL', 'PROVISIONAL']),
  taskRows: z.array(z.object({
    taskId: identifier,
    descriptionDe: nonblank,
    quantityMilli: exactInteger,
    unit: nonblank,
    state: z.literal('ACCEPTED'),
  })).max(MAX_ROWS).default([]),
  hoursRows: z.array(z.object({ seconds: exactInteger })).max(MAX_ROWS).default([]),
  materialRows: z.array(z.object({
    sku: optionalText,
    name: nonblank,
    quantityBase: exactInteger,
    unit: nonblank,
    taskId: identifier.nullable().optional(),
    chargedSeparately: z.boolean(),
  })).max(MAX_ROWS).default([]),
});

function checked<T extends z.ZodTypeAny>(schema: T, value: unknown): z.infer<T> {
  const parsed = schema.safeParse(value);
  assert(parsed.success, 'INVALID_STATE', {
    reason: 'ACCOUNTING_REPORT_DATA_INVALID',
    fields: parsed.success ? [] : parsed.error.issues.map(issue => issue.path.join('.')),
  });
  return parsed.data;
}

function addressText(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 10_000 ? value : null;
}

/** Pure preparation only. Caller must freshly authorize report.export and the
 * report version inside the company transaction before invoking this adapter. */
export function accountingExportSnapshot(version: Entity) {
  assert(version && version.data, 'INVALID_STATE', { reason: 'ACCOUNTING_REPORT_DATA_INVALID' });
  const envelope = checked(z.object({ id: identifier, companyId: identifier }), version);
  const source = checked(sourceSchema, version.data);
  const snapshot = checked(snapshotSchema, version.data.snapshot);

  // Validate the ORIGINAL immutable snapshot and its checksum, never a stripped
  // projection. This shares the report PDF/XLSX/CSV source-integrity contract.
  reportExportSnapshot(version);
  assert(source.siteId === snapshot.site.id && source.templateVersion === snapshot.templateVersion &&
    (snapshot.version === undefined || snapshot.version === source.version), 'INVALID_STATE', {
    reason: 'ACCOUNTING_REPORT_SOURCE_MISMATCH',
  });
  assert(Date.parse(snapshot.periodStart) < Date.parse(snapshot.periodEnd), 'INVALID_STATE', {
    reason: 'ACCOUNTING_REPORT_PERIOD_INVALID',
  });
  // BigInt catches rounded intermediate sums even when each input is itself a
  // safe integer. No arithmetic here changes the source's agreed money.
  assert(BigInt(snapshot.baseNetCents) + BigInt(snapshot.approvedChangesNetCents) === BigInt(snapshot.totalNetCents) &&
    BigInt(snapshot.totalNetCents) + BigInt(snapshot.totalTaxCents) === BigInt(snapshot.totalGrossCents), 'INVALID_STATE', {
    reason: 'ACCOUNTING_REPORT_TOTAL_MISMATCH',
  });
  assert(snapshot.hoursRows.reduce((sum, row) => sum + BigInt(row.seconds), 0n) === BigInt(snapshot.totalSeconds),
    'INVALID_STATE', { reason: 'ACCOUNTING_REPORT_HOURS_MISMATCH' });
  assert(new Set(snapshot.taskRows.map(row => row.taskId)).size === snapshot.taskRows.length, 'INVALID_STATE', {
    reason: 'ACCOUNTING_REPORT_DUPLICATE_TASK',
  });

  const companyAddress = addressText(snapshot.company.address);
  const customerAddress = addressText(snapshot.customer.address);
  const siteAddress = addressText(snapshot.site.address);
  const findings: { code: string; prerequisiteId: string; field?: string }[] = [
    { code: 'STRUCTURED_INVOICE_PROFILE_NOT_EVALUATED', prerequisiteId: 'EXT-19' },
    { code: 'STRUCTURED_INVOICE_VALIDATOR_NOT_RUN', prerequisiteId: 'EXT-19' },
    { code: 'ACCOUNTANT_ACCEPTANCE_NOT_RECORDED_BY_THIS_EXPORT', prerequisiteId: 'EXT-19' },
    { code: 'TAX_PROFILE_NOT_EXPORTED_OR_INFERRED', prerequisiteId: 'EXT-13' },
  ];
  if (snapshot.priceStatus === 'PROVISIONAL') findings.push({ code: 'REPORT_PRICE_IS_PROVISIONAL', prerequisiteId: 'EXT-13' });
  for (const [field, value] of [['company.addressText', companyAddress], ['customer.addressText', customerAddress], ['site.addressText', siteAddress]] as const) {
    if (value === null) findings.push({ code: 'ADDRESS_TEXT_UNAVAILABLE', prerequisiteId: 'EXT-01', field });
  }

  return {
    format: ACCOUNTING_EXPORT_FORMAT,
    documentType: 'ACCOUNTANT_REVIEW_DATA' as const,
    legalInvoiceIssued: false as const,
    structuredInvoiceValidated: false as const,
    source: {
      companyId: envelope.companyId,
      reportId: source.reportId,
      reportVersionId: envelope.id,
      documentVersion: source.version,
      reportNumber: snapshot.number || null,
      sourceSha256: source.sha256,
      publishedAt: source.publishedAt,
      templateVersion: source.templateVersion,
      previousReportVersionId: source.previousVersionId ?? null,
    },
    reportDocumentType: snapshot.documentType,
    parties: {
      company: { legalName: snapshot.company.legalName, addressText: companyAddress, registration: snapshot.company.registration || null, taxIdentifier: snapshot.company.taxId || null },
      customer: { id: source.customerId, name: snapshot.customer.name, addressText: customerAddress },
    },
    site: { id: snapshot.site.id, code: snapshot.site.code || null, name: snapshot.site.name, addressText: siteAddress },
    order: snapshot.order,
    performance: {
      language: snapshot.language,
      periodStart: snapshot.periodStart,
      periodEnd: snapshot.periodEnd,
      descriptionDe: snapshot.descriptionDe,
      totalSeconds: snapshot.totalSeconds,
      acceptedTasks: snapshot.taskRows,
      materials: snapshot.materialRows.map(row => ({ sku: row.sku || null, name: row.name, quantityBase: row.quantityBase, unit: row.unit, taskId: row.taskId ?? null, chargedSeparately: row.chargedSeparately })),
    },
    amounts: {
      currency: snapshot.currency,
      unit: 'EUR_CENT' as const,
      initialAgreedNetCents: snapshot.baseNetCents,
      approvedChangesNetCents: snapshot.approvedChangesNetCents,
      reportedNetCents: snapshot.totalNetCents,
      reportedTaxCents: snapshot.totalTaxCents,
      reportedGrossCents: snapshot.totalGrossCents,
      reportPriceStatus: snapshot.priceStatus,
      sourceTaxPresentation: snapshot.taxPresentation || null,
    },
    readiness: {
      accountantReview: 'PREPARED_FROM_PUBLISHED_REPORT' as const,
      structuredInvoice: 'NOT_READY' as const,
      profileValidation: 'NOT_RUN' as const,
      accountantAcceptance: 'NOT_RECORDED_BY_THIS_EXPORT' as const,
      findings,
    },
  };
}

export interface AccountingExport {
  bytes: Buffer;
  sha256: string;
  sourceSha256: string;
  reportVersionId: string;
  mimeType: typeof ACCOUNTING_EXPORT_MIME_TYPE;
}

export function renderAccountingExport(version: Entity): AccountingExport {
  const handoff = accountingExportSnapshot(version);
  const bytes = Buffer.from(canonicalReportJson(handoff) + '\n', 'utf8');
  return {
    bytes,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    sourceSha256: handoff.source.sourceSha256,
    reportVersionId: handoff.source.reportVersionId,
    mimeType: ACCOUNTING_EXPORT_MIME_TYPE,
  };
}
