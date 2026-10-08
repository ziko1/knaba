import {afterAll,beforeAll,beforeEach,describe,expect,it} from 'vitest';
import {randomUUID} from 'node:crypto';
import {Database,type PgTransaction} from '../apps/api/database.ts';
import {Engine} from '../apps/api/engine.ts';
import {DomainError,type Actor,type Data,type Entity} from '../packages/domain/core.ts';

// CPU cases use an explicit clone-on-read SQL transaction double; the separate
// suite below requires real PostgreSQL and is NOT_RUN without DATABASE_URL.
const NOW='2026-10-08T12:00:00.000Z';
function entity(kind:string,id:string,data:Data,companyId='projection-company'):Entity{return {kind,id,data,companyId,version:1,createdAt:NOW,updatedAt:NOW};}
const client:Actor={userId:'client',companyId:'projection-company',roles:['CLIENT'],permissions:['commerce.read'],siteIds:[],customerIds:['customer'],warehouseIds:[]};
function projectionFixture(){
 const publicSnapshot={id:'quote',quoteVersion:2,scope:'Published agreed scope',included:['Approved travel'],excluded:['Unagreed extras'],pricingModel:'FIXED',certainty:'CONTRACT_PRICE',currency:'EUR',lines:[{serviceId:'service',serviceName:'Approved service',quantityMilli:1000,unit:'FIXED',rateCents:120000,netCents:120000,included:false,rounding:'HALF_UP_TO_CENT'}],subtotalNetCents:120000,discountCents:0,totalNetCents:120000,totalTaxCents:22800,totalGrossCents:142800,tax:{mode:'VAT',rateBps:1900,display:'GROSS'},expiresAt:'2027-01-01T00:00:00.000Z',priceBookId:'book',priceBookVersion:3};
 const rows=new Map<string,Entity>();const put=(kind:string,id:string,data:Data,companyId?:string)=>{const e=entity(kind,id,data,companyId);rows.set(kind+':'+id,e);return e;};
 put('lead','lead',{ownerUserId:'client',customerId:'customer',status:'QUOTING'});
 const parent=put('quote','quote',{...publicSnapshot,leadId:'lead',customerId:'customer',ownerUserId:'client',status:'SENT',sentAt:NOW,portalPublication:{quoteId:'quote',quoteVersion:2,publishedAt:NOW,publishedBy:'manager',recipient:{ownerUserId:'client',customerId:'customer'},snapshot:structuredClone(publicSnapshot)},delivery:{channel:'PORTAL',status:'PUBLISHED',publishedAt:NOW}});
 put('customer_membership','membership',{userId:'client',customerId:'customer',siteIds:['site-a'],permissions:['VIEW'],active:true});
 const version=put('quote_version','version',{quoteId:'quote',quoteVersion:2,status:'SENT',immutable:true,publishedAt:NOW,snapshot:{notesInternal:'PRIVATE_HISTORIC_NOTE',totalNetCents:999999,margin:50000},internalCost:70000,reviewReason:'PRIVATE_REVIEW_REASON',legalTemplateId:'PRIVATE_TEMPLATE_REFERENCE'});
 const tx={companyId:client.companyId,get:async(kind:string,id:string)=>{const e=rows.get(kind+':'+id);if(!e)throw new DomainError('NOT_FOUND_SAFE');return structuredClone(e);},list:async(kind:string)=>[...rows.values()].filter(e=>e.kind===kind).map(e=>structuredClone(e))} as unknown as PgTransaction;
 return {rows,put,parent,version,tx,engine:new Engine({} as Database,'TEST')};
}

