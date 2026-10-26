import {describe,it,expect} from 'vitest';
import {Engine} from '../apps/api/engine.ts';
import type {Database,PgTransaction} from '../apps/api/database.ts';
import type {Actor,Entity,Data} from '../packages/domain/core.ts';
const entity=(kind:string,id:string,data:Data):Entity=>({companyId:'company',kind,id,version:1,data,createdAt:'2026-10-06T10:00:00Z',updatedAt:'2026-10-06T10:00:00Z'});
const engine=new Engine({} as Database,'TEST');
const actor=(patch:Partial<Actor>={}):Actor=>({companyId:'company',userId:'operator',roles:['DISPATCHER'],permissions:['location.presence.read'],siteIds:['site'],warehouseIds:[],customerIds:[],...patch});
function tx(policy=entity('tracking_policy','policy',{allowPresence:true,active:true,accessRoles:['DISPATCHER']})){
 return {get:async(kind:string)=>kind==='tracking_policy'?policy:entity('user','employee',{siteIds:['site']})} as unknown as PgTransaction;
}
describe('measured presence visibility uses explicit location authority, not finance rights',()=>{
 it.each(['presence','presence_event'])('permits an employee own %s but rejects external roles',async kind=>{
  const row=entity(kind,'presence',{employeeId:'employee',siteId:'site',policyVersionId:'policy'});
  expect(await engine.visible(tx(),actor({userId:'employee',permissions:[],roles:['EMPLOYEE']}),row)).toBe(true);
  expect(await engine.visible(tx(),actor({userId:'employee',roles:['CLIENT']}),row)).toBe(false);
 });
 it('does not expose employee tracker status through payroll/company authority',async()=>{
  expect(await engine.visible(tx(),actor({roles:['ACCOUNTANT'],permissions:['scope.company','finance.payroll','timesheet.approve']}),entity('presence','presence',{employeeId:'employee',siteId:'site',policyVersionId:'policy'}))).toBe(false);
 });
 it('requires both explicit presence authority and approved policy role',async()=>{
  const row=entity('presence','presence',{employeeId:'employee',siteId:'site',policyVersionId:'policy'});
  expect(await engine.visible(tx(),actor(),row)).toBe(true);
  expect(await engine.visible(tx(),actor({roles:['OWNER']}),row)).toBe(false);
  expect(await engine.visible(tx(),actor({permissions:[]}),row)).toBe(false);
  expect(await engine.visible(tx(entity('tracking_policy','policy',{allowPresence:false,accessRoles:['DISPATCHER']})),actor(),row)).toBe(false);
 });
 it('denies missing site scope and another company, including an equal own identifier',async()=>{
  const row=entity('presence','presence',{employeeId:'employee',siteId:'site',policyVersionId:'policy'});
  expect(await engine.visible(tx(),actor({siteIds:[]}),row)).toBe(false);
  expect(await engine.visible(tx(),actor({userId:'employee'}),{...row,companyId:'another-company'})).toBe(false);
 });
 it('fails closed when policy lookup is unavailable or disabled',async()=>{
  const row=entity('presence_event','presence',{employeeId:'employee',siteId:'site',policyVersionId:'policy'});
  const unavailable={get:async(kind:string)=>{if(kind==='tracking_policy')throw Error('missing');return entity('user','employee',{siteIds:['site']});}} as unknown as PgTransaction;
  expect(await engine.visible(unavailable,actor(),row)).toBe(false);
  expect(await engine.visible(tx(entity('tracking_policy','policy',{allowPresence:true,active:false,accessRoles:['DISPATCHER']})),actor(),row)).toBe(false);
 });
});
