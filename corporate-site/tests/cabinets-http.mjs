/** Integrated compiled-artifact acceptance; synthetic HTTPS/SQLite only. */
import assert from 'node:assert/strict';
import {request as httpsRequest} from 'node:https';
import {createHash,randomUUID} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createRoleUxFixture} from './fixtures/role-ux-server.mjs';

const checks=[];
const record=name=>checks.push({name,status:'PASS'});
const fixture=await createRoleUxFixture();
assert.equal(new URL(fixture.origin).hostname,'127.0.0.1');
const cookies=new Map();
function call(path,role,method='GET',body,form=false){
  assert.ok(path.startsWith('/')&&!path.startsWith('//'));
  const data=body===undefined?null:form?new URLSearchParams(body).toString():JSON.stringify(body);
  return new Promise((resolve,reject)=>{
    // The only permitted target is the fixture's ephemeral self-signed loopback.
    const req=httpsRequest(new URL(path,fixture.origin),{method,rejectUnauthorized:false,headers:{
      Origin:fixture.origin,'X-KnaBa-Request':'portal-v1',Accept:form?'text/html':'application/json',
      ...(cookies.has(role)?{Cookie:cookies.get(role)}:{}),
      ...(data===null?{}:{'Content-Type':form?'application/x-www-form-urlencoded':'application/json','Content-Length':Buffer.byteLength(data)})
    }},res=>{
      const chunks=[];res.on('data',c=>chunks.push(c));res.on('error',reject);res.on('end',()=>{
        const text=Buffer.concat(chunks).toString();let parsed;try{parsed=JSON.parse(text);}catch{}
        resolve({status:res.statusCode,headers:res.headers,body:parsed});
      });
    });req.setTimeout(15000,()=>req.destroy(new Error('Synthetic HTTP timeout')));req.on('error',reject);req.end(data);
  });
}
async function good(path,role,method='GET',body,status=200){const r=await call(path,role,method,body);assert.equal(r.status,status,path);return r.body;}
let result;
try{
  for(const role of ['owner','admin','client','partner','worker','bauleiter','client2','pending','suspended']){
    const r=await call('/login/?lang=en',role,'POST',{email:fixture.identities[role].email,password:fixture.password,return_to:'/konto/?lang=en'},true);
    assert.equal(r.status,303,role+' password login');
    const raw=r.headers['set-cookie']||[];assert.ok(raw.some(v=>v.startsWith('__Host-knaba-session=')),'session cookie');
    cookies.set(role,raw.map(v=>v.split(';')[0]).join('; '));
    const session=await good('/api/portal/session',role);assert.equal(session.role,role==='client2'?'client':role);
    assert.ok(r.headers.location.startsWith(role==='owner'||role==='admin'?'/admin/':'/konto/'));
  }
  record('Password login and server-selected destination for nine synthetic identities');
  const payload={service:'baureinigung',objectType:'Baustelle',postcode:'10315',area:'300',frequency:'Einmalig',address:'Synthetic acceptance address',message:'Synthetic full workflow request, no external dispatch.',privacyAccepted:true,idempotencyKey:randomUUID()};
  let job=(await good('/api/portal/requests','client','POST',payload,201)).request;
  const replay=(await good('/api/portal/requests','client','POST',payload)).request;assert.equal(replay.id,job.id);
  assert.ok(!(await good('/api/portal/dashboard','client2')).requests.some(item=>item.id===job.id));
  record('Client request persists, replay deduplicates, another client cannot read it');
  job=(await good('/api/portal/requests/'+job.id,'owner','PATCH',{version:job.version,status:'reviewing',assignedBauleiterId:fixture.identities.bauleiter.id})).request;
  assert.equal((await call('/api/portal/requests/'+job.id,'bauleiter','PATCH',{version:job.version,scheduledAt:'2026-02-30T09:00:00Z'})).status,422);
  job=(await good('/api/portal/requests/'+job.id,'bauleiter','PATCH',{version:job.version,status:'scheduled',assignedWorkerId:fixture.identities.worker.id,scheduledAt:'2026-11-10T08:00:00.000Z'})).request;
  record('Owner assigns Bauleiter; impossible appointment rejected; Bauleiter schedules worker');
  const choices=await good('/api/portal/conversations/recipients?requestId='+job.id,'admin');
  assert.deepEqual(new Set(choices.recipients.map(p=>p.id)),new Set([fixture.identities.client.id,fixture.identities.worker.id]));
  assert.ok(choices.recipients.every(p=>!('email' in p)));
  const thread=(await good('/api/portal/conversations','admin','POST',{requestId:job.id,participantId:fixture.identities.client.id},201)).conversation;
  await good('/api/portal/conversations/'+thread.id+'/messages','admin','POST',{body:'Synthetic management confirmation.',idempotencyKey:randomUUID()},201);
  await good('/api/portal/conversations/'+thread.id+'/messages','client','POST',{body:'Synthetic client reply.',idempotencyKey:randomUUID()},201);
  assert.equal((await good('/api/portal/conversations/'+thread.id+'/messages','client')).messages.length,2);
  assert.equal((await call('/api/portal/conversations/'+thread.id+'/messages','worker')).status,404);
  record('Administrator finds scoped client, exchanges persisted messages; worker cannot read client chat');
  job=(await good('/api/portal/requests/'+job.id,'worker','PATCH',{version:job.version,status:'in_progress'})).request;
  assert.equal((await call('/api/portal/requests/'+job.id,'worker','PATCH',{version:job.version,status:'completed',checklist:[]})).status,422);
  job=(await good('/api/portal/requests/'+job.id,'worker','PATCH',{version:job.version,status:'completed',checklist:['access_checked','surfaces_cleaned','quality_checked','reported'],workerNote:'Synthetic internal handover.'})).request;
  const clientJob=(await good('/api/portal/dashboard','client')).requests.find(item=>item.id===job.id);assert.ok(!('workerNote' in clientJob));
  job=(await good('/api/portal/requests/'+job.id,'client','PATCH',{version:job.version,customerFeedback:'Synthetic handover accepted.'})).request;
  assert.equal(job.customerFeedback,'Synthetic handover accepted.');
  assert.equal(fixture.db.prepare('SELECT status,customer_feedback FROM cleaning_requests WHERE id=?').get(job.id).status,'completed');
  record('Worker completes checklist; internal notes stay private; client feedback persists');
  const partner=(await good('/api/portal/requests','partner','POST',{...payload,idempotencyKey:randomUUID()},201)).request;
  assert.ok(!(await good('/api/portal/dashboard','client')).requests.some(item=>item.id===partner.id));
  assert.equal((await call('/api/portal/requests','pending','POST',{...payload,idempotencyKey:randomUUID()})).status,403);
  assert.equal((await call('/api/portal/requests','suspended','POST',{...payload,idempotencyKey:randomUUID()})).status,403);
  record('Partner isolation and pending/suspended write denial');
  assert.equal(fixture.db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  assert.equal(fixture.db.prepare('PRAGMA foreign_key_check').all().length,0);
  record('Synthetic database integrity and foreign keys');
  const workerHash=createHash('sha256').update(await readFile(new URL('../dist/server/index.js',import.meta.url))).digest('hex');
  result={status:'PASS',at:new Date().toISOString(),environment:'isolated HTTPS / actual password auth / compiled Worker / real SQLite / synthetic data',workerSha256:workerHash,checks};
}catch(error){result={status:'FAIL',at:new Date().toISOString(),checks,error:{name:error.name,message:error.message}};process.exitCode=1;}
finally{await fixture.close();}
const output=resolve(process.env.KNABA_HTTP_QA_DIR||'/tmp/knaba-cabinets-http');await mkdir(output,{recursive:true});
await writeFile(resolve(output,'receipt.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
