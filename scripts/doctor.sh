#!/usr/bin/env bash
set -Eeuo pipefail
knaba_repo_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cd -- "$knaba_repo_root"
knaba_failures=0
knaba_check() { if "$@"; then echo "PASSED: $1"; else echo "FAILED: $1" >&2; knaba_failures=$((knaba_failures+1)); fi; }
knaba_check node -e "if(Number(process.versions.node.split('.')[0])!==24)process.exit(1)"
knaba_check npm --version
knaba_check node -e "const p=require('./package-lock.json');if(p.lockfileVersion<3)process.exit(1)"
knaba_check openssl version
knaba_check tar --version
knaba_check node scripts/environment-check.mjs
if command -v docker >/dev/null; then
  knaba_check docker compose version
  knaba_check docker info --format '{{.ServerVersion}}'
  if [[ -n ${DATABASE_URL:-} && -n ${AUTH_ENCRYPTION_KEY:-} && -n ${POSTGRES_PASSWORD:-} && -n ${GIT_SHA:-} ]]; then
    if [[ -n ${KNABA_ENV_FILE:-} ]]; then knaba_check docker compose --env-file "$KNABA_ENV_FILE" -f infra/compose.yml config --quiet; else knaba_check docker compose -f infra/compose.yml config --quiet; fi
  else echo 'NOT_RUN: Compose validation requires the complete private environment.'; fi
else echo 'NOT_RUN: Docker is unavailable; native Node/PostgreSQL operation remains possible.'; fi
if [[ -n ${DATABASE_URL:-} && -d node_modules/pg ]]; then knaba_check node scripts/database-check.mjs; else echo 'NOT_RUN: database probe requires DATABASE_URL and installed dependencies.'; fi
if (( knaba_failures > 0 )); then echo "FAILED: $knaba_failures environment checks." >&2; exit 1; fi
echo 'PASSED: requested configured environment checks; provider/legal/physical prerequisites require separate evidence.'
