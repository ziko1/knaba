/** KNABA I18N-99: target inventory; ONLY published locales have human-reviewed pages.
 * Pending languages must not receive hreflang entries or counterfeit translated URLs.
 * This module performs no external calls, writes, or provider dispatch.
 */
export const TARGET_LOCALE_CODES = [
  "de",
  "en",
  "uk",
  "ru",
  "af",
  "sq",
  "am",
  "ar",
  "hy",
  "as",
  "az",
  "eu",
  "be",
  "bn",
  "bs",
  "bg",
  "my",
  "ca",
  "ceb",
  "zh-Hans",
  "zh-Hant",
  "hr",
  "cs",
  "da",
  "nl",
  "eo",
  "et",
  "fil",
  "fi",
  "fr",
  "gl",
  "ka",
  "el",
  "gu",
  "ht",
  "ha",
  "he",
  "hi",
  "hu",
  "is",
  "ig",
  "id",
  "ga",
  "it",
  "ja",
  "jv",
  "kn",
  "kk",
  "km",
  "rw",
  "ko",
  "ku",
  "ky",
  "lo",
  "lv",
  "lt",
  "mk",
  "mg",
  "ms",
  "ml",
  "mt",
  "mi",
  "mr",
  "mn",
  "ne",
  "no",
  "or",
  "ps",
  "fa",
  "pl",
  "pt",
  "pa",
  "ro",
  "gd",
  "sr",
  "sn",
  "sd",
  "si",
  "sk",
  "sl",
  "so",
  "es",
  "sw",
  "sv",
  "tg",
  "ta",
  "te",
  "th",
  "tr",
  "tk",
  "ur",
  "ug",
  "uz",
  "vi",
  "cy",
  "xh",
  "yi",
  "yo",
  "zu"
] as const;
export const PUBLISHED_SITE_LOCALES = ['de', 'en', 'uk', 'ru'] as const;
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

const available = new Set<string>(PUBLISHED_SITE_LOCALES);
const targetCodes = new Set<string>(TARGET_LOCALE_CODES);
const rightToLeft = new Set<string>(['ar','fa','he','ps','sd','ug','ur','yi']);
const englishNames = new Intl.DisplayNames(['en'], {type:'language'});

export function isTargetLocale(value: unknown): value is TargetLocale {
  return typeof value === 'string' && targetCodes.has(value);
}
export function translationStatus(value: unknown): TranslationStatus | null {
  return isTargetLocale(value) ? (available.has(value) ? 'published' : 'pending') : null;
}
function nativeName(code: TargetLocale): string {
  try {
    return new Intl.DisplayNames([code], {type:'language'}).of(code)
      || englishNames.of(code) || code;
  } catch {
    return englishNames.of(code) || code;
  }
}
export const localeCatalog: readonly LocaleCatalogEntry[] = Object.freeze(
  TARGET_LOCALE_CODES.map(code => Object.freeze({
    code,
    nativeLabel: nativeName(code),
    englishLabel: englishNames.of(code) || code,
    direction: rightToLeft.has(code) ? 'rtl' as const : 'ltr' as const,
    status: available.has(code) ? 'published' as const : 'pending' as const,
  }))
);
export const pendingSiteLocales = Object.freeze(localeCatalog.filter(item => item.status === 'pending'));
