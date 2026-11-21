"""Derive the public-release gate only from exact observed acceptance receipts."""
import datetime as dt, hashlib, json, os, pathlib, socket, stat, urllib.request

ROOT=pathlib.Path('/srv/knaba/lead-agent')
SHA='89366d0a440fe1507bef65806da2364027d6edc1'
ARCHIVE='b2fee170d97e22dda28af4dd1620488f00ca43908f7c21c56b502e48f1ce665b'
IMAGE='sha256:307ef360f7306996fe0d2e471db47ae011711bfa4e0dde1ed95a3847538c6fd9'
RUN=42497316706

def read_receipt(path):
    info=path.lstat()
    assert stat.S_ISREG(info.st_mode) and info.st_uid==0 and info.st_mode & 0o077==0 and info.st_size<4*1024*1024
    return json.loads(path.read_text())

def main():
    assert os.geteuid()==0 and socket.gethostname()=='knaba'
    os.umask(0o077)
    for folder in (ROOT,ROOT/'ops',ROOT/'private'):
        info=folder.lstat();assert stat.S_ISDIR(info.st_mode) and info.st_uid==0 and info.st_mode & 0o077==0
    build=read_receipt(ROOT/'ops'/('build-'+SHA+'.json'))
    install=read_receipt(ROOT/'ops'/('install-'+SHA+'.json'))
    backup=read_receipt(ROOT/'ops'/('backup-restore-'+SHA+'.json'))
    assert build['source_sha']==SHA and build['source_archive_sha256']==ARCHIVE and build['image_id']==IMAGE
    assert install['status']=='LOOPBACK_ACCEPTED_NOT_PUBLIC' and install['git_sha']==SHA and install['image_id']==IMAGE and install['ci_run_id']==RUN
    assert install['mode']=='TEST' and install['company_id']=='knaba-lead-agent-test' and install['origin']=='https://bot.knaba.de'
    assert all(install['checks'][k]=='PASS' for k in ('authenticated_loopback_smoke','default_credentials_absent','session_cookie_security','csrf','logout_revocation','unrelated_runtimes_preserved','database_volume_preserved','test_credentials_preserved'))
    assert install['real_search']['status'] in ('SUCCEEDED','PARTIAL') and any(s['status']=='SUCCESS' for s in install['real_search']['sources'])
    assert backup['status']=='BACKUP_AND_RESTORE_VERIFIED' and backup['source_sha']==SHA and backup['application_image_id']==IMAGE
    assert backup['restore_verified'] is True and backup['drill_cleanup']=='DROPPED_OWN_DATABASE' and backup['synthetic_restore_bypass'] is False
    assert backup['original_snapshot']['gitSha']==SHA and backup['original_snapshot']['companyCount']==1
    file=pathlib.Path(backup['backup_file'])
    assert file.resolve()==file and file.is_relative_to(ROOT/'backups')
    assert hashlib.sha256(file.read_bytes()).hexdigest()==backup['backup_sha256']
    sidecar=pathlib.Path(str(file)+'.hmac')
    assert sidecar.resolve()==sidecar and hashlib.sha256(sidecar.read_bytes()).hexdigest()==backup['hmac_file_sha256']
    artifact=ROOT/'releases'/SHA/'source.tar'
    assert hashlib.sha256(artifact.read_bytes()).hexdigest()==ARCHIVE
    req=urllib.request.Request('https://api.github.com/repos/ziko1/knaba/actions/runs/'+str(RUN),headers={'Accept':'application/vnd.github+json','User-Agent':'KNABA-exact-release-gate'})
    with urllib.request.urlopen(req,timeout=20) as response:
        assert response.status==200
        ci=json.loads(response.read(2*1024*1024))
    assert ci['head_sha']==SHA and ci['status']=='completed' and ci['conclusion']=='success'
    gate={'schema':1,'git_sha':SHA,'artifact_sha256':ARCHIVE,'artifact_path':str(artifact),'api_image_id':IMAGE,
        'mode':'TEST','origin':'https://bot.knaba.de','company_id':'knaba-lead-agent-test','verified_at':dt.datetime.now(dt.timezone.utc).isoformat(),
        'checks':{'source_review':'PASS','ci':'PASS','authenticated_loopback_smoke':'PASS','default_credentials_absent':'PASS','postgres_backup':'PASS','backup_restore':'PASS'},
        'evidence':{'ci_url':ci['html_url'],'install_receipt':str(ROOT/'ops'/('install-'+SHA+'.json')),
          'backup_receipt':str(ROOT/'ops'/('backup-restore-'+SHA+'.json')),'backup_sha256':backup['backup_sha256'],
          'review':'Root source review plus independent infra review of exact CI, isolated upgrade operator, and backup operator; source tree e6166720f4b52d22e6c9f65ebb6b90881e4a717c'}}
    target=ROOT/'private/release-gate.json'
    fd=os.open(target,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,'w') as output:json.dump(gate,output,indent=2);output.write('\n');output.flush();os.fsync(output.fileno())
    print(json.dumps({'status':'RELEASE_GATE_DERIVED_FROM_ACTUAL_RECEIPTS','git_sha':SHA,'ci_run_id':RUN,'backup_sha256':backup['backup_sha256'],'private_gate':str(target)}))

if __name__=='__main__':
    try:main()
    except Exception as error:
        print(json.dumps({'status':'GATE_NOT_CREATED','exception_type':type(error).__name__,'secret_values_printed':False}))
        raise SystemExit(1)
