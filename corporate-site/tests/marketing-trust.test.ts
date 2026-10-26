import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {constructionOffers} from '../src/data/construction-offers';
import {services} from '../src/data/company';
import {marketingStories} from '../src/data/marketing-stories';
import type {ReviewLocale} from '../src/data/reviews';

const locales:ReviewLocale[]=['de','en','uk','ru'];
const validPaths=new Set([
  ...constructionOffers.map(item=>'bauleistungen/'+item.slug),
  ...services.map(item=>'leistungen/'+item.slug),
]);
describe('Marketing and testimonials trust gate',()=>{
  it('shows three useful, distinct service intents in every language',()=>{
    for(const locale of locales){
      const group=marketingStories[locale];
      expect(group.heading.trim().length).toBeGreaterThan(12);
      expect(group.intro.trim().length).toBeGreaterThan(45);
      expect(group.items).toHaveLength(3);
      expect(new Set(group.items.map(item=>item.path)).size).toBe(3);
      for(const item of group.items){
        expect(validPaths.has(item.path)).toBe(true);
        expect(item.description.trim().length).toBeGreaterThan(90);
        expect(item.alt.trim().length).toBeGreaterThan(25);
        expect(item.action.trim().length).toBeGreaterThan(8);
        expect(item.image).toMatch(/^\/illustrations\/marketing-[a-z]+\.svg$/);
      }
    }
  });
  it('uses self-hosted safe standalone artwork, never supposed job photos',()=>{
    for(const image of new Set(marketingStories.de.items.map(item=>item.image))){
      const svg=readFileSync(new URL('../public'+image,import.meta.url),'utf8');
      expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
      expect(svg).toContain('<title id="title">');
      expect(svg).toContain('<desc id="desc">');
      expect(svg).not.toMatch(/<script|<image|<foreignObject|xlink:href|href="https?:/i);
      expect(svg).toMatch(/<\/svg>$/);
    }
  });
  it('does not display fictional reviews or discard approved customer feedback',()=>{
    const component=readFileSync(new URL('../src/components/PublicReviews.tsx',import.meta.url),'utf8');
    const data=readFileSync(new URL('../src/data/reviews.ts',import.meta.url),'utf8');
    expect(component).not.toMatch(/reviewExamples|reviews-examples|review-example/);
    expect(data).not.toMatch(/reviewExamples|frei erfunden|fictional example|вигаданий текст|вымышленный текст/);
    expect(component).toContain('when={reviews().length>0}');
    expect(component).toContain('each={reviews()}');
    expect(component).toContain("fetch('/api/reviews'");
    expect(component).toContain('class="reviews-notice reviews-empty"');
    expect(data).toContain('export const reviewsCopy');
    const home=readFileSync(new URL('../src/components/ConstructionHome.astro',import.meta.url),'utf8');
    const marketing=readFileSync(new URL('../src/components/MarketingStories.astro',import.meta.url),'utf8');
    expect(home).toContain('<MarketingStories locale={locale} />');
    expect(marketing).toContain('marketingStories[locale]');
    expect(marketing).toContain('src={item.image}');
    expect(marketing).toContain('/images/knaba-editorial-cleaning-triptych.webp');
    expect(marketing).toContain('{imageCaption}</figcaption>');
    expect(marketing).toContain('class="service-card marketing-story"');
    expect(marketing).not.toContain('<style>');
    const webp=readFileSync(new URL('../public/images/knaba-editorial-cleaning-triptych.webp',import.meta.url));
    expect(webp.subarray(0,4).toString()).toBe('RIFF');
    expect(webp.subarray(8,12).toString()).toBe('WEBP');
    expect(webp.length).toBeLessThan(200_000);
    expect(marketing).toContain('loading="lazy" decoding="async"');
    expect(marketing).toContain('width="960" height="540"');
    expect(marketing).toContain("href={prefix+'/'+item.path+'/'}");
    expect(marketing).not.toMatch(/blockquote|ReviewSchema|AggregateRating/);
  });
});
