# Private blob storage and document exports

`createPrivateBlobStore(db, env)` selects PostgreSQL `media_blobs` unless `S3_BUCKET` is configured. Configuring S3 selects S3 explicitly: errors do not silently switch providers. Originals, sanitized customer copies and generated report artifacts use the same opaque blob interface; neither adapter exposes public URLs.

## API integration

`put({id, companyId, ownerId, bytes, mimeType, sha256?}, tx?)` validates the bytes and returns a receipt with the SHA-256, exact byte count, provider and `created` flag. PostgreSQL accepts the application's transaction client so its bytes, aggregate metadata, audit and outbox commit together. Reusing a key is allowed only for identical tenant, owner, MIME type and content. Reusing a corrupted PostgreSQL row fails even when its stored SHA field matches the original request.

S3 puts use `If-None-Match: *`, explicit server-side encryption and keys under a hashed company prefix. For S3, create immutable aggregate metadata only after a successful upload. If a transaction definitely rolls back, compensate only newly created objects (`created: true`). An uncertain transaction result requires reconciliation; deleting the object in that case can damage an already committed record. `delete` is for this controlled orphan cleanup and retention jobs, never a user-facing unauthenticated operation.

Authorize current company, role, site, employee and customer membership before `get(companyId, id)`. An opaque blob key is not an authorization token. Both adapters verify downloaded bytes against the stored content checksum; S3 downloads are bounded and rejected streams are closed. The storage limit is 25 MiB per blob. Image sanitation, malware/PDF scanning, retention policy and legal approvals belong to the application workflow.

## S3 configuration

| Variable | Meaning |
| --- | --- |
| `S3_BUCKET` | Existing private bucket; absence selects PostgreSQL. |
| `AWS_REGION` / `S3_REGION` | Region, default `eu-central-1`. |
| `S3_ENDPOINT` | Optional HTTPS S3-compatible endpoint. |
| `S3_FORCE_PATH_STYLE` | Path style unless explicitly `false`. |
| `S3_KMS_KEY_ID` | Optional KMS key; otherwise AES256 server-side encryption. |
| Standard AWS SDK credentials | Supplied through the runtime credential chain. |
| `S3_ALLOW_INSECURE_LOCAL_TEST=true` | Loopback HTTP test endpoint only; disabled in `PRODUCTION`. |

`probe()` makes an actual provider request and distinguishes configuration from availability. A private bucket policy, public-access block, region, credentials, KMS rights, retention and backup/restore of external S3 bytes must be verified against the real provider. Synthetic adapter tests do not verify those external controls.

## Published report artifacts

`apps/api/exporters.ts` renders German PDF, real XLSX and CSV from an immutable published `report_version`. The source checksum is canonical JSON SHA-256, stable across PostgreSQL JSONB object key order. Exports validate totals and hours before rendering. Approved photo bytes must match the immutable photo hash and MIME metadata. Embedding is limited to 40 photos and 20 MiB total. PDF contains an embedded licensed DejaVu font for German text; A dependency-free ECMA-376 OOXML writer creates ZIP parts with CRC32 and validates image signatures; independent Python openpyxl tests read and re-save the generated workbooks. Spreadsheet rows preserve exact integer cents, seconds and material base quantities. Integers with 16 or more digits are text cells because Excel numeric cells have a 15-digit precision limit. CSV neutralizes formula-like text.

The API uses `archiveReportArtifact` to persist each generated version/format artifact once and return those archived bytes on later downloads. Deterministic blob keys use the immutable report version as their stable owner; the requesting user is retained separately in the artifact audit. Store the artifact SHA separately from the report's source snapshot SHA. Regenerating a historical PDF after a renderer change does not preserve the document that was delivered. Historical access still requires a currently active customer membership.

The focused tests create synthetic PDF/XLSX/CSV examples at `/tmp/knaba-de-test-artifacts` after a successful run. No real employee, customer or payroll information is included. External S3 and physical barcode/camera checks require deployment credentials and device evidence.
