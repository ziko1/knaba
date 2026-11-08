import {describe,expect,it} from 'vitest';
import {parsePublicOrigin,requireCompanyId,resolveCompanyId,type RuntimeMode} from '../apps/runtime-config.mjs';

const modes:RuntimeMode[]=['DEMO','TEST','PRODUCTION'];

describe('shared company configuration contract',()=>{
  it.each(['A','synthetic_company-42','a'.repeat(100)])('accepts the bounded explicit identifier %s in each mode',company=>{
    for(const mode of modes){
      expect(requireCompanyId(mode,company)).toBe(company);
      expect(resolveCompanyId(mode,company)).toBe(company);
    }
  });
  it.each([
    ['null',null],['empty',''],['whitespace',' '],['padded',' company'],
    ['trailing newline','company\n'],['internal whitespace','two companies'],
    ['leading separator','-company'],['path','company/other'],['too long','a'.repeat(101)],
    ['number',1],['boolean',true],['object',{}],['array',['company']]
  ])('rejects %s without silently selecting another company',(_label,value)=>{
    for(const mode of modes){
      expect(()=>resolveCompanyId(mode,value)).toThrow('COMPANY_ID_REQUIRED_OR_INVALID');
      expect(()=>requireCompanyId(mode,value)).toThrow('COMPANY_ID_REQUIRED_OR_INVALID');
    }
  });
  it('defaults only missing non-production environment configuration; injected options remain explicit',()=>{
    for(const mode of ['DEMO','TEST'] as const){
      expect(resolveCompanyId(mode,undefined)).toBe('knaba-demo');
      expect(()=>requireCompanyId(mode,undefined)).toThrow('COMPANY_ID_REQUIRED_OR_INVALID');
      expect(resolveCompanyId(mode,'knaba-de-demo')).toBe('knaba-de-demo');
    }
    expect(()=>resolveCompanyId('PRODUCTION',undefined)).toThrow('COMPANY_ID_REQUIRED_OR_INVALID');
  });
  it.each(['knaba-demo','knaba-de-demo'])('rejects reserved production company %s',company=>{
    expect(()=>resolveCompanyId('PRODUCTION',company)).toThrow('COMPANY_ID_REQUIRED_OR_INVALID');
  });
});

describe('origin validation and distinct canonical/raw contracts',()=>{
  it.each([
    ['https://erp.example.test','https://erp.example.test'],
    ['https://erp.example.test/','https://erp.example.test'],
    ['HTTPS://ERP.example.test:443/','https://erp.example.test'],
    ['https://erp.example.test:8443/','https://erp.example.test:8443'],
    ['https://[::1]:8443/','https://[::1]:8443']
  ])('preserves raw %s and returns canonical %s', (raw,origin)=>{
    for(const mode of modes)expect(parsePublicOrigin(mode,raw,true)).toEqual({raw,origin});
  });
  it('permits optional missing origins but requires one when the caller requests it',()=>{
    for(const mode of modes){
      expect(parsePublicOrigin(mode,undefined)).toBeUndefined();
      expect(()=>parsePublicOrigin(mode,undefined,true)).toThrow('PUBLIC_ORIGIN_REQUIRED_OR_INVALID');
    }
  });
  it('keeps HTTP available only outside production',()=>{
    const raw='http://127.0.0.1:3030/';
    for(const mode of ['DEMO','TEST'] as const)expect(parsePublicOrigin(mode,raw)).toEqual({raw,origin:'http://127.0.0.1:3030'});
    expect(()=>parsePublicOrigin('PRODUCTION',raw)).toThrow('PUBLIC_ORIGIN_REQUIRED_OR_INVALID');
  });
  it.each([
    ['empty',''],['null',null],['number',1],['object',{}],['array',['https://erp.example.test']],
    ['relative','/erp'],['wrong scheme','ftp://erp.example.test/'],
    ['credentials','https://user:SYNTHETIC_ORIGIN_SECRET@erp.example.test/'],
    ['empty userinfo','https://@erp.example.test/'],
    ['path','https://erp.example.test/erp'],['normalized path','https://erp.example.test/a/..'],
    ['encoded dot path','https://erp.example.test/%2e/'],
    ['multiple slashes','https://erp.example.test//'],['backslash','https://erp.example.test\\'],
    ['query','https://erp.example.test/?token=SYNTHETIC_ORIGIN_SECRET'],['empty query','https://erp.example.test/?'],
    ['fragment','https://erp.example.test/#secret'],['empty fragment','https://erp.example.test/#'],
    ['leading whitespace',' https://erp.example.test/'],['trailing newline','https://erp.example.test/\n'],
    ['embedded tab','https://erp.\texample.test/']
  ])('rejects %s in every mode with a fixed error',(_label,value)=>{
    for(const mode of modes){
      expect(()=>parsePublicOrigin(mode,value)).toThrow(new Error('PUBLIC_ORIGIN_REQUIRED_OR_INVALID'));
    }
  });
});
