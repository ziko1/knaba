import {test} from 'node:test';
import assert from 'node:assert/strict';
import {access} from 'node:fs/promises';
import {createRoleUxFixture} from '../tests/fixtures/role-ux-server.mjs';

test('browser role fixture starts with synthetic identity configuration and closes its SQLite state',async()=>{
  const keys=['SITE_IDENTITY_PEER_JSON','SITE_IDENTITY_SESSIONS_ENABLED'];
  const previous=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
  let fixture;
  try{
    // The browser harness must never inherit real identity/provider configuration.
    for(const key of keys)process.env[key]='invalid-ambient-configuration-must-not-be-read';
    fixture=await createRoleUxFixture();
    assert.match(fixture.origin,/^https:\/\/127\.0\.0\.1:\d+$/);
    const session=await fixture.api('client','/api/portal/session');
    assert.equal(session.user.id,fixture.identities.client.id);
    assert.equal(session.role,'client');
    const inbox=await fixture.api('owner','/api/assistant/owner/conversations');
    assert.ok(inbox.conversations.some(row=>row.id===fixture.conversationId&&row.expiresAt));
    assert.equal(fixture.requests.client.status,'scheduled');
    const db=fixture.db,database=db.prepare('PRAGMA database_list').get().file;
    await fixture.close();fixture=null;
    assert.throws(()=>db.prepare('SELECT 1'));
    await assert.rejects(access(database),{code:'ENOENT'});
  }finally{
    if(fixture)await fixture.close();
    for(const key of keys){
      if(previous[key]===undefined)delete process.env[key];
      else process.env[key]=previous[key];
    }
  }
});
