# ERP contract QA harnesses

These two `.ts.fixture` files preserve the exact bytes of independently executed TypeScript harnesses. They are copied into an isolated ERP checkout before execution. The fixture suffix keeps them outside website TypeScript checking and Vitest discovery; no compiler suppression or website test configuration is required.

The ERP source was pinned to **`683c09d0346fd05e0f2cd323da640bbb176c5c47`**. All **545 tracked ERP files** in the executed export matched that commit's Git blobs. Runtime: Node **24.22.1**, PostgreSQL **17.11**, Vitest **4.1.11**. This is synthetic integration evidence, not production acceptance.

## Recorded results

| Execution | Result |
| --- | --- |
| `node --import tsx tests/bridge-http.pg.qa.ts` | 12 HTTP/PostgreSQL check groups passed; exit 0 |
| `node node_modules/vitest/vitest.mjs run tests/integration-events.test.ts` | 50 passed, 0 skipped, including 4 PostgreSQL cases; exit 0 |
| `node --import tsx tests/bridge-website.pg.qa.ts` | 4 combined website/HTTP/PostgreSQL check groups passed; exit 0 |
| ERP `npm run typecheck`, including both harnesses | Passed; exit 0 |

The standalone HTTP harness checks raw-byte HMAC, unknown/disabled/unapproved credentials, timestamp/header tampering, caller company override, source mismatch, inactive mapping, malformed/oversized JSON, concurrent deduplication, audit/outbox counts, quarantine and company isolation. It starts the actual `createApiModule` and uses the integration raw-body/error middleware from `apps/api/main.ts`, with a loopback-only listener.

The combined harness uses unmodified website preview, confirmation and dispatcher functions, the production SQL migrations through a real Node SQLite adapter, the actual Nest route and PostgreSQL. Only the transport destination is injected: the reserved `https://erp.example.test` URL is sent to the local Nest listener. An intentionally lost response after a real ERP commit is retried with identical event bytes: ERP returns `duplicate:true` and the same effect ID, with exactly one lead, one audit entry and one `lead.created` outbox entry. A website-allowed service absent from ERP mapping produces `QUARANTINED`, with no further automatic dispatch. Total: 3 actual HTTP calls and 1 authoritative lead.

Observed HTTP responses are `201` for both `APPLIED` and `QUARANTINED`, `403` for authentication denial, `422` for inactive mapping, and `400` for invalid envelope/JSON. Callers must inspect the receipt, not only HTTP success. The generic route uses `ApiExceptionFilter`; the separately exported `integrationEventError` helper is not its HTTP error mapper.

## Evidence and source boundaries

Sanitized receipts and logs are in [docs/evidence/assistant-erp-contract](../../docs/evidence/assistant-erp-contract/):

- `verification.json`: scope, checks, HTTP contract and limitations.
- `http-results.log`, `integration-results.log`, `combined-results.log`: executed results.
- `source-fingerprints.json`: all tested website and harness SHA-256 hashes.
- `source-verification.json`: ERP Git-blob comparison.
- `cleanup.json`: removal of the isolated runtime and temporary sources.

Tested website implementation hashes:

| File | SHA-256 |
| --- | --- |
| `worker/assistant-erp.ts` | `e2b3e4936d0de8f504a5ee758682c5ff4c5a2ef412902921ac4b15c15b0aebee` |
| `worker/assistant-erp-dispatch.ts` | `e6f42d70cc2897f0990a089ec46393f4b6d83d6c0546424d0e220610eb95c27a` |
| `drizzle/0005_assistant_erp_bridge.sql` | `20b356d984205853336590c54e89f36d46661d53e867b8c6e802a621a22c6c29` |

After this copied source snapshot, the candidate added owner diagnostics/DTOs and adjusted cancellation for `SENDING` with zero attempts. The exercised preview, confirmation, configuration, payload, signing and dispatcher paths were unchanged. These receipts do not claim whole final-file equality or cover those later diagnostic/cancellation cases. Their website tests are separate. The combined harness snapshots whichever candidate source is supplied for a rerun and prints its hashes.

The root snapshot verifier at the pinned ERP baseline returned exit 1: expected ERP tree `a242ddb1a8b6395cafbc3cacbc0ce510f0be3c43`, actual tree `d269a8cc681e3c1d0d7dd334c6f587bc3625b481`. This inherited gate failure is not a passing release gate and was not changed by QA.

## Reproduce in isolated Docker containers

Run from the candidate repository root with Bash, Git, Python 3 and Docker. Use disposable resources only. Do not point `DATABASE_URL` at a live database. The synthetic test keys/password below are fixtures, not operational credentials; no provider bindings or environment files are needed.

The executed run used cached Docker image IDs below. They identify the recorded runtime exactly. On a different host, obtain equivalent Node 24 and PostgreSQL 17 images before creating the internal network, set the two image variables accordingly, and record the resulting versions/digests as a new run rather than reusing this receipt.

