import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {officialPartnerLogos,partnerCopy,partnerDirectoryCopy,partnerProfilePath} from '../src/data/partners';

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
    const section=load('../src/components/Partners.astro');
    expect(home).toContain('<Partners locale={locale} />');
    expect(home).not.toContain('<PartnersSection locale={locale} />');
    expect(home.split('<Partners locale={locale} />').length-1).toBe(1);
    expect(section).toContain('officialPartnerLogos.map(');
    expect(section).toContain("aria-labelledby={id+'-title'}");
    expect(section).toContain('data-partner-id={partner.id}');
    expect(section).toContain('loading="lazy"');
    expect(section).not.toMatch(/<a[^>]+href=["']https?:\/\/(?:www\.)?knaba\.de/);
  });
  it('routes every partner to an existing localized directory and a unique profile anchor',()=>{
    expect(new Set(officialPartnerLogos.map(partner=>partner.slug)).size).toBe(5);
    for(const locale of ['de','en','uk','ru'] as const){
      const prefix=locale==='de'?'':locale+'/';
      expect(load('../src/pages/'+prefix+'partner.astro')).toContain('locale="'+locale+'"');
      expect(partnerDirectoryCopy[locale].intro.length).toBeGreaterThan(30);
      for(const partner of officialPartnerLogos){
        const destination=new URL(partnerProfilePath(locale,partner.slug),'https://kneba.vsp.rest');
        expect(destination.origin).toBe('https://kneba.vsp.rest');
        expect(destination.pathname).toBe('/'+prefix+'partner/');
        expect(destination.hash).toBe('#'+partner.slug);
        expect(partner.description[locale].length).toBeGreaterThan(60);
      }
    }
    expect(load('../src/components/Partners.astro')).toContain('href={partnerProfilePath(locale,partner.slug)}');
    const directory=load('../src/components/PartnerDirectory.astro');
    expect(directory).toContain('id={partner.slug}');
    expect(directory).toContain('partner.description[locale]');
    expect(directory).not.toContain('partner.source');
  });
});
