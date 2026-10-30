import {describe,it,expect} from 'vitest';
import {portalMessages,locales,resolvePortalLocale,formatPortalDate} from '../src/lib/portal-i18n';
import {workspaceWords} from '../src/lib/workspace-i18n';
import {plAccess,ltAccess} from '../src/lib/account-extra-locales';
import {plUI,ltUI} from '../src/lib/public-extra-locales';
import {enUI} from '../src/lib/construction-ui-translations';
import {accountLocale,accountDestinations} from '../src/lib/account-access';
import {publicApiError} from '../src/lib/public-i18n';
import {getFinderGuidance} from '../src/data/construction-site-guidance';
import {objectChoices,needChoices,getTopicPreparation} from '../src/lib/planner';

describe('Polish and Lithuanian interactive workflow coverage',()=>{
 it('provides every portal and workspace state without missing values',()=>{
  expect(locales).toEqual(['de','en','pl','lt','ru','uk']);
  for(const locale of locales){
   expect(Object.keys(portalMessages[locale]).sort()).toEqual(Object.keys(portalMessages.de).sort());
   expect(Object.keys(workspaceWords[locale]).sort()).toEqual(Object.keys(workspaceWords.de).sort());
   for(const text of [...Object.values(portalMessages[locale]),...Object.values(workspaceWords[locale])])expect(text.trim().length).toBeGreaterThan(0);
  }
 });
 it('keeps selected PL/LT language through sign-in destinations and falls back safely',()=>{
  for(const locale of ['pl','lt'] as const){
   expect(resolvePortalLocale(locale)).toBe(locale);expect(accountLocale(locale)).toBe(locale);
   expect(accountDestinations('client',locale)[0].href).toBe('/konto/?lang='+locale+'&cabinet=client');
   expect(formatPortalDate('2026-10-28T12:00:00Z',locale)).not.toContain('Invalid');
   expect(publicApiError('origin',locale,'German server fallback')).not.toContain('German');
  }
  expect(resolvePortalLocale('xx')).toBe('de');expect(accountLocale('__proto__')).toBe('de');
 });
 it('covers the existing public form strings and complete auth-dialog dictionaries',()=>{
  for(const texts of [plUI,ltUI])for(const key of Object.keys(enUI))expect(texts[key],key).toBeTruthy();
  expect(Object.keys(plAccess).sort()).toEqual(Object.keys(ltAccess).sort());
  expect(plAccess.pending).toContain('zatwierdzenie');expect(ltAccess.pending).toContain('patvirtinimo');
 });
 it('localizes all actual finder combinations and prepares non-binding service enquiries',()=>{
  for(const locale of ['pl','lt'] as const)for(const object of objectChoices)for(const need of needChoices){
   const result=getFinderGuidance(object.value,need.value,locale);
   expect(result.heading).toBeTruthy();expect(result.items).toHaveLength(2);expect(result.items.every(Boolean)).toBe(true);expect(result.phase).toBeTruthy();
   if(result.related)expect(result.related.path).toBe('/'+locale+'/leistungen/#zusatzarbeiten');
   expect(getTopicPreparation('bauhilfe','baureinigung',locale)).toHaveLength(4);
  }
 });
});
