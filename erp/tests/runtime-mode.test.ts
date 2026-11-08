import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {workerOptions,startWorker} from '../apps/worker/main.ts';
import {WorkerRunner,type WorkerOptions} from '../apps/worker/runner.ts';
import type {Database} from '../apps/api/database.ts';
import type {Engine} from '../apps/api/engine.ts';

const modes=['DEMO','TEST','PRODUCTION'] as const;
const invalidModes:Array<[string,unknown]>=[
  ['absent',undefined],['null',null],['empty',''],['whitespace',' '],
  ['lowercase','test'],['padded',' TEST '],['unknown','STAGING'],
  ['number',0],['boolean',false],['object',{}],['array',['TEST']]
];
const options=(appMode:unknown)=>({companyId:'synthetic-mode-company',appMode}) as WorkerOptions;

// Explicit SQL/actor doubles: valid startup stops at the first real
// WorkerRunner.initialize database boundary. No database or provider is used.
function bootstrap(mode:unknown){
  const stop=new Error('SYNTHETIC_DATABASE_BOOTSTRAP_BOUNDARY');
  const query=vi.fn(async()=>{throw stop;});
  const transaction=vi.fn(async()=>{throw new Error('UNEXPECTED_TRANSACTION');});
  return {stop,query,transaction,db:{query,transaction} as unknown as Database,
    engine:{mode} as unknown as Engine};
}
function untouched(f:ReturnType<typeof bootstrap>){
  expect(f.query).not.toHaveBeenCalled();expect(f.transaction).not.toHaveBeenCalled();
  expect(WorkerRunner.prototype.initialize).not.toHaveBeenCalled();
  expect(setInterval).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();
}

beforeEach(()=>{
  vi.stubEnv('APP_MODE',undefined);vi.stubEnv('DATABASE_URL',undefined);
  vi.stubGlobal('fetch',vi.fn(()=>{throw new Error('NETWORK_MUST_NOT_BE_TOUCHED');}));
  vi.spyOn(globalThis,'setInterval').mockImplementation(()=>{throw new Error('INTERVAL_MUST_NOT_BE_STARTED');});
  vi.spyOn(WorkerRunner.prototype,'initialize');
});

describe('worker company/origin guards before adapters or startup effects',()=>{
  const invalidCompanyCases:Array<{label:string;mode:'DEMO'|'TEST'|'PRODUCTION';company:unknown}>=[
    {label:'missing production',mode:'PRODUCTION',company:undefined},
    {label:'null production',mode:'PRODUCTION',company:null},
    {label:'first demo namespace',mode:'PRODUCTION',company:'knaba-demo'},
    {label:'second demo namespace',mode:'PRODUCTION',company:'knaba-de-demo'},
    {label:'empty',mode:'TEST',company:''},
    {label:'padded',mode:'PRODUCTION',company:' company'},
    {label:'terminal newline',mode:'PRODUCTION',company:'company\n'},
    {label:'path separator',mode:'DEMO',company:'company/other'},
    {label:'overlong',mode:'PRODUCTION',company:'a'.repeat(101)},
    {label:'non-string',mode:'PRODUCTION',company:42}
  ];
  it.each(invalidCompanyCases)('rejects $label company before reading provider configuration',({mode,company})=>{
    const reads:PropertyKey[]=[];
    const env=new Proxy({APP_MODE:mode,COMPANY_ID:company},{get(target,key){
      if(key==='APP_MODE'||key==='COMPANY_ID')return target[key];
      reads.push(key);throw new Error('PROVIDER_CONFIGURATION_MUST_NOT_BE_READ');
    }}) as unknown as NodeJS.ProcessEnv;
    expect(()=>workerOptions(env)).toThrow('COMPANY_ID_REQUIRED_OR_INVALID');
    expect(reads).toEqual([]);expect(fetch).not.toHaveBeenCalled();
  });
  it.each(invalidCompanyCases)('rejects injected $label company before database or runner initialization',async({mode,company})=>{
    const f=bootstrap(mode);
    const supplied={...options(mode),companyId:company} as WorkerOptions;
    await expect(startWorker(f.db,f.engine,supplied)).rejects.toThrow('COMPANY_ID_REQUIRED_OR_INVALID');
    await expect(startWorker(undefined,undefined,supplied)).rejects.toThrow('COMPANY_ID_REQUIRED_OR_INVALID');
    untouched(f);
  });
  it.each(['DEMO','TEST'] as const)('keeps the missing environment fallback in %s only',APP_MODE=>{
    expect(workerOptions({APP_MODE}).companyId).toBe('knaba-demo');
  });
  it.each(['DEMO','TEST'] as const)('does not default missing injected company in %s',async mode=>{
    const f=bootstrap(mode);
    await expect(startWorker(f.db,f.engine,{appMode:mode} as WorkerOptions)).rejects.toThrow('COMPANY_ID_REQUIRED_OR_INVALID');
    untouched(f);
  });
  it('keeps production jobs without public links independent of API-only prerequisites',()=>{
    const configured=workerOptions({APP_MODE:'PRODUCTION',COMPANY_ID:'synthetic-worker-company'});
    expect(configured.publicOrigin).toBeUndefined();
    expect(configured.ai).toBeUndefined();expect(configured.whatsapp).toBeUndefined();
    expect(configured.telegram).toBeUndefined();expect(configured.integrationWebhook).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('retains the exact configured worker origin used by ticket bindings',()=>{
    const raw='https://ERP.example.test:443/';
    expect(workerOptions({APP_MODE:'PRODUCTION',COMPANY_ID:'synthetic-worker-company',PUBLIC_ORIGIN:raw}).publicOrigin).toBe(raw);
  });
  it.each([
    ['PRODUCTION','http://erp.example.test/'],['TEST','https://user:secret@erp.example.test/'],
    ['DEMO','https://erp.example.test/jobs'],['PRODUCTION','https://erp.example.test/?'],
    ['PRODUCTION','https://erp.example.test/#'],['PRODUCTION','']
  ] as const)('rejects %s origin %s before provider configuration or database effects',async(mode,publicOrigin)=>{
    const env=new Proxy({APP_MODE:mode,COMPANY_ID:'synthetic-worker-company',PUBLIC_ORIGIN:publicOrigin},
      {get(target,key){
        if(key==='APP_MODE'||key==='COMPANY_ID'||key==='PUBLIC_ORIGIN')return target[key];
        if(key==='BOT_WEBSITE_ORIGIN')return undefined;
        throw new Error('PROVIDER_CONFIGURATION_MUST_NOT_BE_READ');
      }}) as unknown as NodeJS.ProcessEnv;
    expect(()=>workerOptions(env)).toThrow('PUBLIC_ORIGIN_REQUIRED_OR_INVALID');
    const f=bootstrap(mode);
    await expect(startWorker(f.db,f.engine,{...options(mode),publicOrigin})).rejects.toThrow('PUBLIC_ORIGIN_REQUIRED_OR_INVALID');
    await expect(startWorker(undefined,undefined,{...options(mode),publicOrigin})).rejects.toThrow('PUBLIC_ORIGIN_REQUIRED_OR_INVALID');
    untouched(f);
  });
});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();vi.unstubAllEnvs();});

