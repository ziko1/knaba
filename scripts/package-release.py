#!/usr/bin/env python3
"""Package a clean committed candidate; this does not certify runtime/deployment."""
from pathlib import Path
import hashlib, json, os, stat, subprocess, zipfile

root = Path(__file__).resolve().parents[1]
os.chdir(root)
def run(*args):
    return subprocess.run(args, check=True, stdin=subprocess.DEVNULL, capture_output=True, text=True).stdout.strip()
sha = run('git', 'rev-parse', 'HEAD')
source_paths = ['apps','packages','infra','scripts','tests','package.json','package-lock.json','tsconfig.json','vitest.config.ts','playwright.config.ts']
if run('git','status','--porcelain','--',*source_paths):
    raise SystemExit('CLEAN_COMMITTED_SOURCE_REQUIRED')
release = json.loads(Path('dist/release.json').read_text())
if release['code_sha'] != sha or release['source_dirty'] is not False:
    raise SystemExit('EXACT_CLEAN_BUILT_RELEASE_REQUIRED')
out = root/'artifacts'
out.mkdir(exist_ok=True)
prefix = 'knaba-de/'
short = sha[:7]
source = out/f'KNABA_DE_SOURCE_{short}.zip'
bundle = out/f'KNABA_DE_GIT_{short}.bundle'
run('git','archive','--format=zip',f'--prefix={prefix}',f'--output={source}',sha)
run('git','bundle','create',str(bundle),'--all')
run('git','bundle','verify',str(bundle))

dependency_paths = run('npm','ls','--omit=dev','--all','--parseable').splitlines()[1:]
dependency_paths += [str(root/'node_modules'/p) for p in ['tsx','esbuild','@esbuild/linux-x64','get-tsconfig','resolve-pkg-maps']]
modules = sorted({Path(p).resolve() for p in dependency_paths if Path(p).is_dir()},key=str)
for module in modules:
    if not module.is_relative_to(root/'node_modules'):
        raise SystemExit('UNEXPECTED_DEPENDENCY_PATH')
runtime = out/f'KNABA_DE_RUNTIME_LINUX_X64_{short}.zip'
def add_tree(archive, path):
    if path.is_file():
        archive.write(path, prefix+path.relative_to(root).as_posix())
    else:
        for item in sorted(path.rglob('*')):
            if item.is_file():
                archive.write(item, prefix+item.relative_to(root).as_posix())
