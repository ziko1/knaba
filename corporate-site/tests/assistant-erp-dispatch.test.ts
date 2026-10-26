import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {createHmac} from 'node:crypto';
import {drainErpLeads} from '../worker/assistant-erp-dispatch';
import {previewErpLead,confirmErpLead,cancelErpLead,getErpLead} from '../worker/assistant-erp';
import {Db,erpTestEnv,erpTestInput,erpTestTime,erpTestConversationId as id,insertErpTestConversation} from './helpers/assistant-erp-fixture';
import type {WorkerEnv} from '../worker/types';

let db:Db,env:WorkerEnv,time:number;
beforeEach(()=>{db=new Db();env={...erpTestEnv(),DB:db};time=erpTestTime;insertErpTestConversation(db);});
afterEach(()=>db.sql.close());
async function queue(){const p=await previewErpLead(db,env,id,erpTestInput,time);return confirmErpLead(db,env,id,{version:p.version,previewHash:p.previewHash,confirmed:true},time);}
const stored=()=>db.sql.prepare('SELECT * FROM assistant_erp_requests').get() as Record<string,unknown>;
const accepted=(body:string,duplicate=false)=>new Response(JSON.stringify({event_id:JSON.parse(body).event_id,status:'APPLIED',duplicate,effect_id:'erp-lead-synthetic'}));
const run=(transport:typeof fetch)=>drainErpLeads(env,{transport,now:()=>time,random:()=>0});

