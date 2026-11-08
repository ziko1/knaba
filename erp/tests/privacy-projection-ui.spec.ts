import {test,expect,type Page,type Locator} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {translator,type Language} from '../packages/i18n/index.ts';
import type {Entity,Command} from '../apps/web/src/api.ts';

// Actual current rendered ERP build with explicitly synthetic HTTP responses.
// PostgreSQL ownership, legal approval and download authority are separate gates.
// No worker or unhandled request may reach a provider or a live ERP service.
test.use({serviceWorkers:'block'});
const origin='https://privacy.browser.invalid',company='privacy-browser-company',user='privacy-browser-user',csrf='synthetic-privacy-csrf';
const v1='knaba-dsar-v1',v2='knaba-dsar-v2',now='2026-11-08T10:00:00.000Z',sha='a'.repeat(64);
const id=(n:number)=>`20000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const observed=new WeakMap<Page,{unexpected:string[];pageErrors:string[]}>();
test.afterEach(async({page})=>{
 const result=observed.get(page);expect(result?.unexpected??[],'Only the explicit synthetic origin/API/static inventory is allowed.').toEqual([]);
 expect(result?.pageErrors??[],'The actual rendered application must not throw.').toEqual([]);
});
const deferred=()=>{let resolve!:()=>void;const promise=new Promise<void>(done=>{resolve=done;});return {promise,resolve};};
type Hold={entered:ReturnType<typeof deferred>;release:ReturnType<typeof deferred>;finished:ReturnType<typeof deferred>};
function requestRow(n:number,version:string|null=v2,patch:Record<string,unknown>={}):Entity{
 return {id:id(n),kind:'privacy_request',version:1,createdAt:now,updatedAt:now,data:{type:'ACCESS',categories:['PROFILE'],reason:'Synthetic own privacy request '+n,subjectUserId:user,state:'APPROVED_EXPORT',requestedAt:now,sourceDataDeleted:false,...(version!==null?{projectionVersion:version}:{}),...patch}};
}
function artifactRow(n:number,request:Entity,{legacy=false,snapshotVersion}: {legacy?:boolean;snapshotVersion?:string}={}):Entity{
 const version=request.data.projectionVersion??v1;
 const snapshot={subjectUserId:user,categories:request.data.categories,createdAt:now,scope:'MINIMIZED_SELF_DATA_EXPORT',fullLegalDsarFulfillment:false,
  ...(!legacy?{projectionVersion:snapshotVersion??version}:{}),...(version===v2?{companyId:company,federationMetadata:{version:'knaba-federation-self-metadata-v1',capturedAt:now,scope:'ERP_STORED_METADATA',bindings:[],linkAttempts:[],loginAttempts:[],derivedSessions:[],sourceSessionSummary:[],retentionDispositions:[]}}:{})};
 return {id:id(n),kind:'privacy_export',version:1,createdAt:now,updatedAt:now,data:{requestId:request.id,subjectUserId:user,immutable:true,snapshot,sha256:sha,byteSize:321,fileName:`KNABA-DE-own-data-${request.id}.json`,...(!legacy?{projectionVersion:version}:{})}};
}
function definitions(legacy:boolean,reviewer:boolean):Command[]{
 const text={type:'string'};
 const items:Command[]=[
  {name:'privacy.request',permission:'identity.self',schema:{type:'object',properties:{type:{type:'string',enum:['ACCESS','ERASURE']},categories:{type:'array',items:{type:'string',enum:['PROFILE','TIME','PAYROLL','MESSAGES','MEDIA']},minItems:1,maxItems:5},reason:{type:'string',minLength:3,maxLength:2000},...(!legacy?{projectionVersion:{type:'string',enum:[v1,v2]}}:{})},required:['type','categories','reason']}},
  {name:'privacy.export',permission:'identity.self',schema:{type:'object',properties:{requestId:text},required:['requestId']}},
  {name:'privacy.status',permission:'identity.self',schema:{type:'object',properties:{requestId:text},required:['requestId']}}
 ];
 if(reviewer)items.push({name:'privacy.review',permission:'privacy.review',highRisk:true,schema:{type:'object',properties:{requestId:text,decision:{type:'string',enum:['APPROVE_EXPORT','REFER_ERASURE','RETAIN','REJECT']},legalApprovalId:text,evidenceReference:{type:'string',minLength:8},reason:{type:'string',minLength:3}},required:['requestId','decision','legalApprovalId','evidenceReference','reason']}});
 return items;
}
async function fixture(page:Page,{legacy=false,requests=[] as Entity[],exports=[] as Entity[],reviewer=false}={}){
 const unexpected:string[]=[],pageErrors:string[]=[],calls:Array<{name:string;body:any;raw:string;csrf:string;origin:string}>=[];
 const rows=structuredClone(requests),artifacts=structuredClone(exports),receipts=new Map<string,unknown>();
 let catalogLegacy=legacy,catalogReads=0,dropRequest=false,dropExport=false,mismatchExport=false,denyRequest=false,heldRequest:Hold|undefined;
 observed.set(page,{unexpected,pageErrors});page.on('pageerror',error=>pageErrors.push(error.message));
 await page.addInitScript(()=>localStorage.setItem('knaba-language','EN'));
 await page.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname,get=req.method()==='GET',post=req.method()==='POST';
  if(url.origin===origin&&path.startsWith('/api/v1/')){
   if(get&&path==='/api/v1/me'){await route.fulfill({json:{actor:{companyId:company,userId:user,roles:[reviewer?'OWNER':'EMPLOYEE'],permissions:['identity.self',...(reviewer?['privacy.review','scope.company']:[])],siteIds:[],warehouseIds:[],customerIds:[]},user:{id:user,name:'Synthetic privacy account'},csrfToken:csrf,mode:'TEST'}});return;}
   if(get&&path==='/api/v1/public/config'){await route.fulfill({json:{mode:'TEST',services:[],legal:{}}});return;}
   if(get&&path==='/api/v1/auth/federation/config'){await route.fulfill({json:{enabled:false}});return;}
   if(get&&path==='/api/v1/commands'&&!url.search){catalogReads++;await route.fulfill({json:{items:definitions(catalogLegacy,reviewer)}});return;}
   if(get&&/^\/api\/v1\/entities\/[a-z_]+$/.test(path)&&url.search==='?limit=100'){
    const kind=path.split('/').at(-1);await route.fulfill({json:{items:kind==='privacy_request'?rows:kind==='privacy_export'?artifacts:[],has_more:false,next_cursor:null}});return;
   }
   if(get&&path==='/api/v1/dashboard'){await route.fulfill({json:{counts:{},integrationStatus:{}}});return;}
   if(get&&path==='/api/v1/audit'){await route.fulfill({json:{items:[]}});return;}
   if(get&&path==='/api/v1/events'){await route.fulfill({contentType:'text/event-stream',body:': explicit synthetic privacy fixture\n\n'});return;}
   if(post&&!url.search&&/^\/api\/v1\/commands\/privacy\.(request|export|status|review)$/.test(path)){
    const headers=await req.allHeaders(),name=path.split('/').at(-1)!,body=req.postDataJSON();
    const call={name,body,raw:req.postData()??'',csrf:headers['x-csrf-token']??'',origin:headers.origin??''};calls.push(call);
    expect(call.csrf).toBe(csrf);expect(call.origin).toBe(origin);expect(body.idempotency_key).toMatch(/^[0-9a-f-]{36}$/);
    if(name==='privacy.request'){
     if(denyRequest){await route.fulfill({status:401,json:{code:'NEEDS_REAUTH'}});return;}
     const receiptKey=name+':'+body.idempotency_key;
     if(!receipts.has(receiptKey)){
      const row=requestRow(100+rows.length,null,{...body.input,reason:body.input.reason.trim(),subjectUserId:user,state:'REQUESTED'});rows.push(row);receipts.set(receiptKey,row);
     }
     const held=heldRequest;heldRequest=undefined;if(held){held.entered.resolve();await held.release.promise;}
     try{if(dropRequest){dropRequest=false;await route.fulfill({status:201,contentType:'application/json',body:'{'});}else await route.fulfill({status:201,json:receipts.get(receiptKey)});}finally{held?.finished.resolve();}return;
    }
    if(name==='privacy.export'){
     expect(Object.keys(body.input)).toEqual(['requestId']);const request=rows.find(row=>row.id===body.input.requestId);expect(request).toBeDefined();
     const receiptKey=name+':'+body.idempotency_key;
     if(!receipts.has(receiptKey)){
      const artifact=artifactRow(500+artifacts.length,request!);artifacts.push(artifact);
      receipts.set(receiptKey,{exportId:artifact.id,fileName:artifact.data.fileName,sha256:artifact.data.sha256,byteSize:artifact.data.byteSize,status:'PRIVATE_JSON_ARTIFACT_READY',securedDownloadRequired:true,...(request!.data.projectionVersion===v2?{projectionVersion:v2}:{})});
     }
     if(dropExport){dropExport=false;await route.fulfill({status:201,contentType:'application/json',body:'{'});return;}
     const ack=receipts.get(receiptKey) as Record<string,unknown>;await route.fulfill({status:201,json:mismatchExport?{...ack,projectionVersion:v1}:ack});return;
    }
    if(name==='privacy.status'){
     const request=rows.find(row=>row.id===body.input.requestId)!;expect(request).toBeDefined();
     await route.fulfill({status:201,json:{requestId:request.id,type:request.data.type,categories:request.data.categories,state:request.data.state,sourceDataDeleted:false,liveSourceStatus:null,externalCopiesStatus:'NOT_VERIFIED',requestFulfilled:false,requestedAt:request.data.requestedAt,reviewedAt:null,...(Object.hasOwn(request.data,'projectionVersion')?{projectionVersion:request.data.projectionVersion}:{})}});return;
    }
    expect(reviewer).toBe(true);await route.fulfill({status:409,json:{code:'VERSION_CONFLICT'}});return;
   }
  }
  if(url.origin===origin&&get&&!url.search){
   const pagePath=path==='/console',asset=/^\/assets\/[A-Za-z0-9_.-]+$/.test(path)||['/icon.svg','/icon-maskable.svg','/manifest.webmanifest','/sw.js','/favicon.ico'].includes(path);
   if(pagePath||asset){
    const file=resolve(process.cwd(),'dist/web',pagePath?'index.html':path.slice(1));
    try{await route.fulfill({body:await readFile(file),contentType:pagePath?'text/html':({'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webmanifest':'application/manifest+json','.ico':'image/x-icon'} as Record<string,string>)[extname(file)]??'application/octet-stream',headers:{'Cache-Control':'no-store'}});}catch{unexpected.push('Missing current built asset '+path);await route.abort('failed');}return;
   }
  }
  unexpected.push(req.method()+' '+url.origin+path+url.search);await route.abort('blockedbyclient');
 });
 await page.goto(origin+'/console');await page.getByRole('navigation').getByRole('button',{name:'Privacy & security',exact:true}).click();
 await expect(page.locator('.privacy-page').getByRole('button',{name:'New request',exact:true})).toBeVisible();
 if(requests.length)await expect(page.locator('.privacy-request-card,.privacy-review-row')).toHaveCount(requests.length);
 return {calls,rows,artifacts,catalogReads:()=>catalogReads,downgrade:()=>{catalogLegacy=true;},dropRequest:()=>{dropRequest=true;},dropExport:()=>{dropExport=true;},mismatchExport:()=>{mismatchExport=true;},denyRequest:()=>{denyRequest=true;},holdRequest:()=>heldRequest={entered:deferred(),release:deferred(),finished:deferred()}};
}
async function newRequest(page:Page,version=v2,reason='Synthetic request reason'){
 await page.locator('.privacy-page').getByRole('button',{name:'New request',exact:true}).click();const dialog=page.getByRole('dialog',{name:'New request',exact:true});
 await dialog.getByLabel('Export contents',{exact:true}).selectOption(version);await dialog.locator('#privacy-reason').fill(reason);return dialog;
}
async function preview(dialog:Locator){await dialog.getByRole('button',{name:'Preview',exact:true}).click();}
async function openExport(page:Page){await page.locator('.privacy-page').getByRole('button',{name:'Prepare export',exact:true}).click();return page.getByRole('dialog',{name:'Prepare export',exact:true});}
async function frames(page:Page){await page.evaluate(()=>new Promise<void>(done=>requestAnimationFrame(()=>requestAnimationFrame(()=>done()))));}
const en=translator('EN');

test('Privacy HTTP fixture: explicit extended scope, normalized review and exact own request payload',async({page},info)=>{
 info.annotations.push({type:'transport-fixture',description:'Actual rendered ERP UI; synthetic HTTP only. No PostgreSQL, real DSAR or live acceptance is inferred.'});
 const f=await fixture(page),dialog=await newRequest(page,v2,'  Synthetic private reason with outer spaces  ');
 await expect(dialog).toContainText(en('privacyProjectionExtendedScope'));await expect(dialog).toContainText(en('privacyProjectionOmissions'));await preview(dialog);
 await expect(dialog).toContainText('Synthetic private reason with outer spaces');await expect(dialog).toContainText(en('privacyProjectionStoredFacts'));
 await dialog.getByRole('button',{name:en('submit'),exact:true}).click();await expect(dialog).toContainText('Request recorded');
 expect(f.calls).toHaveLength(1);expect(f.calls[0].body.input).toEqual({type:'ACCESS',categories:['PROFILE'],reason:'Synthetic private reason with outer spaces',projectionVersion:v2});expect(f.calls[0].body).not.toHaveProperty('expected_version');expect(f.catalogReads()).toBeGreaterThanOrEqual(2);
 expect(await page.evaluate(()=>JSON.stringify({local:{...localStorage},session:{...sessionStorage}}))).not.toContain('Synthetic private reason');
});
test('Privacy HTTP fixture: legacy catalog and erasure preserve an absent projection version',async({page})=>{
 const f=await fixture(page,{legacy:true}),dialog=await newRequest(page,v1);await expect(dialog.locator('#privacy-projection option')).toHaveCount(1);await preview(dialog);await dialog.getByRole('button',{name:en('submit'),exact:true}).click();await expect(dialog).toContainText('Request recorded');await page.keyboard.press('Escape');
 const erasure=await newRequest(page,v1,'Synthetic erasure reason');await erasure.locator('#privacy-request-type').selectOption('ERASURE');await expect(erasure.locator('#privacy-projection')).toHaveCount(0);await preview(erasure);await erasure.getByRole('button',{name:en('submit'),exact:true}).click();await expect(erasure).toContainText('Request recorded');
 expect(f.calls).toHaveLength(2);expect(f.calls[0].body.input).toEqual({type:'ACCESS',categories:['PROFILE'],reason:'Synthetic request reason'});expect(f.calls[1].body.input).toEqual({type:'ERASURE',categories:['PROFILE'],reason:'Synthetic erasure reason'});
});
test('Privacy HTTP fixture: unknown request acknowledgement retries the identical reviewed body and key',async({page})=>{
 const f=await fixture(page);f.dropRequest();const dialog=await newRequest(page);await preview(dialog);await dialog.getByRole('button',{name:en('submit'),exact:true}).click();
 await expect(dialog).toContainText(en('privacyUnknownOutcome'));await expect(dialog.getByRole('heading',{name:'Request recorded',exact:true})).toHaveCount(0);expect(f.calls).toHaveLength(1);
 await dialog.getByRole('button',{name:en('privacyRetrySameRequest'),exact:true}).click();await expect(dialog).toContainText('Request recorded');expect(f.calls).toHaveLength(2);expect(f.calls[1].raw).toBe(f.calls[0].raw);expect(f.rows).toHaveLength(1);
});
test('Privacy HTTP fixture: catalog downgrade blocks the reviewed version until an explicit new choice',async({page})=>{
 const f=await fixture(page),dialog=await newRequest(page);await preview(dialog);f.downgrade();await dialog.getByRole('button',{name:en('submit'),exact:true}).click();
 await expect(dialog.getByRole('alert')).toContainText(en('privacyBlock_PRIVACY_PROJECTION_UNAVAILABLE'));expect(f.calls).toHaveLength(0);await dialog.getByRole('button',{name:en('back'),exact:true}).click();
 await expect(dialog.locator('#privacy-projection')).toHaveValue(v2);await expect(dialog.locator('#privacy-projection option[value="'+v2+'"]')).toBeDisabled();await expect(dialog.getByRole('button',{name:'Preview',exact:true})).toBeDisabled();
 await dialog.locator('#privacy-projection').selectOption(v1);await preview(dialog);await dialog.getByRole('button',{name:en('submit'),exact:true}).click();await expect(dialog).toContainText('Request recorded');expect(f.calls).toHaveLength(1);expect(f.calls[0].body.input).not.toHaveProperty('projectionVersion');
});
test('Privacy HTTP fixture: lost export acknowledgement keeps one key and shows a download only after matching ACK',async({page})=>{
 const f=await fixture(page,{requests:[requestRow(1)]});f.dropExport();const dialog=await openExport(page);await dialog.getByRole('button',{name:en('confirm'),exact:true}).click();
 await expect(dialog).toContainText(en('privacyUnknownOutcome'));await expect(dialog.getByRole('link',{name:en('privacyDownload'),exact:true})).toHaveCount(0);
 await dialog.getByRole('button',{name:en('privacyRetrySameRequest'),exact:true}).click();await expect(dialog).toContainText('Private export created');await expect(dialog.getByRole('link',{name:en('privacyDownload'),exact:true})).toHaveAttribute('href',`/api/v1/privacy/exports/${id(500)}/download`);
 expect(f.calls).toHaveLength(2);expect(f.calls[1].raw).toBe(f.calls[0].raw);expect(f.calls[0].body.input).toEqual({requestId:id(1)});expect(f.artifacts).toHaveLength(1);
});
test('Privacy HTTP fixture: a prepare ACK for a different version cannot enable a download',async({page})=>{
 const f=await fixture(page,{requests:[requestRow(1)]});f.mismatchExport();const dialog=await openExport(page);await dialog.getByRole('button',{name:en('confirm'),exact:true}).click();
 await expect(dialog.getByRole('alert')).toContainText(en('privacyBlock_PRIVACY_EXPORT_SCOPE_MISMATCH'));await expect(dialog.getByRole('heading',{name:'Private export created',exact:true})).toHaveCount(0);await expect(dialog.getByRole('link')).toHaveCount(0);expect(f.calls).toHaveLength(1);
});
test('Privacy HTTP fixture: saved legacy and extended artifacts require matching request and snapshot scope',async({page})=>{
 const legacy=requestRow(1,null),extended=requestRow(2),mismatched=requestRow(3);
 const f=await fixture(page,{requests:[legacy,extended,mismatched],exports:[artifactRow(11,legacy,{legacy:true}),artifactRow(12,extended),artifactRow(13,mismatched,{snapshotVersion:v1})]});
 const cards=page.locator('.privacy-request-card'),legacyCard=cards.filter({hasText:legacy.data.reason}),extendedCard=cards.filter({hasText:extended.data.reason}),invalidCard=cards.filter({hasText:mismatched.data.reason});
 await expect(legacyCard.getByRole('link',{name:en('privacyDownload'),exact:true})).toHaveAttribute('href',`/api/v1/privacy/exports/${id(11)}/download`);await expect(extendedCard.getByRole('link',{name:en('privacyDownload'),exact:true})).toHaveAttribute('href',`/api/v1/privacy/exports/${id(12)}/download`);
 await expect(invalidCard.getByRole('alert')).toContainText(en('privacyBlock_PRIVACY_EXPORT_SCOPE_MISMATCH'));await expect(invalidCard.getByRole('link')).toHaveCount(0);await expect(cards.getByRole('link',{name:en('privacyDownload'),exact:true})).toHaveCount(2);expect(f.calls).toHaveLength(0);
});
test('Privacy HTTP fixture: an old committed request ACK cannot repopulate a closed and reopened form',async({page})=>{
 const f=await fixture(page),held=f.holdRequest(),old=await newRequest(page,v2,'Synthetic previous private reason');await preview(old);await old.getByRole('button',{name:en('submit'),exact:true}).click();await held.entered.promise;
 try{await page.keyboard.press('Escape');const current=await newRequest(page,v1,'Synthetic current private reason');held.release.resolve();await held.finished.promise;await frames(page);
  await expect(current.locator('#privacy-reason')).toHaveValue('Synthetic current private reason');await expect(current.locator('#privacy-projection')).toHaveValue(v1);await expect(current.getByRole('heading',{name:'Request recorded',exact:true})).toHaveCount(0);await expect(current).not.toContainText('Synthetic previous private reason');expect(f.calls).toHaveLength(1);
 }finally{held.release.resolve();}
});
test('Privacy HTTP fixture: exact-session rejection clears the private workspace without automatic logout',async({page})=>{
 const f=await fixture(page);f.denyRequest();const dialog=await newRequest(page,v2,'Synthetic private reason before revocation');await preview(dialog);await dialog.getByRole('button',{name:en('submit'),exact:true}).click();
 await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.locator('.startup[role="alert"]')).toContainText(en('signInRequired'));await expect(page.locator('.privacy-page')).toHaveCount(0);await expect(page.getByText('Synthetic private reason before revocation',{exact:true})).toHaveCount(0);expect(f.calls).toHaveLength(1);
});
test('Privacy HTTP fixture: review keeps the displayed request version and surfaces a concurrent conflict',async({page})=>{
 const request={...requestRow(1,v2,{subjectUserId:'synthetic-other-user',state:'REQUESTED'}),version:7},f=await fixture(page,{requests:[request],reviewer:true});
 const row=page.locator('.privacy-review-row');await expect(row).toContainText(en('privacyProjectionExtended'));await row.getByRole('button',{name:en('review'),exact:true}).click();const dialog=page.getByRole('dialog');
 await dialog.locator('#field-decision').selectOption('APPROVE_EXPORT');await dialog.locator('#field-legalApprovalId').fill('synthetic-legal-approval');await dialog.locator('#field-evidenceReference').fill('synthetic-review-evidence');await dialog.locator('#field-reason').fill('Synthetic independent review');await preview(dialog);await dialog.getByRole('button',{name:en('confirm'),exact:true}).click();
 await expect(dialog.getByRole('alert')).toContainText(en('conflict'));expect(f.calls).toHaveLength(1);expect(f.calls[0].body.expected_version).toBe(7);expect(f.calls[0].body.input).toEqual({requestId:request.id,decision:'APPROVE_EXPORT',legalApprovalId:'synthetic-legal-approval',evidenceReference:'synthetic-review-evidence',reason:'Synthetic independent review'});
});
test('Privacy HTTP fixture: all six localized scopes remain readable in a narrow keyboard-dismissible dialog',async({page})=>{
 const f=await fixture(page);
 for(const language of ['DE','UK','RU','PL','LT','EN'] as Language[]){
  const t=translator(language);await page.setViewportSize({width:1440,height:1000});await page.locator('.topbar .language-select select').selectOption(language);
  await page.locator('.privacy-page').getByRole('button',{name:t('privacyNewRequest'),exact:true}).click();const dialog=page.getByRole('dialog',{name:t('privacyNewRequest'),exact:true});await dialog.getByLabel(t('privacyProjectionChoice'),{exact:true}).selectOption(v2);
  await page.setViewportSize({width:390,height:844});await expect(dialog).toContainText(t('privacyProjectionExtendedScope'));await expect(dialog).toContainText(t('privacyProjectionOmissions'));await expect(dialog.locator('#privacy-reason')).toHaveAccessibleName(new RegExp(t('reason')));
  expect(await dialog.evaluate(element=>element.scrollWidth<=element.clientWidth+1)).toBe(true);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
  await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
 }
 expect(f.calls).toHaveLength(0);
});
