import {describe,it,expect} from 'vitest';
import {TARGET_LOCALE_CODES,PUBLISHED_SITE_LOCALES,localeCatalog,pendingSiteLocales,isTargetLocale,translationStatus} from '../src/lib/locale-catalog';
import {languageLinks,localeAlternates} from '../src/lib/site-i18n';

describe('99-language I18N target inventory and release gates',()=>{
  it('uses exactly 99 valid, distinct BCP47 locale codes',()=>{
    expect(TARGET_LOCALE_CODES).toHaveLength(99);
    expect(new Set(TARGET_LOCALE_CODES).size).toBe(99);
    expect(localeCatalog).toHaveLength(99);
    for(const item of localeCatalog){
      expect(Intl.getCanonicalLocales(item.code)).toEqual([item.code]);
      expect(item.nativeLabel.trim()).not.toBe('');
      expect(item.englishLabel.trim()).not.toBe('');
    }
  });
  it('restricts published translations to four and marks all other 95 as pending',()=>{
    expect(PUBLISHED_SITE_LOCALES).toEqual(['de','en','uk','ru']);
    expect(localeCatalog.filter(item=>item.status==='published').map(item=>item.code)).toEqual(PUBLISHED_SITE_LOCALES);
    expect(pendingSiteLocales).toHaveLength(95);
    expect(translationStatus('es')).toBe('pending');
    expect(translationStatus('en')).toBe('published');
    expect(translationStatus('xx')).toBeNull();
    expect(isTargetLocale('__proto__')).toBe(false);
  });
  it('never advertises untranslated locales via hreflang or language URLs',()=>{
    expect(localeAlternates('/uk/bauleistungen/baureinigung/').map(x=>x.lang)).toEqual(['de','en','uk','ru','x-default']);
    expect(localeAlternates('/studio/')).toEqual([]);
    expect(languageLinks('/en/leistungen/').map(x=>x.lang)).toEqual(['de','en','uk','ru']);
  });
  it('stores direction for RTL languages without modifying audited site locales',()=>{
    for(const code of ['ar','he','fa','ur','ps','sd','ug','yi'])
      expect(localeCatalog.find(x=>x.code===code)?.direction).toBe('rtl');
    for(const code of PUBLISHED_SITE_LOCALES)
      expect(localeCatalog.find(x=>x.code===code)?.direction).toBe('ltr');
  });
});
