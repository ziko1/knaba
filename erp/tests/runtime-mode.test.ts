import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {spawnSync} from 'node:child_process';
import {workerOptions} from '../apps/worker/main.ts';

const boundary=vi.hoisted(()=>({database:vi.fn(function(){throw new Error('SYNTHETIC_DATABASE_BOUNDARY');})}));
vi.mock('../apps/api/database.ts',async importOriginal=>({
 ...await importOriginal<typeof import('../apps/api/database.ts')>(),
 Database:boundary.database,
}));

const synthetic={
 DATABASE_URL:'postgresql://synthetic:synthetic@127.0.0.1:1/synthetic_runtime_boundary',
 COMPANY_ID:'synthetic-runtime-boundary',
 AUTH_ENCRYPTION_KEY:'SYNTHETIC_RUNTIME_MODE_TEST_KEY_ONLY_32',
 PUBLIC_ORIGIN:'https://runtime.example.test',
 GIT_SHA:'1'.repeat(40),
};

describe('explicit runtime operating mode',()=>{
 beforeEach(()=>{vi.resetModules();vi.clearAllMocks();});
 afterEach(()=>vi.unstubAllEnvs());

 it.each([undefined,'','test',' DEMO ','UNKNOWN'])('API rejects APP_MODE=%s before constructing a database',async mode=>{
  for(const [key,value] of Object.entries(synthetic))vi.stubEnv(key,value);
  vi.stubEnv('APP_MODE',mode);
  await expect(import('../apps/api/main.ts')).rejects.toMatchObject({
   issues:expect.arrayContaining([expect.objectContaining({path:['APP_MODE']})]),
  });
  expect(boundary.database).not.toHaveBeenCalled();
 });

 it.each(['DEMO','TEST','PRODUCTION'])('API accepts explicitly selected %s before the isolated database boundary',async mode=>{
  for(const [key,value] of Object.entries(synthetic))vi.stubEnv(key,value);
  vi.stubEnv('APP_MODE',mode);
  await expect(import('../apps/api/main.ts')).rejects.toThrow('SYNTHETIC_DATABASE_BOUNDARY');
  expect(boundary.database).toHaveBeenCalledOnce();
 });

 it.each([undefined,'','test',' DEMO ','UNKNOWN'])('worker rejects APP_MODE=%s before enabling any provider',mode=>{
  expect(()=>workerOptions({APP_MODE:mode})).toThrow();
  expect(boundary.database).not.toHaveBeenCalled();
 });

 it.each(['DEMO','TEST','PRODUCTION'])('worker retains explicitly selected %s and disabled providers',mode=>{
  const options=workerOptions({APP_MODE:mode});
  expect(options.appMode).toBe(mode);
  expect(options.ai).toBeUndefined();
  expect(options.whatsapp).toBeUndefined();
  expect(options.telegram).toBeUndefined();
  expect(options.integrationWebhook).toBeUndefined();
 });

 it.each([undefined,'','test',' DEMO ','UNKNOWN'])('operator preflight rejects APP_MODE=%s',mode=>{
  const env:NodeJS.ProcessEnv={...synthetic};
  if(mode!==undefined)env.APP_MODE=mode;
  const result=spawnSync(process.execPath,['scripts/environment-check.mjs'],{env,encoding:'utf8',timeout:5000});
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('APP_MODE');
  expect(result.stdout).not.toContain('PASSED:');
 });

 it.each(['DEMO','TEST','PRODUCTION'])('operator preflight accepts explicit %s with complete synthetic configuration',mode=>{
  const result=spawnSync(process.execPath,['scripts/environment-check.mjs'],{env:{...synthetic,APP_MODE:mode},encoding:'utf8',timeout:5000});
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(0);
  expect(result.stdout).toContain(`PASSED: ${mode}`);
 });
});
