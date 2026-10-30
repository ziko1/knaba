import {describe,it,expect} from 'vitest';
import {assistantAnswer,assistantGreeting,assistantLocale,supportedAssistantLocales} from '../src/lib/assistant-knowledge';
import {publicMessengerLinks} from '../src/lib/messenger-links';
describe('six-language assistant release',()=>{
 it('keeps German default and six requested choices',()=>{
  expect(supportedAssistantLocales).toEqual(['de','en','pl','lt','ru','uk']);
  expect(assistantLocale('fr')).toBe('de');expect(assistantLocale(undefined)).toBe('de');
 });
 it('handles Polish and Lithuanian enquiries with translated non-binding guidance',()=>{
  expect(assistantGreeting('pl')).toContain('Dzień dobry');
  expect(assistantGreeting('lt')).toContain('Sveiki');
  expect(assistantAnswer('jaka cena?','pl').text).toContain('Cena zależy');
  expect(assistantAnswer('kokia kaina?','lt').text).toContain('Kaina priklauso');
  expect(assistantAnswer('właściciel','pl').handoff).toBe(true);
  expect(assistantAnswer('savininkas','lt').handoff).toBe(true);
 });
 it('creates localized, nonpersonal starter text without inventing provider ownership',()=>{
  for(const locale of ['pl','lt'] as const){
   expect(publicMessengerLinks({},locale).whatsapp).toBeUndefined();
   expect(publicMessengerLinks({whatsappNumber:'491111111111'},locale).whatsapp).toContain('https://wa.me/491111111111?text=');
  }
 });
});
