import {describe,expect,it} from 'vitest';
import {constructionGuides,constructionGuideBySlug} from '../src/data/construction-guides';
import {constructionGuideRoutes} from '../src/data/construction-guide-routes';
import {offerBySlug} from '../src/data/construction-offers';

describe('published construction articles',()=>{
  it('keeps each discoverable route connected to one article and a real core service',()=>{
    expect(constructionGuides.map(g=>g.slug).sort()).toEqual(constructionGuideRoutes.map(g=>g.slug).sort());
    expect(new Set(constructionGuides.map(g=>g.slug)).size).toBe(constructionGuides.length);
    for(const guide of constructionGuides){
      expect(constructionGuideBySlug(guide.slug)).toBe(guide);
      expect(offerBySlug(guide.serviceSlug)?.core).toBe(true);
    }
    expect(constructionGuideBySlug('../kontakt')).toBeUndefined();
    expect(constructionGuideBySlug('bueroreinigung-checkliste')).toBeUndefined();
  });
  it('has unique safe contents anchors and complete four-language copy',()=>{
    for(const guide of constructionGuides){
      const ids=guide.sections.map(section=>section.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids).not.toContain('project-checklist');
      for(const id of ids) expect(id).toMatch(/^[a-z][a-z0-9-]*$/);
      const translated=[guide.title,guide.description,guide.intro,...guide.checklist,
        ...guide.sections.flatMap(section=>[section.title,...section.paragraphs,...(section.bullets??[])])];
      for(const value of translated){
        expect(Object.keys(value).sort()).toEqual(['de','en','ru','uk']);
        for(const text of Object.values(value)) expect(text.trim()).not.toBe('');
      }
    }
  });
});
