import {describe,it,expect} from 'vitest';
import {constructionOffers} from '../src/data/construction-offers';
import type {ConstructionLocale} from '../src/data/construction-offers';
import {serviceInsights,insightLabels} from '../src/data/construction-service-insights';

describe('construction marketing content contract',()=>{
  const languages:ConstructionLocale[]=['de','en','uk','ru'];
  it('contains a localized, useful enquiry guide for every public service page',()=>{
    expect(constructionOffers).toHaveLength(8);
    expect(Object.keys(serviceInsights).sort()).toEqual(constructionOffers.map(s=>s.slug).sort());
    const headings=new Set<string>();
    for(const offer of constructionOffers){
      for(const locale of languages){
        const entry=serviceInsights[offer.slug][locale];
        expect(entry.heading.length).toBeGreaterThan(25);
        expect(entry.description.length).toBeGreaterThan(60);
        expect(entry.enquiry.length).toBeGreaterThan(25);
        expect(entry.question.endsWith('?')).toBe(true);
        expect(entry.answer.length).toBeGreaterThan(25);
        expect(headings.has(entry.heading)).toBe(false);
        headings.add(entry.heading);
      }
    }
    expect(headings.size).toBe(32);
  });
  it('has all four locale-specific content labels and no synthetic social proof',()=>{
    for(const locale of languages)expect(insightLabels[locale].enquiry.length).toBeGreaterThan(8);
    const all=JSON.stringify(serviceInsights).toLowerCase();
    expect(all).not.toMatch(/(?:100% zufrieden|guaranteed next day|5 stars|5 sterne)/);
  });
});
