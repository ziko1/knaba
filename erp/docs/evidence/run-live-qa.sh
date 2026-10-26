#!/usr/bin/env bash
set -euo pipefail
qa_repo_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
cd -- "$qa_repo_dir"
: "${DATABASE_URL:?Set the isolated PostgreSQL QA database URL.}"
: "${EXPECTED_GIT_SHA:?Set the exact 40-character final build Git SHA.}"
export E2E_BASE_URL="${E2E_BASE_URL:-http://127.0.0.1:3000}"
knaba_qa_phase=${KNABA_QA_PHASE:-all}
case "$knaba_qa_phase" in all|runtime|unit|browser) ;; *) echo 'FAILED: unknown QA phase.' >&2; exit 1 ;; esac

node --import tsx --input-type=module <<'JS'
import {Database} from './apps/api/database.ts';
const db=new Database();
try {
 const result=await db.query('SELECT current_database() AS name');
 if(!/qa/i.test(result.rows[0].name))throw Error('SQL tests require a separately named QA database.');
 await db.migrate();
 console.log('Isolated PostgreSQL QA schema ready.');
} finally {await db.close();}
JS

node --input-type=module <<'JS'
import {writeFileSync} from 'node:fs';
const origin=process.env.E2E_BASE_URL,sha=process.env.EXPECTED_GIT_SHA;
if(!/^[a-f0-9]{40}$/.test(sha)||/^0+$/.test(sha))throw Error('Exact final SHA required.');
const checks={};
for(const path of ['/api/v1/version','/api/v1/health','/api/v1/ready']){
 const r=await fetch(origin+path,{signal:AbortSignal.timeout(10000)});
 if(!r.ok)throw Error(`${path}: HTTP ${r.status}`);
 checks[path]=await r.json();
}
if(checks['/api/v1/version'].gitSha!==sha)throw Error('The running bundle SHA differs from the requested final release SHA.');
if(checks['/api/v1/version'].mode!=='DEMO')throw Error('Browser mutation tests require isolated DEMO runtime.');
writeFileSync('docs/evidence/live-runtime.json',JSON.stringify({verifiedAt:new Date().toISOString(),origin,expectedGitSha:sha,checks},null,2)+'\n');
console.log(`Live bundle verified: ${sha}`);
JS

if [[ "$knaba_qa_phase" == all || "$knaba_qa_phase" == unit ]]; then
 npx --no-install vitest run --no-file-parallelism --reporter=json --outputFile=docs/evidence/release-live-unit.json
fi
if [[ "$knaba_qa_phase" == all || "$knaba_qa_phase" == browser ]]; then
 npx --no-install playwright test
fi
