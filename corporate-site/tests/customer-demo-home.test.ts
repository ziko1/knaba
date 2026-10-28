import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const read = relative => readFileSync(new URL(relative,import.meta.url),'utf8');
const home=read('../src/components/ConstructionHome.astro');
const why=read('../src/components/WhyKnaBa.astro');
const guides=read('../src/components/HomeGuides.astro');
const scope=read('../src/components/ProjectScopeGuide.astro');
const guideData=read('../src/data/construction-guides.ts');
describe('KNABA customer demo: preserve existing homepage and approved blocks',()=>{
  it('adds each reusable block once after process and before FAQ',()=>{
    const order=[
      '<ServiceCarousel locale={locale} />',
      'id="bau-services"',
      'class="bau-contract"',
      'id="bau-process-title"',
      '<HomeGuides locale={locale} />',
      '<CompanyProfile locale={locale} compact />',
      '<WhyKnaBa locale={locale} />',
      '<Partners locale={locale} />',
      '<Reviews locale={locale} />',
      '<ProjectScopeGuide locale={locale} />',
      '<ConstructionFaq locale={locale} />',
      'class="container bau-end-cta"'
    ];
    const offsets=order.map(s=>home.indexOf(s));
    expect(offsets.every(n=>n>=0)).toBe(true);
    expect(offsets).toEqual([...offsets].sort((a,b)=>a-b));
    for(const element of order.filter(e=>e.includes('locale={locale}')))expect(home.split(element)).toHaveLength(2);
  });
  it('uses four translations, no invented reviews, no binding price or office-service rebrand',()=>{
    for(const lang of ['de:','en:','uk:','ru:']) {
      expect(why).toContain(lang+'{');
      expect(scope).toContain(lang+'{eyebrow:');
    }
    expect(guides).toContain('[locale]');
    expect(why).not.toMatch(/Unterhalts-, Büro-|regular, office|регулярне, офісне|регулярная, офисная/);
    expect(why+guides+scope).not.toMatch(/€\\s*[0-9]|[0-9]+\\s*EUR|fake testimonial/i);
  });
  it('links only to existing published guide slugs and planner',()=>{
    for(const slug of ['baureinigung-phasen','baureinigung-kosten-planen','bauuebergabe-checkliste'])expect(guideData).toContain("slug: '"+slug+"'");
    expect(guides).toContain("prefix+'/ratgeber/'+guide.slug+'/'");
    expect(scope).toContain("href={prefix+'/planer/'}");
  });
});
