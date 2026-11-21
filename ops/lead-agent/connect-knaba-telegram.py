#!/usr/bin/env python3
import getpass, json, os, re, secrets, shutil, subprocess, sys, urllib.request, urllib.error
from pathlib import Path

ROOT=Path('/srv/knaba/lead-agent')
ENV=ROOT/'private/runtime.env'
EXPECTED_USERNAME='knaba_cleaning_bot'
ORIGIN='https://bot.knaba.de'

def fail(code):
    print(json.dumps({'status':'BLOCKED','reason':code,'tokenPrinted':False}))
    raise SystemExit(2)

def read_env():
    values={}
    order=[]
    for line in ENV.read_text().splitlines():
        if not line or line.startswith('#') or '=' not in line: continue
        k,v=line.split('=',1)
        if k in values: fail('DUPLICATE_ENV_KEY')
        values[k]=v;order.append(k)
    return values,order

def write_env(values,order):
    tmp=ENV.with_name('.runtime.telegram.next')
    fd=os.open(tmp,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
    with os.fdopen(fd,'w') as f:
        f.write('\n'.join(f'{k}={values[k]}' for k in order)+'\n')
        f.flush();os.fsync(f.fileno())
    os.replace(tmp,ENV)

def api(token,method,payload=None):
    url='https://api.telegram.org/bot'+token+'/'+method
    data=None if payload is None else json.dumps(payload).encode()
    req=urllib.request.Request(url,data=data,headers={'Content-Type':'application/json'})
    try:
        with urllib.request.urlopen(req,timeout=15) as response:
            raw=response.read(65537)
        if len(raw)>65536: fail('TELEGRAM_RESPONSE_TOO_LARGE')
        value=json.loads(raw)
    except Exception:
        fail('TELEGRAM_API_CHECK_FAILED')
    if value.get('ok') is not True: fail('TELEGRAM_API_REJECTED')
    return value.get('result')

def compose(values,*args):
    current=(ROOT/'current').resolve()
    cmd=['docker','compose','--project-name','knaba-lead-agent-test','--env-file',str(ENV),
         '-f',str(current/'erp/infra/compose.yml'),'-f',str(current/'erp/infra/compose.lead-agent.yml'),*args]
    result=subprocess.run(cmd,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    if result.returncode: fail('COMPOSE_OPERATION_FAILED')

def main():
    if os.geteuid()!=0: fail('ROOT_REQUIRED')
    info=ENV.stat()
    if info.st_mode & 0o077: fail('PRIVATE_ENV_PERMISSIONS_REQUIRED')
    values,order=read_env()
    if values.get('APP_MODE')!='TEST' or values.get('PUBLIC_ORIGIN')!=ORIGIN: fail('TEST_RUNTIME_REQUIRED')
    if values.get('GIT_SHA')!='716c869f7829ca895df8a0acc729fda490c0ae15': fail('EXPECTED_DEMO_SHA_NOT_ACTIVE')
    token=getpass.getpass('Fresh BotFather token for @knaba_cleaning_bot (hidden): ').strip()
    if not re.fullmatch(r'[0-9]{4,20}:[A-Za-z0-9_-]{20,200}',token): fail('TELEGRAM_TOKEN_FORMAT_INVALID')
    identity=api(token,'getMe')
    if not isinstance(identity,dict) or identity.get('username','').lower()!=EXPECTED_USERNAME: fail('TELEGRAM_ACCOUNT_MISMATCH')
    if api(token,'setMyName',{'name':'KNABA Assistant'}) is not True: fail('TELEGRAM_NAME_UPDATE_FAILED')
    if api(token,'setMyShortDescription',{'short_description':'KNABA Assistant · заявки, послуги та зв’язок з оператором'}) is not True: fail('TELEGRAM_DESCRIPTION_UPDATE_FAILED')
    commands=[
      {'command':'start','description':'Відкрити меню KNABA'},
      {'command':'consent','description':'Дозволити відповіді KNABA у цьому чаті'},
      {'command':'services','description':'Послуги KNABA'},
      {'command':'request','description':'Створити запит'},
      {'command':'register','description':'Запит працівника'},
      {'command':'partner','description':'Запит партнера'},
      {'command':'human','description':'Передати оператору'},
      {'command':'stop','description':'Зупинити повідомлення'}]
    if api(token,'setMyCommands',{'commands':commands}) is not True: fail('TELEGRAM_COMMANDS_UPDATE_FAILED')
    secret=values.get('TELEGRAM_WEBHOOK_SECRET','')
    if not re.fullmatch(r'[A-Za-z0-9_-]{16,256}',secret): fail('TELEGRAM_WEBHOOK_SECRET_MISSING')
    backup=ROOT/'private'/('runtime.before-telegram-connect-'+secrets.token_hex(6)+'.env')
    shutil.copy2(ENV,backup);os.chmod(backup,0o600)
    values['TELEGRAM_BOT_TOKEN']=token
    values['TELEGRAM_LIVE_SEND_ALLOWED']='false'
    if 'TELEGRAM_BOT_TOKEN' not in order: order.append('TELEGRAM_BOT_TOKEN')
    if 'TELEGRAM_LIVE_SEND_ALLOWED' not in order: order.append('TELEGRAM_LIVE_SEND_ALLOWED')
    write_env(values,order)
    compose(values,'up','-d','--no-deps','--force-recreate','api','worker')
    desired=ORIGIN+'/webhooks/telegram'
    result=api(token,'setWebhook',{'url':desired,'secret_token':secret,'allowed_updates':['message','callback_query'],'drop_pending_updates':False})
    if result is not True: fail('TELEGRAM_WEBHOOK_NOT_CONFIRMED')
    state=api(token,'getWebhookInfo')
    if not isinstance(state,dict) or state.get('url')!=desired: fail('TELEGRAM_WEBHOOK_READBACK_MISMATCH')
    print(json.dumps({
      'status':'CONNECTED_INBOUND_ONLY',
      'bot':'@'+identity['username'],
      'webhook':desired,
      'pendingUpdates':state.get('pending_update_count'),
      'hasWebhookError':bool(state.get('last_error_date')),
      'outboundEnabled':False,
      'next':'Open the bot, send /consent, then send KNABA-DEMO-001. Outbound remains disabled until the allowed chat is verified.',
      'tokenPrinted':False
    },ensure_ascii=False,indent=2))

if __name__=='__main__': main()
