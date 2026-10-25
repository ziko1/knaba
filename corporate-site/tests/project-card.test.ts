import {describe,expect,it} from 'vitest';
import {projectCard} from '../src/data/construction-project-card';
import {constructionOffers} from '../src/data/construction-offers';

describe('The sixth service grid tile is a project CTA, not an invented service',()=>{
  it('keeps exactly five genuine primary services and four localized enquiries',()=>{
    expect(constructionOffers.filter(s=>s.core)).toHaveLength(5);
    for(const locale of ['de','en','uk','ru'] as const){
      expect(projectCard[locale].title.length).toBeGreaterThan(10);
      expect(projectCard[locale].description.length).toBeGreaterThan(40);
      expect(projectCard[locale].action).toBeTruthy();
    }
  });
});
