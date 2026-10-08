import {afterAll,afterEach,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {createHash,randomUUID} from 'node:crypto';
import type {Request,Response} from 'express';
import {Database} from '../apps/api/database.ts';
import {Engine} from '../apps/api/engine.ts';
import {ApiController} from '../apps/api/http.ts';
import {AuthService,SESSION_COOKIE} from '../apps/api/auth.ts';
import {reportSnapshotHash} from '../packages/domain/resources.ts';
import type {Actor,Data,Entity} from '../packages/domain/core.ts';

// Genuine PostgreSQL, Engine report approval/publication and authenticated API
// sessions. Only Express transport is doubled; unavailable DATABASE_URL is SKIP,
// never SQL acceptance. Fixtures cannot issue an invoice or contact a provider.
const postgres=process.env.DATABASE_URL?describe:describe.skip;
const ORIGIN='https://accounting-export.qa.example.test';
const start='2026-10-01T08:00:00.000Z',end='2026-10-01T14:00:01.000Z';
type Session={token:string;csrfToken:string};
function request(session:Session):Request {
 const headers:Record<string,string>={origin:ORIGIN,host:new URL(ORIGIN).host,cookie:`${SESSION_COOKIE}=${session.token}`};
 return {method:'GET',protocol:'https',ip:'192.0.2.51',headers,get:(name:string)=>headers[name.toLowerCase()]} as unknown as Request;
}
function response(){
 const headers:Record<string,string>={};let bytes:Buffer|undefined;
 const res={set:vi.fn((values:Record<string,string>)=>{Object.assign(headers,values);}),send:vi.fn((value:Buffer)=>{bytes=value;})};
 return {res:res as unknown as Response,headers,read:()=>{expect(Buffer.isBuffer(bytes)).toBe(true);return bytes!;},sent:res.send};
}
function expectCanonicalObject(value:unknown):void {
 if(Array.isArray(value)){for(const item of value)expectCanonicalObject(item);return;}
 if(value&&typeof value==='object'){
  const keys=Object.keys(value);expect(keys).toEqual([...keys].sort());
  for(const item of Object.values(value))expectCanonicalObject(item);
 }
}

postgres('accountant handoff: real PostgreSQL published report, current authority and immutable source',()=>{
 let db:Database,engine:Engine,api:ApiController,foreignApi:ApiController,company:string,foreignCompany:string;
 let author:Actor,reviewer:Actor,accountant:Actor,report:Entity,version:Entity,session:Session,viewerSession:Session,foreignSession:Session;
 let externalSessions:Record<string,Session>;
 const execute=(actor:Actor,name:string,input:Data)=>engine.execute(actor,name,{input,idempotency_key:randomUUID()});
 const get=(kind:string,id:string)=>db.transaction(company,'SYNTHETIC_ACCOUNTING_ASSERT',tx=>tx.get(kind,id));
 const update=(kind:string,id:string,patch:Data)=>db.transaction(company,'SYNTHETIC_ACCOUNTING_UPDATE',async tx=>{const row=await tx.get(kind,id);return tx.save(row,{...row.data,...patch},row.version);});
 beforeAll(async()=>{db=new Database();await db.migrate();});
 beforeEach(async()=>{
  company='accounting-qa-'+randomUUID();foreignCompany='accounting-foreign-qa-'+randomUUID();engine=new Engine(db,'TEST');
  await db.transaction(company,'SYNTHETIC_ACCOUNTING_FIXTURE',async tx=>{
   await tx.add('company',{legalName:'Synthetic accounting QA GmbH',address:'Synthetic Berlin address',operatingMode:'TEST',synthetic:true},company);
   await tx.add('customer',{name:'Synthetic accounting customer',address:'Synthetic customer address',active:true,synthetic:true},'customer');
   for(const id of ['site','other-site'])await tx.add('site',{name:'Synthetic '+id,code:id==='site'?'QA-001':'QA-002',address:'Synthetic site address',customerId:'customer',active:true,synthetic:true},id);
   for(const id of ['author','reviewer'])await tx.add('user',{name:'Synthetic '+id,roles:['DIRECTOR'],siteIds:['site'],active:true,synthetic:true},id);
   await tx.add('user',{name:'Synthetic accountant',roles:['ACCOUNTANT'],siteIds:['site'],active:true,synthetic:true},'accountant');
   await tx.add('user',{name:'Synthetic report viewer without export',roles:['QUALITY_CONTROL'],siteIds:['site'],active:true,synthetic:true},'viewer');
   await tx.add('user',{name:'PRIVATE_EMPLOYEE_NAME',businessCode:'PRIVATE_WORKER_CODE',roles:['EMPLOYEE'],siteIds:['site'],active:true,bank:'PRIVATE_EMPLOYEE_BANK',synthetic:true},'worker');
   for(const role of ['CLIENT','CUSTOMER','EXTERNAL_BAULEITER','GUEST']){
    await tx.add('user',{name:'Synthetic '+role,roles:[role],permissions:['report.read','report.export'],siteIds:['site'],active:true,synthetic:true},'external-'+role);
    await tx.add('customer_membership',{userId:'external-'+role,customerId:'customer',siteIds:['site'],permissions:['VIEW','REPORT_ACK'],active:true,synthetic:true},'membership-'+role);
   }
   // Explicit synthetic contract/time/media inputs. Report creation, separate
   // approval and publication below use the real command handlers and receipts.
   await tx.add('order',{customerId:'customer',siteId:'site',quoteId:'synthetic-quote',quoteVersion:3,status:'CLOSED',pricingModel:'FIXED',baseNetCents:12000,approvedChangesNetCents:345,finalNetCents:12345,currency:'EUR',tax:{rateBps:1900,display:'NET',testOnly:true},internalCostCents:999999,synthetic:true},'order');
   await tx.add('task',{siteId:'site',orderId:'order',titleDe:'Synthetische bestätigte Reinigungsleistung',state:'ACCEPTED',acceptedQuantityMilli:123456,unit:'M2',synthetic:true},'task');
   await tx.add('task_review',{taskId:'task',decision:'ACCEPT',quantityMilli:123456,synthetic:true},'task-review');
   await tx.add('timesheet',{employeeId:'worker',periodStart:start,periodEnd:end,state:'APPROVED',payableSeconds:21601,paidActivities:['WORKING'],segmentSnapshot:[{id:'synthetic-time-segment',employeeId:'worker',siteId:'site',orderId:'order',taskId:'task',activity:'WORKING',startAt:start,endAt:end,seconds:21601}],synthetic:true},'timesheet');
   await tx.add('material',{sku:'QA-CONSUMABLE',name:'Synthetisches Reinigungsmittel',baseUnit:'ml',synthetic:true},'material');
   await tx.add('material_usage',{siteId:'site',taskId:'task',materialId:'material',quantityBase:1234,clientVisible:true,confirmedAt:'2026-10-01T10:00:00.000Z',internalCostCents:888888,synthetic:true},'material-usage');
   await tx.add('media_asset',{siteId:'site',orderId:'order',taskId:'task',visibility:'CLIENT_AFTER_APPROVAL',state:'APPROVED_FOR_CLIENT',clientBlobKey:'PRIVATE_CLIENT_BLOB_KEY',clientSha256:'a'.repeat(64),clientMimeType:'image/jpeg',clientByteSize:123,caption:'Synthetic approved photo',stage:'AFTER',uploadedAt:start,blobKey:'PRIVATE_ORIGINAL_BLOB_KEY',synthetic:true},'media');
   await tx.add('payroll_calculation',{employeeId:'worker',payableCents:777777,bank:'PRIVATE_PAYROLL_BANK',synthetic:true},'payroll');
  });
  [author,reviewer,accountant]=await Promise.all(['author','reviewer','accountant'].map(id=>engine.getActor(id,company)));
  report=await execute(author,'report.create',{siteId:'site',customerId:'customer',orderId:'order',periodStart:start,periodEnd:end,documentType:'Leistungsnachweis',taskIds:['task'],timesheetIds:['timesheet'],mediaIds:['media'],descriptionDe:'Synthetischer Leistungsnachweis zur Buchhalterprüfung. Keine echte Rechnung.'});
  version=await publish(report.id);
  const options={companyId:company,appMode:'TEST',publicOrigin:ORIGIN,encryptionKey:'SYNTHETIC_ACCOUNTING_AUTH_KEY_NOT_A_REAL_SECRET'};
  api=new ApiController({db,engine,...options,buildSha:'0'.repeat(40)});const auth=new AuthService(db,engine,options);
  session=await auth.createSession('accountant');viewerSession=await auth.createSession('viewer');externalSessions={};
  for(const role of ['CLIENT','CUSTOMER','EXTERNAL_BAULEITER','GUEST'])externalSessions[role]=await auth.createSession('external-'+role);
  await db.transaction(foreignCompany,'SYNTHETIC_FOREIGN_ACCOUNTING_FIXTURE',async tx=>{
   await tx.add('company',{legalName:'Unrelated synthetic company',address:'Synthetic foreign address',operatingMode:'TEST',synthetic:true},foreignCompany);
   await tx.add('user',{name:'Same-looking foreign accountant',roles:['ACCOUNTANT'],siteIds:['site'],active:true,synthetic:true},'accountant');
  });
  const foreignOptions={...options,companyId:foreignCompany};foreignApi=new ApiController({db,engine,...foreignOptions,buildSha:'0'.repeat(40)});
  foreignSession=await new AuthService(db,engine,foreignOptions).createSession('accountant');
 });
 afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();});
 afterAll(async()=>{await db?.close();});
 async function publish(reportId:string){
  await execute(reviewer,'report.review',{reportId,decision:'PASS',reason:'Separate synthetic accountant handoff source review'});
  await execute(reviewer,'report.approve',{reportId,reason:'Separate synthetic unchanged-source approval'});
  return execute(author,'report.publish',{reportId});
 }
 async function scopedReadDelegation(){
  await update('user','accountant',{siteIds:['other-site']});
  await update('user','author',{permissions:['role.manage']});
  await db.transaction(company,'SYNTHETIC_ACCOUNTING_DELEGATION_REVIEWER',tx=>tx.add('user',{name:'Independent synthetic delegation reviewer',roles:['OWNER'],active:true,siteIds:[],synthetic:true},'delegation-reviewer'));
  const grantor=await engine.getActor('author',company),approver=await engine.getActor('delegation-reviewer',company);approver.mfaVerified=true;
  const grant=await execute(grantor,'delegation.create',{granteeId:'accountant',permissions:['report.read'],siteIds:['site'],expiresAt:new Date(Date.now()+3600000).toISOString(),reason:'Synthetic read-only access to another accounting site'});
  const approved=await execute(approver,'delegation.approve',{delegationId:grant.id,confirmedHash:grant.data.previewHash,reason:'Independent synthetic scoped read review'});
  return {grant:approved,grantor};
 }
 async function download(id=version.id,using=session,controller=api){const transport=response();await controller.reportAccountingJson(request(using),transport.res,id);return {...transport,bytes:transport.read()};}
 async function fingerprint(){
  const result:Record<string,Data>={};
  for(const table of ['aggregates','aggregate_revisions','audit_log','command_receipts','outbox','auth_sessions','media_blobs']){
   result[table]=(await db.query(`SELECT count(*)::int AS count,md5(coalesce(string_agg(to_jsonb(r)::text,E'\n' ORDER BY to_jsonb(r)::text),'')) AS hash FROM ${table} r WHERE company_id=ANY($1::text[])`,[[company,foreignCompany]])).rows[0];
  }
  return result;
 }

 it('authenticated report-ID and version-ID downloads return canonical exact review data and content/source hashes without database effects',async()=>{
  const before=await fingerprint(),first=await download(),byReport=await download(report.id),repeated=await download();
  expect(byReport.bytes).toEqual(first.bytes);expect(repeated.bytes).toEqual(first.bytes);
  const text=first.bytes.toString('utf8'),payload=JSON.parse(text);expect(text.endsWith('\n')).toBe(true);expect(text.trim()).toBe(JSON.stringify(payload));expectCanonicalObject(payload);
  expect(payload).toMatchObject({format:'KNABA_ACCOUNTING_HANDOFF_V1',documentType:'ACCOUNTANT_REVIEW_DATA',legalInvoiceIssued:false,structuredInvoiceValidated:false,source:{companyId:company,reportId:report.id,reportVersionId:version.id,documentVersion:1,sourceSha256:version.data.sha256,previousReportVersionId:null},order:{id:'order',pricingModel:'FIXED',quoteId:'synthetic-quote',quoteVersion:3},performance:{language:'de',totalSeconds:21601,acceptedTasks:[{taskId:'task',quantityMilli:123456,unit:'M2',state:'ACCEPTED'}],materials:[{sku:'QA-CONSUMABLE',quantityBase:1234,unit:'ml',chargedSeparately:false}]},amounts:{currency:'EUR',unit:'EUR_CENT',initialAgreedNetCents:12000,approvedChangesNetCents:345,reportedNetCents:12345,reportedTaxCents:2346,reportedGrossCents:14691,reportPriceStatus:'FINAL'},readiness:{structuredInvoice:'NOT_READY',profileValidation:'NOT_RUN',accountantAcceptance:'NOT_RECORDED_BY_THIS_EXPORT'}});
  expect(first.headers).toMatchObject({'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'",'ETag':`"${createHash('sha256').update(first.bytes).digest('hex')}"`,'X-KNABA-Source-SHA256':version.data.sha256});
  expect(first.headers.ETag).not.toBe(`"${version.data.sha256}"`);
  expect(text).not.toMatch(/PRIVATE_|workerCode|sourceTimesheetId|employeeId|payroll|bank|clientBlobKey|mediaRows|internalCost/);
  expect(await fingerprint()).toEqual(before);
 });

 it('an exact old version stays byte-pinned after real revision and republication, while report-ID resolves the new source',async()=>{
  const original=await download();await execute(author,'report.revise',{reportId:report.id,descriptionDe:'Synthetisch korrigierter Leistungsnachweis zur Buchhalterprüfung.',reason:'Synthetic documented correction'});
  const second=await publish(report.id),old=await download(version.id),current=await download(report.id);
  expect(second.data.version).toBe(2);expect(second.data.previousVersionId).toBe(version.id);expect(old.bytes).toEqual(original.bytes);expect(old.headers.ETag).toBe(original.headers.ETag);
  expect(current.bytes).not.toEqual(original.bytes);expect(JSON.parse(current.bytes.toString())).toMatchObject({source:{reportVersionId:second.id,documentVersion:2,previousReportVersionId:version.id,sourceSha256:second.data.sha256},performance:{descriptionDe:'Synthetisch korrigierter Leistungsnachweis zur Buchhalterprüfung.'}});
  expect(current.headers['X-KNABA-Source-SHA256']).toBe(second.data.sha256);expect(await get('report_version',version.id)).toEqual(version);
 });

 it('report.read alone cannot export, and a same-looking foreign-company session reveals no source or creates effects',async()=>{
  expect((await engine.readEntities(await engine.getActor('viewer',company),'report_version')).map(row=>row.id)).toContain(version.id);
  const before=await fingerprint();
  for(const id of [version.id,report.id]){
   const denied=response();await expect(api.reportAccountingJson(request(viewerSession),denied.res,id)).rejects.toMatchObject({code:'ACCESS_DENIED'});expect(denied.sent).not.toHaveBeenCalled();
   const foreign=response();await expect(foreignApi.reportAccountingJson(request(foreignSession),foreign.res,id)).rejects.toMatchObject({code:'NOT_FOUND_SAFE'});expect(foreign.sent).not.toHaveBeenCalled();
  }
  await expect(download('missing-accounting-version')).rejects.toMatchObject({code:'NOT_FOUND_SAFE'});expect(await fingerprint()).toEqual(before);
 });

 it.each(['CLIENT','CUSTOMER','EXTERNAL_BAULEITER','GUEST'])('a %s role is excluded even with explicit export authority, customer access and a mixed accountant role',async role=>{
  const userId='external-'+role,using=externalSessions[role]!;
  for(const roles of [[role],['ACCOUNTANT',role]]){
   await update('user',userId,{roles,permissions:['report.read','report.export']});
   const fresh=await engine.getActor(userId,company);expect(fresh.permissions).toContain('report.export');
   expect((await engine.readEntities(fresh,'report_version')).map(row=>row.id)).toContain(version.id);
   const before=await fingerprint();for(const id of [version.id,report.id]){
    const denied=response();await expect(api.reportAccountingJson(request(using),denied.res,id)).rejects.toMatchObject({code:'ACCESS_DENIED'});expect(denied.sent).not.toHaveBeenCalled();
   }
   expect(await fingerprint()).toEqual(before);
  }
 });

 it('a valid governed report.read delegation makes site A readable without expanding the base accounting export scope on site B',async()=>{
  const delegated=await scopedReadDelegation();expect(delegated.grant.data.permissions).toEqual(['report.read']);
  await update('user','author',{siteIds:['site','other-site']});await update('user','reviewer',{siteIds:['site','other-site']});
  await update('customer_membership','membership-CLIENT',{siteIds:['site','other-site']});
  await db.transaction(company,'SYNTHETIC_SECOND_ACCOUNTING_CONTRACT',async tx=>{const order=await tx.get('order','order');await tx.add('order',{...order.data,siteId:'other-site'},'other-order');});
  const secondReport=await execute(author,'report.create',{siteId:'other-site',customerId:'customer',orderId:'other-order',periodStart:start,periodEnd:end,documentType:'Leistungsnachweis',descriptionDe:'Synthetischer Leistungsnachweis für die zweite freigegebene Buchhaltungsbaustelle.'});
  const secondVersion=await publish(secondReport.id),fresh=await engine.getActor('accountant',company);
  expect(engine.scope(fresh,'report.read').siteIds.sort()).toEqual(['other-site','site']);expect(engine.scope(fresh,'report.export').siteIds).toEqual(['other-site']);
  expect((await engine.readEntities(fresh,'report_version')).map(row=>row.id).sort()).toEqual([version.id,secondVersion.id].sort());
  const before=await fingerprint();for(const id of [version.id,report.id]){
   const denied=response();await expect(api.reportAccountingJson(request(session),denied.res,id)).rejects.toMatchObject({code:'ACCESS_DENIED'});expect(denied.sent).not.toHaveBeenCalled();expect(denied.headers).toEqual({});
  }
  for(const id of [secondVersion.id,secondReport.id])expect(JSON.parse((await download(id)).bytes.toString())).toMatchObject({source:{reportVersionId:secondVersion.id},site:{id:'other-site'}});
  expect(await fingerprint()).toEqual(before);expect((await get('user','accountant')).data.siteIds).toEqual(['other-site']);
 });

 it.each(['REVOKED','EXPIRED'] as const)('a valid read delegation %s after genuine authentication removes its site from the accounting serving transaction',async state=>{
  const {grant,grantor}=await scopedReadDelegation(),authenticate=AuthService.prototype.authenticate;let changed=false;
  vi.spyOn(AuthService.prototype,'authenticate').mockImplementation(async function(this:AuthService,req:Request,guest?:boolean){
   const auth=await authenticate.call(this,req,guest);
   if(!changed){changed=true;expect((await engine.readEntities(auth.actor,'report_version')).map(row=>row.id)).toContain(version.id);
    if(state==='REVOKED')await execute(grantor,'delegation.revoke',{delegationId:grant.id,reason:'Synthetic in-flight read delegation revocation'});
    else{vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(Date.now()+3600001);}
   }
   return auth;
  });
  const denied=response();await expect(api.reportAccountingJson(request(session),denied.res,version.id)).rejects.toMatchObject({code:'NOT_FOUND_SAFE'});
  expect(changed).toBe(true);expect(denied.sent).not.toHaveBeenCalled();expect(denied.headers).toEqual({});
  const fresh=await engine.getActor('accountant',company);expect(engine.scope(fresh,'report.read').siteIds).toEqual(['other-site']);expect(engine.scope(fresh,'report.export').siteIds).toEqual(['other-site']);
  expect(await get('report_version',version.id)).toEqual(version);expect((await db.transaction(company,'SYNTHETIC_ACCOUNTING_DELEGATION_ARTIFACT_ASSERT',tx=>tx.list('report_artifact')))).toEqual([]);
 });

 it('a service account remains excluded even with explicit report export/site authority and a mixed accountant role',async()=>{
  await db.transaction(company,'SYNTHETIC_ACCOUNTING_SERVICE_ACCOUNT',tx=>tx.add('user',{name:'Synthetic service transport',roles:['SERVICE_ACCOUNT'],permissions:['report.read','report.export'],siteIds:['site'],active:true,synthetic:true},'accounting-service'));
  const options={companyId:company,appMode:'TEST',publicOrigin:ORIGIN},using=await new AuthService(db,engine,options).createSession('accounting-service');
  for(const roles of [['SERVICE_ACCOUNT'],['ACCOUNTANT','SERVICE_ACCOUNT']]){
   await update('user','accounting-service',{roles});const fresh=await engine.getActor('accounting-service',company);
   expect(fresh.permissions).toContain('report.export');expect((await engine.readEntities(fresh,'report_version')).map(row=>row.id)).toContain(version.id);
   const before=await fingerprint();for(const id of [version.id,report.id]){
    const denied=response();await expect(api.reportAccountingJson(request(using),denied.res,id)).rejects.toMatchObject({code:'ACCESS_DENIED'});expect(denied.sent).not.toHaveBeenCalled();expect(denied.headers).toEqual({});
   }
   expect(await fingerprint()).toEqual(before);
  }
 });

 it.each(['permission','site','mixed-role','disabled'] as const)('a genuine %s revocation committed after authentication closes the serving transaction before bytes or headers',async change=>{
  const authenticate=AuthService.prototype.authenticate;let changed=false;
  // Authentication and the administrative update are real SQL operations; this
  // hook only fixes the order of the otherwise nondeterministic request race.
  vi.spyOn(AuthService.prototype,'authenticate').mockImplementation(async function(this:AuthService,req:Request,guest?:boolean){
   const auth=await authenticate.call(this,req,guest);expect(auth.actor.permissions).toContain('report.export');
   if(!changed){changed=true;await update('user','accountant',change==='permission'?{roles:['QUALITY_CONTROL'],permissions:['report.read']}:change==='site'?{siteIds:[]}:change==='mixed-role'?{roles:['ACCOUNTANT','CLIENT']}:{active:false});
    if(change==='mixed-role')await db.transaction(company,'SYNTHETIC_ACCOUNTING_MIXED_ROLE_MEMBERSHIP',tx=>tx.add('customer_membership',{userId:'accountant',customerId:'customer',siteIds:['site'],permissions:['VIEW'],active:true,synthetic:true},'mixed-accountant-membership'));
   }
   return auth;
  });
  const denied=response();await expect(api.reportAccountingJson(request(session),denied.res,version.id)).rejects.toMatchObject({code:change==='site'?'NOT_FOUND_SAFE':'ACCESS_DENIED'});
  expect(changed).toBe(true);expect(denied.sent).not.toHaveBeenCalled();expect(denied.headers).toEqual({});
  expect((await db.transaction(company,'SYNTHETIC_ACCOUNTING_NO_ARTIFACT_ASSERT',tx=>tx.list('report_artifact')))).toEqual([]);
  expect(await get('report_version',version.id)).toEqual(version);expect(accountant.permissions).toContain('report.export');
 });

 it('a corrupt stored snapshot checksum and an unpublished version both refuse export without writes',async()=>{
  const corrupt=await db.transaction(company,'SYNTHETIC_CORRUPT_ACCOUNTING_FIXTURE',async tx=>{
   const changed=structuredClone(version.data);changed.snapshot.descriptionDe='CORRUPT_SOURCE_MUST_NOT_LEAK';
   const tampered=await tx.add('report_version',changed,'corrupt-accounting-version');
   const draft=await tx.add('report_version',{...version.data,immutable:false,publishedAt:undefined},'unpublished-accounting-version');return [tampered,draft];
  });
  const before=await fingerprint();for(const record of corrupt){
   const denied=response();await expect(api.reportAccountingJson(request(session),denied.res,record.id)).rejects.toMatchObject({code:'INVALID_STATE'});expect(denied.sent).not.toHaveBeenCalled();expect(denied.headers).toEqual({});
  }
  expect(await fingerprint()).toEqual(before);expect((await download()).headers['X-KNABA-Source-SHA256']).toBe(version.data.sha256);
 });

 it('a checksum-valid source with nested private extras exports only allowed review data and a safe attachment filename',async()=>{
  const dirty=structuredClone(version.data);dirty.payroll='PRIVATE_ENVELOPE_PAYROLL';dirty.snapshot.payroll='PRIVATE_SNAPSHOT_PAYROLL';
  dirty.snapshot.company.secret='PRIVATE_COMPANY_SECRET';dirty.snapshot.customer.bank='PRIVATE_CUSTOMER_BANK';
  dirty.snapshot.site.gps='PRIVATE_SITE_GPS';dirty.snapshot.order.margin='PRIVATE_ORDER_MARGIN';
  dirty.snapshot.company.address={street:'PRIVATE_STRUCTURED_ADDRESS',privateKey:'PRIVATE_ADDRESS_SECRET'};
  dirty.snapshot.taskRows[0].employeeIds=['PRIVATE_TASK_EMPLOYEE'];dirty.snapshot.hoursRows[0].payroll='PRIVATE_HOURS_PAYROLL';
  dirty.snapshot.materialRows[0].internalCostCents=87654321;dirty.snapshot.mediaRows[0].blobKey='PRIVATE_EXTRA_BLOB';
  dirty.sha256=reportSnapshotHash(dirty.snapshot);
  const hostileId='../../accounting-"\r\nsource-ü';
  const record=await db.transaction(company,'SYNTHETIC_PRIVATE_ACCOUNTING_FIXTURE',tx=>tx.add('report_version',dirty,hostileId));
  const before=await fingerprint(),result=await download(record.id),text=result.bytes.toString(),payload=JSON.parse(text);
  expect(text).not.toMatch(/PRIVATE_|payroll|bank|gps|margin|employeeIds|workerCode|sourceTimesheetId|clientBlobKey|mediaRows|internalCost|87654321/);
  expect(payload.parties.company.addressText).toBeNull();expect(payload.readiness.findings).toContainEqual({code:'ADDRESS_TEXT_UNAVAILABLE',prerequisiteId:'EXT-01',field:'company.addressText'});
  expect(payload.performance.totalSeconds).toBe(21601);expect(payload.source.sourceSha256).toBe(dirty.sha256);
  const disposition=result.headers['Content-Disposition']!;expect(disposition).toMatch(/^attachment; filename="[A-Za-z0-9_-]+\.json"$/);expect(disposition).not.toMatch(/[\r\n/ü]/);
  expect(result.headers['X-KNABA-Source-SHA256']).toBe(record.data.sha256);expect(await fingerprint()).toEqual(before);
 });
});
