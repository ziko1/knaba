import {Database} from '../apps/api/database.ts';
import {Engine} from '../apps/api/engine.ts';
import {ROLE_PERMISSIONS} from '../packages/domain/permissions.ts';
import {identityCommands} from '../packages/domain/identity.ts';
import {hashPassword} from '../apps/api/auth.ts';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {PostgresPrivateBlobStore} from '../packages/storage/index.ts';
export async function seed(db:Database,companyId='knaba-demo'){
 if(!['DEMO','TEST'].includes(process.env.APP_MODE??'DEMO'))throw new Error('SEED_REQUIRES_EXPLICIT_DEMO_TEST');
 const permissions=[...new Set([...Object.values(ROLE_PERMISSIONS).flat(),...Object.values(new Engine(db).registry).map(d=>d.permission),...Object.values(identityCommands).map(d=>d.permission),'scope.company'])].filter(p=>p!=='integration.process'&&p!=='automation.execute');
 const passwordHash=await hashPassword('KNABA synthetic local demo password');
 await db.transaction(companyId,'SYNTHETIC_SEED',async tx=>{
 if((await tx.list('company')).length)return;
 await tx.add('company',{name:'KNABA DE',operatingMode:'DEMO',synthetic:true,legalName:'KNABA DE — synthetische Testfirma',address:'Synthetische Testadresse, Deutschland',timezone:'Europe/Berlin',currency:'EUR'},companyId);
 const users=[['demo-owner','OWNER','Systeminhaber'],['demo-director','DIRECTOR','Direktor'],['demo-foreman','INTERNAL_BAULEITER','Bauleiter'],['demo-employee','EMPLOYEE','Mitarbeiter'],['demo-warehouse','STOREKEEPER','Lager'],['demo-accountant','ACCOUNTANT','Buchhaltung'],['demo-procurement','PROCUREMENT','Einkauf'],['demo-client','CLIENT','Testkunde'],['demo-qc','QUALITY_CONTROL','Qualitätskontrolle'],['demo-approver','DIRECTOR','Zweiter Prüfer']];
 for(const [id,role,name]of users){await tx.add('user',{name,email:`${id}@example.invalid`,roles:[role],permissions:role==='OWNER'||id==='demo-director'||id==='demo-approver'?permissions:ROLE_PERMISSIONS[role],siteIds:role==='CLIENT'?[]:['site-a','site-b'],warehouseIds:role==='STOREKEEPER'||role==='PROCUREMENT'?['warehouse-main']:[],customerIds:role==='CLIENT'?['customer-demo']:[],active:true,synthetic:true,demo:true,language:role==='EMPLOYEE'?'UK':'DE',businessCode:id.toUpperCase()},id);await tx.query('INSERT INTO auth_credentials(user_id,company_id,password_hash) VALUES($1,$2,$3)',[id,companyId,passwordHash]);if(!['CLIENT','STOREKEEPER','PROCUREMENT','ACCOUNTANT'].includes(role))await tx.add('employee',{userId:id,active:true,skills:[],absences:[],synthetic:true},`employee-${id}`);}
 await tx.add('contact_identity',{userId:'demo-client',verified:true,synthetic:true},'contact-client');
 await tx.add('customer',{name:'Musterkunde GmbH — DEMO',active:true,synthetic:true,businessType:'B2B'},'customer-demo');
 await tx.add('customer_membership',{userId:'demo-client',customerId:'customer-demo',siteIds:['site-a'],permissions:['VIEW','ACCEPT_QUOTE','ACCEPT_CHANGE','REPORT_ACK'],active:true,canAcceptQuotes:true,canAcknowledgeReports:true,synthetic:true},'membership-client');
 for(const [id,code,name]of [['site-a','KNB-014','Baustelle Haus A & B'],['site-b','KNB-021','Regelmäßige Reinigung']])await tx.add('site',{code,name,address:'Synthetische Testadresse — kein echter Auftrag',customerId:'customer-demo',active:true,timezone:'Europe/Berlin'},id);
 const locationData=[['haus-a',null,'BUILDING','Haus A','Haus A'],['floor-eg','haus-a','FLOOR','EG','Eingangsebene'],['floor-3','haus-a','FLOOR','3. OG','3. OG'],['apartment-31','floor-3','APARTMENT','A-3.1','Wohnung A-3.1'],['haus-b',null,'BUILDING','Haus B','Haus B'],['territory',null,'OUTDOOR_ZONE','Außen','Außengelände']];
 for(const [id,parentId,nodeType,code,name]of locationData)await tx.add('location',{siteId:'site-a',parentId,nodeType,code,name,active:true,revision:1,...(nodeType==='FLOOR'?{floorLevel:code==='EG'?0:3,floorLabelDe:code}: {})},id!);
 await tx.add('task',{siteId:'site-a',locationId:'apartment-31',title:'Fenster reinigen',description:'Den frisch verlegten Boden nicht nass wischen.',originalLanguage:'de',serviceType:'GENERAL',priority:'NORMAL',state:'ASSIGNED',unit:'M2',plannedQuantityMilli:100000,plannedMinutes:120,assigneeIds:['demo-employee'],checklist:[],acceptanceCriteria:[],dependencyIds:[],materialRequirements:[],completionKind:'ORIGINAL',billingScope:'CONTRACT',clientVisible:false,reportedQuantityMilli:0,acceptedQuantityMilli:0,reviewCycle:0,requiredPhotoCount:0,createdBy:'demo-foreman',locationSnapshot:[]},'task-windows');
 await tx.add('task',{siteId:'site-a',locationId:'floor-eg',title:'Bauabfälle aufnehmen',description:'Nur freigegebene Abfälle',originalLanguage:'de',serviceType:'GENERAL',priority:'NORMAL',state:'DRAFT',unit:'UNIT',plannedQuantityMilli:1000,plannedMinutes:60,assigneeIds:[],checklist:[],acceptanceCriteria:[],dependencyIds:[],materialRequirements:[],completionKind:'ORIGINAL',billingScope:'CONTRACT',clientVisible:false,reportedQuantityMilli:0,acceptedQuantityMilli:0,reviewCycle:0,requiredPhotoCount:0,createdBy:'demo-foreman',locationSnapshot:[]},'task-waste');
 await tx.add('channel',{type:'SITE_INTERNAL',name:'KNB-014 · Bauleiter & Team',site_id:'site-a',created_by:'demo-foreman',members:['demo-owner','demo-director','demo-foreman','demo-employee'].map(user_id=>({user_id,joined_at:'2026-01-01T00:00:00.000Z',history_from:'2026-01-01T00:00:00.000Z',external:false})),history_policy:'FROM_JOIN',handoff:{state:'AI_ACTIVE',owner_id:null}},'channel-site');
 await tx.add('message',{channel_id:'channel-site',author_id:'demo-foreman',text:'Bitte zuerst die Fenster reinigen. Den frisch verlegten Boden nicht nass wischen.',language:'DE',version:1,revisions:[{version:1,text:'Bitte zuerst die Fenster reinigen. Den frisch verlegten Boden nicht nass wischen.',language:'DE',edited_at:null}],task_id:'task-windows',visibility:'INTERNAL',important:true,attachment_ids:[],mention_ids:[]},'message-instruction');
 await tx.add('material',{sku:'DEMO-CLEAN-01',name:'Bodenreiniger — synthetisch',names:{DE:'Bodenreiniger — synthetisch'},baseUnit:'ml',category:'Reinigung',materialType:'CONSUMABLE',valuationMethod:'WEIGHTED_AVERAGE',packagingBase:5000,minimumBase:1000,targetBase:15000,leadDays:3,conversions:[{unit:'ml',numerator:1,denominator:1},{unit:'l',numerator:1000,denominator:1},{unit:'package',numerator:5000,denominator:1}],supplierIds:[],approvedAnalogIds:[],active:true,synthetic:true},'material-clean');
 await tx.add('stock_location',{name:'Hauptlager — DEMO',type:'WAREHOUSE',active:true},'warehouse-main');
 await tx.add('stock_location',{name:'KNB-014 Baustellenlager',type:'SITE',siteId:'site-a',active:true},'warehouse-site');
 await tx.add('stock_movement',{materialId:'material-clean',toLocationId:'warehouse-main',quantityBase:10000,type:'RECEIPT',reference:'synthetic-opening-balance',actualCostCents:2000,confirmedBy:'demo-warehouse',confirmedAt:new Date().toISOString(),immutable:true,ledgerSequence:1,synthetic:true},'stock-initial');
 await tx.add('service',{name:'Bauendreinigung — DEMO',description:'Synthetische Testleistung',unit:'PERSON_HOUR',active:true,approvedBy:'demo-director',included:['Vereinbarte Reinigung'],excluded:['Nicht freigegebene Zusatzarbeiten'],territories:[],questions:[],synthetic:true},'service-clean');
 await tx.add('decision',{type:'DEMO_INFORMATION',reason:'Live-Integrationen und rechtliche Einstellungen benötigen Freigabe.',status:'OPEN',state:'OPEN',siteId:'site-a',ownerId:'demo-director',sourceIds:[],synthetic:true},'decision-onboarding');
 });
 await seedReport(db,companyId);
}

