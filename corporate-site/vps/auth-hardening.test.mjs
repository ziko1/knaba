import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openLocalDatabase} from './database.mjs';
import {createCredentialsUser,createLogin,readSession} from './auth.mjs';

const password='synthetic-only-2026-strong-passphrase';
function fixture(work){
  const root=mkdtempSync(join(tmpdir(),'knaba-auth-hardening-'));
  const {db}=openLocalDatabase(join(root,'state.sqlite'));
  try{return work(db);}
  finally{db.close();rmSync(root,{recursive:true,force:true});}
}

test('shared client IP stops credential validation after 60 attempts across distinct addresses',()=>{
  fixture(db=>{
    for(let i=0;i<61;i++)createCredentialsUser(db,'test'+i+'@example.test',password);
    for(let i=0;i<60;i++){
      const good=createLogin(db,{email:'test'+i+'@example.test',password,clientKey:'trusted-remote-ip'});
      assert.ok(good?.token,'expected allowed login '+i);
    }
    assert.equal(createLogin(db,{email:'test60@example.test',password,clientKey:'trusted-remote-ip'}),null,
      'same socket IP must not evade limit by rotating email');
    const other=createLogin(db,{email:'test60@example.test',password,clientKey:'another-remote-ip'});
    assert.ok(other?.token,'unrelated client IP should retain its own quota');
  });
});

test('self-service credential rotation invalidates all former sessions atomically',async()=>{
  const {rotateCredentials}=await import('./auth.mjs');
  assert.equal(typeof rotateCredentials,'function','missing credential rotation behavior');
  fixture(db=>{
    const user=createCredentialsUser(db,'rotation@example.test',password);
    const first=createLogin(db,{email:user.email,password,clientKey:'source-one'});
    const second=createLogin(db,{email:user.email,password,clientKey:'source-two'});
    const next='synthetic-updated-secret-2026-strong';
    assert.equal(rotateCredentials(db,{
      userId:user.id,currentPassword:password,newPassword:next,confirmed:next
    }),true);
    assert.equal(readSession(db,'__Host-knaba-session='+first.token),null);
    assert.equal(readSession(db,'__Host-knaba-session='+second.token),null);
    assert.equal(createLogin(db,{email:user.email,password,clientKey:'source-three'}),null);
    assert.ok(createLogin(db,{email:user.email,password:next,clientKey:'source-four'})?.token);
  });
});

test('credential rotation rejects incorrect existing secret without losing valid sessions',async()=>{
  const {rotateCredentials}=await import('./auth.mjs');
  fixture(db=>{
    const user=createCredentialsUser(db,'unchanged@example.test',password);
    const session=createLogin(db,{email:user.email,password,clientKey:'another-source'});
    const proposed='unused-synthetic-rotation-2026';
    assert.equal(rotateCredentials(db,{
      userId:user.id,currentPassword:'incorrect-synthetic-current',
      newPassword:proposed,confirmed:proposed
    }),false);
    assert.ok(readSession(db,'__Host-knaba-session='+session.token));
  });
});
