#!/usr/bin/env python3
"""Isolated KNABA Lead Agent encrypted backup and real restore drill.

Operator artifact: review before execution. No service deployment or DNS changes.
Usage:
  python3 backup-lead-agent.py run --sha <exact-sha> --private-env /srv/knaba/lead-agent/private/runtime.env
  python3 backup-lead-agent.py backup --sha <exact-sha> --private-env <same-file>
  python3 backup-lead-agent.py install-timer --sha <exact-sha> --private-env <same-file>

run builds/verifies an isolated tools image, backs up using the existing encrypted
and authenticated repository scripts, exports the current privacy ledger AFTER
the backup to a separate trust directory, restores into one randomly named empty
database, and drops only the database bearing this run's ownership marker.
backup makes a bounded snapshot without a restore drill. install-timer requires a
successful run receipt and an exact installed copy of this script. No pruning.

Before using any mode, provision /srv/knaba/lead-agent/private/backup-qa-uuids.json
as a root-owned regular file (0600) in the existing private directory. Its JSON
value must be an array of exactly two distinct lowercase, hyphenated UUID strings
for the historical Telegram QA tenants. The service and cron read this same file
on each invocation. An absent or malformed allowlist blocks operation.

The backup excludes runtime credentials, which remain in the root-private env
file. This verifies local backups/restoration; it does not claim off-host DR.
"""
import argparse
import datetime as dt
import fcntl
import hashlib
import json
import os
import pathlib
import re
import secrets
import shutil
import socket
import stat
import subprocess
import sys
import urllib.parse

ROOT = pathlib.Path('/srv/knaba/lead-agent')
OPS = ROOT / 'ops'
PRIVATE = ROOT / 'private'
BACKUPS = ROOT / 'backups'
TRUST = PRIVATE / 'backup-trust'
PROJECT = 'knaba-lead-agent-test'
NETWORK = PROJECT + '_default'
COMPANY = 'knaba-lead-agent-test'
INSTALLED = OPS / 'backup-lead-agent.py'
SERVICE = 'knaba-lead-agent-backup.service'
TIMER = 'knaba-lead-agent-backup.timer'
DOCKER = ['docker', '--host=unix:///var/run/docker.sock']
SAFE_ENV = {'PATH': '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin', 'LANG': 'C.UTF-8'}
MAX_FILE = 1024 ** 3
IMAGE_FORMAT = 'sha256:[0-9a-f]{64}'

TOOLS_CHECK = r"""
import {execFileSync} from 'node:child_process';
try {
 const pg=execFileSync('pg_dump',['--version'],{encoding:'utf8'}).trim();
 const restore=execFileSync('pg_restore',['--version'],{encoding:'utf8'}).trim();
 const ssl=execFileSync('openssl',['version'],{encoding:'utf8'}).trim();
 const timeout=execFileSync('timeout',['--version'],{encoding:'utf8'}).split('\n')[0];
 if(process.version!=='v24.22.1'||!/^pg_dump .*\b17\./.test(pg)||!/^pg_restore .*\b17\./.test(restore)||!ssl.startsWith('OpenSSL ')||!timeout.startsWith('timeout (GNU coreutils)'))throw Error();
 console.log(JSON.stringify({node:process.version,pg_dump:pg,pg_restore:restore,openssl:ssl}));
} catch { console.error('BACKUP_TOOLS_CHECK_FAILED');process.exitCode=1; }
"""

