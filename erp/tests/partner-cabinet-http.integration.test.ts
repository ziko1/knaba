import 'reflect-metadata';
import {afterAll, afterEach, beforeAll, beforeEach, describe, expect, it} from 'vitest';
import {randomBytes, randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {DatabaseSync} from 'node:sqlite';
import {NestFactory} from '@nestjs/core';
import * as OTPAuth from 'otpauth';
import {Database} from '../apps/api/database.ts';
import {Engine} from '../apps/api/engine.ts';
import {hashPassword, sealSecret} from '../apps/api/auth.ts';
import {createApiModule} from '../apps/api/http.ts';
import {SiteIdentityFlow} from '../apps/api/site-identity-flow.ts';
import {PartnerCabinetAuthority} from '../apps/api/partner-cabinet.ts';
import {digest, parsePeerConfig, type FederationPeer} from '../packages/integrations/site-identity-protocol.mjs';

const password = 'Synthetic-partner-HTTP-2026';
const encryptionKey = 'synthetic-partner-HTTP-integration-secret';
const ownerTotp = 'JBSWY3DPEHPK3PXP';
const schema = 'knaba_partner_' + randomBytes(10).toString('hex');
const databaseUrl = process.env.DATABASE_URL;
if (process.env.CI && process.env.CI !== 'false' && !databaseUrl) throw Error('PARTNER_HTTP_CI_REQUIRES_POSTGRESQL');

type Identity = {cookie: string; csrf: string};
type Json = Record<string, any>;
type Cleanup = () => Promise<void> | void;
async function request(origin: string, path: string, identity?: Identity, body?: Json) {
  const res = await fetch(origin + '/api/v1/' + path, {
    method: body ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(10000),
    headers: {origin, ...(identity ? {cookie: identity.cookie, 'x-csrf-token': identity.csrf} : {}),
      ...(body ? {'content-type': 'application/json'} : {})},
    body: body && JSON.stringify(body),
  });
  return {status: res.status, body: await res.json() as Json, headers: res.headers};
}

async function tenant(db: Database, companyId: string, passwordHash: string, cleanups: Cleanup[], collidingUserId?: string) {
  // The issuer, subject, ERP user and customer IDs deliberately collide in the two tenants.
  const subject = 'same-site-account', customerId = 'same-customer', partnerEmail='same-partner@example.test';
  let userId = collidingUserId ?? '';
  const siteToken = randomBytes(32).toString('base64url');
  const now = Math.floor(Date.now()/1000);
  const sqlite = new DatabaseSync(':memory:');
  cleanups.push(() => sqlite.close());
  sqlite.exec(`
    CREATE TABLE vps_users(id TEXT PRIMARY KEY,email TEXT,disabled INTEGER);
    CREATE TABLE vps_sessions(token_hash TEXT PRIMARY KEY,user_id TEXT,created_at INTEGER,expires_at INTEGER);
    CREATE TABLE profiles(id TEXT PRIMARY KEY,name TEXT,email TEXT,requested_role TEXT,role TEXT,status TEXT,
      privacy_version TEXT,created_at TEXT,updated_at TEXT,version INTEGER,last_mutation TEXT);
    CREATE TABLE vps_staff_grants(user_id TEXT,purpose TEXT);
    CREATE TABLE portal_audit(id TEXT PRIMARY KEY,actor_id TEXT,action TEXT,entity_id TEXT,created_at TEXT);
    CREATE TABLE vps_site_identity_consents(
      id TEXT PRIMARY KEY, challenge_id TEXT, challenge_digest TEXT, nonce_digest TEXT, company_id TEXT, target_user_id TEXT,
      issuer TEXT, audience TEXT, trust_fingerprint TEXT, transport_fingerprint TEXT, site_user_id TEXT, session_hash TEXT,
      profile_version INTEGER, profile_fingerprint TEXT, grant_hash TEXT, created_at INTEGER, expires_at INTEGER,
      status TEXT DEFAULT 'CONSENTED', redeemed_fingerprint TEXT, redeemed_at INTEGER, UNIQUE(company_id,challenge_id)
    );
  `);
  sqlite.prepare('INSERT INTO vps_users VALUES(?,?,0)').run(subject,'partner@example.test');
  sqlite.prepare('INSERT INTO profiles VALUES(?,?,?,\'partner\',\'partner\',\'approved\',\'v1\',\'start\',\'approved\',1,\'approve\')')
    .run(subject, 'Synthetic Partner', 'partner@example.test');
  sqlite.prepare('INSERT INTO vps_sessions VALUES(?,?,?,?)').run(digest(siteToken),subject,now,now+3600);
  let peer: FederationPeer, siteAvailable = true;
  let beforeReply: (() => Promise<void>) | undefined;
  // Run the actual paired site modules, including their signed response and live SQLite lookup.
  const siteBase = new URL('../../corporate-site/vps/', import.meta.url);
  const {createSiteIdentityHandler} = await import(new URL('site-identity-http.mjs', siteBase).href);
  const {readSession} = await import(new URL('auth.mjs', siteBase).href);
  const options = {config: () => peer, localTest:true, sessionsEnabled: () => true};
  const handle = createSiteIdentityHandler(sqlite,options);
  const site = createServer(async (req,res) => {
    if (!siteAvailable) { res.writeHead(503); res.end(); return; }
    const readBody = async () => {const chunks:Buffer[]=[]; for await (const chunk of req) chunks.push(chunk); return Buffer.concat(chunks);};
    try {
      if (beforeReply) await beforeReply();
      const accountUser=readSession(sqlite,req.headers.cookie);
      const sameAccountSession=()=>Boolean(accountUser && readSession(sqlite,req.headers.cookie)?.token===accountUser.token);
      if (!await handle({req,res,url:new URL(req.url!, 'http://127.0.0.1'),readBody,accountUser,sameAccountSession})) {res.writeHead(404);res.end();}
    } catch {res.writeHead(500);res.end();}
  });
  site.listen(0,'127.0.0.1'); await once(site,'listening');
  cleanups.push(async()=>{site.closeAllConnections();await new Promise<void>(done=>site.close(()=>done()));});
  const siteAddress = site.address(); if (!siteAddress || typeof siteAddress === 'string') throw Error('EXPECTED_PORT');
  const siteOrigin = 'http://127.0.0.1:' + siteAddress.port;
  const engine=new Engine(db,'TEST');
  const siteIdentity=new SiteIdentityFlow(db,engine,{appMode:'TEST',companyId,encryptionKey},()=>peer);
  const app = await NestFactory.create(createApiModule({db,engine,siteIdentity,appMode:'TEST',companyId,
    buildSha:'synthetic-partner-http',encryptionKey,partnerCabinet:new PartnerCabinetAuthority(() => peer, () => true)}),{logger:false,rawBody:true});
  cleanups.push(()=>app.close());
  await app.listen(0,'127.0.0.1');
  const origin = await app.getUrl();
  peer = parsePeerConfig({companyId,issuer:'https://site.example.test/id',audience:'erp',version:1,active:true,
    erpOrigin:origin,siteOrigin,keyId:'knaba-federation-partner',secret:randomBytes(32).toString('base64url')},{localTest:true})!;
  const add = (kind:string,id:string,data:Json) => db.query('INSERT INTO aggregates(company_id,kind,id,data) VALUES($1,$2,$3,$4)',
    [companyId,kind,id,JSON.stringify(data)]);
  for (const [id,role] of [...(collidingUserId?[[collidingUserId,'PARTNER']]:[]),['owner','OWNER'],['client','CLIENT']]) {
    await add('user',id!,{active:true,roles:[role],email:role==='PARTNER'?partnerEmail:id+'@example.test',name:id});
    await db.query('INSERT INTO auth_credentials(company_id,user_id,password_hash,totp_secret) VALUES($1,$2,$3,$4)',
      [companyId,id,passwordHash,id==='owner'?sealSecret(ownerTotp,encryptionKey):null]);
  }
  await add('company',companyId,{name:'Synthetic company'});
  await add('customer',customerId,{active:true});
  await add('customer','other-customer',{active:true});
  await add('order','own-'+companyId,{customerId,status:'SCHEDULED',internalPrice:9999});
  await add('order','other-'+companyId,{customerId:'other-customer',status:'SCHEDULED'});
  const login = async (id=userId):Promise<Identity> => {
    const result = await request(origin,'auth/login',undefined,{email:id===userId?partnerEmail:id+'@example.test',password,
      ...(id==='owner'?{otp:new OTPAuth.TOTP({secret:ownerTotp}).generate()}:{})});
    expect(result.status,JSON.stringify(result.body)).toBe(201);
    return {cookie:result.headers.getSetCookie()[0]!.split(';')[0]!,csrf:result.body.csrfToken};
  };
  const owner = await login('owner');
  if (!collidingUserId) {
    const invite=await request(origin,'commands/user.invite',owner,{input:{name:'Synthetic partner',
      email:partnerEmail,roles:['PARTNER']},idempotency_key:randomUUID()});
    expect(invite.status,JSON.stringify(invite.body)).toBe(201);
    const activated=await request(origin,'auth/activate',undefined,{password,token:invite.body.token});
    expect(activated.status,JSON.stringify(activated.body)).toBe(201);
    expect(activated.body.actor.roles).toEqual(['PARTNER']);
    userId=activated.body.actor.userId;
  }
  const initial = await login();
  const unlinked=await request(origin,'partner/orders',initial);
  expect(unlinked.status).toBe(404);expect(unlinked.body.items).toBeUndefined();
  const initialLink = await request(origin,'auth/site-links/challenges',initial,{password});
  expect(initialLink.status,JSON.stringify(initialLink.body)).toBe(201);
  const challengeToken = new URLSearchParams(new URL(initialLink.body.redirectUrl).hash.slice(1)).get('link');
  const siteCookie='__Host-knaba-session='+siteToken;
  const csrf=await fetch(siteOrigin+'/auth/site-identity/session',{headers:{cookie:siteCookie}});
  expect(csrf.status).toBe(200);
  const csrfToken=(await csrf.json() as Json).csrfToken;
  async function sitePost(path:string, body:Json) {
    const response=await fetch(siteOrigin+'/auth/site-identity/'+path,{
      method:'POST',headers:{origin:siteOrigin,cookie:siteCookie,'content-type':'application/json',
        'x-knaba-request':'site-identity-v1','x-csrf-token':csrfToken},body:JSON.stringify(body),signal:AbortSignal.timeout(5000)});
    const value=await response.json() as Json;
    expect(response.status,JSON.stringify(value)).toBe(200);
    return value;
  }
  const preview=await sitePost('preview',{challengeToken});
  expect(preview.company.id).toBe(companyId);
  const consent=await sitePost('consent',{challengeToken,confirmed:true,previewProof:preview.previewProof});
  const grantToken=new URLSearchParams(new URL(consent.redirectUrl).hash.slice(1)).get('grant');
  const payload={grantToken,challengeToken};
  expect((await request(origin,'auth/site-links/preview',initial,payload)).status).toBe(201);
  const confirmed=await request(origin,'auth/site-links/confirm',initial,{...payload,confirmed:true});
  expect(confirmed.status,JSON.stringify(confirmed.body)).toBe(201);
  const bindingId:string=confirmed.body.binding.id;
  expect(confirmed.body.binding.status).toBe('ACTIVE');
  expect((await request(origin,'partner/orders',initial)).status).toBe(404);
  const manage = async (operation:'grant'|'revoke',expectedVersion?:number,key=randomUUID()) => request(origin,
    'commands/partner.access.'+operation,owner,{input:operation==='grant'?{userId,bindingId,customerId}:{userId},
      expected_version:expectedVersion,idempotency_key:key});
  const firstKey = randomUUID(), grant = await manage('grant',undefined,firstKey);
  expect(grant.status,JSON.stringify(grant.body)).toBe(201);
  const identity = await login();
  const get = (path:string, as:Identity=identity) => request(origin,path,as);
  return {companyId,userId,identity,initial,manage,get,login,firstKey,sqlite,
    unlink:()=>request(origin,'auth/site-links/unlink',identity,{id:bindingId,expectedVersion:1,password}),
    setSiteAvailable(value:boolean){siteAvailable=value;},
    beforeSecondCheck(change:()=>Promise<void>){
      let calls=0;
      beforeReply=async()=>{
        if (++calls===2) {beforeReply=undefined;await change();}
      };
    }};
}

describe.skipIf(!databaseUrl)('partner cabinet HTTP on isolated PostgreSQL and the signed SQLite site peer', () => {
  let admin:Database, db:Database, passwordHash:string, a:Awaited<ReturnType<typeof tenant>>, b:typeof a;
  const cleanups:Cleanup[]=[];
  beforeAll(async () => {
    expect(process.env.APP_MODE).toBe('TEST');
    const url = new URL(databaseUrl!);
    expect(['postgres:','postgresql:']).toContain(url.protocol);
    expect(['127.0.0.1','localhost']).toContain(url.hostname);
    expect(url.pathname).toMatch(/^\/knaba_(ci|test|bridge_ci|bridge_test)$/);
    expect(url.searchParams.has('options')).toBe(false);
    admin = new Database(url.href);
    await admin.query('CREATE SCHEMA '+schema);
    url.searchParams.set('options','-c search_path='+schema);
    db=new Database(url.href);
    await db.query(await readFile(new URL('./fixtures/partner-cabinet-http.sql',import.meta.url),'utf8'));
    passwordHash=await hashPassword(password);
  });
  beforeEach(async () => {
    const testId=randomBytes(4).toString('hex');
    a=await tenant(db,'tenant-a-'+testId,passwordHash,cleanups);
    b=await tenant(db,'tenant-b-'+testId,passwordHash,cleanups,a.userId);
  });
  afterEach(async () => {for (const close of cleanups.splice(0).reverse()) await close();});
  afterAll(async () => {
    await db?.close();
    if(admin){try{await admin.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE');}finally{await admin.close();}}
  });

  it('isolates both tenants and two customers within each, with exact minimal order fields',async()=>{
    for(const [own,foreign] of [[a,b],[b,a]] as const){
      const orderId='own-'+own.companyId;
      const list=await own.get('partner/orders');
      expect(list.status,JSON.stringify(list.body)).toBe(200);
      expect(list.body.items).toEqual([{id:orderId,status:'SCHEDULED',updatedAt:expect.any(String)}]);
      expect((await own.get('partner/orders/'+orderId)).body).toEqual(list.body.items[0]);
      const unknown=await own.get('partner/orders/unknown');
      expect(unknown.status).toBe(404);
      for(const id of ['other-'+own.companyId,'own-'+foreign.companyId]){
        const denied=await own.get('partner/orders/'+id);
        expect([denied.status,denied.body]).toEqual([unknown.status,unknown.body]);
      }
      expect((await own.get('partner/orders',foreign.identity)).status).toBe(401);
      expect((await own.get('partner/orders',own.initial)).status).toBe(401);
    }
  });
  it('reads dot-segment order IDs without changing paths or crossing a partner boundary',async()=>{
    for (const id of ['.','..']) {
      await db.query("INSERT INTO aggregates(company_id,kind,id,data) VALUES($1,'order',$2,$3)",[
        a.companyId,id,JSON.stringify({customerId:'same-customer',status:'CONFIRMED'})
      ]);
      await db.query("INSERT INTO aggregates(company_id,kind,id,data) VALUES($1,'order',$2,$3)",[
        b.companyId,id,JSON.stringify({customerId:'other-customer',status:'CONFIRMED'})
      ]);
      const path='partner/order?id='+encodeURIComponent(id);
      const own=await a.get(path), foreign=await b.get(path);
      expect([own.status,own.body]).toEqual([200,{id,status:'CONFIRMED',updatedAt:expect.any(String)}]);
      expect([foreign.status,foreign.body]).toEqual([404,(await b.get('partner/orders/missing')).body]);
      expect((await a.get(path,b.identity)).status).toBe(401);
      expect((await a.get(path+'&customerId=other-customer')).status).toBe(400);
    }
    expect((await a.get('partner/order')).status).toBe(400);
    expect((await a.get('partner/order?id=.&id=..')).status).toBe(400);
  });
  it('rejects a client, tenant selectors and generic order surfaces',async()=>{
    expect((await a.get('partner/orders',await a.login('client'))).status).toBe(403);
    expect((await a.get('partner/orders?companyId=tenant-b')).status).toBe(400);
    expect((await a.get('entities/order')).status).toBe(403);
    expect((await a.get('dashboard')).status).toBe(403);
  });
  it('serves no cached orders during a peer outage or after site logout',async()=>{
    b.setSiteAvailable(false);
    try{
      const unavailable=await b.get('partner/orders');
      expect(unavailable.status).toBe(503);expect(unavailable.body.items).toBeUndefined();
    }finally{b.setSiteAvailable(true);}
    expect((await b.get('partner/orders')).status).toBe(200);
    b.sqlite.exec('DELETE FROM vps_sessions');
    const revoked=await b.get('partner/orders');
    expect(revoked.status).toBe(401);expect(revoked.body.items).toBeUndefined();
    expect((await a.get('partner/orders')).status).toBe(200);
  });
  it('discards a projected order after site approval is withdrawn before response',async()=>{
    a.beforeSecondCheck(async()=>{
      a.sqlite.exec("UPDATE profiles SET status='blocked', version=version+1");
    });
    const result=await a.get('partner/orders/own-'+a.companyId);
    expect(result.status).toBe(401);
    expect(result.body.id).toBeUndefined();
    expect((await b.get('partner/orders')).status).toBe(200);
  });
  it('discards projected orders after a committed F2 unlink between the two site checks',async()=>{
    a.beforeSecondCheck(async()=>{
      const unlink=await a.unlink();
      expect(unlink.status,JSON.stringify(unlink.body)).toBe(201);
    });
    const result=await a.get('partner/orders');
    expect(result.status).toBe(404);
    expect(result.body.items).toBeUndefined();
    expect((await b.get('partner/orders')).status).toBe(200);
  });
  it('withholds a detail moved to another customer before delivery',async()=>{
    const orderId='own-'+a.companyId;
    a.beforeSecondCheck(async()=>{
      await db.query(`UPDATE aggregates SET data=jsonb_set(data,'{customerId}',to_jsonb($3::text)),version=version+1
        WHERE company_id=$1 AND kind='order' AND id=$2`,[a.companyId,orderId,'other-customer']);
    });
    const denied=await a.get('partner/orders/'+orderId);
    expect(denied.status).toBe(404);
    expect(denied.body.id).toBeUndefined();
  });
  it('requires an explicitly active ERP counterparty on every read',async()=>{
    await db.query("UPDATE aggregates SET data=data-'active' WHERE company_id=$1 AND kind='customer'",[a.companyId]);
    expect((await a.get('partner/orders')).status).toBe(403);
    expect((await b.get('partner/orders')).status).toBe(200);
  });
  it('revokes issued cookies and keeps a replayed grant from reactivating access',async()=>{
    const revoked=await a.manage('revoke',1);
    expect(revoked.status,JSON.stringify(revoked.body)).toBe(201);
    expect((await a.get('partner/orders')).status).toBe(401);
    const replay=await a.manage('grant',undefined,a.firstKey);
    expect(replay.status,JSON.stringify(replay.body)).toBe(201);
    const fresh=await a.login();
    expect((await a.get('partner/orders',fresh)).status).toBe(403);
  });
});
