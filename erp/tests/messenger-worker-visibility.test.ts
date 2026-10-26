import {describe,it,expect} from 'vitest';
import {Engine} from '../apps/api/engine.ts';
import type {PgTransaction} from '../apps/api/database.ts';
import type {Actor,Entity} from '../packages/domain/core.ts';
import {sensitiveKinds,ROLE_PERMISSIONS} from '../packages/domain/permissions.ts';

const candidate:Entity={
  id:'applicant-1',kind:'worker_registration_interest',companyId:'company-a',
  version:1,createdAt:'2026-10-26T19:00:00.000Z',updatedAt:'2026-10-26T19:00:00.000Z',
  data:{source_provider:'TELEGRAM',guest_user_id:'guest',contact_identity_id:'id-private',
    source_input_id:'secret-message',state:'REQUESTED',employee_created:false}
};
const principal=(roles:string[],permissions:string[]=[]):Actor=>({
  userId:'guest',companyId:'company-a',roles,permissions,
  siteIds:[],customerIds:[],warehouseIds:[]
});
describe('worker registration source cannot be disclosed via generic ERP entity APIs',()=>{
 it('categorizes the worker application as sensitive data',()=>{
  expect(sensitiveKinds.has('worker_registration_interest')).toBe(true);
 });
 it.each([
   ['guest',principal(['GUEST'],ROLE_PERMISSIONS.GUEST)],
   ['employee',principal(['EMPLOYEE'],ROLE_PERMISSIONS.EMPLOYEE)],
   ['owner',principal(['OWNER'],ROLE_PERMISSIONS.OWNER)],
   ['admin with explicit grant',principal(['BOT_ADMIN'],[...ROLE_PERMISSIONS.BOT_ADMIN,'identity.manage'])]
 ])('never exposes an applicant via generic engine read for %s',async(_,actor)=>{
   const engine=Object.create(Engine.prototype) as Engine;
   const tx={} as PgTransaction;
   expect(await engine.visible(tx,actor,candidate)).toBe(false);
 });
});
