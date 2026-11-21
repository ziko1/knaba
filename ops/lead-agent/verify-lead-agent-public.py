"""Actual HTTPS/session/module/CRM acceptance in the isolated synthetic workspace."""
import datetime as dt, http.client, http.cookies, json, os, pathlib, re, socket, stat, sys, uuid

ROOT=pathlib.Path('/srv/knaba/lead-agent')
SHA='89366d0a440fe1507bef65806da2364027d6edc1'
HOST='bot.knaba.de'
ORIGIN='https://'+HOST
COMPANY='knaba-lead-agent-test'
stage='PUBLIC_IDENTITY'
cookie=None
csrf=None

def request(path,method='GET',body=None,authenticated=False):
    headers={'Origin':ORIGIN,'Accept':'application/json'}
    if authenticated:
        assert cookie and csrf
        headers.update({'Cookie':cookie,'X-CSRF-Token':csrf})
    data=None
    if body is not None:data=json.dumps(body).encode();headers['Content-Type']='application/json'
    connection=http.client.HTTPSConnection(HOST,timeout=20)
    try:
        connection.request(method,path,body=data,headers=headers)
        response=connection.getresponse();raw=response.read(2*1024*1024+1)
        assert len(raw)<=2*1024*1024
        try:value=json.loads(raw)
        except (ValueError,UnicodeError):value=None
        return response.status,{k.lower():v for k,v in response.getheaders()},value,raw
    finally:connection.close()

def action(name,value,version=None,key=None):
    envelope={'input':value,'idempotency_key':key or str(uuid.uuid4())}
    if version is not None:envelope['expected_version']=version
    code,_,result,_=request('/api/v1/commands/'+name,'POST',envelope,True)
    if code not in (200,201):raise RuntimeError('ACTION_'+name.replace('.','_')+'_HTTP_'+str(code))
    return result