DB_OPERATION = r"""
import {Client} from 'pg';
import {quotedIdentifier,tableCounts} from './scripts/pg-tools.mjs';
import {readPrivacyLedger,privacyLedgerProof,companyIdsInSnapshot} from './scripts/backup-db.mjs';
const operation=process.env.KNABA_BACKUP_OPERATION;
const source=new URL(process.env.DATABASE_URL),target=process.env.KNABA_DRILL_DATABASE||'',marker=process.env.KNABA_DRILL_MARKER||'';
const connection=operation==='proof'?process.env.RESTORE_DATABASE_URL:process.env.DATABASE_URL;
const client=new Client({connectionString:connection,connectionTimeoutMillis:10000});
try {
 if(source.hostname!=='postgres'||source.port!=='5432')throw Error();
 await client.connect();await client.query("SET statement_timeout='30000ms'");await client.query("SET lock_timeout='5000ms'");
 const identity=(await client.query('SELECT current_database() AS database,current_user AS username,host(inet_server_addr()) AS address')).rows[0];
 const expectedDatabase=decodeURIComponent(new URL(connection).pathname.slice(1));
 if(identity.database!==expectedDatabase||identity.username!==decodeURIComponent(source.username)||identity.address!==process.env.KNABA_EXPECTED_PG_ADDRESS)throw Error();
 if(operation==='create'||operation==='drop'){
  if(!/^knaba_la_drill_[a-f0-9]{24}$/.test(target)||target===identity.database||!/^KNABA_LEAD_AGENT_DRILL:[a-f0-9]{24}:[a-f0-9]{40}$/.test(marker))throw Error();
  const existing=(await client.query("SELECT datname,pg_get_userbyid(datdba) AS owner,shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=$1",[target])).rows[0];
  if(operation==='create'){
   if(existing)throw Error();
   await client.query(`CREATE DATABASE ${quotedIdentifier(target)} WITH TEMPLATE template0`);
   await client.query(`COMMENT ON DATABASE ${quotedIdentifier(target)} IS '${marker}'`);
   console.log(JSON.stringify({status:'CREATED',database:target}));
  }else{
   if(existing){if(existing.owner!==identity.username||existing.marker!==marker)throw Error();await client.query(`DROP DATABASE ${quotedIdentifier(target)} WITH (FORCE)`);}
   console.log(JSON.stringify({status:existing?'DROPPED_OWN_DATABASE':'ABSENT',database:target}));
  }
 }else if(operation==='proof'){
  if(expectedDatabase!==target||!/^knaba_la_drill_[a-f0-9]{24}$/.test(target))throw Error();
  const counts=await tableCounts(client),ledger=await readPrivacyLedger(client,counts),companyIds=await companyIdsInSnapshot(client,counts);
  if(!ledger.schemaPresent||ledger.permitsCount!=='0'||JSON.stringify(companyIds)!==(process.env.KNABA_BACKUP_EXPECTED_COMPANIES||''))throw Error();
  console.log(JSON.stringify({postSafetyTableCounts:counts,privacyLedger:privacyLedgerProof(ledger),companyCount:companyIds.length}));
 }else throw Error();
}catch{console.error('BACKUP_DATABASE_OPERATION_FAILED');process.exitCode=1;}
finally{await client.end().catch(()=>{});}
"""

MANIFEST_PROOF = r"""
import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
const work=mkdtempSync('/tmp/knaba-manifest-'),file=process.env.KNABA_BACKUP_FILE;
const run=(command,args)=>execFileSync(command,args,{stdio:['ignore','pipe','pipe'],maxBuffer:4*1024*1024,timeout:120000});
try{
 run('node',['scripts/backup-mac.mjs','verify',file]);
 run('openssl',['enc','-d','-aes-256-cbc','-pbkdf2','-iter','600000','-md','sha256','-pass','env:BACKUP_PASSPHRASE','-in',file,'-out',work+'/archive.tar']);
 run('node',['scripts/backup-files.mjs','inspect',work+'/archive.tar']);
 const manifest=JSON.parse(run('tar',['-xOf',work+'/archive.tar','manifest.json']).toString());
 if(manifest.format!=='KNABA_DE_ENCRYPTED_BACKUP_V1'||manifest.gitSha!==process.env.GIT_SHA||JSON.stringify(manifest.companyIds)!==(process.env.KNABA_BACKUP_EXPECTED_COMPANIES||'')||manifest.storageMode!=='POSTGRES_PRIVATE_BLOB_FALLBACK'||manifest.filesystemBlobsIncluded)throw Error();
 console.log(JSON.stringify({createdAt:manifest.createdAt,gitSha:manifest.gitSha,postgresVersion:manifest.postgresVersion,
  sourceIdentityHash:manifest.sourceIdentityHash,dumpSha256:manifest.dumpSha256,originalTableCounts:manifest.tableCounts,
  companyCount:manifest.companyIds.length,privateBlobCount:manifest.privateBlobs.length,privacyLedger:manifest.privacyLedger}));
}catch{console.error('BACKUP_MANIFEST_PROOF_FAILED');process.exitCode=1;}
finally{rmSync(work,{recursive:true,force:true});}
"""


class Blocked(Exception):
    pass


def require(condition, code):
    if not condition:
        raise Blocked(code)