```bash
set -euo pipefail
export CANDIDATE_ROOT="$(git rev-parse --show-toplevel)"
export QA_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/knaba-erp-contract.XXXXXX")"
ERP_SHA=683c09d0346fd05e0f2cd323da640bbb176c5c47
QA_NODE_IMAGE=sha256:8433527044106376f4aee0e816a39b5f5da67cf6282796798a6fa8bfec7b4986
QA_PG_IMAGE=sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24
QA_NET="knaba-erp-contract-$(date +%s)-$$"
QA_PG="${QA_NET}-pg"
docker image inspect "$QA_NODE_IMAGE" "$QA_PG_IMAGE" --format '{{.Id}}'
git cat-file -e "$ERP_SHA^{commit}" || git fetch origin "$ERP_SHA"
git worktree add --detach "$QA_ROOT/erp-source" "$ERP_SHA"

python3 - <<'PY'
import os, pathlib, shutil, hashlib, json
candidate = pathlib.Path(os.environ['CANDIDATE_ROOT'])
checkout = pathlib.Path(os.environ['QA_ROOT']) / 'erp-source'
archive = candidate / 'corporate-site/tests/erp-contract-qa'
for name in ['bridge-http.pg.qa.ts', 'bridge-website.pg.qa.ts']:
    shutil.copyfile(archive / (name + '.fixture'), checkout / 'erp/tests' / name)
source = candidate / 'corporate-site'
fixture = checkout / 'corporate-site-bridge-fixture'
paths = [pathlib.Path(p) for p in [
    'package.json', 'worker/assistant-erp.ts', 'worker/assistant-erp-dispatch.ts',
    'worker/types.ts', 'src/lib/assistant-erp-contract.ts',
    'tests/helpers/assistant-erp-fixture.ts']]
paths += [p.relative_to(source) for p in sorted((source / 'drizzle').glob('*.sql'))]
hashes = {}
for relative in paths:
    data = (source / relative).read_bytes()
    target = fixture / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
    hashes[str(relative)] = hashlib.sha256(data).hexdigest()
(fixture / 'source-hashes.json').write_text(json.dumps(hashes, indent=2) + '\n')
print(json.dumps(hashes, indent=2))
PY

# Dependency acquisition is completed before isolated test networking.
docker run --rm --cpus 1 --memory 1g --pids-limit 128 --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,size=256m \
  --mount "type=bind,src=$QA_ROOT/erp-source,dst=/work" -w /work/erp \
  "$QA_NODE_IMAGE" sh -c \
  'npm ci --ignore-scripts --no-audit --no-fund --cache /tmp/npm && mkdir -p node_modules/.vite node_modules/.vite-temp'

cleanup() {
  docker stop --timeout 10 "$QA_PG" >/dev/null 2>&1 || true
  docker network rm "$QA_NET" >/dev/null 2>&1 || true
  git -C "$CANDIDATE_ROOT" worktree remove --force "$QA_ROOT/erp-source" || true
}
trap cleanup EXIT
docker network create --internal "$QA_NET"
docker run -d --rm --name "$QA_PG" --network "$QA_NET" \
  --cpus 0.5 --memory 512m --pids-limit 100 --read-only \
  --tmpfs /var/lib/postgresql/data:rw,nosuid,size=256m \
  --tmpfs /var/run/postgresql:rw,noexec,nosuid,size=16m \
  --tmpfs /tmp:rw,noexec,nosuid,size=16m \
  -e POSTGRES_USER=knaba_synthetic -e POSTGRES_DB=knaba_bridge_test \
  -e POSTGRES_PASSWORD=synthetic-isolated-qa-only \
  "$QA_PG_IMAGE" postgres -c shared_buffers=32MB -c max_connections=30
for attempt in {1..30}; do
  if docker exec "$QA_PG" pg_isready -U knaba_synthetic -d knaba_bridge_test; then break; fi
  sleep 1
done
docker exec "$QA_PG" pg_isready -U knaba_synthetic -d knaba_bridge_test
docker exec "$QA_PG" psql -U knaba_synthetic -d knaba_bridge_test -Atc 'SELECT version()'
docker network inspect "$QA_NET" --format '{{.Internal}}'

docker run --rm --network "$QA_NET" --cpus 1 --memory 1g \
  --pids-limit 128 --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,size=128m \
  --tmpfs /work/erp/node_modules/.vite:rw,nosuid,size=32m \
  --tmpfs /work/erp/node_modules/.vite-temp:rw,nosuid,size=32m \
  --mount "type=bind,src=$QA_ROOT/erp-source,dst=/work,readonly" -w /work/erp \
  -e "DATABASE_URL=postgresql://knaba_synthetic:synthetic-isolated-qa-only@$QA_PG:5432/knaba_bridge_test" \
  "$QA_NODE_IMAGE" sh -ec '
    node --version
    node node_modules/typescript/bin/tsc --noEmit
    node --import tsx tests/bridge-http.pg.qa.ts
    node node_modules/vitest/vitest.mjs run tests/integration-events.test.ts
    node --import tsx tests/bridge-website.pg.qa.ts
  ' | tee "$QA_ROOT/rerun.log"
```

The trap removes only this run's PostgreSQL container/network and isolated worktree. Preserve `$QA_ROOT/rerun.log` before removing that remaining temporary directory. Test containers use `--rm`; PostgreSQL data lives only in its bounded tmpfs. No ports are published, no existing database/secret paths are mounted, and no provider worker runs.

The original run verified cleanup of its containers, network, temporary export/dependencies and PostgreSQL tmpfs. Local native PostgreSQL setup was unavailable because the environment mapped only UID 0 without capabilities; its root safeguard was not bypassed. An existing authorized VPS supplied the isolated Docker runtime. No live service changes, paid resources, commits or pushes were made.

Not covered: browser/UI and website HTTP authentication, actual Cloudflare D1/scheduler, live provider/WhatsApp/CRM integration, the full ERP regression suite, deployment or production data.
