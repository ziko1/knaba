import { describe, expect, it } from 'vitest';
import { constructionOffers } from '../src/data/construction-offers';
import { buildInquiry, validateInquiry } from '../src/lib/inquiry';
import { constructionInquiryData, constructionMessageLimit, validateConstructionInquiry } from '../src/lib/inquiry-construction';
import { createPlannerStore } from '../src/stores/planner';
import type { PublicLocale } from '../src/lib/public-i18n';

const draft = { service: 'baureinigung', objectType: 'Baustelle', postcode: '10315', area: '', frequency: 'Einmalig', name: 'QA Example', email: 'qa@example.com', phone: '', message: 'Access after 08:00.' };

describe('precise construction enquiries with the existing CRM contract', () => {
  for (const locale of ['de', 'en', 'uk', 'ru'] as PublicLocale[]) {
    it(`carries every advertised topic into the saved payload and summary (${locale})`, () => {
      for (const offer of constructionOffers) {
        const payload = constructionInquiryData(draft, offer.slug, locale);
        expect(payload.service).toBe('baureinigung');
        expect(payload.message).toContain(offer.name[locale]);
        expect(payload.message).toContain(draft.message);
        expect(validateInquiry(payload, locale)).toEqual({});
        const summary = buildInquiry(payload, locale, offer.slug);
        expect(summary.subject).toContain(offer.name[locale]);
        expect(summary.body).toContain(offer.name[locale]);
      }
    });
    it(`reserves message room without dropping text (${locale})`, () => {
      for (const offer of constructionOffers) {
        const limit = constructionMessageLimit(offer.slug, locale);
        const payload = constructionInquiryData({ ...draft, message: 'x'.repeat(limit) }, offer.slug, locale);
        expect(payload.message).toHaveLength(500);
        expect(validateInquiry(payload, locale)).toEqual({});
        expect(validateInquiry({ ...payload, message: payload.message + 'x' }, locale).message).toBeTruthy();
      }
    });
  }
  it('rejects an unknown URL topic instead of injecting it in a request', () => {
    expect(() => constructionInquiryData(draft, 'https://untrusted.example', 'de')).toThrow();
    expect(() => buildInquiry(draft, 'de', '../../other')).toThrow();
  });
  it('changing topics does not accumulate previous prefixes or edit the user message', () => {
    const first = constructionInquiryData(draft, 'bauhilfe', 'de');
    const second = constructionInquiryData(draft, 'bauzwischenreinigung', 'de');
    expect(first.message).toContain('Bauhelfer');
    expect(second.message).not.toContain('Bauhelfer');
    expect(second.message).toContain(draft.message);
    expect(draft.message).toBe('Access after 08:00.');
  });
  it('preserves text and reports the actual remaining limit when changing to a longer topic', () => {
    const input = { ...draft, message: 'x'.repeat(constructionMessageLimit('baureinigung', 'uk')) };
    const before = { ...input };
    expect(validateConstructionInquiry(input, 'baureinigung', 'uk')).toEqual({});
    expect(validateConstructionInquiry(input, 'bauhilfe', 'uk').message).toContain(String(constructionMessageLimit('bauhilfe', 'uk')));
    expect(input).toEqual(before);
  });
  it('all five planner topics notify islands with their precise choice; special work is enquiry-only', () => {
    const store = createPlannerStore();
    const observed: string[] = [];
    store.subscribe(state => observed.push(state.topic));
    const topics = constructionOffers.filter(offer => offer.core).map(offer => offer.slug);
    expect(topics).toHaveLength(5);
    for (const topic of topics) {
      store.getState().selectTopic(topic);
      expect(store.getState().topic).toBe(topic);
      expect(store.getState().service).toBe('baureinigung');
    }
    expect(observed).toEqual(topics);
    store.getState().selectTopic('kernbohrungen');
    expect(observed).toEqual(topics);
  });
});
