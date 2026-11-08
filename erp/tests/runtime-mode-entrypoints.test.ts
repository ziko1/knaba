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
    banner:{js:"import { createRequire as __knabaCreateRequire } from 'node:module'; const require=__knabaCreateRequire(import.meta.url); if(process.env.KNABA_RUNTIME_MODE_COMPILED_SHA!==undefined)globalThis.__KNABA_BUILD_SHA__=JSON.parse(process.env.KNABA_RUNTIME_MODE_COMPILED_SHA);"}
  })));
});
afterAll(async()=>{if(scratch)await rm(scratch,{recursive:true,force:true});});

// Actual entrypoints compiled by the pinned esbuild and run by Node. PostgreSQL,
// network and worker intervals are explicit child-only traps; this does not
// claim successful application startup, SQL acceptance or release packaging.
function launch(entry:string,mode:string|undefined,overrides:NodeJS.ProcessEnv={},compiledSha?:unknown){
  const tracePath=join(scratch,randomUUID()+'.json');
  const env:NodeJS.ProcessEnv={
    PATH:process.env.PATH,
    DATABASE_URL:'postgresql://synthetic:synthetic@127.0.0.1:1/knaba_mode_probe',
    COMPANY_ID:'synthetic-mode-company',
    AUTH_ENCRYPTION_KEY:'SYNTHETIC_MODE_ENCRYPTION_KEY_FOR_TESTS_ONLY',
    GIT_SHA:'a'.repeat(40),PUBLIC_ORIGIN:'https://erp.example.test/',
    LIVE_SEND_ALLOWED:'false',LIVE_INTEGRATION_SEND_ALLOWED:'false',
    TELEGRAM_LIVE_SEND_ALLOWED:'false',SITE_IDENTITY_SESSIONS_ENABLED:'false',
    ...overrides,KNABA_RUNTIME_MODE_TRACE:tracePath,
    KNABA_RUNTIME_MODE_COMPILED_SHA:compiledSha===undefined?undefined:JSON.stringify(compiledSha)
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

  it.each([undefined,'','knaba-demo','knaba-de-demo','other/tenant','company\n'])
  ('rejects production COMPANY_ID=%j before any startup effects',COMPANY_ID=>{
    const {child,output,events}=launch(entry,'PRODUCTION',{COMPANY_ID});
    expect(child.status,output).toBe(1);expect(output).toContain('COMPANY_ID_REQUIRED_OR_INVALID');
    expect(events).toEqual([]);
  });

  it.each(['http://erp.example.test','https://user:SECRET@erp.example.test',
    'https://erp.example.test/path','https://erp.example.test?token=SECRET','https://erp.example.test/#'])
  ('rejects production PUBLIC_ORIGIN=%j before database or provider effects',PUBLIC_ORIGIN=>{
    const {child,output,events}=launch(entry,'PRODUCTION',{PUBLIC_ORIGIN});
    expect(child.status,output).toBe(1);expect(output).toContain('PUBLIC_ORIGIN_INVALID');
    expect(output).not.toContain('SECRET');expect(events).toEqual([]);
  });

  it.each(['DEMO','TEST'])('preserves explicit %s with absent company/origin until PG_POOL',mode=>{
    const {child,output,events}=launch(entry,mode,{COMPANY_ID:undefined,PUBLIC_ORIGIN:undefined});
    expect(child.status,output).toBe(1);expect(output).toContain('SYNTHETIC_STARTUP_BOUNDARY:PG_POOL');
    expect(events).toEqual(['PG_POOL']);
  });

  it.each(['https://erp.example.test','https://erp.example.test/'])('accepts production root authority %s until PG_POOL',PUBLIC_ORIGIN=>{
    const {child,output,events}=launch(entry,'PRODUCTION',{PUBLIC_ORIGIN});
    expect(child.status,output).toBe(1);expect(output).toContain('SYNTHETIC_STARTUP_BOUNDARY:PG_POOL');
    expect(events).toEqual(['PG_POOL']);
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

describe('API release identity before startup effects',()=>{
  it.each([
    {name:'zero environment SHA',environment:'0'.repeat(40),compiled:undefined,error:'RELEASE_SHA_REQUIRED_OR_INVALID'},
    {name:'environment and compiled SHA mismatch',environment:'a'.repeat(40),compiled:'b'.repeat(40),error:'RELEASE_SHA_MISMATCH'}
  ])('rejects $name before database or provider effects',({environment,compiled,error})=>{
    const {child,output,events}=launch('api.mjs','PRODUCTION',{GIT_SHA:environment},compiled);
    expect(child.status,output).toBe(1);
    expect(output).toContain(error);
    expect(output).not.toContain('SYNTHETIC_STARTUP_BOUNDARY:');
    expect(events).toEqual([]);
  });

  it.each([
    ['zero','0'.repeat(40)],['null',null],['uppercase','A'.repeat(40)],
    ['trailing newline','a'.repeat(40)+'\n'],['object',{secret:'SENSITIVE_RELEASE_INPUT'}]
  ])('rejects a provided invalid compiled SHA (%s) before startup effects',(_label,compiled)=>{
    const {child,output,events}=launch('api.mjs','PRODUCTION',{},compiled);
    expect(child.status,output).toBe(1);
    expect(output).toContain('RELEASE_SHA_REQUIRED_OR_INVALID');
    expect(output).not.toContain('SENSITIVE_RELEASE_INPUT');
    expect(events).toEqual([]);
  });

  it.each(['A'.repeat(40),'a'.repeat(40)+'\n','SENSITIVE_RELEASE_INPUT'])
  ('rejects a malformed environment SHA %j without disclosure or startup effects',GIT_SHA=>{
    const {child,output,events}=launch('api.mjs','PRODUCTION',{GIT_SHA});
    expect(child.status,output).toBe(1);
    expect(output).toContain('RELEASE_SHA_REQUIRED_OR_INVALID');
    expect(output).not.toContain(GIT_SHA);
    expect(events).toEqual([]);
  });

  it.each(['DEMO','TEST'])('still rejects conflicting provided SHAs in %s',mode=>{
    const {child,output,events}=launch('api.mjs',mode,{},'b'.repeat(40));
    expect(child.status,output).toBe(1);
    expect(output).toContain('RELEASE_SHA_MISMATCH');
    expect(events).toEqual([]);
  });

  it.each(['DEMO','TEST'])('preserves %s with neither SHA or with only a compiled SHA until PG_POOL',mode=>{
    for(const compiled of [undefined,'a'.repeat(40)]){
      const {child,output,events}=launch('api.mjs',mode,{GIT_SHA:undefined},compiled);
      expect(child.status,output).toBe(1);
      expect(output).toContain('SYNTHETIC_STARTUP_BOUNDARY:PG_POOL');
      expect(events).toEqual(['PG_POOL']);
    }
  });

  it('accepts exact matching production SHAs until the deliberately trapped Pool constructor',()=>{
    const {child,output,events}=launch('api.mjs','PRODUCTION',{},'a'.repeat(40));
    expect(child.status,output).toBe(1);
    expect(output).toContain('SYNTHETIC_STARTUP_BOUNDARY:PG_POOL');
    expect(events).toEqual(['PG_POOL']);
  });

  it('does not substitute a valid compiled SHA for the required production environment SHA',()=>{
    const {child,output,events}=launch('api.mjs','PRODUCTION',{GIT_SHA:undefined},'a'.repeat(40));
    expect(child.status,output).toBe(1);
    expect(output).toContain('PRODUCTION_AUTH_OR_RELEASE_CONFIGURATION_MISSING');
    expect(events).toEqual([]);
  });
});
