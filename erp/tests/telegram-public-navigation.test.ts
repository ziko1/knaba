import {describe,it,expect} from 'vitest';
import {telegramPublicIntent,telegramPublicMenu} from '../packages/integrations/telegram-public-navigation.ts';

describe('Telegram public-only menu and registration interest',()=>{
  it.each([
    ['/start','MENU'],['/start website','MENU'],['/help','MENU'],
    ['/services','SERVICES'],['/request','ENQUIRY'],
    ['/register','REGISTER'],['/worker','REGISTER'],['/call','CONTACT'],
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