def private_dir(path, create=False):
    require(path.is_absolute(), 'ABSOLUTE_PATH_REQUIRED')
    for parent in [*reversed(path.parents), path]:
        if not parent.exists():
            require(create and parent == path, 'DIRECTORY_MISSING')
            os.mkdir(parent, 0o700)
        info = parent.lstat()
        require(stat.S_ISDIR(info.st_mode) and info.st_uid == 0 and info.st_mode & 0o022 == 0, 'DIRECTORY_UNSAFE')
    require(path.stat().st_mode & 0o077 == 0, 'PRIVATE_DIRECTORY_REQUIRED')


def read_file(path, private=True, limit=4*1024*1024):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        before = os.fstat(fd)
        require(stat.S_ISREG(before.st_mode) and before.st_uid == 0 and before.st_mode & (0o077 if private else 0o022) == 0,
                'FILE_OWNER_OR_MODE_UNSAFE')
        require(before.st_size <= limit, 'FILE_TOO_LARGE')
        with os.fdopen(fd, 'rb', closefd=False) as stream:
            value = stream.read(limit+1)
        after = os.fstat(fd)
        require(len(value) <= limit and (before.st_size,before.st_mtime_ns,before.st_ctime_ns) ==
                (after.st_size,after.st_mtime_ns,after.st_ctime_ns), 'FILE_CHANGED')
        return value
    finally:
        os.close(fd)


def read_expected_companies(path):
    try:
        raw = read_file(path, limit=512)
    except FileNotFoundError:
        raise Blocked('BACKUP_QA_UUID_CONFIG_REQUIRED') from None
    try:
        uuids = json.loads(raw.decode('utf-8'))
    except (UnicodeError, ValueError):
        raise Blocked('BACKUP_QA_UUID_CONFIG_INVALID') from None
    pattern = r'[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}'
    require(isinstance(uuids, list) and len(uuids) == 2 and
            all(isinstance(x, str) and re.fullmatch(pattern, x) and
                x != '00000000-0000-0000-0000-000000000000' for x in uuids) and
            len(set(uuids)) == 2, 'BACKUP_QA_UUID_CONFIG_INVALID')
    return [COMPANY, *('telegram-qa-' + x for x in sorted(uuids))]


def file_hash(path):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        before = os.fstat(fd)
        require(stat.S_ISREG(before.st_mode) and before.st_uid == 0 and before.st_mode & 0o077 == 0 and before.st_size <= MAX_FILE,
                'BACKUP_FILE_UNSAFE_OR_TOO_LARGE')
        digest = hashlib.sha256()
        with os.fdopen(fd, 'rb', closefd=False) as stream:
            while block := stream.read(1024*1024):
                digest.update(block)
        after = os.fstat(fd)
        require((before.st_size,before.st_mtime_ns,before.st_ctime_ns) == (after.st_size,after.st_mtime_ns,after.st_ctime_ns), 'BACKUP_FILE_CHANGED')
        return digest.hexdigest(), before.st_size
    finally:
        os.close(fd)


def write_private(path, value, replace=False):
    private_dir(path.parent)
    raw = value if isinstance(value, bytes) else (json.dumps(value,indent=2,sort_keys=True)+'\n').encode()
    temporary = path.with_name(path.name+'.'+secrets.token_hex(6)+'.tmp') if replace else path
    fd = os.open(temporary, os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd,'wb') as stream:
        stream.write(raw);stream.flush();os.fsync(stream.fileno())
    if replace:
        os.replace(temporary,path)


def parse_environment(raw):
    result = {}
    for line in raw.decode().splitlines():
        if not line or line.startswith('#'):
            continue
        key, separator, value = line.partition('=')
        require(separator and re.fullmatch('[A-Z][A-Z0-9_]*',key) and key not in result and '\x00' not in value,
                'ENV_FILE_FORMAT_INVALID')
        result[key] = value
    require(result.get('APP_MODE')=='TEST' and result.get('COMPANY_ID')==COMPANY, 'TEST_COMPANY_REQUIRED')
    require(len(result.get('BACKUP_PASSPHRASE',''))>=32, 'PRIVATE_BACKUP_PASSPHRASE_REQUIRED')
    url = urllib.parse.urlsplit(result.get('DATABASE_URL',''))
    database = urllib.parse.unquote(url.path.removeprefix('/'))
    require(url.scheme in ('postgres','postgresql') and url.hostname=='postgres' and url.port==5432 and url.username and url.password and
            not url.query and not url.fragment and database=='knaba_lead_agent_test' and
            urllib.parse.unquote(url.username)=='knaba_lead_agent', 'SOURCE_DATABASE_SCOPE_INVALID')
    require(not result.get('S3_BUCKET') and not result.get('BACKUP_PRIVATE_STORAGE_DIR'), 'EXTERNAL_STORAGE_NOT_INCLUDED')
    require(result.get('RESTORE_SYNTHETIC_ISOLATED') not in ('true','1'), 'SYNTHETIC_RESTORE_BYPASS_FORBIDDEN')
    return result


