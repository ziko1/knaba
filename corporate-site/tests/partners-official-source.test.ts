import {describe,it,expect} from 'vitest';
import {officialPartnerLogos,partnerCopy} from '../src/data/partners';
import {readFileSync} from 'node:fs';

describe('KnaBa official partner references and first-party image URLs',()=>{
 it('keeps five official logo slots in the source order without falsely claiming ownership',()=>{
  expect(officialPartnerLogos.map(p=>p.name)).toEqual([
   'GOLDBECK','BONAVA','HIT · Hanseatische Immobilien Treuhand','Stromkreis','Gewobag'
  ]);
  expect(Object.keys(partnerCopy).sort()).toEqual(['de','en','ru','uk']);
 });
 it('uses local branded images with intrinsic sizes and exactly one existing partner component',()=>{
  expect(officialPartnerLogos.every(p=>p.src.startsWith('/images/partners/')
   && p.name.length>3 && p.width>0 && p.height>0)).toBe(true);
  const home=readFileSync(new URL('../src/components/ConstructionHome.astro',import.meta.url),'utf8');
  const partner=readFileSync(new URL('../src/components/Partners.astro',import.meta.url),'utf8');
  expect(home.split('<Partners locale={locale} />').length-1).toBe(1);
  expect(home).not.toContain('<PartnersSection');
  expect(partner).toContain('officialPartnerLogos.map');
  expect(partner).not.toMatch(/href=["']https?:\/\/(?:www\.)?knaba\.de/);
 });
});
