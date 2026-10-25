import {describe, it, expect} from 'vitest';
import {inquirySelectionQuery, inquirySupportPath} from '../src/lib/inquiry-navigation';

describe('localized construction inquiry navigation', () => {
  it('uses existing DE/RU legal and portal destinations for all published languages', () => {
    for (const path of ['/datenschutz/', '/konto/'] as const) {
      for (const locale of ['de', 'en', 'uk'] as const) expect(inquirySupportPath(path, locale)).toBe(path);
      expect(inquirySupportPath(path, 'ru')).toBe('/ru' + path);
    }
  });
  it('retains an explicit construction topic while discarding personal and arbitrary query values', () => {
    expect(inquirySelectionQuery('?anliegen=bauendreinigung&email=person%40example.com')).toBe('?anliegen=bauendreinigung');
    expect(inquirySelectionQuery('?leistung=baureinigung&anliegen=kernbohrungen')).toBe('?anliegen=kernbohrungen&leistung=baureinigung');
    expect(inquirySelectionQuery('?anliegen=%3Cscript%3E&leistung=bueroreinigung&message=private')).toBe('');
  });
});
