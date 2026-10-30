import {describe,expect,it} from 'vitest';
import {publicMessengerLinks} from '../src/lib/messenger-links';

describe('KNABA verified messenger deep links',()=>{
  it('has no public messenger links without verified configuration',()=>{
    expect(publicMessengerLinks({},'de')).toEqual({whatsapp:undefined,telegram:undefined});
  });
  it('does not assume published landline is a WhatsApp Business account',()=>{
    expect(publicMessengerLinks({whatsappNumber:'+49 (30) 679 330 54',telegramBotUsername:'@someone'},'uk'))
      .toEqual({whatsapp:undefined,telegram:undefined});
  });
  it('uses only validated static destinations and language-specific nonpersonal start text',()=>{
    const result=publicMessengerLinks({whatsappNumber:'491701234567',telegramBotUsername:'KNABA_Contact_Bot'},'uk');
    expect(result.whatsapp).toContain('https://wa.me/491701234567?text=');
    expect(decodeURIComponent(result.whatsapp!.split('text=')[1]!)).toContain('Вітаю, KnaBa!');
    expect(result.telegram).toBe('https://t.me/KNABA_Contact_Bot?start=website');
    expect(result.whatsapp).not.toContain('conversationId');
  });
  it.each(['localhost','user@host','a?x=y','X'.repeat(35),'https://example.com'] as const)
    ('rejects invented or unsafe Telegram account %s',name=>{
      expect(publicMessengerLinks({telegramBotUsername:name},'en').telegram).toBeUndefined();
    });
  it.each(['+49123456789','004912345678','1234','1'.repeat(16),'49123/123'] as const)
    ('rejects non E.164 click-to-chat number %s',number=>{
      expect(publicMessengerLinks({whatsappNumber:number},'de').whatsapp).toBeUndefined();
    });
});