class Operator:
    def __init__(self,args,log,expected_companies):
        self.args,self.log=args,log
        self.expected_companies=expected_companies
        self.run_id=secrets.token_hex(12)
        self.environment=parse_environment(read_file(args.private_env,limit=65536))
        require(self.environment.get('GIT_SHA')==args.sha,'ENV_SOURCE_SHA_MISMATCH')
        self.build=json.loads(read_file(OPS/('build-'+args.sha+'.json')))
        require(self.build.get('source_sha')==args.sha and self.build.get('image')=='knaba-de-api:'+args.sha and
                re.fullmatch(IMAGE_FORMAT,self.build.get('image_id','')) and
                re.fullmatch(r'postgres@sha256:[0-9a-f]{64}',self.build.get('postgres_image','')) and
                re.fullmatch(IMAGE_FORMAT,self.build.get('postgres_image_id','')), 'BUILD_RECEIPT_INVALID')
        self.qa_tag='knaba-lead-agent-backup:'+args.sha
        self.qa_id=None
        self.pg_address=None

    def command(self,args,code,timeout=120,env=None,capture=False):
        result=subprocess.run(args,stdout=subprocess.PIPE if capture else self.log,stderr=self.log,
                              timeout=timeout,env=env or SAFE_ENV,check=False)
        require(result.returncode==0,code)
        if capture:
            require(len(result.stdout)<=8*1024*1024,'COMMAND_OUTPUT_TOO_LARGE')
            return result.stdout

    def metadata(self,kind,target,expression):
        raw=self.command([*DOCKER,kind,'inspect','--format',expression,target],'DOCKER_METADATA_FAILED',capture=True)
        return json.loads(raw)

    def verify_scope(self):
        app=self.metadata('image',self.build['image'],'{{json .Id}}')
        require(app==self.build['image_id'],'APPLICATION_IMAGE_MISMATCH')
        network=self.metadata('network',NETWORK,'{{json .Labels}}')
        require(network.get('com.docker.compose.project')==PROJECT,'NETWORK_PROJECT_MISMATCH')
        members=self.metadata('network',NETWORK,'{{json .Containers}}')
        require(isinstance(members,dict) and len(members)<=16,'NETWORK_MEMBER_BOUND')
        for container_id in members:
            labels=self.metadata('container',container_id,'{{json .Config.Labels}}')
            require(labels.get('com.docker.compose.project')==PROJECT,'FOREIGN_NETWORK_MEMBER')
        ids=self.command([*DOCKER,'ps','-q','--filter','label=com.docker.compose.project='+PROJECT,
                          '--filter','label=com.docker.compose.service=postgres'],'POSTGRES_LOOKUP_FAILED',capture=True).decode().split()
        require(len(ids)==1 and re.fullmatch('[0-9a-f]{12,64}',ids[0]),'ONE_OWN_POSTGRES_REQUIRED')
        pg=self.metadata('container',ids[0],'{{json .Image}}')
        require(pg==self.build['postgres_image_id'],'POSTGRES_IMAGE_MISMATCH')
        nets=self.metadata('container',ids[0],'{{json .NetworkSettings.Networks}}')
        require(NETWORK in nets and 'postgres' in nets[NETWORK].get('Aliases',[]),'POSTGRES_NETWORK_ALIAS_MISMATCH')
        self.pg_address=nets[NETWORK].get('IPAddress')
        require(isinstance(self.pg_address,str) and re.fullmatch('[0-9.]{7,15}',self.pg_address),'POSTGRES_ADDRESS_REQUIRED')
        ports=self.metadata('container',ids[0],'{{json .NetworkSettings.Ports}}')
        require(not any(ports.values()),'POSTGRES_HOST_PORT_UNEXPECTED')
        scope_sql=r'''DO $$
DECLARE r record; n bigint;
BEGIN
 FOR r IN SELECT table_schema,table_name FROM information_schema.columns
          WHERE table_schema='public' AND column_name='company_id'
            AND table_name NOT IN ('audit_log','aggregate_revisions')
          ORDER BY table_name
 LOOP
  EXECUTE format('SELECT count(*) FROM %I.%I WHERE company_id IS DISTINCT FROM $1',
                 r.table_schema,r.table_name) INTO n USING 'knaba-lead-agent-test';
  IF n>0 THEN RAISE EXCEPTION 'NON_PRIMARY_MUTABLE_COMPANY table=% count=%',r.table_name,n; END IF;
 END LOOP;
END $$;'''
        scoped=subprocess.run([*DOCKER,'exec','-i',ids[0],'sh','-lc',
             'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'],
             input=scope_sql.encode(),stdout=self.log,stderr=self.log,timeout=30,env=SAFE_ENV,check=False)
        require(scoped.returncode==0,'HISTORICAL_QA_SCOPE_VIOLATION')

    def ensure_qa(self,allow_build):
        receipt_path=OPS/('backup-image-'+self.args.sha+'.json')
        if receipt_path.exists():
            proof=json.loads(read_file(receipt_path))
            require(proof.get('source_sha')==self.args.sha and proof.get('application_image_id')==self.build['image_id'] and
                    proof.get('postgres_image')==self.build['postgres_image'],'BACKUP_IMAGE_RECEIPT_MISMATCH')
            self.qa_id=self.metadata('image',self.qa_tag,'{{json .Id}}')
            require(self.qa_id==proof['image_id'],'BACKUP_IMAGE_CHANGED')
        else:
            require(allow_build,'BACKUP_IMAGE_BUILD_REQUIRED')
            collision=subprocess.run([*DOCKER,'image','inspect','--format','{{.Id}}',self.qa_tag],stdout=subprocess.PIPE,stderr=self.log,env=SAFE_ENV,timeout=20)
            require(collision.returncode!=0,'BACKUP_IMAGE_EXISTS_WITHOUT_RECEIPT')
            context=OPS/('backup-image-context-'+self.args.sha)
            private_dir(context,create=True)
            dockerfile=(f'ARG APP_IMAGE\nARG PG_IMAGE\nFROM ${{APP_IMAGE}} AS application\nFROM ${{PG_IMAGE}}\n'
                'COPY --from=application /usr/local/bin/node /usr/local/bin/node\n'
                'COPY --from=application /app/node_modules /app/node_modules\n'
                'COPY --from=application /app/scripts /app/scripts\n'
                'COPY --from=application /app/infra /app/infra\n'
                'COPY --from=application /app/package.json /app/package.json\n'
                f'LABEL org.opencontainers.image.revision="{self.args.sha}"\nWORKDIR /app\nUSER 0:0\nENTRYPOINT []\n')
            target=context/'Dockerfile'
            if target.exists(): require(read_file(target)==dockerfile.encode(),'BACKUP_DOCKERFILE_CHANGED')
            else:write_private(target,dockerfile.encode())
            self.command([*DOCKER,'build','--pull=false','--network=none','--tag',self.qa_tag,
                          '--build-arg','APP_IMAGE='+self.build['image'],'--build-arg','PG_IMAGE='+self.build['postgres_image'],str(context)],
                         'BACKUP_IMAGE_BUILD_FAILED',timeout=900)
            require(self.metadata('image',self.build['image'],'{{json .Id}}')==self.build['image_id'],'APPLICATION_IMAGE_CHANGED_DURING_BUILD')
            self.qa_id=self.metadata('image',self.qa_tag,'{{json .Id}}')
            write_private(receipt_path,{'source_sha':self.args.sha,'application_image_id':self.build['image_id'],
                          'postgres_image':self.build['postgres_image'],'image_id':self.qa_id,'image':self.qa_tag})
        require(re.fullmatch(IMAGE_FORMAT,self.qa_id),'BACKUP_IMAGE_ID_INVALID')
        return json.loads(self.container('tools',['node','--input-type=module','-e',TOOLS_CHECK],network=False,capture=True,timeout=60))

    def container(self,phase,arguments,extras=None,backup_write=False,trust_path=None,trust_write=False,network=True,capture=False,timeout=900):
        name='knaba-la-backup-'+self.run_id+'-'+phase
        require(re.fullmatch('[a-z0-9-]{1,80}',name),'CONTAINER_NAME_INVALID')
        env={**SAFE_ENV,'DATABASE_URL':self.environment['DATABASE_URL'],'BACKUP_PASSPHRASE':self.environment['BACKUP_PASSPHRASE'],
             'APP_MODE':'TEST','COMPANY_ID':COMPANY,'GIT_SHA':self.args.sha,'KNABA_PG_TRANSPORT':'native',
             'BACKUP_DIR':'/backups','MAX_RESTORE_ARCHIVE_BYTES':str(MAX_FILE),**(extras or {})}
        if phase in ('manifest', 'proof'):
            env['KNABA_BACKUP_EXPECTED_COMPANIES']=json.dumps(self.expected_companies,separators=(',',':'))
        require('RESTORE_SYNTHETIC_ISOLATED' not in env,'SYNTHETIC_RESTORE_BYPASS_FORBIDDEN')
        args=[*DOCKER,'run','--rm','--name',name,'--label','com.knaba.backup.run='+self.run_id,
              '--label','com.knaba.backup.project='+PROJECT,'--network',NETWORK if network else 'none',
              '--user','0:0','--cap-drop=ALL','--security-opt=no-new-privileges:true','--read-only','--pids-limit=128',
              '--memory=1536m','--memory-swap=1536m','--cpus=1','--ulimit','fsize=1073741824:1073741824',
              '--tmpfs','/tmp:rw,nosuid,nodev,noexec,size=1073741824,mode=1777','--entrypoint=','--workdir=/app']
        if phase!='tools':
            args+=['--mount','type=bind,src='+str(BACKUPS)+',dst=/backups'+('' if backup_write else ',readonly')]
            if trust_path:
                args+=['--mount','type=bind,src='+str(trust_path)+',dst=/trust'+('' if trust_write else ',readonly')]
        for key in env:
            if key not in SAFE_ENV:args+=['--env',key]
        try:
            # This limit runs INSIDE the ephemeral container, so it also applies
            # if the operator or its Docker CLI is interrupted unexpectedly.
            require(timeout>=60,'CONTAINER_TIMEOUT_TOO_SHORT')
            bounded=['timeout','--signal=TERM','--kill-after=15s',str(timeout-30)+'s',*arguments]
            return self.command([*args,self.qa_id,*bounded],'CONTAINER_'+phase.upper()+'_FAILED',timeout=timeout,env=env,capture=capture)
        except BaseException:
            # The CLI can time out while its container survives. Remove only this
            # exact ephemeral container if the private run label proves ownership.
            found=subprocess.run([*DOCKER,'container','inspect','--format','{{json .Config.Labels}}',name],stdout=subprocess.PIPE,stderr=self.log,env=SAFE_ENV,timeout=20)
            if found.returncode==0:
                labels=json.loads(found.stdout)
                require(labels.get('com.knaba.backup.run')==self.run_id and labels.get('com.knaba.backup.project')==PROJECT,'CONTAINER_CLEANUP_OWNERSHIP_MISMATCH')
                self.command([*DOCKER,'rm','--force',name],'OWN_CONTAINER_CLEANUP_FAILED',timeout=30)
            raise

    def execute_backup(self,drill):
        require(shutil.disk_usage(BACKUPS).free>3*MAX_FILE,'BACKUP_FREE_SPACE_LOW')
        memory=dict(line.split(':',1) for line in pathlib.Path('/proc/meminfo').read_text().splitlines())
        require(int(memory['MemAvailable'].split()[0])>=2*1024**2,'BACKUP_MEMORY_HEADROOM_LOW')
        filename='knaba-lead-agent-'+dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'-'+self.run_id+'.tar.enc'
        backup=BACKUPS/filename
        self.container('snapshot',['bash','infra/backup.sh','/backups/'+filename],backup_write=True)
        backup_hash,backup_size=file_hash(backup)
        hmac_hash,_=file_hash(pathlib.Path(str(backup)+'.hmac'))
        proof=json.loads(self.container('manifest',['node','--input-type=module','-e',MANIFEST_PROOF],
                        extras={'KNABA_BACKUP_FILE':'/backups/'+filename},capture=True,timeout=300))
        receipt={'status':'BACKUP_VERIFIED','source_sha':self.args.sha,'run_id':self.run_id,'backup_file':str(backup),
                 'backup_sha256':backup_hash,'backup_bytes':backup_size,'hmac_file_sha256':hmac_hash,
                 'application_image_id':self.build['image_id'],'backup_image_id':self.qa_id,'original_snapshot':proof,
                 'restore_verified':False,'off_host_copy':False,'runtime_credentials_included':False}
        if drill:
            trust_path=TRUST/self.run_id
            private_dir(trust_path,create=True)
            self.container('ledger',['node','scripts/backup-db.mjs','--export-current-erasure-ledger','/trust/current-erasure-ledger.json'],
                           trust_path=trust_path,trust_write=True,timeout=120)
            ledger=trust_path/'current-erasure-ledger.json'
            ledger_hash,ledger_size=file_hash(ledger)
            authority=json.loads(read_file(ledger,limit=64*1024*1024))
            require(authority.get('format')=='KNABA_DE_CURRENT_ERASURE_LEDGER_V1' and
                    authority.get('sourceIdentityHash')==proof['sourceIdentityHash'] and authority.get('companyIds')==self.expected_companies,
                    'INDEPENDENT_CURRENT_LEDGER_INVALID')
            database='knaba_la_drill_'+self.run_id
            marker='KNABA_LEAD_AGENT_DRILL:'+self.run_id+':'+self.args.sha
            source=urllib.parse.urlsplit(self.environment['DATABASE_URL'])
            restore_url=urllib.parse.urlunsplit(source._replace(path='/'+database))
            private_state=trust_path/'drill-state.json'
            write_private(private_state,{'source_sha':self.args.sha,'database':database,'marker':marker,'stage':'CREATE_INTENT',
                                        'current_ledger_sha256':ledger_hash,'backup_sha256':backup_hash})
            extras={'KNABA_DRILL_DATABASE':database,'KNABA_DRILL_MARKER':marker,'KNABA_EXPECTED_PG_ADDRESS':self.pg_address,
                    'RESTORE_DATABASE_URL':restore_url,'RESTORE_CURRENT_ERASURE_LEDGER_FILE':'/trust/current-erasure-ledger.json',
                    'RESTORE_CURRENT_ERASURE_LEDGER_SHA256':ledger_hash}
            try:
                created=json.loads(self.container('create',['node','--input-type=module','-e',DB_OPERATION],
                      extras={**extras,'KNABA_BACKUP_OPERATION':'create'},capture=True,timeout=90))
                require(created=={'status':'CREATED','database':database},'DRILL_CREATION_NOT_CONFIRMED')
                self.container('restore',['bash','infra/restore.sh','/backups/'+filename,'--confirm-empty'],
                               extras=extras,trust_path=trust_path,timeout=900)
                restored=json.loads(self.container('proof',['node','--input-type=module','-e',DB_OPERATION],
                               extras={**extras,'KNABA_BACKUP_OPERATION':'proof'},capture=True,timeout=120))
                receipt.update({'restore_verified':True,'exact_original_counts_verified_by':'erp/scripts/restore-db.mjs@'+self.args.sha,
                                'restored':restored,'current_ledger_sha256':ledger_hash,'current_ledger_bytes':ledger_size,
                                'current_ledger_path':str(ledger),'synthetic_restore_bypass':False})
            finally:
                cleaned=json.loads(self.container('cleanup',['node','--input-type=module','-e',DB_OPERATION],
                           extras={**extras,'KNABA_BACKUP_OPERATION':'drop'},capture=True,timeout=90))
                require(cleaned.get('status') in ('DROPPED_OWN_DATABASE','ABSENT') and cleaned.get('database')==database,'DRILL_CLEANUP_NOT_CONFIRMED')
                receipt['drill_cleanup']=cleaned['status']
                write_private(private_state,{'source_sha':self.args.sha,'database':database,'marker':marker,'stage':cleaned['status'],
                                            'current_ledger_sha256':ledger_hash,'backup_sha256':backup_hash},replace=True)
            receipt['status']='BACKUP_AND_RESTORE_VERIFIED'
        receipt['verified_at']=dt.datetime.now(dt.timezone.utc).isoformat()
        write_private(OPS/('backup-'+self.run_id+'.json'),receipt)
        if drill:write_private(OPS/('backup-restore-'+self.args.sha+'.json'),receipt,replace=True)
        return receipt

    def install_timer(self):
        proof=json.loads(read_file(OPS/('backup-restore-'+self.args.sha+'.json')))
        require(proof.get('status')=='BACKUP_AND_RESTORE_VERIFIED' and proof.get('source_sha')==self.args.sha and
                proof.get('restore_verified') is True and proof.get('drill_cleanup')=='DROPPED_OWN_DATABASE' and
                proof.get('backup_image_id')==self.qa_id,'SUCCESSFUL_RESTORE_DRILL_REQUIRED')
        require(hashlib.sha256(read_file(INSTALLED,private=False)).digest()==hashlib.sha256(pathlib.Path(__file__).read_bytes()).digest(),
                'REVIEWED_INSTALLED_SCRIPT_REQUIRED')
        service=f'''[Unit]
Description=KNABA Lead Agent encrypted daily backup
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
User=root
UMask=0077
ExecStart=/usr/bin/python3 {INSTALLED} backup --sha {self.args.sha} --private-env {self.args.private_env}
TimeoutStartSec=30min
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ProtectHome=yes
ReadWritePaths={ROOT}
'''
        timer=f'''[Unit]
Description=KNABA Lead Agent daily encrypted backup schedule

[Timer]
OnCalendar=*-*-* 03:47:00 UTC
RandomizedDelaySec=10min
Persistent=true
Unit={SERVICE}

[Install]
WantedBy=timers.target
'''
        for name,content in [(SERVICE,service),(TIMER,timer)]:
            path=pathlib.Path('/etc/systemd/system')/name
            if path.exists():require(read_file(path,private=False)==content.encode(),'EXISTING_BACKUP_UNIT_DIFFERENT')
            else:
                fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o644)
                with os.fdopen(fd,'w') as output:output.write(content)
        self.command(['systemctl','daemon-reload'],'BACKUP_SYSTEMD_RELOAD_FAILED')
        self.command(['systemctl','enable','--now',TIMER],'BACKUP_TIMER_ENABLE_FAILED')
        require(self.command(['systemctl','is-active',TIMER],'BACKUP_TIMER_NOT_ACTIVE',capture=True).strip()==b'active','BACKUP_TIMER_NOT_ACTIVE')
        return {'status':'BACKUP_TIMER_INSTALLED','source_sha':self.args.sha,'timer':TIMER,'schedule':'03:47 UTC + up to 10 minutes',
                'pruning':False,'daily_restore_drill':False}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode',choices=['run','backup','install-timer'])
    parser.add_argument('--sha',required=True)
    parser.add_argument('--private-env',type=pathlib.Path,required=True)
    args=parser.parse_args()
    require(re.fullmatch('[a-f0-9]{40}',args.sha),'EXACT_SOURCE_SHA_REQUIRED')
    require(os.geteuid()==0 and socket.gethostname()=='knaba','KNABA_ROOT_REQUIRED')
    os.umask(0o077)
    for path in (ROOT,OPS,PRIVATE,BACKUPS):private_dir(path)
    expected_companies = read_expected_companies(PRIVATE/'backup-qa-uuids.json')
    private_dir(TRUST,create=True)
    require(args.private_env.is_absolute() and args.private_env.resolve()==args.private_env and args.private_env.is_relative_to(PRIVATE)
            and re.fullmatch(r'[A-Za-z0-9_./-]+',str(args.private_env)),'PRIVATE_ENV_PATH_INVALID')
    lock=os.open(OPS/'backup.lock',os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW,0o600)
    log_path=OPS/('backup-operator-'+dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'-'+secrets.token_hex(6)+'.log')
    try:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        with log_path.open('xb') as log:
            operator=Operator(args,log,expected_companies)
            operator.verify_scope()
            versions=operator.ensure_qa(allow_build=args.mode=='run')
            if args.mode=='install-timer':receipt=operator.install_timer()
            else:receipt=operator.execute_backup(drill=args.mode=='run')
            summary={key:receipt[key] for key in ('status','source_sha','backup_sha256','backup_bytes','hmac_file_sha256','restore_verified',
                         'drill_cleanup','current_ledger_sha256','timer','schedule','pruning') if key in receipt}
            if receipt.get('original_snapshot'):
                counts=receipt['original_snapshot']['originalTableCounts']
                summary.update({'original_table_count':len(counts),'original_total_rows':str(sum(int(row['count']) for row in counts)),
                                'private_blob_count':receipt['original_snapshot']['privateBlobCount']})
            summary.update({'tools':versions,'private_log':str(log_path),'secret_values_printed':False})
            print(json.dumps(summary))
    finally:os.close(lock)


if __name__=='__main__':
    try:main()
    except Blocked as error:
        print(json.dumps({'status':'BLOCKED','code':str(error),'secret_values_printed':False}),file=sys.stderr);sys.exit(2)
    except Exception as error:
        print(json.dumps({'status':'BLOCKED','code':'BACKUP_OPERATOR_EXCEPTION','exception_type':type(error).__name__,
                          'secret_values_printed':False}),file=sys.stderr);sys.exit(2)
