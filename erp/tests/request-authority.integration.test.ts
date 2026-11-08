import {afterAll,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {Request,Response} from 'express';
import {Database} from '../apps/api/database.ts';
import {Engine} from '../apps/api/engine.ts';
import {AuthService,hashPassword,hashToken,verifyPassword} from '../apps/api/auth.ts';
import {ApiController} from '../apps/api/http.ts';
import {assertResponseAuthority} from '../apps/api/request-authority.ts';
import type {PrivateBlobStore} from '../packages/storage/index.ts';

const postgres=process.env.DATABASE_URL?describe:describe.skip;
const password='Synthetic original fence password 123!';
function deferred(){let resolve!:()=>void;const promise=new Promise<void>(r=>{resolve=r;});return {promise,resolve};}
const response=()=>({set:vi.fn(),send:vi.fn(),clearCookie:vi.fn()}) as unknown as Response;

// Actual PostgreSQL, actual AuthService/Engine and actual row/receipt rollback.
// Controlled scheduling makes the race reproducible; no physical-device/live claim.
postgres('PostgreSQL original request authority and revocation ordering',()=>{
 let db:Database,engine:Engine,auth:AuthService,company:string,token:string,csrf:string,originalHash:string;
 const request=(device=false)=>({get:(name:string)=>({origin:'https://erp.example.test','x-csrf-token':csrf,...device?{authorization:`Bearer ${token}`}:{cookie:`knaba_session=${token}`}} as Record<string,string>)[name],query:{},ip:'127.0.0.1'}) as unknown as Request;
 const execute=(actor:any)=>engine.execute(actor,'fence.probe',{input:{},idempotency_key:'original-request-probe'});
 beforeAll(async()=>{expect(process.env.APP_MODE).toBe('TEST');db=new Database();await db.migrate();engine=new Engine(db,'TEST');originalHash=await hashPassword(password);});
 beforeEach(async()=>{
  company=`request-fence-${randomUUID()}`;
  await db.transaction(company,'SYNTHETIC_FIXTURE',async tx=>{
   await tx.add('user',{name:'Synthetic employee',active:true,roles:['EMPLOYEE'],permissions:['identity.self','device.manage','scope.company']},'employee');
   await tx.query('INSERT INTO auth_credentials(user_id,company_id,password_hash) VALUES($1,$2,$3)',['employee',company,originalHash]);
  });
  auth=new AuthService(db,engine,{companyId:company,appMode:'TEST',publicOrigin:'https://erp.example.test'});
  const issued=await auth.createSession('employee');token=issued.token;csrf=issued.csrfToken;
  engine.registry['fence.probe']={permission:'identity.self',schema:z.object({}).strict(),handler:async c=>{const row=await c.tx.add('fence_effect',{value:'synthetic private result'});await c.tx.event('fence.effect',{id:row.id});return row;}};
 });
 afterAll(async()=>{await db?.close();});
 async function state(){return {effects:(await db.query("SELECT id FROM aggregates WHERE company_id=$1 AND kind='fence_effect'",[company])).rows,receipts:(await db.query('SELECT result FROM command_receipts WHERE company_id=$1',[company])).rows,outbox:(await db.query("SELECT id FROM outbox WHERE company_id=$1 AND type='fence.effect'",[company])).rows};}
 async function waitForCompanyWaiter(completed:()=>boolean){
  const deadline=Date.now()+2000;
  while(Date.now()<deadline){
   if(completed())return false;
   const rows=(await db.query("SELECT 1 FROM pg_locks WHERE locktype='advisory' AND objid=(hashtext($1)::bigint & 4294967295)::oid AND objsubid=1 AND NOT granted LIMIT 1",[company])).rows;
   if(rows.length)return true;
   await new Promise(resolve=>setTimeout(resolve,10));
  }
  throw Error('Expected a company-lock waiter within two seconds');
 }
 it('serializes logout behind an already acquired company lock',async()=>{
  const authenticated=deferred(),continueLogout=deferred(),locked=deferred(),releaseLock=deferred(),originalMutation=auth.mutation.bind(auth);
  auth.mutation=async(...args)=>{const result=await originalMutation(...args);authenticated.resolve();await continueLogout.promise;return result;};
  let completed=false;
  const logout=auth.logout(request(),response()).finally(()=>{completed=true;});
  await authenticated.promise;
  const holder=db.transaction(company,'SYNTHETIC_LOCK_HOLDER',async()=>{locked.resolve();await releaseLock.promise;});
  await locked.promise;continueLogout.resolve();
  try{
   expect(await waitForCompanyWaiter(()=>completed)).toBe(true);
   expect((await db.query('SELECT revoked_at FROM auth_sessions WHERE token_hash=$1',[hashToken(token)])).rows[0].revoked_at).toBeNull();
  }finally{releaseLock.resolve();auth.mutation=originalMutation;await holder;await logout;}
  expect((await db.query('SELECT revoked_at FROM auth_sessions WHERE token_hash=$1',[hashToken(token)])).rows[0].revoked_at).not.toBeNull();
 });

 it('rejects a command queued behind committed revocation before effects, receipts or outbox',async()=>{
  const {actor}=await auth.authenticate(request()),locked=deferred(),release=deferred();
  const revocation=db.transaction(company,'SYNTHETIC_REVOCATION',async tx=>{
   await tx.query('UPDATE auth_sessions SET revoked_at=now() WHERE token_hash=$1 AND company_id=$2',[hashToken(token),company]);
   await auth.createSession('employee',false,false,tx);locked.resolve();await release.promise;
  });
  await locked.promise;let completed=false;
  const pending=execute(actor).then(value=>({value}),error=>({error})).finally(()=>{completed=true;});
  try{expect(await waitForCompanyWaiter(()=>completed)).toBe(true);}finally{release.resolve();await revocation;}
  expect(await pending).toMatchObject({error:{code:'NEEDS_REAUTH'}});
  expect(await state()).toEqual({effects:[],receipts:[],outbox:[]});
  expect((await db.query('SELECT token_hash FROM auth_sessions WHERE company_id=$1 AND revoked_at IS NULL',[company])).rows).toHaveLength(1);
 });

 it('uses the current SQL clock and rolls back effects when a session expires inside the transaction',async()=>{
  const {actor}=await auth.authenticate(request());
  let entered=false;
  engine.registry['fence.probe']!.handler=async c=>{
   entered=true;await c.tx.add('fence_effect',{value:'synthetic'});await c.tx.event('fence.effect',{});
   // Set the boundary after lock acquisition, so a busy CI pool cannot make the
   // session expire before this test actually reaches asynchronous command work.
   await (c.tx as any).query("UPDATE auth_sessions SET expires_at=clock_timestamp()+interval '100 milliseconds' WHERE token_hash=$1 AND company_id=$2",[hashToken(token),company]);
   await (c.tx as any).query('SELECT pg_sleep(0.15)');return {private:'synthetic'};
  };
  await expect(execute(actor)).rejects.toMatchObject({code:'NEEDS_REAUTH'});
  expect(entered).toBe(true);
  expect(await state()).toEqual({effects:[],receipts:[],outbox:[]});
 });

 it('commits actual password rotation and its receipt, emits only ACK, then denies the original session',async()=>{
  const req=request(),{actor}=await auth.authenticate(req),nextPassword='Synthetic rotated fence password 456!';
  const envelope={input:{currentPassword:password,newPassword:nextPassword},idempotency_key:'self-password-rotation'};
  const result=await engine.execute(actor,'user.password.rotate',envelope);
  expect(result).toEqual({ok:true,reauthenticationRequired:true});
  await expect(assertResponseAuthority(req,result)).resolves.toBeUndefined();
  await expect(assertResponseAuthority(req,{...result})).rejects.toMatchObject({code:'NEEDS_REAUTH'});
  const credential=(await db.query('SELECT password_hash FROM auth_credentials WHERE company_id=$1 AND user_id=$2',[company,'employee'])).rows[0];
  expect(await verifyPassword(nextPassword,credential.password_hash)).toBe(true);expect(await verifyPassword(password,credential.password_hash)).toBe(false);
  expect((await state()).receipts).toEqual([{result:{ok:true,reauthenticationRequired:true}}]);
  await expect(engine.execute(actor,'user.password.rotate',envelope)).rejects.toMatchObject({code:'NEEDS_REAUTH'});
  await expect(engine.readEntities(actor,'user')).rejects.toMatchObject({code:'NEEDS_REAUTH'});
 });

 it('rechecks the exact native token and current disabled user inside SQL transactions',async()=>{
  await db.transaction(company,'SYNTHETIC_DEVICE',tx=>tx.add('device',{employeeId:'employee',active:true,tokenHash:hashToken(token),tokenExpiresAt:new Date(Date.now()+3600000).toISOString()},'device'));
  const {actor}=await auth.authenticate(request(true));
  await db.transaction(company,'SYNTHETIC_TOKEN_ROTATION',async tx=>{const device=await tx.get('device','device');await tx.save(device,{...device.data,tokenHash:hashToken('synthetic-replacement-device-token')});});
  await expect(execute(actor)).rejects.toMatchObject({code:'NEEDS_REAUTH'});
  const cookieActor=(await auth.authenticate(request())).actor;
  await db.transaction(company,'SYNTHETIC_DISABLE',async tx=>{const user=await tx.get('user','employee');await tx.save(user,{...user.data,active:false});});
  await expect(execute(cookieActor)).rejects.toMatchObject({code:'NEEDS_REAUTH'});
  expect(await state()).toEqual({effects:[],receipts:[],outbox:[]});
 });

 it('rejects private read egress after membership revocation with the original session still valid',async()=>{
  await db.transaction(company,'SYNTHETIC_CUSTOMER_SCOPE',async tx=>{
   const user=await tx.get('user','employee');await tx.save(user,{...user.data,roles:['CLIENT'],permissions:['commerce.read']});
   await tx.add('customer',{name:'Synthetic private customer'},'customer');
   await tx.add('customer_membership',{userId:'employee',customerId:'customer',permissions:['VIEW'],active:true},'membership');
  });
  const req=request(),{actor}=await auth.authenticate(req),first=await engine.readEntities(actor,'customer');expect(first).toHaveLength(1);
  await db.transaction(company,'SYNTHETIC_SCOPE_REVOCATION',async tx=>{const membership=await tx.get('customer_membership','membership');await tx.save(membership,{...membership.data,active:false});});
  const second=await engine.readEntities(actor,'customer');expect(second).toEqual([]);
  expect((await db.query('SELECT revoked_at FROM auth_sessions WHERE token_hash=$1',[hashToken(token)])).rows[0].revoked_at).toBeNull();
  await expect(assertResponseAuthority(req,{first,second})).rejects.toMatchObject({code:'NEEDS_REAUTH'});
 });

 it('suppresses private blob bytes when logout commits while storage is awaiting I/O',async()=>{
  await db.transaction(company,'SYNTHETIC_MEDIA',tx=>tx.add('media_asset',{uploadedBy:'employee',blobKey:'synthetic-private-blob',state:'READY'},'media'));
  const storage={provider:'POSTGRES',get:async()=>{await auth.logout(request(),response());return {bytes:Buffer.from('synthetic private bytes'),mimeType:'image/png',sha256:'synthetic-hash'};}} as unknown as PrivateBlobStore;
  const authorizeEntity=engine.authorizeEntity.bind(engine);
  engine.authorizeEntity=async(tx,userId,kind,id)=>({actor:await engine.actorIn(tx,userId),entity:await tx.get(kind,id)});
  const api=new ApiController({db,engine,companyId:company,appMode:'TEST',buildSha:'synthetic-sql',publicOrigin:'https://erp.example.test',storage}),res=response();
  try{await expect(api.file(request(),res,'media')).rejects.toMatchObject({code:'NEEDS_REAUTH'});}finally{engine.authorizeEntity=authorizeEntity;}
  expect(res.send).not.toHaveBeenCalled();expect(res.set).not.toHaveBeenCalled();
 });
});