describe('private ERP dispatch against durable SQLite',()=>{
  it('never sends while disabled or with an unconfirmed draft',async()=>{
    const transport=vi.fn<typeof fetch>();
    await previewErpLead(db,env,id,erpTestInput,time);
    expect((await run(transport)).processed).toBe(0);
    await queue();env.ASSISTANT_ERP_ENABLED='';
    expect((await run(transport)).disabled).toBe(true);expect(transport).not.toHaveBeenCalled();
  });
  it('signs exact bytes, fixes destination, forbids redirects and accepts only a matching receipt',async()=>{
    await queue();
    const transport=vi.fn<typeof fetch>(async(url,options)=>{
      expect(url).toBe('https://erp.example.test/api/v1/integrations/knaba_web/events');
      expect(options?.redirect).toBe('error');expect(options?.credentials).toBe('omit');
      const headers=new Headers(options?.headers),timestamp=headers.get('x-knaba-timestamp')!,body=String(options?.body);
      expect(headers.get('x-knaba-signature')).toBe('sha256='+createHmac('sha256',env.ASSISTANT_ERP_SECRET!).update(timestamp+'.'+body).digest('hex'));
      const payload=JSON.parse(body).payload;
      expect(payload.contact.email).toBe('client@example.test');expect(payload.serviceIds).toEqual(['service-cleaning']);
      expect(body).not.toContain('companyId');expect(body).not.toContain('token_hash');
      return accepted(body);
    });
    expect((await run(transport)).applied).toBe(1);expect(stored().attempts).toBe(1);
    expect(JSON.stringify(await getErpLead(db,id))).not.toContain('erp-lead-synthetic');
    await run(transport);expect(transport).toHaveBeenCalledTimes(1);
  });
  it('allows one sender under concurrent dispatcher ticks',async()=>{
    await queue();const transport=vi.fn<typeof fetch>(async(_url,o)=>accepted(String(o?.body)));
    await Promise.all([run(transport),run(transport),run(transport)]);
    expect(transport).toHaveBeenCalledTimes(1);expect(stored().state).toBe('APPLIED');
  });
  it('replays the immutable event after a lost response, creating one remote effect',async()=>{
    await queue();const remote=new Set<string>(),bodies:string[]=[];
    const transport=vi.fn<typeof fetch>(async(_url,o)=>{
      const body=String(o?.body),event=JSON.parse(body);bodies.push(body);
      const duplicate=remote.has(event.event_id);remote.add(event.event_id);
      if(!duplicate)throw Error('response lost after commit');return accepted(body,true);
    });
    expect((await run(transport)).retry).toBe(1);expect(stored().state).toBe('RETRY');
    time+=6_000;expect((await run(transport)).applied).toBe(1);
    expect(bodies[0]).toBe(bodies[1]);expect(remote.size).toBe(1);expect(stored().attempts).toBe(2);
  });
  it.each(['wrong-event','missing-effect','oversized'])('does not turn malformed %s 2xx into success',async kind=>{
    await queue();const transport=vi.fn<typeof fetch>(async(_url,o)=>{
      if(kind==='oversized')return new Response('x'.repeat(70_000));
      const event=JSON.parse(String(o?.body));return new Response(JSON.stringify({event_id:kind==='wrong-event'?'wrong':event.event_id,status:'APPLIED',duplicate:false}));
    });
    await run(transport);expect(stored().state).toBe('UNKNOWN');await run(transport);expect(transport).toHaveBeenCalledTimes(1);
  });
  it('keeps quarantined receipts out of success and automatic retries',async()=>{
    await queue();const transport=vi.fn<typeof fetch>(async(_url,o)=>new Response(JSON.stringify({event_id:JSON.parse(String(o?.body)).event_id,status:'QUARANTINED',duplicate:false,quarantine_id:'held-1'})));
    expect((await run(transport)).applied).toBe(0);expect(stored().state).toBe('QUARANTINED');await run(transport);expect(transport).toHaveBeenCalledTimes(1);
  });
  it('blocks changed scope and closed conversations before any send',async()=>{
    await queue();env.ASSISTANT_ERP_COMPANY_ID='other-company';const transport=vi.fn<typeof fetch>();
    await run(transport);expect(stored().state).toBe('BLOCKED');expect(transport).not.toHaveBeenCalled();
    db.sql.prepare("UPDATE assistant_erp_requests SET state='QUEUED'").run();env.ASSISTANT_ERP_COMPANY_ID='knaba-test';
    db.sql.prepare("UPDATE assistant_conversations SET status='closed'").run();await run(transport);expect(transport).not.toHaveBeenCalled();
  });
  it('cancels before send but records uncertainty when cancel races started transport',async()=>{
    await queue();await cancelErpLead(db,id,time);const never=vi.fn<typeof fetch>();await run(never);expect(never).not.toHaveBeenCalled();
    const p=await previewErpLead(db,env,id,erpTestInput,time);await confirmErpLead(db,env,id,{version:p.version,previewHash:p.previewHash,confirmed:true},time);
    const transport=vi.fn<typeof fetch>(async(_url,o)=>{await cancelErpLead(db,id,time);return accepted(String(o?.body));});
    await run(transport);expect(stored().state).toBe('UNKNOWN');expect(stored().receipt_json).toContain('APPLIED');
    await run(transport);expect(transport).toHaveBeenCalledTimes(1);
  });
  it('cancels a claimed request during signing and fences it from a newly confirmed replacement',async()=>{
    const first=await queue(),oldEvent=stored().event_id;
    let releaseSigning!:()=>void,startedSigning!:()=>void;
    const gate=new Promise<void>(resolve=>{releaseSigning=resolve;});
    const started=new Promise<void>(resolve=>{startedSigning=resolve;});
    const originalSign=crypto.subtle.sign.bind(crypto.subtle);
    const signing=vi.spyOn(crypto.subtle,'sign').mockImplementation(async(algorithm,key,data)=>{
      startedSigning();await gate;return originalSign(algorithm,key,data);
    });
    const transport=vi.fn<typeof fetch>(async(_url,options)=>accepted(String(options?.body)));
    const staleWorker=run(transport);
    try{
      await started;
      expect(stored().state).toBe('SENDING');expect(stored().attempts).toBe(0);expect(stored().lease_token).not.toBeNull();
      expect((await cancelErpLead(db,id,time+1))?.state).toBe('CANCELLED');
      expect(stored().lease_token).toBeNull();expect(stored().lease_until).toBeNull();
      const replacement=await previewErpLead(db,env,id,{...erpTestInput,condition:'Updated request'},time+2);
      expect(replacement.version).toBe(first.version+1);expect(stored().event_id).not.toBe(oldEvent);
      await confirmErpLead(db,env,id,{version:replacement.version,previewHash:replacement.previewHash,confirmed:true},time+3);
      releaseSigning();await staleWorker;
      expect(transport).not.toHaveBeenCalled();expect(stored().state).toBe('QUEUED');expect(stored().attempts).toBe(0);
      expect(stored().preview_hash).toBe(replacement.previewHash);
    }finally{releaseSigning();await staleWorker;signing.mockRestore();}
    time+=4;await run(transport);
    expect(transport).toHaveBeenCalledTimes(1);expect(stored().state).toBe('APPLIED');expect(stored().attempts).toBe(1);
    expect(JSON.parse(String(transport.mock.calls[0][1]?.body)).event_id).not.toBe(oldEvent);
  });
  it('reclaims an expired lease with unchanged event and fences the old completion',async()=>{
    await queue();let release:(r:Response)=>void=()=>{};let body='';
    const delayed=run(async(_u,o)=>{body=String(o?.body);return new Promise<Response>(r=>{release=r;});});
    await vi.waitFor(()=>expect(stored().attempts).toBe(1));time+=46_000;
    await run(async(_u,o)=>accepted(String(o?.body),true));release(accepted(body));await delayed;
    expect(stored().state).toBe('APPLIED');expect(stored().attempts).toBe(2);expect(JSON.parse(String(stored().receipt_json)).duplicate).toBe(true);
  });
  it('bounds attempts and makes exhaustion reviewable',async()=>{
    await queue();const transport=vi.fn<typeof fetch>(async()=>{throw Error('offline');});
    for(let i=0;i<7;i++){await run(transport);time+=3_600_000;}
    expect(transport).toHaveBeenCalledTimes(6);expect(stored().state).toBe('UNKNOWN');
  });
});
