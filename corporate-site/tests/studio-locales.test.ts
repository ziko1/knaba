import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {reviewsCopy} from '../src/data/reviews';
import {createStudioLocaleSelection,createStudioLocaleStore,studioLocales,validateStudioLocalePack,type StudioLocale} from '../src/lib/studio-locale-store';

const pack=(locale:StudioLocale)=>JSON.parse(readFileSync(new URL('../src/data/studio-locales/studio-'+locale+'.json',import.meta.url),'utf8'));
const deferred=()=>{let resolve!:(value:unknown)=>void,reject!:(reason?:unknown)=>void;const promise=new Promise<unknown>((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};

describe('selected-language Studio copy',()=>{
  it('ships complete plain-text copy for all four specialized editor languages',()=>{
    for(const locale of studioLocales){
      const source=pack(locale),validated=validateStudioLocalePack(source,locale);
      expect(validated).toEqual(source);
      expect(Object.isFrozen(validated)).toBe(true);
      expect(validated.article.unpublishConfirm).toContain('UNPUBLISH');
      expect(validated.article.confirm).toContain('PUBLISH');
      for(const [key,text] of Object.entries(validated.reviews)){
        if(Object.hasOwn(reviewsCopy[locale],key))expect(text).toBe(reviewsCopy[locale][key as keyof typeof reviewsCopy.de]);
      }
      expect(reviewsCopy[locale]).not.toHaveProperty('moderationIntro');
      expect(validated.reviews.moderationIntro.length).toBeGreaterThan(40);
    }
  });
  it('rejects missing, extra, wrongly identified or non-text data before changing UI copy',()=>{
    const missing=pack('de');delete missing.article.publish;
    const extra=pack('de');extra.studio.run='not a translation key';
    const empty=pack('de');empty.modes.manual='   ';
    const object=pack('de');object.reviews.publish={action:'publish'};
    const oversized=pack('de');oversized.article.body='x'.repeat(4001);
    for(const invalid of [null,[],missing,extra,empty,object,oversized,pack('en')]){
      expect(()=>validateStudioLocalePack(invalid,'de')).toThrow();
    }
  });
  it('deduplicates concurrent fetches and reuses only a validated successful result',async()=>{
    const response=deferred();let calls=0;
    const store=createStudioLocaleStore(async()=>{calls++;return response.promise;});
    const first=store.ensure('en'),second=store.ensure('en');
    expect(first).toBe(second);await Promise.resolve();expect(calls).toBe(1);
    response.resolve(pack('en'));const loaded=await first;
    expect(await second).toBe(loaded);expect(await store.ensure('en')).toBe(loaded);expect(calls).toBe(1);
  });
  it('leaves initial actions unavailable after invalid copy and permits a successful retry',async()=>{
    let calls=0;
    const store=createStudioLocaleStore(async locale=>++calls===1?{locale}:pack(locale));
    const selection=createStudioLocaleSelection(store,()=>{});
    expect(await selection.select('uk')).toBe(false);
    expect(selection.snapshot()).toMatchObject({locale:null,pack:null,requested:'uk',loading:false,failed:true});
    expect(await selection.retry()).toBe(true);expect(calls).toBe(2);
    expect(selection.snapshot()).toMatchObject({locale:'uk',requested:'uk',loading:false,failed:false});
  });
  it('retains the mounted editor copy while another language is loading or fails',async()=>{
    const next=deferred();let retry=false;
    const store=createStudioLocaleStore(async locale=>locale==='de'?pack('de'):retry?pack(locale):next.promise);
    const selection=createStudioLocaleSelection(store,()=>{});
    await selection.select('de');const original=selection.snapshot().pack;
    const switching=selection.select('ru');
    expect(selection.snapshot().pack).toBe(original);expect(selection.snapshot().loading).toBe(true);
    next.reject(Error('Temporary offline failure'));expect(await switching).toBe(false);
    expect(selection.snapshot()).toMatchObject({locale:'de',requested:'ru',loading:false,failed:true});
    expect(selection.snapshot().pack).toBe(original);
    retry=true;expect(await selection.retry()).toBe(true);expect(selection.snapshot().locale).toBe('ru');
  });
  it('never lets an older response replace the latest selected language',async()=>{
    const english=deferred(),ukrainian=deferred();
    const store=createStudioLocaleStore(async locale=>locale==='en'?english.promise:ukrainian.promise);
    const selection=createStudioLocaleSelection(store,()=>{});
    const first=selection.select('en'),latest=selection.select('uk');
    ukrainian.resolve(pack('uk'));expect(await latest).toBe(true);
    const current=selection.snapshot();english.resolve(pack('en'));expect(await first).toBe(false);
    expect(selection.snapshot()).toBe(current);
  });
  it('ignores older failures and results received after the editor is disposed',async()=>{
    const first=deferred(),latest=deferred();let updates=0;
    const selection=createStudioLocaleSelection(createStudioLocaleStore(async locale=>locale==='en'?first.promise:latest.promise),()=>updates++);
    const stale=selection.select('en'),pending=selection.select('uk');
    first.reject(Error('Older request failed'));expect(await stale).toBe(false);
    expect(selection.snapshot()).toMatchObject({requested:'uk',loading:true,failed:false,pack:null});
    selection.dispose();const before=updates;latest.resolve(pack('uk'));expect(await pending).toBe(false);
    expect(updates).toBe(before);expect(await selection.retry()).toBe(false);
  });
});
