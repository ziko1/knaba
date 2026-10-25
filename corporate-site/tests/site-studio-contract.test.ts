import { describe, expect, it } from 'vitest';
import { normalizeStudioPage, validateStudioEntries, StudioInputError } from '../src/lib/site-studio-contract';

const selector = '#main > section:nth-of-type(1) > div:nth-of-type(2) > p:nth-of-type(1)';
describe('KNABA Site Studio input and publication rules', () => {
  it('accepts a bounded text edit and sorts for deterministic revisions', () => {
    expect(validateStudioEntries([{selector,kind:'text',value:'  Hallo Welt  '},{selector:'@title',kind:'text',value:'KnaBa Berlin'}]))
      .toEqual([{selector:'@title',kind:'text',value:'KnaBa Berlin'},{selector,kind:'text',value:'Hallo Welt'}]);
  });
  it('accepts legitimate localized static pages', () => {
    expect(normalizeStudioPage('/')).toBe('/');
    expect(normalizeStudioPage('/ru/leistungen/fensterreinigung/')).toBe('/ru/leistungen/fensterreinigung/');
    expect(normalizeStudioPage('/ratgeber/')).toBe('/ratgeber/');
  });
  it.each(['/api/studio/published','/studio/','/ru/konto/','/postfach/','//evil/','/../','/%2f/','/en?to=1','/logout/','https://other.test/'])('rejects a protected/non-static page %s',page=>{
    expect(()=>normalizeStudioPage(page)).toThrow(StudioInputError);
  });
  it('blocks selectors outside public content, injection and overlong nodes',()=>{
    for(const s of ['body','#main > script:nth-of-type(1)','#main > p:first-child','#main > div:nth-of-type(0)','[data-x]','#main > a:nth-of-type(99) > iframe:nth-of-type(1)']){
      expect(()=>validateStudioEntries([{selector:s,kind:'text',value:'Hi'}])).toThrow(StudioInputError);
    }
    expect(()=>validateStudioEntries([{selector,kind:'text',value:'<script>alert(1)</script>'}])).toThrow(StudioInputError);
    expect(()=>validateStudioEntries([{selector,kind:'text',value:'X'.repeat(1000)}])).toThrow(StudioInputError);
  });
  it('rejects duplicate fields and excess entries',()=>{
    expect(()=>validateStudioEntries([{selector,kind:'text',value:'A'},{selector,kind:'text',value:'B'}])).toThrow(StudioInputError);
    expect(()=>validateStudioEntries(Array.from({length:81},(_,i)=>({selector:'#main > p:nth-of-type('+(i+1)+')',kind:'text',value:'A'})))).toThrow(StudioInputError);
  });
  it('blocks external redirects, javascript URLs and untrusted image locations',()=>{
    const link = '#main > section:nth-of-type(1) > a:nth-of-type(1)';
    const image = '#main > section:nth-of-type(1) > img:nth-of-type(1)';
    for(const href of ['javascript:alert(1)','//evil.test/a','https://evil.test/','/\\evil.test','data:text/html,x']){
      expect(()=>validateStudioEntries([{selector:link,kind:'href',value:href}])).toThrow(StudioInputError);
    }
    for(const src of ['https://evil.test/p.png','data:image/svg+xml,x','/api/users','//evil.test/logo.svg']){
      expect(()=>validateStudioEntries([{selector:image,kind:'src',value:src}])).toThrow(StudioInputError);
    }
    expect(validateStudioEntries([{selector:image,kind:'src',value:'/images/cleaner.svg'}])).toHaveLength(1);
    expect(validateStudioEntries([{selector:image,kind:'src',value:'/illustrations/baureinigung.svg'}])).toHaveLength(1);
    expect(validateStudioEntries([{selector:link,kind:'href',value:'/kontakt/'}])).toHaveLength(1);
  });
  it('accepts the actual VPS origin for owner-edited links, never lookalike domains or unsafe ports',()=>{
    const link='#main > section:nth-of-type(1) > a:nth-of-type(1)';
    const assertHref=(href:string)=>validateStudioEntries([{selector:link,kind:'href',value:href}]);
    expect(assertHref('https://kneba.vsp.rest/kontakt/')).toHaveLength(1);
    expect(assertHref('https://knaba.de/leistungen/')).toHaveLength(1);
    for(const href of [
      'https://kneba.vsp.rest.evil.test/path',
      'http://kneba.vsp.rest/kontakt/',
      'https://kneba.vsp.rest:8443/kontakt/',
      'https://user:pass@kneba.vsp.rest/kontakt/'
    ]) expect(()=>assertHref(href)).toThrow(StudioInputError);
  });
  it('enforces kind/tag consistency and safe color values',()=>{
    expect(()=>validateStudioEntries([{selector,kind:'src',value:'/images/example.svg'}])).toThrow(StudioInputError);
    expect(()=>validateStudioEntries([{selector,kind:'color',value:'url(javascript:evil)'}])).toThrow(StudioInputError);
    expect(validateStudioEntries([{selector,kind:'color',value:'#203040'}])).toHaveLength(1);
    expect(validateStudioEntries([{selector:'@description',kind:'text',value:'Saubere Räume.'}])).toHaveLength(1);
  });
  it('rejects invalid input shape and control characters',()=>{
    expect(()=>validateStudioEntries(null)).toThrow(StudioInputError);
    expect(()=>validateStudioEntries([{selector,kind:'text',value:'A\u0000B'}])).toThrow(StudioInputError);
    expect(()=>validateStudioEntries([{selector,kind:'text',value:'ok',extra:'bad'}])).toThrow(StudioInputError);
  });
});
