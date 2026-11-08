import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {EventEmitter} from 'node:events';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const boundary=vi.hoisted(()=>({spawn:vi.fn(),version:'17.6',restoreFailure:false}));
vi.mock('node:child_process',()=>({spawn:boundary.spawn}));
// Exercise the actual ESM CLI helper; the child process below is an explicit
// CPU boundary double, not a PostgreSQL restore or backup acceptance claim.
// @ts-expect-error TS7016: the production ESM helper has no declaration file.
import {pgCommand} from '../scripts/pg-tools.mjs';

const connection='postgresql://restore_role:synthetic%3Apassword%40%25@postgres:5432/isolated%5Frestore?sslmode=require';
const restoreArgs=['--single-transaction','--exit-on-error','--no-owner','--no-acl'];
const directories:string[]=[];

beforeEach(()=>{
  vi.stubEnv('KNABA_PG_TRANSPORT','native');
  boundary.version='17.6';boundary.restoreFailure=false;boundary.spawn.mockReset();
  boundary.spawn.mockImplementation((binary:string,args:string[])=>{
    const child=Object.assign(new EventEmitter(),{stdout:new EventEmitter(),stderr:new EventEmitter()});
    queueMicrotask(()=>{
      if(args.includes('--version')){
        child.stdout.emit('data',Buffer.from(`${binary} (PostgreSQL) ${boundary.version}\n`));child.emit('close',0);return;
      }
      // Reproduce the actual PostgreSQL 17 CLI mode requirement observed during
      // the isolated restore: PGDATABASE alone does not select direct restore.
      if(binary==='pg_restore'&&!args.some(arg=>arg.startsWith('--dbname='))){
        child.stderr.emit('data',Buffer.from('one of -d/--dbname and -f/--file must be specified'));
        child.emit('close',1);return;
      }
      if(boundary.restoreFailure){child.stderr.emit('data',Buffer.from('SYNTHETIC private diagnostic'));child.emit('close',1);return;}
      child.emit('close',0);
    });
    return child;
  });
});
afterEach(async()=>{vi.unstubAllEnvs();await Promise.all(directories.splice(0).map(path=>rm(path,{recursive:true,force:true})));});

describe('native PostgreSQL CLI destination and credential boundary',()=>{
  it('selects the explicit restore database while keeping credentials in environment and the dump on stdin',async()=>{
    const directory=await mkdtemp(join(tmpdir(),'knaba-native-restore-'));directories.push(directory);
    const inputFile=join(directory,'database.dump');await writeFile(inputFile,'synthetic boundary fixture; not a PostgreSQL dump');
    const original=[...restoreArgs];
    await expect(pgCommand('pg_restore',original,connection,{inputFile})).resolves.toBeUndefined();
    const execution=boundary.spawn.mock.calls.find(([,args])=>!args.includes('--version'))!;
    expect(execution[0]).toBe('pg_restore');
    expect(execution[1]).toEqual(['--dbname=isolated_restore',...restoreArgs]);
    expect(original).toEqual(restoreArgs);
    expect(execution[2].env).toMatchObject({PGHOST:'postgres',PGPORT:'5432',PGDATABASE:'isolated_restore',PGUSER:'restore_role',PGPASSWORD:'synthetic:password@%',PGSSLMODE:'require'});
    expect(execution[1].join(' ')).not.toMatch(/postgresql:|synthetic|password|restore_role/);
    expect(execution[2].stdio[0]).toEqual(expect.any(Number));
  });

  it('preserves the PostgreSQL 17 version gate before invoking a restore',async()=>{
    boundary.version='16.11';
    await expect(pgCommand('pg_restore',restoreArgs,connection)).rejects.toThrow('POSTGRES_17_CLIENT_REQUIRED');
    expect(boundary.spawn.mock.calls.map(([,args])=>args)).toEqual([['--version']]);
  });

  it('leaves native dump options unchanged and keeps the same explicit environment target',async()=>{
    const args=['--format=custom','--no-owner','--no-acl','--snapshot=synthetic-snapshot'];
    await expect(pgCommand('pg_dump',args,connection)).resolves.toBeUndefined();
    const execution=boundary.spawn.mock.calls.find(([,options])=>!options.includes('--version'))!;
    expect(execution[0]).toBe('pg_dump');expect(execution[1]).toEqual(args);
    expect(execution[2].env).toMatchObject({PGDATABASE:'isolated_restore',PGHOST:'postgres',PGUSER:'restore_role'});
  });

  it('returns a static restore error without exposing child diagnostics',async()=>{
    boundary.restoreFailure=true;
    await expect(pgCommand('pg_restore',restoreArgs,connection)).rejects.toThrow(/^PG_RESTORE_FAILED$/);
  });
});
