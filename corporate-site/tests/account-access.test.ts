import {describe, expect, it} from 'vitest';
import {accountDestinations, accountLocale, accountRole} from '../src/lib/account-access';

describe('account workspace navigation is derived from the authenticated role', () => {
  it.each(['client','worker','partner','bauleiter'] as const)('never grants management to %s', role => {
    expect(accountDestinations(role,'uk','/admin/?view=people')).toEqual([{id:'portal',href:`/konto/?lang=uk&cabinet=${role}`}]);
  });
  it.each(['owner','admin'] as const)('retains personal portal and authorized administration for %s', role => {
    expect(accountDestinations(role,'en','/admin/?view=operations&lang=ru')).toEqual([
      {id:'portal',href:`/konto/?lang=en${role === 'admin' ? '&cabinet=admin' : ''}`},
      {id:'admin',href:'/admin/?lang=en&view=operations'}
    ]);
  });
  it.each(['//example.test/admin/','https://example.test/admin/','/\\example.test/admin/','/admin/?view=../../secret','/konto/?next=https://example.test'])('ignores unsafe or unrelated return destination %s', value => {
    expect(accountDestinations('owner','de',value)[1].href).toBe('/admin/?lang=de');
  });
  it('does not offer authenticated navigation for anonymous users', () => {
    expect(accountDestinations('anonymous','de')).toEqual([]);
  });
  it.each([['/studio/','studio'],['/crm/','crm'],['/postfach/','messages']])('returns authorized management to legacy %s tool', (path,view) => {
    expect(accountDestinations('owner','uk',path)[1].href).toBe(`/admin/?lang=uk&view=${view}`);
    expect(accountDestinations('client','uk',path)).toHaveLength(1);
  });
  it('keeps owner-only tools out of an administrative role destination', () => {
    for (const path of ['/studio/','/postfach/','/admin/?view=studio']) {
      expect(accountDestinations('admin','de',path)[1].href).toBe('/admin/?lang=de');
    }
    expect(accountDestinations('admin','de','/crm/')[1].href).toBe('/admin/?lang=de&view=crm');
  });
  it.each(['pending','suspended'] as const)('retains only the safe account-status portal for %s', role => {
    expect(accountDestinations(role,'ru','/admin/')).toEqual([{id:'portal',href:'/konto/?lang=ru'}]);
  });
  it('uses explicit valid language first and rejects unknown role IDs', () => {
    expect(accountLocale('uk','de')).toBe('uk'); expect(accountLocale('bad','ru','de')).toBe('ru');
    expect(accountLocale(null,undefined)).toBe('de'); expect(accountRole('owner')).toBeUndefined();
    expect(accountRole('bauleiter')).toBe('bauleiter'); expect(accountRole('__proto__')).toBeUndefined();
  });
});
