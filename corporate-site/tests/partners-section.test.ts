import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {officialPartnerLogos,partnerCopy} from '../src/data/partners';

const load=(p:string)=>readFileSync(new URL(p,import.meta.url),'utf8');

describe('KNABA official partner parity',()=>{
  it('uses five verified local JPEG/PNG asset bytes in official order',()=>{
    expect(officialPartnerLogos.map(p=>p.id)).toEqual(['official-01','official-02','hit','stromkreis','gewobag']);
    expect(officialPartnerLogos.map(p=>p.name)).toEqual([
      'GOLDBECK','BONAVA','HIT · Hanseatische Immobilien Treuhand','Stromkreis','Gewobag'
    ]);
    expect(new Set(officialPartnerLogos.map(p=>p.src)).size).toBe(5);
    for(const p of officialPartnerLogos){
      expect(p.src.startsWith('/images/partners/')).toBe(true);
      expect(p.src.endsWith('.jpg') || p.src.endsWith('.png')).toBe(true);
      const image=readFileSync(new URL('../public'+p.src,import.meta.url));
      expect(image.byteLength).toBeGreaterThan(1000);
      if(p.src.endsWith('.jpg')) expect([...image.subarray(0,3)]).toEqual([255,216,255]);
      else expect([...image.subarray(0,8)]).toEqual([137,80,78,71,13,10,26,10]);
      expect(p.width).toBeGreaterThan(0);
      expect(p.height).toBeGreaterThan(0);
    }
  });
  it('keeps the same logos on all four locales, without legacy-site outbound links',()=>{
    expect(Object.keys(partnerCopy).sort()).toEqual(['de','en','ru','uk']);
    for(const lang of ['de','en','ru','uk'] as const){
      expect(partnerCopy[lang].title.length).toBeGreaterThan(3);
      expect(partnerCopy[lang].logo.length).toBeGreaterThan(2);
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
