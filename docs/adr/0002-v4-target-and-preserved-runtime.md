# ADR 0002 — V4 target contracts with the preserved working runtime

Status: **ACCEPTED** for specification adoption and runtime architecture, by explicit user decision on 2026-10-08. This is not application acceptance or a deployment approval extension. [Decision receipt](../planning/V4_SCOPE_DECISION.json).

## Context

GitHub main separately published V4 at `ff748a2e5731e973883344ed28f3e82cf8a3bc06`, including 24 sections and 72 unexecuted acceptance criteria. The implemented product remains on knaba-staging with source-specific technical acceptance at `ca9ed79ff4c0429223eb60754289ee1132088361`. V4 names Prisma and Redis/BullMQ; the actual product already uses NestJS, Node 24, direct PostgreSQL SQL and a transactional leased outbox. The full [V3/V4 reconciliation](../planning/V3_V4_RECONCILIATION_UK.md) records 22 contract differences and the missing whole-criterion evidence.

The user selected: **“V4 — цільова; зберегти працюючий стек через погоджені ADR (рекомендовано)”**. The attached original V3 must remain byte-preserved, and working features must not be rewritten without a demonstrated reason.

## Decision

1. [KNABA_DE_TARGET_SPEC.md](../../KNABA_DE_TARGET_SPEC.md) is the byte-preserved V4 target. [KNABA_DE_MASTER_SPEC.md](../../KNABA_DE_MASTER_SPEC.md) remains the original V3 reference. V4 governs conflicting target contracts; retain non-conflicting implemented functionality and regression history from V3. Record individual criterion/version decisions rather than silently deleting requirements.
2. Preserve NestJS / Node 24 / PostgreSQL using pg/SQL. Keep commands, business effects, revision/audit, receipts and outbox in one authoritative transaction, with current company/site/self/customer authorization, fencing, leases and idempotency. No Prisma migration is required solely to rename the existing persistence layer.
3. Preserve the PostgreSQL outbox and separate leased Worker instead of introducing Redis/BullMQ solely for stack conformity. Preserve observed restart/retry/rollback/privacy safeguards and test the selected V4 functional behavior, real deployed delivery and measured load. Redis or another component requires a specific unmet function or measured capacity reason and a reviewed migration, recovery and cost case within the actual authorized budget.
4. This architecture decision does not exempt V4 MFA, lifecycle, APIs, data limits, payroll, native/GPS rules, notifications, integration, load or disaster-recovery requirements. Implement the selected contracts through PLAN-03 and assess all 72 V4 criteria separately. Exact integer EUR cents and base units remain canonical; decimal boundary inputs require exact conversion, not floating-point business calculations.
5. Retain default-deny scopes, immutable accepted business facts/original media/history, minimized privacy data and explicit human authority. AI does not authorize money, payroll or GPS. Real providers, tracking, legal/company inputs, signing and devices retain their existing external gates.

## Validation and consequences

Existing ca9 evidence remains valid for its executed source/scope, not as V4 whole-product acceptance. Changed executable source needs a new exact Git SHA and appropriate hosted SQL/browser/build/container/recovery/worker/native proof. Deployment-only changes have a separate config digest/read-back; document-only commits do not retag ca9 runtime.

The 72 V4 whole criteria are **NOT_RUN**. PLAN-28 still completes the remaining precise contract/parameter reconciliation; selecting the version and runtime architecture resolves only those subgates. Company UAT, physical tests, measured load/RPO/RTO/cost and public deployment must actually run before readiness claims. The original Railway cutoff remains expired and unchanged, and the provider Dashboard MFA boundary remains in force.
