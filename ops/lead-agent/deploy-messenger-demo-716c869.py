#!/usr/bin/env python3
import http.client,json,os,pathlib,re,shutil,subprocess,sys,time
ROOT=pathlib.Path('/srv/knaba/lead-agent')
OLD='89366d0a440fe1507bef65806da2364027d6edc1'
NEW='716c869f7829ca895df8a0acc729fda490c0ae15'
ENV=ROOT/'private/runtime.env'
CURRENT=ROOT/'current'
def fail(x): raise RuntimeError(x)
def envread():
 d={}
 for l in ENV.read_text().splitlines():
  if '=' in l and not l.startswith('#'):
   k,v=l.split('=',1);d[k]=v
 return d
def envwrite(d):
 t=ENV.with_name('.runtime.deploy.next')
 t.write_text('\n'.join(f'{k}={v}' for k,v in d.items())+'\n');os.chmod(t,0o600);os.replace(t,ENV)
def compose(rel,*args):
 return subprocess.run(['docker','compose','--project-name','knaba-lead-agent-test','--env-file',str(ENV),'-f',str(rel/'erp/infra/compose.yml'),'-f',str(rel/'erp/infra/compose.lead-agent.yml'),*args],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode
def probe(path):
 c=http.client.HTTPConnection('127.0.0.1',19180,timeout=10)
 try:
  c.request('GET',path,headers={'Host':'bot.knaba.de','X-Forwarded-Proto':'https'})
  r=c.getresponse();body=r.read(65536)
  return r.status,json.loads(body) if body else {}
 finally:c.close()
def main():
 if os.geteuid()!=0: fail('ROOT_REQUIRED')
 oldrel=ROOT/'releases'/OLD;newrel=ROOT/'releases'/NEW
 if CURRENT.resolve()!=oldrel: fail('UNEXPECTED_CURRENT_RELEASE')
 if not newrel.is_dir(): fail('NEW_RELEASE_MISSING')
 image=subprocess.check_output(['docker','image','inspect','knaba-de-api:'+NEW,'--format','{{index .Config.Labels "org.opencontainers.image.revision"}}'],text=True).strip()
 if image!=NEW: fail('IMAGE_REVISION_MISMATCH')
 d=envread()
 if d.get('GIT_SHA')!=OLD or d.get('APP_MODE')!='TEST' or d.get('PUBLIC_ORIGIN')!='https://bot.knaba.de': fail('RUNTIME_BASELINE_MISMATCH')
 backup=ROOT/'private/runtime.before-deploy-716c869.env';shutil.copy2(ENV,backup);os.chmod(backup,0o600)
 d['GIT_SHA']=NEW;envwrite(d)
 tmp=ROOT/'current.next'
 try:
  if tmp.exists() or tmp.is_symlink():tmp.unlink()
  os.symlink(newrel,tmp);os.replace(tmp,CURRENT)
  if compose(newrel,'up','-d','--no-deps','--no-build','api','worker')!=0: fail('COMPOSE_UP_FAILED')
  ok=False
  for _ in range(45):
   try:
    s,v=probe('/api/v1/version')
    sr,_=probe('/api/v1/ready')
    if s==200 and sr==200 and v.get('sha')==NEW:ok=True;break
   except Exception:pass
   time.sleep(2)
  if not ok: fail('READINESS_TIMEOUT')
  print(json.dumps({'status':'DEPLOYED_TEST_RUNTIME','sha':NEW,'origin':'https://bot.knaba.de','productionChanged':False}))
 except Exception:
  shutil.copy2(backup,ENV)
  if CURRENT.exists() or CURRENT.is_symlink():CURRENT.unlink()
  os.symlink(oldrel,CURRENT)
  compose(oldrel,'up','-d','--no-deps','--no-build','api','worker')
  raise
if __name__=='__main__':
 try:main()
 except Exception as e:
  print(json.dumps({'status':'BLOCKED','reason':str(e)[:120],'rollback':'ATTEMPTED'}));sys.exit(2)
