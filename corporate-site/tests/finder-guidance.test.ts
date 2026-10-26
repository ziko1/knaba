import {describe,expect,it} from 'vitest';
import {createPinia,setActivePinia} from 'pinia';
import {computed} from 'vue';
import {getFinderGuidance} from '../src/data/construction-site-guidance';
import {needChoices,objectChoices,recommendConstructionTopic} from '../src/lib/planner';
import {useFinderStore} from '../src/stores/finder';
import {createPlannerStore} from '../src/stores/planner';

const locales=['de','en','uk','ru'] as const;
describe('useful object-specific Finder preparation',()=>{
  it.each(locales)('offers distinct concrete preparation for all four objects in %s',locale=>{
    const all=objectChoices.map(({value})=>getFinderGuidance(value,'handover',locale));
    expect(new Set(all.map(item=>item.items.join(' '))).size).toBe(4);
    for(const entry of all){
      expect(entry.items).toHaveLength(2);
      expect(entry.items.every(text=>text.trim().length>30)).toBe(true);
      expect(entry.heading).toBeTruthy();
      expect(entry.phase).toBeTruthy();
    }
    const text=all.map(entry=>entry.items.join(' '));
    const expected={de:[/Nutzungszeiten/,/Wohnungen/,/Bauabschnitte/,/getrennt anfragen/],en:[/operating hours/,/homes/,/construction sections/,/separately/],uk:[/години роботи/,/квартири/,/будівельні ділянки/,/окремо/],ru:[/часы работы/,/квартиры/,/строительные участки/,/отдельно/]}[locale];
    text.forEach((value,index)=>expect(value).toMatch(expected[index]!));
  });
  it('keeps every object and phase genuinely translated instead of falling back to German',()=>{
    for(const object of objectChoices)for(const need of needChoices){
      const translations=locales.map(locale=>getFinderGuidance(object.value,need.value,locale));
      expect(new Set(translations.map(value=>value.heading)).size).toBe(4);
      expect(new Set(translations.map(value=>value.phase)).size).toBe(4);
      for(let index=0;index<2;index++)expect(new Set(translations.map(value=>value.items[index])).size).toBe(4);
    }
  });
  it.each(locales)('changes the practical phase advice for all needs in %s',locale=>{
    const phases=needChoices.map(({value})=>getFinderGuidance('housing',value,locale).phase);
    expect(new Set(phases).size).toBe(4);
  });
  it('updates advice with the actual Pinia selections while retaining the shared cleaning-topic contract',()=>{
    setActivePinia(createPinia());
    const finder=useFinderStore(),plan=createPlannerStore();
    const advice=computed(()=>getFinderGuidance(finder.object,finder.need,'en'));
    expect(advice.value.items.join(' ')).toContain('construction sections');
    finder.chooseObject('housing');
    expect(advice.value.items.join(' ')).toContain('occupied and vacant homes');
    finder.chooseNeed('intensive');
    expect(advice.value.phase).toContain('material types');
    plan.getState().selectTopic(recommendConstructionTopic(finder.need));
    expect(plan.getState().service).toBe('baureinigung');
    expect(plan.getState().topic).toBe('baustellenraeumung');
    finder.chooseObject('education');
    expect(advice.value.items.join(' ')).toContain('not included in this cleaning selection');
    expect(plan.getState().topic).toBe('baustellenraeumung');
  });
  it('falls back to general construction and handover advice for unknown or inherited keys',()=>{
    for(const object of [undefined,null,42,{},'unknown','constructor','__proto__'])for(const locale of locales){
      expect(getFinderGuidance(object,'handover',locale)).toEqual(getFinderGuidance('construction','handover',locale));
    }
    for(const need of [undefined,null,42,{},'unknown','constructor','__proto__'])for(const locale of locales){
      expect(getFinderGuidance('office',need,locale)).toEqual(getFinderGuidance('office','handover',locale));
    }
  });
  it('offers the existing localized technical-work route only for technical context',()=>{
    for(const locale of locales){
      const related=getFinderGuidance('education','routine',locale).related;
      expect(related?.path).toBe(`${locale==='de'?'':'/'+locale}/leistungen/#zusatzarbeiten`);
      expect(related?.label).toBeTruthy();
      for(const object of ['office','housing','construction'])expect(getFinderGuidance(object,'routine',locale).related).toBeNull();
    }
  });
});
