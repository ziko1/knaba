import {describe,it,expect} from 'vitest';
import {normalizeStudioPage,validateStudioEntries,StudioInputError} from '../src/lib/site-studio-contract';

const detailsRoot='#main > section:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(2) > section:nth-of-type(1) > div:nth-of-type(1) > details:nth-of-type(1)';
const question=detailsRoot+' > summary:nth-of-type(1) > span:nth-of-type(1)';
const answer=detailsRoot+' > p:nth-of-type(1)';

describe('KnaBa FAQ owner-only Studio leaf edits',()=>{
  it('keeps the four FAQ locale routes within the public page whitelist',()=>{
    for(const prefix of ['', '/en','/uk','/ru'])expect(normalizeStudioPage(prefix+'/faq/')).toBe(prefix+'/faq/');
  });
  it('accepts the real FAQ question and answer selectors without exposing whole accordions',()=>{
    expect(validateStudioEntries([{selector:question,kind:'text',value:'Які роботи виконує KnaBa?'}])).toHaveLength(1);
    expect(validateStudioEntries([{selector:answer,kind:'text',value:'Обсяг робіт визначається договором і графіком будівництва.'}])).toHaveLength(1);
    expect(validateStudioEntries([
      {selector:question,kind:'text',value:'Welche Bauphasen?'},
      {selector:answer,kind:'text',value:'Wir stimmen die Bauphasen einzeln ab.'},
    ])).toHaveLength(2);
  });
  it('continues to deny script/html, editing whole details and unsafe href targets',()=>{
    for(const value of ['<script>alert(1)</script>','<img src=x onerror=alert(1)>','bad\u0000value']){
      expect(()=>validateStudioEntries([{selector:answer,kind:'text',value}])).toThrow(StudioInputError);
    }
    expect(()=>validateStudioEntries([{selector:detailsRoot,kind:'text',value:'Erase FAQ'}])).toThrow(StudioInputError);
    expect(()=>validateStudioEntries([{selector:question,kind:'href',value:'javascript:alert(1)'}])).toThrow(StudioInputError);
    expect(()=>validateStudioEntries([{selector:detailsRoot+' > iframe:nth-of-type(1)',kind:'text',value:'unsafe'}])).toThrow(StudioInputError);
  });
});
