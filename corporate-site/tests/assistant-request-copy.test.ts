import {describe,expect,it,vi} from 'vitest';
import {assistantInquiryAction,fetchAssistantRequestLabels} from '../src/lib/assistant-request-copy';
import {inboxPacks} from './helpers/assistant-inbox-packs';

describe('structured request locale asset boundary',()=>{
  it('provides the action and complete request states in every supported language using credential-free static JSON',async()=>{
    const fetch=vi.spyOn(globalThis,'fetch');
    try{
      for(const locale of ['de','en','pl','lt','ru','uk'] as const){
        expect(assistantInquiryAction[locale].trim()).not.toBe('');fetch.mockResolvedValueOnce(new Response(JSON.stringify(inboxPacks[locale])));
        const labels=await fetchAssistantRequestLabels(locale);
        for(const status of ['PENDING','LEASED','APPLIED','REVIEW','BLOCKED','UNKNOWN','NOT_QUEUED'] as const)expect(labels[`transfer_${status}`].trim()).not.toBe('');
        expect(fetch.mock.lastCall?.[0]).toMatch(new RegExp('inbox-'+locale+'.*\\.json(?:\\?|$)'));
        expect(fetch.mock.lastCall?.[1]).toMatchObject({credentials:'omit',cache:'force-cache',redirect:'error'});
      }
    }finally{fetch.mockRestore();}
  });
  it('does not enable consent from incomplete, blank or executable language content',async()=>{
    const fetch=vi.spyOn(globalThis,'fetch');
    try{
      for(const value of [null,[],{}, {...inboxPacks.en,requestTransferConsent:''},{...inboxPacks.en,requestLocalOnly:'<script>unexpected</script>'}]){
        fetch.mockResolvedValueOnce(new Response(JSON.stringify(value)));await expect(fetchAssistantRequestLabels('en')).rejects.toThrow('Invalid request language pack');
      }
      fetch.mockResolvedValueOnce(new Response('offline',{status:503}));await expect(fetchAssistantRequestLabels('en')).rejects.toThrow('Inbox language unavailable');
    }finally{fetch.mockRestore();}
  });
});
