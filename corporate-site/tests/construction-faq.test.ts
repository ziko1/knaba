import {studioPages} from '../src/lib/studio-pages';
import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {constructionFaq,faqCopy} from '../src/data/construction-faq';
import {languageLinks,localeAlternates} from '../src/lib/site-i18n';

const locales=['de','en','uk','ru'] as const;
const site=(path:string)=>readFileSync(new URL('../src/'+path,import.meta.url),'utf8');

describe('KNABA localized construction FAQ',()=>{
  it('has exactly 42 unique questions in six usable categories',()=>{
    expect(constructionFaq).toHaveLength(6);
    const items=constructionFaq.flatMap(group=>group.items);
    expect(items).toHaveLength(42);
    expect(new Set(items.map(item=>item.id)).size).toBe(42);
    expect(new Set(constructionFaq.map(group=>group.id)).size).toBe(6);
    for(const group of constructionFaq) expect(group.items).toHaveLength(7);
  });
  it('has complete, meaningful translations in four locales',()=>{
    for(const locale of locales){
      expect(faqCopy[locale].pageTitle.length).toBeGreaterThan(20);
      expect(faqCopy[locale].pageDescription.length).toBeGreaterThan(40);
      for(const group of constructionFaq){
        expect(group.title[locale].trim().length).toBeGreaterThan(6);
        for(const item of group.items){
          expect(item.question[locale].trim().length).toBeGreaterThan(15);
          expect(item.answer[locale].trim().length).toBeGreaterThan(40);
          expect(item.question[locale]).not.toBe(item.answer[locale]);
        }
      }
    }
  });
  it('keeps risky specialist works explicitly conditional',()=>{
    const drilling=constructionFaq.flatMap(group=>group.items).find(row=>row.id==='direct');
    expect(drilling).toBeDefined();
    for(const locale of locales) expect(drilling!.answer[locale].length).toBeGreaterThan(120);
    expect(drilling!.answer.de).toMatch(/nicht pauschal zugesagt/);
    expect(drilling!.answer.en).toMatch(/not guaranteed/);
    expect(drilling!.answer.uk).toMatch(/не гарантуються/);
    expect(drilling!.answer.ru).toMatch(/не гарантируются/);
    const contract=constructionFaq.flatMap(group=>group.items).find(row=>row.id==='quote');
    expect(contract?.answer.en).toMatch(/not a booking|separate agreement|enquiry starts a discussion/i);
  });
  it('supports reciprocal language routes on the FAQ page',()=>{
    expect(languageLinks('/uk/faq/')).toEqual([
      {lang:'de',url:'/faq/'},
      {lang:'en',url:'/en/faq/'},
      {lang:'uk',url:'/uk/faq/'},
      {lang:'ru',url:'/ru/faq/'},
    ]);
    expect(localeAlternates('/faq/').map(item=>item.lang)).toEqual(['de','en','uk','ru','x-default']);
  });
  it('renders native accordions and client-router-safe search enhancement',()=>{
    const component=site('components/ConstructionFaq.astro');
    expect(component).toContain('<details data-faq-entry={item.id}>');
    expect(component).toContain('type="search"');
    expect(component).toContain('<select data-faq-select>');
    expect(component).toContain('astro:page-load');
    expect(component).toContain('data-faq-empty');
    expect(component).toContain(':focus-visible');
    expect(component).toContain('prefers-reduced-motion');
    expect(site('components/ConstructionHome.astro')).toContain('<ConstructionFaq locale={locale} />');
    expect(site('layouts/Layout.astro')).toContain('localPath("/faq/")');
  });
  it('creates four localized standalone FAQ pages',()=>{
    const pages=['pages/faq.astro','pages/en/faq.astro','pages/uk/faq.astro','pages/ru/faq.astro'];
    for(const page of pages){
      expect(site(page)).toContain('full />');
      expect(site(page)).toContain('faqCopy');
    }
    expect(site('pages/sitemap.xml.ts')).toContain('studioPages');
    for(const prefix of ['', '/en', '/uk', '/ru']) expect(studioPages.some(page=>page.path===prefix+'/faq/')).toBe(true);
  });
});
