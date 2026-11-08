import argparse, hashlib, ipaddress, json, os, pathlib, subprocess, time, uuid
p=argparse.ArgumentParser()
p.add_argument('--bundle')
p.add_argument('--bundle-sha256')
p.add_argument('--branch')
p.add_argument('--tree', required=True)
p.add_argument('--skip-typecheck', action='store_true')
p.add_argument('--test-file', action='append', default=[])
p.add_argument('--sha', required=True)
a=p.parse_args()
assert len(a.sha)==40 and all(c in '0123456789abcdef' for c in a.sha)
base=pathlib.Path('/tmp/knaba-completion-qa-20261108-vqwmfqou')
repo=base/'source'
if a.bundle:
    bundle=pathlib.Path(a.bundle)
    assert hashlib.sha256(bundle.read_bytes()).hexdigest()==a.bundle_sha256
else:
    assert a.branch=='feat/knaba-completion-audit-20261108'
results=base/('results-'+a.sha[:12]+'-'+uuid.uuid4().hex[:6])
results.mkdir(exist_ok=False)
records=[]
def run(cmd,name,timeout=120,check=True):
    started=time.time()
    r=subprocess.run(cmd,cwd=repo,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=timeout)
    data=r.stdout
    log=results/(name+'.log')
    log.write_bytes(data)
    records.append({'step':name,'exit_code':r.returncode,'duration_seconds':round(time.time()-started,3),'log_path':str(log),'log_sha256':hashlib.sha256(data).hexdigest()})
    if check and r.returncode: raise RuntimeError(name+' failed: '+data.decode(errors='replace')[-3000:])
    return r
run(['git','fetch',str(bundle),'HEAD'] if a.bundle else ['git','fetch','origin','refs/heads/'+a.branch],'fetch')
run(['git','checkout','--detach',a.sha],'checkout')
head=run(['git','rev-parse','HEAD'],'head').stdout.decode().strip()
tree=run(['git','rev-parse','HEAD^{tree}'],'tree').stdout.decode().strip()
assert head==a.sha
assert tree==a.tree
status=run(['git','status','--porcelain'],'initial-status').stdout.decode()
assert not status, 'candidate source dirty before tests'
suffix=uuid.uuid4().hex[:12]
network='knaba-qa-'+suffix
pg='knaba-qa-pg-'+suffix
app='knaba-qa-app-'+suffix
qa_image='sha256:c28822481b78f5a917cb269bec78e43f62923117b35a53e32cc9dcf53a85fe75'
pg_image='sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24'
d=['sudo','docker']
summary={'source_sha':head,'source_tree':tree,'bundle_sha256':a.bundle_sha256,'results_path':str(results),'node_version':'24.22.1','postgres_version':'17.11','qa_image':qa_image,'postgres_image':pg_image,'excluded_remote_files':['tests/resources.test.ts','tests/native-ios-simulator.test.ts'],'network':network,'postgres_container':pg,'application_container':app,'synthetic_only':True,'published_ports':[]}
summary['test_file_filters']=a.test_file
def app_command(command):
    return d+['run','--pull=never','--rm','--name',app,'--network',network,'--read-only','--cpus','2','--memory','3g','--pids-limit','512','--cap-drop','ALL','--security-opt','no-new-privileges','--user',str(os.getuid())+':'+str(os.getgid()),'--tmpfs','/tmp:rw,nosuid,nodev,size=1g,mode=1777','--mount','type=bind,src='+str(repo)+',dst=/source','--mount','type=bind,src='+str(results)+',dst=/results','--mount','type=bind,src=/opt/knaba/toolchains/node-v24.22.1-linux-x64,dst=/toolchain,readonly','--workdir','/source/erp','--entrypoint','env',qa_image,'-i','PATH=/toolchain/bin:/usr/local/bin:/usr/bin:/bin','HOME=/tmp','LANG=C.UTF-8','APP_MODE=TEST','LIVE_SEND_ALLOWED=false','LIVE_INTEGRATION_SEND_ALLOWED=false','DATABASE_URL=postgresql://knaba_test@database:5432/knaba_qa']+command
