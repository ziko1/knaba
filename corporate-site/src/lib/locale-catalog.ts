/** Requested KNABA languages, in product order. German remains the default.
 * Publication is route-specific: a language entry never implies that every
 * historical article or legal document has a translation.
 */
export const TARGET_LOCALE_CODES = ['de', 'en', 'pl', 'lt', 'ru', 'uk'] as const;
export const PUBLISHED_SITE_LOCALES = TARGET_LOCALE_CODES;
export type TargetLocale = typeof TARGET_LOCALE_CODES[number];
export type PublishedSiteLocale = typeof PUBLISHED_SITE_LOCALES[number];
export type TranslationStatus = 'published' | 'pending';
export type LocaleCatalogEntry = Readonly<{
  code: TargetLocale;
  nativeLabel: string;
  englishLabel: string;
  direction: 'ltr' | 'rtl';
  status: TranslationStatus;
}>;
export const LANGUAGE_NAMES: Record<TargetLocale, string> = {
  de:'Deutsch', en:'English', pl:'Polski', lt:'Lietuvių', ru:'Русский', uk:'Українська',
};
const englishNames: Record<TargetLocale,string> = {
  de:'German', en:'English', pl:'Polish', lt:'Lithuanian', ru:'Russian', uk:'Ukrainian',
};
export function isTargetLocale(value: unknown): value is TargetLocale {
  return typeof value === 'string' && TARGET_LOCALE_CODES.includes(value as TargetLocale);
}
export function translationStatus(value: unknown): TranslationStatus | null {
  return isTargetLocale(value) ? 'published' : null;
}
export const localeCatalog: readonly LocaleCatalogEntry[] = Object.freeze(
  TARGET_LOCALE_CODES.map(code => Object.freeze({
    code, nativeLabel:LANGUAGE_NAMES[code], englishLabel:englishNames[code],
    direction:'ltr' as const, status:'published' as const,
  })),
);
export const pendingSiteLocales = Object.freeze(localeCatalog.filter(item => item.status === 'pending'));
