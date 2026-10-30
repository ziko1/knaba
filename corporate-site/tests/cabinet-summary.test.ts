import {describe,expect,it} from 'vitest';
import {appendDashboardPage,cabinetSummary,filterCabinetProfiles,loadDashboardWindow} from '../src/lib/cabinet-summary';
import type {CleaningRequest,PortalDashboard,PortalProfile} from '../src/lib/portal-contract';
const request=(id:string,changes:Partial<CleaningRequest>={}):CleaningRequest=>({id,clientId:'client',service:'baureinigung',objectType:'Baustelle',postcode:'10315',area:'10',frequency:'Einmalig',message:'Test request',contactName:'Synthetic client',address:'Test street',status:'new',assignedWorkerId:null,scheduledAt:null,checklist:[],customerFeedback:'',adminReply:'',createdAt:'2026-01-01T10:00:00Z',updatedAt:'2026-01-01T10:00:00Z',version:1,...changes});
const profile=(id:string,changes:Partial<PortalProfile>={}):PortalProfile=>({id,name:'Synthetic '+id,email:id+'@example.invalid',requestedRole:'worker',role:'worker',status:'approved',createdAt:'2026-01-01',updatedAt:'2026-01-01',version:1,...changes});
const page=(requests:CleaningRequest[],profiles:PortalProfile[],requestCursor:string|null=null,profileCursor:string|null=null):PortalDashboard=>({session:{user:{id:'owner',email:'owner@example.invalid',name:'Synthetic Owner'},profile:null,role:'owner'},requests,profiles,audit:[],limited:Boolean(requestCursor||profileCursor),totals:{requests:500,profiles:250},page:{nextRequestCursor:requestCursor,nextProfileCursor:profileCursor}});
describe('cabinet summaries and continued windows',()=>{
  it('orders only active dated assignments, excludes completed and invalid dates, and does not mutate records',()=>{
    const rows=[request('later',{status:'scheduled',scheduledAt:'2026-11-05T10:00:00Z'}),request('done',{status:'completed',scheduledAt:'2026-10-01T10:00:00Z'}),request('earlier',{status:'in_progress',scheduledAt:'2026-10-29T10:00:00Z'}),request('bad',{status:'scheduled',scheduledAt:'invalid'}),request('new')];
    const value=cabinetSummary(rows);
    expect(value.agenda.map(x=>x.id)).toEqual(['earlier','later']);expect(value.active).toBe(4);expect(value.completed).toBe(1);expect(rows[0].id).toBe('later');
  });
  it('limits the agenda to five and filters loaded people by name/email and status',()=>{
    const rows=Array.from({length:8},(_,i)=>request(String(i),{status:'scheduled',scheduledAt:'2026-11-05T10:00:00Z'}));
    expect(cabinetSummary(rows).agenda).toHaveLength(5);
    const people=[profile('one'),profile('two',{status:'pending'})];
    expect(filterCabinetProfiles(people,' TWO@EXAMPLE ','pending').map(x=>x.id)).toEqual(['two']);
    expect(filterCabinetProfiles(people,'','approved').map(x=>x.id)).toEqual(['one']);
  });
  it('appends only the requested collection and keeps the other continuation',()=>{
    const first=page([request('a')],[profile('x')],'req-next','profile-next');
    const next=page([request('a',{version:2}),request('b')],[profile('unrelated')],null,'wrong-profile');
    const result=appendDashboardPage(first,next,'requests');
    expect(result.requests.map(x=>x.id)).toEqual(['a','b']);expect(result.requests[0].version).toBe(2);
    expect(result.profiles).toEqual(first.profiles);expect(result.page).toEqual({nextRequestCursor:null,nextProfileCursor:'profile-next'});
    expect(()=>appendDashboardPage(first,{...next,session:{...next.session,role:'worker'}},'requests')).toThrow('identity');
  });
  it('refreshes the whole loaded window with fresh cursors, dropping reassigned records',async()=>{
    const calls:string[]=[];const values=[page([request('new-first')],[profile('p1')],'new-r','new-p'),page([request('new-second')],[profile('ignored')],null,'ignored-p'),page([request('ignored')],[profile('p2')],'ignored-r',null)];
    const data=await loadDashboardWindow(async q=>{calls.push(q);return values.shift()!;},2,2);
    expect(calls).toEqual(['','?requestCursor=new-r','?profileCursor=new-p']);
    expect(data.requests.map(x=>x.id)).toEqual(['new-first','new-second']);expect(data.profiles.map(x=>x.id)).toEqual(['p1','p2']);expect(data.limited).toBe(false);
  });
  it('rejects repeated cursors and tolerates an older response without metadata',async()=>{
    await expect(loadDashboardWindow(async()=>page([],[],'repeat'),4,1)).rejects.toThrow('Repeated');
    const older=page([request('old')],[]);delete older.page;delete older.totals;
    const data=await loadDashboardWindow(async()=>older,2,2);expect(data.page.nextRequestCursor).toBeNull();expect(data.requests).toHaveLength(1);
  });
});
