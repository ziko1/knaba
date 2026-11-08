# Privacy v2 backend — frozen review handoff

Status: source and CPU boundary verified; independent review and actual PostgreSQL acceptance pending. F3 dependency was accepted separately on `6a395bb73501455371a0e281debf81a6c18c6329`.

## Source ownership

Exactly seven paths in `knaba-privacy-v2`, listed and hashed by `source-manifest.json`. Runtime changes are governance version support, a pure minimized metadata projection, a six-query SQL adapter, and the Engine adapter import/registration. No migration/index, UI, native, worker, CI, federation grant/config or erasure source changed.

## Public contract

`privacy.request` accepts an absent-preserving optional `knaba-dsar-v1` / `knaba-dsar-v2` only for ACCESS. Present undefined/null/unknown is invalid; ERASURE with any supplied version is invalid. Stored request selects the version. `privacy.review` requires matching current legal scope and requested categories. Existing v1 parsed input digests, absent request/status field, ACK keys and canonical bytes are preserved. v2 ACK adds only its explicit projectionVersion.

Only v2 plus PROFILE invokes the loader. v2 without PROFILE never loads federation data. The snapshot retains the existing categories and includes companyId for v2. Metadata means historical ERP storage, not a live source authority assertion. Root-owned prepare modal validates compact ACK version against its immutable request; saved artifact cards can additionally inspect outer/snapshot version agreement. Download checks owned request/subject/category/version/checksum association using the existing original/current/final authority path. Existing saved artifacts do not require renewed legal preparation approval.

## Loader and minimization

The current company transaction runs six reads: F1 bindings; F2 link attempts; joined F2 principals; joined F2 source sessions; attributed F3 login attempts; mandatory F3 child/parent lineage. Each SQL WHERE scopes company/user before a remaining-limit-plus-one. Immutable exact binding and issuer/audience/subject joins establish historical ownership; no email/name or active-trust join is used. Known-own malformed links remain in LEFT JOIN results and fail the entire export. Anonymous F3 rows are not inferred from parent cookies. Source-session rows count before summary aggregation; the shared bound is exactly 25,000 source rows.

The strict row DTO and explicit constructors omit every token/hash/proof/epoch/sessionRef, unconfirmed site identity, arbitrary JSON, operation result and global audit payload. Summary contains only own binding/authority, stored principal state/time and five stored state/expiry counts. Retention dispositions cover the six own groups plus this derived export, all PRESERVE_PENDING_APPROVED_METADATA_CLASS with deletionEligible=false and deletionExecuted=false. Shared operations/audit and source storage are omissions, not empty/erased claims. No source RPC is introduced. No TTL or destructive action exists.

## Evidence

- Baseline: four new v2 cases fail; v1 golden bytes/ACK case passes.
- Final CPU: 204 PASS (67 governance, 27 metadata/adapter, 110 existing erasure), no failures/skips. Memory/SQL doubles are explicitly named; these do not establish PostgreSQL filtering or locking.
- Full TypeScript check: exit 0; diff whitespace check: exit 0.
- Real PG/HTTP suite: 15 cases authored and collected, all locally skipped because PostgreSQL is unavailable. The existing Vitest glob includes this file. Use the existing CI dedicated PostgreSQL service, APP_MODE=TEST and DATABASE_URL; no new job or timeout is required.

Exact focused CI command: `APP_MODE=TEST npx vitest run tests/privacy-federation.integration.test.ts --reporter=verbose` from `erp/`, with the already-provisioned dedicated DATABASE_URL. All 15 must execute with zero skips before actual SQL acceptance.

## Required independent review focus

Own-company/user SQL joins including issuer/audience collisions; malformed attributable rows; revoked history without current-source validity claims; true absent-only v1 compatibility; no partial artifact/event/receipt on overflow; same-key unknown ACK preserves immutable bytes; no new-key duplicate; current preparation policy checks; actual HTTP foreign download and post-commit exact session revocation. SQL seeds retain production constraints and use only synthetic data. The final HTTP race wrapper observes a real committed read and performs a real separately committed revocation; it does not replace authentication or result production.

Actual SQL, browser integration, live data, production and legal classification remain separate gates. No whole-system readiness is asserted.
