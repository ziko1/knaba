"""Upgrade only the isolated TEST API/worker, retaining its database and credentials."""
import datetime as dt, fcntl, hashlib, http.client, http.cookies, json, os, pathlib, re, socket, stat, subprocess, sys, time, urllib.request, uuid

ROOT=pathlib.Path('/srv/knaba/lead-agent')
PROJECT=COMPANY='knaba-lead-agent-test'
ORIGIN='https://bot.knaba.de'
PRIOR='2af0e96ce3883b9d3b2f8c75a5793f13ce8e8255'
SHA='89366d0a440fe1507bef65806da2364027d6edc1'
RUN=42497316706
ARCHIVE='b2fee170d97e22dda28af4dd1620488f00ca43908f7c21c56b502e48f1ce665b'
release=ROOT/'releases'/SHA
prior=ROOT/'releases'/PRIOR
private_env=ROOT/'private/runtime.env'
access_path=ROOT/'private/access.json'
current=ROOT/'current'
stage='PREFLIGHT'
updated=False
accepted=False
cookie=None
csrf=None
log=None

def private_bytes(path,value):
    fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,'wb') as output:output.write(value);output.flush();os.fsync(output.fileno())

def write_json(path,value):private_bytes(path,(json.dumps(value,indent=2,ensure_ascii=False)+'\n').encode())

def command(args,label,capture=False,timeout=180):
    result=subprocess.run(args,stdout=subprocess.PIPE if capture else log,stderr=log,timeout=timeout)
    if result.returncode:raise RuntimeError(label+'_FAILED')
    return result.stdout if capture else None

def request(path,method='GET',body=None,auth=False):
    headers={'Host':'bot.knaba.de','X-Forwarded-Proto':'https','Origin':ORIGIN,'Accept':'application/json'}
    if auth:headers.update({'Cookie':cookie,'X-CSRF-Token':csrf})
    data=None
    if body is not None:data=json.dumps(body).encode();headers['Content-Type']='application/json'
    connection=http.client.HTTPConnection('127.0.0.1',19180,timeout=15)
    try:
        connection.request(method,path,body=data,headers=headers)
        response=connection.getresponse();raw=response.read(2*1024*1024+1);assert len(raw)<=2*1024*1024
        try:value=json.loads(raw)
        except (ValueError,UnicodeError):value=None
        return response.status,{k.lower():v for k,v in response.getheaders()},value
    finally:connection.close()

def action(name,value,version=None):
    envelope={'input':value,'idempotency_key':str(uuid.uuid4())}
    if version is not None:envelope['expected_version']=version
    code,_,result=request('/api/v1/commands/'+name,'POST',envelope,True)
    if code not in (200,201):raise RuntimeError('ACTION_'+name.replace('.','_')+'_HTTP_'+str(code))
    return result

def github(path):
    req=urllib.request.Request('https://api.github.com/repos/ziko1/knaba/'+path,headers={'Accept':'application/vnd.github+json','User-Agent':'KNABA-isolated-test-upgrade'})
    with urllib.request.urlopen(req,timeout=20) as response:
        assert response.status==200
        return json.loads(response.read(2*1024*1024))

def compose(directory):
    return ['docker','compose','--project-name',PROJECT,'--env-file',str(private_env),'-f',str(directory/'erp/infra/compose.yml'),'-f',str(directory/'erp/infra/compose.lead-agent.yml')]

def wait_ready(sha):
    for _ in range(45):
        try:
            if request('/api/v1/ready')[0]==200 and request('/api/v1/version')[2]['sha']==sha:return
        except (OSError,http.client.HTTPException,KeyError,TypeError):pass
        time.sleep(2)
    raise RuntimeError('EXACT_READINESS_TIMEOUT')