describe('V4 quote version customer projection: explicit CPU transaction double',()=>{
 it('an internal draft child stays hidden even when its parent is already published',async()=>{
  const f=projectionFixture();f.version.data.status='DRAFT';expect(await f.engine.visible(f.tx,client,f.version)).toBe(false);await expect(f.engine.project(f.tx,client,f.version)).rejects.toMatchObject({code:'NOT_FOUND_SAFE'});
 });
 it('an unpublished historical price version cannot inherit publication from a different parent quote version',async()=>{
  const f=projectionFixture();f.version.data.quoteVersion=1;expect(await f.engine.visible(f.tx,client,f.version)).toBe(false);await expect(f.engine.project(f.tx,client,f.version)).rejects.toMatchObject({code:'NOT_FOUND_SAFE'});
 });
 it.each([{immutable:false},{publishedAt:undefined},{publishedAt:'2026-10-07T12:00:00.000Z'}])('rejects a child without exact immutable publication evidence: %j',async patch=>{
  const f=projectionFixture();Object.assign(f.version.data,patch);expect(await f.engine.visible(f.tx,client,f.version)).toBe(false);
 });
 it('projects only the actual published customer values and preserves the child identity',async()=>{
  const f=projectionFixture();Object.assign(f.parent.data,{totalNetCents:555555,internalCost:90000,margin:99000});f.version.version=7;
  expect(await f.engine.visible(f.tx,client,f.version)).toBe(true);const projected=await f.engine.project(f.tx,client,f.version);
  expect(projected).toMatchObject({id:'version',kind:'quote_version',version:7,data:{id:'version',version:7,quoteId:'quote',quoteVersion:2,scope:'Published agreed scope',totalNetCents:120000,immutable:true,publishedAt:NOW,status:'SENT'}});
  for(const key of ['snapshot','internalCost','margin','reviewReason','legalTemplateId'])expect(projected.data).not.toHaveProperty(key);expect(JSON.stringify(projected)).not.toContain('PRIVATE_');
 });
 it('child customer and lead overrides cannot grant another customer access to the parent publication',async()=>{
  const f=projectionFixture();f.put('lead','other-lead',{ownerUserId:'other',customerId:'other-customer'});f.put('customer_membership','other-membership',{userId:'other',customerId:'other-customer',siteIds:[],permissions:['VIEW'],active:true});Object.assign(f.version.data,{customerId:'other-customer',leadId:'other-lead',siteId:'other-site'});
  const other={...client,userId:'other',customerIds:['other-customer']};expect(await f.engine.visible(f.tx,other,f.version)).toBe(false);await expect(f.engine.project(f.tx,other,f.version)).rejects.toMatchObject({code:'NOT_FOUND_SAFE'});
  expect(await f.engine.visible(f.tx,client,f.version)).toBe(true);
 });
 it('the actual order site prevents a child site override from widening a customer site scope',async()=>{
  const f=projectionFixture();f.parent.data.orderId='order';f.put('order','order',{customerId:'customer',siteId:'site-b'});f.version.data.siteId='site-a';expect(await f.engine.visible(f.tx,client,f.version)).toBe(false);
 });
 it('ordinary published quotes use actual order site scope and deny direct projection for a different permitted site',async()=>{
  const f=projectionFixture();f.parent.data.orderId='order';f.parent.data.siteId='site-a';f.put('order','order',{customerId:'customer',siteId:'site-b'});
  expect(await f.engine.visible(f.tx,client,f.parent)).toBe(false);await expect(f.engine.project(f.tx,client,f.parent)).rejects.toMatchObject({code:'NOT_FOUND_SAFE'});
 });
 it('an actual order/customer inconsistency cannot authorize the ordinary quote or its child using stale customer metadata',async()=>{
  const f=projectionFixture();f.parent.data.orderId='order';f.put('order','order',{customerId:'foreign-customer',siteId:'site-a'});
  expect(await f.engine.visible(f.tx,client,f.parent)).toBe(false);expect(await f.engine.visible(f.tx,client,f.version)).toBe(false);
 });
 it('child publication metadata cannot authorize a malformed parent snapshot/version binding',async()=>{
  const f=projectionFixture();f.parent.data.portalPublication.snapshot.quoteVersion=1;
  expect(await f.engine.visible(f.tx,client,f.version)).toBe(false);await expect(f.engine.project(f.tx,client,f.version)).rejects.toMatchObject({code:'NOT_FOUND_SAFE'});
 });
 it('current membership revocation blocks direct projection as well as visibility despite an old actor customerIds cache',async()=>{
  const f=projectionFixture();expect(await f.engine.visible(f.tx,client,f.version)).toBe(true);f.rows.get('customer_membership:membership')!.data.revokedAt=NOW;
  expect(await f.engine.visible(f.tx,client,f.version)).toBe(false);await expect(f.engine.project(f.tx,client,f.version)).rejects.toMatchObject({code:'NOT_FOUND_SAFE'});
 });
 it('a provider receipt without an immutable published customer snapshot cannot expose a historic child payload',async()=>{
  const f=projectionFixture();delete f.parent.data.portalPublication;f.parent.data.delivery={channel:'PROVIDER',status:'ACCEPTED_BY_PROVIDER',providerMessageId:'EXPLICIT_METADATA_DOUBLE',acceptedAt:NOW,acceptanceReceiptId:'EXPLICIT_RECEIPT_DOUBLE',sourceRequestId:'request',requestId:'request'};
  expect(await f.engine.visible(f.tx,client,f.version)).toBe(false);await expect(f.engine.project(f.tx,client,f.version)).rejects.toMatchObject({code:'NOT_FOUND_SAFE'});
 });
 it('same-looking parent IDs in a foreign company do not authorize the child',async()=>{
  const f=projectionFixture();f.parent.companyId='foreign-company';expect(await f.engine.visible(f.tx,client,f.version)).toBe(false);
 });
 it('internal authorized commerce readers retain their original access to the internal version record',async()=>{
  const f=projectionFixture();f.version.data.status='DRAFT';const manager={...client,userId:'manager',roles:['DIRECTOR'],permissions:['commerce.read','scope.company']};expect(await f.engine.visible(f.tx,manager,f.version)).toBe(true);expect(await f.engine.project(f.tx,manager,f.version)).toEqual(f.version);
 });
});

