import {afterEach,expect,it,vi} from 'vitest';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import worker from '../worker/index';
import {openLocalDatabase} from '../vps/database.mjs';
import {createErpIntakeScheduler} from '../vps/erp-intake-scheduler.mjs';
import type {WorkerEnv} from '../worker/types';

afterEach(()=>vi.unstubAllGlobals());
it('actual Worker/VPS startup and restart expire local queue references and clear attribution while network delivery remains disabled',async()=>{
  const folder=mkdtempSync(join(tmpdir(),'knaba-erp-maintenance-')),path=join(folder,'state.sqlite');
  let database=openLocalDatabase(path),scheduler:ReturnType<typeof createErpIntakeScheduler>|undefined;
  const env:WorkerEnv={DB:database.d1,KNABA_ERP_BRIDGE_ENABLED:'true',KNABA_ERP_TRANSFER_APPROVED:'true',KNABA_ERP_URL:'https://erp.example.com/api/v1/integrations/knaba_site/events',KNABA_ERP_ALLOWED_ORIGIN:'https://erp.example.com',KNABA_ERP_COMPANY_ID:'synthetic_company',
    KNABA_ERP_KEY_ID:'test_1',KNABA_ERP_SECRET:'synthetic-maintenance-secret-only-1234567890',KNABA_ERP_MAPPING_VERSION:'v1',KNABA_ERP_APPROVED_PRIVACY_VERSION:'2026-10-28',KNABA_ERP_SERVICE_MAP_JSON:'{"baureinigung":"service_1"}'};
  const network=vi.fn(async()=>{throw Error('NO_EXTERNAL_NETWORK_ALLOWED');});vi.stubGlobal('fetch',network);
  try{
    const body={service:'baureinigung',objectType:'Baustelle',postcode:'10115',area:'100',frequency:'Einmalig',message:'Synthetic private details',name:'Synthetic contact',email:'synthetic@example.test',phone:'',address:'',privacyAccepted:true};
    const request=new Request('https://knaba.example.com/api/leads',{method:'POST',headers:{'Content-Type':'application/json',Referer:'https://knaba.example.com/de/kontakt/?utm_campaign=synthetic',Origin:'https://knaba.example.com','X-Knaba-Request':'portal-v1','Sec-Fetch-Site':'same-origin'},body:JSON.stringify({...body,idempotencyKey:crypto.randomUUID()})});
    expect((await worker.fetch(request,env)).status).toBe(201);
    database.db.prepare('UPDATE site_erp_outbox SET created_at=?').run(new Date(Date.now()-8*86400000).toISOString());
    const before=database.db.prepare('SELECT * FROM site_erp_outbox').get();
    expect(before?.envelope_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(before?.source_json).toContain('synthetic');
    expect(JSON.stringify(before)).not.toContain('synthetic@example.test');
    expect(database.db.prepare('PRAGMA table_info(site_erp_outbox)').all().some(column=>column.name==='payload_json')).toBe(false);
    env.KNABA_ERP_BRIDGE_ENABLED='false';env.KNABA_ERP_TRANSFER_APPROVED='false';
    scheduler=createErpIntakeScheduler({worker,env});await scheduler.runNow();
    expect(database.db.prepare('SELECT status,source_json,last_error FROM site_erp_outbox').get()).toMatchObject({status:'BLOCKED',source_json:'{}',last_error:'EVENT_EXPIRED'});
    expect(network).not.toHaveBeenCalled();await scheduler.stop();scheduler=undefined;
    database.db.close();database=openLocalDatabase(path);env.DB=database.d1;
    scheduler=createErpIntakeScheduler({worker,env});await scheduler.runNow();
    expect(database.db.prepare('SELECT status,source_json,last_error FROM site_erp_outbox').get()).toMatchObject({status:'BLOCKED',source_json:'{}',last_error:'EVENT_EXPIRED'});
    expect(network).not.toHaveBeenCalled();
  }finally{await scheduler?.stop();database.db.close();rmSync(folder,{recursive:true,force:true});}
});
