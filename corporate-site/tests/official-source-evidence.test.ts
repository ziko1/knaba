import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {knabaExternalRating as rating} from '../src/data/external-rating';
const load=(relative:string)=>readFileSync(new URL(relative,import.meta.url),'utf8');

describe('KNABA independently sourced evidence and honest review flow',()=>{
  it('pins the exact external historical source rather than a fabricated live rating',()=>{
    expect(rating.sourceUrl).toBe('https://www.provenexpert.com/knaba-dienstleistungen-bau-und-gebaeudereinigung/');
    expect(rating.originatingPlatform).toBe('Google Maps');
    expect(rating.average).toBe(5);
    expect(rating.count).toBe(2);
    expect(rating.asOf).toBe('2025-08-22');
    expect(rating.current).toBe(false);
  });
  it('does not display invented reviews when the moderated API is empty',()=>{
    const page=load('../src/components/PublicReviews.tsx');
    expect(page).not.toContain('reviewExamples');
    expect(page).not.toContain('reviews-examples');
    expect(page).toContain('reviews-empty');
    expect(page).toContain("fetch('/api/reviews'");
    expect(page).toContain('For each={reviews()}');
  });
  it('keeps one real external evidence block plus the existing real-feedback form',()=>{
    const component=load('../src/components/Reviews.astro');
    expect(component).toContain('external-review-evidence');
    expect(component).toContain('rating.asOf');
    expect(component).toContain('<PublicReviews locale={locale} client:visible />');
    expect(component).not.toMatch(/itemprop="aggregateRating"|itemprop="review"/);
  });
  it('provides the why-us section in all four live locales without invented qualifications',()=>{
    const section=load('../src/components/WhyKnaBa.astro');
    const home=load('../src/components/ConstructionHome.astro');
    for(const locale of ['de','en','uk','ru'])expect(section).toContain(locale+':{');
    const company=home.indexOf('<CompanyProfile locale={locale} compact />');
    const why=home.indexOf('<WhyKnaBa locale={locale} />');
    const partners=home.indexOf('<Partners locale={locale} />');
    expect(company).toBeGreaterThan(-1);
    expect(why).toBeGreaterThan(company);
    expect(partners).toBeGreaterThan(why);
    expect(section).not.toMatch(/DIN EN ISO 9001 zertifiziert|Meisterbetrieb|geprüfte Lizenz/);
  });
});