describe('worker explicit runtime mode before configuration or bootstrap',()=>{
  it.each(invalidModes)('rejects %s mode before reading provider or company configuration',(_label,APP_MODE)=>{
    const reads:PropertyKey[]=[];
    const env=new Proxy({APP_MODE},{get(target,key){
      if(key==='APP_MODE')return target.APP_MODE;
      reads.push(key);throw new Error('NON_MODE_CONFIGURATION_MUST_NOT_BE_READ');
    }}) as unknown as NodeJS.ProcessEnv;
    expect(()=>workerOptions(env)).toThrow('APP_MODE_REQUIRED_OR_INVALID');
    expect(reads).toEqual([]);
    expect(WorkerRunner.prototype.initialize).not.toHaveBeenCalled();
    expect(setInterval).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();
  });

  it.each(modes)('preserves explicit %s configuration and disabled provider defaults',APP_MODE=>{
    const configured=workerOptions({APP_MODE,COMPANY_ID:'synthetic-mode-company'});
    expect(configured.appMode).toBe(APP_MODE);
    expect(configured.ai).toBeUndefined();expect(configured.whatsapp).toBeUndefined();
    expect(configured.telegram).toBeUndefined();expect(configured.integrationWebhook).toBeUndefined();
    expect(WorkerRunner.prototype.initialize).not.toHaveBeenCalled();
    expect(setInterval).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();
  });

  it.each(invalidModes)('rejects injected %s mode before database construction or runner initialization',async(_label,mode)=>{
    const f=bootstrap(mode);
    await expect(startWorker(f.db,f.engine,options(mode))).rejects.toThrow('APP_MODE_REQUIRED_OR_INVALID');
    // DATABASE_URL is absent: a premature new Database() would throw a different
    // error. This second path also covers callers that omit both injected deps.
    await expect(startWorker(undefined,undefined,options(mode))).rejects.toThrow('APP_MODE_REQUIRED_OR_INVALID');
    untouched(f);
  });

  it('rejects null injected options before initialization',async()=>{
    const f=bootstrap('TEST');
    await expect(startWorker(f.db,f.engine,null as unknown as WorkerOptions)).rejects.toThrow('APP_MODE_REQUIRED_OR_INVALID');
    untouched(f);
  });

  it('requires APP_MODE when the actual startWorker default-argument path is used',async()=>{
    const f=bootstrap('TEST');
    await expect(startWorker(f.db,f.engine)).rejects.toThrow('APP_MODE_REQUIRED_OR_INVALID');
    untouched(f);
  });

  it.each(modes)('accepts explicit injected %s and reaches only the deliberately stopped SQL boundary',async mode=>{
    const f=bootstrap(mode);
    await expect(startWorker(f.db,f.engine,options(mode))).rejects.toBe(f.stop);
    expect(WorkerRunner.prototype.initialize).toHaveBeenCalledTimes(1);
    expect(f.query).toHaveBeenCalledExactlyOnceWith('SELECT knaba_assert_gps_storage_safe()');
    expect(f.transaction).not.toHaveBeenCalled();
    expect(setInterval).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();
  });

  it.each(modes.flatMap(mode=>modes.filter(engineMode=>engineMode!==mode).map(engineMode=>({mode,engineMode}))))
  ('rejects $mode options with a $engineMode engine before any bootstrap effect',async({mode,engineMode})=>{
    const f=bootstrap(engineMode);
    await expect(startWorker(f.db,f.engine,options(mode))).rejects.toThrow('WORKER_ENGINE_MODE_MISMATCH');
    await expect(startWorker(undefined,f.engine,options(mode))).rejects.toThrow('WORKER_ENGINE_MODE_MISMATCH');
    untouched(f);
  });

  it.each([undefined,'STAGING'])('rejects an injected engine with missing or invalid mode %s',async mode=>{
    const f=bootstrap(mode);
    await expect(startWorker(f.db,f.engine,options('TEST'))).rejects.toThrow('WORKER_ENGINE_MODE_MISMATCH');
    untouched(f);
  });
});
