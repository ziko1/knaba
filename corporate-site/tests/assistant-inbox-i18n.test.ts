import {describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {INBOX_LOCALES,assistantInboxLocale,createInboxLocaleStore,fetchInboxLabels,type InboxLabels,type InboxLocale} from '../src/lib/assistant-inbox-i18n';
import {inboxPacks} from './helpers/assistant-inbox-packs';

describe('Assistant owner inbox language contract',()=>{
  it('ships a complete plain-text pack for every supported language',()=>{
    expect([...INBOX_LOCALES]).toEqual(['de','en','pl','lt','ru','uk']);
    const keys=Object.keys(inboxPacks.de).sort();
    for(const locale of INBOX_LOCALES){
      const pack=inboxPacks[locale];
      expect(Object.keys(pack).sort()).toEqual(keys);
      for(const text of Object.values(pack)){expect(typeof text).toBe('string');expect(text.trim()).not.toBe('');expect(text).not.toMatch(/[<>]/);}
      expect(assistantInboxLocale(locale)).toBe(locale);
    }
    expect(new Set(INBOX_LOCALES.map(locale=>inboxPacks[locale].title)).size).toBe(6);
    for(const invalid of [null,undefined,'fr','__proto__','EN',{},1])expect(assistantInboxLocale(invalid)).toBe('de');
  });

  it('makes all languages and more pages reachable through labeled controls',()=>{
    const source=readFileSync(new URL('../src/components/AssistantInbox.tsx',import.meta.url),'utf8');
    expect(source).toContain('lang={locale()}');
    expect(source).toContain('label().language');expect(source).toContain('each={INBOX_LOCALES}');
    expect(source).toContain('onChange={event=>void changeLocale(event.currentTarget.value)}');
    expect(source).toContain('aria-busy={loadingMore()}');expect(source).toContain('onClick={()=>void loadMore()}');
    expect(source).not.toMatch(/\bru\?/);expect(source).not.toContain('item.preview||item.status');
  });

  it('caches only validated public packs per mounted instance and retries failed data',async()=>{
    const load=vi.fn(async()=>inboxPacks.en),store=createInboxLocaleStore('de',inboxPacks.de,load);
    expect(await store.ensure('de')).toEqual(inboxPacks.de);expect(load).not.toHaveBeenCalled();
    expect(await store.ensure('en')).toEqual(inboxPacks.en);await store.ensure('en');expect(load).toHaveBeenCalledOnce();
    expect(Object.isFrozen(store.initial)).toBe(true);
    const nextMount=createInboxLocaleStore('de',inboxPacks.de,load);await nextMount.ensure('en');expect(load).toHaveBeenCalledTimes(2);
    expect(()=>createInboxLocaleStore('de',undefined as unknown as InboxLabels,load)).toThrow('Missing inbox labels');
    await expect(store.ensure('__proto__' as InboxLocale)).rejects.toThrow('Unsupported inbox language');
  });

  it.each([
    null,[],{languageName:'English'},inboxPacks.pl,{...inboxPacks.en,title:''},
    {...inboxPacks.en,title:'<script>'},{...inboxPacks.en,title:'x'.repeat(4001)},{...inboxPacks.en,unexpected:'key'},
  ])('rejects an incomplete or incorrect fetched language pack %#',async invalid=>{
    const load=vi.fn().mockResolvedValueOnce(invalid).mockResolvedValueOnce(inboxPacks.en);
    const store=createInboxLocaleStore('de',inboxPacks.de,load);
    await expect(store.ensure('en')).rejects.toThrow();expect(store.initial).toEqual(inboxPacks.de);
    expect(await store.ensure('en')).toEqual(inboxPacks.en);expect(load).toHaveBeenCalledTimes(2);
  });

  it('requests only static JSON URLs without credentials and leaves failed fetches retryable',async()=>{
    const fetch=vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify(inboxPacks.en)));
    try{
      expect(await fetchInboxLabels('en')).toEqual(inboxPacks.en);
      expect(fetch.mock.calls[0][0]).toMatch(/inbox-en.*\.json(?:\?|$)/);
      expect(fetch.mock.calls[0][0]).not.toMatch(/^data:/);
      expect(fetch.mock.calls[0][1]).toMatchObject({credentials:'omit',cache:'force-cache',redirect:'error',signal:expect.any(AbortSignal)});
      fetch.mockResolvedValueOnce(new Response('',{status:503}));
      await expect(fetchInboxLabels('en')).rejects.toThrow('Inbox language unavailable');
      await expect(fetchInboxLabels('__proto__' as InboxLocale)).rejects.toThrow('Unsupported inbox language');
      expect(fetch).toHaveBeenCalledTimes(2);
    }finally{fetch.mockRestore();}
  });
});
