# KNABA DE code continuation — 2026-10-08

Base: `knaba-staging` commit `e18f293ac1527fff0910a86cd3049bef8bd4a03f`, Git tree `51aa98dbb291be16f9e863102795f2a8670779c2`. All 347 source files were recovered through the GitHub connector. The local reconstructed baseline tree was independently matched byte-for-byte; no previous code or acceptance receipt was replaced.

## Resulting behavior

- A current private authentication failure clears the mounted console and its private reads. Delayed failures from an older session cannot revoke a newer login. Scoped denials and approval-required commands retain their existing error behavior.
- Chat reads, sends and translations bind to their original conversation and authority generation. Switching from A to B while A completes preserves B's messages and typed draft.
- Published report versions can be downloaded as canonical accountant-review JSON using `GET /api/v1/reports/:id/accounting-json`. The endpoint rechecks `report.export` and current company/site visibility inside the serving transaction, rejects external and mixed external roles, preserves exact EUR cents and immutable source hashes, and performs no archival or financial mutations. The console offers the download only to the corresponding internal roles. [Contract and limitations](ACCOUNTING_EXPORT.md).

## Verification boundary

The authored current inventory has 1,558 unit/integration definitions: 1,339 CPU/document/explicit transport cases and 219 real PostgreSQL cases. The browser configuration discovers the prior 24 scenarios plus two new explicitly annotated HTTP transport regressions. These counts describe authored coverage, not passed tests.

Node 24 TypeScript syntax and Git whitespace checks passed locally. This environment has no installed dependencies and denies shell socket access; local full TypeScript/build/Vitest/PostgreSQL/browser checks are NOT_RUN. The existing GitHub workflows will verify the exact published candidate and retain actual failures or passes. Previous `ca9ed79` results remain historical acceptance for that source only.

## Remaining release inputs

The existing external-prerequisite list remains authoritative. This handoff does not issue or validate XRechnung/ZUGFeRD invoices, invent a tax profile, execute a bank/supplier transaction or prove real provider/native-device acceptance. The previously bounded Railway trial ended at `2026-10-07T20:11:52Z`; no new trial, Dashboard MFA bypass, production activation or merge is performed by this code continuation.