failed=None
try:
    run(d+['network','create','--internal',network],'network-create')
    subnet=run(d+['network','inspect','--format','{{(index .IPAM.Config 0).Subnet}}',network],'network-subnet').stdout.decode().strip()
    assert ipaddress.ip_network(subnet).is_private
    summary['isolated_network_subnet']=subnet
    pg_command='initdb -D /qa-pg/data --username=knaba_test --encoding=UTF8 --locale=C --auth=trust --no-instructions && printf "\\nhost knaba_qa knaba_test '+subnet+' trust\\n" >> /qa-pg/data/pg_hba.conf && exec postgres -D /qa-pg/data -c listen_addresses=* -c unix_socket_directories=/tmp -c shared_buffers=64MB'
    run(d+['run','--pull=never','--detach','--name',pg,'--network',network,'--network-alias','database','--read-only','--cpus','1','--memory','1g','--pids-limit','256','--cap-drop','ALL','--security-opt','no-new-privileges','--user','postgres','--tmpfs','/qa-pg:rw,nosuid,nodev,size=512m,mode=1777','--tmpfs','/tmp:rw,nosuid,nodev,size=64m,mode=1777','--entrypoint','env',pg_image,'-i','PATH=/usr/local/bin:/usr/bin:/bin','HOME=/tmp','LANG=C','sh','-c',pg_command],'postgres-start')
    ready=False
    for attempt in range(30):
        r=subprocess.run(d+['exec',pg,'pg_isready','-U','knaba_test','-h','127.0.0.1'],stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=5)
        if r.returncode==0:
            ready=True
            break
        time.sleep(1)
    assert ready, 'isolated PostgreSQL readiness timeout'
    run(d+['exec',pg,'createdb','-U','knaba_test','-h','127.0.0.1','knaba_qa'],'create-synthetic-database')
    run(d+['exec',pg,'postgres','--version'],'postgres-version')
    run(app_command(['node','--version']),'node-version')
    run(app_command(['node','--input-type=module','-e',"import pg from 'pg';const p=new pg.Pool({connectionString:process.env.DATABASE_URL});console.log(JSON.stringify((await p.query('SELECT 1 AS ready, version() AS version')).rows));await p.end();"]),'postgres-app-preflight')
    typecheck=None if a.skip_typecheck else run(app_command(['npm','run','typecheck']),'typecheck',timeout=240,check=False)
    tests=run(app_command(['node','node_modules/vitest/vitest.mjs','run','--no-file-parallelism','--exclude','tests/resources.test.ts','--exclude','tests/native-ios-simulator.test.ts','--reporter=json','--outputFile=/results/vitest.json']+a.test_file),'vitest',timeout=1200,check=False)
    summary['typecheck_exit_code']=None if a.skip_typecheck else typecheck.returncode
    summary['typecheck_not_rerun']=a.skip_typecheck
    summary['vitest_exit_code']=tests.returncode
    result_path=results/'vitest.json'
    if result_path.exists():
        v=json.loads(result_path.read_text())
        summary['test_counts']={k:v.get(k) for k in ['numTotalTestSuites','numPassedTestSuites','numFailedTestSuites','numPendingTestSuites','numTotalTests','numPassedTests','numFailedTests','numPendingTests','numTodoTests','success']}
        summary['vitest_json_sha256']=hashlib.sha256(result_path.read_bytes()).hexdigest()
        summary['test_files']=[{'name':x.get('name','').removeprefix('/source/erp/'),'status':x.get('status'),'counts':{s:sum(t.get('status')==s for t in x.get('assertionResults',[])) for s in ['passed','failed','pending','skipped','todo']}} for x in v.get('testResults',[])]
        summary['failures']=[{'file':x.get('name','').removeprefix('/source/erp/'),'test':t.get('fullName'),'messages':t.get('failureMessages',[])[:2]} for x in v.get('testResults',[]) for t in x.get('assertionResults',[]) if t.get('status')=='failed']
        summary['suite_failures']=[{'file':x.get('name','').removeprefix('/source/erp/'),'message':x.get('message','')[:2000]} for x in v.get('testResults',[]) if x.get('status')=='failed' and not any(t.get('status')=='failed' for t in x.get('assertionResults',[]))]
    else:
        summary['vitest_missing_report']=True
        summary['vitest_log_tail']=tests.stdout.decode(errors='replace')[-5000:]
    final_status=run(['git','status','--porcelain'],'final-status').stdout.decode()
    summary['source_clean_after_tests']=not final_status
    if final_status:
        summary['source_status_after_tests']=final_status
        raise RuntimeError('candidate source dirty after tests')
except Exception as e:
    failed=str(e)
    summary['runner_error']=failed
finally:
    run(d+['logs',pg],'postgres',check=False)
    run(d+['rm','--force',app],'cleanup-application',check=False)
    run(d+['rm','--force',pg],'cleanup-postgres',check=False)
    run(d+['network','rm',network],'cleanup-network',check=False)
    summary['records']=records
    summary_path=results/'summary.json'
    summary_path.write_text(json.dumps(summary,indent=2))
    out={k:v for k,v in summary.items() if k not in ['test_files','failures','suite_failures']}
    out['failures']=summary.get('failures',[])[:10]
    out['suite_failures']=summary.get('suite_failures',[])[:10]
    out['summary_sha256']=hashlib.sha256(summary_path.read_bytes()).hexdigest()
    print(json.dumps(out))
if failed or (not a.skip_typecheck and summary.get('typecheck_exit_code',1)) or summary.get('vitest_exit_code',1):
    raise SystemExit(1)

