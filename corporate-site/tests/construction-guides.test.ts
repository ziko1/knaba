import {describe,it,expect} from 'vitest';
import {constructionGuides,constructionGuideBySlug} from '../src/data/construction-guides';
import {constructionOffers} from '../src/data/construction-offers';
import {studioPages} from '../src/lib/studio-pages';
import {localeAlternates} from '../src/lib/site-i18n';

const locales=['de','en','uk','ru'] as const;
const expectedSlugs=['baureinigung-phasen','baureinigung-kosten-planen',
  'bauuebergabe-checkliste','bauendreinigung-vorbereiten'];

describe('independently-authored construction guide catalogue',()=>{
 it('has exactly four useful, stable, publicly observed guide topics',()=>{
   expect(constructionGuides.map(item=>item.slug)).toEqual(expectedSlugs);
   expect(new Set(constructionGuides.map(item=>item.slug)).size).toBe(4);
   expect(constructionGuideBySlug('unknown')).toBeUndefined();
   expect(constructionGuideBySlug('bauendreinigung-vorbereiten')?.service).toBe('bauendreinigung');
 });
 it('has original, non-empty practical guidance in all four languages',()=>{
   for(const g of constructionGuides){
     expect(g.sections).toHaveLength(4);
     expect(g.checklist.length).toBeGreaterThanOrEqual(4);
     expect(constructionOffers.some(offer=>offer.slug===g.service)).toBe(true);
     for(const lang of locales){
       expect(g.title[lang].length).toBeGreaterThan(20);
       expect(g.description[lang].length).toBeGreaterThan(65);
       expect(g.intro[lang].length).toBeGreaterThan(100);
       const text=[g.intro[lang],...g.sections.map(s=>s.body[lang]),...g.checklist.map(c=>c[lang])].join(' ');
       expect(text.length).toBeGreaterThan(1100);
       expect(g.sections.every(s=>s.heading[lang].length>20 && s.body[lang].length>155)).toBe(true);
       expect(g.checklist.every(c=>c[lang].length>15)).toBe(true);
       expect(text.toLowerCase()).not.toContain('lorem ipsum');
     }
   }
 });
 it('has uniquely written titles, introductions and paragraph content',()=>{
   for(const lang of locales){
     expect(new Set(constructionGuides.map(g=>g.title[lang])).size).toBe(4);
     expect(new Set(constructionGuides.map(g=>g.intro[lang])).size).toBe(4);
     const bodies=constructionGuides.flatMap(g=>g.sections.map(s=>s.body[lang]));
     expect(new Set(bodies).size).toBe(16);
   }
 });
 it('has exact reciprocal URLs in editor inventory and localized sitemap source',()=>{
   for(const guide of constructionGuides){
     const original='/ratgeber/'+guide.slug+'/';
     expect(localeAlternates(original).map(item=>item.lang)).toEqual(['de','en','uk','ru','x-default']);
     for(const prefix of ['','/en','/uk','/ru']){
       const route=prefix+original;
       expect(studioPages.filter(entry=>entry.path===route).length).toBe(1);
     }
   }
   expect(studioPages).toHaveLength(88);
 });
});
