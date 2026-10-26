import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const home=readFileSync(new URL('../src/components/ConstructionHome.astro',import.meta.url),'utf8');
const guide=readFileSync(new URL('../src/components/ProjectScopeGuide.astro',import.meta.url),'utf8');
describe('KNABA approved design additive contract',()=>{
 it('preserves existing homepage section sequence',()=>{
  const sections=['<ServiceCarousel locale={locale} />','id="bau-services"','class="bau-contract"','id="bau-process-title"','<MarketingStories locale={locale} />','<ProjectScopeGuide locale={locale} />','<CompanyProfile locale={locale} compact />','<Partners locale={locale} />','<Reviews locale={locale} />','<ConstructionFaq locale={locale} />','class="container bau-end-cta"'];
  const offsets=sections.map(section=>home.indexOf(section));
  expect(offsets.every(offset=>offset>=0)).toBe(true);
  expect(offsets).toEqual([...offsets].sort((a,b)=>a-b));
  expect(home.match(/<ProjectScopeGuide locale={locale} \/>/g)).toHaveLength(1);
 });
 it('uses existing palette and no new fonts or dependencies',()=>{
  expect(guide).toContain('class="button button-dark"');
  expect(guide).toContain('href={prefix+\'/planer/\'}');
  expect(guide).not.toMatch(/font-family|@import|<script|client:load|!important/);
  expect(guide).toContain('grid-template-columns:1fr');
 });
 it('includes four real languages and never promises a fixed price',()=>{
  for(const locale of ['de','en','uk','ru'])expect(guide).toContain(locale+':{eyebrow:');
  expect(guide).not.toMatch(/€[0-9]|[0-9]+\s*EUR/);
 });
});
