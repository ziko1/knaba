# KnaBa — єдиний репозиторій / integration candidate

**Статус 2026-10-24:** source-only assembly, **NOT PRODUCTION READY**. Original 14 branches and ten Draft PRs are untouched. This integration branch adds both verified source trees without changing their contents, while preserving old root specification files.

## Layout

- `corporate-site/` — website, localized SEO, public Assistant, roles, current Worker/D1 leads. This subtree is from GitHub commit `db6c514c52d038b6491aa101bca6cd5fa76cc102`. Its source tree SHA is `6ce56eb811af9733ce9b0b08dab3b636dfaf6371`.
- `erp/` — complete KNABA DE V4 runtime, API, domain, PostgreSQL, worker, Android/iOS sources, native and SQL evidence and **original root AGENTS.md/PROJECT_MEMORY.md**. Imported from GitHub branch commit `35b687c400d423966742bac9f1e503032794dbf1`; tree `a242ddb1a8b6395cafbc3cacbc0ce510f0be3c43`.
- `docs/unified/` — separate integration memory, roadmap, backlog, budget, branch audit and versioned proposed contract; existing original project documents are not overwritten.
- `docs/plans/2026-10-24-knaba-integration-handover.md` — phased detailed implementation/verification/handover.

**This is not an ERP-CRM database integration.** Git source tree assembly does not cause leads to synchronize or operator chat to work. Site `/api/leads` is persisted to D1, not automatically inserted into ERP PostgreSQL.

## Working locally

Use Node 24 per `erp/package.json` (`>=24 <25`) and a version satisfying `corporate-site/package.json` (`>=22.23.4`). Use isolated synthetic databases and server-managed credentials. No production provider tokens in local scripts.

```sh
node scripts/verify-snapshot.mjs
npm ci --prefix corporate-site
npm ci --prefix erp
npm run check:site
npm run test:site
npm run check:erp
npm run test:erp
```

Each module's own instructions govern PostgreSQL setup, worker, build, browser and native tests. The commands above are **runbook instructions, not a claim they executed on this candidate**. Do not run `migrate` or `seed` against real data.

## Acceptance
1. Root source verification matches both subtree Git SHAs.
2. Source import and docs checked, no existing source modified.
3. Implement proposed D1↔ERP contract, real owner↔visitor chat, scoped identity and notifications in small reviewed increments.
4. Run actual Node24/PG17/D1/Chromium/WebKit/device/end-to-end scenarios, backup/restore, performance baseline and security review at integrated SHA; collect real company UAT.
5. Official release only after a separate explicit approval, approved credentials/legal docs, rollback and operational monitoring.

No production deployment or GitHub merge is part of this source assembly.

## Release safeguard
`npm run test:release-policy` exercises the bounded pure-Node policy tests; `npm run audit:release` deliberately exits with status 1 until `docs/unified/RELEASE_READINESS.json` has independently verified proofs for all gates. A syntactically complete receipt is **not** independent verification or a deploy authorization. Never bypass this script to interpret an untested integration branch as customer-ready.