const postgres=process.env.DATABASE_URL?describe:describe.skip;
postgres('V4 quote version projection: genuine PostgreSQL published source and current customer authority',()=>{
 let db:Database,engine:Engine,company:string,owner:Actor,customer:Actor,otherCustomer:Actor,quote:Entity,version:Entity;
 beforeAll(async()=>{db=new Database();await db.migrate();});
 beforeEach(async()=>{
  company='quote-version-v4-'+randomUUID();engine=new Engine(db,'TEST');
  await db.transaction(company,'SYNTHETIC_PROJECTION_FIXTURE',async tx=>{
   await tx.add('company',{operatingMode:'TEST',synthetic:true},company);await tx.add('customer',{name:'Synthetic customer',active:true},'customer');await tx.add('customer',{name:'Other synthetic customer',active:true},'other-customer');
   for(const [id,role] of [['owner','OWNER'],['client','CLIENT'],['other-client','CLIENT']])await tx.add('user',{name:'Synthetic '+id,roles:[role],active:true,siteIds:[]},id);
   await tx.add('site',{code:'VERSION-A',name:'Permitted synthetic site',customerId:'customer',active:true},'site-a');await tx.add('site',{code:'VERSION-B',name:'Restricted synthetic site',customerId:'customer',active:true},'site-b');
   await tx.add('customer_membership',{userId:'client',customerId:'customer',siteIds:['site-a'],permissions:['VIEW','ACCEPT_QUOTE'],active:true},'membership');await tx.add('customer_membership',{userId:'other-client',customerId:'other-customer',siteIds:[],permissions:['VIEW'],active:true},'other-membership');
  });
  owner=await engine.getActor('owner',company);customer=await engine.getActor('client',company);otherCustomer=await engine.getActor('other-client',company);
  const service=await execute(owner,'service.create',{name:'Synthetic service',description:'Fixed published service',unit:'FIXED',model:'FIXED',active:true});let book=await execute(owner,'price_book.create',{name:'Synthetic approved projection pricebook',validFrom:'2026-01-01T00:00:00.000Z',tax:{mode:'VAT',rateBps:1900,display:'GROSS',testOnly:true},rules:[{serviceId:service.id,rateCents:120000}]});await execute(owner,'price_book.approve',{id:book.id});book=await execute(owner,'price_book.activate',{id:book.id});
  let lead=await execute(customer,'lead.create',{customerId:'customer',contact:{name:'Synthetic customer',email:'projection-v4@example.test'},serviceIds:[service.id],source:{channel:'WEB'},facts:{customerType:'B2C',propertyType:'BUILDING',address:'Synthetic address',desiredPeriod:'October',quantityMilli:1000}});lead=await execute(customer,'lead.own_qualify',{id:lead.id,facts:{}});
  quote=await execute(owner,'quote.create',{leadId:lead.id,priceBookId:book.id,lines:[{serviceId:service.id,quantityMilli:1000}],expiresAt:'2027-01-01T00:00:00.000Z',scope:'Actual published synthetic scope',legalTemplateId:'synthetic-template',pricingModel:'FIXED'});await execute(owner,'quote.approve',{id:quote.id,reviewReason:'Approved publication fixture'});quote=await execute(owner,'quote.send',{id:quote.id});
  // Compatibility child records are synthetic storage injections; there is no
  // quote_version business producer. Publication itself uses real commands.
  version=await db.transaction(company,'SYNTHETIC_VERSION_INJECTION',tx=>tx.add('quote_version',{quoteId:quote.id,quoteVersion:quote.data.quoteVersion,status:'SENT',immutable:true,publishedAt:quote.data.portalPublication.publishedAt,snapshot:{scope:'PRIVATE_HISTORIC_SCOPE',totalNetCents:999999,margin:5000},reviewReason:'PRIVATE_REVIEW_NOTE',internalCost:4000}));
 });
 afterAll(async()=>{await db?.close();});
 const execute=(actor:Actor,name:string,input:Data)=>engine.execute(actor,name,{input,idempotency_key:randomUUID()});
 const update=(kind:string,id:string,patch:Data)=>db.transaction(company,'SYNTHETIC_PROJECTION_UPDATE',async tx=>{const current=await tx.get(kind,id);return tx.save(current,{...current.data,...patch},current.version);});
 it('SQL entity listing and pagination return the immutable publication allowlist while draft and mismatched history remain hidden',async()=>{
  await db.transaction(company,'SYNTHETIC_PRIVATE_VERSIONS',async tx=>{await tx.add('quote_version',{...version.data,status:'DRAFT'});await tx.add('quote_version',{...version.data,quoteVersion:quote.data.quoteVersion+1});});
  const listed=await engine.readEntities(customer,'quote_version');expect(listed).toHaveLength(1);expect(listed[0]!.data).toMatchObject({quoteId:quote.id,totalNetCents:120000,scope:'Actual published synthetic scope',publishedAt:quote.data.portalPublication.publishedAt});expect(JSON.stringify(listed)).not.toContain('PRIVATE_');expect(listed[0]!.data).not.toHaveProperty('internalCost');
  const page=await engine.readEntitiesPage(customer,'quote_version',{limit:50,snapshotAt:new Date(Date.now()+1000).toISOString()});expect(page.items).toEqual(listed);expect(page.has_more).toBe(false);
 });
 it('child foreign-customer metadata cannot redirect the actual SQL parent/customer authorization',async()=>{
  version=await update('quote_version',version.id,{customerId:'other-customer',leadId:'nonexistent-child-lead',siteId:'nonexistent-child-site'});
  expect(await engine.readEntities(otherCustomer,'quote_version')).toEqual([]);expect((await engine.readEntities(customer,'quote_version')).map(e=>e.id)).toEqual([version.id]);
  await expect(db.transaction(company,'SYNTHETIC_DIRECT_PROJECT',tx=>engine.project(tx,otherCustomer,version))).rejects.toMatchObject({code:'NOT_FOUND_SAFE'});
 });
 it('current SQL membership revocation blocks a previously visible child even when the caller keeps the old actor',async()=>{
  expect((await engine.readEntities(customer,'quote_version')).map(e=>e.id)).toEqual([version.id]);await update('customer_membership','membership',{active:false,revokedAt:new Date().toISOString()});expect(await engine.readEntities(customer,'quote_version')).toEqual([]);
  await expect(db.transaction(company,'SYNTHETIC_DIRECT_PROJECT',tx=>engine.project(tx,customer,version))).rejects.toMatchObject({code:'NOT_FOUND_SAFE'});
 });
 it('actual SQL order site scope defeats a child-site override without changing publication or its internal snapshot',async()=>{
  const order=await db.transaction(company,'SYNTHETIC_RESTRICTED_ORDER',tx=>tx.add('order',{customerId:'customer',siteId:'site-b',status:'CONFIRMED'}));await update('quote',quote.id,{orderId:order.id,siteId:'site-a'});await update('quote_version',version.id,{siteId:'site-a'});expect(await engine.readEntities(customer,'quote_version')).toEqual([]);expect(await engine.readEntities(customer,'quote')).toEqual([]);
  const stored=await db.transaction(company,'SYNTHETIC_ASSERT_SOURCE',tx=>tx.get('quote_version',version.id));expect(stored.data.snapshot.scope).toBe('PRIVATE_HISTORIC_SCOPE');
 });
});
