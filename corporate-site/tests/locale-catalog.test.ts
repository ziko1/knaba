import {describe,it,expect} from 'vitest';
import {TARGET_LOCALE_CODES,PUBLISHED_SITE_LOCALES,LANGUAGE_NAMES,localeCatalog,pendingSiteLocales,isTargetLocale,translationStatus} from '../src/lib/locale-catalog';
import {languageLinks,localeAlternates,publishedPublicPaths} from '../src/lib/site-i18n';

describe('six requested KNABA languages',()=>{
  it('uses the exact requested order and native names with German first',()=>{
    expect(TARGET_LOCALE_CODES).toEqual(['de','en','pl','lt','ru','uk']);
    expect(PUBLISHED_SITE_LOCALES).toEqual(TARGET_LOCALE_CODES);
    expect(TARGET_LOCALE_CODES.map(code=>LANGUAGE_NAMES[code])).toEqual(['Deutsch','English','Polski','Lietuvių','Русский','Українська']);
    expect(new Set(TARGET_LOCALE_CODES).size).toBe(6);
    for(const item of localeCatalog){expect(Intl.getCanonicalLocales(item.code)).toEqual([item.code]);expect(item.nativeLabel.trim()).not.toBe('');expect(item.direction).toBe('ltr');}
  });
  it('does not advertise a larger pending inventory',()=>{
    expect(localeCatalog).toHaveLength(6);expect(pendingSiteLocales).toEqual([]);
    expect(translationStatus('pl')).toBe('published');expect(translationStatus('lt')).toBe('published');
    expect(translationStatus('es')).toBeNull();expect(translationStatus('xx')).toBeNull();expect(isTargetLocale('__proto__')).toBe(false);
  });
  it('keeps article alternates limited to actual translations while offering all six entry languages',()=>{
    expect(localeAlternates('/uk/bauleistungen/baureinigung/').map(x=>x.lang)).toEqual(['de','en','ru','uk','x-default']);
    expect(localeAlternates('/studio/')).toEqual([]);
    expect(languageLinks('/en/leistungen/').map(x=>x.lang)).toEqual(TARGET_LOCALE_CODES);
    expect(publishedPublicPaths('pl')).toContain('/pl/kontakt/');
    expect(publishedPublicPaths('pl')).not.toContain('/pl/bauleistungen/baureinigung/');
  });
});