def wait_runtime_images(application_image,postgres_image):
    expression='{"id":{{json .Id}},"service":{{json (index .Config.Labels "com.docker.compose.service")}},"image":{{json .Image}},"health":{{json .State.Health.Status}}}'
    for _ in range(45):
        ids=command(['docker','ps','-q','--filter','label=com.docker.compose.project='+PROJECT],'RUNTIME_IDS',True).decode().split()
        if len(ids)==3:
            rows=[json.loads(line) for line in command(['docker','inspect','--format',expression,*ids],'RUNTIME_IMAGES',True).decode().splitlines()]
            if {row['service'] for row in rows}=={'api','worker','postgres'} and all(row['health']=='healthy' and row['image']==(postgres_image if row['service']=='postgres' else application_image) for row in rows):return rows
        time.sleep(2)
    raise RuntimeError('EXACT_HEALTHY_RUNTIME_IMAGES_TIMEOUT')

def main():
    global stage,updated,accepted,cookie,csrf,log,old_env,old_access
    assert os.geteuid()==0 and socket.gethostname()=='knaba'
    os.umask(0o077)
    for folder in (ROOT,ROOT/'ops',ROOT/'private',release,prior):
        info=folder.lstat();assert stat.S_ISDIR(info.st_mode) and info.st_uid==0 and info.st_mode & 0o077==0
    lock=os.open(ROOT/'ops/release.lock',os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW,0o600)
    fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
    log=(ROOT/'ops'/('upgrade-'+SHA+'.log')).open('x')
    assert current.is_symlink() and current.resolve()==prior
    assert not (ROOT/'ops'/('install-'+SHA+'.json')).exists()
    build=json.loads((ROOT/'ops'/('build-'+SHA+'.json')).read_text())
    prior_build=json.loads((ROOT/'ops'/('build-'+PRIOR+'.json')).read_text())
    previous=json.loads((ROOT/'ops'/('install-'+PRIOR+'.json')).read_text())
    assert build['status']=='BUILT_NOT_DEPLOYED' and build['source_sha']==SHA and build['source_archive_sha256']==ARCHIVE
    assert hashlib.sha256((release/'source.tar').read_bytes()).hexdigest()==ARCHIVE
    assert previous['status']=='LOOPBACK_ACCEPTED_NOT_PUBLIC' and previous['git_sha']==PRIOR
    assert build['postgres_image_id']==prior_build['postgres_image_id'] and build['postgres_image']==prior_build['postgres_image']
    for relative in ('erp/infra/001_init.sql','erp/infra/compose.yml','erp/infra/compose.lead-agent.yml','erp/scripts/bootstrap-lead-agent-test.mts'):
        assert (release/relative).read_bytes()==(prior/relative).read_bytes(),'UPGRADE_CONTRACT_CHANGED'
    ci=github('actions/runs/'+str(RUN));assert ci['head_sha']==SHA and ci['status']=='completed' and ci['conclusion']=='success'
    jobs=github('actions/runs/'+str(RUN)+'/jobs?per_page=100')['jobs']
    required={'Corporate site checks and production build','Site SQLite to ERP PostgreSQL HTTP acceptance','ERP checks, build and PostgreSQL tests','Source integrity and policy tests'}
    assert required.issubset({j['name'] for j in jobs}) and all(j['conclusion']=='success' for j in jobs if j['name'] in required)
    assert all(j['conclusion'] in ('success','skipped') for j in jobs if j['name'] not in required)
    for path in (private_env,access_path):
        info=path.lstat();assert stat.S_ISREG(info.st_mode) and info.st_uid==0 and info.st_mode & 0o077==0 and info.st_size<65536
    old_env=private_env.read_bytes();old_access=access_path.read_bytes()
    environment={}
    for line in old_env.decode().splitlines():
        key,separator,value=line.partition('=');assert separator and re.fullmatch('[A-Z][A-Z0-9_]*',key) and key not in environment
        environment[key]=value
    settings={'APP_MODE':'TEST','COMPANY_ID':COMPANY,'PUBLIC_ORIGIN':ORIGIN,'GIT_SHA':PRIOR,'POSTGRES_DB':'knaba_lead_agent_test','POSTGRES_USER':'knaba_lead_agent',
      'LEAD_AGENT_POSTGRES_IMAGE':build['postgres_image'],'LEAD_AGENT_PUBLIC_SEARCH_ENABLED':'true','KNABA_MODULE_LANDING':'lead-agent',
      'LIVE_SEND_ALLOWED':'false','LIVE_INTEGRATION_SEND_ALLOWED':'false','TELEGRAM_LIVE_SEND_ALLOWED':'false','AI_SYNTHETIC_ONLY':'true','API_PORT':'19180'}
    assert all(environment.get(k)==v for k,v in settings.items())
    assert environment['DATABASE_URL']=='postgresql://knaba_lead_agent:'+environment['POSTGRES_PASSWORD']+'@postgres:5432/knaba_lead_agent_test'
    access=json.loads(old_access);assert access['source_sha']==PRIOR and access['mode']=='TEST' and access['url']==ORIGIN and access['email']=='tester@knaba.invalid' and len(access['password'])>=40
    own=command(['docker','ps','-q','--filter','label=com.docker.compose.project='+PROJECT],'OWN_PROJECT',True).decode().split();assert len(own)==3
    expression='{"id":{{json .Id}},"service":{{json (index .Config.Labels "com.docker.compose.service")}},"image":{{json .Image}},"health":{{json .State.Health.Status}}}'
    own_rows=[json.loads(line) for line in command(['docker','inspect','--format',expression,*own],'OWN_IDENTITIES',True).decode().splitlines()]
    assert {row['service'] for row in own_rows}=={'api','worker','postgres'} and all(row['health']=='healthy' for row in own_rows)
    assert all(row['image']==(build['postgres_image_id'] if row['service']=='postgres' else prior_build['image_id']) for row in own_rows)
    replace_ids={row['id'] for row in own_rows if row['service'] in ('api','worker')}
    pg_id=next(row['id'] for row in own_rows if row['service']=='postgres')
    mounts=json.loads(command(['docker','inspect','--format','{{json .Mounts}}',pg_id],'PG_VOLUME',True))
    assert len(mounts)==1 and mounts[0]['Type']=='volume' and mounts[0]['Name']==PROJECT+'_postgres_data'
    assert request('/api/v1/version')[2]['sha']==PRIOR
    expression='{"id":{{json .Id}},"startedAt":{{json .State.StartedAt}}}'
    all_ids=command(['docker','ps','-q'],'BASELINE_IDS',True).decode().split()
    baseline={v['id']:v['startedAt'] for v in map(json.loads,command(['docker','inspect','--format',expression,*all_ids],'BASELINE',True).decode().splitlines()) if v['id'] not in replace_ids}
    assert command(['docker','image','inspect',build['image'],'--format','{{.Id}}'],'IMAGE_ID',True).decode().strip()==build['image_id']
    sql="SELECT json_build_object('credentials',(SELECT count(*) FROM auth_credentials),'active_sessions',(SELECT count(*) FROM auth_sessions WHERE revoked_at IS NULL AND expires_at>now()),'active_humans',(SELECT count(*) FROM aggregates WHERE kind='user' AND data->>'active'='true' AND NOT(data->'roles' ? 'SERVICE_ACCOUNT')),'foreign_companies',(SELECT count(*) FROM aggregates WHERE company_id<>'knaba-lead-agent-test'),'other_humans',(SELECT count(*) FROM aggregates WHERE kind='user' AND id<>'lead-agent-test-operator' AND NOT(data->'roles' ? 'SERVICE_ACCOUNT')));"
    accounts=json.loads(command(['docker','exec',pg_id,'psql','-U','knaba_lead_agent','-d','knaba_lead_agent_test','-Atc',sql],'ACCOUNT_GATE',True))
    assert accounts=={'credentials':1,'active_sessions':0,'active_humans':1,'foreign_companies':0,'other_humans':0}
    private_bytes(ROOT/'private'/('runtime-before-'+SHA+'.env'),old_env);private_bytes(ROOT/'private'/('access-before-'+SHA+'.json'),old_access)
    write_json(ROOT/'ops'/('upgrade-baseline-'+SHA+'.json'),{'git_sha':SHA,'prior_sha':PRIOR,'ci_run_id':RUN,'accounts':accounts,'preserved_containers':baseline,'replaced_containers':list(replace_ids),'postgres_id':pg_id,'recorded_at':dt.datetime.now(dt.timezone.utc).isoformat()})
    new_env=old_env.replace(('GIT_SHA='+PRIOR+'\n').encode(),('GIT_SHA='+SHA+'\n').encode());assert new_env!=old_env
    access['source_sha']=SHA
    private_bytes(ROOT/'private/runtime.next.env',new_env);write_json(ROOT/'private/access.next.json',access)
    updated=True;os.replace(ROOT/'private/runtime.next.env',private_env);os.replace(ROOT/'private/access.next.json',access_path)
    stage='ISOLATED_API_WORKER_UPGRADE'
    command([*compose(release),'config','--quiet'],'COMPOSE_VALIDATION')
    command([*compose(release),'up','-d','--no-deps','--no-build','api','worker'],'UPGRADE_START',timeout=240)
    wait_ready(SHA)
    running_images=wait_runtime_images(build['image_id'],build['postgres_image_id'])
    code,headers,version=request('/api/v1/version');assert code==200 and version['sha']==SHA and version['mode']=='TEST' and 'noindex' in headers.get('x-robots-tag','')
    assert request('/api/v1/me')[0] in (401,403) and request('/api/v1/auth/demo','POST',{'role':'OWNER'})[0] in (401,403,404)
    code,headers,_=request('/');assert code==302 and headers['location']=='/app/lead-agent?language=UK'
    stage='AUTHENTICATED_UPGRADED_RUNTIME'
    code,headers,login=request('/api/v1/auth/login','POST',{'email':access['email'],'password':access['password']});assert code in (200,201)
    cookies=http.cookies.SimpleCookie();cookies.load(headers['set-cookie']);session=cookies['knaba_session']
    assert session['secure'] and session['httponly'] and session['samesite'].lower()=='strict'
    cookie='knaba_session='+session.value;csrf=login['csrfToken']
    code,_,me=request('/api/v1/me',auth=True);assert code==200 and me['actor']['companyId']==COMPANY and me['actor']['userId']=='lead-agent-test-operator' and 'lead_agent.manage' in me['actor']['permissions']
    catalog=action('lead_agent.catalog',{});assert catalog['capabilities']['externalSend'] is False and catalog['capabilities']['aiDrafts'] is False
    valid_csrf=csrf;csrf='deliberately-invalid-release-csrf'
    try:
        assert request('/api/v1/commands/lead_agent.catalog','POST',{'input':{},'idempotency_key':str(uuid.uuid4())},True)[0] in (401,403)
    finally:csrf=valid_csrf
    profiles=action('lead_agent.list',{'kind':'lead_agent_profile'})['items'];assert len(profiles)==1
    stage='REAL_PUBLIC_SOURCE_SEARCH'
    search=action('lead_agent.search',{'id':profiles[0]['id']},profiles[0]['version'])
    for _ in range(90):
        run=action('lead_agent.run.read',{'id':search['id']})
        if run['data']['status'] not in ('QUEUED','RUNNING'):break
        time.sleep(2)
    else:raise RuntimeError('SEARCH_COMPLETION_TIMEOUT')
    assert run['data']['status'] in ('SUCCEEDED','PARTIAL') and any(s['status']=='SUCCESS' for s in run['data']['sources'])
    opportunities=action('lead_agent.list',{'kind':'lead_agent_opportunity'})['items'];drafts=action('lead_agent.list',{'kind':'lead_agent_draft'})['items']
    assert all(e['companyId']==COMPANY and e['data']['ownerUserId']=='lead-agent-test-operator' for e in opportunities)
    assert request('/api/v1/auth/logout','POST',{},True)[0] in (200,201) and request('/api/v1/me',auth=True)[0] in (401,403)
    cookie=None;csrf=None
    ids=command(['docker','ps','-q'],'AFTER_IDS',True).decode().split()
    after={v['id']:v['startedAt'] for v in map(json.loads,command(['docker','inspect','--format',expression,*ids],'AFTER_IDENTITIES',True).decode().splitlines())}
    assert all(after.get(cid)==started for cid,started in baseline.items())
    assert json.loads(command(['docker','inspect','--format','{{json .Mounts}}',pg_id],'PG_VOLUME_AFTER',True))==mounts
    assert current.is_symlink() and current.resolve()==prior
    os.symlink(release,ROOT/'current.next');os.replace(ROOT/'current.next',current)
    receipt={'status':'LOOPBACK_ACCEPTED_NOT_PUBLIC','git_sha':SHA,'image_id':build['image_id'],'ci_run_id':RUN,'mode':'TEST','company_id':COMPANY,'origin':ORIGIN,'checked_at':dt.datetime.now(dt.timezone.utc).isoformat(),
      'initial_accounts':previous['initial_accounts'],'fresh_accounts':accounts,'upgraded_from':PRIOR,'running_images':running_images,
      'checks':{'authenticated_loopback_smoke':'PASS','default_credentials_absent':'PASS','session_cookie_security':'PASS','csrf':'PASS','logout_revocation':'PASS','unrelated_runtimes_preserved':'PASS','database_volume_preserved':'PASS','test_credentials_preserved':'PASS'},
      'real_search':{'status':run['data']['status'],'seen':run['data']['seen'],'matched':run['data']['matched'],'sources':run['data']['sources']},
      'first_page_opportunities':len(opportunities),'first_page_drafts':len(drafts),'external_send_enabled':False,'ai_provider_enabled':False,'public_dns_created':False}
    write_json(ROOT/'ops'/('install-'+SHA+'.json'),receipt);accepted=True;print(json.dumps(receipt))

