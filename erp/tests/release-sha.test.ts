import {mkdtemp,rm} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {requireReleaseSha,resolveBuildSha,type RuntimeMode} from '../apps/runtime-config.mjs';

const modes:RuntimeMode[]=['DEMO','TEST','PRODUCTION'];
const sha='0123456789abcdef0123456789abcdef01234567';
const other='b'.repeat(40);
const invalid:Array<[string,unknown]>=[
  ['missing',undefined],['null',null],['empty',''],['zero','0'.repeat(40)],
  ['short','a'.repeat(39)],['long','a'.repeat(41)],['uppercase','A'.repeat(40)],
  ['not hexadecimal','g'.repeat(40)],['leading whitespace',' '+sha],
  ['terminal newline',sha+'\n'],['trailing space',sha+' '],
  ['number',42],['boolean',false],['object',{}],['array',[sha]],
  ['private-looking input','SYNTHETIC_SHA_CANARY_DO_NOT_ECHO']
];

describe('release SHA grammar is exact and does not normalize supplied values',()=>{
  it.each([sha,'a'.repeat(40),'0'.repeat(39)+'1'])('preserves valid non-placeholder SHA %s',value=>{
    expect(requireReleaseSha(value)).toBe(value);
  });
  it.each(invalid)('rejects %s with a fixed error',(_label,value)=>{
    expect(()=>requireReleaseSha(value)).toThrow(new Error('RELEASE_SHA_REQUIRED_OR_INVALID'));
  });
});

describe('release identity resolution preserves absence and enforces agreement',()=>{
  it.each(modes)('accepts matching metadata and explicit unbundled metadata in %s',mode=>{
    expect(resolveBuildSha(mode,sha,sha)).toBe(sha);
    expect(resolveBuildSha(mode,sha,undefined)).toBe(sha);
  });
  it.each(modes)('rejects different explicit metadata in %s',mode=>{
    expect(()=>resolveBuildSha(mode,sha,other)).toThrow('RELEASE_SHA_MISMATCH');
  });
  it.each(invalid.filter(([label])=>label!=='missing'))('rejects explicit %s in either source',(_label,value)=>{
    for(const mode of modes){
      expect(()=>resolveBuildSha(mode,value,sha)).toThrow('RELEASE_SHA_REQUIRED_OR_INVALID');
      expect(()=>resolveBuildSha(mode,sha,value)).toThrow('RELEASE_SHA_REQUIRED_OR_INVALID');
    }
  });
  it.each(['DEMO','TEST'] as const)('permits missing env and the fully absent sentinel only in %s',mode=>{
    expect(resolveBuildSha(mode,undefined,sha)).toBe(sha);
    expect(resolveBuildSha(mode,undefined,undefined)).toBe('0'.repeat(40));
  });
  it.each([undefined,sha])('requires explicit production environment SHA even with compiled value %s',compiled=>{
    expect(()=>resolveBuildSha('PRODUCTION',undefined,compiled)).toThrow('RELEASE_SHA_REQUIRED_OR_INVALID');
  });
  it('keeps the explicit mode boundary',()=>{
    expect(()=>resolveBuildSha('STAGING' as RuntimeMode,sha,sha)).toThrow('APP_MODE_REQUIRED_OR_INVALID');
  });
});

describe('actual bundler refuses invalid explicit SHA before source/assets/output access',()=>{
  const script=fileURLToPath(new URL('../scripts/bundle.mjs',import.meta.url));
  let scratch:string;
  beforeAll(async()=>{scratch=await mkdtemp(join(tmpdir(),'knaba-sha-bundle-'));});
  afterAll(async()=>{if(scratch)await rm(scratch,{recursive:true,force:true});});
  it.each(['0'.repeat(40),sha+'\n','SYNTHETIC_SHA_CANARY_DO_NOT_ECHO'])('rejects invalid supplied metadata without creating an artifact %#',GIT_SHA=>{
    // Empty isolated cwd has neither Git metadata nor build assets. No valid
    // build is run here; exact-source full packaging remains a separate CI gate.
    const run=spawnSync(process.execPath,[script],{
      cwd:scratch,env:{PATH:process.env.PATH,GIT_SHA},encoding:'utf8',timeout:15000,maxBuffer:1024*1024
    });
    expect(run.error).toBeUndefined();expect(run.signal).toBeNull();expect(run.status).toBe(1);
    expect(run.stderr).toContain('EXACT_NON_PLACEHOLDER_RELEASE_SHA_REQUIRED');
    expect(run.stdout+run.stderr).not.toContain('SYNTHETIC_SHA_CANARY_DO_NOT_ECHO');
    expect(run.stdout+run.stderr).not.toContain('ENOENT');
    expect(existsSync(join(scratch,'dist'))).toBe(false);
  });
});
