import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createKnabaVpsServer} from './server.mjs';
import {parsePeerConfig} from './site-identity-protocol.mjs';

// Actual server configuration preflight. It must reject before opening SQLite
// or loading a Worker; this is not full Worker/browser acceptance.
test('VPS server rejects a malformed session-authority environment flag before creating its database',async t=>{
  const directory=mkdtempSync(join(tmpdir(),'knaba-session-flag-')),dbPath=join(directory,'site.sqlite');
  const prior=process.env.SITE_IDENTITY_SESSIONS_ENABLED;
  t.after(()=>{
    if(prior===undefined)delete process.env.SITE_IDENTITY_SESSIONS_ENABLED;else process.env.SITE_IDENTITY_SESSIONS_ENABLED=prior;
    rmSync(directory,{recursive:true,force:true});
  });
  process.env.SITE_IDENTITY_SESSIONS_ENABLED='enabled';
  await assert.rejects(createKnabaVpsServer({dbPath,staticRoot:directory,workerPath:'file:///synthetic-never-loaded-worker.mjs',
    origin:'https://site.example',localTest:true,siteIdentityConfig:()=>null}),/MISSING_CONFIGURATION/);
  assert.equal(existsSync(dbPath),false);
});

test('VPS server refuses a non-boolean session-authority callback before any database write',async t=>{
  const directory=mkdtempSync(join(tmpdir(),'knaba-session-callback-')),dbPath=join(directory,'site.sqlite');
  t.after(()=>rmSync(directory,{recursive:true,force:true}));
  await assert.rejects(createKnabaVpsServer({dbPath,staticRoot:directory,workerPath:'file:///synthetic-never-loaded-worker.mjs',
    origin:'https://site.example',localTest:true,siteIdentityConfig:()=>null,siteIdentitySessionsEnabled:()=> 'true'}),/MISSING_CONFIGURATION/);
  assert.equal(existsSync(dbPath),false);
});

for(const mode of ['missing','inactive','expired'])test('enabled session authority refuses '+mode+' peer before SQLite opens',async t=>{
  const directory=mkdtempSync(join(tmpdir(),'knaba-session-peer-')),dbPath=join(directory,'site.sqlite');
  t.after(()=>rmSync(directory,{recursive:true,force:true}));
  const peer=mode==='missing'?null:parsePeerConfig({companyId:'synthetic-company',issuer:'https://site.example/identity',audience:'synthetic-erp',
    version:1,active:mode!=='inactive',erpOrigin:'https://erp.example',siteOrigin:'https://site.example',
    keyId:'knaba-federation-preflight',secret:Buffer.alloc(32,57).toString('base64url'),
    ...(mode==='expired'?{expiresAt:new Date(Date.now()-1000).toISOString()}:{})});
  await assert.rejects(createKnabaVpsServer({dbPath,staticRoot:directory,workerPath:'file:///synthetic-never-loaded-worker.mjs',
    origin:'https://site.example',localTest:true,siteIdentityConfig:()=>peer,siteIdentitySessionsEnabled:()=>true}),/MISSING_CONFIGURATION/);
  assert.equal(existsSync(dbPath),false);
});
