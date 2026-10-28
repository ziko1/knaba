import {afterEach,describe,expect,it,vi} from 'vitest';
import {workerOptions} from '../apps/worker/main.ts';
import {TelegramBotAdapter} from '../packages/integrations/telegram.ts';

// Synthetic token/recipient. These tests cannot reach the Bot API.
const token='123456:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const chat='187650211';
const enabled:NodeJS.ProcessEnv={
  APP_MODE:'TEST',LIVE_SEND_ALLOWED:'true',TELEGRAM_LIVE_SEND_ALLOWED:'true',
  TELEGRAM_BOT_TOKEN:token,TELEGRAM_ALLOWED_CHAT_IDS:chat,
  TELEGRAM_APPROVED_CONSENT_VERSION:'TEST_ONLY_NOTICE_2026',
  PUBLIC_ORIGIN:'https://kneba.vsp.rest/'
};
const configure=(overrides:NodeJS.ProcessEnv={})=>workerOptions({...enabled,...overrides});
afterEach(()=>vi.unstubAllGlobals());

describe('Telegram worker runtime wiring (no real provider calls)',()=>{
  it('never enables Telegram outbound from a token or WhatsApp global flag alone',()=>{
    const request=vi.fn();
    vi.stubGlobal('fetch',request);
    expect(workerOptions({TELEGRAM_BOT_TOKEN:token}).telegram).toBeUndefined();
    expect(configure({LIVE_SEND_ALLOWED:'false'}).telegram).toBeUndefined();
    expect(configure({TELEGRAM_LIVE_SEND_ALLOWED:'false'}).telegram).toBeUndefined();
    expect(configure({TELEGRAM_LIVE_SEND_ALLOWED:undefined}).telegram).toBeUndefined();
    expect(request).not.toHaveBeenCalled();
  });

  it.each([
    ['token',{TELEGRAM_BOT_TOKEN:undefined}],
    ['legal approval',{TELEGRAM_APPROVED_CONSENT_VERSION:undefined}],
    ['illegal version',{TELEGRAM_APPROVED_CONSENT_VERSION:'../../unapproved'}],
    ['recipient',{TELEGRAM_ALLOWED_CHAT_IDS:undefined}],
    ['invalid recipient',{TELEGRAM_ALLOWED_CHAT_IDS:'187650211,ab'}],
    ['empty recipient',{TELEGRAM_ALLOWED_CHAT_IDS:'  '}],
    ['duplicate recipient',{TELEGRAM_ALLOWED_CHAT_IDS:'187650211,187650211'}],
    ['origin',{PUBLIC_ORIGIN:undefined}],
    ['non-TLS origin',{PUBLIC_ORIGIN:'http://kneba.vsp.rest/'}],
    ['URL credentials',{PUBLIC_ORIGIN:'https://test:secret@kneba.vsp.rest/'}],
    ['invalid host',{PUBLIC_ORIGIN:'https://knaba.example.invalid/'}],
    ['unexpected path',{PUBLIC_ORIGIN:'https://kneba.vsp.rest/admin/'}]
  ] as const)('fails closed when %s is missing or invalid',(_name,override)=>{
    expect(()=>configure(override)).toThrow('TELEGRAM_OUTBOUND_CONFIGURATION_MISSING');
  });

  it('wires an explicitly allowed recipient and versioned consent without sending on boot',async()=>{
    const request=vi.fn(async(_url:string,init?:RequestInit)=>{
      expect(_url).toContain('/sendMessage');
      expect(JSON.parse(String(init?.body))).toMatchObject({
        chat_id:chat,text:'KnaBa reply',link_preview_options:{is_disabled:true}
      });
      return new Response(JSON.stringify({
        ok:true,result:{message_id:141,chat:{id:Number(chat)}}
      }),{status:200,headers:{'content-type':'application/json'}});
    });
    vi.stubGlobal('fetch',request);
    const options=configure({APP_MODE:'PRODUCTION'});
    expect(options.telegram).toBeInstanceOf(TelegramBotAdapter);
    expect(options.telegramApprovedConsentVersion).toBe('TEST_ONLY_NOTICE_2026');
    expect(request).not.toHaveBeenCalled();
    await expect(options.telegram!.sendText('999','KnaBa reply',{
      consent:true,verifiedPrivateRecipient:true
    })).rejects.toMatchObject({code:'ACCESS_DENIED'});
    await expect(options.telegram!.sendText(chat,'KnaBa reply',{
      consent:false,verifiedPrivateRecipient:true
    })).rejects.toMatchObject({code:'ACCESS_DENIED'});
    expect(request).not.toHaveBeenCalled();
    await expect(options.telegram!.sendText(chat,'KnaBa reply',{
      consent:true,verifiedPrivateRecipient:true
    })).resolves.toEqual({provider_message_id:'141',status:'API_ACCEPTED'});
    expect(request).toHaveBeenCalledTimes(1);
  });
});
