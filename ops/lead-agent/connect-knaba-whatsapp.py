#!/usr/bin/env python3
import getpass, json, os, re, secrets, shutil, stat, subprocess, urllib.request
from pathlib import Path

ROOT=Path('/srv/knaba/lead-agent')
ENV=ROOT/'private/runtime.env'
ORIGIN='https://bot.knaba.de'
# Pin the authorized Meta Phone Number ID in root-private runtime.env as
# KNABA_META_EXPECTED_PHONE_NUMBER_ID before running this connector.

def fail(code):
    print(json.dumps({'status':'BLOCKED','reason':code,'secretsPrinted':False}))
    raise SystemExit(2)

def read_env():
    values={};order=[]
    for line in ENV.read_text().splitlines():
        if not line or line.startswith('#') or '=' not in line: continue
        k,v=line.split('=',1)
        if k in values: fail('DUPLICATE_ENV_KEY')
        values[k]=v;order.append(k)
    return values,order

def write_env(values,order):
    tmp=ENV.with_name('.runtime.whatsapp.next')
    fd=os.open(tmp,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
    with os.fdopen(fd,'w') as f:
        f.write('\n'.join(f'{k}={values[k]}' for k in order)+'\n');f.flush();os.fsync(f.fileno())
    os.replace(tmp,ENV)

def compose(*args):
    current=(ROOT/'current').resolve()
    cmd=['docker','compose','--project-name','knaba-lead-agent-test','--env-file',str(ENV),
         '-f',str(current/'erp/infra/compose.yml'),'-f',str(current/'erp/infra/compose.lead-agent.yml'),*args]
    result=subprocess.run(cmd,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    if result.returncode: fail('COMPOSE_OPERATION_FAILED')

def read_phone_scope(values):
    phone_id=values.get('KNABA_META_EXPECTED_PHONE_NUMBER_ID','')
    if not isinstance(phone_id,str) or not re.fullmatch(r'[1-9][0-9]{7,19}',phone_id):
        fail('META_PHONE_SCOPE_REQUIRED_OR_INVALID')
    return phone_id


def graph(version,token,expected_phone_id):
    url=f'https://graph.facebook.com/{version}/{expected_phone_id}?fields=id,display_phone_number,verified_name'
    req=urllib.request.Request(url,headers={'Authorization':'Bearer '+token,'Accept':'application/json'})
    try:
        with urllib.request.urlopen(req,timeout=15) as response:
            raw=response.read(65537)
        if len(raw)>65536: fail('META_RESPONSE_TOO_LARGE')
        value=json.loads(raw)
    except Exception:
        fail('META_ACCOUNT_CHECK_FAILED')
    if str(value.get('id',''))!=expected_phone_id or not value.get('display_phone_number'):
        fail('META_PHONE_ID_MISMATCH')
    return value

def main():
    if os.geteuid()!=0: fail('ROOT_REQUIRED')
    info=ENV.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid!=0 or info.st_mode & 0o077:
        fail('PRIVATE_ENV_PERMISSIONS_REQUIRED')
    values,order=read_env()
    expected_phone_id=read_phone_scope(values)
    if values.get('APP_MODE')!='TEST' or values.get('PUBLIC_ORIGIN')!=ORIGIN: fail('TEST_RUNTIME_REQUIRED')
    if values.get('GIT_SHA')!='716c869f7829ca895df8a0acc729fda490c0ae15': fail('EXPECTED_DEMO_SHA_NOT_ACTIVE')
    version=input('Current Meta Graph API version (format vNN.N): ').strip()
    if not re.fullmatch(r'v[0-9]{1,3}\.[0-9]{1,2}',version): fail('WHATSAPP_API_VERSION_INVALID')
    token=getpass.getpass('Fresh Meta access token (hidden): ').strip()
    app_secret=getpass.getpass('Meta App Secret (hidden): ').strip()
    if len(token)<20 or len(app_secret)<16: fail('META_CREDENTIAL_FORMAT_INVALID')
    identity=graph(version,token,expected_phone_id)
    public_number=re.sub(r'[^0-9]','',str(identity['display_phone_number']))
    if not re.fullmatch(r'[1-9][0-9]{7,14}',public_number): fail('WHATSAPP_PUBLIC_NUMBER_INVALID')
    verify=secrets.token_urlsafe(32)
    backup=ROOT/'private'/('runtime.before-whatsapp-connect-'+secrets.token_hex(6)+'.env')
    shutil.copy2(ENV,backup);os.chmod(backup,0o600)
    updates={
      'WHATSAPP_PHONE_NUMBER_ID':expected_phone_id,
      'WHATSAPP_PUBLIC_NUMBER':public_number,
      'WHATSAPP_ACCESS_TOKEN':token,
      'WHATSAPP_VERIFY_TOKEN':verify,
      'WHATSAPP_APP_SECRET':app_secret,
      'WHATSAPP_API_VERSION':version,
      'WHATSAPP_ACCOUNT_CAPABILITIES_VERIFIED':'false',
      'WHATSAPP_TEST_RECIPIENTS':'',
      'LIVE_SEND_ALLOWED':'false'
    }
    for k,v in updates.items():
        if k not in order: order.append(k)
        values[k]=v
    write_env(values,order)
    compose('up','-d','--no-deps','--force-recreate','api','worker')
    setup=ROOT/'private/whatsapp-webhook-setup.txt'
    fd=os.open(setup,os.O_CREAT|os.O_TRUNC|os.O_WRONLY,0o600)
    with os.fdopen(fd,'w') as f:
        f.write('Callback URL: '+ORIGIN+'/webhooks/whatsapp\n')
        f.write('Verify token: '+verify+'\n')
        f.write('Subscribe field: messages\n')
        f.write('Requested display name: KNABA Assistant\n')
    print(json.dumps({
      'status':'CONFIGURED_INBOUND_PENDING_META_WEBHOOK',
      'phoneNumberId':expected_phone_id,
      'publicNumber':public_number,
      'verifiedName':identity.get('verified_name'),
      'callbackUrl':ORIGIN+'/webhooks/whatsapp',
      'metaSetupFile':str(setup),
      'outboundEnabled':False,
      'displayNameRequested':'KNABA Assistant',
      'secretsPrinted':False
    },ensure_ascii=False,indent=2))

if __name__=='__main__': main()
