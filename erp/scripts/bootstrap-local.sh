#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
knaba_repo_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cd -- "$knaba_repo_root"
knaba_env_file=${KNABA_ENV_FILE:-.env.local}
knaba_unset=( -u PORT )
while IFS='=' read -r knaba_key _; do
  [[ $knaba_key =~ ^[A-Z][A-Z0-9_]*$ ]] && knaba_unset+=( -u "$knaba_key" )
done < .env.example
knaba_with_env() { env "${knaba_unset[@]}" "$@"; }
command -v node >/dev/null || { echo 'FAILED: Node 24 is required.' >&2; exit 1; }
command -v docker >/dev/null || { echo 'FAILED: Docker with Compose v2 is required.' >&2; exit 1; }
command -v openssl >/dev/null || { echo 'FAILED: OpenSSL is required to create private random credentials.' >&2; exit 1; }
knaba_release_sha=$(git rev-parse HEAD)
[[ $knaba_release_sha =~ ^[a-f0-9]{40}$ ]] || { echo 'FAILED: commit the tested release to obtain an exact Git SHA.' >&2; exit 1; }
if [[ -n $(git status --porcelain --untracked-files=normal) ]]; then
  echo 'FAILED: bootstrap requires a clean release checkout so GIT_SHA identifies the actual built source. Save and commit intended source changes first.' >&2
  exit 1
fi
if [[ ! -e "$knaba_env_file" ]]; then
  knaba_pg_password=$(openssl rand -hex 32)
  knaba_auth_key=$(openssl rand -hex 32)
  cat > "$knaba_env_file" <<CONFIG
APP_MODE=DEMO
COMPANY_ID=knaba-demo
POSTGRES_DB=knaba
POSTGRES_USER=knaba
POSTGRES_PASSWORD=$knaba_pg_password
POSTGRES_PORT=5432
DATABASE_URL=postgresql://knaba:$knaba_pg_password@postgres:5432/knaba
API_PORT=3000
AUTH_ENCRYPTION_KEY=$knaba_auth_key
PUBLIC_ORIGIN=http://localhost:3000
GIT_SHA=$knaba_release_sha
LIVE_SEND_ALLOWED=false
WHATSAPP_ACCOUNT_CAPABILITIES_VERIFIED=false
AI_SYNTHETIC_ONLY=true
CONFIG
  chmod 600 -- "$knaba_env_file"
  echo "PASSED: private DEMO configuration created at $knaba_env_file; credential values were not printed."
fi
knaba_with_env node --env-file="$knaba_env_file" scripts/environment-check.mjs
knaba_with_env node --env-file="$knaba_env_file" -e "if(!['DEMO','TEST'].includes(process.env.APP_MODE))throw new Error('LOCAL_BOOTSTRAP_REQUIRES_DEMO_TEST');if(process.env.GIT_SHA!==process.argv[1])throw new Error('ENV_SHA_DIFFERS_FROM_CHECKOUT');if(process.env.LIVE_SEND_ALLOWED==='true')throw new Error('LOCAL_BOOTSTRAP_MUST_NOT_SEND_REAL_MESSAGES')" "$knaba_release_sha"
knaba_compose() { knaba_with_env docker compose --env-file "$knaba_env_file" -f infra/compose.yml "$@"; }
knaba_compose config --quiet
knaba_compose build bootstrap
# Compose's completed-successfully gate runs migration and synthetic seed first.
knaba_compose up -d --wait --wait-timeout 240 api worker
knaba_api_port=$(knaba_with_env node --env-file="$knaba_env_file" -p "process.env.API_PORT||'3000'")
[[ $knaba_api_port =~ ^[0-9]+$ ]] || { echo 'FAILED: invalid API_PORT.' >&2; exit 1; }
GIT_SHA="$knaba_release_sha" KNABA_BASE_URL="http://localhost:$knaba_api_port" node scripts/smoke.mjs
echo 'PASSED: isolated DEMO bootstrap, migration/seed ordering and requested health smoke. Authenticated business and physical device checks require their own evidence.'
