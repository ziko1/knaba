import {spawnSync} from 'node:child_process';
import {afterEach,describe,expect,it,vi} from 'vitest';
import type {Request} from 'express';
import {requireCompanyId,parsePublicOrigin} from '../apps/runtime-configuration.ts';
import {sameOrigin} from '../apps/api/auth.ts';
import {workerOptions,startWorker} from '../apps/worker/main.ts';
import {WorkerRunner,type WorkerOptions} from '../apps/worker/runner.ts';
import type {Database} from '../apps/api/database.ts';
import type {Engine} from '../apps/api/engine.ts';

const modes=['DEMO','TEST','PRODUCTION'] as const;
const invalidCompanies=['',' ',' company','company ','company\n','a/b','-company','a'.repeat(101)];
const invalidOrigins=['','not-a-url','ftp://erp.example.test','https://user:SECRET@erp.example.test',
  'https://erp.example.test/path','https://erp.example.test/path/..','https://erp.example.test?key=SECRET',
  'https://erp.example.test?','https://erp.example.test/#','https://erp.example.test/#fragment',
  ' https://erp.example.test','https://erp.example.test\n','https://erp.example.test\\'];
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();vi.unstubAllGlobals();});

describe.each(modes)('%s authority inputs',mode=>{
  it.each(invalidCompanies)('rejects explicit invalid company %j without normalization',company=>{
    expect(()=>requireCompanyId(company,mode,true)).toThrow('COMPANY_ID_REQUIRED_OR_INVALID');
    expect(()=>workerOptions({APP_MODE:mode,COMPANY_ID:company})).toThrow('COMPANY_ID_REQUIRED_OR_INVALID');
  });
  it.each(invalidOrigins)('rejects malformed origin %j without echoing its value',origin=>{
    expect(()=>parsePublicOrigin(origin,mode)).toThrow(/^PUBLIC_ORIGIN_INVALID$/);
    expect(()=>workerOptions({APP_MODE:mode,COMPANY_ID:'Acme_DE-1',PUBLIC_ORIGIN:origin})).toThrow(/^PUBLIC_ORIGIN_INVALID$/);
  });
  it('retains the exact valid company and raw worker root origin',()=>{
    expect(requireCompanyId('Acme_DE-1',mode)).toBe('Acme_DE-1');
    expect(requireCompanyId('a'.repeat(100),mode)).toBe('a'.repeat(100));
    const raw='https://erp.example.test:8443/';
    expect(parsePublicOrigin(raw,mode)?.origin).toBe('https://erp.example.test:8443');
    expect(workerOptions({APP_MODE:mode,COMPANY_ID:'Acme_DE-1',PUBLIC_ORIGIN:raw}).publicOrigin).toBe(raw);
  });
});

it.each(['DEMO','TEST'] as const)('keeps optional %s environment defaults and local HTTP',mode=>{
  expect(requireCompanyId(undefined,mode,true)).toBe('knaba-demo');
  expect(workerOptions({APP_MODE:mode})).toMatchObject({companyId:'knaba-demo',appMode:mode});
  expect(parsePublicOrigin(undefined,mode)).toBeUndefined();
  expect(parsePublicOrigin('http://127.0.0.1:3000/',mode)?.origin).toBe('http://127.0.0.1:3000');
  expect(()=>requireCompanyId(undefined,mode)).toThrow('COMPANY_ID_REQUIRED_OR_INVALID');
});

it.each([undefined,'knaba-demo','knaba-de-demo'])('requires a production company distinct from demo identifiers: %s',company=>{
  expect(()=>requireCompanyId(company,'PRODUCTION',true)).toThrow('COMPANY_ID_REQUIRED_OR_INVALID');
  expect(()=>workerOptions({APP_MODE:'PRODUCTION',COMPANY_ID:company})).toThrow('COMPANY_ID_REQUIRED_OR_INVALID');
});

it('does not require worker-only jobs to invent API credentials or a public URL',()=>{
  const options=workerOptions({APP_MODE:'PRODUCTION',COMPANY_ID:'synthetic-company'});
  expect(options.publicOrigin).toBeUndefined();
  expect(options.ai).toBeUndefined();expect(options.whatsapp).toBeUndefined();expect(options.telegram).toBeUndefined();
  expect(()=>parsePublicOrigin('http://127.0.0.1:3000/','PRODUCTION')).toThrow('PUBLIC_ORIGIN_INVALID');
});

it('checks the ERP origin even when a valid website origin takes priority',()=>{
  expect(()=>workerOptions({APP_MODE:'PRODUCTION',COMPANY_ID:'synthetic-company',PUBLIC_ORIGIN:'http://erp.example.test',BOT_WEBSITE_ORIGIN:'https://site.example.test/'})).toThrow('PUBLIC_ORIGIN_INVALID');
  const options=workerOptions({APP_MODE:'TEST',PUBLIC_ORIGIN:'https://erp.example.test/',BOT_WEBSITE_ORIGIN:'https://site.example.test/'});
  expect(options.publicOrigin).toBe('https://site.example.test/');
});

