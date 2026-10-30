import {describe,it,expect,vi} from 'vitest';
import {WorkerRunner,type OutboxJob} from '../apps/worker/runner.ts';
import {communicationsCommands} from '../packages/domain/communications.ts';
import type {Actor,Data,Entity} from '../packages/domain/core.ts';
const now='2026-10-26T19:30:00.000Z';

describe('existing WhatsApp integration service boundary',()=>{
 it.each(['GUEST','CLIENT','EMPLOYEE','OWNER'])(
   'ingress for %s uses integration service for notifications.inbound and never impersonates sender',
   async role=>{
     const input={kind:'MESSAGE',id:'wamid-integration-fixture',sender:'4915700000001',
       type:'text',text:'MENU',received_at:now};
     const pending:Entity={kind:'conversation_input',id:'existing-inbound',companyId:'company',
       version:1,createdAt:now,updatedAt:now,
       data:{provider:'WHATSAPP',provider_event_id:input.id,user_id:'sender',input,status:'PENDING'}};
     const actor:Actor={userId:'sender',companyId:'company',roles:[role],
       permissions:[],siteIds:[],customerIds:[],warehouseIds:[]};
     const db:any={
       query:vi.fn(async()=>({rows:[{payload:input}]})),
       transaction:vi.fn(async(_company:string,_service:string,callback:any)=>
         callback({list:async(kind:string)=>kind==='conversation_input'?[pending]:[]}))
     };
     const engine:any={getActor:vi.fn(async()=>actor)};
     const runner=new WorkerRunner(db,engine,{companyId:'company',appMode:'TEST'});
     const calls:Array<{name:string;user_id:string;suffix:string;actor?:Actor}>=[];
     runner.command=vi.fn(async(_job,name,payload,suffix,actingActor?:Actor)=>{
       calls.push({name,user_id:payload.user_id,suffix,actor:actingActor});
       return {id:'window-updated'};
     }) as typeof runner.command;
     (runner as any).router=()=>({route:vi.fn(async()=>({handled:true}))});
     const job:OutboxJob={id:'job',company_id:'company',type:'whatsapp.inbound',
       data:{provider:'WHATSAPP',event_id:input.id},attempts:1,
       lease_token:'signed-worker-lease',leased_until:now};
     await (runner as any).inbound(job);
     expect(calls).toEqual([{name:'notifications.inbound',user_id:'sender',
       suffix:'inbound-window',actor:undefined}]);
     expect(communicationsCommands['notifications.inbound']!.permission).toBe('integration.process');
     expect(engine.getActor).toHaveBeenCalledWith('sender','company');
   }
 );
});
