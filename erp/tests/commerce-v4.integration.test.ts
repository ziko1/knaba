import {afterAll,beforeAll,beforeEach,describe,expect,it} from 'vitest';
import {randomUUID} from 'node:crypto';
import {Database} from '../apps/api/database.ts';
import {Engine} from '../apps/api/engine.ts';
import {commerceCommands} from '../packages/domain/commerce.ts';
import type {Actor,Data,Entity} from '../packages/domain/core.ts';

// Real PostgreSQL aggregates/revisions/audit/outbox/receipts and fresh Engine
// authorization. No external provider transport or fake provider acceptance.
// Without DATABASE_URL these cases are SQL_NOT_RUN, never local acceptance.
const postgres=process.env.DATABASE_URL?describe:describe.skip;
postgres('V4 commerce: actual PostgreSQL publication, orthogonal review and original acceptance identity',()=>{
 let db:Database,engine:Engine,company:string,owner:Actor,client:Actor,lead:Entity,quote:Entity;
 beforeAll(async()=>{db=new Database();await db.migrate();});
 beforeEach(async()=>{
  company='commerce-v4-'+randomUUID();engine=new Engine(db,'TEST');
  await db.transaction(company,'SYNTHETIC_COMMERCE_FIXTURE',async tx=>{
   await tx.add('company',{name:'Synthetic isolated V4 commerce QA',operatingMode:'TEST',synthetic:true},company);
   // OWNER has no implicit commerce grant; this fixture explicitly authorizes its setup/review commands.
   await tx.add('user',{name:'Synthetic owner',roles:['OWNER'],permissions:['commerce.manage','commerce.approve','quote.create','quote.approve','quote.send','lead.handoff','customer.manage'],active:true,siteIds:[]},'owner');
   await tx.add('user',{name:'Synthetic client',roles:['CLIENT'],active:true,siteIds:[]},'client');
  });
  owner=await engine.getActor('owner',company);client=await engine.getActor('client',company);
  const service=await execute(owner,'service.create',{name:'Synthetic fixed service',description:'Agreed fixed-price work',unit:'FIXED',model:'FIXED',active:true});
  let book=await execute(owner,'price_book.create',{name:'Synthetic approved V4 pricebook',validFrom:'2026-01-01T00:00:00.000Z',tax:{mode:'VAT',rateBps:1900,display:'GROSS',testOnly:true},rules:[{serviceId:service.id,rateCents:120000}]});
  await execute(owner,'price_book.approve',{id:book.id});book=await execute(owner,'price_book.activate',{id:book.id});
  lead=await execute(client,'lead.create',{contact:{name:'Synthetic customer',email:'commerce-v4@example.test'},serviceIds:[service.id],source:{channel:'WEB'},facts:{customerType:'B2C',propertyType:'BUILDING',address:'Synthetic address',desiredPeriod:'October',quantityMilli:1000}});
  lead=await execute(client,'lead.own_qualify',{id:lead.id,facts:{}});
  quote=await execute(owner,'quote.create',{leadId:lead.id,priceBookId:book.id,lines:[{serviceId:service.id,quantityMilli:1000}],expiresAt:'2027-01-01T00:00:00.000Z',scope:'Immutable synthetic fixed scope',legalTemplateId:'synthetic-template',pricingModel:'FIXED',certainty:'CONTRACT_PRICE'});
  lead=await row('lead',lead.id);
 });
 afterAll(async()=>{await db?.close();});
 const execute=(actor:Actor,name:string,input:Data,key=randomUUID(),version?:number)=>engine.execute(actor,name,{input,idempotency_key:key,expected_version:version});
 const row=(kind:string,id:string)=>db.transaction(company,'SYNTHETIC_COMMERCE_ASSERT',tx=>tx.get(kind,id));
 const rows=(kind:string)=>db.transaction(company,'SYNTHETIC_COMMERCE_ASSERT',tx=>tx.list(kind));
 async function approved(){quote=await execute(owner,'quote.approve',{id:quote.id,reviewReason:'Explicit approved synthetic publication'});return quote;}
 async function published(){await approved();quote=await execute(owner,'quote.send',{id:quote.id});return quote;}
 async function fingerprint(){const result:Record<string,Data>={};for(const table of ['aggregates','aggregate_revisions','audit_log','command_receipts','outbox'])result[table]=(await db.query(`SELECT count(*)::int AS count,md5(coalesce(string_agg(to_jsonb(r)::text,E'\n' ORDER BY to_jsonb(r)::text),'')) AS hash FROM ${table} r WHERE company_id=$1`,[company])).rows[0];return result;}

 it('human review and explicit return preserve the actual QUOTING aggregate and current quote',async()=>{
  await execute(client,'lead.own_handoff',{id:lead.id,reason:'Synthetic human review',summaryDE:'Kunde benötigt menschliche Prüfung.'});
  expect((await row('lead',lead.id)).data).toMatchObject({status:'QUOTING',review_state:'HUMAN_REVIEW_REQUIRED',currentQuoteId:quote.id});
  const before=await fingerprint();await expect(approved()).rejects.toMatchObject({code:'NEEDS_APPROVAL'});expect(await fingerprint()).toEqual(before);
  await execute(owner,'lead.claim',{id:lead.id});await execute(owner,'lead.resume_ai',{id:lead.id,reason:'Operator resolved the question'});
  expect((await row('lead',lead.id)).data).toMatchObject({status:'QUOTING',review_state:'NONE',currentQuoteId:quote.id});expect((await row('quote',quote.id)).data.status).toBe('DRAFT');
 });
 it('visit resolution records linked verified facts with a separate audit and never changes the sales lifecycle',async()=>{
  const visit=await execute(client,'site_visit.own_create',{leadId:lead.id,reason:'Synthetic professional verification'}),before=await fingerprint();
  await expect(execute(client,'lead.review.resolve',{id:lead.id,reason:'Customer cannot verify inspection',siteVisitId:visit.id,facts:{measurementSource:'VERIFIED'}})).rejects.toMatchObject({code:'ACCESS_DENIED'});expect(await fingerprint()).toEqual(before);
  await execute(owner,'lead.review.resolve',{id:lead.id,reason:'Synthetic inspector recorded explicit verification',siteVisitId:visit.id,facts:{measurementSource:'VERIFIED',quantityMilli:1000}});
  expect((await row('lead',lead.id)).data).toMatchObject({status:'QUOTING',review_state:'NONE',siteVisitVerification:{visitId:visit.id,verifiedBy:'owner'}});expect((await row('site_visit_request',visit.id)).data.status).toBe('COMPLETED');
  const audit=await db.query("SELECT actor_id FROM audit_log WHERE company_id=$1 AND aggregate_kind='site_visit_request' AND aggregate_id=$2 AND action='UPDATE'",[company,visit.id]);expect(audit.rows).toEqual([{actor_id:'owner'}]);
 });
 it('portal publication commits one public snapshot and is exposed only after actual publication',async()=>{
  await approved();expect(await engine.readEntities(client,'quote')).toEqual([]);await expect(execute(client,'quote.get',{id:quote.id})).rejects.toMatchObject({code:'NOT_FOUND_SAFE'});
  quote=await execute(owner,'quote.send',{id:quote.id});const stored=await row('quote',quote.id);expect(stored.data).toMatchObject({status:'SENT',delivery:{channel:'PORTAL',status:'PUBLISHED'},portalPublication:{quoteId:quote.id,quoteVersion:1,recipient:{ownerUserId:'client'},snapshot:{scope:'Immutable synthetic fixed scope',totalNetCents:120000}}});
  const visible=await engine.readEntities(client,'quote');expect(visible).toHaveLength(1);expect(visible[0]!.data).toMatchObject({status:'SENT',totalNetCents:120000});expect(visible[0]!.data).not.toHaveProperty('reviewReason');expect(visible[0]!.data).not.toHaveProperty('snapshot');
  expect((await db.query("SELECT type FROM outbox WHERE company_id=$1 AND type LIKE 'quote.%published'",[company])).rows).toEqual([{type:'quote.portal_published'}]);expect((await db.query("SELECT id FROM outbox WHERE company_id=$1 AND type='quote.send_requested'",[company])).rows).toHaveLength(0);
 });
 it('a failure after quote publication save rolls back its aggregate, revision, audit and outbox atomically',async()=>{
  await approved();const before=await fingerprint(),definition=commerceCommands['quote.send']!;
  await expect(db.transaction(company,'SYNTHETIC_ROLLBACK',async tx=>{
   const ctx=engine.context(tx,owner,randomUUID());const failing=Object.create(tx);failing.event=async()=>{throw new Error('SYNTHETIC_OUTBOX_FAILURE_AFTER_PUBLICATION_SAVE');};
   return definition.handler({...ctx,tx:failing},definition.schema.parse({id:quote.id}));
  })).rejects.toThrow('SYNTHETIC_OUTBOX_FAILURE_AFTER_PUBLICATION_SAVE');
  expect(await fingerprint()).toEqual(before);expect((await row('quote',quote.id)).data).toMatchObject({status:'APPROVED_TO_SEND'});expect((await row('quote',quote.id)).data.portalPublication).toBeUndefined();
 });
 it('concurrent provider sends create one queued outbox request and cannot create a customer acceptance',async()=>{
  await approved();const [first,second]=await Promise.all([execute(owner,'quote.send',{id:quote.id,channel:'PROVIDER'}),execute(owner,'quote.send',{id:quote.id,channel:'PROVIDER'})]);expect(second.id).toBe(first.id);expect(second.data.delivery.requestId).toBe(first.data.delivery.requestId);
  expect((await row('quote',quote.id)).data).toMatchObject({status:'APPROVED_TO_SEND',delivery:{status:'QUEUED'}});expect((await row('quote',quote.id)).data.sentAt).toBeUndefined();expect((await db.query("SELECT id FROM outbox WHERE company_id=$1 AND type='quote.send_requested'",[company])).rows).toHaveLength(1);
  const before=await fingerprint();await expect(execute(client,'quote.accept',{id:quote.id,quoteVersion:1})).rejects.toMatchObject({code:'INVALID_STATE'});expect(await fingerprint()).toEqual(before);expect(await rows('order')).toHaveLength(0);expect(await engine.readEntities(client,'quote')).toEqual([]);
 });
 it('concurrent acceptance returns one original acceptance ID and binds exactly one order and dispatch to it',async()=>{
  await published();const [first,second]=await Promise.all([execute(client,'quote.accept',{id:quote.id,quoteVersion:1}),execute(client,'quote.accept',{id:quote.id,quoteVersion:1})]);
  expect(first.acceptanceId).toBe(second.acceptanceId);expect(first.order.id).toBe(second.order.id);expect(first.dispatch.id).toBe(second.dispatch.id);expect((await row('quote',quote.id)).data.acceptanceId).toBe(first.acceptanceId);
  const acceptances=await rows('quote_acceptance'),dispatches=await rows('dispatch_request');expect(acceptances).toHaveLength(1);expect(dispatches).toHaveLength(1);expect(dispatches[0]!.data.acceptanceId).toBe(first.acceptanceId);expect(acceptances[0]!.data.commercialSnapshot).toMatchObject({quoteVersion:1,totalNetCents:120000,scope:'Immutable synthetic fixed scope'});expect(await rows('order')).toHaveLength(1);
 });
 it('an expired published button rejects before creating any business record or command receipt',async()=>{
  await published();await db.transaction(company,'SYNTHETIC_EXPIRE',async tx=>{const current=await tx.get('quote',quote.id);return tx.save(current,{...current.data,expiresAt:'2026-01-02T00:00:00.000Z'},current.version);});
  const before=await fingerprint();await expect(execute(client,'quote.accept',{id:quote.id,quoteVersion:1})).rejects.toMatchObject({code:'INVALID_STATE'});expect(await fingerprint()).toEqual(before);expect(await rows('order')).toHaveLength(0);expect(await rows('quote_acceptance')).toHaveLength(0);
 });
 it('current membership revocation hides accepted quote and blocks both fresh acceptance and prior cached receipt',async()=>{
  await published();const key=randomUUID();await execute(client,'quote.accept',{id:quote.id,quoteVersion:1},key);const membership=(await rows('customer_membership'))[0]!;await execute(owner,'customer.membership.revoke',{id:membership.id,reason:'Synthetic contract access ended'});
  const before=await fingerprint();expect(await engine.readEntities(client,'quote')).toEqual([]);await expect(execute(client,'quote.get',{id:quote.id})).rejects.toMatchObject({code:'NOT_FOUND_SAFE'});await expect(execute(client,'quote.accept',{id:quote.id,quoteVersion:1})).rejects.toMatchObject({code:'NOT_FOUND_SAFE'});await expect(execute(client,'quote.accept',{id:quote.id,quoteVersion:1},key)).rejects.toMatchObject({code:'ACCESS_DENIED'});expect(await fingerprint()).toEqual(before);
 });
 it('forged external VERIFIED facts produce no lead, revision, audit, receipt or verification source while internal verification creates the linked actual fact',async()=>{
  const before=await fingerprint();await expect(execute(client,'lead.create',{contact:{name:'Forged source',email:'forged-v4@example.test'},serviceIds:lead.data.serviceIds,source:{channel:'WEB'},newRequest:true,facts:{quantityMilli:100000,measurementSource:'VERIFIED'}})).rejects.toMatchObject({code:'ACCESS_DENIED'});expect(await fingerprint()).toEqual(before);
  await expect(execute(client,'lead.measurement.verify',{id:lead.id,facts:{quantityMilli:1200},reason:'Client cannot attest internally',evidence:'Untrusted',measuredAt:new Date().toISOString()})).rejects.toMatchObject({code:'ACCESS_DENIED'});expect(await fingerprint()).toEqual(before);
  const result=await execute(owner,'lead.measurement.verify',{id:lead.id,facts:{quantityMilli:1200},reason:'Explicit synthetic internal inspection',evidence:'SYNTHETIC_INSPECTION_NOT_COMPANY_ACCEPTANCE',measuredAt:new Date(Date.now()-1000).toISOString()}),sources=await rows('measurement_verification');expect(sources).toHaveLength(1);expect(result.data.measurementVerification.id).toBe(sources[0]!.id);expect(sources[0]!.data).toMatchObject({leadId:lead.id,verifiedBy:'owner',facts:{quantityMilli:1200,measurementSource:'VERIFIED'},previousFacts:{quantityMilli:1000}});expect(result.data.status).toBe('QUOTING');
 });
 it('unresolved legacy lifecycle recovery requires an actual internal reason/evidence record and retains the review gate',async()=>{
  await db.transaction(company,'SYNTHETIC_LEGACY_SOURCE',async tx=>{const current=await tx.get('lead',lead.id);return tx.save(current,{...current.data,status:'SITE_VISIT_REQUIRED',review_state:'SITE_VISIT_REQUIRED',lifecycleReconciliationRequired:true},current.version);});const before=await fingerprint();
  await expect(execute(client,'lead.lifecycle.reconcile',{id:lead.id,status:'NEW',reason:'Customer cannot choose internal lifecycle',evidence:'Untrusted'})).rejects.toMatchObject({code:'ACCESS_DENIED'});expect(await fingerprint()).toEqual(before);
  const result=await execute(owner,'lead.lifecycle.reconcile',{id:lead.id,status:'QUALIFYING',reason:'Known original stage unavailable; safe restart chosen',evidence:'SYNTHETIC_REVISION_REVIEW'});expect(result.data).toMatchObject({status:'QUALIFYING',review_state:'SITE_VISIT_REQUIRED',legacyLifecycleStatus:'SITE_VISIT_REQUIRED',lifecycleReconciliationRequired:false,lifecycleReconciliation:{actorId:'owner',chosenSafeStatus:'QUALIFYING',evidence:'SYNTHETIC_REVISION_REVIEW'}});
  const settled=await fingerprint();await expect(approved()).rejects.toMatchObject({code:'NEEDS_APPROVAL'});expect(await fingerprint()).toEqual(settled);
 });
});
