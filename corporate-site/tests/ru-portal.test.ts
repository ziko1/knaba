import { describe, expect, it } from 'vitest';
import {
  formatPortalDate, frequencyOptions, locales, objectOptions, portalMessages,
  portalPublicPath, portalReturnTo, resolvePortalLocale,
} from '../src/lib/portal-i18n';

describe('Russian portal locale', () => {
  it('has complete messages for roles, states, errors and actions', () => {
    expect(locales).toContain('ru');
    expect(Object.keys(portalMessages.ru).sort()).toEqual(Object.keys(portalMessages.de).sort());
    for (const [key, value] of Object.entries(portalMessages.ru)) {
      expect(value.trim(), key).not.toBe('');
      if (key !== 'timezone') expect(value, key).toMatch(/[А-Яа-яЁё]/);
    }
    expect(portalMessages.ru.signIn).toBe('Войти в KnaBa');
    expect(portalMessages.ru.in_progress).toBe('В работе');
  });

  it('uses explicit URL choice before a localized route, then stored preference', () => {
    expect(resolvePortalLocale(null, 'ru', 'de')).toBe('ru');
    expect(resolvePortalLocale('uk', 'ru', 'de')).toBe('uk');
    expect(resolvePortalLocale('unknown', 'ru', 'de')).toBe('ru');
    expect(resolvePortalLocale(null, undefined, 'en')).toBe('en');
    expect(resolvePortalLocale('RU', undefined, 'not-a-locale')).toBe('de');
    expect(resolvePortalLocale()).toBe('de');
  });

  it('keeps localized navigation and sign-in return targets internal', () => {
    expect(portalReturnTo('ru')).toBe('/ru/konto/');
    expect(portalReturnTo('uk')).toBe('/konto/?lang=uk');
    expect(portalPublicPath('/datenschutz/', 'ru')).toBe('/ru/datenschutz/');
    expect(portalPublicPath('/kontakt/', 'de')).toBe('/kontakt/');
  });

  it('formats Russian dates in Berlin time including the daylight-saving boundary', () => {
    expect(formatPortalDate('2026-10-24T12:00:00.000Z', 'ru')).toContain('14:00');
    expect(formatPortalDate('2026-10-24T12:00:00.000Z', 'ru')).toMatch(/окт/);
    expect(formatPortalDate('2026-10-26T12:00:00.000Z', 'ru')).toContain('13:00');
    expect(formatPortalDate('invalid', 'ru')).toBe('');
    expect(formatPortalDate(null, 'ru')).toBe('');
  });

  it('translates options while preserving existing API enum values', () => {
    expect(objectOptions.find(item => item.key === 'office')?.value).toBe('Büro / Gewerbe');
    expect(frequencyOptions.find(item => item.key === 'recurring')?.value).toBe('Regelmäßig');
    expect(portalMessages.ru[objectOptions[0].key]).toBe('Офис');
    expect(portalMessages.ru[frequencyOptions[1].key]).toBe('Регулярно');
  });
});