it.each(['https://erp.example.test','https://erp.example.test/'])('canonical API authority permits root slash equivalence for %s only',raw=>{
  const canonical=parsePublicOrigin(raw,'PRODUCTION')!.origin;
  expect(canonical).toBe(new URL('https://erp.example.test/').origin);
  const request=(origin:string)=>({get:(header:string)=>header==='origin'?origin:undefined}) as Request;
  expect(()=>sameOrigin(request('https://erp.example.test'),canonical)).not.toThrow();
  for(const origin of ['http://erp.example.test','https://other.example.test','https://erp.example.test:444']) {
    expect(()=>sameOrigin(request(origin),canonical)).toThrow();
  }
});

describe('injected worker configuration is validated before startup effects',()=>{
  it.each([
    {companyId:undefined}, {companyId:''}, {companyId:'other/tenant'}, {companyId:'knaba-demo'},
    {publicOrigin:'https://user:SECRET@erp.example.test/'}, {publicOrigin:'http://erp.example.test'}
  ])('rejects invalid injected options %j before SQL or interval',async override=>{
    const query=vi.fn();const transaction=vi.fn();
    const initialize=vi.spyOn(WorkerRunner.prototype,'initialize');
    const interval=vi.spyOn(globalThis,'setInterval');
    const request=vi.fn();vi.stubGlobal('fetch',request);
    vi.stubEnv('DATABASE_URL',undefined);
    vi.stubEnv('COMPANY_ID','must-not-replace-injected-company');
    const options={appMode:'PRODUCTION',companyId:'synthetic-company',...override} as WorkerOptions;
    const db={query,transaction} as unknown as Database;
    const engine={mode:'PRODUCTION'} as unknown as Engine;
    await expect(startWorker(db,engine,options)).rejects.toThrow(/COMPANY_ID|PUBLIC_ORIGIN/);
    await expect(startWorker(undefined,undefined,options)).rejects.toThrow(/COMPANY_ID|PUBLIC_ORIGIN/);
    expect(query).not.toHaveBeenCalled();expect(transaction).not.toHaveBeenCalled();
    expect(initialize).not.toHaveBeenCalled();expect(interval).not.toHaveBeenCalled();expect(request).not.toHaveBeenCalled();
  });
  it('rejects a bad company before reading adapter credentials',()=>{
    const config=new Proxy({APP_MODE:'PRODUCTION',COMPANY_ID:'knaba-demo'},{get(target,key){
      if(key==='APP_MODE'||key==='COMPANY_ID')return target[key];
      throw new Error('ADAPTER_CONFIGURATION_MUST_NOT_BE_READ');
    }}) as NodeJS.ProcessEnv;
    expect(()=>workerOptions(config)).toThrow('COMPANY_ID_REQUIRED_OR_INVALID');
  });
});

describe('operator preflight keeps parity without weakening its stricter prerequisites',()=>{
  const run=(overrides:NodeJS.ProcessEnv={})=>spawnSync(process.execPath,['scripts/environment-check.mjs'],{
    encoding:'utf8',timeout:10000,env:{PATH:process.env.PATH,APP_MODE:'PRODUCTION',
      COMPANY_ID:'synthetic-company',DATABASE_URL:'postgresql://synthetic:synthetic@127.0.0.1:1/synthetic',
      PUBLIC_ORIGIN:'https://erp.example.test/',AUTH_ENCRYPTION_KEY:'SYNTHETIC_ENCRYPTION_KEY_FOR_TESTS_ONLY',
      GIT_SHA:'a'.repeat(40),LIVE_SEND_ALLOWED:'false',...overrides}
  });
  it.each(['https://erp.example.test','https://erp.example.test/'])('accepts the configured root origin %s',PUBLIC_ORIGIN=>{
    const result=run({PUBLIC_ORIGIN});expect(result.status,result.stderr).toBe(0);
  });
  it.each([undefined,'','knaba-demo','knaba-de-demo','company\n','other/tenant'])('rejects company %j',COMPANY_ID=>{
    const result=run({COMPANY_ID});expect(result.status).toBe(1);expect(result.stderr).toContain('COMPANY_ID');
  });
  it.each(['http://erp.example.test',...invalidOrigins])('rejects origin %j without disclosing credentials',PUBLIC_ORIGIN=>{
    const result=run({PUBLIC_ORIGIN});expect(result.status).toBe(1);expect(result.stderr).toContain('PUBLIC_ORIGIN');
    expect(result.stderr).not.toContain('SECRET');
  });
  it.each(['AUTH_ENCRYPTION_KEY','GIT_SHA','PUBLIC_ORIGIN'])('still requires %s in operator preflight',field=>{
    const result=run({[field]:undefined});expect(result.status).toBe(1);expect(result.stderr).toContain(field);
  });
});
