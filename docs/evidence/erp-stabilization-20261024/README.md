# KNABA DE — isolated ERP build and dependency stabilization

Date: 2026-10-24. Source branch: a new unmerged candidate, based exactly on
deploy/knaba-vps-20261013 commit 35b687c400d423966742bac9f1e503032794dbf1.
This branch must not be mistaken for PR #12's immutable ERP import, nor the
already reviewed PR #6 executable or an approved production release.

## Root-cause reproduction and smallest change

- Original Vite 7.3.7 / Rollup 4.64.0 production build did not complete during
  a bounded 240-second local attempt; subsequent bounded reproduction isolated
  the stall to the react-dom/client import and tree-shaking path. A no-React
  minimal page and CSS-only input built normally.
- Changing only Rollup to 4.65.0 via an exact npm override made the full
  Vite production bundle complete, without disabling tree shaking or
  changing the React application source.
- Exact overrides for body-parser 2.4.0 and multer 2.5.0 address the
  October 22 availability advisories
  GHSA-27r3-jxmh-p828 and GHSA-q7qp-rjg7-q26m.
- npm ci --ignore-scripts, npm run typecheck and npm run build: PASS,
  Node 24.19.0, locally downloaded from nodejs.org with verified SHA256.
- Full available CPU test suite with isolated openpyxl 3.1.5, Pillow 11.3.0
  and Poppler 24.02.0: 1,864 PASS / 0 FAIL / 429 SKIPPED. The skipped tests
  include actual PostgreSQL integration and remain NOT_RUN.
- Production npm audit --omit=dev: 2 HIGH remaining, zod 3.25.76 and
  zod-to-json-schema (via Zod). This is NOT production security acceptance.
- A trial Zod 4.6.7 and converter 3.25.2 lowered npm audit to zero but caused
  56 TypeScript errors (including ZodEffects, z.record and converter
  schemas). This incompatible migration was reverted. Do not hide findings
  by forcing an unsafe major version or bypassing validation.

## Evidence limits

- The fixed test build is from this candidate's package.json and
  package-lock.json bytes against the above Git parent; it is not a
  deployed artifact or an accepted clean Git SHA until committed and rerun.
- Client JS 653,953 bytes (207.75 kB gzip), CSS 90,345 bytes (18.17 kB gzip).
  Vite warns about a 500 kB minified JS chunk; field Web Vitals NOT_RUN.
- No live business databases, D1 migrations, credentials, payments, provider
  calls, native devices, production services or GitHub hosted Actions involved.
- No external billable service activated. Local compute expenditure
  unmetered/UNKNOWN; added cloud spending approved: EUR 0.
- Preserve root/ERP project memory, canonical V4 spec, roadmap, and acceptance
  history without relabeling prior passing artifacts.

## Release blockers and follow-up

1. Safely migrate Zod v3 -> v4 with schema/JSON-Schema contract golden tests,
   payload/array limits and real HTTP negative tests before removing last highs.
2. Run real isolated PostgreSQL and protected HTTP acceptance, plus full
   role/site/tenant isolation, 27 browser cases, native and worker-restart tests.
3. Examine chunk-splitting only after p75 Web Vitals measurements; do not
   trade correctness for a green build or relabel a local synthetic check as live.
4. Integrate this reviewed ERP patch into the separate PR #12 source tree
   with updated source-integrity manifest and complete integrated QA.
5. Keep PR #13 owner negotiation and PR #14 language dropdown distinct and
   unmerged until compatible site+ERP contract testing.
6. Production deployment, DNS, payment/AI providers, merge and customer
   acceptance require separate explicit approval and evidence.

Rollback: revert the two dependency files together to the original pinned
base and reinstall with npm ci; no DB migration or live data changes.
