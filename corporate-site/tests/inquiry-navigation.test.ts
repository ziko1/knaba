import {describe, it, expect} from 'vitest';
import {inquirySelectionQuery, inquirySupportPath} from '../src/lib/inquiry-navigation';

describe('localized construction inquiry navigation', () => {
  it('keeps legal pages genuine and preserves the selected portal language',()=>{
    for(const locale of ['de','en','pl','lt','uk'] as const){
      expect(inquirySupportPath('/datenschutz/',locale)).toBe('/datenschutz/');
      expect(inquirySupportPath('/konto/',locale)).toBe('/konto/?lang='+locale);
    }
    expect(inquirySupportPath('/datenschutz/','ru')).toBe('/ru/datenschutz/');
    expect(inquirySupportPath('/konto/','ru')).toBe('/ru/konto/');
  });
  it('retains an explicit construction topic while discarding personal and arbitrary query values', () => {
    expect(inquirySelectionQuery('?anliegen=bauendreinigung&email=person%40example.com')).toBe('?anliegen=bauendreinigung');
    expect(inquirySelectionQuery('?leistung=baureinigung&anliegen=kernbohrungen')).toBe('?anliegen=kernbohrungen&leistung=baureinigung');
    expect(inquirySelectionQuery('?anliegen=%3Cscript%3E&leistung=bueroreinigung&message=private')).toBe('');
  });
});
