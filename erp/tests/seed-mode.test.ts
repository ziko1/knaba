import {afterEach,describe,expect,it,vi} from 'vitest';
import type {Database} from '../apps/api/database.ts';
import {seed} from '../infra/seed.ts';

describe('synthetic seed environment boundary',()=>{
 afterEach(()=>vi.unstubAllEnvs());

 it.each([undefined,'','PRODUCTION','test',' DEMO '])('rejects APP_MODE=%s before any database access',async mode=>{
  vi.stubEnv('APP_MODE',mode);
  const transaction=vi.fn(()=>{throw new Error('DATABASE_MUST_NOT_BE_TOUCHED');});
  const db={transaction} as unknown as Database;
  await expect(seed(db,'synthetic-boundary-test')).rejects.toThrow('SEED_REQUIRES_EXPLICIT_DEMO_TEST');
  expect(transaction).not.toHaveBeenCalled();
 });

 it.each(['DEMO','TEST'])('permits explicitly selected %s mode to reach the transaction',async mode=>{
  vi.stubEnv('APP_MODE',mode);
  const stop=new Error('SYNTHETIC_TRANSACTION_BOUNDARY');
  const transaction=vi.fn(async()=>{throw stop;});
  const db={transaction} as unknown as Database;
  await expect(seed(db,'synthetic-boundary-test')).rejects.toBe(stop);
  expect(transaction).toHaveBeenCalledExactlyOnceWith('synthetic-boundary-test','SYNTHETIC_SEED',expect.any(Function));
 });
});
