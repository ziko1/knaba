import {describe,it,expect} from 'vitest';
import {languages,translator} from '../packages/i18n/index.ts';
import {routerLanguages,routerText} from '../packages/integrations/whatsapp-router-text.ts';
import {telegramPublicReply,telegramRequestedLocale} from '../packages/integrations/telegram-public-navigation.ts';
import {botChannelPolicyCommands} from '../packages/domain/bot-channel-policy.ts';
describe('customer release language order without changing translation columns',()=>{
 const ordered=['DE','EN','PL','LT','RU','UK'] as const;
 it('uses the requested order for ERP and WhatsApp',()=>{expect(languages).toEqual(ordered);expect(routerLanguages).toEqual(ordered);});
 it('keeps the correct label in every established language',()=>{
  expect(ordered.map(l=>translator(l)('signIn'))).toEqual(['Anmelden','Sign in','Zaloguj się','Prisijungti','Войти','Увійти']);
  expect(ordered.map(l=>routerText(l,'main'))).toEqual(['KNABA DE · Arbeitsmenü','KNABA DE · Work menu','KNABA DE · Menu pracy','KNABA DE · Darbo meniu','KNABA DE · Рабочее меню','KNABA DE · Робоче меню']);
 });
 it.each(ordered)('accepts %s in existing owner policy and public display selector',language=>{
  expect(telegramRequestedLocale('/language '+language)).toBe(language);
  expect(botChannelPolicyCommands['bot.channel.preferences.configure']!.schema.safeParse({channel:'TELEGRAM',defaultLanguage:language,workerRequestsEnabled:true,partnerRequestsEnabled:true,humanEscalationEnabled:true,replyMode:'HUMAN_FIRST'}).success).toBe(true);
 });
 it('returns Polish and Lithuanian response text without granting an account',()=>{
  expect(telegramPublicReply('REGISTER','PL','https://knaba.example.test')).toContain('Nie utworzono konta');
  expect(telegramPublicReply('REGISTER','LT','https://knaba.example.test')).toContain('Paskyra ar darbuotojo vaidmuo nesuteiktas');
 });
});
