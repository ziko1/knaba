import {describe,it,expect} from 'vitest';
import {prepareConstructionLead, constructionNoteLimit, resolveOfferFromQuery, constructionMessage,offerFromConstructionMessage} from '../src/lib/construction-inquiry';
import {buildInquiry,validateInquiry, type InquiryData} from '../src/lib/inquiry';
import {constructionOffers} from '../src/data/construction-offers';

const input=():InquiryData=>({
  service:'baureinigung',objectType:'Baustelle',postcode:'03046',area:'',
  frequency:'Noch offen',name:'Test Sample',email:'nobody@example.invalid',
  phone:'',message:'Ø 120 mm, 240 mm tief, technische Prüfung erforderlich',
});

describe('construction-specific enquiries without CRM migration',()=>{
  it('preserves the chosen special service in the actual validated lead and mail summary',()=>{
    const baseline=input();
    const result=prepareConstructionLead(baseline,'kernbohrungen');
    expect(result).not.toBe(baseline);
    expect(baseline.message).not.toContain('Bauleistung');
    expect(result.service).toBe('baureinigung');
    expect(result.message).toContain('kernbohrungen');
    expect(result.message).toContain('Kernbohrungen');
    expect(result.message).toContain('Ø 120 mm');
    expect(validateInquiry(result)).toEqual({});
    const summary=buildInquiry(result,'de');
    expect(summary.body).toContain(result.message);
    const mail=new URL(summary.href);
    expect([...mail.searchParams.keys()]).toEqual(['subject','body']);
    expect(mail.hash).toBe('');
  });
  it('does not interpret unknown query values as services',()=>{
    expect(resolveOfferFromQuery('javascript:alert(1)')).toBe('baureinigung');
    expect(resolveOfferFromQuery('../../admin')).toBe('baureinigung');
    expect(resolveOfferFromQuery('durchbrueche')).toBe('durchbrueche');
    expect(resolveOfferFromQuery(null)).toBe('baureinigung');
    expect(()=>prepareConstructionLead(input(),'bueroreinigung')).toThrow(/Leistung|service/i);
  });
  it('honors 500-character backend limit without truncating user notes',()=>{
    for(const offer of constructionOffers){
      const limit=constructionNoteLimit(offer.slug);
      expect(limit).toBeGreaterThan(300);
      const fine=prepareConstructionLead({...input(),message:'x'.repeat(limit)},offer.slug);
      expect(fine.message.length).toBeLessThanOrEqual(500);
      expect(fine.message.endsWith('x'.repeat(limit))).toBe(true);
      expect(()=>prepareConstructionLead({...input(),message:'x'.repeat(limit+1)},offer.slug)).toThrow();
    }
  });
  it('derives a display-only special-work label from a validated stored prefix',()=>{
    const stored=constructionMessage('durchbrueche','Beton, technische Freigaben offen');
    expect(offerFromConstructionMessage(stored)?.slug).toBe('durchbrueche');
    expect(offerFromConstructionMessage('Other note\\n'+stored)).toBeNull();
    expect(offerFromConstructionMessage('Bauleistung [durchbrueche]: UNCHECKED')).toBeNull();
    expect(offerFromConstructionMessage('Bauleistung [../../admin]: fake')).toBeNull();
    expect(offerFromConstructionMessage(null)).toBeNull();
  });
  it('records full categories for construction cleaning, workers and special requests',()=>{
    for(const offer of constructionOffers){
      const prepared=prepareConstructionLead(input(),offer.slug);
      expect(prepared.message).toContain(offer.slug);
      expect(prepared.message).toContain(offer.name.de);
      expect(validateInquiry(prepared)).toEqual({});
    }
  });
});
