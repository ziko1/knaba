import {afterAll,afterEach,beforeAll,describe,it,expect} from 'vitest';
import * as OTPAuth from 'otpauth';
import {randomUUID} from 'node:crypto';
import {Database} from '../apps/api/database.ts';
import {hashPassword,hashToken,csrfFor} from '../apps/api/auth.ts';
import {createFederationLoginPgFixture,responseCookie,syntheticLoginPassword,syntheticLoginSecret} from './fixtures/site-federation-login-pg.ts';

const postgres=process.env.DATABASE_URL?describe:describe.skip;
postgres('F3 login through actual signed HTTP and PostgreSQL',()=>{
 let db:Database,passwordHash:string;const cleanup:Array<()=>Promise<void>>=[];
 beforeAll(async()=>{expect(process.env.APP_MODE).toBe('TEST');db=new Database();await db.migrate();passwordHash=await hashPassword(syntheticLoginPassword);});
 afterEach(async()=>{await Promise.all(cleanup.splice(0).map(fn=>fn()));});afterAll(async()=>{await db?.close();});
 const fixture=(patch:Parameters<typeof createFederationLoginPgFixture>[3]={})=>createFederationLoginPgFixture(db,passwordHash,cleanup,patch);
 const count=async(company:string,table:string)=>Number((await db.query(`SELECT count(*)::integer AS n FROM ${table} WHERE company_id=$1`,[company])).rows[0].n);
 const childCount=(company:string)=>count(company,'site_federation_session_authorities');
 async function noSecrets(company:string,secrets:string[]){
  for(const table of ['site_federation_login_requests','site_federation_session_authorities','site_federation_operations','audit_log','command_receipts']){
   const json=JSON.stringify((await db.query(`SELECT * FROM ${table} WHERE company_id=$1`,[company])).rows);
   for(const secret of [...secrets,syntheticLoginPassword])expect(json).not.toContain(secret);
   expect(json).not.toContain('"otp"');expect(json).not.toContain('"codeVerifier"');
  }
 }
 it('creates one current company-scoped WEB child, stores hashes and grants no device or roles',async()=>{
  const f=await fixture(),beforeUsers=(await db.query("SELECT id,data FROM aggregates WHERE company_id=$1 AND kind='user' ORDER BY id",[f.company])).rows,pending=await f.prepare();
  const response=await f.confirm(pending);expect(response.status).toBe(200);const token=responseCookie(response,'knaba_session')!;expect(token).toMatch(/^KF3\.[A-Za-z0-9_-]{43}$/);
  expect(await response.json()).toMatchObject({actor:{userId:'erp-user',companyId:f.company},returnPath:'/console'});expect(await childCount(f.company)).toBe(1);
  expect((await db.query("SELECT id,data FROM aggregates WHERE company_id=$1 AND kind='user' ORDER BY id",[f.company])).rows).toEqual(beforeUsers);
  expect((await db.query("SELECT id FROM aggregates WHERE company_id=$1 AND kind IN('device','device_enrollment')",[f.company])).rows).toHaveLength(0);
  expect((await f.web('/api/v1/me',undefined,'knaba_session='+token)).status).toBe(200);
  await noSecrets(f.company,[token,token.slice(4)]);
 });
 it('uses S256, exact callback state/ERP issuer/client/platform and one concurrent native redemption',async()=>{
  const f=await fixture(),pending=await f.prepare('NATIVE'),confirmed=await f.confirm(pending);expect(confirmed.status).toBe(200);expect(responseCookie(confirmed,'knaba_session')).toBeUndefined();
  const body=await confirmed.json(),callback=new URL(body.authorizationResponseUrl);expect(callback.origin+callback.pathname).toBe('https://app.example.invalid/auth/android');
  expect([...callback.searchParams.keys()].sort()).toEqual(['code','iss','state']);expect(callback.searchParams.get('state')).toBe(pending.state);expect(callback.searchParams.get('iss')).toBe(f.config.erpOrigin+'/auth/federation');
  const code=callback.searchParams.get('code')!,calls=f.source.calls;expect((await f.redeem(code,'w'.repeat(43))).status).toBe(401);expect(f.source.calls).toBe(calls);expect(await childCount(f.company)).toBe(0);
  expect((await f.redeem(code,pending.verifier,{redirectUri:'https://foreign.example.invalid/callback'})).status).toBe(409);
  const results=await Promise.all([f.redeem(code),f.redeem(code)]);expect(results.map(r=>r.status).sort()).toEqual([200,409]);expect(await childCount(f.company)).toBe(1);
  const success=results.find(r=>r.status===200)!,token=responseCookie(success,'knaba_session')!;expect(token).toMatch(/^KF3\./);expect((await f.redeem(code)).status).toBe(409);
  const child=(await db.query('SELECT authority_data FROM site_federation_session_authorities WHERE company_id=$1',[f.company])).rows[0].authority_data;expect(child).toMatchObject({clientId:'android',clientKind:'NATIVE',platform:'ANDROID',redirectUri:'https://app.example.invalid/auth/android'});
  await noSecrets(f.company,[code,code.slice(4),pending.verifier,token,token.slice(4)]);
 });
 it('pins the WEB parent cookie while NATIVE ignores an unrelated system-browser ERP cookie',async()=>{
  const f=await fixture(),first=await f.auth.createSession('erp-user'),second=await f.auth.createSession('erp-other');
  const web=await f.prepare('WEB','knaba_session='+first.token),calls=f.source.calls;
  expect((await f.confirm(web,undefined,'knaba_session='+second.token+'; __Host-knaba-federation-flow='+web.flow)).status).toBe(401);expect(f.source.calls).toBe(calls);expect(await childCount(f.company)).toBe(0);
  const native=await f.prepare('NATIVE','knaba_session='+first.token),response=await f.confirm(native,undefined,'knaba_session='+second.token+'; __Host-knaba-federation-flow='+native.flow);
  expect(response.status).toBe(200);expect(responseCookie(response,'knaba_session')).toBeUndefined();expect(await childCount(f.company)).toBe(0);
 });
 it('requires the actual ERP TOTP and consumes its counter before code/session issuance',async()=>{
  const f=await fixture({mfa:true}),pending=await f.prepare();expect((await f.status(pending)).requiresErpMfa).toBe(true);
  expect((await f.confirm(pending)).status).toBe(401);expect(await childCount(f.company)).toBe(0);
  const otp=new OTPAuth.TOTP({issuer:'KNABA DE',algorithm:'SHA1',digits:6,period:30,secret:OTPAuth.Secret.fromBase32(syntheticLoginSecret)}).generate();
  const response=await f.confirm(pending,otp);expect(response.status).toBe(200);
  const child=(await db.query('SELECT authority_data FROM site_federation_session_authorities WHERE company_id=$1',[f.company])).rows[0].authority_data;
  expect(child.erpMfaAt).toBeTruthy();expect(Number((await db.query('SELECT totp_last_counter FROM auth_credentials WHERE company_id=$1 AND user_id=$2',[f.company,'erp-user'])).rows[0].totp_last_counter)).toBeGreaterThan(0);
  const token=responseCookie(response,'knaba_session')!,profile=await(await f.web('/api/v1/me',undefined,'knaba_session='+token)).json();expect(profile.actor.mfaVerifiedAt).toBe(child.erpMfaAt);
 });
 it('denies the production privileged branch when no ERP MFA factor is configured',async()=>{
  const f=await fixture({mode:'PRODUCTION',roles:['OWNER']}),pending=await f.prepare();expect((await f.status(pending)).requiresErpMfa).toBe(true);
  const response=await f.confirm(pending);expect(response.status).toBe(401);expect(await childCount(f.company)).toBe(0);expect(response.headers.get('set-cookie')).toBeNull();
 });
 it('serializes a real source FENCE after online proof and before the issuing transaction',async()=>{
  const f=await fixture(),pending=await f.prepare();let fenced=false;
  f.source.afterProof=async input=>{if(input.purpose==='SESSION_ISSUE'&&!fenced){fenced=true;expect((await f.fence()).status).toBe(200);}};
  const response=await f.confirm(pending);expect(fenced).toBe(true);expect(response.status).toBe(401);expect(await childCount(f.company)).toBe(0);expect(response.headers.get('set-cookie')).toBeNull();
  expect((await db.query('SELECT state FROM site_federation_login_requests WHERE company_id=$1 AND id=$2',[f.company,pending.id])).rows[0].state).toBe('SOURCE_APPROVED');
 });
 it('suppresses a freshly committed cookie if source revocation wins before egress',async()=>{
  const f=await fixture(),pending=await f.prepare();let fenced=false;
  f.source.afterProof=async input=>{if(input.purpose==='SESSION_USE'&&!fenced){fenced=true;expect((await f.fence()).status).toBe(200);}};
  const response=await f.confirm(pending);expect(fenced).toBe(true);expect(response.status).toBe(401);expect(await childCount(f.company)).toBe(1);expect(response.headers.get('set-cookie')).toBeNull();
  expect(await response.text()).not.toContain('KF3.');
 });
 it('rejects terminal F1 unlink committed between proof and mint',async()=>{
  const f=await fixture(),pending=await f.prepare();let unlinked=false;
  f.source.afterProof=async input=>{if(input.purpose==='SESSION_ISSUE'&&!unlinked){unlinked=true;await db.transaction(f.company,'erp-user',tx=>f.bindings.revokeIn(tx,f.binding.id,f.binding.version));}};
  const response=await f.confirm(pending);expect(unlinked).toBe(true);expect(response.status).toBe(403);expect(await childCount(f.company)).toBe(0);expect(response.headers.get('set-cookie')).toBeNull();
 });
 it('checks current ERP login policy again after asynchronous source I/O',async()=>{
  const f=await fixture(),pending=await f.prepare();let changed=false;f.source.afterProof=async()=>{f.disablePolicy();changed=true;};
  const response=await f.confirm(pending);expect(changed).toBe(true);expect(response.status).toBe(503);expect(await childCount(f.company)).toBe(0);expect(response.headers.get('set-cookie')).toBeNull();
 });
 it('uses the PostgreSQL clock after company-lock wait and rejects an expired witness',async()=>{
  const f=await fixture(),pending=await f.prepare();f.source.proofMs=250;let locked=false,release:Promise<void>|undefined;
  f.source.afterProof=async input=>{if(input.purpose!=='SESSION_ISSUE'||locked)return;const connection=await db.pool.connect();await connection.query('SELECT pg_advisory_lock(hashtext($1))',[f.company]);locked=true;
   release=new Promise<void>((resolve,reject)=>{setTimeout(()=>{void connection.query('SELECT pg_advisory_unlock(hashtext($1))',[f.company]).then(()=>{connection.release();resolve();},error=>{connection.release(true);reject(error);});},650);});
  };
  const response=await f.confirm(pending);await release;expect(locked).toBe(true);expect(response.status).toBe(401);expect(await childCount(f.company)).toBe(0);expect(response.headers.get('set-cookie')).toBeNull();
 });
 it('does not redeem a native code after the pinned ERP credential changes',async()=>{
  const f=await fixture(),pending=await f.prepare('NATIVE'),response=await f.confirm(pending);expect(response.status).toBe(200);const code=new URL((await response.json()).authorizationResponseUrl).searchParams.get('code')!;
  await db.transaction(f.company,'SYNTHETIC_CREDENTIAL_ROTATION',tx=>tx.query('UPDATE auth_credentials SET password_hash=$3 WHERE company_id=$1 AND user_id=$2',[f.company,'erp-user','replaced-synthetic-verifier']));
  const redeemed=await f.redeem(code);expect(redeemed.status).toBe(401);expect(await childCount(f.company)).toBe(0);expect(redeemed.headers.get('set-cookie')).toBeNull();
 });
 it('keeps local ERP logout available during a source/config outage',async()=>{
  const f=await fixture(),pending=await f.prepare(),issued=await f.confirm(pending);expect(issued.status).toBe(200);const token=responseCookie(issued,'knaba_session')!;
  f.source.outage=true;f.disablePolicy();const calls=f.source.calls,response=await f.web('/api/v1/auth/logout',{},'knaba_session='+token,csrfFor(token));expect(response.status).toBe(201);expect(await response.json()).toEqual({ok:true});expect(f.source.calls).toBe(calls);
  expect((await db.query('SELECT revoked_at FROM auth_sessions WHERE company_id=$1 AND token_hash=$2',[f.company,hashToken(token)])).rows[0].revoked_at).not.toBeNull();
  expect((await db.query('SELECT state FROM site_federation_session_authorities WHERE company_id=$1',[f.company])).rows[0].state).toBe('REVOKED');
 });
 it('requires the mandatory child and the issuing company even with an ordinary session row',async()=>{
  const f=await fixture(),other=await fixture(),pending=await f.prepare(),response=await f.confirm(pending);expect(response.status).toBe(200);const token=responseCookie(response,'knaba_session')!;
  expect((await other.web('/api/v1/me',undefined,'knaba_session='+token)).status).toBe(401);expect(other.source.calls).toBe(0);
  await db.query('DELETE FROM site_federation_session_authorities WHERE company_id=$1',[f.company]);
  expect((await f.web('/api/v1/me',undefined,'knaba_session='+token)).status).toBe(401);expect((await db.query('SELECT revoked_at FROM auth_sessions WHERE token_hash=$1',[hashToken(token)])).rows[0].revoked_at).toBeNull();
 });
 it('enforces immutable child/request identity and terminal session revocation in SQL',async()=>{
  const f=await fixture(),pending=await f.prepare(),response=await f.confirm(pending);expect(response.status).toBe(200);const token=responseCookie(response,'knaba_session')!;
  await expect(db.query("UPDATE site_federation_session_authorities SET authority_data=jsonb_set(authority_data,'{subject}','\"another-subject\"') WHERE company_id=$1",[f.company])).rejects.toMatchObject({code:'23514'});
  await expect(db.query("UPDATE site_federation_login_requests SET request_data=jsonb_set(request_data,'{clientId}','\"another-client\"') WHERE company_id=$1",[f.company])).rejects.toMatchObject({code:'23514'});
  expect((await f.web('/api/v1/auth/logout',{},'knaba_session='+token,csrfFor(token))).status).toBe(201);
  await expect(db.query("UPDATE site_federation_session_authorities SET state='ACTIVE',version=version+1,revoked_at=NULL WHERE company_id=$1",[f.company])).rejects.toMatchObject({code:'23514'});
 });
 it('blocks self enrollment receipt replay while preserving independent ERP password enrollment',async()=>{
  const f=await fixture(),local=await f.web('/api/v1/auth/login',{email:'f3-user@example.invalid',password:syntheticLoginPassword});expect(local.status).toBe(201);const localToken=responseCookie(local,'knaba_session')!;
  const key=randomUUID(),envelope={input:{employeeId:'erp-user'},idempotency_key:key},enrolled=await f.web('/api/v1/commands/device.enroll',envelope,'knaba_session='+localToken,csrfFor(localToken));expect(enrolled.status).toBe(201);const enrollment=await enrolled.json();expect(enrollment.token).toBeTruthy();
  const pending=await f.prepare(),issued=await f.confirm(pending);expect(issued.status).toBe(200);const token=responseCookie(issued,'knaba_session')!;
  const replay=await f.web('/api/v1/commands/device.enroll',envelope,'knaba_session='+token,csrfFor(token));expect(replay.status).toBe(403);expect(await replay.json()).toMatchObject({code:'LOCAL_ERP_REAUTH_REQUIRED'});
  expect((await db.query("SELECT id FROM aggregates WHERE company_id=$1 AND kind='device_enrollment'",[f.company])).rows).toHaveLength(1);
 });
 it('fences actual private blob bytes after asynchronous I/O and before file headers',async()=>{
  const f=await fixture(),pending=await f.prepare(),issued=await f.confirm(pending);expect(issued.status).toBe(200);const token=responseCookie(issued,'knaba_session')!,blobId=randomUUID(),assetId=randomUUID(),bytes=Buffer.from('F3 synthetic private photograph bytes');
  await f.storage.put({id:blobId,companyId:f.company,ownerId:'erp-user',bytes,mimeType:'image/jpeg'});
  await db.transaction(f.company,'erp-user',tx=>tx.add('media_asset',{uploadedBy:'erp-user',blobKey:blobId,visibility:'INTERNAL',state:'RECEIVED',fileName:'synthetic.jpg'},assetId));
  const read=f.storage.get.bind(f.storage);let fenced=false;f.storage.get=async(company,id)=>{const blob=await read(company,id);expect((await f.fence()).status).toBe(200);fenced=true;return blob;};
  const response=await f.web('/api/v1/media/'+assetId+'/file',undefined,'knaba_session='+token);expect(fenced).toBe(true);expect(response.status).toBe(401);expect(response.headers.get('content-disposition')).toBeNull();expect(await response.text()).not.toContain(bytes.toString());
 });
 it('closes an active SSE subscription after a genuine source-session fence within sixty seconds',async()=>{
  const f=await fixture(),pending=await f.prepare(),issued=await f.confirm(pending);expect(issued.status).toBe(200);const token=responseCookie(issued,'knaba_session')!;
  const abort=new AbortController(),stream=await fetch(f.base+'/api/v1/events',{headers:{cookie:'knaba_session='+token,origin:f.config.erpOrigin},signal:abort.signal});expect(stream.status).toBe(200);
  const start=Date.now();expect((await f.fence()).status).toBe(200);const reader=stream.body!.getReader();let content='';const deadline=setTimeout(()=>abort.abort(),10000);
  try{for(;;){const item=await reader.read();if(item.done)break;content+=Buffer.from(item.value).toString();}}finally{clearTimeout(deadline);abort.abort();}
  expect(content).toContain('event: access_revoked');expect(Date.now()-start).toBeLessThan(60000);
 },15000);
 it('separates stable approval receipts from owned fresh status and rejects read-operation replay',async()=>{
  const f=await fixture(),pending=await f.start(),approved=await f.approve(pending),before=await childCount(f.company);
  const retry=await f.authority('LOGIN_APPROVE',approved.payload,approved.operationId);expect(retry.status).toBe(200);expect(retry.body.receipt.result.version).toBe(approved.version);expect(await childCount(f.company)).toBe(before);
  const payload={requestId:pending.id,requestBinding:approved.payload.requestBinding,...f.sourceRef()},operation=randomUUID(),status=await f.authority('LOGIN_STATUS',payload,operation);expect(status.status).toBe(200);expect(status.body.receipt.result.state).toBe('SOURCE_APPROVED');
  expect((await f.authority('LOGIN_STATUS',payload,operation)).body.error.code).toBe('FEDERATION_REPLAY');
  expect((await f.authority('LOGIN_STATUS',{...payload,subject:'another-source-user'})).status).toBe(409);
  expect((await f.fence()).status).toBe(200);expect((await f.authority('LOGIN_STATUS',payload)).status).toBe(401);
 });
});
