import {after,before,test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {build} from 'esbuild';
import {createKnabaVpsServer} from './server.mjs';
import {createOwner,readSession} from './auth.mjs';

const origin='https://knaba.de',password='Synthetic-assistant-test-2026';
let compiledDirectory,compiledWorker;
before(async()=>{
  compiledDirectory=await mkdtemp(join(tmpdir(),'knaba-assistant-worker-'));
  compiledWorker=join(compiledDirectory,'worker.mjs');
  await build({entryPoints:[new URL('../worker/index.ts',import.meta.url).pathname],outfile:compiledWorker,bundle:true,platform:'node',format:'esm',target:'node24',logLevel:'silent'});
});
after(async()=>{if(compiledDirectory)await rm(compiledDirectory,{recursive:true,force:true});});

async function fixture(work,{boundary=null,target='',guest=false,authorityOnly=false,ageMs=0}={}){
  const directory=await mkdtemp(join(tmpdir(),'knaba-assistant-http-')),dbPath=join(directory,'state.sqlite');
  const ticket={id:randomUUID(),token:'b'.repeat(64)},route=typeof target==='function'?target(ticket):target;
  let app,workerPath=pathToFileURL(compiledWorker).href;
  try{
    if(boundary){
      const wrapper=join(directory,'boundary-worker.mjs');
      await writeFile(wrapper,`import worker from ${JSON.stringify(workerPath)};
import {openLocalDatabase} from ${JSON.stringify(new URL('./database.mjs',import.meta.url).href)};
export default {fetch(request,env,ctx){
  const url=new URL(request.url);
  if(url.pathname!==${JSON.stringify(route)})return worker.fetch(request,env,ctx);
  const boundary=${JSON.stringify(boundary)},original=env.DB,sources=new WeakMap(),authorityOnly=${JSON.stringify(authorityOnly)};let changed=false;
  const verifyOwner=env.VERIFY_ASSISTANT_OWNER_SESSION;
  if(authorityOnly&&typeof verifyOwner!=='function')throw Error('Current owner checker missing');
  function revoke(){if(changed)return;changed=true;if(authorityOnly)return;const {db}=openLocalDatabase(${JSON.stringify(dbPath)},{allowMigrations:false});try{const guestId=${JSON.stringify(guest?ticket.id:"")};if(guestId)db.prepare("UPDATE assistant_conversations SET token_hash='' WHERE id=?").run(guestId);else db.exec('DELETE FROM vps_sessions');}finally{db.close();}}
  const wrap=(statement,sql)=>{
    const result={
      bind:(...values)=>wrap(statement.bind(...values),sql),
      first:async(...args)=>{const out=await statement.first(...args);if(boundary==='after-identity'&&sql==='SELECT * FROM profiles WHERE id=?')revoke();return out;},
      all:async(...args)=>{const out=await statement.all(...args);if(boundary==='after-private-read'&&/FROM assistant_(?:messages|conversations)/i.test(sql))revoke();return out;},
      run:(...args)=>{if(boundary==='before-write'&&/^(?:UPDATE|INSERT).*assistant_(?:conversations|messages|offers)/i.test(sql))revoke();return statement.run(...args);}
    };sources.set(result,{statement,sql});return result;
  };
  return worker.fetch(request,{...env,...(authorityOnly?{VERIFY_ASSISTANT_OWNER_SESSION:()=>!changed&&verifyOwner()}:{ }),DB:{
    ...original,prepare:sql=>wrap(original.prepare(sql),sql),
    batch:statements=>{if(boundary==='before-write')revoke();return original.batch(statements.map(statement=>sources.get(statement).statement));}
  }},ctx);
}};`);
      workerPath=pathToFileURL(wrapper).href;
    }
    app=await createKnabaVpsServer({dbPath,staticRoot:directory,workerPath,ownerEmail:'owner@example.test',localTest:true,host:'127.0.0.1',port:0,oidcConfig:{},accountEmailEnvironment:{},erpIntakeEnvironment:{},releaseEnvironment:{},siteIdentityConfig:()=>null,siteIdentitySessionsEnabled:()=>false});
    const owner=createOwner(app.db,'owner@example.test',password);
    const created=new Date(Date.now()-ageMs).toISOString(),expires=new Date(Date.parse(created)+7*86400000).toISOString();
    app.db.prepare("INSERT INTO assistant_conversations(id,token_hash,token_expires_at,locale,status,contact_name,privacy_version,created_at,updated_at) VALUES(?,?,?,'de','human','Private contact','test',?,?)")
      .run(ticket.id,createHash('sha256').update(ticket.token).digest('hex'),expires,created,created);
    app.db.prepare("INSERT INTO assistant_messages(id,conversation_id,sender,content,request_key,created_at) VALUES(?,?,'customer','Private history','seed',?)")
      .run(randomUUID(),ticket.id,created);
    const at=(path,options={})=>fetch(`http://127.0.0.1:${app.port}${path}`,{redirect:'manual',...options,headers:{Host:'knaba.de',...options.headers}});
    const response=await at('/login/',{method:'POST',headers:{Origin:origin,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({email:owner.email,password,return_to:'/postfach/'})});
    assert.equal(response.status,303);
    const cookie=response.headers.getSetCookie()[0].split(';')[0];
    await work({app,at,cookie,ticket,owner});
  }finally{if(app)await app.close();await rm(directory,{recursive:true,force:true});}
}
const post=(cookie,body)=>({method:'POST',headers:{Cookie:cookie,Origin:origin,'X-KnaBa-Request':'portal-v1','Content-Type':'application/json'},body:JSON.stringify(body)});
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

for(const boundary of ['after-identity','after-private-read'])test(`VPS owner inbox denies an active request after logout ${boundary}`,async()=>fixture(async({at,cookie})=>{
  const response=await at('/api/assistant/owner/conversations',{headers:{Cookie:cookie}});
  assert.equal(response.status,403);assert.doesNotMatch(await response.text(),/Private contact|Private history/);
},{boundary,target:'/api/assistant/owner/conversations'}));

test('VPS current-owner callback is rechecked after private reads while the cookie remains valid',async()=>fixture(async({app,at,cookie})=>{
  assert.ok(readSession(app.db,cookie));
  const response=await at('/api/assistant/owner/conversations',{headers:{Cookie:cookie}});
  assert.equal(response.status,403);assert.doesNotMatch(await response.text(),/Private contact|Private history/);
  assert.ok(readSession(app.db,cookie),'authority withdrawal is distinct from logout');
},{boundary:'after-private-read',target:'/api/assistant/owner/conversations',authorityOnly:true}));

for(const action of ['messages','offers','status','access/revoke'])test(`VPS ${action} refuses withdrawn owner authority after identity lookup`,async()=>fixture(async({app,at,cookie,ticket})=>{
  const body=action==='status'?{status:'closed'}:action==='access/revoke'?{}:{content:'Must not be committed',idempotencyKey:randomUUID()};
  const before=app.db.prepare('SELECT * FROM assistant_conversations WHERE id=?').get(ticket.id);
  const messages=app.db.prepare('SELECT count(*) AS n FROM assistant_messages').get().n;
  const response=await at(`/api/assistant/owner/conversations/${ticket.id}/${action}`,post(cookie,body));
  assert.equal(response.status,403);assert.ok(readSession(app.db,cookie));
  assert.deepEqual(app.db.prepare('SELECT * FROM assistant_conversations WHERE id=?').get(ticket.id),before);
  assert.equal(app.db.prepare('SELECT count(*) AS n FROM assistant_messages').get().n,messages);
  assert.equal(app.db.prepare('SELECT count(*) AS n FROM assistant_offers').get().n,0);
  assert.equal(app.db.prepare("SELECT count(*) AS n FROM portal_audit WHERE action='assistant.access.revoke'").get().n,0);
},{boundary:'after-identity',target:ticket=>`/api/assistant/owner/conversations/${ticket.id}/${action}`,authorityOnly:true}));

for(const path of ['/api/assistant/owner/notifications','/api/assistant/owner/notifications/dispatch'])test(`VPS current owner is required for ${path}`,async()=>fixture(async({app,at,cookie})=>{
  const response=await at(path,path.endsWith('/dispatch')?post(cookie,{}):{headers:{Cookie:cookie}});
  assert.equal(response.status,403);assert.ok(readSession(app.db,cookie));
},{boundary:'after-identity',target:path,authorityOnly:true}));

test('VPS SQL lock rejects revoke and its audit when the original owner logs out before the batch',async()=>fixture(async({app,at,cookie,ticket})=>{
  const response=await at(`/api/assistant/owner/conversations/${ticket.id}/access/revoke`,post(cookie,{}));
  assert.equal(response.status,403);
  assert.equal(app.db.prepare('SELECT token_revoked_at FROM assistant_conversations WHERE id=?').get(ticket.id).token_revoked_at,null);
  assert.equal(app.db.prepare("SELECT count(*) AS n FROM portal_audit WHERE action='assistant.access.revoke'").get().n,0);
},{boundary:'before-write',target:ticket=>`/api/assistant/owner/conversations/${ticket.id}/access/revoke`}));

for(const action of ['messages','handoff'])test(`VPS guest ${action} cannot commit after capability revocation at the write boundary`,async()=>fixture(async({app,at,ticket})=>{
  const path=`/api/assistant/conversations/${ticket.id}/${action}`;
  const options=post('',action==='messages'?{content:'Must not be committed',idempotencyKey:randomUUID()}:{name:'Must not be committed',email:'private@example.test',phone:''});
  options.headers['X-KnaBa-Conversation']=ticket.token;
  const response=await at(path,options);assert.equal(response.status,404);
  assert.equal(app.db.prepare('SELECT count(*) AS n FROM assistant_messages').get().n,1);
  assert.equal(app.db.prepare('SELECT contact_name FROM assistant_conversations WHERE id=?').get(ticket.id).contact_name,'Private contact');
  assert.equal(app.db.prepare('SELECT count(*) AS n FROM assistant_notifications').get().n,0);
},{boundary:'before-write',target:ticket=>`/api/assistant/conversations/${ticket.id}/${action}`,guest:true}));

test('VPS expired reads and mutations have the same concealed response as a missing capability',async()=>fixture(async({app,at,cookie,ticket})=>{
  const path=`/api/assistant/conversations/${ticket.id}`,headers={'X-KnaBa-Conversation':ticket.token};
  const absent=await at(path),concealed=await absent.text();assert.equal(absent.status,404);
  const read=await at(path,{headers});assert.equal(read.status,404);assert.equal(await read.text(),concealed);
  for(const [suffix,body] of [['messages',{content:'Expired',idempotencyKey:randomUUID()}],['handoff',{name:'Expired',email:'',phone:''}]]){
    const options=post('',body);Object.assign(options.headers,headers);
    const response=await at(path+'/'+suffix,options);assert.equal(response.status,404);assert.equal(await response.text(),concealed);
  }
  const history=await at(`/api/assistant/owner/conversations/${ticket.id}`,{headers:{Cookie:cookie}});
  assert.equal(history.status,200);assert.match(await history.text(),/Private history/);
  assert.equal(app.db.prepare('SELECT count(*) AS n FROM assistant_messages').get().n,1);
},{ageMs:7*86400000+1000}));

test('VPS audit failure atomically rolls back revocation and keeps the original guest access',async()=>fixture(async({app,at,cookie,ticket})=>{
  app.db.exec("CREATE TRIGGER synthetic_assistant_audit_abort BEFORE INSERT ON portal_audit WHEN NEW.action='assistant.access.revoke' BEGIN SELECT RAISE(ABORT,'Synthetic audit failure'); END");
  const response=await at(`/api/assistant/owner/conversations/${ticket.id}/access/revoke`,post(cookie,{}));
  assert.equal(response.status,503);assert.doesNotMatch(await response.text(),/Synthetic audit failure/);
  assert.equal(app.db.prepare('SELECT token_revoked_at FROM assistant_conversations WHERE id=?').get(ticket.id).token_revoked_at,null);
  assert.equal((await at(`/api/assistant/conversations/${ticket.id}`,{headers:{'X-KnaBa-Conversation':ticket.token}})).status,200);
}));
