import {after,before,test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {build} from 'esbuild';
import {createKnabaVpsServer} from './server.mjs';
import {createOwner} from './auth.mjs';

const origin='https://knaba.de',password='Synthetic-assistant-test-2026';
let compiledDirectory,compiledWorker;
before(async()=>{
  compiledDirectory=await mkdtemp(join(tmpdir(),'knaba-assistant-worker-'));
  compiledWorker=join(compiledDirectory,'worker.mjs');
  await build({entryPoints:[new URL('../worker/index.ts',import.meta.url).pathname],outfile:compiledWorker,bundle:true,platform:'node',format:'esm',target:'node24',logLevel:'silent'});
});
after(async()=>{if(compiledDirectory)await rm(compiledDirectory,{recursive:true,force:true});});

async function fixture(work,{boundary=null,target='',onlyCursor=false,guestId=''}={}){
  const directory=await mkdtemp(join(tmpdir(),'knaba-assistant-http-')),dbPath=join(directory,'state.sqlite');
  let app,workerPath=pathToFileURL(compiledWorker).href;
  try{
    if(boundary){
      const wrapper=join(directory,'boundary-worker.mjs');
      await writeFile(wrapper,`import worker from ${JSON.stringify(workerPath)};
import {DatabaseSync} from 'node:sqlite';
export default {fetch(request,env,ctx){
  const url=new URL(request.url);
  if(url.pathname!==${JSON.stringify(target)}||(${JSON.stringify(onlyCursor)}&&!url.searchParams.has('cursor')))return worker.fetch(request,env,ctx);
  const boundary=${JSON.stringify(boundary)},original=env.DB,sources=new WeakMap();let changed=false;
  function revoke(){if(changed)return;changed=true;const db=new DatabaseSync(${JSON.stringify(dbPath)});try{const guestId=${JSON.stringify(guestId)};if(guestId)db.prepare("UPDATE assistant_conversations SET token_hash='' WHERE id=?").run(guestId);else db.exec('DELETE FROM vps_sessions');}finally{db.close();}}
  const wrap=(statement,sql)=>{
    const result={
      bind:(...values)=>wrap(statement.bind(...values),sql),
      first:async(...args)=>{const out=await statement.first(...args);if(boundary==='after-identity'&&sql==='SELECT * FROM profiles WHERE id=?')revoke();return out;},
      all:async(...args)=>{const out=await statement.all(...args);if(boundary==='after-private-read'&&/FROM assistant_(?:messages|conversations)/i.test(sql))revoke();return out;},
      run:(...args)=>{if(boundary==='before-receipt-write'&&/^UPDATE assistant_messages SET guest_displayed_at/i.test(sql))revoke();return statement.run(...args);}
    };sources.set(result,{statement,sql});return result;
  };
  return worker.fetch(request,{...env,DB:{
    ...original,prepare:sql=>wrap(original.prepare(sql),sql),
    batch:statements=>{if(boundary==='before-write')revoke();return original.batch(statements.map(statement=>sources.get(statement).statement));}
  }},ctx);
}};`);
      workerPath=pathToFileURL(wrapper).href;
    }
    app=await createKnabaVpsServer({dbPath,staticRoot:directory,workerPath,ownerEmail:'owner@example.test',localTest:true,host:'127.0.0.1',port:0,oidcConfig:{}});
    const owner=createOwner(app.db,'owner@example.test',password);
    const ticket={id:randomUUID(),token:'b'.repeat(64)},created=new Date().toISOString(),expires=new Date(Date.now()+7*86400000).toISOString();
    app.db.prepare("INSERT INTO assistant_conversations(id,token_hash,token_expires_at,locale,status,contact_name,privacy_version,created_at,updated_at) VALUES(?,?,?,'de','human','Private contact','test',?,?)")
      .run(ticket.id,createHash('sha256').update(ticket.token).digest('hex'),expires,created,created);
    app.db.prepare("INSERT INTO assistant_messages(id,conversation_id,sender,content,request_key,created_at) VALUES(?,?,'customer','Private history','seed',?)")
      .run(randomUUID(),ticket.id,created);
    const at=(path,options={})=>fetch(`http://127.0.0.1:${app.port}${path}`,{redirect:'manual',...options,headers:{Host:'knaba.de',...options.headers}});
    const response=await at('/login/',{method:'POST',headers:{Origin:origin,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({email:owner.email,password,return_to:'/postfach/'})});
    assert.equal(response.status,303);
    const cookie=response.headers.getSetCookie()[0].split(';')[0];
    await work({app,at,cookie,ticket});
  }finally{if(app)await app.close();await rm(directory,{recursive:true,force:true});}
}
const post=(cookie,body)=>({method:'POST',headers:{Cookie:cookie,Origin:origin,'X-KnaBa-Request':'portal-v1','Content-Type':'application/json'},body:JSON.stringify(body)});
const enquiry=()=>({service:'baureinigung',objectType:'Baustelle',postcode:'10115',area:'100',frequency:'Einmalig',message:'Synthetic request text',name:'Synthetic guest',email:'guest@example.test',phone:'',website:'',privacyAccepted:true,transferAccepted:true,idempotencyKey:randomUUID()});
function seedInbox(app,count){
  const created=new Date().toISOString(),expires=new Date(Date.now()+7*86400000).toISOString();
  const insert=app.db.prepare("INSERT INTO assistant_conversations(id,token_hash,token_expires_at,locale,status,contact_name,privacy_version,created_at,updated_at) VALUES(?,?,?,'uk','human','Private page contact','test',?,?)");
  for(let index=0;index<count;index++)insert.run(randomUUID(),'e'.repeat(64),expires,created,created);
}

test('actual VPS owner revoke preserves owner history and denies the guest code',async()=>fixture(async({app,at,cookie,ticket})=>{
  const path=`/api/assistant/owner/conversations/${ticket.id}/access/revoke`;
  const forged=post('',{});
  forged.headers['oai-authenticated-user-id']='forged-owner';
  forged.headers['oai-authenticated-user-email']='owner@example.test';
  assert.equal((await at(path,forged)).status,403);
  const crossOrigin=post(cookie,{});crossOrigin.headers.Origin='https://foreign.example.test';
  assert.equal((await at(path,crossOrigin)).status,403);
  assert.equal(app.db.prepare('SELECT token_revoked_at FROM assistant_conversations WHERE id=?').get(ticket.id).token_revoked_at,null);
  assert.equal((await at(path,post(cookie,{}))).status,200);
  assert.equal((await at(path,post(cookie,{}))).status,200);
  const guest=await at(`/api/assistant/conversations/${ticket.id}`,{headers:{'X-KnaBa-Conversation':ticket.token}});
  assert.equal(guest.status,404);assert.doesNotMatch(await guest.text(),/Private history|token_hash/);
  const history=await at(`/api/assistant/owner/conversations/${ticket.id}`,{headers:{Cookie:cookie}});
  assert.equal(history.status,200);assert.match(await history.text(),/Private history/);
  assert.equal(app.db.prepare("SELECT COUNT(*) AS n FROM portal_audit WHERE action='assistant.access.revoke'").get().n,1);
}));

test('actual VPS creates and withdraws an explicit assistant request through the scoped HTTP route',async()=>fixture(async({app,at,cookie})=>{
  const started=await at('/api/assistant/conversations',post('',{locale:'uk',privacyAccepted:true,website:''}));assert.equal(started.status,201);
  const ticket=await started.json(),input=enquiry(),path=`/api/assistant/conversations/${ticket.id}/requests`;
  assert.equal((await at(path,post(cookie,input))).status,404);
  const options=post(cookie,input);options.headers['X-KnaBa-Conversation']=ticket.token;
  const response=await at(path,options);assert.equal(response.status,201);const created=await response.json();
  assert.equal(created.conversationId,ticket.id);assert.equal(created.received,true);
  assert.equal(app.db.prepare('SELECT client_id FROM cleaning_requests WHERE id=?').get(created.id).client_id,null);
  assert.equal(app.db.prepare('SELECT conversation_id FROM assistant_request_links WHERE request_id=?').get(created.id).conversation_id,ticket.id);
  const context=await at(`/api/assistant/conversations/${ticket.id}/request-context`,{headers:{'X-KnaBa-Conversation':ticket.token}});
  assert.equal(context.status,200);assert.equal((await context.json()).requests[0].id,created.id);
  const cancel=post('',{version:1});cancel.headers['X-KnaBa-Conversation']=ticket.token;
  const withdrawn=await at(`${path}/${created.id}/cancel`,cancel);assert.equal(withdrawn.status,200);assert.equal((await withdrawn.json()).request.status,'cancelled');
  const ownerThread=await at(`/api/assistant/owner/conversations/${ticket.id}`,{headers:{Cookie:cookie}});
  assert.equal(ownerThread.status,200);assert.equal((await ownerThread.json()).requests[0].status,'cancelled');
  assert.equal(app.db.prepare('SELECT count(*) AS n FROM cleaning_requests').get().n,1);
}));

test('actual VPS assistant request batch refuses a guest capability revoked after its preflight',async()=>{
  const target='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaab';
  await fixture(async({app,at})=>{
    const created=new Date().toISOString(),expires=new Date(Date.now()+86400000).toISOString(),token='f'.repeat(64);
    app.db.prepare("INSERT INTO assistant_conversations(id,token_hash,token_expires_at,locale,status,privacy_version,created_at,updated_at) VALUES(?,?,?,'uk','human','test',?,?)")
      .run(target,createHash('sha256').update(token).digest('hex'),expires,created,created);
    const options=post('',enquiry());options.headers['X-KnaBa-Conversation']=token;
    const response=await at(`/api/assistant/conversations/${target}/requests`,options);assert.equal(response.status,404);
    for(const table of ['cleaning_requests','assistant_request_links','site_erp_outbox'])assert.equal(app.db.prepare('SELECT count(*) AS n FROM '+table).get().n,0);
    assert.equal(app.db.prepare("SELECT count(*) AS n FROM portal_audit WHERE action='request.created'").get().n,0);
  },{boundary:'before-write',target:`/api/assistant/conversations/${target}/requests`,guestId:target});
});

for(const boundary of ['after-identity','after-private-read'])test(`VPS owner inbox rejects revocation ${boundary}`,async()=>fixture(async({at,cookie})=>{
  const response=await at('/api/assistant/owner/conversations',{headers:{Cookie:cookie}});
  assert.equal(response.status,403);assert.doesNotMatch(await response.text(),/Private contact|Private history/);
},{boundary,target:'/api/assistant/owner/conversations'}));

test('VPS SQL boundary rejects an in-flight owner mutation and its audit after logout',async()=>{
  // Use a fixed route in the wrapper while resolving the fixture's conversation from the DB.
  await fixture(async({app,at,cookie})=>{
    const id='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
    const created=new Date().toISOString(),expires=new Date(Date.now()+7*86400000).toISOString();
    app.db.prepare("INSERT INTO assistant_conversations(id,token_hash,token_expires_at,locale,status,privacy_version,created_at,updated_at) VALUES(?,?,?,'de','human','test',?,?)")
      .run(id,'c'.repeat(64),expires,created,created);
    const response=await at(`/api/assistant/owner/conversations/${id}/access/revoke`,post(cookie,{}));
    assert.equal(response.status,403);
    assert.equal(app.db.prepare('SELECT token_revoked_at FROM assistant_conversations WHERE id=?').get(id).token_revoked_at,null);
    assert.equal(app.db.prepare("SELECT COUNT(*) AS n FROM portal_audit WHERE action='assistant.access.revoke'").get().n,0);
  },{boundary:'before-write',target:'/api/assistant/owner/conversations/aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa/access/revoke'});
});

test('actual VPS owner pages reach every conversation without exposing a capability',async()=>fixture(async({app,at,cookie})=>{
  seedInbox(app,204);
  const ids=[],path='/api/assistant/owner/conversations';let cursor=null,pages=0;
  do{
    const response=await at(path+(cursor?'?cursor='+cursor:''),{headers:{Cookie:cookie}});
    assert.equal(response.status,200);
    const page=await response.json();assert.ok(page.conversations.length<=100);
    assert.doesNotMatch(JSON.stringify(page),/token_hash|"token":/);
    ids.push(...page.conversations.map(row=>row.id));cursor=page.nextCursor;pages++;
    assert.ok(pages<=3);
  }while(cursor);
  assert.equal(ids.length,205);assert.equal(new Set(ids).size,205);assert.equal(pages,3);
}));

test('VPS rechecks current owner authority on a later page before the HTTP response',async()=>fixture(async({app,at,cookie})=>{
  seedInbox(app,100);
  const path='/api/assistant/owner/conversations';
  const first=await (await at(path,{headers:{Cookie:cookie}})).json();
  assert.equal(typeof first.nextCursor,'string');
  const second=await at(path+'?cursor='+first.nextCursor,{headers:{Cookie:cookie}});
  assert.equal(second.status,403);assert.doesNotMatch(await second.text(),/Private page contact|Private history/);
},{boundary:'after-private-read',target:'/api/assistant/owner/conversations',onlyCursor:true}));

test('actual HTTP visitor display requires its capability, retains first receipt and leaves inbox order unchanged',async()=>fixture(async({app,at,cookie,ticket})=>{
  const reply=await at(`/api/assistant/owner/conversations/${ticket.id}/messages`,post(cookie,{content:'Synthetic owner reply',idempotencyKey:randomUUID()}));
  assert.equal(reply.status,200);const sent=await reply.json(),message=sent.messages.find(row=>row.sender==='owner');
  assert.equal(message.guestDisplayedAt,null);
  const path=`/api/assistant/conversations/${ticket.id}/displayed`,body={messageIds:[message.id]};
  assert.equal((await at(path,post(cookie,body))).status,404);
  const options=post('',body);options.headers['X-KnaBa-Conversation']=ticket.token;
  const foreign={...options,headers:{...options.headers,Origin:'https://foreign.example.test'}};
  assert.equal((await at(path,foreign)).status,403);
  const response=await at(path,options);assert.equal(response.status,200);const first=await response.json();
  assert.equal(first.receipts[0].id,message.id);assert.match(first.receipts[0].guestDisplayedAt,/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
  assert.deepEqual(await (await at(path,options)).json(),first);
  const history=await (await at(`/api/assistant/owner/conversations/${ticket.id}`,{headers:{Cookie:cookie}})).json();
  assert.equal(history.messages.find(row=>row.id===message.id).guestDisplayedAt,first.receipts[0].guestDisplayedAt);
  assert.equal(history.conversation.updatedAt,sent.conversation.updatedAt);
  assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM assistant_notifications').get().n,0);
  assert.doesNotMatch(JSON.stringify(first),/Synthetic owner reply|token|contact/);
}));

for(const boundary of ['before-receipt-write','after-private-read'])test(`actual HTTP display receipt checks guest capability ${boundary}`,async()=>{
  const id='dddddddd-dddd-4ddd-addd-dddddddddddd',path=`/api/assistant/conversations/${id}/displayed`;
  await fixture(async({app,at,cookie})=>{
    const token='c'.repeat(64),created=new Date().toISOString(),message=randomUUID();
    app.db.prepare("INSERT INTO assistant_conversations(id,token_hash,token_expires_at,locale,status,privacy_version,created_at,updated_at) VALUES(?,?,?,'de','human','test',?,?)")
      .run(id,createHash('sha256').update(token).digest('hex'),new Date(Date.now()+86400000).toISOString(),created,created);
    app.db.prepare("INSERT INTO assistant_messages(id,conversation_id,sender,content,request_key,created_at) VALUES(?,?,'owner','Synthetic display receipt',?,?)").run(message,id,message,created);
    const options=post('',{messageIds:[message]});options.headers['X-KnaBa-Conversation']=token;
    const response=await at(path,options);assert.equal(response.status,404);const payload=await response.text();
    assert.ok(!payload.includes(message));assert.doesNotMatch(payload,/guestDisplayedAt|Synthetic display receipt/);
    const receipt=app.db.prepare('SELECT guest_displayed_at FROM assistant_messages WHERE id=?').get(message).guest_displayed_at;
    if(boundary==='before-receipt-write')assert.equal(receipt,null);else assert.equal(typeof receipt,'string');
    assert.equal(app.db.prepare('SELECT updated_at FROM assistant_conversations WHERE id=?').get(id).updated_at,created);
    assert.equal((await at(`/api/assistant/owner/conversations/${id}`,{headers:{Cookie:cookie}})).status,200);
  },{boundary,target:path,guestId:id});
});