if __name__=='__main__':
    try:main()
    except Exception as error:
        rollback='NOT_NEEDED'
        if updated and not accepted:
            try:
                if cookie and csrf:
                    try:request('/api/v1/auth/logout','POST',{},True)
                    except Exception:pass
                assert 'GIT_SHA='+SHA+'\n' in private_env.read_text()
                private_bytes(ROOT/'private/runtime.rollback.env',old_env);private_bytes(ROOT/'private/access.rollback.json',old_access)
                os.replace(ROOT/'private/runtime.rollback.env',private_env);os.replace(ROOT/'private/access.rollback.json',access_path)
                if current.resolve()==release:os.symlink(prior,ROOT/'current.rollback');os.replace(ROOT/'current.rollback',current)
                command([*compose(prior),'up','-d','--no-deps','--no-build','api','worker'],'ROLLBACK_START',timeout=240);wait_ready(PRIOR)
                prior_image=json.loads((ROOT/'ops'/('build-'+PRIOR+'.json')).read_text())
                wait_runtime_images(prior_image['image_id'],prior_image['postgres_image_id'])
                rollback='PRIOR_TEST_RUNTIME_RESTORED_DATA_RETAINED'
            except Exception:rollback='REQUIRES_STATE_RECONCILIATION'
        print(json.dumps({'status':'UPGRADE_BLOCKED','stage':stage,'reason':str(error)[:160] if isinstance(error,RuntimeError) else type(error).__name__,'rollback':rollback,'secret_values_printed':False}));sys.exit(1)
    finally:
        if log:log.close()