// This is an explicitly synthetic contract fixture. The subsequent operational
// review, time approval, media approval and publication all use real commands.
// It creates no legal approval, GPS authorization, outbound message or AI consent.
async function seedReport(db:Database,companyId:string){
 const engine=new Engine(db,'DEMO');
 const state=await db.transaction(companyId,'SYNTHETIC_REPORT_FIXTURE',async tx=>{
  const company=await tx.get('company',companyId);if(!company.data.synthetic)throw new Error('DEMO_SEED_COMPANY_REQUIRED');
  if(company.data.seedReportVersionId)return {done:true} as const;
  const orders=await tx.list('order');if(!orders.some(o=>o.id==='demo-report-order'))await tx.add('order',{customerId:'customer-demo',siteId:'site-a',status:'IN_PROGRESS',assignmentId:'demo-report-crew-assignment',pricingModel:'FIXED',baseNetCents:24000,approvedChangesNetCents:0,finalNetCents:24000,currency:'EUR',tax:{rateBps:1900,display:'Synthetisches Test-Steuerprofil: 19 % — keine Rechtsfreigabe',testOnly:true},scope:'Synthetische Testleistung: 6 Stunden à 30 EUR, 40 EUR Material und 20 EUR Anfahrt.',scheduleVersion:1,billing:{invoicedCents:0,paidCents:0},synthetic:true},'demo-report-order');
  if(!(await tx.list('crew_assignment')).some(a=>a.id==='demo-report-crew-assignment'))await tx.add('crew_assignment',{orderId:'demo-report-order',siteId:'site-a',scheduleVersion:1,employeeIds:['employee-demo-employee'],acknowledgedIds:['employee-demo-employee'],status:'ACKNOWLEDGED',synthetic:true,evidence:'Explicit synthetic pre-existing crew consent fixture; not company assignment approval'},'demo-report-crew-assignment');
  if(!company.data.seedWorkflowStartAt){const day=new Date(Date.now()-86400000).toISOString().slice(0,10);const startAt=`${day}T08:00:00.000Z`,endAt=`${day}T14:00:00.000Z`;await tx.save(company,{...company.data,seedWorkflowStartAt:startAt,seedWorkflowEndAt:endAt});return {done:false,startAt,endAt};}
  return {done:false,startAt:company.data.seedWorkflowStartAt as string,endAt:company.data.seedWorkflowEndAt as string};
 });
 if(state.done)return;
 const run=async(userId:string,name:string,input:unknown,key:string)=>engine.execute(await engine.getActor(userId,companyId),name,{input,idempotency_key:`synthetic-report-v1:${key}`});
 const task=await run('demo-director','task.create',{siteId:'site-a',orderId:'demo-report-order',locationId:'apartment-31',title:'Synthetischer Nachweis: 100 m² Fensterreinigung',unit:'M2',plannedQuantityMilli:100000,assigneeIds:['demo-employee'],clientVisible:true},'task');
 const shift=await run('demo-employee','shift.start',{siteId:'site-a',taskId:task.id,occurredAt:state.startAt},'shift-start');
 await run('demo-employee','task.start',{taskId:task.id},'task-start');
 const worklog=await run('demo-employee','task.worklog',{taskId:task.id,quantityMilli:100000,description:'Synthetische QA-Leistung. Kein echter Kundenauftrag.'},'worklog');
 await run('demo-employee','shift.end',{shiftId:shift.id,occurredAt:state.endAt,description:'Synthetische QA-Schicht, 6 Stunden.'},'shift-end');
 await run('demo-employee','time.allocate',{segmentId:shift.data.activeSegmentId,taskId:task.id,worklogId:worklog.id,seconds:21600},'allocate');
 await run('demo-employee','task.submit',{taskId:task.id,description:'Zur getrennten Qualitätsprüfung eingereicht.'},'task-submit');
 await run('demo-foreman','task.review',{taskId:task.id,decision:'ACCEPT',reason:'Synthetische Testleistung geprüft.'},'task-review');
 const timesheet=await run('demo-employee','timesheet.submit',{periodStart:state.startAt,periodEnd:state.endAt},'timesheet-submit');
 await run('demo-director','timesheet.review',{timesheetId:timesheet.id,decision:'APPROVE',reason:'Getrennt geprüfte synthetische Stunden.'},'timesheet-review');
 const png=await sharp({create:{width:240,height:160,channels:3,background:{r:35,g:109,b:85}}}).png().toBuffer(),clean=await sharp(png).jpeg({quality:88}).toBuffer();
 const suffix=createHash('sha256').update(companyId).digest('hex').slice(0,24),uploadId=`demo-original-${suffix}`,clientBlobKey=`demo-client-${suffix}`;
 const store=new PostgresPrivateBlobStore(db);
 await db.transaction(companyId,'demo-employee',async tx=>{
  const original=await store.put({id:uploadId,companyId,ownerId:'demo-employee',bytes:png,mimeType:'image/png'},tx),clientCopy=await store.put({id:clientBlobKey,companyId,ownerId:'demo-employee',bytes:clean,mimeType:'image/jpeg'},tx);
  if(!(await tx.list('media_upload')).some(u=>u.id===uploadId))await tx.add('media_upload',{uploadedBy:'demo-employee',blobKey:uploadId,clientBlobKey,sha256:original.sha256,clientSha256:clientCopy.sha256,mimeType:'image/png',clientMimeType:'image/jpeg',byteSize:png.length,clientByteSize:clean.length,scanState:'CLEAN',scanMethod:'SYNTHETIC_GENERATED_AND_REENCODED_IMAGE',metadataStripped:true,redactionConfirmed:true,redactionConfirmedBy:'demo-employee',synthetic:true},uploadId);
 });
 const media=await run('demo-employee','media.register',{uploadId,siteId:'site-a',taskId:task.id,orderId:'demo-report-order',stage:'AFTER',visibility:'CLIENT_AFTER_APPROVAL',caption:'Synthetisches Farbfeld — keine echte Baustellenaufnahme.',retentionPurpose:'Synthetische Release-QA'},'media-register');
 await run('demo-approver','media.approve',{mediaId:media.id,reason:'Synthetische Aufnahme; keine personenbezogenen Bildinhalte.'},'media-approve');
 const periodEnd=await db.transaction(companyId,'SYNTHETIC_REPORT_FIXTURE',async tx=>{const company=await tx.get('company',companyId);if(company.data.seedReportPeriodEndAt)return company.data.seedReportPeriodEndAt as string;const at=new Date().toISOString();await tx.save(company,{...company.data,seedReportPeriodEndAt:at});return at;});
 const report=await run('demo-director','report.create',{siteId:'site-a',customerId:'customer-demo',orderId:'demo-report-order',periodStart:state.startAt,periodEnd,documentType:'Leistungsnachweis',taskIds:[task.id],timesheetIds:[timesheet.id],mediaIds:[media.id],descriptionDe:'SYNTHETISCHER TESTBERICHT. 100 m² freigegebene Testleistung, 6 bestätigte Stunden; vertraglich 240,00 EUR netto und ausschließlich synthetisches Steuerprofil 19 %: 285,60 EUR brutto. Keine echte Rechnung oder Abnahme.'},'report-create');
 await run('demo-approver','report.review',{reportId:report.id,decision:'PASS',reason:'Unabhängige synthetische Berichtprüfung.'},'report-review');
 await run('demo-approver','report.approve',{reportId:report.id,reason:'Synthetische Quellen unverändert; keine Rechtsfreigabe erzeugt.'},'report-approve');
 const version=await run('demo-director','report.publish',{reportId:report.id},'report-publish');
 await db.transaction(companyId,'SYNTHETIC_REPORT_FIXTURE',async tx=>{const company=await tx.get('company',companyId);await tx.save(company,{...company.data,seedReportId:report.id,seedReportVersionId:version.id,seedWorkflowVersion:1});});
}
if(import.meta.url===`file://${process.argv[1]}`){const db=new Database();await seed(db,process.env.COMPANY_ID??'knaba-demo');await db.close();console.log('Synthetic DEMO seed applied; real customer data never seeded.');}
