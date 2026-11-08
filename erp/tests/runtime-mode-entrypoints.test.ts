import {spawnSync} from 'node:child_process';
import {mkdtemp,rm,symlink} from 'node:fs/promises';
import {existsSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {build} from 'esbuild';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';

const erpRoot=fileURLToPath(new URL('../',import.meta.url));
const trap=fileURLToPath(new URL('./fixtures/runtime-mode-traps.cjs',import.meta.url));
const entrypoints=[
  {name:'API',source:'apps/api/main.ts',entry:'api.mjs',error:'APP_MODE'},
  {name:'worker',source:'apps/worker/main.ts',entry:'worker.mjs',error:'APP_MODE_REQUIRED_OR_INVALID'}
];
let scratch:string;
beforeAll(async()=>{
  scratch=await mkdtemp(join(tmpdir(),'knaba-runtime-mode-'));
  await symlink(join(erpRoot,'node_modules'),join(scratch,'node_modules'),'dir');
  // Same entrypoints, package externalization, Node target and require banner
  // as scripts/bundle.mjs. Avoid a source loader's own IPC inside the network
  // trap; the emitted application executes unmodified in a plain Node process.
  await Promise.all(entrypoints.map(({source,entry})=>build({
    absWorkingDir:erpRoot,entryPoints:[source],outfile:join(scratch,entry),
    bundle:true,platform:'node',format:'esm',target:'node24',packages:'external',
    tsconfig:join(erpRoot,'tsconfig.json'),logLevel:'silent',
    banner:{js:"import { createRequire as __knabaCreateRequire } from 'node:module'; const require=__knabaCreateRequire(import.meta.url);"}
  })));
});
afterAll(async()=>{if(scratch)await rm(scratch,{recursive:true,force:true});});

// Actual entrypoints compiled by the pinned esbuild and run by Node. PostgreSQL,
// network and worker intervals are explicit child-only traps; this does not
// claim successful application startup, SQL acceptance or release packaging.
function launch(entry:string,mode:string|undefined,overrides:NodeJS.ProcessEnv={}){
  const tracePath=join(scratch,randomUUID()+'.json');
  const env:NodeJS.ProcessEnv={
    PATH:process.env.PATH,
    DATABASE_URL:'postgresql://synthetic:synthetic@127.0.0.1:1/knaba_mode_probe',
    COMPANY_ID:'synthetic-mode-company',
    AUTH_ENCRYPTION_KEY:'SYNTHETIC_MODE_ENCRYPTION_KEY_FOR_TESTS_ONLY',
    GIT_SHA:'a'.repeat(40),PUBLIC_ORIGIN:'https://erp.example.test/',
    LIVE_SEND_ALLOWED:'false',LIVE_INTEGRATION_SEND_ALLOWED:'false',
    TELEGRAM_LIVE_SEND_ALLOWED:'false',SITE_IDENTITY_SESSIONS_ENABLED:'false',
    ...overrides,KNABA_RUNTIME_MODE_TRACE:tracePath
  };
  if(mode===undefined)delete env.APP_MODE;else env.APP_MODE=mode;
  const child=spawnSync(process.execPath,['--require',trap,join(scratch,entry)],{
    cwd:erpRoot,env,encoding:'utf8',timeout:15000,maxBuffer:1024*1024
  });
  const output=child.stdout+child.stderr;
  expect(child.error,output).toBeUndefined();expect(child.signal,output).toBeNull();
  expect(existsSync(tracePath),output).toBe(true);
  const trace=JSON.parse(readFileSync(tracePath,'utf8')) as {scope:string;events:string[]};
  expect(trace.scope).toBe('EXPLICIT_PG_NETWORK_INTERVAL_TRAPS');
  return {child,output,events:trace.events};
}

describe.each(entrypoints)('$name actual compiled entrypoint with explicit side-effect traps',({entry,error})=>{
  it.each([undefined,'',' ','test','STAGING'])('rejects APP_MODE=%s before database, network or interval effects',mode=>{
    const {child,output,events}=launch(entry,mode);
    expect(child.status,output).toBe(1);
    expect(output).toContain(error);
    expect(output).not.toContain('SYNTHETIC_STARTUP_BOUNDARY:');
    expect(output).not.toContain('KNABA DE durable worker started');
    expect(events).toEqual([]);
  });

  it.each(['DEMO','TEST','PRODUCTION'])('accepts explicit %s until the deliberately trapped Pool constructor',mode=>{
    const {child,output,events}=launch(entry,mode);
    expect(child.status,output).toBe(1);
    expect(output).toContain('SYNTHETIC_STARTUP_BOUNDARY:PG_POOL');
    expect(events).toEqual(['PG_POOL']);
    expect(output).not.toContain('APP_MODE_REQUIRED_OR_INVALID');
  });
});

describe('API production prerequisites remain in force before the database',()=>{
  it.each(['AUTH_ENCRYPTION_KEY','PUBLIC_ORIGIN','GIT_SHA'])('still rejects explicit PRODUCTION without %s',key=>{
    const {child,output,events}=launch('api.mjs','PRODUCTION',{[key]:undefined});
    expect(child.status,output).toBe(1);
    expect(output).toContain('PRODUCTION_AUTH_OR_RELEASE_CONFIGURATION_MISSING');
    expect(events).toEqual([]);
  });
});
