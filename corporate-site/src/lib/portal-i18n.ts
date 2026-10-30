export {portalMessages,ensurePortalLocale} from './portal-locale-data.ts';
export type {PortalText} from './portal-locale-store.ts';
export type PortalLocale = 'de' | 'en' | 'pl' | 'lt' | 'ru' | 'uk';
export const locales = ['de', 'en', 'pl', 'lt', 'ru', 'uk'] as const;
export const serviceKeys = ['unterhaltsreinigung','bueroreinigung','glasreinigung','baureinigung','grundreinigung','treppenreinigung'] as const;
export const objectOptions = [{value:'Büro / Gewerbe',key:'office'},{value:'Wohngebäude / Treppenhaus',key:'residential'},{value:'Baustelle',key:'construction'},{value:'Bildung / Betreuung',key:'education'},{value:'Anderes Objekt',key:'other'}] as const;
export const frequencyOptions = [{value:'Einmalig',key:'once'},{value:'Regelmäßig',key:'recurring'},{value:'Noch offen',key:'undecided'}] as const;

/** A deliberate URL selection wins; a localized page wins over an older preference. */
export function resolvePortalLocale(requested?: string | null, pageLocale?: PortalLocale, saved?: string | null): PortalLocale {
  for (const candidate of [requested, pageLocale, saved]) {
    if (locales.includes(candidate as PortalLocale)) return candidate as PortalLocale;
  }
  return 'de';
}
export function portalReturnTo(locale: PortalLocale): string {
  return locale === 'ru' ? '/ru/konto/' : `/konto/?lang=${locale}`;
}
export function portalPublicPath(path: string, locale: PortalLocale): string {
  return locale === 'ru' ? `/ru${path}` : path;
}
export function formatPortalDate(date: string | null | undefined, locale: PortalLocale): string {
  if (!date) return '';
  const value = new Date(date);
  return Number.isNaN(value.valueOf()) ? '' : new Intl.DateTimeFormat(
    {de:'de-DE',en:'en-GB',pl:'pl-PL',lt:'lt-LT',ru:'ru-RU',uk:'uk-UA'}[locale],
    {timeZone:'Europe/Berlin',dateStyle:'medium',timeStyle:'short'},
  ).format(value);
}
