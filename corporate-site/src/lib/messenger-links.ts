export type PublicMessengerLocale='de'|'en'|'pl'|'lt'|'ru'|'uk';
type PublicMessengerConfig={whatsappNumber?:unknown;telegramBotUsername?:unknown};
const hello:Record<PublicMessengerLocale,string>={
  de:'Guten Tag KnaBa, ich möchte eine Beratung zu Ihren Leistungen.',
  en:'Hello KnaBa, I would like to ask about your services.',
  pl:'Dzień dobry KnaBa, proszę o konsultację dotyczącą usług.',
  lt:'Sveiki, KnaBa, norėčiau pasikonsultuoti dėl jūsų paslaugų.',
  uk:'Вітаю, KnaBa! Хочу отримати консультацію щодо ваших послуг.',
  ru:'Здравствуйте, KnaBa! Хочу получить консультацию по вашим услугам.'
};
/**
 * Channel ownership must be verified by KNABA before setting either build-only
 * variable. The company's public telephone number is NOT proof of WhatsApp.
 * No session ID, customer name, number or conversation is ever in the URL.
 */
export function publicMessengerLinks(config:PublicMessengerConfig,locale:PublicMessengerLocale){
  const wa=typeof config.whatsappNumber==='string'?config.whatsappNumber.trim():'';
  const tg=typeof config.telegramBotUsername==='string'?config.telegramBotUsername.trim():'';
  const whatsapp=/^[1-9][0-9]{7,14}$/.test(wa)
    ?'https://wa.me/'+wa+'?text='+encodeURIComponent(hello[locale]):undefined;
  const telegram=/^[a-zA-Z][a-zA-Z0-9_]{1,28}bot$/i.test(tg)&&tg.length<=32
    ?'https://t.me/'+tg+'?start=website':undefined;
  return {whatsapp,telegram} as const;
}
