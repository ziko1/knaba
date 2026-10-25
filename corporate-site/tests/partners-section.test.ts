import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {officialPartnerLogos,partnerCopy} from '../src/data/partners';

const load=(p:string)=>readFileSync(new URL(p,import.meta.url),'utf8');

describe('KNABA official partner parity',()=>{
  it('keeps all five unique official source logos in their original order',()=>{
    expect(officialPartnerLogos).toHaveLength(5);
    expect(officialPartnerLogos.map(p=>p.id)).toEqual(['official-01','official-02','hit','stromkreis','gewobag']);
    expect(new Set(officialPartnerLogos.map(p=>p.src)).size).toBe(5);
    for (const p of officialPartnerLogos) {
      expect(new URL(p.src).origin).toBe('https://impro.usercontent.one');
      expect(p.src).toContain('/domain/knaba.de/media/knaba.de/onewebmedia/');
      expect(p.width).toBeGreaterThan(0);
      expect(p.height).toBeGreaterThan(0);
    }
  });
  it('does not invent names for the two unnamed official logo assets',()=>{
    expect(officialPartnerLogos.slice(0,2).every(p=>p.name===null)).toBe(true);
    expect(officialPartnerLogos.slice(2).map(p=>p.name)).toEqual([
      'HIT · Hanseatische Immobilien Treuhand','Stromkreis','Gewobag'
    ]);
  });
  it('keeps the same logos on all four locales, without legacy-site outbound links',()=>{
    expect(Object.keys(partnerCopy).sort()).toEqual(['de','en','ru','uk']);
    for(const lang of ['de','en','ru','uk'] as const){
      expect(partnerCopy[lang].title.length).toBeGreaterThan(3);
      expect(partnerCopy[lang].unnamed.length).toBeGreaterThan(10);
    }
    const home=load('../src/components/ConstructionHome.astro');
    const section=load('../src/components/PartnersSection.astro');
    expect(home).toContain('<PartnersSection locale={locale} />');
    expect(section).toContain('officialPartnerLogos.map(');
    expect(section).toContain('aria-labelledby="knaba-partners-heading"');
    expect(section).toContain('loading="lazy"');
    expect(section).not.toMatch(/<a[^>]+href=["']https?:\/\/(?:www\.)?knaba\.de/);
  });
});
