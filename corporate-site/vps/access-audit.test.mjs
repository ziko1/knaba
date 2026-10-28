import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,existsSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {openLocalDatabase} from './database.mjs';

const command=new URL('./manage.mjs',import.meta.url).pathname;
const call=(file,args=[])=>spawnSync(process.execPath,[command,'access-audit',...args],{
  encoding:'utf8',timeout:20000,env:{...process.env,KNABA_DB_PATH:file}
});
test('read-only access request audit reports aggregate counts without applicant data',()=>{
  const folder=mkdtempSync(join(tmpdir(),'knaba-audit-'));
  try{
    const file=join(folder,'site.sqlite');
    const {db}=openLocalDatabase(file);
    const now=Date.now(),day=86400000;
    const add=db.prepare(
      'INSERT INTO vps_access_requests(id,name,email,intent,status,privacy_version,created_at,expires_at,reviewed_at,reviewed_by) VALUES (?,?,?,?,?,?,?,?,?,?)'
    );
    add.run('test-old','Example','old@example.test','client','pending','2026-10-26',now-20*day,now-1000,null,null);
    add.run('test-soon','Example','soon@example.test','worker','pending','2026-10-26',now-20*day,now+3*day,null,null);
    add.run('test-later','Example','later@example.test','client','pending','2026-10-26',now-20*day,now+10*day,null,null);
    add.run('test-handled','Example','done@example.test','client','handled','2026-10-26',now-20*day,now+10*day,now-1000,'test-owner');
    db.close();
    const fingerprint=()=>createHash('sha256').update(readFileSync(file)).digest('hex');
    const before=fingerprint();
    const result=call(file);
    assert.equal(result.status,0,result.stderr);
    const report=JSON.parse(result.stdout);
    assert.equal(report.scope,'access_requests');
    assert.equal(report.mode,'read_only');
    assert.equal(report.total,4);
    assert.equal(report.pending,3);
    assert.equal(report.reviewed,1);
    assert.equal(report.pastDue,1);
    assert.equal(report.dueWithin7Days,1);
    assert.ok(!result.stdout.includes('old@example.test'));
    assert.ok(!result.stdout.includes('Example'));
    assert.equal(fingerprint(),before,'report must not write or migrate data');
    assert.equal(call(file,['--apply']).status,2);
    assert.equal(fingerprint(),before);
  }finally{rmSync(folder,{recursive:true,force:true});}
});
test('read-only access request audit refuses unknown flags and missing database',()=>{
  const folder=mkdtempSync(join(tmpdir(),'knaba-missing-'));
  try{
    const file=join(folder,'missing.sqlite');
    assert.notEqual(call(file).status,0);
    assert.notEqual(call(file,['--unknown']).status,0);
    assert.equal(existsSync(file),false);
  }finally{rmSync(folder,{recursive:true,force:true});}
});
