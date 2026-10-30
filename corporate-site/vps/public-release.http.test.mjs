import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,symlink,open} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {request as httpRequest} from 'node:http';
import {createKnabaVpsServer} from './server.mjs';
import {openLocalDatabase} from './database.mjs';

const host='release.example.test',origin='https://'+host;
async function fixture(t,environment={}){
  const dir=await mkdtemp(join(tmpdir(),'knaba-release-http-'));
  const root=join(dir,'public');await mkdir(join(root,'downloads'),{recursive:true});
  await writeFile(join(root,'index.html'),'<!doctype html><html lang="de"><title>KNABA synthetic fixture</title></html>');
  await writeFile(join(root,'404.html'),'<!doctype html><title>Missing fixture</title>');
  const worker=join(dir,'worker.mjs');
  await writeFile(worker,"export default {fetch(){return new Response('Synthetic worker fixture',{status:501})}};");
  const dbPath=join(dir,'site.sqlite');const setup=openLocalDatabase(dbPath);setup.db.close();
  const app=await createKnabaVpsServer({dbPath,staticRoot:root,workerPath:pathToFileURL(worker).href,
    host:'127.0.0.1',port:0,origin,localTest:false,ownerEmail:'private-owner@example.test',releaseEnvironment:environment});
  t.after(async()=>{await app.close();await rm(dir,{recursive:true,force:true});});
  const at=(path,options={})=>new Promise((resolve,reject)=>{
    const request=httpRequest({hostname:'127.0.0.1',port:app.port,path,method:options.method||'GET',
      headers:{Host:host,'X-Forwarded-Proto':'https',...options.headers}},reply=>{
        const chunks=[];reply.on('data',chunk=>chunks.push(chunk));reply.on('error',reject);
        reply.on('end',()=>resolve(new Response(options.method==='HEAD'?null:Buffer.concat(chunks),{
          status:reply.statusCode,headers:Object.fromEntries(Object.entries(reply.headers).map(([key,value])=>[key,Array.isArray(value)?value.join(','):value]))
        })));
      });
    request.on('error',reject);request.end(options.body);
  });
  return {dir,root,app,at};
}

test('public release endpoint keeps six ordered languages, separates channels, excludes secrets and writes no customer data',async t=>{
  const environment={KNABA_RELEASE_STAGE:'prototype',KNABA_VERIFIED_WHATSAPP_NUMBER:'4915112345678',
    KNABA_VERIFIED_TELEGRAM_BOT:'KnabaPrototypeBot',KNABA_WORKING_ORIGIN:'https://working.example.test',
    KNABA_WORKING_ORIGIN_VERIFIED:'true',OWNER_EMAIL:'do-not-publish@example.test',
    TELEGRAM_BOT_TOKEN:'synthetic-private-do-not-publish',TURNSTILE_SECRET_KEY:'synthetic-private-turnstile'};
  const {app,at}=await fixture(t,environment);
  const tables=app.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
  const counts=()=>tables.map(({name})=>[name,app.db.prepare('SELECT COUNT(*) n FROM "'+name.replaceAll('"','""')+'"').get().n]);
  const before=counts();
  const response=await at('/api/public/release');assert.equal(response.status,200);
  assert.match(response.headers.get('cache-control'),/no-store/);
  assert.match(response.headers.get('content-type'),/application\/json/);
  const body=await response.text(),data=JSON.parse(body);
  assert.deepEqual(data.languages,['de','en','pl','lt','ru','uk']);assert.equal(data.defaultLanguage,'de');
  assert.equal(data.channels.whatsapp.url,'https://wa.me/4915112345678');
  assert.equal(data.channels.telegram.url,'https://t.me/KnabaPrototypeBot?start=website');
  assert.equal(data.migration.workingOrigin,'https://working.example.test');
  assert.equal(data.stage,'prototype');assert.equal(data.ios.status,'pending');
  assert.doesNotMatch(body,/do-not-publish|private-turnstile|OWNER_EMAIL|BOT_TOKEN|SECRET_KEY/);
  const head=await at('/api/public/release',{method:'HEAD'});assert.equal(head.status,200);assert.equal(await head.text(),'');
  assert.equal((await at('/api/public/release',{method:'POST'})).status,405);
  assert.deepEqual(counts(),before);
});

test('release metadata and downloads remain behind exact Host and HTTPS proxy checks',async t=>{
  const {at,root}=await fixture(t);
  await writeFile(join(root,'downloads','test.apk'),'synthetic-apk-bytes');
  for(const path of ['/api/public/release','/downloads/test.apk']){
    assert.equal((await at(path,{headers:{Host:'different.example.test'}})).status,421);
    assert.equal((await at(path,{headers:{'X-Forwarded-Proto':'http'}})).status,421);
  }
  const result=await (await at('/api/public/release')).json();
  assert.equal(result.channels.whatsapp.status,'pending');assert.equal(result.channels.telegram.status,'pending');
  assert.equal(result.android.url,null);assert.equal(result.migration.workingOrigin,null);
});

test('APK GET streams an exact file larger than normal static limit and HEAD returns size without a body',async t=>{
  const {at,root}=await fixture(t);
  const bytes=Buffer.alloc(11*1024*1024,0x5a);
  await writeFile(join(root,'downloads','prototype.apk'),bytes);
  const response=await at('/downloads/prototype.apk');
  assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'application/vnd.android.package-archive');
  assert.equal(response.headers.get('content-length'),String(bytes.length));
  assert.equal(response.headers.get('content-disposition'),'attachment; filename="prototype.apk"');
  assert.equal(response.headers.get('x-content-type-options'),'nosniff');
  const received=Buffer.from(await response.arrayBuffer());
  assert.equal(createHash('sha256').update(received).digest('hex'),createHash('sha256').update(bytes).digest('hex'));
  const head=await at('/downloads/prototype.apk',{method:'HEAD'});
  assert.equal(head.status,200);assert.equal(head.headers.get('content-length'),String(bytes.length));
  assert.equal((await head.arrayBuffer()).byteLength,0);
  assert.equal((await at('/downloads/prototype.apk',{method:'POST'})).status,405);
});

test('missing, escaped, outside-symlink and oversized download paths never masquerade as available APKs',async t=>{
  const {at,root,dir}=await fixture(t);
  const missing=await at('/downloads/missing.apk');
  assert.equal(missing.status,404);assert.notEqual(missing.headers.get('content-type'),'application/vnd.android.package-archive');
  assert.equal(missing.headers.get('content-disposition'),null);
  assert.equal((await at('/downloads/%5cprivate.apk')).status,404);
  const outside=join(dir,'outside-private-fixture');await writeFile(outside,'synthetic-private-fixture');
  await symlink(outside,join(root,'downloads','outside.apk'));
  const escaped=await at('/downloads/outside.apk');
  assert.equal(escaped.status,404);assert.doesNotMatch(await escaped.text(),/synthetic-private-fixture/);
  const sparse=await open(join(root,'downloads','oversized.apk'),'w');
  await sparse.truncate(257*1024*1024);await sparse.close();
  assert.equal((await at('/downloads/oversized.apk',{method:'HEAD'})).status,413);
});