with zipfile.ZipFile(runtime,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as archive:
    for name in ['dist','packages','infra','scripts','apps/api','package.json','package-lock.json','.env.example','README.md','KNABA_DE_MASTER_SPEC.md']:
        add_tree(archive, root/name)
    seen=set(archive.namelist())
    for module in modules:
        for item in sorted(module.rglob('*')):
            name=prefix+item.relative_to(root).as_posix()
            if item.is_file() and name not in seen:
                archive.write(item,name);seen.add(name)
    for name,target in {'tsx':'../tsx/dist/cli.mjs','esbuild':'../esbuild/bin/esbuild'}.items():
        info=zipfile.ZipInfo(prefix+'node_modules/.bin/'+name)
        info.create_system=3;info.external_attr=(stat.S_IFLNK|0o777)<<16
        archive.writestr(info,target)
    archive.writestr(prefix+'RUNTIME_README.txt',f'KNABA DE code {sha}\nLinux x64 glibc / Node24 and separately configured PostgreSQL17 required.\nCompiled API/web/worker and production dependencies included.\nNo real keys, provider/device/legal acceptance or successful deployment implied.\nSee README.md, docs/HANDOVER.md and the separate documentation archive.\n')
with zipfile.ZipFile(runtime) as archive:
    if archive.testzip() is not None:raise SystemExit('RUNTIME_ZIP_CRC_FAILED')
    for name in ['dist/server.mjs','dist/worker.mjs','dist/release.json','infra/001_init.sql','package-lock.json','KNABA_DE_MASTER_SPEC.md']:
        if archive.read(prefix+name)!=(root/name).read_bytes():raise SystemExit('RUNTIME_CRITICAL_BYTE_MISMATCH')
docs=out/f'KNABA_DE_DELIVERY_DOCS_{short}.zip'
with zipfile.ZipFile(docs,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as archive:
    for name in ['AGENTS.md','PROJECT_MEMORY.md','MASTER_ROADMAP.md','ROADMAP.md','README.md','KNABA_DE_MASTER_SPEC.md']:
        add_tree(archive,root/name)
    for item in sorted((root/'docs').rglob('*')):
        if item.is_file() and 'browser-artifacts' not in item.parts and 'browser-report' not in item.parts and item.name!='release-summary.json':
            archive.write(item,prefix+item.relative_to(root).as_posix())
paths=[source,bundle,runtime,docs,*[out/f'verified-report-v1.{ext}' for ext in ['pdf','xlsx','csv']]]
records=[{'path':p.relative_to(root).as_posix(),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in paths if p.exists()]
tests=json.loads((root/'docs/evidence/final-offline-result.json').read_text())
test_identity=json.loads((root/'docs/evidence/final-offline-source.json').read_text())
tested_sha=test_identity['tested_sha']
tested_paths=['apps','packages','infra/001_init.sql','infra/migrate.ts','infra/seed.ts','tests','package.json','package-lock.json','tsconfig.json','vitest.config.ts','playwright.config.ts']
run('git','diff','--exit-code',tested_sha,sha,'--',*tested_paths)
for field,reported in [('passed','numPassedTests'),('failed','numFailedTests'),('real_postgres_skipped','numPendingTests'),('total','numTotalTests')]:
    if test_identity[field] != tests[reported]:raise SystemExit('TEST_EVIDENCE_IDENTITY_MISMATCH')
railway_path=root/'docs/evidence/railway-staging-preparation.json'
railway=json.loads(railway_path.read_text()) if railway_path.exists() else {}
public_deployment={'status':'BLOCKED_EXTERNAL','provider':'Railway','reason':'Dedicated source transfer and effective billing controls remain unresolved; no application deployment or verified readiness.','project':railway.get('project'),'environment':railway.get('environment'),'allocatedApplicationUrl':railway.get('allocated_application_url'),'verifiedApplicationUrl':railway.get('verified_application_url'),'evidence':'docs/evidence/railway-staging-preparation.json' if railway else None}
summary={'codeSha':sha,'build':release,'packagingIntegrity':'PASSED','gitBundleIntegrity':'PASSED','status':'BUILD_AND_CPU_VERIFIED_RUNTIME_BLOCKED','tests':{'passed':tests['numPassedTests'],'failed':tests['numFailedTests'],'realPostgresSkipped':tests['numPendingTests'],'total':tests['numTotalTests'],'evidence':'docs/evidence/final-offline-result.json'},'runtimePrerequisites':['Linux x64 glibc','Node24','PostgreSQL17','actual environment configuration'],'publicUrl':None,'liveRuntimeVerified':False,'runtimeVerification':{'status':'BLOCKED_ENVIRONMENT','reason':'Local TCP/Unix sockets fail EPERM; prior system execution request CANCELLED before execution, not rejected or passed.'},'publicDeployment':public_deployment,'nativeArtifacts':{'androidApk':None,'iOSIPA':None,'status':'NOT_BUILT'},'imageDigest':None,'artifacts':records}
(out/'RELEASE_MANIFEST.json').write_text(json.dumps(summary,indent=2)+'\n')
summary['tests'].update({'tested_sha':tested_sha,'runtimeAndTestSourceMatchTestedSha':True,'sourceComparisonPaths':tested_paths,'identityEvidence':'docs/evidence/final-offline-source.json'})
(out/'RELEASE_MANIFEST.json').write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps({'codeSha':sha,'artifactCount':len(records),'packagingIntegrity':'PASSED'}))
