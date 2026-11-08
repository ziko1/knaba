import {plUI,ltUI,extraOfferNames,extraOfferDescriptions} from './public-extra-locales.ts';
import {enUI,ukUI,ruUI as ru} from './construction-ui-translations.ts';
import { ruServices } from '../data/ru-services.ts';
import type { Service } from '../data/company.ts';

export type PublicLocale = 'de' | 'en' | 'pl' | 'lt' | 'ru' | 'uk';


export function publicText(text: string, locale: PublicLocale = 'de'): string {
  return locale === 'pl' ? (plUI[text] ?? text) : locale === 'lt' ? (ltUI[text] ?? text) : locale === 'ru' ? (ru[text] ?? text) : locale === 'en' ? (enUI[text] ?? text) : locale === 'uk' ? (ukUI[text] ?? text) : text;
}

export function localizedService<T extends {slug: Service['slug']; name: string; description: string}>(service: T, locale: PublicLocale = 'de'): T {
  if(service.slug === 'baureinigung' && locale !== 'de'){
    const names={pl:'Sprzątanie budowlane',lt:'Statybų valymas',en:'Construction cleaning',uk:'Будівельний клінінг',ru:'Строительный клининг'};
    const descriptions={pl:'Sprzątanie wstępne, między etapami, dokładne i końcowe na budowie.',lt:'Pirminis, tarpinis, kruopštus ir galutinis statybų valymas.',en:'Rough, interim, fine and final cleaning on construction sites.',uk:'Грубе, міжетапне, тонке і фінальне прибирання будівельних об’єктів.',ru:'Черновая, промежуточная, тонкая и финальная уборка стройплощадок.'};
    return {...service,name:names[locale],description:descriptions[locale]} as T;
  }
  return locale === 'ru' ? {...service,...ruServices[service.slug]} as T : service;
}

export function publicOfferName(offer: {slug:string;name:Record<'de'|'en'|'uk'|'ru',string>}, locale:PublicLocale):string {
  return locale==='pl'||locale==='lt' ? extraOfferNames[locale][offer.slug] ?? offer.name.de : offer.name[locale];
}

export function publicOfferDescription(offer: {slug:string;description:Record<'de'|'en'|'uk'|'ru',string>},locale:PublicLocale):string {
 return locale==='pl'||locale==='lt'?extraOfferDescriptions[locale][offer.slug]??offer.description.de:offer.description[locale];
}

export function publicApiError(code: unknown, locale: PublicLocale, fallback: string): string {
  if (locale === 'pl' || locale === 'lt') {
    const errorMessages = {
      pl:{rate_limit:'Zbyt wiele zapytań. Poczekaj i spróbuj ponownie.',privacy:'Potwierdź zapoznanie się z informacją o ochronie danych.',validation:'Sprawdź wymagane pola i poprawność danych.',unavailable:'Usługa jest chwilowo niedostępna. Spróbuj później.',origin:'Nie udało się potwierdzić zapytania. Odśwież stronę i spróbuj ponownie.',idempotency:'Identyfikator zapytania jest nieprawidłowy. Odśwież stronę.',idempotency_conflict:'Ten identyfikator dotyczy innego zapytania. Najpierw sprawdź zapisane zgłoszenia.',body_size:'Zapytanie jest za duże. Skróć wiadomość.'},
      lt:{rate_limit:'Per daug užklausų. Palaukite ir bandykite dar kartą.',privacy:'Patvirtinkite, kad perskaitėte privatumo pranešimą.',validation:'Patikrinkite privalomus laukus ir duomenų teisingumą.',unavailable:'Paslauga laikinai nepasiekiama. Bandykite vėliau.',origin:'Nepavyko patvirtinti užklausos. Atnaujinkite puslapį ir bandykite dar kartą.',idempotency:'Netinkamas užklausos identifikatorius. Atnaujinkite puslapį.',idempotency_conflict:'Šis identifikatorius priklauso kitai užklausai. Pirmiausia patikrinkite išsaugotas užklausas.',body_size:'Užklausa per didelė. Sutrumpinkite žinutę.'},
    }[locale];
    return typeof code==='string' && Object.hasOwn(errorMessages,code) ? errorMessages[code as keyof typeof errorMessages] : publicText('Ihre Anfrage konnte nicht gespeichert werden. Bitte versuchen Sie es erneut.',locale);
  }
  if (locale !== 'ru') return publicText(fallback,locale);
  const messages: Record<string, string> = {
    rate_limit: 'Слишком много заявок. Повторите попытку позже или позвоните нам.',
    privacy: 'Подтвердите, что вы ознакомились с информацией о защите данных.',
    validation: 'Проверьте обязательные поля и правильность введённых данных.',
    unavailable: 'Сервис временно недоступен. Повторите попытку позже.',
    origin: 'Не удалось подтвердить запрос. Обновите страницу и повторите попытку.',
    idempotency: 'Идентификатор заявки недействителен. Обновите страницу.',
    idempotency_conflict: 'Этот идентификатор относится к другой заявке. Сначала проверьте сохранённые заявки.',
    body_size: 'Заявка слишком большая. Сократите сообщение.',
  };
  return typeof code === 'string' && messages[code] ? messages[code] : 'Не удалось сохранить заявку. Повторите попытку или свяжитесь с нами напрямую.';
}