def main():
    global stage,cookie,csrf
    assert os.geteuid()==0 and socket.gethostname()=='knaba'
    os.umask(0o077)
    code,headers,version,_=request('/api/v1/version')
    assert code==200 and version['sha']==SHA and version['mode']=='TEST' and 'noindex' in headers.get('x-robots-tag','')
    assert request('/api/v1/ready')[0]==200
    assert request('/api/v1/me')[0] in (401,403)
    code,headers,_,_=request('/')
    assert code==302 and headers.get('location')=='/app/lead-agent?language=UK'
    code,headers,_,html=request('/app/lead-agent?language=UK')
    assert code==200 and 'text/html' in headers.get('content-type','') and 'noindex' in headers.get('x-robots-tag','')
    text=html.decode()
    scripts=re.findall(r'<script[^>]+src="(/[^"\s]+)"',text)
    styles=re.findall(r'<link[^>]+href="(/[^"\s]+\.css)"',text)
    assert scripts and styles and len(scripts)+len(styles)<=20
    for path in scripts+styles:
        assert not path.startswith('//') and '..' not in path
        code,headers,_,_=request(path,'HEAD')
        assert code==200 and ('javascript' in headers.get('content-type','') or 'css' in headers.get('content-type',''))
    stage='PUBLIC_AUTHENTICATION'
    file=ROOT/'private/access.json';info=file.lstat()
    assert stat.S_ISREG(info.st_mode) and info.st_uid==0 and info.st_mode & 0o077==0
    access=json.loads(file.read_text())
    assert access['source_sha']==SHA and access['url']==ORIGIN and access['mode']=='TEST'
    code,headers,login,_=request('/api/v1/auth/login','POST',{'email':access['email'],'password':access['password']})
    assert code in (200,201)
    cookies=http.cookies.SimpleCookie();cookies.load(headers['set-cookie']);session=cookies['knaba_session']
    assert session['secure'] and session['httponly'] and session['samesite'].lower()=='strict'
    cookie='knaba_session='+session.value;csrf=login['csrfToken']
    code,headers,me,_=request('/api/v1/me',authenticated=True)
    assert code==200 and me['actor']['companyId']==COMPANY and me['actor']['userId']=='lead-agent-test-operator'
    assert 'no-store' in headers.get('cache-control','') and 'lead_agent.manage' in me['actor']['permissions']
    stage='PUBLIC_MODULE_BEHAVIOR'
    catalog=action('lead_agent.catalog',{})
    assert catalog['capabilities']['externalSend'] is False and catalog['capabilities']['aiDrafts'] is False
    profiles=action('lead_agent.list',{'kind':'lead_agent_profile'})['items']
    opportunities=action('lead_agent.list',{'kind':'lead_agent_opportunity'})['items']
    drafts=action('lead_agent.list',{'kind':'lead_agent_draft'})['items']
    assert len(profiles)==1 and opportunities and drafts
    profile=profiles[0]
    estimate=action('lead_agent.estimate',{'profileId':profile['id'],'input':{'laborMinutes':240,'people':2,'materialCents':10000,'travelCents':2000,'platformFeeCents':0,'otherCents':0,'quantityVerified':False}})
    assert estimate['status']=='ESTIMATE' and estimate['binding'] is False and estimate['netCents']==48000 and estimate['grossCents'] is None
    available={o['id']:o for o in opportunities if not o['data'].get('crmLeadId')}
    draft=next(d for d in drafts if d['data']['opportunityId'] in available and d['data']['status']=='DRAFT')
    opportunity=available[draft['data']['opportunityId']]
    saved=action('lead_agent.draft.save',{'id':draft['id'],'text':draft['data']['text']},draft['version'])
    reviewed=action('lead_agent.draft.review',{'id':saved['id']},saved['version'])
    assert reviewed['data']['status']=='REVIEWED' and reviewed['data']['reviewPurpose']=='INTERNAL_ONLY_NOT_SEND_AUTHORIZATION'
    assert reviewed['data']['externalSendAvailable'] is False
    stage='SYNTHETIC_CRM_HANDOFF'
    lead_input={'contact':{'name':'SYNTHETIC TEST — не справжній клієнт','email':'synthetic-acceptance@knaba.invalid'},'serviceIds':['test-painting'],
        'source':{'channel':'REFERRAL'},'facts':{'restrictions':'Synthetic release acceptance only. No client contact or quotation sent.'},'language':'UK','newRequest':True}
    value={'opportunityId':opportunity['id'],'leadInput':lead_input};key='release-public-handoff-'+SHA
    handoff=action('lead_agent.handoff',value,opportunity['version'],key)
    assert handoff['kind']=='lead_reference' and handoff['created'] is True and set(handoff)=={'id','kind','created'}
    repeated=action('lead_agent.handoff',value,opportunity['version'],key)
    assert repeated==handoff
    code,_,leads,_=request('/api/v1/entities/lead?limit=100',authenticated=True)
    assert code==200
    found=next(e for e in leads['items'] if e['id']==handoff['id'])
    assert found['companyId']==COMPANY and found['data']['contact']['email']=='synthetic-acceptance@knaba.invalid'
    stage='PUBLIC_LOGOUT'
    assert request('/api/v1/auth/logout','POST',{},True)[0] in (200,201)
    assert request('/api/v1/me',authenticated=True)[0] in (401,403)
    cookie=None;csrf=None
    receipt={'status':'PUBLIC_HTTPS_ACCEPTED','git_sha':SHA,'origin':ORIGIN,'mode':'TEST','company_id':COMPANY,
        'verified_at':dt.datetime.now(dt.timezone.utc).isoformat(),'checks':{'tls_certificate':'PASS','exact_runtime_identity':'PASS',
        'html_and_static_assets':'PASS','private_authenticated_session':'PASS','session_cookie_security':'PASS','logout_revocation':'PASS',
        'nonbinding_price_estimate':'PASS','internal_template_draft_review':'PASS','synthetic_crm_handoff':'PASS','handoff_idempotency':'PASS'},
        'html_asset_count':len(scripts)+len(styles),'profile_count':len(profiles),'first_page_opportunities':len(opportunities),
        'first_page_drafts':len(drafts),'synthetic_crm_lead_id':handoff['id'],'customer_messages_sent':0,'ai_provider_enabled':False}
    target=ROOT/'ops'/('public-acceptance-'+SHA+'.json')
    fd=os.open(target,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,'w') as output:json.dump(receipt,output,indent=2);output.write('\n');output.flush();os.fsync(output.fileno())
    print(json.dumps(receipt))

if __name__=='__main__':
    try:main()
    except Exception as error:
        print(json.dumps({'status':'PUBLIC_ACCEPTANCE_FAILED','stage':stage,'reason':str(error)[:160] if isinstance(error,RuntimeError) else type(error).__name__,'secret_values_printed':False}))
        sys.exit(1)
    finally:
        if cookie and csrf:
            try:request('/api/v1/auth/logout','POST',{},True)
            except Exception:pass
