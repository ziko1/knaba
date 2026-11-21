"""Install only the new isolated TEST module after exact-source CI success."""
import datetime, fcntl, hashlib, http.client, http.cookies, json, os, pathlib, re, secrets, socket, stat, subprocess, sys, time, urllib.request, uuid

ROOT = pathlib.Path('/srv/knaba/lead-agent')
PROJECT = 'knaba-lead-agent-test'
COMPANY = 'knaba-lead-agent-test'
ORIGIN = 'https://bot.knaba.de'
release_sha, run_text = sys.argv[1:3]
assert re.fullmatch('[a-f0-9]{40}', release_sha) and run_text.isdigit()
assert os.geteuid() == 0 and socket.gethostname() == 'knaba'
os.umask(0o077)
for folder in (ROOT, ROOT/'ops', ROOT/'private', ROOT/'backups', ROOT/'releases'):
    info = folder.lstat()
    assert stat.S_ISDIR(info.st_mode) and info.st_uid == 0 and info.st_mode & 0o077 == 0
lock_fd = os.open(ROOT/'ops/release.lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
fcntl.flock(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
build = json.loads((ROOT/'ops'/('build-'+release_sha+'.json')).read_text())
assert build['status'] == 'BUILT_NOT_DEPLOYED' and build['source_sha'] == release_sha
release = ROOT/'releases'/release_sha
assert pathlib.Path(build['release_path']) == release
assert hashlib.sha256((release/'source.tar').read_bytes()).hexdigest() == build['source_archive_sha256']
private_env = ROOT/'private/runtime.env'
log_path = ROOT/'ops'/('install-'+release_sha+'.log')
log = log_path.open('x')
stage = 'PREFLIGHT'

def command(argv, label, capture=False, timeout=180):
    result = subprocess.run(argv, stdout=subprocess.PIPE if capture else log, stderr=log, timeout=timeout)
    if result.returncode:
        raise RuntimeError(label + '_FAILED')
    return result.stdout if capture else None

def write_json(path, value, mode=0o600):
    with path.open('x') as output:
        json.dump(value, output, ensure_ascii=False, indent=2)
        output.write('\n')
    path.chmod(mode)

def remote_json(url):
    req = urllib.request.Request(url, headers={'Accept':'application/vnd.github+json','User-Agent':'KNABA-isolated-module-release'})
    with urllib.request.urlopen(req, timeout=20) as response:
        assert response.status == 200
        return json.loads(response.read(2*1024*1024))

def request(path, method='GET', body=None, cookie=None, csrf=None):
    headers = {'Host':'bot.knaba.de','X-Forwarded-Proto':'https','Origin':ORIGIN,'Accept':'application/json'}
    data = None
    if body is not None:
        data = json.dumps(body).encode();headers['Content-Type']='application/json'
    if cookie: headers['Cookie'] = cookie
    if csrf: headers['X-CSRF-Token'] = csrf
    conn = http.client.HTTPConnection('127.0.0.1',19180,timeout=15)
    try:
        conn.request(method,path,body=data,headers=headers)
        response = conn.getresponse();raw = response.read(2*1024*1024+1)
        assert len(raw)<=2*1024*1024
        try: value=json.loads(raw)
        except (ValueError,UnicodeError): value=None
        return response.status, dict(response.getheaders()), value
    finally: conn.close()

try:
    # Independently confirm the existing hosted acceptance before any database service starts.
    ci = remote_json('https://api.github.com/repos/ziko1/knaba/actions/runs/'+run_text)
    assert ci['head_sha']==release_sha and ci['status']=='completed' and ci['conclusion']=='success'
    jobs = remote_json('https://api.github.com/repos/ziko1/knaba/actions/runs/'+run_text+'/jobs?per_page=100')['jobs']
    expected = {'Corporate site checks and production build','Site SQLite to ERP PostgreSQL HTTP acceptance','ERP checks, build and PostgreSQL tests','Source integrity and policy tests'}
    assert expected.issubset({j['name'] for j in jobs})
    assert all(j['conclusion']=='success' for j in jobs if j['name'] in expected)
    assert all(j['conclusion'] in ('success','skipped') for j in jobs if j['name'] not in expected)
    assert not private_env.exists() and not (ROOT/'current').exists(), 'INSTALL_ALREADY_STARTED_RECONCILE_STATE'
    ids = command(['docker','ps','-q'],'BASELINE_IDS',True).decode().split()
    runtime_format = '{"id":{{json .Id}},"startedAt":{{json .State.StartedAt}}}'
    baseline_rows = command(['docker','inspect','--format',runtime_format,*ids],'BASELINE_INSPECT',True).decode().splitlines() if ids else []
    baseline = {c['id']:c['startedAt'] for c in map(json.loads,baseline_rows)}
    assert not command(['docker','ps','-aq','--filter','label=com.docker.compose.project='+PROJECT],'OWN_PROJECT_CHECK',True).strip()
    assert not command(['docker','volume','ls','-q','--filter','name=^'+PROJECT+'_postgres_data$'],'OWN_VOLUME_CHECK',True).strip()
    with socket.socket() as port: port.bind(('127.0.0.1',19180))
    image_id = command(['docker','image','inspect',build['image'],'--format','{{.Id}}'],'IMAGE_IDENTITY',True).decode().strip()
    assert image_id == build['image_id']
    password = secrets.token_urlsafe(36)
    db_password = secrets.token_urlsafe(48)
    environment = {'APP_MODE':'TEST','COMPANY_ID':COMPANY,'PUBLIC_ORIGIN':ORIGIN,
      'GIT_SHA':release_sha,'POSTGRES_DB':'knaba_lead_agent_test','POSTGRES_USER':'knaba_lead_agent',
      'POSTGRES_PASSWORD':db_password,'DATABASE_URL':'postgresql://knaba_lead_agent:'+db_password+'@postgres:5432/knaba_lead_agent_test',
      'AUTH_ENCRYPTION_KEY':secrets.token_hex(48),'BACKUP_PASSPHRASE':secrets.token_urlsafe(64),
      'LEAD_AGENT_POSTGRES_IMAGE':build['postgres_image'],'LEAD_AGENT_PUBLIC_SEARCH_ENABLED':'true',
      'KNABA_MODULE_LANDING':'lead-agent','LIVE_SEND_ALLOWED':'false','LIVE_INTEGRATION_SEND_ALLOWED':'false',
      'TELEGRAM_LIVE_SEND_ALLOWED':'false','AI_SYNTHETIC_ONLY':'true','API_PORT':'19180'}
    with private_env.open('x') as output:
        for key,value in environment.items():
            assert '\n' not in value and '\r' not in value and '$' not in value
            output.write(key+'='+value+'\n')
    private_env.chmod(0o600)
    access = {'url':ORIGIN,'email':'tester@knaba.invalid','name':'KNABA — тестовий оператор','password':password,'mode':'TEST','source_sha':release_sha}
    write_json(ROOT/'private/access.json',access)
    bootstrap = ROOT/'private/bootstrap-once.json'
    write_json(bootstrap,{key:access[key] for key in ['email','name','password']},0o400)
    os.chown(bootstrap,1000,1000)
    compose = ['docker','compose','--project-name',PROJECT,'--env-file',str(private_env),'-f',str(release/'erp/infra/compose.yml'),'-f',str(release/'erp/infra/compose.lead-agent.yml')]
    command([*compose,'config','--quiet'],'COMPOSE_VALIDATION')
    stage='DATABASE_MIGRATION'
    command([*compose,'up','-d','--wait','--wait-timeout','90','postgres'],'POSTGRES_START')
    command([*compose,'run','--rm','--no-deps','-T','bootstrap'],'SCHEMA_MIGRATE')
    stage='PRIVATE_OPERATOR_BOOTSTRAP'
    command([*compose,'run','--rm','--no-deps','-T','-v',str(bootstrap)+':/run/bootstrap-once.json:ro','api','node','--import','tsx','scripts/bootstrap-lead-agent-test.mts','/run/bootstrap-once.json'],'PRIVATE_BOOTSTRAP')
    bootstrap.unlink()
    sql = "SELECT json_build_object('credentials',(SELECT count(*) FROM auth_credentials),'sessions',(SELECT count(*) FROM auth_sessions),'active_humans',(SELECT count(*) FROM aggregates WHERE kind='user' AND data->>'active'='true' AND NOT(data->'roles' ? 'SERVICE_ACCOUNT')),'foreign_companies',(SELECT count(*) FROM aggregates WHERE company_id<>'knaba-lead-agent-test'),'demo_users',(SELECT count(*) FROM aggregates WHERE kind='user' AND id<>'lead-agent-test-operator')));"
    initial = json.loads(command([*compose,'exec','-T','postgres','psql','-U','knaba_lead_agent','-d','knaba_lead_agent_test','-Atc',sql],'INITIAL_ACCOUNT_GATE',True))
    assert initial == {'credentials':1,'sessions':0,'active_humans':1,'foreign_companies':0,'demo_users':0}
    stage='ISOLATED_RUNTIME_START'
    command([*compose,'up','-d','--no-build','api','worker'],'MODULE_START',timeout=240)
    for attempt in range(45):
        try:
            if request('/api/v1/ready')[0]==200:break
        except (OSError,http.client.HTTPException):pass
        time.sleep(2)
    else:raise RuntimeError('READINESS_TIMEOUT')
    code,headers,version=request('/api/v1/version')
    assert code==200 and version['sha']==release_sha and version['mode']=='TEST' and 'noindex' in headers.get('X-Robots-Tag','')
    assert request('/api/v1/me')[0] in (401,403)
    assert request('/api/v1/auth/demo','POST',{'role':'OWNER'})[0] in (401,403,404)
    code,headers,_=request('/')
    assert code==302 and headers['Location']=='/app/lead-agent?language=UK'
    stage='AUTHENTICATED_LOOPBACK'
    code,headers,login=request('/api/v1/auth/login','POST',{'email':access['email'],'password':password})
    assert code in (200,201)
    cookies=http.cookies.SimpleCookie();cookies.load(headers['Set-Cookie'])
    session=cookies['knaba_session']
    assert session['secure'] and session['httponly'] and session['samesite'].lower()=='strict'
    cookie='knaba_session='+session.value
    code,_,me=request('/api/v1/me',cookie=cookie)
    assert code==200 and me['actor']['companyId']==COMPANY and me['actor']['userId']=='lead-agent-test-operator'
    assert 'lead_agent.manage' in me['actor']['permissions']
    csrf=me['csrfToken']
    def action(name,value,version=None):
        envelope={'input':value,'idempotency_key':str(uuid.uuid4())}
        if version is not None:envelope['expected_version']=version
        code,_,result=request('/api/v1/commands/'+name,'POST',envelope,cookie,csrf)
        if code not in (200,201):raise RuntimeError('ACTION_'+name.replace('.','_')+'_HTTP_'+str(code))
        return result
    envelope={'input':{},'idempotency_key':str(uuid.uuid4())}
    assert request('/api/v1/commands/lead_agent.catalog','POST',envelope,cookie)[0] in (401,403)
    catalog=action('lead_agent.catalog',{})
    assert catalog['capabilities']['externalSend'] is False and catalog['capabilities']['aiDrafts'] is False
    profiles=action('lead_agent.list',{'kind':'lead_agent_profile'})['items']
    assert len(profiles)==1
    profile=profiles[0]
    stage='REAL_PUBLIC_SOURCE_SEARCH'
    search=action('lead_agent.search',{'id':profile['id']},profile['version'])
    for attempt in range(90):
        run=action('lead_agent.run.read',{'id':search['id']})
        if run['data']['status'] not in ('QUEUED','RUNNING'):break
        time.sleep(2)
    else:raise RuntimeError('SEARCH_COMPLETION_TIMEOUT')
    assert run['data']['status'] in ('SUCCEEDED','PARTIAL'), 'PUBLIC_SEARCH_DID_NOT_SUCCEED'
    assert any(s['status']=='SUCCESS' for s in run['data']['sources'])
    opportunities=action('lead_agent.list',{'kind':'lead_agent_opportunity'})
    drafts=action('lead_agent.list',{'kind':'lead_agent_draft'})
    assert all(e['companyId']==COMPANY and e['data']['ownerUserId']=='lead-agent-test-operator' for e in opportunities['items'])
    assert request('/api/v1/auth/logout','POST',{},cookie,csrf)[0] in (200,201)
    assert request('/api/v1/me',cookie=cookie)[0] in (401,403)
    current_ids=command(['docker','ps','-q'],'AFTER_IDS',True).decode().split()
    after_rows=command(['docker','inspect','--format',runtime_format,*current_ids],'AFTER_INSPECT',True).decode().splitlines()
    after={c['id']:c['startedAt'] for c in map(json.loads,after_rows)}
    assert all(after.get(cid)==started for cid,started in baseline.items()), 'PREEXISTING_RUNTIME_CHANGED_RECONCILE'
    os.symlink(release,ROOT/'current')
    receipt={'status':'LOOPBACK_ACCEPTED_NOT_PUBLIC','git_sha':release_sha,'image_id':build['image_id'],
      'ci_run_id':int(run_text),'mode':'TEST','company_id':COMPANY,'origin':ORIGIN,
      'checked_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'initial_accounts':initial,
      'checks':{'authenticated_loopback_smoke':'PASS','default_credentials_absent':'PASS','session_cookie_security':'PASS','csrf':'PASS','logout_revocation':'PASS','existing_containers_preserved':'PASS'},
      'real_search':{'status':run['data']['status'],'seen':run['data']['seen'],'matched':run['data']['matched'],'sources':run['data']['sources']},
      'first_page_opportunities':len(opportunities['items']),'first_page_drafts':len(drafts['items']),
      'external_send_enabled':False,'ai_provider_enabled':False,'public_dns_created':False}
    write_json(ROOT/'ops'/('install-'+release_sha+'.json'),receipt)
    print(json.dumps(receipt))
except Exception as error:
    print(json.dumps({'status':'BLOCKED','stage':stage,'error':str(error)[:160] if isinstance(error,RuntimeError) else type(error).__name__,'log_path':str(log_path),'source_sha':release_sha,'public_dns_created':False}))
    sys.exit(1)
finally:
    log.close();os.close(lock_fd)
