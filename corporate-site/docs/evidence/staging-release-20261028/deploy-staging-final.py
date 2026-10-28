"""Recorded staging-only invocation of the existing KNABA handover runbook.
Run on the existing authorized VPS as root. No customer bootstrap, DNS or indexing.
Private backup/config contents stay on that server; this file contains no secrets.
"""
from pathlib import Path
import datetime, fcntl, hashlib, json, os, shutil, sqlite3, subprocess, tarfile, time
import urllib.request, urllib.error

SHA='5cf1f9734c4b140344aa02e584a634a86e310b71'
EXPECTED_PREVIOUS='306feaec00eb78fd620412de12208ed8ee45f029'
ARCHIVE_SHA='7e4dfe6d097616023da8482fc3a90f60fb15ecfe5bd460d3c6b864f5a65029dd'
ROOT=Path('/srv/knaba/vps')
BUILD=Path('/srv/knaba/ops/knaba-demo-b05b112bf907')
EVIDENCE=BUILD/'evidence/final-deploy-healthy'
DEST=ROOT/'releases'/SHA
BUNDLE=BUILD/'bundles'/('knaba-candidate-'+SHA+'.tar.gz')
ORIGIN='https://kneba.vsp.rest'
report={'source':SHA,'started_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'environment':ORIGIN,'customer_production':'NOT_TOUCHED','switched':False}
locks=[]
def run(args,**kw):
    p=subprocess.run(args,capture_output=True,text=True,**kw)
    if p.returncode: raise RuntimeError('Command failed: '+args[0]+'; '+p.stderr[-500:])
    return p.stdout
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def state(path):
    con=sqlite3.connect('file:'+str(path)+'?mode=ro',uri=True)
    try:
        names=[r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")]
        counts={n:con.execute('SELECT count(*) FROM "'+n+'"').fetchone()[0] for n in names}
        schema=list(con.execute("SELECT type,name,sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY type,name"))
        return {'integrity':con.execute('PRAGMA integrity_check').fetchone()[0],'foreign_key_errors':len(con.execute('PRAGMA foreign_key_check').fetchall()),'counts':counts,'schema_sha256':hashlib.sha256(json.dumps(schema).encode()).hexdigest()}
    finally:con.close()
def file_manifest(root):return {str(p.relative_to(root)):digest(p) for p in root.rglob('*') if p.is_file()}
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):return None
opener=urllib.request.build_opener(NoRedirect)
def get(path):
    try:r=opener.open(urllib.request.Request(ORIGIN+path,headers={'Cache-Control':'no-cache','User-Agent':'KNABA-authorized-release-smoke/1.0'}),timeout=10)
    except urllib.error.HTTPError as err:r=err
    with r:return r.status,dict(r.headers),r.read().decode(errors='replace')
def switch(target):
    tmp=ROOT/('.current-demo-'+str(os.getpid()));os.symlink(str(target),tmp);os.replace(tmp,ROOT/'current')
def start():run(['docker','compose','-f',str(ROOT/'docker-compose.yml'),'up','-d','--force-recreate','--no-deps','--wait','--wait-timeout','60','web'],cwd=ROOT,timeout=80)

try:
    os.umask(0o077)
    EVIDENCE.mkdir(mode=0o700,exist_ok=False)
    for name in ['.knaba-preview-deploy.lock','.knaba-preview-release.lock','.ui-visual-release.lock']:
        f=(ROOT/name).open('a');fcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB);locks.append(f)
    previous=(ROOT/'current').resolve();report['previous_source']=previous.name
    assert previous.name==EXPECTED_PREVIOUS,'Current pointer changed; coordinate before retry'
    assert digest(BUNDLE)==ARCHIVE_SHA,'Archive checksum mismatch'
    build_receipt=json.loads((BUILD/'evidence/final-build-and-bundle.json').read_text())
    assert build_receipt['source']==SHA and all(x['exit_code']==0 for x in build_receipt['runs'])
    report['archive_sha256']=ARCHIVE_SHA;report['client_artifact_sha256']=build_receipt['client_artifact_sha256']
    report['config_sha256']={str(p.relative_to(ROOT)):digest(p) for p in [ROOT/'docker-compose.yml',ROOT/'config/site.env']}
    report['image_id']=run(['docker','inspect','-f','{{.Image}}','knaba-vps-internal']).strip()
    runtime_user=run(['docker','inspect','-f','{{.Config.User}}','knaba-vps-internal']).strip()
    uid,gid=map(int,runtime_user.split(':'));assert uid>0 and gid>0
    report['runtime_user']=runtime_user
    # Native Node SQLite online backup; never copy the open DB/WAL.
    backup_info=json.loads(run(['docker','exec','knaba-vps-internal','node','/app/vps/manage.mjs','backup']))
    backup=ROOT/'state'/Path(backup_info['path']).relative_to('/var/lib/knaba')
    assert digest(backup)==backup_info['sha256']
    report['backup_sha256']=backup_info['sha256'];report['backup_bytes']=backup_info['bytes']
    report['backup_private_path']=str(backup)
    report['before']=state(backup)
    assert report['before']['integrity']=='ok' and report['before']['foreign_key_errors']==0
    # Only closed backup is copied for isolation. Config archive stays private.
    restore=EVIDENCE/'restore';restore.mkdir(mode=0o700)
    shutil.copy2(backup,restore/'site.sqlite');os.chmod(restore/'site.sqlite',0o600)
    os.chown(restore,uid,gid);os.chown(restore/'site.sqlite',uid,gid)
    assert digest(restore/'site.sqlite')==digest(backup)
    with tarfile.open(EVIDENCE/'config-private.tar.gz','w:gz') as archive:
        for rel in ['docker-compose.yml','.env','config/site.env']:
            if (ROOT/rel).is_file():archive.add(ROOT/rel,arcname=rel,recursive=False)
    report['files']={'uploads_present':(ROOT/'state/uploads').exists(),'existing_qa_and_receipt_directories':'PRESERVED_UNCHANGED','static_assets':'previous immutable release retained'}
    assert not report['files']['uploads_present'],'Uploads require a coordinated file snapshot before switch'
    env={**os.environ,'KNABA_BUNDLE_FILE':str(BUNDLE),'KNABA_EXPECTED_SHA':SHA}
    if DEST.exists():
        for part in ['dist','vps','drizzle']:
            assert file_manifest(DEST/part)==file_manifest(BUILD/'source/corporate-site'/part),'Existing staged artifact differs '+part
        assert digest(DEST/'package.json')==digest(BUILD/'source/corporate-site/package.json')
        report['existing_staged_artifact']='REUSED_AFTER_EXACT_RAW_FILE_VERIFICATION'
    else:run(['bash',str(BUILD/'source/corporate-site/vps/owner-server-setup.sh'),'stage'],env=env,timeout=40)
    assert file_manifest(previous/'drizzle')==file_manifest(DEST/'drizzle'),'Schema change requires a separate migration plan'
    report['migration_files_sha256']=file_manifest(DEST/'drizzle')
    probe="""import {createKnabaVpsServer} from '/app/vps/server.mjs';import {request} from 'node:http';
const app=await createKnabaVpsServer({dbPath:'/restore/site.sqlite',staticRoot:'/app/dist/client',workerPath:'file:///app/dist/server/index.js',ownerEmail:process.env.OWNER_EMAIL||'',developerEmail:process.env.KNABA_DEVELOPER_EMAIL||'',host:'127.0.0.1',port:0,origin:'https://kneba.vsp.rest',localTest:false});
const read=path=>new Promise((resolve,reject)=>{const r=request({host:'127.0.0.1',port:app.port,path,headers:{Host:'kneba.vsp.rest','X-Forwarded-Proto':'https'}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});r.on('error',reject);r.end();});
try{const results=[];for(const [path,expected] of [['/readyz',200],['/',200],['/uk/',200],['/en/',200],['/ru/',200],['/api/crm/contacts',401],['/ber',308],['/jobs',308]]){const status=await read(path);results.push({path,status,expected});if(status!==expected)throw Error('Isolated restore HTTP mismatch '+path+' status '+status);}console.log(JSON.stringify({restored_runtime:'PASS',runtimeUser:process.getuid(),results}));}finally{await app.close();}"""
    restore_command=['docker','run','--rm','--pull=never','--network=none','--read-only','--user',runtime_user,'--cap-drop=ALL','--security-opt=no-new-privileges:true','--memory=512m','--cpus=1','--pids-limit=64','--env-file',str(ROOT/'config/site.env')]
    for part in ['dist','vps','drizzle','package.json']:restore_command+=['-v',str(DEST/part)+':/app/'+part+':ro']
    restore_command+=['-v',str(restore)+':/restore','-w','/app',report['image_id'],'node','--input-type=module','-e',probe]
    restored=run(restore_command,timeout=40)
    report['isolated_restore']=json.loads(restored.strip());report['restore_state']=state(restore/'site.sqlite')
    assert report['before']==report['restore_state'],'Restored startup changed protected data unexpectedly'
    assert (ROOT/'current').resolve()==previous,'Current pointer changed during preparation'
    switch(DEST);report['switched']=True;start()
    for attempt in range(40):
        try:
            if get('/readyz')[0]==200:break
        except Exception:pass
        time.sleep(1)
    else:raise RuntimeError('Public readiness timeout')
    checks=[];report['public_smoke']=checks
    for path,expected in [('/',200),('/en/',200),('/uk/',200),('/ru/',200),('/login/',200),('/konto/',200),('/sitemap.xml',200),('/ber',308),('/jobs',308),('/api/crm/contacts',401),('/this-knaba-page-does-not-exist-20261028/',404)]:
        status,headers,body=get(path);robots=headers.get('X-Robots-Tag',headers.get('x-robots-tag',''))
        checks.append({'path':path,'status':status,'expected':expected,'x_robots_tag':robots,'location':headers.get('Location',headers.get('location',''))})
        assert status==expected,'Public status mismatch '+path+' status '+str(status)
        if status==200:assert 'noindex' in robots.lower(),'Staging noindex missing '+path
    report['public_smoke']=checks;report['after']=state(ROOT/'state/site.sqlite')
    assert report['after']['integrity']=='ok' and report['after']['foreign_key_errors']==0
    assert report['after']['schema_sha256']==report['before']['schema_sha256']
    for table,count in report['before']['counts'].items():assert report['after']['counts'][table]>=count,'Row count reduced: '+table
    # Every deployed runtime file must equal the verified immutable bundle source.
    report['runtime_files']={name:digest(DEST/name) for name in ['vps/server.mjs','dist/server/index.js','dist/vps/render-page.mjs','package.json']}
    for part in ['dist','vps','drizzle']:
        assert file_manifest(DEST/part)==file_manifest(BUILD/'source/corporate-site'/part),'Artifact content mismatch '+part
    report['active_source']=str((ROOT/'current').resolve());report['result']='PASS_STAGING_DEPLOYMENT_ONLY'
except Exception as exc:
    report['result']='BLOCKED';report['error']=str(exc)
    if report.get('switched'):
        try:
            assert (ROOT/'current').resolve()==DEST,'Concurrent current switch; no overwrite'
            switch(previous);start();report['rollback']='PREVIOUS_CODE_RESTORED_WITH_CURRENT_DATABASE';report['rollback_ready_status']=get('/readyz')[0]
        except Exception as rollback:report['rollback_error']=str(rollback)
finally:
    report['finished_at']=datetime.datetime.now(datetime.timezone.utc).isoformat()
    if EVIDENCE.exists():(EVIDENCE/'receipt-private.json').write_text(json.dumps(report,indent=2)+'\n')
    for f in reversed(locks):f.close()
    # Secret values, database rows and config contents never leave the server.
    public={k:v for k,v in report.items() if k!='backup_private_path'}
    print(json.dumps(public))
if report.get('result')!='PASS_STAGING_DEPLOYMENT_ONLY':raise SystemExit(1)
