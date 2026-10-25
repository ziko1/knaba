import { describe, expect, it } from 'vitest';
import { buildInquiry, emptyInquiry, frequencies, objectTypes, validateInquiry } from '../src/lib/inquiry';
import { getPreparation, getService, recommendService } from '../src/lib/planner';
import { publicApiError, publicText } from '../src/lib/public-i18n';

const valid = () => ({service:'bueroreinigung', objectType:'Büro / Gewerbe', postcode:'03046', area:'25', frequency:'Regelmäßig', name:'Иван Пример', email:'example@example.com', phone:'', message:'Окна & двери?\ncc=other@example.com'});

describe('Russian inquiry with stable backend contracts', () => {
  it('localizes every required-field error without changing validation requirements', () => {
    const de = validateInquiry(emptyInquiry());
    const ru = validateInquiry(emptyInquiry(), 'ru');
    expect(Object.keys(ru)).toEqual(Object.keys(de));
    expect(ru.service).toBe('Выберите услугу.');
    expect(ru.postcode).toBe('Введите почтовый индекс из пяти цифр.');
    expect(Object.values(ru).every(value => /[А-Яа-яЁё]/u.test(value))).toBe(true);
  });
  it('displays translated enum labels while only accepting canonical API values', () => {
    for (const objectType of objectTypes) for (const frequency of frequencies) {
      const data = {...valid(), objectType, frequency};
      expect(validateInquiry(data, 'ru')).toEqual({});
      expect(publicText(objectType, 'ru')).not.toBe(objectType);
      expect(publicText(frequency, 'ru')).not.toBe(frequency);
    }
    expect(validateInquiry({...valid(), objectType:'Офис / коммерческое помещение'}, 'ru').objectType).toBeTruthy();
    expect(validateInquiry({...valid(), frequency:'Регулярно'}, 'ru').frequency).toBeTruthy();
  });
  it('builds a Russian copyable summary without mutating payload or mailto recipients', () => {
    const data = valid();
    const before = structuredClone(data);
    const summary = buildInquiry(data, 'ru');
    expect(data).toEqual(before);
    expect(summary.subject).toBe('Заявка на уборку: Уборка офисов');
    expect(summary.body).toContain('Тип объекта: Офис / коммерческое помещение');
    expect(summary.body).toContain('Периодичность: Регулярно');
    expect(summary.body).toContain('Почтовый индекс: 03046');
    expect(summary.body).toContain(data.message);
    const url = new URL(summary.href);
    expect(url.pathname).toBe('kontakt@knaba.de');
    expect([...url.searchParams.keys()]).toEqual(['subject', 'body']);
    expect(url.searchParams.get('body')).toBe(summary.body);
  });
  it('retains canonical planner selections and localizes preparation', () => {
    const slug = recommendService('construction', 'routine');
    const service = getService(slug, 'ru');
    expect(service.slug).toBe('baureinigung');
    expect(service.name).toBe('Строительный клининг');
    expect(getPreparation(slug, 'ru')).toContain('Укажите планируемую дату передачи или заселения');
    expect(getPreparation('unknown', 'ru')).toEqual(getPreparation('baureinigung', 'ru'));
  });
  it('shows actionable localized API errors and avoids server language leakage', () => {
    expect(publicApiError('rate_limit', 'ru', 'German server text')).toContain('Слишком много заявок');
    expect(publicApiError('unknown', 'ru', 'German server text')).toContain('Не удалось сохранить заявку');
    expect(publicApiError('unknown', 'de', 'Original message')).toBe('Original message');
  });
});
