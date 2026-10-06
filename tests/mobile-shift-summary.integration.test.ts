import { beforeAll, beforeEach, afterEach, afterAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Request } from 'express';
import { Database } from '../apps/api/database.ts';
import { Engine } from '../apps/api/engine.ts';
import { ApiController } from '../apps/api/http.ts';
import { AuthService, hashToken } from '../apps/api/auth.ts';
import { mobileShiftSummary } from '../apps/api/mobile-shift-summary.ts';
import type { Actor, Data, Entity } from '../packages/domain/core.ts';

const postgres = process.env.DATABASE_URL ? describe : describe.skip;
// Genuine PostgreSQL + Engine/controller/auth execution. External GPS/provider
// calls are absent; unavailable DATABASE_URL is SKIP, never SQL acceptance.
postgres('genuine PostgreSQL current-device mobile chronological summary',()=>{
  let db:Database,engine:Engine,api:ApiController,company:string,employee:Actor,device:Entity,now:number;
  const token='SYNTHETIC_MOBILE_QA_TOKEN_01234567890123456789', ids={employee:'mobile-summary-employee',device:'mobile-summary-device',A:'mobile-summary-a',B:'mobile-summary-b'};
  const at=(seconds:number)=>new Date(now-8*3600000+seconds*1000).toISOString();
  const call=(name:string,input:Data)=>engine.execute(employee,name,{input,idempotency_key:randomUUID()});
  const request={get:(name:string)=>name.toLowerCase()==='authorization'?`Bearer ${token}`:undefined,headers:{},ip:'192.0.2.31'} as unknown as Request;
  beforeAll(async()=>{db=new Database();await db.migrate();engine=new Engine(db,'TEST');});
  beforeEach(async()=>{
    company='mobile-summary-qa-'+randomUUID();now=Date.now();
    await db.transaction(company,'SYNTHETIC_MOBILE_SUMMARY_SETUP',async tx=>{
      await tx.add('company',{synthetic:true,operatingMode:'TEST',name:'Synthetic mobile summary QA'},company);
      await tx.add('site',{name:'Synthetic origin',code:'A-01',active:true},ids.A);await tx.add('site',{name:'Synthetic destination',code:'B-02',active:true},ids.B);
      await tx.add('user',{active:true,roles:['EMPLOYEE'],permissions:[],siteIds:[ids.A,ids.B],synthetic:true},ids.employee);
      device=await tx.add('device',{employeeId:ids.employee,platform:'ANDROID',active:true,credentialType:'OPAQUE_BEARER',tokenHash:hashToken(token),tokenExpiresAt:new Date(now+3600000).toISOString(),synthetic:true},ids.device);
    });
    employee=await engine.getActor(ids.employee,company);
    api=new ApiController({db,engine,companyId:company,appMode:'TEST',publicOrigin:'https://synthetic-mobile.invalid',buildSha:'0'.repeat(40),encryptionKey:'SYNTHETIC_MOBILE_AUTH_ENCRYPTION_KEY_0123456789'});
  });
  afterEach(()=>{vi.restoreAllMocks();});
  afterAll(async()=>{await db?.close();});
  async function activeDay(){
    const shift=await call('shift.start',{siteId:ids.A,deviceId:ids.device,occurredAt:at(0)});
    await call('shift.activity',{shiftId:shift.id,activity:'ON_BREAK',occurredAt:at(14400)});
    await call('shift.activity',{shiftId:shift.id,activity:'WAITING_WORK',siteId:ids.A,occurredAt:at(16200)});
    const trip=await call('trip.start',{shiftId:shift.id,destination:{kind:'SITE',id:ids.B},purpose:'Synthetic transfer',occurredAt:at(16200)});
    await call('trip.arrive',{tripId:trip.id,startWork:true,occurredAt:at(18000)});
    return shift;
  }
  it('actual Engine chronology yields exact counts in a genuine SQL READ ONLY transaction without GPS approval',async()=>{
    const shift=await activeDay(),before=await db.query('SELECT count(*)::int AS n FROM aggregate_revisions WHERE company_id=$1',[company]);
    const summary=await db.transaction(company,ids.employee,async tx=>{
      expect((await tx.query('SHOW transaction_read_only')).rows[0].transaction_read_only).toBe('on');
      const fresh=await engine.actorIn(tx,ids.employee);return mobileShiftSummary(tx,engine.scope(fresh,'shift.read'),await tx.get('device',ids.device),new Date(now).toISOString(),row=>engine.visible(tx,fresh,row));
    },10000,true);
    expect(summary).toMatchObject({shiftId:shift.id,siteId:ids.B,siteSeconds:25200,travelSeconds:1800,breakSeconds:1800,pendingSeconds:0,serviceSeconds:0,waitingSeconds:0});
    expect((await db.query('SELECT count(*)::int AS n FROM aggregate_revisions WHERE company_id=$1',[company])).rows).toEqual(before.rows);
    expect((await db.transaction(company,ids.employee,tx=>tx.list('tracking_policy'))).length).toBe(0);
  });
  it('actual bearer-authenticated controller includes shiftSummary while mode OFF and GPS legal gate closed',async()=>{
    const shift=await activeDay(),response:Data=await api.mobileSession(request);
    expect(response).toMatchObject({mode:'OFF',shiftId:shift.id,reason:'GPS_LEGAL_GATE_CLOSED',shiftSummary:{shiftId:shift.id,siteId:ids.B,activity:'WORKING',travelSeconds:1800,breakSeconds:1800}});
    expect(response.shiftSummary!.siteSeconds).toBeGreaterThanOrEqual(25200);
    expect(JSON.stringify(response.shiftSummary)).not.toMatch(/tokenHash|payable|latitude|salary|reason/);
  });
  it('current scope/device changes are enforced from actual PostgreSQL rather than the stale authenticated objects',async()=>{
    await activeDay();
    await db.transaction(company,'SYNTHETIC_MOBILE_SCOPE_REVOKE',async tx=>{const user=await tx.get('user',ids.employee);await tx.save(user,{...user.data,siteIds:[ids.A]});});
    await expect(db.transaction(company,ids.employee,async tx=>mobileShiftSummary(tx,engine.scope(await engine.actorIn(tx,ids.employee),'shift.read'),device,new Date(now).toISOString()))).rejects.toMatchObject({code:'ACCESS_DENIED'});
    await db.transaction(company,'SYNTHETIC_MOBILE_DEVICE_REVOKE',async tx=>{const d=await tx.get('device',ids.device);await tx.save(d,{...d.data,active:false,revokedAt:new Date().toISOString()});});
    await expect(api.mobileSession(request)).rejects.toMatchObject({code:'NEEDS_REAUTH'});
  });
  it('completed own shift disappears from the actual mobile session and cannot be confused with a peer shift',async()=>{
    const shift=await activeDay();await call('shift.end',{shiftId:shift.id,occurredAt:new Date(now).toISOString()});
    await db.transaction(company,'SYNTHETIC_PEER_MOBILE_SETUP',async tx=>{
      await tx.add('user',{active:true,roles:['EMPLOYEE'],siteIds:[ids.A],synthetic:true},'mobile-peer');
      await tx.add('device',{employeeId:'mobile-peer',active:true,synthetic:true},'mobile-peer-device');
    });
    const peer=await engine.getActor('mobile-peer',company);
    await engine.execute(peer,'shift.start',{input:{siteId:ids.A,deviceId:'mobile-peer-device',occurredAt:new Date(now-3600000).toISOString()},idempotency_key:randomUUID()});
    const response:Data=await api.mobileSession(request);expect(response).toMatchObject({mode:'OFF',reason:'NO_ACTIVE_SHIFT'});expect(response.shiftSummary).toBeUndefined();
  });
  it.each(['site','role','bearer'] as const)('actual travelling endpoint closes after %s authority changes between genuine authentication and the serving transaction',async(change)=>{
    const shift=await call('shift.start',{siteId:ids.A,deviceId:ids.device,occurredAt:at(0)});
    await call('trip.start',{shiftId:shift.id,destination:{kind:'SITE',id:ids.B},purpose:'Synthetic fresh mobile authorization race',occurredAt:at(25200)});
    const original=AuthService.prototype.authenticate;let changed=false;
    // The real verifier authenticates the real opaque device. The test hook then
    // commits a real administrative change before the actual controller serves.
    vi.spyOn(AuthService.prototype,'authenticate').mockImplementation(async function(this:AuthService,req:Request,guest?:boolean){
      const auth=await original.call(this,req,guest);
      if(!changed){changed=true;await db.transaction(company,'SYNTHETIC_MOBILE_INFLIGHT_REVOCATION',async tx=>{
        if(change==='bearer'){const d=await tx.get('device',ids.device);await tx.save(d,{...d.data,tokenHash:hashToken('SYNTHETIC_REPLACEMENT_MOBILE_TOKEN_0123456789')});}
        else{const user=await tx.get('user',ids.employee);await tx.save(user,{...user.data,...(change==='site'?{siteIds:[]}:{roles:['EMPLOYEE','CLIENT'],permissions:['shift.read','location.self']})});}
      });}
      return auth;
    });
    await expect(api.mobileSession(request)).rejects.toMatchObject({code:change==='bearer'?'NEEDS_REAUTH':'ACCESS_DENIED'});expect(changed).toBe(true);
  });
});
