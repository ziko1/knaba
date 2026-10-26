#!/usr/bin/env bash
set -Eeuo pipefail
knaba_repo_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cd -- "$knaba_repo_root"
node scripts/environment-check.mjs
npm run typecheck
if [[ -n ${TEST_DATABASE_URL:-} ]]; then export DATABASE_URL="$TEST_DATABASE_URL"; fi
if [[ -z ${DATABASE_URL:-} ]]; then echo 'NOT_RUN: PostgreSQL integration tests require a separate authorised TEST_DATABASE_URL.'; fi
npm test
npx vitest run --config apps/web/vitest.config.ts
npm run build
if [[ ${1:-} == --live ]]; then
  : "${KNABA_BASE_URL:?Set the actual deployed KNABA_BASE_URL for --live}"
  node scripts/smoke.mjs "$KNABA_BASE_URL"
fi
if [[ ${RUN_E2E:-0} == 1 ]]; then npm run test:e2e; else echo 'NOT_RUN: browser/device verification; set RUN_E2E=1 with the authorised target to run browser E2E.'; fi
echo 'PASSED: requested release checks. This status excludes external integrations and physical tests without their own evidence.'
