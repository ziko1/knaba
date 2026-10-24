import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {cpSync,existsSync,mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {spawnSync} from 'node:child_process';

test('build verifier emits an inspectable artifact without rewriting tracked historical receipt',()=>{
  const fixture=mkdtempSync(join(tmpdir(),'knaba-build-verification-'));
  try{
    cpSync('dist',join(fixture,'dist'),{recursive:true});
    mkdirSync(join(fixture,'docs'));
    const historical='{"source":"unchanged original evidence"}\n';
    writeFileSync(join(fixture,'docs/build-verification.json'),historical);
    const command=spawnSync(process.execPath,[resolve('tests/verify-build.mjs')],{cwd:fixture,encoding:'utf8',timeout:20000});
    assert.equal(command.status,0,`${command.stderr}\n${command.stdout}`);
    assert.equal(readFileSync(join(fixture,'docs/build-verification.json'),'utf8'),historical);
    const path=join(fixture,'dist/evidence/build-verification.json');
    assert.ok(existsSync(path),'a build-specific verification receipt must exist');
    const report=JSON.parse(readFileSync(path,'utf8'));
    assert.equal(report.pages,52,'CMS studio adds one protected static route on top of 51 existing pages');
    assert.match(report.artifactSha256,/^[a-f\d]{64}$/);
  }finally{rmSync(fixture,{recursive:true,force:true});}
});
