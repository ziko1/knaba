import {describe,expect,it} from 'vitest';
import {constructionOffers} from '../src/data/construction-offers';
import projectIntents from '../src/data/project-intents.json';

const locales=['de','en','uk','ru'] as const;
const slugs=['bauzwischenreinigung','bauendreinigung','baustellenraeumung','bauhilfe'] as const;

describe('Corporate project-intent SEO content',()=>{
  it('guides users to the same four live core construction services in every locale',()=>{
    const active=new Set(constructionOffers.filter(offer=>offer.core).map(offer=>offer.slug));
    for(const locale of locales){
      const copy=projectIntents[locale];
      expect(copy.cases.map(item=>item.slug)).toEqual(slugs);
      expect(new Set(copy.cases.map(item=>item.slug)).size).toBe(slugs.length);
      for(const item of copy.cases){
        expect(active.has(item.slug)).toBe(true);
        expect(item.situation.length).toBeGreaterThan(18);
        expect(item.explanation.length).toBeGreaterThan(80);
        expect(item.request.length).toBeGreaterThan(20);
      }
    }
  });

  it('uses human-readable copy and useful inputs, not invented rankings, prices or offers',()=>{
    for(const locale of locales){
      const copy=projectIntents[locale];
      for(const text of [copy.title,copy.intro,copy.note,copy.link,copy.request]){
        expect(text.trim().length).toBeGreaterThan(10);
      }
    }
    const all=JSON.stringify(projectIntents).toLowerCase();
    for(const retired of ['bueroreinigung','unterhaltsreinigung','treppenreinigung']){
      expect(all).not.toContain(retired);
    }
    expect(all).not.toMatch(/aggregateRating|reviewCount|bestpreis|garantierter preis|99\s?%/i);
  });

  it('keeps locale structure identical for SEO parity',()=>{
    const keys=Object.keys(projectIntents.de).sort();
    for(const locale of locales){
      expect(Object.keys(projectIntents[locale]).sort()).toEqual(keys);
      for(const item of projectIntents[locale].cases){
        expect(Object.keys(item).sort()).toEqual(['explanation','request','situation','slug']);
      }
    }
  });
});
