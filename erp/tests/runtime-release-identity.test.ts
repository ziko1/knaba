import {describe,expect,it} from 'vitest';
import {requireReleaseSha,resolveBuildSha} from '../apps/runtime-configuration.ts';

const modes=['DEMO','TEST','PRODUCTION'] as const;
const sha='a'.repeat(40);
const invalid:Array<[string,unknown]>=[
  ['null',null],['empty',''],['zero placeholder','0'.repeat(40)],
  ['uppercase','A'.repeat(40)],['short','a'.repeat(39)],['long','a'.repeat(41)],
  ['non-hex','g'.repeat(40)],['leading whitespace',' '+sha],['trailing newline',sha+'\n'],
  ['number',1],['boolean',false],['array',[sha]],
  ['object',{sha:'SENSITIVE_RELEASE_INPUT'}],
  ['coercible object',{toString(){throw new Error('MUST_NOT_COERCE_RELEASE_INPUT');}}]
];

describe('release SHA grammar without normalization or configuration disclosure',()=>{
  it.each(invalid)('rejects %s in either input position in every explicit mode',(_label,value)=>{
    expect(()=>requireReleaseSha(value)).toThrow(/^RELEASE_SHA_REQUIRED_OR_INVALID$/);
    for(const mode of modes){
      expect(()=>resolveBuildSha(mode,value,sha)).toThrow(/^RELEASE_SHA_REQUIRED_OR_INVALID$/);
      expect(()=>resolveBuildSha(mode,sha,value)).toThrow(/^RELEASE_SHA_REQUIRED_OR_INVALID$/);
    }
  });

  it('distinguishes absent input from a valid SHA and from explicit invalid values',()=>{
    expect(()=>requireReleaseSha(undefined)).toThrow(/^RELEASE_SHA_REQUIRED_OR_INVALID$/);
    expect(requireReleaseSha('0'.repeat(39)+'1')).toBe('0'.repeat(39)+'1');
    expect(requireReleaseSha('0123456789abcdef'.repeat(2)+'01234567')).toBe('0123456789abcdef'.repeat(2)+'01234567');
  });
});

describe.each(modes)('%s release identity agreement',mode=>{
  it('accepts an exact environment SHA with an absent or matching compiled SHA',()=>{
    expect(resolveBuildSha(mode,sha,undefined)).toBe(sha);
    expect(resolveBuildSha(mode,sha,sha)).toBe(sha);
  });

  it('rejects valid but unequal SHAs without echoing either value',()=>{
    expect(()=>resolveBuildSha(mode,sha,'b'.repeat(40))).toThrow(/^RELEASE_SHA_MISMATCH$/);
  });
});

it.each(['DEMO','TEST'] as const)('retains %s source-start compatibility only when both SHAs are absent',mode=>{
  expect(resolveBuildSha(mode,undefined,undefined)).toBe('0'.repeat(40));
  expect(resolveBuildSha(mode,undefined,sha)).toBe(sha);
  expect(()=>resolveBuildSha(mode,undefined,'0'.repeat(40))).toThrow(/^RELEASE_SHA_REQUIRED_OR_INVALID$/);
  expect(()=>resolveBuildSha(mode,'0'.repeat(40),undefined)).toThrow(/^RELEASE_SHA_REQUIRED_OR_INVALID$/);
});

it('still requires an explicit environment SHA in PRODUCTION even with a valid compiled SHA',()=>{
  expect(()=>resolveBuildSha('PRODUCTION',undefined,sha)).toThrow(/^RELEASE_SHA_REQUIRED_OR_INVALID$/);
  expect(()=>resolveBuildSha('PRODUCTION',undefined,undefined)).toThrow(/^RELEASE_SHA_REQUIRED_OR_INVALID$/);
});

it.each([undefined,null,'','test','STAGING',0])('never exposes the compatibility sentinel to an invalid mode %j',mode=>{
  expect(()=>resolveBuildSha(mode as Parameters<typeof resolveBuildSha>[0],undefined,undefined)).toThrow(/^APP_MODE_REQUIRED_OR_INVALID$/);
});
