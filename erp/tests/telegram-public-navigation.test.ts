import {describe,it,expect} from 'vitest';
import {telegramPublicIntent,telegramPublicMenu,telegramPublicReply,telegramRequestedLocale} from '../packages/integrations/telegram-public-navigation.ts';

describe('Telegram public-only menu and registration interest',()=>{
  it.each([
    ['/start','MENU'],['/start website','MENU'],['/help','MENU'],
    ['/services','SERVICES'],['/request','ENQUIRY'],
    ['/register','REGISTER'],['/worker','REGISTER'],['/partner','PARTNER'],['/call','CONTACT'],
    ['/human','HUMAN'],['/privacy','PRIVACY']
  ])('classifies explicit %s as guest request %s',(raw,expected)=>{
    expect(telegramPublicIntent(raw)).toBe(expected);
  });
  it.each(['/approve','/automations','/grant OWNER','/register admin','approve /register',
    '/menu\n/approve','/start anything-else'])
    ('does not execute privileged or unrecognized text (%s)',text=>{
      expect(telegramPublicIntent(text)).toBeUndefined();
    });
  it('renders only the public route catalogue, not owner or staff resources',()=>{
    const response=telegramPublicMenu('DE','https://kneba.vsp.rest/');
    expect(response).toContain('https://kneba.vsp.rest/kontakt/');
    expect(response).toContain('https://kneba.vsp.rest/konto/');
    expect(response).not.toContain('/admin/');
    expect(response).not.toContain('/crm/');
    expect(response).not.toContain('/app');
  });
  it('rejects unsafe public origin',()=>{
    expect(()=>telegramPublicMenu('DE','http://knaba.example/')).toThrow('INVALID_PUBLIC_ORIGIN');
    expect(()=>telegramPublicMenu('UK','https://evil.example/path/')).toThrow('INVALID_PUBLIC_ORIGIN');
  });
});

describe('Telegram explicit language switch does not imply channel consent',()=>{
 it.each([['/lang de','DE'],['/language RU','RU'],['/LANG en','EN'],['/lang uk','UK'],['/lang pl','PL'],['/lang lt','LT']])
   ('accepts standalone language request %s',(text,lang)=>{
     expect(telegramRequestedLocale(text)).toBe(lang);
     expect(telegramPublicIntent(text)).toBe('MENU');
   });
 it.each(['/lang','/lang foo','/lang ru extra','/lang ru\n/approve',
   'please /lang ru','/lang ru; approve','/lang owner'])
   ('rejects malformed or embedded commands %s',text=>{
     expect(telegramRequestedLocale(text)).toBeUndefined();
     expect(telegramPublicIntent(text)).toBeUndefined();
   });
});


describe('Public replies do not falsely claim that requests were persisted or delivered',()=>{
  it.each(['DE','UK','RU','EN','PL','LT'] as const)('uses actionable portal links for %s',language=>{
    for(const intent of ['PARTNER','REGISTER','HUMAN'] as const){
      const text=telegramPublicReply(intent,language,'https://kneba.vsp.rest/');
      expect(text).toContain('https://kneba.vsp.rest/');
      expect(text).not.toMatch(/request received|queued for a human|збережено|зафіксовано|передано для опрацювання|принята для проверки|записано|передано оператору|erfasst|eingegangen|wird geprüft|zapisano|czeka na osobistą|užregistruota|laukia žmogaus/i);
    }
  });
});
